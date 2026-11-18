import {BindingScope, injectable, service} from '@loopback/core';
import {HttpErrors} from '@loopback/rest';
import crypto from 'crypto';
import {config} from '../config';
import {DbService} from './db.service';
import {normalizePhone} from './phone';
import {sha256} from './token.service';

const LOGIN_TTL_S = 600;
const MAX_STARTS_PER_IP_PER_HOUR = 30;
const POLL_TIMEOUT_S = 30;
const RETRY_DELAY_MS = 5000;
// New connections from Docker Desktop sometimes time out once and then succeed: network errors are retried.
const NETWORK_ATTEMPTS = 3;
const NETWORK_RETRY_MS = 500;

export type TelegramLoginState =
  | {status: 'pending' | 'bound'}
  | {status: 'verified'; phone: string; telegramUserId: string};

interface TgUser {
  id: number;
  language_code?: string;
}
interface TgMessage {
  chat: {id: number};
  from?: TgUser;
  text?: string;
  contact?: {phone_number: string; user_id?: number};
}
interface TgUpdate {
  update_id: number;
  message?: TgMessage;
}

/**
 * "Sign in with Telegram": the app opens t.me/<bot>?start=<code>, the user shares their phone number with
 * the bot (a number Telegram has verified), and the app collects the result with its poll secret. The bot
 * runs on long polling, so the API needs no public HTTPS address.
 */
@injectable({scope: BindingScope.SINGLETON})
export class TelegramService {
  private running = false;
  private abort?: AbortController;

  constructor(@service(DbService) private db: DbService) {}

  get enabled(): boolean {
    return !!config.telegramBotToken && !!config.telegramBotUsername;
  }

  // ---- app side

  async startLogin(ip: string | null): Promise<{loginId: string; pollSecret: string; botUrl: string; expiresInS: number}> {
    if (!this.enabled) throw new HttpErrors.ServiceUnavailable('Telegram sign-in is not configured');
    if (ip) {
      const recent = await this.db.one<{n: number}>(
        `SELECT count(*)::int AS n FROM telegram_logins WHERE ip = $1::inet AND created_at > now() - interval '1 hour'`,
        [ip],
      );
      if ((recent?.n ?? 0) >= MAX_STARTS_PER_IP_PER_HOUR)
        throw new HttpErrors.TooManyRequests('Too many requests, try again later');
    }
    await this.db.query(`DELETE FROM telegram_logins WHERE expires_at < now() - interval '1 day'`);
    // Telegram allows A-Z a-z 0-9 _ - and at most 64 characters in a start parameter.
    const code = crypto.randomBytes(24).toString('base64url');
    const pollSecret = crypto.randomBytes(32).toString('base64url');
    const row = await this.db.one<{id: string}>(
      `INSERT INTO telegram_logins (code, poll_secret_hash, ip, expires_at)
       VALUES ($1, $2, $3::inet, now() + ($4 || ' seconds')::interval) RETURNING id`,
      [code, sha256(pollSecret), ip, String(LOGIN_TTL_S)],
    );
    return {
      loginId: row!.id,
      pollSecret,
      botUrl: `https://t.me/${config.telegramBotUsername}?start=${code}`,
      expiresInS: LOGIN_TTL_S,
    };
  }

  /** The login's state for the app that started it; a verified login can be collected only once. */
  async collect(loginId: string, pollSecret: string): Promise<TelegramLoginState> {
    const row = await this.db.one<{
      id: string;
      status: string;
      poll_secret_hash: string;
      phone_e164: string | null;
      telegram_user_id: string | null;
      expired: boolean;
    }>(
      `SELECT id, status, poll_secret_hash, phone_e164, telegram_user_id::text, expires_at < now() AS expired
       FROM telegram_logins WHERE id = $1`,
      [loginId],
    );
    const secretOk =
      row && crypto.timingSafeEqual(Buffer.from(row.poll_secret_hash), Buffer.from(sha256(pollSecret)));
    if (!row || !secretOk) throw new HttpErrors.NotFound('Unknown sign-in request');
    if (row.status === 'consumed') throw new HttpErrors.Gone('This sign-in was already used');
    if (row.status === 'verified') {
      const taken = await this.db.one<{id: string}>(
        `UPDATE telegram_logins SET status = 'consumed' WHERE id = $1 AND status = 'verified' RETURNING id`,
        [row.id],
      );
      if (!taken) throw new HttpErrors.Gone('This sign-in was already used');
      return {status: 'verified', phone: row.phone_e164!, telegramUserId: row.telegram_user_id!};
    }
    if (row.expired) throw new HttpErrors.Gone('This sign-in request has expired, start again');
    return {status: row.status as 'pending' | 'bound'};
  }

  // ---- bot side

  start(): void {
    if (!this.enabled || this.running) return;
    this.running = true;
    void this.pollLoop();
    console.log(`Telegram sign-in enabled with @${config.telegramBotUsername}`);
  }

  stop(): void {
    this.running = false;
    this.abort?.abort();
  }

  private async pollLoop(): Promise<void> {
    // Long polling and a webhook cannot be used together.
    await this.api('deleteWebhook', {drop_pending_updates: false}).catch(() => undefined);
    let offset = 0;
    while (this.running) {
      try {
        const updates = await this.api<TgUpdate[]>(
          'getUpdates',
          {offset, timeout: POLL_TIMEOUT_S, allowed_updates: ['message']},
          (POLL_TIMEOUT_S + 10) * 1000,
        );
        for (const update of updates) {
          offset = update.update_id + 1;
          if (update.message) await this.onMessage(update.message).catch(e => console.error('Telegram message', e));
        }
      } catch (e) {
        if (!this.running) return;
        console.error('Telegram polling failed:', (e as Error).message);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }

  private async onMessage(m: TgMessage): Promise<void> {
    const from = m.from;
    if (!from) return;
    const ar = (from.language_code ?? '').startsWith('ar');
    const t = (arText: string, enText: string) => (ar ? arText : enText);

    if (m.contact) {
      // The share button sends the user's own contact; a forwarded contact of someone else is refused.
      if (m.contact.user_id !== from.id) {
        await this.send(m.chat.id, t('يرجى مشاركة رقمك أنت عبر الزر في الأسفل.', 'Please share your own number with the button below.'), this.shareKeyboard(ar));
        return;
      }
      const raw = m.contact.phone_number.trim();
      const phone = normalizePhone(raw.startsWith('+') ? raw : `+${raw}`);
      const updated = phone
        ? await this.db.one<{id: string}>(
            `UPDATE telegram_logins SET status = 'verified', phone_e164 = $2
             WHERE id = (SELECT id FROM telegram_logins
                         WHERE telegram_user_id = $1 AND status = 'bound' AND expires_at > now()
                         ORDER BY created_at DESC LIMIT 1)
             RETURNING id`,
            [from.id, phone],
          )
        : undefined;
      if (!updated) {
        await this.send(m.chat.id, this.expiredText(ar), {remove_keyboard: true});
        return;
      }
      await this.send(
        m.chat.id,
        t('✅ تم! عُد إلى تطبيق خرائط سوريا، لقد سجّلت الدخول.', '✅ Done! Go back to Syria Organic Maps, you are signed in.'),
        {remove_keyboard: true},
      );
      return;
    }

    const match = /^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{16,64})$/.exec(m.text?.trim() ?? '');
    if (!match) {
      await this.send(
        m.chat.id,
        t(
          'افتح تطبيق خرائط سوريا واضغط «تسجيل الدخول عبر تيليغرام».',
          'Open Syria Organic Maps and tap “Sign in with Telegram”.',
        ),
      );
      return;
    }
    // Binds the request to this Telegram user: only they can complete it with their contact.
    const bound = await this.db.one<{id: string}>(
      `UPDATE telegram_logins SET status = 'bound', telegram_user_id = $2
       WHERE code = $1 AND expires_at > now()
         AND (status = 'pending' OR (status = 'bound' AND telegram_user_id = $2))
       RETURNING id`,
      [match[1], from.id],
    );
    if (!bound) {
      await this.send(m.chat.id, this.expiredText(ar));
      return;
    }
    await this.send(
      m.chat.id,
      t(
        'لتسجيل الدخول إلى خرائط سوريا، اضغط زر «مشاركة رقم هاتفي» في الأسفل. يُستخدم رقمك فقط لتعريف حسابك.',
        'To sign in to Syria Organic Maps, tap “Share my phone number” below. Your number is only used to identify your account.',
      ),
      this.shareKeyboard(ar),
    );
  }

  private expiredText(ar: boolean): string {
    return ar
      ? 'انتهت صلاحية رابط تسجيل الدخول. عُد إلى التطبيق واضغط «تسجيل الدخول عبر تيليغرام» مجدداً.'
      : 'This sign-in link has expired. Go back to the app and tap “Sign in with Telegram” again.';
  }

  private shareKeyboard(ar: boolean): object {
    return {
      keyboard: [[{text: ar ? '📱 مشاركة رقم هاتفي' : '📱 Share my phone number', request_contact: true}]],
      resize_keyboard: true,
      one_time_keyboard: true,
    };
  }

  private async send(chatId: number, text: string, replyMarkup?: object): Promise<void> {
    await this.api('sendMessage', {chat_id: chatId, text, reply_markup: replyMarkup});
  }

  private async api<T = unknown>(method: string, body: object, timeoutMs = 15000): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.call<T>(method, body, timeoutMs);
      } catch (e) {
        // "fetch failed" is a connection problem; an answer from Telegram ({ok: false}) is not retried.
        const network = e instanceof TypeError;
        if (!network || !this.running || attempt >= NETWORK_ATTEMPTS) throw e;
        await new Promise(r => setTimeout(r, NETWORK_RETRY_MS * attempt));
      }
    }
  }

  private async call<T>(method: string, body: object, timeoutMs: number): Promise<T> {
    this.abort = new AbortController();
    const timer = setTimeout(() => this.abort?.abort(), timeoutMs);
    try {
      const res = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/${method}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body),
        signal: this.abort.signal,
      });
      const json = (await res.json()) as {ok: boolean; result: T; description?: string};
      if (!json.ok) throw new Error(`${method}: ${json.description ?? res.status}`);
      return json.result;
    } finally {
      clearTimeout(timer);
    }
  }
}

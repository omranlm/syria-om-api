import {BindingScope, inject, injectable, service} from '@loopback/core';
import {HttpErrors} from '@loopback/rest';
import crypto from 'crypto';
import {config} from '../config';
import {DbService} from './db.service';
import {SMS_PROVIDER, SmsProvider} from './sms.service';
import {sha256} from './token.service';

const MAX_PER_PHONE_PER_HOUR = 5;
const MAX_PER_IP_PER_HOUR = 30;
const MAX_ATTEMPTS = 5;

@injectable({scope: BindingScope.SINGLETON})
export class OtpService {
  constructor(
    @service(DbService) private db: DbService,
    @inject(SMS_PROVIDER) private sms: SmsProvider,
  ) {}

  /** Without a real SMS provider anyone could sign in to any number with the fixed code: refused then. */
  private ensureAvailable(): void {
    if (this.sms.name === 'fake' && !config.allowFakeOtp)
      throw new HttpErrors.ServiceUnavailable('SMS sign-in is not available, use the PIN or Telegram');
  }

  async request(phoneE164: string, ip: string | null): Promise<{expiresInS: number}> {
    this.ensureAvailable();
    const byPhone = await this.db.one<{n: number}>(
      `SELECT count(*)::int AS n FROM otp_requests WHERE phone_e164 = $1 AND created_at > now() - interval '1 hour'`,
      [phoneE164],
    );
    if ((byPhone?.n ?? 0) >= MAX_PER_PHONE_PER_HOUR)
      throw new HttpErrors.TooManyRequests('Too many codes requested for this number, try again later');
    if (ip) {
      const byIp = await this.db.one<{n: number}>(
        `SELECT count(*)::int AS n FROM otp_requests WHERE ip = $1::inet AND created_at > now() - interval '1 hour'`,
        [ip],
      );
      if ((byIp?.n ?? 0) >= MAX_PER_IP_PER_HOUR) throw new HttpErrors.TooManyRequests('Too many requests, try again later');
    }

    // The fake provider never sends anything, so the fixed test code is the only one a tester can know.
    const code =
      this.sms.name === 'fake' ? config.fakeOtpCode : String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    await this.db.query(
      `INSERT INTO otp_requests (phone_e164, code_hash, expires_at, ip)
       VALUES ($1, $2, now() + ($3 || ' seconds')::interval, $4::inet)`,
      [phoneE164, sha256(code), String(config.otpTtlS), ip],
    );
    await this.sms.send(phoneE164, `Your Syria Organic Maps code is ${code}`);
    return {expiresInS: config.otpTtlS};
  }

  async verify(phoneE164: string, code: string): Promise<void> {
    this.ensureAvailable();
    const row = await this.db.one<{id: string; code_hash: string; attempts: number}>(
      `SELECT id, code_hash, attempts FROM otp_requests
       WHERE phone_e164 = $1 AND consumed_at IS NULL AND expires_at > now()
       ORDER BY created_at DESC LIMIT 1`,
      [phoneE164],
    );
    if (!row) throw new HttpErrors.BadRequest('No active code for this number, request a new one');
    if (row.attempts >= MAX_ATTEMPTS) throw new HttpErrors.TooManyRequests('Too many attempts, request a new code');
    const matches = crypto.timingSafeEqual(Buffer.from(row.code_hash), Buffer.from(sha256(code.trim())));
    if (!matches) {
      await this.db.query('UPDATE otp_requests SET attempts = attempts + 1 WHERE id = $1', [row.id]);
      throw new HttpErrors.BadRequest('Wrong code');
    }
    await this.db.query('UPDATE otp_requests SET consumed_at = now() WHERE id = $1', [row.id]);
  }
}

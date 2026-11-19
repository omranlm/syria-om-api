import {BindingScope, injectable, service} from '@loopback/core';
import {HttpErrors} from '@loopback/rest';
import bcrypt from 'bcryptjs';
import {config} from '../config';
import {DbService} from './db.service';
import {Role} from './token.service';

export interface UserRow {
  id: string;
  phone_e164: string | null;
  display_name: string | null;
  role: Role;
  status: 'active' | 'blocked';
  created_at: Date;
  last_seen_at: Date | null;
  phone_verified: boolean;
  has_pin: boolean;
  anonymous: boolean;
}
export interface DeviceInput {
  id: string;
  flavor?: string;
  model?: string;
  osVersion?: string;
  appVersion?: string;
}

const USER_COLS =
  'id, phone_e164, display_name, role, status, created_at, last_seen_at, phone_verified, (pin_hash IS NOT NULL) AS has_pin, anonymous';
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function publicUser(u: UserRow) {
  return {
    id: u.id,
    phone: u.phone_e164,
    displayName: u.display_name,
    role: u.role,
    status: u.status,
    createdAt: u.created_at,
    lastSeenAt: u.last_seen_at,
    phoneVerified: u.phone_verified,
    hasPin: u.has_pin,
    anonymous: u.anonymous,
  };
}

/** Wrong PINs before the account is locked, and how long (longer once it keeps happening). */
const PIN_MAX_FAILED = 5;
const PIN_LOCK_MINUTES = 15;
const PIN_LONG_LOCK_FAILED = 10;
const PIN_LONG_LOCK_MINUTES = 60;
export const PIN_RE = /^\d{6}$/;

@injectable({scope: BindingScope.SINGLETON})
export class UserService {
  constructor(@service(DbService) private db: DbService) {}

  async findById(id: string): Promise<UserRow | undefined> {
    return this.db.one<UserRow>(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [id]);
  }

  async findOrCreateByPhone(phoneE164: string): Promise<UserRow> {
    return this.db.tx(async c => {
      const found = (await c.query<UserRow>(`SELECT ${USER_COLS} FROM users WHERE phone_e164 = $1`, [phoneE164]))
        .rows[0];
      if (found) return found;
      const created = (
        await c.query<UserRow>(`INSERT INTO users (phone_e164) VALUES ($1) RETURNING ${USER_COLS}`, [phoneE164])
      ).rows[0];
      await c.query(`INSERT INTO auth_identities (user_id, provider, subject) VALUES ($1, 'phone', $2)`, [
        created.id,
        phoneE164,
      ]);
      return created;
    });
  }

  /** Remembers another way this user signs in (e.g. their Telegram account); the first link wins. */
  async linkIdentity(userId: string, provider: 'telegram' | 'google', subject: string): Promise<void> {
    await this.db.query(
      `INSERT INTO auth_identities (user_id, provider, subject) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [userId, provider, subject],
    );
  }

  /**
   * Phone + PIN sign-in. A number without an account registers right away (unverified); an account that
   * came from the SMS code or Telegram has no PIN yet and must set one after signing in that way.
   */
  async pinLogin(phoneE164: string, pin: string): Promise<{user: UserRow; created: boolean}> {
    // Refusals are returned, not thrown, inside the transaction: a throw would roll back the failure count.
    const result = await this.db.tx<{user: UserRow; created: boolean} | {refuse: () => Error}>(async c => {
      const row = (
        await c.query<{id: string; role: Role; pin_hash: string | null; pin_failed: number; locked_s: number | null}>(
          `SELECT id, role, pin_hash, pin_failed,
                  CEIL(EXTRACT(EPOCH FROM (pin_locked_until - now())))::int AS locked_s
           FROM users WHERE phone_e164 = $1 FOR UPDATE`,
          [phoneE164],
        )
      ).rows[0];

      if (!row) {
        const created = (
          await c.query<UserRow>(
            `INSERT INTO users (phone_e164, pin_hash, phone_verified) VALUES ($1, $2, false) RETURNING ${USER_COLS}`,
            [phoneE164, await bcrypt.hash(pin, 10)],
          )
        ).rows[0];
        await c.query(`INSERT INTO auth_identities (user_id, provider, subject) VALUES ($1, 'pin', $2)`, [
          created.id,
          phoneE164,
        ]);
        return {user: created, created: true};
      }
      // The dashboard account is reached with its password only.
      if (row.role === 'admin')
        return {refuse: () => new HttpErrors.Forbidden('Use the dashboard to sign in to this account')};
      const lockedS = row.locked_s ?? 0;
      if (lockedS > 0)
        return {
          refuse: () =>
            new HttpErrors.TooManyRequests(`Too many wrong PINs, try again in ${Math.ceil(lockedS / 60)} min`),
        };
      if (!row.pin_hash) {
        return {
          refuse: () => {
            const err = new HttpErrors.Conflict('This number has no PIN yet: sign in with Telegram or an SMS code first');
            (err as {code?: string}).code = 'pin_not_set';
            return err;
          },
        };
      }
      if (!(await bcrypt.compare(pin, row.pin_hash))) {
        const failed = row.pin_failed + 1;
        const lockMinutes =
          failed >= PIN_LONG_LOCK_FAILED ? PIN_LONG_LOCK_MINUTES : failed >= PIN_MAX_FAILED ? PIN_LOCK_MINUTES : 0;
        await c.query(
          `UPDATE users SET pin_failed = $2,
                  pin_locked_until = CASE WHEN $3::int > 0 THEN now() + ($3 || ' minutes')::interval END
           WHERE id = $1`,
          [row.id, failed, lockMinutes],
        );
        if (lockMinutes > 0)
          return {refuse: () => new HttpErrors.TooManyRequests(`Too many wrong PINs, try again in ${lockMinutes} min`)};
        return {refuse: () => new HttpErrors.Unauthorized('Wrong PIN')};
      }
      const user = (
        await c.query<UserRow>(
          `UPDATE users SET pin_failed = 0, pin_locked_until = NULL WHERE id = $1 RETURNING ${USER_COLS}`,
          [row.id],
        )
      ).rows[0];
      return {user, created: false};
    });
    if ('refuse' in result) throw result.refuse();
    return result;
  }

  /**
   * Anonymous recording: the account of an app install, without a phone number. Created on the first call;
   * afterwards only the app holding the secret it registered with gets in.
   */
  async deviceLogin(deviceId: string, secret: string): Promise<{user: UserRow; created: boolean}> {
    if (!UUID_RE.test(deviceId)) throw new HttpErrors.BadRequest('device.id must be a UUID');
    const result = await this.db.tx<{user: UserRow; created: boolean} | null>(async c => {
      const identity = (
        await c.query<{user_id: string; secret_hash: string | null}>(
          `SELECT user_id, secret_hash FROM auth_identities WHERE provider = 'device' AND subject = $1 FOR UPDATE`,
          [deviceId],
        )
      ).rows[0];
      if (identity) {
        if (!identity.secret_hash || !(await bcrypt.compare(secret, identity.secret_hash))) return null;
        const user = (await c.query<UserRow>(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [identity.user_id]))
          .rows[0];
        return {user, created: false};
      }
      const created = (
        await c.query<UserRow>(`INSERT INTO users (anonymous) VALUES (true) RETURNING ${USER_COLS}`)
      ).rows[0];
      await c.query(
        `INSERT INTO auth_identities (user_id, provider, subject, secret_hash) VALUES ($1, 'device', $2, $3)`,
        [created.id, deviceId, await bcrypt.hash(secret, 10)],
      );
      return {user: created, created: true};
    });
    if (!result) throw new HttpErrors.Unauthorized('This device is registered with another secret');
    return result;
  }

  async setPin(userId: string, pin: string): Promise<UserRow | undefined> {
    const hash = await bcrypt.hash(pin, 10);
    return this.db.one<UserRow>(
      `UPDATE users SET pin_hash = $2, pin_failed = 0, pin_locked_until = NULL WHERE id = $1 RETURNING ${USER_COLS}`,
      [userId, hash],
    );
  }

  /**
   * The number was just confirmed by the SMS code or Telegram. If it had registered unverified with a PIN,
   * its owner takes it over: the PIN chosen by whoever registered it is dropped. Returns true then, so
   * the caller signs out the other sessions.
   */
  async markPhoneVerified(userId: string): Promise<boolean> {
    const row = await this.db.one<{id: string}>(
      `UPDATE users SET phone_verified = true, pin_hash = NULL, pin_failed = 0, pin_locked_until = NULL
       WHERE id = $1 AND NOT phone_verified RETURNING id`,
      [userId],
    );
    return !!row;
  }

  async touch(id: string): Promise<void> {
    await this.db.query('UPDATE users SET last_seen_at = now() WHERE id = $1', [id]);
  }

  async updateDisplayName(id: string, displayName: string | null): Promise<UserRow | undefined> {
    return this.db.one<UserRow>(
      `UPDATE users SET display_name = $2, updated_at = now() WHERE id = $1 RETURNING ${USER_COLS}`,
      [id, displayName],
    );
  }

  async upsertDevice(userId: string, d: DeviceInput): Promise<string> {
    if (!UUID_RE.test(d.id)) throw new HttpErrors.BadRequest('device.id must be a UUID');
    await this.db.query(
      `INSERT INTO devices (id, user_id, flavor, model, os_version, app_version)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         flavor = COALESCE(EXCLUDED.flavor, devices.flavor),
         model = COALESCE(EXCLUDED.model, devices.model),
         os_version = COALESCE(EXCLUDED.os_version, devices.os_version),
         app_version = COALESCE(EXCLUDED.app_version, devices.app_version),
         last_seen_at = now()`,
      [d.id, userId, d.flavor ?? null, d.model ?? null, d.osVersion ?? null, d.appVersion ?? null],
    );
    return d.id;
  }

  async logEvent(
    userId: string,
    deviceId: string | null,
    type: string,
    payload: object | null = null,
    sessionId: string | null = null,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO activity_events (user_id, device_id, session_id, type, occurred_at, payload)
       VALUES ($1, $2, $3, $4, now(), $5)`,
      [userId, deviceId, sessionId, type, payload === null ? null : JSON.stringify(payload)],
    );
  }

  async verifyAdminPassword(phoneE164: string, password: string): Promise<UserRow | undefined> {
    const row = await this.db.one<UserRow & {password_hash: string | null}>(
      `SELECT ${USER_COLS}, password_hash FROM users WHERE phone_e164 = $1 AND role = 'admin'`,
      [phoneE164],
    );
    if (!row?.password_hash || !(await bcrypt.compare(password, row.password_hash))) return undefined;
    const {password_hash: _ignored, ...user} = row;
    return user;
  }

  /** Creates the default admin from ADMIN_PHONE/ADMIN_PASSWORD; an existing user keeps its password. */
  async seedAdmin(): Promise<void> {
    const phone = config.adminPhone.trim();
    if (!/^\+\d{8,15}$/.test(phone)) {
      console.warn(`ADMIN_PHONE '${phone}' is not in +<digits> form, admin not seeded`);
      return;
    }
    const hash = await bcrypt.hash(config.adminPassword, 10);
    const row = await this.db.one<{created: boolean}>(
      `INSERT INTO users (phone_e164, display_name, role, password_hash)
       VALUES ($1, 'Administrator', 'admin', $2)
       ON CONFLICT (phone_e164) DO UPDATE SET role = 'admin',
         password_hash = COALESCE(users.password_hash, EXCLUDED.password_hash)
       RETURNING (xmax = 0) AS created`,
      [phone, hash],
    );
    console.log(row?.created ? `Admin ${phone} created` : `Admin ${phone} already exists`);
  }
}

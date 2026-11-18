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
}
export interface DeviceInput {
  id: string;
  flavor?: string;
  model?: string;
  osVersion?: string;
  appVersion?: string;
}

const USER_COLS = 'id, phone_e164, display_name, role, status, created_at, last_seen_at';
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
  };
}

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

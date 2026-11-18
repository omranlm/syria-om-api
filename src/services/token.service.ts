import {BindingScope, injectable, service} from '@loopback/core';
import {HttpErrors} from '@loopback/rest';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import {config} from '../config';
import {DbService} from './db.service';

export type Role = 'user' | 'admin';
export interface AccessClaims {
  sub: string;
  role: Role;
}
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessExpiresInS: number;
}

const ISSUER = 'syria-om-api';
export const sha256 = (s: string): string => crypto.createHash('sha256').update(s).digest('hex');

@injectable({scope: BindingScope.SINGLETON})
export class TokenService {
  constructor(@service(DbService) private db: DbService) {}

  signAccess(claims: AccessClaims): string {
    return jwt.sign({role: claims.role}, config.jwtSecret, {
      subject: claims.sub,
      expiresIn: config.accessTtlS,
      issuer: ISSUER,
    });
  }

  verifyAccess(token: string): AccessClaims {
    try {
      const payload = jwt.verify(token, config.jwtSecret, {issuer: ISSUER}) as jwt.JwtPayload;
      if (!payload.sub) throw new Error('missing subject');
      return {sub: payload.sub, role: payload.role === 'admin' ? 'admin' : 'user'};
    } catch {
      throw new HttpErrors.Unauthorized('Invalid or expired access token');
    }
  }

  async issuePair(userId: string, role: Role, deviceId: string | null): Promise<TokenPair> {
    const refreshToken = crypto.randomBytes(48).toString('base64url');
    await this.db.query(
      `INSERT INTO refresh_tokens (user_id, device_id, token_hash, expires_at)
       VALUES ($1, $2, $3, now() + ($4 || ' days')::interval)`,
      [userId, deviceId, sha256(refreshToken), String(config.refreshTtlDays)],
    );
    return {accessToken: this.signAccess({sub: userId, role}), refreshToken, accessExpiresInS: config.accessTtlS};
  }

  async rotate(refreshToken: string): Promise<TokenPair & {userId: string}> {
    const row = await this.db.one<{id: string; user_id: string; device_id: string | null; role: Role; status: string}>(
      `SELECT t.id, t.user_id, t.device_id, u.role, u.status
       FROM refresh_tokens t JOIN users u ON u.id = t.user_id
       WHERE t.token_hash = $1 AND t.revoked_at IS NULL AND t.expires_at > now()`,
      [sha256(refreshToken)],
    );
    if (!row) throw new HttpErrors.Unauthorized('Invalid refresh token');
    if (row.status !== 'active') throw new HttpErrors.Forbidden('Account is blocked');
    const pair = await this.issuePair(row.user_id, row.role, row.device_id);
    await this.db.query(
      `UPDATE refresh_tokens SET revoked_at = now(),
         replaced_by = (SELECT id FROM refresh_tokens WHERE token_hash = $2)
       WHERE id = $1`,
      [row.id, sha256(pair.refreshToken)],
    );
    return {...pair, userId: row.user_id};
  }

  /** Signs the user out everywhere (refresh tokens; access tokens expire within the hour). */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [
      userId,
    ]);
  }

  /** Revokes the token and returns its owner when it was still active. */
  async revoke(refreshToken: string): Promise<{userId: string; deviceId: string | null} | undefined> {
    const row = await this.db.one<{user_id: string; device_id: string | null}>(
      `UPDATE refresh_tokens SET revoked_at = now()
       WHERE token_hash = $1 AND revoked_at IS NULL RETURNING user_id, device_id`,
      [sha256(refreshToken)],
    );
    return row ? {userId: row.user_id, deviceId: row.device_id} : undefined;
  }
}

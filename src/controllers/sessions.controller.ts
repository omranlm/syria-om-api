import {authenticate} from '@loopback/authentication';
import {inject, service} from '@loopback/core';
import {get, HttpErrors, param} from '@loopback/rest';
import {SecurityBindings, securityId, UserProfile} from '@loopback/security';
import {DbService} from '../services/db.service';
import {mapSession, SESSION_COLS, sessionGeoJson, sessionPoints, SessionRow} from '../services/session-queries';

const clamp = (v: number | undefined, def: number, max: number) => Math.min(Math.max(v ?? def, 1), max);

@authenticate('jwt')
export class SessionsController {
  constructor(
    @inject(SecurityBindings.USER) private profile: UserProfile,
    @service(DbService) private db: DbService,
  ) {}

  @get('/sessions')
  async list(@param.query.integer('limit') limit?: number, @param.query.integer('offset') offset?: number) {
    const rows = await this.db.query<SessionRow>(
      `SELECT ${SESSION_COLS} FROM tracking_sessions s WHERE s.user_id = $1
       ORDER BY s.started_at DESC LIMIT $2 OFFSET $3`,
      [this.profile[securityId], clamp(limit, 50, 500), Math.max(offset ?? 0, 0)],
    );
    return rows.map(mapSession);
  }

  @get('/sessions/{id}')
  async detail(@param.path.string('id') id: string) {
    const row = await this.db.one<SessionRow>(
      `SELECT ${SESSION_COLS} FROM tracking_sessions s WHERE s.id = $1 AND s.user_id = $2`,
      [id, this.profile[securityId]],
    );
    if (!row) throw new HttpErrors.NotFound('Session not found');
    return mapSession(row);
  }

  @get('/sessions/{id}/geojson')
  async geojson(@param.path.string('id') id: string) {
    return sessionGeoJson(this.db, id, this.profile[securityId]);
  }

  @get('/sessions/{id}/points')
  async points(@param.path.string('id') id: string, @param.query.integer('limit') limit?: number) {
    return sessionPoints(this.db, id, clamp(limit, 5000, 20000), this.profile[securityId]);
  }
}

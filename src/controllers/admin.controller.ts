import {authenticate} from '@loopback/authentication';
import {inject, service} from '@loopback/core';
import {get, HttpErrors, param, patch, requestBody} from '@loopback/rest';
import {SecurityBindings, securityId, UserProfile} from '@loopback/security';
import {requireAdmin} from '../auth/jwt.strategy';
import {DbService} from '../services/db.service';
import {mapSession, SESSION_COLS, sessionGeoJson, sessionPoints, SessionRow} from '../services/session-queries';
import {publicUser, UserRow, UserService} from '../services/user.service';
import {json} from './schemas';

const clamp = (v: number | undefined, def: number, max: number) => Math.min(Math.max(v ?? def, 1), max);

/** ORDER BY from a whitelisted column key, so the dashboard can sort without SQL injection. */
const orderBy = (cols: Record<string, string>, sort: string | undefined, order: string | undefined, def: string) =>
  `${cols[sort ?? ''] ?? cols[def]} ${order === 'asc' ? 'ASC' : 'DESC'} NULLS LAST`;

/** One page of a list plus the number of rows matching the filters (from `count(*) OVER ()`). */
function page<R extends {total_count?: number}, T>(rows: R[], map: (r: R) => T) {
  return {items: rows.map(map), total: rows[0]?.total_count ?? 0};
}

const USER_SORT = {
  created: 'u.created_at',
  lastSeen: 'u.last_seen_at',
  sessions: 'st.sessions',
  distance: 'st.distance_m',
  moving: 'st.moving_time_s',
};
const SESSION_SORT = {started: 's.started_at', distance: 's.distance_m', moving: 's.moving_time_s', points: 's.point_count'};

interface UserStatsRow extends UserRow {
  total_count?: number;
  sessions: number;
  distance_m: number;
  moving_time_s: number;
  devices: number;
  last_session_at: Date | null;
}

const mapUserStats = (r: UserStatsRow) => ({
  ...publicUser(r),
  stats: {
    sessions: r.sessions,
    distanceM: r.distance_m,
    movingTimeS: r.moving_time_s,
    devices: r.devices,
    lastSessionAt: r.last_session_at,
  },
});

@authenticate('jwt')
export class AdminController {
  constructor(
    @inject(SecurityBindings.USER) private profile: UserProfile,
    @service(DbService) private db: DbService,
    @service(UserService) private users: UserService,
  ) {
    requireAdmin(profile);
  }

  @get('/admin/stats')
  async stats(@param.query.integer('days') days?: number) {
    const totals = await this.db.one(
      `SELECT (SELECT count(*)::int FROM users WHERE role = 'user') AS users,
              (SELECT count(*)::int FROM users WHERE last_seen_at > now() - interval '7 days') AS active_users_7d,
              (SELECT count(*)::int FROM devices) AS devices,
              (SELECT count(*)::int FROM tracking_sessions) AS sessions,
              (SELECT count(*)::int FROM tracking_sessions WHERE status <> 'stopped') AS open_sessions,
              (SELECT COALESCE(sum(distance_m), 0)::float8 FROM tracking_sessions) AS distance_m,
              (SELECT COALESCE(sum(moving_time_s), 0)::bigint FROM tracking_sessions) AS moving_time_s,
              (SELECT COALESCE(sum(point_count), 0)::bigint FROM tracking_sessions) AS points,
              (SELECT count(*)::int FROM activity_events WHERE type IN ('map_download', 'map_update')) AS map_updates,
              (SELECT max(received_at) FROM sync_batches) AS last_sync_at`,
    );
    const daily = await this.db.query(
      `SELECT day, sum(sessions)::int AS sessions, sum(distance_m)::float8 AS distance_m,
              sum(moving_time_s)::bigint AS moving_time_s, count(DISTINCT user_id)::int AS users
       FROM daily_user_stats WHERE day >= (now() - ($1 || ' days')::interval)::date
       GROUP BY day ORDER BY day`,
      [String(clamp(days, 30, 365))],
    );
    return {totals, daily};
  }

  @get('/admin/users')
  async listUsers(
    @param.query.string('q') q?: string,
    @param.query.integer('limit') limit?: number,
    @param.query.integer('offset') offset?: number,
    @param.query.string('sort') sort?: string,
    @param.query.string('order') order?: string,
  ) {
    const rows = await this.db.query<UserStatsRow>(
      `SELECT count(*) OVER ()::int AS total_count, u.id, u.phone_e164, u.display_name, u.role, u.status, u.created_at, u.last_seen_at, u.phone_verified, (u.pin_hash IS NOT NULL) AS has_pin,
              COALESCE(st.sessions, 0) AS sessions, COALESCE(st.distance_m, 0) AS distance_m,
              COALESCE(st.moving_time_s, 0) AS moving_time_s, COALESCE(d.devices, 0) AS devices, st.last_session_at
       FROM users u
       LEFT JOIN LATERAL (
         SELECT count(*)::int AS sessions, COALESCE(sum(distance_m), 0)::float8 AS distance_m,
                COALESCE(sum(moving_time_s), 0)::int AS moving_time_s, max(started_at) AS last_session_at
         FROM tracking_sessions WHERE user_id = u.id) st ON true
       LEFT JOIN LATERAL (SELECT count(*)::int AS devices FROM devices WHERE user_id = u.id) d ON true
       WHERE $1::text IS NULL OR u.phone_e164 ILIKE '%' || $1 || '%' OR u.display_name ILIKE '%' || $1 || '%'
       ORDER BY ${orderBy(USER_SORT, sort, order, 'created')}, u.id LIMIT $2 OFFSET $3`,
      [q?.trim() || null, clamp(limit, 50, 500), Math.max(offset ?? 0, 0)],
    );
    return page(rows, mapUserStats);
  }

  @get('/admin/users/{id}')
  async user(@param.path.string('id') id: string) {
    const [row] = await this.db.query<UserStatsRow>(
      `SELECT u.id, u.phone_e164, u.display_name, u.role, u.status, u.created_at, u.last_seen_at, u.phone_verified, (u.pin_hash IS NOT NULL) AS has_pin,
              COALESCE(st.sessions, 0) AS sessions, COALESCE(st.distance_m, 0) AS distance_m,
              COALESCE(st.moving_time_s, 0) AS moving_time_s, COALESCE(d.devices, 0) AS devices, st.last_session_at
       FROM users u
       LEFT JOIN LATERAL (
         SELECT count(*)::int AS sessions, COALESCE(sum(distance_m), 0)::float8 AS distance_m,
                COALESCE(sum(moving_time_s), 0)::int AS moving_time_s, max(started_at) AS last_session_at
         FROM tracking_sessions WHERE user_id = u.id) st ON true
       LEFT JOIN LATERAL (SELECT count(*)::int AS devices FROM devices WHERE user_id = u.id) d ON true
       WHERE u.id = $1`,
      [id],
    );
    if (!row) throw new HttpErrors.NotFound('User not found');
    const devices = await this.db.query(
      `SELECT id, flavor, model, os_version AS "osVersion", app_version AS "appVersion",
              created_at AS "createdAt", last_seen_at AS "lastSeenAt", last_sync_at AS "lastSyncAt"
       FROM devices WHERE user_id = $1 ORDER BY last_seen_at DESC`,
      [id],
    );
    return {...mapUserStats(row), devices};
  }

  @patch('/admin/users/{id}')
  async updateUser(
    @param.path.string('id') id: string,
    @requestBody(
      json({
        type: 'object',
        properties: {
          status: {type: 'string', enum: ['active', 'blocked']},
          role: {type: 'string', enum: ['user', 'admin']},
          displayName: {type: 'string', maxLength: 80, nullable: true},
        },
      }),
    )
    body: {status?: 'active' | 'blocked'; role?: 'user' | 'admin'; displayName?: string | null},
  ) {
    if (id === this.profile[securityId] && (body.status === 'blocked' || body.role === 'user'))
      throw new HttpErrors.BadRequest('You cannot block or demote yourself');
    const row = await this.db.one<UserRow>(
      `UPDATE users SET status = COALESCE($2, status), role = COALESCE($3, role),
              display_name = CASE WHEN $4::boolean THEN $5 ELSE display_name END, updated_at = now()
       WHERE id = $1 RETURNING id, phone_e164, display_name, role, status, created_at, last_seen_at`,
      [id, body.status ?? null, body.role ?? null, body.displayName !== undefined, body.displayName ?? null],
    );
    if (!row) throw new HttpErrors.NotFound('User not found');
    if (body.status === 'blocked') await this.db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [id]);
    await this.users.logEvent(this.profile[securityId], null, 'admin_user_update', {target: id, ...body});
    return publicUser(row);
  }

  @get('/admin/sessions')
  async listSessions(
    @param.query.string('userId') userId?: string,
    @param.query.string('status') status?: string,
    @param.query.dateTime('from') from?: Date,
    @param.query.dateTime('to') to?: Date,
    @param.query.integer('limit') limit?: number,
    @param.query.integer('offset') offset?: number,
    @param.query.string('sort') sort?: string,
    @param.query.string('order') order?: string,
  ) {
    const rows = await this.db.query<SessionRow & {total_count: number}>(
      `SELECT count(*) OVER ()::int AS total_count, ${SESSION_COLS}, u.phone_e164, u.display_name
       FROM tracking_sessions s JOIN users u ON u.id = s.user_id
       WHERE ($1::uuid IS NULL OR s.user_id = $1) AND ($2::text IS NULL OR s.status = $2)
         AND ($3::timestamptz IS NULL OR s.started_at >= $3) AND ($4::timestamptz IS NULL OR s.started_at < $4)
       ORDER BY ${orderBy(SESSION_SORT, sort, order, 'started')}, s.id LIMIT $5 OFFSET $6`,
      [userId ?? null, status ?? null, from ?? null, to ?? null, clamp(limit, 50, 500), Math.max(offset ?? 0, 0)],
    );
    return page(rows, mapSession);
  }

  @get('/admin/sessions/{id}')
  async session(@param.path.string('id') id: string) {
    const row = await this.db.one<SessionRow>(
      `SELECT ${SESSION_COLS}, u.phone_e164, u.display_name
       FROM tracking_sessions s JOIN users u ON u.id = s.user_id WHERE s.id = $1`,
      [id],
    );
    if (!row) throw new HttpErrors.NotFound('Session not found');
    const segments = await this.db.query(
      `SELECT id, seq, started_at AS "startedAt", ended_at AS "endedAt", distance_m AS "distanceM"
       FROM tracking_segments WHERE session_id = $1 ORDER BY seq`,
      [id],
    );
    return {...mapSession(row), segments};
  }

  @get('/admin/sessions/{id}/geojson')
  async sessionGeoJson(@param.path.string('id') id: string) {
    return sessionGeoJson(this.db, id);
  }

  @get('/admin/sessions/{id}/points')
  async sessionPoints(@param.path.string('id') id: string, @param.query.integer('limit') limit?: number) {
    return sessionPoints(this.db, id, clamp(limit, 5000, 50000));
  }

  @get('/admin/activity')
  async activity(
    @param.query.string('userId') userId?: string,
    @param.query.string('type') type?: string,
    @param.query.dateTime('from') from?: Date,
    @param.query.dateTime('to') to?: Date,
    @param.query.integer('limit') limit?: number,
    @param.query.integer('offset') offset?: number,
  ) {
    const rows = await this.db.query<{total_count: number}>(
      `SELECT count(*) OVER ()::int AS total_count, e.id, e.user_id AS "userId", u.phone_e164 AS "userPhone", e.device_id AS "deviceId",
              e.session_id AS "sessionId", e.type, e.occurred_at AS "occurredAt", e.payload, e.received_at AS "receivedAt"
       FROM activity_events e JOIN users u ON u.id = e.user_id
       WHERE ($1::uuid IS NULL OR e.user_id = $1) AND ($2::text IS NULL OR e.type = $2)
         AND ($3::timestamptz IS NULL OR e.occurred_at >= $3) AND ($4::timestamptz IS NULL OR e.occurred_at < $4)
       ORDER BY e.occurred_at DESC LIMIT $5 OFFSET $6`,
      [userId ?? null, type ?? null, from ?? null, to ?? null, clamp(limit, 100, 1000), Math.max(offset ?? 0, 0)],
    );
    return page(rows, ({total_count, ...r}) => r);
  }

  /** Event types seen so far with their counts, for the activity filter. */
  @get('/admin/activity/types')
  async activityTypes() {
    return this.db.query(`SELECT type, count(*)::int AS count FROM activity_events GROUP BY type ORDER BY count DESC`);
  }

  /** The latest live location of every user who shared it in the last `minutes`. */
  @get('/admin/live')
  async live(@param.query.integer('minutes') minutes?: number) {
    return this.db.query(
      `SELECT DISTINCT ON (p.user_id) p.user_id AS "userId", u.phone_e164 AS "userPhone",
              u.display_name AS "userDisplayName", p.recorded_at AS "recordedAt",
              ST_Y(p.geom::geometry) AS lat, ST_X(p.geom::geometry) AS lon, p.accuracy_m AS "accuracyM",
              p.speed_mps AS "speedMps", p.bearing_deg AS "bearingDeg", p.battery_pct AS "batteryPct"
       FROM location_points p JOIN users u ON u.id = p.user_id
       WHERE p.provider = 'live' AND p.recorded_at > now() - make_interval(mins => $1)
       ORDER BY p.user_id, p.recorded_at DESC`,
      [clamp(minutes, 15, 1440)],
    );
  }

  @get('/admin/sync-batches')
  async syncBatches(
    @param.query.string('userId') userId?: string,
    @param.query.integer('limit') limit?: number,
    @param.query.integer('offset') offset?: number,
  ) {
    const rows = await this.db.query<{total_count: number}>(
      `SELECT count(*) OVER ()::int AS total_count, b.id, b.user_id AS "userId", u.phone_e164 AS "userPhone", b.device_id AS "deviceId",
              b.received_at AS "receivedAt", b.client_sent_at AS "clientSentAt", b.sessions, b.segments, b.points,
              b.events, b.duration_ms AS "durationMs", b.app_version AS "appVersion"
       FROM sync_batches b JOIN users u ON u.id = b.user_id
       WHERE ($1::uuid IS NULL OR b.user_id = $1) ORDER BY b.received_at DESC LIMIT $2 OFFSET $3`,
      [userId ?? null, clamp(limit, 100, 1000), Math.max(offset ?? 0, 0)],
    );
    return page(rows, ({total_count, ...r}) => r);
  }
}

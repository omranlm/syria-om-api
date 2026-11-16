import {BindingScope, injectable, service} from '@loopback/core';
import {HttpErrors} from '@loopback/rest';
import {DbService} from './db.service';
import {DeviceInput} from './user.service';

export interface SessionIn {
  id: string;
  status: 'active' | 'paused' | 'stopped';
  startedAt: string;
  endedAt?: string | null;
  name?: string | null;
  clientDistanceM?: number | null;
  clientMovingTimeS?: number | null;
}
export interface SegmentIn {
  id: string;
  sessionId: string;
  seq: number;
  startedAt: string;
  endedAt?: string | null;
}
export interface PointIn {
  id: string;
  sessionId: string;
  segmentId?: string | null;
  recordedAt: string;
  lat: number;
  lon: number;
  alt?: number | null;
  accuracyM?: number | null;
  speedMps?: number | null;
  bearingDeg?: number | null;
  provider?: string | null;
  isMock?: boolean;
  batteryPct?: number | null;
}
export interface EventIn {
  id: string;
  type: string;
  occurredAt: string;
  sessionId?: string | null;
  payload?: object | null;
}
export interface SyncBatch {
  device: DeviceInput;
  clientSentAt?: string;
  sessions?: SessionIn[];
  segments?: SegmentIn[];
  points?: PointIn[];
  events?: EventIn[];
}
export interface SyncResult {
  acked: {sessions: string[]; segments: string[]; points: string[]; events: string[]};
  serverTime: string;
}

/**
 * Applies an offline outbox batch. Every row carries a client-generated UUID, so a batch can be
 * re-sent safely: inserts are "do nothing" on conflict and the ack lists every id that exists
 * afterwards, which lets the client mark rows as synced even when they were uploaded earlier.
 */
@injectable({scope: BindingScope.SINGLETON})
export class SyncService {
  constructor(@service(DbService) private db: DbService) {}

  async applyBatch(userId: string, deviceId: string, batch: SyncBatch, ip: string | null): Promise<SyncResult> {
    const startedAt = Date.now();
    const sessions = batch.sessions ?? [];
    const segments = batch.segments ?? [];
    const points = batch.points ?? [];
    const events = batch.events ?? [];

    try {
      return await this.db.tx(async c => {
        for (const s of sessions) {
          await c.query(
            `INSERT INTO tracking_sessions
               (id, user_id, device_id, status, name, started_at, ended_at, client_distance_m, client_moving_time_s)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (id) DO UPDATE SET
               status = EXCLUDED.status, name = EXCLUDED.name, ended_at = EXCLUDED.ended_at,
               client_distance_m = EXCLUDED.client_distance_m, client_moving_time_s = EXCLUDED.client_moving_time_s,
               updated_at = now()
             WHERE tracking_sessions.user_id = EXCLUDED.user_id`,
            [
              s.id,
              userId,
              deviceId,
              s.status,
              s.name ?? null,
              s.startedAt,
              s.endedAt ?? null,
              s.clientDistanceM ?? null,
              s.clientMovingTimeS ?? null,
            ],
          );
        }

        // Every session referenced by the batch must belong to the caller.
        const referenced = new Set<string>([
          ...sessions.map(s => s.id),
          ...segments.map(g => g.sessionId),
          ...points.map(p => p.sessionId),
          ...events.map(e => e.sessionId).filter((id): id is string => !!id),
        ]);
        if (referenced.size) {
          const owned = await c.query<{id: string}>(
            'SELECT id FROM tracking_sessions WHERE id = ANY($1::uuid[]) AND user_id = $2',
            [[...referenced], userId],
          );
          if (owned.rowCount !== referenced.size)
            throw new HttpErrors.Forbidden('Batch references sessions that do not belong to this user');
        }

        for (const g of segments) {
          await c.query(
            `INSERT INTO tracking_segments (id, session_id, user_id, seq, started_at, ended_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (id) DO UPDATE SET ended_at = EXCLUDED.ended_at
             WHERE tracking_segments.user_id = EXCLUDED.user_id`,
            [g.id, g.sessionId, userId, g.seq, g.startedAt, g.endedAt ?? null],
          );
        }

        if (points.length) {
          const recordedAt = points.map(p => p.recordedAt);
          await c.query(
            `SELECT ensure_location_partition(min(ts)) FROM unnest($1::timestamptz[]) AS u(ts)
             GROUP BY date_trunc('month', ts)`,
            [recordedAt],
          );
          await c.query(
            `INSERT INTO location_points
               (id, session_id, segment_id, user_id, recorded_at, geom, accuracy_m, speed_mps, bearing_deg,
                provider, is_mock, battery_pct)
             SELECT t.id, t.session_id, t.segment_id, $4, t.recorded_at,
                    ST_SetSRID(ST_MakePoint(t.lon, t.lat, COALESCE(t.alt, 0)), 4326)::geography,
                    t.accuracy_m, t.speed_mps, t.bearing_deg, t.provider, COALESCE(t.is_mock, false), t.battery_pct
             FROM unnest($1::uuid[], $2::uuid[], $3::uuid[], $5::timestamptz[], $6::float8[], $7::float8[],
                         $8::float8[], $9::real[], $10::real[], $11::real[], $12::text[], $13::boolean[],
                         $14::smallint[])
               AS t(id, session_id, segment_id, recorded_at, lat, lon, alt, accuracy_m, speed_mps, bearing_deg,
                    provider, is_mock, battery_pct)
             ON CONFLICT DO NOTHING`,
            [
              points.map(p => p.id),
              points.map(p => p.sessionId),
              points.map(p => p.segmentId ?? null),
              userId,
              recordedAt,
              points.map(p => p.lat),
              points.map(p => p.lon),
              points.map(p => p.alt ?? null),
              points.map(p => p.accuracyM ?? null),
              points.map(p => p.speedMps ?? null),
              points.map(p => p.bearingDeg ?? null),
              points.map(p => p.provider ?? null),
              points.map(p => p.isMock ?? false),
              points.map(p => p.batteryPct ?? null),
            ],
          );
        }

        if (events.length) {
          await c.query(
            `INSERT INTO activity_events (id, user_id, device_id, session_id, type, occurred_at, payload)
             SELECT t.id, $2, $3, t.session_id, t.type, t.occurred_at, t.payload
             FROM unnest($1::uuid[], $4::uuid[], $5::text[], $6::timestamptz[], $7::jsonb[])
               AS t(id, session_id, type, occurred_at, payload)
             ON CONFLICT DO NOTHING`,
            [
              events.map(e => e.id),
              userId,
              deviceId,
              events.map(e => e.sessionId ?? null),
              events.map(e => e.type),
              events.map(e => e.occurredAt),
              events.map(e => (e.payload == null ? null : JSON.stringify(e.payload))),
            ],
          );
        }

        const ack = async (table: string, ids: string[]): Promise<string[]> =>
          ids.length
            ? (
                await c.query<{id: string}>(`SELECT id FROM ${table} WHERE id = ANY($1::uuid[]) AND user_id = $2`, [
                  ids,
                  userId,
                ])
              ).rows.map(r => r.id)
            : [];
        const acked = {
          sessions: await ack('tracking_sessions', sessions.map(s => s.id)),
          segments: await ack('tracking_segments', segments.map(g => g.id)),
          points: await ack('location_points', points.map(p => p.id)),
          events: await ack('activity_events', events.map(e => e.id)),
        };

        const touched = new Set([
          ...sessions.map(s => s.id),
          ...segments.map(g => g.sessionId),
          ...points.map(p => p.sessionId),
        ]);
        for (const sessionId of touched) await c.query('SELECT rebuild_session_route($1)', [sessionId]);

        await c.query(
          `INSERT INTO sync_batches
             (user_id, device_id, client_sent_at, sessions, segments, points, events, duration_ms, ip, app_version)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::inet, $10)`,
          [
            userId,
            deviceId,
            batch.clientSentAt ?? null,
            sessions.length,
            segments.length,
            points.length,
            events.length,
            Date.now() - startedAt,
            ip,
            batch.device.appVersion ?? null,
          ],
        );
        await c.query('UPDATE devices SET last_sync_at = now(), last_seen_at = now() WHERE id = $1', [deviceId]);

        return {acked, serverTime: new Date().toISOString()};
      });
    } catch (e) {
      // Data errors (22xxx) and constraint violations (23xxx) come from a malformed batch.
      const code = (e as {code?: string}).code ?? '';
      if (code.startsWith('22') || code.startsWith('23'))
        throw new HttpErrors.BadRequest(`Invalid batch: ${(e as Error).message}`);
      throw e;
    }
  }
}

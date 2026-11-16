import {HttpErrors} from '@loopback/rest';
import {DbService} from './db.service';

export const SESSION_COLS = `
  s.id, s.user_id, s.device_id, s.status, s.name, s.started_at, s.ended_at,
  s.client_distance_m, s.client_moving_time_s, s.distance_m, s.moving_time_s, s.point_count,
  s.created_at, s.updated_at, ST_AsGeoJSON(s.bbox)::json AS bbox`;

export interface SessionRow {
  id: string;
  user_id: string;
  device_id: string | null;
  status: string;
  name: string | null;
  started_at: Date;
  ended_at: Date | null;
  client_distance_m: number | null;
  client_moving_time_s: number | null;
  distance_m: number | null;
  moving_time_s: number | null;
  point_count: number;
  created_at: Date;
  updated_at: Date;
  bbox: object | null;
  phone_e164?: string | null;
  display_name?: string | null;
}

export function mapSession(r: SessionRow) {
  return {
    id: r.id,
    userId: r.user_id,
    deviceId: r.device_id,
    status: r.status,
    name: r.name,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    clientDistanceM: r.client_distance_m,
    clientMovingTimeS: r.client_moving_time_s,
    distanceM: r.distance_m,
    movingTimeS: r.moving_time_s,
    pointCount: r.point_count,
    bbox: r.bbox,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    ...(r.phone_e164 !== undefined ? {userPhone: r.phone_e164, userDisplayName: r.display_name} : {}),
  };
}

/** Session as a GeoJSON FeatureCollection: the route plus one feature per segment. */
export async function sessionGeoJson(db: DbService, sessionId: string, userId?: string) {
  const where = userId ? 'WHERE s.id = $1 AND s.user_id = $2' : 'WHERE s.id = $1';
  const params = userId ? [sessionId, userId] : [sessionId];
  const session = await db.one<SessionRow & {route: object | null}>(
    `SELECT ${SESSION_COLS}, ST_AsGeoJSON(s.route)::json AS route FROM tracking_sessions s ${where}`,
    params,
  );
  if (!session) throw new HttpErrors.NotFound('Session not found');
  const segments = await db.query<{id: string; seq: number; started_at: Date; ended_at: Date | null; distance_m: number | null; line: object | null}>(
    `SELECT seg.id, seg.seq, seg.started_at, seg.ended_at, seg.distance_m,
            ST_AsGeoJSON(ST_MakeLine(p.geom::geometry ORDER BY p.recorded_at))::json AS line
     FROM tracking_segments seg LEFT JOIN location_points p ON p.segment_id = seg.id
     WHERE seg.session_id = $1 GROUP BY seg.id ORDER BY seg.seq`,
    [sessionId],
  );
  const {route, ...rest} = session;
  const features: object[] = [];
  if (route) features.push({type: 'Feature', geometry: route, properties: {kind: 'route', ...mapSession(rest)}});
  for (const seg of segments) {
    if (!seg.line) continue;
    features.push({
      type: 'Feature',
      geometry: seg.line,
      properties: {kind: 'segment', id: seg.id, seq: seg.seq, startedAt: seg.started_at, endedAt: seg.ended_at, distanceM: seg.distance_m},
    });
  }
  return {type: 'FeatureCollection', features};
}

export async function sessionPoints(db: DbService, sessionId: string, limit: number, userId?: string) {
  const where = userId ? 'WHERE p.session_id = $1 AND p.user_id = $3' : 'WHERE p.session_id = $1';
  const params = userId ? [sessionId, limit, userId] : [sessionId, limit];
  const rows = await db.query<{
    id: string; segment_id: string | null; recorded_at: Date; lat: number; lon: number; alt: number;
    accuracy_m: number | null; speed_mps: number | null; bearing_deg: number | null; provider: string | null;
    is_mock: boolean; battery_pct: number | null;
  }>(
    `SELECT p.id, p.segment_id, p.recorded_at, ST_Y(p.geom::geometry) AS lat, ST_X(p.geom::geometry) AS lon,
            ST_Z(p.geom::geometry) AS alt, p.accuracy_m, p.speed_mps, p.bearing_deg, p.provider, p.is_mock, p.battery_pct
     FROM location_points p ${where} ORDER BY p.recorded_at LIMIT $2`,
    params,
  );
  return rows.map(r => ({
    id: r.id,
    segmentId: r.segment_id,
    recordedAt: r.recorded_at,
    lat: r.lat,
    lon: r.lon,
    alt: r.alt,
    accuracyM: r.accuracy_m,
    speedMps: r.speed_mps,
    bearingDeg: r.bearing_deg,
    provider: r.provider,
    isMock: r.is_mock,
    batteryPct: r.battery_pct,
  }));
}

import {authenticate} from '@loopback/authentication';
import {inject, service} from '@loopback/core';
import {post, requestBody, SchemaObject} from '@loopback/rest';
import {SecurityBindings, securityId, UserProfile} from '@loopback/security';
import {DbService} from '../services/db.service';
import {json} from './schemas';

interface LivePointIn {
  id: string;
  recordedAt: string;
  lat: number;
  lon: number;
  alt?: number | null;
  accuracyM?: number | null;
  speedMps?: number | null;
  bearingDeg?: number | null;
  isMock?: boolean;
  batteryPct?: number | null;
}

const nullableNumber: SchemaObject = {type: 'number', nullable: true};

/**
 * Live location from the app, sent only while online (no offline queue). Stored in location_points with
 * provider 'live' and no session or segment, apart from recordings.
 */
@authenticate('jwt')
export class LiveController {
  constructor(
    @inject(SecurityBindings.USER) private profile: UserProfile,
    @service(DbService) private db: DbService,
  ) {}

  @post('/live/points')
  async addPoints(
    @requestBody(
      json({
        type: 'object',
        required: ['points'],
        properties: {
          points: {
            type: 'array',
            minItems: 1,
            maxItems: 20,
            items: {
              type: 'object',
              required: ['id', 'recordedAt', 'lat', 'lon'],
              properties: {
                id: {type: 'string', format: 'uuid'},
                recordedAt: {type: 'string', format: 'date-time'},
                lat: {type: 'number', minimum: -90, maximum: 90},
                lon: {type: 'number', minimum: -180, maximum: 180},
                alt: nullableNumber,
                accuracyM: nullableNumber,
                speedMps: nullableNumber,
                bearingDeg: nullableNumber,
                isMock: {type: 'boolean'},
                batteryPct: {type: 'integer', minimum: 0, maximum: 100, nullable: true},
              },
            },
          },
        },
      }),
    )
    body: {points: LivePointIn[]},
  ): Promise<{accepted: number}> {
    const userId = this.profile[securityId];
    const p = body.points;
    await this.db.tx(async c => {
      await c.query(
        `SELECT ensure_location_partition(min(ts)) FROM unnest($1::timestamptz[]) AS u(ts)
         GROUP BY date_trunc('month', ts)`,
        [p.map(x => x.recordedAt)],
      );
      await c.query(
        `INSERT INTO location_points
           (id, session_id, segment_id, user_id, recorded_at, geom, accuracy_m, speed_mps, bearing_deg,
            provider, is_mock, battery_pct)
         SELECT t.id, NULL, NULL, $2, t.recorded_at,
                ST_SetSRID(ST_MakePoint(t.lon, t.lat, COALESCE(t.alt, 0)), 4326)::geography,
                t.accuracy_m, t.speed_mps, t.bearing_deg, 'live', COALESCE(t.is_mock, false), t.battery_pct
         FROM unnest($1::uuid[], $3::timestamptz[], $4::float8[], $5::float8[], $6::float8[], $7::real[],
                     $8::real[], $9::real[], $10::boolean[], $11::smallint[])
           AS t(id, recorded_at, lat, lon, alt, accuracy_m, speed_mps, bearing_deg, is_mock, battery_pct)
         ON CONFLICT DO NOTHING`,
        [
          p.map(x => x.id),
          userId,
          p.map(x => x.recordedAt),
          p.map(x => x.lat),
          p.map(x => x.lon),
          p.map(x => x.alt ?? null),
          p.map(x => x.accuracyM ?? null),
          p.map(x => x.speedMps ?? null),
          p.map(x => x.bearingDeg ?? null),
          p.map(x => x.isMock ?? false),
          p.map(x => x.batteryPct ?? null),
        ],
      );
    });
    return {accepted: p.length};
  }
}

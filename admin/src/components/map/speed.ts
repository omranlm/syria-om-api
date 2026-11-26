import type {TrackPoint} from '../../api/types';

/** Speed bands in km/h with traffic colours: red when crawling, green when the road is free. */
export const SPEED_BANDS = [
  {max: 10, color: '#C1272D', label: '0–10'},
  {max: 30, color: '#E07A2E', label: '10–30'},
  {max: 60, color: '#D4A72C', label: '30–60'},
  {max: Infinity, color: '#1E9E5A', label: '60+'},
] as const;

export const bandOf = (kmh: number) => SPEED_BANDS.findIndex(b => kmh < b.max);

const toRad = (d: number) => (d * Math.PI) / 180;

function haversineM(a: TrackPoint, b: TrackPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** km/h at each point: the phone's own speed, or distance / time from the previous point when it has none. */
export function speedsKmh(points: TrackPoint[]): number[] {
  return points.map((p, i) => {
    if (p.speedMps !== null) return p.speedMps * 3.6;
    if (i === 0) return 0;
    const prev = points[i - 1];
    const dt = (new Date(p.recordedAt).getTime() - new Date(prev.recordedAt).getTime()) / 1000;
    return dt > 0 ? (haversineM(prev, p) / dt) * 3.6 : 0;
  });
}

/** A pause, or a gap long enough that the line between the two points is not a real path. */
export const isBreak = (a: TrackPoint, b: TrackPoint) =>
  a.segmentId !== b.segmentId || new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime() > 60_000;

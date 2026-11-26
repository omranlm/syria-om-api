// Time zone helpers built on Intl only (no date library).

export const browserTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Every IANA zone this browser knows, plus UTC (not listed by every engine). */
export function allTimeZones(): string[] {
  const zones = Intl.supportedValuesOf('timeZone');
  return zones.includes('UTC') ? zones : ['UTC', ...zones];
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', {timeZone: tz});
    return true;
  } catch {
    return false;
  }
}

/** Minutes the zone is ahead of UTC at that instant (DST included). */
export function offsetMinutes(tz: string, at: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value);
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((wall - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '−' : '+';
  const abs = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

/** The instant a calendar day (yyyy-mm-dd) starts in the zone, as ISO; used for the from/to day filters. */
export function zonedDayStart(day: string, tz: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d);
  // Two passes, so a DST change on that day uses the offset in force at midnight.
  let t = wall - offsetMinutes(tz, new Date(wall)) * 60_000;
  t = wall - offsetMinutes(tz, new Date(t)) * 60_000;
  return new Date(t).toISOString();
}

/** Today's date (yyyy-mm-dd) in the zone. */
export const todayIn = (tz: string): string =>
  new Intl.DateTimeFormat('en-CA', {timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

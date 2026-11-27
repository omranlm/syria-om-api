export interface Page<T> {
  items: T[];
  total: number;
}

export interface Totals {
  users: number;
  active_users_7d: number;
  devices: number;
  sessions: number;
  open_sessions: number;
  distance_m: number;
  moving_time_s: string | number;
  points: string | number;
  map_updates: number;
  last_sync_at: string | null;
}

export interface DailyStat {
  day: string;
  sessions: number;
  distance_m: number;
  moving_time_s: string | number;
  users: number;
}

export interface ShareLinkStats {
  views: number;
  downloads: number;
  app_opens: number;
  installs: number;
}

export interface Stats {
  totals: Totals;
  daily: DailyStat[];
  shareLinks: ShareLinkStats;
}

export type UserStatus = 'active' | 'blocked';
export type Role = 'user' | 'admin';

export interface User {
  id: string;
  phone: string | null;
  displayName: string | null;
  role: Role;
  status: UserStatus;
  createdAt: string;
  lastSeenAt: string | null;
  phoneVerified: boolean;
  hasPin: boolean;
  anonymous?: boolean;
  stats: {sessions: number; distanceM: number; movingTimeS: number; devices: number; lastSessionAt: string | null};
}

export interface Device {
  id: string;
  flavor: string | null;
  model: string | null;
  osVersion: string | null;
  appVersion: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  lastSyncAt: string | null;
}

export interface UserDetail extends User {
  devices: Device[];
}

/** The signed-in admin (GET /admin/me). */
export type Profile = Omit<User, 'stats'>;

/** POST /admin/users/{id}/password: the generated PIN or password, returned only when generated. */
export interface PasswordResult {
  kind: 'pin' | 'password';
  generated: string | null;
}

export type SessionStatus = 'active' | 'paused' | 'stopped';

export interface Session {
  id: string;
  userId: string;
  deviceId: string | null;
  status: SessionStatus;
  /** 'user' (Stop button) or 'not_moving' (auto stopped by the app); null for older apps and open trips. */
  stopReason: string | null;
  name: string | null;
  startedAt: string;
  endedAt: string | null;
  clientDistanceM: number | null;
  clientMovingTimeS: number | null;
  distanceM: number | null;
  movingTimeS: number | null;
  pointCount: number;
  userPhone?: string | null;
  userDisplayName?: string | null;
}

export interface Segment {
  id: string;
  seq: number;
  startedAt: string;
  endedAt: string | null;
  distanceM: number | null;
}

export type BatteryMode = 'unrestricted' | 'optimized' | 'restricted';

/** The phone's battery settings when the trip started and ended (see recording_battery on the server). */
export interface SessionBattery {
  atStart: BatteryMode | null;
  atStop: BatteryMode | null;
  powerSaverAtStart: boolean | null;
  powerSaverAtStop: boolean | null;
  standbyBucketAtStop: number | null;
  locationPowerSaveAtStop: string | null;
  /** Android stopped the app and the recording was restarted: a likely gap in the route. */
  restarts: number;
}

export interface SessionDetail extends Session {
  segments: Segment[];
  battery: SessionBattery;
}

/** One recorded location of a trip. */
export interface TrackPoint {
  id: string;
  segmentId: string | null;
  recordedAt: string;
  lat: number;
  lon: number;
  accuracyM: number | null;
  speedMps: number | null;
  bearingDeg: number | null;
}

export interface ActivityEvent {
  id: string;
  userId: string;
  userPhone: string | null;
  deviceId: string | null;
  sessionId: string | null;
  type: string;
  occurredAt: string;
  receivedAt: string;
  payload: unknown;
}

export interface ActivityType {
  type: string;
  count: number;
}

export interface SyncBatch {
  id: string;
  userId: string;
  userPhone: string | null;
  deviceId: string | null;
  receivedAt: string;
  clientSentAt: string | null;
  sessions: number;
  segments: number;
  points: number;
  events: number;
  durationMs: number | null;
  appVersion: string | null;
}

export interface LivePosition {
  userId: string;
  userPhone: string | null;
  userDisplayName: string | null;
  recordedAt: string;
  lat: number;
  lon: number;
  accuracyM: number | null;
  speedMps: number | null;
  bearingDeg: number | null;
  batteryPct: number | null;
}

export type Order = 'asc' | 'desc';

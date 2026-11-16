-- Syria Organic Maps tracking API: initial schema.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164    text UNIQUE,
  display_name  text,
  role          text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked')),
  password_hash text,                       -- admins only (dashboard login)
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz
);

-- One user can have several login identities (phone now, Google later).
CREATE TABLE auth_identities (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider   text NOT NULL CHECK (provider IN ('phone', 'google')),
  subject    text NOT NULL,                 -- E.164 phone or Google "sub"
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, subject)
);

CREATE TABLE otp_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164  text NOT NULL,
  code_hash   text NOT NULL,
  expires_at  timestamptz NOT NULL,
  attempts    int NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  ip          inet,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_requests_phone_idx ON otp_requests (phone_e164, created_at DESC);
CREATE INDEX otp_requests_ip_idx ON otp_requests (ip, created_at DESC);

-- Client-generated device id (one row per app install).
CREATE TABLE devices (
  id           uuid PRIMARY KEY,
  user_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  flavor       text,                        -- google | huawei | ...
  model        text,
  os_version   text,
  app_version  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_sync_at timestamptz
);
CREATE INDEX devices_user_idx ON devices (user_id);

CREATE TABLE refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id   uuid REFERENCES devices(id) ON DELETE SET NULL,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  replaced_by uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);

CREATE TABLE tracking_sessions (
  id                   uuid PRIMARY KEY,            -- client-generated
  user_id              uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id            uuid REFERENCES devices(id) ON DELETE SET NULL,
  status               text NOT NULL CHECK (status IN ('active', 'paused', 'stopped')),
  name                 text,
  started_at           timestamptz NOT NULL,
  ended_at             timestamptz,
  client_distance_m    double precision,            -- what the app showed the user
  client_moving_time_s int,
  distance_m           double precision,            -- recomputed on the server (ST_Length)
  moving_time_s        int,
  point_count          int NOT NULL DEFAULT 0,
  route                geometry(MultiLineStringZ, 4326),
  bbox                 geometry(Geometry, 4326),           -- ST_Envelope: polygon, or a line/point for degenerate routes
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tracking_sessions_user_idx ON tracking_sessions (user_id, started_at DESC);
CREATE INDEX tracking_sessions_route_gix ON tracking_sessions USING GIST (route);

-- One segment per active stretch; pause/resume starts a new one.
CREATE TABLE tracking_segments (
  id         uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES tracking_sessions(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seq        int NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at   timestamptz,
  distance_m double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, seq)
);

CREATE TABLE location_points (
  id          uuid NOT NULL,
  session_id  uuid NOT NULL REFERENCES tracking_sessions(id) ON DELETE CASCADE,
  segment_id  uuid REFERENCES tracking_segments(id) ON DELETE SET NULL,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recorded_at timestamptz NOT NULL,
  geom        geography(PointZ, 4326) NOT NULL,
  accuracy_m  real,
  speed_mps   real,
  bearing_deg real,
  provider    text,
  is_mock     boolean NOT NULL DEFAULT false,
  battery_pct smallint,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, recorded_at)
) PARTITION BY RANGE (recorded_at);
CREATE INDEX location_points_geom_gix ON location_points USING GIST (geom);
CREATE INDEX location_points_session_idx ON location_points (session_id, recorded_at);
CREATE INDEX location_points_user_idx ON location_points (user_id, recorded_at);

CREATE TABLE activity_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id   uuid REFERENCES devices(id) ON DELETE SET NULL,
  session_id  uuid,
  type        text NOT NULL,                -- login, logout, tracking_start, tracking_pause, ..., map_download, map_update, sync
  occurred_at timestamptz NOT NULL,
  payload     jsonb,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_events_user_idx ON activity_events (user_id, occurred_at DESC);
CREATE INDEX activity_events_type_idx ON activity_events (type, occurred_at DESC);

CREATE TABLE sync_batches (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id      uuid REFERENCES devices(id) ON DELETE SET NULL,
  received_at    timestamptz NOT NULL DEFAULT now(),
  client_sent_at timestamptz,
  sessions       int NOT NULL DEFAULT 0,
  segments       int NOT NULL DEFAULT 0,
  points         int NOT NULL DEFAULT 0,
  events         int NOT NULL DEFAULT 0,
  duration_ms    int,
  ip             inet,
  app_version    text
);
CREATE INDEX sync_batches_user_idx ON sync_batches (user_id, received_at DESC);

-- Creates the monthly partition that holds ts, if missing.
CREATE OR REPLACE FUNCTION ensure_location_partition(ts timestamptz) RETURNS void AS $$
DECLARE
  d_from date := date_trunc('month', ts)::date;
  d_to   date := (date_trunc('month', ts) + interval '1 month')::date;
BEGIN
  EXECUTE format('CREATE TABLE IF NOT EXISTS location_points_%s PARTITION OF location_points FOR VALUES FROM (%L) TO (%L)',
                 to_char(d_from, 'YYYY_MM'), d_from, d_to);
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ensure_location_partitions(months_ahead int DEFAULT 3) RETURNS void AS $$
DECLARE i int;
BEGIN
  FOR i IN -1..months_ahead LOOP
    PERFORM ensure_location_partition(now() + (i || ' months')::interval);
  END LOOP;
END $$ LANGUAGE plpgsql;

-- Rebuilds route geometry and server-side distance for one session from its points.
CREATE OR REPLACE FUNCTION rebuild_session_route(sid uuid) RETURNS void AS $$
BEGIN
  UPDATE tracking_segments seg SET distance_m = l.dist
  FROM (
    SELECT seg2.id, ST_Length(ST_MakeLine(p.geom::geometry ORDER BY p.recorded_at)::geography) AS dist
    FROM tracking_segments seg2 JOIN location_points p ON p.segment_id = seg2.id
    WHERE seg2.session_id = sid GROUP BY seg2.id HAVING count(*) >= 2
  ) l WHERE seg.id = l.id;

  UPDATE tracking_sessions s SET
    route = r.route,
    distance_m = r.dist,
    point_count = r.cnt,
    bbox = ST_Envelope(r.route),
    moving_time_s = COALESCE(r.moving, s.moving_time_s),
    updated_at = now()
  FROM (
    SELECT ST_Multi(ST_Collect(line ORDER BY seq))::geometry(MultiLineStringZ, 4326) AS route,
           SUM(ST_Length(line::geography)) AS dist,
           SUM(cnt)::int AS cnt,
           SUM(secs)::int AS moving
    FROM (
      SELECT seg.seq, ST_MakeLine(p.geom::geometry ORDER BY p.recorded_at) AS line, count(*) AS cnt,
             EXTRACT(EPOCH FROM (max(p.recorded_at) - min(p.recorded_at))) AS secs
      FROM location_points p JOIN tracking_segments seg ON seg.id = p.segment_id
      WHERE p.session_id = sid GROUP BY seg.id, seg.seq HAVING count(*) >= 2
    ) lines
  ) r WHERE s.id = sid;
END $$ LANGUAGE plpgsql;

-- Nightly retention: drops point partitions and rows older than the retention period.
CREATE OR REPLACE FUNCTION purge_old_data(retention_years int) RETURNS TABLE (what text, n bigint) AS $$
DECLARE
  cutoff timestamptz := now() - (retention_years || ' years')::interval;
  part record;
  upper_bound timestamptz;
BEGIN
  FOR part IN
    SELECT c.relname, pg_get_expr(c.relpartbound, c.oid) AS bound
    FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
    WHERE i.inhparent = 'location_points'::regclass
  LOOP
    -- bound looks like: FOR VALUES FROM ('2021-01-01 00:00:00+00') TO ('2021-02-01 00:00:00+00')
    upper_bound := (regexp_match(part.bound, 'TO \(''([^'']+)''\)'))[1]::timestamptz;
    IF upper_bound < cutoff THEN
      EXECUTE format('DROP TABLE %I', part.relname);
      what := 'partition ' || part.relname; n := 1; RETURN NEXT;
    END IF;
  END LOOP;
  DELETE FROM tracking_sessions WHERE started_at < cutoff;
  GET DIAGNOSTICS n = ROW_COUNT; what := 'sessions'; RETURN NEXT;
  DELETE FROM activity_events WHERE occurred_at < cutoff;
  GET DIAGNOSTICS n = ROW_COUNT; what := 'events'; RETURN NEXT;
  DELETE FROM sync_batches WHERE received_at < cutoff;
  GET DIAGNOSTICS n = ROW_COUNT; what := 'sync_batches'; RETURN NEXT;
  DELETE FROM otp_requests WHERE created_at < now() - interval '1 day';
  GET DIAGNOSTICS n = ROW_COUNT; what := 'otp_requests'; RETURN NEXT;
  DELETE FROM refresh_tokens WHERE expires_at < now() - interval '30 days';
  GET DIAGNOSTICS n = ROW_COUNT; what := 'refresh_tokens'; RETURN NEXT;
END $$ LANGUAGE plpgsql;

CREATE VIEW daily_user_stats AS
SELECT user_id,
       (started_at AT TIME ZONE 'UTC')::date AS day,
       count(*)                        AS sessions,
       COALESCE(sum(distance_m), 0)    AS distance_m,
       COALESCE(sum(moving_time_s), 0) AS moving_time_s,
       COALESCE(sum(point_count), 0)   AS points
FROM tracking_sessions
GROUP BY user_id, (started_at AT TIME ZONE 'UTC')::date;

SELECT ensure_location_partitions(3);

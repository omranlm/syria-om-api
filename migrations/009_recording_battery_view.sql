-- The app's battery setting per recording (BackgroundMode in the app): 'unrestricted' keeps recording with the
-- screen off, 'optimized' (Android's default) may stop it, 'restricted' stops it in the background.
-- Reported with tracking_start, tracking_restored (Android killed the app and restarted the recording) and
-- battery_mode_changed. Answers e.g. "which testers are not on Unrestricted, and do their routes have gaps".
CREATE OR REPLACE VIEW recording_battery AS
WITH ev AS (
  SELECT e.session_id, e.type, e.occurred_at, e.payload
  FROM activity_events e
  WHERE e.session_id IS NOT NULL
    AND e.type IN ('tracking_start', 'tracking_restored', 'battery_mode_changed', 'tracking_stop')
    AND e.payload ? 'batteryMode'
)
SELECT
  s.id                                                        AS session_id,
  s.user_id,
  s.device_id,
  s.started_at,
  s.ended_at,
  s.status,
  s.point_count,
  s.distance_m,
  st.payload ->> 'batteryMode'                                AS mode_at_start,
  last.payload ->> 'batteryMode'                              AS mode_last,
  (SELECT count(*) FROM ev WHERE ev.session_id = s.id AND ev.type = 'battery_mode_changed')::int AS mode_changes,
  -- Each one is a restart after Android stopped the app: a likely gap in the route.
  (SELECT count(*) FROM ev WHERE ev.session_id = s.id AND ev.type = 'tracking_restored')::int    AS restarts,
  (st.payload ->> 'powerSaver')::boolean                      AS power_saver_at_start,
  st.payload ->> 'manufacturer'                               AS manufacturer,
  st.payload ->> 'model'                                      AS model,
  (st.payload ->> 'androidSdk')::int                          AS android_sdk
FROM tracking_sessions s
LEFT JOIN LATERAL (
  SELECT ev.payload FROM ev WHERE ev.session_id = s.id AND ev.type = 'tracking_start' LIMIT 1
) st ON true
LEFT JOIN LATERAL (
  SELECT ev.payload FROM ev WHERE ev.session_id = s.id ORDER BY ev.occurred_at DESC LIMIT 1
) last ON true;

CREATE INDEX IF NOT EXISTS activity_events_session_idx ON activity_events (session_id) WHERE session_id IS NOT NULL;

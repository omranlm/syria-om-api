-- The app now reports the full battery settings with every tracking_stop, and who ended the trip: 'user' (the
-- Stop button) or 'not_moving' (the app stopped it after 10 minutes standing still). Older apps sent only
-- batteryMode with tracking_stop, so the other columns are null for their trips.
-- standby_bucket_at_stop: how often Android lets the app run: 5 (exempted, as with an unrestricted battery),
-- 10 (active) .. 45 (restricted).
-- location_power_save_at_stop: what the power saver does to location, e.g. 'gps_off_screen_off'.
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
  (st.payload ->> 'androidSdk')::int                          AS android_sdk,
  sp.payload ->> 'batteryMode'                                AS mode_at_stop,
  (sp.payload ->> 'powerSaver')::boolean                      AS power_saver_at_stop,
  (sp.payload ->> 'standbyBucket')::int                       AS standby_bucket_at_stop,
  sp.payload ->> 'locationPowerSaveMode'                      AS location_power_save_at_stop,
  sp.payload ->> 'reason'                                     AS stop_reason
FROM tracking_sessions s
LEFT JOIN LATERAL (
  SELECT ev.payload FROM ev WHERE ev.session_id = s.id AND ev.type = 'tracking_start' LIMIT 1
) st ON true
LEFT JOIN LATERAL (
  SELECT ev.payload FROM ev WHERE ev.session_id = s.id ORDER BY ev.occurred_at DESC LIMIT 1
) last ON true
LEFT JOIN LATERAL (
  SELECT ev.payload FROM ev WHERE ev.session_id = s.id AND ev.type = 'tracking_stop' ORDER BY ev.occurred_at DESC LIMIT 1
) sp ON true;

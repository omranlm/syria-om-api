-- Map downloads reported by the app (MapUpdateLogger): map_download, map_update and map_download_failed
-- activity events, with how long they took and how many bytes came down. Answers e.g. "how long does the
-- Syria map take to download, and over which server".
CREATE OR REPLACE VIEW map_downloads AS
SELECT
  e.id,
  e.user_id,
  e.device_id,
  e.type,                                                   -- map_download | map_update | map_download_failed
  e.occurred_at,
  e.received_at,
  e.payload ->> 'countryId'                                 AS country_id,
  (e.payload ->> 'bytes')::bigint                           AS bytes,
  (e.payload ->> 'totalBytes')::bigint                      AS total_bytes,
  (e.payload ->> 'durationMs')::bigint                      AS duration_ms,
  -- Average speed over the whole download, pauses included.
  CASE WHEN (e.payload ->> 'durationMs')::bigint > 0 THEN
    round((e.payload ->> 'bytes')::numeric * 8 / ((e.payload ->> 'durationMs')::numeric / 1000) / 1e6, 2)
  END                                                       AS mbit_per_s,
  e.payload ->> 'server'                                    AS server,
  (e.payload ->> 'firstLaunch')::boolean                    AS first_launch,
  (e.payload ->> 'errorCode')::int                          AS error_code,
  e.payload ->> 'appVersion'                                AS app_version
FROM activity_events e
WHERE e.type IN ('map_download', 'map_update', 'map_download_failed');

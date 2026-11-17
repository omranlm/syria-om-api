-- Searches made in the app arrive as activity_events of type 'search' (see SearchLogger in the app).
-- This view unpacks their payload for analysts and the OSM Syria community.
CREATE OR REPLACE VIEW search_logs AS
SELECT
  e.id,
  e.user_id,
  e.device_id,
  e.occurred_at,
  e.received_at,
  e.payload ->> 'query'                                    AS query,
  e.payload ->> 'locale'                                   AS locale,
  (e.payload ->> 'isCategory')::boolean                    AS is_category,
  (e.payload ->> 'resultCount')::int                       AS result_count,
  e.payload ->> 'action'                                   AS action,      -- select | show_all | abandon
  e.payload -> 'selected' ->> 'name'                       AS selected_name,
  e.payload -> 'selected' ->> 'type'                       AS selected_type,
  (e.payload -> 'selected' ->> 'index')::int               AS selected_index,
  CASE WHEN jsonb_typeof(e.payload -> 'selected') = 'object' THEN
    ST_SetSRID(ST_MakePoint((e.payload -> 'selected' ->> 'lon')::float8,
                            (e.payload -> 'selected' ->> 'lat')::float8), 4326)::geography
  END                                                      AS selected_geom,
  CASE WHEN jsonb_typeof(e.payload -> 'lat') = 'number' THEN
    ST_SetSRID(ST_MakePoint((e.payload ->> 'lon')::float8, (e.payload ->> 'lat')::float8), 4326)::geography
  END                                                      AS user_geom
FROM activity_events e
WHERE e.type = 'search';


-- rebuild_session_route() set point_count from segments with at least 2 points only. For a session
-- that has just started (no point yet, or a single point) that sum is NULL, which violates the NOT NULL
-- column and made the app's whole sync batch fail with HTTP 400. Count every point of the session instead.
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
    point_count = (SELECT count(*)::int FROM location_points p WHERE p.session_id = sid),
    bbox = ST_Envelope(r.route),
    moving_time_s = COALESCE(r.moving, s.moving_time_s),
    updated_at = now()
  FROM (
    SELECT ST_Multi(ST_Collect(line ORDER BY seq))::geometry(MultiLineStringZ, 4326) AS route,
           SUM(ST_Length(line::geography)) AS dist,
           SUM(secs)::int AS moving
    FROM (
      SELECT seg.seq, ST_MakeLine(p.geom::geometry ORDER BY p.recorded_at) AS line,
             EXTRACT(EPOCH FROM (max(p.recorded_at) - min(p.recorded_at))) AS secs
      FROM location_points p JOIN tracking_segments seg ON seg.id = p.segment_id
      WHERE p.session_id = sid GROUP BY seg.id, seg.seq HAVING count(*) >= 2
    ) lines
  ) r WHERE s.id = sid;
END $$ LANGUAGE plpgsql;

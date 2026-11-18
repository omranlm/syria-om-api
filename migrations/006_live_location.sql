-- Live location: points sent every few seconds while the user has live location on, with or without a
-- recording. They are stored with the recorded points but with provider 'live' and no session or segment,
-- so they never change a recording's route, distance or point count.
ALTER TABLE location_points ALTER COLUMN session_id DROP NOT NULL;

-- "Where is everyone live right now": the latest live points per user.
CREATE INDEX IF NOT EXISTS location_points_live_idx ON location_points (user_id, recorded_at DESC)
  WHERE provider = 'live';

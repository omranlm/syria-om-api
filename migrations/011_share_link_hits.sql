-- Visits and button taps on the shared-link landing page (website /l/...), counted per day and kind.
-- Anonymous by design: no ids, coordinates or IP addresses are stored. Installs from a shared link come
-- from the app itself, as install_source activity events.
CREATE TABLE IF NOT EXISTS share_link_hits (
  day   date NOT NULL,
  kind  text NOT NULL CHECK (kind IN ('view', 'download_google', 'download_huawei', 'open_app', 'other_maps')),
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind)
);

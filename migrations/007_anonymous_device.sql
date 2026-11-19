-- Anonymous recording: an app install signs in without a phone number. Its account is found by the device id
-- (identity subject) and proven by a secret that only the app knows; the device id alone is not enough, as it
-- is shown in the app settings and on the dashboard.
ALTER TABLE users ADD COLUMN anonymous boolean NOT NULL DEFAULT false;
ALTER TABLE auth_identities ADD COLUMN secret_hash text;

ALTER TABLE auth_identities DROP CONSTRAINT IF EXISTS auth_identities_provider_check;
ALTER TABLE auth_identities ADD CONSTRAINT auth_identities_provider_check
  CHECK (provider IN ('phone', 'google', 'telegram', 'pin', 'device'));

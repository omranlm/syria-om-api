-- Sign-in with phone number + 6-digit PIN chosen by the user. A number can register directly, so it is
-- marked unverified until its owner confirms it once with the SMS code or Telegram (which then takes the
-- account over: the PIN is cleared and other sessions are signed out). The admin password stays apart.
ALTER TABLE users ADD COLUMN pin_hash text;
ALTER TABLE users ADD COLUMN phone_verified boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN pin_failed int NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN pin_locked_until timestamptz;

-- Every account so far came from the SMS code, Telegram or the admin seed.
UPDATE users SET phone_verified = true;

ALTER TABLE auth_identities DROP CONSTRAINT IF EXISTS auth_identities_provider_check;
ALTER TABLE auth_identities ADD CONSTRAINT auth_identities_provider_check
  CHECK (provider IN ('phone', 'google', 'telegram', 'pin'));

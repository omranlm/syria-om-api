-- Sign-in through a Telegram bot: the user shares their phone number with the bot (Telegram has verified
-- it), which is an alternative to the SMS code. The phone number stays the account identity.
ALTER TABLE auth_identities DROP CONSTRAINT IF EXISTS auth_identities_provider_check;
ALTER TABLE auth_identities ADD CONSTRAINT auth_identities_provider_check
  CHECK (provider IN ('phone', 'google', 'telegram'));

-- One row per "Sign in with Telegram" tap in the app.
CREATE TABLE telegram_logins (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text NOT NULL UNIQUE,              -- in the t.me/<bot>?start=<code> link
  poll_secret_hash text NOT NULL,                     -- only the app that started the login can collect it
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'bound', 'verified', 'consumed')),
  telegram_user_id bigint,                            -- set by /start: only this Telegram user may finish it
  phone_e164       text,                              -- set when the user shares their own contact
  ip               inet,
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL
);
CREATE INDEX telegram_logins_user_idx ON telegram_logins (telegram_user_id, created_at DESC);
CREATE INDEX telegram_logins_ip_idx ON telegram_logins (ip, created_at DESC);

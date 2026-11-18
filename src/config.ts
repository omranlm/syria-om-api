const env = (key: string, fallback: string): string => {
  const v = process.env[key];
  return v === undefined || v === '' ? fallback : v;
};

export const config = {
  port: Number(env('PORT', '3000')),
  databaseUrl: env('DATABASE_URL', 'postgres://syriaom:syriaom@localhost:5433/syriaom'),
  jwtSecret: env('JWT_SECRET', 'dev-only-secret-change-me'),
  accessTtlS: Number(env('ACCESS_TOKEN_TTL_S', '3600')),
  refreshTtlDays: Number(env('REFRESH_TOKEN_TTL_DAYS', '30')),
  smsProvider: env('SMS_PROVIDER', 'fake'),
  fakeOtpCode: env('FAKE_OTP_CODE', '123456'),
  // The fake SMS provider accepts FAKE_OTP_CODE for every number: only for local development.
  allowFakeOtp: env('ALLOW_FAKE_OTP', 'false') === 'true',
  otpTtlS: Number(env('OTP_TTL_S', '300')),
  defaultCountry: env('DEFAULT_COUNTRY', 'SY'),
  adminPhone: env('ADMIN_PHONE', '+963000000000'),
  adminPassword: env('ADMIN_PASSWORD', 'ChangeMe123!'),
  retentionYears: Number(env('RETENTION_YEARS', '5')),
  // Sign-in through a Telegram bot (off when either is empty). Username without the @.
  telegramBotToken: env('TELEGRAM_BOT_TOKEN', ''),
  telegramBotUsername: env('TELEGRAM_BOT_USERNAME', '').replace(/^@/, ''),
};

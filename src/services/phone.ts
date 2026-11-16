import {CountryCode, parsePhoneNumberFromString} from 'libphonenumber-js';
import {config} from '../config';

/** Returns the E.164 form of a phone number, or undefined when it is not a valid number. */
export function normalizePhone(input: string | undefined, defaultCountry = config.defaultCountry): string | undefined {
  const raw = (input ?? '').trim();
  if (!raw) return undefined;
  const parsed = parsePhoneNumberFromString(raw, defaultCountry as CountryCode);
  return parsed?.isValid() ? parsed.number : undefined;
}

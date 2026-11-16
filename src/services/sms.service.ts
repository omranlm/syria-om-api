import {BindingKey} from '@loopback/core';
import {config} from '../config';

export interface SmsProvider {
  readonly name: string;
  send(phoneE164: string, text: string): Promise<void>;
}

export const SMS_PROVIDER = BindingKey.create<SmsProvider>('services.SmsProvider');

/** Development provider: sends nothing, prints the message to the log. */
export class FakeSmsProvider implements SmsProvider {
  readonly name = 'fake';
  async send(phoneE164: string, text: string): Promise<void> {
    console.log(`[fake-sms] to ${phoneE164}: ${text}`);
  }
}

export function createSmsProvider(): SmsProvider {
  switch (config.smsProvider) {
    case 'fake':
      return new FakeSmsProvider();
    default:
      throw new Error(`Unknown SMS_PROVIDER '${config.smsProvider}'`);
  }
}

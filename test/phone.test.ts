import {expect} from '@loopback/testlab';
import {normalizePhone} from '../src/services/phone';

describe('normalizePhone (default country SY)', () => {
  it('accepts a national Syrian mobile number with a leading zero', () => {
    expect(normalizePhone('0944 123 456')).to.equal('+963944123456');
  });

  it('accepts a national number without the leading zero', () => {
    expect(normalizePhone('944123456')).to.equal('+963944123456');
  });

  it('accepts the international form with + and with 00', () => {
    expect(normalizePhone('+963 944 123 456')).to.equal('+963944123456');
    expect(normalizePhone('00963944123456')).to.equal('+963944123456');
  });

  it('accepts foreign numbers in international form', () => {
    expect(normalizePhone('+49 30 123456')).to.equal('+4930123456');
  });

  it('rejects garbage, empty and too short input', () => {
    expect(normalizePhone('')).to.be.undefined();
    expect(normalizePhone(undefined)).to.be.undefined();
    expect(normalizePhone('abc')).to.be.undefined();
    expect(normalizePhone('123')).to.be.undefined();
  });
});

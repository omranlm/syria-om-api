import {inject, service} from '@loopback/core';
import {HttpErrors, post, Request, requestBody, RestBindings} from '@loopback/rest';
import {clientIp} from '../auth/jwt.strategy';
import {OtpService} from '../services/otp.service';
import {TelegramService} from '../services/telegram.service';
import {normalizePhone} from '../services/phone';
import {TokenService} from '../services/token.service';
import {DeviceInput, publicUser, UserService} from '../services/user.service';
import {deviceSchema, json} from './schemas';

export class AuthController {
  constructor(
    @service(OtpService) private otp: OtpService,
    @service(TokenService) private tokens: TokenService,
    @service(UserService) private users: UserService,
    @service(TelegramService) private telegram: TelegramService,
    @inject(RestBindings.Http.REQUEST) private request: Request,
  ) {}

  @post('/auth/otp/request')
  async requestOtp(
    @requestBody(json({type: 'object', required: ['phone'], properties: {phone: {type: 'string', maxLength: 32}}}))
    body: {phone: string},
  ): Promise<{phone: string; expiresInS: number}> {
    const phone = normalizePhone(body.phone);
    if (!phone) throw new HttpErrors.BadRequest('Invalid phone number');
    const {expiresInS} = await this.otp.request(phone, clientIp(this.request));
    return {phone, expiresInS};
  }

  @post('/auth/otp/verify')
  async verifyOtp(
    @requestBody(
      json({
        type: 'object',
        required: ['phone', 'code', 'device'],
        properties: {phone: {type: 'string', maxLength: 32}, code: {type: 'string', maxLength: 12}, device: deviceSchema},
      }),
    )
    body: {phone: string; code: string; device: DeviceInput},
  ) {
    const phone = normalizePhone(body.phone);
    if (!phone) throw new HttpErrors.BadRequest('Invalid phone number');
    await this.otp.verify(phone, body.code);
    const user = await this.users.findOrCreateByPhone(phone);
    if (user.status !== 'active') throw new HttpErrors.Forbidden('Account is blocked');
    const deviceId = await this.users.upsertDevice(user.id, body.device);
    const pair = await this.tokens.issuePair(user.id, user.role, deviceId);
    await this.users.touch(user.id);
    await this.users.logEvent(user.id, deviceId, 'login', {method: 'phone'});
    return {...pair, user: publicUser(user)};
  }

  /** Starts a Telegram sign-in: the app opens botUrl, then polls /auth/telegram/poll with the secret. */
  @post('/auth/telegram/start')
  async startTelegram(): Promise<{loginId: string; pollSecret: string; botUrl: string; expiresInS: number}> {
    return this.telegram.startLogin(clientIp(this.request));
  }

  /** {status: 'pending' | 'bound'} until the user shared their number with the bot, then the tokens. */
  @post('/auth/telegram/poll')
  async pollTelegram(
    @requestBody(
      json({
        type: 'object',
        required: ['loginId', 'pollSecret', 'device'],
        properties: {
          loginId: {type: 'string', format: 'uuid'},
          pollSecret: {type: 'string', maxLength: 128},
          device: deviceSchema,
        },
      }),
    )
    body: {loginId: string; pollSecret: string; device: DeviceInput},
  ) {
    const state = await this.telegram.collect(body.loginId, body.pollSecret);
    if (state.status !== 'verified') return {status: state.status};
    const user = await this.users.findOrCreateByPhone(state.phone);
    if (user.status !== 'active') throw new HttpErrors.Forbidden('Account is blocked');
    await this.users.linkIdentity(user.id, 'telegram', state.telegramUserId);
    const deviceId = await this.users.upsertDevice(user.id, body.device);
    const pair = await this.tokens.issuePair(user.id, user.role, deviceId);
    await this.users.touch(user.id);
    await this.users.logEvent(user.id, deviceId, 'login', {method: 'telegram'});
    return {status: 'verified', ...pair, user: publicUser(user)};
  }

  @post('/auth/refresh')
  async refresh(
    @requestBody(json({type: 'object', required: ['refreshToken'], properties: {refreshToken: {type: 'string'}}}))
    body: {refreshToken: string},
  ) {
    const {userId, ...pair} = await this.tokens.rotate(body.refreshToken);
    await this.users.touch(userId);
    return pair;
  }

  @post('/auth/logout')
  async logout(
    @requestBody(json({type: 'object', required: ['refreshToken'], properties: {refreshToken: {type: 'string'}}}))
    body: {refreshToken: string},
  ): Promise<{ok: boolean}> {
    const owner = await this.tokens.revoke(body.refreshToken);
    if (owner) await this.users.logEvent(owner.userId, owner.deviceId, 'logout');
    return {ok: true};
  }

  @post('/auth/admin/login')
  async adminLogin(
    @requestBody(
      json({
        type: 'object',
        required: ['phone', 'password'],
        properties: {phone: {type: 'string', maxLength: 32}, password: {type: 'string', maxLength: 128}},
      }),
    )
    body: {phone: string; password: string},
  ) {
    // The seeded admin number may not be a dialable number, so fall back to the raw value.
    const phone = normalizePhone(body.phone) ?? body.phone.trim();
    const user = await this.users.verifyAdminPassword(phone, body.password);
    if (!user) throw new HttpErrors.Unauthorized('Wrong phone or password');
    if (user.status !== 'active') throw new HttpErrors.Forbidden('Account is blocked');
    const pair = await this.tokens.issuePair(user.id, 'admin', null);
    await this.users.logEvent(user.id, null, 'admin_login');
    return {...pair, user: publicUser(user)};
  }
}

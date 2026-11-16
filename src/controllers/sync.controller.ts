import {authenticate} from '@loopback/authentication';
import {inject, service} from '@loopback/core';
import {post, Request, requestBody, RestBindings} from '@loopback/rest';
import {SecurityBindings, securityId, UserProfile} from '@loopback/security';
import {clientIp} from '../auth/jwt.strategy';
import {SyncBatch, SyncResult, SyncService} from '../services/sync.service';
import {UserService} from '../services/user.service';
import {json, syncBatchSchema} from './schemas';

@authenticate('jwt')
export class SyncController {
  constructor(
    @inject(SecurityBindings.USER) private profile: UserProfile,
    @service(SyncService) private sync: SyncService,
    @service(UserService) private users: UserService,
    @inject(RestBindings.Http.REQUEST) private request: Request,
  ) {}

  @post('/sync/batch')
  async batch(@requestBody(json(syncBatchSchema)) body: SyncBatch): Promise<SyncResult> {
    const userId = this.profile[securityId];
    const deviceId = await this.users.upsertDevice(userId, body.device);
    return this.sync.applyBatch(userId, deviceId, body, clientIp(this.request));
  }
}

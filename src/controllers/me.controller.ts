import {authenticate} from '@loopback/authentication';
import {inject, service} from '@loopback/core';
import {get, HttpErrors, patch, requestBody} from '@loopback/rest';
import {SecurityBindings, securityId, UserProfile} from '@loopback/security';
import {DbService} from '../services/db.service';
import {publicUser, UserService} from '../services/user.service';
import {json} from './schemas';

@authenticate('jwt')
export class MeController {
  constructor(
    @inject(SecurityBindings.USER) private profile: UserProfile,
    @service(UserService) private users: UserService,
    @service(DbService) private db: DbService,
  ) {}

  @get('/me')
  async me() {
    const id = this.profile[securityId];
    const user = await this.users.findById(id);
    if (!user) throw new HttpErrors.Unauthorized('User no longer exists');
    const stats = await this.db.one<{sessions: number; distance_m: number; moving_time_s: number}>(
      `SELECT count(*)::int AS sessions,
              COALESCE(sum(distance_m), 0)::float8 AS distance_m,
              COALESCE(sum(moving_time_s), 0)::int AS moving_time_s
       FROM tracking_sessions WHERE user_id = $1 AND status = 'stopped'`,
      [id],
    );
    await this.users.touch(id);
    return {
      user: publicUser(user),
      stats: {
        sessions: stats?.sessions ?? 0,
        distanceM: stats?.distance_m ?? 0,
        movingTimeS: stats?.moving_time_s ?? 0,
      },
    };
  }

  @patch('/me')
  async update(
    @requestBody(json({type: 'object', properties: {displayName: {type: 'string', maxLength: 80, nullable: true}}}))
    body: {displayName?: string | null},
  ) {
    const user = await this.users.updateDisplayName(this.profile[securityId], body.displayName?.trim() || null);
    if (!user) throw new HttpErrors.Unauthorized('User no longer exists');
    return publicUser(user);
  }
}

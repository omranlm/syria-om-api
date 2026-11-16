import {AuthenticationStrategy} from '@loopback/authentication';
import {service} from '@loopback/core';
import {HttpErrors, Request} from '@loopback/rest';
import {securityId, UserProfile} from '@loopback/security';
import {TokenService} from '../services/token.service';

export class JwtAuthenticationStrategy implements AuthenticationStrategy {
  name = 'jwt';

  constructor(@service(TokenService) private tokens: TokenService) {}

  async authenticate(request: Request): Promise<UserProfile | undefined> {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer '))
      throw new HttpErrors.Unauthorized('Authorization header with a Bearer token is required');
    const claims = this.tokens.verifyAccess(header.slice('Bearer '.length).trim());
    return {[securityId]: claims.sub, role: claims.role};
  }
}

export function requireAdmin(user: UserProfile): void {
  if (user.role !== 'admin') throw new HttpErrors.Forbidden('Admin access required');
}

export function clientIp(request: Request): string | null {
  const forwarded = request.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0].trim();
  return first || request.socket.remoteAddress || null;
}

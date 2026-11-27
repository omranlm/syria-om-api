import {inject, service} from '@loopback/core';
import {HttpErrors, post, Request, requestBody, RestBindings} from '@loopback/rest';
import {clientIp} from '../auth/jwt.strategy';
import {DbService} from '../services/db.service';
import {json} from './schemas';

export const SHARE_LINK_KINDS = ['view', 'download_google', 'download_huawei', 'open_app', 'other_maps'] as const;
export type ShareLinkKind = (typeof SHARE_LINK_KINDS)[number];

const HITS_PER_IP_PER_HOUR = 120;
const hitsByIp = new Map<string, {count: number; since: number}>();

/** Keeps one address from inflating the counts; the address itself is never stored. */
function limitHits(ip: string | null): void {
  if (!ip) return;
  const now = Date.now();
  const entry = hitsByIp.get(ip);
  if (!entry || now - entry.since > 3_600_000) {
    if (hitsByIp.size > 10_000) hitsByIp.clear();
    hitsByIp.set(ip, {count: 1, since: now});
    return;
  }
  entry.count++;
  if (entry.count > HITS_PER_IP_PER_HOUR) throw new HttpErrors.TooManyRequests('Too many requests, try again later');
}

/** Public counter for the shared-link landing page of the website (no sign-in, no personal data). */
export class ShareLinksController {
  constructor(
    @service(DbService) private db: DbService,
    @inject(RestBindings.Http.REQUEST) private request: Request,
  ) {}

  @post('/share-links/hit', {responses: {'204': {description: 'Counted'}}})
  async hit(
    @requestBody(
      json({
        type: 'object',
        required: ['kind'],
        additionalProperties: false,
        properties: {kind: {type: 'string', enum: [...SHARE_LINK_KINDS]}},
      }),
    )
    body: {kind: ShareLinkKind},
  ): Promise<void> {
    limitHits(clientIp(this.request));
    await this.db.query(
      `INSERT INTO share_link_hits (day, kind, count) VALUES (current_date, $1, 1)
       ON CONFLICT (day, kind) DO UPDATE SET count = share_link_hits.count + 1`,
      [body.kind],
    );
  }
}

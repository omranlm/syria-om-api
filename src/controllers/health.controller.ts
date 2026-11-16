import {service} from '@loopback/core';
import {get} from '@loopback/rest';
import {DbService} from '../services/db.service';

export class HealthController {
  constructor(@service(DbService) private db: DbService) {}

  @get('/health')
  async health(): Promise<{status: string; db: string; time: string}> {
    let db = 'ok';
    try {
      await this.db.query('SELECT 1');
    } catch {
      db = 'down';
    }
    return {status: db === 'ok' ? 'ok' : 'degraded', db, time: new Date().toISOString()};
  }
}

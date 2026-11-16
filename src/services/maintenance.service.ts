import {BindingScope, injectable, service} from '@loopback/core';
import {config} from '../config';
import {DbService} from './db.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Keeps point partitions created ahead of time and purges data past the retention period. */
@injectable({scope: BindingScope.SINGLETON})
export class MaintenanceService {
  private timer?: NodeJS.Timeout;

  constructor(@service(DbService) private db: DbService) {}

  async start(): Promise<void> {
    await this.runOnce();
    this.timer = setInterval(() => this.runOnce().catch(e => console.error('maintenance failed', e)), DAY_MS);
    this.timer.unref();
  }

  stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async runOnce(): Promise<void> {
    await this.db.query('SELECT ensure_location_partitions(3)');
    const purged = await this.db.query<{what: string; n: string}>('SELECT * FROM purge_old_data($1)', [
      config.retentionYears,
    ]);
    const nonZero = purged.filter(p => Number(p.n) > 0);
    if (nonZero.length) console.log('Retention purge:', nonZero.map(p => `${p.what}=${p.n}`).join(' '));
  }
}

import fs from 'fs';
import path from 'path';
import {Pool} from 'pg';
import {config} from './config';

/** Applies migrations/*.sql in name order; each file runs once, inside a transaction. */
export async function runMigrations(pool: Pool): Promise<string[]> {
  const dir = path.join(__dirname, '../../migrations');
  await pool.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  const applied = new Set(
    (await pool.query<{name: string}>('SELECT name FROM schema_migrations')).rows.map(r => r.name),
  );
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  const done: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      done.push(file);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  return done;
}

if (require.main === module) {
  const pool = new Pool({connectionString: config.databaseUrl});
  runMigrations(pool)
    .then(done => {
      console.log('Applied migrations:', done.length ? done.join(', ') : '(none)');
      return pool.end();
    })
    .catch(e => {
      console.error(e);
      process.exit(1);
    });
}

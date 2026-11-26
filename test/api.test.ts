import {Client, createRestAppClient, expect, givenHttpServerConfig} from '@loopback/testlab';
import crypto from 'crypto';
import {Pool} from 'pg';
import {SyriaOmApiApplication} from '../src/application';
import {config} from '../src/config';

/**
 * Integration tests against a real PostGIS database (DATABASE_URL). They are skipped when the
 * database cannot be reached, so `npm test` still passes on a machine without Docker.
 */
describe('API (integration)', function () {
  let app: SyriaOmApiApplication;
  let client: Client;
  let dbReachable = false;
  const phone = '+963944' + String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const deviceId = crypto.randomUUID();
  let accessToken = '';
  let refreshToken = '';
  let userId = '';
  let trackedSessionId = '';

  before(async function () {
    const pool = new Pool({connectionString: config.databaseUrl, connectionTimeoutMillis: 2000});
    try {
      await pool.query('SELECT 1');
      dbReachable = true;
    } catch {
      console.log('    (database not reachable, integration tests skipped)');
    } finally {
      await pool.end();
    }
    if (!dbReachable) return this.skip();

    app = new SyriaOmApiApplication({rest: givenHttpServerConfig()});
    await app.boot();
    await app.migrateAndSeed();
    await app.start();
    client = createRestAppClient(app);
  });

  after(async () => {
    if (!app) return;
    const pool = new Pool({connectionString: config.databaseUrl});
    await pool.query('DELETE FROM users WHERE phone_e164 = $1', [phone]);
    await pool.end();
    await app.stop();
  });

  it('reports health', async () => {
    const res = await client.get('/health').expect(200);
    expect(res.body.db).to.equal('ok');
  });

  it('rejects an invalid phone number', async () => {
    await client.post('/auth/otp/request').send({phone: 'abc'}).expect(400);
  });

  it('issues a code and logs in with the fake OTP', async () => {
    const req = await client.post('/auth/otp/request').send({phone}).expect(200);
    expect(req.body.phone).to.equal(phone);

    await client.post('/auth/otp/verify').send({phone, code: '000000', device: {id: deviceId}}).expect(400);

    const res = await client
      .post('/auth/otp/verify')
      .send({phone, code: config.fakeOtpCode, device: {id: deviceId, flavor: 'google', appVersion: 'test'}})
      .expect(200);
    expect(res.body.user.phone).to.equal(phone);
    accessToken = res.body.accessToken;
    refreshToken = res.body.refreshToken;
    userId = res.body.user.id;
  });

  it('requires a token for /me and returns the profile with it', async () => {
    await client.get('/me').expect(401);
    const res = await client.get('/me').set('Authorization', `Bearer ${accessToken}`).expect(200);
    expect(res.body.user.id).to.equal(userId);
  });

  it('stores a tracking batch idempotently and computes the server distance', async () => {
    const sessionId = crypto.randomUUID();
    trackedSessionId = sessionId;
    const segmentId = crypto.randomUUID();
    const t0 = Date.parse('2026-01-10T08:00:00Z');
    // Straight line in Damascus, ~111 m per 0.001 deg of latitude, 5 s apart: 10 points -> ~1 km.
    const points = Array.from({length: 10}, (_, i) => ({
      id: crypto.randomUUID(),
      sessionId,
      segmentId,
      recordedAt: new Date(t0 + i * 5000).toISOString(),
      lat: 33.5 + i * 0.001,
      lon: 36.3,
      accuracyM: 5,
      speedMps: 22,
    }));
    const batch = {
      device: {id: deviceId},
      sessions: [{id: sessionId, status: 'stopped', startedAt: points[0].recordedAt, endedAt: points[9].recordedAt, clientDistanceM: 999}],
      segments: [{id: segmentId, sessionId, seq: 0, startedAt: points[0].recordedAt, endedAt: points[9].recordedAt}],
      points,
      events: [
        {id: crypto.randomUUID(), type: 'tracking_start', occurredAt: points[0].recordedAt, sessionId,
          payload: {batteryMode: 'unrestricted', powerSaver: false}},
        // The app stopped the trip itself (no movement), with the battery settings at that moment.
        {id: crypto.randomUUID(), type: 'tracking_stop', occurredAt: points[9].recordedAt, sessionId,
          payload: {batteryMode: 'optimized', powerSaver: true, standbyBucket: 10, reason: 'not_moving'}},
      ],
    };

    const first = await client.post('/sync/batch').set('Authorization', `Bearer ${accessToken}`).send(batch).expect(200);
    expect(first.body.acked.points).to.have.length(10);
    expect(first.body.acked.sessions).to.deepEqual([sessionId]);

    // Re-sending the same batch must ack everything again without duplicating rows.
    const second = await client.post('/sync/batch').set('Authorization', `Bearer ${accessToken}`).send(batch).expect(200);
    expect(second.body.acked.points).to.have.length(10);

    const session = await client.get(`/sessions/${sessionId}`).set('Authorization', `Bearer ${accessToken}`).expect(200);
    expect(session.body.pointCount).to.equal(10);
    expect(session.body.distanceM).to.be.within(990, 1010);
    expect(session.body.movingTimeS).to.equal(45);

    const geo = await client.get(`/sessions/${sessionId}/geojson`).set('Authorization', `Bearer ${accessToken}`).expect(200);
    expect(geo.body.features[0].geometry.type).to.equal('MultiLineString');
  });

  it('refuses a batch that references another user session', async () => {
    await client
      .post('/sync/batch')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        device: {id: deviceId},
        points: [{id: crypto.randomUUID(), sessionId: crypto.randomUUID(), recordedAt: new Date().toISOString(), lat: 1, lon: 1}],
      })
      .expect(403);
  });

  it('rotates refresh tokens and rejects the old one afterwards', async () => {
    const res = await client.post('/auth/refresh').send({refreshToken}).expect(200);
    expect(res.body.accessToken).to.be.a.String();
    await client.post('/auth/refresh').send({refreshToken}).expect(401);
    refreshToken = res.body.refreshToken;
  });

  it('keeps admin endpoints away from normal users and open for the seeded admin', async () => {
    await client.get('/admin/stats').set('Authorization', `Bearer ${accessToken}`).expect(403);
    const login = await client
      .post('/auth/admin/login')
      .send({phone: config.adminPhone, password: config.adminPassword})
      .expect(200);
    const stats = await client.get('/admin/stats').set('Authorization', `Bearer ${login.body.accessToken}`).expect(200);
    expect(stats.body.totals.sessions).to.be.greaterThanOrEqual(1);
    const auth = `Bearer ${login.body.accessToken}`;
    const users = await client.get('/admin/users?q=' + phone.slice(-6)).set('Authorization', auth).expect(200);
    expect(users.body.items.some((u: {id: string}) => u.id === userId)).to.be.true();
    expect(users.body.total).to.be.greaterThanOrEqual(1);
    // Pages and whitelisted sorting; an unknown sort key falls back to the default order.
    const sessions = await client.get('/admin/sessions?limit=1&sort=distance&order=asc').set('Authorization', auth).expect(200);
    expect(sessions.body.items).to.have.length(1);
    expect(sessions.body.total).to.be.greaterThanOrEqual(1);
    await client.get('/admin/users?sort=password_hash;drop').set('Authorization', auth).expect(200);
    const types = await client.get('/admin/activity/types').set('Authorization', auth).expect(200);
    expect(types.body).to.be.an.Array();
    await client.get('/admin/live?minutes=60').set('Authorization', auth).expect(200);
    // Who ended the trip and the battery settings at its start and end.
    const detail = await client.get(`/admin/sessions/${trackedSessionId}`).set('Authorization', auth).expect(200);
    expect(detail.body.stopReason).to.equal('not_moving');
    expect(detail.body.battery).to.containDeep({atStart: 'unrestricted', atStop: 'optimized', powerSaverAtStop: true, standbyBucketAtStop: 10});
  });

  it('logs out', async () => {
    await client.post('/auth/logout').send({refreshToken}).expect(200);
    await client.post('/auth/refresh').send({refreshToken}).expect(401);
  });
});

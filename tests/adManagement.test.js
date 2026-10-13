require('dotenv').config({ quiet: true });
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const { MongoClient } = require('mongodb');
const { PrismaClient } = require('@prisma/client');
const { createAdService, validatePlacement, registry } = require('../services/adService');
const { createAdRouters } = require('../routes/adRoutes');
const { migrate } = require('../scripts/migrate-ad-placements');
const unit = 'ca-app-pub-3940256099942544/6300978111';
const body = { pageKey: 'calendar', placementKey: 'bottom_banner', adFormat: 'banner', androidAdUnitId: unit, iosAdUnitId: 'ca-app-pub-3940256099942544/2934735716', isEnabled: true, sortOrder: 2, frequencyCap: 180 };

test('registry matches the bundled Flutter asset and rejects unsupported settings', () => {
  const asset = path.resolve(__dirname, '../../mobile_app/assets/ad_registry.json');
  if (fs.existsSync(asset)) assert.deepEqual(registry, JSON.parse(fs.readFileSync(asset, 'utf8')));
  assert.equal(validatePlacement(body).androidAdUnitId, unit);
  for (const invalid of [{ pageKey: 'unknown' }, { placementKey: 'arbitrary' }, { adFormat: 'rewarded' }, { androidAdUnitId: 'ca-app-pub-3940256099942544~3347511713' }, { iosAdUnitId: 'wrong' }, { frequencyCap: 1 }, { isEnabled: 'true' }, { sortOrder: -1 }]) {
    assert.throws(() => validatePlacement({ ...body, ...invalid }), /./);
  }
});

test('real Mongo migration and Prisma HTTP CRUD preserve toggles, legacy IDs and existing data', { timeout: 90000 }, async () => {
  const database = `valikati_ads_test_${crypto.randomBytes(6).toString('hex')}`;
  assert.match(database, /^valikati_ads_test_[a-f0-9]{12}$/);
  const originalUrl = new URL(process.env.DATABASE_URL);
  const testUrl = new URL(originalUrl); testUrl.pathname = `/${database}`;
  const mongo = new MongoClient(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 15000 });
  await mongo.connect();
  const db = mongo.db(database);
  const prisma = new PrismaClient({ datasources: { db: { url: testUrl.toString() } } });
  let server;
  try {
    await db.collection('AppContent').insertMany([
      { key: 'admob_enabled', en: 'true', ta: '' },
      { key: 'admob_banner_unit_id', en: unit, ta: '' },
    ]);
    await db.collection('Blog').insertOne({ contentTa: 'Preserve this existing article' });
    assert.equal((await migrate(db)).placementCount, 4);
    const service = createAdService(prisma);
    const auth = require('../utils/posterAuth').adminAuth;
    const admin = await mongo.db().collection('Admin').findOne({}, { projection: { _id: 1 } });
    assert.ok(admin, 'Existing admin required for strict authentication test');
    const token = jwt.sign({ id: admin._id.toString() }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const routers = createAdRouters({ service, auth, emit: () => {} });
    const app = express(); app.use(express.json()); app.use('/api/ad-config', routers.publicRouter); app.use('/api/admin/ad-placements', routers.adminRouter);
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    const send = (route, method = 'GET', data, authenticated = true) => fetch(url + route, { method, headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: `Bearer ${token}` } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
    assert.equal((await send('/api/admin/ad-placements', 'GET', undefined, false)).status, 401);
    let publicConfig = await (await send('/api/ad-config')).json(); assert.equal(publicConfig.placements.length, 4);
    const created = await send('/api/admin/ad-placements', 'POST', body); assert.equal(created.status, 201); const row = await created.json();
    assert.equal((await send('/api/admin/ad-placements', 'POST', body)).status, 409);
    assert.equal((await send('/api/admin/ad-placements', 'POST', { ...body, placementKey: 'unknown' })).status, 400);
    assert.equal((await send(`/api/admin/ad-placements/${row.id}`, 'PUT', { ...body, androidAdUnitId: 'ca-app-pub-3940256099942544/6300978112' })).status, 200);
    const pages = Object.fromEntries(registry.pages.map(page => [page.key, true]));
    pages.calendar = false;
    assert.equal((await send('/api/admin/ad-placements/settings', 'PUT', { globalEnabled: true, pages })).status, 200);
    publicConfig = await (await send('/api/ad-config')).json(); assert.ok(!publicConfig.placements.some(p => p.pageKey === 'calendar')); assert.ok(publicConfig.placements.some(p => p.pageKey === 'home'));
    pages.calendar = true;
    await send('/api/admin/ad-placements/settings', 'PUT', { globalEnabled: false, pages });
    publicConfig = await (await send('/api/ad-config')).json(); assert.equal(publicConfig.globalEnabled, false); assert.deepEqual(publicConfig.placements, []);
    await migrate(db); assert.equal((await service.list()).globalEnabled, false);
    await send('/api/admin/ad-placements/settings', 'PUT', { globalEnabled: true, pages });
    assert.equal((await send(`/api/admin/ad-placements/${row.id}/status`, 'PATCH', { isEnabled: false })).status, 200);
    publicConfig = await (await send('/api/ad-config')).json(); assert.ok(!publicConfig.placements.some(p => p.id === row.id));
    assert.equal((await send(`/api/admin/ad-placements/${row.id}/status`, 'PATCH', { isEnabled: true })).status, 200);
    publicConfig = await (await send('/api/ad-config')).json(); assert.equal(publicConfig.placements.find(p => p.id === row.id).iosAdUnitId, body.iosAdUnitId);
    assert.equal((await send(`/api/admin/ad-placements/${row.id}`, 'DELETE')).status, 200);
    const migrated = (await service.list()).placements[0]; await service.remove(migrated.id); await migrate(db);
    assert.ok(!(await service.list()).placements.some(p => p.id === migrated.id));
    assert.equal(await db.collection('Blog').countDocuments(), 1);
    assert.equal(await db.collection('AppContent').countDocuments(), 2);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await prisma.$disconnect();
    // Only this verified randomly named test database's known test collections.
    assert.match(db.databaseName, /^valikati_ads_test_[a-f0-9]{12}$/);
    for (const name of ['ad_placements', 'ad_settings', 'AppContent', 'Blog']) { try { await db.collection(name).drop(); } catch (error) { if (error.codeName !== 'NamespaceNotFound') throw error; } }
    await mongo.close();
  }
});

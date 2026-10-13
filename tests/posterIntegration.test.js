require('dotenv').config({ quiet: true });
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { MongoClient } = require('mongodb');
const express = require('express');
const { createPosterService } = require('../services/posterService');
const { generateToken } = require('../utils/auth');

test('real MongoDB: independent upload, publishing, scheduling, pagination and persisted interactions', { timeout: 120000 }, async () => {
  assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required for the integration test');
  const client = new MongoClient(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 15000 });
  const prefix = `poster_test_${crypto.randomBytes(6).toString('hex')}_`;
  assert.match(prefix, /^poster_test_[a-f0-9]{12}_$/);
  let server, uploadedFilename;
  try {
    await client.connect(); const db = client.db();
    const before = await db.collection('Blog').countDocuments();
    const admin = await db.collection('Admin').findOne({}, { projection: { _id: 1 } }); assert.ok(admin, 'An existing admin is required');
    const adminToken = generateToken(admin._id.toString());
    let now = new Date('2026-10-12T10:00:00Z');
    const service = createPosterService(async () => db, prefix, () => now);
    const originalLoad = Module._load;
    Module._load = function(name, parent, ...args) {
      // Exercise the real local-disk fallback without external media writes.
      if (parent?.filename.endsWith('uploadRoutes.js') && name === '../utils/cloudinary') return { uploadToCloudinary: async () => { throw Error('Test local fallback'); } };
      if (parent?.filename.endsWith('uploadRoutes.js') && name === '../utils/catbox') return { uploadToCatbox: async () => { throw Error('Test local fallback'); } };
      return originalLoad.call(this, name, parent, ...args);
    };
    let uploadRouter;
    try { uploadRouter = require('../routes/uploadRoutes'); } finally { Module._load = originalLoad; }
    const { createPosterRouters } = require('../routes/posterRoutes');
    const events = [], routers = createPosterRouters({ service, uploadRouter, emit: (...event) => events.push(event) });
    const app = express(); app.use(express.json()); app.use('/uploads', express.static(path.join(__dirname, '../uploads'))); app.use('/api/poster-posts', routers.publicRouter); app.use('/api/admin/poster-posts', routers.adminRouter);
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    const send = async (route, method = 'GET', body, token) => {
      const response = await fetch(url + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
      return { status: response.status, body: await response.json() };
    };
    const adminPath = '/api/admin/poster-posts', feed = '/api/poster-posts';
    assert.equal((await send(adminPath)).status, 401);
    const session = (await send(feed + '/session', 'POST', {})).body.token;
    assert.equal((await send(adminPath, 'POST', {}, session)).status, 401);
    const cats = (await send(feed + '/categories')).body; assert.equal(cats.length, 7);
    const morning = cats.find(c => c.slug === 'morning');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jEAAAAABJRU5ErkJggg==', 'base64');
    const multipart = new FormData(); multipart.append('image', new Blob([png], { type: 'image/png' }), 'poster-test.png'); multipart.append('folder', 'valikatti_posters');
    const upload = await fetch(url + adminPath + '/upload', { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: multipart }); assert.equal(upload.status, 200);
    const media = await upload.json(); assert.equal(media.provider, 'local'); uploadedFilename = media.filename;
    assert.deepEqual(Buffer.from(await (await fetch(media.url)).arrayBuffer()), png);
    const created = await send(adminPath, 'POST', { imageUrl: media.url, caption: 'Test morning greeting', categoryId: morning.id, status: 'draft' }, adminToken); assert.equal(created.status, 201);
    const id = created.body.id;
    assert.equal((await send(feed)).body.items.length, 0);
    assert.equal((await send(feed + '/' + id)).status, 404);
    assert.equal((await send(adminPath + '/' + id, 'PUT', { status: 'published' }, adminToken)).status, 200);
    assert.equal((await send(feed)).body.items[0].id, id);
    assert.equal((await send(feed + '/' + id + '/like', 'POST', { liked: true })).status, 401);
    await Promise.all(Array.from({ length: 5 }, () => send(feed + '/' + id + '/like', 'POST', { liked: true }, session)));
    const liked = await send(feed + '/' + id, 'GET', undefined, session); assert.equal(liked.body.likeCount, 1); assert.equal(liked.body.liked, true);
    await send(feed + '/' + id + '/bookmark', 'POST', { bookmarked: true }, session);
    assert.equal((await send(feed + '?bookmarked=true', 'GET', undefined, session)).body.items.length, 1);
    // A fresh service reads persisted state, rather than any in-memory/client cache.
    const fresh = createPosterService(async () => db, prefix, () => now);
    const { verifySession } = require('../utils/posterAuth'); assert.equal((await fresh.get(id, verifySession(session).sub)).bookmarked, true);
    assert.equal((await send(feed + '?category=night')).body.items.length, 0);
    assert.equal((await send(feed + '?q=%5B')).body.items.length, 0);
    assert.equal((await send(feed + '?q=' + encodeURIComponent('காலை வணக்கம்'))).body.items.length, 1);
    assert.equal((await send(feed + '?cursor=bad')).status, 400);
    assert.equal((await send(feed + '?category%5B%24ne%5D=x')).status, 400);
    const scheduled = await send(adminPath, 'POST', { imageUrl: media.url, categoryId: morning.id, status: 'scheduled', publishedAt: new Date(now.getTime() + 60000).toISOString() }, adminToken); assert.equal(scheduled.status, 201);
    assert.equal((await send(feed)).body.items.length, 1);
    now = new Date(now.getTime() + 120000);
    assert.equal((await send(feed)).body.items.length, 2);
    assert.equal((await send(adminPath + '/' + scheduled.body.id, 'PUT', { isEnabled: false }, adminToken)).status, 200);
    assert.equal((await send(feed)).body.items.length, 1);
    await send(adminPath + '/' + scheduled.body.id, 'PUT', { isEnabled: true }, adminToken);
    const first = (await send(feed + '?limit=1')).body; assert.ok(first.nextCursor);
    const second = (await send(feed + '?limit=1&cursor=' + encodeURIComponent(first.nextCursor))).body; assert.notEqual(first.items[0].id, second.items[0].id); assert.equal(second.nextCursor, null);
    assert.equal((await send(adminPath, 'POST', { imageUrl: 'javascript:bad', categoryId: morning.id }, adminToken)).status, 400);
    await send(feed + '/' + id + '/like', 'POST', { liked: false }, session); assert.equal((await send(feed + '/' + id)).body.likeCount, 0);
    await send(adminPath + '/' + id, 'DELETE', undefined, adminToken); assert.equal(await db.collection(prefix + 'bookmarks').countDocuments(), 0);
    assert.equal((await send(feed + '/' + id)).status, 404);
    const accountActor = 'google:test-account-123456';
    await service.interact(scheduled.body.id, verifySession(session).sub, 'like', true);
    await service.interact(scheduled.body.id, verifySession(session).sub, 'bookmark', true);
    await service.mergeInteractions(verifySession(session).sub, accountActor);
    const accountPost = await fresh.get(scheduled.body.id, accountActor);
    assert.equal(accountPost.liked, true); assert.equal(accountPost.bookmarked, true); assert.equal(accountPost.likeCount, 1);
    assert.equal((await fresh.get(scheduled.body.id, verifySession(session).sub)).bookmarked, false);
    const customCategory = await send(adminPath + '/categories', 'POST', { slug: 'custom-greetings', nameTa: 'சிறப்பு வாழ்த்துக்கள்', nameEn: 'Special greetings' }, adminToken);
    assert.equal(customCategory.status, 201);
    assert.equal((await send(feed + '/categories')).body.length, 8);
    assert.equal((await send(adminPath + '/categories', 'POST', { slug: 'custom-greetings', nameTa: 'சிறப்பு', nameEn: 'Special' }, adminToken)).status, 409);
    assert.ok(events.every(event => event[0] === 'poster_posts_updated'));
    assert.equal(await db.collection('Blog').countDocuments(), before, 'Production Blog collection was not modified');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    // Only test-owned poster collections are eligible for cleanup.
    if (client.topology?.isConnected()) for (const name of ['posts', 'categories', 'likes', 'bookmarks']) {
      try { await client.db().collection(prefix + name).drop(); } catch (error) { if (error.codeName !== 'NamespaceNotFound') throw error; }
    }
    await client.close();
    if (uploadedFilename && /^[a-zA-Z0-9.-]+$/.test(uploadedFilename)) fs.unlinkSync(path.join(__dirname, '../uploads', uploadedFilename));
  }
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const express = require('express');

test('protected Blog files match baseline with explicitly authorized Article ad hooks', () => {
  const root = path.resolve(__dirname, '../..');
  const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/blog-baseline.json'), 'utf8').replace(/^\uFEFF/, ''));
  const adIntegration = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/blog-ad-integration.json'), 'utf8'));
  const notificationIntegration = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/blog-notification-integration.json'), 'utf8'));
  for (const file of baseline.files) {
    const target = file.path.startsWith('backend/') ? path.join(__dirname, '..', file.path.slice(8)) : path.join(root, file.path);
    if (!fs.existsSync(target) && !file.path.startsWith('backend/')) continue;
    const expected = notificationIntegration.files[file.path] || (file.path === adIntegration.path ? adIntegration.normalizedSha256 : file.normalizedSha256);
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n')).digest('hex').toUpperCase(), expected, file.path);
  }
  const schema = fs.readFileSync(path.join(__dirname, '../prisma/schema.prisma'), 'utf8');
  const blogModel = schema.match(/model Blog \{[\s\S]*?\r?\n\}/)[0].replace(/\r\n/g, '\n');
  assert.equal(crypto.createHash('sha256').update(blogModel).digest('hex').toUpperCase(), baseline.blogModelSha256);
  assert.match(schema, /model Blog \{[\s\S]*?contentTa\s+String[\s\S]*?audioUrl\s+String\?[\s\S]*?\}/);
  if (fs.existsSync(path.join(root, 'mobile_app/lib/home_screens.dart'))) {
    const home = fs.readFileSync(path.join(root, 'mobile_app/lib/home_screens.dart'), 'utf8');
    assert.match(home, /\? SpiritualFeedScreen\(showBackButton: false\)/);
    assert.match(home, /key == 'articles'[\s\S]*?const SpiritualFeedScreen\(\)/);
    assert.match(fs.readFileSync(path.join(root, 'mobile_app/lib/home_reference_sections.dart'), 'utf8'), /void _articles\(\)[\s\S]*?const SpiritualFeedScreen\(\)/);
  }
});

test('unchanged Blog routes still create, list, edit and delete articles', async () => {
  const records = new Map(), broadcasts = [];
  const original = Module._load;
  Module._load = function(name, parent, ...args) {
    if (name === '@prisma/client') return { PrismaClient: class { constructor() { this.blog = {
      findMany: async () => [...records.values()],
      create: async ({ data }) => { const record = { ...data, id: 'article-test', createdAt: new Date() }; records.set(record.id, record); return record; },
      update: async ({ where, data }) => { const record = { ...records.get(where.id), ...data }; records.set(where.id, record); return record; },
      delete: async ({ where }) => records.delete(where.id),
    }; } } };
    if (name === '../utils/firebase') return {};
    if (name === '../utils/socket') return { emitLiveUpdate: (...event) => broadcasts.push(event), emitAppContentUpdate: () => {} };
    if (name === '../utils/mailer') return {};
    return original.call(this, name, parent, ...args);
  };
  let adminRoutes, userRoutes;
  try { adminRoutes = require('../routes/adminRoutes'); userRoutes = require('../routes/userRoutes'); }
  finally { Module._load = original; }
  const app = express(); app.use(express.json()); app.use('/api/admin', adminRoutes); app.use('/api/user', userRoutes);
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const send = (route, method, body) => fetch(url + route, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  try {
    const originalArticle = { titleTa: 'ஆன்மீக கட்டுரை', contentTa: '<p>Article content</p>', categoryTa: 'ஆன்மீகம்', audioUrl: 'https://example.com/article.mp3', sendNotification: false };
    const created = await send('/api/admin/blogs', 'POST', originalArticle); assert.equal(created.status, 201);
    assert.equal((await created.json()).blog.contentTa, originalArticle.contentTa);
    assert.equal((await (await fetch(url + '/api/user/blogs')).json())[0].audioUrl, originalArticle.audioUrl);
    const updated = await send('/api/admin/blogs/article-test', 'PUT', { ...originalArticle, contentTa: '<p>Edited article</p>' }); assert.equal(updated.status, 200);
    assert.equal((await updated.json()).blog.contentTa, '<p>Edited article</p>');
    assert.equal((await (await fetch(url + '/api/admin/blogs')).json()).length, 1);
    assert.equal((await send('/api/admin/blogs/article-test', 'DELETE')).status, 200);
    assert.deepEqual(await (await fetch(url + '/api/user/blogs')).json(), []);
    assert.deepEqual(broadcasts.map(event => event[0]), ['blog_created', 'blog_updated', 'blog_deleted']);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

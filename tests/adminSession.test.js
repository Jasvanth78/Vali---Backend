const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createAdminSessionRouter } = require('../routes/adminSession');
test('session verification requires admin auth and never exposes a password', async () => {
  const app = express();
  let exists = true;
  app.use('/api/admin/session', createAdminSessionRouter({ auth: (req, res, next) => {
    if (req.headers.authorization !== 'Bearer valid') return res.status(401).json({ message: 'Admin sign-in required' });
    req.adminId = 'verified-admin'; next();
  }, prisma: { admin: { findUnique: async query => {
    assert.deepEqual(query, { where: { id: 'verified-admin' }, select: { id: true, email: true } });
    return exists ? { id: 'verified-admin', email: 'admin@example.com' } : null;
  } } } }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/admin/session`;
  try {
    assert.equal((await fetch(url)).status, 401);
    const response = await fetch(url, { headers: { Authorization: 'Bearer valid' } });
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { id: 'verified-admin', email: 'admin@example.com' });
    exists = false;
    assert.equal((await fetch(url, { headers: { Authorization: 'Bearer valid' } })).status, 401);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

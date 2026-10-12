const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const express = require('express');
const events = [];
const records = new Map();
const originalLoad = Module._load;
Module._load = function (name, parent, ...args) {
  if (name === '@prisma/client') return { PrismaClient: class {
    constructor() {
      this.govtHoliday = {
        findMany: async () => [...records.values()],
        create: async ({ data }) => { const record = { ...data, id: 'test-id' }; records.set(record.id, record); return record; },
        update: async ({ where, data }) => { const record = { ...records.get(where.id), ...data }; records.set(where.id, record); return record; },
        delete: async ({ where }) => records.delete(where.id),
      };
    }
  } };
  if (name === '../utils/socket' && parent?.filename.endsWith('govtHolidays.js')) return { emitLiveUpdate: (...event) => events.push(event) };
  return originalLoad.call(this, name, parent, ...args);
};
const router = require('../routes/govtHolidays');
Module._load = originalLoad;
test('holiday writes are visible on the public route and broadcast updates', async () => {
  const app = express(); app.use(express.json()); app.use('/api/govt-holidays', router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/govt-holidays`;
  try {
    const data = { date: '01', month: 'JAN', nameTa: 'Test', nameEn: 'Test', color: '#FFFFFF' };
    const send = (path, method, body) => fetch(url + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    assert.equal((await send('', 'POST', data)).status, 200);
    let read = await (await fetch(url)).json(); assert.equal(read.length, 1);
    assert.equal((await send('/test-id', 'PUT', { nameEn: 'Updated' })).status, 200);
    read = await (await fetch(url)).json(); assert.equal(read[0].nameEn, 'Updated');
    assert.equal((await send('/test-id', 'DELETE')).status, 200);
    read = await (await fetch(url)).json(); assert.equal(read.length, 0);
    assert.deepEqual(events.map(e => e[0]), ['govt_holidays_updated', 'govt_holidays_updated', 'govt_holidays_updated']);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

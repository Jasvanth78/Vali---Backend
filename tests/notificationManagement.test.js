require('dotenv').config({ quiet: true });
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { MongoClient } = require('mongodb');
const { migrate, collections } = require('../services/notificationStore');
const { createNotificationService } = require('../services/notificationService');
const v = require('../utils/notificationValidation');

test('notification hierarchy, preferences and idempotency use mocked FCM', { timeout: 90000 }, async () => {
  const name = `notif_test_${crypto.randomBytes(6).toString('hex')}`;
  assert.match(name, /^notif_test_[a-f0-9]{12}$/);
  const client = new MongoClient(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 15000 });
  let providerCalls = 0;
  try {
    await client.connect();
    const db = client.db(name);
    await db.collection('Notification').insertOne({ title: 'Preserved legacy history', createdAt: new Date() });
    assert.deepEqual(await migrate(db), { categories: 8, definitions: 5, rules: 4 });
    await db.collection('User').insertOne({ name: 'Test', email: 'notify@test.invalid', fcmToken: 'legacy-token', rasi: 'Mesham' });
    const firebase = () => ({ sendEachForMulticast: async request => {
      providerCalls++;
      return { successCount: request.tokens.length, failureCount: 0, responses: request.tokens.map(() => ({ success: true })) };
    } });
    const service = createNotificationService({ dbProvider: async () => db, firebase });
    const send = key => service.dispatch({ definitionKey: key, idempotencyKey: crypto.randomUUID(), source: 'test-suite' });

    let result = await send('general');
    assert.equal(result.status, 'accepted');
    assert.equal(providerCalls, 1);

    const article = await db.collection('notification_definitions').findOne({ key: 'article_published' });
    await service.status('definitions', article._id.toString(), { isEnabled: false });
    result = await send('article_published');
    assert.equal(result.status, 'skipped');
    assert.equal((await send('general')).status, 'accepted', 'one definition does not disable its category peers');

    const announcements = await db.collection('notification_categories').findOne({ key: 'announcements' });
    await service.status('categories', announcements._id.toString(), { isEnabled: false });
    assert.equal((await send('general')).status, 'skipped');
    await service.status('categories', announcements._id.toString(), { isEnabled: true });
    await service.global(false);
    assert.equal((await send('general')).status, 'skipped');
    await service.global(true);

    const secret = 'x'.repeat(40), deviceId = 'device_test_123456789';
    await service.deviceRegister({ deviceId, secret, token: 'device-token', platform: 'android', isEnabled: true });
    const device = await service.verifyDevice(deviceId, secret);
    await service.preferences(device, { categories: { announcements: false } });
    result = await send('general');
    assert.equal(result.eligible, 1, 'opted-out installation is excluded while legacy recipient remains');

    const key = crypto.randomUUID();
    const [first, duplicate] = await Promise.all([
      service.dispatch({ definitionKey: 'general', idempotencyKey: key }),
      service.dispatch({ definitionKey: 'general', idempotencyKey: key }),
    ]);
    assert.equal(first.id, duplicate.id);
    assert.equal(await db.collection('notification_logs').countDocuments({ idempotencyKey: key }), 1);
    assert.equal(await db.collection('Notification').countDocuments({ title: 'Preserved legacy history' }), 1);
    assert.throws(() => v.audience({ kind: 'test', userIds: Array.from({ length: 6 }, (_, index) => index.toString().padStart(24, '0')) }), /five/i);
  } finally {
    const db = client.db(name);
    assert.match(db.databaseName, /^notif_test_[a-f0-9]{12}$/);
    for (const collection of [...collections.map(value => `notification_${value}`), 'Notification', 'User']) {
      try { await db.collection(collection).drop(); } catch (error) { if (error.codeName !== 'NamespaceNotFound') throw error; }
    }
    await client.close();
  }
});

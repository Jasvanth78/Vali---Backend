const test = require('node:test');
const assert = require('node:assert/strict');
const { sendBrandedNotification } = require('../utils/brandedNotification');
test('uploaded icons use native rendering only on capable Android devices and preserve response order', async () => {
  const requests = [];
  const devices = [
    { token: 'modern', platform: 'android', customNotificationIcons: true },
    { token: 'legacy', platform: 'android' },
    { token: 'ios', platform: 'ios', customNotificationIcons: true },
  ];
  const payload = { notification: { title: 'Title', body: 'Body', imageUrl: 'https://example.com/poster.png' }, android: { notification: { icon: 'ic_notification' } }, data: { notificationId: 'abc', destination: 'poster_posts', parameters: '{}' } };
  const provider = { sendEachForMulticast: async message => {
    requests.push(message);
    return { responses: message.tokens.map(token => ({ success: token !== 'legacy', marker: token })) };
  } };
  const result = await sendBrandedNotification(provider, devices, payload, { imageUrl: '/uploads/notification-icons/test.png' });
  assert.deepEqual(requests[0].tokens, ['legacy', 'ios']);
  assert.equal(requests[0].notification.title, 'Title');
  assert.deepEqual(requests[1].tokens, ['modern']);
  assert.equal(requests[1].notification, undefined);
  assert.equal(requests[1].android.notification, undefined);
  assert.equal(requests[1].data.renderer, 'native-icon-v1');
  assert.equal(requests[1].data.imageUrl, 'https://example.com/poster.png');
  assert.deepEqual(result.responses.map(row => row.marker), ['modern', 'legacy', 'ios']);
  assert.equal(result.successCount, 2);
  assert.equal(result.failureCount, 1);
});

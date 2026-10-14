const test = require('node:test');
const assert = require('node:assert/strict');
const { validateBranding, notificationIcon, customIcon } = require('../utils/appBranding');
test('shortcut images allow uploaded URLs and reject inconsistent or invalid content', () => {
  for (const value of ['', 'https://example.com/icon.webp', '/uploads/icon.png']) validateBranding('launcher_shortcut_image', value, value);
  for (const value of ['javascript:alert(1)', 'data:image/png;base64,x', 'not a URL']) assert.throws(() => validateBranding('launcher_shortcut_image', value, value));
  assert.throws(() => validateBranding('launcher_shortcut_image', '', 'https://example.com/icon.png'));
});
test('bundled icon settings reject unsupported and inconsistent values', () => {
  for (const value of ['default', 'emerald', 'gold', 'blue', 'purple', 'red', 'pink', 'orange', 'teal', 'black', 'white']) validateBranding('launcher_icon', value, value);
  assert.throws(() => validateBranding('launcher_icon', 'default', 'uploaded.png'));
  assert.throws(() => validateBranding('notification_icon', 'ic_notification', 'ic_notification_star'));
  validateBranding('notification_icon', 'ic_notification_star', 'ic_notification_star');
});
test('custom icons accept only normalized upload paths and matching language values', () => {
  const value = JSON.stringify({ label: 'Custom bell', imageUrl: '/uploads/notification-icons/01234567-89ab-cdef-0123-456789abcdef.png' });
  validateBranding('notification_icon', value, value);
  assert.equal(customIcon(value).label, 'Custom bell');
  assert.equal(notificationIcon(value), 'ic_notification');
  assert.throws(() => validateBranding('notification_icon', '', value));
  for (const imageUrl of ['https://example.com/icon.png', '/uploads/notification-icons/../secret.png', 'data:image/png;base64,x']) {
    assert.throws(() => validateBranding('notification_icon', JSON.stringify({ label: 'Icon', imageUrl }), JSON.stringify({ label: 'Icon', imageUrl })));
  }
});
test('unknown notification resources fall back to the bundled original', () => {
  assert.equal(notificationIcon('ic_notification_compass'), 'ic_notification_compass');
  assert.equal(notificationIcon('/uploads/logo.png'), 'ic_notification');
  assert.equal(notificationIcon(undefined), 'ic_notification');
});

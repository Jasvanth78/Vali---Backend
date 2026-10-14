const test = require('node:test');
const assert = require('node:assert/strict');
const defaults = require('../config/calendarLeadersDefaults.json');
const { validateCalendarLeaders } = require('../utils/calendarLeaders');

test('leader defaults and edited image/date configurations validate', () => {
  assert.equal(validateCalendarLeaders(JSON.stringify(defaults)).length, 4);
  const edited = [{ ...defaults[0], imageUrl: 'https://example.com/leader.png', date: '1903-07-15', remembrance: true }];
  assert.deepEqual(validateCalendarLeaders(JSON.stringify(edited)), edited);
  assert.deepEqual(validateCalendarLeaders('[]'), []);
});
test('invalid leader dates, duplicate IDs and unsafe URLs are rejected', () => {
  for (const patch of [{ date: '2026-02-30' }, { date: 'invalid' }, { imageUrl: 'javascript:alert(1)' }, { sourceUrl: 'javascript:alert(1)' }, { enabled: 'true' }]) {
    assert.throws(() => validateCalendarLeaders(JSON.stringify([{ ...defaults[0], ...patch }])));
  }
  assert.throws(() => validateCalendarLeaders(JSON.stringify([defaults[0], defaults[0]])));
});

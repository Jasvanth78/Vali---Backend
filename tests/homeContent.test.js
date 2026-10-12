const test = require('node:test');
const assert = require('node:assert/strict');
const { coordinates, currentWeather, searchCities } = require('../utils/weather');
const { validateHomeContent } = require('../utils/homeContent');
test('weather validates coordinates before querying provider', () => {
  for (const pair of [[undefined, 2], ['', 2], ['bad', 2], [91, 2], [2, 181]]) assert.throws(() => coordinates(...pair));
  assert.deepEqual(coordinates('13', '80'), { latitude: 13, longitude: 80 });
});
test('weather uses selected coordinates and real provider response', async () => {
  const result = await currentWeather({ latitude: 13, longitude: 80 }, async url => {
    assert.equal(url.searchParams.get('latitude'), '13');
    return { ok: true, json: async () => ({ current: { temperature_2m: 28.1, weather_code: 3 }, current_units: { temperature_2m: '°C' } }) };
  });
  assert.equal(result.temperature_2m, 28.1);
  await assert.rejects(currentWeather({ latitude: 13, longitude: 80 }, async () => ({ ok: false })));
});
test('city search provides coordinates and display names', async () => {
  const result = await searchCities('City', async () => ({ ok: true, json: async () => ({ results: [{ name: 'City', country: 'India', latitude: 13, longitude: 80 }] }) }));
  assert.equal(result[0].label, 'City, India');
  await assert.rejects(searchCities('x'));
});
test('home layout preserves unique section order and visibility', () => {
  const sections = ['articles', 'hero', 'clock', 'services', 'holidays', 'proverb'].map(key => ({ key, enabled: key !== 'articles' }));
  assert.doesNotThrow(() => validateHomeContent('home_layout', JSON.stringify({ sections })));
  assert.throws(() => validateHomeContent('home_layout', JSON.stringify({ sections: [sections[0], ...sections.slice(0, 5)] })));
  assert.throws(() => validateHomeContent('home_weather_location', JSON.stringify({ latitude: 91, longitude: 80, label: 'City' })));
});

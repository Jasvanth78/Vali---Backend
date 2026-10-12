const { test } = require('node:test');
const assert = require('node:assert/strict');
const weather = require('../utils/weather');

test('WeatherAPI current weather normalizes Celsius and condition codes', async () => {
  process.env.WEATHER_PROVIDER = 'weatherapi';
  process.env.WEATHER_API_KEY = 'test-only-key';
  const data = await weather.currentWeather({ latitude: 11.34, longitude: 77.72 }, async url => {
    assert.equal(url.hostname, 'api.weatherapi.com');
    assert.equal(url.pathname, '/v1/current.json');
    assert.equal(url.searchParams.get('q'), '11.34,77.72');
    assert.equal(url.searchParams.get('key'), 'test-only-key');
    return { ok: true, json: async () => ({ current: { temp_c: 28.5, is_day: 0, condition: { code: 1000, text: 'Clear' }, last_updated: '2026-10-11 18:00' } }) };
  });
  assert.equal(data.temperature_2m, 28.5);
  assert.equal(data.weather_code, 0);
  assert.equal(data.unit, '°C');
  assert.equal(data.is_day, 0);
  assert.equal(data.provider, 'WeatherAPI.com');
  assert.equal(JSON.stringify(data).includes('test-only-key'), false);
});
test('WeatherAPI city search preserves existing district lookup format', async () => {
  const cities = await weather.searchCities('Erode', async url => {
    assert.equal(url.pathname, '/v1/search.json');
    return { ok: true, json: async () => [{ name: 'Erode', region: 'Tamil Nadu', country: 'India', lat: 11.34, lon: 77.72 }] };
  });
  assert.deepEqual(cities, [{ latitude: 11.34, longitude: 77.72, label: 'Erode, Tamil Nadu, India' }]);
});
test('provider errors never expose credentials or provider messages', async () => {
  await assert.rejects(weather.currentWeather({latitude: 11,longitude: 77}, async () => ({ok:false,json:async () => ({error:{code:2006,message:'test-only-key'}})})), {message: 'Weather API key is invalid.'});
});

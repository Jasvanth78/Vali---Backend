const fail = message => Object.assign(new Error(message), { status: 400 });
const forecastCache = new Map();
const cityCache = new Map();
function useWeatherApi() { return process.env.WEATHER_PROVIDER === 'weatherapi'; }
async function weatherApi(path, params, request) {
  if (!process.env.WEATHER_API_KEY) throw new Error('Weather API key is not configured.');
  const url = new URL(`/v1/${path}.json`, 'https://api.weatherapi.com');
  url.search = new URLSearchParams({ key: process.env.WEATHER_API_KEY, ...params });
  const response = await request(url, { signal: AbortSignal.timeout(20000) });
  const data = await response.json();
  if (!response.ok || data.error) {
    // Do not forward provider response or request URLs containing credentials.
    throw new Error(data.error?.code === 2006 ? 'Weather API key is invalid.' : 'Weather provider is unavailable.');
  }
  return data;
}
function conditionCode(code) {
  if (code === 1000) return 0;
  if (code === 1003) return 2;
  if ([1006,1009].includes(code)) return 3;
  if ([1030,1135,1147].includes(code)) return 45;
  if ([1087,1273,1276,1279,1282].includes(code)) return 95;
  if ([1066,1069,1072,1114,1117,1204,1207,1210,1213,1216,1219,1222,1225,1237,1249,1252,1255,1258,1261,1264].includes(code)) return 71;
  if ([1150,1153,1168,1171].includes(code)) return 51;
  return 61;
}
function coordinates(latitude, longitude) {
  if (latitude == null || longitude == null || String(latitude).trim() === '' || String(longitude).trim() === '') throw fail('Select a weather city first.');
  const lat = Number(latitude), lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw fail('Invalid weather coordinates.');
  return { latitude: lat, longitude: lon };
}
async function currentWeather(query, request = fetch) {
  const point = coordinates(query.latitude, query.longitude);
  if (useWeatherApi()) {
    const cacheKey = `${point.latitude},${point.longitude}`;
    const saved = forecastCache.get(cacheKey);
    if (request === fetch && saved?.expires > Date.now()) return saved.data;
    const data = await weatherApi('current', { q: cacheKey, aqi: 'no' }, request);
    if (typeof data.current?.temp_c !== 'number' || typeof data.current?.condition?.code !== 'number') throw new Error('Weather provider returned incomplete data.');
    const current = data.current;
    const result = { temperature_2m: current.temp_c, weather_code: conditionCode(current.condition.code), is_day: current.is_day, unit: '°C', condition: current.condition.text, provider: 'WeatherAPI.com', time: current.last_updated };
    if (request === fetch) forecastCache.set(cacheKey, { data: result, expires: Date.now() + 15 * 60 * 1000 });
    return result;
  }
  const url = new URL('/v1/forecast', process.env.WEATHER_API_BASE_URL || 'https://api.open-meteo.com');
  url.search = new URLSearchParams({ ...point, current: 'temperature_2m,weather_code,is_day', timezone: 'auto' });
  if (process.env.WEATHER_API_KEY) url.searchParams.set('apikey', process.env.WEATHER_API_KEY);
  const response = await request(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('Weather provider is unavailable.');
  const data = await response.json();
  if (typeof data.current?.temperature_2m !== 'number' || typeof data.current?.weather_code !== 'number') throw new Error('Weather provider returned incomplete data.');
  return { ...data.current, unit: data.current_units?.temperature_2m || '°C' };
}
async function searchCities(name, request = fetch) {
  if (typeof name !== 'string' || name.trim().length < 2 || name.length > 100) throw fail('Enter at least two characters for a city.');
  if (useWeatherApi()) {
    const cacheKey = name.trim().toLowerCase();
    const saved = cityCache.get(cacheKey);
    if (request === fetch && saved?.expires > Date.now()) return saved.data;
    const data = await weatherApi('search', { q: name.trim() }, request);
    if (!Array.isArray(data)) throw new Error('City search is unavailable.');
    const cities = data.map(city => ({ latitude: city.lat, longitude: city.lon, label: [city.name, city.region, city.country].filter(Boolean).join(', ') }));
    if (request === fetch) cityCache.set(cacheKey, { data: cities, expires: Date.now() + 24 * 60 * 60 * 1000 });
    return cities;
  }
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.search = new URLSearchParams({ name: name.trim(), count: '8', language: 'en', format: 'json' });
  const response = await request(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('City search is unavailable.');
  const data = await response.json();
  return (data.results || []).map(city => ({ latitude: city.latitude, longitude: city.longitude, label: [city.name, city.admin1, city.country].filter(Boolean).join(', ') }));
}
module.exports = { coordinates, currentWeather, searchCities };

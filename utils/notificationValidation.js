const crypto = require('node:crypto');
class NotificationError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = message => { throw new NotificationError(400, message); };
const key = value => typeof value === 'string' && /^[a-z][a-z0-9_-]{1,79}$/.test(value) ? value : fail('Use a unique lowercase key (2–80 letters, numbers, underscores or hyphens)');
const text = (value, max, required = true) => {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(`Text is required and must be at most ${max} characters`);
  return value.trim().replace(/<[^>]*>/g, '');
};
const image = value => { if (!value) return ''; if (typeof value !== 'string' || value.length > 4000 || !/^(https:\/\/|\/uploads\/)/.test(value)) fail('Image must be an HTTPS URL or uploaded image path'); return value; };
const destinations = ['home', 'rasi_palan', 'panchangam', 'calendar', 'festivals', 'poster_posts', 'articles', 'videos'];
const triggers = ['manual', 'scheduled', 'rasi_published', 'article_published', 'event_created', 'poster_published', 'panchangam_updated', 'festival_updated', 'video_published'];
const variables = ['rasi', 'type', 'date', 'article_title', 'event_title', 'festival_name', 'poster_caption', 'video_title', 'user_name'];
function destination(value, params = {}) {
  if (!destinations.includes(value)) fail('Unsupported destination screen');
  if (!params || typeof params !== 'object' || Array.isArray(params)) fail('Destination parameters must be an object');
  if (Object.keys(params).some(k => !['id', 'articleId', 'posterId', 'videoId', 'date', 'rasi'].includes(k))) fail('Unsupported destination parameter');
  const safe = {};
  for (const [k, v] of Object.entries(params)) safe[k] = text(v, 100);
  return { destination: value, parameters: safe };
}
function audience(value) {
  if (!value || !['all', 'android', 'ios', 'selected', 'rasi', 'segment', 'topic', 'test'].includes(value.kind)) fail('Unsupported audience');
  const result = { kind: value.kind };
  if (['selected', 'test'].includes(value.kind)) {
    if (!Array.isArray(value.userIds) || !value.userIds.length || value.userIds.length > 1000 || value.userIds.some(id => !/^[a-f\d]{24}$/i.test(id))) fail('Select registered recipients');
    result.userIds = [...new Set(value.userIds)];
    if (value.kind === 'test' && result.userIds.length > 5) fail('Test sends are limited to five selected recipients');
  }
  if (value.kind === 'rasi') result.rasi = text(value.rasi, 50);
  if (value.kind === 'segment') result.segmentId = text(value.segmentId, 50);
  if (value.kind === 'topic') { if (!/^[a-zA-Z0-9_-]{1,80}$/.test(value.topic || '')) fail('Invalid topic'); result.topic = value.topic; }
  return result;
}
function render(template, values = {}) {
  return template.replace(/\{([a-z][a-z0-9_]*)\}/g, (_, name) => {
    if (!variables.includes(name)) fail(`Unsupported template variable: ${name}`);
    if (values[name] == null) fail(`Missing template variable: ${name}`);
    return text(String(values[name]), 500, false);
  });
}
function validateTemplate(value) {
  for (const match of value.matchAll(/\{([^{}]+)\}/g)) if (!variables.includes(match[1])) fail(`Unsupported template variable: ${match[1]}`);
  return value;
}
function localParts(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  return Object.fromEntries(parts.filter(p => ['year', 'month', 'day', 'hour', 'minute'].includes(p.type)).map(p => [p.type, +p.value]));
}
function zonedDate(parts, timezone) {
  const expected = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  let utc = expected;
  for (let i = 0; i < 4; i++) { const p = localParts(new Date(utc), timezone); utc += expected - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute); }
  const actual = localParts(new Date(utc), timezone);
  // Nonexistent local times at DST transitions are skipped, never shifted silently.
  return actual.hour === parts.hour && actual.minute === parts.minute && actual.day === parts.day ? new Date(utc) : null;
}
function schedule(value, now = new Date()) {
  if (!value || !['once', 'daily', 'weekly', 'monthly'].includes(value.repeat)) fail('Choose one-time, daily, weekly or monthly recurrence');
  const timezone = text(value.timezone || 'Asia/Kolkata', 80);
  try { localParts(now, timezone); } catch (_) { fail('Invalid IANA time zone'); }
  let at = new Date(value.at);
  if (value.localAt) {
    const match = String(value.localAt).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if (!match) fail('Invalid local schedule time');
    at = zonedDate({ year: +match[1], month: +match[2], day: +match[3], hour: +match[4], minute: +match[5] }, timezone);
    if (!at) fail('This local time does not exist in the selected time zone');
  }
  if (!Number.isFinite(at.getTime()) || at <= now) fail('Schedule must be in the future');
  return { repeat: value.repeat, timezone, at: at.toISOString() };
}
function nextRun(value, after) {
  const initial = new Date(value.at);
  if (initial > after) return initial;
  if (value.repeat === 'once') return null;
  const base = localParts(initial, value.timezone), current = localParts(after, value.timezone);
  const weekday = new Date(Date.UTC(base.year, base.month - 1, base.day)).getUTCDay();
  for (let offset = 0; offset <= 370; offset++) {
    const day = new Date(Date.UTC(current.year, current.month - 1, current.day + offset));
    if (value.repeat === 'weekly' && day.getUTCDay() !== weekday) continue;
    if (value.repeat === 'monthly' && day.getUTCDate() !== base.day) continue;
    const candidate = zonedDate({ year: day.getUTCFullYear(), month: day.getUTCMonth() + 1, day: day.getUTCDate(), hour: base.hour, minute: base.minute }, value.timezone);
    if (candidate && candidate > after) return candidate;
  }
  return null;
}
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
module.exports = { NotificationError, fail, key, text, image, destination, audience, render, validateTemplate, schedule, nextRun, localParts, zonedDate, digest, destinations, triggers, variables };

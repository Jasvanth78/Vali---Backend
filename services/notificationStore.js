const { MongoClient } = require('mongodb');
const v = require('../utils/notificationValidation');
let pending;
async function database() {
  if (!pending) { const client = new MongoClient(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 10000 }); pending = client.connect().then(() => client.db()).catch(error => { pending = null; throw error; }); }
  return pending;
}
const collections = ['settings', 'categories', 'definitions', 'rules', 'templates', 'campaigns', 'logs', 'attempts', 'devices', 'preferences', 'segments'];
async function migrate(db, now = new Date()) {
  const c = name => db.collection(`notification_${name}`);
  for (const name of ['settings', 'categories', 'definitions']) await c(name).createIndex({ key: 1 }, { unique: true });
  await c('logs').createIndex({ idempotencyKey: 1 }, { unique: true });
  await c('campaigns').createIndex({ requestId: 1 }, { unique: true });
  await c('rules').createIndex({ key: 1 }, { unique: true, sparse: true });
  await c('logs').createIndex({ createdAt: -1, categoryKey: 1 });
  await c('attempts').createIndex({ runId: 1, tokenHash: 1 }, { unique: true });
  await c('devices').createIndex({ deviceId: 1 }, { unique: true });
  await c('devices').createIndex({ token: 1 }, { unique: true });
  await c('preferences').createIndex({ deviceId: 1, categoryKey: 1 }, { unique: true });
  for (const name of ['campaigns', 'rules']) await c(name).createIndex({ nextRun: 1, isEnabled: 1 });
  await c('settings').updateOne({ key: 'global' }, { $setOnInsert: { key: 'global', isEnabled: true, createdAt: now, updatedAt: now } }, { upsert: true });
  const categories = [['rasi', 'Daily Rasi Palan', 'Horoscope updates and reminders'], ['panchangam', 'Panchangam', 'Daily almanac updates'], ['festivals', 'Festivals', 'Festival reminders'], ['poster_posts', 'Poster Posts', 'Tamil greeting poster updates'], ['articles', 'Articles', 'New article notifications'], ['videos', 'Videos', 'Video updates'], ['important_days', 'Important Days', 'Configured special-day reminders'], ['announcements', 'Announcements', 'General announcements and events']];
  for (const [key, name, description] of categories) await c('categories').updateOne({ key }, { $setOnInsert: { key, name, description, isEnabled: true, createdAt: now, updatedAt: now } }, { upsert: true });
  const definitions = [
    ['morning_rasi', 'rasi', 'Morning Rasi Palan', 'scheduled', 'இன்றைய ராசி பலன் 🌅', 'உங்கள் ராசிக்கான இன்றைய சுப பலன்களைப் பார்க்க உடனே கிளிக் செய்யுங்கள்!', 'rasi_palan'],
    ['rasi_published', 'rasi', 'Rasi Palan Published', 'rasi_published', 'தினசரி ராசி பலன் 🌅', 'உங்கள் {rasi} ராசிக்கான பலன்கள் வெளியிடப்பட்டுள்ளன!', 'rasi_palan'],
    ['article_published', 'articles', 'New Article Published', 'article_published', 'புதிய ஆன்மீக பதிவு 📖', 'புதிய பதிவு: "{article_title}". படிக்க கிளிக் செய்யுங்கள்!', 'articles'],
    ['event_created', 'announcements', 'New Spiritual Event', 'event_created', 'வரவிருக்கும் ஆன்மீக நிகழ்வு 📅', 'நிகழ்வு: "{event_title}". மேலும் விவரங்களைப் பார்க்கவும்!', 'home'],
    ['general', 'announcements', 'General Announcement', 'manual', 'வணக்கம்!', 'Valikati செயலியில் புதிய தகவல்களைப் பார்க்கவும்.', 'home'],
  ];
  for (const [key, categoryKey, name, trigger, title, message, destination] of definitions) {
    await c('definitions').updateOne({ key }, { $setOnInsert: { key, categoryKey, name, description: name, trigger, title, message, imageUrl: '', destination, parameters: {}, audience: { kind: 'all' }, isEnabled: true, createdAt: now, updatedAt: now } }, { upsert: true });
    if (trigger !== 'manual') {
      const initial = v.zonedDate({ ...v.localParts(now, 'Asia/Kolkata'), hour: 7, minute: 0 }, 'Asia/Kolkata');
      const schedule = trigger === 'scheduled' ? { at: initial.toISOString(), repeat: 'daily', timezone: 'Asia/Kolkata' } : null;
      await c('rules').updateOne({ key: `legacy_${key}` }, { $setOnInsert: { key: `legacy_${key}`, name, definitionKey: key, trigger, schedule, nextRun: schedule ? v.nextRun(schedule, now) : null, isEnabled: true, audience: { kind: 'all' }, createdAt: now, updatedAt: now } }, { upsert: true });
    }
  }
  return { categories: await c('categories').countDocuments(), definitions: await c('definitions').countDocuments(), rules: await c('rules').countDocuments() };
}
module.exports = { database, migrate, collections };

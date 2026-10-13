require('dotenv').config({ quiet: true });
const { MongoClient } = require('mongodb');
const registry = require('../config/adRegistry.json');
async function migrate(db) {
  const placements = db.collection('ad_placements'), settings = db.collection('ad_settings');
  await placements.createIndex({ pageKey: 1, placementKey: 1 }, { unique: true });
  await settings.createIndex({ key: 1 }, { unique: true });
  const legacy = Object.fromEntries((await db.collection('AppContent').find({ key: { $in: ['admob_enabled', 'admob_banner_unit_id', 'admob_interstitial_unit_id', 'admob_rewarded_unit_id'] } }).toArray()).map(row => [row.key, row.en]));
  const enabled = legacy.admob_enabled?.toLowerCase() === 'true';
  const now = new Date();
  const result = await settings.updateOne({ key: 'global' }, { $setOnInsert: { key: 'global', globalEnabled: enabled, pages: Object.fromEntries(registry.pages.map(page => [page.key, true])), legacyImported: false, createdAt: now, updatedAt: now } }, { upsert: true });
  // Migration-only metadata is ignored by the ORM. Mark complete only after all
  // legacy rows succeed, so an interrupted import resumes safely on the next run.
  const state = await settings.findOne({ key: 'global' });
  if (state.legacyImported !== true) {
    const valid = /^ca-app-pub-\d{16}\/\d{10}$/;
    for (const [pageKey, placementKey, adFormat, fallback] of [
      ['home', 'inline_banner', 'banner', 'ca-app-pub-7492528543078775/9036834997'],
      ['articles', 'between_cards', 'banner', 'ca-app-pub-7492528543078775/9036834997'],
      ['articles', 'article_swipe', 'interstitial', 'ca-app-pub-7492528543078775/9527789584'],
      ['articles', 'audio_unlock', 'rewarded', 'ca-app-pub-7492528543078775/4636274187'],
    ]) {
      const id = legacy[`admob_${adFormat}_unit_id`] || fallback;
      await placements.updateOne({ pageKey, placementKey }, { $setOnInsert: { pageKey, placementKey, adFormat, androidAdUnitId: valid.test(id) ? id : '', iosAdUnitId: valid.test(id) ? id : '', isEnabled: valid.test(id), sortOrder: 0, frequencyCap: 120, createdAt: now, updatedAt: now } }, { upsert: true });
    }
    await settings.updateOne({ key: 'global' }, { $set: { legacyImported: true } });
  }
  return { firstMigration: !!result.upsertedCount, placementCount: await placements.countDocuments(), pageCount: registry.pages.length };
}
if (require.main === module) {
  const client = new MongoClient(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 15000 });
  client.connect().then(() => migrate(client.db())).then(result => console.log(JSON.stringify(result))).finally(() => client.close()).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { migrate };

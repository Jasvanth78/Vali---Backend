// MongoDB additive migration: creates only new poster collections/indexes.
require('dotenv').config({ quiet: true });
const { MongoClient } = require('mongodb');
const { createPosterService } = require('../services/posterService');
async function main() {
  const client = new MongoClient(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    const db = client.db();
    await createPosterService(async () => db).ensureSchema();
    const names = ['poster_posts', 'poster_categories', 'poster_likes', 'poster_bookmarks'];
    for (const name of names) console.log(`${name}: ${(await db.collection(name).indexes()).length} indexes`);
    console.log('Poster migration complete. Existing collections were not changed.');
  } finally { await client.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

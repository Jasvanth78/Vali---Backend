const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');
dotenv.config();

async function main() {
  const client = new MongoClient(process.env.DATABASE_URL);
  try {
    await client.connect();
    console.log('Connected successfully to MongoDB');
    const db = client.db();
    const collections = await db.listCollections().toArray();
    console.log('Collections:', collections.map(c => c.name));
  } catch (err) {
    console.error('Connection failed:', err);
  } finally {
    await client.close();
  }
}

main();

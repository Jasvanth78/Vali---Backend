require('dotenv').config({ quiet: true });
const { MongoClient } = require('mongodb');
const { migrate } = require('../services/notificationStore');
const client = new MongoClient(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 15000 });
client.connect().then(() => migrate(client.db())).then(value => console.log(JSON.stringify(value))).finally(() => client.close()).catch(error => { console.error(error.message); process.exitCode = 1; });

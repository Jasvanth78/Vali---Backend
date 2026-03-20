const admin = require('firebase-admin');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './firebase-service-account.json';
let serviceAccount;

try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    console.log('Firebase: Using credentials from environment variable.');
  } else {
    serviceAccount = require(path.resolve(__dirname, '..', serviceAccountPath));
    console.log('Firebase: Using credentials from local JSON file.');
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('Firebase Admin SDK initialized successfully.');
} catch (error) {
  console.error('Firebase Initialization Warning:', error.message);
  console.log('Server will continue without Firebase Admin SDK functionality.');
}

module.exports = admin;

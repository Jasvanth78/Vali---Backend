const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config();

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './firebase-service-account.json';
let serviceAccount;

try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    let rawEnv = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
    if (!rawEnv.startsWith('{')) {
      try {
        const decoded = Buffer.from(rawEnv, 'base64').toString('utf8');
        if (decoded.trim().startsWith('{')) {
          rawEnv = decoded.trim();
        }
      } catch (_) {}
    }
    try {
      serviceAccount = JSON.parse(rawEnv);
      if (typeof serviceAccount === 'string') {
        serviceAccount = JSON.parse(serviceAccount);
      }
    } catch (jsonErr) {
      console.error('Firebase: Failed to parse FIREBASE_SERVICE_ACCOUNT JSON:', jsonErr.message);
    }
    if (serviceAccount && serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
    console.log('Firebase: Using credentials from FIREBASE_SERVICE_ACCOUNT environment variable.');
  }

  if (!serviceAccount) {
    const resolvedPath = path.isAbsolute(serviceAccountPath)
      ? serviceAccountPath
      : path.resolve(__dirname, '..', serviceAccountPath);

    if (fs.existsSync(resolvedPath)) {
      const fileData = fs.readFileSync(resolvedPath, 'utf8');
      serviceAccount = JSON.parse(fileData);
      if (serviceAccount && serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      }
      console.log(`Firebase: Using credentials from local JSON file at ${resolvedPath}`);
    } else {
      console.warn(`Firebase Warning: Service account file not found at ${resolvedPath}`);
    }
  }

  if (serviceAccount && (!admin.apps || admin.apps.length === 0)) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('Firebase Admin SDK initialized successfully.');
  } else if (!serviceAccount) {
    console.warn('Firebase Admin SDK NOT initialized: No valid service account provided in env or JSON file.');
  }
} catch (error) {
  console.error('Firebase Initialization Warning:', error.message);
  console.log('Server will continue without Firebase Admin SDK functionality.');
}

module.exports = admin;



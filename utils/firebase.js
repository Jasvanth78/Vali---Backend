const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config();

function tryParseServiceAccount(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') return null;
  let str = rawInput.trim();
  if (str.length === 0) return null;

  // 1. Strip outer wrapping quotes if present
  if ((str.startsWith("'") && str.endsWith("'")) || (str.startsWith('"') && str.endsWith('"'))) {
    str = str.slice(1, -1).trim();
  }

  // 2. Try Base64 decoding if string does not start with '{'
  if (!str.startsWith('{')) {
    try {
      const decoded = Buffer.from(str, 'base64').toString('utf8').trim();
      if (decoded.startsWith('{')) {
        str = decoded;
      }
    } catch (_) {}
  }

  // 3. Strip outer wrapping quotes again after base64 decode if needed
  if ((str.startsWith("'") && str.endsWith("'")) || (str.startsWith('"') && str.endsWith('"'))) {
    str = str.slice(1, -1).trim();
  }

  // 4. If str starts with '{', attempt JSON parsing
  if (str.startsWith('{')) {
    try {
      let parsed = JSON.parse(str);
      if (typeof parsed === 'string') {
        parsed = JSON.parse(parsed);
      }
      if (parsed && typeof parsed === 'object' && (parsed.private_key || parsed.project_id || parsed.client_email)) {
        if (parsed.private_key) {
          parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
        }
        return parsed;
      }
    } catch (e) {
      // If parsing failed due to raw unescaped newlines in JSON string (e.g. pasted directly in env)
      try {
        const sanitized = str.replace(/\r?\n/g, '\\n');
        let parsed = JSON.parse(sanitized);
        if (typeof parsed === 'string') {
          parsed = JSON.parse(parsed);
        }
        if (parsed && typeof parsed === 'object' && (parsed.private_key || parsed.project_id || parsed.client_email)) {
          if (parsed.private_key) {
            parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
          }
          return parsed;
        }
      } catch (_) {}

      console.error('Firebase: Error parsing JSON credential string:', e.message);
    }
  }
  return null;
}

let serviceAccount = null;

try {
  // 1. Try FIREBASE_SERVICE_ACCOUNT environment variable
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = tryParseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT);
    if (serviceAccount) {
      console.log('Firebase: Using credentials from FIREBASE_SERVICE_ACCOUNT environment variable.');
    }
  }

  // 2. Try FIREBASE_SERVICE_ACCOUNT_PATH (in case JSON string was pasted directly into this variable)
  if (!serviceAccount && process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    serviceAccount = tryParseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
    if (serviceAccount) {
      console.log('Firebase: Detected JSON credential content directly inside FIREBASE_SERVICE_ACCOUNT_PATH.');
    }
  }

  // 3. Try individual environment variables (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)
  if (!serviceAccount && process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
    serviceAccount = {
      project_id: process.env.FIREBASE_PROJECT_ID,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: privateKey,
    };
    console.log('Firebase: Using credentials from individual environment variables (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, etc.).');
  }

  // 4. Fallback: Try loading from disk file path
  if (!serviceAccount) {
    const pathCandidate = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './firebase-service-account.json';
    if (!pathCandidate.startsWith('{')) {
      const resolvedPath = path.isAbsolute(pathCandidate)
        ? pathCandidate
        : path.resolve(__dirname, '..', pathCandidate);

      if (fs.existsSync(resolvedPath)) {
        try {
          const fileData = fs.readFileSync(resolvedPath, 'utf8');
          serviceAccount = tryParseServiceAccount(fileData);
          if (serviceAccount) {
            console.log(`Firebase: Using credentials from local JSON file at ${resolvedPath}`);
          }
        } catch (fileErr) {
          console.error(`Firebase: Error reading file at ${resolvedPath}:`, fileErr.message);
        }
      } else {
        console.warn(`Firebase Warning: Service account file not found at ${resolvedPath}`);
      }
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




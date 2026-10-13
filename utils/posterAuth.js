const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const { OAuth2Client } = require('google-auth-library');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const google = new OAuth2Client();
const audience = 'valikati-poster-posts';
const defaultGoogleClient = '914226705191-8c76duhrsl0s883d3ttl8k3qcnpeoq1i.apps.googleusercontent.com';

function sessionKey() {
  const key = process.env.POSTER_JWT_SECRET;
  if (!key || key.length < 32 || key === process.env.JWT_SECRET) throw Error('Configure a separate POSTER_JWT_SECRET with at least 32 characters');
  // Never let public poster credentials validate as existing admin JWTs.
  return key;
}

function verifySession(token, ignoreExpiration = false) {
  const decoded = jwt.verify(token, sessionKey(), { algorithms: ['HS256'], audience, ignoreExpiration });
  if (decoded.scope !== 'poster' || typeof decoded.sub !== 'string' || !/^(device|google):[a-zA-Z0-9_-]{8,100}$/.test(decoded.sub)) throw Error('Invalid poster session');
  return decoded;
}
async function issueSession(body) {
  let actorId, mergeFrom, identity = 'device';
  if (body.googleIdToken) {
    const audiences = (process.env.POSTER_GOOGLE_CLIENT_IDS || defaultGoogleClient).split(',').map(s => s.trim()).filter(Boolean);
    const ticket = await google.verifyIdToken({ idToken: body.googleIdToken, audience: audiences });
    const payload = ticket.getPayload();
    if (!payload?.sub) throw Error('Invalid Google identity');
    actorId = `google:${payload.sub}`; identity = 'account';
    if (body.sessionToken) { const previous = verifySession(body.sessionToken, true); if (previous.sub.startsWith('device:')) mergeFrom = previous.sub; }
  } else if (body.sessionToken) {
    const previous = verifySession(body.sessionToken, true);
    // Account sessions must be reverified with Google, not refreshed indefinitely.
    if (!previous.sub.startsWith('device:')) throw Error('Sign in again to refresh an account session');
    actorId = previous.sub;
  } else actorId = `device:${crypto.randomUUID()}`;
  const token = jwt.sign({ scope: 'poster', identity }, sessionKey(), { subject: actorId, audience, expiresIn: identity === 'account' ? '1h' : '30d', algorithm: 'HS256' });
  return { token, identity, actorId, mergeFrom };
}
function identityAuth(required = false) {
  return (req, res, next) => {
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) return required ? res.status(401).json({ error: 'A poster session is required' }) : next();
    try { req.posterActorId = verifySession(token).sub; next(); }
    catch (_) { res.status(401).json({ error: 'Poster session expired or invalid' }); }
  };
}
// Uses the existing admin JWT and Admin model, without its local bypass.
async function adminAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) return res.status(401).json({ error: 'Admin sign-in required' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (!decoded.id || decoded.scope || !await prisma.admin.findUnique({ where: { id: decoded.id } })) return res.status(403).json({ error: 'Admin access required' });
    req.adminId = decoded.id; next();
  } catch (_) { res.status(401).json({ error: 'Admin session expired or invalid' }); }
}
module.exports = { issueSession, identityAuth, adminAuth, verifySession };

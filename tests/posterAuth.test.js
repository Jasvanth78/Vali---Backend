require('dotenv').config({ quiet: true });
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { issueSession, verifySession } = require('../utils/posterAuth');
test('signed device identity persists across renewal and cannot become an admin/user token', async () => {
  const first = await issueSession({}), second = await issueSession({ sessionToken: first.token });
  assert.equal(verifySession(first.token).sub, verifySession(second.token).sub);
  assert.equal(first.identity, 'device');
  assert.throws(() => jwt.verify(first.token, process.env.JWT_SECRET), 'Poster tokens cannot authorize existing admin routes');
  assert.throws(() => verifySession(jwt.sign({ id: 'admin-id' }, process.env.JWT_SECRET)));
  assert.throws(() => verifySession(first.token.slice(0, -8) + 'forged'));
  await assert.rejects(issueSession({ sessionToken: 'invalid' }));
});

test('Google account sessions verify an allowed audience and migrate only owned device interactions', async () => {
  const { OAuth2Client } = require('google-auth-library');
  const original = OAuth2Client.prototype.verifyIdToken;
  OAuth2Client.prototype.verifyIdToken = async function(options) {
    assert.equal(options.idToken, 'google-proof');
    assert.ok(options.audience.includes('914226705191-8c76duhrsl0s883d3ttl8k3qcnpeoq1i.apps.googleusercontent.com'));
    return { getPayload: () => ({ sub: '12345678901234567890' }) };
  };
  try {
    const device = await issueSession({});
    const account = await issueSession({ googleIdToken: 'google-proof', sessionToken: device.token });
    assert.equal(account.identity, 'account'); assert.equal(account.mergeFrom, verifySession(device.token).sub);
    assert.equal(verifySession(account.token).sub, 'google:12345678901234567890');
    await assert.rejects(issueSession({ sessionToken: account.token }));
  } finally { OAuth2Client.prototype.verifyIdToken = original; }
});

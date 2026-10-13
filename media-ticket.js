'use strict';
const crypto = require('node:crypto');
// Ephemeral key: restarting the container invalidates outstanding tickets.
const key = crypto.randomBytes(32);
const lifetime = 5 * 60 * 1000;
const sign = payload => crypto.createHmac('sha256', key).update(payload).digest('base64url');
function issue(user) {
  const expiresAt = Date.now() + lifetime;
  const payload = Buffer.from(JSON.stringify({ uid: user.uid, expiresAt })).toString('base64url');
  return { ticket: payload + '.' + sign(payload), expiresAt };
}
function verify(ticket) {
  try {
    if (typeof ticket !== 'string' || ticket.length > 1024) return false;
    const [payload, signature, extra] = ticket.split('.');
    if (extra || !signature) return false;
    const actual = Buffer.from(signature), expected = Buffer.from(sign(payload));
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return false;
    const value = JSON.parse(Buffer.from(payload, 'base64url'));
    return typeof value.uid === 'string' && value.expiresAt > Date.now() && value.expiresAt <= Date.now() + lifetime;
  } catch { return false; }
}
module.exports = { issue, verify };

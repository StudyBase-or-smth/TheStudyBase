const test = require('node:test');
const assert = require('node:assert/strict');
const { handleApi } = require('../api');
const tickets = require('../media-ticket');
const { writable } = require('../access-policy');

test('media tickets expire, reject tampering, and are not Firebase credentials', () => {
  const originalNow = Date.now;
  const now = originalNow();
  const issued = tickets.issue({ uid: 'user' });
  assert.equal(tickets.verify(issued.ticket), true);
  assert.equal(tickets.verify(issued.ticket + 'x'), false);
  assert.equal(tickets.verify('firebase-token'), false);
  try { Date.now = () => now + 301000; assert.equal(tickets.verify(issued.ticket), false); }
  finally { Date.now = originalNow; }
});

test('avatar proxy cancels oversized streams and forbids automatic redirects', async () => {
  const originalFetch = global.fetch;
  let cancelled = false, reads = 0;
  global.fetch = async (url, options) => {
    assert.equal(options.redirect, 'error');
    return { ok: true, url, headers: new Headers({ 'content-type': 'image/png' }),
      body: (async function* () { try { while (true) { reads++; yield Buffer.alloc(128 * 1024); } } finally { cancelled = true; } })() };
  };
  const res = { setHeader() {}, writeHead(status) { this.status = status; }, end(body) { this.body = body; } };
  try {
    await handleApi({ method: 'GET', headers: {} }, res, new URL('https://server/api/avatar?u=https://lh3.googleusercontent.com/avatar'), { dataDir: require('node:os').tmpdir() });
    assert.equal(res.status, 413); assert.equal(reads, 4); assert.equal(cancelled, true);
  } finally { global.fetch = originalFetch; }
});

test('answer scores come from the server and old answers cannot be changed', () => {
  const user = { uid: 'player', role: 'student', name: 'Player' };
  const lobby = { code: 'ABCDEF', hostUid: 'host', passwordHash: '', status: 'playing', questionIndex: 0, questionStartedAt: Date.now() - 1000, questionSeconds: 20,
    game: { questions: [{ answers: [{ correct: true }, { correct: false }] }] }, players: [{ uid: 'player', score: 0, answers: {} }] };
  const next = structuredClone(lobby);
  next.players[0].score = 99999;
  next.players[0].answers[0] = { choice: 1, correct: true, score: 99999, ms: 0 };
  const saved = writable('_kc_lobby_ABCDEF', next, lobby, user, () => null);
  assert.equal(saved.players[0].score, 0); assert.equal(saved.players[0].answers[0].correct, false);
  const forged = structuredClone(saved); forged.players[0].answers[0].choice = 0;
  assert.throws(() => writable('_kc_lobby_ABCDEF', forged, saved, user, () => null));
});

test('Firebase transitive consumers can use patched CommonJS uuid v4', () => {
  for (const name of ['gaxios', 'google-gax', 'teeny-request']) {
    const { createRequire } = require('node:module');
    const dependencyRequire = createRequire(require.resolve(name));
    assert.match(dependencyRequire('uuid').v4(), /^[a-f0-9-]{36}$/);
    assert.doesNotThrow(() => require(name));
  }
  assert.equal(typeof require('firebase-admin').auth, 'function');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const root = path.resolve(__dirname, '..');

async function start(t, extraEnv = {}) {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'studybase-container-'));
  const website = fs.mkdtempSync(path.join(os.tmpdir(), 'studybase-website-'));
  fs.writeFileSync(path.join(website, 'index.html'), 'static fixture');
  fs.writeFileSync(path.join(website, 'secrets.json'), 'private fixture');
  fs.writeFileSync(path.join(data, 'website.json'), JSON.stringify({ websiteDir: website }));
  fs.writeFileSync(path.join(data, 'secrets.json'), JSON.stringify({ DESMOS_API_KEY: 'file-key', GEMINI_API_KEY: 'fallback-key' }));
  const env = { ...process.env, PORT: '0', STUDYBASE_DATA_DIR: data,
    STUDYBASE_PUBLIC_URL: 'https://public.example:10000', DESMOS_API_KEY: 'env-key', ...extraEnv };
  delete env.STUDYBASE_WEBSITE_DIR;
  delete env.GEMINI_API_KEY;
  delete env.STUDYBASE_ALLOWED_ORIGINS;
  if (extraEnv.STUDYBASE_ALLOWED_ORIGINS !== undefined) env.STUDYBASE_ALLOWED_ORIGINS = extraEnv.STUDYBASE_ALLOWED_ORIGINS;
  if (extraEnv.static) env.STUDYBASE_WEBSITE_DIR = website;
  delete env.static;
  // IPC emits the signal event on Windows too, where kill(SIGTERM) bypasses handlers.
  const bootstrap = `
    const Module = require('node:module');
    const original = Module._load;
    const accounts = {
      student: { uid: 'testuser', role: 'student', status: 'active' },
      other: { uid: 'otheruser', role: 'student', status: 'active' },
      teacher: { uid: 'teacher', role: 'teacher', status: 'active' },
      dev: { uid: 'developer', role: 'dev', status: 'active' },
      pending: { uid: 'pending', role: 'student', status: 'pending' },
      disabled: { uid: 'disabled', role: 'student', status: 'active', disabled: true }
    };
    Module._load = function(name, ...args) {
      if (name === 'firebase-admin') return { apps: [true], auth: () => ({
        verifyIdToken: async (token, revoked) => {
          if (!revoked || !accounts[token]) throw Error('Invalid token');
          return { uid: accounts[token].uid, status: 'active', role: 'dev' };
        },
        getUser: async uid => {
          const account = Object.values(accounts).find(a => a.uid === uid);
          return { uid, customClaims: account, disabled: account.disabled, displayName: uid };
        }
      }) };
      return original.call(this, name, ...args);
    };
    process.on('message', () => process.emit('SIGTERM'));
    require('./server.js');
  `;
  const child = spawn(process.execPath, ['-e', bootstrap], {
    cwd: root, env, stdio: ['pipe', 'pipe', 'pipe', 'ipc']
  });
  let logs = '';
  child.stderr.on('data', chunk => { logs += chunk; });
  let resolvePort;
  const ready = new Promise(resolve => { resolvePort = resolve; });
  child.stdout.on('data', chunk => {
    logs += chunk;
    const match = logs.match(/listening on 0\.0\.0\.0:(\d+)/);
    if (match) resolvePort(Number(match[1]));
  });
  t.after(async () => {
    if (child.exitCode === null) {
      const stopped = once(child, 'exit'); child.kill(); await stopped;
    }
    fs.rmSync(data, { recursive: true, force: true });
    fs.rmSync(website, { recursive: true, force: true });
  });
  const port = await Promise.race([ready, new Promise((_, reject) => {
    const timer = setTimeout(() => reject(Error('Server did not start: ' + logs)), 5000);
    timer.unref();
    ready.then(() => clearTimeout(timer));
    child.once('error', reject);
  })]);
  return { child, data, logs: () => logs, request: (url, opts = {}, token = 'student') => fetch('http://127.0.0.1:' + port + url, { ...opts, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...opts.headers } }) };
}

test('API-only server removes management pages, honors env secrets and shuts down cleanly', async t => {
  const c = await start(t);
  const health = await c.request('/health');
  assert.equal(await health.text(), '{"ok":true}');
  const defaultOrigin = 'https://thestudybase-server.tail8c20e2.ts.net:8443';
  assert.equal((await c.request('/health', { headers: { Origin: defaultOrigin } })).headers.get('access-control-allow-origin'), defaultOrigin);
  for (const endpoint of ['/', '/_status', '/_website-config', '/_website-pick', '/secrets.json', '/website.json']) {
    assert.equal((await c.request(endpoint)).status, 404, endpoint);
  }
  for (const endpoint of ['/_website-config', '/_website-pick']) {
    assert.equal((await c.request(endpoint, { method: 'POST', body: JSON.stringify({ websiteDir: c.data }) })).status, 404);
  }
  assert.deepEqual(await (await c.request('/api/desmosKey')).json(), { apiKey: 'env-key' });
  assert.equal((await c.request('/sync')).status, 400);
  assert.ok(!c.logs().includes('env-key') && !c.logs().includes('file-key'));
  const exit = once(c.child, 'exit'); c.child.send('SIGTERM');
  assert.deepEqual(await exit, [0, null]);
  assert.ok(c.logs().includes('shutting down: SIGTERM'));
});

test('allowlist handles actual requests and preflight across sync and API', async t => {
  const c = await start(t, { STUDYBASE_ALLOWED_ORIGINS: 'https://one.example, https://two.example' });
  for (const endpoint of ['/sync?key=studybase_events', '/api/desmosKey']) {
    const allowed = await c.request(endpoint, { headers: { Origin: 'https://two.example' } });
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://two.example');
    const denied = await c.request(endpoint, { headers: { Origin: 'https://evil.example' } });
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get('access-control-allow-origin'), null);
    const options = await c.request(endpoint, { method: 'OPTIONS', headers: {
      Origin: 'https://one.example', 'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type, authorization, x-studybase-store'
    } });
    assert.equal(options.status, 204);
    assert.equal(await options.text(), '');
    assert.equal(options.headers.get('access-control-allow-origin'), 'https://one.example');
    assert.ok(options.headers.get('vary').includes('Origin'));
    assert.equal((await c.request(endpoint, { method: 'OPTIONS', headers: { Origin: 'https://one.example', 'Access-Control-Request-Method': 'DELETE' } })).status, 403);
    assert.equal((await c.request(endpoint, { method: 'OPTIONS', headers: { Origin: 'https://one.example', 'Access-Control-Request-Headers': 'x-unapproved' } })).status, 403);
  }
});

test('sync formats and generated file/photo URLs are preserved behind a proxy', async t => {
  const c = await start(t);
  async function post(key, value) {
    const result = await c.request('/sync', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Forwarded-Host': 'attacker.example' }, body: new URLSearchParams({ key, data: JSON.stringify(value) }) });
    assert.equal(result.status, 200);
    assert.equal(await result.text(), 'ok');
  }
  await post('studybase_events', [{ id: 1 }]);
  assert.deepEqual(await (await c.request('/sync?key=studybase_events')).json(), { data: [{ id: 1 }] });
  assert.equal((await c.request('/sync?key=studybase_events&callback=cb')).status, 400);
  await post('_up_test', { image: 'data:image/png;base64,aGVsbG8=', filename: 'image.png' });
  const upload = (await (await c.request('/sync?key=_ur_test')).json()).data;
  assert.equal(upload.ok, true);
  assert.ok(upload.url.startsWith('https://public.example:10000/files/'));
  assert.equal((await c.request(new URL(upload.url).pathname)).status, 200);
  await post('_up_avatar_testuser', { image: 'data:image/png;base64,aGVsbG8=' });
  const avatar = (await (await c.request('/sync?key=_ur_avatar_testuser')).json()).data;
  assert.deepEqual(avatar, { ok: true, url: 'https://public.example:10000/users/testuser/photo' });
});

test('static serving requires explicit env and blocks secrets even when enabled', async t => {
  const c = await start(t, { static: true });
  assert.equal(await (await c.request('/')).text(), 'static fixture');
  for (const endpoint of ['/secrets.json', '/.env', '/_status', '/_website-config']) assert.equal((await c.request(endpoint)).status, 404);
});

test('environment secrets override file values and missing values fall back', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'studybase-secrets-'));
  const previous = process.env.FIREBASE_PRIVATE_KEY;
  const previousGemini = process.env.GEMINI_API_KEY;
  try {
    process.env.FIREBASE_PRIVATE_KEY = 'environment\\nkey';
    delete process.env.GEMINI_API_KEY;
    fs.writeFileSync(path.join(data, 'secrets.json'), JSON.stringify({ FIREBASE_PRIVATE_KEY: 'file-key', GEMINI_API_KEY: 'fallback-key' }));
    const secrets = require('../api').loadSecrets(data);
    assert.equal(secrets.FIREBASE_PRIVATE_KEY, 'environment\nkey');
    assert.equal(secrets.GEMINI_API_KEY, 'fallback-key');
  } finally {
    if (previous === undefined) delete process.env.FIREBASE_PRIVATE_KEY; else process.env.FIREBASE_PRIVATE_KEY = previous;
    if (previousGemini === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previousGemini;
    fs.rmSync(data, { recursive: true, force: true });
  }
});

test('sync and media require current approved identities and enforce ownership', async t => {
  const c = await start(t);
  const post = (key, value, token = 'student') => c.request('/sync', { method: 'POST', body: new URLSearchParams({ key, data: JSON.stringify(value) }) }, token);
  for (const route of ['/sync?key=studybase_events', '/?key=studybase_events', '/files/test.png', '/users/testuser/photo']) {
    assert.equal((await c.request(route, {}, null)).status, 401, route);
    assert.equal((await c.request(route, {}, 'invalid')).status, 401, route);
    assert.equal((await c.request(route, {}, 'pending')).status, 403, route);
    assert.equal((await c.request(route, {}, 'disabled')).status, 401, route);
  }
  assert.equal((await post('_profile_testuser', { name: 'Owner' })).status, 200);
  assert.equal((await c.request('/sync?key=_profile_testuser', {}, 'other')).status, 403);
  assert.equal((await post('_profile_testuser', {}, 'other')).status, 403);
  assert.equal((await post('_profile_..', {})).status, 403);
  assert.equal(fs.existsSync(path.join(c.data, 'profile.json')), false);
  assert.equal((await post('_analyser_testuser', [])).status, 200);
  assert.equal((await c.request('/sync?key=_analyser_testuser', {}, 'other')).status, 403);
  assert.equal((await post('_kc_games_testuser', { games: [] })).status, 200);
  assert.equal((await post('_kc_games_testuser', {}, 'other')).status, 403);
  assert.equal((await post('unknown_private_key', {})).status, 403);
  assert.equal((await post('2026-12A-mth_topics', [])).status, 403);
  assert.equal((await post('2026-12A-mth_topics', [], 'teacher')).status, 200);
  assert.equal((await post('eng2_topics', [{ id: 1, bodyText: 'Student note' }])).status, 200);
  assert.equal((await post('eng2_topics', [{ id: 1, notes: { general: ['Staff note'] } }], 'teacher')).status, 200);
  assert.equal((await post('eng2_topics', [{ id: 1, notes: {} }])).status, 403);
  assert.equal((await post('eng2_topics', [])).status, 403);
  assert.equal((await post('_up_avatar_otheruser', {})).status, 403);
  assert.equal((await post('_up_private', { image: 'data:image/png;base64,aGVsbG8=', filename: 'test.png' })).status, 200);
  assert.equal((await c.request('/sync?key=_ur_private', {}, 'other')).status, 403);
  assert.equal((await post('_ur_private', { url: 'forged' })).status, 403);
  assert.equal((await post('_up_private', {}, 'other')).status, 403);
  const uploaded = (await (await c.request('/sync?key=_ur_private')).json()).data;
  assert.equal((await c.request(new URL(uploaded.url).pathname + '?token=student', {}, null)).status, 401);
  const ticketResponse = await c.request('/api/mediaTicket');
  assert.equal(ticketResponse.headers.get('cache-control'), 'no-store');
  const { ticket } = await ticketResponse.json();
  assert.equal((await c.request('/sync?key=studybase_events&media_ticket=' + ticket, {}, null)).status, 401);
  assert.equal((await c.request('/api/mediaTicket', {}, null)).status, 401);
  const media = await c.request(new URL(uploaded.url).pathname + '?media_ticket=' + ticket, {}, null);
  assert.equal(media.status, 200);
  assert.equal(media.headers.get('cache-control'), 'private, no-store');
});

test('notifications and lobbies cannot be forged by another approved user', async t => {
  const c = await start(t);
  const post = (key, value, token = 'student') => c.request('/sync', { method: 'POST', body: new URLSearchParams({ key, data: JSON.stringify(value) }) }, token);
  const note = { id: 'n1', kind: 'text', text: 'Notice', target: { kind: 'user', uid: 'testuser' }, audience: ['testuser'], readBy: [] };
  assert.equal((await post('studybase_notifications', { items: [note] })).status, 403);
  assert.equal((await post('studybase_notifications', { items: [note] }, 'dev')).status, 200);
  assert.deepEqual((await (await c.request('/sync?key=studybase_notifications', {}, 'other')).json()).data, { items: [] });
  assert.equal((await post('studybase_notifications', { items: [{ ...note, text: 'Forged' }] })).status, 403);
  assert.equal((await post('studybase_notifications', { items: [{ ...note, readBy: ['testuser'] }] })).status, 200);
  const lobby = { code: 'ABCDEF', hostUid: 'testuser', players: [{ uid: 'testuser', score: 0 }], status: 'waiting' };
  assert.equal((await post('_kc_lobby_ABCDEF', lobby)).status, 200);
  assert.equal((await post('_kc_lobby_ABCDEF', { ...lobby, hostUid: 'otheruser' }, 'other')).status, 403);
  assert.equal((await post('_kc_lobby_ABCDEF', { ...lobby, players: [...lobby.players, { uid: 'otheruser', score: 0 }] }, 'other')).status, 200);
});

test('topic collisions and reserved metadata IDs are rejected without altering notes', async t => {
  const c = await start(t);
  const post = (value, token = 'student') => c.request('/sync', { method: 'POST', body: new URLSearchParams({ key: 'eng_topics', data: JSON.stringify(value) }) }, token);
  const original = { id: 'topic_', notes: { general: ['protected'] } };
  assert.equal((await post([original], 'teacher')).status, 200);
  for (const id of ['topic!', '_meta', 'topic_', 'TOPIC_']) assert.equal((await post([original, { id }])).status, 400);
  assert.deepEqual((await (await c.request('/sync?key=eng_topics')).json()).data, [original]);
});
test('protected lobbies hide contents and require a server-verified password', async t => {
  const c = await start(t);
  const key = '_kc_lobby_ABCDEF';
  const post = (value, token = 'student') => c.request('/sync', { method: 'POST', body: new URLSearchParams({ key, data: JSON.stringify(value) }) }, token);
  const lobby = { code: 'ABCDEF', hostUid: 'testuser', passwordHash: require('node:crypto').createHash('sha256').update('test-password').digest('hex'), status: 'waiting', players: [{ uid: 'testuser', score: 0 }], game: { questions: [] } };
  assert.equal((await post(lobby)).status, 200);
  const view = (await (await c.request('/sync?key=' + key, {}, 'other')).json()).data;
  assert.equal(view.passwordHash, 'protected'); assert.equal(view.game, undefined); assert.equal(view.players, undefined);
  assert.equal((await post({ ...lobby, players: [...lobby.players, { uid: 'otheruser' }] }, 'other')).status, 403);
  const join = password => c.request('/api/joinLobby', { method: 'POST', body: JSON.stringify({ code: 'ABCDEF', password }) }, 'other');
  assert.equal((await join('wrong')).status, 403);
  assert.equal((await join('test-password')).status, 200);
  const member = (await (await c.request('/sync?key=' + key, {}, 'other')).json()).data;
  member.players.find(p => p.uid === 'otheruser').score = 99999;
  assert.equal((await post(member, 'other')).status, 200);
  assert.equal((await (await c.request('/sync?key=' + key, {}, 'other')).json()).data.players.find(p => p.uid === 'otheruser').score, 0);
});

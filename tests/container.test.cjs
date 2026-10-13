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
  const child = spawn(process.execPath, ['-e', "process.on('message', () => process.emit('SIGTERM')); require('./server.js');"], {
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
  return { child, data, logs: () => logs, request: (url, opts) => fetch('http://127.0.0.1:' + port + url, opts) };
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
  for (const endpoint of ['/sync?key=test', '/api/desmosKey']) {
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
  await post('test', [{ id: 1 }]);
  assert.deepEqual(await (await c.request('/sync?key=test')).json(), { data: [{ id: 1 }] });
  assert.equal(await (await c.request('/sync?key=test&callback=cb')).text(), '/**/ cb({"data":[{"id":1}]});');
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

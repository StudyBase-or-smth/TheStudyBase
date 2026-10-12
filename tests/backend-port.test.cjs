const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function client(url, fetchImpl = async () => ({ ok: true, json: async () => ({ data: [] }) })) {
  const values = new Map();
  const storage = { getItem: k => values.get(k) || null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k), length: 0 };
  const context = vm.createContext({
    location: new URL(url), window: {}, localStorage: storage, sessionStorage: storage,
    URL, URLSearchParams, AbortController, fetch: fetchImpl, setTimeout, clearTimeout, console
  });
  vm.runInContext(read('sync-config.js'), context);
  return context;
}

test('API and sync follow the standalone server origin, including remote HTTPS', () => {
  for (const [url, origin] of [
    ['http://127.0.0.1:8787/subject/class.html', 'http://127.0.0.1:8787'],
    ['http://localhost:5173/', 'http://127.0.0.1:8787'],
    ['file:///C:/StudyBase/index.html', 'http://127.0.0.1:8787'],
    ['https://study.example.edu/subject/subject.html', 'https://study.example.edu']
  ]) {
    const c = client(url);
    assert.equal(vm.runInContext('SYNC_URL', c), origin + '/sync');
    assert.equal(c.sbApiUrl('/api/grade'), origin + '/api/grade');
    assert.equal(c.sbApiUrl('/api/firebaseConfig'), origin + '/api/firebaseConfig');
  }
});

test('sync reads and writes carry Firebase auth and reject failed writes', async () => {
  const calls = [];
  let ok = true;
  const c = client('http://localhost:8787/', async (url, opts) => {
    calls.push({ url, opts });
    return { ok, json: async () => ({ data: ['saved'] }) };
  });
  c.window.__sbAuth = { currentUser: { getIdToken: async () => 'signed-token' } };
  const result = await c.sbJsonp('http://localhost:8787/sync?key=studybase_suggestions');
  assert.deepEqual(result.data, ['saved']);
  await c.sbPushToSync('studybase_suggestions', [{ text: 'More examples' }]);
  for (const call of calls) assert.equal(call.opts.headers.Authorization, 'Bearer signed-token');
  const body = new URLSearchParams(calls[1].opts.body);
  assert.equal(body.get('key'), 'studybase_suggestions');
  assert.equal(JSON.parse(body.get('data'))[0].text, 'More examples');
  ok = false;
  await assert.rejects(c.sbPushToSync('engineering_topics', []), /sync failed/);
  c.window.isGuest = true;
  c.window.__sbAuth.currentUser = null;
  const before = calls.length;
  await assert.rejects(c.sbPushToSync('engineering_topics', []), /Sign in/);
  assert.equal(calls.length, before);
});

test('batch editor saves subject and linked-class drafts into separate stores', () => {
  const source = read('subject/topicapp.js');
  const save = source.slice(source.indexOf('function saveTopic(){'), source.indexOf('\nfunction ', source.indexOf('function saveTopic(){') + 1));
  const stored = [];
  const linked = { id: 'class-a', storageKey: 'class_a_topics' };
  const c = vm.createContext({
    assertCanEditTopic: () => true, editId: 1, editSurface: 'inline', editOrigin: null,
    document: { getElementById: () => ({ value: 'Subject topic' }) },
    stashCurrentEditDraft() {}, collectDirtyEditDrafts: () => [
      { id: 1, name: 'Subject updated', originId: null },
      { id: 2, name: 'Class updated', originId: 'class-a' }
    ], LINKED_CLASSES: [linked],
    getTopics: () => [{ id: 1, name: 'Subject old', notes: { general: ['Keep this note'] } }, { id: 3, name: 'Untouched' }],
    topicsForOrigin: () => [{ id: 2, name: 'Class old' }],
    subjectDefaultLayout: () => 'basic', editBatchDrafts: {}, window: { currentUid: 'test-user' },
    getDescendantIds: () => [],
    saveTopicsForOrigin: (origin, topics) => stored.push({ origin, topics }),
    finishEditSession() {}, renderList() {}, viewTopic() {}
  });
  const apply = source.slice(source.indexOf('function applyDraftToTopicList('), source.indexOf('\nfunction saveTopic(){'));
  vm.runInContext(apply, c);
  vm.runInContext(save, c);
  c.saveTopic();
  assert.equal(stored.length, 2);
  assert.equal(stored[0].origin, null);
  assert.equal(stored[0].topics[0].name, 'Subject updated');
  assert.equal(stored[0].topics[0].notes.general[0], 'Keep this note');
  assert.equal(stored[0].topics[1].name, 'Untouched');
  assert.equal(stored[1].origin, linked);
  assert.equal(stored[1].topics[0].name, 'Class updated');
});

test('server PDFs and images use authenticated media URLs without persisting tokens', async () => {
  const c = client('http://localhost:8787/');
  c.window.__sbAuth = { currentUser: { getIdToken: async () => 'media-token' } };
  await c.sbGetIdToken();
  const source = read('subject/topicapp.js');
  for (const name of ['isImageDataUrl', 'isPdfImageSrc', 'isAllowedTopicMediaUrl', 'driveEmbedUrl', 'pdfDocViewHtml']) {
    const start = source.indexOf('function ' + name + '(');
    const end = source.indexOf('\nfunction ', start + 1);
    vm.runInContext(source.slice(start, end), c);
  }
  c.esc = value => String(value);
  const url = 'http://localhost:8787/files/lesson.pdf';
  const html = c.pdfDocViewHtml({ pdfData: url, pdfName: 'lesson.pdf' });
  assert.ok(html.includes('src="' + url + '?token=media-token"'));
  assert.ok(html.includes('href="' + url + '?token=media-token"'));
  assert.equal(c.sbUnsignMediaUrl(c.sbMediaUrl(url)), url);
  assert.equal(c.sbMediaUrl('https://other.example/image.jpg'), 'https://other.example/image.jpg');
  assert.equal(c.sbMediaUrl('http://localhost:8787/api/grade'), 'http://localhost:8787/api/grade');
  assert.equal(c.pdfDocViewHtml({ pdfData: 'https://other.example/lesson.pdf' }), '');
});

function apiHarness(status = 'active') {
  const upstream = [];
  const fakeAdmin = { apps: [true], auth: () => ({ verifyIdToken: async () => ({ uid: 'test-user', status }) }) };
  const c = vm.createContext({
    require: name => name === 'firebase-admin' ? fakeAdmin : name === '../program-commands' ? {} : require(name),
    module: { exports: {} }, process: { env: { FIREBASE_PROJECT_ID: 'test-project', GEMINI_API_KEY: 'server-key' } },
    console: { log() {}, info() {}, error() {}, warn() {} }, Buffer, URL, Date, setTimeout, clearTimeout,
    fetch: async (url, opts) => { upstream.push({ url, body: JSON.parse(opts.body) }); return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'generated' }] } }] }) }; }
  });
  vm.runInContext(read('standalone/api.js'), c);
  async function request(route, body, token = 'valid-token') {
    const response = { headersSent: false, setHeader() {}, writeHead(code) { this.status = code; this.headersSent = true; }, end(text) { this.body = JSON.parse(text); } };
    await c.module.exports.handleApi({ method: body ? 'POST' : 'GET', headers: token ? { authorization: 'Bearer ' + token } : {} }, response, new URL('http://localhost/api/' + route), { dataDir: root, readBody: async () => JSON.stringify(body) });
    return response;
  }
  return { request, upstream };
}

test('standalone API supplies Firebase config and enforces approval on AI Fill', async () => {
  const active = apiHarness();
  const config = await active.request('firebaseConfig');
  assert.equal(config.status, 200);
  assert.equal(config.body.projectId, 'test-project');
  const body = { provider: 'gemini', prompt: 'Generate missing topic fields as JSON.' };
  const fill = await active.request('grade', body);
  assert.equal(fill.status, 200);
  assert.equal(fill.body.text, 'generated');
  assert.equal(active.upstream[0].body.contents[0].parts[0].text, body.prompt);
  const pending = apiHarness('pending');
  assert.equal((await pending.request('grade', body)).status, 403);
  assert.equal(pending.upstream.length, 0);
  assert.equal((await active.request('grade', body, '')).status, 401);
});

test('engineering practice assets and font files are available locally', () => {
  const entries = JSON.parse(read('HSC/storage/manifest.json'));
  for (const filename of ['EngineeringFormulae.json', 'EngineeringWhichFormula.json']) {
    assert.ok(entries.some(e => e.file === filename));
    assert.ok(JSON.parse(read('HSC/storage/' + filename)));
  }
  assert.ok(JSON.parse(read('HSC/storage/dictionaries/engineering-formulae.json')));
  const questions = read('HSC/storage/EngineeringWhichFormula.json');
  for (const file of new Set(questions.match(/wf[\w-]+\.svg/g))) assert.ok(fs.existsSync(path.join(root, 'HSC/storage', file)), file);
  for (const match of read('fonts.css').matchAll(/url\('([^']+)'\)/g)) assert.ok(fs.existsSync(path.join(root, match[1])), match[1]);
});

test('offline deletions remain hidden after a pull and can be replayed', async () => {
  const calls = [];
  const c = client('http://localhost:8787/',async (url,opts) => { calls.push(opts); return {ok:true}; });
  c.window.__sbAuth = {currentUser:{getIdToken:async () => 'token'}};
  const before = [{id:'1',name:'Deleted'},{id:'2',name:'Kept'}];
  const after = [{id:'2',name:'Kept'}]; c.sbMemSet('test_topics',after);
  const changed = c.changedTopicIds(before,after); assert.ok(changed.includes('1'));
  await c.trackTopicPush('test_topics',changed,Promise.reject(new Error('offline'))).catch(() => {});
  assert.equal(c.mergeTopicsKeepUnsynced(before,'test_topics').some(t => t.id === '1'),false);
  await c.flushUnsyncedTopics();
  assert.equal(JSON.parse(new URLSearchParams(calls[0].body).get('data')).some(t => t.id === '1'),false);
  assert.equal(c.getUnsyncedTopicIds('test_topics').size,0);
});

test('writes are ordered and an earlier save cannot clear a newer pending change',async () => {
  const sent = []; let finishFirst;
  const c = client('http://localhost:8787/',(url,opts) => {
    sent.push(opts.body); if(sent.length === 1) return new Promise(resolve => { finishFirst = () => resolve({ok:true}); });
    return Promise.resolve({ok:true});
  });
  c.window.__sbAuth = {currentUser:{getIdToken:async () => 'token'}};
  const first = c.sbPushToSync('test_topics',[{id:'1',name:'First'}]);
  const trackedFirst = c.trackTopicPush('test_topics',['1'],first);
  const second = c.sbPushToSync('test_topics',[{id:'1',name:'Latest'}]);
  const trackedSecond = c.trackTopicPush('test_topics',['1'],second);
  await new Promise(resolve => setImmediate(resolve)); assert.equal(sent.length,1);
  finishFirst(); await trackedFirst; assert.equal(c.getUnsyncedTopicIds('test_topics').size,1);
  await trackedSecond; assert.equal(sent.length,2);
  assert.equal(JSON.parse(new URLSearchParams(sent[1]).get('data'))[0].name,'Latest');
  assert.equal(c.getUnsyncedTopicIds('test_topics').size,0);
});

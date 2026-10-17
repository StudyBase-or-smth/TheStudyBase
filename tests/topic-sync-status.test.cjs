const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const read = path => fs.readFileSync(path, 'utf8');

test('successful topic sync clears the nested heading warning and breadcrumb warning', t => {
  const dom = new JSDOM('<div id="detailContent"><div class="dh-name"></div></div><span id="hdrTopicName"></span>', { runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window;
  let pending = true;
  Object.assign(w, { ST: 'test_topics', activeId: 't', renderList() {},
    getTopics: () => [{ id: 't', name: 'Hello <ben>' }], isTopicUnsynced: () => pending });
  const source = read('subject/topicapp.js');
  w.eval(source.slice(source.indexOf('function esc(s)'), source.indexOf('// Builds a single-quoted JS string')));
  const heading = w.document.querySelector('.dh-name');
  heading.innerHTML = w.topicTitleHtml('Hello <ben>', 't');
  assert.ok(heading.querySelector('.unsynced-title'));
  w.refreshUnsyncedUI();
  assert.match(heading.title, /waiting to sync/);
  pending = false;
  w.refreshUnsyncedUI();
  assert.equal(heading.textContent, 'Hello <ben>');
  assert.equal(w.document.querySelector('.unsynced-title'), null);
  assert.equal(w.document.querySelector('[title]'), null);
});

test('late failure of an older save cannot mark an acknowledged newer save as pending', async t => {
  const dom = new JSDOM('', { url: 'https://studybase.example/', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window;
  w.eval(read('sync-config.generated.js') + '\n' + read('sync-config.js'));
  let rejectOld;
  const old = w.trackTopicPush('test_topics', ['t'], new Promise((resolve, reject) => { rejectOld = reject; }));
  const caught = old.catch(() => {});
  await w.trackTopicPush('test_topics', ['t'], Promise.resolve());
  assert.equal(w.isTopicUnsynced('test_topics', 't'), false);
  rejectOld(new Error('old request failed'));
  await caught;
  assert.equal(w.isTopicUnsynced('test_topics', 't'), false);
  await w.trackTopicPush('test_topics', ['t'], Promise.reject(new Error('offline'))).catch(() => {});
  assert.equal(w.isTopicUnsynced('test_topics', 't'), true);
});

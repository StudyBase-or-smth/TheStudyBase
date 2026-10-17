const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

test('shared icons render static and dynamic buttons without replacing their handlers or profile images', async t => {
  const dom = new JSDOM('<button aria-label="Notifications"><span data-sb-icon=bell></span></button><button><img src="avatar.png" alt="Profile"></button>', { runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window, button = w.document.querySelector('button');
  let clicks = 0;
  button.onclick = () => clicks++;
  w.eval(fs.readFileSync('ui-icons.js','utf8'));
  await new Promise(resolve => w.setTimeout(resolve,0));
  assert.ok(button.querySelector('svg[aria-hidden=true]'));
  button.click();
  assert.equal(clicks,1);
  assert.equal(button.getAttribute('aria-label'),'Notifications');
  button.innerHTML = '<span data-sb-icon=moon></span> Dark mode';
  await new Promise(resolve => w.setTimeout(resolve,0));
  assert.ok(button.querySelector('svg'));
  assert.match(button.textContent,/Dark mode/);
  assert.ok(w.document.querySelector('img[src="avatar.png"]'));
  assert.equal(w.SBIcons.html('<script>'), '');
});

const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const read=p=>fs.readFileSync(p,'utf8'),tick=()=>new Promise(r=>setImmediate(r));
test('profile settings reuse quick controls and switch the preview and real homepage without duplicating tools',async t=>{
  const dom=new JSDOM('<div class="hdr-right"></div><div id="profileSettings"></div><div class="main-grid"><div class="hub-subject-heading">Subjects</div><div class="hub-subject-content"><div id="classesSection" style="display:none"></div></div><aside id="hubSidebar"><div class="side-card" id="toolsCard"><div id="toolsToggle">Tools</div><div id="toolsBody"><a href="graphing.html" id="tool">Graphing</a></div></div></aside></div>',{url:'https://studybase.example/index.html',runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());
  w.isGuest=true;w.eval(read('ui-icons.js'));w.eval(read('qol.js'));w.eval(read('home-layout.js'));await tick();
  const settings=w.document.getElementById('profileSettings');w.SBQoL.renderProfileSettings(settings);
  const quick=[...w.document.querySelectorAll('.qol-settings-menu [data-qol-preference]')].map(el=>el.dataset.qolPreference);
  for(const key of quick)assert.ok(settings.querySelector(`[data-qol-preference="${key}"]`));
  assert.equal(settings.querySelector('input[type=password]').value,'');
  const tools=settings.querySelector('[value=tools]');tools.checked=true;tools.dispatchEvent(new w.Event('change',{bubbles:true}));
  assert.equal(w.SBQoL.read('preferences',{}).homeStyle,'tools');assert.ok(settings.querySelector('.preview-tools'));assert.ok(w.document.body.classList.contains('home-tools-layout'));
  assert.equal(w.document.querySelector('.home-tools-primary #tool').getAttribute('href'),'graphing.html');assert.equal(w.document.querySelectorAll('#tool').length,1);
  assert.equal(w.document.getElementById('classesSection').style.display,'none','layout must not reveal unapproved classes');
  const subjects=settings.querySelector('[value=subjects]');subjects.checked=true;subjects.dispatchEvent(new w.Event('change',{bubbles:true}));
  assert.ok(w.document.querySelector('#hubSidebar #tool'));assert.equal(w.document.querySelector('.home-tools-primary'),null);
  const revise=settings.querySelector('[data-qol-preference=showRevise]');revise.checked=true;revise.dispatchEvent(new w.Event('change'));
  assert.equal(w.document.querySelector('.qol-settings-menu [data-qol-preference=showRevise]').checked,true);
});

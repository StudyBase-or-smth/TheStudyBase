const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), { JSDOM } = require('jsdom');
const source = fs.readFileSync('subject/topic-qol.js','utf8');
test('sidebar bottom bar opens drafts and trash and gates selection by permissions', t => {
  const dom = new JSDOM('<div class="sidebar"><div id="topicList"></div></div>',{runScripts:'outside-only'}), w = dom.window;
  t.after(() => w.close());
  let canEdit = true, drafts = 0, trash = 0;
  const node = (tag, cls, text) => { const el = w.document.createElement(tag); el.className = cls || ''; el.textContent = text || ''; return el; };
  Object.assign(w,{ui:{node,button(text,run,cls){const el=node('button',cls,text);el.onclick=run;return el;}},
    allowed:()=>canEdit, openSavedDrafts:()=>drafts++,openTrash:()=>trash++,moveDialog(){},deleteSelection(){},decorateList(){w.updateSidebarBar();}});
  w.eval(fs.readFileSync('ui-icons.js','utf8'));
  w.eval('let selecting=false,selected=new Set();let sidebarTab="subject";'+source.slice(source.indexOf('  function updateSelection()'),source.indexOf('  function revise()'))+'\nmountSidebarBar();');
  const select = w.document.getElementById('qol-select-button');
  assert.equal(w.document.querySelector('.sidebar').lastElementChild.id,'qol-sidebar-footer');
  w.document.getElementById('qol-saves-button').click();w.document.getElementById('qol-deleted-button').click();
  assert.equal(drafts,1);assert.equal(trash,1);
  select.click();assert.equal(select.getAttribute('aria-pressed'),'true');assert.equal(w.document.getElementById('qol-bulk-actions').hidden,false);
  canEdit=false;w.updateSidebarBar();assert.equal(select.disabled,true);assert.equal(w.document.getElementById('qol-bulk-actions').hidden,true);
});
test('draft recovery respects topic permissions and opens the requested origin without losing other drafts', t => {
  const dom = new JSDOM('',{runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());
  const subject={id:'t',originId:null,name:'Subject draft'},linked={id:'t',originId:'class',name:'Class draft'},blocked={id:'bad',originId:'missing'};
  let opened;
  Object.assign(w,{originFor:id=>id==='class'?{id}:null,allowed:()=>true,topicsForDraft:()=>[{id:'t'}],editDraftKey:(id,origin)=>(origin?.id||'subject')+id,startInlineEdit:id=>{opened=id;},ui:{notify(){}}});
  w.eval('let editBatchDrafts,activeOrigin,activeId;'+source.slice(source.indexOf('  function restoreSavedDrafts('),source.indexOf('  function openSavedDrafts()'))+'\nwindow.inspectDrafts=()=>({drafts:editBatchDrafts,origin:activeOrigin});');
  w.restoreSavedDrafts({drafts:[subject,linked,blocked]},'t','class');
  assert.equal(opened,'t');assert.equal(w.inspectDrafts().origin.id,'class');assert.equal(Object.keys(w.inspectDrafts().drafts).length,2);
});

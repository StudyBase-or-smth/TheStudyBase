const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root,f),'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve,30));

async function harness(t, storage) {
  const errors = [];
  const console = new VirtualConsole(); console.on('jsdomError',e => errors.push(e.message));
  const dom = new JSDOM(read('subject/subject.html'),{url:'http://localhost:8787/subject/subject.html#test',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console});
  await tick();
  const w = dom.window; const ctx = dom.getInternalVMContext();
  if(storage) for(const [key,value] of storage) w.localStorage.setItem(key,value);
  w.fetch = async () => ({ok:true,json:async () => ({data:null}),headers:{get:() => 'application/json'}});
  w.AbortController = AbortController;
  w.HTMLElement.prototype.scrollIntoView = function() {};
  Object.defineProperty(w.HTMLElement.prototype,'contentEditable',{get(){ return this.getAttribute('contenteditable') || 'inherit'; },set(value){ this.setAttribute('contenteditable',value); },configurable:true});
  w.HTMLDialogElement.prototype.showModal = function() { this.open = true; };
  w.HTMLDialogElement.prototype.close = function() { this.open = false; this.dispatchEvent(new w.Event('close')); };
  w.isGuest = false; w.isTeacher = true; w.userRole = 'dev'; w.currentUid = 'test-user';
  w.__sbAuth = {currentUser:{uid:'test-user',getIdToken:async () => 'test-token'}};
  const run = file => vm.runInContext(read(file),ctx,{filename:file});
  run('subjects.js'); run('sync-config.js');
  if(!storage) {
    w.sbMemSet('test_topics',[
      {id:1,name:'First topic',definition:'Original definition',layout:'text',bodyText:'A note about mechanics',notes:{general:['Keep this note']},createdAt:'2026-01-01'},
      {id:2,name:'Second topic',layout:'text',bodyText:'A separate note',createdAt:'2026-01-01'},
      {id:3,name:'Child topic',parentId:1,layout:'text',bodyText:'More mechanics',createdAt:'2026-01-01'}
    ]);
    w.sbMemSet('test_units',{v:1,items:[{id:'one',name:'Unit One'},{id:'two',name:'Unit Two'}]});
  }
  run('subject/topicapp.js'); run('qol.js'); run('subject/topic-qol.js');
  await tick();
  t.after(async () => { await tick(); dom.window.close(); assert.deepEqual(errors,[]); });
  const topics = () => JSON.parse(JSON.stringify(vm.runInContext('getTopics()',ctx)));
  const click = text => { const el = [...w.document.querySelectorAll('button')].find(b => b.textContent.trim() === text && !b.closest('[hidden]')); assert.ok(el,`Missing button: ${text}`); el.click(); };
  return { w, ctx, topics, click, storage:() => [...Array(w.localStorage.length)].map((_,i) => { const key = w.localStorage.key(i); return [key,w.localStorage.getItem(key)]; }) };
}

test('unchanged text editors stay clean; batch drafts recover after reload and save together',async t => {
  const a = await harness(t); a.w.viewTopic(1); a.w.startInlineEdit(1);
  assert.equal(vm.runInContext('editBatchDirtyCount()',a.ctx),0);
  a.w.document.getElementById('fBodyText').innerHTML = 'Recovered notes'; a.w.SBTopicQoL.persistDrafts();
  a.w.viewTopic(2); a.w.document.getElementById('fName').value = 'Second edited'; a.w.SBTopicQoL.persistDrafts();
  assert.equal(a.w.SBQoL.read('drafts:subject:test',null).drafts.length,2);
  const b = await harness(t,a.storage()); b.click('Restore drafts');
  assert.equal(b.w.document.getElementById('fName').value,'Second edited');
  assert.equal(b.w.document.getElementById('inlineSaveBtn').textContent,'Save 2 topics');
  b.w.saveTopic(); await tick();
  assert.equal(b.topics().find(x => x.id == 1).bodyText,'Recovered notes');
  assert.equal(b.topics().find(x => x.id == 2).name,'Second edited');
  assert.equal(b.topics().find(x => x.id == 1).notes.general[0],'Keep this note');
  assert.equal(b.w.SBQoL.read('drafts:subject:test',null),null);
});

test('Escape keeps topic edits and dismissing a discard dialog does not discard them',async t => {
  const a = await harness(t); a.w.viewTopic(1); a.w.startInlineEdit(1);
  a.w.document.getElementById('fName').value = 'Unsaved';
  a.w.document.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(a.w.document.getElementById('fName').value,'Unsaved');
  a.w.closeInlineEdit(); assert.ok(a.w.document.querySelector('dialog[open]'));
  a.click('Keep editing'); assert.equal(a.w.document.getElementById('fName').value,'Unsaved');
});

test('topic deletion is undoable with its descendants and notes',async t => {
  const a = await harness(t); a.w.viewTopic(1); a.w.confirmDeleteTopic(1); a.w.doDelete(false);
  assert.equal(a.topics().length,1); assert.equal(a.w.SBQoL.read('trash:subject:test',[]).length,1);
  a.click('Undo'); await tick();
  assert.equal(a.topics().length,3);
  assert.equal(a.topics().find(x => x.id == 3).parentId,'1');
  assert.equal(a.topics().find(x => x.id == 1).notes.general[0],'Keep this note');
});

test('duplicate includes subtopics with new IDs and batch move keeps the hierarchy',async t => {
  const a = await harness(t); a.w.viewTopic(1);
  assert.ok(!a.w.document.getElementById('qol-topic-details').textContent.includes('Duplicate'));
  a.w.startInlineEdit(1); a.click('Duplicate'); await tick();
  const copy = a.topics().find(x => x.name === 'First topic (copy)'); assert.ok(copy);
  assert.ok(a.topics().some(x => x.parentId === copy.id && x.name === 'Child topic'));
  assert.equal(a.w.SBTopicQoL.relocateTopic(copy.id,'2','inside'),true); await tick();
  assert.equal(a.topics().find(x => x.id === copy.id).parentId,'2');
  assert.equal(a.topics().find(x => x.parentId === copy.id).parentId,copy.id);
  assert.equal(a.w.SBTopicQoL.relocateTopic(copy.id,null,'inside'),true);
  assert.equal(a.topics().find(x => x.id === copy.id).parentId,null);
});

test('global search finds note content, shows source paths and commands',async t => {
  const a = await harness(t); a.w.SBQoL.search(); const input = a.w.document.querySelector('dialog input');
  input.value = 'mechanics'; input.dispatchEvent(new a.w.Event('input'));
  const results = [...a.w.document.querySelectorAll('dialog a')]; assert.equal(results.length,2);
  assert.ok(results.every(r => r.href.includes('topic=') && r.href.endsWith('#test')));
  assert.ok(results.some(r => r.textContent.includes('Child topic') && r.textContent.includes('First topic')));
  input.value = '/deleted'; input.dispatchEvent(new a.w.Event('input')); assert.ok(a.w.document.querySelector('dialog').textContent.includes('Recently deleted topics'));
});

test('last topic, search and expanded groups are restored on the next visit',async t => {
  const a = await harness(t); a.w.viewTopic(3);
  a.w.document.getElementById('searchInput').value = 'Child'; a.w.document.getElementById('searchInput').dispatchEvent(new a.w.Event('input'));
  const b = await harness(t,a.storage());
  assert.equal(vm.runInContext('activeId',b.ctx),'3');
  assert.equal(b.w.document.getElementById('searchInput').value,'Child');
  assert.ok(b.w.document.getElementById('detailContent').textContent.includes('Child topic'));
});

test('read-only class content cannot be changed through organization controls',async t => {
  const a = await harness(t); a.w.isGuest = true; a.w.viewTopic(1);
  assert.ok(a.w.document.getElementById('qol-topic-details').textContent.includes('Read only'));
  assert.ok(!a.w.document.getElementById('qol-topic-details').textContent.includes('Duplicate'));
  assert.ok(![...a.w.document.querySelectorAll('button')].some(b => b.textContent === 'Select' || b.textContent === 'Trash'));
  assert.ok(!a.w.document.querySelector('.qol-select-topic'));
});

test('clicking a selected parent again collapses it without leaving the editor',async t => {
  const a = await harness(t); a.w.sidebarTopicClick('1');
  assert.ok(vm.runInContext("expandedTopics.has('1')",a.ctx));
  a.w.startInlineEdit('1'); a.w.sidebarTopicClick('1');
  assert.equal(vm.runInContext("expandedTopics.has('1')",a.ctx),false);
  assert.ok(a.w.document.getElementById('fName'));
  a.w.sidebarTopicClick('1'); assert.ok(vm.runInContext("expandedTopics.has('1')",a.ctx));
});

test('dragging preserves unsaved content, prevents cycles and persists sibling order',async t => {
  const a = await harness(t); a.w.viewTopic('1'); a.w.startInlineEdit('1');
  a.w.document.getElementById('fBodyText').innerHTML = 'Keep this unsaved edit';
  assert.equal(a.w.SBTopicQoL.relocateTopic('3','2','inside'),true);
  assert.equal(a.w.document.getElementById('fBodyText').innerHTML,'Keep this unsaved edit');
  assert.equal(a.topics().find(x => x.id === '3').parentId,'2');
  assert.equal(a.w.SBTopicQoL.relocateTopic('2','3','inside'),false);
  assert.equal(a.w.SBTopicQoL.relocateTopic('2','1','before'),true);
  const serialized = a.w.serializeTopicList(a.topics());
  assert.equal(serialized.find(x => x.id === '2').order,0);
  assert.equal(serialized.find(x => x.id === '1').order,1);
  a.w.saveTopic(); await tick();
  assert.equal(a.topics().find(x => x.id === '1').bodyText,'Keep this unsaved edit');
  assert.equal(a.topics().find(x => x.id === '3').parentId,'2');
});

test('hub has global search, three continue links in its sidebar and profile notifications survive refresh',async t => {
  const dom = new JSDOM(read('index.html'),{url:'http://localhost:8787/index.html',runScripts:'outside-only',pretendToBeVisual:true});
  const w = dom.window; await tick();
  w.currentUid = 'test-user'; w.fetch = async () => ({ok:true,json:async () => ({data:null})}); w.AbortController = AbortController;
  w.HTMLDialogElement.prototype.showModal = function(){this.open=true}; w.HTMLDialogElement.prototype.close = function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  const ctx = dom.getInternalVMContext(); vm.runInContext(read('subjects.js'),ctx); vm.runInContext(read('sync-config.js'),ctx);
  w.localStorage.setItem('sbq:test-user:recent',JSON.stringify([1,2,3,4].map(id => ({name:'Topic '+id,subject:'Test',href:'http://localhost:8787/subject/subject.html?topic='+id+'#test'}))));
  const notify = w.document.getElementById('hdrNotifyWrap');
  vm.runInContext(read('qol.js'),ctx);
  assert.equal(w.document.querySelector('#hubSidebar #qol-continue').querySelectorAll('a').length,3);
  const search = w.document.querySelector('.qol-search-button'); assert.ok(search.querySelector('svg')); search.click();
  assert.equal(w.document.querySelector('dialog h2').textContent,'Search StudyBase'); w.document.querySelector('dialog').close();
  const menu = w.document.getElementById('hdrProfileTip'); assert.ok(menu.contains(notify));
  assert.ok(!menu.querySelector('.qol-profile-reading')); assert.ok(w.document.querySelector('.qol-settings-button'));
  menu.innerHTML = '<div>Updated account</div>'; await tick(); assert.ok(menu.contains(notify));
  assert.equal(w.document.getElementById('hdrNotifyBtn'),null);
  assert.ok(!menu.querySelector('.qol-view-profile').classList.contains('qol-button'));
  w.document.querySelector('.qol-settings-button').click(); assert.ok(w.document.querySelector('.qol-settings-wrap.open').textContent.includes('Reading settings'));
  assert.equal(w.document.querySelector('dialog'),null);
  w.document.querySelector('.qol-settings-wrap').dispatchEvent(new w.MouseEvent('mouseleave'));
  assert.ok(!w.document.querySelector('.qol-settings-wrap.open'));
  w.document.getElementById('hdrProfileBtn').click();
  const profileWrap = w.document.querySelector('.hdr-profile-wrap'); assert.ok(profileWrap.classList.contains('qol-profile-open'));
  profileWrap.dispatchEvent(new w.MouseEvent('mouseleave')); assert.ok(!profileWrap.classList.contains('qol-profile-open'));
  t.after(() => w.close());
});

test('calendar agenda, subject colours and completion work together and edits keep completion',async t => {
  const dom = new JSDOM(read('index.html'),{url:'http://localhost:8787/index.html',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
  await tick(); const w = dom.window, ctx = dom.getInternalVMContext();
  w.currentUid = 'calendar-test'; w.isGuest = false; w.AbortController = AbortController; w.matchMedia = () => ({matches:true});
  w.fetch = async () => ({ok:true,json:async () => ({data:null})});
  w.__sbAuth = {currentUser:{uid:'calendar-test',getIdToken:async () => 'test-token'}};
  for(const f of ['subjects.js','sync-config.js','suggestions.js','mainapp.js','qol.js']) vm.runInContext(read(f),ctx,{filename:f});
  const today = new Date(); const key = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate()+1);
  w.sbMemSet('studybase_events',[{id:'one',title:'Engineering assignment',date:key(tomorrow),subject:'Engineering',type:'assignment'}, {id:'two',title:'Maths exam',date:key(today),subject:'Maths',type:'exam'}]);
  vm.runInContext(read('calendar-qol.js'),ctx);
  assert.equal(w.SBCalendar.countdown({date:key(tomorrow)}),'Due tomorrow');
  assert.equal(w.SBCalendar.colour({subject:'Engineering'}),'#1a588e');
  const aged = w.SBCalendar.autoCompleteEvents([{date:'2026-10-07',completed:false},{date:'2026-10-08',completed:false},{date:'2026-10-01',completed:true}],'2026-10-12');
  assert.equal(aged[0].completed,true); assert.equal(aged[0].autoCompleted,true);
  assert.equal(aged[1].completed,false); assert.equal(aged[2].autoCompleted,undefined);
  w.document.querySelector('[data-calendar-view="agenda"]').click(); assert.equal(w.document.getElementById('calGrid').hidden,true);
  assert.equal(w.document.querySelectorAll('.calendar-agenda-row').length,2);
  const done = w.document.querySelector('[aria-label="Mark completed: Engineering assignment"]'); done.checked=true; done.dispatchEvent(new w.Event('change'));
  assert.equal(w.document.querySelectorAll('.calendar-agenda-row').length,1);
  const show = w.document.querySelector('.calendar-controls .calendar-show-completed input'); show.checked=true; show.dispatchEvent(new w.Event('change'));
  assert.equal(w.document.querySelectorAll('.calendar-agenda-row').length,2);
  w.openEventModal('one'); assert.equal(w.document.getElementById('evCompleted').checked,true);
  w.document.getElementById('evTitle').value = 'Renamed assignment'; w.saveEvent();
  assert.equal(w.sbMemGet('studybase_events',[]).find(e => e.id === 'one').completed,true);
  await tick(); assert.equal(w.SBQoL.read('calendar-pending',null),null);
  const body = w.document.getElementById('toolsBody');
  body.getBoundingClientRect = () => ({height:100}); Object.defineProperty(body,'scrollHeight',{value:100,configurable:true});
  w.SBQoL.write('preferences',{animations:true});
  w.toggleSection('tools'); await tick();
  assert.ok(body.style.transition.includes('height 180ms')); assert.equal(body.style.height,'0px');
  w.SBQoL.write('preferences',{animations:false}); w.toggleSection('tools');
  assert.equal(body.style.transition,''); assert.equal(body.classList.contains('collapsed'),false);
  t.after(async () => {await tick(); w.close();});
});

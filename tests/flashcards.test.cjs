const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const core=require('../flashcards-core');
const read=p=>fs.readFileSync(require.resolve('../'+p),'utf8');
const topic={id:'t1',name:'Forces',definition:'A push or pull',flashcardQA:[{id:'a',q:'Unit of force?',a:'Newton',acceptedAnswers:['N']},{id:'b',q:'Formula?',a:'F=ma'}]};
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('deck excludes disabled, incomplete and duplicate pairs and preserves stable IDs',()=>{
 const {cards,issues}=core.deck([{...topic,flashcardEnabled:false,flashcardQA:[...topic.flashcardQA,{id:'c',q:'Unit of force?',a:'Newton'},{q:'Empty',a:''},{q:'Hidden',a:'Answer',enabled:false}]}],'phy');
 assert.deepEqual(cards.map(c=>c.id),['phy:t1:qa:a','phy:t1:qa:b']);assert.equal(issues.length,2);
 assert.equal(core.matches(' n! ',cards[0]),true);assert.equal(core.matches('newtons',cards[0]),false);
});
test('review scheduling and personal sync merge preserve independent progress',()=>{
 const again=core.review({},'again',1000),good=core.review(again,'good',2000),easy=core.review(good,'easy',3000);
 assert.equal(again.due,601000);assert.equal(good.interval,1);assert.equal(easy.interval,3);assert.equal(easy.lapses,1);
 const merged=core.merge({cards:{a:{hidden:true,updatedAt:3}},days:{today:['a']}},{cards:{a:{hidden:false,updatedAt:2},b:{updatedAt:4}},days:{today:['a','b']}});
 assert.equal(merged.cards.a.hidden,true);assert.deepEqual(merged.days.today,['a','b']);assert.ok(merged.cards.b);
});
function fixture({storage,account='guest',isClass=false,topics=[topic],url}={}){
 const dom=new JSDOM('<a id="accentBar"></a><a id="hdrSubjectLink"></a><div id="hdrEmoji"></div><main id="fcWrap"></main>',{url:url||'https://studybase.example/subject/flashcards.html#phy',runScripts:'outside-only'}),w=dom.window;
 const subject={id:'phy',name:'Physics',...(isClass?{subjectId:'p'}:{})};w.subjectsData={subjects:isClass?[]:[subject]};w.classesData={subjects:isClass?[subject]:[]};w.isGuest=account==='guest';w.__sbAuth={currentUser:account==='guest'?null:{uid:account}};w.userRole='student';
 w.normalizeTopicList=x=>x;w.normalizeUnits=x=>x;w.sbMemGet=(key)=>key.endsWith('_topics')?topics:[];w.sbLoadKey=async()=>null;w.sbPushToSync=async()=>{};
 w.topicMatchesUnit=()=>true;w.findUnit=()=>null;w.unitLabel=x=>x;
 w.eval(read('flashcards-core.js'));w.eval(read('qol.js'));
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 if(storage)w.localStorage.setItem('studybase_flashcards_'+account,JSON.stringify(storage));
 w.eval(read('subject/flashcards-study.js'));
 return {dom,w,id:id=>w.document.getElementById(id),state:()=>JSON.parse(w.localStorage.getItem('studybase_flashcards_'+account))};
}
test('study reveals, rates, advances to summary, resumes and counts distinct daily cards',async()=>{
 const {dom,w,id,state}=fixture();await settle();assert.match(id('fcWrap').textContent,/Forces/);
 assert.equal(id('studyMode').value,'all');assert.equal(id('studyLimit').value,'0');
 assert.ok(id('studyMode').closest('#studyMore'));assert.ok(id('hideStudyCard').closest('#studyMore'));assert.equal(id('studyMore').open,false);
 id('studyMore').querySelector('summary').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert.equal(w.document.querySelector('.study-answer'),null);
 w.document.querySelector('.study-face').click();assert.ok(w.document.querySelector('.study-answer'));assert.equal(id('studyPrimary').textContent,'Next card');
 w.document.querySelector('.study-card').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert.equal(w.document.querySelector('.study-answer'),null);assert.equal(state().cards['phy:t1:base'],undefined);
 id('studyPrimary').click();assert.equal(w.document.querySelector('[data-rating]'),null);id('studyPrimary').click();
 assert.match(id('fcWrap').textContent,/Unit of force/);assert.equal(id('studyAnswer').closest('details').open,false);id('studyAnswer').closest('details').querySelector('summary').click();id('studyAnswer').click();assert.equal(w.document.querySelector('.study-answer'),null);id('studyAnswer').value='N';id('studyPrimary').click();assert.match(id('fcWrap').textContent,/Matches an accepted/);
 id('selfCorrect').click();assert.match(id('fcWrap').textContent,/Self-assessed as correct/);id('studyPrimary').click();id('studyPrimary').click();id('studyPrimary').click();
 assert.match(id('fcWrap').textContent,/Session complete/);assert.equal(Object.values(state().days)[0].length,3);assert.equal(state().cards['phy:t1:base'].lastRating,'good');
 const copy=state();dom.window.close();const next=fixture({storage:copy});await settle();assert.match(next.id('fcWrap').textContent,/Session complete/);next.dom.window.close();
});
test('hiding is personal, undo works, and last hidden card can be restored from management',async()=>{
 const {dom,w,id,state}=fixture({topics:[{...topic,flashcardEnabled:false,flashcardQA:[topic.flashcardQA[0]]}]});await settle();id('hideStudyCard').click();assert.equal(state().cards['phy:t1:qa:a'].hidden,true);assert.equal(topic.flashcardQA.length,2);
 id('undoHidden').click();assert.equal(state().cards['phy:t1:qa:a'].hidden,false);id('hideStudyCard').click();
 id('manageHidden').click();w.document.querySelector('dialog .qol-dialog-content button').click();w.document.querySelector('dialog').close();assert.match(id('fcWrap').textContent,/Unit of force/);assert.equal(state().cards['phy:t1:qa:a'].hidden,false);dom.window.close();
});
test('goals save timezone and target; guest reminders disabled; student class source editing unavailable',async()=>{
 const a=fixture();await settle();a.id('studyGoals').click();assert.equal(a.id('goalReminder').disabled,true);a.dom.window.close();
 const b=fixture({account:'student1',isClass:true});await settle();assert.equal(b.id('editStudyCard'),null);b.id('studyGoals').click();b.id('goalTarget').value='15';b.id('goalZone').value='Australia/Sydney';b.id('goalReminder').checked=true;b.id('studyGoalForm').dispatchEvent(new b.w.Event('submit',{cancelable:true}));
 assert.equal(b.state().goals.goal_phy.target,15);assert.equal(b.state().goals.goal_phy.reminderEnabled,true);assert.equal(b.state().goals.goal_phy.timeZone,'Australia/Sydney');b.dom.window.close();
});
test('resuming after authored card removal keeps the correct next card',async()=>{
 const storage=core.merge();storage.sessions['phy|all||all|0']={order:['phy:t1:qa:gone','phy:t1:qa:a','phy:t1:qa:b'],index:1,ratings:{},updatedAt:1};
 const {dom,id}=fixture({storage});await settle();assert.match(id('fcWrap').querySelector('h2').textContent,/Unit of force/);dom.window.close();
});
test('topic editor preserves IDs, aliases and inclusion through delete/undo and serialization',()=>{
 const dom=new JSDOM('<input id="fName" value="Forces"><textarea id="fDefinition">A push</textarea><div id="fqaList"></div>',{url:'https://studybase.example/subject/subject.html#phy',runScripts:'outside-only'}),w=dom.window;
 w.eval(read('flashcards-core.js'));w.eval(read('sync-config.generated.js')+'\n'+read('sync-config.js'));w.eval(read('subject/flashcards-editor.js'));w.initFlashcardEditor(topic);w.addFqaRow('Unit?','Newton',{id:'stable',enabled:false,acceptedAnswers:['N']});
 assert.equal(w.readFlashcardRows()[0].id,'stable');assert.equal(w.readFlashcardRows()[0].enabled,false);w.document.querySelector('.fqa-row button').click();assert.equal(w.readFlashcardRows().length,0);w.document.getElementById('flashcardUndo').click();assert.equal(w.readFlashcardRows()[0].acceptedAnswers[0],'N');
 const saved=w.serializeTopic({...topic,flashcardEnabled:false,flashcardQA:w.readFlashcardRows()});assert.equal(saved.flashcardEnabled,false);assert.equal(saved.flashcardQA[0].id,'stable');assert.equal(saved.flashcardQA[0].enabled,false);
 w.document.getElementById('fDefinition').value='';w.document.getElementById('fDefinition').dispatchEvent(new w.Event('input',{bubbles:true}));assert.match(w.document.getElementById('flashcardBasePreview').textContent,/no content/);dom.window.close();
});

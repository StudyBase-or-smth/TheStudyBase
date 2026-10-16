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
test('FSRS scheduling and personal sync merge preserve independent progress',()=>{
 const again=core.review({},'again',1000),good=core.review(again,'good',2000),easy=core.review(good,'easy',3000);
 assert.equal(new Date(again.due).getTime(),61000);assert.equal(good.reps,2);assert.equal(easy.reps,3);assert.equal(Object.keys(easy.reviewLog).length,3);
 const merged=core.merge({cards:{a:{hidden:true,updatedAt:3}},days:{today:['a']}},{cards:{a:{hidden:false,updatedAt:2},b:{updatedAt:4}},days:{today:['a','b']}});
 assert.equal(merged.cards.a.hidden,true);assert.deepEqual(merged.days.today,['a','b']);assert.ok(merged.cards.b);
});
function fixture({storage,account='guest',isClass=false,topics=[topic],url,load,push,offline=false}={}){
 const dom=new JSDOM('<a id="accentBar"></a><a id="hdrSubjectLink"></a><div id="hdrEmoji"></div><main id="fcWrap"></main>',{url:url||'https://studybase.example/subject/flashcards.html#phy',runScripts:'outside-only'}),w=dom.window;
 const subject={id:'phy',name:'Physics',...(isClass?{subjectId:'p'}:{})};w.subjectsData={subjects:isClass?[]:[subject]};w.classesData={subjects:isClass?[subject]:[]};w.isGuest=account==='guest';w.__sbAuth={currentUser:account==='guest'?null:{uid:account}};w.userRole='student';
 w.normalizeTopicList=x=>x;w.normalizeUnits=x=>x;w.sbMemGet=(key)=>key.endsWith('_topics')?topics:[];w.sbLoadKey=load||async function(){return null;};w.sbPushToSync=push||async function(){};
 Object.defineProperty(w.navigator,'onLine',{get:()=>!offline});
 w.topicMatchesUnit=()=>true;w.findUnit=()=>null;w.unitLabel=x=>x;
 w.eval(read('vendor/ts-fsrs/index.umd.js'));w.eval(read('flashcards-scheduler.js'));w.eval(read('flashcards-core.js'));w.eval(read('qol.js'));
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 if(storage)w.localStorage.setItem('studybase_flashcards_'+account,JSON.stringify(storage));
 w.eval(read('subject/flashcards-study.js'));
 return {dom,w,id:id=>w.document.getElementById(id),state:()=>JSON.parse(w.localStorage.getItem('studybase_flashcards_'+account)),setOnline(value){offline=!value;if(value)w.dispatchEvent(new w.Event('online'));}};
}

test('scheduling settings persist per user and TSV file import creates safe new cards with tags',async()=>{
 const {dom,w,id,state}=fixture({account:'reader',topics:[]});await settle();
 id('fsrsSettings').click();id('fsrsRetention').value='0.95';id('fsrsNewLimit').value='1';id('fsrsSettingsForm').dispatchEvent(new w.Event('submit',{cancelable:true}));
 assert.equal(state().settings.desiredRetention,.95);assert.equal(state().settings.newCardsPerDay,1);
 id('importStudy').click();
 Object.defineProperty(id('studyImportFile'),'files',{value:[{name:'small.txt',size:100,text:async()=> '#comment\nForce unit?\tNewton\tphysics mechanics\nCapital?\tCanberra\ninvalid\n<script>front</script>\t<script>back</script>'}]});
 id('studyImportFile').dispatchEvent(new w.Event('change'));await settle();
 id('studyImportForm').dispatchEvent(new w.Event('submit',{cancelable:true}));
 const imported=Object.values(state().imports);assert.equal(imported.length,3);assert.deepEqual(imported[0].tags,['physics','mechanics']);
 for(const card of imported){assert.equal(state().cards[card.id].state,0);assert.equal(state().cards[card.id].reps,0);}
 assert.equal(w.document.querySelector('script'),null);assert.match(w.document.querySelector('.study-counts').textContent,/1 new/);
 id('studyPrimary').click();const stale=w.document.querySelector('[data-rating=good]');stale.click();stale.click();
 assert.equal(Object.values(state().cards).reduce((sum,c)=>sum+c.reps,0),1);assert.match(id('fcWrap').textContent,/No cards due now/);
 dom.window.close();
});

test('offline reviews survive reopening and an acknowledgement lost after upload does not apply a review twice',async()=>{
 let server=core.merge(),calls=0;
 const load=async key=>key.startsWith('_flashcards_')?JSON.parse(JSON.stringify(server)):null;
 const push=async(key,value)=>{assert.equal(key,'_flashcards_reader');assert.equal(value.pendingReviewIds,undefined);server=core.merge(server,value);calls++;if(calls===1)throw Error('Acknowledgement lost');};
 let app=fixture({account:'reader',offline:true,load,push});await settle();app.id('studyPrimary').click();app.w.document.querySelector('[data-rating=good]').click();
 const saved=app.state();assert.equal(saved.pendingReviewIds.length,1);assert.equal(saved.cards['phy:t1:base'].reps,1);assert.equal(calls,0);app.dom.window.close();
 app=fixture({account:'reader',offline:true,storage:saved,load,push});await settle();assert.equal(app.state().pendingReviewIds.length,1);
 app.setOnline(true);await settle();await settle();assert.equal(calls,1);assert.equal(app.state().pendingReviewIds.length,1);
 app.w.dispatchEvent(new app.w.Event('online'));await settle();await settle();
 assert.equal(calls,2);assert.equal(app.state().pendingReviewIds.length,0);assert.equal(app.state().cards['phy:t1:base'].reps,1);assert.equal(server.cards['phy:t1:base'].reps,1);assert.equal(Object.keys(server.cards['phy:t1:base'].reviewLog).length,1);
 app.dom.window.close();
});
test('study reveals, rates, advances to summary, resumes and counts distinct daily cards',async()=>{
 const {dom,w,id,state}=fixture();await settle();assert.match(id('fcWrap').textContent,/Forces/);
 assert.equal(id('studyMode').value,'due');assert.equal(id('studyLimit').value,'0');
 assert.ok(id('studyMode').closest('#studyMore'));assert.ok(id('hideStudyCard').closest('#studyMore'));assert.equal(id('studyMore').open,false);
 id('studyMore').querySelector('summary').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert.equal(w.document.querySelector('.study-answer'),null);
 w.document.querySelector('.study-face').click();assert.ok(w.document.querySelector('.study-answer'));assert.equal(w.document.querySelectorAll('[data-rating]').length,4);
 w.document.querySelector('.study-card').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert.equal(w.document.querySelector('.study-answer'),null);assert.equal(state().cards['phy:t1:base'].state,0);
 id('studyPrimary').click();assert.equal(w.document.querySelectorAll('[data-rating]').length,4);w.document.querySelector('[data-rating=good]').click();
 assert.match(id('fcWrap').textContent,/Unit of force/);assert.equal(id('studyAnswer').closest('details').open,false);id('studyAnswer').closest('details').querySelector('summary').click();id('studyAnswer').click();assert.equal(w.document.querySelector('.study-answer'),null);id('studyAnswer').value='N';id('studyPrimary').click();assert.match(id('fcWrap').textContent,/Matches an accepted/);
 id('selfCorrect').click();assert.match(id('fcWrap').textContent,/Self-assessed as correct/);w.document.querySelector('[data-rating=good]').click();id('studyPrimary').click();w.document.querySelector('[data-rating=good]').click();
 assert.match(id('fcWrap').textContent,/No cards due now/);assert.equal(Object.values(state().days)[0].length,3);assert.equal(state().cards['phy:t1:base'].lastRating,'good');
 const copy=state();dom.window.close();const next=fixture({storage:copy});await settle();assert.match(next.id('fcWrap').textContent,/No cards due now/);next.dom.window.close();
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
 storage.sessions.settings_phy={mode:'all',unit:'all',limit:0,controlsVersion:3};
 const {dom,id}=fixture({storage});await settle();assert.match(id('fcWrap').querySelector('h2').textContent,/Unit of force/);dom.window.close();
});
test('topic editor preserves IDs, aliases and inclusion through delete/undo and serialization',()=>{
 const dom=new JSDOM('<input id="fName" value="Forces"><textarea id="fDefinition">A push</textarea><div id="fqaList"></div>',{url:'https://studybase.example/subject/subject.html#phy',runScripts:'outside-only'}),w=dom.window;
 w.eval(read('flashcards-core.js'));w.eval(read('sync-config.generated.js')+'\n'+read('sync-config.js'));w.eval(read('subject/flashcards-editor.js'));w.initFlashcardEditor(topic);w.addFqaRow('Unit?','Newton',{id:'stable',enabled:false,acceptedAnswers:['N']});
 assert.equal(w.readFlashcardRows()[0].id,'stable');assert.equal(w.readFlashcardRows()[0].enabled,false);w.document.querySelector('.fqa-row button').click();assert.equal(w.readFlashcardRows().length,0);w.document.getElementById('flashcardUndo').click();assert.equal(w.readFlashcardRows()[0].acceptedAnswers[0],'N');
 const saved=w.serializeTopic({...topic,flashcardEnabled:false,flashcardQA:w.readFlashcardRows()});assert.equal(saved.flashcardEnabled,false);assert.equal(saved.flashcardQA[0].id,'stable');assert.equal(saved.flashcardQA[0].enabled,false);
 w.document.getElementById('fDefinition').value='';w.document.getElementById('fDefinition').dispatchEvent(new w.Event('input',{bubbles:true}));assert.match(w.document.getElementById('flashcardBasePreview').textContent,/no content/);dom.window.close();
});

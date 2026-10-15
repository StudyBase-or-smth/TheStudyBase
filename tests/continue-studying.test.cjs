const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const read=file=>fs.readFileSync(require.resolve('../'+file),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('Continue studying shows tool icons under project/task titles while retaining subject labels',async()=>{
  const dom=new JSDOM('<div id="hubSidebar"></div>',{url:'https://studybase.example/index.html',runScripts:'outside-only'}),w=dom.window;
  w.isGuest=true;w.matchMedia=()=>({matches:false});w.eval(read('qol.js'));await settle();
  w.SBQoL.recordActivity('Graph A','','Graphing tool','graphing.html?project=p1');
  w.SBQoL.recordActivity('Essay task','','Analyser Tool','analyser.html?task=name%3Aessay');
  w.SBQoL.recordActivity('Forces','Physics','Topics','subject/subject.html?topic=force#physics');
  const rows=[...w.document.querySelectorAll('#qol-continue .qol-result')];
  assert.equal(rows.length,3);assert.equal(rows[0].querySelector('.qol-muted').textContent,'Physics');
  assert.equal(rows[1].querySelector('strong').textContent,'Essay task');
  assert.equal(rows[1].querySelector('.qol-muted').textContent,' Analyser Tool');
  assert.equal(rows[2].querySelector('.qol-muted').textContent,' Graphing Tool');
  assert.match(rows[1].querySelector('img').src,/icons\/tools\/analyser.svg$/);
  assert.match(rows[2].querySelector('img').src,/icons\/tools\/graphing.svg$/);
  assert.equal(new URL(rows[2].href).searchParams.get('project'),'p1');
  w.isGuest=false;w.currentUid='student1';w.SBQoL.refreshContinue();assert.equal(w.document.querySelectorAll('#qol-continue .qol-result').length,0);
  dom.window.close();
});

test('analyser deep links restore a named task and rename/delete maintain recent activity',async()=>{
  const task='name:essay';
  const dom=new JSDOM(read('analyser.html'),{url:'https://studybase.example/analyser.html?task='+encodeURIComponent(task),runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
  w.matchMedia=()=>({matches:false});w.pdfjsLib={GlobalWorkerOptions:{}};w.confirm=()=>true;
  const user={uid:'student1',getIdTokenResult:async()=>({claims:{role:'student',status:'active'}})},auth={currentUser:user};
  w.bootHdrProfile=()=>{w.currentUid=user.uid;};w.sbLoadKey=async()=>null;
  w.testImport=async url=>url.includes('firebase-app')?{initializeApp:()=>({})}:url.includes('firebase-auth')?{getAuth:()=>auth,onAuthStateChanged:(a,cb)=>Promise.resolve().then(()=>cb(user)),signOut:async()=>{}}:{loadFirebaseConfig:async()=>({})};
  w.localStorage.setItem('studybase_grader_history_v2',JSON.stringify({tasks:{[task]:{id:task,name:'Essay',entries:[]}},currentTaskId:'_scratch'}));
  w.localStorage.setItem('studybase_analyser_draft',JSON.stringify({currentTaskId:'_scratch',byTask:{[task]:{taskName:'Essay',assignmentMode:'text',studentText:'Saved assignment',criteriaMode:'text',criteriaText:'Saved criteria'}}}));
  const scripts=[...w.document.querySelectorAll('script:not([src])')];
  const main=scripts.find(s=>s.textContent.includes("let activeTaskId='_scratch'"));w.eval(main.textContent.replaceAll('import(', 'window.testImport('));
  w.eval(read('qol.js'));await settle();await settle();
  w.resumeRequestedTask();w.recordAnalyserTask();
  assert.equal(w.document.getElementById('taskSelect').value,task);assert.equal(w.document.getElementById('studentText').value,'Saved assignment');
  let recent=JSON.parse(w.localStorage.getItem('sbq:student1:recent'));assert.equal(recent[0].name,'Essay');assert.equal(new URL(recent[0].href).searchParams.get('task'),task);
  w.prompt=()=> 'Renamed essay';w.renameTask(task);
  recent=JSON.parse(w.localStorage.getItem('sbq:student1:recent'));assert.equal(recent.length,1);assert.equal(recent[0].name,'Renamed essay');assert.equal(new URL(recent[0].href).searchParams.get('task'),'name:renamed essay');
  w.removeTask('name:renamed essay');assert.equal(JSON.parse(w.localStorage.getItem('sbq:student1:recent')).length,0);
  await settle();dom.window.close();
});

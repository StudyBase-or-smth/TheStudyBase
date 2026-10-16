const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const source=html.match(/<script type="module">\s*import \{ initializeApp \}[\s\S]*?<\/script>/)[0].replace(/<\/?script[^>]*>/g,'').replace(/^\s*import\b[\s\S]*?;/gm,'');
const settle=()=>new Promise(resolve=>setImmediate(resolve));

async function fixture(){
  const events=[],auth={currentUser:null};
  const context=vm.createContext({
    document:{getElementById:()=>null},location:{href:'index.html'},
    localStorage:{setItem(){}},sessionStorage:{getItem:()=>null,removeItem(){}},
    initializeApp:()=>({}),loadFirebaseConfig:async()=>({}),getAuth:()=>auth,
    onAuthStateChanged(_auth,callback){context.callback=callback;},
    renderClasses(){events.push(context.isTeacher?'show':'hide');},
    onHubAuthReady(uid){events.push('ready:'+uid);},
    signOut:async()=>{}
  });context.window=context;
  await vm.runInContext(`(async()=>{${source}})()`,context);
  return {context,auth,events};
}

test('classes stay hidden until fresh approval and role claims resolve',async()=>{
  const {context,auth,events}=await fixture();let resolve;
  const user={uid:'teacher',getIdTokenResult(force){assert.equal(force,true);return new Promise(r=>resolve=r);}};
  auth.currentUser=user;context.callback(user);assert.equal(context.isTeacher,false);assert.deepEqual(events,['hide']);
  resolve({claims:{role:'teacher',status:'active'}});await settle();
  assert.equal(context.isTeacher,true);assert.equal(context.userRole,'teacher');assert.ok(events.includes('ready:teacher'));
});

test('pending, missing, failed and stale claims never enable classes',async()=>{
  for(const claims of [{role:'teacher',status:'pending'},{role:'dev'},null]){
    const {context,auth,events}=await fixture();
    const user={uid:'teacher',getIdTokenResult:()=>claims?Promise.resolve({claims}):Promise.reject(Error('Refresh failed'))};
    auth.currentUser=user;context.callback(user);await settle();
    assert.equal(context.isTeacher,false);assert.ok(!events.some(e=>e.startsWith('ready:')));assert.equal(context.location.href,'waiting.html');
  }
  const {context,auth,events}=await fixture();let resolve;
  const user={uid:'old-account',getIdTokenResult:()=>new Promise(r=>resolve=r)};
  auth.currentUser=user;context.callback(user);auth.currentUser=null;context.callback(null);
  resolve({claims:{role:'teacher',status:'active'}});await settle();
  assert.equal(context.isTeacher,false);assert.ok(!events.includes('ready:old-account'));assert.equal(context.location.href,'login.html');
});

test('verified classes render before cover downloads and other profile UI updates',()=>{
  const events=[],context=vm.createContext({
    applyProfileCache:()=>events.push('cache'),renderClasses:()=>events.push('classes'),
    SBSubjectCards:{load:()=>events.push('covers')},SBQoL:{refreshContinue:()=>events.push('continue')},
    renderSubjects:()=>events.push('subjects'),renderStats(){},renderSidebar(){},updateHdrProfile(){},
    subjectsData:{subjects:[]},classesData:{subjects:[]}
  });context.window=context;
  const app=fs.readFileSync('mainapp.js','utf8');vm.runInContext(app.slice(app.indexOf('window.onHubAuthReady ='),app.indexOf('// ── Init')),context);
  context.onHubAuthReady('teacher');assert.deepEqual(events,['cache','classes','covers','continue','subjects']);
});

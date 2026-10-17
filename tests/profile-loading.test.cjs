const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('profile.html','utf8'),tick=()=>new Promise(r=>setImmediate(r));
function fixture(){
  const loads=[],renders=[];
  const context=vm.createContext({readCachedProfile:uid=>({uid}),buildProfile(){renders.push(context.state());},sbLoadAllContentKeys(){return new Promise((resolve,reject)=>loads.push({resolve,reject}));}});
  vm.runInContext(html.slice(html.indexOf('let profileCtx = null;'),html.indexOf('function formatDate('))+'\nfunction state(){return profileCtx;}function edit(){profileCtx.editing=true;editDraft={name:"Unsaved"};}function draft(){return editDraft;}',context);
  return {context,loads,renders,boot:uid=>context.bootProfile('Name','email',uid,false,'student','active')};
}
test('cached profile renders immediately and profile sync reuses the same background content request',async()=>{
  const f=fixture();f.boot('a');assert.equal(f.renders.length,1);await tick();assert.equal(f.loads.length,1);
  f.boot('a');await tick();assert.equal(f.loads.length,1);assert.equal(f.renders.length,2);
  f.loads[0].resolve();await tick();assert.equal(f.renders.length,3);
  f.boot('a');await tick();assert.equal(f.loads.length,1);
});
test('background updates preserve open edits and ignore stale account completions or offline failures',async()=>{
  const f=fixture();f.boot('a');await tick();f.context.edit();f.boot('a');f.loads[0].resolve();await tick();
  assert.equal(f.renders.length,1);assert.equal(f.context.draft().name,'Unsaved');
  f.boot('b');await tick();f.boot('c');await tick();const count=f.renders.length;
  f.loads[1].resolve();await tick();assert.equal(f.renders.length,count);
  f.loads[2].reject(Error('offline'));await tick();assert.equal(f.context.state().uid,'c');assert.equal(f.renders.length,count);
});
test('profile rendering still waits for a forced refresh of permission claims',async()=>{
  const source=html.match(/<script type="module">[\s\S]*?<\/script>/)[0].replace(/<\/?script[^>]*>/g,'').replace(/^\s*import\b[\s\S]*?;/gm,'');
  let callback,resolveClaims,forced,renders=0;
  const context=vm.createContext({initializeApp:()=>({}),loadFirebaseConfig:async()=>({}),getAuth:()=>({}),onAuthStateChanged(auth,cb){callback=cb;},signOut(){},sessionStorage:{getItem:()=>null},localStorage:{getItem:()=>true,setItem(){}},bootProfile(...args){renders++;assert.equal(args[4],'student');assert.equal(args[5],'pending');}});context.window=context;
  await vm.runInContext('(async()=>{'+source+'})()',context);
  const pending=callback({uid:'a',email:'a@example.com',getIdTokenResult(force){forced=force;return new Promise(resolve=>resolveClaims=resolve);}});
  assert.equal(forced,true);assert.equal(renders,0);resolveClaims({claims:{role:'student'}});await pending;assert.equal(renders,1);
});

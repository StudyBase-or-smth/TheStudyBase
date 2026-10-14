const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const project=require('../graphing.js');
const graph={v:1,expressions:[{id:'f',text:'𝑦 = 𝑥² + π',color:'#2d70b3'}],viewport:{xmin:-5,xmax:5,ymin:-2,ymax:8}};

test('shared links round-trip Unicode formulas and contain only authored graph data',()=>{
  const result=project.decodeShare(project.encodeShare({name:'Curve π',graph:{...graph,probes:{x:5},viewerValues:{a:99}}}));
  assert.equal(result.name,'Curve π');assert.equal(result.graph.expressions[0].text,graph.expressions[0].text);
  assert.equal(result.graph.probes,undefined);assert.equal(result.graph.viewerValues,undefined);
  assert.deepEqual(result.graph.viewport,graph.viewport);
});

test('invalid shared data and oversized expressions are rejected',()=>{
  for(const value of ['!bad','abc','A'.repeat(100001)])assert.throws(()=>project.decodeShare(value));
  assert.throws(()=>project.cleanGraph({v:1,expressions:[{text:'x'.repeat(501)}]}));
  assert.throws(()=>project.cleanGraph({v:1,expressions:Array(101).fill({text:'x'})}));
});

function fixture(url='https://studybase.example/graphing.html',storage,mobile=false){
  const dom=new JSDOM(fs.readFileSync(require.resolve('../graphing.html'),'utf8'),{url,runScripts:'outside-only'}),w=dom.window,sessions=[];
  w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.confirm=()=>true;
  w.matchMedia=()=>({matches:mobile,addEventListener(){}});
  w.isGuest=true;
  w.eval(fs.readFileSync(require.resolve('../profile-store.js'),'utf8'));
  if(storage)w.localStorage.setItem('studybase_graphing_projects_v1',storage);
  w.StudyGraph={async create(container,options){const data=JSON.parse(JSON.stringify(options.state));const editor={data,options,getState(){return data;},destroy(){}};sessions.push(editor);return editor;}};
  const dialog=w.document.getElementById('shareDialog');dialog.showModal=()=>dialog.open=true;dialog.close=()=>dialog.open=false;
  w.eval(fs.readFileSync(require.resolve('../graphing.js'),'utf8'));
  return {dom,w,sessions,byId:id=>w.document.getElementById(id)};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('mobile projects drawer manages focus, dismissal, and background interaction',async()=>{
  const {dom,w,byId}=fixture(undefined,undefined,true);await settle();
  assert.equal(byId('projectsSidebar').hidden,true);
  byId('toggleProjects').click();
  assert.equal(byId('projectsSidebar').getAttribute('aria-modal'),'true');
  assert.equal(w.document.querySelector('.graphing-main').inert,true);
  assert.equal(w.document.activeElement,byId('closeProjects'));
  byId('newProject').focus();w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Tab',cancelable:true}));
  assert.equal(w.document.activeElement,byId('closeProjects'));
  w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape'}));
  assert.equal(byId('projectsSidebar').hidden,true);
  assert.equal(w.document.querySelector('.graphing-main').inert,false);
  assert.equal(w.document.activeElement,byId('toggleProjects'));
  byId('toggleProjects').click();byId('projectsScrim').click();
  assert.equal(byId('toggleProjects').getAttribute('aria-expanded'),'false');
  dom.window.close();
});

test('desktop collapse and theme use persistent preferences without changing project state',async()=>{
  const {dom,w,byId}=fixture();await settle();
  byId('toggleProjects').click();assert.equal(byId('projectsSidebar').hidden,true);
  assert.equal(w.localStorage.getItem('studybase_graphing_sidebar_collapsed'),'1');
  byId('toggleProjects').click();assert.equal(byId('projectsSidebar').hidden,false);
  w.toggleDark();assert.equal(w.document.body.classList.contains('dark'),true);
  assert.equal(w.localStorage.getItem('studybase_dark'),'1');
  assert.equal(w.document.querySelector('.pt-dark').textContent,'☀️');
  assert.equal(byId('projectState').textContent,'Unsaved project');
  dom.window.close();
});

test('shared profile and settings popovers support keyboard dismissal and scoped preferences',async()=>{
  const {dom,w,byId}=fixture();await settle();
  for(const file of ['qol.js','graphing-shell.js'])w.eval(fs.readFileSync(require.resolve('../'+file),'utf8'));
  const profile=byId('hdrProfileTip'),settings=w.document.querySelector('.qol-settings-button'),menu=w.document.querySelector('.qol-settings-menu');
  assert.equal(profile.inert,true);assert.equal(menu.inert,true);
  assert.equal(w.document.querySelector('.hdr-profile-wrap').nextElementSibling.className,'qol-settings-wrap');
  byId('hdrProfileBtn').click();assert.equal(profile.inert,false);
  profile.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(profile.inert,true);assert.equal(w.document.activeElement,byId('hdrProfileBtn'));
  settings.click();assert.equal(menu.inert,false);
  const width=menu.querySelector('select');width.value='wide';width.dispatchEvent(new w.Event('change'));
  assert.equal(w.document.body.classList.contains('qol-wide'),true);
  assert.equal(JSON.parse(w.localStorage.getItem('sbq:guest:preferences')).width,'wide');
  menu.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(menu.inert,true);assert.equal(w.document.activeElement,settings);
  dom.window.close();
});

test('unavailable account services leave local graphing and guest settings usable',async()=>{
  const {dom,w,byId}=fixture();await settle();
  w.localStorage.setItem('studybase_email','previous-user@example.com');
  w.loadAccountDependency=async()=>{throw Error('Offline');};
  const source=fs.readFileSync(require.resolve('../graphing-account.js'),'utf8').replaceAll('import(', 'window.loadAccountDependency(');
  await w.eval('(async()=>{'+source+'})()');
  assert.match(byId('graphingAccountStatus').textContent,/Local graphing is still available/);
  assert.equal(byId('saveProject').disabled,false);
  assert.equal(byId('hdrProfileTip').textContent.includes('previous-user@example.com'),false);
  assert.equal(w.isGuest,true);
  byId('saveProject').click();assert.equal(JSON.parse(w.localStorage.getItem('studybase_graphing_projects_v1')).projects.length,1);
  dom.window.close();
});

test('projects save, reopen, rename and delete; viewing never saves temporary graph state',async()=>{
  const {dom,w,sessions,byId}=fixture();await settle();
  byId('projectName').value='My parabola';byId('projectName').dispatchEvent(new w.Event('input'));
  sessions.at(-1).data.expressions[0].text='y = 2*x^2';sessions.at(-1).options.onChange();
  byId('saveProject').click();await settle();
  let saved=JSON.parse(w.localStorage.getItem('studybase_graphing_projects_v1')).projects;
  assert.equal(saved.length,1);assert.equal(saved[0].name,'My parabola');assert.equal(saved[0].graph.expressions[0].text,'y = 2*x^2');
  byId('viewProject').click();await settle();assert.equal(sessions.at(-1).options.readOnly,true);
  sessions.at(-1).data.expressions[0].text='viewer change';sessions.at(-1).options.onChange();
  byId('saveProject').click();await settle();saved=JSON.parse(w.localStorage.getItem('studybase_graphing_projects_v1')).projects;
  assert.equal(saved[0].graph.expressions[0].text,'y = 2*x^2');
  byId('newProject').click();await settle();byId('saveProject').click();await settle();
  assert.equal(byId('projectList').querySelectorAll('button').length,2);
  [...byId('projectList').querySelectorAll('button')].find(b=>b.textContent.includes('My parabola')).click();await settle();
  assert.equal(byId('projectName').value,'My parabola');assert.equal(sessions.at(-1).data.expressions[0].text,'y = 2*x^2');
  byId('deleteProject').click();await settle();assert.equal(byId('projectList').querySelectorAll('button').length,1);
  dom.window.close();
});

test('sharing opens a readonly snapshot and Save a copy creates an independent project',async()=>{
  const encoded=project.encodeShare({name:'Shared curve',graph});
  const {dom,w,sessions,byId}=fixture('https://studybase.example/graphing.html#graph='+encoded);await settle();
  assert.equal(sessions.at(-1).options.readOnly,true);assert.equal(byId('viewProject').hidden,true);assert.equal(byId('saveProject').textContent,'Save a copy');
  sessions.at(-1).data.expressions[0].text='temporary viewer state';
  byId('shareProject').click();assert.equal(byId('shareDialog').open,true);
  const link=new URL(byId('shareLink').value),snapshot=project.decodeShare(new URLSearchParams(link.hash.slice(1)).get('graph'));
  assert.equal(snapshot.graph.expressions[0].text,graph.expressions[0].text);
  byId('saveProject').click();await settle();
  const saved=JSON.parse(w.localStorage.getItem('studybase_graphing_projects_v1')).projects;
  assert.equal(saved.length,1);assert.equal(saved[0].graph.expressions[0].text,graph.expressions[0].text);
  assert.equal(sessions.at(-1).options.readOnly,false);assert.equal(w.location.hash,'');
  dom.window.close();
});

test('storage failure does not report a successful save or discard the draft',async()=>{
  const {dom,w,sessions,byId}=fixture();await settle();
  sessions.at(-1).options.onChange();
  w.Storage.prototype.setItem=()=>{throw Error('Storage full');};
  byId('saveProject').click();await settle();assert.equal(byId('graphingStatus').dataset.error,'true');assert.equal(byId('projectState').textContent,'Unsaved changes');
  dom.window.close();
});

test('dedicated page mounts a real SVG graph, saves it and explores linked values',async()=>{
  const path=require('node:path');
  const dom=new JSDOM(fs.readFileSync(require.resolve('../graphing.html'),'utf8'),{url:'https://studybase.example/graphing.html',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
  w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
  w.CSS={escape:s=>String(s).replace(/[^a-zA-Z0-9_-]/g,'_')};
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  for(const file of ['jsxgraph/distrib/jsxgraphcore.js','mathjs/lib/browser/math.js'])w.eval(fs.readFileSync(path.resolve(__dirname,'../node_modules',file),'utf8'));
  w.eval(fs.readFileSync(require.resolve('../subject/graph-editor.js'),'utf8'));
  w.eval(fs.readFileSync(require.resolve('../graphing.js'),'utf8'));await settle();
  assert.equal(w.document.querySelectorAll('#graphingCanvas svg').length,1);
  w.document.getElementById('saveProject').click();await settle();
  w.document.getElementById('viewProject').click();await settle();
  const x=w.document.querySelector('[data-variable="x"]'),y=w.document.querySelector('[data-variable="y"]');assert.ok(x&&y);
  x.value='3';x.dispatchEvent(new w.Event('input'));assert.equal(y.value,'9');
  assert.equal(JSON.parse(w.localStorage.getItem('studybase_graphing_projects_v1')).projects[0].graph.expressions[0].text,'y = x^2');
  assert.ok([...w.document.querySelectorAll('.graph-error')].every(e=>!e.textContent));
  w.close();
});

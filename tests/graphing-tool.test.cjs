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

function fixture(url='https://studybase.example/graphing.html',storage,mobile=false,recovery){
  const dom=new JSDOM(fs.readFileSync(require.resolve('../graphing.html'),'utf8'),{url,runScripts:'outside-only'}),w=dom.window,sessions=[];
  w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.confirm=()=>true;
  w.matchMedia=()=>({matches:mobile,addEventListener(){}});
  w.isGuest=true;
  w.eval(fs.readFileSync(require.resolve('../profile-store.js'),'utf8'));
  w.eval(fs.readFileSync(require.resolve('../profile-tooltip.js'),'utf8'));
  if(storage)w.localStorage.setItem('studybase_graphing_projects_v1',storage);
  if(recovery)w.localStorage.setItem('studybase_graphing_recovery_v1',recovery);
  w.StudyGraph={async create(container,options){container.innerHTML='<div class="graph-expressions"></div><div class="graph-right"></div>';const data=JSON.parse(JSON.stringify(options.state));const editor={data,options,getState(){return data;},destroy(){}};sessions.push(editor);return editor;}};
  w.document.querySelectorAll('dialog').forEach(dialog=>{dialog.showModal=()=>dialog.open=true;dialog.close=()=>dialog.open=false;});
  w.eval(fs.readFileSync(require.resolve('../graphing.js'),'utf8'));
  return {dom,w,sessions,byId:id=>w.document.getElementById(id)};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('project picker replaces navigation sidebar and theme retains site preferences',async()=>{
  const {dom,w,byId}=fixture();await settle();
  assert.equal(w.document.querySelector('aside'),null);
  byId('openProjects').click();assert.equal(byId('projectsDialog').open,true);
  byId('closeProjects').click();assert.equal(byId('projectsDialog').open,false);
  w.toggleDark();assert.equal(w.document.body.classList.contains('dark'),true);
  assert.equal(w.localStorage.getItem('studybase_dark'),'1');
  assert.equal(byId('projectState').textContent,'Unsaved project');dom.window.close();
});

test('Continue studying resumes the exact graph project and records changes in the active account',async()=>{
  const graph={v:1,expressions:[{id:'f',text:'y = x',color:'#2d70b3'}]};
  const storage=JSON.stringify({v:1,projects:[{id:'p1',name:'First graph',updatedAt:1,graph},{id:'p2',name:'Latest graph',updatedAt:2,graph}]});
  const recovery=JSON.stringify({v:1,id:'p2',name:'Other recovery',updatedAt:3,graph});
  const {dom,w,byId}=fixture('https://studybase.example/graphing.html?project=p1',storage,false,recovery);await settle();
  assert.equal(byId('projectName').value,'First graph');
  assert.equal(JSON.parse(w.localStorage.getItem('studybase_graphing_recovery_v1')).id,'p2');
  w.eval(fs.readFileSync(require.resolve('../qol.js'),'utf8'));
  w.isGuest=false;w.currentUid='student1';w.dispatchEvent(new w.Event('studybase-account-ready'));
  let recent=JSON.parse(w.localStorage.getItem('sbq:student1:recent'));assert.equal(recent[0].name,'First graph');assert.equal(new URL(recent[0].href).searchParams.get('project'),'p1');
  byId('projectName').value='Renamed graph';byId('projectName').dispatchEvent(new w.Event('input'));byId('saveProject').click();
  recent=JSON.parse(w.localStorage.getItem('sbq:student1:recent'));assert.equal(recent.length,1);assert.equal(recent[0].name,'Renamed graph');
  byId('deleteProject').click();await settle();recent=JSON.parse(w.localStorage.getItem('sbq:student1:recent'));assert.equal(recent.length,1);assert.equal(new URL(recent[0].href).searchParams.get('project'),'p2');
  await settle();dom.window.close();
});

test('compact mobile project actions retain handlers and dismiss with Escape',async()=>{
  const {dom,w,sessions,byId}=fixture(undefined,undefined,true);await settle();
  for(const file of ['qol.js','graphing-shell.js'])w.eval(fs.readFileSync(require.resolve('../'+file),'utf8'));
  const actions=byId('projectActions'),summary=actions.querySelector('summary');
  actions.open=true;byId('viewProject').click();await settle();
  assert.equal(sessions.at(-1).options.readOnly,true);assert.equal(actions.open,false);
  actions.open=true;byId('exportImage').click();
  assert.equal(byId('imageDialog').open,true);assert.equal(actions.open,false);
  byId('closeImage').click();actions.open=true;summary.focus();
  actions.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(actions.open,false);assert.equal(w.document.activeElement,summary);
  await settle();dom.window.close();
});

test('shared profile and settings popovers support keyboard dismissal and scoped preferences',async()=>{
  const {dom,w,byId}=fixture();await settle();
  // The tooltip works independently of the general page utilities.
  w.initProfileTooltip();w.initProfileTooltip();w.bootHdrProfile(null,'guest');await settle();
  assert.equal(byId('hdrProfileTip').querySelectorAll('.qol-view-profile').length,1);
  assert.equal(byId('hdrProfileTip').querySelector('.qol-view-profile').href,'https://studybase.example/profile.html');
  assert.match(byId('hdrProfileTip').textContent,/Guest/);
  assert.ok(byId('hdrProfileTip').contains(byId('hdrNotifyWrap')));
  for(const file of ['qol.js','graphing-shell.js'])w.eval(fs.readFileSync(require.resolve('../'+file),'utf8'));
  const profile=byId('hdrProfileTip'),settings=w.document.querySelector('.qol-settings-button'),menu=w.document.querySelector('.qol-settings-menu');
  assert.equal(profile.inert,true);assert.equal(menu.inert,true);
  assert.equal(w.document.querySelector('.hdr-profile-wrap').nextElementSibling.className,'qol-settings-wrap');
  byId('hdrProfileBtn').click();assert.equal(profile.inert,false);
  profile.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(profile.inert,true);assert.equal(w.document.activeElement,byId('hdrProfileBtn'));
  settings.click();assert.equal(menu.inert,false);
  const density=menu.querySelector('select');density.value='compact';density.dispatchEvent(new w.Event('change'));
  assert.equal(w.document.body.classList.contains('qol-compact'),true);
  assert.equal(JSON.parse(w.localStorage.getItem('sbq:guest:preferences')).density,'compact');
  menu.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(menu.inert,true);assert.equal(w.document.activeElement,settings);
  await settle();
  dom.window.close();
});

test('project files round-trip authored data and reject incompatible or oversized files',()=>{
  const input={name:'Exported curve',graph:{...graph,viewerValues:{x:100}}};
  const restored=project.importData(project.exportData(input));
  assert.equal(restored.name,input.name);assert.equal(restored.graph.viewerValues,undefined);
  assert.deepEqual(restored.graph.viewport,graph.viewport);
  for(const text of ['bad','{}',JSON.stringify({type:'StudyBaseGraph',v:2,...input}), 'x'.repeat(1000001)])assert.throws(()=>project.importData(text));
});

test('edits autosave and a newer journal recovers instead of losing the draft',async()=>{
  const {dom,w,sessions,byId}=fixture();await settle();
  byId('projectName').value='Autosaved curve';byId('projectName').dispatchEvent(new w.Event('input'));
  sessions.at(-1).data.expressions[0].text='y = 4*x';sessions.at(-1).options.onChange();
  assert.equal(JSON.parse(w.localStorage.getItem('studybase_graphing_recovery_v1')).graph.expressions[0].text,'y = 4*x');
  await new Promise(resolve=>setTimeout(resolve,800));
  const storage=w.localStorage.getItem('studybase_graphing_projects_v1'),saved=JSON.parse(storage).projects[0];
  assert.equal(saved.name,'Autosaved curve');assert.equal(w.localStorage.getItem('studybase_graphing_recovery_v1'),null);
  const recovery=JSON.stringify({v:1,id:saved.id,updatedAt:saved.updatedAt+10,name:'Recovered curve',graph:{...graph,expressions:[{id:'f',text:'y = 7*x',color:'#2d70b3'}]}});
  dom.window.close();const next=fixture(undefined,storage,false,recovery);await settle();
  assert.equal(next.byId('projectName').value,'Recovered curve');assert.match(next.byId('graphingStatus').textContent,/Recovered/);
  next.byId('saveProject').click();assert.equal(JSON.parse(next.w.localStorage.getItem('studybase_graphing_projects_v1')).projects.length,1);
  next.dom.window.close();
});

test('duplicate and import create independent projects without modifying the original',async()=>{
  const {dom,w,sessions,byId}=fixture();await settle();byId('saveProject').click();
  byId('duplicateProject').click();await settle();
  let saved=JSON.parse(w.localStorage.getItem('studybase_graphing_projects_v1')).projects;
  assert.equal(saved.length,2);assert.notEqual(saved[0].id,saved[1].id);assert.match(saved[1].name,/copy/);
  sessions.at(-1).data.expressions[0].text='y = 99';sessions.at(-1).options.onChange();byId('saveProject').click();
  saved=JSON.parse(w.localStorage.getItem('studybase_graphing_projects_v1')).projects;assert.equal(saved[0].graph.expressions[0].text,'y = x^2');
  const file={size:100,text:async()=>project.exportData({name:'Imported curve',graph})};
  Object.defineProperty(byId('projectFile'),'files',{value:[file],configurable:true});
  await byId('projectFile').onchange();await settle();
  saved=JSON.parse(w.localStorage.getItem('studybase_graphing_projects_v1')).projects;assert.equal(saved.length,3);assert.equal(byId('projectName').value,'Imported curve');
  dom.window.close();
});

test('failed autosave retains a recovery draft and corrupted libraries are never overwritten',async()=>{
  const {dom,w,sessions,byId}=fixture();await settle();
  const set=w.Storage.prototype.setItem;w.Storage.prototype.setItem=function(key,value){if(key==='studybase_graphing_projects_v1')throw Error('Storage full');return set.call(this,key,value);};
  sessions.at(-1).data.expressions[0].text='y = 8*x';sessions.at(-1).options.onChange();byId('saveProject').click();
  assert.equal(byId('projectState').textContent,'Unsaved changes');assert.equal(JSON.parse(w.localStorage.getItem('studybase_graphing_recovery_v1')).graph.expressions[0].text,'y = 8*x');dom.window.close();
  const next=fixture(undefined,'broken');await settle();next.byId('saveProject').click();
  assert.equal(next.w.localStorage.getItem('studybase_graphing_projects_v1'),'broken');assert.equal(next.byId('graphingStatus').dataset.error,'true');next.dom.window.close();
});

test('resizing and collapsing the expression panel preserves authored formulas',async()=>{
  const {dom,w,sessions,byId}=fixture();await settle();
  const separator=w.document.querySelector('[role="separator"]');assert.ok(separator);
  separator.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',cancelable:true}));
  assert.equal(separator.getAttribute('aria-valuenow'),'310');
  assert.equal(JSON.parse(w.localStorage.getItem('studybase_graphing_layout_v1')).width,310);
  byId('toggleExpressions').click();assert.equal(w.document.querySelector('.graph-expressions').hidden,true);
  byId('toggleExpressions').click();assert.equal(w.document.querySelector('.graph-expressions').hidden,false);
  assert.equal(sessions.at(-1).data.expressions[0].text,'y = x^2');
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
  const downloads=[];w.URL.createObjectURL=blob=>{downloads.push(blob);return 'blob:test';};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=()=>{};
  w.document.getElementById('imageFormat').value='svg';
  w.document.getElementById('imageWidth').value='1200';
  await w.document.getElementById('downloadImage').onclick();
  assert.equal(downloads.length,1);
  const text=await new Promise((resolve,reject)=>{const reader=new w.FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsText(downloads[0]);});
  const svg=new w.DOMParser().parseFromString(text,'image/svg+xml');
  assert.equal(svg.querySelector('parsererror'),null,svg.querySelector('parsererror')?.textContent);assert.equal(svg.documentElement.getAttribute('width'),'1200');
  assert.ok(svg.querySelector('path'));assert.ok(svg.querySelector('text'));assert.match(w.document.getElementById('imageStatus').textContent,/exported/);
  // Exercise the browser rasterisation pipeline without requiring a native
  // canvas in jsdom; SVG geometry above is produced by the real graph editor.
  let drawn=false;
  w.Image=class{constructor(){this.width=1200;this.height=900;}set src(value){queueMicrotask(()=>this.onload());}};
  w.HTMLCanvasElement.prototype.getContext=()=>({drawImage(){drawn=true;}});
  w.HTMLCanvasElement.prototype.toBlob=function(callback,type){assert.equal(this.width,1200);assert.equal(this.height,900);callback(new w.Blob(['png'],{type}));};
  w.document.getElementById('imageFormat').value='png';await w.document.getElementById('downloadImage').onclick();
  assert.equal(drawn,true);assert.equal(downloads.at(-1).type,'image/png');
  const count=downloads.length;
  w.document.getElementById('imageWidth').value='99999';await w.document.getElementById('downloadImage').onclick();assert.equal(downloads.length,count);
  assert.match(w.document.getElementById('imageStatus').textContent,/320 to 4096/);
  w.close();
});

const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom'),core=require('../knowledge-graph-core');
const read=path=>fs.readFileSync(path,'utf8'),settle=()=>new Promise(resolve=>setImmediate(resolve));
const topics=[{id:'a',name:'Area',unit:'u',knowledgeGraphIncluded:true},{id:'b',name:'Stress',unit:'u',knowledgeGraphIncluded:true},{id:'c',name:'Hidden topic',knowledgeGraphIncluded:false}];
function fixture({editable=true,memory={},offline=false,deck=topics}={}){
  const dom=new JSDOM('<button id="btnKnowledgeGraph">Knowledge graph</button><input id="fName" value="Draft topic"><button id="fKnowledgeGraph">Knowledge graph</button><button type="button" class="qol-button danger" id="fKnowledgeGraphRemove">Remove</button><p id="knowledgeEditorHint"></p><div id="knowledgeEditorPrerequisites" class="knowledge-prerequisites"></div>',{url:'https://studybase.example/subject/subject.html#eng2',runScripts:'outside-only'}),w=dom.window,writes=[];
  w.__sbAuth={currentUser:{uid:'owner'}};w.sbMemGet=(key,fallback)=>memory[key]||fallback;w.sbMemSet=(key,value)=>memory[key]=JSON.parse(JSON.stringify(value));w.sbLoadKey=async()=>null;
  w.sbPushToSync=async(key,value)=>{if(offline)throw Error('Offline');writes.push({key,value:JSON.parse(JSON.stringify(value))});};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  w.eval(read('knowledge-graph-core.js'));w.eval(read('subject/knowledge-graph.js'));
  w.StudyKnowledgeGraph.init({isEditing:()=>w.editing===true,newId:()=> 'draft-new',editorTopic:button=>({id:button.dataset.topicId,name:w.document.getElementById('fName').value,unit:'u'}),context(origin){const kind=origin?'class':'subject';return {key:'knowledge_'+kind+'_'+(origin||'eng2'),name:origin||'Engineering',kind,topics:()=>deck,canEdit:()=>editable,topicURL:id=>'https://studybase.example/subject/'+(origin?'class':'subject')+'.html?topic='+id+'#'+(origin||'eng2'),openTopic:id=>w.opened=id};}});
  return {dom,w,writes,memory,$:selector=>w.document.querySelector(selector),async open(id,origin){w.StudyKnowledgeGraph.open(id,origin);await settle();},setOffline(value){offline=value;}};
}

test('dependency core rejects self-links, duplicates and cycles and arranges prerequisites first',()=>{
  const edges=[{from:'a',to:'b'},{from:'b',to:'c'}];assert.match(core.connectionError(edges,'a','a'),/itself/);assert.match(core.connectionError(edges,'a','b'),/already/);assert.match(core.connectionError(edges,'c','a'),/circular/);
  const p=core.arrange(topics,edges);assert.ok(p.a.x<p.b.x&&p.b.x<p.c.x);
  const normalized=core.normalize({edges:[...edges,{from:'gone',to:'a'}],positions:{gone:{x:0,y:0}}},['a','b']);assert.deepEqual(normalized.edges,[{from:'a',to:'b'}]);assert.equal(normalized.positions.gone,undefined);assert.equal(normalized.enabled,true);
});

test('knowledge inclusion survives topic normalization and serialization in all topic layouts',()=>{
  const dom=new JSDOM('',{url:'https://studybase.example/',runScripts:'outside-only'}),w=dom.window;
  w.eval(read('sync-config.generated.js')+'\n'+read('sync-config.js'));
  for(const layout of ['basic','overview','text','math','pdf','table']){const t=w.serializeTopic({id:'a',name:'Area',layout,knowledgeGraphIncluded:true});assert.equal(t.knowledgeGraphIncluded,true);assert.equal(w.normalizeTopic(t).knowledgeGraphIncluded,true);}
  assert.equal(w.normalizeTopic({id:'old',name:'Legacy'}).knowledgeGraphIncluded,false);dom.window.close();
});

test('visual handles create directed links, prohibit duplicates/cycles and support delete/undo/save',async()=>{
  const app=fixture();await app.open('a');const {$,w,writes,dom}=app;
  assert.equal(w.document.querySelectorAll('[data-node]').length,2);assert.equal(w.document.querySelector('[data-port]'),null);
  $('.kg-edit').click();assert.equal(w.document.querySelectorAll('[data-port]').length,4);
  $('[data-topic="a"][data-port="out"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  $('[data-topic="b"][data-port="in"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));assert.equal(w.document.querySelectorAll('.kg-edge').length,1);
  $('[data-topic="b"][data-port="out"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));$('[data-topic="a"][data-port="in"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));assert.match($('.kg-status').textContent,/circular/);
  $('.kg-dialog').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  $('.kg-edge-hit').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));$('.kg-details button').click();assert.equal($('.kg-edge'),null);$('.kg-undo').click();assert.ok($('.kg-edge'));
  $('.kg-save').click();await settle();assert.equal(writes.length,1);assert.equal(writes[0].key,'knowledge_subject_eng2');assert.deepEqual(writes[0].value.edges,[{from:'a',to:'b'}]);assert.ok(writes[0].value.positions.a);assert.equal($('.kg-edit').hidden,false);dom.window.close();
});

test('keyboard handles and node movement work without dragging; Cancel restores the saved graph',async()=>{
  const app=fixture();await app.open();const {$,w,dom,writes}=app;$('.kg-edit').click();
  const key=element=>element.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
  key($('[data-topic="a"][data-port="out"]'));key($('[data-topic="b"][data-port="in"]'));assert.ok($('.kg-edge'));
  const node=$('[data-node="a"]'),before=node.getAttribute('transform');node.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));assert.notEqual($('[data-node="a"]').getAttribute('transform'),before);
  $('.kg-cancel').click();assert.equal($('.kg-edge'),null);assert.equal(writes.length,0);dom.window.close();
});

test('beta is on by default, toggles independently for each collection and preserves topic inclusion',async()=>{
  const app=fixture();await app.open();const {$,w,memory,dom}=app;$('.kg-edit').click();const toggle=$('.kg-enable input');assert.equal(toggle.checked,true);toggle.click();$('.kg-save').click();await settle();assert.equal(memory.knowledge_subject_eng2.enabled,false);assert.equal(topics[0].knowledgeGraphIncluded,true);
  $('.kg-close').click();await app.open(null,'class-a');assert.equal($('.kg-enable input').checked,true);assert.equal($('.kg-svg').querySelectorAll('[data-node]').length,2);assert.equal(memory['knowledge_class_class-a'],undefined);dom.window.close();
});

test('read-only students cannot expose editing controls and topic quick links point to the origin',async()=>{
  const app=fixture({editable:false});await app.open('a','class-a');const {$,dom,w}=app;assert.equal($('.kg-edit').hidden,true);assert.equal($('.kg-enable input').disabled,true);assert.equal($('[data-port]'),null);assert.match($('.kg-details a').href,/class.html\?topic=a#class-a/);$('.kg-details a').click();assert.equal(w.opened,'a');assert.equal($('.kg-dialog'),null);dom.window.close();
});

test('offline saves retain a pending graph and retry it on reconnect',async()=>{
  const app=fixture({offline:true});await app.open();const {$,w,writes,dom}=app;$('.kg-edit').click();$('.kg-enable input').click();$('.kg-save').click();await settle();assert.match($('.kg-status').textContent,/Sync pending/);assert.ok(w.localStorage.getItem('sbkg:owner:knowledge_subject_eng2'));
  app.setOffline(false);w.dispatchEvent(new w.Event('online'));await settle();assert.equal(writes.length,1);assert.equal(w.localStorage.getItem('sbkg:owner:knowledge_subject_eng2'),null);dom.window.close();
});

test('pointer dragging connects handles and moves nodes with undo',async t=>{
  const app=fixture();t.after(()=>app.dom.window.close());await app.open();const {$,w}=app;$('.kg-edit').click();
  const pointer=(element,type,x,y)=>element.dispatchEvent(new w.MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:x,clientY:y}));
  pointer($('[data-topic="a"][data-port="out"]'),'pointerdown',100,100);
  pointer($('.kg-svg'),'pointermove',350,100);
  w.document.elementFromPoint=()=> $('[data-topic="b"][data-port="in"]');
  pointer($('.kg-svg'),'pointerup',350,100);assert.ok($('.kg-edge'));
  const before=$('[data-node="a"]').getAttribute('transform');
  pointer($('[data-node="a"]'),'pointerdown',100,100);pointer($('.kg-svg'),'pointermove',160,150);pointer($('.kg-svg'),'pointerup',160,150);
  assert.notEqual($('[data-node="a"]').getAttribute('transform'),before);$('.kg-undo').click();assert.equal($('[data-node="a"]').getAttribute('transform'),before);assert.ok($('.kg-edge'));
});

test('acknowledged offline edits restore cache after a stale download',async t=>{
  const app=fixture({offline:true});t.after(()=>app.dom.window.close());await app.open();const {$,memory,w}=app;
  $('.kg-edit').click();$('.kg-enable input').click();$('.kg-save').click();await settle();
  memory.knowledge_subject_eng2={v:1,enabled:true,positions:{},edges:[],updatedAt:0};
  app.setOffline(false);w.dispatchEvent(new w.Event('online'));await settle();
  assert.equal(memory.knowledge_subject_eng2.enabled,false);assert.equal($('#btnKnowledgeGraph').dataset.enabled,'false');
});

test('topic button opens a new draft node, confirms back to editing, and commits only with the topic',async t=>{
  const deck=structuredClone(topics),app=fixture({deck});t.after(()=>app.dom.window.close());const {$,w,writes,memory}=app;
  w.StudyKnowledgeGraph.setupEditor({});$('#fKnowledgeGraph').click();await settle();
  assert.equal($('.kg-save').textContent,'Confirm');assert.equal($('.kg-edit').hidden,true);
  assert.ok($('[data-node="draft-new"].is-selected'));assert.equal($('[data-node="draft-new"] title').textContent,'Draft topic');assert.equal($('[data-node="c"]'),null);$('.kg-add-topic').value='c';$('.kg-add-topic').dispatchEvent(new w.Event('change'));assert.ok($('[data-node="c"]'));
  const click=selector=>$(selector).dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  click('[data-topic="draft-new"][data-port="out"]');click('[data-topic="c"][data-port="in"]');$('.kg-save').click();
  assert.equal($('.kg-dialog'),null);assert.equal(w.document.activeElement,$('#fKnowledgeGraph'));assert.equal($('#fName').value,'Draft topic');assert.equal(writes.length,0);assert.equal(memory.knowledge_subject_eng2,undefined);
  const draft=$('#fKnowledgeGraph').knowledgeGraphDraft;assert.equal(draft.after.edges[0].to,'c');
  $('#fKnowledgeGraph').click();await settle();assert.ok($('.kg-edge'));$('.kg-cancel').click();assert.equal($('.kg-dialog'),null);assert.equal(writes.length,0);
  deck.push({id:'draft-new',name:'Draft topic',knowledgeGraphIncluded:true});
  await w.StudyKnowledgeGraph.saveDraft(draft);assert.equal(writes.length,1);assert.deepEqual(writes[0].value.edges,[{from:'draft-new',to:'c'}]);
  await app.open();assert.ok($('[data-node="c"]'));assert.ok($('.kg-edge'));
});

test('cancelling topic graph edits leaves inclusion and connection drafts unchanged',async t=>{
  const app=fixture();t.after(()=>app.dom.window.close());const {$,w,writes}=app;
  w.StudyKnowledgeGraph.setupEditor({id:'c'});$('#fKnowledgeGraph').click();await settle();
  $('[data-topic="c"][data-port="out"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));$('[data-topic="a"][data-port="in"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  $('.kg-close').click();assert.equal($('#fKnowledgeGraph').knowledgeGraphDraft,null);assert.equal($('#fKnowledgeGraph').dataset.included,'false');assert.equal(writes.length,0);
});

test('auto-arrange separates units, independent chains and all unconnected topics',()=>{
  const deck=[{id:'a',unit:'one'},{id:'b',unit:'one'},{id:'c',unit:'two'},{id:'d',unit:'two'},{id:'loose',unit:'one'},{id:'gray'},{id:'e',unit:'one'},{id:'f',unit:'one'}],edges=[{from:'a',to:'b'},{from:'b',to:'c'},{from:'c',to:'d'},{from:'e',to:'f'}];
  const p=core.arrange(deck,edges);for(const edge of edges)assert.ok(p[edge.from].x<p[edge.to].x);
  assert.ok(Math.min(p.c.y,p.d.y)-Math.max(p.a.y,p.b.y,p.e.y,p.f.y)>150);
  assert.ok(Math.min(p.loose.y,p.gray.y)-Math.max(...['a','b','c','d','e','f'].map(id=>p[id].y))>200);
  assert.ok(p.e.y-p.a.y>150);assert.deepEqual(core.arrange(deck,edges),p);
  const colors=core.unitColors(deck);assert.notEqual(colors.one,colors.two);assert.equal(colors[''],'#858a93');
  assert.match(core.connectionPath({x:200,y:100},{x:600,y:100},0,[{x:300,y:70,width:188,height:70}]),/Q/);
  assert.equal(core.connectionPath({x:200,y:100},{x:300,y:100}),'M 200 100 L 300 100');
  assert.match(core.connectionPath({x:600,y:100},{x:200,y:200}),/Q/);
});

test('unit colours reach nodes and ports; cross-unit lines use gradients and matching arrowheads',async t=>{
  const deck=[{id:'a',name:'Area',unit:'one',knowledgeGraphIncluded:true},{id:'b',name:'Stress',unit:'two',knowledgeGraphIncluded:true},{id:'c',name:'Other',knowledgeGraphIncluded:true}],memory={knowledge_subject_eng2:{v:1,enabled:true,edges:[{from:'a',to:'b'},{from:'b',to:'c'}],positions:{},updatedAt:0}},app=fixture({deck,memory});t.after(()=>app.dom.window.close());await app.open();const {$}=app;
  assert.notEqual($('[data-node="a"]').style.getPropertyValue('--kg-unit-color'),$('[data-node="b"]').style.getPropertyValue('--kg-unit-color'));assert.equal($('[data-node="c"]').style.getPropertyValue('--kg-unit-color'),'#858a93');
  assert.equal($('.kg-svg').querySelectorAll('linearGradient').length,2);assert.equal($('linearGradient stop').getAttribute('stop-color'),$('[data-node="a"]').style.getPropertyValue('--kg-unit-color'));
  assert.match($('.kg-edge').style.stroke,/url\(#kgArrow/);assert.equal($('.kg-node-unit').textContent,'one');assert.equal($('.kg-svg').querySelectorAll('.kg-unit-label').length,3);
  $('.kg-edit').click();$('.kg-arrange').click();assert.equal($('.kg-svg').querySelectorAll('linearGradient').length,2,'redraw must replace gradients rather than leak duplicate definitions');
});

test('Remove stages deletion of the current topic and its links without deleting the topic',async t=>{
  const deck=structuredClone(topics),memory={knowledge_subject_eng2:{v:1,enabled:true,positions:{a:{x:50,y:60}},edges:[{from:'a',to:'b'},{from:'b',to:'c'}],updatedAt:0}},app=fixture({deck,memory});t.after(()=>app.dom.window.close());const {$,w,writes}=app;
  w.StudyKnowledgeGraph.setupEditor(deck[0]);assert.equal($('#fKnowledgeGraphRemove').disabled,false);$('#fKnowledgeGraphRemove').click();
  assert.equal($('#fKnowledgeGraph').dataset.included,'false');assert.equal(writes.length,0);assert.equal(memory.knowledge_subject_eng2.edges.length,2);
  const draft=$('#fKnowledgeGraph').knowledgeGraphDraft;assert.deepEqual(JSON.parse(JSON.stringify(draft.after.edges)),[{from:'b',to:'c'}]);
  deck[0].knowledgeGraphIncluded=false;await w.StudyKnowledgeGraph.saveDraft(draft);assert.equal(deck[0].name,'Area');assert.deepEqual(writes[0].value.edges,[{from:'b',to:'c'}]);assert.equal(writes[0].value.positions.a,undefined);
  await app.open();assert.equal($('[data-node="a"]'),null);assert.ok($('[data-node="b"]'));
});

test('routing takes the closest clear corridor rather than looping above unrelated topics',()=>{
  const from={x:200,y:100},to={x:600,y:100},obstacles=[{x:300,y:-100,width:100,height:220},{x:900,y:-900,width:188,height:70}];
  const points=core.connectionRoute(from,to,obstacles),length=points.slice(1).reduce((n,p,i)=>n+Math.abs(p.x-points[i].x)+Math.abs(p.y-points[i].y),0);
  assert.equal(length,460);assert.equal(Math.max(...points.map(p=>p.y)),130);assert.equal(Math.min(...points.map(p=>p.y)),100);
  for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];assert.ok(a.x===b.x||a.y===b.y);for(const r of obstacles)assert.equal(a.y===b.y?a.y>r.y&&a.y<r.y+r.height&&Math.max(a.x,b.x)>r.x&&Math.min(a.x,b.x)<r.x+r.width:a.x>r.x&&a.x<r.x+r.width&&Math.max(a.y,b.y)>r.y&&Math.min(a.y,b.y)<r.y+r.height,false);}
});

test('drag preview and saved edges use the same obstacle-aware route',async t=>{
  const app=fixture();t.after(()=>app.dom.window.close());await app.open();const {$,w}=app;$('.kg-edit').click();
  const pointer=(element,type,x,y)=>element.dispatchEvent(new w.MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:x,clientY:y}));
  pointer($('[data-topic="a"][data-port="out"]'),'pointerdown',100,100);w.document.elementFromPoint=()=> $('[data-topic="b"][data-port="in"]');pointer($('.kg-svg'),'pointermove',350,200);
  const preview=$('.kg-ghost').getAttribute('d');pointer($('.kg-svg'),'pointerup',350,200);assert.equal($('.kg-edge').getAttribute('d'),preview);
});

test('header and topic editor share membership, positions and routing; added topics persist in both',async t=>{
  const memory={knowledge_subject_eng2:{v:1,enabled:true,positions:{a:{x:70,y:70},b:{x:380,y:70}},edges:[{from:'a',to:'b'}],updatedAt:0}},app=fixture({memory});t.after(()=>app.dom.window.close());await app.open();const {$,w}=app;
  const snapshot=()=>[...w.document.querySelectorAll('[data-node]')].map(n=>[n.dataset.node,n.getAttribute('transform')]).sort();
  const saved=snapshot(),line=$('.kg-edge').getAttribute('d');$('.kg-edit').click();assert.deepEqual(snapshot(),saved,'entering edit must not introduce hidden nodes');$('.kg-close').click();
  $('#fName').value='Area';w.StudyKnowledgeGraph.setupEditor(topics[0]);w.editing=true;$('#btnKnowledgeGraph').click();await settle();assert.equal($('.kg-save').textContent,'Confirm');assert.deepEqual(snapshot(),saved);assert.equal($('.kg-edge').getAttribute('d'),line);
  $('.kg-add-topic').value='c';$('.kg-add-topic').dispatchEvent(new w.Event('change'));$('.kg-save').click();const draft=$('#fKnowledgeGraph').knowledgeGraphDraft;await w.StudyKnowledgeGraph.saveDraft(draft);w.editing=false;
  await app.open();assert.ok($('[data-node="c"]'));assert.deepEqual(memory.knowledge_subject_eng2.nodes,['c']);assert.equal(w.StudyKnowledgeGraph.included('c'),true);
});

test('auto-arrange allocates more arrow space at busy boundaries and high-degree topics',()=>{
  const small=core.arrange([{id:'a',unit:'u'},{id:'b',unit:'u'}],[{from:'a',to:'b'}]);
  const sources=Array.from({length:8},(_,i)=>({id:'s'+i,unit:'u'})),deck=[...sources,{id:'target',unit:'u'}],edges=sources.map(t=>({from:t.id,to:'target'})),busy=core.arrange(deck,edges);
  assert.ok(busy.target.x-busy.s0.x>small.b.x-small.a.x,'crowded columns need wider connection channels');
  const ys=sources.map(t=>busy[t.id].y).sort((a,b)=>a-b);assert.ok(ys[1]-ys[0]>=190,'many incoming arrows need extra row space');
});

test('parallel connections choose separate lanes instead of sharing a vertical trunk',()=>{
  const first=core.connectionRoute({x:200,y:100},{x:600,y:300}),reserved=first.slice(1).map((b,i)=>({a:first[i],b}));
  const second=core.connectionRoute({x:200,y:140},{x:600,y:340},[],reserved);
  const vertical=points=>points.slice(1).flatMap((p,i)=>p.x===points[i].x?[p.x]:[]);
  const a=vertical(first),b=vertical(second);assert.ok(a.length&&b.length);assert.ok(a.every(x=>b.every(y=>Math.abs(x-y)>=16)));
});

test('crossing bridges distinguish intersections from shared endpoints and merge close crossings',()=>{
  const h=[{x:0,y:100},{x:200,y:100}],vertical=x=>[{x,y:0},{x,y:200}];
  assert.deepEqual(core.crossingBridges([h,vertical(100)]),[{route:0,segment:1,x1:92,x2:108,y:100}]);
  assert.deepEqual(core.crossingBridges([vertical(100),h]),[{route:1,segment:1,x1:92,x2:108,y:100}]);
  assert.deepEqual(core.crossingBridges([h,[{x:200,y:100},{x:200,y:200}]]),[]);
  assert.deepEqual(core.crossingBridges([h,[{x:0,y:100},{x:100,y:100}]]),[]);
  assert.deepEqual(core.crossingBridges([h,vertical(90),vertical(104)]),[{route:0,segment:1,x1:82,x2:112,y:100}]);
});

test('crossings render masked bridge bubbles retaining line colour and selection',async t=>{
  const memory={knowledge_subject_eng2:{v:1,enabled:true,edges:[{from:'a',to:'b'},{from:'b',to:'c'}],positions:{},updatedAt:0}},app=fixture({memory});t.after(()=>app.dom.window.close());const {$,w}=app;
  let calls=0;w.StudyKnowledgeGraphCore.connectionRoute=()=>calls++%2?[{x:200,y:0},{x:200,y:200}]:[{x:0,y:100},{x:400,y:100}];
  await app.open();assert.ok($('.kg-bridge'));assert.ok($('.kg-bridge-halo'));assert.match($('.kg-edge').getAttribute('mask'),/BridgeMask/);assert.equal($('.kg-bridge').style.stroke,$('.kg-edge').style.stroke);
  $('.kg-bridge').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));assert.ok($('.kg-bridge.is-selected'));assert.equal($('.kg-svg').querySelectorAll('mask').length,1,'redraw should replace crossing masks');
});

test('busy shared arrowheads do not force hairpin loops or vertical overshoot',()=>{
  const to={x:600,y:200},reserved=[{a:{x:200,y:200},b:to},{a:{x:584,y:0},b:{x:584,y:250}},{a:{x:568,y:0},b:{x:568,y:250}}];
  for(const y of [0,80,140,200,260,340]){
    const route=core.connectionRoute({x:200,y},to,[],reserved),last=route[route.length-2];
    assert.equal(last.y,to.y);assert.ok(to.x-last.x>=40);assert.ok(route.every(p=>p.y>=Math.min(y,to.y)&&p.y<=Math.max(y,to.y)),'avoid overshooting the destination just to separate lines');
    for(let i=1;i<route.length-1;i++){const a=route[i-1],b=route[i],c=route[i+1];assert.ok((b.x-a.x)*(c.x-b.x)+(b.y-a.y)*(c.y-b.y)>=0,'no immediate reversal');}
  }
  for(const gap of [2,12,30,60])assert.deepEqual(core.connectionRoute({x:200,y:100},{x:200+gap,y:100}),[{x:200,y:100},{x:200+gap,y:100}]);
});

test('Related Terms lists incoming prerequisites as safe text links scoped to the originating class',async t=>{
  const memory={'knowledge_class_class-a':{v:1,enabled:true,edges:[{from:'a',to:'b'},{from:'b',to:'c'}],positions:{},updatedAt:0}},app=fixture({memory});t.after(()=>app.dom.window.close());const {$,w}=app;
  const target=w.document.createElement('div');target.className='knowledge-prerequisites';w.document.body.append(target);
  w.StudyKnowledgeGraph.mountPrerequisites(target,'b','class-a');await settle();assert.equal(target.textContent,'Area');assert.equal(target.querySelectorAll('a').length,1);assert.match(target.querySelector('a').href,/class.html\?topic=a#class-a/);target.querySelector('a').click();assert.equal(w.opened,'a');
  memory['knowledge_class_class-a'].edges=[];w.dispatchEvent(new w.Event('studybase-auth-ready'));await settle();assert.equal(target.textContent,'No prerequisite connections.');
});

test('topic editor prerequisite text follows confirmed graph drafts and removal',async t=>{
  const memory={knowledge_subject_eng2:{v:1,enabled:true,edges:[{from:'a',to:'b'}],positions:{},updatedAt:0}},app=fixture({memory});t.after(()=>app.dom.window.close());const {$,w}=app;
  w.StudyKnowledgeGraph.setupEditor(topics[1]);assert.equal($('#knowledgeEditorPrerequisites').textContent,'Area');$('#fKnowledgeGraph').click();await settle();
  $('.kg-add-topic').value='c';$('.kg-add-topic').dispatchEvent(new w.Event('change'));
  $('[data-topic="c"][data-port="out"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));$('[data-topic="b"][data-port="in"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));$('.kg-save').click();
  assert.equal($('#knowledgeEditorPrerequisites').textContent,'Area, Hidden topic');assert.equal($('#knowledgeEditorPrerequisites').querySelector('a'),null);$('#fKnowledgeGraphRemove').click();assert.equal($('#knowledgeEditorPrerequisites').textContent,'No prerequisite connections.');
});

test('hover highlights direct connections without redraw, click pins it, and background clears it',async t=>{
  const deck=[...structuredClone(topics),{id:'d',name:'Unrelated',knowledgeGraphIncluded:true}],memory={knowledge_subject_eng2:{v:1,enabled:true,edges:[{from:'a',to:'b'},{from:'b',to:'c'}],positions:{},updatedAt:0}},app=fixture({deck,memory});t.after(()=>app.dom.window.close());await app.open();const {$,w}=app;
  const original=$('[data-node="a"]'),hover=id=>$('[data-node="'+id+'"]').dispatchEvent(new w.MouseEvent('pointerover',{bubbles:true})),leave=()=>$('.kg-svg').dispatchEvent(new w.MouseEvent('pointerleave'));
  hover('a');assert.equal($('[data-node="a"]'),original);assert.ok($('[data-node="b"]').classList.contains('is-related'));assert.ok($('[data-node="c"]').classList.contains('is-dimmed'));assert.equal(w.document.querySelectorAll('.kg-edge.is-highlighted').length,1);
  leave();assert.equal(w.document.querySelectorAll('.kg-node.is-dimmed').length,0);
  $('[data-node="b"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));assert.equal(w.document.querySelectorAll('.kg-edge.is-highlighted').length,2);assert.ok($('[data-node="d"]').classList.contains('is-dimmed'));
  hover('a');assert.ok($('[data-node="c"]').classList.contains('is-dimmed'));leave();assert.equal($('[data-node="c"]').classList.contains('is-dimmed'),false);
  $('.kg-svg').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));assert.equal(w.document.querySelectorAll('.kg-node.is-dimmed').length,0);
});

test('keyboard focus highlights neighbours and auto-arrange separates busy column alignments',async t=>{
  const app=fixture({memory:{knowledge_subject_eng2:{v:1,enabled:true,edges:[{from:'a',to:'b'}],positions:{},updatedAt:0}}});t.after(()=>app.dom.window.close());await app.open();const {$,w}=app;
  $('[data-node="a"]').dispatchEvent(new w.FocusEvent('focusin',{bubbles:true}));assert.ok($('.kg-edge.is-highlighted'));assert.ok($('[data-node="b"].is-related'));
  const deck=[{id:'a',unit:'u'},{id:'b',unit:'u'},{id:'c',unit:'u'},{id:'d',unit:'u'}],edges=['b','c','d'].map(to=>({from:'a',to})),p=core.arrange(deck,edges);
  assert.notEqual(p.a.y,p.b.y,'busy adjacent columns should not put a bend on the same row as another topic');
});

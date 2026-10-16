const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom'),core=require('../drawing-core');
const read=p=>fs.readFileSync(p,'utf8'),wait=ms=>new Promise(r=>setTimeout(r,ms));
function fixture({data={v:1,width:800,height:400,strokes:[]},readOnly=false,autosave,draft,updatedAt=0}={}){
  const dom=new JSDOM('<div id="drawing"></div>',{url:'https://studybase.example/',runScripts:'outside-only'}),w=dom.window,fills=[],transforms=[],exports=[];
  w.requestAnimationFrame=cb=>w.setTimeout(cb,0);w.cancelAnimationFrame=id=>w.clearTimeout(id);Object.defineProperty(w,'devicePixelRatio',{value:2});
  w.Path2D=class{constructor(){this.points=[];}moveTo(...p){this.points.push(p);}lineTo(...p){this.points.push(p);}closePath(){}};
  w.HTMLCanvasElement.prototype.getContext=function(){return {setTransform(...v){transforms.push(v);},clearRect(){},fillRect(){},drawImage(){fills.push({background:true});},fill(p){fills.push({points:p.points,alpha:this.globalAlpha,colour:this.fillStyle});}};};
  w.HTMLCanvasElement.prototype.getBoundingClientRect=()=>({left:10,top:20,width:400,height:200});
  w.HTMLCanvasElement.prototype.toBlob=function(cb){exports.push([this.width,this.height]);cb(new w.Blob(['png'],{type:'image/png'}));};w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){exports.push(this.download);};
  w.confirm=()=>true;if(draft)w.localStorage.setItem('draw-draft',JSON.stringify(draft));
  w.Image=class{constructor(){this.complete=false;}set src(value){this.complete=true;this.naturalWidth=800;this.width=800;this.height=400;w.setTimeout(()=>this.onload?.(),0);}};
  w.eval(read('vendor/perfect-freehand/perfect-freehand.js'));w.eval(read('drawing-core.js'));w.eval(read('subject/drawing.js'));
  const changes=[],app=w.StudyDrawing.create(w.document.getElementById('drawing'),{data,readOnly,draftKey:'draw-draft',updatedAt,onChange:value=>changes.push(value),onAutosave:autosave,autosaveDelay:20}),canvas=w.document.querySelector('.drawing-ink');
  function pointer(type,x,y,{pen='mouse',pressure=.5,id=1,coalesced}={}){const e=new w.MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:x,clientY:y});Object.defineProperties(e,{pointerId:{value:id},pointerType:{value:pen},pressure:{value:pressure}});if(coalesced)e.getCoalescedEvents=()=>coalesced;canvas.dispatchEvent(e);}
  const button=text=>[...w.document.querySelectorAll('button')].find(b=>b.textContent===text);
  return {dom,w,app,canvas,fills,transforms,exports,changes,pointer,button,close(){app.destroy();w.close();}};
}
test('Draw state round-trips through topic normalisation and serialisation without affecting other layouts',()=>{
  const dom=new JSDOM('',{url:'https://studybase.example/',runScripts:'outside-only'}),w=dom.window;w.eval(read('sync-config.generated.js')+'\n'+read('sync-config.js'));
  const data=core.empty();data.strokes.push({points:[[1,2,.4],[50,60,.9]],colour:'#123456',size:4,tool:'pen',simulatePressure:false});
  const value=w.serializeTopic({id:'draw1',name:'Diagram',layout:'draw',drawData:data,notes:{general:[{text:'Keep me'}]}});assert.equal(value.layout,'draw');assert.deepEqual(JSON.parse(JSON.stringify(w.normalizeTopic(value).drawData)),data);assert.equal(value.notes.general[0].text,'Keep me');assert.equal(w.normalizeTopic({id:'old',layout:'basic'}).drawData,null);dom.window.close();
});
test('pointer input maps coalesced pen pressure into canvas coordinates and renders filled outlines at DPR',t=>{
  const f=fixture();t.after(()=>f.close());f.pointer('pointerdown',110,70,{pen:'pen',pressure:.2});f.pointer('pointermove',210,120,{pen:'pen',pressure:.9,coalesced:[{clientX:160,clientY:95,pressure:.6}]});f.pointer('pointerup',210,120,{pen:'pen',pressure:.9});
  const stroke=f.app.getState().strokes[0];assert.equal(stroke.simulatePressure,false);assert.deepEqual(JSON.parse(JSON.stringify(stroke.points)),[[200,100,.2],[300,150,.6],[400,200,.9]]);assert.ok(f.fills.some(p=>p.points.length>3));assert.equal(f.canvas.width,800);assert.equal(f.canvas.height,400);assert.ok(f.transforms.some(v=>v[0]===1&&v[3]===1));
});
test('mouse/touch share the pointer path; pen-only ignores palms and extra pointers',t=>{
  const f=fixture();t.after(()=>f.close());for(const pen of ['mouse','touch']){f.pointer('pointerdown',40,50,{pen});f.pointer('pointerup',100,60,{pen});}assert.equal(f.app.getState().strokes.length,2);assert.ok(f.app.getState().strokes.every(s=>s.simulatePressure));
  const check=f.w.document.querySelector('input[type=checkbox]');check.checked=true;check.dispatchEvent(new f.w.Event('change'));f.pointer('pointerdown',30,30,{pen:'touch'});f.pointer('pointerup',30,30,{pen:'touch'});assert.equal(f.app.getState().strokes.length,2);
  f.pointer('pointerdown',30,30,{pen:'pen'});f.pointer('pointermove',50,50,{pen:'touch',id:2});f.pointer('pointerup',30,30,{pen:'pen'});assert.equal(f.app.getState().strokes.length,3);
});
test('highlighter, whole-stroke eraser and undo/redo preserve strokes',t=>{
  const f=fixture();t.after(()=>f.close());f.button('Highlighter').click();f.pointer('pointerdown',50,70);f.pointer('pointerup',150,70);assert.ok(f.fills.some(p=>p.alpha===.3));f.button('Eraser').click();f.pointer('pointerdown',100,30);f.pointer('pointerup',100,110);assert.equal(f.app.getState().strokes.length,0);f.button('Undo').click();assert.equal(f.app.getState().strokes.length,1);f.button('Redo').click();assert.equal(f.app.getState().strokes.length,0);f.button('Undo').click();
  assert.equal(f.button('Clear'),undefined);assert.equal(f.button('Export PNG'),undefined);
});
test('resizing changes bounds without scaling or deleting points; PNG exports original pixel dimensions',t=>{
  const f=fixture();t.after(()=>f.close());f.pointer('pointerdown',150,100);f.pointer('pointerup',250,130);const points=JSON.stringify(f.app.getState().strokes);
  const width=f.w.document.querySelector('[aria-label="Canvas width"]'),height=f.w.document.querySelector('[aria-label="Canvas height"]');width.value=100;height.value=100;width.dispatchEvent(new f.w.Event('input'));assert.equal(f.app.getState().width,100);assert.equal(JSON.stringify(f.app.getState().strokes),points);assert.equal(f.button('Resize canvas'),undefined);const viewer=fixture({data:f.app.getState(),readOnly:true});t.after(()=>viewer.close());viewer.button('Export PNG').click();assert.deepEqual(viewer.exports[0],[100,100]);f.button('Undo').click();assert.equal(f.app.getState().width,800);
  const preset=f.w.document.querySelector('[aria-label="Canvas preset"]');preset.value='wide';preset.dispatchEvent(new f.w.Event('change'));assert.equal(f.app.getState().width,1600);assert.equal(f.app.getState().height,900);height.value=1000;height.dispatchEvent(new f.w.Event('input'));assert.equal(f.app.getState().height,1000);width.value='';width.dispatchEvent(new f.w.Event('input'));assert.equal(f.app.getState().width,1600,'partial input must not resize or erase strokes');assert.equal(JSON.stringify(f.app.getState().strokes),points);
});
test('read-only mode cannot mutate a drawing and pointer cancellation discards an unfinished stroke',t=>{
  const f=fixture({readOnly:true});t.after(()=>f.close());f.pointer('pointerdown',50,70);f.pointer('pointerup',150,70);assert.equal(f.app.getState().strokes.length,0);assert.equal(f.button('Pen'),undefined);assert.ok(f.button('Export PNG'));
  const e=fixture();t.after(()=>e.close());e.pointer('pointerdown',30,30);e.pointer('pointercancel',60,60);assert.equal(e.app.getState().strokes.length,0);assert.equal(e.changes.length,0);
});
test('debounced autosave and local recovery retain offline changes and clear acknowledged recovery',async t=>{
  const saves=[],f=fixture({autosave:async data=>{saves.push(data);throw Error('offline');}});t.after(()=>f.close());for(let i=0;i<2;i++){f.pointer('pointerdown',50+i*20,70);f.pointer('pointerup',150,70);}await wait(40);assert.equal(saves.length,1);const draft=JSON.parse(f.w.localStorage.getItem('draw-draft'));assert.equal(draft.data.strokes.length,2);
  const g=fixture({draft,autosave:async()=>({synced:true})});t.after(()=>g.close());assert.equal(g.app.getState().strokes.length,2);await wait(40);assert.equal(g.w.localStorage.getItem('draw-draft'),null);
});

test('topic integration autosaves through existing sync without saving unfinished metadata or reviving deleted topics',async t=>{
  const dom=new JSDOM('<div id="drawingEditor"></div><input id="fName" value="Unfinished title">',{url:'https://studybase.example/',runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());
  let config,writes=0,topics=[{id:'t',name:'Saved title',layout:'draw',notes:{general:['Keep note']},drawData:core.empty()}];
  Object.assign(w,{currentLayout:'draw',editSurface:'inline',editOrigin:null,editId:'t',SUBJECT:{id:'phy'},ST:'phy_topics',IS_CLASS_PAGE:false,isGuest:false,userRole:'teacher',__sbAuth:{currentUser:{uid:'teacher'}},StudyDrawingCore:core,
    StudyDrawing:{create(container,options){config=options;return {getState:()=>options.data,destroy(){}};}},getTopics:()=>topics,topicsForOrigin:()=>topics,updateEditBatchButtons(){},refreshUnsyncedUI(){},isTopicUnsynced:()=>false,canEditClassTopics:()=>true,saveTopicsForOrigin:async(origin,next)=>{topics=next;writes++;}});
  const source=read('subject/topicapp.js'),start=source.indexOf('let drawEditor=null'),end=source.indexOf('// ── Storage helpers',start);w.eval(source.slice(start,end)+'\nwindow.mountDrawing=mountDrawEditor;window.destroyDrawing=destroyDrawEditor;');w.mountDrawing();
  const data=core.empty();data.width=1000;assert.equal((await config.onAutosave(data)).synced,true);assert.equal(writes,1);assert.equal(topics[0].name,'Saved title');assert.deepEqual(topics[0].notes,{general:['Keep note']});assert.equal(topics[0].drawData.width,1000);
  topics=[];await config.onAutosave(data);assert.equal(writes,1,'deleted topics must not be recreated');w.__sbAuth.currentUser.uid='another-user';await config.onAutosave(data);assert.equal(writes,1,'late autosave must not cross accounts');w.destroyDrawing();
});

test('a conflicting recovery copy is offered instead of silently overwritten by a newer sync timestamp',t=>{
  const data=core.empty();data.width=900;const f=fixture({draft:{timestamp:1,data},updatedAt:Date.now()});t.after(()=>f.close());assert.equal(f.app.getState().width,800);assert.ok(f.button('Recover local drawing'));f.pointer('pointerdown',30,30);f.pointer('pointerup',60,60);assert.equal(f.app.getState().strokes.length,0);f.button('Recover local drawing').click();assert.equal(f.app.getState().width,900);
});

test('background upload stores multiple pages, isolates annotations, supports removal/undo and exports the background',async t=>{
  const f=fixture();t.after(()=>f.close());const bg={name:'Worksheet',width:800,height:400,src:'data:image/jpeg;base64,/9j/'};
  f.w.StudyDrawingImport={read:async()=>({pages:[{width:800,height:400,background:bg,strokes:[]},{width:600,height:900,background:{...bg,name:'Second page',width:600,height:900},strokes:[]}]})};
  const input=f.w.document.querySelector('input[type=file]');Object.defineProperty(input,'files',{value:[{name:'worksheet.pdf'}]});await input.onchange();await wait(5);assert.equal(f.app.getState().pages.length,1);assert.ok(f.fills.some(p=>p.background));
  f.pointer('pointerdown',50,70);f.pointer('pointerup',100,100);const select=f.w.document.querySelector('[aria-label="Drawing page"]');select.value='1';select.dispatchEvent(new f.w.Event('change'));f.pointer('pointerdown',150,80);f.pointer('pointerup',200,100);let state=f.app.getState();assert.equal(state.strokes.length,1);assert.equal(state.pages[0].strokes.length,1);assert.notEqual(state.strokes[0].points[0][0],state.pages[0].strokes[0].points[0][0]);
  const exported=fixture({data:f.app.getState(),readOnly:true});t.after(()=>exported.close());const exportedPage=exported.w.document.querySelector('[aria-label="Drawing page"]');exportedPage.value='1';exportedPage.dispatchEvent(new exported.w.Event('change'));exported.button('Export PNG').click();await wait(5);assert.deepEqual(exported.exports[0],[600,900]);f.button('Remove background').click();assert.ok(f.button('Upload background'));assert.equal(f.app.getState().pages[0].background,undefined);assert.equal(f.app.getState().pages[0].strokes.length,1);f.button('Undo').click();assert.ok(f.app.getState().pages[0].background);
  const viewer=fixture({data:f.app.getState(),readOnly:true});t.after(()=>viewer.close());assert.ok(viewer.w.document.querySelector('[aria-label="Drawing page"]'));assert.equal(viewer.button('Upload background'),undefined);
});

test('background validation rejects remote/executable images and checks all pages',()=>{
  const data=core.empty(),bg={name:'Image',width:800,height:600,src:'data:image/png;base64,aGVsbG8='};data.background=bg;data.pages=[{width:800,height:600,background:bg,strokes:[]}];assert.doesNotThrow(()=>core.validate(data));
  for(const src of ['https://example.com/image.png','javascript:alert(1)','data:image/svg+xml;base64,aGVsbG8='])assert.throws(()=>core.validate({...data,background:{...bg,src}}));
  assert.throws(()=>core.validate({...data,pages:[{width:1,height:600,strokes:[]}]}));
});

test('brush pixel field accepts precise values, syncs the slider and ignores invalid intermediate input',t=>{
  const f=fixture();t.after(()=>f.close());const input=f.w.document.querySelector('[aria-label="Brush size in pixels"]'),slider=f.w.document.querySelector('input[type=range]');
  input.value='7.25';input.dispatchEvent(new f.w.Event('input'));assert.equal(Number(slider.value),7.25);f.pointer('pointerdown',50,70);f.pointer('pointerup',100,80);assert.equal(f.app.getState().strokes[0].size,7.25);
  input.value='';input.dispatchEvent(new f.w.Event('input'));assert.equal(input.getAttribute('aria-invalid'),'true');slider.value=12;slider.dispatchEvent(new f.w.Event('input'));assert.equal(input.value,'12');
  assert.equal(f.button('Clear'),undefined);assert.equal(f.button('Export PNG'),undefined);assert.ok(f.button('Upload background'));assert.equal(f.button('Remove background'),undefined);
});

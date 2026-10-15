const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const {geometry,resizeBox}=require('../image-editor');
const read=file=>fs.readFileSync(require.resolve('../'+file),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('image transforms preserve scale and independent stretch while rotating and positioning',()=>{
 const normal=geometry(800,600,1200,400),small=geometry(800,600,1200,400,{zoom:.25,x:1});
 assert.equal(small.drawW,normal.drawW*.25);assert.equal(small.drawH,normal.drawH*.25);assert.ok(small.x>0);
 for(const rotation of [-180,-90,-45,0,30,90,180])for(const stretchX of [.5,1,2]){
  const g=geometry(800,600,1200,400,{rotation,stretchX,stretchY:1,zoom:1.5,x:10,y:-10});
  assert.equal(g.drawW,normal.drawW*stretchX*1.5);assert.equal(g.drawH,normal.drawH*1.5);assert.equal(g.x,g.maxX);assert.equal(g.y,-g.maxY);
  assert.ok(Math.abs(g.drawW/g.drawH-(800*stretchX/600))<1e-8);
 }
});
function fixture(){
 const dom=new JSDOM('<button id="before">Edit image</button><dialog id="parent" open></dialog>',{url:'https://studybase.example/index.html',runScripts:'outside-only'}),w=dom.window,calls=[];
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.Image=class {naturalWidth=800;naturalHeight=600;set src(value){this.value=value;queueMicrotask(()=>this.onload());}};
 const ctx={setTransform(){},fillRect(){},save(){},restore(){},scale(...args){calls.push(['scale',...args]);},translate(...args){calls.push(['translate',...args]);},rotate(value){calls.push(['rotate',value]);},drawImage(...args){calls.push(['draw',...args.slice(1)]);}};
 w.HTMLCanvasElement.prototype.getContext=()=>ctx;w.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/jpeg;base64,AQ==';
 w.eval(read('image-editor.js'));return {dom,w,calls};
}
test('editor applies zoom, stretch, rotation and crop as an image and leaves the parent dialog open',async()=>{
 const {dom,w,calls}=fixture();const pending=w.SBImageEditor.open('data:image/jpeg;base64,AQ==',{aspect:3,tint:'#0c8247'});await settle();
 const dialog=w.document.querySelector('.image-editor-dialog'),buttons=()=>[...dialog.querySelectorAll('button')];
 const set=(key,value)=>{const input=dialog.querySelector('[data-image-control="'+key+'"]');input.value=value;input.dispatchEvent(new w.Event('input'));};
 set('zoom',.25);assert.equal(dialog.querySelector('[data-image-control="zoom"]').value,'0.25');set('zoom',2);set('stretchX',1.5);set('x',.5);buttons().find(b=>b.textContent==='Rotate right').click();assert.ok(calls.some(c=>c[0]==='rotate'&&Math.abs(c[1]-Math.PI/2)<1e-8));
 assert.equal(dialog.querySelector('canvas').width,1200);assert.equal(dialog.querySelector('canvas').height,400);assert.ok(dialog.querySelector('.image-editor-tint'));
 buttons().find(b=>b.textContent==='Use image').click();assert.equal(await pending,'data:image/jpeg;base64,AQ==');assert.equal(w.document.getElementById('parent').open,true);assert.equal(w.document.querySelector('.image-editor-dialog'),null);dom.window.close();
});
test('cancel and reset do not publish an image; avatar preview remains square with a circular mask',async()=>{
 const {dom,w}=fixture();const pending=w.SBImageEditor.open('data:image/jpeg;base64,AQ==',{aspect:1,width:512,circle:true});await settle();
 const dialog=w.document.querySelector('.image-editor-dialog'),rotation=dialog.querySelector('[data-image-control="rotation"]');rotation.value=35;rotation.dispatchEvent(new w.Event('input'));
 [...dialog.querySelectorAll('button')].find(b=>b.textContent==='Reset').click();assert.equal(rotation.value,'0');assert.equal(dialog.querySelector('canvas').height,512);assert.ok(dialog.querySelector('.is-avatar'));
 [...dialog.querySelectorAll('button')].find(b=>b.textContent==='Cancel').click();assert.equal(await pending,null);dom.window.close();
});
test('resize calculations keep the opposite corner anchored even after rotation',()=>{
 const box={x:40,y:80,width:200,height:100,angle:Math.PI/3},point=(x,y,b=box)=>({x:b.x+x*Math.cos(b.angle)-y*Math.sin(b.angle),y:b.y+x*Math.sin(b.angle)+y*Math.cos(b.angle)});
 const anchor=point(-100,-50),resized=resizeBox(box,'se',point(180,90),{lockAspect:true});
 const nextAnchor=point(-resized.width/2,-resized.height/2,resized);assert.ok(Math.abs(anchor.x-nextAnchor.x)<1e-8);assert.ok(Math.abs(anchor.y-nextAnchor.y)<1e-8);assert.ok(Math.abs(resized.width/resized.height-2)<1e-8);
 const stretched=resizeBox(box,'e',point(170,0));assert.equal(stretched.height,box.height);assert.ok(stretched.width>box.width);
});
test('pointer handles scale, stretch and rotate the image; crop handles change the export frame only',async()=>{
 const {dom,w,calls}=fixture(),pending=w.SBImageEditor.open('data:image/jpeg;base64,AQ==',{aspect:3});await settle();
 const stage=w.document.querySelector('.image-editor-stage'),image=w.document.querySelector('.image-transform-box'),crop=w.document.querySelector('.image-crop-box');
 stage.getBoundingClientRect=()=>({left:0,top:0,width:1000,height:600});
 const box=node=>({x:parseFloat(node.style.left)*10,y:parseFloat(node.style.top)*6,width:parseFloat(node.style.width)*10,height:parseFloat(node.style.height)*6});
 const drag=(target,from,to)=>{stage.onpointerdown({button:0,target,clientX:from.x,clientY:from.y,preventDefault(){}});stage.onpointermove({clientX:to.x,clientY:to.y});stage.onpointerup({});};
 let b=box(image),point={x:b.x+b.width/2,y:b.y+b.height/2};drag(image.querySelector('[data-handle=se]'),point,{x:point.x+60,y:point.y+45});
 const zoom=w.document.querySelector('[data-image-control=zoom]');assert.ok(Number(zoom.value)>1);const scaled=zoom.value;
 b=box(image);point={x:b.x+b.width/2,y:b.y};drag(image.querySelector('[data-handle=e]'),point,{x:point.x+40,y:point.y});assert.equal(zoom.value,scaled);assert.ok(Number(w.document.querySelector('[data-image-control=stretchX]').value)>1);
 b=box(image);const radius=b.height/2+30;drag(image.querySelector('[data-handle=rotate]'),{x:b.x,y:b.y-radius},{x:b.x+radius,y:b.y});assert.equal(w.document.querySelector('[data-image-control=rotation]').value,'90');
 const before=calls.filter(c=>c[0]==='draw').at(-1).slice(1);w.document.querySelector('[data-image-mode=crop]').click();assert.equal(image.hidden,true);assert.equal(crop.classList.contains('is-active'),true);
 b=box(crop);point={x:b.x+b.width/2,y:b.y+b.height/2};drag(crop.querySelector('[data-handle=se]'),point,{x:point.x-40,y:point.y-20});
 assert.equal(zoom.value,scaled);assert.deepEqual(calls.filter(c=>c[0]==='draw').at(-1).slice(1),before);assert.ok(calls.some(c=>c[0]==='scale'&&c[1]>1));b=box(crop);assert.ok(Math.abs(b.width/b.height-3)<1e-6);
 w.document.querySelector('[data-image-mode=scale]').click();const rotation=image.querySelector('[data-handle=rotate]');rotation.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',shiftKey:true,bubbles:true}));assert.equal(w.document.querySelector('[data-image-control=rotation]').value,'105');
 [...w.document.querySelectorAll('.image-editor-actions button')].find(b=>b.textContent==='Use image').click();assert.equal(await pending,'data:image/jpeg;base64,AQ==');dom.window.close();
});
test('profile photo editing uploads the adjusted file only after applying and ignores cancelled/stale drafts',async()=>{
 const dom=new JSDOM('<input id="profilePhotoInput"><div id="sb-toast-c"></div>',{url:'https://studybase.example/profile.html',runScripts:'outside-only'}),w=dom.window;
 const parsed=new JSDOM(read('profile.html')),script=[...parsed.window.document.querySelectorAll('script:not([src]):not([type="module"])')].find(s=>s.textContent.includes('function getInitials')).textContent;parsed.window.close();
 let result=null,uploads=0;
 w.SBImageEditor={open:async()=>result,toFile:()=>({edited:true})};w.uploadProfilePhoto=async file=>{assert.equal(file.edited,true);uploads++;return {url:'saved.jpg',thumb:'thumb'};};
 w.eval(script+'\nwindow.setup=()=>{profileCtx={uid:"student1",isGuest:false,editing:true};editDraft={photoUrl:"old.jpg"};buildProfile=()=>{};};window.draft=()=>editDraft;');
 w.setup();await w.adjustProfilePhoto({type:'image/jpeg'});assert.equal(uploads,0);assert.equal(w.draft().photoUrl,'old.jpg');
 result='data:image/jpeg;base64,AQ==';await w.adjustProfilePhoto({type:'image/jpeg'});assert.equal(uploads,1);assert.equal(w.draft().photoUrl,'saved.jpg');
 let finish;w.SBImageEditor.open=()=>new Promise(resolve=>finish=resolve);const pending=w.adjustProfilePhoto({type:'image/jpeg'});w.cancelEdit();finish(result);await pending;assert.equal(uploads,1);assert.equal(w.draft(),null);dom.window.close();
});

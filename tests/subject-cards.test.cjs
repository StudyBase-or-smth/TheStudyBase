const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const read=file=>fs.readFileSync(require.resolve('../'+file),'utf8');
const subject={id:'eco',name:'Economics',colour:'#0c8247'};
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(role='student'){
 const dom=new JSDOM('<div id="cards"></div>',{url:'https://studybase.example/index.html',runScripts:'outside-only'}),w=dom.window,memory={},writes=[];
 w.userRole=role;w.isGuest=role==='guest';w.sbMemGet=(key,fallback)=>memory[key]||fallback;w.sbMemSet=(key,value)=>memory[key]=value;w.sbLoadKey=async()=>{};w.sbPushToSync=async(key,value)=>writes.push({key,value});
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.eval(read('qol.js'));w.eval(read('subject-cards.js'));
 const container=w.document.getElementById('cards'),render=(isClass=false)=>w.SBSubjectCards.render(container,[subject],isClass,()=>[],()=>[]);
 return {dom,w,memory,writes,container,render};
}
test('image cards use a placeholder, tint, independent navigation and teacher-only settings',()=>{
 const {dom,w,container,render,memory}=fixture();render();assert.match(container.querySelector('img').src,/subject-card-placeholder.svg$/);assert.equal(container.querySelector('.subj-cover-tint').style.backgroundColor,'rgb(12, 130, 71)');assert.equal(container.querySelector('.subj-card-settings'),null);assert.match(container.textContent,/EconomicsNo topics yet0/);
 w.userRole='teacher';render();assert.ok(container.querySelector('.subj-card-settings'));assert.equal(container.querySelector('a').contains(container.querySelector('button')),false);
 memory.card_class_eco={image:'data:image/jpeg;base64,AQ=='};render(true);assert.equal(container.querySelector('img').src,memory.card_class_eco.image);assert.match(container.querySelector('a').href,/subject\/class.html#eco$/);assert.equal(w.SBSubjectCards.keyFor(subject,false),'card_subject_eco');dom.window.close();
});
test('teachers can reset and save shared cover images, while cancelled changes do not persist',async()=>{
 const {dom,w,container,render,memory,writes}=fixture('teacher');memory.card_subject_eco={image:'data:image/jpeg;base64,AQ=='};render();
 container.querySelector('button').click();let buttons=[...w.document.querySelectorAll('.card-image-actions button')];buttons.find(b=>b.textContent==='Use placeholder').click();assert.match(w.document.querySelector('.subj-cover-preview img').src,/placeholder/);buttons.find(b=>b.textContent==='Cancel').click();assert.equal(writes.length,0);assert.equal(memory.card_subject_eco.image,'data:image/jpeg;base64,AQ==');
 container.querySelector('button').click();buttons=[...w.document.querySelectorAll('.card-image-actions button')];buttons.find(b=>b.textContent==='Use placeholder').click();buttons.find(b=>b.textContent==='Save image').click();await settle();assert.equal(writes[0].key,'card_subject_eco');assert.equal(memory.card_subject_eco.image,'');assert.equal(w.document.querySelector('dialog'),null);dom.window.close();
});
test('failed cover saves keep the old shared image and show an editable error',async()=>{
 const {dom,w,container,render,memory}=fixture('teacher');memory.card_subject_eco={image:'data:image/jpeg;base64,AQ=='};w.sbPushToSync=async()=>{throw Error('Offline');};render();container.querySelector('button').click();const buttons=[...w.document.querySelectorAll('.card-image-actions button')];buttons.find(b=>b.textContent==='Use placeholder').click();const save=buttons.find(b=>b.textContent==='Save image');save.click();await settle();assert.equal(memory.card_subject_eco.image,'data:image/jpeg;base64,AQ==');assert.match(w.document.querySelector('dialog [role="status"]').textContent,/Could not save.*Offline/);assert.equal(save.disabled,false);dom.window.close();
});
test('adjusted card images remain drafts until Save image is confirmed',async()=>{
 const {dom,w,container,render,memory,writes}=fixture('teacher');memory.card_subject_eco={image:'data:image/jpeg;base64,AQ=='};
 let options;w.SBImageEditor={open:async(source,config)=>{assert.equal(source,memory.card_subject_eco.image);options=config;return 'data:image/jpeg;base64,Ag==';}};
 render();container.querySelector('button').click();let buttons=[...w.document.querySelectorAll('.card-image-actions button')];buttons.find(b=>b.textContent==='Adjust image').click();await settle();assert.equal(options.aspect,3);assert.equal(options.tint,subject.colour);assert.equal(memory.card_subject_eco.image,'data:image/jpeg;base64,AQ==');assert.equal(writes.length,0);
 buttons.find(b=>b.textContent==='Save image').click();await settle();assert.equal(memory.card_subject_eco.image,'data:image/jpeg;base64,Ag==');dom.window.close();
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {clock,validateStudyState,runReminders}=require('../study-reminders');
const {authorizeKey,readable,writable}=require('../access-policy');
const state=()=>({v:1,cards:{},sessions:{},days:{},goals:{goal_phy:{id:'goal_phy',subjectId:'phy',title:'Physics flashcards',target:2,time:'18:00',timeZone:'Australia/Sydney',enabled:true,reminderEnabled:true}}});
test('goals validate timezones, time, size, and history structure',()=>{
 assert.equal(validateStudyState(state()).v,1);
 for(const patch of [{target:0},{time:'18:99'},{time:'24:00'},{timeZone:'Unknown/Zone'}]){const s=state();Object.assign(s.goals.goal_phy,patch);assert.throws(()=>validateStudyState(s));}
 const s=state();s.days.today={};assert.throws(()=>validateStudyState(s));
 assert.deepEqual(clock(Date.parse('2026-10-15T13:30:00Z'),'Australia/Sydney'),{day:'2026-10-16',time:'00:30'});
});
test('personal study keys are isolated and notification changes remain restricted',()=>{
 const user={uid:'student1',role:'student'};assert.doesNotThrow(()=>authorizeKey('_flashcards_student1',user,true));
 assert.throws(()=>authorizeKey('_flashcards_student2',user,false));assert.throws(()=>authorizeKey('_study_reminders_sent',user,false));
 assert.throws(()=>writable('_flashcards_student1',{},null,user));
 assert.throws(()=>writable('studybase_notifications',{items:[{id:'forged',audience:['student1']}]},{items:[]},user));
});
test('reminders and completion use local days, distinct cards, standard notifications, and persistent deduplication',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sb-reminders-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.writeFileSync(path.join(dir,'_flashcards_student1.json'),'{}');
 const store={'_flashcards_student1':state()},readKey=key=>store[key],writeKey=(key,value)=>store[key]=value;
 const run=now=>runReminders({jsonDir:dir,readKey,writeKey,now:Date.parse(now)});
 run('2026-10-15T06:59:00Z');assert.equal(store.studybase_notifications,undefined);
 run('2026-10-15T07:00:00Z');assert.equal(store.studybase_notifications.items.length,1);const n=store.studybase_notifications.items[0];assert.deepEqual(n.audience,['student1']);assert.match(n.href,/flashcards.html#phy/);
 run('2026-10-15T08:00:00Z');assert.equal(store.studybase_notifications.items.length,1);
 store.studybase_notifications.items=[];run('2026-10-15T08:01:00Z');assert.equal(store.studybase_notifications.items.length,0);
 store._flashcards_student1.days['2026-10-15']=['phy:a','phy:a','other:a'];run('2026-10-15T08:02:00Z');assert.equal(store.studybase_notifications.items.length,0);
 store._flashcards_student1.days['2026-10-15'].push('phy:b');run('2026-10-15T08:03:00Z');assert.equal(store.studybase_notifications.items.length,1);assert.match(store.studybase_notifications.items[0].text,/goal reached/);
 const user={uid:'student1',role:'student'};assert.equal(readable('studybase_notifications',store.studybase_notifications,{uid:'student2',role:'student'}).items.length,0);
 const changed={...store.studybase_notifications.items[0],readBy:['student1']};assert.equal(writable('studybase_notifications',{items:[changed]},store.studybase_notifications,user).items[0].readBy[0],'student1');
 run('2026-10-16T07:00:00Z');assert.equal(store.studybase_notifications.items.length,2);
 store._flashcards_student1.goals.goal_phy.enabled=false;run('2026-10-17T07:00:00Z');assert.equal(store.studybase_notifications.items.length,2);
});

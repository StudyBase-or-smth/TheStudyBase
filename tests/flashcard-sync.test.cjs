const test=require('node:test');
const assert=require('node:assert/strict');
const {mergeFlashcards}=require('../flashcard-sync');
const {validateStudyState}=require('../study-reminders');
const {writable}=require('../access-policy');
const base={due:'2026-10-16T00:00:00.000Z',stability:0,difficulty:0,elapsed_days:0,scheduled_days:0,learning_steps:0,reps:0,lapses:0,state:0,last_review:null};
function record(id,timestamp){
 const result={...base,due:'2026-10-16T00:10:00.000Z',stability:2,difficulty:4,reps:1,state:1,last_review:timestamp};
 return {...result,fsrsVersion:1,fsrsBaseline:base,updatedAt:Date.parse(timestamp),reviewLog:{[id]:{id,rating:'good',timestamp,previousState:base,result,log:{rating:3},retention:.9,day:'2026-10-16'}}};
}
const state=card=>({v:1,cards:{'phy:t:qa:a':card},sessions:{},goals:{},days:{'2026-10-16':['phy:t:qa:a']},settings:{desiredRetention:.9,newCardsPerDay:20},imports:{}});

test('FSRS state uses the existing private study storage and merges review IDs idempotently',()=>{
 const a=state(record('a','2026-10-16T00:00:00.000Z')),b=state(record('b','2026-10-16T00:01:00.000Z'));
 validateStudyState(a);const merged=writable('_flashcards_owner',b,a,{uid:'owner',role:'student'},()=>null);
 assert.equal(Object.keys(merged.cards['phy:t:qa:a'].reviewLog).length,2);
 const retry=mergeFlashcards(merged,b);assert.deepEqual(retry,merged);assert.equal(retry.days['2026-10-16'].length,1);
});

test('malformed ratings, dates, retention, imports and state fields are rejected',()=>{
 const valid=state(record('a','2026-10-16T00:00:00.000Z'));
 const changes=[v=>v.cards['phy:t:qa:a'].reviewLog.a.rating='made-up',v=>v.cards['phy:t:qa:a'].reviewLog.a.timestamp='invalid',v=>v.settings.desiredRetention=.99,v=>v.cards['phy:t:qa:a'].stability=-1,v=>v.imports={bad:{id:'different'}}];
 for(const change of changes){const value=JSON.parse(JSON.stringify(valid));change(value);assert.throws(()=>validateStudyState(value),error=>error.statusCode===400);}
 validateStudyState({v:1,cards:{legacy:{due:123,interval:3}},sessions:{},goals:{},days:{}});
});

test('a stale upload retains server imports, goals, sessions and unknown legacy fields',()=>{
 const a=state(record('a','2026-10-16T00:00:00.000Z'));a.sessions.saved={updatedAt:5};a.extra='keep';
 a.imports={'phy:import:a':{id:'phy:import:a',subjectId:'phy',front:'Q',back:'A',tags:[],updatedAt:5}};
 const merged=mergeFlashcards(a,state(record('a','2026-10-16T00:00:00.000Z')));
 assert.equal(merged.extra,'keep');assert.ok(merged.imports['phy:import:a']);assert.ok(merged.sessions.saved);validateStudyState(merged);
});

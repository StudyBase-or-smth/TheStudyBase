const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const lib=require('ts-fsrs');
const core=require('../flashcards-core');
const now=Date.parse('2026-10-16T06:00:00Z'),day='2026-10-16';

test('legacy cards migrate to createEmptyCard without losing old schedules, hidden state or extra fields',()=>{
  const old={due:123,interval:9,lapses:4,reviews:7,lastReviewed:99,hidden:true,note:'keep me',updatedAt:8};
  const migrated=core.migrate(old),empty=lib.createEmptyCard(new Date(0));
  assert.equal(migrated.state,empty.state);assert.equal(migrated.stability,empty.stability);assert.equal(migrated.reps,0);
  assert.deepEqual(migrated.legacyScheduling,old);assert.equal(migrated.note,'keep me');assert.equal(migrated.hidden,true);
  assert.equal(migrated.last_review,null);assert.deepEqual(core.migrate(migrated),migrated);
  const merged=core.merge({cards:{old},sessions:{old:{order:['old']}},goals:{},days:{yesterday:['old']},custom:'retained'});
  assert.equal(merged.cards.old.fsrsVersion,1);assert.equal(merged.custom,'retained');assert.deepEqual(merged.days.yesterday,['old']);
});

test('all four previews and selected results are supplied by ts-fsrs, and logs retain the pre-review state',()=>{
  const card=core.migrate(),preview=core.preview(card,now,.9),direct=lib.fsrs({request_retention:.9,enable_fuzz:false,enable_short_term:true}).repeat(lib.createEmptyCard(new Date(0)),new Date(now));
  for(const [name,grade] of Object.entries({again:1,hard:2,good:3,easy:4})){
    assert.equal(preview[name].card.due.getTime(),direct[grade].card.due.getTime());
    const reviewed=core.review(card,name,now,{eventId:'event_'+name,day});
    assert.equal(reviewed.due,direct[grade].card.due.toISOString());assert.equal(reviewed.reps,1);
    const log=reviewed.reviewLog['event_'+name];assert.equal(log.rating,name);assert.equal(log.timestamp,new Date(now).toISOString());assert.equal(log.previousState.state,0);assert.equal(log.log.rating,grade);
  }
  assert.equal(core.interval(now+600000,now),'10m');assert.equal(core.interval(now+3*86400000,now),'3d');assert.equal(core.interval(now+14*86400000,now),'2w');
});

test('duplicate retries and concurrent reviews merge by event ID and replay exactly once in time order',()=>{
  const a=core.review({},'good',now,{eventId:'a',day}),b=core.review({},'hard',now+1000,{eventId:'b',day});
  assert.deepEqual(core.review(a,'good',now,{eventId:'a',day}),a);
  let state=core.merge({cards:{c:a}},{cards:{c:b}});
  const expected=core.review(core.review({},'good',now,{eventId:'a',day}),'hard',now+1000,{eventId:'b',day});
  assert.equal(state.cards.c.reps,2);assert.equal(state.cards.c.due,expected.due);
  state=core.merge(state,{cards:{c:b}});assert.equal(state.cards.c.reps,2);assert.equal(Object.keys(state.cards.c.reviewLog).length,2);
  assert.equal(core.merge(undefined,state).cards.c.reps,2,'Server union logs replay even on a clean device');
});

test('Study queues sort overdue reviews and learning cards and enforce one user-wide daily new budget',()=>{
  const cards=['old','learning','new1','new2','future','hidden'].map(id=>({id})),data=core.merge();
  const base=core.migrate();
  data.cards={old:{...base,state:2,due:new Date(now-2000).toISOString()},learning:{...base,state:1,due:new Date(now-1000).toISOString()},new1:base,new2:base,future:{...base,state:2,due:new Date(now+1000).toISOString()},hidden:{...base,hidden:true}};
  data.cards.otherSubject=core.review({},'good',now,{eventId:'other',day});
  data.settings={desiredRetention:.9,newCardsPerDay:2};
  let q=core.queue(cards,data,now,day);assert.deepEqual(q.cards.map(c=>c.id),['old','learning','new1']);assert.deepEqual(q.counts,{new:1,learning:1,due:1});
  data.settings.newCardsPerDay=0;q=core.queue(cards,data,now,day);assert.deepEqual(q.cards.map(c=>c.id),['old','learning']);
  data.settings.newCardsPerDay=2;assert.equal(core.queue(cards,data,now,'2026-10-17').counts.new,2);
});

test('retention settings have defaults and boundaries and actually affect review intervals',()=>{
  assert.deepEqual(core.settings(),{desiredRetention:.9,newCardsPerDay:20});
  assert.equal(core.settings({desiredRetention:2}).desiredRetention,.97);assert.equal(core.settings({desiredRetention:.1}).desiredRetention,.8);
  const card=core.review({},'easy',now,{eventId:'a',day});const later=Date.parse(card.due);
  assert.ok(core.preview(card,later,.97).good.card.scheduled_days<=core.preview(card,later,.8).good.card.scheduled_days);
});

test('tab text import ignores comments, keeps optional tags and reports malformed rows',()=>{
  const result=core.parseImport('\uFEFF# Comment\r\nForce unit?\tNewton\tphysics mechanics\r\nCapital?\tCanberra\r\ninvalid\r\n\tNo front\r\nToo\tmany\ttabs\there\n');
  assert.equal(result.cards.length,2);assert.deepEqual(result.cards[0].tags,['physics','mechanics']);assert.equal(result.skipped,3);
});

test('the committed offline scheduler is the pinned npm MIT distribution verbatim',()=>{
  const pkg=path.dirname(require.resolve('ts-fsrs'));
  assert.deepEqual(fs.readFileSync('vendor/ts-fsrs/index.umd.js'),fs.readFileSync(path.join(pkg,'index.umd.js')));
  assert.match(fs.readFileSync('vendor/ts-fsrs/LICENSE','utf8'),/MIT License/);
  assert.equal(require('../package.json').dependencies['ts-fsrs'],'5.4.2');
});

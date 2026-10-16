const test=require('node:test'),assert=require('node:assert/strict');
const {authorizeKey,writable}=require('../access-policy');
const {validateGraph}=require('../knowledge-graph');
const student={uid:'learner',role:'student'},teacher={uid:'staff',role:'teacher'};
const graph=()=>({v:1,enabled:true,positions:{a:{x:20,y:30},b:{x:280,y:30}},edges:[{from:'a',to:'b'}],updatedAt:Date.now()});
test('knowledge graph access matches subject and class editing permissions',()=>{
  assert.doesNotThrow(()=>authorizeKey('knowledge_subject_eng2',student,true));
  assert.doesNotThrow(()=>authorizeKey('knowledge_class_2026-engineering',student,false));
  assert.throws(()=>authorizeKey('knowledge_class_2026-engineering',student,true),e=>e.statusCode===403);
  for(const role of ['teacher','dev'])assert.doesNotThrow(()=>authorizeKey('knowledge_class_2026-engineering',{...teacher,role},true));
  assert.throws(()=>authorizeKey('knowledge_arbitrary_eng2',teacher,true),e=>e.statusCode===403);
});
test('knowledge graph storage accepts canonical settings and rejects malformed or circular links',()=>{
  const value=graph();assert.deepEqual(writable('knowledge_subject_eng2',value,null,student),value);
  for(const mutate of [v=>v.enabled='true',v=>v.positions.a.x=Infinity,v=>v.edges.push({from:'b',to:'a'}),v=>v.edges.push({from:'a',to:'a'}),v=>v.edges.push({from:'a',to:'b'}),v=>v.edges.push({from:'constructor',to:'a'}),v=>v.positions=[],v=>v.edges=Array(10001).fill({from:'a',to:'b'})]){
    const bad=graph();mutate(bad);assert.throws(()=>validateGraph(bad),e=>e.statusCode===400);
  }
  const disabled=graph();disabled.enabled=false;assert.equal(validateGraph(disabled).enabled,false);
  const added=graph();added.nodes=['a','b'];assert.deepEqual(validateGraph(added).nodes,['a','b']);
  for(const nodes of ['a',['a','a'],['constructor'],Array(3001).fill('a')])assert.throws(()=>validateGraph({...graph(),nodes}),e=>e.statusCode===400);
});
test('topic inclusion is optional, boolean, and preserves other topic fields',()=>{
  const topic={id:'a',name:'Area',definition:'Keep this',knowledgeGraphIncluded:true};
  assert.deepEqual(writable('eng2_topics',[topic],[],teacher),[topic]);
  assert.doesNotThrow(()=>writable('eng2_topics',[{id:'legacy'}],[],teacher));
  assert.throws(()=>writable('eng2_topics',[{...topic,knowledgeGraphIncluded:'yes'}],[],teacher),e=>e.statusCode===400);
});

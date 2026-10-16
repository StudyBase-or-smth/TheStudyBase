const test=require('node:test'),assert=require('node:assert/strict'),{validateDrawing}=require('../drawing-data'),{authorizeKey,writable}=require('../access-policy');
const sample=()=>({v:1,width:794,height:1123,strokes:[{points:[[10,20,.3],[100,200,.9]],colour:'#123456',size:4,tool:'pen',simulatePressure:false}]});
test('Draw topics use existing class permissions and retain editable JSON in topic storage',()=>{
  const teacher={uid:'teacher',role:'teacher'},student={uid:'learner',role:'student'},topic={id:'drawing1',name:'Sketch',layout:'draw',content:{drawData:sample()}};
  assert.doesNotThrow(()=>authorizeKey('2026-eng_topics',teacher,true));assert.throws(()=>authorizeKey('2026-eng_topics',student,true));assert.doesNotThrow(()=>authorizeKey('2026-eng_topics',student,false));
  assert.deepEqual(writable('2026-eng_topics',[topic],[],teacher),[topic]);
  const shrink=sample();shrink.width=64;shrink.height=64;assert.doesNotThrow(()=>validateDrawing(shrink),'out-of-bounds old points must survive a canvas shrink');
  const annotated=sample();annotated.background={name:'Worksheet',width:794,height:1123,src:'data:image/jpeg;base64,aGVsbG8='};annotated.pages=[{width:800,height:600,background:annotated.background,strokes:[]}];assert.deepEqual(validateDrawing(annotated),annotated);
  assert.throws(()=>validateDrawing({...annotated,background:{...annotated.background,src:'https://external.example/tracking.png'}}));assert.throws(()=>validateDrawing({...annotated,pages:[{width:10,height:10,strokes:[]}]}));
});
test('drawing storage rejects malformed dimensions, pressure, tools and executable colour values',()=>{
  for(const change of [v=>v.width=0,v=>v.width=8193,v=>v.height=Infinity,v=>v.strokes[0].points[0][2]=2,v=>v.strokes[0].colour='url(javascript:alert(1))',v=>v.strokes[0].size=-1,v=>v.strokes[0].tool='eraser',v=>v.strokes[0].simulatePressure='true',v=>v.strokes[0].points=[],v=>v.strokes=Array(10001).fill(v.strokes[0])]){const bad=sample();change(bad);assert.throws(()=>validateDrawing(bad),e=>e.statusCode===400);}
});

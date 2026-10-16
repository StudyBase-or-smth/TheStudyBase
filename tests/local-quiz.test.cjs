const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {once}=require('node:events');
const {createServer}=require('../scripts/serve-local.cjs');

test('local launcher serves the quiz and relays only same-origin marking without accounts',async t=>{
  let calls=0;
  const server=createServer({fetchImpl:async(url,options)=>{
    calls++;assert.equal(url,'https://api.typesafe.ai/v1/systemone');
    assert.equal(options.headers.Authorization,'Bearer personal-test-key');
    assert.ok(!options.body.includes('personal-test-key'));
    return {ok:true,json:async()=>({model:'jev-1.13.0',answers:{mark:{type:'choice',choice:'marks_1',confidence:0.9}},text:'must not expose'})};
  }});
  server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const port=server.address().port,origin=`http://127.0.0.1:${port}`;
  function request(path,headers={},body){return new Promise((resolve,reject)=>{
    const req=http.request(origin+path,{method:body?'POST':'GET',headers},res=>{
      let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,text,headers:res.headers}));
    });req.on('error',reject);req.end(body);
  });}
  const page=await request('/quiz-tool/quiz-tool.html');assert.equal(page.status,200);assert.match(page.text,/local-quiz-runtime.js/);
  assert.match((await request('/local-quiz-runtime.js')).text,/SB_LOCAL_JEV_RELAY = true/);
  assert.equal((await request('/.git/config')).status,404);
  assert.equal((await request('/secrets.json')).status,404);
  assert.equal((await request('/quiz-tool/storage/Engineering-2024-S2.json')).status,200);
  const body=JSON.stringify({model:'jev-1.13.0',state:{question:'Q',marking_guidance:'Rubric',student_response:'A'},questions:{mark:{type:'choice',instructions:'Mark',criteria:{marks_0:'Wrong',marks_1:'Correct'}}}});
  const headers={'Content-Type':'application/json',Authorization:'Bearer personal-test-key',Origin:origin};
  const result=await request('/api/localJev',headers,body);assert.equal(result.status,200);assert.equal(JSON.parse(result.text).answers.mark.choice,'marks_1');
  assert.ok(!result.text.includes('personal-test-key'));assert.ok(!result.text.includes('must not expose'));
  assert.equal((await request('/api/localJev',{...headers,Origin:'https://untrusted.example'},body)).status,403);
  assert.equal((await request('/api/localJev',{...headers,Host:'rebind.example'},body)).status,403);
  assert.equal((await request('/api/localJev',{'Content-Type':'application/json',Authorization:'Bearer personal-test-key'},body)).status,403);
  assert.equal(calls,1);
});

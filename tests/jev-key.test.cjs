const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');

test('optional Jev key settings save masked, stay account scoped and clear to the site default',()=>{
  const dom=new JSDOM('',{url:'https://studybase.example/index.html',runScripts:'outside-only'}),w=dom.window;
  w.currentUid='alice';
  w.HTMLDialogElement.prototype.showModal=function(){};
  w.HTMLDialogElement.prototype.close=function(){this.dispatchEvent(new w.Event('close'));};
  w.eval(fs.readFileSync('qol.js','utf8'));
  w.SBQoL.preferences();
  let input=w.document.querySelector('.qol-api-key input');
  const click=text=>[...w.document.querySelectorAll('.qol-api-key-actions button')].find(b=>b.textContent===text).click();
  assert.equal(input.type,'password');assert.equal(input.value,'');
  input.value='personal-test-key';click('Save');assert.equal(w.SBQoL.getJevApiKey(),'personal-test-key');
  assert.equal(w.SBQoL.read('preferences',{}).jevApiKey,undefined);
  w.currentUid='bob';assert.equal(w.SBQoL.getJevApiKey(),'');
  w.currentUid='alice';w.SBQoL.preferences();input=w.document.querySelector('.qol-api-key input');assert.equal(input.value,'personal-test-key');
  input.value='invalid key';click('Save');assert.equal(w.SBQoL.getJevApiKey(),'personal-test-key');
  click('Clear');assert.equal(w.SBQoL.getJevApiKey(),'');assert.equal(input.value,'');
  dom.window.close();
});

test('personal keys mark directly through Jev without sign-in or any backend request',async()=>{
  const dom=new JSDOM('',{url:'file:///C:/StudyBase/quiz-tool/quiz-tool.html',runScripts:'outside-only'}),w=dom.window;
  w.isGuest=true;w.SBQoL={getJevApiKey:()=> 'personal-test-key'};
  w.eval(fs.readFileSync('quiz-tool/quiz-marking.js','utf8'));
  let calls=0;
  w.fetch=async(url,options)=>{
    calls++;assert.equal(url,'https://api.typesafe.ai/v1/systemone');assert.equal(options.headers.Authorization,'Bearer personal-test-key');
    const body=JSON.parse(options.body);assert.ok(!options.body.includes('personal-test-key'));
    assert.equal(body.state.marking_guidance,'Criteria');assert.equal(body.state.student_response,'Response');
    assert.equal(body.questions.mark.type,'choice');assert.equal(body.questions.mark.criteria.marks_1,'Correct');
    return {ok:true,headers:new Headers({'content-type':'application/json'}),json:async()=>({answers:{mark:{type:'choice',choice:'marks_1',confidence:0.9}},text:'Never show generated text'})};
  };
  const result=await w.StudyQuizMarking.mark({question:'Question',answer:'Criteria',marks:1,markingLevels:{0:'Incorrect',1:'Correct'}},'Response');
  assert.equal(calls,1);assert.equal(result.earned,1);assert.equal(result.provider,'jev');assert.equal(result.text,undefined);
  w.fetch=async()=>({ok:false,status:401,headers:new Headers({'content-type':'application/json'}),json:async()=>({})});
  await assert.rejects(w.StudyQuizMarking.mark({question:'Question',answer:'Criteria',marks:1,markingLevels:{0:'Incorrect',1:'Correct'}},'Response'),/rejected your API key/);
  dom.window.close();
});

test('launcher runtime uses its own origin for Jev transport without Firebase sign-in',async()=>{
  const dom=new JSDOM('',{url:'http://127.0.0.1:8888/quiz-tool/quiz-tool.html',runScripts:'outside-only'}),w=dom.window;
  w.isGuest=true;w.SB_LOCAL_JEV_RELAY=true;w.SBQoL={getJevApiKey:()=> 'personal-test-key'};
  w.sbApiUrl=()=>{throw Error('Must not use hosted backend');};
  w.eval(fs.readFileSync('quiz-tool/quiz-marking.js','utf8'));
  w.fetch=async(url,options)=>{
    assert.equal(url,'http://127.0.0.1:8888/api/localJev');assert.equal(options.headers.Authorization,'Bearer personal-test-key');
    return {ok:true,headers:new Headers({'content-type':'application/json'}),json:async()=>({answers:{mark:{type:'choice',choice:'marks_0',confidence:0.9}}})};
  };
  const result=await w.StudyQuizMarking.mark({question:'Question',answer:'Criteria',marks:1,markingLevels:{0:'Incorrect',1:'Correct'}},'Response');
  assert.equal(result.earned,0);dom.window.close();
});

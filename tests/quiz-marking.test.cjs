const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(require.resolve('../quiz-tool/quiz-tool.html'),'utf8');
const q={question:'Identify an effect and a reduction strategy.',answer:'Credit both parts.',marks:2,isAICheck:true,markingLevels:{0:'Neither',1:'One part',2:'Both'},completionGuide:'Address both parts. <script>text only</script>'};
function fixture(){
 const dom=new JSDOM('<div id="quizCanvas"><textarea id="quizAIAnswerInput">A response</textarea><div id="quizFeedback"></div><button id="quizSubmitBtn">Submit</button><button id="quizNextBtn"></button></div>',{url:'https://studybase.example/quiz-tool/quiz-tool.html',runScripts:'outside-only'}),w=dom.window;
 w.__sbAuth={currentUser:{getIdToken:async()=> 'test-token'}};
 w.sbApiUrl=path=>'https://backend.example'+path;
 w.eval(fs.readFileSync(require.resolve('../quiz-tool/quiz-marking.js'),'utf8'));
 const engine=html.slice(html.indexOf('function setAICheckBusy'),html.indexOf('/* ── Shared ── */',html.indexOf('function setAICheckBusy')));
 const feedback=html.slice(html.indexOf('function showFeedback'),html.indexOf('function submitAnswer()',html.indexOf('function showFeedback')));
 w.fixtureState={questions:[q],index:0,perQuestion:[]};w.saved=0;
 w.eval('let quizState=window.fixtureState; function persistCurrentQuiz(){window.saved++;} function renderSidebar(){} function revealAdvanceButton(){} '+feedback+engine+';window.submitTest=submitAICheck;window.changeTestState=s=>{quizState=s;};');
 return {dom,w};
}
test('written answers use only the authenticated Jev endpoint and author-written guidance',async()=>{
 const {dom,w}=fixture();let calls=0;
 w.fetch=async(url,options)=>{calls++;assert.equal(url,'https://backend.example/api/quizGrade');assert.equal(options.headers.Authorization,'Bearer test-token');const body=JSON.parse(options.body);assert.equal(body.markingGuidance,q.answer);assert.equal(body.completionGuide,undefined);assert.equal(body.prompt,undefined);return {ok:true,headers:new Headers({'content-type':'application/json'}),json:async()=>({earned:1,total:2,provider:'jev',model:'jev-1.13.0',confidence:0.8,text:'Generated text must be ignored'})};};
 await w.submitTest();assert.equal(calls,1);assert.equal(w.saved,1);assert.equal(w.fixtureState.perQuestion[0].earned,1);assert.equal(w.fixtureState.perQuestion[0].feedback,undefined);
 assert.equal(w.document.getElementById('quizFeedback').textContent,'1 / 2 marks for this question');assert.equal(w.document.querySelector('.quiz-completion-guide p').textContent,q.completionGuide);assert.equal(w.document.querySelector('.quiz-completion-guide script'),null);assert.equal(w.document.getElementById('quizAIAnswerInput').disabled,true);dom.window.close();
});
test('failed or malformed marks remain editable and never record a zero or try another provider',async()=>{
 const {dom,w}=fixture();let calls=0;w.fetch=async()=>{calls++;return {ok:true,headers:new Headers({'content-type':'application/json'}),json:async()=>({earned:1.5,total:2,provider:'jev',confidence:0.8})};};
 await w.submitTest();assert.equal(calls,1);assert.equal(w.saved,0);assert.equal(w.fixtureState.perQuestion[0],undefined);assert.equal(w.document.getElementById('quizAIAnswerInput').disabled,false);assert.match(w.document.getElementById('quizFeedback').textContent,/Invalid marking/);dom.window.close();
});
test('guest requests and stale marking responses cannot modify quiz progress',async()=>{
 const {dom,w}=fixture();w.isGuest=true;w.fetch=()=>{throw Error('Must not request as guest');};await w.submitTest();assert.equal(w.saved,0);
 w.isGuest=false;let resolve;w.fetch=()=>new Promise(r=>{resolve=r;});const pending=w.submitTest();await new Promise(r=>setImmediate(r));const next={questions:[q],index:0,perQuestion:[]};w.changeTestState(next);
 resolve({ok:true,headers:new Headers({'content-type':'application/json'}),json:async()=>({earned:2,total:2,provider:'jev',confidence:1})});await pending;assert.equal(w.saved,0);assert.equal(next.perQuestion[0],undefined);dom.window.close();
});
test('completion guidance is optional and every current written question has complete Jev bands',()=>{
 const {dom,w}=fixture();w.StudyQuizMarking.showCompletionGuide(w.document.getElementById('quizCanvas'),{});assert.equal(w.document.querySelector('.quiz-completion-guide'),null);dom.window.close();
 for(const file of fs.readdirSync('quiz-tool/storage').filter(f=>f.endsWith('.json'))){const data=JSON.parse(fs.readFileSync('quiz-tool/storage/'+file,'utf8'));for(const item of data.questions||[])if(item.isAICheck)for(let i=0;i<=item.marks;i++)assert.ok(item.markingLevels[i],file+': '+item.id+' band '+i);}
 assert.doesNotMatch(html,/gemini|generativelanguage|359-|369-|callAI\(/i);
 const parsed=new JSDOM(html);for(const script of parsed.window.document.querySelectorAll('script:not([src]):not([type="module"])'))new vm.Script(script.textContent);parsed.window.close();
});

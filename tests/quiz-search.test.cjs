const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require('jsdom');
const read = p => fs.readFileSync(p,'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));
const manifest = [{file:'paper.json',name:'2024 Engineering Studies',subject:'Engineering',section:'Section I'}];
const paper = {questions:[{id:'q1',name:'Question 1',question:'What is the function of a geotextile?',isMultipleChoice:true,answers:[{text:'Filtration',correct:true}],questionContent:[{type:'table',caption:'Material properties',columns:['Resistance'],rows:[['Copper']]}],answer:'Private marking guidance',completionGuide:'Authored solution'}]};
function fixture(fetch) {
  const dom = new JSDOM('',{url:'https://studybase.example/subject/subject.html',runScripts:'outside-only'}),w=dom.window;
  w.isGuest=true;w.fetch=fetch;
  w.HTMLDialogElement.prototype.showModal=function(){};
  w.HTMLDialogElement.prototype.close=function(){this.dispatchEvent(new w.Event('close'));};
  for(const path of ['site-config.js','site-tools.js','qol.js'])w.eval(read(path));
  return {dom,w,query(text){const input=w.document.querySelector('.qol-search');input.value=text;input.dispatchEvent(new w.Event('input'));return [...w.document.querySelectorAll('.qol-search-results a')];}};
}

test('site search finds quiz titles, question text and visible choices, caches content and links to exact questions',async()=>{
  const calls=[];
  const {dom,w,query}=fixture(async url=>{calls.push(String(url));return {ok:true,json:async()=>String(url).endsWith('manifest.json')?manifest:paper};});
  w.SBQoL.search();query('geotextile');await settle();
  let rows=query('geotextile');assert.equal(rows.length,1);
  assert.match(rows[0].textContent,/2024 Engineering Studies.*Section I/);
  const target=new URL(rows[0].href),hash=new URLSearchParams(target.hash.slice(1));
  assert.equal(target.pathname,'/quiz-tool/quiz-tool.html');assert.equal(hash.get('file'),'paper.json');assert.equal(hash.get('question'),'q1');
  assert.equal(query('filtration').length,1);
  assert.equal(query('resistance copper').length,1);
  assert.equal(query('private marking').length,0);assert.equal(query('Authored solution').length,0);
  rows=query('2024 engineering');assert.ok(rows.some(row=>row.querySelector('strong').textContent==='2024 Engineering Studies'));
  assert.equal(calls.length,2);assert.ok(calls.every(url=>url.startsWith('https://studybase.example/quiz-tool/storage/')));
  w.SBQoL.search();await settle();assert.equal(calls.length,2);
  dom.window.close();
});

test('disabled Quiz Tool does not load or expose quiz content',async()=>{
  const {dom,w,query}=fixture(()=>assert.fail('Disabled quiz must not load'));
  w.STUDYBASE_CONFIG.tools.find(t=>t.id==='quiz').disabled=true;
  w.SBQoL.search();await settle();assert.equal(query('geotextile').length,0);
  assert.equal(query('quiz').length,0);assert.ok(w.document.querySelector('[aria-disabled]'));
  dom.window.close();
});

test('failed quiz files leave available content searchable and retry on reopening search',async()=>{
  let fail=true,calls=0;
  const {dom,w,query}=fixture(async url=>{calls++;if(String(url).endsWith('manifest.json'))return {ok:true,json:async()=>[...manifest,{...manifest[0],file:'other.json'}]};return {ok:!(fail&&String(url).endsWith('other.json')),json:async()=>paper};});
  w.SBQoL.search();query('geotextile');await settle();
  assert.equal(query('geotextile').length,1);assert.match(w.document.querySelector('.qol-dialog-content > .qol-muted').textContent,/Some quiz content/);
  fail=false;w.SBQoL.search();await settle();assert.equal(query('geotextile').length,2);assert.equal(calls,6);
  dom.window.close();
});

test('quiz route accepts legacy links and exact-question links without discarding saved answers',async()=>{
  const html=read('quiz-tool/quiz-tool.html');
  const dom=new JSDOM('<div id="quizCanvas"></div>',{url:'https://studybase.example/quiz-tool/quiz-tool.html#paper.json',runScripts:'outside-only'}),w=dom.window;
  const data={questions:[{id:'q1',marks:1},{id:'q2',marks:1}]};
  w.fetch=async()=>({ok:true,json:async()=>data});
  w.progress={file:'paper.json',index:0,atSummary:true,perQuestionByFile:{'paper.json':[{earned:1,total:1},null]}};
  const hash=html.slice(html.indexOf('function quizHashFile('),html.indexOf('async function bootQuiz('));
  const loader=html.slice(html.indexOf('async function loadQuizByFile('),html.indexOf('function escapeHtml('));
  const clone=html.slice(html.indexOf('function cloneSavedAnswers('),html.indexOf('function paperHasProgress('));
  w.eval(`let quizState=null;const STORAGE_FOLDER='storage',quizManifest=[{file:'paper.json'}];
    function marksForQuestion(q){return q.marks;}
    function getPaperProgress(){return window.progress;}
    function updateQuizBreadcrumb(){} function renderSidebar(){} function renderSummary(){}
    function renderQuestion(){const q=quizState.questions[quizState.index];setQuizHash(quizState.filename,q.id);}
    function escapeHtml(s){return s;}
    ${hash}\n${clone}\n${loader}
    window.loadTest=loadQuizByFile;window.fileTest=quizHashFile;window.questionTest=quizHashQuestion;window.result=()=>quizState;`);
  assert.equal(w.fileTest(),'paper.json');assert.equal(w.questionTest(),null);
  w.history.replaceState(null,'','#file=paper.json&question=q2');
  assert.equal(w.fileTest(),'paper.json');assert.equal(w.questionTest(),'q2');
  await w.loadTest('paper.json','Paper',{resume:true,questionId:w.questionTest()});
  assert.equal(w.result().index,1);assert.equal(w.result().atSummary,false);assert.equal(w.result().perQuestion[0].earned,1);
  assert.equal(w.questionTest(),'q2');
  dom.window.close();
});

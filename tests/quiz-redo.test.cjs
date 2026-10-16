const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync('quiz-tool/quiz-tool.html','utf8');
const questions=[
  {id:'q1',name:'Question 1'},
  {id:'q2',name:'Question 2'},
  {id:'q21a',name:'Question 21 (a)',marks:3,isAICheck:true},
  {id:'q21b',name:'Question 21 (b)',marks:2,isAICheck:true},
  {id:'q5',name:'Question 5'}
];
function fixture(answers=[{earned:1,total:1},{earned:0,total:1},{earned:1,total:3},null,{earned:1,total:1}]) {
  const dom=new JSDOM('<div id="hdrBreadcrumb"></div><div id="quizSidebar"></div><div id="quizCanvas"></div>',{url:'https://studybase.example/quiz-tool/quiz-tool.html',runScripts:'outside-only'}),w=dom.window;
  w.initial={questions,filename:'paper.json',quizName:'Paper',index:4,atSummary:false,perQuestion:answers,totalMarks:8};
  w.store={Paper:{perQuestionByFile:{'other.json':[{earned:2,total:2}]}}};
  w.fetch=async()=>({ok:true,json:async()=>({questions})});
  const persistence=html.slice(html.indexOf('function questionIndices('),html.indexOf('function clearPaperProgress('));
  const progressChecks=html.slice(html.indexOf('function paperHasProgress('),html.indexOf('function questionIndices('));
  const breadcrumb=html.slice(html.indexOf('function updateQuizBreadcrumb('),html.indexOf('async function loadQuizByFile('));
  const loader=html.slice(html.indexOf('async function loadQuizByFile('),html.indexOf('function escapeHtml('));
  const clone=html.slice(html.indexOf('function cloneSavedAnswers('),html.indexOf('function paperHasProgress('));
  const question=html.slice(html.indexOf('function getEarnedMarks('),html.indexOf('/* ── Sidebar:'));
  const sidebar=html.slice(html.indexOf('function renderSidebar('),html.indexOf('/* ── Multiple choice'));
  const summary=html.slice(html.indexOf('function redoQuiz('),html.indexOf("document.addEventListener('DOMContentLoaded', bootQuiz)"));
  const heading=html.slice(html.indexOf('function renderHeadingAndStem('),html.indexOf('/* ── Shared: optional question image'));
  w.eval(`let quizState=window.initial;const STORAGE_FOLDER='storage',dictionaryCache={};
    const quizManifest=[{file:'paper.json',name:'Paper',subject:'Engineering',section:'Section I'},{file:'other.json',name:'Paper',subject:'Engineering',section:'Section II'}];
    function paperKey(p){return p.name;}
    function readProgressStore(){return JSON.parse(JSON.stringify(window.store));}
    function writeProgressStore(s){window.store=JSON.parse(JSON.stringify(s));}
    function getPaperProgress(p){return readProgressStore()[paperKey(p)];}
    function setQuizHash(){} function showQuizHome(){}
    function isDictionaryNumberQuestion(){return false;}
    function escapeHtml(s){const el=document.createElement('div');el.textContent=s;return el.innerHTML;}
    function paint(q,index,total,prior){
      window.lastRendered=q.id;
      const canvas=document.getElementById('quizCanvas');
      canvas.innerHTML='<div class="quiz-heading"><span class="quiz-heading-name"></span></div><div class="quiz-stem"></div><div class="quiz-actions"><button id="quizSubmitBtn">Submit</button><button id="quizNextBtn"></button></div>';
      renderHeadingAndStem(canvas,q);
      if(prior)revealAdvanceButton();
    }
    const renderChoiceQuestion=paint,renderAICheckQuestion=paint,renderSelfAssessmentQuestion=paint,renderMathQuestion=paint,renderDictionaryNumberQuestion=paint;
    ${progressChecks}\n${persistence}\n${breadcrumb}\n${clone}\n${loader}\n${question}\n${sidebar}\n${summary}\n${heading}
    window.showSummary=renderSummary;window.nextTest=nextQuestion;window.redoTest=redoQuiz;window.loadTest=loadQuizByFile;window.result=()=>quizState;
  `);
  return {dom,w,d:w.document};
}

test('sidebar badges subtract missed marks from earned marks, including partial credit and zero',()=>{
  const {dom,w,d}=fixture();
  const state=w.result();
  state.perQuestion=[{earned:1,total:3},{earned:3,total:3},{earned:0,total:3},{earned:2,total:3},{earned:1,total:2}];
  w.showSummary();
  const badges=[...d.querySelectorAll('.quiz-nav-delta')];
  assert.deepEqual(badges.map(el=>el.textContent),['−1','+3','−3','+1','0']);
  assert.deepEqual(badges.map(el=>el.className.split(' ').at(-1)),['down','up','down','up','neutral']);
  assert.equal(badges[0].title,'1 earned − 2 missed = −1');
  dom.window.close();
});

test('skip advances without assigning a mark and the final skipped question resumes its results screen',async()=>{
  const {dom,w,d}=fixture(questions.map(()=>null));
  await w.loadTest('paper.json','Paper');
  assert.equal(d.querySelector('#quizSkipBtn').nextElementSibling.id,'quizSubmitBtn');
  d.querySelector('#quizSkipBtn').click();assert.equal(w.result().index,1);assert.equal(w.result().perQuestion[0],null);
  for(let i=1;i<questions.length;i++)d.querySelector('#quizSkipBtn').click();
  assert.equal(w.result().atSummary,true);assert.ok(w.result().perQuestion.every(p=>p===null));
  await w.loadTest('paper.json','Paper',{resume:true});assert.equal(w.result().atSummary,true);
  assert.equal(w.store.Paper.perQuestionByFile['other.json'][0].earned,2);
  dom.window.close();
});

test('flags toggle independently of grading, survive resume and preserve sidebar scroll',async()=>{
  const {dom,w,d}=fixture(questions.map(()=>null));await w.loadTest('paper.json','Paper');
  let flag=d.querySelector('.quiz-flag-btn');assert.equal(flag.getAttribute('aria-pressed'),'false');
  d.querySelector('#quizNavList').scrollTop=150;flag.click();
  assert.equal(flag.getAttribute('aria-pressed'),'true');assert.equal(w.result().perQuestion[0],null);
  assert.equal(d.querySelector('#quizNavList').scrollTop,150);
  assert.ok(d.querySelector('[data-idx="0"] .quiz-nav-flag'));
  assert.deepEqual([...w.store.Paper.flaggedQuestionIdsByFile['paper.json']],['q1']);
  assert.equal(w.currentQuizHasProgress(),true);
  await w.loadTest('paper.json','Paper',{resume:true});flag=d.querySelector('.quiz-flag-btn');
  assert.equal(flag.getAttribute('aria-pressed'),'true');flag.click();assert.equal(flag.getAttribute('aria-pressed'),'false');
  assert.equal(d.querySelector('.quiz-nav-flag'),null);dom.window.close();
});

test('redo failed repeats only missed, partial and unanswered items and preserves correct results and other sections',()=>{
  const {dom,w,d}=fixture();w.showSummary();const old=w.result();
  assert.equal(d.querySelector('.bc-current').textContent,'Results');
  d.querySelector('#quizRedoFailed').click();const state=w.result();
  assert.notEqual(state,old);assert.deepEqual([...state.reviewIndices],[1,2,3]);
  assert.equal(state.perQuestion[0].earned,1);assert.equal(state.perQuestion[4].earned,1);
  assert.equal(state.perQuestion[1],null);assert.equal(state.perQuestion[2],null);assert.equal(state.index,1);
  assert.deepEqual([...d.querySelectorAll('#quizNavList .topic-item-wrap')].map(el=>Number(el.dataset.idx)),[1,2,3]);
  assert.equal(d.querySelector('.bc-current').textContent,'Question 2');
  assert.equal(w.store.Paper.perQuestionByFile['other.json'][0].earned,2);
  state.perQuestion[1]={earned:1,total:1};w.nextTest();assert.equal(state.index,2);assert.equal(d.querySelector('.bc-current').textContent,'Question 21 (a)');
  state.perQuestion[2]={earned:3,total:3};w.nextTest();assert.equal(state.index,3);
  state.perQuestion[3]={earned:2,total:2};w.nextTest();assert.equal(state.atSummary,true);
  assert.equal(d.querySelector('.quiz-score').textContent,'8 / 8 marks');assert.equal(d.querySelector('#quizRedoFailed').disabled,true);
  dom.window.close();
});

test('redo quiz starts a fresh state for the current section and restores the full navigation',()=>{
  const {dom,w,d}=fixture();w.showSummary();d.querySelector('#quizRedoFailed').click();w.showSummary();const old=w.result();
  d.querySelector('#quizRedo').click();const state=w.result();
  assert.notEqual(state,old);assert.equal(state.index,0);assert.equal(state.atSummary,false);assert.equal(state.reviewIndices,null);
  assert.ok(state.perQuestion.every(p=>p===null));assert.equal(d.querySelectorAll('#quizNavList .topic-item-wrap').length,5);
  assert.equal(d.querySelector('.bc-current').textContent,'Question 1');
  assert.equal(w.store.Paper.perQuestionByFile['other.json'][0].earned,2);
  assert.deepEqual([...w.store.Paper.reviewQuestionIdsByFile['paper.json']],[]);
  dom.window.close();
});

test('failed-question review resumes its queue and preserves previously correct answers after reopening',async()=>{
  const {dom,w,d}=fixture();w.showSummary();d.querySelector('#quizRedoFailed').click();w.nextTest();
  await w.loadTest('paper.json','Paper',{resume:true});const state=w.result();
  assert.deepEqual([...state.reviewIndices],[1,2,3]);assert.equal(state.index,2);assert.equal(state.perQuestion[0].earned,1);
  assert.equal(d.querySelector('.bc-current').textContent,'Question 21 (a)');
  await w.loadTest('paper.json','Paper',{resume:true,questionId:'q5'});
  assert.equal(w.result().index,4);assert.equal(w.result().reviewIndices,null);
  assert.equal(w.result().perQuestion[0].earned,1);
  dom.window.close();
});

test('perfect quizzes disable failed redo and question renderers omit the redundant progress line',()=>{
  const {dom,w,d}=fixture(questions.map(q=>({earned:q.marks||1,total:q.marks||1})));
  w.showSummary();const before=w.result();assert.equal(d.querySelector('#quizRedoFailed').disabled,true);
  w.redoTest(true);assert.equal(w.result(),before);
  assert.doesNotMatch(html,/<div class="quiz-progress">Question \$\{index/);
  dom.window.close();
});

test('a retry with no answers yet remains resumable even when every original answer failed',()=>{
  const {dom,w,d}=fixture(questions.map(q=>({earned:0,total:q.marks||1})));
  w.showSummary();d.querySelector('#quizRedoFailed').click();
  assert.equal(w.result().index,0);assert.ok(w.result().perQuestion.every(p=>p===null));
  assert.equal(w.currentQuizHasProgress(),true);
  assert.equal(w.paperHasProgress({name:'Paper',sections:[{file:'paper.json'}]}),true);
  dom.window.close();
});

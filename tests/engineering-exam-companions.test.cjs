const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require('jsdom');
const html = fs.readFileSync('quiz-tool/quiz-tool.html', 'utf8');
const load = file => JSON.parse(fs.readFileSync('quiz-tool/storage/' + file, 'utf8'));

test('all three Engineering papers contain actual questions, original layouts and official answer keys', () => {
  const manifest = load('manifest.json');
  const keys = {2024:'BDCBCDABDBCDC BBD CACA'.replace(/ /g,''), 2023:'CCBCADDCDCCDBACACCCA', 2025:'CBDBCD AADCDC DCDACCBB'.replace(/ /g,'')};
  for (const year of [2025, 2024, 2023]) {
    const filename = n => year === 2025 ? `EngineeringS-S${n}.json` : `Engineering-${year}-S${n}.json`;
    const sections = [1,2].map(n => load(filename(n)));
    for (let i = 0; i < 2; i++) {
      assert.ok(manifest.some(e => e.file === filename(i+1) && !e.sourceLinked));
      assert.equal(sections[i].studyMode, 'exam-questions');
      assert.equal(new Set(sections[i].questions.map(q => q.id)).size, sections[i].questions.length);
      for (const q of sections[i].questions) {
        assert.doesNotMatch(q.question, /Read Question|Complete Question.*official exam paper/);
        assert.ok(q.question.length > 25);
        assert.ok(q.questionContent.length > 0, q.id);
        assert.equal(q.questionContent.filter(b => b.type === 'text').map(b => b.text).join(' '), q.question);
        assert.equal(q.sourceImages,undefined);
        for (const item of [...q.questionContent.filter(b => b.type === 'image'), ...(q.markingImages || [])]) {
          assert.ok(fs.existsSync('quiz-tool/storage/' + item.path), item.path);
          assert.ok(fs.statSync('quiz-tool/storage/' + item.path).size > 1000);
        }
        for (const field of ['sourcePaper', 'sourcePack', 'sourceMarking']) {
          assert.equal(new URL(q[field]).hostname, 'www.nsw.gov.au');
          assert.ok(q[field].includes(String(year)));
        }
      }
    }
    assert.equal(sections[0].questions.length, 20);
    assert.equal(sections[0].questions.map(q => {
      assert.equal(q.answers.filter(a => a.correct).length, 1);
      assert.ok(q.answers.every((a,i) => a.text.startsWith('ABCD'[i]+'. '))); 
      return q.answers.find(a => a.correct).text[0];
    }).join(''), keys[year]);
    assert.equal(sections[1].questions.length, year === 2025 ? 25 : 26);
    assert.equal(sections[1].questions.reduce((n,q) => n + q.marks, 0), 80);
    assert.ok(sections[1].questions.every(q => !q.selfAssess && q.isAICheck && q.answer.includes('NESA')));
  }
});

function fixture(q, prior = null) {
  const dom = new JSDOM('<div id="quizCanvas"></div>', {runScripts:'outside-only'});
  const w = dom.window;
  w.state = {index:0, questions:[q], quizName:'Engineering', perQuestion:[prior]};
  w.saved = 0;
  w.eval(fs.readFileSync('quiz-tool/quiz-content.js','utf8'));
  const renderer = html.slice(html.indexOf('function setAICheckBusy'), html.indexOf('/* ── Shared ── */',html.indexOf('function setAICheckBusy')));
  const heading = html.slice(html.indexOf('function renderHeadingAndStem'), html.indexOf('/* ── Shared: optional question image'));
  w.eval(`let quizState = window.state; const STORAGE_FOLDER = 'storage';
    function escapeHtml(s){return s;}
    function paintQuiz(markup){document.getElementById('quizCanvas').innerHTML=markup;}
    function showFeedback(){}
    function renderSidebar(){} function renderQuestionImage(){}
    function persistCurrentQuiz(){window.saved++;}
    function revealAdvanceButton(){document.getElementById('quizNextBtn').style.display='';}
    ${heading}\n${renderer}\nwindow.renderTest=renderAICheckQuestion;`);
  w.renderTest(q,0,1,prior);
  return {dom,w,d:w.document};
}

test('written tasks never offer a self-assigned mark or expose criteria before marking', () => {
  const q = load('Engineering-2024-S2.json').questions[0];
  const {dom,d} = fixture(q);
  assert.ok(d.querySelector('#quizAIAnswerInput'));
  assert.equal(d.querySelector('#quizSelfMark'),null);
  assert.equal(d.querySelector('#quizSelfReview'),null);
  assert.equal(d.querySelector('.quiz-exam-layout'),null);
  assert.match(q.answer,/inservice properties of piers/);
  assert.match(q.answer,/1/);
  dom.window.close();
});

test('source links reject executable or untrusted URLs and labels render as text', () => {
  const q = {...load('Engineering-2023-S2.json').questions[0], sourcePaper:'javascript:alert(1)', sourcePack:'https://example.com', sourceMarking:'javascript:alert(2)', question:'<script>unsafe</script>',questionContent:[{type:'text',text:'<script>unsafe</script>'}]};
  const {dom,d} = fixture(q);
  assert.equal(d.querySelectorAll('a[href]').length,0);
  assert.equal(d.querySelectorAll('script').length,0);
  assert.equal(d.querySelector('.quiz-stem').textContent,q.question);
  dom.window.close();
});

test('diagrams appear with the task without self-marking review controls', () => {
  const q = load('Engineering-2024-S2.json').questions.find(q => q.id === 'eng2024-q21d');
  const {dom,d} = fixture(q);
  assert.equal(d.querySelectorAll('.quiz-stem .quiz-diagram img').length,1);
  assert.equal(d.querySelectorAll('.quiz-exam-layout:not(#quizSelfReview .quiz-exam-layout)').length,0);
  assert.doesNotMatch(d.querySelector('.quiz-stem').textContent,/Original question and diagrams/);
  assert.equal(d.querySelector('#quizSelfReview'),null);
  assert.match(d.querySelector('.quiz-stem').textContent,/strap brace tensioner/);
  dom.window.close();
});

test('official exam links stay behind the accessible information button', () => {
  const q = load('Engineering-2024-S2.json').questions[0];
  const {dom,d,w} = fixture(q);
  const info = d.querySelector('button[aria-label="Exam information"]');
  const panel = d.getElementById(info.getAttribute('aria-controls'));
  assert.equal(panel.hidden,true); assert.equal(info.getAttribute('aria-expanded'),'false');
  assert.ok(info.nextElementSibling.classList.contains('quiz-flag-btn'));
  assert.equal(panel.querySelectorAll('a[href]').length,3);
  assert.equal(d.querySelectorAll('a[href]').length,3);
  info.click(); assert.equal(panel.hidden,false); assert.equal(info.getAttribute('aria-expanded'),'true');
  panel.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(panel.hidden,true); assert.equal(d.activeElement,info);
  dom.window.close();
});

test('2024 bicycle chain question displays introduction, cropped diagram, then the question', () => {
  const q = {...load('Engineering-2024-S1.json').questions[2],marks:1};
  const {dom,d} = fixture(q);
  const blocks = [...d.querySelector('.quiz-stem').children];
  assert.deepEqual(blocks.map(el=>el.tagName),['DIV','FIGURE','DIV']);
  assert.equal(blocks[0].textContent,'A simplified image of a bicycle chain drive is shown.');
  assert.match(blocks[1].querySelector('img').src,/diagram-3-1\.png$/);
  assert.equal(blocks[2].textContent,'If a cyclist is pedalling at 70 revolutions per minute (RPM), what is the RPM of the driven wheel?');
  assert.equal(d.querySelector('.quiz-stem details'),null);
  dom.window.close();
});

test('expanded 2025 paper restores unchanged answers by ID without moving old answers onto new drawing tasks', async () => {
  const data = load('EngineeringS-S2.json'), file = 'EngineeringS-S2.json';
  const saved = data.legacyQuestionIds.map(id => ({earned:2,total:2,studentAnswer:id}));
  const dom = new JSDOM('<div id="quizCanvas"></div>',{runScripts:'outside-only'}), w = dom.window;
  w.progress = {file,index:22,atSummary:true,perQuestionByFile:{[file]:saved}};
  w.fetch = async () => ({ok:true,json:async () => data});
  const loader = html.slice(html.indexOf('async function loadQuizByFile('),html.indexOf('function escapeHtml('));
  const clone = html.slice(html.indexOf('function cloneSavedAnswers('),html.indexOf('function paperHasProgress('));
  w.eval(`let quizState=null; const STORAGE_FOLDER='storage',quizManifest=[{file:'${file}'}];
    function marksForQuestion(q){return q.marks || 1;}
    function getPaperProgress(){return window.progress;}
    function setQuizHash(){} function updateQuizBreadcrumb(){}
    function renderQuestion(){} function renderSidebar(){} function renderSummary(){}
    function escapeHtml(s){return s;}
    ${clone}\n${loader}\nwindow.loadTest=loadQuizByFile;window.result=()=>quizState;`);
  await w.loadTest(file,'Engineering',{resume:true});
  const state=w.result();
  assert.equal(state.questions.length,25);
  assert.equal(state.perQuestion[0].studentAnswer,'q21a');
  assert.equal(state.perQuestion[data.questions.findIndex(q=>q.id==='q24d')],null);
  assert.equal(state.perQuestion[data.questions.findIndex(q=>q.id==='q27c')],null);
  assert.equal(state.perQuestion[data.questions.findIndex(q=>q.id==='q22ci')],null);
  assert.equal(state.atSummary,false);
  assert.equal(state.index,1);
  dom.window.close();
});


test('saved self-assigned marks are discarded on ordinary resume while Jev marks are retained', async () => {
  const data=load('Engineering-2024-S2.json'),file='Engineering-2024-S2.json';
  const dom=new JSDOM('<div id="quizCanvas"></div>',{runScripts:'outside-only'}),w=dom.window;
  const answers=data.questions.map(q=>({earned:q.marks,total:q.marks,provider:'jev'}));
  answers[0]={earned:2,total:2,selfAssessed:true,studentAnswer:'innovations in engineering materials'};
  w.progress={file,index:25,atSummary:true,perQuestionByFile:{[file]:answers}};
  w.fetch=async()=>({ok:true,json:async()=>data});
  const loader=html.slice(html.indexOf('async function loadQuizByFile('),html.indexOf('function escapeHtml('));
  const clone=html.slice(html.indexOf('function cloneSavedAnswers('),html.indexOf('function paperHasProgress('));
  w.eval(`let quizState=null;const STORAGE_FOLDER='storage',quizManifest=[{file:'${file}'}];
    function marksForQuestion(q){return q.marks;} function getPaperProgress(){return window.progress;}
    function setQuizHash(){} function updateQuizBreadcrumb(){} function renderQuestion(){}
    function renderSidebar(){} function renderSummary(){} function escapeHtml(s){return s;}
    ${clone}\n${loader}\nwindow.loadTest=loadQuizByFile;window.result=()=>quizState;`);
  await w.loadTest(file,'Engineering',{resume:true});
  const state=w.result();assert.equal(state.perQuestion[0],null);
  assert.equal(state.perQuestion[1].provider,'jev');assert.equal(state.atSummary,false);assert.equal(state.index,0);
  dom.window.close();
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync('quiz-tool/quiz-tool.html','utf8');
const load=f=>JSON.parse(fs.readFileSync('quiz-tool/storage/'+f,'utf8'));
function fixture(q,prior=null,kind='choice') {
  const dom=new JSDOM('<div id="quizCanvas"></div>',{url:'https://studybase.example/quiz-tool/quiz-tool.html',runScripts:'outside-only'}),w=dom.window;
  w.eval(fs.readFileSync('quiz-tool/quiz-content.js','utf8'));
  w.eval(fs.readFileSync('quiz-tool/quiz-marking.js','utf8'));
  w.__sbAuth={currentUser:{getIdToken:async()=> 'test-token'}};
  w.state={questions:[q],index:0,perQuestion:[prior],quizName:'Engineering'};w.saved=0;
  const heading=html.slice(html.indexOf('function renderHeadingAndStem'),html.indexOf('/* ── Shared: optional question image'));
  const renderer=kind==='choice' ? html.slice(html.indexOf('function renderChoiceQuestion'),html.indexOf('/* ── Dictionary number textbox')) : html.slice(html.indexOf('function setAICheckBusy'),html.indexOf('/* ── Shared ── */',html.indexOf('function setAICheckBusy')));
  w.eval(`let quizState=window.state;const STORAGE_FOLDER='storage';
    function escapeHtml(s){return s;}
    function paintQuiz(s){document.getElementById('quizCanvas').innerHTML=s;}
    function renderQuestionImage(){} function renderSidebar(){}
    function persistCurrentQuiz(){window.saved++;}
    function revealAdvanceButton(){document.getElementById('quizNextBtn').style.display='';}
    function showFeedback(){}
    ${heading}\n${renderer}
    window.renderTest=${kind==='choice'?'renderChoiceQuestion':'renderAICheckQuestion'};
  `);
  w.renderTest(q,0,1,prior);return {dom,w,d:w.document};
}

test('2024 Q4 is a selectable native table and selection, marking and restored progress use the original answer key',()=>{
  const q=load('Engineering-2024-S1.json').questions[3];
  const {dom,w,d}=fixture(q);
  assert.deepEqual([...d.querySelectorAll('.quiz-answer-table thead th')].map(th=>th.textContent),['Answer','Analogue','Digital']);
  const rows=d.querySelectorAll('.quiz-answer-table tbody tr');assert.equal(rows.length,4);
  assert.match(rows[1].cells[1].textContent,/Continuous.*signal[\s\S]*More susceptible/);
  rows[1].cells[2].click();assert.equal(rows[1].querySelector('input').checked,true);assert.equal(rows[1].classList.contains('selected'),true);
  w.submitAnswer();assert.equal(w.state.perQuestion[0].earned,1);assert.equal(w.saved,1);assert.equal(rows[1].classList.contains('correct'),true);
  assert.ok([...d.querySelectorAll('.quiz-answer input')].every(input=>input.disabled));
  const restored=fixture(q,w.state.perQuestion[0]);assert.equal(restored.d.querySelectorAll('.quiz-answer input')[1].checked,true);assert.equal(restored.d.querySelectorAll('.quiz-answer input')[1].disabled,true);
  dom.window.close();restored.dom.window.close();
});

test('native written table entries are marked by Jev and restore with the submitted response',async()=>{
  const q=load('Engineering-2024-S2.json').questions.find(q=>q.id==='eng2024-q21d');
  const {dom,w,d}=fixture(q,null,'self');
  assert.equal(q.showWrittenAnswer,false);assert.equal(d.querySelector('#quizAIAnswerInput'),null);
  const inputs=d.querySelectorAll('[data-table-cell]');assert.equal(inputs.length,10);
  inputs[0].value='Metric';inputs[1].value='2–3 mm';
  w.fetch=async(url,options)=>{
    const body=JSON.parse(options.body);
    assert.match(body.studentAnswer,/Metric/);assert.match(body.studentAnswer,/2–3 mm/);
    assert.match(body.markingGuidance,/NESA/);assert.match(body.question,/Strap brace tensioner/);
    return {ok:true,headers:new Headers({'content-type':'application/json'}),json:async()=>({earned:3,total:q.marks,provider:'jev',confidence:0.9})};
  };
  await w.submitAICheck();
  assert.equal(w.saved,1);assert.equal(Object.values(w.state.perQuestion[0].tableResponses)[0],'Metric');assert.equal(inputs[0].disabled,true);
  const restored=fixture(q,w.state.perQuestion[0],'self');assert.equal(restored.d.querySelector('[data-table-cell]').value,'Metric');assert.equal(restored.d.querySelector('[data-table-cell]').disabled,true);
  assert.equal(restored.d.querySelector('#quizAIAnswerInput'),null);
  dom.window.close();restored.dom.window.close();
});

test('table cells stay plain text; spans, headers and embedded diagrams preserve table structure',()=>{
  const dom=new JSDOM('',{url:'https://studybase.example/quiz-tool/quiz-tool.html',runScripts:'outside-only'}),w=dom.window;
  w.eval(fs.readFileSync('quiz-tool/quiz-content.js','utf8'));
  const wrap=w.StudyQuizContent.renderTable({caption:'Test',columns:['Type','Value'],rows:[[{header:true,text:'<img src=x onerror=alert(1)>'},{text:'<script>unsafe</script>',colSpan:2,input:true}],[{image:{path:'../bad.svg'}},{image:{path:'engineering/2025/table-25c-circuit1.png',alt:'Circuit'}}]]});
  w.document.body.append(wrap);assert.equal(wrap.querySelector('script'),null);assert.equal(wrap.querySelectorAll('img').length,1);assert.equal(wrap.querySelector('tbody th').scope,'row');assert.equal(wrap.querySelector('tbody td').colSpan,2);assert.ok(wrap.querySelector('textarea').getAttribute('aria-label'));
  const q=load('EngineeringS-S2.json').questions.find(q=>q.id==='q25c');const table=q.questionContent.find(b=>b.type==='table');
  const native=w.StudyQuizContent.renderTable(table);assert.equal(native.querySelectorAll('img').length,4);assert.equal(native.querySelectorAll('td[colspan="3"]').length,2);
  dom.window.close();
});

test('converted paper tables reference real assets and answer-table rows match their choices',()=>{
  const files=['EngineeringS-S1.json','EngineeringS-S2.json','Engineering-2024-S1.json','Engineering-2024-S2.json','Engineering-2023-S1.json','Engineering-2023-S2.json'];let count=0;
  for(const file of files)for(const q of load(file).questions){
    if(q.answerTable){count++;assert.equal(q.answerTable.rows.length,q.answers.length);assert.ok(q.answerTable.rows.every(row=>row.length===q.answerTable.columns.length));}
    for(const block of q.questionContent.filter(b=>b.type==='table')){
      count++;for(const cell of block.rows.flat())if(cell&&typeof cell==='object'){
        if(cell.image)assert.ok(fs.existsSync('quiz-tool/storage/'+cell.image.path));
        if(cell.input)assert.equal(q.isAICheck,true,'Response cells must use Jev marking');
      }
    }
  }
  assert.equal(count,18);
});

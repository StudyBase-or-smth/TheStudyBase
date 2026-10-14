const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require('jsdom');
const math = require('mathjs');
const graph = require('../subject/graph-editor.js');

test('parses supported math syntax and rejects unsafe or unsupported nodes',()=>{
  const scope=new Map([['x',2],['sin',Math.sin],['a',3]]);
  for(const [text,kind,value] of [['2x+1','function',5],['3sin(x)','function',3*Math.sin(2)],['y=a*x^2','function',12],['f(x)=sin(x)','function',Math.sin(2)],['x=4','vertical',4],['a=1','slider',1],['(2,3)','point',2]]){
    const p=graph.parse(text,math);assert.equal(p.kind,kind);assert.equal(p.compiled[0].evaluate(scope),value);
  }
  for(const text of ['y > x^2','import("bad")','x.constructor','[1,2]','a=1;2','factorial(100000)','2!','"hello"']) assert.throws(()=>graph.parse(text,math));
});

test('migrates Desmos LaTeX, flags and viewport without losing original data',()=>{
  const old={expressions:{list:[{id:'a',type:'expression',latex:'y=\\frac{1}{2}x^{2}+\\sin(x)',color:'#abcdef',hidden:true},{id:'b',type:'expression',latex:'\\sqrt{\\frac{1}{2}}'}]},graph:{viewport:{xmin:-3,xmax:7,ymin:-4,ymax:8}},extra:{keep:true}};
  const next=graph.migrate(old);
  assert.equal(next.v,1);assert.deepEqual(next.legacyDesmos,old);assert.deepEqual(next.viewport,old.graph.viewport);
  assert.equal(next.expressions[0].hidden,true);assert.equal(next.expressions[0].color,'#abcdef');
  graph.parse(next.expressions[0].text,math);graph.parse(next.expressions[1].text,math);
  assert.deepEqual(graph.migrate(next),next);
});

test('accepts familiar typed and pasted mathematical notation',()=>{
  const scope=new Map([['x',2],['pi',Math.PI],['abs',Math.abs],['sqrt',Math.sqrt]]);
  for(const [text,value] of [['𝑦 = 𝑥²',4],['y = x²',4],['x³ − 2×x',4],['π·x ÷ 2',Math.PI],['|x − 5|',3],['√(x + 2)',2],['y = \\frac{1}{2}x^{2}',2]]){
    assert.equal(graph.parse(text,math).compiled[0].evaluate(scope),value);
  }
});

test('example buttons reuse empty rows and add editable expressions',async()=>{
  const {dom,w,objects,container}=fixture();
  const editor=await w.StudyGraph.create(container);
  assert.equal(container.querySelector('.graph-input-help').hidden,true);
  const info=container.querySelector('.graph-info');info.click();
  assert.equal(container.querySelector('.graph-input-help').hidden,false);
  assert.equal(info.getAttribute('aria-expanded'),'true');
  container.querySelector('.graph-examples button').click();
  assert.equal(editor.getState().expressions.length,1);
  assert.equal(objects[0].args[0](3),9);
  container.querySelectorAll('.graph-examples button')[3].click();
  assert.equal(editor.getState().expressions.length,2);
  assert.equal(objects.find(o=>o.kind==='point').attrs.fillOpacity,1);
  assert.equal(objects.find(o=>o.kind==='functiongraph').attrs.fillColor,'none');
  editor.destroy();dom.window.close();
});

test('symbol buttons edit the focused row and wrap selections in roots',async()=>{
  const {dom,w,container}=fixture();
  const editor=await w.StudyGraph.create(container,{state:{v:1,expressions:[{text:'x'},{text:'y = 9'}]}});
  const input=container.querySelectorAll('input[type=text]')[1];input.focus();const digit=input.value.indexOf('9');input.setSelectionRange(digit,digit+1);
  container.querySelectorAll('.graph-symbols button')[3].click();
  assert.equal(input.value,'𝑦 = √(9)');assert.equal(editor.getState().expressions[1].text,input.value);
  assert.equal(input.selectionStart,digit+2);assert.equal(input.selectionEnd,digit+3);
  input.setSelectionRange(input.value.length,input.value.length);
  for(const b of [...container.querySelectorAll('.graph-symbols button')].slice(0,3)) b.click();
  assert.equal(input.value,'𝑦 = √(9)×÷²');
  input.dispatchEvent(new w.InputEvent('beforeinput',{inputType:'insertText',data:'3',cancelable:true}));
  assert.equal(input.value,'𝑦 = √(9)×÷³');
  input.dispatchEvent(new w.InputEvent('beforeinput',{inputType:'insertText',data:'2',cancelable:true}));
  assert.equal(input.value,'𝑦 = √(9)×÷³²');
  editor.destroy();dom.window.close();
});

function fixture(){
  const dom=new JSDOM('<body><div id="graph"></div></body>',{runScripts:'outside-only'}), w=dom.window;
  const objects=[], board={objects:{},create(kind,args,attrs){const o={kind,args,attrs};objects.push(o);return o;},removeObject(o){objects.splice(objects.indexOf(o),1);},update(){},fullUpdate(){},resizeContainer(){},on(){},getBoundingBox(){return [-3,8,7,-4];},setBoundingBox(){}};
  w.math=math;w.JXG={JSXGraph:{initBoard(){return board;},freeBoard(){}}};w.ResizeObserver=class{observe(){}disconnect(){}};
  w.eval(fs.readFileSync(require.resolve('../subject/graph-editor.js'),'utf8'));
  return {dom,w,objects,container:w.document.getElementById('graph')};
}

test('computer notation toggles display and symbol insertion without changing graphs',async()=>{
  const {dom,w,container,objects}=fixture();
  const editor=await w.StudyGraph.create(container,{state:{v:1,expressions:[{text:'y = 2×x²'}]}});
  const toggle=container.querySelector('.graph-notation');
  assert.equal(toggle.nextElementSibling.className,'graph-info');
  toggle.click();
  let input=container.querySelector('input[type=text]');
  assert.equal(input.value,'y = 2*x^2');assert.equal(objects[0].args[0](3),18);
  const highlight=container.querySelector('.graph-expression-highlight');
  assert.equal(highlight.textContent,input.value);
  assert.deepEqual([...highlight.querySelectorAll('.graph-variable')].map(e=>e.textContent),['y','x']);
  input.value='y = x*z + q/u - i^2 + sin(x)';input.dispatchEvent(new w.Event('input'));
  assert.deepEqual([...highlight.querySelectorAll('.graph-variable')].map(e=>e.textContent),['y','x','z','q','u','i','x']);
  input.value='y = 2*x^2';input.dispatchEvent(new w.Event('input'));
  input.focus();input.setSelectionRange(input.value.length,input.value.length);
  container.querySelector('[aria-label="Insert power"]').click();assert.equal(input.value,'y = 2*x^2^');
  input.value='y = 2*x^2';input.dispatchEvent(new w.Event('input'));
  assert.equal(editor.getState().notation,'computer');
  toggle.click();input=container.querySelector('input[type=text]');
  assert.equal(input.value,'𝑦 = 2×𝑥²');assert.equal(objects[0].args[0](3),18);
  editor.destroy();dom.window.close();
});
test('slider forward references, row isolation, live edits, visibility and saved state',async()=>{
  const {dom,w,objects,container}=fixture();
  let changes=0;
  const editor=await w.StudyGraph.create(container,{state:{v:1,expressions:[{id:'f',text:'y=a*x^2'},{id:'a',text:'a=2'},{id:'err',text:'import(1)'},{id:'p',text:'(2,3)'}]},onChange(){changes++;}});
  assert.equal(objects.length,2);assert.equal(objects.find(o=>o.kind==='functiongraph').args[0](3),18);
  assert.match(container.querySelectorAll('.graph-error')[2].textContent,/Unsupported/);
  const slider=container.querySelectorAll('input[type=range]')[1];
  const visibility=[];const observer=new w.MutationObserver(records=>visibility.push(...records));observer.observe(slider,{attributes:true,attributeFilter:['hidden'],attributeOldValue:true});
  slider.value='4';slider.dispatchEvent(new w.Event('input'));
  assert.ok(observer.takeRecords().every(record=>record.oldValue===null));observer.disconnect();
  assert.equal(objects.find(o=>o.kind==='functiongraph').args[0](3),36);
  container.querySelector('.graph-dot').click();assert.equal(objects.length,1);assert.equal(editor.getState().expressions[0].hidden,true);
  const input=container.querySelector('input[type=text]');input.value='y=2x+1';input.dispatchEvent(new w.Event('input'));container.querySelector('.graph-dot').click();
  await new Promise(resolve=>setTimeout(resolve,230));assert.equal(objects.find(o=>o.kind==='functiongraph').args[0](3),7);
  input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter'}));assert.equal(editor.getState().expressions.length,5);
  assert.deepEqual({...editor.getState().viewport},{xmin:-3,xmax:7,ymin:-4,ymax:8});assert.ok(changes>0);
  editor.destroy();dom.window.close();
});
test('view keeps formulas read-only and help available; stale mount never changes DOM',async()=>{
  const {dom,w,container}=fixture();
  assert.equal(await w.StudyGraph.create(container,{isCurrent:()=>false}),null);
  const editor=await w.StudyGraph.create(container,{readOnly:true,state:{v:1,expressions:[{id:'a',text:'a=1'}]}});
  assert.equal(container.querySelector('input[type=text]').readOnly,true);assert.equal(container.querySelector('input[type=range]').disabled,false);
  assert.equal(container.querySelectorAll('.graph-row-line button').length,1);
  const info=container.querySelector('.graph-info');assert.ok(info);info.click();
  assert.equal(container.querySelector('.graph-input-help').hidden,false);
  container.querySelector('.graph-notation').click();
  assert.equal(container.querySelector('.graph-input-help').hidden,false);
  assert.equal(info.getAttribute('aria-expanded'),'true');
  assert.ok([...container.querySelectorAll('.graph-examples button')].every(b=>b.disabled));
  editor.destroy();dom.window.close();
});

test('viewer parameter changes update dependent graphs without saving and reset on reopen',async()=>{
  const {dom,w,container,objects}=fixture();
  const state={v:1,expressions:[{id:'curve',text:'y=b*x^2'},{id:'b',text:'b=a*2'},{id:'a',text:'a=1'}]};
  const original=JSON.stringify(state);let changes=0;
  const editor=await w.StudyGraph.create(container,{state,readOnly:true,onChange(){changes++;}});
  assert.equal(objects[0].args[0](3),18);
  const value=container.querySelectorAll('.graph-parameter-value')[2];assert.equal(value.hidden,false);
  value.value='3';value.dispatchEvent(new w.Event('input'));
  assert.equal(objects[0].args[0](3),54);
  value.value='';value.dispatchEvent(new w.Event('input'));assert.equal(objects[0].args[0](3),54);
  assert.match(container.querySelectorAll('.graph-error')[2].textContent,/finite number/);
  const slider=container.querySelectorAll('input[type=range]')[2];slider.value='4';slider.dispatchEvent(new w.Event('input'));
  assert.equal(objects[0].args[0](3),72);
  const toggle=container.querySelector('.graph-notation');assert.equal(toggle.textContent,'*');toggle.click();assert.equal(toggle.textContent,'𝑥');assert.equal(objects[0].args[0](3),72);
  assert.equal(container.querySelectorAll('.graph-parameter-value')[2].value,'4');
  assert.equal(editor.getState().expressions[2].text,'a=1');
  assert.equal(JSON.stringify(state),original);assert.equal(changes,0);
  editor.destroy();
  const reopened=await w.StudyGraph.create(container,{state,readOnly:true});assert.equal(objects.at(-1).args[0](3),18);
  reopened.destroy();dom.window.close();
});

test('viewer can fill parameters used in formulas without assignment rows',async()=>{
  const {dom,w,container,objects}=fixture();const state={v:1,expressions:[{text:'y=a*x+b'}]};let changes=0;
  const editor=await w.StudyGraph.create(container,{state,readOnly:true,onChange(){changes++;}});
  const inputs=[container.querySelector('[data-variable="a"]'),container.querySelector('[data-variable="b"]')];assert.ok(inputs.every(Boolean));
  assert.equal(objects.at(-1).args[0](3),4);
  inputs[0].value='2';inputs[0].dispatchEvent(new w.Event('input'));inputs[1].value='5';inputs[1].dispatchEvent(new w.Event('input'));
  assert.equal(objects.find(o=>o.kind==='functiongraph').args[0](3),11);assert.equal(changes,0);assert.equal(editor.getState().expressions.length,1);assert.equal(state.expressions[0].text,'y=a*x+b');
  container.querySelector('.graph-notation').click();assert.equal(objects.find(o=>o.kind==='functiongraph').args[0](3),11);
  editor.destroy();const reopened=await w.StudyGraph.create(container,{state,readOnly:true});assert.equal(objects.at(-1).args[0](3),4);reopened.destroy();dom.window.close();
});

test('angle mode changes trig evaluation and persists on reopen',async()=>{
  const {dom,w,container,objects}=fixture();
  const editor=await w.StudyGraph.create(container,{state:{v:1,expressions:[{text:'y=sin(x)+ln(e)+log(100)+sqrt(abs(-4))'}]}});
  assert.ok(Math.abs(objects[0].args[0](90)-(Math.sin(90)+5))<1e-10);
  container.querySelectorAll('.graph-toolbar button')[1].click();
  assert.ok(Math.abs(objects[0].args[0](90)-6)<1e-10);
  const state=editor.getState();assert.equal(state.angleMode,'degrees');editor.destroy();
  const reopened=await w.StudyGraph.create(container,{state});
  assert.ok(Math.abs(objects[0].args[0](90)-6)<1e-10);
  reopened.destroy();dom.window.close();
});

test('formula child inputs solve both directions and mark the corresponding point without saving',async()=>{
  const {dom,w,container,objects}=fixture();const state={v:1,expressions:[{id:'line',text:'x+2=y'}]};let changes=0;
  const editor=await w.StudyGraph.create(container,{state,readOnly:true,onChange(){changes++;}});
  const x=container.querySelector('[data-variable="x"]'),y=container.querySelector('[data-variable="y"]');
  x.value='1';x.dispatchEvent(new w.Event('input'));assert.equal(Number(y.value),3);
  assert.deepEqual(Array.from(objects.find(o=>o.kind==='point').args),[1,3]);
  y.value='4';y.dispatchEvent(new w.Event('input'));assert.ok(Math.abs(Number(x.value)-2)<1e-8);
  const point=objects.find(o=>o.kind==='point');assert.ok(Math.abs(point.args[0]-2)<1e-8);assert.equal(point.args[1],4);
  const formula=container.querySelector('.graph-formula');assert.equal(formula.open,true);formula.open=false;formula.dispatchEvent(new w.Event('toggle'));
  container.querySelector('.graph-notation').click();assert.equal(container.querySelector('.graph-formula').open,false);
  assert.ok(Math.abs(Number(container.querySelector('[data-variable="x"]').value)-2)<1e-8);
  assert.equal(editor.getState().expressions[0].text,'x+2=y');assert.equal(changes,0);assert.equal(state.expressions[0].text,'x+2=y');
  editor.destroy();const reopened=await w.StudyGraph.create(container,{state,readOnly:true});assert.equal(container.querySelector('[data-variable="x"]').value,'0');assert.equal(objects.filter(o=>o.kind==='functiongraph').at(-1).args[0](1),3);reopened.destroy();dom.window.close();
});

test('arbitrary variable names have linked child values',async()=>{
  for(const text of ['q+2=u','u=q+2']){
  const {dom,w,container,objects}=fixture();const editor=await w.StudyGraph.create(container,{state:{v:1,expressions:[{text}]},readOnly:true});
  const q=container.querySelector('[data-variable="q"]'),u=container.querySelector('[data-variable="u"]');assert.ok(q&&u);
  q.value='1';q.dispatchEvent(new w.Event('input'));assert.equal(u.value,'3');
  u.value='4';u.dispatchEvent(new w.Event('input'));assert.ok(Math.abs(Number(q.value)-2)<1e-8);assert.equal(objects.find(o=>o.kind==='point').args[1],4);
  editor.destroy();dom.window.close();
  }
});

test('curve inverse follows the current branch and reports impossible real values',async()=>{
  const {dom,w,container,objects}=fixture();const editor=await w.StudyGraph.create(container,{state:{v:1,expressions:[{text:'y=x^2'}]},readOnly:true});
  const x=container.querySelector('[data-variable="x"]'),y=container.querySelector('[data-variable="y"]');
  x.value='-1';x.dispatchEvent(new w.Event('input'));y.value='4';y.dispatchEvent(new w.Event('input'));assert.ok(Math.abs(Number(x.value)+2)<1e-8);
  y.value='-1';y.dispatchEvent(new w.Event('input'));assert.match(container.querySelector('.graph-error').textContent,/No real solution/);
  assert.equal(objects.find(o=>o.kind==='point').args[1],4);
  editor.destroy();dom.window.close();
});

test('only actual formula variables appear and clicking the formula toggles its child values',async()=>{
  const {dom,w,container,objects}=fixture();const editor=await w.StudyGraph.create(container,{state:{v:1,expressions:[{text:'y=2*a+1'}]},readOnly:true});
  assert.deepEqual([...container.querySelectorAll('[data-variable]')].map(input=>input.dataset.variable).sort(),['a','y']);
  const a=container.querySelector('[data-variable="a"]'),y=container.querySelector('[data-variable="y"]');assert.equal(a.value,'1');assert.equal(y.value,'3');
  y.value='5';y.dispatchEvent(new w.Event('input'));assert.ok(Math.abs(Number(a.value)-2)<1e-8);assert.equal(objects.find(o=>o.kind==='point').args[1],5);
  const formula=container.querySelector('.graph-formula'),input=formula.querySelector('input[type=text]');
  input.click();assert.equal(formula.open,false);input.click();assert.equal(formula.open,true);
  editor.destroy();dom.window.close();
});

test('pinned browser libraries initialize a real JSXGraph SVG board',async()=>{
  const dom=new JSDOM('<div id="g" style="width:900px;height:460px"></div>',{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
  w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
  w.CSS={escape:s=>String(s).replace(/[^a-zA-Z0-9_-]/g,'_')};
  w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
  const path=require('node:path');
  for(const p of ['jsxgraph/distrib/jsxgraphcore.js','mathjs/lib/browser/math.js']) w.eval(fs.readFileSync(path.resolve(__dirname,'../node_modules',p),'utf8'));
  w.eval(fs.readFileSync(require.resolve('../subject/graph-editor.js'),'utf8'));
  try{
    const editor=await w.eval(`StudyGraph.create(document.getElementById('g'),{state:{v:1,expressions:[{text:'y=a*x^2'},{text:'a=1'},{text:'(2,3)'},{text:'x=4'},{text:'f(x)=sin(x)'}]}})`);
    assert.equal(w.document.querySelectorAll('svg').length,1);
    const curves=[...w.document.querySelectorAll('svg path')].filter(p=>['#c74440','#d88418'].includes(p.getAttribute('stroke')));
    assert.ok(curves.length>=2);
    assert.ok(curves.every(p=>p.getAttribute('fill-opacity')==='0'));
    assert.ok([...w.document.querySelectorAll('.graph-error')].every(e=>!e.textContent));
    assert.ok(Object.values(editor.getState().viewport).every(Number.isFinite));
    editor.destroy();
  }finally{w.close();}
});

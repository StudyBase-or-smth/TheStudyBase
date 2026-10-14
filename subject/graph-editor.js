/* JSXGraph 1.11.1 (MIT), math.js 15.2.0 (Apache-2.0). See vendor/GRAPH-LICENSES.txt. */
(function(root){
  'use strict';
  const colors = ['#c74440','#2d70b3','#388c46','#9b51b6','#d88418'];
  const defaults = {xmin:-10,xmax:10,ymin:-10,ymax:10};
  let sequence = 0, loading;
  function mathText(text){
    return String(text).replace(/[\u{1D434}-\u{1D467}\u210E]/gu,c=>c.normalize('NFKC'));
  }
  function computerText(text){
    return latexToText(mathText(text)).replace(/[−–]/g,'-').replace(/[×·]/g,'*').replace(/÷/g,'/').replace(/π/g,'pi').replace(/√\s*\(/g,'sqrt(').replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g,power=>'^'+Array.from(power,c=>'⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c)).join(''));
  }
  function displayMath(text){
    return mathText(text).replace(/\b(sqrt|abs|sin|cos|tan|ln|log|pi)\b|[A-Za-z]/g,c=>{
      if(c.length>1) return c==='pi'?'π':c;
      if(c==='h') return 'ℎ';
      return String.fromCodePoint((c>='a'?0x1D44E:0x1D434)+c.charCodeAt(0)-(c>='a'?97:65));
    }).replace(/\^(\d+)/g,(_,digits)=>Array.from(digits,c=>'⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(c)]).join(''));
  }
  function viewport(v){
    return v && ['xmin','xmax','ymin','ymax'].every(k=>Number.isFinite(v[k])) && v.xmin<v.xmax && v.ymin<v.ymax ? {...v} : {...defaults};
  }
  function latexToText(input){
    let s = String(input || '').replace(/\\left|\\right/g,'').replace(/\\(?:cdot|times)/g,'*').replace(/\\pi/g,'pi').replace(/\\operatorname\{([^{}]+)\}/g,'$1').replace(/\\(sin|cos|tan|ln|log|abs)/g,'$1');
    for(let i=0;i<12;i++){
      const next = s.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g,'(($1)/($2))').replace(/\\sqrt\{([^{}]*)\}/g,'sqrt($1)').replace(/\{([^{}]*)\}/g,'($1)');
      if(next===s) break; s=next;
    }
    return s.replace(/\|([^|]+)\|/g,'abs($1)');
  }
  function migrate(state){
    if(state && state.v===1 && Array.isArray(state.expressions)) return {...state, expressions:state.expressions.map((e,i)=>({...e,id:String(e.id || 'row'+i),text:String(e.text ?? latexToText(e.latex)),color:/^#[0-9a-f]{6}$/i.test(e.color)?e.color:colors[i%colors.length],hidden:!!e.hidden})),viewport:viewport(state.viewport)};
    const list = state?.expressions?.list || [];
    return {v:1,expressions:list.filter(e=>e.type==='expression' || e.latex).map((e,i)=>({id:String(e.id||'row'+i),text:latexToText(e.latex),color:/^#[0-9a-f]{6}$/i.test(e.color)?e.color:colors[i%colors.length],hidden:!!e.hidden})),viewport:viewport(state?.graph?.viewport),...(state?{legacyDesmos:JSON.parse(JSON.stringify(state))}:{})};
  }
  function parse(text, math){
    let s=computerText(text).trim();
    if(!s) return {kind:'empty'};
    if(s.length>500) throw Error('Expression is too long.');
    if(/[<>≤≥]/.test(s)) throw Error('Inequalities are not supported yet.');
    const reversed=s.match(/^(.+)=\s*([a-zA-Z][a-zA-Z0-9]*)\s*$/);
    let outputVariable='y',inputVariable='x';
    if(reversed && !/^\s*[a-zA-Z][a-zA-Z0-9]*\s*$/.test(reversed[1])){outputVariable=reversed[2];s='y = '+reversed[1];}
    let kind='function',name,parts;
    const point=s.match(/^\((.*),(.*)\)$/), assignment=s.match(/^([a-zA-Z][a-zA-Z0-9]*|[a-zA-Z][a-zA-Z0-9]*\(x\))\s*=\s*(.+)$/);
    if(point){kind='point';parts=point.slice(1);}
    else if(assignment){name=assignment[1];kind=name==='x'?'vertical':name==='y'||name.endsWith('(x)')?'function':'slider';parts=[assignment[2]];}
    else parts=[s];
    const nodes=parts.map(p=>math.parse(p));
    if(kind==='function'){
      const variables=[];nodes.forEach(n=>n.traverse(node=>{if(node.isSymbolNode&&!['pi','e','sin','cos','tan','ln','log','sqrt','abs'].includes(node.name))variables.push(node.name);}));inputVariable=variables.includes('x')?'x':variables[0]||'x';
    }
    nodes.forEach(node=>{let count=0;node.traverse(n=>{
      if(++count>150) throw Error('Expression is too complex.');
      if(!['ConstantNode','SymbolNode','OperatorNode','FunctionNode','ParenthesisNode'].includes(n.type)) throw Error('Unsupported syntax.');
      if(n.isConstantNode && typeof n.value!=='number') throw Error('Only numbers are supported.');
      if(n.isOperatorNode && !['+','-','*','/','^'].includes(n.op)) throw Error('Unsupported operator.');
      if(n.isFunctionNode && (!n.fn.isSymbolNode || !['sqrt','abs','sin','cos','tan','ln','log'].includes(n.fn.name) || n.args.length!==1)) throw Error('Unsupported function.');
      if(n.isSymbolNode && !/^[a-zA-Z][a-zA-Z0-9]*$/.test(n.name)) throw Error('Unsupported symbol.');
    });});
    return {kind,name,nodes,compiled:nodes.map(n=>n.compile()),inputVariable,outputVariable};
  }
  function solveValue(fn, seed, scale=1){
    const tolerance=1e-9*Math.max(1,Math.abs(scale));
    const f=x=>{try{const v=fn(x);return Number.isFinite(v)?v:NaN;}catch{return NaN;}};
    let x=seed;
    for(let i=0;i<32;i++){
      const value=f(x);if(Math.abs(value)<=tolerance)return x;
      const step=1e-5*Math.max(1,Math.abs(x)), derivative=(f(x+step)-f(x-step))/(2*step);
      if(!Number.isFinite(derivative)||Math.abs(derivative)<1e-12)break;
      const next=x-value/derivative;if(!Number.isFinite(next)||Math.abs(next)>1e12)break;x=next;
    }
    for(let radius=1;radius<=1e6;radius*=10){
      const roots=[];let a=seed-radius,fa=f(a);
      for(let i=1;i<=128;i++){
        const b=seed-radius+2*radius*i/128,fb=f(b);
        if(Math.abs(fb)<=tolerance)roots.push(b);
        if(Number.isFinite(fa)&&Number.isFinite(fb)&&fa*fb<0){
          let low=a,high=b,fl=fa;
          for(let j=0;j<60;j++){const middle=(low+high)/2,fm=f(middle);if(!Number.isFinite(fm))break;if(Math.abs(fm)<=tolerance){roots.push(middle);break;}if(fl*fm<0)high=middle;else{low=middle;fl=fm;}}
        }
        a=b;fa=fb;
      }
      if(roots.length)return roots.sort((a,b)=>Math.abs(a-seed)-Math.abs(b-seed))[0];
    }
    throw Error('No real solution found for these values.');
  }
  function load(){
    if(root.JXG && root.math) return Promise.resolve();
    if(!loading) loading=Promise.all([
      ['JXG','https://cdn.jsdelivr.net/npm/jsxgraph@1.11.1/distrib/jsxgraphcore.js'],
      ['math','https://cdn.jsdelivr.net/npm/mathjs@15.2.0/lib/browser/math.js']
    ].map(([key,url])=>new Promise((resolve,reject)=>{if(root[key]) return resolve();const script=document.createElement('script');script.src=url;script.onload=resolve;script.onerror=()=>reject(Error('Graph libraries could not load. Check your connection and reopen the topic.'));document.head.append(script);}))).catch(e=>{loading=null;throw e;});
    return loading;
  }
  async function create(container, options={}){
    await load();
    if(options.isCurrent && !options.isCurrent()) return null;
    const state=migrate(options.state), readonly=!!options.readOnly;
    if(!state.expressions.length && !readonly) state.expressions.push({id:'row'+(++sequence),text:'',color:colors[0],hidden:false});
    let degrees=state.angleMode==='degrees', timer, dead=false, resizing=false, objects=[];
    container.replaceChildren();container.classList.add('graph-editor');
    const list=document.createElement('div'), right=document.createElement('div'), toolbar=document.createElement('div'), boardEl=document.createElement('div');
    list.className='graph-expressions';right.className='graph-right';toolbar.className='graph-toolbar';boardEl.className='graph-board jxgbox';boardEl.id='graph-board-'+(++sequence);
    container.append(list,right);right.append(toolbar,boardEl);
    function button(label, action, parent){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=action;parent.append(b);return b;}
    const v=state.viewport;
    const board=root.JXG.JSXGraph.initBoard(boardEl.id,{boundingbox:[v.xmin,v.ymax,v.xmax,v.ymin],axis:true,grid:true,showCopyright:false,showNavigation:false,pan:{enabled:true,needShift:false},zoom:{enabled:true,wheel:true,needShift:false,pinch:true},keepaspectratio:false});
    const notify=()=>{if(!dead && !readonly) options.onChange?.();};
    button('Reset view',()=>{board.setBoundingBox([-10,10,10,-10],false);notify();},toolbar);
    const angle=button(degrees?'Degrees':'Radians',()=>{degrees=!degrees;angle.textContent=degrees?'Degrees':'Radians';plot();notify();},toolbar);
    const rows=new Map();
    const viewerValues=new Map();
    const freeValues=new Map(), probes=new Map(), collapsed=new Map();
    function parseForGraph(text){
      const p=parse(text,root.math);
      if(p.kind==='slider'&&!scope().has(p.name)){
        const declared=new Set();state.expressions.forEach(e=>{try{const definition=parse(e.text,root.math);if(definition.kind==='slider')declared.add(definition.name);}catch{}});
        const independent=new Set();p.nodes.forEach(n=>n.traverse(node=>{if(node.isSymbolNode&&!scope().has(node.name)&&!declared.has(node.name))independent.add(node.name);}));
        if(independent.size){p.kind='function';p.outputVariable=p.name;p.inputVariable=independent.has('x')?'x':[...independent][0];}
      }
      return p;
    }
    function viewerParameters(){
      const used=new Set(), defined=new Set(), builtins=scope();
      state.expressions.forEach(e=>{try{const p=parseForGraph(e.text);if(p.kind==='slider')defined.add(p.name);p.nodes?.forEach(n=>n.traverse(node=>{if(node.isSymbolNode && !builtins.has(node.name) && !(p.kind==='function'&&node.name===p.inputVariable))used.add(node.name);}));}catch{}});
      used.forEach(name=>{
        if(defined.has(name))return;
        if(!freeValues.has(name))freeValues.set(name,1);
      });
    }
    let helpOpen=false, activeExpression, computerNotation=state.notation==='computer';
    const format=text=>computerNotation?computerText(text):displayMath(text).replace(/\*/g,'×').replace(/\//g,'÷').replace(/sqrt\(/g,'√(');
    const notation=button(computerNotation?'𝑥':'*',()=>{computerNotation=!computerNotation;updateNotationButton();container.classList.toggle('graph-computer-notation',computerNotation);render();plot();notify();},toolbar);
    function updateNotationButton(){notation.textContent=computerNotation?'𝑥':'*';notation.title=computerNotation?'Switch to math notation':'Switch to computer notation';notation.setAttribute('aria-label',notation.title);notation.setAttribute('aria-pressed',String(computerNotation));}
    notation.className='graph-notation';updateNotationButton();container.classList.toggle('graph-computer-notation',computerNotation);
    const helpId=boardEl.id+'-help';
      const info=button('ⓘ',()=>{helpOpen=!helpOpen;list.querySelector('.graph-input-help').hidden=!helpOpen;info.setAttribute('aria-expanded',String(helpOpen));},toolbar);
      info.className='graph-info';info.title='Graph input help';info.setAttribute('aria-label','Graph input help');info.setAttribute('aria-controls',helpId);info.setAttribute('aria-expanded','false');
    function insertSymbol(symbol){
      let e=rows.has(activeExpression)?activeExpression:state.expressions[0];
      if(!e){add();e=state.expressions.at(-1);}
      const input=rows.get(e).input, start=input.selectionStart ?? input.value.length, end=input.selectionEnd ?? start;
      const selected=input.value.slice(start,end), text=symbol==='√'?(computerNotation?'sqrt(':'√(')+selected+')':symbol==='power'?(computerNotation?'^':'²'):computerNotation?(symbol==='×'?'*':symbol==='÷'?'/':symbol):symbol;
      input.setRangeText(text,start,end,'end');
      if(symbol==='√'){const offset=computerNotation?5:2;input.setSelectionRange(start+offset,start+offset+selected.length);}
      if(symbol==='power'&&!computerNotation){input.setSelectionRange(start,start+1);input.dataset.powerInput='true';}
      else delete input.dataset.powerInput;
      e.text=input.value;rows.get(e).updateHighlight();input.focus();clearTimeout(timer);plot();notify();
    }
    function render(){
      list.replaceChildren();rows.clear();
      if(readonly)viewerParameters();
      if(!readonly){
        const symbols=document.createElement('div');symbols.className='graph-symbols';symbols.setAttribute('aria-label','Insert math symbols');
        [['×','Multiply'],['÷','Divide'],['𝑥²','Power'],['√','Square root']].forEach(([symbol,label])=>{
          const b=button(computerNotation?({'×':'*','÷':'/','𝑥²':'^','√':'sqrt'}[symbol]):symbol,()=>insertSymbol(label==='Power'?'power':symbol),symbols);b.title=label;b.setAttribute('aria-label','Insert '+label.toLowerCase());b.onmousedown=event=>event.preventDefault();
        });list.append(symbols);
      }
        const help=document.createElement('div');help.className='graph-input-help';help.id=helpId;help.hidden=!helpOpen;
        const hint=document.createElement('p');hint.textContent=readonly?'Change parameter values below to explore the graph. Your changes are temporary and are not saved.':'Type a formula like y = x² or 2x + 1. Use ^ for powers, * for multiply, and / for divide. Press Enter for a new row.';help.append(hint);
        const examples=document.createElement('div');examples.className='graph-examples';
        [['Curve','y = x^2'],['Line','y = 2x + 1'],['Wave','y = sin(x)'],['Point','(2, 3)'],['Parameter','a = 1']].forEach(([label,text])=>{
          const b=button(label,()=>{
            let e=state.expressions.find(e=>!e.text.trim());
            if(!e){e={id:'row'+Date.now()+'-'+(++sequence),text:'',color:colors[state.expressions.length%colors.length],hidden:false};state.expressions.push(e);}
            e.text=text;render();plot();rows.get(e).input.focus();notify();
          },examples);b.title='Insert '+text;b.setAttribute('aria-label','Insert example: '+text);b.disabled=readonly;
        });help.append(examples);list.append(help);
      state.expressions.forEach(e=>{
        const row=document.createElement(readonly?'details':'div'), line=document.createElement(readonly?'summary':'div'), input=document.createElement('input'), error=document.createElement('div'), slider=document.createElement('input');
        row.className='graph-row'+(readonly?' graph-formula':'');line.className='graph-row-line';error.className='graph-error';error.setAttribute('aria-live','polite');
        if(readonly){row.open=!collapsed.get(e.id);row.ontoggle=()=>{if(row.isConnected)collapsed.set(e.id,!row.open);};}
        const dot=button('●',()=>{e.hidden=!e.hidden;dot.style.opacity=e.hidden?'.3':'1';dot.setAttribute('aria-pressed',String(!e.hidden));plot();notify();},line);
        dot.className='graph-dot';dot.style.color=e.color;dot.style.opacity=e.hidden?'.3':'1';dot.setAttribute('aria-label','Show or hide expression');dot.setAttribute('aria-pressed',String(!e.hidden));
        input.type='text';input.value=format(e.text);input.readOnly=readonly;input.setAttribute('aria-label','Graph expression');input.placeholder=computerNotation?'Type a formula, e.g. y = x^2':'Type a formula, e.g. y = x²';input.spellcheck=false;input.autocomplete='off';
        const field=document.createElement('div'), highlight=document.createElement('div');field.className='graph-expression-field';highlight.className='graph-expression-highlight';highlight.setAttribute('aria-hidden','true');field.append(input,highlight);line.append(field);
        function updateHighlight(){
          highlight.replaceChildren();
          if(!computerNotation) return;
          const tokens=input.value.split(/([A-Za-z][A-Za-z0-9]*)/g);
          tokens.forEach(token=>{
            if(/^[A-Za-z][A-Za-z0-9]*$/.test(token) && !['sin','cos','tan','sqrt','abs','ln','log','pi','e'].includes(token)){
              const variable=document.createElement('span');variable.textContent=token;variable.className='graph-variable';
              variable.style.color=colors[Array.from(token).reduce((sum,c)=>sum+c.charCodeAt(0),0)%colors.length];highlight.append(variable);
            }else highlight.append(document.createTextNode(token));
          });highlight.scrollLeft=input.scrollLeft;
        }
        input.onscroll=()=>{highlight.scrollLeft=input.scrollLeft;};
        if(readonly){input.onclick=event=>{event.preventDefault();row.open=!row.open;collapsed.set(e.id,!row.open);};input.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();row.open=!row.open;collapsed.set(e.id,!row.open);}};}
        updateHighlight();
        if(!readonly) button('×',()=>{state.expressions.splice(state.expressions.indexOf(e),1);render();plot();notify();},line).setAttribute('aria-label','Delete expression');
        input.oninput=()=>{const start=input.selectionStart,end=input.selectionEnd,value=input.value;input.value=format(value);input.setSelectionRange(format(value.slice(0,start)).length,format(value.slice(0,end)).length);e.text=input.value;updateHighlight();clearTimeout(timer);timer=setTimeout(plot,200);notify();};
        input.onbeforeinput=event=>{
          if(computerNotation) return;
          if(input.dataset.powerInput!=='true' && !/[⁰¹²³⁴⁵⁶⁷⁸⁹]$/.test(input.value.slice(0,input.selectionStart))) return;
          if(event.inputType==='insertText' && /^\d+$/.test(event.data || '')){
            event.preventDefault();input.setRangeText(Array.from(event.data,c=>'⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(c)]).join(''),input.selectionStart,input.selectionEnd,'end');input.oninput();
          }else delete input.dataset.powerInput;
        };
        input.onpointerdown=()=>{delete input.dataset.powerInput;};
        input.onfocus=()=>{activeExpression=e;};
        if(!readonly)input.onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End','Escape','Tab'].includes(event.key)) delete input.dataset.powerInput;if(event.key==='Enter'){event.preventDefault();add();}};
        const valueField=document.createElement('input');valueField.type='number';valueField.step='any';valueField.hidden=true;valueField.className='graph-parameter-value';valueField.setAttribute('aria-label','Temporary parameter value');
        valueField.oninput=()=>{
          if(!readonly) return;
          if(!Number.isFinite(valueField.valueAsNumber)){error.textContent='Enter a finite number.';return;}
          viewerValues.set(e.id,valueField.valueAsNumber);plot();
        };
        slider.type='range';slider.min=-10;slider.max=10;slider.step=.1;slider.hidden=true;slider.setAttribute('aria-label',readonly?'Temporary parameter slider':'Parameter value');
        slider.oninput=()=>{if(readonly){viewerValues.set(e.id,Number(slider.value));plot();return;}const p=parse(e.text,root.math);e.text=p.name+' = '+slider.value;input.value=format(e.text);updateHighlight();plot();notify();};
        const child=document.createElement('div');child.className='graph-formula-values';
        child.append(error,valueField,slider);row.append(line,child);list.append(row);rows.set(e,{input,error,slider,valueField,updateHighlight,child,controls:new Map()});
      });
      if(!readonly) button('+ Add expression',add,list);
    }
    function add(){state.expressions.push({id:'row'+Date.now()+'-'+(++sequence),text:'',color:colors[state.expressions.length%colors.length],hidden:false});render();plot();rows.get(state.expressions.at(-1)).input.focus();notify();}
    function scope(){const s=new Map([['pi',Math.PI],['e',Math.E],['ln',Math.log],['log',Math.log10],['sqrt',Math.sqrt],['abs',Math.abs]]);['sin','cos','tan'].forEach(n=>s.set(n,x=>Math[n](degrees?x*Math.PI/180:x)));return s;}
    function numeric(c,s){const value=c.evaluate(s);if(typeof value!=='number'||!Number.isFinite(value)) throw Error('Expected a finite real number.');return value;}
    function inspectFormula(e,p,s,evaluate,attrs,parsed){
      const r=rows.get(e);
      if(!probes.has(e.id)){const initial=p.inputVariable==='x'?0:s.has(p.inputVariable)?s.get(p.inputVariable):1;probes.set(e.id,{x:initial,y:evaluate(initial),touched:false,pending:null});}
      const probe=probes.get(e.id), names=new Set();
      p.nodes.forEach(n=>n.traverse(node=>{if(node.isSymbolNode && !scope().has(node.name))names.add(node.name);}));
      if(p.name==='y'||computerText(e.text).includes('='))names.add(p.outputVariable);
      names.forEach(name=>{
        if(r.controls.has(name))return;
        const label=document.createElement('label'), control=document.createElement('input');label.className='graph-viewer-parameter';label.append(document.createTextNode((computerNotation?name:displayMath(name))+' = '));control.type='number';control.step='any';control.dataset.variable=name;control.setAttribute('aria-label','Temporary value: '+name);
        control.oninput=()=>{
          if(!Number.isFinite(control.valueAsNumber)){r.error.textContent='Enter a finite number.';control.setCustomValidity('Enter a finite number.');return;}
          control.setCustomValidity('');probe.touched=true;
          if(name===p.inputVariable||name===p.outputVariable)probe.pending={name,value:control.valueAsNumber};
          else{
            const parameter=parsed.find(([,parameter])=>parameter.kind==='slider'&&parameter.name===name);
            if(parameter)viewerValues.set(parameter[0].id,control.valueAsNumber);else freeValues.set(name,control.valueAsNumber);
          }
          plot();
        };label.append(control);r.child.append(label);r.controls.set(name,control);
      });
      try{
        if(probe.pending?.name===p.outputVariable){
          const target=probe.pending.value,x=solveValue(x=>evaluate(x)-target,probe.x,target);
          probe.x=x;probe.y=target;
        }else{
          const x=probe.pending?.name===p.inputVariable?probe.pending.value:probe.x,y=evaluate(x);
          if(!Number.isFinite(y))throw Error('No real result at this value.');probe.x=x;probe.y=y;
        }
      }catch(err){r.error.textContent=err.message;}
      probe.pending=null;
      r.controls.forEach((control,name)=>{if(document.activeElement!==control)control.value=Number.isFinite(name===p.inputVariable?probe.x:name===p.outputVariable?probe.y:s.get(name))?Number((name===p.inputVariable?probe.x:name===p.outputVariable?probe.y:s.get(name)).toPrecision(12)):'';});
      if(probe.touched&&!e.hidden&&Number.isFinite(probe.y))objects.push(board.create('point',[probe.x,probe.y],{...attrs,fillColor:e.color,fillOpacity:1,name:'',size:4}));
    }
    function plot(){
      if(dead) return;
      objects.forEach(o=>board.removeObject(o));objects=[];
      const s=scope(), parsed=[];
      if(readonly)freeValues.forEach((value,name)=>s.set(name,value));
      state.expressions.forEach(e=>{const r=rows.get(e);r.error.textContent='';try{const p=parseForGraph(e.text);r.slider.hidden=p.kind!=='slider';r.valueField.hidden=!readonly||p.kind!=='slider';parsed.push([e,p]);}catch(err){r.slider.hidden=true;r.valueField.hidden=true;r.error.textContent=err.message;}});
      // Resolve parameters first, including forward references; report cycles without affecting other rows.
      let pending=parsed.filter(([,p])=>p.kind==='slider');
      for(let pass=0;pass<parsed.length && pending.length;pass++) pending=pending.filter(([e,p])=>{
        try{if(['x','y','pi','e','sin','cos','tan','ln','log','sqrt','abs'].includes(p.name)) throw Error('Reserved parameter name.');const value=readonly&&viewerValues.has(e.id)?viewerValues.get(e.id):numeric(p.compiled[0],s);s.set(p.name,value);const r=rows.get(e);r.error.textContent='';r.slider.hidden=false;r.slider.min=Math.min(-10,value);r.slider.max=Math.max(10,value);r.slider.value=value;r.slider.setAttribute('aria-label',(readonly?'Temporary parameter slider: ':'Parameter value: ')+p.name);r.valueField.setAttribute('aria-label','Temporary parameter value: '+p.name);if(document.activeElement!==r.valueField)r.valueField.value=value;return false;}catch(err){rows.get(e).error.textContent=err.message;return true;}
      });
      pending.forEach(([e])=>{rows.get(e).slider.hidden=true;rows.get(e).valueField.hidden=true;});
      parsed.forEach(([e,p])=>{if(['empty','slider'].includes(p.kind)) return;try{
        const symbols=new Set();p.nodes.forEach(n=>n.traverse(node=>{if(node.isSymbolNode) symbols.add(node.name);}));
        symbols.forEach(name=>{if(!(p.kind==='function'&&name===p.inputVariable)&&!s.has(name)) throw Error('Unknown symbol: '+name);});
        const attrs={strokeColor:e.color,fillColor:'none',fillOpacity:0,strokeWidth:2,fixed:true,highlight:false};
        if(p.kind==='function'){
          const evaluate=x=>{const local=new Map(s);local.set(p.inputVariable,x);try{return numeric(p.compiled[0],local);}catch{return NaN;}};
          if(!e.hidden) objects.push(board.create('functiongraph',[evaluate],attrs));
          if(readonly)inspectFormula(e,p,s,evaluate,attrs,parsed);
        }else if(p.kind==='point'){const xy=p.compiled.map(c=>numeric(c,s));if(!e.hidden) objects.push(board.create('point',xy,{...attrs,fillColor:e.color,fillOpacity:1,name:'',size:3}));}
        else {const x=numeric(p.compiled[0],s);if(!e.hidden) objects.push(board.create('line',[[x,0],[x,1]],attrs));}
      }catch(err){rows.get(e).error.textContent=err.message;}});
      board.update();
    }
    function theme(){const dark=document.body.classList.contains('dark');boardEl.style.background=dark?'#252220':'#faf8f5';Object.values(board.objects).forEach(o=>{if(o.elType==='axis')o.setAttribute({strokeColor:dark?'#b8b3ad':'#666666'});});board.update();}
    render();plot();theme();board.on('boundingbox',()=>{if(!resizing) notify();});
    const resize=new ResizeObserver(()=>{if(!dead && boardEl.clientWidth>0 && boardEl.clientHeight>0){resizing=true;try{board.resizeContainer(boardEl.clientWidth,boardEl.clientHeight,true);board.fullUpdate();}finally{resizing=false;}}});resize.observe(boardEl);
    return {getState(){const b=board.getBoundingBox();const bounds={xmin:b[0],xmax:b[2],ymin:b[3],ymax:b[1]};return {...state,v:1,expressions:state.expressions.map(e=>({...e})),viewport:Object.values(bounds).every(Number.isFinite)?viewport(bounds):state.viewport,angleMode:degrees?'degrees':'radians',notation:computerNotation?'computer':'math'};},updateSettings:theme,destroy(){dead=true;clearTimeout(timer);resize.disconnect();root.JXG.JSXGraph.freeBoard(board);container.replaceChildren();}};
  }
  root.StudyGraph={create,migrate,parse,latexToText};
  if(typeof module!=='undefined') module.exports=root.StudyGraph;
})(typeof window!=='undefined'?window:globalThis);

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const read=file=>fs.readFileSync(require.resolve('../'+file),'utf8');
test('configured tool names and images render safely; hidden and disabled are independent',()=>{
  const dom=new JSDOM('<div id="markerSection"></div>',{url:'https://studybase.example/index.html',runScripts:'outside-only'}),w=dom.window;
  w.eval(read('site-config.js'));w.eval(read('site-tools.js'));
  w.STUDYBASE_CONFIG.tools=[
    {id:'one',name:'Custom <Tool>',href:'graphing.html',icon:'icons/tools/graphing.svg'},
    {id:'two',name:'Unavailable',href:'analyser.html',icon:'icons/tools/analyser.svg',disabled:true},
    {id:'three',name:'Extra tool',href:'quiz-tool/quiz-tool.html',icon:'icons/tools/quiz.svg',hidden:true},
    {id:'four',name:'Hidden disabled',href:'KnowledgeCompetition/KnowledgeCompetition.html',disabled:true,hidden:true}
  ];
  const container=w.document.getElementById('markerSection'),render=()=>w.SBTools.renderSidebar(container);render();
  assert.equal(container.querySelectorAll('.tool-btn').length,2);assert.equal(container.querySelector('a').textContent,'Custom <Tool>');assert.equal(container.querySelector('tool'),null);
  assert.match(container.querySelector('img').src,/icons\/tools\/graphing.svg$/);assert.equal(container.querySelector('[aria-disabled]').hasAttribute('href'),false);
  container.querySelector('#toolsShowMore').click();assert.equal(container.querySelectorAll('.tool-btn').length,4);assert.equal(container.querySelector('#toolsShowMore').getAttribute('aria-expanded'),'true');assert.equal(container.querySelectorAll('[aria-disabled]').length,2);
  render();assert.equal(container.querySelectorAll('.tool-btn').length,4);container.querySelector('#toolsShowMore').click();assert.equal(container.querySelectorAll('.tool-btn').length,2);
  assert.equal(w.SBTools.forURL('graphing.html?project=one#view').name,'Custom <Tool>');dom.window.close();
});
test('Continue studying uses configured names and image icons and respects disabled tools',async()=>{
  const dom=new JSDOM('<div id="hubSidebar"></div>',{url:'https://studybase.example/index.html',runScripts:'outside-only'}),w=dom.window;w.isGuest=true;
  w.eval(read('site-config.js'));w.STUDYBASE_CONFIG.tools[0].name='Plotter';w.STUDYBASE_CONFIG.tools[0].disabled=true;
  w.eval(read('site-tools.js'));w.eval(read('qol.js'));await new Promise(resolve=>setImmediate(resolve));
  w.SBQoL.recordActivity('Saved curve','','Graphing tool','graphing.html?project=p1');
  const row=w.document.querySelector('#qol-continue .qol-result');assert.equal(row.getAttribute('aria-disabled'),'true');assert.equal(row.hasAttribute('href'),false);assert.match(row.textContent,/Plotter/);assert.match(row.querySelector('img').src,/icons\/tools\/graphing.svg$/);dom.window.close();
});
test('default tool destinations and image assets exist',()=>{
  const dom=new JSDOM('',{url:'https://studybase.example/index.html',runScripts:'outside-only'}),w=dom.window;w.eval(read('site-config.js'));
  for(const tool of w.STUDYBASE_CONFIG.tools){assert.ok(fs.existsSync(require('path').resolve(__dirname,'..',tool.href)),tool.href);assert.ok(fs.existsSync(require('path').resolve(__dirname,'..',tool.icon)),tool.icon);}
  dom.window.close();
});

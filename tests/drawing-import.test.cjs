const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
function fixture(){const dom=new JSDOM('',{url:'https://studybase.example/subject/subject.html',runScripts:'outside-only'}),w=dom.window,text=[];w.HTMLCanvasElement.prototype.getContext=()=>({fillRect(){},drawImage(){},strokeRect(){},measureText:value=>({width:value.length*7}),fillText:value=>text.push(value)});w.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/jpeg;base64,aGVsbG8=';w.eval(fs.readFileSync('subject/drawing-import.js','utf8'));return {w,text,read:file=>w.StudyDrawingImport.read(file),close:()=>w.close()};}
const file=(name,type)=>({name,type,size:20,arrayBuffer:async()=>new ArrayBuffer(20)});
test('PDF import renders each page locally and releases the document; large page counts fail safely',async t=>{
  const f=fixture();t.after(f.close);let destroyed=0,options;
  f.w.pdfjsLib={GlobalWorkerOptions:{},getDocument(opts){options=opts;return {promise:Promise.resolve({numPages:2,getPage:async()=>({getViewport:({scale})=>({width:600*scale,height:800*scale}),render:()=>({promise:Promise.resolve()}),cleanup(){}}),destroy:async()=>destroyed++})};}};
  const result=await f.read(file('worksheet.pdf','application/pdf'));assert.equal(result.pages.length,2);assert.equal(result.pages[0].height,1600);assert.equal(result.pages[0].background.name,'worksheet.pdf · 1');assert.equal(options.isEvalSupported,false);assert.equal(destroyed,1);assert.match(f.w.pdfjsLib.GlobalWorkerOptions.workerSrc,/vendor\/pdfjs\/pdf.worker.min.js$/);
  f.w.pdfjsLib.getDocument=()=>({promise:Promise.resolve({numPages:31,destroy:async()=>destroyed++})});await assert.rejects(f.read(file('large.pdf','application/pdf')),/30 pages/);assert.equal(destroyed,2);
});
test('Word import converts paragraphs and tables into annotation pages without executing uploaded HTML',async t=>{
  const f=fixture();t.after(f.close);f.w.mammoth={images:{imgElement:callback=>callback},convertToHtml:async()=>({value:'<h1>Worksheet</h1><p>Draw the force diagram.</p><script>window.documentWasExecuted=true</script><table><tr><td>Force</td><td>10 N</td></tr></table>'})};
  const result=await f.read(file('work.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document'));assert.equal(result.pages.length,1);assert.equal(result.pages[0].width,794);assert.ok(f.text.includes('Worksheet'));assert.ok(f.text.includes('10 N'));assert.equal(f.w.documentWasExecuted,undefined);assert.match(result.notice,/simplified/);
});
test('unsupported legacy Word files and oversized inputs leave conversion untouched',async t=>{
  const f=fixture();t.after(f.close);await assert.rejects(f.read(file('old.doc','application/msword')),/saved as .docx or PDF/);await assert.rejects(f.read({...file('large.pdf','application/pdf'),size:21000000}),/20 MB/);await assert.rejects(f.read(file('script.html','text/html')),/Choose a PDF/);
});

// Standalone site launcher with a loopback-only Jev transport. No account store.
'use strict';
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const UPSTREAM='https://api.typesafe.ai/v1/systemone';
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.pdf':'application/pdf'};
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
function createServer({root=ROOT,fetchImpl=fetch}={}) {
  let busy=0;
  return http.createServer(async(req,res)=>{
    try {
      // Validate Host as well as Origin to prevent DNS rebinding and remote pages
      // from using this local-only endpoint. No CORS permissions are granted.
      const host='127.0.0.1:'+req.socket.localPort;
      if(req.headers.host!==host){json(res,403,{error:'Open the address printed by the local launcher.'});return;}
      const origin='http://'+host;
      if((req.headers.origin && req.headers.origin!==origin) || ['cross-site','same-site'].includes(req.headers['sec-fetch-site'])){json(res,403,{error:'Local launcher accepts requests from its own page only.'});return;}
      const url=new URL(req.url,origin);
      if(url.pathname==='/api/localJev') {
        if(req.method!=='POST'){json(res,405,{error:'POST required'});return;}
        if(req.headers.origin!==origin || !String(req.headers['content-type']).startsWith('application/json')){json(res,403,{error:'Use the quiz page opened by the launcher.'});return;}
        const auth=req.headers.authorization;
        if(typeof auth!=='string' || !/^Bearer [^\s\x00-\x1f\x7f]{1,2048}$/.test(auth)){json(res,401,{error:'Add your Jev API key in Settings.'});return;}
        if(busy>=3){json(res,429,{error:'A marking request is already running. Retry shortly.'});return;}
        let raw='',size=0;
        for await(const chunk of req){size+=chunk.length;if(size>100000){json(res,413,{error:'Answer is too large.'});return;}raw+=chunk.toString('utf8');}
        let body;try{body=JSON.parse(raw);}catch{json(res,400,{error:'Invalid marking request'});return;}
        const mark=body?.questions?.mark;
        if(body?.model!=='jev-1.13.0' || typeof body.state!=='object' || !body.state || mark?.type!=='choice' || !mark.criteria || Object.keys(body.questions).length!==1){json(res,400,{error:'Invalid marking request'});return;}
        // Copy only the known marking fields; this cannot proxy arbitrary URLs.
        const request={model:body.model,state:{question:body.state.question,marking_guidance:body.state.marking_guidance,student_response:body.state.student_response},questions:{mark:{type:'choice',instructions:mark.instructions,criteria:mark.criteria}}};
        busy++;
        try {
          const upstream=await fetchImpl(UPSTREAM,{method:'POST',headers:{'Content-Type':'application/json',Authorization:auth},body:JSON.stringify(request),signal:AbortSignal.timeout(35000)});
          if(!upstream.ok){json(res,upstream.status,{error:'Jev request failed'});return;}
          const result=await upstream.json(),answer=result?.answers?.mark;
          // Never relay provider text, headers, cookies or debugging output.
          json(res,200,{model:result.model,answers:{mark:{type:answer?.type,choice:answer?.choice,confidence:answer?.confidence}}});
        } catch(error) {
          json(res,502,{error:error.name==='TimeoutError'?'Jev request timed out':'Could not reach Jev. Check internet access.'});
        } finally {busy--;}
        return;
      }
      if(req.method!=='GET' && req.method!=='HEAD'){json(res,405,{error:'Method not allowed'});return;}
      if(url.pathname==='/local-quiz-runtime.js'){
        res.writeHead(200,{'Content-Type':MIME['.js'],'Cache-Control':'no-store'});res.end("window.SB_LOCAL_JEV_RELAY = true; window.isGuest = true; sessionStorage.setItem('studybase_guest','1');");return;
      }
      let name;try{name=decodeURIComponent(url.pathname);}catch{json(res,400,{error:'Invalid path'});return;}
      const segments=name.split(/[\\/]/);
      if(segments.some(s=>s.startsWith('.') || ['node_modules','scripts','tests','users','json','files','studybasedata','secrets.json','website.json'].includes(s.toLowerCase()))){json(res,404,{error:'Not found'});return;}
      if(name.endsWith('/'))name+='index.html';
      const base=await fs.realpath(root);
      let file;try{file=await fs.realpath(path.join(base,name));}catch{json(res,404,{error:'Not found'});return;}
      const relative=path.relative(base,file),mime=MIME[path.extname(file).toLowerCase()];
      if(relative.startsWith('..') || path.isAbsolute(relative) || !mime || !(await fs.stat(file)).isFile()){json(res,404,{error:'Not found'});return;}
      const content=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:content);
    } catch {if(!res.headersSent)json(res,500,{error:'Local launcher request failed'});else res.end();}
  });
}
if(require.main===module){
  const server=createServer();server.listen(8888,'127.0.0.1',()=>{
    console.log(`Open http://127.0.0.1:${server.address().port}/quiz-tool/quiz-tool.html`);
    console.log('Keep this launcher running. Add your Jev key in Settings on this page. Press Ctrl+C to stop.');
  });
  server.on('error',error=>{console.error('Could not start the local launcher:',error.message);process.exitCode=1;});
}
module.exports={createServer};

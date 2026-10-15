(function(root){
  'use strict';
  const STORAGE_KEY='studybase_graphing_projects_v1';
  function cleanGraph(graph){
    if(!graph||graph.v!==1||!Array.isArray(graph.expressions)||graph.expressions.length>100)throw Error('This graph is not supported.');
    const expressions=graph.expressions.map((e,i)=>{
      if(!e||typeof e.text!=='string'||e.text.length>500)throw Error('Invalid graph expression.');
      return {id:typeof e.id==='string'?e.id.slice(0,100):'row'+i,text:e.text,color:/^#[0-9a-f]{6}$/i.test(e.color)?e.color:'#2d70b3',hidden:!!e.hidden};
    });
    const v=graph.viewport,valid=v&&['xmin','xmax','ymin','ymax'].every(k=>Number.isFinite(v[k]))&&v.xmin<v.xmax&&v.ymin<v.ymax;
    return {v:1,expressions,viewport:valid?{xmin:v.xmin,xmax:v.xmax,ymin:v.ymin,ymax:v.ymax}:{xmin:-10,xmax:10,ymin:-10,ymax:10},angleMode:graph.angleMode==='degrees'?'degrees':'radians',notation:graph.notation==='computer'?'computer':'math'};
  }
  function projectData(data){
    if(!data||typeof data.name!=='string')throw Error('Invalid graph project.');
    return {name:data.name.trim().slice(0,100)||'Untitled project',graph:cleanGraph(data.graph)};
  }
  function encodeShare(project){
    const text=JSON.stringify({v:1,...projectData(project)}),bytes=new TextEncoder().encode(text);
    const encoded=btoa(Array.from(bytes,b=>String.fromCharCode(b)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    if(encoded.length>100000)throw Error('This graph is too large for a share link.');return encoded;
  }
  function decodeShare(encoded){
    if(!encoded||encoded.length>100000||!/^[A-Za-z0-9_-]+$/.test(encoded))throw Error('Invalid shared graph link.');
    try{const bytes=Uint8Array.from(atob(encoded.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(data.v!==1)throw Error();return projectData(data);}catch{throw Error('Invalid shared graph link.');}
  }
  function importData(text){
    if(typeof text!=='string'||text.length>1000000)throw Error('Project files must be smaller than 1 MB.');
    let data;try{data=JSON.parse(text);}catch{throw Error('Choose a valid graph project JSON file.');}
    if(data?.type!=='StudyBaseGraph'||data.v!==1)throw Error('Unsupported project file. Export a StudyBase graph project first.');
    return projectData(data);
  }
  function exportData(data){return JSON.stringify({type:'StudyBaseGraph',v:1,...projectData(data)},null,2);}
  root.GraphingProjects={cleanGraph,projectData,encodeShare,decodeShare,importData,exportData};
  if(typeof module!=='undefined')module.exports=root.GraphingProjects;
  if(typeof document==='undefined')return;
  const byId=id=>document.getElementById(id),clone=data=>JSON.parse(JSON.stringify(data));
  const RECOVERY_KEY='studybase_graphing_recovery_v1',LAYOUT_KEY='studybase_graphing_layout_v1';
  let projects=[],current,editor,viewing=false,shared=false,dirty=false,mount=0,loading=false,saveTimer,statusTimer,storageReadable=true,layoutCleanup=()=>{};
  const canvas=byId('graphingCanvas'),name=byId('projectName'),status=byId('graphingStatus');
  root.onDarkModeChange=()=>editor?.updateSettings?.();
  function message(text,error=false){
    clearTimeout(statusTimer);status.textContent=text;status.dataset.error=String(error);
    if(!error&&/^(Autosaved|Project saved|Project exported|Project deleted)/.test(text))statusTimer=setTimeout(()=>{status.textContent='';},3000);
  }
  function uid(){return root.crypto?.randomUUID?.()||'graph-'+Date.now()+'-'+Math.random().toString(36).slice(2);}
  function draft(){return {id:uid(),name:'Untitled project',graph:cleanGraph({v:1,expressions:[{id:'curve',text:'y = x^2',color:'#2d70b3'}]})};}
  function snapshot(){return projectData({name:name.value,graph:!viewing&&editor?editor.getState():current.graph});}
  function projectURL(id){const url=new URL('graphing.html',location.href);url.searchParams.set('project',id);return url.href;}
  function recordRecent(){
    if(shared||!current||!projects.some(p=>p.id===current.id))return;
    root.SBQoL?.recordActivity(current.name,'','Graphing tool',projectURL(current.id));
  }
  root.addEventListener('studybase-account-ready',recordRecent);
  document.addEventListener('DOMContentLoaded',recordRecent);
  function persist(next){
    if(!storageReadable)throw Error('Saved projects could not be read. Export your graph before repairing browser storage.');
    localStorage.setItem(STORAGE_KEY,JSON.stringify({v:1,projects:next}));projects=next;
  }
  function loadProjects(){
    try{const raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{"v":1,"projects":[]}');if(raw.v!==1||!Array.isArray(raw.projects))throw Error();projects=raw.projects.map(p=>({id:String(p.id),updatedAt:Number(p.updatedAt)||0,...projectData(p)}));}
    catch{storageReadable=false;projects=[];message('Saved projects could not be read. Export your work before repairing browser storage.',true);}
  }
  function clearRecovery(){try{const saved=JSON.parse(localStorage.getItem(RECOVERY_KEY)||'null');if(saved?.id===current?.id)localStorage.removeItem(RECOVERY_KEY);}catch{/* A successful save is still safe to reopen. */}}
  function journal(){
    if(shared||!dirty||loading||!editor)return;
    try{localStorage.setItem(RECOVERY_KEY,JSON.stringify({v:1,id:current.id,updatedAt:Date.now(),...snapshot()}));}
    catch{message('Recovery could not be stored. Export your project to keep a copy.',true);}
  }
  function changed(){dirty=true;controls();journal();clearTimeout(saveTimer);saveTimer=setTimeout(()=>save(false),700);}
  function save(manual=true){
    clearTimeout(saveTimer);if(!editor||loading||(!manual&&(!dirty||shared)))return false;
    try{
      const data=snapshot(),id=shared?uid():current.id,saved={id,updatedAt:Date.now(),...data};
      persist([...projects.filter(p=>p.id!==id),saved]);current=clone(saved);dirty=false;clearRecovery();
      if(shared){shared=false;viewing=false;history.replaceState(null,'',location.pathname+location.search);mountProject();}
      else{controls();renderProjects();recordRecent();const url=new URL(location.href);url.searchParams.set('project',current.id);history.replaceState(null,'',url);}
      message(manual?'Project saved on this device.':'Autosaved on this device.');return true;
    }catch(error){message(error.message||'Could not save. Export your project to keep a copy.',true);controls();return false;}
  }
  function leaveDraft(){
    if(!dirty)return true;if(save(false))return true;
    if(!confirm('Saving failed. Discard unsaved changes? Export your project first to keep a copy.'))return false;
    clearTimeout(saveTimer);clearRecovery();dirty=false;return true;
  }
  function renderProjects(){
    const list=byId('projectList');list.replaceChildren();
    if(!projects.length){const empty=document.createElement('p');empty.className='graphing-project-empty';empty.textContent='Your graphs appear here after saving or autosaving.';list.append(empty);}
    [...projects].sort((a,b)=>b.updatedAt-a.updatedAt).forEach(p=>{
      const button=document.createElement('button'),title=document.createElement('strong'),detail=document.createElement('span');button.type='button';button.className='graphing-project-item';button.setAttribute('aria-current',String(current?.id===p.id&&!shared));title.textContent=p.name;detail.textContent=p.graph.expressions.filter(e=>e.text.trim()).length+' expressions · '+new Date(p.updatedAt).toLocaleDateString('en-AU');button.append(title,detail);
      button.onclick=()=>{if(!leaveDraft())return;shared=false;viewing=false;current=clone(p);dirty=false;history.replaceState(null,'',location.pathname+location.search);byId('projectsDialog').close();mountProject();};list.append(button);
    });
  }
  function controls(){
    name.readOnly=viewing;byId('viewProject').textContent=viewing?'Edit':'View';byId('viewProject').hidden=shared;
    byId('saveProject').textContent=shared?'Save a copy':'Save project';
    ['viewProject','saveProject','shareProject','duplicateProject','exportProject','exportImage'].forEach(id=>{byId(id).disabled=loading||!editor;});
    byId('newProject').disabled=loading;byId('importProject').disabled=loading;
    byId('deleteProject').hidden=shared||!projects.some(p=>p.id===current?.id);
    byId('projectState').textContent=shared?'Shared snapshot':dirty?'Unsaved changes':projects.some(p=>p.id===current?.id)?'Saved on this device':'Unsaved project';
    byId('viewNote').textContent=viewing?'Explore values without changing the saved formulas.':'Changes autosave on this device. Export a project to keep a portable copy.';
  }
  async function mountProject(){
    if(!shared){const url=new URL(location.href);url.hash='';if(projects.some(p=>p.id===current.id))url.searchParams.set('project',current.id);else url.searchParams.delete('project');history.replaceState(null,'',url);recordRecent();}
    const token=++mount;layoutCleanup();if(editor){editor.destroy();editor=null;}loading=true;name.value=current.name;controls();renderProjects();
    canvas.replaceChildren();const wait=document.createElement('p');wait.className='graphing-loading';wait.textContent='Loading graph…';canvas.append(wait);
    try{
      const next=await root.StudyGraph.create(canvas,{state:current.graph,readOnly:viewing,isCurrent:()=>token===mount,onChange(){if(!viewing)changed();}});
      if(token!==mount){next?.destroy();return;}editor=next;setupPanels();
    }catch(error){if(token===mount){canvas.replaceChildren();const text=document.createElement('p');text.className='graphing-loading';text.textContent=error.message;canvas.append(text);message('The graph could not load. Your saved projects are unchanged.',true);}}
    finally{if(token===mount){loading=false;controls();}}
  }
  function openCopy(data,label){current={id:uid(),...projectData(data)};current.name=(current.name+label).slice(0,100);shared=false;viewing=false;dirty=false;history.replaceState(null,'',location.pathname+location.search);return mountProject().then(()=>{if(editor){dirty=true;journal();save();}});}
  name.oninput=changed;
  byId('openProjects').onclick=()=>{renderProjects();byId('projectsDialog').showModal();};
  byId('closeProjects').onclick=()=>byId('projectsDialog').close();
  byId('newProject').onclick=()=>{if(!leaveDraft())return;current=draft();shared=false;viewing=false;dirty=false;message('');history.replaceState(null,'',location.pathname+location.search);mountProject();};
  byId('saveProject').onclick=()=>save();
  byId('duplicateProject').onclick=()=>{const data=snapshot();if(!leaveDraft())return;openCopy(data,' — copy');};
  byId('viewProject').onclick=()=>{if(!editor)return;if(!viewing){if(dirty&&!save(false))return;current={...current,...snapshot()};}viewing=!viewing;message('');mountProject();};
  byId('deleteProject').onclick=()=>{
    if(!confirm('Delete “'+current.name+'” from this device?'))return;
    try{clearTimeout(saveTimer);persist(projects.filter(p=>p.id!==current.id));root.SBQoL?.removeActivity(projectURL(current.id));clearRecovery();current=projects.length?clone(projects[0]):draft();viewing=false;dirty=false;mountProject();message('Project deleted.');}catch(error){message(error.message,true);}
  };
  function download(blob,filename){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  const filename=()=>snapshot().name.replace(/[^\p{L}\p{N} _-]/gu,'').trim().slice(0,80)||'graph';
  byId('exportProject').onclick=()=>{try{download(new Blob([exportData(snapshot())],{type:'application/json'}),filename()+'.studybase.json');message('Project exported.');}catch(error){message(error.message,true);}};
  byId('importProject').onclick=()=>byId('projectFile').click();
  byId('projectFile').onchange=async()=>{
    const file=byId('projectFile').files[0];byId('projectFile').value='';if(!file)return;
    try{if(file.size>1000000)throw Error('Project files must be smaller than 1 MB.');const data=importData(await file.text());if(loading)throw Error('Wait for the graph to finish loading, then import again.');if(!leaveDraft())return;await openCopy(data,'');}
    catch(error){message(error.message,true);}
  };
  byId('shareProject').onclick=()=>{try{const url=new URL(location.href);url.hash='graph='+encodeShare(snapshot());byId('shareLink').value=url.href;byId('shareStatus').textContent='';byId('shareDialog').showModal();}catch(error){message(error.message,true);}};
  byId('closeShare').onclick=()=>byId('shareDialog').close();
  byId('copyShare').onclick=async()=>{try{await navigator.clipboard.writeText(byId('shareLink').value);byId('shareStatus').textContent='Link copied.';}catch{byId('shareLink').focus();byId('shareLink').select();byId('shareStatus').textContent='Select and copy the link above.';}};
  byId('exportImage').onclick=()=>{byId('imageStatus').textContent='';byId('imageDialog').showModal();};
  byId('closeImage').onclick=()=>byId('imageDialog').close();
  byId('downloadImage').onclick=async()=>{
    const button=byId('downloadImage');button.disabled=true;
    try{
      const width=Number(byId('imageWidth').value);if(!Number.isInteger(width)||width<320||width>4096)throw Error('Choose an image width from 320 to 4096 pixels.');
      const svg=editor.exportSVG({width,transparent:byId('imageTransparent').checked}),blob=new Blob([svg],{type:'image/svg+xml;charset=utf-8'});
      if(byId('imageFormat').value==='svg')download(blob,filename()+'.svg');
      else{
        const url=URL.createObjectURL(blob);
        try{const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('Could not render the image. Try SVG export.'));image.src=url;});const output=document.createElement('canvas');output.width=image.width;output.height=image.height;const context=output.getContext('2d');if(!context)throw Error('Image export is unavailable in this browser.');context.drawImage(image,0,0);const png=await new Promise(resolve=>output.toBlob(resolve,'image/png'));if(!png)throw Error('Could not create the PNG. Try SVG export.');download(png,filename()+'.png');}finally{URL.revokeObjectURL(url);}
      }
      byId('imageStatus').textContent='Image exported.';
    }catch(error){byId('imageStatus').textContent=error.message;}finally{button.disabled=false;}
  };
  function setupPanels(){
    const panel=canvas.querySelector('.graph-expressions');if(!panel)return;
    let layout={width:290,height:260,hidden:false};try{layout={...layout,...JSON.parse(localStorage.getItem(LAYOUT_KEY)||'{}')};}catch{}
    const mobile=root.matchMedia?.('(max-width:700px)'),separator=document.createElement('div');separator.className='graphing-resizer';separator.tabIndex=0;separator.setAttribute('role','separator');separator.setAttribute('aria-label','Resize expression panel');panel.after(separator);
    let dragging=false;
    function persistLayout(){try{localStorage.setItem(LAYOUT_KEY,JSON.stringify(layout));}catch{}}
    function apply(){
      const vertical=!mobile?.matches,max=vertical?Math.max(200,Math.min(600,(canvas.clientWidth||900)-220)):Math.max(120,Math.min(480,(canvas.clientHeight||660)-180)),key=vertical?'width':'height';
      layout[key]=Math.max(vertical?200:120,Math.min(max,Number(layout[key])|| (vertical?290:260)));
      panel.hidden=!!layout.hidden;panel.inert=!!layout.hidden;separator.hidden=!!layout.hidden;
      canvas.style.setProperty('--expression-width',layout.width+'px');canvas.style.setProperty('--expression-height',layout.height+'px');
      separator.setAttribute('aria-orientation',vertical?'vertical':'horizontal');separator.setAttribute('aria-valuemin',vertical?'200':'120');separator.setAttribute('aria-valuemax',String(max));separator.setAttribute('aria-valuenow',String(layout[key]));
      byId('toggleExpressions').textContent=layout.hidden?'Show expressions':'Hide expressions';byId('toggleExpressions').setAttribute('aria-expanded',String(!layout.hidden));
    }
    function resize(value){layout[mobile?.matches?'height':'width']=value;apply();persistLayout();}
    const move=event=>{if(!dragging)return;const rect=canvas.getBoundingClientRect();resize(mobile?.matches?event.clientY-rect.top:event.clientX-rect.left);};
    const end=()=>{dragging=false;canvas.classList.remove('graphing-resizing');};
    separator.onpointerdown=event=>{if(event.button!==0)return;event.preventDefault();separator.focus();dragging=true;canvas.classList.add('graphing-resizing');separator.setPointerCapture?.(event.pointerId);};
    separator.onkeydown=event=>{const key=mobile?.matches?'height':'width';if(['ArrowLeft','ArrowUp','ArrowRight','ArrowDown','Home','End'].includes(event.key)){event.preventDefault();resize(event.key==='Home'?Number(separator.getAttribute('aria-valuemin')):event.key==='End'?Number(separator.getAttribute('aria-valuemax')):layout[key]+(['ArrowLeft','ArrowUp'].includes(event.key)?-20:20));}};
    separator.ondblclick=()=>resize(mobile?.matches?260:290);
    byId('toggleExpressions').onclick=()=>{layout.hidden=!layout.hidden;apply();persistLayout();};
    root.addEventListener('pointermove',move);root.addEventListener('pointerup',end);root.addEventListener('pointercancel',end);root.addEventListener('resize',apply);apply();
    layoutCleanup=()=>{end();root.removeEventListener('pointermove',move);root.removeEventListener('pointerup',end);root.removeEventListener('pointercancel',end);root.removeEventListener('resize',apply);};
  }
  root.addEventListener('beforeunload',event=>{journal();if(dirty&&!save(false)){event.preventDefault();event.returnValue='';}});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){journal();save(false);}});
  root.addEventListener('pagehide',()=>{journal();save(false);});
  loadProjects();
  try{
    const encoded=new URLSearchParams(location.hash.slice(1)).get('graph');
    if(encoded){current={id:uid(),...decodeShare(encoded)};shared=true;viewing=true;}
    else{
      const requested=new URLSearchParams(location.search).get('project'),selected=projects.find(p=>p.id===requested);
      current=requested?(selected?clone(selected):draft()):projects.length?clone([...projects].sort((a,b)=>b.updatedAt-a.updatedAt)[0]):draft();
      if(requested&&!selected)message('This project is no longer available on this device.',true);
      try{const recovery=JSON.parse(localStorage.getItem(RECOVERY_KEY)||'null');if(recovery?.v===1&&typeof recovery.id==='string'&&Number.isFinite(recovery.updatedAt)&&(!requested||requested===recovery.id)){const saved=projects.find(p=>p.id===recovery.id);if(!saved||recovery.updatedAt>saved.updatedAt){current={id:recovery.id,...projectData(recovery)};dirty=true;message('Recovered your last unsaved graph. Save or export it to keep a copy.');}}}catch{message('A recovery draft could not be read. Saved projects are still available.',true);}
    }
  }catch(error){current=draft();message(error.message,true);}
  mountProject();
})(typeof window!=='undefined'?window:globalThis);

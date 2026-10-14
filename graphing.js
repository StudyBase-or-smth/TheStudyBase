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
  root.GraphingProjects={cleanGraph,projectData,encodeShare,decodeShare};
  if(typeof module!=='undefined')module.exports=root.GraphingProjects;
  if(typeof document==='undefined')return;

  const byId=id=>document.getElementById(id);
  const sidebar=byId('projectsSidebar'),toggle=byId('toggleProjects'),scrim=byId('projectsScrim');
  const narrow=root.matchMedia?.('(max-width:700px)');
  const readPreference=key=>{try{return localStorage.getItem(key);}catch{return null;}};
  const writePreference=(key,value)=>{try{localStorage.setItem(key,value);}catch{/* Preferences are optional. */}};
  let desktopCollapsed=readPreference('studybase_graphing_sidebar_collapsed')==='1';
  function showProjects(open,focus=false){
    sidebar.hidden=!open;
    toggle.setAttribute('aria-expanded',String(open));toggle.textContent=open?'Hide projects':'Projects';
    scrim.hidden=!(open&&narrow?.matches);
    document.querySelector('.graphing-main').inert=!scrim.hidden;
    document.querySelector('header').inert=!scrim.hidden;
    if(!scrim.hidden){sidebar.setAttribute('role','dialog');sidebar.setAttribute('aria-modal','true');}
    else{sidebar.removeAttribute('role');sidebar.removeAttribute('aria-modal');}
    if(focus)(open&&narrow?.matches?byId('closeProjects'):toggle).focus();
  }
  toggle.onclick=()=>{const open=sidebar.hidden;if(!narrow?.matches){desktopCollapsed=!open;writePreference('studybase_graphing_sidebar_collapsed',open?'0':'1');}showProjects(open,true);};
  byId('closeProjects').onclick=scrim.onclick=()=>showProjects(false,true);
  document.addEventListener('keydown',event=>{
    if(scrim.hidden)return;
    if(event.key==='Escape'){event.preventDefault();showProjects(false,true);}
    if(event.key==='Tab'){
      const items=[...sidebar.querySelectorAll('button:not(:disabled),a[href],input')],first=items[0],last=items.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  });
  const adaptSidebar=()=>{const focusInside=sidebar.contains(document.activeElement);showProjects(narrow?.matches?false:!desktopCollapsed);if(sidebar.hidden&&focusInside)toggle.focus();};
  narrow?.addEventListener('change',adaptSidebar);adaptSidebar();
  let projects=[],current,editor,viewing=false,shared=false,dirty=false,mount=0,loading=false;
  root.onDarkModeChange=()=>editor?.updateSettings?.();
  const canvas=byId('graphingCanvas'),name=byId('projectName'),status=byId('graphingStatus');
  function message(text,error=false){status.textContent=text;status.dataset.error=String(error);}
  function uid(){return root.crypto?.randomUUID?.()||'graph-'+Date.now()+'-'+Math.random().toString(36).slice(2);}
  function draft(){return {id:uid(),name:'Untitled project',graph:cleanGraph({v:1,expressions:[{id:'curve',text:'y = x^2',color:'#2d70b3'}]})};}
  function snapshot(){return projectData({name:name.value,graph:!viewing&&editor?editor.getState():current.graph});}
  function persist(next){localStorage.setItem(STORAGE_KEY,JSON.stringify({v:1,projects:next}));projects=next;}
  function loadProjects(){
    try{const raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{"v":1,"projects":[]}');if(raw.v!==1||!Array.isArray(raw.projects))throw Error();projects=raw.projects.map(p=>({id:String(p.id),updatedAt:Number(p.updatedAt)||0,...projectData(p)}));}
    catch{projects=[];message('Saved projects could not be read. Existing storage has not been changed.',true);}
  }
  function renderProjects(){
    const list=byId('projectList');list.replaceChildren();
    if(!projects.length){const empty=document.createElement('p');empty.className='graphing-project-empty';empty.textContent='Save a graph to start a project.';list.append(empty);}
    [...projects].sort((a,b)=>b.updatedAt-a.updatedAt).forEach(p=>{
      const button=document.createElement('button'),title=document.createElement('strong'),detail=document.createElement('span');button.type='button';button.className='graphing-project-item';button.setAttribute('aria-current',String(current?.id===p.id&&!shared));title.textContent=p.name;detail.textContent=p.graph.expressions.filter(e=>e.text.trim()).length+' expressions · '+new Date(p.updatedAt).toLocaleDateString('en-AU');button.append(title,detail);button.onclick=()=>{if(!leaveDraft())return;shared=false;viewing=false;current=JSON.parse(JSON.stringify(p));dirty=false;history.replaceState(null,'',location.pathname+location.search);mountProject();};list.append(button);
    });
  }
  function controls(){
    name.readOnly=viewing;byId('viewProject').textContent=viewing?'Edit':'View';byId('viewProject').hidden=shared;
    byId('saveProject').textContent=shared?'Save a copy':'Save project';
    ['viewProject','saveProject','shareProject'].forEach(id=>{byId(id).disabled=loading||!editor;});
    byId('newProject').disabled=loading;
    byId('deleteProject').hidden=shared||!projects.some(p=>p.id===current?.id);
    byId('projectState').textContent=shared?'Shared snapshot':dirty?'Unsaved changes':projects.some(p=>p.id===current?.id)?'Saved on this device':'Unsaved project';
    byId('viewNote').textContent=viewing?'Change the values under a formula to explore it. These changes are not saved.':'Build your graph, then switch to View to explore its values.';
  }
  function leaveDraft(){return !dirty||confirm('Discard unsaved changes to this project?');}
  async function mountProject(){
    if(narrow?.matches&&!sidebar.hidden)showProjects(false,true);
    const token=++mount;if(editor){editor.destroy();editor=null;}loading=true;name.value=current.name;controls();renderProjects();
    canvas.replaceChildren();const wait=document.createElement('p');wait.className='graphing-loading';wait.textContent='Loading graph…';canvas.append(wait);
    try{
      const next=await root.StudyGraph.create(canvas,{state:current.graph,readOnly:viewing,isCurrent:()=>token===mount,onChange(){if(!viewing){dirty=true;controls();}}});
      if(token!==mount){next?.destroy();return;}editor=next;
    }catch(error){if(token===mount){canvas.replaceChildren();const text=document.createElement('p');text.className='graphing-loading';text.textContent=error.message;canvas.append(text);message('The graph could not load. Your saved projects are unchanged.',true);}}
    finally{if(token===mount){loading=false;controls();}}
  }
  name.oninput=()=>{dirty=true;controls();};
  byId('newProject').onclick=()=>{if(!leaveDraft())return;current=draft();shared=false;viewing=false;dirty=false;message('');history.replaceState(null,'',location.pathname+location.search);mountProject();};
  byId('saveProject').onclick=async()=>{
    try{
      const data=snapshot(),id=shared?uid():current.id,updatedAt=Date.now(),saved={id,updatedAt,...data};
      persist([...projects.filter(p=>p.id!==id),saved]);current=JSON.parse(JSON.stringify(saved));dirty=false;
      if(shared){shared=false;viewing=false;history.replaceState(null,'',location.pathname+location.search);await mountProject();}
      else{controls();renderProjects();}message('Project saved on this device.');
    }catch{message('The project could not be saved. Check available browser storage and try again.',true);}
  };
  byId('viewProject').onclick=()=>{if(!editor)return;if(!viewing){current={...current,...snapshot()};}viewing=!viewing;message('');mountProject();};
  byId('deleteProject').onclick=()=>{
    if(!confirm('Delete “'+current.name+'” from this device?'))return;
    try{persist(projects.filter(p=>p.id!==current.id));current=projects.length?JSON.parse(JSON.stringify(projects[0])):draft();viewing=false;dirty=false;mountProject();message('Project deleted.');}catch{message('The project could not be deleted.',true);}
  };
  byId('shareProject').onclick=()=>{
    try{const url=new URL(location.href);url.hash='graph='+encodeShare(snapshot());byId('shareLink').value=url.href;byId('shareStatus').textContent='';byId('shareDialog').showModal();}
    catch(error){message(error.message,true);}
  };
  byId('closeShare').onclick=()=>byId('shareDialog').close();
  byId('copyShare').onclick=async()=>{
    try{await navigator.clipboard.writeText(byId('shareLink').value);byId('shareStatus').textContent='Link copied.';}
    catch{byId('shareLink').focus();byId('shareLink').select();byId('shareStatus').textContent='Select and copy the link above.';}
  };
  root.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  loadProjects();
  try{const encoded=new URLSearchParams(location.hash.slice(1)).get('graph');if(encoded){current={id:uid(),...decodeShare(encoded)};shared=true;viewing=true;}else current=projects.length?JSON.parse(JSON.stringify([...projects].sort((a,b)=>b.updatedAt-a.updatedAt)[0])):draft();}
  catch(error){current=draft();message(error.message,true);}
  mountProject();
})(typeof window!=='undefined'?window:globalThis);

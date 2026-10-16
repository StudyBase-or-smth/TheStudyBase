// Beta visual topic dependency editor. No inferred links or AI.
(function(root){
  'use strict';
  const core=StudyKnowledgeGraphCore,NS='http://www.w3.org/2000/svg',W=188,H=70,contexts=new Map();
  let adapter,active,sequence=0;
  const copy=value=>JSON.parse(JSON.stringify(value));
  const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node;};
  const svg=(tag,attrs={})=>{const node=document.createElementNS(NS,tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));return node;};
  const pendingKey=ctx=>'sbkg:'+ (root.__sbAuth?.currentUser?.uid||root.currentUid||'guest')+':'+ctx.key;
  function pending(ctx){try{return JSON.parse(localStorage.getItem(pendingKey(ctx))||'null');}catch{return null;}}
  function cached(ctx){return pending(ctx)||sbMemGet(ctx.key,null)||{};}
  function context(origin){const ctx=adapter.context(origin);contexts.set(ctx.key,ctx);return ctx;}
  function updateHeader(){
    if(!adapter)return;const ctx=context(null),button=document.getElementById('btnKnowledgeGraph');if(!button)return;
    const enabled=cached(ctx).enabled!==false;button.setAttribute('data-enabled',String(enabled));button.title=enabled?'Knowledge graph · Beta':'Knowledge graph · Beta · Disabled';
    button.setAttribute('aria-label',button.title);
    for(const link of document.querySelectorAll('.knowledge-topic-link'))link.hidden=cached(context(link.dataset.knowledgeOrigin)).enabled===false;
    document.getElementById('fKnowledgeGraph')?.refreshKnowledgeGraphControls?.();
    for(const target of document.querySelectorAll('.knowledge-prerequisites'))target.renderKnowledgePrerequisites?.();
  }
  async function load(ctx){
    try{await sbLoadKey(ctx.key);}catch{/* Cached graph remains usable offline. */}
    const graph=core.normalize(cached(ctx),ctx.topics().map(t=>String(t.id)));updateHeader();return graph;
  }
  async function flush(ctx){
    if(!ctx.canEdit()||navigator.onLine===false)return false;
    const owner=pendingKey(ctx),value=pending(ctx);if(!value)return true;
    await sbPushToSync(ctx.key,value);
    if(owner===pendingKey(ctx)&&JSON.stringify(pending(ctx))===JSON.stringify(value)){sbMemSet(ctx.key,value);localStorage.removeItem(owner);updateHeader();}
    return true;
  }
  async function save(ctx,graph){
    if(!ctx.canEdit())throw Error('You do not have permission to edit this graph.');
    const value={...core.normalize(graph,ctx.topics().map(t=>String(t.id))),updatedAt:Date.now()};
    localStorage.setItem(pendingKey(ctx),JSON.stringify(value));sbMemSet(ctx.key,value);updateHeader();
    try{return {value,synced:await flush(ctx)};}catch{return {value,synced:false};}
  }
  function mountPrerequisites(target,id,origin,editorInput){
    if(!target||!adapter)return;const ctx=context(origin);
    const render=()=>{
      if(!target.isConnected)return;const graph=editorInput?.knowledgeGraphDraft?.after||cached(ctx),ids=new Set((graph.edges||[]).filter(e=>e.to===String(id)).map(e=>e.from)),topics=ctx.topics().filter(t=>ids.has(String(t.id)));
      target.replaceChildren();
      if(!topics.length){target.append(el('span','qol-muted','No prerequisite connections.'));return;}
      for(const [index,topic] of topics.entries()){
        if(index)target.append(document.createTextNode(', '));
        if(editorInput){target.append(document.createTextNode(topic.name));continue;}
        const link=el('a','knowledge-prerequisite-link',topic.name);link.href=ctx.topicURL(topic.id);
        link.onclick=event=>{event.preventDefault();ctx.openTopic(topic.id);};
        target.append(link);
      }
    };
    target.renderKnowledgePrerequisites=render;render();load(ctx).then(render);
  }
  function setupEditor(topic,origin){
    const input=document.getElementById('fKnowledgeGraph');if(!input||!adapter)return;
    input.dataset.included=String(topic.knowledgeGraphIncluded===true);
    input.dataset.topicId=String(topic.id||adapter.newId?.()||'');
    input.knowledgeGraphDraft=topic.knowledgeGraphDraft?copy(topic.knowledgeGraphDraft):null;
    const ctx=context(origin),off=cached(ctx).enabled===false;input.disabled=off||!ctx.canEdit();
    const remove=document.getElementById('fKnowledgeGraphRemove');
    function refreshRemove(){input.disabled=cached(ctx).enabled===false||!ctx.canEdit();if(remove)remove.disabled=input.disabled||!(input.dataset.included==='true'||input.knowledgeGraphDraft||(cached(ctx).nodes||[]).includes(input.dataset.topicId)||(cached(ctx).edges||[]).some(e=>e.from===input.dataset.topicId||e.to===input.dataset.topicId));}
    input.refreshKnowledgeGraphControls=refreshRemove;
    refreshRemove();
    const note=document.getElementById('knowledgeEditorHint');
    const prerequisites=document.getElementById('knowledgeEditorPrerequisites');mountPrerequisites(prerequisites,input.dataset.topicId,origin,input);
    if(note)note.textContent=off?'Knowledge graph is disabled here. Enable it from the header graph button.':'Connect this topic visually, then confirm to return here. Changes are saved with the topic.';
    input.onclick=()=>{
      const draftTopic=adapter.editorTopic(input);if(!draftTopic.name.trim()){document.getElementById('fName')?.focus();if(note)note.textContent='Give this topic a name before connecting it.';return;}
      open(draftTopic.id,origin,{topic:draftTopic,graphDraft:input.knowledgeGraphDraft,returnFocus:input,onConfirm:draft=>{
        input.dataset.included='true';input.knowledgeGraphDraft=draft;
        if(note)note.textContent='Connections confirmed. Save the topic to keep these changes.';
        refreshRemove();
        prerequisites?.renderKnowledgePrerequisites?.();
        input.dispatchEvent(new Event('change',{bubbles:true}));
      }});
    };
    if(remove)remove.onclick=()=>{
      const before=copy(input.knowledgeGraphDraft?.before||core.normalize(cached(ctx))),after=copy(input.knowledgeGraphDraft?.after||before),id=input.dataset.topicId;
      after.edges=after.edges.filter(e=>e.from!==id&&e.to!==id);delete after.positions[id];
      after.nodes=(after.nodes||[]).filter(n=>n!==id);
      input.dataset.included='false';input.knowledgeGraphDraft={before,after,removedTopic:id};
      if(note)note.textContent='Topic and its connections removed from the graph. Save the topic to keep this change.';
      input.dispatchEvent(new Event('change',{bubbles:true}));refreshRemove();
      prerequisites?.renderKnowledgePrerequisites?.();
    };
  }
  async function saveDraft(draft,origin){
    if(!draft)return;const ctx=context(origin),graph=core.normalize(cached(ctx)),before=draft.before,after=draft.after;
    const key=e=>e.from+'|'+e.to,beforeKeys=new Set(before.edges.map(key)),afterKeys=new Set(after.edges.map(key));
    graph.edges=graph.edges.filter(e=>!beforeKeys.has(key(e))||afterKeys.has(key(e)));
    for(const edge of after.edges)if(!beforeKeys.has(key(edge))&&!core.connectionError(graph.edges,edge.from,edge.to))graph.edges.push(edge);
    for(const [id,p] of Object.entries(after.positions))if(JSON.stringify(p)!==JSON.stringify(before.positions[id]))graph.positions[id]=p;
    const beforeNodes=new Set(before.nodes||[]),afterNodes=new Set(after.nodes||[]);
    graph.nodes=graph.nodes.filter(id=>!beforeNodes.has(id)||afterNodes.has(id));for(const id of afterNodes)if(!beforeNodes.has(id)&&!graph.nodes.includes(id))graph.nodes.push(id);
    if(draft.removedTopic){graph.edges=graph.edges.filter(e=>e.from!==draft.removedTopic&&e.to!==draft.removedTopic);graph.nodes=graph.nodes.filter(id=>id!==draft.removedTopic);delete graph.positions[draft.removedTopic];}
    return save(ctx,graph);
  }
  function open(focusId,origin,options={}){
    if(!adapter)return;active?.dialog.close();
    const storageContext=context(origin),ctx=options.topic?{...storageContext,topics:()=>{
      const edited={...options.topic,knowledgeGraphIncluded:true},items=storageContext.topics().map(t=>String(t.id)===String(edited.id)?edited:t);return items.some(t=>t.id===edited.id)?items:[...items,edited];
    }}:storageContext,dialog=el('dialog','kg-dialog');
    dialog.innerHTML='<div class="kg-header"><div><h2></h2><span class="kg-beta">Beta</span></div><button type="button" class="qol-button kg-close">Close</button></div><div class="kg-toolbar"><input type="search" class="kg-search" placeholder="Find a topic…" aria-label="Find a graph topic"><select class="kg-unit" aria-label="Filter graph by unit"><option value="">All units</option></select><button type="button" class="qol-button kg-minus" aria-label="Zoom out">−</button><button type="button" class="qol-button kg-plus" aria-label="Zoom in">+</button><button type="button" class="qol-button kg-fit">Fit</button><button type="button" class="qol-button kg-edit">Edit graph</button><label class="kg-enable"><input type="checkbox"> Enabled for this page</label><select class="kg-add-topic" aria-label="Add topic to graph"><option value="">Add topic…</option></select><button type="button" class="qol-button kg-arrange">Auto-arrange</button><button type="button" class="qol-button kg-undo">Undo</button><button type="button" class="qol-button primary kg-save">Save</button><button type="button" class="qol-button kg-cancel">Cancel</button></div><div class="kg-body"><div class="kg-canvas"><svg class="kg-svg" aria-label="Topic knowledge graph" role="group"></svg></div><aside class="kg-details" aria-label="Selected topic connections"></aside></div><p class="kg-status" role="status">Loading graph…</p><p class="kg-help">Arrows point from a prerequisite to the topic that uses it. Drag the background to pan. Select a topic to open it.</p>';
    dialog.querySelector('h2').textContent=ctx.name+' — Knowledge graph';
    dialog.querySelector('.kg-enable').lastChild.textContent=' Enabled for this '+ctx.kind;
    if(options.topic){dialog.querySelector('.kg-save').textContent='Confirm';dialog.querySelector('.kg-close').textContent='Back to topic';dialog.querySelector('.kg-enable').hidden=true;}
    const state={dialog,ctx,base:null,draft:null,editing:false,saving:false,undo:[],selected:focusId||null,edge:null,pending:null,drag:null,camera:{x:0,y:0,scale:1},marker:'kgArrow'+(++sequence)};active=state;
    dialog.querySelector('h2').id=state.marker+'Title';dialog.setAttribute('aria-labelledby',state.marker+'Title');
    const $=selector=>dialog.querySelector(selector),canvas=$('.kg-canvas'),surface=$('.kg-svg'),details=$('.kg-details'),status=$('.kg-status');
    const defs=svg('defs'),marker=svg('marker',{id:state.marker,viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:7,markerHeight:7,orient:'auto-start-reverse'});marker.append(svg('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'var(--muted2)'}));defs.append(marker);
    const scene=svg('g'),ghost=svg('path',{class:'kg-ghost',fill:'none'});surface.append(defs,scene,ghost);
    function say(message){status.textContent=message;}
    function updateHighlights(){
      if(!state.draft)return;const id=state.hovered||state.focusedId||state.selected,edge=!id?state.edge:null,related=new Set(id?[id]:edge?[edge.from,edge.to]:[]),focused=!!id||!!edge;
      if(id)for(const link of state.draft.edges)if(link.from===id||link.to===id){related.add(link.from);related.add(link.to);}
      for(const node of scene.querySelectorAll('[data-node]')){node.classList.toggle('is-related',related.has(node.dataset.node)&&node.dataset.node!==id);node.classList.toggle('is-hovered',node.dataset.node===id);node.classList.toggle('is-dimmed',focused&&!related.has(node.dataset.node));}
      for(const line of scene.querySelectorAll('[data-connection-from]')){const from=line.dataset.connectionFrom,to=line.dataset.connectionTo,lit=id?(from===id||to===id):edge?.from===from&&edge?.to===to;line.classList.toggle('is-highlighted',!!lit);line.classList.toggle('is-dimmed',focused&&!lit);}
      surface.classList.toggle('kg-has-highlight',focused);
    }
    const all=()=>{const included=new Set([...(state.draft?.nodes||[]),...(state.draft?.edges||[]).flatMap(e=>[e.from,e.to])]);return ctx.topics().filter(t=>t.knowledgeGraphIncluded===true||included.has(t.id));};
    const visible=()=>all().filter(t=>(!$('.kg-unit').value||String(t.unit||'')===$('.kg-unit').value)&&t.name.toLowerCase().includes($('.kg-search').value.trim().toLowerCase()));
    function remember(){state.undo.push(copy(state.draft));if(state.undo.length>100)state.undo.shift();}
    function positions(){const topics=all();if(topics.every(t=>state.draft.positions[t.id]))return;const defaults=core.arrange(topics,state.draft.edges);for(const topic of topics)if(!state.draft.positions[topic.id]){
      const p={...defaults[topic.id]};while(Object.values(state.draft.positions).some(other=>Math.abs(p.x-other.x)<W+40&&Math.abs(p.y-other.y)<H+35))p.y+=120;state.draft.positions[topic.id]=p;
    }}
    function size(){const r=canvas.getBoundingClientRect();return {w:r.width||900,h:r.height||500};}
    function point(event){const r=surface.getBoundingClientRect();return {x:(event.clientX-r.left-state.camera.x)/state.camera.scale,y:(event.clientY-r.top-state.camera.y)/state.camera.scale};}
    function path(from,to,lane=0,obstacles=[]){return core.connectionPath(from,to,lane,obstacles);}
    function zoom(factor,anchor){
      const {w,h}=size(),a=anchor||{x:w/2,y:h/2},old=state.camera.scale,next=Math.max(.15,Math.min(2.5,old*factor));
      state.camera.x=a.x-(a.x-state.camera.x)*next/old;state.camera.y=a.y-(a.y-state.camera.y)*next/old;state.camera.scale=next;draw();
    }
    function fit(){
      if(!state.draft)return;
      const topics=visible();if(!topics.length)return;const points=topics.map(t=>state.draft.positions[t.id]),{w,h}=size();
      const minX=Math.min(...points.map(p=>p.x))-32,minY=Math.min(...points.map(p=>p.y))-65,width=Math.max(...points.map(p=>p.x+W))+32-minX,height=Math.max(...points.map(p=>p.y+H))+28-minY;
      state.camera.scale=Math.max(.15,Math.min(1.25,(w-64)/width,(h-64)/height));state.camera.x=(w-width*state.camera.scale)/2-minX*state.camera.scale;state.camera.y=(h-height*state.camera.scale)/2-minY*state.camera.scale;draw();
    }
    function focus(id){
      state.selected=id;state.edge=null;$('.kg-search').value='';$('.kg-unit').value='';const p=state.draft.positions[id];if(p){const {w,h}=size();state.camera={scale:1,x:w/2-p.x-W/2,y:h/2-p.y-H/2};}draw();
    }
    function connect(a,b){
      if(a.port===b.port){say('Connect a Used by handle to a Prerequisite handle.');return;}
      const from=a.port==='out'?a.id:b.id,to=a.port==='in'?a.id:b.id,error=core.connectionError(state.draft.edges,from,to);
      if(error){say(error);return;}remember();state.draft.edges.push({from,to});state.pending=null;state.edge={from,to};say('Connection added. Save to keep it.');draw();
    }
    function chooseHandle(handle){
      if(!state.editing||state.saving)return;const endpoint={id:handle.dataset.topic,port:handle.dataset.port};
      if(state.pending)connect(state.pending,endpoint);else{state.pending=endpoint;say(endpoint.port==='out'?'Select the Prerequisite handle on the topic that uses this one.':'Select the Used by handle on a prerequisite topic.');draw();[...surface.querySelectorAll('[data-port]')].find(node=>node.dataset.topic===endpoint.id&&node.dataset.port===endpoint.port)?.focus();}
    }
    function info(){
      details.replaceChildren();const topic=ctx.topics().find(t=>t.id===state.selected);
      if(state.edge){
        const names=state.edge;details.append(el('h3','','Connection'),el('p','',ctx.topics().find(t=>t.id===names.from)?.name+' → '+ctx.topics().find(t=>t.id===names.to)?.name));
        if(state.editing){const remove=el('button','qol-button','Delete connection');remove.type='button';remove.disabled=state.saving;remove.onclick=()=>{remember();state.draft.edges=state.draft.edges.filter(e=>e.from!==names.from||e.to!==names.to);state.edge=null;draw();say('Connection removed. Undo or Save.');};details.append(remove);}return;
      }
      if(!topic){details.append(el('h3','','Connections'),el('p','qol-muted','Select a topic or a line. In edit mode, drag a node to move it or connect its handles.'));return;}
      details.append(el('h3','',topic.name));if(!options.topic){const link=el('a','qol-button','Open topic');link.href=ctx.topicURL(topic.id);link.onclick=event=>{event.preventDefault();dialog.close();ctx.openTopic(topic.id);};details.append(link);}
      for(const [label,key,other] of [['Learn first','to','from'],['Used by','from','to']]){
        details.append(el('h4','',label));const links=state.draft.edges.filter(e=>e[key]===topic.id).map(e=>ctx.topics().find(t=>t.id===e[other]));
        if(!links.some(Boolean))details.append(el('p','qol-muted','No connections.'));
        for(const target of links.filter(Boolean)){const button=el('button','kg-topic-link',target.name);button.type='button';button.onclick=()=>focus(target.id);details.append(button);}
      }
    }
    function draw(){
      if(!state.draft)return;positions();const {w,h}=size();surface.setAttribute('viewBox',`0 0 ${w} ${h}`);scene.setAttribute('transform',`translate(${state.camera.x} ${state.camera.y}) scale(${state.camera.scale})`);scene.replaceChildren();
      $('.kg-enable input').checked=state.draft.enabled;$('.kg-enable input').disabled=!state.editing||state.saving;
      $('.kg-edit').hidden=state.editing||!ctx.canEdit();for(const cls of ['kg-add-topic','kg-arrange','kg-undo','kg-save','kg-cancel'])$('.'+cls).hidden=!state.editing;
      for(const cls of ['kg-add-topic','kg-arrange','kg-save','kg-cancel'])$('.'+cls).disabled=state.saving;
      const includedIds=new Set(all().map(t=>t.id)),add=$('.kg-add-topic');add.replaceChildren();
      const placeholder=el('option','','Add topic…');placeholder.value='';add.append(placeholder);
      for(const topic of ctx.topics().filter(t=>!includedIds.has(t.id))){const option=el('option','',topic.name);option.value=topic.id;add.append(option);}
      add.disabled=state.saving||add.options.length===1||!state.draft.enabled;
      $('.kg-undo').disabled=state.saving||!state.undo.length;dialog.classList.toggle('kg-is-editing',state.editing);
      if(!state.draft.enabled){const text=svg('text',{x:24,y:45,class:'kg-empty'});text.textContent='Knowledge graph is disabled for this '+ctx.kind+'.';scene.append(text);info();return;}
      for(const paint of defs.querySelectorAll('[data-edge-paint]'))paint.remove();
      const topics=visible(),ids=new Set(topics.map(t=>t.id)),related=new Set([state.selected]),colors=core.unitColors(ctx.topics()),byId=new Map(topics.map(t=>[t.id,t]));
      const connected=new Set(state.draft.edges.flatMap(e=>[e.from,e.to])),groups=new Map();
      for(const topic of topics){const key=String(topic.unit||'')+'|'+connected.has(topic.id);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(topic);}
      for(const members of groups.values()){
        const points=members.map(t=>state.draft.positions[t.id]),x=Math.min(...points.map(p=>p.x))-26,y=Math.min(...points.map(p=>p.y))-40,width=Math.max(...points.map(p=>p.x+W))-x+26,height=Math.max(...points.map(p=>p.y+H))-y+24;
        const unit=String(members[0].unit||''),color=colors[unit],box=svg('rect',{x,y,width,height,rx:15,class:'kg-unit-region',fill:color,stroke:color});scene.append(box);
        const label=svg('text',{x:x+12,y:y-10,class:'kg-unit-label',fill:color});label.textContent=(unit?(ctx.unitName?.(unit)||unit):'No unit')+(connected.has(members[0].id)?'':' · Unconnected');scene.append(label);
      }
      for(const e of state.draft.edges)if(e.from===state.selected||e.to===state.selected){related.add(e.from);related.add(e.to);}
      let edgeIndex=0;state.routedSegments=[];const routedLines=[];
      for(const edge of state.draft.edges){if(!ids.has(edge.from)||!ids.has(edge.to))continue;const a=state.draft.positions[edge.from],b=state.draft.positions[edge.to],from={x:a.x+W+10,y:a.y+H/2},to={x:b.x-12,y:b.y+H/2},obstacles=topics.map(t=>({...state.draft.positions[t.id],width:W,height:H})),route=core.connectionRoute(from,to,obstacles,state.routedSegments),d=core.roundedPath(route),selected=state.edge?.from===edge.from&&state.edge?.to===edge.to;
        for(let i=1;i<route.length;i++)state.routedSegments.push({a:route[i-1],b:route[i]});
        const sourceColor=colors[String(byId.get(edge.from).unit||'')],targetColor=colors[String(byId.get(edge.to).unit||'')],paintId=state.marker+'Edge'+edgeIndex++,arrowId=paintId+'Arrow';let stroke=sourceColor;
        if(sourceColor!==targetColor){const gradient=svg('linearGradient',{id:paintId,gradientUnits:'userSpaceOnUse',x1:from.x,y1:from.y,x2:to.x,y2:to.y,'data-edge-paint':''});gradient.append(svg('stop',{offset:'0%','stop-color':sourceColor}),svg('stop',{offset:'100%','stop-color':targetColor}));defs.append(gradient);stroke=`url(#${paintId})`;}
        const arrow=svg('marker',{id:arrowId,viewBox:'0 0 10 10',refX:9,refY:5,markerUnits:'userSpaceOnUse',markerWidth:10,markerHeight:10,orient:'auto','data-edge-paint':''});arrow.append(svg('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:targetColor}));defs.append(arrow);
        const hit=svg('path',{d,class:'kg-edge-hit',fill:'none',tabindex:0,role:'button','aria-label':`Connection: ${topics.find(t=>t.id===edge.from).name} to ${topics.find(t=>t.id===edge.to).name}`});
        const select=()=>{state.edge=edge;state.selected=null;draw();};hit.onclick=select;hit.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}};const line=svg('path',{d,class:'kg-edge'+(selected?' is-selected':''),fill:'none','marker-end':`url(#${arrowId})`});line.style.stroke=stroke;scene.append(hit,line);
        line.dataset.connectionFrom=edge.from;line.dataset.connectionTo=edge.to;routedLines.push({route,line,stroke,selected,select});
      }
      const masks=new Map(),bridges=svg('g',{class:'kg-crossing-bridges'});
      for(const crossing of core.crossingBridges(routedLines.map(item=>item.route))){
        const item=routedLines[crossing.route];let mask=masks.get(crossing.route);
        if(!mask){const id=state.marker+'BridgeMask'+crossing.route,xs=item.route.map(p=>p.x),ys=item.route.map(p=>p.y),bounds={x:Math.min(...xs)-24,y:Math.min(...ys)-24,width:Math.max(...xs)-Math.min(...xs)+48,height:Math.max(...ys)-Math.min(...ys)+48};mask=svg('mask',{id,maskUnits:'userSpaceOnUse',...bounds,'data-edge-paint':''});mask.append(svg('rect',{...bounds,fill:'white'}));defs.append(mask);masks.set(crossing.route,mask);item.line.setAttribute('mask',`url(#${id})`);}
        const {x1,x2,y}=crossing,mid=(x1+x2)/2;
        mask.append(svg('rect',{x:x1,y:y-5,width:x2-x1,height:10,fill:'black'}));
        const d=`M ${x1} ${y} C ${mid} ${y}, ${x1} ${y-9}, ${mid} ${y-9} C ${x2} ${y-9}, ${mid} ${y}, ${x2} ${y}`;
        const halo=svg('path',{d,class:'kg-bridge-halo',fill:'none'}),arc=svg('path',{d,class:'kg-bridge'+(item.selected?' is-selected':''),fill:'none','aria-hidden':'true'});arc.style.stroke=item.stroke;arc.onclick=item.select;bridges.append(halo,arc);
        for(const part of [halo,arc]){part.dataset.connectionFrom=item.line.dataset.connectionFrom;part.dataset.connectionTo=item.line.dataset.connectionTo;}
      }
      scene.append(bridges);
      for(const topic of topics){const p=state.draft.positions[topic.id],node=svg('g',{transform:`translate(${p.x} ${p.y})`,class:'kg-node'+(state.selected===topic.id?' is-selected':state.selected&&related.has(topic.id)?' is-related':''),tabindex:0,role:'button','data-node':topic.id,'aria-label':topic.name});
        const title=svg('title');title.textContent=topic.name;node.append(title,svg('rect',{width:W,height:H,rx:10}));
        node.style.setProperty('--kg-unit-color',colors[String(topic.unit||'')]);
        const words=topic.name.match(/.{1,23}(?:\s|$)|.{1,23}/g)||['Topic'];for(const [i,line] of words.slice(0,2).entries()){const text=svg('text',{x:W/2,y:words.length>1?22+i*17:30,'text-anchor':'middle'});text.textContent=line.trim()+(i===1&&words.length>2?'…':'');node.append(text);}
        const unitText=svg('text',{x:W/2,y:58,'text-anchor':'middle',class:'kg-node-unit'}),unit=String(topic.unit||'');unitText.textContent=unit?(ctx.unitName?.(unit)||unit):'No unit';if(unitText.textContent.length>27)unitText.textContent=unitText.textContent.slice(0,26)+'…';node.append(unitText);
        if(state.editing)for(const [port,x,label] of [['in',0,'Prerequisite'],['out',W,'Used by']]){const handle=svg('circle',{cx:x,cy:H/2,r:9,class:'kg-handle'+(state.pending?.id===topic.id&&state.pending.port===port?' is-pending':''),'data-topic':topic.id,'data-port':port,tabindex:0,role:'button','aria-label':label+' handle for '+topic.name});const hint=svg('title');hint.textContent=label;handle.append(hint);handle.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();chooseHandle(handle);}};node.append(handle);}
        node.onkeydown=e=>{
          if(e.target!==node)return;
          if(e.key==='Enter'||e.key===' '){e.preventDefault();state.selected=topic.id;state.edge=null;draw();}
          else if(state.editing&&!state.saving&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
            e.preventDefault();remember();const p=state.draft.positions[topic.id],step=e.shiftKey?60:20;
            p.x=Math.max(-100000,Math.min(100000,p.x+(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0)));
            p.y=Math.max(-100000,Math.min(100000,p.y+(e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0)));draw();
          }else return;
          [...surface.querySelectorAll('[data-node]')].find(item=>item.dataset.node===topic.id)?.focus();
        };scene.append(node);
      }
      if(!topics.length){const text=svg('text',{x:24,y:45,class:'kg-empty'});text.textContent=all().length?'No topics match these filters.':'Open Knowledge graph in a topic editor to connect that topic.';scene.append(text);}
      info();updateHighlights();
    }
    let suppressClick=false;
    surface.addEventListener('click',event=>{
      if(suppressClick){suppressClick=false;return;}const handle=event.target.closest('[data-port]');if(handle){chooseHandle(handle);return;}
      const node=event.target.closest('[data-node]');if(node){state.selected=node.dataset.node;state.edge=null;draw();}else if(!event.target.closest('.kg-edge-hit,.kg-bridge')){state.selected=null;state.edge=null;draw();}
    });
    surface.addEventListener('pointerover',event=>{if(event.pointerType==='touch')return;const node=event.target.closest('[data-node]');if(node&&state.hovered!==node.dataset.node){state.hovered=node.dataset.node;updateHighlights();}});
    surface.addEventListener('pointerout',event=>{const next=event.relatedTarget?.closest?.('[data-node]');if(next?.dataset.node===state.hovered)return;state.hovered=next?.dataset.node||null;updateHighlights();});
    surface.addEventListener('pointerleave',()=>{state.hovered=null;updateHighlights();});
    surface.addEventListener('focusin',event=>{state.focusedId=event.target.closest('[data-node]')?.dataset.node||null;updateHighlights();});
    surface.addEventListener('focusout',event=>{state.focusedId=event.relatedTarget?.closest?.('[data-node]')?.dataset.node||null;updateHighlights();});
    surface.addEventListener('pointerdown',event=>{
      if(!state.draft?.enabled||state.saving||event.button!==0)return;const port=event.target.closest('[data-port]'),node=event.target.closest('[data-node]');
      if(!port&&!node&&event.target.closest('.kg-edge-hit'))return;
      const p=point(event);state.drag=port?{kind:'connect',endpoint:{id:port.dataset.topic,port:port.dataset.port},start:p}:node&&state.editing?{kind:'node',id:node.dataset.node,start:p,position:{...state.draft.positions[node.dataset.node]},before:copy(state.draft)}:{kind:'pan',nodeId:node?.dataset.node,start:{x:event.clientX,y:event.clientY},camera:{...state.camera}};
      state.drag.moved=false;surface.setPointerCapture?.(event.pointerId);event.preventDefault();
    });
    surface.addEventListener('pointermove',event=>{
      const drag=state.drag;if(!drag)return;const p=point(event),distance=drag.kind==='pan'?Math.hypot(event.clientX-drag.start.x,event.clientY-drag.start.y):Math.hypot(p.x-drag.start.x,p.y-drag.start.y);if(distance>3)drag.moved=true;if(!drag.moved)return;
      if(drag.kind==='pan'){state.camera.x=drag.camera.x+event.clientX-drag.start.x;state.camera.y=drag.camera.y+event.clientY-drag.start.y;draw();}
      if(drag.kind==='node'){state.draft.positions[drag.id]={x:Math.max(-100000,Math.min(100000,drag.position.x+p.x-drag.start.x)),y:Math.max(-100000,Math.min(100000,drag.position.y+p.y-drag.start.y))};draw();}
      if(drag.kind==='connect'){
        const a=state.draft.positions[drag.endpoint.id],hover=document.elementFromPoint?.(event.clientX,event.clientY)?.closest('[data-port]');
        const snapped=hover&&hover.dataset.port!==drag.endpoint.port?state.draft.positions[hover.dataset.topic]:null;
        const own={x:a.x+(drag.endpoint.port==='out'?W+10:-12),y:a.y+H/2},other=snapped?{x:snapped.x+(hover.dataset.port==='out'?W+10:-12),y:snapped.y+H/2}:p;
        const from=drag.endpoint.port==='out'?own:other,to=drag.endpoint.port==='out'?other:own,obstacles=visible().map(t=>({...state.draft.positions[t.id],width:W,height:H}));
        ghost.setAttribute('transform',scene.getAttribute('transform'));ghost.setAttribute('d',core.connectionPath(from,to,0,obstacles,state.routedSegments||[]));
      }
    });
    function endDrag(event,cancelled=false){
      const drag=state.drag;if(!drag)return;state.drag=null;ghost.removeAttribute('d');suppressClick=drag.moved;
      if(!drag.moved&&!cancelled){
        suppressClick=true;
        if(drag.kind==='connect'){const handle=[...surface.querySelectorAll('[data-port]')].find(item=>item.dataset.topic===drag.endpoint.id&&item.dataset.port===drag.endpoint.port);if(handle)chooseHandle(handle);}
        else if(drag.id||drag.nodeId){state.selected=drag.id||drag.nodeId;state.edge=null;draw();}
        else{state.selected=null;state.edge=null;state.hovered=null;state.focusedId=null;draw();}
      }
      if(drag.kind==='node'&&drag.moved){if(cancelled)state.draft=drag.before;else state.undo.push(drag.before);draw();}
      if(drag.kind==='connect'&&drag.moved&&!cancelled){const handle=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-port]');if(handle)connect(drag.endpoint,{id:handle.dataset.topic,port:handle.dataset.port});else say('Drop onto the opposite handle on another topic.');}
      if(surface.hasPointerCapture?.(event.pointerId))surface.releasePointerCapture(event.pointerId);
    }
    surface.addEventListener('pointerup',event=>endDrag(event));surface.addEventListener('pointercancel',event=>endDrag(event,true));
    surface.addEventListener('wheel',event=>{event.preventDefault();const r=surface.getBoundingClientRect();zoom(event.deltaY<0?1.12:1/1.12,{x:event.clientX-r.left,y:event.clientY-r.top});},{passive:false});
    $('.kg-search').oninput=draw;$('.kg-unit').onchange=()=>{draw();fit();};$('.kg-fit').onclick=fit;$('.kg-plus').onclick=()=>zoom(1.2);$('.kg-minus').onclick=()=>zoom(1/1.2);
    $('.kg-edit').onclick=()=>{if(!ctx.canEdit()||!state.base)return;state.editing=true;state.undo=[];say('Drag Used by → Prerequisite handles to connect. Changes apply only when saved.');draw();};
    $('.kg-enable input').onchange=event=>{remember();state.draft.enabled=event.target.checked;state.pending=null;draw();};
    $('.kg-arrange').onclick=()=>{remember();Object.assign(state.draft.positions,core.arrange(all(),state.draft.edges));draw();fit();};
    $('.kg-add-topic').onchange=event=>{const id=event.target.value;if(!id||!state.editing||state.saving)return;remember();state.draft.nodes.push(id);positions();focus(id);say('Topic added. Connect its handles, then '+(options.topic?'Confirm.':'Save.'));};
    $('.kg-undo').onclick=()=>{const previous=state.undo.pop();if(previous){state.draft=previous;state.pending=null;state.edge=null;draw();}};
    $('.kg-cancel').onclick=()=>{if(options.topic){dialog.close();return;}state.editing=false;state.draft=copy(state.base);state.pending=null;state.edge=null;say('Changes cancelled.');draw();};
    $('.kg-save').onclick=async()=>{
      if(!ctx.canEdit()||state.saving||state.drag)return;
      if(options.topic){options.onConfirm({before:copy(options.graphDraft?.before||state.base),after:copy(state.draft)});dialog.close();return;}
      state.saving=true;draw();say('Saving graph…');
      try{const result=await save(ctx,state.draft);if(active!==state)return;state.base=result.value;state.draft=copy(result.value);state.editing=false;state.pending=null;say(result.synced?'Graph saved.':'Saved on this device. Sync pending.');draw();}
      catch(error){say(error.message||'Could not save graph.');}finally{state.saving=false;if(active===state)draw();}
    };
    $('.kg-close').onclick=()=>dialog.close();dialog.addEventListener('keydown',event=>{if(event.key==='Escape'&&state.pending){event.preventDefault();event.stopPropagation();state.pending=null;say('Connection cancelled.');draw();}});
    const observer=typeof ResizeObserver==='function'?new ResizeObserver(()=>draw()):null;observer?.observe(canvas);
    dialog.addEventListener('close',()=>{observer?.disconnect();if(active===state)active=null;dialog.remove();(options.returnFocus||document.getElementById('btnKnowledgeGraph'))?.focus();});
    for(const cls of ['kg-edit','kg-add-topic','kg-arrange','kg-undo','kg-save','kg-cancel'])$('.'+cls).hidden=true;
    $('.kg-enable input').disabled=true;$('.kg-enable input').checked=cached(ctx).enabled!==false;
    document.body.append(dialog);dialog.showModal();
    load(ctx).then(graph=>{
      if(active!==state)return;state.base=graph;state.draft=core.normalize(options.graphDraft?.after||graph,ctx.topics().map(t=>String(t.id)));state.editing=!!options.topic&&ctx.canEdit();
      const values=new Map();for(const t of ctx.topics())if(t.unit)values.set(String(t.unit),ctx.unitName?.(t.unit)||String(t.unit));for(const [value,label] of values){const option=el('option','',label);option.value=value;$('.kg-unit').append(option);}
      draw();if(focusId&&state.draft.positions[focusId])focus(focusId);else fit();say(options.topic?'Connect this topic, then Confirm to return to its editor.':pending(ctx)?'Showing locally saved changes. Sync pending.':'Arrows: prerequisite → topic that uses it.');
    }).catch(error=>say(error.message||'Graph unavailable.'));
  }
  function init(value){
    adapter=value;document.getElementById('btnKnowledgeGraph')?.addEventListener('click',()=>{const editor=document.getElementById('fKnowledgeGraph');if(adapter.isEditing?.()&&editor&&!editor.disabled)editor.click();else open();});updateHeader();
    const retry=()=>{for(const ctx of contexts.values())flush(ctx).catch(()=>{});};
    root.addEventListener('online',retry);root.addEventListener('studybase-auth-ready',()=>{load(context(null));retry();});setInterval(retry,15000);load(context(null));
  }
  root.StudyKnowledgeGraph={init,open,setupEditor,saveDraft,mountPrerequisites,included:(id,origin)=>adapter&&((cached(context(origin)).nodes||[]).includes(id)||(cached(context(origin)).edges||[]).some(e=>e.from===id||e.to===id)),enabled:origin=>!adapter||cached(context(origin)).enabled!==false};
})(window);

(function(root){
  'use strict';
  const validId=id=>typeof id==='string'&&/^[A-Za-z0-9._-]{1,180}$/.test(id)&&!['__proto__','constructor','prototype'].includes(id);
  function connectionError(edges,from,to){
    if(from===to)return 'A topic cannot depend on itself.';
    if(edges.some(e=>e.from===from&&e.to===to))return 'These topics are already connected.';
    const seen=new Set(),stack=[to],next=new Map();
    for(const edge of edges){if(!next.has(edge.from))next.set(edge.from,[]);next.get(edge.from).push(edge.to);}
    while(stack.length){const id=stack.pop();if(id===from)return 'This connection would create a circular dependency.';if(seen.has(id))continue;seen.add(id);stack.push(...(next.get(id)||[]));}
    return '';
  }
  function normalize(raw={},topicIds){
    const allowed=topicIds?new Set(topicIds.map(String)):null,positions={};
    for(const [id,p] of Object.entries(raw?.positions||{}))if(validId(id)&&(!allowed||allowed.has(id))&&p&&Number.isFinite(p.x)&&Number.isFinite(p.y))positions[id]={x:Math.max(-100000,Math.min(100000,p.x)),y:Math.max(-100000,Math.min(100000,p.y))};
    const edges=[];
    for(const edge of Array.isArray(raw?.edges)?raw.edges:[]){if(!edge||!validId(edge.from)||!validId(edge.to)||(allowed&&(!allowed.has(edge.from)||!allowed.has(edge.to))))continue;if(!connectionError(edges,edge.from,edge.to))edges.push({from:edge.from,to:edge.to});}
    const nodes=[...new Set((Array.isArray(raw?.nodes)?raw.nodes:[]).filter(id=>validId(id)&&(!allowed||allowed.has(id))))];
    return {v:1,enabled:raw?.enabled!==false,positions,edges,nodes,updatedAt:Number.isFinite(raw?.updatedAt)?raw.updatedAt:0};
  }
  function arrange(topics,edges){
    const ids=new Set(topics.map(t=>t.id)),incoming=new Map(topics.map(t=>[t.id,0])),levels=new Map(topics.map(t=>[t.id,0]));
    const links=edges.filter(e=>ids.has(e.from)&&ids.has(e.to)),next=new Map(),neighbors=new Map();
    for(const e of links){incoming.set(e.to,incoming.get(e.to)+1);if(!next.has(e.from))next.set(e.from,[]);next.get(e.from).push(e.to);for(const [a,b] of [[e.from,e.to],[e.to,e.from]]){if(!neighbors.has(a))neighbors.set(a,[]);neighbors.get(a).push(b);}}
    const queue=topics.filter(t=>incoming.get(t.id)===0).map(t=>t.id);
    for(let i=0;i<queue.length;i++)for(const to of next.get(queue[i])||[]){levels.set(to,Math.max(levels.get(to),levels.get(queue[i])+1));incoming.set(to,incoming.get(to)-1);if(incoming.get(to)===0)queue.push(to);}
    // Give busy dependency boundaries actual routing lanes, rather than only
    // increasing the distance between the topic boxes uniformly.
    const maxLevel=Math.max(0,...levels.values()),columnX=[70];
    for(let level=0;level<maxLevel;level++){
      const crossing=links.filter(e=>levels.get(e.from)<=level&&levels.get(e.to)>level).length;
      columnX.push(columnX[level]+188+Math.max(180,Math.min(420,90+crossing*18)));
    }
    const components=new Map();let component=0;
    for(const t of topics){if(!neighbors.has(t.id)||components.has(t.id))continue;const pending=[t.id];components.set(t.id,component);for(let i=0;i<pending.length;i++)for(const id of neighbors.get(pending[i])||[])if(!components.has(id)){components.set(id,component);pending.push(id);}component++;}
    const units=[...new Set(topics.map(t=>String(t.unit||'')))].sort((a,b)=>a===''?1:b===''?-1:a.localeCompare(b)),positions={};let top=70;
    for(const unit of units){
      const connected=topics.filter(t=>String(t.unit||'')===unit&&neighbors.has(t.id));if(!connected.length)continue;
      for(const comp of [...new Set(connected.map(t=>components.get(t.id)))]){
        const nodes=connected.filter(t=>components.get(t.id)===comp),columns=new Map();
        const rowPitch=70+Math.max(80,Math.min(180,Math.max(...nodes.map(t=>(neighbors.get(t.id)||[]).length))*16));
        for(const t of nodes){const level=levels.get(t.id)||0;if(!columns.has(level))columns.set(level,[]);columns.get(level).push(t);}
        // Alternate barycentric sweeps reduce crossings while keeping each unit/component together.
        const rank=new Map(nodes.map((t,i)=>[t.id,i]));
        const localLinks=links.filter(e=>rank.has(e.from)&&rank.has(e.to)).slice(0,300);
        const crossingCount=()=>{let count=0;for(let i=0;i<localLinks.length;i++)for(let j=i+1;j<localLinks.length;j++){const a=localLinks[i],b=localLinks[j];if(levels.get(a.from)===levels.get(b.from)&&levels.get(a.to)===levels.get(b.to)&&(rank.get(a.from)-rank.get(b.from))*(rank.get(a.to)-rank.get(b.to))<0)count++;}return count;};
        let best=Infinity,bestColumns;
        for(let sweep=0;sweep<6;sweep++)for(const level of [...columns.keys()].sort((a,b)=>sweep%2?b-a:a-b)){
          const score=t=>{const peers=(neighbors.get(t.id)||[]).filter(id=>rank.has(id)&&(sweep%2?levels.get(id)>level:levels.get(id)<level));return peers.length?peers.reduce((sum,id)=>sum+rank.get(id),0)/peers.length:rank.get(t.id);};
          columns.get(level).sort((a,b)=>score(a)-score(b)||String(a.id).localeCompare(String(b.id)));columns.get(level).forEach((t,i)=>rank.set(t.id,i));
          const count=crossingCount();if(count<best){best=count;bestColumns=new Map([...columns].map(([key,items])=>[key,[...items]]));}
        }
        const stagger=nodes.length>3&&nodes.some(t=>(neighbors.get(t.id)||[]).length>2);
        for(const [level,items] of bestColumns||columns)items.forEach((t,i)=>positions[t.id]={x:columnX[level],y:top+i*rowPitch+(stagger?(level%3)*28:0)});
        top+=Math.max(...[...columns.values()].map(nodes=>nodes.length))*rowPitch+90+(stagger?56:0);
      }
      top+=100;
    }
    // Unconnected topics get their own area, never gaps inside a dependency chain.
    if(Object.keys(positions).length)top+=120;
    for(const unit of units){const loose=topics.filter(t=>String(t.unit||'')===unit&&!neighbors.has(t.id));if(!loose.length)continue;
      loose.forEach((t,i)=>positions[t.id]={x:70+(i%3)*310,y:top+Math.floor(i/3)*120});top+=Math.ceil(loose.length/3)*120+140;
    }
    return positions;
  }
  function unitColors(topics){
    const units=[...new Set(topics.map(t=>String(t.unit||'')))].filter(Boolean).sort(),colors=Object.assign(Object.create(null),{'':'#858a93'});
    units.forEach((unit,i)=>colors[unit]=`hsl(${Math.round((211+i*137.508)%360)} 58% 49%)`);return colors;
  }
  // A* on the rectilinear visibility grid. Short routes and few bends take priority over lane separation.
  function findConnectionRoute(from,to,obstacles=[],reserved=[]){
    const pad=10,rects=obstacles.map(p=>({l:p.x-pad,r:p.x+p.width+pad,t:p.y-pad,b:p.y+p.height+pad}));
    if(rects.some(r=>[from,to].some(p=>p.x>r.l&&p.x<r.r&&p.y>r.t&&p.y<r.b)))return [from,to];
    const clear=(a,b)=>!rects.some(r=>a.y===b.y
      ?a.y>r.t&&a.y<r.b&&Math.max(a.x,b.x)>r.l&&Math.min(a.x,b.x)<r.r
      :a.x>r.l&&a.x<r.r&&Math.max(a.y,b.y)>r.t&&Math.min(a.y,b.y)<r.b);
    // Restrict the grid to the endpoints and nearby obstacles; outside rectangles
    // cannot intersect a segment inside this region. Expand if a boundary blocks it.
    for(const margin of [100,400,1600,Infinity]){
      const left=Math.min(from.x,to.x)-margin,right=Math.max(from.x,to.x)+margin,top=Math.min(from.y,to.y)-margin,bottom=Math.max(from.y,to.y)+margin;
      const nearby=rects.filter(r=>r.r>=left&&r.l<=right&&r.b>=top&&r.t<=bottom);
      const lanes=reserved.filter(s=>Math.max(s.a.x,s.b.x)>=left&&Math.min(s.a.x,s.b.x)<=right&&Math.max(s.a.y,s.b.y)>=top&&Math.min(s.a.y,s.b.y)<=bottom);
      const turns=lanes.slice(1).flatMap((s,i)=>{const prior=lanes[i];return prior.b.x===s.a.x&&prior.b.y===s.a.y&&(prior.a.x===prior.b.x)!==(s.a.x===s.b.x)?[s.a]:[];});
      const xs=[...new Set([from.x,to.x,from.x+16,to.x-16,...nearby.flatMap(r=>[r.l,r.r]),...lanes.filter(s=>s.a.x===s.b.x).flatMap(s=>[s.a.x-16,s.a.x+16]),...turns.flatMap(p=>[p.x-28,p.x+28])])].sort((a,b)=>a-b),ys=[...new Set([from.y,to.y,...nearby.flatMap(r=>[r.t,r.b]),...lanes.filter(s=>s.a.y===s.b.y).flatMap(s=>[s.a.y-16,s.a.y+16]),...turns.flatMap(p=>[p.y-28,p.y+28])])].sort((a,b)=>a-b),nx=xs.length;
      const sx=xs.indexOf(from.x),sy=ys.indexOf(from.y),tx=xs.indexOf(to.x),ty=ys.indexOf(to.y),start=(sy*nx+sx)*4;
      const distances=new Map([[start,0]]),previous=new Map(),heap=[];
      function push(item){let i=heap.length;heap.push(item);while(i){const parent=(i-1)>>1;if(heap[parent].f<=item.f)break;heap[i]=heap[parent];i=parent;}heap[i]=item;}
      function pop(){const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1].f<heap[c].f)c++;if(heap[c].f>=last.f)break;heap[i]=heap[c];i=c;}heap[i]=last;}return first;}
      push({key:start,g:0,f:Math.abs(to.x-from.x)+Math.abs(to.y-from.y)});let finish;
      while(heap.length){
        const current=pop();if(current.g!==distances.get(current.key))continue;
        const cell=Math.floor(current.key/4),x=cell%nx,y=Math.floor(cell/nx),direction=current.key%4;
        if(x===tx&&y===ty){finish=current.key;break;}
        for(const [dir,[dx,dy]] of [[1,0],[0,1],[0,-1],[-1,0]].entries()){
          if(dir===[3,2,1,0][direction])continue;
          const xx=x+dx,yy=y+dy;if(xx<0||xx>=nx||yy<0||yy>=ys.length)continue;
          if(current.key===start&&(dx!==1||dy!==0))continue;
          if(xx===tx&&yy===ty&&dx!==1)continue;
          const a={x:xs[x],y:ys[y]},b={x:xs[xx],y:ys[yy]};if(!clear(a,b))continue;
          let congestion=0;
          for(const s of lanes){const horizontal=a.y===b.y;if(horizontal!==(s.a.y===s.b.y))continue;
            const distance=horizontal?Math.abs(a.y-s.a.y):Math.abs(a.x-s.a.x);if(distance>=16)continue;
            const overlap=horizontal?Math.min(Math.max(a.x,b.x),Math.max(s.a.x,s.b.x))-Math.max(Math.min(a.x,b.x),Math.min(s.a.x,s.b.x)):Math.min(Math.max(a.y,b.y),Math.max(s.a.y,s.b.y))-Math.max(Math.min(a.y,b.y),Math.min(s.a.y,s.b.y));
            const nearTerminal=[from,to].some(p=>Math.min(Math.abs(a.x-p.x)+Math.abs(a.y-p.y),Math.abs(b.x-p.x)+Math.abs(b.y-p.y))<48);
            if(!nearTerminal)congestion+=Math.max(0,overlap)*.08*(1-distance/16);
          }
          for(const turn of turns){if([from,to].some(p=>Math.abs(p.x-turn.x)+Math.abs(p.y-turn.y)<48))continue;
            const horizontal=a.y===b.y,distance=horizontal?Math.abs(a.y-turn.y):Math.abs(a.x-turn.x),passes=horizontal?turn.x>=Math.min(a.x,b.x)&&turn.x<=Math.max(a.x,b.x):turn.y>=Math.min(a.y,b.y)&&turn.y<=Math.max(a.y,b.y);
            if(passes&&distance<24)congestion+=Math.min(12,Math.abs(a.x-b.x)+Math.abs(a.y-b.y))*(1-distance/24);
          }
          const key=(yy*nx+xx)*4+dir,g=current.g+Math.abs(a.x-b.x)+Math.abs(a.y-b.y)+congestion+(dir!==direction?6:0);
          if(g>=(distances.get(key)??Infinity))continue;distances.set(key,g);previous.set(key,current.key);push({key,g,f:g+Math.abs(to.x-b.x)+Math.abs(to.y-b.y)});
        }
      }
      if(finish!==undefined){const points=[];for(let key=finish;key!==undefined;key=previous.get(key)){const cell=Math.floor(key/4);points.push({x:xs[cell%nx],y:ys[Math.floor(cell/nx)]});}points.reverse();return points.filter((p,i)=>!i||i===points.length-1||!((points[i-1].x===p.x&&p.x===points[i+1].x)||(points[i-1].y===p.y&&p.y===points[i+1].y)));}
    }
    return [from,to]; // Overlapping nodes can leave their own ports obstructed.
  }
  function connectionRoute(from,to,obstacles=[],reserved=[]){
    // Reserve short, straight approaches at each port. Multiple connections may
    // share these stubs instead of detouring around each other's arrowheads.
    const clear=(a,b)=>!obstacles.some(p=>a.y>p.y-10&&a.y<p.y+p.height+10&&Math.max(a.x,b.x)>p.x-10&&Math.min(a.x,b.x)<p.x+p.width+10);
    const gap=to.x-from.x,exit=gap>0?Math.min(32,gap/4):32,entry=gap>0?Math.min(40,gap/4):40;
    const start=[exit,exit/2,0].map(n=>({x:from.x+n,y:from.y})).find(p=>clear(from,p))||from;
    const end=[entry,entry/2,0].map(n=>({x:to.x-n,y:to.y})).find(p=>clear(p,to))||to;
    const route=findConnectionRoute(start,end,obstacles,reserved),points=[from,...route,to].filter((p,i,all)=>!i||p.x!==all[i-1].x||p.y!==all[i-1].y);
    return points.filter((p,i)=>!i||i===points.length-1||!((points[i-1].x===p.x&&p.x===points[i+1].x&&(p.y-points[i-1].y)*(points[i+1].y-p.y)>=0)||(points[i-1].y===p.y&&p.y===points[i+1].y&&(p.x-points[i-1].x)*(points[i+1].x-p.x)>=0)));
  }
  function roundedPath(points){
    const from=points[0],to=points[points.length-1];let d=`M ${from.x} ${from.y}`;
    for(let i=1;i<points.length-1;i++){
      const a=points[i-1],b=points[i],c=points[i+1],ab=Math.hypot(b.x-a.x,b.y-a.y),bc=Math.hypot(c.x-b.x,c.y-b.y),r=Math.min(8,ab/2,bc/2);
      d+=` L ${b.x+(a.x-b.x)*r/ab} ${b.y+(a.y-b.y)*r/ab} Q ${b.x} ${b.y} ${b.x+(c.x-b.x)*r/bc} ${b.y+(c.y-b.y)*r/bc}`;
    }
    return d+` L ${to.x} ${to.y}`;
  }
  function connectionPath(from,to,lane=0,obstacles=[],reserved=[]){return roundedPath(connectionRoute(from,to,obstacles,reserved));}
  function crossingBridges(routes){
    const crossings=[];
    for(let i=0;i<routes.length;i++)for(let j=i+1;j<routes.length;j++){
      for(let a=1;a<routes[i].length;a++)for(let b=1;b<routes[j].length;b++){
        const aa=routes[i][a-1],ab=routes[i][a],ba=routes[j][b-1],bb=routes[j][b],ah=aa.y===ab.y,bh=ba.y===bb.y;
        if(ah===bh||(!ah&&aa.x!==ab.x)||(!bh&&ba.x!==bb.x))continue;
        const h1=ah?aa:ba,h2=ah?ab:bb,v1=ah?ba:aa,v2=ah?bb:ab,x=v1.x,y=h1.y;
        // Endpoints and rounded corners are not crossings; shared handles must
        // remain joined. The horizontal line consistently bridges the vertical.
        if(x<=Math.min(h1.x,h2.x)+10||x>=Math.max(h1.x,h2.x)-10||y<=Math.min(v1.y,v2.y)+10||y>=Math.max(v1.y,v2.y)-10)continue;
        crossings.push({route:ah?i:j,segment:ah?a:b,x1:x-8,x2:x+8,y});
      }
    }
    crossings.sort((a,b)=>a.route-b.route||a.segment-b.segment||a.x1-b.x1);const merged=[];
    for(const crossing of crossings){const last=merged[merged.length-1];if(last&&last.route===crossing.route&&last.segment===crossing.segment&&crossing.x1<=last.x2+4)last.x2=Math.max(last.x2,crossing.x2);else merged.push({...crossing});}
    return merged;
  }
  const api={validId,normalize,connectionError,arrange,unitColors,connectionRoute,connectionPath,roundedPath,crossingBridges};root.StudyKnowledgeGraphCore=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

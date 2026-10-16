'use strict';
function validateGraph(value){
  const fail=()=>{throw {statusCode:400,message:'Invalid knowledge graph'};};
  const id=s=>typeof s==='string'&&/^[A-Za-z0-9._-]{1,180}$/.test(s)&&!['__proto__','prototype','constructor'].includes(s);
  if(!value||value.v!==1||typeof value.enabled!=='boolean'||!value.positions||typeof value.positions!=='object'||Array.isArray(value.positions)||!Array.isArray(value.edges)||value.edges.length>10000||Object.keys(value.positions).length>3000||!Number.isFinite(value.updatedAt)||JSON.stringify(value).length>2000000)fail();
  for(const [key,p] of Object.entries(value.positions))if(!id(key)||!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>100000||Math.abs(p.y)>100000)fail();
  if(value.nodes!==undefined&&(!Array.isArray(value.nodes)||value.nodes.length>3000||value.nodes.some(n=>!id(n))||new Set(value.nodes).size!==value.nodes.length))fail();
  const links=new Map(),seen=new Set();for(const e of value.edges){
    if(!e||!id(e.from)||!id(e.to)||e.from===e.to||seen.has(e.from+'|'+e.to))fail();seen.add(e.from+'|'+e.to);
    if(!links.has(e.from))links.set(e.from,[]);links.get(e.from).push(e.to);
  }
  const degree=new Map();for(const [from,targets] of links){if(!degree.has(from))degree.set(from,0);for(const to of targets)degree.set(to,(degree.get(to)||0)+1);}
  const queue=[...degree].filter(([,n])=>n===0).map(([key])=>key);let visited=0;
  for(let i=0;i<queue.length;i++){visited++;for(const to of links.get(queue[i])||[]){degree.set(to,degree.get(to)-1);if(degree.get(to)===0)queue.push(to);}}
  if(visited!==degree.size)throw {statusCode:400,message:'Knowledge graph connections must not contain cycles'};
  return {v:1,enabled:value.enabled,positions:value.positions,edges:value.edges.map(e=>({from:e.from,to:e.to})),...(value.nodes!==undefined?{nodes:value.nodes}:{}),updatedAt:value.updatedAt};
}
module.exports={validateGraph};

(function(root){
  'use strict';
  const presets={a4portrait:[794,1123],a4landscape:[1123,794],wide:[1600,900],square:[1000,1000]};
  const empty=()=>({v:1,width:794,height:1123,strokes:[]});
  function validate(data){
    const fail=()=>{throw Error('Invalid drawing data or drawing limit exceeded.');};
    if(!data||data.v!==1||(data.pages!==undefined&&(!Array.isArray(data.pages)||data.pages.length>29)))fail();
    let count=0,strokes=0;for(const sheet of [data,...(data.pages||[])]){
      if(!sheet||!Number.isInteger(sheet.width)||!Number.isInteger(sheet.height)||sheet.width<64||sheet.height<64||sheet.width>8192||sheet.height>8192||sheet.width*sheet.height>32000000||!Array.isArray(sheet.strokes))fail();
      strokes+=sheet.strokes.length;if(strokes>10000)fail();
      const bg=sheet.background;if(bg!=null&&(!bg||typeof bg.name!=='string'||bg.name.length>240||!Number.isInteger(bg.width)||!Number.isInteger(bg.height)||bg.width<1||bg.height<1||bg.width>8192||bg.height>8192||typeof bg.src!=='string'||bg.src.length>3000000||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(bg.src)))fail();
      for(const s of sheet.strokes){
        if(!s||!['pen','highlighter'].includes(s.tool)||!/^#[0-9a-f]{6}$/i.test(s.colour)||!Number.isFinite(s.size)||s.size<1||s.size>100||typeof s.simulatePressure!=='boolean'||!Array.isArray(s.points)||!s.points.length)fail();
        count+=s.points.length;if(count>250000)fail();
        for(const p of s.points)if(!Array.isArray(p)||p.length!==3||p.some(n=>!Number.isFinite(n))||p[0]<0||p[1]<0||p[0]>8192||p[1]>8192||p[2]<0||p[2]>1)fail();
      }
    }
    if(JSON.stringify(data).length>8000000)fail();return data;
  }
  function point(event,rect,data,pen){return [Math.max(0,Math.min(data.width,(event.clientX-rect.left)*data.width/rect.width)),Math.max(0,Math.min(data.height,(event.clientY-rect.top)*data.height/rect.height)),pen?Math.max(0,Math.min(1,Number.isFinite(event.pressure)?event.pressure:.5)):.5];}
  function distance(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}
  function hit(stroke,a,b,radius){
    const limit=radius+stroke.size/2,points=stroke.points;
    for(let i=0;i<points.length;i++){if(distance(points[i],a,b)<=limit)return true;if(i){const c=points[i-1],d=points[i];
      if(distance(a,c,d)<=limit||distance(b,c,d)<=limit)return true;
      const cross=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
      if(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)return true;
    }}return false;
  }
  const api={empty,presets,validate,point,hit};root.StudyDrawingCore=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

'use strict';
function validateDrawing(data){
  const fail=()=>{throw {statusCode:400,message:'Invalid drawing data or drawing limit exceeded'};};
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
module.exports={validateDrawing};

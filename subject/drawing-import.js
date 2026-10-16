// Local conversion only. Never inserts uploaded document HTML into the page.
(function(root){
  'use strict';
  const base=new URL('../',document.currentScript?.src||location.href),loading=new Map();
  function library(path,name){if(root[name])return Promise.resolve(root[name]);if(!loading.has(name))loading.set(name,new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL(path,base).href;script.onload=()=>resolve(root[name]);script.onerror=()=>{loading.delete(name);script.remove();reject(Error('Could not load the local document reader.'));};document.head.append(script);}));return loading.get(name);}
  function loadImage(src){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('Could not read this image.'));img.src=src;});}
  const dataURL=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Could not read this file.'));reader.readAsDataURL(file);});
  function canvas(width,height){const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);return c;}
  function sheet(c,name){return {width:Math.max(64,c.width),height:Math.max(64,c.height),strokes:[],background:{name:name.slice(0,240),width:c.width,height:c.height,src:c.toDataURL('image/jpeg',.88)}};}
  async function pdfPages(file){
    const pdfjs=await library('vendor/pdfjs/pdf.min.js','pdfjsLib');pdfjs.GlobalWorkerOptions.workerSrc=new URL('vendor/pdfjs/pdf.worker.min.js',base).href;
    const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false}),pages=[];let pdf;
    try{pdf=await task.promise;if(pdf.numPages>30)throw Error('Choose a PDF with no more than 30 pages.');
      for(let n=1;n<=pdf.numPages;n++){const page=await pdf.getPage(n),original=page.getViewport({scale:1}),scale=Math.min(2,1600/Math.max(original.width,original.height)),view=page.getViewport({scale}),c=canvas(Math.ceil(view.width),Math.ceil(view.height));await page.render({canvasContext:c.getContext('2d'),viewport:view}).promise;pages.push(sheet(c,file.name+' · '+n));page.cleanup();if(JSON.stringify(pages).length>7500000)throw Error('Converted pages are too large. Upload a smaller PDF.');}
      return {pages};
    }finally{if(pdf)await pdf.destroy();else await task.destroy();}
  }
  async function wordPages(file){
    const mammoth=await library('vendor/mammoth/mammoth.browser.min.js','mammoth'),result=await mammoth.convertToHtml({arrayBuffer:await file.arrayBuffer()},{convertImage:mammoth.images.imgElement(async image=>({src:'data:'+image.contentType+';base64,'+await image.read('base64')}))}),doc=new DOMParser().parseFromString(result.value,'text/html'),pages=[];
    let c,ctx,y;
    function next(){if(pages.length>=30)throw Error('Choose a Word document with no more than 30 converted pages.');c=canvas(794,1123);ctx=c.getContext('2d');y=48;pages.push(c);}
    function wrap(text,width,size=16){ctx.font=size+'px sans-serif';const lines=[];let line='';for(const word of text.replace(/\s+/g,' ').trim().split(' ')){if(ctx.measureText((line?line+' ':'')+word).width>width&&line){lines.push(line);line=word;}else line+=(line?' ':'')+word;}if(line)lines.push(line);return lines;}
    function text(value,size=16){for(const line of wrap(value,698,size)){if(y+size*1.5>1075)next();ctx.font=size+'px sans-serif';ctx.fillStyle='#1c1917';ctx.fillText(line,48,y+size);y+=size*1.5;}y+=8;}
    async function image(node){const src=node.getAttribute('src')||'';if(!/^data:image\/(png|jpeg|webp|gif|bmp);base64,/i.test(src))return;const img=await loadImage(src),scale=Math.min(1,698/img.width,700/img.height),w=Math.round(img.width*scale),h=Math.round(img.height*scale);if(y+h>1075)next();ctx.drawImage(img,48,y,w,h);y+=h+12;}
    async function walk(node){
      if(node.nodeType===3){if(node.textContent.trim())text(node.textContent);return;}if(node.nodeType!==1)return;const tag=node.tagName.toLowerCase();
      if(['script','style','iframe','object','link'].includes(tag))return;
      if(tag==='img'){await image(node);return;}
      if(tag==='table'){
        const rows=[...node.querySelectorAll('tr')],columns=Math.max(1,...rows.map(row=>row.children.length)),width=698/columns;
        for(const row of rows){const cells=[...row.children].map(cell=>wrap(cell.textContent,width-12,14)),height=Math.max(30,...cells.map(lines=>lines.length*20+12));if(y+height>1075)next();cells.forEach((lines,index)=>{ctx.strokeStyle='#b8b8b8';ctx.strokeRect(48+index*width,y,width,height);ctx.font='14px sans-serif';ctx.fillStyle='#1c1917';lines.forEach((line,i)=>ctx.fillText(line,54+index*width,y+22+i*20));});y+=height;}y+=12;return;
      }
      if(/^(h[1-6]|p|li|blockquote|pre)$/.test(tag)){const copy=node.cloneNode(true);copy.querySelectorAll('img').forEach(img=>img.remove());text((tag==='li'?'• ':'')+copy.textContent,/^h[1-6]$/.test(tag)?24:16);for(const img of node.querySelectorAll('img'))await image(img);return;}
      for(const child of node.childNodes)await walk(child);
    }
    next();for(const child of doc.body.childNodes)await walk(child);const converted=pages.map((c,i)=>sheet(c,file.name+' · '+(i+1)));if(JSON.stringify(converted).length>7500000)throw Error('Converted pages are too large. Upload a smaller Word document.');return {pages:converted,notice:'Word uses a simplified text, table and image layout. Upload a PDF to preserve exact formatting.'};
  }
  async function read(file){
    if(!file||file.size>20*1024*1024)throw Error('Choose a file smaller than 20 MB.');
    if(/\.doc$/i.test(file.name))throw Error('Older .doc files must be saved as .docx or PDF before uploading.');
    if(/\.pdf$/i.test(file.name)||file.type==='application/pdf')return pdfPages(file);
    if(/\.docx$/i.test(file.name)||file.type==='application/vnd.openxmlformats-officedocument.wordprocessingml.document')return wordPages(file);
    if(!/^image\/(png|jpe?g|webp|gif|bmp)$/i.test(file.type)&&!/\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name))throw Error('Choose a PDF, Word .docx, PNG, JPG, WebP, GIF or BMP file.');
    const img=await loadImage(await dataURL(file));if(img.width*img.height>64000000)throw Error('This image is too large. Choose a smaller image.');const scale=Math.min(1,2400/Math.max(img.width,img.height)),c=canvas(Math.max(1,Math.round(img.width*scale)),Math.max(1,Math.round(img.height*scale)));c.getContext('2d').drawImage(img,0,0,c.width,c.height);return {pages:[sheet(c,file.name)]};
  }
  root.StudyDrawingImport={read};
})(window);

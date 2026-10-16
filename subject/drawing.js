(function(root){
  'use strict';
  const core=StudyDrawingCore,clone=value=>JSON.parse(JSON.stringify(value));
  function create(container,{data,readOnly=false,onChange=()=>{},onAutosave,draftKey,updatedAt=0,name='drawing',autosaveDelay=700}={}){
    let drawing=clone(core.validate(data||core.empty())),active=null,tool='pen',colour='#1c1917',size=8,penOnly=false,undo=[],redo=[],timer,frame,disposed=false,revision=0,recoveryPending=false,importing=false,activePage=0,saveChain=Promise.resolve();
    container.innerHTML='<div class="drawing-toolbar"></div><div class="drawing-paper"><div class="drawing-stack"><canvas class="drawing-background" aria-hidden="true"></canvas><canvas class="drawing-ink" aria-label="Drawing canvas"></canvas></div></div><p class="drawing-status" role="status"></p>';
    const toolbar=container.querySelector('.drawing-toolbar'),canvas=container.querySelector('.drawing-ink'),backgroundCanvas=container.querySelector('.drawing-background'),stack=container.querySelector('.drawing-stack'),paper=container.querySelector('.drawing-paper'),status=container.querySelector('.drawing-status'),ctx=canvas.getContext('2d'),backgroundContext=backgroundCanvas.getContext('2d'),paths=new WeakMap();
    if(!ctx||!backgroundContext||typeof Path2D!=='function'||!root.PerfectFreehand)throw Error('Drawing requires canvas and Path2D support in your browser.');
    const controls={},button=(label,action)=>{const node=document.createElement('button');node.type='button';node.className='qol-button';node.textContent=label;node.onclick=action;toolbar.append(node);return node;};
    const images=new Map(),page=()=>activePage?(drawing.pages||[])[Math.min(activePage-1,(drawing.pages||[]).length-1)]||drawing:drawing;
    function background(src){if(!images.has(src)){const img=new Image(),promise=new Promise((resolve,reject)=>{img.onload=()=>{scheduleRender();resolve(img);};img.onerror=()=>reject(Error('Could not load the background image.'));});images.set(src,{img,promise});img.src=src;promise.catch(()=>message('Could not load this page background.'));}return images.get(src);}
    function message(text){status.textContent=text;}
    function path(stroke,last=true){
      if(last&&paths.has(stroke))return paths.get(stroke);
      const outline=PerfectFreehand.getStroke(stroke.points,{size:stroke.size,simulatePressure:stroke.simulatePressure,thinning:stroke.tool==='highlighter'?0:.6,smoothing:.5,streamline:.5,last});
      const p=new Path2D();if(outline.length){p.moveTo(...outline[0]);for(const point of outline.slice(1))p.lineTo(...point);p.closePath();}if(last)paths.set(stroke,p);return p;
    }
    function paint(target,scaleX,scaleY,includeActive=false,sheet=page(),layer='all'){
      target.setTransform(scaleX,0,0,scaleY,0,0);target.clearRect(0,0,sheet.width,sheet.height);
      if(layer!=='ink'){target.fillStyle='#ffffff';target.fillRect(0,0,sheet.width,sheet.height);if(sheet.background){const image=background(sheet.background.src).img;if(image.complete&&image.naturalWidth)target.drawImage(image,0,0,sheet.background.width,sheet.background.height);}}
      if(layer==='background')return;
      for(const stroke of [...sheet.strokes,...(includeActive&&active?.stroke?[active.stroke]:[])]){target.fillStyle=stroke.colour;target.globalAlpha=stroke.tool==='highlighter'?.3:1;target.fill(path(stroke,stroke!==active?.stroke));}target.globalAlpha=1;
    }
    function render(){if(disposed)return;activePage=Math.min(activePage,drawing.pages?.length||0);stack.style.aspectRatio=page().width+'/'+page().height;paper.style.setProperty('--drawing-ratio',String(page().width/page().height));
      const width=canvas.getBoundingClientRect().width||Math.min(800,page().width),height=width*page().height/page().width,dpr=root.devicePixelRatio||1,w=Math.max(1,Math.round(width*dpr)),h=Math.max(1,Math.round(height*dpr));
      for(const surface of [backgroundCanvas,canvas])if(surface.width!==w||surface.height!==h){surface.width=w;surface.height=h;}
      paint(backgroundContext,w/page().width,h/page().height,false,page(),'background');paint(ctx,w/page().width,h/page().height,true,page(),'ink');
      if(!readOnly){controls.undo.disabled=!undo.length||!!active||importing||recoveryPending;controls.redo.disabled=!redo.length||!!active||importing||recoveryPending;for(const key of ['width','height'])if(document.activeElement!==controls[key])controls[key].value=page()[key];}
      if(controls.preset&&document.activeElement!==controls.preset)controls.preset.value=Object.keys(core.presets).find(key=>core.presets[key][0]===page().width&&core.presets[key][1]===page().height)||'custom';
      const select=controls.page;if(select){select.hidden=!drawing.pages?.length;select.disabled=!!active||importing;select.replaceChildren();for(const [index,sheet] of [drawing,...(drawing.pages||[])].entries()){const option=document.createElement('option');option.value=index;option.textContent='Page '+(index+1)+(sheet.background?.name?' · '+sheet.background.name:'');select.append(option);}select.value=activePage;}
      if(controls.background){controls.background.textContent=page().background?'Remove background':'Upload background';controls.background.disabled=!!active||importing||recoveryPending;}
    }
    function scheduleRender(){if(frame)return;frame=requestAnimationFrame(()=>{frame=null;render();});}
    function remember(before){undo.push(before);if(undo.length>30)undo.shift();redo=[];}
    function cache(){if(!draftKey)return true;try{localStorage.setItem(draftKey,JSON.stringify({timestamp:Date.now(),data:drawing}));return true;}catch{return false;}}
    function flush(){clearTimeout(timer);timer=null;if(readOnly||!onAutosave)return Promise.resolve();const value=clone(drawing),version=revision;
      saveChain=saveChain.catch(()=>{}).then(()=>onAutosave(value)).then(result=>{if(result?.synced&&revision===version){try{const recovery=JSON.parse(localStorage.getItem(draftKey)||'null');if(recovery&&JSON.stringify(recovery.data)===JSON.stringify(value))localStorage.removeItem(draftKey);}catch{}}if(disposed||revision!==version)return;if(result?.synced)message('Drawing autosaved.');else message('Drawing saved on this device. Sync pending or save the new topic.');}).catch(()=>{if(!disposed)message('Drawing saved on this device. Sync pending.');});return saveChain;
    }
    function changed(){revision++;const cached=cache();onChange(clone(drawing));message(cached?'Drawing saved on this device.':'Local recovery storage is full. Save the topic now and keep this page open until sync completes.');clearTimeout(timer);timer=setTimeout(flush,autosaveDelay);render();}
    function commit(before){try{core.validate(drawing);remember(before);changed();return true;}catch(error){drawing=before;message(error.message);render();return false;}}
    function finish(event,cancelled=false){
      if(!active||event.pointerId!==active.id)return;const gesture=active;active=null;
      if(cancelled)drawing=gesture.before;
      else{if(gesture.stroke)page().strokes.push(gesture.stroke);if(gesture.stroke||gesture.erased)commit(gesture.before);}
      if(canvas.hasPointerCapture?.(event.pointerId))canvas.releasePointerCapture(event.pointerId);render();
    }
    function addSamples(event){
      const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;
      let samples;try{samples=event.getCoalescedEvents?.();}catch{}if(!samples?.length)samples=[event];else samples=[...samples,event];
      for(const sample of samples){const p=core.point(sample,rect,page(),active.pen);
        if(active.stroke){const prior=active.stroke.points.at(-1);if(!prior||prior.some((n,i)=>n!==p[i]))active.stroke.points.push(p);}
        else{const previous=active.last||p,before=page().strokes.length;page().strokes=page().strokes.filter(s=>!core.hit(s,previous,p,size/2));active.erased ||=before!==page().strokes.length;active.last=p;}
      }scheduleRender();
    }
    async function download(){
      try{const sheet=clone(page()),pageNumber=activePage+1;if(sheet.background)await background(sheet.background.src).promise;const output=document.createElement('canvas');output.width=sheet.width;output.height=sheet.height;paint(output.getContext('2d'),1,1,false,sheet);output.toBlob(blob=>{if(!blob){message('PNG export failed.');return;}const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=(name.replace(/[^a-z0-9 _-]/gi,'').trim()||'drawing')+(drawing.pages?.length?'-page-'+pageNumber:'')+'.png';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},'image/png');}catch{message('Could not export this canvas as PNG.');}
    }
    controls.page=document.createElement('select');controls.page.setAttribute('aria-label','Drawing page');controls.page.onchange=()=>{if(active||importing)return;activePage=Number(controls.page.value);render();message('Page '+(activePage+1)+' · '+page().width+' × '+page().height+' px');};toolbar.append(controls.page);
    if(!readOnly){
      const upload=document.createElement('input');upload.type='file';upload.accept='.pdf,.docx,.doc,.png,.jpg,.jpeg,.webp,.gif,.bmp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg,image/webp,image/gif,image/bmp';upload.hidden=true;toolbar.append(upload);
      const uploadButton=controls.background=button('Upload background',()=>{if(active||recoveryPending||importing)return;if(page().background){const before=clone(drawing);delete page().background;commit(before);}else upload.click();});
      upload.onchange=async()=>{const file=upload.files?.[0];upload.value='';if(!file||active||recoveryPending||importing)return;importing=true;uploadButton.disabled=true;message('Opening '+file.name+'…');
        try{const result=await StudyDrawingImport.read(file);if(disposed)return;if(!result.pages?.length)throw Error('This file has no pages.');
          const before=clone(drawing),strokes=clone(page().strokes);
          if(result.pages.length>1){if(drawing.pages?.length&&!root.confirm('Replace existing background pages? Later-page annotations will be removed. Current-page strokes will be kept. You can undo this.'))return;drawing={v:1,...result.pages[0],strokes,pages:result.pages.slice(1)};activePage=0;}
          else Object.assign(page(),result.pages[0],{strokes});
          if(commit(before)&&result.notice)message(result.notice);
        }catch(error){message(error.message||'Could not open this file.');}finally{importing=false;uploadButton.disabled=false;if(!disposed)render();}
      };
      for(const value of ['pen','highlighter','eraser']){const node=button(value[0].toUpperCase()+value.slice(1),()=>{tool=value;for(const [key,item] of Object.entries(controls.tools))item.setAttribute('aria-pressed',String(key===tool));});(controls.tools||={})[value]=node;node.setAttribute('aria-pressed',String(value===tool));}
      const label=(text,input)=>{const node=document.createElement('label');node.textContent=text+' ';node.append(input);toolbar.append(node);return input;};
      const colorInput=document.createElement('input');colorInput.type='color';colorInput.value=colour;label('Colour',colorInput);colorInput.oninput=()=>colour=colorInput.value;
      const sizeInput=document.createElement('input');sizeInput.type='range';sizeInput.min=1;sizeInput.max=100;sizeInput.step='any';sizeInput.value=size;label('Size',sizeInput);
      const precise=document.createElement('input');precise.type='number';precise.min=1;precise.max=100;precise.step='any';precise.value=size;precise.className='drawing-brush-size';precise.setAttribute('aria-label','Brush size in pixels');precise.inputMode='decimal';label('',precise).append(document.createTextNode(' px'));
      sizeInput.oninput=()=>{size=Number(sizeInput.value);precise.value=size;precise.setAttribute('aria-invalid','false');};
      precise.oninput=()=>{const value=Number(precise.value),valid=precise.value!==''&&Number.isFinite(value)&&value>=1&&value<=100;precise.setAttribute('aria-invalid',String(!valid));if(valid){size=value;sizeInput.value=value;}};
      precise.onblur=()=>{precise.value=size;precise.setAttribute('aria-invalid','false');};
      controls.undo=button('Undo',()=>{if(active||importing||recoveryPending||!undo.length)return;redo.push(clone(drawing));drawing=undo.pop();changed();});controls.redo=button('Redo',()=>{if(active||importing||recoveryPending||!redo.length)return;undo.push(clone(drawing));drawing=redo.pop();changed();});
      const penInput=document.createElement('input');penInput.type='checkbox';label('Pen only',penInput);penInput.onchange=()=>penOnly=penInput.checked;
      const dimensions=document.createElement('div');dimensions.className='drawing-dimensions';toolbar.after(dimensions);
      dimensions.title='Resizing preserves stroke positions and thickness. Smaller bounds clip overflow without deleting it.';
      dimensions.innerHTML='<label>Canvas <select aria-label="Canvas preset"><option value="a4portrait">A4 portrait · 794 × 1123</option><option value="a4landscape">A4 landscape · 1123 × 794</option><option value="wide">16:9 · 1600 × 900</option><option value="square">Square · 1000 × 1000</option><option value="custom">Custom</option></select></label><label>Width <input type="number" min="64" max="8192" required aria-label="Canvas width"></label><span>×</span><label>Height <input type="number" min="64" max="8192" required aria-label="Canvas height"></label>';
      const preset=dimensions.querySelector('select');controls.width=dimensions.querySelectorAll('input')[0];controls.height=dimensions.querySelectorAll('input')[1];
      controls.preset=preset;
      preset.value=Object.keys(core.presets).find(key=>core.presets[key][0]===page().width&&core.presets[key][1]===page().height)||'custom';
      function applyDimensions(){
        if(active||recoveryPending||importing)return;const width=Number(controls.width.value),height=Number(controls.height.value),valid=Number.isInteger(width)&&Number.isInteger(height)&&width>=64&&height>=64&&width<=8192&&height<=8192&&width*height<=32000000;
        for(const input of [controls.width,controls.height])input.setAttribute('aria-invalid',String(!valid));
        if(!valid){message('Enter dimensions from 64–8192 px, up to 32 million pixels.');return;}
        if(width===page().width&&height===page().height){message('Canvas '+width+' × '+height+' px.');return;}const before=clone(drawing);page().width=width;page().height=height;commit(before);
      }
      preset.onchange=()=>{if(core.presets[preset.value]){[controls.width.value,controls.height.value]=core.presets[preset.value];applyDimensions();}};
      controls.width.oninput=controls.height.oninput=()=>{preset.value='custom';applyDimensions();};
      canvas.addEventListener('pointerdown',event=>{if(active||recoveryPending||importing||event.button!==0||(penOnly&&event.pointerType!=='pen'))return;event.preventDefault();event.stopPropagation();
        active={id:event.pointerId,pen:event.pointerType==='pen',before:clone(drawing),stroke:tool==='eraser'?null:{tool,colour,size,simulatePressure:event.pointerType!=='pen',points:[]}};canvas.setPointerCapture?.(event.pointerId);addSamples(event);
      });
      canvas.addEventListener('pointermove',event=>{if(active?.id!==event.pointerId)return;event.preventDefault();event.stopPropagation();addSamples(event);});
      canvas.addEventListener('pointerup',event=>{if(active?.id===event.pointerId)addSamples(event);finish(event);});canvas.addEventListener('pointercancel',event=>finish(event,true));canvas.addEventListener('lostpointercapture',event=>finish(event,true));
      if(draftKey)try{const recovered=JSON.parse(localStorage.getItem(draftKey)||'null');if(recovered){core.validate(recovered.data);
        if(JSON.stringify(recovered.data)===JSON.stringify(drawing))localStorage.removeItem(draftKey);
        else if(recovered.timestamp>new Date(updatedAt||0).getTime()){drawing=clone(recovered.data);message('Recovered a locally saved drawing.');onChange(clone(drawing));timer=setTimeout(flush,autosaveDelay);}
        else{recoveryPending=true;message('A different local recovery drawing exists. Choose which drawing to keep before editing.');
          const clearChoice=()=>{recoveryPending=false;recover.remove();keep.remove();};
          const recover=button('Recover local drawing',()=>{const before=clone(drawing);drawing=clone(recovered.data);clearChoice();commit(before);}),keep=button('Use synced drawing',()=>{localStorage.removeItem(draftKey);clearChoice();message('Keeping the synced drawing.');});
        }
      }}catch{message('A local recovery file could not be read; it has been preserved.');}
    }
    if(readOnly){button('Export PNG',download);message(page().width+' × '+page().height+' px');}
    const resize=typeof ResizeObserver==='function'?new ResizeObserver(scheduleRender):null;resize?.observe(paper);root.addEventListener('resize',scheduleRender);
    const onHide=()=>{if(active)finish({pointerId:active.id});if(!readOnly)flush();};root.addEventListener('pagehide',onHide);
    render();
    return {getState(){if(active?.stroke){const state=clone(drawing),sheet=activePage?state.pages[activePage-1]:state;sheet.strokes.push(clone(active.stroke));return state;}return clone(drawing);},flush,clearRecovery(){try{localStorage.removeItem(draftKey);}catch{}},destroy(){if(active)finish({pointerId:active.id});if(timer)flush();disposed=true;clearTimeout(timer);if(frame)cancelAnimationFrame(frame);resize?.disconnect();root.removeEventListener('resize',scheduleRender);root.removeEventListener('pagehide',onHide);container.replaceChildren();}};
  }
  root.StudyDrawing={create};
})(window);

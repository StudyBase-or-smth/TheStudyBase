// Shared image transforms and crop frame, with pointer and keyboard handles.
(function (root) {
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));
  function geometry(iw,ih,width,height,state={}) {
    const angle=(Number(state.rotation)||0)*Math.PI/180;
    const sx=clamp(state.stretchX??1,.5,2),sy=clamp(state.stretchY??1,.5,2);
    const scale=Math.max(width/iw,height/ih)*clamp(state.zoom??1,.1,4);
    const drawW=iw*sx*scale,drawH=ih*sy*scale,maxX=width*2,maxY=height*2;
    return {angle,drawW,drawH,maxX,maxY,x:clamp(state.x,-4,4)*width/2,y:clamp(state.y,-4,4)*height/2};
  }
  const handles={nw:[-1,-1],n:[0,-1],ne:[1,-1],e:[1,0],se:[1,1],s:[0,1],sw:[-1,1],w:[-1,0]};
  const rotate=(x,y,angle)=>({x:x*Math.cos(angle)-y*Math.sin(angle),y:x*Math.sin(angle)+y*Math.cos(angle)});
  function resizeBox(box,handle,point,{lockAspect=false,minFactor=.05,maxFactor=20}={}) {
    const [hx,hy]=handles[handle],p=rotate(point.x-box.x,point.y-box.y,-box.angle),ax=-hx*box.width/2,ay=-hy*box.height/2;
    let fx=hx?(hx*(p.x-ax))/box.width:1,fy=hy?(hy*(p.y-ay))/box.height:1;
    if(lockAspect){const factor=hx&&hy?((p.x-ax)*hx*box.width+(p.y-ay)*hy*box.height)/(box.width**2+box.height**2):hx?fx:fy;fx=fy=clamp(factor,minFactor,maxFactor);}
    else{if(hx)fx=clamp(fx,minFactor,maxFactor);if(hy)fy=clamp(fy,minFactor,maxFactor);}
    const width=box.width*fx,height=box.height*fy,offset=rotate(ax+hx*width/2,ay+hy*height/2,box.angle);
    return {x:box.x+offset.x,y:box.y+offset.y,width,height,angle:box.angle,fx,fy};
  }
  function open(source,options={}) {
    return new Promise(resolve=>{
      const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node;};
      const previous=document.activeElement,dialog=el('dialog','qol-dialog image-editor-dialog'),heading=el('h2','',options.title||'Adjust image');heading.id='image-editor-title';dialog.setAttribute('aria-labelledby',heading.id);
      const content=el('div','qol-dialog-content'),hint=el('p','qol-muted');
      const viewport=el('div','image-editor-viewport image-editor-stage'),canvas=el('canvas','image-editor-canvas'),preview=el('canvas','image-editor-preview');
      canvas.width=options.width||1200;canvas.height=Math.round(canvas.width/(options.aspect||3));canvas.setAttribute('aria-label','Image crop preview');
      canvas.hidden=true;preview.width=1000;preview.height=600;preview.setAttribute('aria-label','Image transform preview');viewport.append(canvas,preview);
      if(options.tint){preview.style.filter='grayscale(1)';const tint=el('span','image-editor-tint');tint.style.backgroundColor=options.tint;viewport.append(tint);}
      viewport.style.aspectRatio='5 / 3';
      const controls=el('div','image-editor-controls'),status=el('p','qol-muted');status.setAttribute('role','status');status.textContent='Loading image…';
      const actions=el('div','image-editor-actions'),ranges={},defaults={zoom:1,rotation:0,stretchX:1,stretchY:1,x:0,y:0};let state={...defaults},image=null,closed=false,drag=null,mode='scale',view={scale:1,x:0,y:0};
      let crop={x:0,y:0,width:canvas.width,height:canvas.height,angle:0};
      const modeBar=el('div','image-editor-mode');modeBar.setAttribute('role','group');modeBar.setAttribute('aria-label','Handle mode');
      const imageBox=el('div','image-transform-box'),cropBox=el('div','image-crop-box'+(options.circle?' is-avatar':''));
      viewport.append(cropBox,imageBox);
      const finish=value=>{if(closed)return;closed=true;root.removeEventListener('resize',fitView);dialog.close();dialog.remove();if(previous?.isConnected)previous.focus();resolve(value);};
      const button=(text,run,cls='qol-button')=>{const node=el('button',cls,text);node.type='button';node.onclick=run;return node;};
      const modeButtons={};
      for(const value of ['scale','crop']){const toggle=button(value==='scale'?'Scale':'Crop',()=>{mode=value;sync();fitView();});toggle.dataset.imageMode=value;modeButtons[value]=toggle;modeBar.append(toggle);}
      function currentBox(){const g=geometry(image.naturalWidth,image.naturalHeight,canvas.width,canvas.height,state);return {x:g.x,y:g.y,width:g.drawW,height:g.drawH,angle:g.angle};}
      function placeBox(node,box){node.style.left=(50+(box.x-view.x)*view.scale/preview.width*100)+'%';node.style.top=(50+(box.y-view.y)*view.scale/preview.height*100)+'%';node.style.width=box.width*view.scale/preview.width*100+'%';node.style.height=box.height*view.scale/preview.height*100+'%';node.style.transform='translate(-50%,-50%) rotate('+box.angle+'rad)';}
      function fitView(){
        if(!image)return;const box=currentBox(),c=Math.abs(Math.cos(box.angle)),s=Math.abs(Math.sin(box.angle)),w=box.width*c+box.height*s,h=box.height*c+box.width*s;
        const left=Math.min(box.x-w/2,crop.x-crop.width/2),right=Math.max(box.x+w/2,crop.x+crop.width/2),top=Math.min(box.y-h/2,crop.y-crop.height/2),bottom=Math.max(box.y+h/2,crop.y+crop.height/2);
        const padding=Math.max(75,42*preview.width/(viewport.getBoundingClientRect().width||600));
        view={x:(left+right)/2,y:(top+bottom)/2,scale:Math.min(Math.max(100,preview.width-padding*2)/(right-left),Math.max(100,preview.height-padding*2)/(bottom-top))};draw();
      }
      function draw(){
        if(!image||closed)return;
        try { const g=currentBox();
          for(const [surface,cx,cy,scale] of [[canvas,crop.x,crop.y,canvas.width/crop.width],[preview,view.x,view.y,view.scale]]){
            const ctx=surface.getContext('2d');if(!ctx)throw Error('Image editing is unavailable in this browser.');
            ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#fff';ctx.fillRect(0,0,surface.width,surface.height);ctx.save();ctx.translate(surface.width/2,surface.height/2);ctx.scale(scale,scale);ctx.translate(g.x-cx,g.y-cy);ctx.rotate(g.angle);ctx.drawImage(image,-g.width/2,-g.height/2,g.width,g.height);ctx.restore();
          }
          placeBox(imageBox,g);placeBox(cropBox,crop);
        }catch(error){status.textContent=error.message;apply.disabled=true;}
      }
      function sync(){
        for(const [key,input] of Object.entries(ranges)){input.value=state[key];input.nextElementSibling.value=key==='rotation'?Math.round(state[key])+'°':Math.round(state[key]*100)+'%';}
        for(const [value,toggle] of Object.entries(modeButtons))toggle.setAttribute('aria-pressed',String(value===mode));
        viewport.dataset.mode=mode;imageBox.hidden=mode!=='scale';cropBox.classList.toggle('is-active',mode==='crop');cropBox.tabIndex=mode==='crop'?0:-1;
        hint.textContent=mode==='scale'?'Drag corners to scale, side handles to stretch, or the round handle above to rotate.':'Drag the crop box to move it. Drag its handles to crop; the image stays unchanged.';draw();
      }
      function range(key,label,min,max,step,parent=controls){
        const row=el('label','image-editor-range'),name=el('span','',label),input=el('input'),value=el('output');input.type='range';input.min=min;input.max=max;input.step=step;input.value=state[key];input.dataset.imageControl=key;input.setAttribute('aria-label',label);input.oninput=()=>{state[key]=Number(input.value);sync();};ranges[key]=input;row.append(name,input,value);parent.append(row);
      }
      const extra=el('details','image-editor-extra');extra.append(el('summary','','Fine adjustments'));
      range('zoom','Zoom / scale',.1,4,.01,extra);range('rotation','Rotation',-180,180,1,extra);
      range('stretchX','Stretch width',.5,2,.01,extra);range('stretchY','Stretch height',.5,2,.01,extra);range('x','Horizontal position',-4,4,.01,extra);range('y','Vertical position',-4,4,.01,extra);controls.append(extra);
      const rotations=el('div','image-editor-rotations');
      rotations.append(button('Rotate left',()=>{state.rotation=((state.rotation-90+540)%360)-180;sync();fitView();}),button('Rotate right',()=>{state.rotation=((state.rotation+90+540)%360)-180;sync();fitView();}),button('Fit view',fitView),button('Reset',()=>{state={...defaults};crop={x:0,y:0,width:canvas.width,height:canvas.height,angle:0};sync();fitView();}));
      const apply=button('Use image',()=>{
        if(!image)return;status.textContent='';draw();
        try {let quality=.9,result=canvas.toDataURL('image/jpeg',quality);const limit=options.maxLength||900000;
          while(result.length>limit&&quality>.35){quality-=.1;result=canvas.toDataURL('image/jpeg',quality);}if(result.length>limit)throw Error('The edited image is too large. Choose a smaller image.');finish(result);
        }catch(error){status.textContent='Could not export the image. '+error.message;}
      },'qol-button primary');apply.disabled=true;
      actions.append(button('Cancel',()=>finish(null)),apply);content.append(modeBar,hint,viewport,controls,rotations,status,actions);dialog.append(heading,content);document.body.append(dialog);
      dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null);});dialog.addEventListener('close',()=>{if(!closed)finish(null);});
      dialog.addEventListener('keydown',event=>{if(event.key==='Escape')event.stopPropagation();});
      const worldPoint=event=>{const rect=viewport.getBoundingClientRect();return {x:(event.clientX-rect.left-rect.width/2)*preview.width/rect.width/view.scale+view.x,y:(event.clientY-rect.top-rect.height/2)*preview.height/rect.height/view.scale+view.y};};
      function setImageBox(box,snapshot,handle){
        state={...snapshot,x:clamp(box.x*2/canvas.width,-4,4),y:clamp(box.y*2/canvas.height,-4,4)};
        if(handles[handle][0]&&handles[handle][1])state.zoom=clamp(snapshot.zoom*box.fx,.1,4);
        else if(handles[handle][0])state.stretchX=clamp(snapshot.stretchX*box.fx,.5,2);
        else state.stretchY=clamp(snapshot.stretchY*box.fy,.5,2);
      }
      function resize(snapshot,point){
        const handle=snapshot.handle,[hx,hy]=handles[handle],corner=!!(hx&&hy),field=corner?'zoom':hx?'stretchX':'stretchY';
        const min=snapshot.mode==='crop'?.05*canvas.width/snapshot.box.width:(corner?.1:.5)/snapshot.state[field],max=snapshot.mode==='crop'?20*canvas.width/snapshot.box.width:(corner?4:2)/snapshot.state[field];
        const box=resizeBox(snapshot.box,handle,point,{lockAspect:snapshot.mode==='crop'||corner,minFactor:min,maxFactor:max});
        if(snapshot.mode==='crop')crop=box;else setImageBox(box,snapshot.state,handle);
      }
      function attachHandles(boxNode,isCrop){
        boxNode.tabIndex=0;boxNode.setAttribute('role','group');boxNode.setAttribute('aria-label',isCrop?'Crop box. Arrow keys move the crop.':'Transform box. Arrow keys move the image.');
        for(const handle of Object.keys(handles)){
          const grip=button('',()=>{},'image-transform-handle handle-'+handle);grip.dataset.handle=handle;grip.setAttribute('aria-label',(isCrop?'Crop':'Resize')+' '+({nw:'top left',n:'top',ne:'top right',e:'right',se:'bottom right',s:'bottom',sw:'bottom left',w:'left'}[handle]));boxNode.append(grip);
        }
        if(!isCrop){const stem=el('span','image-rotation-stem'),rotateHandle=button('',()=>{},'image-rotation-handle');rotateHandle.dataset.handle='rotate';rotateHandle.setAttribute('aria-label','Rotate image');boxNode.append(stem,rotateHandle);}
        boxNode.onkeydown=event=>{
          if(!image||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
          event.preventDefault();event.stopPropagation();const handle=event.target.dataset.handle,step=(event.shiftKey?20:5)/view.scale,dx=event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,dy=event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0;
          if(handle==='rotate')state.rotation=((state.rotation+(['ArrowLeft','ArrowDown'].includes(event.key)?-1:1)*(event.shiftKey?15:1)+540)%360)-180;
          else if(handle){const box=isCrop?{...crop}:currentBox(),[hx,hy]=handles[handle],offset=rotate(hx*box.width/2,hy*box.height/2,box.angle);resize({mode:isCrop?'crop':'scale',state:{...state},box,handle},{x:box.x+offset.x+dx,y:box.y+offset.y+dy});}
          else if(isCrop){crop.x+=dx;crop.y+=dy;}else{state.x=clamp(state.x+dx*2/canvas.width,-4,4);state.y=clamp(state.y+dy*2/canvas.height,-4,4);}sync();
        };
      }
      attachHandles(imageBox,false);attachHandles(cropBox,true);
      viewport.onpointerdown=event=>{
        if(!image||event.button!==0||!viewport.getBoundingClientRect().width)return;const point=worldPoint(event),handle=event.target.closest('[data-handle]')?.dataset.handle||'move',box=mode==='crop'?{...crop}:currentBox();
        drag={point,state:{...state},crop:{...crop},mode,handle,box,startAngle:Math.atan2(point.y-box.y,point.x-box.x)};viewport.setPointerCapture?.(event.pointerId);event.preventDefault();
      };
      viewport.onpointermove=event=>{
        if(!drag)return;const point=worldPoint(event),dx=point.x-drag.point.x,dy=point.y-drag.point.y;
        if(drag.handle==='rotate'){const delta=(Math.atan2(point.y-drag.box.y,point.x-drag.box.x)-drag.startAngle)*180/Math.PI;state.rotation=((drag.state.rotation+delta+540)%360)-180;}
        else if(drag.handle==='move'){if(drag.mode==='crop')crop={...drag.crop,x:drag.crop.x+dx,y:drag.crop.y+dy};else state={...drag.state,x:clamp(drag.state.x+dx*2/canvas.width,-4,4),y:clamp(drag.state.y+dy*2/canvas.height,-4,4)};}
        else resize(drag,point);sync();
      };
      viewport.onpointerup=event=>{if(!drag)return;drag=null;viewport.releasePointerCapture?.(event.pointerId);fitView();};
      viewport.onpointercancel=()=>{if(drag){state=drag.state;crop=drag.crop;drag=null;sync();}};
      root.addEventListener('resize',fitView);dialog.showModal();sync();
      (async()=>{
        try {
          let src=source;
          if(typeof source!=='string'){
            if(!source||!['image/jpeg','image/png','image/webp'].includes(source.type))throw Error('Choose a JPG, PNG, or WebP image.');
            if(source.size>10*1024*1024)throw Error('Choose an image smaller than 10 MB.');
            src=await new Promise((done,reject)=>{const reader=new FileReader();reader.onload=()=>done(reader.result);reader.onerror=()=>reject(Error('Could not read this image.'));reader.readAsDataURL(source);});
          }
          if(closed)return;
          const loaded=await new Promise((done,reject)=>{const img=new Image();img.crossOrigin='anonymous';img.referrerPolicy='no-referrer';img.onload=()=>done(img);img.onerror=()=>reject(Error('Could not load this image. Try uploading a new copy.'));img.src=src;});
          if(closed)return;if(!loaded.naturalWidth||!loaded.naturalHeight)throw Error('This image has no usable dimensions.');
          image=loaded;viewport.classList.add('is-ready');status.textContent='';apply.disabled=false;fitView();
        }catch(error){if(!closed)status.textContent=error.message;}
      })();
    });
  }
  function toFile(dataUrl,name='image.jpg') {
    const data=root.atob(dataUrl.split(',')[1]),bytes=new Uint8Array(data.length);for(let i=0;i<data.length;i++)bytes[i]=data.charCodeAt(i);
    return new File([bytes],name,{type:'image/jpeg'});
  }
  root.SBImageEditor={open,geometry,resizeBox,toFile};if(typeof module!=='undefined')module.exports={geometry,resizeBox};
})(typeof window!=='undefined'?window:globalThis);

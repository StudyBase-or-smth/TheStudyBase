// Shared subject/class card presentation and teacher-managed cover images.
(function () {
  const placeholder = 'images/subject-card-placeholder.svg';
  const keyFor = (subject,isClass) => 'card_' + (isClass ? 'class_' : 'subject_') + subject.id;
  const canEdit = () => !window.isGuest && ['teacher','dev'].includes(window.userRole);
  const node = (tag,cls,text) => { const el=document.createElement(tag);if(cls)el.className=cls;if(text!=null)el.textContent=text;return el; };
  const savedImage = (subject,isClass) => sbMemGet(keyFor(subject,isClass),{})?.image || placeholder;
  function cover(src,colour) {
    const banner=node('div','subj-cover'),img=node('img');banner.style.setProperty('--card-accent',colour||'#0f4c81');img.src=src;img.alt='';img.loading='lazy';img.addEventListener('error',()=>{img.src=placeholder;},{once:true});
    const tint=node('span','subj-cover-tint');tint.style.backgroundColor=colour;banner.append(img,tint);return banner;
  }
  function render(container,subjects,isClass,getTopics,getUnits) {
    const cards=subjects.map(subject=>{
      const topics=getTopics(subject),units=getUnits(subject),card=node('article','subj-card image-subj-card'+(isClass?' class-card':'')+(canEdit()?' can-edit':''));
      card.style.setProperty('--card-accent',subject.colour||'#0f4c81');
      const link=node('a','subj-card-link');link.href='subject/'+(isClass?'class.html':'subject.html')+'#'+encodeURIComponent(subject.id);
      const info=node('div','subj-card-info'),name=node('div','subj-name',subject.name),meta=node('div','subj-meta',topics.length?`${topics.length} topic${topics.length!==1?'s':''} · ${units.length} unit${units.length!==1?'s':''}`:'No topics yet');
      info.append(name,meta);
      if(isClass&&(subject.teacher||subject.class))meta.append(node('span','subj-class-meta',' · '+[subject.teacher,subject.class?'Class '+subject.class:''].filter(Boolean).join(' · ')));
      name.title=subject.name;meta.title=meta.textContent;
      link.append(cover(savedImage(subject,isClass),subject.colour),info);card.append(link);
      const actions=node('div','subj-card-actions');
      if(canEdit()) { const settings=node('button','subj-card-settings'),icon=node('img','settings-icon');icon.src='icons/card-settings.svg';icon.alt='';icon.width=18;icon.height=18;settings.append(icon);settings.type='button';settings.setAttribute('aria-label','Settings for '+subject.name);settings.title='Card settings';settings.onclick=()=>settingsDialog(subject,isClass);actions.append(settings); }
      const count=node('span','subj-count',String(topics.length));count.setAttribute('aria-label',topics.length+' topics');actions.append(count);card.append(actions);return card;
    });container.replaceChildren(...cards);
  }
  function refresh() { if(typeof renderSubjects==='function')renderSubjects();if(typeof renderClasses==='function')renderClasses(); }
  function settingsDialog(subject,isClass) {
    if(!canEdit())return;
    let draft=sbMemGet(keyFor(subject,isClass),{})?.image||'',selection=0;
    SBQoL.dialog(subject.name+' card settings',(content,close)=>{
      const preview=cover(draft||placeholder,subject.colour);preview.classList.add('subj-cover-preview');
      const hint=node('p','qol-muted','Choose a cover image shared with everyone. The subject colour is applied automatically.'),label=node('label','card-image-label','Cover image'),file=node('input');file.type='file';file.accept='image/jpeg,image/png,image/webp';label.append(file);
      const status=node('p','qol-muted');status.setAttribute('role','status');
      const actions=node('div','card-image-actions'),adjust=SBQoL.button('Adjust image',()=>editSource(draft)),reset=SBQoL.button('Use placeholder',()=>{selection++;draft='';file.value='';preview.querySelector('img').src=placeholder;status.textContent='';save.disabled=false;adjust.disabled=true;}),cancel=SBQoL.button('Cancel',close),save=SBQoL.button('Save image',async()=>{
        if(!canEdit())return;save.disabled=reset.disabled=file.disabled=adjust.disabled=true;status.textContent='Saving…';
        const value={v:1,image:draft,updatedAt:Date.now()};
        try { await sbPushToSync(keyFor(subject,isClass),value);sbMemSet(keyFor(subject,isClass),value);refresh();close(); }
        catch(error){status.textContent='Could not save the image. '+(error.message||'Please try again.');save.disabled=reset.disabled=file.disabled=false;adjust.disabled=!draft;}
      },'qol-button primary');
      async function editSource(source){const token=++selection;save.disabled=adjust.disabled=true;try{const image=await SBImageEditor.open(source,{title:'Adjust '+subject.name+' cover',aspect:3,width:1200,tint:subject.colour,maxLength:900000});if(token!==selection)return;if(image){draft=image;preview.querySelector('img').src=image;}status.textContent='';}catch(error){if(token===selection)status.textContent=error.message;}finally{if(token===selection){save.disabled=false;adjust.disabled=!draft;}}}
      adjust.disabled=!draft;file.onchange=()=>{const chosen=file.files?.[0];file.value='';if(chosen)editSource(chosen);};
      actions.append(adjust,reset,cancel,save);content.append(preview,hint,label,status,actions);
    });
  }
  async function load(subjects,classes) {
    await Promise.allSettled([...subjects.map(s=>keyFor(s,false)),...classes.map(s=>keyFor(s,true))].map(key=>sbLoadKey(key)));refresh();
  }
  window.SBSubjectCards={render,load,keyFor,settingsDialog};
})();

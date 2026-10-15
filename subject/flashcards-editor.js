// The same authoring controls are used by modal and inline topic editing.
(function(root){
  let topic={},undo=[];
  const el=(tag,text,cls)=>{const x=document.createElement(tag);if(text)x.textContent=text;if(cls)x.className=cls;return x;};
  root.readFlashcardRows=function(){return [...(document.getElementById('fqaList')?.querySelectorAll('.fqa-row')||[])].map(row=>({
    id:row.dataset.fqaId,q:row.querySelector('.fqa-question').value.trim(),a:row.querySelector('.fqa-answer').value.trim(),enabled:row.querySelector('.fqa-enabled').checked,
    acceptedAnswers:row.querySelector('.fqa-aliases').value.split('|').map(s=>s.trim()).filter(Boolean)
  })).filter(qa=>qa.q||qa.a);};
  function quality(){
    const issues=document.getElementById('flashcardIssues');if(!issues)return;
    const t={...topic,name:document.getElementById('fName')?.value??topic.name??'Topic',definition:document.getElementById('fDefinition')?.value??topic.definition,flashcardEnabled:document.getElementById('fFlashcardBase')?.checked!==false,flashcardQA:root.readFlashcardRows()};
    if(typeof getRichVal==='function')for(const [key,id] of Object.entries({formula:'fFormula',bodyText:'fBodyText',process:'fProcess',examTip:'fExamTip'}))if(document.getElementById(id))t[key]=getRichVal(id);
    if(document.getElementById('kpList'))t.keyPoints=[...document.querySelectorAll('#kpList .kp-row input')].map(input=>input.value.trim()).filter(Boolean);
    const preview=document.getElementById('flashcardBasePreview');if(preview){preview.querySelector('.front').textContent='Front: '+t.name;preview.querySelector('.back').textContent='Back: '+(StudyFlashcards.baseAnswer(t)||'(no content)');}
    const report=StudyFlashcards.deck([t],'preview');issues.replaceChildren();
    for(const issue of report.issues)issues.append(el('p',issue));
    document.getElementById('flashcardPreviewCount').textContent=report.cards.length+' included cards';
  }
  root.initFlashcardEditor=function(t){
    topic=t;undo=[];const list=document.getElementById('fqaList');list.replaceChildren();
    document.getElementById('flashcardEditorControls')?.remove();
    const controls=el('div',null,'flashcard-editor-controls');controls.id='flashcardEditorControls';
    const label=el('label','Include the automatic term / notes card '),checkbox=el('input');checkbox.type='checkbox';checkbox.id='fFlashcardBase';checkbox.checked=t.flashcardEnabled!==false;checkbox.onchange=quality;label.prepend(checkbox);
    const count=el('span',null,'qol-muted');count.id='flashcardPreviewCount';
    const issues=el('div',null,'flashcard-issues');issues.id='flashcardIssues';issues.setAttribute('role','status');
    const restore=el('button','Undo last deletion','btn-small');restore.type='button';restore.id='flashcardUndo';restore.disabled=true;restore.onclick=()=>{const entry=undo.pop();if(entry)list.insertBefore(entry.row,entry.next?.isConnected?entry.next:null);restore.disabled=!undo.length;quality();};
    const preview=el('details',null,'fqa-preview');preview.id='flashcardBasePreview';preview.append(el('summary','Preview automatic card'),el('p',null,'front'),el('p',null,'back'));
    controls.append(label,preview,count,restore,issues);
    const destination=new URLSearchParams(location.search).get('returnTo');
    if(destination){try{const url=new URL(destination,location.href);if(url.origin===location.origin&&url.pathname.endsWith('/subject/flashcards.html')){const link=el('a','Return to flashcards after saving','qol-button');link.href=url.href;controls.append(link);}}catch{}}
    list.before(controls);quality();
  };
  root.addFqaRow=function(q='',a='',options={}){
    const list=document.getElementById('fqaList');if(!document.getElementById('flashcardEditorControls'))root.initFlashcardEditor(topic);
    const row=el('div',null,'fqa-row');row.dataset.fqaId=options.id||('fc_'+(crypto.randomUUID?.()||Date.now()+'_'+Math.random().toString(36).slice(2)));
    const include=el('label','Include in flashcards '),enabled=el('input',null,'fqa-enabled');enabled.type='checkbox';enabled.checked=options.enabled!==false;include.prepend(enabled);
    const question=el('textarea',null,'fqa-input fqa-question'),answer=el('textarea',null,'fqa-input answer fqa-answer'),aliases=el('input',null,'fqa-aliases');
    question.value=q;question.rows=2;question.setAttribute('aria-label','Flashcard question');question.placeholder='Question';answer.value=a;answer.rows=3;answer.setAttribute('aria-label','Flashcard answer');answer.placeholder='Answer';aliases.value=(options.acceptedAnswers||[]).join(' | ');aliases.placeholder='Other accepted answers, separated by |';aliases.setAttribute('aria-label','Accepted answer variants');
    const preview=el('details',null,'fqa-preview'),summary=el('summary','Preview front and back'),front=el('p'),back=el('p');preview.append(summary,front,back);
    const update=()=>{front.textContent='Front: '+(question.value||'(empty question)');back.textContent='Back: '+(answer.value||'(empty answer)');quality();};
    const del=el('button','Delete question and answer','btn-small');del.type='button';del.onclick=()=>{undo.push({row,next:row.nextSibling});row.remove();document.getElementById('flashcardUndo').disabled=false;quality();};
    row.append(include,question,answer,aliases,preview,del);list.append(row);row.addEventListener('input',update);update();if(!q)question.focus();
  };
  let opened=false;
  document.addEventListener('input',event=>{if(event.target.closest?.('#fName,#fDefinition,#fFormula,#fBodyText,#fProcess,#fExamTip,#kpList'))quality();});
  function openFromLink(){
    if(opened)return;const params=new URLSearchParams(location.search),id=params.get('topic'),card=params.get('editFlashcard');
    if(card===null||!id||!root.__sbAuth?.currentUser||!root.userRole||!getTopics().some(t=>t.id===id)||!canEditTopic(id))return;
    opened=true;startInlineEdit(id);const target=card==='base'?document.getElementById('fFlashcardBase'):[...document.querySelectorAll('.fqa-row')].find(row=>row.dataset.fqaId===card)?.querySelector('textarea');target?.focus();target?.scrollIntoView?.({block:'center'});
  }
  document.addEventListener('DOMContentLoaded',openFromLink);root.addEventListener('studybase-auth-ready',openFromLink);root.addEventListener('studybase-topics-ready',openFromLink);if(typeof sbWhenDiskReady==='function')sbWhenDiskReady(openFromLink);
})(window);

(function(root){
  'use strict';
  const core=StudyFlashcards,params=new URLSearchParams(location.search),subjectId=decodeURIComponent(location.hash.slice(1));
  const subject=[...(typeof subjectsData!=='undefined'?subjectsData.subjects:[]),...(typeof classesData!=='undefined'?classesData.subjects:[])].find(s=>s.id===subjectId);
  const wrap=document.getElementById('fcWrap');if(!subject){wrap.textContent='Choose a subject or class to study.';return;}
  const topicsKey=subject.storageKey||subject.id+'_topics',unitsKey=subject.unitsKey||subject.id+'_units';
  let account='guest',data=core.merge(),all=[],issues=[],session,config={mode:'all',limit:0,unit:params.get('unit')||'all'},saveTimer,scope='',undoHidden=[],generation=0;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const topics=()=>normalizeTopicList(sbMemGet(topicsKey,[])),units=()=>normalizeUnits(sbMemGet(unitsKey,[]));
  const localKey=()=> 'studybase_flashcards_'+account;
  function message(text){const node=document.getElementById('studyStatus');if(node)node.textContent=text;}
  function commit(){
    if(session){session.updatedAt=Date.now();data.sessions[scope]=session;}
    data.sessions['settings_'+subject.id]={...config,controlsVersion:2,updatedAt:Date.now()};
    try{localStorage.setItem(localKey(),JSON.stringify(data));}catch{message('Browser storage is full. Keep this page open until progress can sync.');}
    clearTimeout(saveTimer);
    if(account!=='guest'){
      const payload=JSON.parse(JSON.stringify(data)),key='_flashcards_'+account;
      saveTimer=setTimeout(()=>sbPushToSync(key,payload).then(()=>message('Progress synced.')).catch(()=>message('Saved on this device. Sync pending; reminders need a connection.')),350);
    }
  }
  function localDay(zone){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day;}
  function todayCount(goal){const day=localDay(goal?.timeZone||Intl.DateTimeFormat().resolvedOptions().timeZone);return (data.days[day]||[]).filter(id=>id.startsWith(subject.id+':')).length;}
  function refreshDeck(){
    let pool=topics();const focused=params.get('topic');
    if(focused){const ids=new Set([focused]);let changed=true;while(changed){changed=false;for(const t of pool)if(ids.has(t.parentId)&&!ids.has(t.id)){ids.add(t.id);changed=true;}}pool=pool.filter(t=>ids.has(t.id));}
    if(config.unit!=='all')pool=pool.filter(t=>topicMatchesUnit(t,findUnit(units(),config.unit)||{id:config.unit,name:config.unit}));
    ({cards:all,issues}=core.deck(pool,subject.id));
  }
  function prepare(reset=false){
    refreshDeck();scope=[subject.id,config.unit,params.get('topic')||'',config.mode,config.limit].join('|');
    const valid=new Set(all.filter(c=>!data.cards[c.id]?.hidden).map(c=>c.id)),saved=data.sessions[scope];
    if(!reset&&saved?.order?.length){session={...saved,order:saved.order.filter(id=>valid.has(id))};session.index=saved.order.slice(0,saved.index||0).filter(id=>valid.has(id)).length;}
    else{
      let pool=all.filter(c=>valid.has(c.id));
      if(config.mode==='due')pool=pool.filter(c=>!data.cards[c.id]?.due||data.cards[c.id].due<=Date.now());
      if(config.mode==='missed')pool=pool.filter(c=>data.cards[c.id]?.lastRating==='again');
      session={order:pool.slice(0,config.limit||undefined).map(c=>c.id),index:0,revealed:false,typed:'',ratings:{},startedAt:Date.now(),updatedAt:Date.now()};
    }
    render();
  }
  function current(){return all.find(c=>c.id===session?.order[session.index]);}
  function sourceURL(card,edit=false){const url=new URL(subject.subjectId?'class.html':'subject.html',location.href);url.hash=subject.id;url.searchParams.set('topic',card.topic.id);if(edit){url.searchParams.set('editFlashcard',card.qaId||'base');url.searchParams.set('returnTo',location.href);}return url.href;}
  function canEdit(){return account!=='guest'&&(!subject.subjectId||['teacher','dev'].includes(root.userRole));}
  function render(){
    const card=current(),goal=data.goals['goal_'+subject.id],hidden=all.filter(c=>data.cards[c.id]?.hidden).length;
    wrap.innerHTML=`<div class="study-overview"><strong>${esc(subject.name)} flashcards</strong><div class="study-heading-actions">${card?`<span class="study-progress" aria-label="Card ${session.index+1} of ${session.order.length}">${session.index+1} / ${session.order.length}</span>`:''}<details class="study-more" id="studyMore"><summary class="qol-button" aria-label="Study options" title="Study options">⋯</summary><div class="study-more-menu">
      <div class="study-tools"><label>Study <select id="studyMode"><option value="all">All cards</option><option value="due">Due + new</option><option value="missed">Missed cards</option></select></label><label>Session <select id="studyLimit"><option value="5">5 cards</option><option value="10">10 cards</option><option value="20">20 cards</option><option value="0">All cards</option></select></label><label>Unit <select id="studyUnit"><option value="all">All units</option>${units().map(u=>`<option value="${esc(u.id)}">${esc(u.name)}</option>`).join('')}</select></label></div>
      <button class="qol-button" id="studyGoals">Goals & reminders${goal?.enabled!==false&&goal?` · ${todayCount(goal)} / ${goal.target}`:''}</button><button class="qol-button" id="manageHidden">Hidden cards (${hidden})</button>${issues.length?'<button class="qol-button" id="studyQuality">Card quality ('+issues.length+')</button>':''}
      ${card?`${canEdit()?`<a class="qol-button" id="editStudyCard" href="${esc(sourceURL(card,true))}">Edit this card</a>`:''}<button class="qol-button" id="hideStudyCard">Hide for me</button><button class="qol-button" id="shuffleStudy">Shuffle remaining</button><button class="qol-button" id="finishStudy">Finish session</button>`:''}
      <p id="studyStatus" class="qol-muted" role="status"></p></div></details></div></div>
      ${card?`<article class="study-card ${session.revealed?'is-revealed':''}" tabindex="0" aria-label="Flashcard. ${session.revealed?'Answer':'Question'} side. Press Enter or Space to flip." title="Click to flip"><div class="study-source"><a href="${esc(sourceURL(card))}">${esc(card.topic.name)}</a>${card.topic.unit?`<span>${esc(unitLabel(card.topic.unit,units()))}</span>`:''}</div><div class="study-face"><h2>${esc(card.q)}</h2>
      ${session.revealed?`<div class="study-answer"><p>${esc(card.a)}</p></div>${card.type==='qa'&&session.typed?`<div class="study-comparison"><p>${session.selfCorrected?'Self-assessed as correct.':core.matches(session.typed,card)?'Matches an accepted answer.':'Compare your answer with the reference before moving on.'}</p><p class="qol-muted">Your answer: ${esc(session.typed)}</p><button class="qol-button" id="selfCorrect">I was correct</button></div>`:''}`:''}</div>
      ${card.type==='qa'&&!session.revealed?`<details class="study-typing" ${session.typed?'open':''}><summary>Type an answer</summary><label for="studyAnswer" class="study-sr-only">Your answer (optional)</label><textarea id="studyAnswer" rows="2" placeholder="Your answer (optional)"></textarea></details>`:''}</article>
      <div class="study-primary"><button class="qol-button" id="studyPrevious" ${session.index?'':'disabled'}>← Previous</button><button class="qol-button primary" id="studyPrimary">${session.revealed?'Next card':'Show answer'}</button></div>`:summary()}${undoHidden.length?'<div class="study-undo"><button class="qol-button" id="undoHidden">Undo hide</button></div>':''}`;
    for(const [id,value] of [['studyMode',config.mode],['studyLimit',String(config.limit)],['studyUnit',config.unit]]){const node=document.getElementById(id);node.value=value;node.onchange=()=>{config={mode:document.getElementById('studyMode').value,limit:Number(document.getElementById('studyLimit').value),unit:document.getElementById('studyUnit').value};prepare(true);commit();};}
    document.querySelectorAll('.study-more-menu button').forEach(button=>button.addEventListener('click',()=>{document.getElementById('studyMore').open=false;}));
    document.getElementById('studyGoals').onclick=goals;document.getElementById('manageHidden').onclick=hiddenCards;
    document.getElementById('studyQuality')?.addEventListener('click',()=>SBQoL.dialog('Card quality',content=>{for(const issue of issues){const p=document.createElement('p');p.className='qol-muted';p.textContent=issue;content.append(p);}}));
    document.getElementById('undoHidden')?.addEventListener('click',()=>{const id=undoHidden.pop();data.cards[id]={...data.cards[id],hidden:false,updatedAt:Date.now()};session.order.splice(Math.min(session.index+1,session.order.length),0,id);commit();render();});
    if(!card){document.getElementById('startStudy').onclick=()=>{prepare(true);commit();};document.getElementById('reviewMissed')?.addEventListener('click',()=>{config.mode='missed';prepare(true);commit();});return;}
    const answer=document.getElementById('studyAnswer');if(answer){answer.value=session.typed||'';answer.oninput=()=>{session.typed=answer.value;commit();};}
    document.getElementById('studyPrimary').onclick=()=>session.revealed?rate('good'):reveal();
    const cardElement=wrap.querySelector('.study-card');
    cardElement.onclick=event=>{if(event.target.closest('a,button,input,textarea,select,details,[contenteditable="true"]')||root.getSelection?.().toString())return;flip();};
    cardElement.onkeydown=event=>{if(event.target===cardElement&&['Enter',' '].includes(event.key)){event.preventDefault();event.stopPropagation();flip();}};
    document.getElementById('studyPrevious').onclick=()=>{session.index--;session.revealed=false;session.typed='';commit();render();};
    document.getElementById('hideStudyCard').onclick=()=>{data.cards[card.id]={...data.cards[card.id],hidden:true,updatedAt:Date.now()};undoHidden.push(card.id);session.order.splice(session.index,1);session.revealed=false;session.typed='';commit();render();};
    document.getElementById('selfCorrect')?.addEventListener('click',()=>{session.selfCorrected=true;commit();render();message('Self-assessment saved. Continue with Next card.');});
    document.getElementById('editStudyCard')?.addEventListener('click',commit);
    document.getElementById('finishStudy').onclick=()=>{session.index=session.order.length;commit();render();};
    document.getElementById('shuffleStudy').onclick=()=>{const remaining=session.order.slice(session.index);for(let i=remaining.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[remaining[i],remaining[j]]=[remaining[j],remaining[i]];}session.order.splice(session.index,remaining.length,...remaining);session.revealed=false;session.typed='';commit();render();};
  }
  function summary(){
    const ratings=Object.values(session?.ratings||{}),again=ratings.filter(r=>r==='again').length;
    return `<section class="study-card study-summary"><h2>${session?.order.length?'Session complete':'No cards in this session'}</h2><p>${ratings.length} cards reviewed · ${again} to practise again</p><p class="qol-muted">${all.length?'Try All cards, change your unit, or unhide cards to continue.':'Add complete question/answer pairs in the topic editor to build this deck.'}</p><button class="qol-button primary" id="startStudy">Start a new session</button>${again?'<button class="qol-button" id="reviewMissed">Review missed cards</button>':''}</section>`;
  }
  function reveal(){const card=current();if(!card)return;session.typed=document.getElementById('studyAnswer')?.value||session.typed||'';session.revealed=true;commit();render();document.getElementById('studyPrimary')?.focus();}
  function flip(){
    if(session.revealed){session.revealed=false;commit();render();}else reveal();
    const cardElement=wrap.querySelector('.study-card');cardElement?.classList.add('is-flipping');cardElement?.focus({preventScroll:true});
  }
  function rate(rating){
    const card=current();if(!card||!session.revealed)return;
    data.cards[card.id]=core.review(data.cards[card.id],rating);session.ratings[card.id]=rating;
    const goal=data.goals['goal_'+subject.id],day=localDay(goal?.timeZone||Intl.DateTimeFormat().resolvedOptions().timeZone);data.days[day]=[...new Set([...(data.days[day]||[]),card.id])];
    session.index++;session.revealed=false;session.typed='';session.selfCorrected=false;commit();render();document.getElementById('studyPrimary')?.focus();
    const counter=rating==='again'?'incorrect':'correct';
    if(typeof readLocalFcStats==='function'){const stats=readLocalFcStats(account);stats[counter]++;stats.total++;queueFcStatsPush(account,stats);}
  }
  function hiddenCards(){const dialog=SBQoL.dialog('Hidden cards',content=>{const hidden=all.filter(c=>data.cards[c.id]?.hidden);if(!hidden.length){content.textContent='No hidden cards in this selection.';return;}for(const card of hidden){const button=SBQoL.button('Unhide: '+card.q,()=>{data.cards[card.id]={...data.cards[card.id],hidden:false,updatedAt:Date.now()};if(!session.order.includes(card.id))session.order.push(card.id);button.disabled=true;button.textContent='Restored: '+card.q;commit();});content.append(button);}});dialog.addEventListener('close',render);}
  function goals(){
    const id='goal_'+subject.id,old=data.goals[id]||{};
    SBQoL.dialog('Study goal & reminders',(content,close)=>{
      content.innerHTML=`<form id="studyGoalForm"><p class="qol-muted">Daily goals count distinct cards reviewed. Reminders appear in StudyBase notifications after syncing; they are not push notifications.</p><label>Daily target <input id="goalTarget" type="number" min="1" max="500" required value="${old.target||10}"></label><label><input id="goalEnabled" type="checkbox" ${old.enabled!==false?'checked':''}> Enable this goal</label><label><input id="goalReminder" type="checkbox" ${old.reminderEnabled?'checked':''} ${account==='guest'?'disabled':''}> Remind me daily</label><label>Reminder time <input id="goalTime" type="time" required value="${esc(old.time||'18:00')}"></label><label>Timezone <input id="goalZone" required value="${esc(old.timeZone||Intl.DateTimeFormat().resolvedOptions().timeZone)}"></label><p class="qol-muted">${account==='guest'?'Sign in to sync goals and receive reminders.':'Reminders are checked about once a minute. You will also be notified when you reach your goal.'}</p><p id="goalError" role="status"></p><button class="qol-button primary">Save goal</button></form>`;
      document.getElementById('studyGoalForm').onsubmit=event=>{event.preventDefault();const zone=document.getElementById('goalZone').value;try{localDay(zone);}catch{document.getElementById('goalError').textContent='Enter a valid timezone, for example Australia/Sydney.';return;}
        data.goals[id]={id,subjectId:subject.id,title:subject.name+' flashcards',target:Number(document.getElementById('goalTarget').value),time:document.getElementById('goalTime').value,timeZone:zone,enabled:document.getElementById('goalEnabled').checked,reminderEnabled:account!=='guest'&&document.getElementById('goalReminder').checked,updatedAt:Date.now()};commit();close();render();};
    });
  }
  function restoreSettings(){
    const saved=data.sessions['settings_'+subject.id];
    config={...config,...saved,...(saved?.controlsVersion===2?{}:{mode:'all',limit:0})};delete config.updatedAt;delete config.controlsVersion;if(params.has('unit'))config.unit=params.get('unit');
  }
  async function boot(){
    const token=++generation,next=root.isGuest?'guest':root.__sbAuth?.currentUser?.uid||'guest';
    account=next;try{data=core.merge(JSON.parse(localStorage.getItem(localKey())||'null'));}catch{data=core.merge();}
    restoreSettings();
    prepare();
    const loaded=await Promise.allSettled([sbLoadKey(topicsKey),sbLoadKey(unitsKey),...(account==='guest'?[]:[sbLoadKey('_flashcards_'+account)])]);if(token!==generation)return;
    if(account!=='guest'&&loaded[2]?.status==='fulfilled')data=core.merge(data,loaded[2].value);
    restoreSettings();
    prepare();commit();
  }
  const back=new URL(subject.subjectId?'class.html':'subject.html',location.href);back.hash=subject.id;
  document.getElementById('accentBar').href=back.href;document.getElementById('accentBar').setAttribute('aria-label','Back to '+subject.name);document.getElementById('hdrSubjectLink').href=back.href;document.getElementById('hdrSubjectLink').textContent=subject.name;
  document.documentElement.style.setProperty('--accent',subject.colour||'#0f4c81');document.title='Flashcards — '+subject.name;
  root.addEventListener('studybase-auth-ready',boot);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')commit();});root.addEventListener('pagehide',commit);
  root.addEventListener('pageshow',event=>{if(event.persisted)boot();});
  root.addEventListener('online',boot);
  document.addEventListener('keydown',event=>{
    if(document.querySelector('dialog[open]'))return;
    if(event.key==='Escape'){const more=document.getElementById('studyMore');if(more?.open){more.open=false;more.querySelector('summary').focus();}return;}
    if(event.target.closest?.('input,textarea,select,[contenteditable="true"]')){if(event.target.id==='studyAnswer'&&event.key==='Enter'&&!event.shiftKey){event.preventDefault();reveal();}return;}
    if(event.target.closest?.('button,a,summary'))return;
    if([' ','Enter'].includes(event.key)){event.preventDefault();document.getElementById('studyPrimary')?.click();}
  });
  boot();
  if(typeof sbWhenDiskReady==='function')sbWhenDiskReady(boot);
})(window);

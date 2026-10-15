// Shared navigation, dialogs and reading preferences for StudyBase pages.
(function () {
  'use strict';
  const root = new URL(location.pathname.includes('/subject/') || location.pathname.includes('/HSC/') || location.pathname.includes('/KnowledgeCompetition/') ? '../' : './', location.href);
  const scope = () => (window.isGuest || (typeof sbIsGuestSession === 'function' && sbIsGuestSession())) ? 'guest' : (typeof sbCurrentUser === 'function' && sbCurrentUser()?.uid) || window.currentUid || localStorage.getItem('studybase_uid') || 'guest';
  function read(key, fallback) { try { return JSON.parse(localStorage.getItem('sbq:' + scope() + ':' + key)) ?? fallback; } catch (_) { return fallback; } }
  function write(key, value) { try { localStorage.setItem('sbq:' + scope() + ':' + key, JSON.stringify(value)); return true; } catch (_) { return false; } }
  function node(tag, cls, text) { const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; }
  function button(text, fn, cls = 'qol-button') { const el = node('button', cls, text); el.type = 'button'; el.addEventListener('click', fn); return el; }
  function linkFor(subject, topic, isClass) {
    const url = new URL('subject/' + (isClass ? 'class' : 'subject') + '.html', root);
    url.hash = subject.id; if (topic != null) url.searchParams.set('topic', topic); return url.href;
  }
  let activeDialog = null;
  function dialog(title, build) {
    activeDialog?.close();
    const previous = document.activeElement;
    const el = node('dialog', 'qol-dialog');
    const heading = node('div', 'qol-dialog-heading');
    const h = node('h2', '', title); h.id = 'qol-dialog-title'; el.setAttribute('aria-labelledby', h.id);
    const close = () => el.close();
    heading.append(h, button('Close', close)); el.append(heading);
    const content = node('div', 'qol-dialog-content'); el.append(content); document.body.append(el);
    el.addEventListener('click', e => { if (e.target === el) { const r = el.getBoundingClientRect(); if(e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close(); } });
    el.addEventListener('close', () => { if(activeDialog === el) activeDialog = null; el.remove(); previous?.isConnected && previous.focus(); });
    build(content, close); el.showModal(); activeDialog = el; return el;
  }
  function notify(text, action, run) {
    document.getElementById('qol-notice')?.remove();
    const el = node('div', 'qol-notice'); el.id = 'qol-notice'; el.setAttribute('role', 'status');
    el.append(node('span', '', text));
    if(action) el.append(button(action, () => { run(); el.remove(); }));
    el.append(button('Dismiss', () => el.remove())); document.body.append(el);
    return el;
  }
  function strip(html) {
    const doc = new DOMParser().parseFromString(String(html || '').replace(/<\/(?:p|div|li|h[1-6])>|<br\s*\/?>/gi,'$& '),'text/html');
    doc.querySelectorAll('script,style').forEach(el => el.remove());
    return (doc.body.textContent || '').replace(/\s+/g,' ').trim();
  }
  function catalogs() {
    return [...(typeof subjectsData !== 'undefined' ? subjectsData.subjects : []).map(s => ({ ...s, isClass: false })), ...(typeof classesData !== 'undefined' ? classesData.subjects : []).map(s => ({ ...s, isClass: true }))];
  }
  function index() {
    return catalogs().flatMap(s => {
      const raw = typeof sbMemGet === 'function' ? sbMemGet(s.storageKey || s.id + '_topics', []) : [];
      const list = Array.isArray(raw) ? raw : raw?.items || [];
      const topics = typeof normalizeTopicList === 'function' ? normalizeTopicList(list) : list;
      return topics.map(t => {
        const unitData = typeof sbMemGet === 'function' ? sbMemGet(s.unitsKey || s.id + '_units', []) : [];
        const units = typeof normalizeUnits === 'function' ? normalizeUnits(unitData) : [];
        const unit = units.find(u => u.id === t.unit || u.name === t.unit)?.name || t.unit || '';
        const trail = []; const seen = new Set([String(t.id)]); let current = t;
        while(current.parentId != null) { const parent = topics.find(p => p.id == current.parentId); if(!parent || seen.has(String(parent.id))) break; seen.add(String(parent.id)); trail.unshift(parent.name); current = parent; }
        return { subject: s, topic: t, path: [s.name + (s.isClass ? ' · Class ' + (s.class || '') : ''), unit, ...trail].filter(Boolean).join(' / '), text: strip([t.definition, t.bodyText, t.formula, t.examTip, ...(t.keyPoints || [])].join(' ')) };
      });
    });
  }
  function search() {
    dialog('Search StudyBase', (content, close) => {
      const input = node('input', 'qol-search'); input.type = 'search'; input.placeholder = 'Find topics, notes or /commands…'; input.setAttribute('aria-label', 'Search all subjects and classes');
      const hint = node('p', 'qol-muted', 'Search all loaded subjects and classes. Type / for actions.');
      const results = node('div', 'qol-search-results'); content.append(input, hint, results);
      let selected = -1; let entries = [];
      function render() {
        const query = input.value.trim().toLowerCase(); results.replaceChildren(); selected = -1;
        if(query.startsWith('/')) {
          const commands = [{ name: 'Reading settings', run: preferences }, { name: 'Go to hub', run: () => location.href = new URL('index.html', root) }, { name: 'Toggle dark mode', run: () => typeof toggleDark === 'function' && toggleDark() }, ...(window.SBTopicQoL?.commands() || [])];
          commands.filter(c => c.name.toLowerCase().includes(query.slice(1))).forEach(c => results.append(button(c.name, () => { close(); c.run(); }, 'qol-result')));
        } else {
          const words = query.split(/\s+/).filter(Boolean);
          const matches = index().filter(r => words.every(w => (r.topic.name + ' ' + r.path + ' ' + r.text).toLowerCase().includes(w))).sort((a,b) => Number(b.topic.name.toLowerCase().startsWith(query)) - Number(a.topic.name.toLowerCase().startsWith(query))).slice(0, 40);
          for(const r of matches) { const a = node('a', 'qol-result'); a.href = linkFor(r.subject, r.topic.id, r.subject.isClass); a.append(node('strong','',r.topic.name), node('span','qol-muted',r.path));
            const pos = query ? Math.max(0, r.text.toLowerCase().indexOf(words[0]) - 35) : 0; if(r.text) a.append(node('span','qol-excerpt',r.text.slice(pos,pos+150))); results.append(a); }
          if(!matches.length) results.append(node('p','qol-muted','No matching topics. Try another phrase.'));
        }
        entries = [...results.querySelectorAll('a,button')];
      }
      input.addEventListener('input', render);
      input.addEventListener('keydown', e => { if(e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if(!entries.length) return; selected = (selected + (e.key === 'ArrowDown' ? 1 : -1) + entries.length) % entries.length; entries.forEach((el,i) => el.classList.toggle('selected',i === selected)); entries[selected].scrollIntoView({block:'nearest'}); } else if(e.key === 'Enter' && entries.length) { e.preventDefault(); entries[Math.max(0,selected)].click(); } });
      render();
      if(typeof sbLoadAllContentKeys === 'function' && !window.isGuest && !(typeof sbIsGuestSession === 'function' && sbIsGuestSession())) sbLoadAllContentKeys().then(() => { if(input.isConnected) render(); }).catch(() => { hint.textContent = 'Showing cached topics. Server content is currently unavailable.'; });
    });
  }
  function motionEnabled() { const p = read('preferences',{}); return p.animations === true || (p.animations !== false && !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)); }
  function applyPreferences() { const p = read('preferences', {}); document.querySelectorAll('[data-qol-preference]').forEach(control => { const key = control.dataset.qolPreference; if(key === 'animations') control.checked = motionEnabled(); else control.value = p[key] || control.options[0].value; }); document.body.classList.toggle('qol-wide', p.width === 'wide'); document.body.classList.toggle('qol-compact', p.density === 'compact'); document.body.classList.toggle('qol-allow-animation',p.animations === true); document.body.classList.toggle('qol-no-animation',!motionEnabled()); if(!motionEnabled()) document.getAnimations?.().forEach(animation => animation.cancel()); }
  function renderPreferences(content) {
      for(const [key,label,options] of [['width','Content width',[['standard','Comfortable'],['wide','Wide — tables and diagrams']]],['density','Spacing',[['comfortable','Comfortable'],['compact','Compact']]]]) {
        const row = node('label','qol-setting'); row.append(node('span','',label)); const select = node('select');
        for(const [value,text] of options) { const o = node('option','',text); o.value = value; select.append(o); }
        select.dataset.qolPreference = key; select.value = read('preferences',{})[key] || options[0][0]; select.addEventListener('change',() => { write('preferences',{...read('preferences',{}),[key]:select.value}); applyPreferences(); window.dispatchEvent(new Event('resize')); }); row.append(select); content.append(row);
      }
      const motion = node('label','qol-setting'); motion.append(node('span','','Animations'));
      const toggle = node('input'); toggle.type = 'checkbox'; toggle.dataset.qolPreference = 'animations'; toggle.checked = motionEnabled();
      toggle.addEventListener('change',() => { write('preferences',{...read('preferences',{}),animations:toggle.checked}); applyPreferences(); });
      motion.append(toggle); content.append(motion);
  }
  function preferences() {
    const wrap = document.querySelector('.qol-settings-wrap');
    if(wrap) { wrap.classList.add('open'); wrap.querySelector('button').setAttribute('aria-expanded','true'); wrap.querySelector('select')?.focus(); }
    else dialog('Reading settings',renderPreferences);
  }
  function recordActivity(name, subject, tool, href) {
    const url = new URL(href,root); if(url.origin !== location.origin) return;
    const old = read('recent',[]); write('recent',[{href:url.href,name,subject,tool,time:Date.now()},...old.filter(r => r.href !== url.href)].slice(0,12));
    continueCard();
  }
  function removeActivity(href) { const url = new URL(href,root); write('recent',read('recent',[]).filter(r => r.href !== url.href)); continueCard(); }
  function record(subject, topic, isClass) { recordActivity(topic.name,subject.name,isClass ? 'Class topics' : 'Topics',linkFor(subject,topic.id,isClass)); }
  function continueCard() {
    const grid = document.getElementById('hubSidebar'); if(!grid) return;
    let card = document.getElementById('qol-continue'); if(!card) { card = node('section','side-card qol-continue'); card.id = 'qol-continue'; grid.prepend(card); }
    card.replaceChildren(node('h2','qol-card-title','Continue studying'));
    const recent = read('recent',[]).slice(0,3); if(!recent.length) { card.append(node('p','qol-muted','Your recently opened topics, graphing projects, and analyser tasks will appear here.')); return; }
    for(const r of recent) {
      const a = node('a','qol-result'); let tool = r.tool;
      try { const u = new URL(r.href); if(u.origin !== location.origin) continue; a.href = u.href;
        if(!tool) tool = u.pathname.includes('graphing.html') ? 'Graphing tool' : u.pathname.includes('flashcards') ? 'Flashcards' : u.pathname.includes('/HSC/') ? 'HSC practice' : u.pathname.includes('analyser') ? 'Analyser Tool' : u.pathname.includes('class.html') ? 'Class topics' : 'Topics';
      } catch(_) { continue; }
      const toolSource = /^(Graphing tool|Graphing)$/i.test(tool) ? {icon:'📈',name:'Graphing tool'} : /^(Analyser|Analyser Tool)$/i.test(tool) ? {icon:'📍',name:'Analyser Tool'} : null;
      const source = node('span','qol-muted',toolSource ? '' : [r.subject,tool === 'Topics' || tool === 'Class topics' ? '' : tool].filter(Boolean).join(' · '));
      if(toolSource) { const icon = node('span','qol-continue-tool-icon',toolSource.icon); icon.setAttribute('aria-hidden','true'); source.append(icon,document.createTextNode(' ' + toolSource.name)); }
      const subject = catalogs().find(s => s.name === r.subject);
      const hscSubject = {Engineering:'eng2',Maths:'mth',Math:'mth',English:'eng',Economics:'eco'}[r.subject];
      const colour = subject?.colour || catalogs().find(s => s.id === hscSubject)?.colour;
      if(colour && !toolSource) source.style.color = colour;
      const heading = node('div','qol-continue-heading'); heading.append(node('strong','',r.name));
      if(r.time && Number.isFinite(new Date(r.time).getTime())) {
        const date = node('time','qol-continue-date',new Date(r.time).toLocaleDateString('en-AU',{day:'numeric',month:'short',timeZone:'Australia/Sydney'}));
        date.dateTime = new Date(r.time).toISOString(); date.title = 'Last opened ' + new Date(r.time).toLocaleString('en-AU',{timeZone:'Australia/Sydney'}); heading.append(date);
      }
      a.append(heading,source); card.append(a);
    }
  }
  function boot() {
    if(location.pathname.endsWith('/subject/flashcards.html')) {
      const subject = catalogs().find(s => s.id === location.hash.slice(1));
      if(subject) recordActivity(subject.name + ' flashcards',subject.name,'Flashcards',location.href);
    }
    const clock = document.getElementById('hubClock');
    if(clock) {
      const updateClock = () => {
        const now = new Date(); clock.textContent = now.toLocaleTimeString('en-AU',{hour:'numeric',minute:'2-digit',timeZone:'Australia/Sydney'}); clock.dateTime = now.toISOString();
        document.getElementById('todayDate').textContent = now.toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short',timeZone:'Australia/Sydney'});
      };
      updateClock(); setInterval(updateClock,30000);
    }
    applyPreferences(); const header = document.querySelector('.hdr-right-row') || document.querySelector('.hdr-right');
    if(header) {
      const find = button('',search,'hdr-ghost qol-search-button');
      find.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>';
      find.setAttribute('aria-label','Search StudyBase (Ctrl or Command K)'); find.dataset.tip = 'Search StudyBase'; header.prepend(find);
    }
    const profileMenu = document.getElementById('hdrProfileTip');
    const profileButton = document.getElementById('hdrProfileBtn');
    if(header) {
      const settingsWrap = node('div','qol-settings-wrap');
      const settings = button('',e => { e.stopPropagation(); const open = settingsWrap.classList.toggle('open'); settings.setAttribute('aria-expanded',String(open)); },'hdr-ghost qol-settings-button');
      const settingsMenu = node('div','qol-settings-menu'); settingsMenu.id = 'qol-settings-menu';
      settingsMenu.append(node('h3','','Reading settings')); renderPreferences(settingsMenu);
      settings.setAttribute('aria-expanded','false'); settings.setAttribute('aria-controls',settingsMenu.id);
      settingsWrap.append(settings,settingsMenu);
      settingsWrap.addEventListener('mouseleave',() => { settingsWrap.classList.remove('open'); settings.setAttribute('aria-expanded','false'); });
      settingsWrap.addEventListener('focusout',e => { if(!settingsWrap.contains(e.relatedTarget)) { settingsWrap.classList.remove('open'); settings.setAttribute('aria-expanded','false'); } });
      document.addEventListener('click',e => { if(!settingsWrap.contains(e.target)) { settingsWrap.classList.remove('open'); settings.setAttribute('aria-expanded','false'); } });
      settingsWrap.addEventListener('keydown',e => { if(e.key === 'Escape') { settingsWrap.classList.remove('open'); settings.setAttribute('aria-expanded','false'); settings.focus(); } });
      settings.setAttribute('aria-label','Settings');
      settings.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="m10 3-1 3-3 1-3 2 2 3-1 3 3 2 3-1 2 3 3-1 1-3 3-1 1-3-2-3-3-1-1-3z"/><circle cx="12" cy="12" r="3"/></svg>';
      const wrap = profileButton?.closest('.hdr-profile-wrap'); if(wrap) wrap.after(settingsWrap); else header.append(settingsWrap);
    }
    if(profileMenu) {
      const notifications = document.getElementById('hdrNotifyWrap');
      const addProfileActions = () => {
        if(!profileMenu.querySelector('.qol-view-profile')) {
          const link = node('a','qol-view-profile','View profile'); link.href = new URL('profile.html',root).href; profileMenu.append(link);
        }
        if(notifications && !profileMenu.contains(notifications)) profileMenu.append(notifications);
        document.getElementById('hdrNotifyBtn')?.remove();
        if(notifications && !notifications.querySelector('.qol-notifications-title')) notifications.prepend(node('div','qol-notifications-title','Notifications'));
      };
      addProfileActions(); new MutationObserver(addProfileActions).observe(profileMenu,{childList:true});
      const wrap = profileButton?.closest('.hdr-profile-wrap');
      if(profileButton && wrap) {
        const openNotifications = () => {
          if(typeof sbNotifyOpenAndRead === 'function' && !(typeof _sbNotifyOpen !== 'undefined' && _sbNotifyOpen)) sbNotifyOpenAndRead().catch(() => {});
        };
        wrap.addEventListener('mouseenter',openNotifications);
        wrap.addEventListener('mouseleave',() => { wrap.classList.remove('qol-profile-open'); profileButton.setAttribute('aria-expanded','false'); if(typeof sbNotifyClose === 'function') sbNotifyClose(); });
        wrap.addEventListener('focusout',e => { if(!wrap.contains(e.relatedTarget)) { wrap.classList.remove('qol-profile-open'); profileButton.setAttribute('aria-expanded','false'); } });
        profileButton.onclick = null; profileButton.setAttribute('aria-expanded','false'); profileButton.setAttribute('aria-label','Profile and notifications');
        profileButton.addEventListener('click',e => { e.preventDefault(); e.stopPropagation(); const open = wrap.classList.toggle('qol-profile-open'); profileButton.setAttribute('aria-expanded',String(open)); if(open) openNotifications(); });
        document.addEventListener('click',e => { if(!wrap.contains(e.target)) { wrap.classList.remove('qol-profile-open'); profileButton.setAttribute('aria-expanded','false'); } });
        if(notifications) new MutationObserver(() => wrap.classList.toggle('qol-has-notifications',notifications.classList.contains('has-unread'))).observe(notifications,{attributes:true,attributeFilter:['class']});
      }
    }
    document.querySelectorAll('button').forEach(el => { if(!el.getAttribute('aria-label') && !el.textContent.trim()) el.setAttribute('aria-label',el.title || el.dataset.tip || 'Action'); });
    continueCard();
  }
  window.SBQoL = { read, write, node, button, dialog, notify, linkFor, root, record, recordActivity, removeActivity, refreshContinue:continueCard, search, preferences, catalogs, motionEnabled, applyPreferences };
  window.openHubStat = function(kind){
    const subjects = typeof hubSubjects === 'function' ? hubSubjects() : catalogs().filter(s => !s.isClass);
    dialog({topics:'Topics',units:'Units',subjects:'Subjects'}[kind] || 'Overview',content => {
      let count = 0;
      for(const subject of subjects){
        const entries = kind === 'subjects' ? [subject] : kind === 'units' ? getUnits(subject) : getTopics(subject);
        for(const entry of entries){
          const a = node('a','qol-result'); const url = new URL(linkFor(subject,kind === 'topics' ? entry.id : null,false));
          if(kind === 'units') url.searchParams.set('unit',entry.id);
          a.href = url.href; a.append(node('strong','',entry.name));
          if(kind !== 'subjects'){ const source = node('span','qol-muted',subject.name); source.style.color = subject.colour; a.append(source); }
          content.append(a); count++;
        }
      }
      if(!count) content.append(node('p','qol-muted','Nothing to show yet.'));
    });
  };
  document.addEventListener('keydown',e => { if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if(!activeDialog) search(); } });
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot); else boot();
  window.addEventListener('pageshow',continueCard);
})();

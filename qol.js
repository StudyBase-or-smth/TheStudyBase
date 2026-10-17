// Shared navigation, dialogs and reading preferences for StudyBase pages.
(function () {
  'use strict';
  const root = new URL(location.pathname.includes('/subject/') || location.pathname.includes('/quiz-tool/') || location.pathname.includes('/KnowledgeCompetition/') ? '../' : './', location.href);
  const scope = () => (window.isGuest || (typeof sbIsGuestSession === 'function' && sbIsGuestSession())) ? 'guest' : (typeof sbCurrentUser === 'function' && sbCurrentUser()?.uid) || window.currentUid || localStorage.getItem('studybase_uid') || 'guest';
  function read(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem('sbq:' + scope() + ':' + key)) ?? fallback;
      if(key === 'recent' && Array.isArray(value)) return value.map(entry => {
        try {
          const url = new URL(entry.href,root);
          if(url.origin === location.origin && url.pathname.endsWith('/HSC/HSC.html')) url.pathname = url.pathname.replace(/HSC\/HSC\.html$/, 'quiz-tool/quiz-tool.html');
          return {...entry,href:url.href,tool:entry.tool === 'HSC practice' ? 'Quiz Tool' : entry.tool};
        } catch (_) { return entry; }
      });
      return value;
    } catch (_) { return fallback; }
  }
  function write(key, value) { try { localStorage.setItem('sbq:' + scope() + ':' + key, JSON.stringify(value)); return true; } catch (_) { return false; } }
  function getJevApiKey() {
    const key = read('jevApiKey', '');
    return typeof key === 'string' ? key.trim() : '';
  }
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
  let quizSearchRows = null;
  let quizSearchRequest = null;
  let quizSearchIncomplete = false;
  async function loadQuizSearch() {
    if (quizSearchRows) return quizSearchRows;
    if (quizSearchRequest) return quizSearchRequest;
    quizSearchRequest = (async () => {
      const base = new URL('quiz-tool/storage/', root);
      const response = await fetch(new URL('manifest.json', base));
      if (!response.ok) throw new Error('Quiz catalogue unavailable');
      const manifest = await response.json();
      if (!Array.isArray(manifest)) throw new Error('Invalid quiz catalogue');
      const rows = [];
      const loaded = await Promise.allSettled(manifest.map(async entry => {
        if (typeof entry === 'string') entry = {file:entry,name:entry};
        if (!entry || typeof entry.file !== 'string' || !/^[\w.-]+\.json$/.test(entry.file)) throw new Error('Invalid quiz filename');
        const paper = {file:entry.file,name:entry.name || entry.file,subject:entry.subject || '',section:entry.section || ''};
        const res = await fetch(new URL(entry.file, base));
        if (!res.ok) throw new Error('Quiz unavailable');
        const data = await res.json();
        if (!Array.isArray(data.questions)) throw new Error('Invalid quiz');
        const cellText = cell => String(cell && typeof cell === 'object' ? cell.text ?? '' : cell ?? '');
        return [paper, ...data.questions.map((q,i) => ({...paper,questionId:String(q.id ?? i),name:q.name || `Question ${i+1}`,text:String(q.question || ''),choices:q.isMultipleChoice && Array.isArray(q.answers) ? q.answers.map(a => a.text || '').join(' ') : '',tables:[q.answerTable,...(q.questionContent || []).filter(block => block.type === 'table')].filter(Boolean).map(table => [table.caption,...(table.columns || []).map(cellText),...(table.rows || []).flat().map(cellText)].join(' ')).join(' ')}))];
      }));
      for (const result of loaded) if (result.status === 'fulfilled') rows.push(...result.value);
      quizSearchIncomplete = loaded.some(result => result.status === 'rejected');
      // Partial results remain useful; a later search retries any failed catalogue load.
      if (!quizSearchIncomplete) quizSearchRows = rows;
      return rows;
    })();
    try { return await quizSearchRequest; } finally { quizSearchRequest = null; }
  }
  function search() {
    dialog('Search StudyBase', (content, close) => {
      const input = node('input', 'qol-search'); input.type = 'search'; input.placeholder = 'Find topics, notes, quizzes or /commands…'; input.setAttribute('aria-label', 'Search all subjects, classes, tools and quiz questions');
      const hint = node('p', 'qol-muted', 'Search subjects, classes, tools and quiz questions. Type / for actions.');
      const results = node('div', 'qol-search-results'); content.append(input, hint, results);
      let selected = -1; let entries = []; let quizzes = []; let quizzesLoading = false;
      function render() {
        const query = input.value.trim().toLowerCase(); results.replaceChildren(); selected = -1;
        if(query.startsWith('/')) {
          const commands = [{ name: 'Reading settings', run: preferences }, { name: 'Go to hub', run: () => location.href = new URL('index.html', root) }, { name: 'Toggle dark mode', run: () => typeof toggleDark === 'function' && toggleDark() }, ...(window.SBTopicQoL?.commands() || [])];
          commands.filter(c => c.name.toLowerCase().includes(query.slice(1))).forEach(c => results.append(button(c.name, () => { close(); c.run(); }, 'qol-result')));
        } else {
          const words = query.split(/\s+/).filter(Boolean);
          const tools = (window.SBTools?.list() || []).filter(tool => words.every(word =>
            (tool.name + ' ' + tool.id + (tool.id === 'quiz' ? ' HSC practice exams' : '')).toLowerCase().includes(word)));
          for (const tool of tools) {
            const row = node(tool.disabled ? 'span' : 'a', 'qol-result');
            if (tool.disabled) row.setAttribute('aria-disabled', 'true');
            else row.href = new URL(tool.href, root).href;
            row.append(window.SBTools.image(tool), node('strong', '', tool.name), node('span', 'qol-muted', tool.disabled ? 'Tool · Disabled' : 'Tool'));
            results.append(row);
          }
          const matches = index().filter(r => words.every(w => (r.topic.name + ' ' + r.path + ' ' + r.text).toLowerCase().includes(w))).sort((a,b) => Number(b.topic.name.toLowerCase().startsWith(query)) - Number(a.topic.name.toLowerCase().startsWith(query))).slice(0, 40);
          for(const r of matches) { const a = node('a', 'qol-result'); a.href = linkFor(r.subject, r.topic.id, r.subject.isClass); a.append(node('strong','',r.topic.name), node('span','qol-muted',r.path));
            const pos = query ? Math.max(0, r.text.toLowerCase().indexOf(words[0]) - 35) : 0; if(r.text) a.append(node('span','qol-excerpt',r.text.slice(pos,pos+150))); results.append(a); }
          const quizTool = window.SBTools?.list().find(tool => tool.id === 'quiz');
          const quizMatches = !quizTool || quizTool.disabled ? [] : quizzes.filter(r =>
            (!r.questionId || query) && words.every(word => [quizTool.name,r.name,r.subject,r.section,r.file,r.text,r.choices,r.tables,r.questionId].join(' ').toLowerCase().includes(word))).slice(0,40);
          for (const r of quizMatches) {
            const a = node('a', 'qol-result'); const target = new URL(quizTool.href,root);
            target.hash = new URLSearchParams({file:r.file,...(r.questionId ? {question:r.questionId} : {})}).toString();
            a.href = target.href;
            const paperName = quizzes.find(p => p.file === r.file && !p.questionId)?.name || r.file;
            a.append(node('strong','',r.name),node('span','qol-muted',[quizTool.name,r.subject,paperName === r.name ? '' : paperName,r.section].filter(Boolean).join(' / ')));
            if (r.text) { const pos = Math.max(0,r.text.toLowerCase().indexOf(words[0] || '')-35); a.append(node('span','qol-excerpt',r.text.slice(pos,pos+150))); }
            results.append(a);
          }
          if(!matches.length && !tools.length && !quizMatches.length) results.append(node('p','qol-muted',quizzesLoading ? 'Searching quiz content…' : 'No matching topics, tools or quiz questions. Try another phrase.'));
        }
        entries = [...results.querySelectorAll('a,button')];
      }
      input.addEventListener('input', render);
      input.addEventListener('keydown', e => { if(e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if(!entries.length) return; selected = (selected + (e.key === 'ArrowDown' ? 1 : -1) + entries.length) % entries.length; entries.forEach((el,i) => el.classList.toggle('selected',i === selected)); entries[selected].scrollIntoView({block:'nearest'}); } else if(e.key === 'Enter' && entries.length) { e.preventDefault(); entries[Math.max(0,selected)].click(); } });
      render();
      const quizTool = window.SBTools?.list().find(tool => tool.id === 'quiz');
      if (quizTool && !quizTool.disabled) {
        quizzesLoading = true;
        render();
        loadQuizSearch().then(rows => { quizzes = rows; quizzesLoading = false; if(input.isConnected) { if(quizSearchIncomplete) hint.textContent = 'Some quiz content could not load. Showing available results.'; render(); } })
          .catch(() => { quizzesLoading = false; if(input.isConnected) { hint.textContent = 'Quiz content is unavailable. Other search results are still available.'; render(); } });
      }
      if(typeof sbLoadAllContentKeys === 'function' && !window.isGuest && !(typeof sbIsGuestSession === 'function' && sbIsGuestSession())) sbLoadAllContentKeys().then(() => { if(input.isConnected) render(); }).catch(() => { hint.textContent = 'Showing cached topics. Server content is currently unavailable.'; });
    });
  }
  function motionEnabled() { const p = read('preferences',{}); return p.animations === true || (p.animations !== false && !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)); }
  function applyPreferences() {
    const p = read('preferences', {});
    document.querySelectorAll('[data-qol-preference]').forEach(control => {
      const key = control.dataset.qolPreference;
      if(key === 'animations') control.checked = motionEnabled();
      else if(key === 'matchDarkImages') control.checked = p.matchDarkImages !== false;
      else if(key === 'showRevise') control.checked = p.showRevise === true;
      else if(key === 'homeStyle') control.checked = control.value === (p.homeStyle === 'tools' ? 'tools' : 'subjects');
      else control.value = p[key] || control.options[0].value;
    });
    document.body.classList.toggle('qol-original-images', p.matchDarkImages === false);
    document.body.classList.toggle('qol-wide', p.width === 'wide');
    document.body.classList.toggle('qol-compact', p.density === 'compact');
    document.body.classList.toggle('qol-allow-animation',p.animations === true);
    document.body.classList.toggle('qol-no-animation',!motionEnabled());
    if(!motionEnabled()) document.getAnimations?.().forEach(animation => animation.cancel());
    window.dispatchEvent(new Event('studybase-preferences-changed'));
  }
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
      const images = node('label','qol-setting'); images.append(node('span','','Match images to dark mode'));
      const imageToggle = node('input'); imageToggle.type = 'checkbox'; imageToggle.dataset.qolPreference = 'matchDarkImages'; imageToggle.checked = read('preferences',{}).matchDarkImages !== false;
      imageToggle.addEventListener('change',() => { write('preferences',{...read('preferences',{}),matchDarkImages:imageToggle.checked}); applyPreferences(); });
      images.append(imageToggle); content.append(images);
      const reviseRow = node('label','qol-setting'); reviseRow.append(node('span','','Show Revise button'));
      const reviseToggle = node('input'); reviseToggle.type = 'checkbox'; reviseToggle.dataset.qolPreference = 'showRevise'; reviseToggle.checked = read('preferences',{}).showRevise === true;
      reviseToggle.addEventListener('change',() => { write('preferences',{...read('preferences',{}),showRevise:reviseToggle.checked}); applyPreferences(); });
      reviseRow.append(reviseToggle); content.append(reviseRow);
      const keyRow = node('label','qol-setting qol-api-key'); keyRow.append(node('span','','Jev API key (optional)'));
      const keyInput = node('input'); keyInput.type = 'password'; keyInput.autocomplete = 'off'; keyInput.spellcheck = false; keyInput.maxLength = 2048;
      keyInput.placeholder = 'Use site key'; keyInput.value = getJevApiKey(); keyRow.append(keyInput);
      const keyHint = node('p','qol-muted','Saved in this browser. Use npm run local for standalone quiz marking with your key, without StudyBase sign-in or a hosted backend. Internet access to Jev is required. Leave blank to use the site backend.');
      const keyStatus = node('span','qol-muted'); keyStatus.setAttribute('role','status');
      const keyActions = node('div','qol-api-key-actions');
      keyActions.append(button('Save', () => {
        const key = keyInput.value.trim();
        if (/[\s\x00-\x1f\x7f]/.test(key)) { keyStatus.textContent = 'Key cannot contain spaces or control characters.'; return; }
        if (write('jevApiKey', key)) { keyInput.value = key; keyStatus.textContent = key ? 'Key saved.' : 'Using site key.'; }
        else keyStatus.textContent = 'Could not save key in this browser.';
      }),button('Clear', () => {
        if (write('jevApiKey', '')) { keyInput.value = ''; keyStatus.textContent = 'Using site key.'; }
        else keyStatus.textContent = 'Could not clear saved key.';
      }));
      content.append(keyRow,keyActions,keyStatus,keyHint);
  }
  function preferences() {
    const wrap = document.querySelector('.qol-settings-wrap');
    if(wrap) { wrap.classList.add('open'); wrap.querySelector('button').setAttribute('aria-expanded','true'); wrap.querySelector('select')?.focus(); }
    else dialog('Reading settings',renderPreferences);
  }
  function renderProfileSettings(container) {
    container.replaceChildren();
    renderPreferences(container);
    const section = node('section','home-style-settings');
    section.append(node('h3','','Home page style'));
    const group = node('fieldset','home-style-segments');
    group.append(node('legend','qol-sr-only','Home page style'));
    for(const [value,label] of [['subjects','Subjects & classes'],['tools','Tools']]) {
      const option = node('label','home-style-option');
      const radio = node('input'); radio.type = 'radio'; radio.name = 'homeStyle'; radio.value = value; radio.dataset.qolPreference = 'homeStyle';
      radio.checked = (read('preferences',{}).homeStyle === 'tools' ? 'tools' : 'subjects') === value;
      radio.onchange = () => { if(radio.checked) { write('preferences',{...read('preferences',{}),homeStyle:value}); applyPreferences(); } };
      option.append(radio,node('span','',label)); group.append(option);
    }
    section.append(group);
    const preview = node('div','home-style-preview'); preview.setAttribute('aria-label','Home page layout preview');
    function updatePreview() {
      const tools = read('preferences',{}).homeStyle === 'tools';
      preview.classList.toggle('preview-tools',tools);
      preview.replaceChildren();
      preview.append(node('div','preview-header','StudyBase'));
      const main = node('div','preview-main'), aside = node('div','preview-sidebar');
      main.append(node('strong','',tools?'Tools':'Subjects & classes'));
      const cards = node('div','preview-cards');
      for(const label of tools?['Graphing','Quiz','Analyser']:['Subject','Subject','Class']) cards.append(node('span','',label));
      main.append(cards,node('div','preview-secondary',tools?'Subjects & classes · Calendar':'Calendar'));
      aside.append(node('span','','Continue studying'),node('span','',tools?'Recently added':'Tools'),node('span','','Units overview'));
      preview.append(main,aside);
    }
    // The section is rebuilt with profile editing; no persistent window listener.
    group.addEventListener('change',updatePreview); updatePreview();
    section.append(preview,node('p','qol-muted','A rough layout preview. Your available tools, subjects and classes stay the same.'));
    container.append(section);
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
        if(!tool) tool = u.pathname.includes('graphing.html') ? 'Graphing tool' : u.pathname.includes('flashcards') ? 'Flashcards' : u.pathname.includes('/quiz-tool/') ? 'Quiz Tool' : u.pathname.includes('analyser') ? 'Analyser Tool' : u.pathname.includes('class.html') ? 'Class topics' : 'Topics';
      } catch(_) { continue; }
      const toolSource = window.SBTools?.forURL(a.href) || (/^(Graphing tool|Graphing)$/i.test(tool) ? {icon:'icons/tools/graphing.svg',name:'Graphing Tool'} : /^(Analyser|Analyser Tool)$/i.test(tool) ? {icon:'icons/tools/analyser.svg',name:'Analyser Tool'} : tool === 'Quiz Tool' ? {icon:'icons/tools/quiz.svg',name:'Quiz Tool'} : null);
      if(toolSource?.disabled) { a.removeAttribute('href'); a.setAttribute('aria-disabled','true'); a.classList.add('is-disabled'); }
      const source = node('span','qol-muted',toolSource ? '' : [r.subject,tool === 'Topics' || tool === 'Class topics' ? '' : tool].filter(Boolean).join(' · '));
      if(toolSource) { const icon = window.SBTools ? window.SBTools.image(toolSource) : node('img','tool-icon',''); if(!window.SBTools) { icon.src = new URL(toolSource.icon,root).href; icon.alt = ''; } source.append(icon,document.createTextNode(' ' + toolSource.name)); }
      const subject = catalogs().find(s => s.name === r.subject);
      const quizSubject = {Engineering:'eng2',Maths:'mth',Math:'mth',English:'eng',Economics:'eco'}[r.subject];
      const colour = subject?.colour || catalogs().find(s => s.id === quizSubject)?.colour;
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
      const settingsIcon = node('span','settings-icon',''); settingsIcon.innerHTML = SBIcons.html('settings'); settings.append(settingsIcon);
      const wrap = profileButton?.closest('.hdr-profile-wrap'); if(wrap) wrap.after(settingsWrap); else header.append(settingsWrap);
    }
    document.querySelectorAll('button').forEach(el => { if(!el.getAttribute('aria-label') && !el.textContent.trim()) el.setAttribute('aria-label',el.title || el.dataset.tip || 'Action'); });
    continueCard();
  }
  window.SBQoL = { read, write, getJevApiKey, node, button, dialog, notify, linkFor, root, record, recordActivity, removeActivity, refreshContinue:continueCard, search, preferences, renderProfileSettings, catalogs, motionEnabled, applyPreferences };
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

// Knowledge Competition — lobby quiz tool.
// Games use the same question shape as HSC (isMultipleChoice + answers[].correct).
// Lobbies and games are stored on the StudyBase sync store so other signed-in
// players can join by code or from the public list.

(function () {
  const SAMPLE_FILE = 'storage/sample.json';
  const PUBLIC_KEY = '_kc_public';
  const SETTINGS_KEY = 'kc_settings';
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const LOBBY_TTL_MS = 6 * 60 * 60 * 1000;
  const POLL_MS = 2000;

  let gamesCache = [];
  let lobbyState = null;
  let editorDraft = null;
  let editorQIndex = 0;
  let pollTimer = null;
  let tickTimer = null;
  let lastPlayKey = '';
  let pendingJoin = null;
  let authReady = false;
  let answerBusy = false;

  const NAV = [
    { id: 'join', hash: '#join', icon: '🔑', label: 'Join lobby' },
    { id: 'create-lobby', hash: '#create-lobby', icon: '📡', label: 'Create lobby' },
    { id: 'games', hash: '#games', icon: '✎', label: 'Create game' },
    { id: 'settings', hash: '#settings', icon: '⚙', label: 'Settings' }
  ];

  window.kcOnAuth = function () { authReady = true; applyKcSkin(); route(); };

  window.showToast = window.showToast || function (msg, type, duration) {
    const c = document.getElementById('toast-container');
    if (!c) return;
    const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
    const t = document.createElement('div');
    t.className = 'toast ' + (type || 'info');
    t.innerHTML = '<span class="toast-icon"></span><span class="toast-msg"></span><button class="toast-close">×</button>';
    t.querySelector('.toast-icon').textContent = icons[type] || 'ℹ';
    t.querySelector('.toast-msg').textContent = msg;
    t.querySelector('.toast-close').onclick = () => t.remove();
    c.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 350); }, duration || 3000);
  };

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str == null ? '' : String(str);
    return d.innerHTML;
  }
  function canSync() {
    return !!(window.currentUid && !window.isGuest && typeof sbLoadKey === 'function' && typeof sbPushToSync === 'function');
  }
  function myUid() {
    return window.currentUid || localStorage.getItem('studybase_uid') || 'guest';
  }
  function myName() {
    const s = loadSettings();
    if (s.displayName) return s.displayName;
    const acct = window.sbAccount || {};
    return acct.name || localStorage.getItem('studybase_display_name') || 'Player';
  }
  function newId(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function gamesLocalKey() { return 'kc_games_' + myUid(); }
  function gamesSyncKey() { return '_kc_games_' + myUid(); }
  function lobbyKey(code) { return '_kc_lobby_' + String(code || '').toUpperCase(); }

  const SKINS = [
    { id: 'stage', name: 'Stage', blurb: 'Quiz-show spotlight, gold on velvet.' },
    { id: 'stacks', name: 'Stacks', blurb: 'Library aisle, paper over wood and books.' },
    { id: 'arena', name: 'Arena', blurb: 'Neon floor, game-night cyan and magenta.' }
  ];

  function loadSettings() {
    try {
      const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      const skin = SKINS.some(s => s.id === raw.skin) ? raw.skin : 'stage';
      return {
        displayName: String(raw.displayName || '').trim().slice(0, 40),
        questionSeconds: [10, 15, 20, 30, 45, 60].includes(Number(raw.questionSeconds)) ? Number(raw.questionSeconds) : 20,
        showFeedback: raw.showFeedback !== false,
        skin
      };
    } catch (e) {
      return { displayName: '', questionSeconds: 20, showFeedback: true, skin: 'stage' };
    }
  }
  function saveSettings(s) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      displayName: String(s.displayName || '').trim().slice(0, 40),
      questionSeconds: [10, 15, 20, 30, 45, 60].includes(Number(s.questionSeconds)) ? Number(s.questionSeconds) : 20,
      showFeedback: s.showFeedback !== false,
      skin: SKINS.some(x => x.id === s.skin) ? s.skin : 'stage'
    }));
    applyKcSkin();
  }
  function applyKcSkin() {
    const s = loadSettings();
    const skin = s.skin || 'stage';
    document.body.classList.remove('kc-skin-stage', 'kc-skin-stacks', 'kc-skin-arena', 'kc-light', 'light');
    document.body.classList.add('kc-skin-' + skin, 'kc-dark', 'dark');
    const bg = document.getElementById('kcBg');
    if (bg) bg.style.backgroundImage = 'url("backgrounds/kc-' + skin + '.jpg")';
  }
  window.applyKcSkin = applyKcSkin;

  async function sha256hex(text) {
    const data = new TextEncoder().encode(String(text || ''));
    if (!window.crypto || !crypto.subtle) {
      return 'plain:' + String(text || '');
    }
    const buf = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  let endingByTime = false;

  const Q_TYPES = [
    { id: 'choice', label: 'Choice' },
    { id: 'checkbox', label: 'Checkbox' },
    { id: 'truefalse', label: 'True / False' },
    { id: 'slider', label: 'Slider' }
  ];

  function questionTypeOf(q) {
    if (!q) return 'choice';
    if (q.type === 'slider' || q.slider) return 'slider';
    if (q.type === 'truefalse' || q.isTrueFalse) return 'truefalse';
    if (q.type === 'checkbox' || q.isCheckbox) return 'checkbox';
    return 'choice';
  }
  function typeLabel(q) {
    const hit = Q_TYPES.find(t => t.id === questionTypeOf(q));
    return hit ? hit.label : 'Choice';
  }
  function formatDuration(sec) {
    sec = Math.max(0, Math.round(Number(sec) || 0));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m + ':' + String(s).padStart(2, '0');
  }
  function questionCount(L) {
    return (L && L.game && Array.isArray(L.game.questions)) ? L.game.questions.length : 0;
  }
  function gameSecondsFor(L) {
    const n = questionCount(L) || 1;
    const auto = n * (L.questionSeconds || 20);
    const g = Number(L.gameSeconds);
    return g > 0 ? g : auto;
  }
  function gameTimeLeft(L) {
    const limit = gameSecondsFor(L) * 1000;
    if (!L || !L.gameStartedAt || L.status === 'waiting' || L.status === 'ended') return limit;
    return Math.max(0, limit - (Date.now() - L.gameStartedAt));
  }
  function initials(name) {
    const parts = String(name || 'P').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'P';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  function hueFor(id) {
    let h = 0;
    const s = String(id || '');
    for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
    return h % 360;
  }
  function streakOf(p) {
    const ans = p.answers || {};
    const keys = Object.keys(ans).map(Number).sort((a, b) => a - b);
    let n = 0;
    for (let i = keys.length - 1; i >= 0; i--) {
      if (ans[keys[i]] && ans[keys[i]].correct) n++;
      else break;
    }
    return n;
  }

  function blankAnswer(correct) { return { text: '', correct: !!correct }; }
  function blankQuestion(n, type) {
    type = type || 'choice';
    const q = {
      id: 'q' + n,
      name: 'Question ' + n,
      question: '',
      type,
      isMultipleChoice: type !== 'slider',
      isCheckbox: type === 'checkbox',
      answers: []
    };
    applyQuestionType(q, type, true);
    return q;
  }
  function applyQuestionType(q, type, fresh) {
    q.type = type;
    q.isMultipleChoice = type !== 'slider';
    q.isCheckbox = type === 'checkbox';
    if (type === 'truefalse') {
      const tOk = fresh ? true : !!(q.answers && q.answers.some(a => a.correct && String(a.text).toLowerCase() !== 'false'));
      q.answers = [{ text: 'True', correct: tOk }, { text: 'False', correct: !tOk }];
    } else if (type === 'slider') {
      const min = Number(q.sliderMin);
      const max = Number(q.sliderMax);
      const step = Number(q.sliderStep);
      let val = Number(q.sliderValue);
      q.sliderMin = isNaN(min) ? 0 : min;
      q.sliderMax = isNaN(max) ? 10 : (max <= q.sliderMin ? q.sliderMin + 10 : max);
      q.sliderStep = step > 0 ? step : 1;
      if (isNaN(val)) val = Math.round((q.sliderMin + q.sliderMax) / 2);
      q.sliderValue = Math.min(q.sliderMax, Math.max(q.sliderMin, val));
      q.answers = [{ text: String(q.sliderValue), correct: true }];
    } else if (type === 'checkbox') {
      if (!Array.isArray(q.answers) || q.answers.length < 2 || fresh) {
        q.answers = [blankAnswer(true), blankAnswer(true), blankAnswer(false), blankAnswer(false)];
      }
      if (!q.answers.some(a => a.correct)) q.answers[0].correct = true;
    } else {
      if (!Array.isArray(q.answers) || q.answers.length < 2 || (fresh && questionTypeOf({ type: q.type }) !== 'choice')) {
        if (!Array.isArray(q.answers) || q.answers.length < 2 || fresh) {
          q.answers = [blankAnswer(true), blankAnswer(false), blankAnswer(false), blankAnswer(false)];
        }
      }
      const first = q.answers.findIndex(a => a.correct);
      q.answers.forEach((a, i) => { a.correct = i === (first >= 0 ? first : 0); });
    }
  }
  function blankGame() {
    return {
      id: newId('g_'),
      name: 'Untitled game',
      description: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      questions: [blankQuestion(1)]
    };
  }

  function normalizeQuestion(raw, i) {
    const q = raw && typeof raw === 'object' ? raw : {};
    const type = questionTypeOf(q);
    const base = {
      id: String(q.id || 'q' + (i + 1)),
      name: String(q.name || ('Question ' + (i + 1))),
      question: String(q.question || q.name || ''),
      type,
      isMultipleChoice: type !== 'slider',
      isCheckbox: type === 'checkbox'
    };
    if (type === 'slider') {
      applyQuestionType(Object.assign(base, {
        sliderMin: q.sliderMin,
        sliderMax: q.sliderMax,
        sliderStep: q.sliderStep,
        sliderValue: q.sliderValue != null ? q.sliderValue : (q.answers && q.answers[0] && q.answers[0].text)
      }), 'slider', false);
      return base;
    }
    if (type === 'truefalse') {
      applyQuestionType(Object.assign(base, { answers: q.answers }), 'truefalse', false);
      return base;
    }
    let answers = Array.isArray(q.answers) ? q.answers.map(a => ({
      text: String(a && a.text != null ? a.text : ''),
      correct: !!(a && a.correct)
    })) : [];
    while (answers.length < 2) answers.push(blankAnswer(answers.length === 0));
    if (!answers.some(a => a.correct)) answers[0].correct = true;
    if (type === 'choice') {
      const firstCorrect = answers.findIndex(a => a.correct);
      answers.forEach((a, idx) => { a.correct = idx === firstCorrect; });
    }
    base.answers = answers;
    return base;
  }
  function questionReady(q) {
    if (!q || !String(q.question || '').trim()) return false;
    const t = questionTypeOf(q);
    if (t === 'slider') return Number(q.sliderMax) > Number(q.sliderMin) && Number(q.sliderStep) > 0;
    if (t === 'truefalse') return (q.answers || []).filter(a => a.correct).length === 1;
    const filled = (q.answers || []).filter(a => String(a.text || '').trim());
    if (filled.length < 2) return false;
    const nCorrect = filled.filter(a => a.correct).length;
    return t === 'checkbox' ? nCorrect >= 1 : nCorrect === 1;
  }
  function normalizeGame(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const questions = Array.isArray(raw.questions) ? raw.questions.map(normalizeQuestion) : [];
    if (!questions.length) questions.push(blankQuestion(1));
    return {
      id: String(raw.id || newId('g_')),
      name: String(raw.name || 'Untitled game'),
      description: String(raw.description || ''),
      createdAt: raw.createdAt || new Date().toISOString(),
      updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString(),
      questions
    };
  }

  async function loadGames() {
    if (canSync()) {
      try {
        const data = await sbLoadKey(gamesSyncKey());
        if (data && Array.isArray(data.games)) {
          gamesCache = data.games.map(normalizeGame).filter(Boolean);
          try { localStorage.setItem(gamesLocalKey(), JSON.stringify(gamesCache)); } catch (e) {}
          return gamesCache;
        }
      } catch (e) { /* fall through to local */ }
    }
    let list = [];
    try { list = JSON.parse(localStorage.getItem(gamesLocalKey()) || '[]'); } catch (e) { list = []; }
    gamesCache = (Array.isArray(list) ? list : []).map(normalizeGame).filter(Boolean);
    return gamesCache;
  }
  async function saveGames(list) {
    gamesCache = (list || []).map(normalizeGame).filter(Boolean);
    try { localStorage.setItem(gamesLocalKey(), JSON.stringify(gamesCache)); } catch (e) {}
    if (canSync()) {
      await sbPushToSync(gamesSyncKey(), { games: gamesCache, updatedAt: new Date().toISOString() });
    }
    return gamesCache;
  }

  async function loadLobby(code) {
    if (!canSync()) return null;
    const data = await sbLoadKey(lobbyKey(code));
    if (!data || typeof data !== 'object' || data.status === 'closed') return null;
    return data;
  }
  async function writeLobby(lobby) {
    lobby.updatedAt = new Date().toISOString();
    lobby.rev = (lobby.rev || 0) + 1;
    await sbPushToSync(lobbyKey(lobby.code), lobby);
    return lobby;
  }
  async function patchLobby(code, mutator) {
    let lastErr = null;
    for (let i = 0; i < 4; i++) {
      const lobby = await loadLobby(code);
      if (!lobby) throw new Error('Lobby not found');
      const before = JSON.stringify(lobby.players || []);
      await mutator(lobby);
      try {
        await writeLobby(lobby);
        return lobby;
      } catch (e) {
        lastErr = e;
        await new Promise(r => setTimeout(r, 120 * (i + 1)));
      }
      void before;
    }
    if (lastErr) throw lastErr;
    return loadLobby(code);
  }

  async function loadPublicIndex() {
    if (!canSync()) return [];
    try {
      const data = await sbLoadKey(PUBLIC_KEY);
      const items = data && Array.isArray(data.items) ? data.items : [];
      const cutoff = Date.now() - LOBBY_TTL_MS;
      return items.filter(it => {
        if (!it || !it.code) return false;
        if (it.status && it.status !== 'waiting' && it.status !== 'playing') return false;
        const t = Date.parse(it.createdAt || '') || 0;
        return !t || t >= cutoff;
      });
    } catch (e) {
      return [];
    }
  }
  async function upsertPublic(lobby) {
    if (!canSync()) return;
    let items = [];
    try {
      const data = await sbLoadKey(PUBLIC_KEY);
      items = data && Array.isArray(data.items) ? data.items.slice() : [];
    } catch (e) { items = []; }
    const summary = {
      code: lobby.code,
      gameName: lobby.gameName || 'Game',
      hostName: lobby.hostName || 'Host',
      playerCount: (lobby.players || []).length,
      hasPassword: !!lobby.passwordHash,
      status: lobby.status,
      createdAt: lobby.createdAt
    };
    const i = items.findIndex(x => x && x.code === lobby.code);
    if (lobby.visibility !== 'public' || lobby.status === 'closed' || lobby.status === 'ended') {
      if (i >= 0) items.splice(i, 1);
    } else if (i >= 0) {
      items[i] = summary;
    } else {
      items.unshift(summary);
    }
    items = items.slice(0, 80);
    await sbPushToSync(PUBLIC_KEY, { items, updatedAt: new Date().toISOString() });
  }

  function makeCode() {
    let s = '';
    for (let i = 0; i < 6; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return s;
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  }
  function startPolling(fn) {
    stopPolling();
    pollTimer = setInterval(fn, POLL_MS);
  }

  function setCrumb(pageLabel) {
    const sep = document.getElementById('hdrKcSep');
    const cur = document.getElementById('hdrCurrent');
    if (!cur || !sep) return;
    if (!pageLabel || pageLabel === 'Home') {
      sep.hidden = true;
      cur.hidden = true;
      cur.textContent = '';
    } else {
      sep.hidden = false;
      cur.hidden = false;
      cur.textContent = pageLabel;
    }
  }
  function setHdrCode(code) {
    const el = document.getElementById('kcHdrCode');
    if (!el) return;
    const val = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!val) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = val;
  }
  function setSidebarMode(on) {
    document.body.classList.toggle('kc-has-sidebar', !!on);
  }

  function parseHash() {
    const raw = (location.hash || '#home').replace(/^#/, '');
    const parts = raw.split('/').filter(Boolean);
    return { page: parts[0] || 'home', id: parts[1] || '', extra: parts.slice(2).join('/') };
  }
  function go(hash) {
    if (location.hash === hash) route();
    else location.hash = hash.replace(/^#/, '#');
  }

  async function route() {
    const { page, id } = parseHash();
    stopPolling();
    lastPlayKey = '';
    document.body.classList.remove('kc-home-layout');
    if (page !== 'room') setHdrCode('');
    try {
      if (page === 'join') return await showJoin(id);
      if (page === 'create-lobby') return await showCreateLobby();
      if (page === 'games') return await showGames();
      if (page === 'game') return await showEditor(id || 'new');
      if (page === 'settings') return showSettings();
      if (page === 'room') return await showRoom(id);
      return showHome();
    } catch (err) {
      showToast(err.message || 'Something went wrong', 'error');
      showHome();
    }
  }

  function renderNavSidebar(active, extraHtml) {
    const sidebar = document.getElementById('kcSidebar');
    const nav = NAV.map(n =>
      `<div class="kc-nav-item${n.id === active ? ' active' : ''}" data-hash="${n.hash}">
         <span>${n.icon}</span><span>${escapeHtml(n.label)}</span>
       </div>`
    ).join('');
    sidebar.innerHTML =
      `<div class="sidebar-top"><div class="search-wrap" style="padding:10px 12px 6px">
         <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted2)">Menu</div>
       </div></div>
       <div>${nav}</div>
       ${extraHtml || ''}`;
    sidebar.querySelectorAll('[data-hash]').forEach(el => {
      el.addEventListener('click', () => go(el.getAttribute('data-hash')));
    });
  }

  function showHome() {
    setCrumb('Home');
    setSidebarMode(false);
    document.body.classList.add('kc-home-layout');
    renderNavSidebar('');
    const canvas = document.getElementById('kcCanvas');
    canvas.innerHTML = `
      <div class="kc-wrap kc-home">
        <div class="kc-kicker">Live quiz</div>
        <h1 class="kc-title">Knowledge Competition</h1>
      </div>`;
  }

  async function showJoin(prefill) {
    setCrumb('Join lobby');
    setSidebarMode(false);
    renderNavSidebar('join');
    const canvas = document.getElementById('kcCanvas');
    canvas.innerHTML = `
      <div class="kc-wrap">
        <div class="kc-kicker">Join</div>
        <h1 class="kc-title">Join a lobby</h1>
        <p class="kc-lead">Type the 6-character code from the host, or join a public lobby below.</p>
        <div class="kc-card">
          <label class="kc-label" for="kcJoinCode">Lobby code</label>
          <div style="display:flex;gap:8px">
            <input class="kc-input" id="kcJoinCode" maxlength="8" placeholder="e.g. 7K2M9P" autocomplete="off" style="text-transform:uppercase;letter-spacing:.12em;font-family:'JetBrains Mono',monospace;font-weight:700">
            <button type="button" class="kc-btn kc-btn-primary" id="kcJoinBtn">Join</button>
          </div>
        </div>
        <div class="kc-card">
          <div class="kc-label">Public lobbies</div>
          <div class="kc-list" id="kcPublicList"><div class="kc-empty">Loading…</div></div>
        </div>
      </div>`;
    const input = canvas.querySelector('#kcJoinCode');
    if (prefill) input.value = String(prefill).toUpperCase();
    const join = () => tryJoin(input.value.trim());
    canvas.querySelector('#kcJoinBtn').addEventListener('click', join);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') join(); });
    await refreshPublicList();
    startPolling(refreshPublicList);
  }

  async function refreshPublicList() {
    const box = document.getElementById('kcPublicList');
    if (!box) return;
    if (!canSync()) {
      box.innerHTML = '<div class="kc-empty">Sign in with an approved account to see public lobbies.</div>';
      return;
    }
    const items = await loadPublicIndex();
    if (!items.length) {
      box.innerHTML = '<div class="kc-empty">No public lobbies right now. Create one, or join with a code.</div>';
      return;
    }
    box.innerHTML = items.map(it => `
      <div class="kc-row" data-code="${escapeHtml(it.code)}">
        <div class="kc-row-main">
          <div class="kc-row-name"></div>
          <div class="kc-row-sub"></div>
        </div>
        <span class="kc-chip">${escapeHtml(it.code)}</span>
        ${it.hasPassword ? '<span class="kc-chip lock">Password</span>' : ''}
        <button type="button" class="kc-btn kc-btn-primary" data-join="${escapeHtml(it.code)}">Join</button>
      </div>`).join('');
    box.querySelectorAll('.kc-row').forEach((row, i) => {
      const it = items[i];
      row.querySelector('.kc-row-name').textContent = it.gameName || 'Game';
      row.querySelector('.kc-row-sub').textContent =
        (it.hostName || 'Host') + ' · ' + (it.playerCount || 0) + ' player' + ((it.playerCount || 0) === 1 ? '' : 's') +
        (it.status === 'playing' ? ' · in progress' : '');
    });
    box.querySelectorAll('[data-join]').forEach(btn => {
      btn.addEventListener('click', () => tryJoin(btn.getAttribute('data-join')));
    });
  }

  async function tryJoin(codeRaw, password) {
    const code = String(codeRaw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    if (code.length < 4) {
      showToast('Enter a lobby code', 'warning');
      return false;
    }
    if (!canSync()) {
      showToast('Sign in to join a lobby', 'warning');
      return false;
    }
    const lobby = await loadLobby(code);
    if (!lobby) {
      showToast('No lobby with that code', 'error');
      return false;
    }
    if (lobby.passwordHash && !password) {
      promptPassword(code);
      return false;
    }
    if (lobby.passwordHash) {
      const hash = await sha256hex(password);
      if (hash !== lobby.passwordHash) {
        showToast('Wrong password', 'error');
        return false;
      }
    }
    await patchLobby(code, L => {
      L.players = Array.isArray(L.players) ? L.players : [];
      if (!L.players.some(p => p.uid === myUid())) {
        L.players.push({ uid: myUid(), name: myName(), score: 0, answers: {} });
      } else {
        const me = L.players.find(p => p.uid === myUid());
        me.name = myName();
      }
    });
    if (lobby.visibility === 'public') {
      const next = await loadLobby(code);
      if (next) upsertPublic(next).catch(() => {});
    }
    go('#room/' + code);
    return true;
  }

  function promptPassword(code) {
    pendingJoin = { code };
    const bg = document.getElementById('kcModalBg');
    document.getElementById('kcModalTitle').textContent = 'Lobby password';
    document.getElementById('kcModalLead').textContent = 'This lobby is password protected. Enter the password to join ' + code + '.';
    document.getElementById('kcModalBody').innerHTML =
      '<input class="kc-input" id="kcModalPass" type="password" placeholder="Password" autocomplete="off">';
    document.getElementById('kcModalOk').textContent = 'Join';
    bg.classList.add('on');
    bg.removeAttribute('hidden');
    bg.setAttribute('aria-hidden', 'false');
    const inp = document.getElementById('kcModalPass');
    setTimeout(() => inp && inp.focus(), 50);
  }

  async function showCreateLobby() {
    setCrumb('Create lobby');
    setSidebarMode(false);
    renderNavSidebar('create-lobby');
    await loadGames();
    const canvas = document.getElementById('kcCanvas');
    if (!gamesCache.length) {
      canvas.innerHTML = `
        <div class="kc-wrap">
          <div class="kc-kicker">Host</div>
          <h1 class="kc-title">Create a lobby</h1>
          <div class="kc-empty">You need a game first. Create one (or copy the sample) and come back here.
            <div class="kc-actions" style="justify-content:center;margin-top:14px">
              <button type="button" class="kc-btn kc-btn-primary" data-hash="#games">Create game</button>
            </div>
          </div>
        </div>`;
      canvas.querySelector('[data-hash]').addEventListener('click', () => go('#games'));
      return;
    }
    const opts = gamesCache.map(g => `<option value="${escapeHtml(g.id)}"></option>`).join('');
    const secs = loadSettings().questionSeconds;
    canvas.innerHTML = `
      <div class="kc-wrap">
        <div class="kc-kicker">Host</div>
        <h1 class="kc-title">Create a lobby</h1>
        <p class="kc-lead">Pick a game, choose whether anyone can find it, and optionally lock it with a password. A unique code is assigned when you create it.</p>
        <div class="kc-card">
          <div class="kc-field">
            <label class="kc-label" for="kcLobbyGame">Game</label>
            <select class="kc-select" id="kcLobbyGame">${opts}</select>
          </div>
          <div class="kc-field">
            <div class="kc-label">Visibility</div>
            <div class="kc-seg" id="kcVis">
              <button type="button" class="kc-seg-btn on" data-vis="public">Public</button>
              <button type="button" class="kc-seg-btn" data-vis="private">Private</button>
            </div>
            <div class="kc-hint" id="kcVisHint">Public lobbies show up on the Join page for anyone signed in.</div>
          </div>
          <div class="kc-field">
            <label class="kc-label" for="kcLobbyPass">Password (optional)</label>
            <input class="kc-input" id="kcLobbyPass" type="password" placeholder="Leave blank for no password" autocomplete="new-password">
          </div>
          <div class="kc-field">
            <label class="kc-label" for="kcLobbySecs">Seconds per question</label>
            <select class="kc-select" id="kcLobbySecs">
              ${[10, 15, 20, 30, 45, 60].map(n => `<option value="${n}"${n === secs ? ' selected' : ''}>${n} seconds</option>`).join('')}
            </select>
          </div>
          <div class="kc-actions">
            <button type="button" class="kc-btn" data-hash="#home">Cancel</button>
            <button type="button" class="kc-btn kc-btn-primary" id="kcCreateLobbyBtn">Create lobby</button>
          </div>
        </div>
      </div>`;
    canvas.querySelectorAll('#kcLobbyGame option').forEach((opt, i) => {
      opt.textContent = gamesCache[i].name + ' · ' + gamesCache[i].questions.length + ' questions';
    });
    let vis = 'public';
    canvas.querySelectorAll('[data-vis]').forEach(btn => {
      btn.addEventListener('click', () => {
        vis = btn.getAttribute('data-vis');
        canvas.querySelectorAll('[data-vis]').forEach(b => b.classList.toggle('on', b === btn));
        canvas.querySelector('#kcVisHint').textContent = vis === 'public'
          ? 'Public lobbies show up on the Join page for anyone signed in.'
          : 'Private lobbies are joinable only with the unique code.';
      });
    });
    canvas.querySelector('[data-hash]').addEventListener('click', () => go('#home'));
    canvas.querySelector('#kcCreateLobbyBtn').addEventListener('click', async () => {
      const game = gamesCache.find(g => g.id === canvas.querySelector('#kcLobbyGame').value);
      if (!game) return;
      try {
        await createLobby(game, vis, canvas.querySelector('#kcLobbyPass').value, Number(canvas.querySelector('#kcLobbySecs').value));
      } catch (e) {
        showToast(e.message || 'Could not create lobby', 'error');
      }
    });
  }

  async function createLobby(game, visibility, password, questionSeconds) {
    if (!canSync()) throw new Error('Sign in to create a lobby');
    const snapshot = normalizeGame(JSON.parse(JSON.stringify(game)));
    if (!snapshot.questions.some(q => q.question.trim() && q.answers.filter(a => a.text.trim()).length >= 2)) {
      throw new Error('This game needs at least one complete question');
    }
    let code = '';
    for (let i = 0; i < 10; i++) {
      const tryCode = makeCode();
      const existing = await sbLoadKey(lobbyKey(tryCode));
      if (!existing) { code = tryCode; break; }
    }
    if (!code) throw new Error('Could not assign a unique code — try again');
    const pass = String(password || '').trim();
    const lobby = {
      code,
      visibility: visibility === 'private' ? 'private' : 'public',
      passwordHash: pass ? await sha256hex(pass) : '',
      hostUid: myUid(),
      hostName: myName(),
      gameId: snapshot.id,
      gameName: snapshot.name,
      game: { name: snapshot.name, questions: snapshot.questions },
      status: 'waiting',
      questionIndex: 0,
      questionStartedAt: 0,
      questionSeconds: questionSeconds || 20,
      players: [{ uid: myUid(), name: myName(), score: 0, answers: {} }],
      createdAt: new Date().toISOString(),
      rev: 0
    };
    await writeLobby(lobby);
    await upsertPublic(lobby);
    showToast('Lobby ' + code + ' created', 'success');
    go('#room/' + code);
  }

  async function showGames() {
    setCrumb('Create game');
    setSidebarMode(false);
    renderNavSidebar('games');
    await loadGames();
    const canvas = document.getElementById('kcCanvas');
    const rows = gamesCache.map(g => `
      <div class="kc-row" data-id="${escapeHtml(g.id)}">
        <div class="kc-row-main">
          <div class="kc-row-name"></div>
          <div class="kc-row-sub"></div>
        </div>
        <div class="kc-row-actions">
          <button type="button" class="kc-btn" data-act="edit">Edit</button>
          <button type="button" class="kc-btn" data-act="copy">Copy</button>
          <button type="button" class="kc-btn kc-btn-danger" data-act="del">Delete</button>
        </div>
      </div>`).join('');
    canvas.innerHTML = `
      <div class="kc-wrap">
        <div class="kc-kicker">Games</div>
        <h1 class="kc-title">Create game</h1>
        <p class="kc-lead">Start a new quiz, or edit / copy one you already have. Each question has several answers and exactly one that is right — same structure as the HSC tool.</p>
        <div class="kc-actions left" style="margin-top:0;margin-bottom:12px">
          <button type="button" class="kc-btn kc-btn-primary" id="kcNewGame">New game</button>
          <button type="button" class="kc-btn" id="kcSample">Copy sample game</button>
        </div>
        <div class="kc-list" id="kcGameList">
          ${rows || '<div class="kc-empty">No games yet. Create one or copy the sample to get started.</div>'}
        </div>
      </div>`;
    canvas.querySelectorAll('.kc-row').forEach((row, i) => {
      const g = gamesCache[i];
      row.querySelector('.kc-row-name').textContent = g.name;
      row.querySelector('.kc-row-sub').textContent = g.questions.length + ' question' + (g.questions.length === 1 ? '' : 's');
      row.querySelector('[data-act="edit"]').addEventListener('click', () => go('#game/' + g.id));
      row.querySelector('[data-act="copy"]').addEventListener('click', () => copyGame(g.id));
      row.querySelector('[data-act="del"]').addEventListener('click', () => deleteGame(g.id));
    });
    canvas.querySelector('#kcNewGame').addEventListener('click', () => go('#game/new'));
    canvas.querySelector('#kcSample').addEventListener('click', copySample);
  }

  async function copyGame(id) {
    await loadGames();
    const src = gamesCache.find(g => g.id === id);
    if (!src) return;
    const copy = normalizeGame(JSON.parse(JSON.stringify(src)));
    copy.id = newId('g_');
    copy.name = src.name.replace(/\s*\(copy\)\s*$/i, '') + ' (copy)';
    copy.createdAt = new Date().toISOString();
    copy.updatedAt = copy.createdAt;
    gamesCache.unshift(copy);
    await saveGames(gamesCache);
    showToast('Copied "' + copy.name + '"', 'success');
    go('#game/' + copy.id);
  }
  async function deleteGame(id) {
    if (!confirm('Delete this game? This cannot be undone.')) return;
    await loadGames();
    await saveGames(gamesCache.filter(g => g.id !== id));
    showToast('Game deleted', 'info');
    showGames();
  }
  async function copySample() {
    try {
      const res = await fetch(SAMPLE_FILE, { cache: 'no-store' });
      if (!res.ok) throw new Error('Could not load sample');
      const raw = await res.json();
      const copy = normalizeGame(raw);
      copy.id = newId('g_');
      copy.createdAt = new Date().toISOString();
      copy.updatedAt = copy.createdAt;
      await loadGames();
      gamesCache.unshift(copy);
      await saveGames(gamesCache);
      showToast('Sample game added', 'success');
      go('#game/' + copy.id);
    } catch (e) {
      showToast(e.message || 'Could not copy sample', 'error');
    }
  }

  async function showEditor(id) {
    setCrumb(id === 'new' ? 'New game' : 'Edit game');
    setSidebarMode(true);
    await loadGames();
    if (id === 'new') {
      editorDraft = blankGame();
    } else {
      const found = gamesCache.find(g => g.id === id);
      if (!found) {
        showToast('Game not found', 'error');
        return go('#games');
      }
      editorDraft = normalizeGame(JSON.parse(JSON.stringify(found)));
    }
    editorQIndex = 0;
    renderEditor();
  }

  function markEditorQuestion(i) {
    editorQIndex = i;
    document.querySelectorAll('.kc-q-block').forEach((el, n) => {
      el.classList.toggle('active', n === i);
    });
    document.querySelectorAll('#kcSidebar .topic-item').forEach((el, n) => {
      el.classList.toggle('active', n === i);
    });
  }
  function scrollEditorToQuestion(i) {
    markEditorQuestion(i);
    const el = document.getElementById('kcQBlock-' + i);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderEditor(opts) {
    const g = editorDraft;
    if (!g) return;
    if (editorQIndex >= g.questions.length) editorQIndex = g.questions.length - 1;
    if (editorQIndex < 0) editorQIndex = 0;
    const canvas = document.getElementById('kcCanvas');
    const keepY = opts && opts.keepScroll ? canvas.scrollTop : null;
    const jumpTo = opts && opts.scrollTo != null ? opts.scrollTo : null;
    renderEditorSidebar();

    const blocks = g.questions.map((q, qi) => {
      const ans = q.answers.map((a, i) => `
        <div class="kc-ans-edit" data-qi="${qi}" data-ai="${i}">
          <input type="radio" name="kcCorrect-${qi}" ${a.correct ? 'checked' : ''} title="Mark as the correct answer">
          <input class="kc-input kc-ans-text" placeholder="Answer ${i + 1}">
          <button type="button" class="kc-ans-del" title="Remove answer" ${q.answers.length <= 2 ? 'disabled' : ''}>×</button>
        </div>`).join('');
      return `
        <div class="kc-q-block${qi === editorQIndex ? ' active' : ''}" id="kcQBlock-${qi}" data-qi="${qi}">
          <div class="kc-q-head">
            <span class="kc-q-head-name"></span>
            <span style="font-size:13px;font-weight:400;color:var(--muted2)">(1 mark)</span>
          </div>
          <div class="kc-field">
            <label class="kc-label">Question</label>
            <textarea class="kc-ta kc-q-stem" placeholder="Write the question…"></textarea>
          </div>
          <div class="kc-label">Answers — tick the one that is right</div>
          <div class="kc-ans-list">${ans}</div>
          <div class="kc-actions left">
            <button type="button" class="kc-btn kc-add-ans" ${q.answers.length >= 6 ? 'disabled' : ''}>+ Add answer</button>
            <button type="button" class="kc-btn kc-btn-danger kc-del-q" ${g.questions.length <= 1 ? 'disabled' : ''}>Delete question</button>
          </div>
        </div>`;
    }).join('');

    canvas.innerHTML = `
      <div class="kc-wrap">
        <div class="kc-kicker">${g.id && gamesCache.some(x => x.id === g.id) ? 'Edit game' : 'New game'}</div>
        <div class="kc-field">
          <label class="kc-label" for="kcGameName">Game name</label>
          <input class="kc-input" id="kcGameName">
        </div>
        <div class="kc-field">
          <label class="kc-label" for="kcGameDesc">Description (optional)</label>
          <input class="kc-input" id="kcGameDesc" placeholder="What is this quiz about?">
        </div>
        ${blocks}
        <div class="kc-actions left" style="margin-bottom:12px">
          <button type="button" class="kc-btn" id="kcAddQBottom">+ Add question</button>
        </div>
        <div class="kc-actions">
          <button type="button" class="kc-btn" id="kcCancelGame">Back</button>
          <button type="button" class="kc-btn kc-btn-primary" id="kcSaveGame">Save game</button>
        </div>
      </div>`;
    canvas.querySelector('#kcGameName').value = g.name;
    canvas.querySelector('#kcGameDesc').value = g.description;
    canvas.querySelector('#kcGameName').addEventListener('input', e => { g.name = e.target.value; });
    canvas.querySelector('#kcGameDesc').addEventListener('input', e => { g.description = e.target.value; });

    canvas.querySelectorAll('.kc-q-block').forEach((block, qi) => {
      const q = g.questions[qi];
      block.querySelector('.kc-q-head-name').textContent = q.name;
      const stem = block.querySelector('.kc-q-stem');
      stem.value = q.question;
      stem.addEventListener('input', e => { q.question = e.target.value; });
      stem.addEventListener('focus', () => markEditorQuestion(qi));
      block.querySelectorAll('.kc-ans-edit').forEach((row, i) => {
        row.querySelector('.kc-ans-text').value = q.answers[i].text;
        row.querySelector('.kc-ans-text').addEventListener('input', e => { q.answers[i].text = e.target.value; });
        row.querySelector('.kc-ans-text').addEventListener('focus', () => markEditorQuestion(qi));
        row.querySelector('input[type="radio"]').addEventListener('change', () => {
          q.answers.forEach((a, j) => { a.correct = j === i; });
        });
        row.querySelector('.kc-ans-del').addEventListener('click', () => {
          if (q.answers.length <= 2) return;
          const wasCorrect = q.answers[i].correct;
          q.answers.splice(i, 1);
          if (wasCorrect || !q.answers.some(a => a.correct)) q.answers[0].correct = true;
          editorQIndex = qi;
          renderEditor({ keepScroll: true });
        });
      });
      block.querySelector('.kc-add-ans').addEventListener('click', () => {
        if (q.answers.length >= 6) return;
        q.answers.push(blankAnswer(false));
        editorQIndex = qi;
        renderEditor({ keepScroll: true });
      });
      block.querySelector('.kc-del-q').addEventListener('click', () => {
        if (g.questions.length <= 1) return;
        g.questions.splice(qi, 1);
        g.questions.forEach((qq, n) => { qq.name = 'Question ' + (n + 1); qq.id = 'q' + (n + 1); });
        editorQIndex = Math.min(qi, g.questions.length - 1);
        renderEditor({ keepScroll: true });
      });
    });

    canvas.querySelector('#kcAddQBottom').addEventListener('click', () => {
      g.questions.push(blankQuestion(g.questions.length + 1));
      editorQIndex = g.questions.length - 1;
      renderEditor({ scrollTo: editorQIndex });
    });
    canvas.querySelector('#kcCancelGame').addEventListener('click', () => go('#games'));
    canvas.querySelector('#kcSaveGame').addEventListener('click', saveEditor);

    if (keepY != null) canvas.scrollTop = keepY;
    if (jumpTo != null) {
      editorQIndex = jumpTo;
      requestAnimationFrame(() => scrollEditorToQuestion(jumpTo));
    }
  }

  function renderEditorSidebar() {
    const g = editorDraft;
    const rows = g.questions.map((q, i) => {
      const ok = q.question.trim() && q.answers.filter(a => a.text.trim()).length >= 2 && q.answers.some(a => a.correct);
      return `<div class="topic-item-wrap" data-qi="${i}">
        <div class="topic-item${i === editorQIndex ? ' active' : ''}">
          <div class="ti-top"><div class="ti-name"><span class="ti-name-text"></span></div></div>
          <div class="ti-unit">${ok ? 'Ready' : 'Incomplete'}</div>
        </div>
      </div>`;
    }).join('');
    const sidebar = document.getElementById('kcSidebar');
    sidebar.innerHTML = `
      <div class="sidebar-top">
        <div class="search-wrap" style="padding:12px 14px 8px">
          <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted2)">Questions</div>
        </div>
      </div>
      <div style="display:flex;border-top:1px solid var(--border);border-bottom:1px solid var(--border)">
        <div style="padding:4px 16px;font-size:11px;color:var(--muted2)">
          <strong style="color:var(--accent)">${g.questions.length}</strong> question${g.questions.length === 1 ? '' : 's'}
        </div>
      </div>
      <div class="topic-list">${rows}</div>
      <div style="padding:10px 12px;display:flex;flex-direction:column;gap:6px;border-top:1px solid var(--border)">
        <button type="button" class="kc-btn kc-btn-primary" id="kcAddQ">+ Add question</button>
      </div>`;
    sidebar.querySelectorAll('.topic-item-wrap').forEach((wrap, i) => {
      wrap.querySelector('.ti-name-text').textContent = g.questions[i].name;
      wrap.addEventListener('click', () => scrollEditorToQuestion(i));
    });
    sidebar.querySelector('#kcAddQ').addEventListener('click', () => {
      g.questions.push(blankQuestion(g.questions.length + 1));
      editorQIndex = g.questions.length - 1;
      renderEditor({ scrollTo: editorQIndex });
    });
  }

  async function saveEditor() {
    const g = normalizeGame(editorDraft);
    g.name = g.name.trim() || 'Untitled game';
    g.updatedAt = new Date().toISOString();
    for (let i = 0; i < g.questions.length; i++) {
      const q = g.questions[i];
      if (!q.question.trim()) {
        renderEditor({ scrollTo: i });
        showToast('Question ' + (i + 1) + ' needs wording', 'warning');
        return;
      }
      const filled = q.answers.filter(a => a.text.trim());
      if (filled.length < 2) {
        renderEditor({ scrollTo: i });
        showToast('Question ' + (i + 1) + ' needs at least two answers', 'warning');
        return;
      }
      if (filled.filter(a => a.correct).length !== 1) {
        renderEditor({ scrollTo: i });
        showToast('Question ' + (i + 1) + ' needs exactly one correct answer', 'warning');
        return;
      }
      q.answers = filled;
    }
    await loadGames();
    const idx = gamesCache.findIndex(x => x.id === g.id);
    if (idx >= 0) gamesCache[idx] = g;
    else gamesCache.unshift(g);
    await saveGames(gamesCache);
    editorDraft = g;
    showToast('Game saved', 'success');
    go('#games');
  }

  function showSettings() {
    setCrumb('Settings');
    setSidebarMode(false);
    renderNavSidebar('settings');
    const s = loadSettings();
    const canvas = document.getElementById('kcCanvas');
    canvas.innerHTML = `
      <div class="kc-wrap">
        <div class="kc-kicker">Settings</div>
        <h1 class="kc-title">Settings</h1>
        <p class="kc-lead">Looks and name stay on this device. Layouts use photo backgrounds — they are not the hub theme.</p>
        <div class="kc-card">
          <div class="kc-label">Layout</div>
          <div class="kc-skin-grid" id="kcSkinGrid">
            ${SKINS.map(sk => `
              <button type="button" class="kc-skin-pick${s.skin === sk.id ? ' on' : ''}" data-skin="${sk.id}">
                <span class="kc-skin-thumb" style="background-image:url('backgrounds/kc-${sk.id}.jpg')"></span>
                <strong></strong>
                <span></span>
              </button>`).join('')}
          </div>
          <div class="kc-field">
            <label class="kc-label" for="kcSetName">Display name in lobbies</label>
            <input class="kc-input" id="kcSetName" maxlength="40" placeholder="${escapeHtml(myName())}">
          </div>
          <div class="kc-field">
            <label class="kc-label" for="kcSetSecs">Default seconds per question</label>
            <select class="kc-select" id="kcSetSecs">
              ${[10, 15, 20, 30, 45, 60].map(n => `<option value="${n}"${n === s.questionSeconds ? ' selected' : ''}>${n} seconds</option>`).join('')}
            </select>
          </div>
          <label class="kc-check">
            <input type="checkbox" id="kcSetFb" ${s.showFeedback ? 'checked' : ''}>
            Show the correct answer after each question
          </label>
          <div class="kc-actions">
            <button type="button" class="kc-btn kc-btn-primary" id="kcSaveSet">Save settings</button>
          </div>
        </div>
      </div>`;
    canvas.querySelectorAll('.kc-skin-pick').forEach((btn, i) => {
      btn.querySelector('strong').textContent = SKINS[i].name;
      btn.querySelector('span:last-child').textContent = SKINS[i].blurb;
      btn.addEventListener('click', () => {
        const next = Object.assign({}, loadSettings(), { skin: btn.getAttribute('data-skin') });
        saveSettings(next);
        canvas.querySelectorAll('.kc-skin-pick').forEach(b => b.classList.toggle('on', b === btn));
      });
    });
    canvas.querySelector('#kcSetName').value = s.displayName;
    canvas.querySelector('#kcSaveSet').addEventListener('click', () => {
      saveSettings(Object.assign({}, loadSettings(), {
        displayName: canvas.querySelector('#kcSetName').value.trim().slice(0, 40),
        questionSeconds: Number(canvas.querySelector('#kcSetSecs').value) || 20,
        showFeedback: canvas.querySelector('#kcSetFb').checked
      }));
      showToast('Settings saved', 'success');
    });
  }

  async function showRoom(code) {
    if (!code) return go('#join');
    if (!canSync()) {
      showToast('Sign in to enter a lobby', 'warning');
      return go('#join');
    }
    const lobby = await loadLobby(code);
    if (!lobby) {
      showToast('That lobby is gone', 'error');
      return go('#join');
    }
    lobbyState = lobby;
    if (!lobby.players.some(p => p.uid === myUid())) {
      await tryJoin(code);
      return;
    }
    setSidebarMode(true);
    startPolling(() => refreshRoom(code));
    renderRoom();
  }

  async function refreshRoom(code) {
    try {
      const lobby = await loadLobby(code);
      if (!lobby) {
        stopPolling();
        showToast('Lobby closed', 'info');
        return go('#home');
      }
      lobbyState = lobby;
      if (lobby.status === 'playing' || lobby.status === 'review') renderPlay(false);
      else if (lobby.status === 'ended') renderResults();
      else renderWaiting();
    } catch (e) { /* keep last view */ }
  }

  function isHost() {
    return !!(lobbyState && lobbyState.hostUid === myUid());
  }

  function renderRoom() {
    const L = lobbyState;
    if (!L) return;
    if (L.status === 'playing' || L.status === 'review') return renderPlay(true);
    if (L.status === 'ended') return renderResults();
    renderWaiting();
  }

  function renderPlayerSidebar(title) {
    const L = lobbyState;
    const ranked = (L.players || []).slice().sort((a, b) => (b.score || 0) - (a.score || 0));
    const rows = ranked.map(p => {
      const role = p.uid === myUid() ? 'You' : (p.uid === L.hostUid ? 'Host' : 'Player');
      return `<div class="topic-item-wrap">
        <div class="topic-item${p.uid === myUid() ? ' active' : ''}">
          <div class="ti-top"><div class="ti-name"><span class="ti-name-text"></span></div>
            <span style="font-size:11px;font-weight:700;color:var(--accent)">${p.score || 0}</span>
          </div>
          <div class="ti-unit">${role}</div>
        </div>
      </div>`;
    }).join('');
    const sidebar = document.getElementById('kcSidebar');
    sidebar.innerHTML = `
      <div class="sidebar-top">
        <div class="search-wrap" style="padding:12px 14px 8px">
          <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted2)">${escapeHtml(title || 'Players')}</div>
        </div>
      </div>
      <div style="display:flex;border-top:1px solid var(--border);border-bottom:1px solid var(--border)">
        <div style="padding:4px 16px;font-size:11px;color:var(--muted2)">
          <strong style="color:var(--accent)">${(L.players || []).length}</strong> in lobby
        </div>
      </div>
      <div class="topic-list">${rows}</div>
      <div style="padding:10px 12px;border-top:1px solid var(--border)">
        <button type="button" class="kc-btn" id="kcLeave" style="width:100%">Leave lobby</button>
      </div>`;
    sidebar.querySelectorAll('.ti-name-text').forEach((el, i) => {
      el.textContent = ranked[i].name || 'Player';
    });
    sidebar.querySelector('#kcLeave').addEventListener('click', leaveLobby);
  }

  function renderWaiting() {
    const L = lobbyState;
    setCrumb('Waiting');
    setHdrCode(L.code);
    renderPlayerSidebar('Waiting');
    const canvas = document.getElementById('kcCanvas');
    const vis = L.visibility === 'private' ? 'Private' : 'Public';
    canvas.innerHTML = `
      <div class="kc-wrap">
        <div class="kc-kicker">Waiting room</div>
        <h1 class="kc-title"></h1>
        <div class="kc-card kc-code-box">
          <div class="kc-label">Lobby code</div>
          <div class="kc-code" id="kcCodeBig"></div>
          <div class="kc-code-meta">${escapeHtml(vis)}${L.passwordHash ? ' · password on' : ''} · ${escapeHtml(L.gameName || 'Game')}</div>
          <div class="kc-actions" style="justify-content:center;margin-top:12px">
            <button type="button" class="kc-btn" id="kcCopyCode">Copy code</button>
          </div>
        </div>
        <div class="kc-actions">
          ${isHost() ? '<button type="button" class="kc-btn kc-btn-danger" id="kcCloseLobby">Close lobby</button><button type="button" class="kc-btn kc-btn-primary" id="kcStart">Start game</button>' : '<div class="kc-hint">Waiting for the host to start…</div>'}
        </div>
      </div>`;
    canvas.querySelector('.kc-title').textContent = L.gameName || 'Lobby';
    canvas.querySelector('#kcCodeBig').textContent = L.code;
    canvas.querySelector('#kcCopyCode').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(L.code);
        showToast('Code copied', 'success');
      } catch (e) {
        showToast(L.code, 'info');
      }
    });
    const startBtn = canvas.querySelector('#kcStart');
    if (startBtn) startBtn.addEventListener('click', startGame);
    const closeBtn = canvas.querySelector('#kcCloseLobby');
    if (closeBtn) closeBtn.addEventListener('click', closeLobby);
  }

  async function startGame() {
    if (!isHost() || !lobbyState) return;
    try {
      await patchLobby(lobbyState.code, L => {
        L.status = 'playing';
        L.questionIndex = 0;
        L.questionStartedAt = Date.now();
        (L.players || []).forEach(p => { p.score = 0; p.answers = {}; });
      });
      lobbyState = await loadLobby(lobbyState.code);
      await upsertPublic(lobbyState);
      renderPlay(true);
    } catch (e) {
      showToast(e.message || 'Could not start', 'error');
    }
  }

  function questionTimeLeft(L) {
    const limit = (L.questionSeconds || 20) * 1000;
    const started = L.questionStartedAt || Date.now();
    return Math.max(0, limit - (Date.now() - started));
  }

  function renderPlay(force) {
    const L = lobbyState;
    if (!L || !L.game || !Array.isArray(L.game.questions)) return;
    const qs = L.game.questions;
    const idx = Math.min(L.questionIndex || 0, qs.length - 1);
    const q = qs[idx];
    const me = (L.players || []).find(p => p.uid === myUid());
    const answered = me && me.answers && me.answers[idx] != null;
    const left = questionTimeLeft(L);
    const locked = L.status === 'review' || left <= 0 || !!answered;
    const playKey = [L.code, L.status, idx, locked, (L.players || []).length, me && me.score].join(':');
    if (!force && playKey === lastPlayKey) {
      updateTimerOnly();
      return;
    }
    lastPlayKey = playKey;
    answerBusy = false;
    setCrumb('Playing');
    setHdrCode(L.code);
    renderPlayerSidebar('Scores');

    const canvas = document.getElementById('kcCanvas');
    const answers = (q.answers || []).map((a, i) =>
      `<label class="quiz-answer" data-idx="${i}">
         <input type="radio" name="kcLiveAns" value="${i}" ${locked ? 'disabled' : ''}>
         <span class="quiz-answer-text"></span>
       </label>`
    ).join('');
    const last = idx + 1 >= qs.length;
    canvas.innerHTML = `
      <div class="kc-wrap">
        <div class="quiz-progress">Question ${idx + 1} of ${qs.length} · ${escapeHtml(L.gameName || '')}</div>
        <div class="kc-timer-label" id="kcTimeLabel"></div>
        <div class="kc-timer"><div class="kc-timer-bar" id="kcTimeBar"></div></div>
        <div class="quiz-heading">
          <span class="quiz-heading-name"></span>
          <span style="font-size:13px;font-weight:400;color:var(--muted2)">(1 mark)</span>
        </div>
        <div class="quiz-stem"></div>
        <div class="quiz-type-hint">◉ Choose one answer</div>
        <div class="quiz-answers">${answers}</div>
        <div class="quiz-feedback" id="quizFeedback"></div>
        <div class="kc-actions">
          ${isHost() ? `<button type="button" class="kc-btn kc-btn-primary" id="kcNext">${last ? 'Show results' : 'Next question'}</button>` : ''}
        </div>
      </div>`;
    canvas.querySelector('.quiz-heading-name').textContent = q.name || ('Question ' + (idx + 1));
    canvas.querySelector('.quiz-stem').textContent = q.question || q.name || '';
    canvas.querySelectorAll('.quiz-answer').forEach((label, i) => {
      label.querySelector('.quiz-answer-text').textContent = q.answers[i].text;
      if (!locked) {
        label.addEventListener('click', e => {
          e.preventDefault();
          submitLiveAnswer(i);
        });
      }
    });
    if (answered) applyLiveGrading(canvas, q, me.answers[idx].choice, loadSettings().showFeedback);
    else if (L.status === 'review' || left <= 0) {
      applyLiveGrading(canvas, q, answered ? me.answers[idx].choice : -1, loadSettings().showFeedback);
    }
    const nextBtn = canvas.querySelector('#kcNext');
    if (nextBtn) nextBtn.addEventListener('click', nextQuestion);
    updateTimerOnly();
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(updateTimerOnly, 100);
  }

  function updateTimerOnly() {
    const L = lobbyState;
    if (!L) return;
    const bar = document.getElementById('kcTimeBar');
    const label = document.getElementById('kcTimeLabel');
    if (!bar || !label) return;
    const limit = (L.questionSeconds || 20) * 1000;
    const left = questionTimeLeft(L);
    const pct = limit ? left / limit : 0;
    bar.style.transform = 'scaleX(' + pct + ')';
    bar.classList.toggle('warn', pct < 0.35 && pct > 0.12);
    bar.classList.toggle('out', pct <= 0.12);
    label.textContent = left <= 0 ? 'Time’s up' : Math.ceil(left / 1000) + 's left';
    if (left <= 0 && L.status === 'playing') {
      const canvas = document.getElementById('kcCanvas');
      const q = L.game.questions[L.questionIndex || 0];
      const me = (L.players || []).find(p => p.uid === myUid());
      const choice = me && me.answers && me.answers[L.questionIndex || 0] != null
        ? me.answers[L.questionIndex || 0].choice : -1;
      if (canvas && q) applyLiveGrading(canvas, q, choice, loadSettings().showFeedback);
    }
  }

  function applyLiveGrading(canvas, q, selectedIdx, showFb) {
    const correctIdx = (q.answers || []).findIndex(a => a.correct);
    canvas.querySelectorAll('.quiz-answer').forEach((label, i) => {
      label.classList.add('locked');
      const input = label.querySelector('input');
      if (input) { input.disabled = true; input.checked = i === selectedIdx; }
      label.classList.toggle('selected', i === selectedIdx);
      if (showFb) {
        if (i === correctIdx) label.classList.add('correct');
        else if (i === selectedIdx) label.classList.add('incorrect');
      }
    });
    const fb = canvas.querySelector('#quizFeedback');
    if (fb && showFb) {
      const ok = selectedIdx === correctIdx;
      fb.textContent = selectedIdx < 0 ? 'No answer — correct option highlighted.' : (ok ? 'Correct!' : 'Not quite — correct answer highlighted.');
      fb.className = 'quiz-feedback ' + (ok ? 'quiz-correct' : 'quiz-incorrect');
    }
  }

  async function submitLiveAnswer(choice) {
    const L = lobbyState;
    if (!L || L.status !== 'playing' || answerBusy) return;
    const idx = L.questionIndex || 0;
    const me = (L.players || []).find(p => p.uid === myUid());
    if (me && me.answers && me.answers[idx] != null) return;
    if (questionTimeLeft(L) <= 0) return;
    answerBusy = true;
    const q = L.game.questions[idx];
    const correctIdx = (q.answers || []).findIndex(a => a.correct);
    const correct = choice === correctIdx;
    const elapsed = Date.now() - (L.questionStartedAt || Date.now());
    const limit = (L.questionSeconds || 20) * 1000;
    const score = correct ? Math.round(1000 * (1 - 0.5 * Math.min(1, elapsed / limit))) : 0;
    try {
      await patchLobby(L.code, lobby => {
        const p = (lobby.players || []).find(x => x.uid === myUid());
        if (!p) return;
        p.answers = p.answers || {};
        if (p.answers[idx] != null) return;
        p.answers[idx] = { choice, correct, score, ms: elapsed };
        p.score = (p.score || 0) + score;
      });
      lobbyState = await loadLobby(L.code);
      answerBusy = false;
      renderPlay(true);
    } catch (e) {
      answerBusy = false;
      showToast(e.message || 'Could not submit', 'error');
    }
  }

  async function nextQuestion() {
    if (!isHost() || !lobbyState) return;
    const L = lobbyState;
    const last = (L.questionIndex || 0) + 1 >= (L.game.questions || []).length;
    try {
      await patchLobby(L.code, lobby => {
        if (last) {
          lobby.status = 'ended';
        } else {
          lobby.questionIndex = (lobby.questionIndex || 0) + 1;
          lobby.questionStartedAt = Date.now();
          lobby.status = 'playing';
        }
      });
      lobbyState = await loadLobby(L.code);
      if (lobbyState.status === 'ended') {
        await upsertPublic(lobbyState);
        renderResults();
      } else {
        lastPlayKey = '';
        renderPlay(true);
      }
    } catch (e) {
      showToast(e.message || 'Could not continue', 'error');
    }
  }

  function renderResults() {
    const L = lobbyState;
    setCrumb('Results');
    setHdrCode(L.code);
    renderPlayerSidebar('Final');
    const ranked = (L.players || []).slice().sort((a, b) => (b.score || 0) - (a.score || 0));
    const canvas = document.getElementById('kcCanvas');
    canvas.innerHTML = `
      <div class="kc-wrap">
        <div class="kc-kicker">Finished</div>
        <h1 class="kc-title"></h1>
        <p class="kc-lead">Scores use speed: a fast correct answer is worth more than a slow one.</p>
        <div class="kc-card" id="kcBoard"></div>
        <div class="kc-actions">
          <button type="button" class="kc-btn" id="kcBackHome">Home</button>
          ${isHost() ? '<button type="button" class="kc-btn kc-btn-primary" id="kcAgain">Play again</button>' : ''}
        </div>
      </div>`;
    canvas.querySelector('.kc-title').textContent = (L.gameName || 'Game') + ' — results';
    const board = canvas.querySelector('#kcBoard');
    board.innerHTML = ranked.map((p, i) => `
      <div class="kc-rank">
        <div class="kc-rank-n">${i + 1}</div>
        <div class="kc-row-main">
          <div class="kc-row-name"></div>
          <div class="kc-row-sub">${p.uid === myUid() ? 'You' : (p.uid === L.hostUid ? 'Host' : '')}</div>
        </div>
        <div class="kc-player-score">${p.score || 0}</div>
      </div>`).join('');
    board.querySelectorAll('.kc-row-name').forEach((el, i) => {
      el.textContent = ranked[i].name || 'Player';
    });
    canvas.querySelector('#kcBackHome').addEventListener('click', () => go('#home'));
    const again = canvas.querySelector('#kcAgain');
    if (again) again.addEventListener('click', async () => {
      await patchLobby(L.code, lobby => {
        lobby.status = 'waiting';
        lobby.questionIndex = 0;
        lobby.questionStartedAt = 0;
        (lobby.players || []).forEach(p => { p.score = 0; p.answers = {}; });
      });
      lobbyState = await loadLobby(L.code);
      await upsertPublic(lobbyState);
      renderWaiting();
    });
  }

  async function leaveLobby() {
    const L = lobbyState;
    if (!L) return go('#home');
    stopPolling();
    if (isHost()) return closeLobby();
    try {
      await patchLobby(L.code, lobby => {
        lobby.players = (lobby.players || []).filter(p => p.uid !== myUid());
      });
      const next = await loadLobby(L.code);
      if (next) upsertPublic(next).catch(() => {});
    } catch (e) { /* ignore */ }
    lobbyState = null;
    go('#home');
  }

  async function closeLobby() {
    const L = lobbyState;
    if (!L || !isHost()) return;
    if (!confirm('Close this lobby for everyone?')) return;
    stopPolling();
    try {
      await patchLobby(L.code, lobby => { lobby.status = 'closed'; });
      await upsertPublic(Object.assign({}, L, { status: 'closed' }));
    } catch (e) { /* ignore */ }
    lobbyState = null;
    showToast('Lobby closed', 'info');
    go('#home');
  }

  function closeModal() {
    const bg = document.getElementById('kcModalBg');
    bg.classList.remove('on');
    bg.setAttribute('hidden', '');
    bg.setAttribute('aria-hidden', 'true');
    pendingJoin = null;
  }
  document.getElementById('kcModalCancel').addEventListener('click', closeModal);
  document.getElementById('kcModalOk').addEventListener('click', async () => {
    const pass = (document.getElementById('kcModalPass') || {}).value || '';
    const job = pendingJoin;
    closeModal();
    if (job) await tryJoin(job.code, pass);
  });
  document.getElementById('kcModalBg').addEventListener('click', e => {
    if (e.target.id === 'kcModalBg') closeModal();
  });

  window.addEventListener('hashchange', route);
  document.addEventListener('DOMContentLoaded', () => {
    applyKcSkin();
    const hdrCode = document.getElementById('kcHdrCode');
    if (hdrCode) {
      hdrCode.addEventListener('click', async () => {
        const code = hdrCode.textContent.trim();
        if (!code) return;
        try {
          await navigator.clipboard.writeText(code);
          showToast('Code copied', 'success');
        } catch (e) {
          showToast(code, 'info');
        }
      });
    }
    const siteTheme = window.applyTheme;
    if (typeof siteTheme === 'function') {
      window.applyTheme = function (t) {
        siteTheme(t);
        applyKcSkin();
      };
    }
    window.toggleDark = function () {
      applyKcSkin();
    };
    if (authReady) route();
    else {
      document.getElementById('kcCanvas').innerHTML = '<div class="kc-wrap"><div class="kc-empty">Loading…</div></div>';
      renderNavSidebar('');
    }
  });
  applyKcSkin();
})();

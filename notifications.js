// notifications.js
//
// Site-wide header bell + Dev Panel `notify` / `notify-ask` commands.
// Stored in StudyBaseData as the `studybase_notifications` sync key.
// Fully-read items are removed; an empty list wipes the stored payload.

const SB_NOTIFY_KEY = 'studybase_notifications';
const SB_NOTIFY_MAX_TEXT = 800;
const SB_NOTIFY_MAX_OPTION = 120;
const SB_NOTIFY_MAX_OPTIONS = 8;
const SB_NOTIFY_ROLES = ['student', 'teacher', 'dev'];

let _sbNotifyItems = [];
let _sbNotifyOpen = false;
let _sbNotifyShown = [];
let _sbNotifyBusy = false;
let _sbNotifyTimer = null;

function sbNotifyEsc(s){
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sbNotifyMe(){
  if(typeof sbIsGuestSession === 'function' && sbIsGuestSession()) return null;
  if(window.isGuest) return null;
  const user = (typeof sbCurrentUser === 'function')
    ? sbCurrentUser()
    : (window.__sbAuth && window.__sbAuth.currentUser);
  if(!user || !user.uid) return null;
  const acct = window.sbAccount || {};
  return {
    uid: user.uid,
    name: acct.name || user.displayName || '',
    role: String(window.userRole || acct.role || '').toLowerCase()
  };
}

function sbNotifyNormalizeAnswers(raw){
  const out = {};
  if(!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  Object.keys(raw).forEach(uid => {
    const id = String(uid || '').trim();
    if(!id) return;
    const v = raw[uid];
    if(v == null) return;
    const option = Number(typeof v === 'object' ? v.option : v);
    if(!isFinite(option) || option < 0) return;
    out[id] = { name: String((v && v.name) || ''), option: Math.floor(option) };
  });
  return out;
}

function sbNotifyNormalizeItem(raw){
  if(!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || '').trim();
  const text = String(raw.text || '').trim();
  if(!id || !text) return null;
  const audience = Array.isArray(raw.audience)
    ? raw.audience.map(u => String(u || '').trim()).filter(Boolean)
    : [];
  const readBy = Array.isArray(raw.readBy)
    ? raw.readBy.map(u => String(u || '').trim()).filter(Boolean)
    : [];
  const target = raw.target && typeof raw.target === 'object'
    ? raw.target
    : { kind: 'everyone' };
  const kind = raw.kind === 'ask' ? 'ask' : 'text';
  const options = kind === 'ask' && Array.isArray(raw.options)
    ? raw.options.map(o => String(o || '').trim()).filter(Boolean).slice(0, SB_NOTIFY_MAX_OPTIONS)
    : [];
  if(kind === 'ask' && options.length < 2) return null;
  const item = {
    id,
    kind,
    text,
    createdAt: raw.createdAt || '',
    fromName: String(raw.fromName || ''),
    fromUid: String(raw.fromUid || ''),
    target,
    audience,
    readBy
  };
  if(kind === 'ask'){
    item.options = options;
    item.answers = sbNotifyNormalizeAnswers(raw.answers);
    item.reportTo = Array.isArray(raw.reportTo)
      ? raw.reportTo.map(u => String(u || '').trim()).filter(Boolean)
      : [];
  }
  if(raw.sourceAskId) item.sourceAskId = String(raw.sourceAskId);
  return item;
}

function sbNotifyNormalizeStore(raw){
  const list = Array.isArray(raw) ? raw
    : (raw && Array.isArray(raw.items) ? raw.items : []);
  return list.map(sbNotifyNormalizeItem).filter(Boolean);
}

function sbNotifyForMe(item, me){
  if(!item || !me) return false;
  if(item.audience && item.audience.length) return item.audience.indexOf(me.uid) !== -1;
  const kind = item.target && item.target.kind;
  if(kind === 'everyone') return true;
  if(kind === 'role') return String(item.target.role || '').toLowerCase() === me.role;
  if(kind === 'user') return String(item.target.uid || '') === me.uid;
  return false;
}

function sbNotifyUserAnswered(item, uid){
  return !!(item && uid && item.kind === 'ask' && item.answers && item.answers[uid]);
}

function sbNotifyIsRead(item, uid){
  if(!item || !uid) return false;
  if(item.kind === 'ask') return sbNotifyUserAnswered(item, uid);
  return (item.readBy || []).indexOf(uid) !== -1;
}

function sbNotifyMine(items, me){
  return (items || []).filter(n => sbNotifyForMe(n, me));
}

function sbNotifyUnread(items, me){
  return sbNotifyMine(items, me).filter(n => !sbNotifyIsRead(n, me.uid));
}

function sbNotifyFullyAnswered(item){
  if(!item || item.kind !== 'ask') return false;
  const audience = item.audience || [];
  if(!audience.length) return Object.keys(item.answers || {}).length > 0;
  return audience.every(uid => sbNotifyUserAnswered(item, uid));
}

function sbNotifyFullyRead(item){
  if(!item) return false;
  if(item.kind === 'ask') return sbNotifyFullyAnswered(item);
  const audience = item.audience || [];
  if(!audience.length) return (item.readBy || []).length > 0;
  return audience.every(uid => (item.readBy || []).indexOf(uid) !== -1);
}

function sbNotifyBuildResults(ask){
  const options = ask.options || [];
  const buckets = options.map(() => []);
  Object.keys(ask.answers || {}).forEach(uid => {
    const a = ask.answers[uid];
    const i = Number(a && a.option);
    if(i >= 0 && i < buckets.length) buckets[i].push((a && a.name) || 'Someone');
  });
  const lines = ['Ask results: ' + ask.text, ''];
  options.forEach((opt, i) => {
    const names = buckets[i];
    lines.push(opt + ' — ' + names.length + (names.length ? ' (' + names.join(', ') + ')' : ''));
  });
  const audience = (ask.reportTo && ask.reportTo.length)
    ? ask.reportTo.slice()
    : (ask.fromUid ? [ask.fromUid] : []);
  if(!audience.length) return null;
  return {
    id: 'n_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    kind: 'text',
    text: lines.join('\n'),
    createdAt: new Date().toISOString(),
    fromName: 'StudyBase',
    fromUid: '',
    target: { kind: 'role', role: 'dev' },
    audience,
    readBy: [],
    sourceAskId: ask.id
  };
}

function sbNotifyFinalize(items){
  const list = items || [];
  const haveReport = new Set(list.filter(n => n.sourceAskId).map(n => n.sourceAskId));
  const out = [];
  list.forEach(n => {
    if(n.kind === 'ask' && sbNotifyFullyAnswered(n)){
      if(!haveReport.has(n.id)){
        const report = sbNotifyBuildResults(n);
        if(report){
          haveReport.add(n.id);
          out.push(report);
        }
      }
      return;
    }
    if(n.kind !== 'ask' && sbNotifyFullyRead(n)) return;
    out.push(n);
  });
  return out;
}

function sbNotifyLoad(){
  if(typeof sbLoadKey !== 'function') return Promise.resolve(_sbNotifyItems);
  return sbLoadKey(SB_NOTIFY_KEY).then(raw => {
    _sbNotifyItems = sbNotifyNormalizeStore(raw);
    return _sbNotifyItems;
  }).catch(() => _sbNotifyItems);
}

function sbNotifySave(items){
  const next = sbNotifyFinalize(items);
  _sbNotifyItems = next;
  const payload = next.length ? { items: next } : {};
  if(typeof sbPushToSync !== 'function') return Promise.resolve(next);
  return sbPushToSync(SB_NOTIFY_KEY, payload).then(() => {
    if(typeof sbMemSet === 'function') sbMemSet(SB_NOTIFY_KEY, payload);
    return next;
  });
}

function sbNotifyFormatTime(iso){
  if(!iso) return '';
  const d = new Date(iso);
  if(isNaN(d)) return '';
  return d.toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function sbNotifyRenderOptions(n, me){
  if(n.kind !== 'ask' || !n.options || !n.options.length) return '';
  const mine = me && n.answers && n.answers[me.uid];
  const answered = !!mine;
  const buttons = n.options.map((opt, i) => {
    const chosen = answered && Number(mine.option) === i;
    return '<button type="button" class="hdr-notify-opt' + (chosen ? ' is-mine' : '') + '"' +
      (answered ? ' disabled' : '') +
      ' data-ask="' + sbNotifyEsc(n.id) + '" data-opt="' + i + '">' +
      sbNotifyEsc(opt) + '</button>';
  }).join('');
  return '<div class="hdr-notify-options">' + buttons + '</div>' +
    (answered ? '<div class="hdr-notify-item-meta">You answered</div>' : '');
}

function sbNotifyRenderList(items, emptyText, me){
  if(!items.length){
    return '<div class="hdr-notify-empty">' + sbNotifyEsc(emptyText) + '</div>';
  }
  return items.map(n => {
    const meta = [n.fromName || 'StudyBase', sbNotifyFormatTime(n.createdAt)].filter(Boolean).join(' · ');
    return '<div class="hdr-notify-item' + (n.kind === 'ask' ? ' is-ask' : '') + '">' +
      '<div class="hdr-notify-item-text">' + sbNotifyEsc(n.text) + '</div>' +
      sbNotifyRenderOptions(n, me) +
      (meta ? '<div class="hdr-notify-item-meta">' + sbNotifyEsc(meta) + '</div>' : '') +
      '</div>';
  }).join('');
}

function sbNotifyUpdateUi(){
  const wrap = document.getElementById('hdrNotifyWrap');
  const badge = document.getElementById('hdrNotifyBadge');
  const tip = document.getElementById('hdrNotifyTip');
  if(!wrap || !tip) return;
  const me = sbNotifyMe();
  if(!me){
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  const unread = sbNotifyUnread(_sbNotifyItems, me);
  const shown = _sbNotifyOpen ? _sbNotifyShown : unread;
  wrap.classList.toggle('has-unread', unread.length > 0);
  wrap.classList.toggle('open', _sbNotifyOpen);
  if(badge){
    if(unread.length){
      badge.hidden = false;
      badge.textContent = unread.length > 9 ? '9+' : String(unread.length);
    } else {
      badge.hidden = true;
      badge.textContent = '';
    }
  }
  tip.innerHTML = sbNotifyRenderList(shown, 'No notifications', me);
}

function sbNotifyMarkRead(){
  const me = sbNotifyMe();
  if(!me || _sbNotifyBusy) return Promise.resolve(_sbNotifyItems);
  return sbNotifyLoad().then(items => {
    let changed = false;
    const next = items.map(n => {
      if(n.kind === 'ask') return n;
      if(!sbNotifyForMe(n, me) || sbNotifyIsRead(n, me.uid)) return n;
      changed = true;
      return Object.assign({}, n, { readBy: (n.readBy || []).concat([me.uid]) });
    });
    const pruned = sbNotifyFinalize(next);
    if(!changed && pruned.length === items.length){
      _sbNotifyItems = pruned;
      return pruned;
    }
    _sbNotifyBusy = true;
    return sbNotifySave(pruned).finally(() => { _sbNotifyBusy = false; });
  }).then(() => {
    sbNotifyUpdateUi();
    return _sbNotifyItems;
  });
}

function sbNotifyRefresh(){
  return sbNotifyLoad().then(() => { sbNotifyUpdateUi(); });
}

function sbNotifyOpenAndRead(){
  const me = sbNotifyMe();
  _sbNotifyOpen = true;
  _sbNotifyShown = me ? sbNotifyUnread(_sbNotifyItems, me) : [];
  if(!_sbNotifyShown.length && me) _sbNotifyShown = sbNotifyMine(_sbNotifyItems, me);
  sbNotifyUpdateUi();
  return sbNotifyMarkRead();
}

function sbNotifyClose(){
  _sbNotifyOpen = false;
  _sbNotifyShown = [];
  sbNotifyUpdateUi();
}

function sbNotifyBind(){
  const wrap = document.getElementById('hdrNotifyWrap');
  const btn = document.getElementById('hdrNotifyBtn');
  if(!wrap || !btn || btn.dataset.sbNotifyBound === '1') return;
  btn.dataset.sbNotifyBound = '1';
  btn.addEventListener('click', ev => {
    ev.preventDefault();
    ev.stopPropagation();
    if(_sbNotifyOpen) sbNotifyClose();
    else sbNotifyOpenAndRead();
  });
  document.addEventListener('click', ev => {
    if(!_sbNotifyOpen) return;
    if(wrap.contains(ev.target)) return;
    sbNotifyClose();
  });
  document.addEventListener('keydown', ev => {
    if(ev.key === 'Escape' && _sbNotifyOpen) sbNotifyClose();
  });
  const tip = document.getElementById('hdrNotifyTip');
  if(tip && tip.dataset.sbNotifyBound !== '1'){
    tip.dataset.sbNotifyBound = '1';
    tip.addEventListener('click', ev => {
      const btn = ev.target.closest('[data-ask]');
      if(!btn || btn.disabled) return;
      ev.preventDefault();
      ev.stopPropagation();
      sbNotifyAnswer(btn.getAttribute('data-ask'), btn.getAttribute('data-opt'));
    });
  }
}

function sbNotifyWaitForUser(){
  if(typeof sbIsGuestSession === 'function' && sbIsGuestSession()) return Promise.resolve(null);
  if(window.isGuest) return Promise.resolve(null);
  const have = sbNotifyMe();
  if(have) return Promise.resolve(have);
  return new Promise(resolve => {
    const start = Date.now();
    const tick = () => {
      if(typeof sbIsGuestSession === 'function' && sbIsGuestSession()) return resolve(null);
      if(window.isGuest) return resolve(null);
      const me = sbNotifyMe();
      if(me) return resolve(me);
      if(Date.now() - start > 10000) return resolve(null);
      setTimeout(tick, 80);
    };
    tick();
  });
}

function sbNotifyInit(){
  sbNotifyBind();
  sbNotifyWaitForUser().then(me => {
    if(!me){ sbNotifyUpdateUi(); return; }
    sbNotifyRefresh();
    if(_sbNotifyTimer) clearInterval(_sbNotifyTimer);
    _sbNotifyTimer = setInterval(sbNotifyRefresh, 45000);
  });
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'visible') sbNotifyRefresh();
  });
}

function sbNotifyActiveUsers(users){
  return (users || []).filter(u => String(u.status || '').toLowerCase() === 'active');
}

function sbNotifyResolveTarget(target, users){
  const raw = String(target || '').trim();
  if(!raw) return { error: 'Missing target' };
  const people = sbNotifyActiveUsers(users);
  if(raw.toLowerCase() === '@everyone'){
    const audience = people.map(u => u.uid);
    if(!audience.length) return { error: 'No active users to notify' };
    return { target: { kind: 'everyone' }, audience };
  }
  if(raw.charAt(0) === '@'){
    const role = raw.slice(1).toLowerCase();
    if(SB_NOTIFY_ROLES.indexOf(role) === -1){
      return { error: 'Unknown role. Use @student, @teacher, @dev, or @everyone' };
    }
    const audience = people.filter(u => String(u.role || '').toLowerCase() === role).map(u => u.uid);
    if(!audience.length) return { error: 'No active users with role @' + role };
    return { target: { kind: 'role', role }, audience };
  }
  if(raw.charAt(0) === '#'){
    const uid = raw.slice(1).trim();
    if(!uid) return { error: 'Missing user id after #' };
    const hit = (users || []).find(u => u.uid === uid);
    if(!hit) return { error: 'No user with id ' + uid };
    return { target: { kind: 'user', uid, name: hit.displayName || '' }, audience: [uid] };
  }
  const needle = raw.toLowerCase();
  const matches = people.filter(u => String(u.displayName || '').trim().toLowerCase() === needle);
  if(!matches.length){
    const partial = people.filter(u => String(u.displayName || '').toLowerCase().indexOf(needle) !== -1);
    if(partial.length === 1){
      const u = partial[0];
      return { target: { kind: 'user', uid: u.uid, name: u.displayName || '' }, audience: [u.uid] };
    }
    return { error: 'No active user named "' + raw + '"' };
  }
  if(matches.length > 1) return { error: 'Several people are named "' + raw + '". Use #id instead.' };
  const u = matches[0];
  return { target: { kind: 'user', uid: u.uid, name: u.displayName || '' }, audience: [u.uid] };
}

function sbNotifyParseQuoted(rest){
  const quoted = [];
  const re = /"([^"]*)"|'([^']*)'/g;
  let m;
  while((m = re.exec(rest))) quoted.push(m[1] != null ? m[1] : m[2]);
  return quoted;
}

function sbNotifyCleanOptions(list){
  return (list || []).map(o => String(o || '').trim()).filter(Boolean).slice(0, SB_NOTIFY_MAX_OPTIONS);
}

function sbNotifyParseCommand(line){
  const raw = String(line || '').trim();
  if(!raw) return { error: 'Empty command' };
  const parts = raw.match(/^(\S+)(?:\s+([\s\S]*))?$/);
  const cmd = (parts && parts[1] ? parts[1] : '').toLowerCase();
  const rest = parts && parts[2] ? parts[2] : '';
  const quoted = sbNotifyParseQuoted(rest);
  if(cmd === 'notify-ask'){
    let target = '';
    let text = '';
    let options = [];
    if(/^\s*["']/.test(rest)){
      if(quoted.length < 4) return { error: 'Usage: notify-ask name/@everyone/@role/#id "text" "option 1" "option 2"' };
      target = quoted[0];
      text = quoted[1];
      options = quoted.slice(2);
    } else if(quoted.length >= 3){
      target = rest.replace(/["'][\s\S]*/, '').trim();
      text = quoted[0];
      options = quoted.slice(1);
    } else {
      return { error: 'Usage: notify-ask name/@everyone/@role/#id "text" "option 1" "option 2"' };
    }
    if(!target) return { error: 'Missing target' };
    text = String(text || '').trim();
    if(!text) return { error: 'Missing question text' };
    if(text.length > SB_NOTIFY_MAX_TEXT) return { error: 'Question is too long (max ' + SB_NOTIFY_MAX_TEXT + ')' };
    options = sbNotifyCleanOptions(options);
    if(options.length < 2) return { error: 'notify-ask needs at least two options' };
    if(options.some(o => o.length > SB_NOTIFY_MAX_OPTION)) return { error: 'An option is too long (max ' + SB_NOTIFY_MAX_OPTION + ')' };
    return { cmd: 'notify-ask', target, text, options };
  }
  if(cmd !== 'notify'){
    return { error: 'Unknown command. Try: notify … or notify-ask …' };
  }
  let target = '';
  let text = '';
  if(quoted.length >= 2 && /^\s*["']/.test(rest)){
    target = quoted[0];
    text = quoted[1];
  } else if(quoted.length >= 1){
    text = quoted[quoted.length - 1];
    target = rest.replace(/["'][^"']*["']\s*$/, '').trim();
  } else {
    return { error: 'Usage: notify name/@everyone/@role/#id "text"' };
  }
  if(!target) return { error: 'Missing target' };
  text = String(text || '').trim();
  if(!text) return { error: 'Missing message text' };
  if(text.length > SB_NOTIFY_MAX_TEXT) return { error: 'Message is too long (max ' + SB_NOTIFY_MAX_TEXT + ')' };
  return { cmd: 'notify', target, text };
}

function sbNotifyDevUids(users, fallbackUid){
  const devs = sbNotifyActiveUsers(users)
    .filter(u => String(u.role || '').toLowerCase() === 'dev')
    .map(u => u.uid);
  if(devs.length) return devs;
  return fallbackUid ? [fallbackUid] : [];
}

function sbNotifySend(targetSpec, text, users){
  const me = sbNotifyMe();
  if(!me) return Promise.reject(new Error('Sign in to send notifications'));
  const resolved = sbNotifyResolveTarget(targetSpec, users);
  if(resolved.error) return Promise.reject(new Error(resolved.error));
  const item = {
    id: 'n_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    kind: 'text',
    text: String(text || '').trim(),
    createdAt: new Date().toISOString(),
    fromName: me.name || 'Dev',
    fromUid: me.uid,
    target: resolved.target,
    audience: resolved.audience,
    readBy: []
  };
  return sbNotifyLoad().then(items => sbNotifySave(items.concat([item]))).then(() => {
    sbNotifyUpdateUi();
    return item;
  });
}

function sbNotifySendAsk(targetSpec, text, options, users){
  const me = sbNotifyMe();
  if(!me) return Promise.reject(new Error('Sign in to send notifications'));
  const resolved = sbNotifyResolveTarget(targetSpec, users);
  if(resolved.error) return Promise.reject(new Error(resolved.error));
  const clean = sbNotifyCleanOptions(options);
  if(clean.length < 2) return Promise.reject(new Error('notify-ask needs at least two options'));
  const item = {
    id: 'n_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    kind: 'ask',
    text: String(text || '').trim(),
    createdAt: new Date().toISOString(),
    fromName: me.name || 'Dev',
    fromUid: me.uid,
    target: resolved.target,
    audience: resolved.audience,
    readBy: [],
    options: clean,
    answers: {},
    reportTo: sbNotifyDevUids(users, me.uid)
  };
  return sbNotifyLoad().then(items => sbNotifySave(items.concat([item]))).then(() => {
    sbNotifyUpdateUi();
    return item;
  });
}

function sbNotifyAnswer(askId, optionIndex){
  const me = sbNotifyMe();
  if(!me || _sbNotifyBusy) return Promise.resolve(_sbNotifyItems);
  const opt = Number(optionIndex);
  if(!askId || !isFinite(opt) || opt < 0) return Promise.resolve(_sbNotifyItems);
  _sbNotifyOpen = true;
  return sbNotifyLoad().then(items => {
    let answered = null;
    const next = items.map(n => {
      if(n.id !== askId || n.kind !== 'ask') return n;
      if(sbNotifyUserAnswered(n, me.uid)){ answered = n; return n; }
      if(opt >= (n.options || []).length) return n;
      const answers = Object.assign({}, n.answers);
      answers[me.uid] = { name: me.name || 'Someone', option: Math.floor(opt) };
      answered = Object.assign({}, n, { answers });
      return answered;
    });
    if(!answered) return items;
    _sbNotifyShown = _sbNotifyShown.map(n => n.id === askId ? answered : n);
    if(!_sbNotifyShown.some(n => n.id === askId)) _sbNotifyShown = [answered].concat(_sbNotifyShown);
    _sbNotifyBusy = true;
    return sbNotifySave(next).finally(() => { _sbNotifyBusy = false; }).then(saved => {
      const results = saved.filter(n => n.sourceAskId === askId && sbNotifyForMe(n, me));
      results.forEach(r => {
        if(!_sbNotifyShown.some(n => n.id === r.id)) _sbNotifyShown.push(r);
      });
      return saved;
    });
  }).then(() => {
    sbNotifyUpdateUi();
    return _sbNotifyItems;
  });
}

function sbNotifyRunCommand(line, users){
  const parsed = sbNotifyParseCommand(line);
  if(parsed.error) return Promise.reject(new Error(parsed.error));
  if(parsed.cmd === 'notify-ask'){
    return sbNotifySendAsk(parsed.target, parsed.text, parsed.options, users).then(item => {
      const n = (item.audience || []).length;
      return 'Ask sent to ' + n + ' user' + (n === 1 ? '' : 's');
    });
  }
  return sbNotifySend(parsed.target, parsed.text, users).then(item => {
    const n = (item.audience || []).length;
    return 'Sent to ' + n + ' user' + (n === 1 ? '' : 's');
  });
}

window.sbNotifyInit = sbNotifyInit;
window.sbNotifyRefresh = sbNotifyRefresh;
window.sbNotifyRunCommand = sbNotifyRunCommand;
window.sbNotifyParseCommand = sbNotifyParseCommand;

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', sbNotifyInit);
} else {
  sbNotifyInit();
}

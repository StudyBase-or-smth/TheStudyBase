// notifications.js
//
// Site-wide header bell + Dev Panel notify / notify-ask / notify-remove.
// Stored in Apps Script as the `studybase_notifications` sync key.
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
let _sbNotifyInited = false;
let _sbNotifyLastFetch = 0;

function sbNotifyEsc(s){
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sbNotifyMe(){
  if(typeof sbIsGuestSession === 'function' && sbIsGuestSession()) return null;
  if(window.isGuest || sessionStorage.getItem('studybase_guest') === '1') return null;
  const user = (typeof sbCurrentUser === 'function')
    ? sbCurrentUser()
    : (window.__sbAuth && window.__sbAuth.currentUser);
  const uid = (user && user.uid) || window.currentUid || '';
  if(!uid) return null;
  const acct = window.sbAccount || {};
  return {
    uid: String(uid),
    name: acct.name || (user && user.displayName) || localStorage.getItem('studybase_display_name') || '',
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

function sbNotifyEnqueue(job){
  const prev = window.__sbJsonpChain || Promise.resolve();
  const p = prev.catch(() => {}).then(job);
  window.__sbJsonpChain = p.catch(() => {});
  return p;
}

function sbNotifyJsonpGet(){
  if(typeof SYNC_URL === 'undefined' || !SYNC_URL) return Promise.reject(new Error('SYNC_URL missing'));
  const url = SYNC_URL + '?key=' + encodeURIComponent(SB_NOTIFY_KEY);
  if(typeof sbJsonpGet === 'function') return sbJsonpGet(url);
  return sbNotifyEnqueue(() => new Promise((resolve, reject) => {
    const cb = '_ncb' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const s = document.createElement('script');
    let done = false;
    const finish = (fn, val) => {
      if(done) return;
      done = true;
      delete window[cb];
      if(s.parentNode) s.remove();
      fn(val);
    };
    window[cb] = data => finish(resolve, data);
    s.onerror = () => finish(reject, new Error('JSONP error'));
    s.src = url + '&callback=' + cb;
    document.head.appendChild(s);
    setTimeout(() => finish(reject, new Error('timeout')), 12000);
  }));
}

function sbNotifyFormPush(payload){
  if(typeof SYNC_URL === 'undefined' || !SYNC_URL) return Promise.reject(new Error('SYNC_URL missing'));
  if(typeof sbSyncPush === 'function'){
    sbSyncPush(SB_NOTIFY_KEY, payload);
    return Promise.resolve();
  }
  const id = 'nf' + Date.now();
  const iframe = document.createElement('iframe');
  iframe.name = id; iframe.style.cssText = 'display:none;width:0;height:0;border:0';
  const form = document.createElement('form');
  form.method = 'POST'; form.action = SYNC_URL; form.target = id; form.style.display = 'none';
  [['key', SB_NOTIFY_KEY], ['data', JSON.stringify(payload)]].forEach(([n, v]) => {
    const inp = document.createElement('input'); inp.type = 'hidden'; inp.name = n; inp.value = v; form.appendChild(inp);
  });
  document.body.appendChild(iframe); document.body.appendChild(form); form.submit();
  setTimeout(() => { if(iframe.parentNode) iframe.remove(); if(form.parentNode) form.remove(); }, 6000);
  return Promise.resolve();
}

function sbNotifyLoad(){
  return sbNotifyJsonpGet().then(res => {
    _sbNotifyLastFetch = Date.now();
    _sbNotifyItems = sbNotifyNormalizeStore(res && res.data);
    return _sbNotifyItems;
  }).catch(() => _sbNotifyItems);
}

function sbNotifySave(items){
  const next = sbNotifyFinalize(items);
  _sbNotifyItems = next;
  const payload = next.length ? { items: next } : {};
  return sbNotifyFormPush(payload).then(() => next).catch(() => next);
}

function sbNotifyFormatTime(iso){
  if(!iso) return '';
  const d = new Date(iso);
  if(isNaN(d)) return '';
  return d.toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function sbNotifyRenderOptions(n, me, answered){
  if(n.kind !== 'ask' || !n.options || !n.options.length) return '';
  const mine = me && n.answers && n.answers[me.uid];
  const buttons = n.options.map((opt, i) => {
    const chosen = answered && mine && Number(mine.option) === i;
    return '<button type="button" class="hdr-notify-opt' + (chosen ? ' is-mine' : '') + '"' +
      (answered ? ' disabled' : '') +
      ' data-ask="' + sbNotifyEsc(n.id) + '" data-opt="' + i + '">' +
      sbNotifyEsc(opt) + '</button>';
  }).join('');
  return '<div class="hdr-notify-options">' + buttons + '</div>';
}

function sbNotifyChosenLabel(n, me){
  const mine = me && n.answers && n.answers[me.uid];
  if(!mine || !n.options) return '';
  const i = Number(mine.option);
  return (i >= 0 && i < n.options.length) ? String(n.options[i]) : '';
}

function sbNotifyRenderList(items, emptyText, me){
  if(!items.length){
    return '<div class="hdr-notify-empty">' + sbNotifyEsc(emptyText) + '</div>';
  }
  return items.map(n => {
    const meta = [n.id, n.fromName || 'StudyBase', sbNotifyFormatTime(n.createdAt)].filter(Boolean).join(' · ');
    const answered = n.kind === 'ask' && !!(me && n.answers && n.answers[me.uid]);
    const options = sbNotifyRenderOptions(n, me, answered);
    const body = '<div class="hdr-notify-item-text">' + sbNotifyEsc(n.text) + '</div>' +
      options +
      (meta ? '<div class="hdr-notify-item-meta">' + sbNotifyEsc(meta) + '</div>' : '');
    if(answered){
      const choice = sbNotifyChosenLabel(n, me) || 'an option';
      return '<div class="hdr-notify-item is-ask is-answered">' +
        '<details class="hdr-notify-ask-done">' +
          '<summary><span class="hdr-notify-ask-q">' + sbNotifyEsc(n.text) + '</span>' +
            '<span class="hdr-notify-ask-a">' + sbNotifyEsc(choice) + '</span></summary>' +
          body +
        '</details>' +
        '</div>';
    }
    return '<div class="hdr-notify-item' + (n.kind === 'ask' ? ' is-ask' : '') + '">' + body + '</div>';
  }).join('');
}

function sbNotifyAuthPending(){
  if(typeof sbIsGuestSession === 'function' && sbIsGuestSession()) return false;
  if(window.isGuest) return false;
  if(sbNotifyMe()) return false;
  return !!(window.__sbAuth);
}

function sbNotifyUpdateUi(){
  const wrap = document.getElementById('hdrNotifyWrap');
  const badge = document.getElementById('hdrNotifyBadge');
  const tip = document.getElementById('hdrNotifyTip');
  if(!wrap || !tip) return;
  wrap.hidden = false;
  const me = sbNotifyMe();
  const unread = me ? sbNotifyUnread(_sbNotifyItems, me) : [];
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
  if(!_sbNotifyOpen && !unread.length){
    tip.innerHTML = '';
    return;
  }
  const shown = _sbNotifyOpen ? _sbNotifyShown : unread;
  const empty = !me && sbNotifyAuthPending() ? 'Checking…' : 'No notifications';
  tip.innerHTML = sbNotifyRenderList(shown, empty, me);
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
      const optBtn = ev.target.closest('[data-ask]');
      if(!optBtn || optBtn.disabled) return;
      ev.preventDefault();
      ev.stopPropagation();
      sbNotifyAnswer(optBtn.getAttribute('data-ask'), optBtn.getAttribute('data-opt'));
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
  try {
    sbNotifyBind();
    sbNotifyUpdateUi();
  } catch(e) {
    console.warn('notifications ui', e);
  }
  if(_sbNotifyInited) return;
  _sbNotifyInited = true;
  sbNotifyWaitForUser().then(me => {
    if(!me){ sbNotifyUpdateUi(); return; }
    sbNotifyRefresh();
    if(_sbNotifyTimer) clearInterval(_sbNotifyTimer);
    _sbNotifyTimer = setInterval(sbNotifyRefresh, 45000);
  });
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState !== 'visible') return;
    if(Date.now() - _sbNotifyLastFetch < 20000) return;
    sbNotifyRefresh();
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
  const emailMatches = people.filter(u => String(u.email || '').trim().toLowerCase() === needle);
  if(emailMatches.length === 1){
    const u = emailMatches[0];
    return { target: { kind: 'user', uid: u.uid, name: u.displayName || u.email || '' }, audience: [u.uid] };
  }
  if(needle.indexOf('@') !== -1){
    const partialEmail = people.filter(u => String(u.email || '').toLowerCase().indexOf(needle) !== -1);
    if(partialEmail.length === 1){
      const u = partialEmail[0];
      return { target: { kind: 'user', uid: u.uid, name: u.displayName || u.email || '' }, audience: [u.uid] };
    }
    if(!partialEmail.length) return { error: 'No active user with email "' + raw + '"' };
    return { error: 'Several people match that email. Use the full address or #id.' };
  }
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

function sbNotifyParseId(id){
  const s = String(id || '').trim();
  if(!s) return { error: 'Missing id' };
  if(!/^[A-Za-z0-9._-]{1,80}$/.test(s)) return { error: 'id must be letters, numbers, . _ or - (max 80)' };
  return { id: s };
}

function sbNotifyTakeFirst(rest){
  const t = String(rest || '').trim();
  if(!t) return { first: '', rest: '' };
  const q = t.charAt(0);
  if(q === '"' || q === "'"){
    const end = t.indexOf(q, 1);
    if(end === -1) return { first: t.slice(1), rest: '' };
    return { first: t.slice(1, end), rest: t.slice(end + 1).trim() };
  }
  const m = t.match(/^(\S+)\s*([\s\S]*)$/);
  return { first: m[1], rest: m[2] || '' };
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
  if(cmd === 'notify-remove'){
    const usage = 'Usage: notify-remove id  or  notify-remove id whomever';
    const taken = sbNotifyTakeFirst(rest);
    const parsedId = sbNotifyParseId(taken.first);
    if(parsedId.error) return { error: parsedId.error + '. ' + usage };
    const who = sbNotifyTakeFirst(taken.rest);
    return { cmd: 'notify-remove', id: parsedId.id, target: who.first || '' };
  }
  if(cmd === 'notify-ask'){
    const usage = 'Usage: notify-ask whomever id "text" "1" "2"';
    const who = sbNotifyTakeFirst(rest);
    const ident = sbNotifyTakeFirst(who.rest);
    const quoted = sbNotifyParseQuoted(ident.rest);
    const parsedId = sbNotifyParseId(ident.first);
    if(!who.first) return { error: usage };
    if(parsedId.error) return { error: parsedId.error + '. ' + usage };
    const text = String(quoted[0] || '').trim();
    const options = sbNotifyCleanOptions(quoted.slice(1));
    if(!text) return { error: 'Missing question text. ' + usage };
    if(text.length > SB_NOTIFY_MAX_TEXT) return { error: 'Question is too long (max ' + SB_NOTIFY_MAX_TEXT + ')' };
    if(options.length < 2) return { error: 'notify-ask needs at least two options. ' + usage };
    if(options.some(o => o.length > SB_NOTIFY_MAX_OPTION)) return { error: 'An option is too long (max ' + SB_NOTIFY_MAX_OPTION + ')' };
    return { cmd: 'notify-ask', target: who.first, id: parsedId.id, text, options };
  }
  if(cmd !== 'notify'){
    return { error: 'Unknown command. Try: notify ..., notify-ask ..., or notify-remove ...' };
  }
  const usage = 'Usage: notify whomever id "text"';
  const who = sbNotifyTakeFirst(rest);
  const ident = sbNotifyTakeFirst(who.rest);
  const quoted = sbNotifyParseQuoted(ident.rest);
  const parsedId = sbNotifyParseId(ident.first);
  if(!who.first) return { error: usage };
  if(parsedId.error) return { error: parsedId.error + '. ' + usage };
  const text = String(quoted[0] || '').trim();
  if(!text) return { error: 'Missing message text. ' + usage };
  if(text.length > SB_NOTIFY_MAX_TEXT) return { error: 'Message is too long (max ' + SB_NOTIFY_MAX_TEXT + ')' };
  return { cmd: 'notify', target: who.first, id: parsedId.id, text };
}

function sbNotifyDevUids(users, fallbackUid){
  const devs = sbNotifyActiveUsers(users)
    .filter(u => String(u.role || '').toLowerCase() === 'dev')
    .map(u => u.uid);
  if(devs.length) return devs;
  return fallbackUid ? [fallbackUid] : [];
}

function sbNotifySend(targetSpec, text, users, customId){
  const me = sbNotifyMe();
  if(!me) return Promise.reject(new Error('Sign in to send notifications'));
  const resolved = sbNotifyResolveTarget(targetSpec, users);
  if(resolved.error) return Promise.reject(new Error(resolved.error));
  const parsedId = sbNotifyParseId(customId);
  if(parsedId.error) return Promise.reject(new Error(parsedId.error));
  const item = {
    id: parsedId.id,
    kind: 'text',
    text: String(text || '').trim(),
    createdAt: new Date().toISOString(),
    fromName: me.name || 'Dev',
    fromUid: me.uid,
    target: resolved.target,
    audience: resolved.audience,
    readBy: []
  };
  return sbNotifyLoad().then(items => {
    if(items.some(n => n.id === parsedId.id)){
      throw new Error('A notification with id "' + parsedId.id + '" already exists');
    }
    return sbNotifySave(items.concat([item]));
  }).then(() => {
    sbNotifyUpdateUi();
    return item;
  });
}

function sbNotifySendAsk(targetSpec, text, options, users, customId){
  const me = sbNotifyMe();
  if(!me) return Promise.reject(new Error('Sign in to send notifications'));
  const resolved = sbNotifyResolveTarget(targetSpec, users);
  if(resolved.error) return Promise.reject(new Error(resolved.error));
  const parsedId = sbNotifyParseId(customId);
  if(parsedId.error) return Promise.reject(new Error(parsedId.error));
  const clean = sbNotifyCleanOptions(options);
  if(clean.length < 2) return Promise.reject(new Error('notify-ask needs at least two options'));
  const item = {
    id: parsedId.id,
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
  return sbNotifyLoad().then(items => {
    if(items.some(n => n.id === parsedId.id)){
      throw new Error('A notification with id "' + parsedId.id + '" already exists');
    }
    return sbNotifySave(items.concat([item]));
  }).then(() => {
    sbNotifyUpdateUi();
    return item;
  });
}

function sbNotifyStripUser(item, uids){
  const drop = new Set((uids || []).map(String));
  const next = Object.assign({}, item, {
    audience: (item.audience || []).filter(uid => !drop.has(String(uid))),
    readBy: (item.readBy || []).filter(uid => !drop.has(String(uid)))
  });
  if(item.kind === 'ask' && item.answers){
    const answers = Object.assign({}, item.answers);
    drop.forEach(uid => { delete answers[uid]; });
    next.answers = answers;
  }
  return next;
}

function sbNotifyRemove(id, targetSpec, users){
  const parsedId = sbNotifyParseId(id);
  if(parsedId.error) return Promise.reject(new Error(parsedId.error));
  let removeUids = null;
  if(targetSpec){
    const resolved = sbNotifyResolveTarget(targetSpec, users);
    if(resolved.error) return Promise.reject(new Error(resolved.error));
    removeUids = resolved.audience;
  }
  return sbNotifyLoad().then(items => {
    const hit = items.find(n => n.id === parsedId.id);
    if(!hit) throw new Error('No notification with id ' + parsedId.id);
    let next;
    if(!removeUids){
      next = items.filter(n => n.id !== parsedId.id && n.sourceAskId !== parsedId.id);
      _sbNotifyShown = _sbNotifyShown.filter(n => n.id !== parsedId.id && n.sourceAskId !== parsedId.id);
      return sbNotifySave(next).then(() => ({ id: parsedId.id, count: (hit.audience || []).length || 1, partial: false }));
    }
    const stripped = sbNotifyStripUser(hit, removeUids);
    if(!stripped.audience.length){
      next = items.filter(n => n.id !== parsedId.id && n.sourceAskId !== parsedId.id);
      _sbNotifyShown = _sbNotifyShown.filter(n => n.id !== parsedId.id && n.sourceAskId !== parsedId.id);
    } else {
      next = items.map(n => n.id === parsedId.id ? stripped : n);
      _sbNotifyShown = _sbNotifyShown.map(n => n.id === parsedId.id ? stripped : n);
    }
    return sbNotifySave(next).then(() => ({ id: parsedId.id, count: removeUids.length, partial: true }));
  }).then(info => {
    sbNotifyUpdateUi();
    return info;
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
    return sbNotifySendAsk(parsed.target, parsed.text, parsed.options, users, parsed.id).then(item => {
      const n = (item.audience || []).length;
      return 'Ask ' + item.id + ' sent to ' + n + ' user' + (n === 1 ? '' : 's');
    });
  }
  if(parsed.cmd === 'notify-remove'){
    return sbNotifyRemove(parsed.id, parsed.target, users).then(info => {
      if(info.partial) return 'Removed ' + info.id + ' for ' + info.count + ' user' + (info.count === 1 ? '' : 's');
      return 'Removed ' + info.id;
    });
  }
  return sbNotifySend(parsed.target, parsed.text, users, parsed.id).then(item => {
    const n = (item.audience || []).length;
    return 'Sent ' + item.id + ' to ' + n + ' user' + (n === 1 ? '' : 's');
  });
}

const SB_NOTIFY_COMMANDS = ['notify', 'notify-ask', 'notify-remove'];
const SB_NOTIFY_TARGET_HINTS = ['@everyone', '@dev', '@student', '@teacher'];

function sbNotifySuggestTargets(prefix, users){
  const p = String(prefix || '').toLowerCase();
  const extras = [];
  sbNotifyActiveUsers(users).forEach(u => {
    if(u.displayName) extras.push(u.displayName);
    if(u.email) extras.push(u.email);
    if(u.uid) extras.push('#' + u.uid);
  });
  const all = SB_NOTIFY_TARGET_HINTS.concat(extras);
  const options = all.filter(o => !p || String(o).toLowerCase().startsWith(p));
  return options.length ? options : all;
}

function sbNotifyConsoleSuggest(line, users){
  const s = String(line || '');
  if(!/\s/.test(s)){
    const p = s.toLowerCase();
    const options = SB_NOTIFY_COMMANDS.filter(c => !p || c.startsWith(p));
    return { replaceFrom: 0, options: options.length ? options : SB_NOTIFY_COMMANDS.slice(), suffix: '' };
  }
  const sp = s.indexOf(' ');
  const cmd = s.slice(0, sp).toLowerCase();
  const rest = s.slice(sp + 1);
  const firstDone = /\s$/.test(rest) || !!sbNotifyTakeFirst(rest).rest;
  const lead = (rest.match(/^\s*/) || [''])[0].length;
  if(cmd === 'notify-remove'){
    if(!firstDone){
      const prefix = rest.trim().toLowerCase();
      const ids = (_sbNotifyItems || []).map(n => n.id).filter(Boolean);
      const options = ids.filter(id => !prefix || id.toLowerCase().startsWith(prefix));
      return { replaceFrom: sp + 1 + lead, options: options.length ? options : ids, suffix: ' ' };
    }
    const afterId = sbNotifyTakeFirst(rest).rest;
    if(/["']/.test(afterId)) return { replaceFrom: s.length, options: [], suffix: '' };
    const whoLead = (afterId.match(/^\s*/) || [''])[0].length;
    const whoStart = s.length - afterId.length + whoLead;
    return { replaceFrom: whoStart, options: sbNotifySuggestTargets(afterId.trim(), users), suffix: '' };
  }
  if(cmd !== 'notify' && cmd !== 'notify-ask') return { replaceFrom: s.length, options: [], suffix: '' };
  if(/["']/.test(rest)) return { replaceFrom: s.length, options: [], suffix: '' };
  if(!firstDone){
    return { replaceFrom: sp + 1 + lead, options: sbNotifySuggestTargets(rest.trim(), users), suffix: ' ' };
  }
  return { replaceFrom: s.length, options: [], suffix: '' };
}

window.sbNotifyInit = sbNotifyInit;
window.sbNotifyRefresh = sbNotifyRefresh;
window.sbNotifyRunCommand = sbNotifyRunCommand;
window.sbNotifyParseCommand = sbNotifyParseCommand;
window.sbNotifyConsoleSuggest = sbNotifyConsoleSuggest;

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', () => {
    try { sbNotifyInit(); } catch(e) { console.warn('notifications', e); }
  });
} else {
  try { sbNotifyInit(); } catch(e) { console.warn('notifications', e); }
}

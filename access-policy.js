'use strict';
const { isDeepStrictEqual: same } = require('node:util');
const fail = (message = 'Not permitted for this account') => { throw { statusCode: 403, message }; };
const validUid = uid => typeof uid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(uid);
const isStaff = user => ['teacher', 'dev'].includes(user.role);
const own = (uid, user) => { if (!validUid(uid) || uid !== user.uid) fail(); };
const personal = key => key.match(/^_(?:profile_|analyser_draft_|analyser_|kc_games_|up_avatar_|ur_avatar_)(.+)$/);
const without = (obj, fields) => Object.fromEntries(Object.entries(obj || {}).filter(([k]) => !fields.includes(k)));
const items = value => Array.isArray(value) ? value : (value && Array.isArray(value.items) ? value.items : []);
function audience(item, user) {
  if (item.audience && item.audience.length) return item.audience.includes(user.uid);
  const target = item.target || { kind: 'everyone' };
  return target.kind === 'everyone' || (target.kind === 'role' && target.role === user.role) || (target.kind === 'user' && target.uid === user.uid);
}

function authorizeKey(key, user, write, getOwner) {
  if (!/^[A-Za-z0-9._-]{1,120}$/.test(key)) throw { statusCode: 400, message: 'bad key' };
  const match = personal(key);
  if (match) { own(match[1], user); if (write && key.startsWith('_ur_')) fail(); return; }
  if (/^_u[pr]_/.test(key)) {
    if (!/^[A-Za-z0-9_-]{1,116}$/.test(key.slice(4))) fail('Invalid upload ID');
    if (key.startsWith('_ur_') || (getOwner(key.slice(4)) && getOwner(key.slice(4)) !== user.uid)) own(getOwner(key.slice(4)), user);
    if (write && key.startsWith('_ur_')) fail();
    if (!write && key.startsWith('_up_')) fail();
    return;
  }
  if (/^[A-Za-z0-9-]+_(topics|units|pinned_topics)$/.test(key)) {
    if (write && /^\d{4}-/.test(key) && !isStaff(user)) fail('Only teachers and developers may edit class content');
    return;
  }
  if (/^tnotes_[A-Za-z0-9-]+$/.test(key)) { if (write && !isStaff(user)) fail(); return; }
  if (['studybase_events', 'studybase_suggestions', 'studybase_notifications', '_kc_public', 'tetris_leaderboard'].includes(key) || /^_kc_lobby_[A-Z0-9]{6}$/.test(key)) return;
  if (key === 'kc_settings') { if (write && user.role !== 'dev') fail(); return; }
  fail('Unknown or restricted storage key');
}

function readable(key, value, user) {
  if (/^_kc_lobby_/.test(key) && value && value.hostUid !== user.uid) {
    if (!(value.players || []).some(p => p.uid === user.uid)) return {
      code: value.code, hostUid: value.hostUid, gameName: value.gameName,
      status: value.status, passwordHash: value.passwordHash ? 'protected' : ''
    };
    return { ...value, passwordHash: value.passwordHash ? 'protected' : '' };
  }
  if (key !== 'studybase_notifications' || user.role === 'dev') return value;
  return { items: items(value).filter(n => audience(n, user)).map(n => ({ ...n,
    ...(n.answers ? { answers: n.answers[user.uid] ? { [user.uid]: n.answers[user.uid] } : {} } : {})
  })) };
}

function writable(key, value, previous, user, readKey) {
  if (/_topics$/.test(key)) {
    if (!Array.isArray(value)) throw { statusCode: 400, message: 'Topics must be an array' };
    const ids = new Set();
    for (const topic of value) {
      const id = topic && String(topic.id ?? '');
      const canonical = id && id.toLowerCase();
      if (!id || !/^[A-Za-z0-9._-]{1,180}$/.test(id) || canonical === '_meta' || ids.has(canonical))
        throw { statusCode: 400, message: 'Invalid or duplicate topic ID' };
      ids.add(canonical);
    }
  }
  if (/_topics$/.test(key) && !isStaff(user)) {
    if (!Array.isArray(value)) throw { statusCode: 400, message: 'Topics must be an array' };
    const old = new Map((Array.isArray(previous) ? previous : []).map(t => [String(t.id), t]));
    const next = new Map(value.map(t => [String(t.id), t]));
    for (const [id, topic] of old) if (Object.keys(topic.notes || {}).length && !next.has(id)) fail('Only staff may delete topics with teacher notes');
    for (const topic of value) if (!same(topic.notes || {}, (old.get(String(topic.id)) || {}).notes || {})) fail('Only staff may change teacher notes');
  }
  if (key === 'studybase_notifications' && user.role !== 'dev') {
    const old = items(previous);
    const byId = new Map(old.map(n => [n.id, n]));
    const edits = new Map();
    for (const n of items(value)) {
      const before = byId.get(n.id);
      if (!before || !audience(before, user) || !same(without(n, ['readBy', 'answers']), without(before, ['readBy', 'answers']))) fail('Only developers may create or edit notifications');
      const answer = n.answers && n.answers[user.uid];
      if (answer && (!Number.isInteger(answer.option) || answer.option < 0 || answer.option >= (before.options || []).length)) fail('Invalid answer');
      edits.set(n.id, { ...before,
        readBy: [...new Set([...(before.readBy || []), ...((n.readBy || []).includes(user.uid) ? [user.uid] : [])])],
        ...(before.kind === 'ask' ? { answers: { ...(before.answers || {}), ...(answer ? { [user.uid]: { name: user.name || '', option: answer.option } } : {}) } } : {})
      });
    }
    return { items: old.map(n => edits.get(n.id) || n) };
  }
  if (/^_kc_lobby_/.test(key)) {
    if (!value || value.code !== key.slice('_kc_lobby_'.length)) fail('Invalid lobby');
    if (!previous) { own(value.hostUid, user); return value; }
    if (previous.hostUid === user.uid) { if (value.hostUid !== user.uid) fail(); return value; }
    value = { ...value };
    if (Object.hasOwn(previous, 'passwordHash')) value.passwordHash = previous.passwordHash;
    const beforeSelf = (previous.players || []).find(p => p.uid === user.uid);
    const afterSelf = (value.players || []).find(p => p.uid === user.uid);
    if (!beforeSelf && afterSelf && previous.passwordHash) fail('Use the authenticated lobby join endpoint');
    if (!beforeSelf && afterSelf && previous.status !== 'waiting') fail('Lobby has already started');
    if (!same(without(previous, ['players', 'updatedAt', 'rev']), without(value, ['players', 'updatedAt', 'rev']))) fail('Only the host may change lobby settings');
    const beforeOthers = (previous.players || []).filter(p => p.uid !== user.uid);
    const afterOthers = (value.players || []).filter(p => p.uid !== user.uid);
    if (!same(beforeOthers, afterOthers)) fail('Cannot change another player');
    if ((value.players || []).filter(p => p.uid === user.uid).length > 1) fail();
    if (afterSelf) {
      const answers = { ...(beforeSelf && beforeSelf.answers || {}) };
      const submitted = afterSelf.answers || {};
      for (const [index, answer] of Object.entries(submitted)) {
        if (answers[index]) { if (!same(answer, answers[index])) fail('Answer already submitted'); continue; }
        const idx = previous.questionIndex || 0;
        const question = previous.game && previous.game.questions && previous.game.questions[idx];
        const elapsed = Date.now() - previous.questionStartedAt;
        const limit = (previous.questionSeconds || 20) * 1000;
        if (!beforeSelf || previous.status !== 'playing' || String(idx) !== index || !question || !Number.isFinite(elapsed) || elapsed < 0 || elapsed > limit) fail('Question is not open');
        if (!answer || !Number.isInteger(answer.choice) || answer.choice < 0 || answer.choice >= question.answers.length) fail('Invalid choice');
        const correct = answer.choice === question.answers.findIndex(a => a.correct);
        answers[index] = { choice: answer.choice, correct, score: correct ? Math.round(1000 * (1 - 0.5 * elapsed / limit)) : 0, ms: elapsed };
      }
      value.players = value.players.map(p => p.uid !== user.uid ? p : {
        uid: user.uid, name: user.name || '', answers,
        score: Object.values(answers).reduce((sum, a) => sum + a.score, 0)
      });
    }
  }
  if (key === '_kc_public') {
    const old = items(previous);
    const next = items(value);
    const codes = new Set([...old, ...next].map(n => n.code));
    for (const code of codes) {
      if (same(old.find(n => n.code === code), next.find(n => n.code === code))) continue;
      const lobby = readKey('_kc_lobby_' + code);
      if (!lobby || lobby.hostUid !== user.uid) fail('Only the host may update a lobby listing');
    }
  }
  return value;
}
module.exports = { validUid, authorizeKey, readable, writable };

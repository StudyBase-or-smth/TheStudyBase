// Topic editor quality-of-life features. Core rendering and storage stay in topicapp.js.
(function () {
  'use strict';
  if(!SUBJECT || !window.SBQoL) return;
  const ui = window.SBQoL;
  const stateKey = 'navigation:' + APP_MODE + ':' + SUBJECT.id;
  const draftKey = 'drafts:' + APP_MODE + ':' + SUBJECT.id;
  const trashKey = 'trash:' + APP_MODE + ':' + SUBJECT.id;
  let restoring = false, selecting = false, selected = new Set(), timer;
  const clone = value => JSON.parse(JSON.stringify(value));
  const originFor = id => id ? LINKED_CLASSES.find(c => c.id === id) : null;
  function allowed(origin) { const previous = activeOrigin; activeOrigin = origin; const result = canEditTopic(); activeOrigin = previous; return result && (!origin || window.userRole === 'dev'); }
  function persistDrafts() {
    if(editSurface !== 'inline') return;
    const drafts = collectDirtyEditDrafts();
    if(!drafts.length) { ui.write(draftKey,null); return; }
    const saved = ui.write(draftKey,{ drafts, active: editId, originId: editOrigin?.id || null, savedAt: Date.now() });
    const status = document.getElementById('qol-save-state');
    if(status) status.textContent = saved ? 'Unsaved changes · draft saved on this device' : 'Unsaved changes · draft storage is full';
    decorateList();
  }
  function queueDrafts() { clearTimeout(timer); timer = setTimeout(persistDrafts,350); }
  function recovery() {
    if(editSurface === 'inline' || document.getElementById('qol-recovery')) return;
    const saved = ui.read(draftKey,null); if(!saved?.drafts?.length) return;
    const bar = ui.node('div','qol-recovery'); bar.id = 'qol-recovery';
    bar.append(ui.node('span','',`You have ${saved.drafts.length} recoverable topic draft${saved.drafts.length === 1 ? '' : 's'}.`));
    bar.append(ui.button('Restore drafts',() => {
      const valid = saved.drafts.filter(d => (!d.originId || originFor(d.originId)) && allowed(originFor(d.originId)) && topicsForDraft(d).some(t => t.id == d.id));
      if(!valid.length) { ui.notify('These drafts cannot be opened with your current permissions.'); return; }
      editBatchDrafts = Object.fromEntries(valid.map(d => [editDraftKey(d.id,originFor(d.originId)),d]));
      const target = valid.find(d => d.id == saved.active && d.originId === saved.originId) || valid[0];
      activeOrigin = originFor(target.originId); activeId = target.id; startInlineEdit(target.id,{fromSwitch:true}); bar.remove();
    }));
    bar.append(ui.button('Discard',() => ui.dialog('Discard recovered drafts?', (content,close) => {
      content.append(ui.node('p','','These unsaved edits will be removed from this device. Saved topics will be kept.'));
      content.append(ui.button('Discard drafts',() => { ui.write(draftKey,null); bar.remove(); close(); },'qol-button danger'));
    })));
    const panel = document.querySelector('.detail-panel'); panel.prepend(bar);
  }
  function persistNavigation() {
    if(restoring) return;
    ui.write(stateKey,{ topic: activeId, originId: activeOrigin?.id || null, expanded: [...expandedTopics], units: [...activeUnits], tab: sidebarTab, classId: activeClassId,
      search: document.getElementById('searchInput').value, collapsed: document.querySelector('.sidebar')?.classList.contains('collapsed'), scroll: document.querySelector('.detail-panel').scrollTop,
      listScroll: document.getElementById('topicList').scrollTop });
  }
  let navigationRestored = false;
  function restoreNavigation() {
    if(navigationRestored || new URLSearchParams(location.search).has('topic') || new URLSearchParams(location.search).has('unit')) { navigationRestored = true; return; }
    const saved = ui.read(stateKey,null); if(!saved) { navigationRestored = true; return; }
    const origin = originFor(saved.originId); if(saved.originId && !origin) return;
    if(saved.topic != null && !topicsForOrigin(origin).some(t => t.id == saved.topic)) return;
    navigationRestored = true; restoring = true;
    expandedTopics = new Set(saved.expanded || []); activeUnits = new Set(saved.units || []);
    document.getElementById('searchInput').value = saved.search || '';
    if(saved.classId) activeClassId = saved.classId;
    if(saved.tab === 'classes' && LINKED_CLASSES.length) setSidebarTab('classes');
    if(!!saved.collapsed !== !!document.querySelector('.sidebar')?.classList.contains('collapsed')) toggleSidebarCollapsed();
    renderList(); if(saved.topic != null) viewTopic(saved.topic,saved.originId);
    requestAnimationFrame(() => { document.querySelector('.detail-panel').scrollTop = saved.scroll || 0; document.getElementById('topicList').scrollTop = saved.listScroll || 0; restoring = false; });
  }
  function originLabel(origin) { return origin ? origin.name + ' · Class ' + (origin.class || '') : IS_CLASS_PAGE ? SUBJECT.name + ' · Class ' + (SUBJECT.class || '') : 'Subject reference'; }
  function decorateHeader() {
    const header = document.querySelector('#detailContent .dh'); if(!header) return;
    let details = document.getElementById('qol-topic-details');
    if(!details) { details = ui.node('div','qol-topic-details'); details.id = 'qol-topic-details'; header.append(details); }
    details.replaceChildren();
    const canEdit = allowed(activeOrigin);
    details.append(ui.node('span','qol-source',originLabel(activeOrigin) + (canEdit ? '' : ' · Read only')));
    const topic = topicsForOrigin(activeOrigin).find(t => t.id == activeId);
    if(topic?.unit) details.append(ui.node('span','qol-metadata',unitLabel(topic.unit,unitsForOrigin(activeOrigin))));
    if(topic?.updatedAt || topic?.createdAt) {
      const date = ui.node('span','qol-metadata','Edited ' + new Date(topic.updatedAt || topic.createdAt).toLocaleDateString('en-AU',{day:'numeric',month:'short'}));
      date.title = 'Added ' + new Date(topic.createdAt).toLocaleDateString('en-AU') + ' · Edited ' + new Date(topic.updatedAt || topic.createdAt).toLocaleDateString('en-AU'); details.append(date);
    }
    const state = ui.node('span','qol-save-state'); state.id = 'qol-save-state'; state.setAttribute('role','status'); state.setAttribute('aria-live','polite'); details.append(state);
    const actions = ui.node('div','qol-topic-tools');
    if(editSurface === 'inline' && canEdit && !header.querySelector('.qol-duplicate-icon')) {
      const copy = ui.button('',duplicate,'btn-act qol-duplicate-icon');
      copy.title = 'Duplicate topic'; copy.setAttribute('aria-label','Duplicate topic');
      copy.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg><span class="qol-sr-only">Duplicate</span>';
      header.querySelector('.dh-actions-btns')?.prepend(copy);
    }
    if(editSurface !== 'inline') actions.append(ui.button('Revise',revise));
    details.append(actions);
    saveState();
  }
  function saveState() {
    const el = document.getElementById('qol-save-state'); if(!el) return;
    if(editSurface === 'inline' && editBatchDirtyCount()) { el.textContent = 'Unsaved changes'; return; }
    const key = activeOrigin?.storageKey || ST;
    if(getUnsyncedTopicIds(key).size) { el.textContent = 'Pending sync'; el.title = 'Saved on this device; waiting to sync with the server.'; }
    else { el.textContent = lastSync === 'ok' ? 'Synced' : lastSync === 'syncing' ? 'Syncing' : 'Saved locally'; el.title = lastSync === 'ok' ? 'Saved on this device and synced with the server.' : 'Saved on this device.'; }
  }
  let lastSync = 'unknown';
  const originalStatus = setSyncStatus;
  setSyncStatus = function(status) { lastSync = status; originalStatus(status); saveState(); };
  const originalBatchButtons = updateEditBatchButtons;
  updateEditBatchButtons = function() { originalBatchButtons(); const count = editBatchDirtyCount();
    const save = document.getElementById('inlineSaveBtn'); if(save) save.textContent = count > 1 ? `Save ${count} topics` : 'Save topic';
    const cancel = document.getElementById('inlineCancelBtn'); if(cancel) cancel.textContent = count > 1 ? 'Discard edits' : 'Cancel';
    saveState(); queueDrafts();
  };
  const originalStash = stashCurrentEditDraft;
  stashCurrentEditDraft = function() { originalStash(); persistDrafts(); };
  const originalStart = startInlineEdit;
  startInlineEdit = function(id,opts) { const topic = topicsForOrigin(activeOrigin).find(t => t.id == id); if(!topic) return; originalStart(topic.id,opts); decorateHeader(); updateEditBatchButtons(); };
  const originalSave = saveTopic;
  saveTopic = function() { originalSave(); if(editSurface !== 'inline') { clearTimeout(timer); ui.write(draftKey,null); document.getElementById('qol-recovery')?.remove(); decorateHeader(); persistNavigation(); } };
  const originalCancel = closeInlineEdit;
  closeInlineEdit = function() {
    const count = collectDirtyEditDrafts().length;
    const discard = () => { clearTimeout(timer); ui.write(draftKey,null); originalCancel(); document.getElementById('qol-recovery')?.remove(); decorateHeader(); };
    if(!count) { discard(); return; }
    persistDrafts(); ui.dialog('Discard unsaved edits?', (content,close) => {
      content.append(ui.node('p','',`This discards your edits to ${count} topic${count === 1 ? '' : 's'}. Saved topic content will be kept.`));
      content.append(ui.button('Keep editing',close), ui.button('Discard edits',() => { close(); discard(); },'qol-button danger'));
    });
  };
  const originalView = viewTopic;
  viewTopic = function(id,oid) {
    const origin = originFor(oid); const topic = topicsForOrigin(origin).find(t => t.id == id); if(!topic) return;
    if(editSurface === 'inline') persistDrafts(); originalView(topic.id,oid);
    if(topic) ui.record(origin || SUBJECT,topic,!!origin || IS_CLASS_PAGE);
    decorateHeader(); decorateList(); persistNavigation();
  };
  function decorateList() {
    const drafts = collectDirtyEditDrafts();
    document.querySelectorAll('#topicList [data-topic-id]').forEach(item => {
      const id = decodeURIComponent(item.dataset.topicId);
      const dirty = drafts.some(d => !d.originId && String(d.id) === id);
      item.classList.toggle('qol-dirty',dirty); item.title = dirty ? 'Unsaved edits' : '';
      let checkbox = item.querySelector('.qol-select-topic');
      if(selecting && !checkbox) { checkbox = ui.node('input','qol-select-topic'); checkbox.type = 'checkbox'; checkbox.setAttribute('aria-label','Select ' + (getTopics().find(t => String(t.id) === id)?.name || 'topic'));
        checkbox.addEventListener('click',e => e.stopPropagation()); checkbox.addEventListener('change',() => { checkbox.checked ? selected.add(id) : selected.delete(id); updateSelection(); }); item.prepend(checkbox); }
      if(checkbox) { checkbox.hidden = !selecting; checkbox.checked = selected.has(id); }
      item.draggable = editSurface === 'inline' && !editOrigin && allowed(null);
      if(item.draggable) item.title = 'Drag to reorder or move into a parent topic';
    });
    const list = document.getElementById('topicList');
    if(editSurface === 'inline' && !editOrigin && allowed(null) && !list.querySelector('.qol-root-drop')) {
      const root = ui.node('div','qol-root-drop','Drop here to move out of a parent'); root.dataset.rootDrop = 'true'; list.prepend(root);
    } else if(editSurface !== 'inline') list.querySelector('.qol-root-drop')?.remove();
  }
  const originalRender = renderList;
  renderList = function() { originalRender(); decorateList(); recovery(); restoreNavigation(); };
  function trash() { return ui.read(trashKey,[]).filter(r => Date.now() - r.deletedAt < 30 * 86400000); }
  function archive(before,after,origin,label) {
    const affected = before.filter(t => !after.some(a => a.id == t.id && JSON.stringify(a) === JSON.stringify(t)));
    if(!affected.length) return null;
    const entry = { id: Date.now().toString(36) + Math.random().toString(36).slice(2), deletedAt: Date.now(), originId: origin?.id || null, label, topics: affected, after: after.filter(t => affected.some(a => a.id == t.id)) };
    if(!ui.write(trashKey,[entry,...trash()].slice(0,30))) { ui.notify('Trash storage is full. Deletion was stopped.'); return null; } return entry;
  }
  function restoreEntry(entry) {
    const origin = originFor(entry.originId);
    if((entry.originId && !origin) || !allowed(origin)) { ui.notify('You do not have permission to restore these topics.'); return; }
    const current = topicsForOrigin(origin);
    for(const t of entry.topics) { const now = current.find(x => x.id == t.id); const expected = entry.after.find(x => x.id == t.id);
      if(now && (!expected || JSON.stringify(now) !== JSON.stringify(expected))) { ui.notify('A topic has changed since deletion. Restore stopped to preserve the newer content.'); return; } }
    const next = current.filter(t => !entry.topics.some(x => x.id == t.id)).concat(entry.topics);
    saveTopicsForOrigin(origin,next); ui.write(trashKey,trash().filter(x => x.id !== entry.id)); renderList(); ui.notify('Topics restored.');
  }
  const originalDelete = doDelete;
  doDelete = function(keep) {
    if(pendingAction?.type !== 'topic') { originalDelete(keep); return; }
    const { id, origin = null } = pendingAction; if(!allowed(origin)) return;
    const before = topicsForOrigin(origin); const topic = before.find(t => t.id == id); if(!topic) return;
    let after;
    if(keep) after = before.filter(t => t.id != id).map(t => t.parentId == id ? {...t,parentId:topic.parentId || null,unit:t.unit || topic.unit || ''} : t);
    else { const ids = new Set([id,...getDescendantIds(id,before)].map(String)); after = before.filter(t => !ids.has(String(t.id))); }
    const entry = archive(before,after,origin,topic.name); if(!entry) return;
    originalDelete(keep); ui.notify('Topic moved to trash. Kept for 30 days on this device.','Undo',() => restoreEntry(entry));
  };
  function openTrash() {
    ui.dialog('Recently deleted topics', (content,close) => {
      content.append(ui.node('p','qol-muted','Deleted topics and their subtopics are recoverable for 30 days on this device.'));
      const entries = trash(); if(!entries.length) content.append(ui.node('p','','Trash is empty.'));
      for(const entry of entries) { const row = ui.node('div','qol-trash-row'); row.append(ui.node('strong','',entry.label),ui.node('span','qol-muted',new Date(entry.deletedAt).toLocaleDateString())); row.append(ui.button('Restore',() => { close(); restoreEntry(entry); })); content.append(row); }
    });
  }
  function duplicate() {
    const origin = activeOrigin; if(!allowed(origin)) return;
    if(editSurface === 'inline' && editBatchDirtyCount()) { ui.notify('Save your edits before duplicating this topic.'); return; }
    const editing = editSurface === 'inline'; if(editing) finishEditSession();
    const topics = topicsForOrigin(origin); const ids = new Set([activeId,...getDescendantIds(activeId,topics)].map(String));
    const copies = topics.filter(t => ids.has(String(t.id))); const map = new Map(); let nextId = Date.now();
    for(const t of copies) { while(topics.some(x => x.id == nextId)) nextId++; map.set(String(t.id),nextId++); }
    const now = new Date().toISOString(); const next = copies.map(t => ({...clone(t),id:map.get(String(t.id)),name:t.id == activeId ? t.name + ' (copy)' : t.name,parentId:map.get(String(t.parentId)) || t.parentId || null,createdAt:now,updatedAt:now,addedBy:window.currentUid || null}));
    saveTopicsForOrigin(origin,topics.concat(next)); renderList(); viewTopic(map.get(String(activeId)),origin?.id); if(editing) startInlineEdit(activeId); ui.notify('Topic and subtopics duplicated.');
  }
  function moveDialog(ids,origin) {
    if(!allowed(origin)) return;
    if(editSurface === 'inline' && editBatchDirtyCount()) { ui.notify('Save your topic edits before moving topics.'); return; }
    ui.dialog('Move topics to a unit',(content,close) => {
      const select = ui.node('select','qol-search'); const unassigned = ui.node('option','','No unit'); unassigned.value = ''; select.append(unassigned);
      for(const u of unitsForOrigin(origin)) { const option = ui.node('option','',u.name); option.value = u.id; select.append(option); }
      content.append(ui.node('p','','Subtopics move with their parent. Select a parent to move its whole group.'),select);
      content.append(ui.button('Move',() => {
        const topics = topicsForOrigin(origin); const requested = new Set(ids.map(String));
        if(topics.some(t => requested.has(String(t.id)) && t.parentId && !requested.has(String(t.parentId)))) { ui.notify('Select the parent topic to move this subtopic group.'); return; }
        const all = new Set(ids.flatMap(id => [id,...getDescendantIds(id,topics)]).map(String));
        const editing = editSurface === 'inline'; if(editing) finishEditSession();
        saveTopicsForOrigin(origin,topics.map(t => all.has(String(t.id)) ? {...t,unit:select.value,updatedAt:new Date().toISOString()} : t)); close(); renderList(); if(activeId) { viewTopic(activeId,origin?.id); if(editing) startInlineEdit(activeId); } selected.clear(); updateSelection(); ui.notify('Topics moved.');
      },'qol-button primary'));
    });
  }
  function deleteSelection() {
    if(!allowed(null) || !selected.size) return;
    if(editSurface === 'inline' && editBatchDirtyCount()) { ui.notify('Save or discard your edits before deleting topics.'); return; }
    ui.dialog('Move selected topics to trash?', (content,close) => {
      content.append(ui.node('p','',`This deletes ${selected.size} selected topic${selected.size === 1 ? '' : 's'} and their subtopics. You can restore them from Trash.`));
      content.append(ui.button('Move to trash',() => {
        const before = getTopics(); const ids = new Set([...selected].flatMap(id => { const t = before.find(t => String(t.id) === id); return t ? [t.id,...getDescendantIds(t.id,before)] : []; }).map(String)); const after = before.filter(t => !ids.has(String(t.id)));
        const entry = archive(before,after,null,`${selected.size} selected topics`); if(!entry) return;
        saveTopics(after); if(ids.has(String(activeId))) closeTopicView(); selected.clear(); close(); renderList(); updateSelection(); ui.notify('Selected topics moved to trash.','Undo',() => restoreEntry(entry));
      },'qol-button danger'));
    });
  }
  function updateSelection() { const el = document.getElementById('qol-selection-count'); if(el) el.textContent = selecting ? `${selected.size} selected` : ''; const bulk = document.getElementById('qol-bulk-actions'); if(bulk) bulk.hidden = !selecting; decorateList(); }
  function revise() {
    if(!activeId) return;
    const origin = activeOrigin || SUBJECT; const topic = topicsForOrigin(activeOrigin).find(t => t.id == activeId);
    ui.dialog('Revise this topic',(content,close) => {
      const fc = new URL('subject/flashcards.html',ui.root); fc.hash = origin.id; fc.searchParams.set('topic',activeId); if(topic?.unit) fc.searchParams.set('unit',topic.unit);
      const a = ui.node('a','qol-button primary','Practice flashcards'); a.href = fc.href; content.append(a);
      const supported = {eng2:'Engineering',mth:'Maths'}; const subjectId = origin.subjectId || origin.id;
      const hsc = new URL('HSC/HSC.html',ui.root); if(supported[subjectId]) hsc.searchParams.set('subject',supported[subjectId]);
      const quiz = ui.node('a','qol-button','HSC practice'); quiz.href = hsc.href; content.append(quiz);
      content.append(ui.node('p','qol-muted',supported[subjectId] ? 'HSC practice opens your subject. Flashcards focus on this topic and its subtopics.' : 'Flashcards focus on this topic and its subtopics. Choose an available subject in HSC practice.'));
    });
  }
  function boot() {
    const panel = document.querySelector('.detail-panel'); let navigationTimer;
    panel.addEventListener('scroll',() => { clearTimeout(navigationTimer); navigationTimer = setTimeout(persistNavigation,150); },{passive:true});
    document.querySelector('.sidebar').addEventListener('click',() => setTimeout(persistNavigation,0));
    document.getElementById('searchInput').addEventListener('input',() => { selected.clear(); updateSelection(); persistNavigation(); });
    document.getElementById('detailContent').addEventListener('input',queueDrafts);
    document.getElementById('detailContent').addEventListener('change',queueDrafts);
    wireTopicDragging();
    window.addEventListener('beforeunload',e => { persistDrafts(); persistNavigation(); if(editSurface === 'inline' && collectDirtyEditDrafts().length) { e.preventDefault(); e.returnValue = ''; } });
    document.addEventListener('visibilitychange',() => { if(document.hidden) { persistDrafts(); persistNavigation(); } });
    document.addEventListener('keydown',e => { if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && editSurface) { e.preventDefault(); saveTopic(); } });
    sbWhenDiskReady(() => { renderList(); restoreNavigation(); recovery(); });
  }
  function relocateTopic(id,targetId,position) {
    if(editSurface !== 'inline' || editOrigin || !allowed(null)) return false;
    stashCurrentEditDraft();
    const topics = getTopics(); const moved = topics.find(t => t.id == id); const target = targetId == null ? null : topics.find(t => t.id == targetId);
    if(!moved || (targetId != null && !target)) return false;
    const descendants = new Set(getDescendantIds(moved.id,topics).map(String));
    if(target && (target.id === moved.id || descendants.has(String(target.id)))) { ui.notify('A topic cannot be moved inside itself or its subtopics.'); return false; }
    const parentId = !target ? null : position === 'inside' ? target.id : target.parentId;
    const parent = topics.find(t => t.id === parentId);
    const siblings = topics.filter(t => t.parentId === parentId && t.id !== moved.id).sort(topicSidebarCompare);
    const index = !target || position === 'inside' ? siblings.length : siblings.findIndex(t => t.id === target.id) + (position === 'after' ? 1 : 0);
    siblings.splice(Math.max(0,index),0,moved);
    const ranks = new Map(siblings.map((t,i) => [t.id,i]));
    const unit = parent ? parent.unit : moved.unit;
    const next = topics.map(t => ({...t,...(ranks.has(t.id) ? {order:ranks.get(t.id)} : {}),...(t.id === moved.id ? {parentId,unit} : descendants.has(String(t.id)) ? {unit} : {})}));
    const drafts = Object.values(editBatchDrafts || {});
    for(const draft of drafts) {
      const actual = next.find(t => t.id === draft.id); if(!actual) continue;
      draft.parentId = actual.parentId; draft.order = actual.order;
      if(draft.id === moved.id || descendants.has(String(draft.id))) draft.unit = unit;
      if(draft.id === moved.parentId && draft.id !== parentId) draft.subtopicRows = (draft.subtopicRows || []).filter(row => String(row.id) !== moved.id);
      if(draft.id === parentId && draft.id !== moved.parentId && !(draft.subtopicRows || []).some(row => String(row.id) === moved.id)) {
        draft.subtopicRows = [...(draft.subtopicRows || []),{id:moved.id,name:drafts.find(d => d.id === moved.id)?.name || moved.name}];
      }
    }
    saveTopics(next); if(parentId) { expandedTopics.add(parentId); window.qolParentCollapsed?.delete(String(parentId)); }
    renderList(); startInlineEdit(editId,{fromSwitch:true}); persistDrafts();
    ui.notify(parentId ? 'Topic moved. Unsaved edits are preserved.' : 'Topic moved to the top level. Unsaved edits are preserved.'); return true;
  }
  function wireTopicDragging() {
    const list = document.getElementById('topicList'); let dragged = null;
    const clear = () => list.querySelectorAll('.qol-drop-inside,.qol-drop-before,.qol-drop-after').forEach(el => el.classList.remove('qol-drop-inside','qol-drop-before','qol-drop-after'));
    const destination = e => {
      const root = e.target.closest('[data-root-drop]'); if(root) return {el:root,id:null,position:'inside'};
      const el = e.target.closest('[data-topic-id]'); if(!el) return list.contains(e.target) ? {el:list,id:null,position:'inside'} : null;
      const rect = el.getBoundingClientRect(); const fraction = rect.height ? (e.clientY - rect.top) / rect.height : .5;
      return {el,id:decodeURIComponent(el.dataset.topicId),position:fraction < .25 ? 'before' : fraction > .75 ? 'after' : 'inside'};
    };
    list.addEventListener('dragstart',e => { const row = e.target.closest('[data-topic-id]'); if(!row?.draggable) return; dragged = decodeURIComponent(row.dataset.topicId); e.dataTransfer.setData('text/plain',dragged); e.dataTransfer.effectAllowed = 'move'; row.classList.add('qol-dragging'); });
    list.addEventListener('dragover',e => { if(!dragged) return; const dest = destination(e); if(!dest) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; clear(); dest.el.classList.add('qol-drop-' + dest.position); });
    list.addEventListener('drop',e => { if(!dragged) return; const dest = destination(e); if(!dest) return; e.preventDefault(); const id = dragged; dragged = null; clear(); relocateTopic(id,dest.id,dest.position); });
    list.addEventListener('dragend',() => { dragged = null; clear(); list.querySelectorAll('.qol-dragging').forEach(el => el.classList.remove('qol-dragging')); });
  }
  window.SBTopicQoL = { commands: () => [{name:'New topic',run:() => openModal()}, {name:'Search current subject',run:() => document.getElementById('searchInput').focus()}, {name:'Recently deleted topics',run:openTrash}], persistDrafts, relocateTopic };
  window.qolParentCollapsed = new Set();
  window.sidebarTopicClick = function(id,originId) {
    const origin = originFor(originId); const topics = topicsForOrigin(origin); const topic = topics.find(t => t.id == id);
    if(topic && activeId == id && (activeOrigin?.id || null) === (originId || null) && topics.some(t => t.parentId == id)) {
      if(expandedTopics.has(topic.id)) { expandedTopics.delete(topic.id); window.qolParentCollapsed.add(String(topic.id)); }
      else { expandedTopics.add(topic.id); window.qolParentCollapsed.delete(String(topic.id)); }
      renderList(); persistNavigation(); return;
    }
    window.qolParentCollapsed.delete(String(id));
    viewTopic(id,originId);
  };
  boot();
})();

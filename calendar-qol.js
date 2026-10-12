// Month/agenda views and actionable deadlines for the hub calendar.
(function(){
  'use strict';
  if(!window.SBQoL || !document.getElementById('calGrid')) return;
  const ui = window.SBQoL;
  let mode = ui.read('calendar-view','month'), subjectFilter = '', showCompleted = false, days = 14;
  const typeLabels = {exam:'Exam',assessment:'Assessment',assignment:'Assignment',reminder:'Reminder'};
  const dayNumber = date => { const [y,m,d] = String(date).split('-').map(Number); return Date.UTC(y,m-1,d)/86400000; };
  const todayKey = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); };
  const colour = ev => (subjectsData.subjects || []).find(s => s.name === ev.subject || s.id === ev.subject)?.colour || ({exam:'#dc2626',assessment:'#ea580c',assignment:'#2563eb',reminder:'#16a34a'}[ev.type] || '#78716c');
  function countdown(ev){
    if(ev.completed) return 'Completed';
    const diff = dayNumber(ev.date) - dayNumber(todayKey());
    if(diff < 0) return `${Math.abs(diff)} day${diff === -1 ? '' : 's'} overdue`;
    if(diff === 0) return 'Due today'; if(diff === 1) return 'Due tomorrow'; return `Due in ${diff} days`;
  }
  function filtered(events){ return events.filter(e => (showCompleted || !e.completed) && (!subjectFilter || e.subject === subjectFilter)); }
  function autoCompleteEvents(events,today = todayKey()){
    let changed = false;
    const next = events.map(ev => {
      if(!ev.completed && dayNumber(today) - dayNumber(ev.date) >= 5){
        changed = true; return {...ev,completed:true,autoCompleted:true,completedAt:new Date().toISOString()};
      }
      return ev;
    });
    return changed ? next : events;
  }
  function upcoming(events){
    const today = dayNumber(todayKey());
    return filtered(events).filter(e => Number.isFinite(dayNumber(e.date)) && (mode === 'agenda' ? dayNumber(e.date) <= today + days : true))
      .sort((a,b) => Number(!!a.completed) - Number(!!b.completed) || (a.date + (a.time || '23:59')).localeCompare(b.date + (b.time || '23:59')))
      .slice(0,mode === 'agenda' ? 100 : 5);
  }
  function eventRow(ev){
    const row = ui.node('div','calendar-agenda-row' + (ev.completed ? ' is-completed' : '')); row.style.setProperty('--event-colour',colour(ev));
    const check = ui.node('input','calendar-complete'); check.type = 'checkbox'; check.checked = !!ev.completed; check.disabled = !!window.isGuest;
    check.setAttribute('aria-label',(ev.completed ? 'Mark incomplete: ' : 'Mark completed: ') + ev.title);
    check.addEventListener('change',() => { if(window.isGuest) return; saveEvents(getEvents().map(e => e.id === ev.id ? {...e,completed:check.checked,completedAt:check.checked ? new Date().toISOString() : null} : e)); renderCalendar(); });
    const open = ui.button('',() => openEventModal(ev.id,null),'calendar-event-details');
    open.append(ui.node('strong','',ev.title));
    const date = new Date(ev.date + 'T00:00:00');
    const source = ui.node('span','calendar-event-source',[ev.subject || 'General',typeLabels[ev.type] || 'Event',date.toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'}),ev.time].filter(Boolean).join(' · '));
    source.style.color = colour(ev); open.append(source);
    if(ev.tooltip) { const notes = ui.node('span','calendar-event-note',ev.tooltip); notes.title = ev.tooltip; open.append(notes); }
    const deadline = ui.node('span','calendar-deadline' + (!ev.completed && dayNumber(ev.date) < dayNumber(todayKey()) ? ' overdue' : ''),countdown(ev));
    if(ev.autoCompleted) deadline.title = 'Completed automatically after five days overdue';
    row.append(check,open,deadline); return row;
  }
  renderUpcoming = function(events){
    const list = document.getElementById('upcomingList'); list.replaceChildren();
    const heading = ui.node('div','calendar-agenda-heading',mode === 'agenda' ? `Next ${days} days & overdue` : 'Upcoming deadlines'); list.append(heading);
    const rows = upcoming(events);
    if(!rows.length) list.append(ui.node('p','upcoming-empty',showCompleted ? 'No events match these filters.' : 'No pending deadlines. Add an event to plan your next task.'));
    else rows.forEach(ev => list.append(eventRow(ev)));
  };
  const originalCalendar = renderCalendar;
  renderCalendar = function(){
    if(!window.isGuest){ const events = getEvents(); const next = autoCompleteEvents(events); if(next !== events) saveEvents(next); }
    originalCalendar();
    const agenda = mode === 'agenda';
    document.getElementById('calGrid').hidden = agenda; document.getElementById('calDow').hidden = agenda;
    document.querySelector('.cal-nav').hidden = agenda;
    if(agenda) document.getElementById('calMonthLabel').textContent = 'Agenda';
    document.querySelectorAll('[data-calendar-view]').forEach(b => b.setAttribute('aria-pressed',String(b.dataset.calendarView === mode)));
    document.getElementById('calendar-range').hidden = !agenda;
  };
  const controls = ui.node('div','calendar-controls');
  const views = ui.node('div','calendar-view-tabs'); views.setAttribute('aria-label','Calendar view');
  for(const [value,label] of [['month','Month'],['agenda','Agenda']]) { const b = ui.button(label,() => { mode = value; ui.write('calendar-view',mode); renderCalendar(); const panel = mode === 'agenda' ? document.getElementById('upcomingList') : document.getElementById('calGrid'); panel.animate?.([{opacity:.65},{opacity:1}],{duration:!ui.motionEnabled() ? 0 : 140}); }); b.dataset.calendarView = value; views.append(b); }
  const subject = ui.node('select','calendar-filter'); subject.setAttribute('aria-label','Filter events by subject'); const all = ui.node('option','','All subjects'); all.value = ''; subject.append(all);
  for(const s of subjectsData.subjects || []) { const option = ui.node('option','',s.name); option.value = s.name; subject.append(option); }
  subject.addEventListener('change',() => { subjectFilter = subject.value; renderCalendar(); });
  const range = ui.node('select','calendar-filter'); range.id = 'calendar-range'; range.setAttribute('aria-label','Agenda date range');
  for(const n of [7,14]) { const option = ui.node('option','',`Next ${n} days`); option.value = n; range.append(option); } range.value = days; range.addEventListener('change',() => { days = Number(range.value); renderCalendar(); });
  const completed = ui.node('label','calendar-show-completed'); const checkbox = ui.node('input'); checkbox.type = 'checkbox'; checkbox.addEventListener('change',() => { showCompleted = checkbox.checked; renderCalendar(); }); completed.append(checkbox,ui.node('span','','Show completed'));
  controls.append(views,subject,range,completed); document.querySelector('.cal-header').after(controls);
  const originalOpen = openEventModal;
  openEventModal = function(id,date){ originalOpen(id,date); const check = document.getElementById('evCompleted'); check.checked = !!getEvents().find(e => e.id === id)?.completed; };
  const completeRow = ui.node('label','calendar-show-completed calendar-modal-completed'); const completeCheck = ui.node('input'); completeCheck.type = 'checkbox'; completeCheck.id = 'evCompleted'; completeRow.append(completeCheck,ui.node('span','','Completed')); document.querySelector('.ev-actions').before(completeRow);
  // Keep local edits while their full event-list write is waiting for the server.
  let version = 0;
  syncPushEvents = function(events){
    const gen = ++version; ui.write('calendar-pending',events);
    return sbPushToSync(EVENTS_KEY,events).then(() => { if(gen === version) ui.write('calendar-pending',null); }).catch(() => {});
  };
  calSync = async function(){
    const pending = ui.read('calendar-pending',null);
    if(pending) { sbMemSet(EVENTS_KEY,pending); await syncPushEvents(pending); renderCalendar(); return; }
    const gen = version;
    try { const res = await jsonpGet(SYNC_URL + '?key=' + encodeURIComponent(EVENTS_KEY)); if(gen === version && Array.isArray(res?.data)) { sbMemSet(EVENTS_KEY,res.data); renderCalendar(); } } catch(_) {}
  };
  window.SBCalendar = {colour,filtered,countdown,upcoming,autoCompleteEvents};
  let currentDay = todayKey();
  setInterval(() => { const day = todayKey(); if(day !== currentDay){ currentDay = day; renderCalendar(); } },60000);
  if(mode !== 'agenda') mode = 'month';
  renderCalendar();
})();

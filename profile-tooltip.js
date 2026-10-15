// Shared header profile tooltip. Load after profile-store.js.
function updateHdrProfile(){
  const btn = document.getElementById('hdrProfileBtn');
  if(!btn) return;
  const face = btn.querySelector('.hdr-profile-face') || btn;
  const tip = document.getElementById('hdrProfileTip');
  const p = window.sbProfile || {};
  const img = profilePhotoImgHtml(p.photoThumb || p.photoUrl);
  if(img) face.innerHTML = img;
  else face.textContent = '👤';

  const acct = window.sbAccount || {};
  const name = acct.name || localStorage.getItem('studybase_display_name') || (window.isGuest ? 'Guest' : 'Profile');
  const email = acct.email || localStorage.getItem('studybase_email') || '';
  const role = acct.role || window.userRole || (window.isGuest ? 'guest' : 'student');
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
  if(tip){
    const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const darkIcon = currentDarkIcon();
    tip.innerHTML = '<div class="pt-top"><div class="pt-name">' + esc(name) + '</div>' +
      '<div class="pt-actions">' +
      '<button type="button" class="pt-dark" onclick="event.stopPropagation();toggleDark()" aria-label="Toggle dark mode">' + darkIcon + '</button>' +
      '<button type="button" class="pt-signout" onclick="event.stopPropagation();sbSignOut()">Sign out</button>' +
      '</div></div>' +
      '<div class="pt-role">' + esc(roleLabel) + '</div>' +
      (email ? '<div class="pt-email">' + esc(email) + '</div>' : '');
  }
  initProfileTooltip();
}

function bootHdrProfile(user, role){
  const isUser = !!(user && user.uid);
  const displayName = isUser
    ? (user.displayName || (user.email || '').split('@')[0].split('.').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '))
    : 'Guest';
  const r = role || (isUser ? (window.userRole || 'student') : 'guest');
  window.sbAccount = { name: displayName, email: isUser ? (user.email || '') : '', role: r };
  if(isUser){
    window.currentUid = user.uid;
    localStorage.setItem('studybase_uid', user.uid);
    localStorage.setItem('studybase_display_name', displayName);
    localStorage.setItem('studybase_email', user.email || '');
    applyProfileCache(user.uid);
    updateHdrProfile();
    pullProfile(user.uid).then(() => updateHdrProfile());
  } else {
    applyProfileCache('guest');
    updateHdrProfile();
  }
}

(function () {
  const root = new URL('./', document.currentScript?.src || new URL(location.pathname.includes('/subject/') || location.pathname.includes('/quiz-tool/') || location.pathname.includes('/KnowledgeCompetition/') ? '../' : './', location.href));
  const bound = new WeakSet();
  const node = (tag, cls, text) => { const el = document.createElement(tag); el.className = cls; el.textContent = text; return el; };
  window.initProfileTooltip = function () {
    const button = document.getElementById('hdrProfileBtn'), menu = document.getElementById('hdrProfileTip'), wrap = button?.closest('.hdr-profile-wrap');
    if(!button || !menu || !wrap || bound.has(wrap)) return;
    bound.add(wrap);
    const notifications = document.getElementById('hdrNotifyWrap');
    const addActions = () => {
      if(!menu.querySelector('.qol-view-profile')) { const link = node('a','qol-view-profile','View profile'); link.href = new URL('profile.html',root).href; menu.append(link); }
      if(notifications && !menu.contains(notifications)) menu.append(notifications);
      document.getElementById('hdrNotifyBtn')?.remove();
      if(notifications && !notifications.querySelector('.qol-notifications-title')) notifications.prepend(node('div','qol-notifications-title','Notifications'));
    };
    addActions(); new MutationObserver(addActions).observe(menu,{childList:true});
    const sync = () => {
      const open = wrap.classList.contains('qol-profile-open'); menu.inert = !open; button.setAttribute('aria-expanded',String(open));
    };
    const readNotifications = () => {
      if(typeof sbNotifyOpenAndRead === 'function' && !(typeof _sbNotifyOpen !== 'undefined' && _sbNotifyOpen)) Promise.resolve(sbNotifyOpenAndRead()).catch(() => {});
    };
    const close = () => { wrap.classList.remove('qol-profile-open'); sync(); if(typeof sbNotifyClose === 'function') sbNotifyClose(); };
    const open = () => { wrap.classList.add('qol-profile-open'); sync(); readNotifications(); };
    button.onclick = null;
    button.setAttribute('aria-label','Profile and notifications'); button.setAttribute('aria-controls',menu.id);
    button.addEventListener('click',event => { event.preventDefault(); event.stopPropagation(); if(wrap.classList.contains('qol-profile-open')) close(); else open(); });
    wrap.addEventListener('mouseenter',open);
    wrap.addEventListener('mouseleave',() => { if(!wrap.contains(document.activeElement)) close(); });
    wrap.addEventListener('focusout',event => { if(!wrap.contains(event.relatedTarget)) close(); });
    wrap.addEventListener('keydown',event => { if(event.key === 'Escape') { event.preventDefault(); close(); button.focus(); } });
    document.addEventListener('click',event => { if(!wrap.contains(event.target)) close(); });
    new MutationObserver(sync).observe(wrap,{attributes:true,attributeFilter:['class']});
    if(notifications) {
      const badge = () => wrap.classList.toggle('qol-has-notifications',notifications.classList.contains('has-unread'));
      new MutationObserver(badge).observe(notifications,{attributes:true,attributeFilter:['class']}); badge();
    }
    sync();
  };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',initProfileTooltip); else initProfileTooltip();
})();


// Alternate hub layout uses the same configured tools and permission-gated cards.
(function () {
  let originalSlot, toolsCard, primary;
  function apply() {
    const grid = document.querySelector('.main-grid'), body = document.getElementById('toolsBody');
    if(!grid || !body || !window.SBQoL) return;
    if(!toolsCard) {
      toolsCard = body.closest('.side-card');
      originalSlot = document.createComment('Tools sidebar position'); toolsCard.before(originalSlot);
      primary = document.createElement('section'); primary.className = 'home-tools-primary'; primary.setAttribute('aria-label','Tools');
    }
    const enabled = SBQoL.read('preferences',{}).homeStyle === 'tools';
    document.body.classList.toggle('home-tools-layout',enabled);
    if(enabled) {
      grid.prepend(primary); primary.append(toolsCard);
      const hint = primary.querySelector('.home-tools-intro') || document.createElement('p');
      hint.className = 'home-tools-intro'; hint.textContent = 'Choose a tool to start creating, practising or exploring.';
      if(!hint.isConnected) primary.prepend(hint);
      // Keep the primary tools visible even when the sidebar was collapsed.
      body.classList.remove('collapsed'); body.style.display = '';
      document.getElementById('toolsToggle').classList.remove('collapsed');
    } else {
      originalSlot.after(toolsCard); primary.remove();
    }
    window.SBTools?.renderSidebar(document.getElementById('markerSection'));
  }
  window.addEventListener('studybase-preferences-changed',apply);
  window.addEventListener('studybase-account-ready',apply);
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',apply); else apply();
})();

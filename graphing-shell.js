// Reuse the subject/class popovers, adding focus handling for this tool's shell.
(function () {
  function boot() {
    const actions = document.getElementById('projectActions');
    const summary = actions?.querySelector('summary');
    const panel = actions?.querySelector('.graphing-more-panel');
    if (actions && panel) {
      const mobile = window.matchMedia?.('(max-width:700px)');
      const adaptActions = () => {
        for (const id of ['viewProject', 'shareProject']) {
          const button = document.getElementById(id);
          if (mobile?.matches) panel.insertBefore(button, panel.querySelector('#newProject'));
          else document.getElementById('saveProject').before(button);
        }
        document.body.style.setProperty('--graphing-header-bottom', document.querySelector('header').getBoundingClientRect().bottom + 'px');
      };
      mobile?.addEventListener('change', adaptActions);
      adaptActions();
      const close = () => {
        const restoreFocus = actions.contains(document.activeElement);
        actions.open = false;
        if (restoreFocus && !document.querySelector('dialog[open]')) summary.focus();
      };
      document.addEventListener('click', event => {
        if (!actions.contains(event.target)) actions.open = false;
        // An action may disable itself while mounting the next graph before
        // this bubbling listener runs; it must still close the actions panel.
        else if (event.target.closest('.graphing-more-panel button')) close();
      });
      actions.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); close(); }
      });
      document.getElementById('imageDialog')?.addEventListener('close', () => summary.focus());
    }
    const settings = document.querySelector('.qol-settings-wrap');
    // Canvas width is always maximised; spacing and motion remain meaningful.
    settings?.querySelector('[data-qol-preference="width"]')?.closest('label')?.remove();
    for (const [wrap, button, panel, openClass] of [
      [settings, settings?.querySelector('button'), settings?.querySelector('.qol-settings-menu'), 'open']
    ]) {
      if (!wrap || !button || !panel) continue;
      const sync = () => {
        document.body.style.setProperty('--graphing-header-bottom', document.querySelector('header').getBoundingClientRect().bottom + 'px');
        const open = wrap.classList.contains(openClass);
        panel.inert = !open;
        button.setAttribute('aria-expanded', String(open));
      };
      wrap.addEventListener('mouseenter', () => { wrap.classList.add(openClass); sync(); });
      wrap.addEventListener('mouseleave', () => {
        if (wrap.contains(document.activeElement)) wrap.classList.add(openClass);
        sync();
      });
      button.addEventListener('click', sync);
      wrap.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        wrap.classList.remove(openClass); sync(); button.focus();
      });
      new MutationObserver(sync).observe(wrap, { attributes: true, attributeFilter: ['class'] });
      window.addEventListener('resize', sync);
      sync();
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

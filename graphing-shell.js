// Reuse the subject/class popovers, adding focus handling for this tool's shell.
(function () {
  function boot() {
    const profile = document.querySelector('.hdr-profile-wrap');
    const settings = document.querySelector('.qol-settings-wrap');
    for (const [wrap, button, panel, openClass] of [
      [profile, document.getElementById('hdrProfileBtn'), document.getElementById('hdrProfileTip'), 'qol-profile-open'],
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

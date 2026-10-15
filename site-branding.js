// Apply public branding as text, keeping header structure and styling shared.
(function () {
  function applyBranding() {
    const brand = window.STUDYBASE_CONFIG?.brand || {};
    const name = typeof brand.name === 'string' && brand.name.trim() ? brand.name : 'StudyBase';
    const subtitle = typeof brand.subtitle === 'string' ? brand.subtitle : 'EXPERIMENTAL TOOLS';
    document.querySelectorAll('[data-brand-name]').forEach(node => { node.textContent = name; });
    document.querySelectorAll('[data-brand-subtitle]').forEach(node => {
      node.textContent = subtitle;
      node.hidden = !subtitle.trim();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyBranding, { once: true });
  else applyBranding();
})();

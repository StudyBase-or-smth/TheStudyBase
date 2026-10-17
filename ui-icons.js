// Shared StudyBase button icons. Hand-drawn SVG paths, no font or emoji dependency.
(function () {
  const paths = {
    bell:'<path fill="#f6c453" stroke="#b7791f" d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path stroke="#b7791f" d="M10 21h4M12 2V1"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    moon:'<path fill="#a5b4fc" stroke="#6366f1" d="M21 13a9 9 0 0 1-10-10 9 9 0 1 0 10 10Z"/><path stroke="#e9b949" d="M18 2v4m-2-2h4"/>',
    sun:'<circle cx="12" cy="12" r="4" fill="#fbbf24" stroke="#d97706"/><path stroke="#e9a329" d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    comment:'<path fill="#a8ce3a" stroke="#526c2c" d="M3 5h13a2 2 0 0 1 2 2v11H9l-5 4v-4H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/><path stroke="#526c2c" d="M5 9h6m-6 4h8"/><path fill="#f8b43b" stroke="#9c6c20" d="M15 10a5 5 0 1 1 6 0l-1 3h-4Z"/><path stroke="#6b7280" d="M16 15h4m-3 2h2"/>',
    edit:'<path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14Z"/>',
    image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
    sparkle:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>',
    bug:'<rect x="7" y="7" width="10" height="14" rx="5"/><path d="m9 7-2-4m8 4 2-4M3 10h4m10 0h4M3 15h4m10 0h4M4 21l4-3m8 0 4 3M12 8v12"/>',
    bulb:'<path d="M9 18h6m-6 3h6M8 14a7 7 0 1 1 8 0c-1 1-1 2-1 4H9c0-2 0-3-1-4Z"/>',
    circle:'<circle cx="12" cy="12" r="7"/>',
    trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
    close:'<path d="m6 6 12 12M6 18 18 6"/>',
    check:'<path d="m4 12 5 5L20 6"/>',
    book:'<path d="M12 5v16M3 3c4-1 6 0 9 2 3-2 5-3 9-2v16c-4-1-6 0-9 2-3-2-5-3-9-2Z"/>',
    school:'<path d="m3 10 9-7 9 7v11H3ZM9 21v-7h6v7M7 10h.01M17 10h.01"/>',
    key:'<circle cx="8" cy="8" r="5"/><path d="m12 12 9 9m-6-6 3-3m0 6 3-3"/>',
    broadcast:'<circle cx="12" cy="12" r="2"/><path d="M6 6a8.5 8.5 0 0 0 0 12M18 6a8.5 8.5 0 0 1 0 12M3 3a13 13 0 0 0 0 18M21 3a13 13 0 0 1 0 18"/>',
    settings:'<path d="M19.28 9.49 L21.39 10.00 L21.39 14.00 L19.28 14.51 L18.92 15.38 L20.05 17.23 L17.23 20.05 L15.38 18.92 L14.51 19.28 L14.00 21.39 L10.00 21.39 L9.49 19.28 L8.62 18.92 L6.77 20.05 L3.95 17.23 L5.08 15.38 L4.72 14.51 L2.61 14.00 L2.61 10.00 L4.72 9.49 L5.08 8.62 L3.95 6.77 L6.77 3.95 L8.62 5.08 L9.49 4.72 L10.00 2.61 L14.00 2.61 L14.51 4.72 L15.38 5.08 L17.23 3.95 L20.05 6.77 L18.92 8.62Z"/><circle cx="12" cy="12" r="3.2"/>',
    expand:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    menu:'<path d="M3 6h18M3 12h18M3 18h18"/>',
    star:'<path d="m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>',
    refresh:'<path d="M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 13-3l2 3M4 16l2 3a8 8 0 0 0 13-3"/>',
    folder:'<path d="M3 7V4h6l3 3h9v13H3Z"/>'
  };
  function html(name) {
    if(!Object.hasOwn(paths,name)) return '';
    return '<svg class="sb-ui-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" style="display:inline-block;vertical-align:middle;flex-shrink:0;pointer-events:none">'+paths[name]+'</svg>';
  }
  function hydrate(root) {
    const nodes = [...(root.querySelectorAll?.('[data-sb-icon]') || [])];
    if(root.matches?.('[data-sb-icon]')) nodes.unshift(root);
    for(const node of nodes) {
      const button = node.closest('button');
      if(button && !button.hasAttribute('aria-label') && !button.textContent.trim()) {
        const labels = {close:'Close',image:'Insert image',expand:'Fullscreen',moon:'Toggle dark mode',sun:'Toggle dark mode',trash:'Delete',edit:'Edit',comment:'Suggestions',user:'Profile',bell:'Notifications',star:'Pin'};
        button.setAttribute('aria-label',button.title || labels[node.dataset.sbIcon] || node.dataset.sbIcon);
      }
      const value = html(node.dataset.sbIcon);
      if(!value) continue;
      node.innerHTML = value;
      node.removeAttribute('data-sb-icon');
    }
  }
  window.SBIcons = { html };
  function start() {
    hydrate(document);
    new MutationObserver(records => {
      for(const record of records) for(const node of record.addedNodes) if(node.nodeType === 1) hydrate(node);
    }).observe(document.body,{childList:true,subtree:true});
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();

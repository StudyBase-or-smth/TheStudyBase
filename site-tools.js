// Shared configured tool links and image icons. Load after site-config.js.
(function () {
  const root = new URL('./', document.currentScript?.src || location.href);
  let expanded = false;
  function url(value) {
    try { const result = new URL(value, root); return ['http:','https:','file:'].includes(result.protocol) ? result : null; } catch { return null; }
  }
  function list() {
    const order = tool => Number.isFinite(tool.order) ? tool.order : Infinity;
    return (Array.isArray(window.STUDYBASE_CONFIG?.tools) ? window.STUDYBASE_CONFIG.tools : [])
      .filter(tool => tool && typeof tool.id === 'string' && typeof tool.name === 'string' && typeof tool.href === 'string' && url(tool.href))
      .sort((a, b) => order(a) - order(b));
  }
  function forURL(value) {
    const target = url(value); return target && list().find(tool => { const page = url(tool.href); return page.origin === target.origin && page.pathname === target.pathname; });
  }
  function image(tool) {
    const img = document.createElement('img'); img.className = 'tool-icon'; img.alt = ''; img.width = 24; img.height = 24;
    img.src = url(tool.icon || 'icon.png')?.href || new URL('icon.png',root).href;
    img.addEventListener('error',() => { img.src = new URL('icon.png',root).href; },{once:true}); return img;
  }
  function renderSidebar(container) {
    if(!container) return;
    const tools = list(), rows = document.createElement('div'); rows.className = 'tools-list';
    for(const tool of tools.filter(tool => expanded || !tool.hidden)) {
      const row = document.createElement(tool.disabled ? 'span' : 'a'); row.className = 'tool-btn' + (tool.disabled ? ' is-disabled' : '');
      if(tool.disabled) row.setAttribute('aria-disabled','true'); else row.href = url(tool.href).href;
      row.append(image(tool),document.createTextNode(tool.name));
      if(tool.disabled) { const label = document.createElement('span'); label.className = 'tool-disabled-label'; label.textContent = 'Disabled'; row.append(label); }
      rows.append(row);
    }
    if(tools.some(tool => tool.hidden)) {
      const more = document.createElement('button'); more.id = 'toolsShowMore'; more.type = 'button'; more.className = 'tools-show-more'; more.textContent = expanded ? 'Show less' : 'Show more'; more.setAttribute('aria-expanded',String(expanded));
      more.onclick = () => { expanded = !expanded; renderSidebar(container); container.querySelector('#toolsShowMore')?.focus(); }; rows.append(more);
    }
    if(!tools.length) { const empty = document.createElement('p'); empty.className = 'empty-note'; empty.textContent = 'No tools available.'; rows.append(empty); }
    container.replaceChildren(rows);
  }
  window.SBTools = { list, forURL, image, renderSidebar };
})();

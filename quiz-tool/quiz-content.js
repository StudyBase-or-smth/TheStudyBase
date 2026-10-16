// Native, plain-text quiz tables. No cell content is interpreted as HTML.
(function () {
  'use strict';
  const cellText = value => String(value && typeof value === 'object' ? value.text ?? '' : value ?? '');
  function renderTable(block, options = {}) {
    const wrap = document.createElement('div'); wrap.className = 'quiz-table-wrap';
    const table = document.createElement('table'); table.className = 'quiz-table';
    const caption = document.createElement('caption'); caption.textContent = block.caption || 'Question table'; table.append(caption);
    const choices = options.answers;
    if (choices) table.classList.add('quiz-answer-table');
    function fill(cell, value, key, description) {
      const spec = value && typeof value === 'object' ? value : {text:value};
      const text = cellText(value); if(text) { const span = document.createElement('span'); span.textContent = text; cell.append(span); }
      for (const attr of ['colSpan','rowSpan']) if (Number.isInteger(spec[attr]) && spec[attr] > 1 && spec[attr] <= 20) cell[attr] = spec[attr];
      if (spec.image && /^[a-z][a-z0-9-]*\/\d{4}\/[a-zA-Z0-9-]+\.png$/.test(spec.image.path || '')) {
        cell.classList.add('quiz-table-image-cell');
        const img = document.createElement('img'); img.className = 'quiz-image'; img.src = `storage/${spec.image.path}`; img.alt = spec.image.alt || description;
        img.onclick = () => img.classList.toggle('no-invert'); cell.append(img);
      }
      if(spec.input && !choices) {
        const input = document.createElement('textarea'); input.className = 'quiz-table-input'; input.rows = 2; input.maxLength = 2000;
        input.dataset.tableCell = key; input.setAttribute('aria-label', spec.label || [block.caption || 'Question table',text || description].join(' — '));
        input.placeholder = spec.placeholder || 'Your response'; cell.append(input);
      }
    }
    if(Array.isArray(block.columns) && block.columns.length) {
      const head = table.createTHead(), row = head.insertRow();
      if(choices) { const th = document.createElement('th'); th.scope='col'; th.textContent='Answer'; row.append(th); }
      block.columns.forEach((value,i) => { const th=document.createElement('th'); th.scope='col'; fill(th,value,'',`Column ${i+1}`); row.append(th); });
    }
    const body=table.createTBody();
    (block.rows || []).forEach((values,r) => {
      const row=body.insertRow();
      if(choices) {
        row.className='quiz-answer'; row.dataset.idx=String(r);
        const cell=row.insertCell(),label=document.createElement('label'),input=document.createElement('input');
        input.type=options.checkbox ? 'checkbox' : 'radio'; input.name='quizAnswer'; input.value=String(r); input.setAttribute('aria-label',`Answer ${String.fromCharCode(65+r)}`);
        input.addEventListener('change',options.onSelect); label.append(input,document.createTextNode(String.fromCharCode(65+r))); cell.append(label);
        row.addEventListener('click',event=>{ if(input.disabled || event.target.closest('input,label,button,a'))return; input.click(); input.focus(); });
      }
      values.forEach((value,c) => {
        const header=value && typeof value==='object' && value.header;
        const cell=document.createElement(header ? 'th' : 'td'); if(header)cell.scope='row';
        const column=cellText(block.columns?.[c]) || `Column ${c+1}`;
        fill(cell,value,`${options.key || 'table'}:${r}:${c}`,`Row ${r+1}, ${column}`); row.append(cell);
      });
    });
    wrap.append(table); return wrap;
  }
  function collectResponses(container) {
    const result=Object.create(null);
    container.querySelectorAll('[data-table-cell]').forEach(input=>{result[input.dataset.tableCell]=input.value;});
    return result;
  }
  function restoreResponses(container, values, locked) {
    container.querySelectorAll('[data-table-cell]').forEach(input=>{
      input.value=typeof values?.[input.dataset.tableCell]==='string' ? values[input.dataset.tableCell] : '';
      input.disabled=!!locked;
    });
  }
  window.StudyQuizContent={renderTable,collectResponses,restoreResponses};
})();

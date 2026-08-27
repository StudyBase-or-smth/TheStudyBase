// Minimal PDF writer for Analyser: Helvetica text + JPEG images, A4 pages.
// Used to rebuild Word docs (text + pictures) as PDFs Gemini can read.
(function (root) {
  'use strict';

  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const MARGIN = 50;

  function esc(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }

  function winAnsi(s) {
    let out = '';
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(0 + i);
      if (c === 0x2018 || c === 0x2019) out += "'";
      else if (c === 0x201C || c === 0x201D) out += '"';
      else if (c === 0x2013 || c === 0x2014) out += '-';
      else if (c === 0x2022) out += '*';
      else if (c === 0xa0) out += ' ';
      else if (c >= 32 && c <= 126) out += s.charAt(i);
      else if (c === 10 || c === 13) out += ' ';
      else out += '?';
    }
    return out;
  }

  function jpegSize(bytes) {
    const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let i = 2;
    while (i < u.length - 8) {
      if (u[i] !== 0xff) { i++; continue; }
      const marker = u[i + 1];
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        return { w: (u[i + 7] << 8) | u[i + 8], h: (u[i + 5] << 8) | u[i + 6] };
      }
      const len = (u[i + 2] << 8) | u[i + 3];
      i += 2 + len;
    }
    return { w: 400, h: 300 };
  }

  function SimplePdf() {
    this.pages = [];
    this.imageCount = 0;
    this.addPage();
  }

  SimplePdf.prototype.addPage = function () {
    this._page = { cmds: [], images: [] };
    this.pages.push(this._page);
    this.y = PAGE_H - MARGIN;
    this.maxW = PAGE_W - MARGIN * 2;
    this.lineH = 14;
  };

  SimplePdf.prototype._need = function (h) {
    if (this.y - h < MARGIN) this.addPage();
  };

  SimplePdf.prototype.addText = function (raw, size) {
    const text = winAnsi(String(raw || '').replace(/\s+/g, ' ').trim());
    if (!text) {
      this.y -= 8;
      return;
    }
    const fontSize = size || 11;
    this.lineH = fontSize + 3;
    const approxChar = fontSize * 0.5;
    const maxChars = Math.max(8, Math.floor(this.maxW / approxChar));
    let rest = text;
    while (rest.length) {
      let line = rest.slice(0, maxChars);
      if (rest.length > maxChars) {
        const sp = line.lastIndexOf(' ');
        if (sp > 20) line = line.slice(0, sp);
      }
      rest = rest.slice(line.length).trim();
      this._need(this.lineH);
      const y = this.y - fontSize;
      this._page.cmds.push(
        'BT /F1 ' + fontSize + ' Tf ' + MARGIN.toFixed(2) + ' ' + y.toFixed(2) + ' Td (' + esc(line) + ') Tj ET'
      );
      this.y -= this.lineH;
    }
  };

  SimplePdf.prototype.addJpeg = function (bytes) {
    const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (u.length < 20) return;
    const dim = jpegSize(u);
    let w = dim.w;
    let h = dim.h;
    if (!w || !h) return;
    const scale = Math.min(this.maxW / w, (PAGE_H - MARGIN * 2) / h, 1);
    w *= scale;
    h *= scale;
    this._need(h + 8);
    this.y -= h;
    const name = 'Im' + (this._page.images.length + 1);
    this._page.images.push({ name: name, bytes: u, w: dim.w, h: dim.h });
    this.imageCount++;
    this._page.cmds.push(
      'q ' + w.toFixed(2) + ' 0 0 ' + h.toFixed(2) + ' ' + MARGIN.toFixed(2) + ' ' + this.y.toFixed(2) + ' cm /' + name + ' Do Q'
    );
    this.y -= 10;
  };

  SimplePdf.prototype.build = function () {
    if (!this.pages.length) this.addPage();
    const chunks = [];
    const offsets = [0];
    let pos = 0;
    function write(s) {
      const b = typeof s === 'string' ? new TextEncoder().encode(s) : s;
      chunks.push(b);
      pos += b.length;
    }
    function writeBin(u8) {
      chunks.push(u8);
      pos += u8.length;
    }

    write('%PDF-1.4\n');
    const objAt = [];
    function startObj(n) {
      objAt[n] = pos;
      write(n + ' 0 obj\n');
    }
    function endObj() { write('endobj\n'); }

    let nextId = 1;
    const catalogId = nextId++;
    const pagesId = nextId++;
    const fontId = nextId++;
    const pageIds = [];
    const contentIds = [];
    const imageIds = [];

    this.pages.forEach((page) => {
      pageIds.push(nextId++);
      contentIds.push(nextId++);
      page.images.forEach(() => imageIds.push(nextId++));
    });

    startObj(catalogId);
    write('<< /Type /Catalog /Pages ' + pagesId + ' 0 R >>\n');
    endObj();

    startObj(pagesId);
    write('<< /Type /Pages /Count ' + this.pages.length + ' /Kids [' + pageIds.map((id) => id + ' 0 R').join(' ') + '] >>\n');
    endObj();

    startObj(fontId);
    write('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\n');
    endObj();

    let imgCursor = 0;
    this.pages.forEach((page, pi) => {
      const pageId = pageIds[pi];
      const contentId = contentIds[pi];
      const xobjs = page.images.map((im, ii) => {
        const id = imageIds[imgCursor + ii];
        return '/' + im.name + ' ' + id + ' 0 R';
      }).join(' ');
      startObj(pageId);
      write(
        '<< /Type /Page /Parent ' + pagesId + ' 0 R /MediaBox [0 0 ' + PAGE_W + ' ' + PAGE_H + '] /Contents ' +
        contentId + ' 0 R /Resources << /Font << /F1 ' + fontId + ' 0 R >>' +
        (xobjs ? ' /XObject << ' + xobjs + ' >>' : '') + ' >> >>\n'
      );
      endObj();

      const stream = page.cmds.join('\n') + '\n';
      const streamBytes = new TextEncoder().encode(stream);
      startObj(contentId);
      write('<< /Length ' + streamBytes.length + ' >>\nstream\n');
      writeBin(streamBytes);
      write('\nendstream\n');
      endObj();

      page.images.forEach((im, ii) => {
        const id = imageIds[imgCursor + ii];
        startObj(id);
        write(
          '<< /Type /XObject /Subtype /Image /Width ' + im.w + ' /Height ' + im.h +
          ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + im.bytes.length + ' >>\nstream\n'
        );
        writeBin(im.bytes);
        write('\nendstream\n');
        endObj();
      });
      imgCursor += page.images.length;
    });

    const xrefPos = pos;
    const maxObj = nextId - 1;
    write('xref\n0 ' + (maxObj + 1) + '\n');
    write('0000000000 65535 f \n');
    for (let n = 1; n <= maxObj; n++) {
      write(String(objAt[n]).padStart(10, '0') + ' 00000 n \n');
    }
    write('trailer << /Size ' + (maxObj + 1) + ' /Root ' + catalogId + ' 0 R >>\nstartxref\n' + xrefPos + '\n%%EOF\n');

    let total = 0;
    chunks.forEach((c) => { total += c.length; });
    const out = new Uint8Array(total);
    let o = 0;
    chunks.forEach((c) => { out.set(c, o); o += c.length; });
    return out;
  };

  root.SimplePdf = SimplePdf;
  root.simplePdfJpegSize = jpegSize;
})(typeof window !== 'undefined' ? window : this);

/* ============================================================
   Portfolio runtime — loads data.json (or remote Drive copy),
   renders all bound nodes, owns the global `state`.
   ============================================================ */
console.info('[portfolio] app.js v6 loaded');
(() => {
  const DATA_URL = '/data.json';

  // Public global so editor.js / drive.js can read & mutate.
  window.PortfolioState = {
    data: null,
    source: 'local',     // 'local' | 'drive' | 'localStorage'
    driveFileId: null,
    dirty: false,
  };

  // ---------- helpers ----------
  const $  = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  // Splits "a.b[0].c" → ["a","b","0","c"]  (handles arrays too)
  const splitPath = (path) => path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  const getPath = (obj, path) => splitPath(path).reduce((o, k) => (o == null ? o : o[k]), obj);
  const setPath = (obj, path, val) => {
    const keys = splitPath(path);
    const last = keys.pop();
    const tgt = keys.reduce((o, k) => {
      if (o[k] == null) o[k] = /^\d+$/.test(keys[keys.indexOf(k) + 1] || '') ? [] : {};
      return o[k];
    }, obj);
    tgt[last] = val;
  };

  // ---------- data load ----------
  // 1) Try /api/data (Pages Function backed by KV).
  // 2) On any failure fall back to the bundled /data.json so the page
  //    still renders something (useful when Functions aren't deployed yet).
  async function loadData() {
    try {
      const r = await fetch('/api/data', { cache: 'no-store' });
      if (r.ok) {
        const json = await r.json();
        // Empty object from KV-not-yet-seeded → keep going to fallback
        if (json && Object.keys(json).length > 0) {
          window.PortfolioState.source = 'api';
          return json;
        }
      }
    } catch (e) { console.warn('[portfolio] /api/data unavailable, falling back to /data.json', e); }
    const r2 = await fetch(DATA_URL, { cache: 'no-store' });
    window.PortfolioState.source = 'bundled';
    return await r2.json();
  }

  // ---------- safety: very small HTML sanitizer ----------
  // Allows a fixed list of inline + block tags. Strips scripts / on* attrs / javascript: urls.
  const SAFE_TAGS = new Set([
    'P','BR','SPAN','STRONG','B','EM','I','U','S','MARK','SMALL','SUB','SUP',
    'H1','H2','H3','H4','H5','H6',
    'UL','OL','LI','BLOCKQUOTE','HR',
    'A','CODE','PRE','DIV'
  ]);
  function sanitizeHtml(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = String(html || '');
    const walker = document.createTreeWalker(tpl.content, NodeFilter.SHOW_ELEMENT);
    const remove = [];
    let node;
    while ((node = walker.nextNode())) {
      if (!SAFE_TAGS.has(node.tagName)) {
        remove.push(node);
        continue;
      }
      // strip on* attrs + javascript: urls
      [...node.attributes].forEach(attr => {
        const name = attr.name.toLowerCase();
        const val  = attr.value.trim().toLowerCase();
        if (name.startsWith('on'))                       node.removeAttribute(attr.name);
        else if (name === 'style')                       node.removeAttribute(attr.name);
        else if ((name === 'href' || name === 'src') && val.startsWith('javascript:')) node.removeAttribute(attr.name);
      });
      if (node.tagName === 'A') {
        node.setAttribute('rel', 'noopener noreferrer');
        node.setAttribute('target', '_blank');
      }
    }
    remove.forEach(n => n.replaceWith(...n.childNodes));
    return tpl.innerHTML;
  }
  window.PortfolioSanitize = sanitizeHtml;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  // ---------- one-time migration: highlights[] → body HTML ----------
  function migrateData(data) {
    data.projects?.forEach(p => {
      if (!p.body && Array.isArray(p.highlights) && p.highlights.length) {
        p.body = '<ul>' + p.highlights.map(h => `<li>${escapeHtml(h)}</li>`).join('') + '</ul>';
      }
      if (p.body == null) p.body = '';
    });
    return data;
  }

  // ---------- render ----------
  function render(data) {
    // text bindings
    $$('[data-bind]').forEach(el => {
      const path = el.getAttribute('data-bind');
      const v = getPath(data, path);
      if (v != null) el.textContent = v;
    });
    // HTML bindings (rich text)
    $$('[data-html]').forEach(el => {
      const path = el.getAttribute('data-html');
      const v = getPath(data, path);
      el.innerHTML = sanitizeHtml(v || '');
      el.dataset.bindPath = path; // for top-level html fields
    });
    // href bindings using a prefix (mailto:, tel:)
    $$('[data-bind-href]').forEach(el => {
      const path = el.getAttribute('data-bind-href');
      const prefix = el.getAttribute('data-href-prefix') || '';
      const v = getPath(data, path);
      if (v != null) el.setAttribute('href', prefix + v);
    });
    // src bindings
    $$('[data-bind-src]').forEach(el => {
      const path = el.getAttribute('data-bind-src');
      const v = getPath(data, path);
      if (v != null) el.setAttribute('src', v);
    });
    // list bindings
    $$('[data-list]').forEach(host => {
      const path = host.getAttribute('data-list');
      const tplName = host.getAttribute('data-tpl');
      const tpl = $(`#tpl-${tplName}`);
      const items = getPath(data, path);
      host.innerHTML = '';
      if (!tpl || !Array.isArray(items)) return;
      items.forEach((item, idx) => {
        const node = tpl.content.firstElementChild.cloneNode(true);
        fillTemplate(node, item, `${path}[${idx}]`);
        host.appendChild(node);
      });
    });

    // Page meta from data (in case JSON has been updated)
    if (data.meta) {
      if (data.meta.siteTitle) document.title = data.meta.siteTitle;
      const desc = data.meta.siteDescription;
      if (desc) {
        const m = document.querySelector('meta[name="description"]');
        if (m) m.setAttribute('content', desc);
      }
    }
  }

  function fillTemplate(node, item, basePath) {
    // primary fields: data-f="key" (or "." for raw scalar)
    $$('[data-f]', node).forEach(el => {
      const key = el.getAttribute('data-f');
      if (key === '.') {
        el.textContent = item;
        el.dataset.bindPath = basePath;
      } else {
        const v = item?.[key];
        if (v != null) el.textContent = v;
        el.dataset.bindPath = `${basePath}.${key}`;
      }
    });
    // HTML (rich-text) fields inside a template: data-html="key"
    $$('[data-html]', node).forEach(el => {
      const key = el.getAttribute('data-html');
      const v = item?.[key];
      el.innerHTML = sanitizeHtml(v || '');
      el.dataset.bindPath = `${basePath}.${key}`;
      el.dataset.bindHtml = '1';   // marker for editor
    });
    // href on element using one of the item's keys
    $$('[data-bind-href-attr]', node).forEach(el => {
      const key = el.getAttribute('data-bind-href-attr');
      const v = item?.[key];
      if (v) el.setAttribute('href', v);
    });
    // sub-lists inside a template
    $$('[data-sub]', node).forEach(subHost => {
      const key = subHost.getAttribute('data-sub');
      const tplName = subHost.getAttribute('data-sub-tpl');
      const tpl = $(`#tpl-${tplName}`);
      const arr = item?.[key];
      subHost.innerHTML = '';
      if (!tpl || !Array.isArray(arr)) return;
      arr.forEach((sub, j) => {
        const subNode = tpl.content.firstElementChild.cloneNode(true);
        fillTemplate(subNode, sub, `${basePath}.${key}[${j}]`);
        subHost.appendChild(subNode);
      });
    });
  }

  // ---------- theme ----------
  function initTheme() {
    const saved = localStorage.getItem('portfolio:theme');
    if (saved === 'dark' || saved === 'light') {
      document.documentElement.setAttribute('data-theme', saved);
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    }
    $('#theme-toggle')?.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme');
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('portfolio:theme', next);
    });
  }

  // ---------- footer year ----------
  function initFooter() {
    const y = $('#year');
    if (y) y.textContent = new Date().getFullYear();
  }

  // ---------- collapsibles (project cards) ----------
  function initCollapsibles() {
    document.addEventListener('click', (e) => {
      const head = e.target.closest('.proj__head');
      if (!head) return;
      // Don't toggle when clicking edit add/del buttons inside
      if (e.target.closest('.edit-add, .edit-del')) return;
      const article = head.closest('.proj');
      const body = article?.querySelector('.proj__body');
      if (!body) return;
      const open = body.hasAttribute('hidden');
      body.hidden = !open;
      head.setAttribute('aria-expanded', open ? 'true' : 'false');
      article.classList.toggle('proj--open', open);
    });
  }

  // ---------- bootstrap ----------
  async function boot() {
    initTheme();
    initFooter();
    initCollapsibles();
    try {
      const data = migrateData(await loadData());
      window.PortfolioState.data = data;
      render(data);
      document.dispatchEvent(new CustomEvent('portfolio:rendered'));
    } catch (e) {
      console.error('Failed to load portfolio data', e);
    }
  }

  // expose render so editor can re-render after edits
  window.PortfolioRender = render;
  window.PortfolioHelpers = { getPath, setPath };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

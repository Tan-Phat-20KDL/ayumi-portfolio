/* ============================================================
   editor.js — inline edit (text + rich-text + add/delete +
   drag-drop avatar + SEO panel). Activates only after Drive
   sign-in as owner. Auto-saves to Drive (debounced).
   ============================================================ */
console.info('[portfolio] editor.js v6 loaded');
(() => {
  const $  = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

  const BLANKS = {
    'education':       () => ({ school: 'New school', degree: 'Degree', period: '', details: '' }),
    'certificates':    () => ({ name: 'New certificate', issuer: '', year: '' }),
    'languages':       () => ({ name: 'Language', level: '' }),
    'skills':          () => ({ category: 'New category', items: ['new skill'] }),
    'experience':      () => ({ company: 'New company', role: 'Role', period: '', location: '', summary: '' }),
    'projects':        () => ({ name: 'New project', company: '', role: '', duration: '', tech: ['tech'], summary: 'A short one-line preview', body: '<p>Describe what you built here. Use the toolbar for headings, lists, links…</p>' }),
    'profile.socials': () => ({ name: 'Site', url: 'https://' }),
  };
  const SUB_BLANKS = {
    'items': () => 'new skill',
    'tech':  () => 'tech',
  };

  let editing = false;
  let saveTimer = null;
  let suspendDirty = false;

  const body       = document.body;
  const editToggle = $('#edit-toggle');
  const editState  = $('#edit-state');
  const saveBar    = $('#save-bar');
  const saveState  = $('#save-state');
  const dropzone   = $('.dropzone');
  const avatarHost = $('#avatar-host');
  const avatarInp  = $('#avatar-input');
  const seoBtn     = $('#seo-open');
  const seoBadge   = $('#seo-badge');
  const seoModal   = $('#seo-modal');
  const seoRefresh = $('#seo-refresh');

  // ---------- helpers ----------
  function setSaveState(txt, cls = '') {
    saveState.textContent = txt;
    saveBar.className = 'save-bar ' + cls;
  }
  function markDirty() {
    if (suspendDirty) return;
    setSaveState('Saving…');
    saveBar.hidden = false;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(doSave, 1500);
  }
  async function doSave() {
    saveTimer = null;
    try {
      await window.Drive.saveData(window.PortfolioState.data);
      setSaveState('All changes saved', 'ok');
      updateSeoBadge();
      setTimeout(() => { if (!editing) saveBar.hidden = true; }, 1500);
    } catch (e) {
      console.error(e);
      setSaveState('Save failed: ' + (e.message || ''), 'err');
    }
  }

  // ---------- auth events ----------
  window.Drive.on('signin', ({ isOwner }) => {
    if (editToggle) editToggle.style.display = isOwner ? '' : 'none';
    if (seoBtn)     seoBtn.style.display     = isOwner ? '' : 'none';
    updateSeoBadge();
  });
  window.Drive.on('signout', () => {
    if (editing) setEditing(false);
    if (editToggle) editToggle.style.display = 'none';
    if (seoBtn)     seoBtn.style.display     = 'none';
  });
  if (editToggle) editToggle.style.display = 'none';
  if (seoBtn)     seoBtn.style.display     = 'none';

  editToggle?.addEventListener('click', () => {
    if (!window.Drive.state.isOwner) {
      window.Drive.toast('Only the owner can edit.', 'warn'); return;
    }
    setEditing(!editing);
  });

  function setEditing(on) {
    editing = on;
    body.classList.toggle('editing', on);
    if (editState) {
      editState.textContent = on ? 'on' : 'off';
      editState.classList.toggle('badge--on', on);
    }
    saveBar.hidden = !on;
    if (on) { setSaveState('Editing — changes auto-save.'); attachAll(); updateSeoBadge(); }
    else    { detachAll(); }
  }

  // ============================================================
   // Inline plain-text editing (single-line + small multi-line)
  // ============================================================
  const PLACEHOLDERS = {
    summary: 'One-line preview shown when the card is collapsed…',
    company: 'Company', role: 'Role', duration: 'Duration', name: 'Name',
    school: 'School', degree: 'Degree', period: 'Period', details: 'Details',
    issuer: 'Issuer', year: 'Year', level: 'Level', category: 'Category',
    location: 'Location', url: 'https://', email: 'you@example.com', phone: 'phone',
    title: 'Title', tagline: 'Tagline', headline: 'Headline', subhead: 'Sub-headline',
    items: 'skill', tech: 'tech',
  };
  function placeholderFor(path) {
    const key = path.replace(/\[\d+\]$/, '').split('.').pop();
    return PLACEHOLDERS[key] || 'Type…';
  }

  function attachInline() {
    const { setPath } = window.PortfolioHelpers;
    const data = window.PortfolioState.data;
    const enable = (el, path) => {
      if (!path) return;
      if (el.dataset.bindHtml === '1') return;   // rich-text fields handled separately
      el.contentEditable = 'true';
      el.spellcheck = false;
      el.dataset.placeholder = placeholderFor(path);
      if (el._editHandler) el.removeEventListener('input', el._editHandler);
      el._editHandler = () => {
        setPath(data, path, el.innerText.replace(/​/g, '').trim());
        markDirty();
      };
      el.addEventListener('input', el._editHandler);
    };
    $$('[data-bind]').forEach(el => enable(el, el.getAttribute('data-bind')));
    $$('[data-bind-path]').forEach(el => enable(el, el.dataset.bindPath));
  }
  function detachInline() {
    $$('[contenteditable="true"]').forEach(el => {
      if (el.dataset.bindHtml === '1') return;
      el.contentEditable = 'false';
      if (el._editHandler) { el.removeEventListener('input', el._editHandler); el._editHandler = null; }
    });
  }

  // ============================================================
  // Rich-text editor (mini WYSIWYG) for data-html fields
  // ============================================================
  const RICH_TOOLBAR_HTML = `
    <button data-cmd="formatBlock" data-arg="h3"  title="Heading">H</button>
    <button data-cmd="formatBlock" data-arg="p"   title="Paragraph">¶</button>
    <span class="rich-sep"></span>
    <button data-cmd="bold"        title="Bold (Ctrl+B)"><b>B</b></button>
    <button data-cmd="italic"      title="Italic (Ctrl+I)"><i>I</i></button>
    <button data-cmd="underline"   title="Underline (Ctrl+U)"><u>U</u></button>
    <span class="rich-sep"></span>
    <button data-cmd="insertUnorderedList" title="Bullet list">•</button>
    <button data-cmd="insertOrderedList"   title="Numbered list">1.</button>
    <button data-cmd="formatBlock" data-arg="blockquote" title="Quote">&ldquo;&rdquo;</button>
    <span class="rich-sep"></span>
    <button data-cmd="createLink"   title="Insert link">🔗</button>
    <button data-cmd="unlink"       title="Remove link">⊘</button>
    <button data-cmd="removeFormat" title="Clear formatting">✕</button>
  `;

  function attachRich() {
    const { setPath } = window.PortfolioHelpers;
    const data = window.PortfolioState.data;

    $$('[data-html]').forEach(el => {
      if (el._richReady) return;
      const path = el.dataset.bindPath || el.getAttribute('data-html');
      el.dataset.placeholder = 'Write your content here…';

      const wrap = document.createElement('div');
      wrap.className = 'rich-wrap';
      el.parentNode.insertBefore(wrap, el);

      const toolbar = document.createElement('div');
      toolbar.className = 'rich-toolbar';
      toolbar.contentEditable = 'false';
      toolbar.innerHTML = RICH_TOOLBAR_HTML;
      wrap.appendChild(toolbar);
      wrap.appendChild(el);

      el.classList.add('rich-content');
      el.contentEditable = 'true';
      el.spellcheck = true;

      toolbar.addEventListener('mousedown', (e) => {
        const btn = e.target.closest('button[data-cmd]');
        if (!btn) return;
        e.preventDefault();   // keep focus inside editor
        const cmd = btn.dataset.cmd;
        let arg = btn.dataset.arg || null;
        if (cmd === 'createLink') {
          arg = prompt('URL:', 'https://');
          if (!arg) return;
        }
        document.execCommand(cmd, false, arg);
      });

      el._richHandler = () => {
        setPath(data, path, window.PortfolioSanitize(el.innerHTML));
        markDirty();
      };
      el.addEventListener('input', el._richHandler);

      el._richWrap = wrap;
      el._richReady = true;
    });
  }
  function detachRich() {
    $$('[data-html]').forEach(el => {
      if (!el._richWrap) return;
      const wrap = el._richWrap;
      wrap.parentNode.insertBefore(el, wrap);
      wrap.remove();
      el.classList.remove('rich-content');
      el.contentEditable = 'false';
      if (el._richHandler) { el.removeEventListener('input', el._richHandler); el._richHandler = null; }
      el._richWrap = null;
      el._richReady = false;
    });
  }

  // ============================================================
  // List controls (+ Add, × Delete)
  // ============================================================
  function attachListControls() {
    const { getPath } = window.PortfolioHelpers;
    const data = window.PortfolioState.data;
    $$('[data-list]').forEach(host => {
      const path = host.getAttribute('data-list');
      addPlusButton(host, path);
      const arr = getPath(data, path);
      if (!Array.isArray(arr)) return;
      Array.from(host.children).forEach((child, idx) => {
        if (child.classList.contains('edit-add')) return;
        addDeleteButton(child, path, idx);
      });
    });
    $$('[data-sub]').forEach(host => {
      const subKey = host.getAttribute('data-sub');
      const itemBase = findItemBasePath(host);
      if (!itemBase) return;
      const path = `${itemBase}.${subKey}`;
      addPlusButton(host, path);
      const arr = getPath(data, path);
      if (!Array.isArray(arr)) return;
      Array.from(host.children).forEach((child, idx) => {
        if (child.classList.contains('edit-add')) return;
        addDeleteButton(child, path, idx);
      });
    });
  }
  function findItemBasePath(node) {
    let el = node.parentElement;
    while (el) {
      const inner = el.querySelector('[data-bind-path]');
      if (inner) {
        const m = inner.dataset.bindPath?.match(/^(.+\[\d+\])(?:\.|$)/);
        if (m) return m[1];
      }
      el = el.parentElement;
    }
    return null;
  }
  function addPlusButton(host, path) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'edit-add';
    btn.title = 'Add item';
    btn.contentEditable = 'false';
    btn.innerHTML = '<span class="edit-add__icon">+</span><span>Add</span>';
    btn.addEventListener('click', (e) => { e.stopPropagation(); addItem(path); });
    host.appendChild(btn);
  }
  function addDeleteButton(itemEl, path, idx) {
    if (itemEl.querySelector(':scope > .edit-del')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'edit-del';
    btn.title = 'Delete item';
    btn.innerHTML = '×';
    btn.contentEditable = 'false';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm('Delete this item?')) return;
      removeItem(path, idx);
    });
    if (getComputedStyle(itemEl).position === 'static') itemEl.style.position = 'relative';
    itemEl.appendChild(btn);
  }

  function blankFor(path) {
    if (BLANKS[path]) return BLANKS[path]();
    const subKey = path.split('.').pop();
    if (SUB_BLANKS[subKey]) return SUB_BLANKS[subKey]();
    return '';
  }
  function addItem(path) {
    const { getPath, setPath } = window.PortfolioHelpers;
    const data = window.PortfolioState.data;
    const arr = getPath(data, path);
    let newIdx;
    if (!Array.isArray(arr)) { setPath(data, path, [blankFor(path)]); newIdx = 0; }
    else                     { arr.push(blankFor(path)); newIdx = arr.length - 1; }
    suspendDirty = true;
    window.PortfolioRender(data);
    attachAll();
    suspendDirty = false;
    markDirty();
    requestAnimationFrame(() => {
      const prefix = `${path}[${newIdx}]`;
      const target = document.querySelector(`[data-bind-path="${prefix}"], [data-bind-path^="${prefix}."]`);
      if (target) {
        target.focus();
        if (target.dataset.bindHtml !== '1') {
          const range = document.createRange();
          range.selectNodeContents(target);
          const sel = window.getSelection();
          sel.removeAllRanges(); sel.addRange(range);
        }
      }
    });
  }
  function removeItem(path, idx) {
    const { getPath } = window.PortfolioHelpers;
    const data = window.PortfolioState.data;
    const arr = getPath(data, path);
    if (!Array.isArray(arr)) return;
    arr.splice(idx, 1);
    suspendDirty = true;
    window.PortfolioRender(data);
    attachAll();
    suspendDirty = false;
    markDirty();
  }

  // ============================================================
  // Avatar drag-drop → base64 inline (works for guests, no Drive)
  // ============================================================
  function attachAvatarDrop() {
    if (!avatarHost) return;
    dropzone.hidden = false;
    avatarHost.classList.add('avatar-editable');
    avatarHost.addEventListener('click', openPicker);
    avatarHost.addEventListener('dragover', onDragOver);
    avatarHost.addEventListener('dragleave', onDragLeave);
    avatarHost.addEventListener('drop', onDrop);
    avatarInp.addEventListener('change', onPick);
  }
  function detachAvatarDrop() {
    if (!avatarHost) return;
    dropzone.hidden = true;
    avatarHost.classList.remove('avatar-editable', 'is-dragover');
    avatarHost.removeEventListener('click', openPicker);
    avatarHost.removeEventListener('dragover', onDragOver);
    avatarHost.removeEventListener('dragleave', onDragLeave);
    avatarHost.removeEventListener('drop', onDrop);
    avatarInp.removeEventListener('change', onPick);
  }
  function openPicker(e) {
    // Avoid recursive trigger from the hidden input itself
    if (e?.target?.tagName === 'INPUT') return;
    avatarInp.click();
  }
  function onDragOver(e)  { e.preventDefault(); avatarHost.classList.add('is-dragover'); }
  function onDragLeave()  { avatarHost.classList.remove('is-dragover'); }
  function onDrop(e) {
    e.preventDefault(); avatarHost.classList.remove('is-dragover');
    const file = e.dataTransfer?.files?.[0];
    if (file) processAvatar(file);
  }
  function onPick(e) {
    const file = e.target.files?.[0];
    if (file) processAvatar(file);
    e.target.value = '';
  }
  async function processAvatar(file) {
    if (!file.type?.startsWith('image/')) {
      window.Drive.toast('Please drop an image file.', 'err'); return;
    }
    setSaveState('Processing image…');
    try {
      const dataUrl = await imageToDataUrl(file, 512, 0.85);
      window.PortfolioState.data.profile.avatar = dataUrl;
      suspendDirty = true;
      window.PortfolioRender(window.PortfolioState.data);
      attachAll();
      suspendDirty = false;
      markDirty();
      window.Drive.toast('Image updated.', 'ok');
    } catch (e) {
      console.error(e);
      window.Drive.toast('Image processing failed: ' + e.message, 'err');
      setSaveState('Image failed', 'err');
    }
  }
  function imageToDataUrl(file, maxSize, quality) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
      img.src = url;
    });
  }

  // ============================================================
  // SEO scoring
  // ============================================================
  function stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = String(html || '');
    return (tmp.textContent || '').trim();
  }
  function calcSeo(data) {
    const checks = [];
    const add = (label, ok, weight, hint) => checks.push({ label, ok, weight, hint });

    const title = data.meta?.siteTitle || '';
    add(`Page title (${title.length} chars, ideal 50–60)`,
        title.length >= 30 && title.length <= 65, 12,
        'Edit meta.siteTitle in data.json or via the editor. Include your name + role.');

    const desc = data.meta?.siteDescription || '';
    add(`Meta description (${desc.length} chars, ideal 120–160)`,
        desc.length >= 110 && desc.length <= 165, 14,
        'A snippet shown in Google results. 1–2 sentences.');

    const summary = data.profile?.summary || '';
    add(`About summary (${summary.length} chars, 100+ recommended)`,
        summary.length >= 100, 10,
        'Helps Google understand who you are.');

    const projects = data.projects || [];
    add(`Featured projects (${projects.length}, 3+ recommended)`,
        projects.length >= 3, 10,
        'More projects = more keywords + context.');

    const projectsRich = projects.filter(p => stripHtml(p.body).length > 80).length;
    add(`Projects with detailed body (${projectsRich}/${projects.length})`,
        projects.length > 0 && projectsRich === projects.length, 18,
        'Open each project, expand the description and write at least a paragraph.');

    const skillCount = (data.skills || []).reduce((n, g) => n + (g.items?.length || 0), 0);
    add(`Skills listed (${skillCount}, 10+ recommended)`,
        skillCount >= 10, 8,
        'Specific tech keywords help search.');

    add(`Has education entry`, (data.education || []).length >= 1, 4);
    add(`Has experience entry`, (data.experience || []).length >= 1, 6,
        'Add the companies and roles you have held.');

    add(`Profile photo set`, !!data.profile?.avatar, 4,
        'Drop an image on the avatar circle while in edit mode.');

    const socials = (data.profile?.socials || []).length;
    add(`Social / contact links (${socials}, 2+ recommended)`,
        socials >= 2, 6,
        'LinkedIn, GitHub, etc. — boosts credibility.');

    add(`Email is set`, !!(data.profile?.email || '').includes('@'), 4);
    add(`Phone is set`, !!data.profile?.phone, 2);
    add(`At least 1 certificate`, (data.certificates || []).length >= 1, 2);

    const score = checks.reduce((s, c) => s + (c.ok ? c.weight : 0), 0);
    const max = checks.reduce((s, c) => s + c.weight, 0);
    const pct = Math.round(score / max * 100);
    const issues = checks.filter(c => !c.ok && c.hint).map(c => c.hint);
    return { checks, score: pct, issues };
  }

  function updateSeoBadge() {
    if (!seoBadge) return;
    if (!window.Drive.state.isOwner || !window.PortfolioState?.data) {
      seoBadge.textContent = '—';
      seoBadge.classList.remove('badge--ok', 'badge--warn', 'badge--err');
      return;
    }
    const { score } = calcSeo(window.PortfolioState.data);
    seoBadge.textContent = `${score}`;
    seoBadge.classList.remove('badge--ok', 'badge--warn', 'badge--err');
    if      (score >= 85) seoBadge.classList.add('badge--ok');
    else if (score >= 65) seoBadge.classList.add('badge--warn');
    else                  seoBadge.classList.add('badge--err');
  }

  function renderSeoModal() {
    const { checks, score, issues } = calcSeo(window.PortfolioState.data);
    $('#seo-num').textContent = score;
    const offset = 276.46 * (1 - score / 100);
    $('#seo-ring').setAttribute('stroke-dashoffset', offset.toFixed(2));
    const label =
      score >= 85 ? 'Excellent — keep it up.' :
      score >= 65 ? 'Good — a few fixes will lift it further.' :
      score >= 40 ? 'OK — add more detailed content.' :
                    'Needs work — start with the quick fixes below.';
    $('#seo-label').textContent = label;
    const checksEl = $('#seo-checks'); checksEl.innerHTML = '';
    checks.forEach(c => {
      const li = document.createElement('li');
      li.className = c.ok ? 'seo-check ok' : 'seo-check no';
      li.innerHTML = `<span class="seo-check__icon">${c.ok ? '✓' : '○'}</span><span>${c.label}</span><span class="seo-check__w">${c.weight} pts</span>`;
      checksEl.appendChild(li);
    });
    const tips = $('#seo-tips'); tips.innerHTML = '';
    if (issues.length === 0) {
      const li = document.createElement('li'); li.textContent = 'Nothing — you have nailed all checks.';
      tips.appendChild(li);
    } else {
      issues.forEach(t => { const li = document.createElement('li'); li.textContent = t; tips.appendChild(li); });
    }
  }
  seoBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!window.Drive.state.isOwner) {
      window.Drive.toast('Sign in as owner to see SEO score.', 'warn'); return;
    }
    seoModal.hidden = false;
    renderSeoModal();
  });
  seoRefresh?.addEventListener('click', renderSeoModal);

  // ============================================================
  // Mount / unmount everything
  // ============================================================
  function attachAll() {
    if (!editing) return;
    attachRich();          // rich-text first so attachInline can skip them
    attachInline();
    attachListControls();
    attachAvatarDrop();
  }
  function detachAll() {
    detachInline();
    detachRich();
    $$('.edit-add, .edit-del').forEach(b => b.remove());
    detachAvatarDrop();
  }

  document.addEventListener('portfolio:rendered', () => {
    if (editing) attachAll();
    updateSeoBadge();
  });

  window.addEventListener('beforeunload', (e) => {
    if (saveTimer) { e.preventDefault(); e.returnValue = ''; }
  });
})();

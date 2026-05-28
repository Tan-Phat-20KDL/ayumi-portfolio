/* ============================================================
   auth.js — admin password sign-in + save to /api/data
   Replaces the old Google Drive flow.
   Exposes window.Auth (and aliases window.Drive for legacy code).
   ============================================================ */
console.info('[portfolio] auth.js v6 loaded');
(() => {
  const LS_TOKEN  = 'portfolio:adminToken';
  const LS_REMEMBER = 'portfolio:rememberOwner';

  const state = {
    token:    localStorage.getItem(LS_TOKEN) || null,
    user:     null,              // { email, name, picture } — synthesised
    isOwner:  false,
  };

  // ---------- DOM ----------
  const $ = s => document.querySelector(s);
  const signinBtn  = $('#auth-signin');
  const menuWrap   = $('#auth-menu');
  const userBtn    = $('#auth-userbtn');
  const userAvatar = $('#auth-avatar');
  const userEmail  = $('#auth-email');
  const dropdown   = $('#auth-dropdown');
  const statusRow  = $('#auth-status');
  const signoutBtn = $('#auth-signout');
  const settingsBtn= $('#auth-settings');
  const modal      = $('#setup-modal');
  const pwdInput   = $('#cfg-password');
  const cfgSave    = $('#cfg-save');
  const toast      = $('#toast');
  const errEl      = $('#setup-error');

  // ---------- helpers ----------
  function showToast(msg, cls = '') {
    if (!toast) return;
    toast.textContent = msg;
    toast.className   = 'toast ' + cls;
    toast.hidden      = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toast.hidden = true; }, 3500);
  }

  function openModal() {
    pwdInput.value = '';
    if (errEl) errEl.textContent = '';
    modal.hidden = false;
    requestAnimationFrame(() => pwdInput.focus());
  }
  function closeModal() { modal.hidden = true; }

  document.querySelectorAll('[data-modal-close]').forEach(el => el.addEventListener('click', closeModal));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });
  pwdInput?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); cfgSave.click(); } });

  // ---------- API ----------
  async function verifyPassword(password) {
    const r = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (r.status === 401) throw new Error('Wrong password.');
    if (r.status === 500) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.error || 'Server not configured. See README for ADMIN_PASSWORD setup.');
    }
    if (!r.ok) throw new Error('Auth failed (HTTP ' + r.status + ')');
    return true;
  }

  async function signInWithPassword(password) {
    await verifyPassword(password);
    state.token = password;
    localStorage.setItem(LS_TOKEN, password);
    state.user = synthUser();
    state.isOwner = true;
    updateUi();
    fire('signin', { user: state.user, isOwner: true });
  }

  function synthUser() {
    const ownerEmail = window.PortfolioState?.data?.profile?.email?.trim();
    const ownerName  = window.PortfolioState?.data?.profile?.name?.trim();
    return {
      email: ownerEmail || 'admin',
      name:  ownerName  || 'Admin',
      picture: window.PortfolioState?.data?.profile?.avatar || '/assets/avatar.svg',
    };
  }

  function signOut() {
    state.token = null; state.user = null; state.isOwner = false;
    localStorage.removeItem(LS_TOKEN);
    updateUi();
    fire('signout');
    showToast('Signed out.');
  }

  // saveData (POST /api/data) — keeps same signature as old Drive.saveData
  async function saveData(obj) {
    if (!state.token) throw new Error('Not signed in');
    const r = await fetch('/api/data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + state.token,
      },
      body: JSON.stringify(obj),
    });
    if (r.status === 401) { signOut(); throw new Error('Session expired — please sign in again.'); }
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.error || ('Save failed (HTTP ' + r.status + ')'));
    }
    return r.json();
  }

  // ---------- UI ----------
  function updateUi() {
    if (state.token && state.isOwner) {
      signinBtn.hidden = true;
      menuWrap.hidden = false;
      if (userAvatar) userAvatar.src = state.user?.picture || '/assets/avatar.svg';
      userEmail.textContent = state.user?.email || 'admin';
      statusRow.textContent = 'Owner — full edit access.';
    } else {
      signinBtn.hidden = false;
      menuWrap.hidden  = true;
    }
  }
  function toggleDropdown(force) {
    const visible = !dropdown.hasAttribute('hidden');
    const next    = force !== undefined ? force : !visible;
    dropdown.hidden = !next;
  }
  function hideDropdown() { dropdown.hidden = true; }

  // ---------- wiring ----------
  signinBtn?.addEventListener('click', openModal);
  userBtn?.addEventListener('click',  (e) => { e.stopPropagation(); toggleDropdown(); });
  signoutBtn?.addEventListener('click', () => { hideDropdown(); signOut(); });
  settingsBtn?.addEventListener('click', () => { hideDropdown(); openModal(); });
  document.addEventListener('click', (e) => { if (!menuWrap.contains(e.target)) hideDropdown(); });

  cfgSave?.addEventListener('click', async () => {
    const pwd = (pwdInput.value || '').trim();
    if (!pwd) { if (errEl) errEl.textContent = 'Enter the admin password.'; return; }
    cfgSave.disabled = true;
    if (errEl) errEl.textContent = 'Checking…';
    try {
      await signInWithPassword(pwd);
      closeModal();
      showToast('Signed in. Edit mode unlocked in the menu.', 'ok');
    } catch (e) {
      if (errEl) errEl.textContent = e.message;
      else showToast(e.message, 'err');
    } finally {
      cfgSave.disabled = false;
    }
  });

  // ---------- events ----------
  function on(event, fn) { document.addEventListener('auth:' + event, e => fn(e.detail)); }
  function fire(event, detail) { document.dispatchEvent(new CustomEvent('auth:' + event, { detail })); }

  // ---------- expose API ----------
  window.Auth = {
    state,
    signIn:  openModal,
    signOut,
    saveData,
    openSetup: openModal,
    on, fire,
    toast: showToast,
  };
  // Legacy alias so editor.js (which talks to window.Drive) keeps working.
  window.Drive = window.Auth;

  // ---------- session restore ----------
  if (state.token) {
    // Validate token (in case password rotated)
    verifyPassword(state.token).then(() => {
      state.user = synthUser();
      state.isOwner = true;
      updateUi();
      fire('signin', { user: state.user, isOwner: true });
    }).catch(() => signOut());
  }
})();

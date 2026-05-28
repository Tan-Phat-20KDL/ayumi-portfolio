/* ============================================================
   Contact form — sends an email to the site owner via EmailJS.

   Why EmailJS? Pure client-side, no backend needed, works on
   Cloudflare Pages as a static deploy. Free tier = 200 emails/mo.

   Setup steps (one-time):
   1. Create an account: https://www.emailjs.com/
   2. Add an "Email Service" — pick "Gmail" and authorize your
      gmail account (the address the messages will be sent to).
   3. Create an "Email Template" with variables:
        {{from_name}}, {{reply_to}}, {{subject}}, {{message}}
      In the template's "To Email" field put your gmail address.
      In the template's "Reply To" use {{reply_to}}.
   4. Grab: Public Key (Account → API Keys),
            Service ID (Email Services),
            Template ID (Email Templates).
   5. Put them into public/data.json -> config.emailjs:
        { "publicKey": "...", "serviceId": "...", "templateId": "..." }
      (Or via the editor — they're regular fields.)
   ============================================================ */
(() => {
  const form = document.getElementById('contact-form');
  if (!form) return;

  const status = document.getElementById('contact-status');
  const submit = document.getElementById('contact-submit');

  function emailJsCfg() {
    return window.PortfolioState?.data?.config?.emailjs || {};
  }
  function ownerEmail() {
    return window.PortfolioState?.data?.profile?.email || '';
  }

  let sdkPromise = null;
  function loadSdk(publicKey) {
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
      s.async = true;
      s.onload = () => {
        try {
          window.emailjs.init({ publicKey });
          resolve();
        } catch (e) { reject(e); }
      };
      s.onerror = () => reject(new Error('Failed to load EmailJS SDK'));
      document.head.appendChild(s);
    });
    return sdkPromise;
  }

  function setStatus(msg, cls) {
    status.textContent = msg;
    status.className = 'form-status ' + (cls || '');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const cfg = emailJsCfg();
    const fd = new FormData(form);
    const payload = {
      from_name: fd.get('from_name')?.toString().trim() || '',
      reply_to:  fd.get('reply_to')?.toString().trim() || '',
      subject:   fd.get('subject')?.toString().trim() || '(no subject)',
      message:   fd.get('message')?.toString().trim() || '',
      to_email:  ownerEmail(),
    };

    if (!payload.from_name || !payload.reply_to || !payload.message) {
      setStatus('Please fill in your name, email and message.', 'err');
      return;
    }

    if (!cfg.publicKey || !cfg.serviceId || !cfg.templateId) {
      // graceful fallback — open a mailto:
      const url = `mailto:${ownerEmail()}?subject=${encodeURIComponent(payload.subject)}` +
        `&body=${encodeURIComponent(payload.message + '\n\n— ' + payload.from_name + ' <' + payload.reply_to + '>')}`;
      window.location.href = url;
      setStatus('Opened your email app (EmailJS is not configured yet).', '');
      return;
    }

    submit.disabled = true;
    setStatus('Sending…');
    try {
      await loadSdk(cfg.publicKey);
      await window.emailjs.send(cfg.serviceId, cfg.templateId, payload);
      form.reset();
      setStatus('Thanks — your message was sent.', 'ok');
    } catch (err) {
      console.error(err);
      setStatus('Could not send: ' + (err?.text || err?.message || 'unknown error'), 'err');
    } finally {
      submit.disabled = false;
    }
  });
})();

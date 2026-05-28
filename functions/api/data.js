/* ============================================================
   /api/data — Cloudflare Pages Function
   GET  → returns portfolio JSON from KV, falls back to bundled
          /data.json on first run.
   POST → saves JSON to KV. Requires Authorization: Bearer <pwd>
          matching the ADMIN_PASSWORD env var.

   Required bindings (configured in Cloudflare Pages settings):
     - KV namespace bound as PORTFOLIO_KV
     - Env var ADMIN_PASSWORD (string)

   KV usage:
     key = "data"   (single document holding the whole portfolio)
   ============================================================ */
const KEY = 'data';
const MAX_BYTES = 24 * 1024 * 1024;   // KV per-value cap is 25 MB

function json(obj, init = {}) {
  return new Response(JSON.stringify(obj), {
    ...init,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(init.headers || {}),
    },
  });
}

export async function onRequestGet({ env, request }) {
  if (!env.PORTFOLIO_KV) {
    return json({ error: 'KV namespace PORTFOLIO_KV is not bound to this project.' }, { status: 500 });
  }
  let data = null;
  try {
    data = await env.PORTFOLIO_KV.get(KEY, 'json');
  } catch (e) {
    return json({ error: 'KV read failed: ' + e.message }, { status: 500 });
  }
  if (!data) {
    // First-run fallback: seed from the bundled data.json shipped with the deploy
    try {
      const seedUrl = new URL('/data.json', request.url);
      const r = await fetch(seedUrl.toString());
      if (r.ok) data = await r.json();
    } catch (_) {}
  }
  return json(data || {});
}

export async function onRequestPost({ env, request }) {
  if (!env.PORTFOLIO_KV)    return json({ error: 'KV namespace PORTFOLIO_KV not bound.' },        { status: 500 });
  if (!env.ADMIN_PASSWORD)  return json({ error: 'Server missing ADMIN_PASSWORD env var.' },     { status: 500 });

  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token || token !== env.ADMIN_PASSWORD) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const payload = JSON.stringify(body);
  if (payload.length > MAX_BYTES) {
    return json({ error: `Payload too large (${(payload.length / 1024).toFixed(1)} KB > ${MAX_BYTES / 1024} KB)` }, { status: 413 });
  }

  try {
    await env.PORTFOLIO_KV.put(KEY, payload);
  } catch (e) {
    return json({ error: 'KV write failed: ' + e.message }, { status: 500 });
  }
  return json({ ok: true, bytes: payload.length });
}

// Helpful CORS preflight (rarely needed since same-origin, but safe)
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}

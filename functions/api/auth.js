/* ============================================================
   /api/auth — verify the admin password.
   POST { password } → 200 { ok: true } | 401
   Used by the sign-in modal to validate before storing locally.
   ============================================================ */
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

export async function onRequestPost({ env, request }) {
  if (!env.ADMIN_PASSWORD) return json({ error: 'Server missing ADMIN_PASSWORD env var.' }, { status: 500 });
  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const pwd = (body?.password || '').toString();
  if (!pwd) return json({ error: 'Password required' }, { status: 400 });
  if (pwd !== env.ADMIN_PASSWORD) return json({ error: 'Wrong password' }, { status: 401 });
  return json({ ok: true });
}

// AccountDO — Durable Object holding all game accounts and session tokens.
// Storage keys:
//   u:<username-lowercase>  -> { username, salt, hash, createdAt }
//   t:<token>               -> { key, ts }

const encoder = new TextEncoder();

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

async function hashPassword(password, salt) {
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: encoder.encode(salt), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function makeToken() {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return [...arr].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function makeSalt() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return [...arr].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class AccountDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    const cors = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    let body = {};
    if (request.method === 'POST') {
      try { body = await request.json(); } catch { body = {}; }
    }

    const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: cors });

    // --- Create account ---
    if (path === '/signup' && request.method === 'POST') {
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      if (!/^[a-zA-Z0-9_-]{3,20}$/.test(username))
        return json({ error: 'Username must be 3-20 characters (letters, numbers, _ or -).' }, 400);
      if (password.length < 4) return json({ error: 'Password must be at least 4 characters.' }, 400);
      const key = username.toLowerCase();
      if (await this.state.storage.get('u:' + key))
        return json({ error: 'That username is already taken.' }, 409);
      const salt = makeSalt();
      const hash = await hashPassword(password, salt);
      const user = { username, salt, hash, createdAt: Date.now() };
      await this.state.storage.put('u:' + key, user);
      const token = makeToken();
      await this.state.storage.put('t:' + token, { key, ts: Date.now() });
      return json({ token, username, createdAt: user.createdAt });
    }

    // --- Log in ---
    if (path === '/login' && request.method === 'POST') {
      const key = String(body.username || '').trim().toLowerCase();
      const password = String(body.password || '');
      const user = await this.state.storage.get('u:' + key);
      if (!user) return json({ error: 'Wrong username or password.' }, 401);
      if ((await hashPassword(password, user.salt)) !== user.hash)
        return json({ error: 'Wrong username or password.' }, 401);
      const token = makeToken();
      await this.state.storage.put('t:' + token, { key, ts: Date.now() });
      return json({ token, username: user.username, createdAt: user.createdAt });
    }

    // --- Who am I? (GET /me?token=...  or POST /me {token}) ---
    if (path === '/me') {
      const token = request.method === 'GET' ? url.searchParams.get('token') : body.token;
      const sess = token ? await this.state.storage.get('t:' + token) : null;
      if (!sess) return json({ error: 'Not logged in or session expired.' }, 401);
      if (Date.now() - sess.ts > TOKEN_TTL_MS) {
        await this.state.storage.delete('t:' + token);
        return json({ error: 'Session expired, please log in again.' }, 401);
      }
      const user = await this.state.storage.get('u:' + sess.key);
      if (!user) return json({ error: 'Account not found.' }, 401);
      return json({ token, username: user.username, createdAt: user.createdAt });
    }

    // --- Change password ---
    if (path === '/change-password' && request.method === 'POST') {
      const token = String(body.token || '');
      const sess = await this.state.storage.get('t:' + token);
      if (!sess) return json({ error: 'Not logged in or session expired.' }, 401);
      const user = await this.state.storage.get('u:' + sess.key);
      if (!user) return json({ error: 'Account not found.' }, 401);
      const oldPassword = String(body.oldPassword || '');
      const newPassword = String(body.newPassword || '');
      if ((await hashPassword(oldPassword, user.salt)) !== user.hash)
        return json({ error: 'Current password is wrong.' }, 401);
      if (newPassword.length < 4) return json({ error: 'New password must be at least 4 characters.' }, 400);
      const salt = makeSalt();
      const hash = await hashPassword(newPassword, salt);
      await this.state.storage.put('u:' + sess.key, { ...user, salt, hash });
      return json({ ok: true });
    }

    // --- Log out ---
    if (path === '/logout' && request.method === 'POST') {
      const token = String(body.token || '');
      if (token) await this.state.storage.delete('t:' + token);
      return json({ ok: true });
    }

    // --- Health check ---
    if (path === '/ping') return json({ ok: true, service: 'game-account-manager' });

    return json({ error: 'Not found' }, 404);
  }
}

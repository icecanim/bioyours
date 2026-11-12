// Oturum (imzalı HttpOnly çerez) ve Google / Discord OAuth2 girişleri.
// Client secret'lar sadece sunucuda kullanılır.
const crypto = require('crypto');
const express = require('express');
const db = require('./db');
const { defaultProfile } = require('./profile');

const router = express.Router();

const BASE = (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
const SECURE = BASE.startsWith('https://');
const SESSION_SECONDS = 60 * 60 * 24 * 30;
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const OWNER_IDS = (process.env.OWNER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);

if (!process.env.SESSION_SECRET) {
  console.warn('[auth] SESSION_SECRET yok. Geçici bir anahtar kullanılıyor, yeniden başlatınca oturumlar düşer.');
}

// ---------- imzalı token ----------
function seal(payload, ttlSeconds) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlSeconds * 1000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function unseal(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig || '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

// ---------- çerez yardımcıları ----------
function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function setCookie(res, name, value, maxAge) {
  res.append(
    'Set-Cookie',
    `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${SECURE ? '; Secure' : ''}`
  );
}

// Her istekte oturumu çözer. req.user yoksa veya banlıysa null olur.
function loadUser(req, res, next) {
  const session = unseal(parseCookies(req).bio_session);
  const user = session ? db.read().users[session.uid] : null;
  if (!user || user.banned) {
    req.user = null;
    return next();
  }
  // OWNER_IDS her istekte kontrol edilir. Böylece giriş yapıldıktan sonra
  // eklenen ID de çıkış-giriş gerektirmeden hemen geçerli olur.
  req.user = OWNER_IDS.includes(user.id) ? { ...user, role: 'owner' } : user;
  next();
}

// ---------- OAuth yardımcıları ----------
async function postForm(url, data) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(data),
  });
  if (!res.ok) throw new Error(`Token alınamadı (HTTP ${res.status})`);
  return res.json();
}

async function getJson(url, accessToken) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Profil alınamadı (HTTP ${res.status})`);
  return res.json();
}

const PROVIDERS = {
  google: {
    authorize(state) {
      return 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        redirect_uri: `${BASE}/auth/google/callback`,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        prompt: 'select_account',
      });
    },
    async fetchUser(code) {
      const tok = await postForm('https://oauth2.googleapis.com/token', {
        code,
        grant_type: 'authorization_code',
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirect_uri: `${BASE}/auth/google/callback`,
      });
      const u = await getJson('https://openidconnect.googleapis.com/v1/userinfo', tok.access_token);
      return {
        provider: 'google',
        id: u.sub,
        email: u.email || null,
        name: u.name || u.email || 'Google kullanıcısı',
        avatar: u.picture || '',
      };
    },
  },

  discord: {
    authorize(state) {
      return 'https://discord.com/oauth2/authorize?' + new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID || '',
        redirect_uri: `${BASE}/auth/discord/callback`,
        response_type: 'code',
        scope: 'identify email',
        state,
      });
    },
    async fetchUser(code) {
      const tok = await postForm('https://discord.com/api/oauth2/token', {
        code,
        grant_type: 'authorization_code',
        client_id: process.env.DISCORD_CLIENT_ID || '',
        client_secret: process.env.DISCORD_CLIENT_SECRET || '',
        redirect_uri: `${BASE}/auth/discord/callback`,
      });
      const u = await getJson('https://discord.com/api/users/@me', tok.access_token);
      const avatar = u.avatar
        ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.${u.avatar.startsWith('a_') ? 'gif' : 'png'}?size=256`
        : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(u.id) >> 22n) % 6n)}.png`;
      return {
        provider: 'discord',
        id: u.id,
        email: u.email || null,
        name: u.global_name || u.username,
        avatar,
      };
    },
  },
};

// Hesabı oluşturur veya günceller. Banlı hesapta hata fırlatır.
async function upsertAccount(info) {
  const id = `${info.provider}:${info.id}`;
  return db.mutate((s) => {
    let u = s.users[id];
    if (!u) {
      u = {
        id,
        provider: info.provider,
        email: null,
        name: '',
        avatar: '',
        username: null,
        role: 'user',
        badges: [],
        premium: false,
        banned: false,
        createdAt: Date.now(),
        profile: defaultProfile(),
      };
      s.users[id] = u;
    }
    if (u.banned) {
      const err = new Error('banned');
      err.code = 'BANNED';
      throw err;
    }
    u.name = info.name;
    u.avatar = info.avatar;
    if (info.email) u.email = info.email;
    if (OWNER_IDS.includes(id)) u.role = 'owner';
    return u;
  });
}

// ---------- rotalar ----------
for (const [name, provider] of Object.entries(PROVIDERS)) {
  router.get(`/auth/${name}`, (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    setCookie(res, 'bio_oauth', seal({ state }, 600), 600);
    res.redirect(provider.authorize(state));
  });

  router.get(`/auth/${name}/callback`, async (req, res) => {
    setCookie(res, 'bio_oauth', '', 0);
    const expected = unseal(parseCookies(req).bio_oauth)?.state;

    if (req.query.error) return res.redirect('/?error=denied');
    if (!expected || req.query.state !== expected) return res.redirect('/?error=state');

    try {
      const info = await provider.fetchUser(String(req.query.code || ''));
      const user = await upsertAccount(info);
      setCookie(res, 'bio_session', seal({ uid: user.id }, SESSION_SECONDS), SESSION_SECONDS);
      res.redirect(user.username ? '/dashboard' : '/dashboard?setup=1');
    } catch (err) {
      console.error(`[auth:${name}]`, err.message);
      res.redirect(err.code === 'BANNED' ? '/?error=banned' : '/?error=login');
    }
  });
}

router.post('/auth/logout', (req, res) => {
  setCookie(res, 'bio_session', '', 0);
  res.json({ ok: true });
});

module.exports = { router, loadUser, upsertAccount };

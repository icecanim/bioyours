// JSON API. Tüm yetki kontrolleri sunucuda yapılır.
const crypto = require('crypto');
const express = require('express');
const db = require('./db');
const { handleUpload } = require('@vercel/blob/client');
const {
  BADGES, MANUAL_BADGES, roleRank, effectiveRole, hasPremium, effectiveBadges, resolveBadges, isCustomKey, parseOwnerIds, EMBLEM_KEYS,
} = require('./roles');
const { sanitizeProfile, publicProfile, validUsername, USERNAME_RE } = require('./profile');

const router = express.Router();
const OWNER_DIAG = parseOwnerIds(process.env.OWNER_IDS);

// Blob token'ı: standart ad yoksa, "..._READ_WRITE_TOKEN" ile biten herhangi bir değişken
function blobToken() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  const hit = Object.keys(process.env).find((k) => k.endsWith('_READ_WRITE_TOKEN'));
  return hit ? process.env[hit] : undefined;
}

const httpError = (status, message) => Object.assign(new Error(message), { status });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const requireUser = (req, res, next) =>
  req.user ? next() : res.status(401).json({ error: 'Giriş yapmalısın' });

const requireClaimed = (req, res, next) =>
  req.user?.username ? next() : res.status(403).json({ error: 'Önce kullanıcı adını seçmelisin' });

const requireRank = (min) => (req, res, next) =>
  req.user && roleRank(effectiveRole(req.user)) >= min
    ? next()
    : res.status(403).json({ error: 'Yetkin yok' });

// Başka bir kullanıcıyı yönetir. Kendi hesabı ve eşit/üst yetkili hedef engellidir.
function loadTarget(req, res, next) {
  const target = db.read().users[req.params.id];
  if (!target) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'Kendi hesabında bu işlemi yapamazsın' });
  if (roleRank(effectiveRole(req.user)) <= roleRank(effectiveRole(target))) {
    return res.status(403).json({ error: 'Bu kullanıcıyı yönetme yetkin yok' });
  }
  req.targetId = target.id;
  next();
}

// Rozet ve premium için kendi hesabına izin verilir.
function loadTargetSelf(req, res, next) {
  if (req.params.id === req.user.id) {
    req.targetId = req.user.id;
    return next();
  }
  return loadTarget(req, res, next);
}

const selfView = (u) => ({
  id: u.id,
  name: u.name,
  avatar: u.avatar,
  username: u.username,
  role: effectiveRole(u),
  premium: Boolean(u.premium),
  provider: u.provider,
  badges: resolveBadges(effectiveBadges(u), db.read().badgeDefs || {}),
});

const adminView = (u) => ({
  ...selfView(u),
  email: u.email,
  banned: Boolean(u.banned),
  createdAt: u.createdAt,
  manualBadges: u.badges || [],
});

// ---------- kullanıcı ----------
router.get('/me', (req, res) => {
  res.json({
    user: req.user ? selfView(req.user) : null,
    builtinBadges: BADGES,
    manualBadges: MANUAL_BADGES,
    debug: {
      build: 'v7',
      ownerEnvCount: OWNER_DIAG.length,
      youAreListed: req.user ? OWNER_DIAG.includes(req.user.id) : null,
    },
  });
});

router.post('/username', requireUser, wrap(async (req, res) => {
  const name = String(req.body?.username || '').trim().toLowerCase();
  const problem = validUsername(name);
  if (problem) return res.status(400).json({ error: problem });

  try {
    await db.mutate((s) => {
      const u = s.users[req.user.id];
      if (u.username) throw httpError(409, 'Zaten bir kullanıcı adın var');
      if (s.usernames[name]) throw httpError(409, 'Bu kullanıcı adı alınmış');
      u.username = name;
      u.profile.displayName = u.profile.displayName || name;
      s.usernames[name] = u.id;
    });
    res.json({ ok: true, username: name });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }
}));

// ---------- profil ----------
router.get('/profile/:username', (req, res) => {
  const name = req.params.username.toLowerCase();
  if (!USERNAME_RE.test(name)) return res.status(404).json({ error: 'Profil bulunamadı' });
  const s = db.read();
  const user = s.users[s.usernames[name]];
  if (!user || user.banned) return res.status(404).json({ error: 'Profil bulunamadı' });
  res.json(publicProfile(user));
});

router.put('/profile', requireUser, requireClaimed, wrap(async (req, res) => {
  const profile = sanitizeProfile(req.body, req.user);
  await db.mutate((s) => {
    s.users[req.user.id].profile = profile;
  });
  res.json({ ok: true, profile });
}));

// ---------- dosya yükleme (doğrudan Vercel Blob'a) ----------
// Dosya sunucudan geçmez. Bu rota yalnızca yükleme izni (token) verir.
// Böylece istek gövdesi sınırı devreye girmez ve boyut sınırı yoktur.
const IMG_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const VID_TYPES = ['video/mp4', 'video/webm'];
const AUD_TYPES = [
  'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/mp4', 'audio/aac',
];
const CUR_TYPES = ['image/x-icon', 'image/vnd.microsoft.icon', 'image/png', 'image/gif'];
const FONT_TYPES = [
  'font/woff2', 'font/woff', 'font/ttf', 'font/otf',
  'application/font-woff2', 'application/font-woff', 'application/x-font-ttf', 'application/x-font-otf',
  'application/vnd.ms-opentype',
];

const UPLOAD_KINDS = {
  avatar: { types: IMG_TYPES, premium: false },
  icon: { types: IMG_TYPES, premium: false },
  background: { types: [...IMG_TYPES, ...VID_TYPES], videoOnlyPremium: true },
  audio: { types: AUD_TYPES, premium: true },
  click: { types: AUD_TYPES, premium: true },
  cursor: { types: CUR_TYPES, premium: true },
  font: { types: FONT_TYPES, premium: true },
};

router.post('/blob/upload', requireUser, requireClaimed, express.json({ limit: '64kb' }), wrap(async (req, res) => {
  const premium = hasPremium(req.user);
  try {
    const result = await handleUpload({
      token: blobToken(),
      body: req.body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        const kind = pathname.split('/')[0];
        const spec = UPLOAD_KINDS[kind];
        if (!spec) throw new Error('Geçersiz yükleme türü');
        if (!pathname.startsWith(`${kind}/${req.user.username}.`)) throw new Error('Geçersiz dosya yolu');
        if (spec.premium && !premium) throw new Error('Bu özellik Premium ile açılır');
        let allowed = spec.types;
        if (spec.videoOnlyPremium && !premium) allowed = IMG_TYPES;
        return {
          allowedContentTypes: allowed,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ uid: req.user.id, kind }),
        };
      },
    });
    res.json(result);
  } catch (err) {
    console.error('[blob]', err.message);
    res.status(err.status || 400).json({ error: err.message || 'Yükleme izni verilemedi' });
  }
}));

// Tanı: token var mı ve hangi BLOB değişkenleri tanımlı. Değerleri asla göstermez.
router.get('/blob/check', requireUser, requireRank(100), (req, res) => {
  res.json({
    tokenFound: Boolean(blobToken()),
    blobEnvNames: Object.keys(process.env).filter((k) => /BLOB/i.test(k)).sort(),
  });
});

// ---------- admin paneli ----------
router.get('/admin/users', requireUser, requireRank(60), (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase().slice(0, 60);
  const s = db.read();
  const all = Object.values(s.users);
  const users = all
    .filter((u) => !q || [u.username, u.name, u.email, u.id].some((v) => (v || '').toLowerCase().includes(q)))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 100)
    .map(adminView);
  res.json({ users, total: all.length, badgeDefs: Object.values(s.badgeDefs || {}) });
});

// Özel rozet tanımları
router.post('/admin/badge-defs', requireUser, requireRank(80), wrap(async (req, res) => {
  const label = clipText(req.body?.label, 24);
  const icon = EMBLEM_KEYS.includes(req.body?.icon) ? req.body.icon : 'star';
  const color = /^#[0-9a-f]{6}$/i.test(req.body?.color || '') ? req.body.color.toLowerCase() : '#9d6bff';
  if (!label) return res.status(400).json({ error: 'Rozet adı gerekli' });
  const id = crypto.randomBytes(5).toString('hex');
  await db.mutate((s) => {
    s.badgeDefs = s.badgeDefs || {};
    s.badgeDefs[id] = { id, label, icon, color };
  });
  res.json({ ok: true, badge: { id, label, icon, color } });
}));

router.delete('/admin/badge-defs/:id', requireUser, requireRank(80), wrap(async (req, res) => {
  const id = req.params.id;
  const key = `custom:${id}`;
  await db.mutate((s) => {
    delete (s.badgeDefs || {})[id];
    for (const u of Object.values(s.users)) {
      u.badges = (u.badges || []).filter((b) => b !== key);
    }
  });
  res.json({ ok: true });
}));

router.post('/admin/users/:id/badge', requireUser, requireRank(80), loadTargetSelf, wrap(async (req, res) => {
  const badge = String(req.body?.badge || '');
  const on = req.body.enabled === true;
  const s = db.read();
  const validCustom = isCustomKey(badge) && s.badgeDefs?.[badge.slice(7)];
  if (!MANUAL_BADGES.includes(badge) && !validCustom) {
    return res.status(400).json({ error: 'Geçersiz rozet' });
  }
  await db.mutate((st) => {
    const u = st.users[req.targetId];
    u.badges = on ? [...new Set([...(u.badges || []), badge])] : (u.badges || []).filter((b) => b !== badge);
  });
  res.json({ ok: true });
}));

router.post('/admin/users/:id/role', requireUser, requireRank(100), loadTarget, wrap(async (req, res) => {
  const role = String(req.body?.role || '');
  if (!['user', 'mod', 'admin'].includes(role)) return res.status(400).json({ error: 'Geçersiz yetki' });
  await db.mutate((s) => {
    s.users[req.targetId].role = role;
  });
  res.json({ ok: true });
}));

const toggleField = (field) => wrap(async (req, res) => {
  const enabled = req.body?.enabled === true;
  await db.mutate((s) => {
    s.users[req.targetId][field] = enabled;
  });
  res.json({ ok: true });
});

router.post('/admin/users/:id/premium', requireUser, requireRank(80), loadTargetSelf, toggleField('premium'));
router.post('/admin/users/:id/ban', requireUser, requireRank(80), loadTarget, toggleField('banned'));

function clipText(v, max) {
  return String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

module.exports = router;

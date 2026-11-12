// JSON API. Tüm yetki kontrolleri burada, sunucu tarafında yapılır.
const express = require('express');
const db = require('./db');
const { put } = require('@vercel/blob');
const { BADGES, MANUAL_BADGES, roleRank, effectiveBadges } = require('./roles');
const { sanitizeProfile, publicProfile, validUsername, USERNAME_RE } = require('./profile');

const router = express.Router();

// Tanı amaçlı: değerin kendisi değil, yalnızca sayısı ve eşleşme bilgisi döner.
const OWNER_IDS = (process.env.OWNER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);

const httpError = (status, message) => Object.assign(new Error(message), { status });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const requireUser = (req, res, next) =>
  req.user ? next() : res.status(401).json({ error: 'Giriş yapmalısın' });

const requireClaimed = (req, res, next) =>
  req.user?.username ? next() : res.status(403).json({ error: 'Önce kullanıcı adını seçmelisin' });

const requireRank = (min) => (req, res, next) =>
  req.user && roleRank(req.user.role) >= min ? next() : res.status(403).json({ error: 'Yetkin yok' });

// Hedef kullanıcıyı yükler ve yönetme yetkisini kontrol eder.
// Kural: kendini yönetemezsin ve sadece kendinden düşük yetkili birini yönetebilirsin.
function loadTarget(req, res, next) {
  const target = db.read().users[req.params.id];
  if (!target) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'Kendi hesabında bu işlemi yapamazsın' });
  if (roleRank(req.user.role) <= roleRank(target.role)) {
    return res.status(403).json({ error: 'Bu kullanıcıyı yönetme yetkin yok' });
  }
  req.targetId = target.id;
  next();
}

const selfView = (u) => ({
  id: u.id,
  name: u.name,
  avatar: u.avatar,
  username: u.username,
  role: u.role,
  premium: u.premium,
  provider: u.provider,
  badges: effectiveBadges(u),
});

const adminView = (u) => ({
  ...selfView(u),
  email: u.email,
  banned: u.banned,
  createdAt: u.createdAt,
  manualBadges: u.badges,
});

// ---------- kullanıcı ----------
router.get('/me', (req, res) => {
  res.json({
    user: req.user ? selfView(req.user) : null,
    badges: BADGES,
    manualBadges: MANUAL_BADGES,
    debug: {
      build: 'v3-diag',
      ownerEnvCount: OWNER_IDS.length,
      youAreListed: req.user ? OWNER_IDS.includes(req.user.id) : null,
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

// ---------- admin paneli ----------
router.get('/admin/users', requireUser, requireRank(60), (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase().slice(0, 60);
  const all = Object.values(db.read().users);
  const users = all
    .filter((u) => !q || [u.username, u.name, u.email, u.id].some((v) => (v || '').toLowerCase().includes(q)))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 100)
    .map(adminView);
  res.json({ users, total: all.length });
});

router.post('/admin/users/:id/badge', requireUser, requireRank(80), loadTarget, wrap(async (req, res) => {
  const badge = String(req.body?.badge || '');
  if (!MANUAL_BADGES.includes(badge)) return res.status(400).json({ error: 'Geçersiz rozet' });
  const on = Boolean(req.body.enabled);
  await db.mutate((s) => {
    const u = s.users[req.targetId];
    u.badges = on ? [...new Set([...u.badges, badge])] : u.badges.filter((b) => b !== badge);
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
  const enabled = Boolean(req.body?.enabled);
  await db.mutate((s) => {
    s.users[req.targetId][field] = enabled;
  });
  res.json({ ok: true });
});

router.post('/admin/users/:id/premium', requireUser, requireRank(80), loadTarget, toggleField('premium'));
router.post('/admin/users/:id/ban', requireUser, requireRank(80), loadTarget, toggleField('banned'));

// ---------- dosya yükleme (avatar, arka plan görseli, premium video) ----------
const IMAGE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
const VIDEO_TYPES = { 'video/mp4': 'mp4', 'video/webm': 'webm' };
const MB = 1024 * 1024;
const LIMITS = { avatar: 2 * MB, image: 6 * MB, video: 15 * MB };

router.post(
  '/upload',
  requireUser,
  requireClaimed,
  express.raw({ type: [...Object.keys(IMAGE_TYPES), ...Object.keys(VIDEO_TYPES)], limit: '15mb' }),
  wrap(async (req, res) => {
    const kind = String(req.query.kind || '');
    const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const body = req.body;

    if (!Buffer.isBuffer(body) || !body.length) return res.status(400).json({ error: 'Dosya boş' });

    let limit;
    if (kind === 'avatar') {
      if (!IMAGE_TYPES[type]) return res.status(400).json({ error: 'Avatar için PNG, JPG, WEBP veya GIF yükle' });
      limit = LIMITS.avatar;
    } else if (kind === 'background') {
      if (IMAGE_TYPES[type]) {
        limit = LIMITS.image;
      } else if (VIDEO_TYPES[type]) {
        if (!req.user.premium) return res.status(403).json({ error: 'Video arka plan Premium ile açılır' });
        limit = LIMITS.video;
      } else {
        return res.status(400).json({ error: 'Desteklenmeyen dosya türü' });
      }
    } else {
      return res.status(400).json({ error: 'Geçersiz yükleme türü' });
    }

    if (body.length > limit) {
      return res.status(413).json({ error: `Dosya çok büyük (en fazla ${Math.round(limit / MB)} MB)` });
    }

    const ext = IMAGE_TYPES[type] || VIDEO_TYPES[type];
    try {
      const blob = await put(`${kind}/${req.user.username}.${ext}`, body, {
        access: 'public',
        contentType: type,
        addRandomSuffix: true,
      });
      res.json({ url: blob.url });
    } catch (err) {
      console.error('[upload]', err.message);
      res.status(503).json({ error: 'Yükleme şu an yapılamıyor. Vercel Blob bağlı mı kontrol et.' });
    }
  })
);

module.exports = router;

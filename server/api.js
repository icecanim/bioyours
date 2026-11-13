// JSON API. Tüm yetki kontrolleri sunucuda yapılır.
const express = require('express');
const db = require('./db');
const { put } = require('@vercel/blob');
const {
  BADGES, MANUAL_BADGES, roleRank, effectiveRole, hasPremium, effectiveBadges, parseOwnerIds,
} = require('./roles');
const { sanitizeProfile, publicProfile, validUsername, USERNAME_RE } = require('./profile');

const router = express.Router();
const MB = 1024 * 1024;

// Tanı: değerin kendisi değil, yalnızca sayısı döner.
const OWNER_DIAG = parseOwnerIds(process.env.OWNER_IDS);

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

// Rozet ve premium için kendi hesabına izin verilir (yetki kontrolü requireRank ile yapılır).
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
  badges: effectiveBadges(u),
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
    badges: BADGES,
    manualBadges: MANUAL_BADGES,
    debug: {
      build: 'v5',
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

// ---------- dosya yükleme ----------
const IMG = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
const VID = { 'video/mp4': 'mp4', 'video/webm': 'webm' };
const AUD = {
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav',
  'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/mp4': 'm4a', 'audio/aac': 'aac',
};
const CUR = { 'image/x-icon': 'cur', 'image/vnd.microsoft.icon': 'cur', 'image/png': 'png', 'image/gif': 'gif' };

const RULES = {
  avatar: { types: IMG, limit: 2 * MB, premium: false },
  audio: { types: AUD, limit: 8 * MB, premium: true },
  cursor: { types: CUR, limit: 256 * 1024, premium: true },
};

router.post(
  '/upload',
  requireUser,
  requireClaimed,
  express.raw({ type: '*/*', limit: '15mb' }),
  wrap(async (req, res) => {
    const kind = String(req.query.kind || '');
    const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const body = req.body;
    if (!Buffer.isBuffer(body) || !body.length) return res.status(400).json({ error: 'Dosya boş' });

    const premium = hasPremium(req.user);
    let ext;
    let limit;

    if (kind === 'background') {
      if (IMG[type]) {
        ext = IMG[type];
        limit = 6 * MB;
      } else if (VID[type]) {
        if (!premium) return res.status(403).json({ error: 'Video arka plan Premium ile açılır' });
        ext = VID[type];
        limit = 15 * MB;
      } else {
        return res.status(400).json({ error: 'Desteklenmeyen dosya türü' });
      }
    } else if (RULES[kind]) {
      const rule = RULES[kind];
      ext = rule.types[type];
      if (!ext) return res.status(400).json({ error: 'Desteklenmeyen dosya türü' });
      if (rule.premium && !premium) return res.status(403).json({ error: 'Bu özellik Premium ile açılır' });
      limit = rule.limit;
    } else {
      return res.status(400).json({ error: 'Geçersiz yükleme türü' });
    }

    if (body.length > limit) return res.status(413).json({ error: 'Dosya çok büyük' });

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

router.post('/admin/users/:id/badge', requireUser, requireRank(80), loadTargetSelf, wrap(async (req, res) => {
  const badge = String(req.body?.badge || '');
  if (!MANUAL_BADGES.includes(badge)) return res.status(400).json({ error: 'Geçersiz rozet' });
  const on = req.body.enabled === true;
  await db.mutate((s) => {
    const u = s.users[req.targetId];
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

module.exports = router;

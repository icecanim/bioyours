// JSON API. Tüm yetki kontrolleri burada, sunucu tarafında yapılır.
const express = require('express');
const db = require('./db');
const { BADGES, MANUAL_BADGES, roleRank, effectiveBadges } = require('./roles');
const { sanitizeProfile, publicProfile, validUsername, USERNAME_RE } = require('./profile');

const router = express.Router();

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

module.exports = router;

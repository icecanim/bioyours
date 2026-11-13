// Rozetler ve yetki seviyeleri.
// Yetki sıralaması: owner > admin > mod > user

const BADGES = {
  owner:     { label: 'Owner',           icon: '♛', color: '#ff5a6b' },
  admin:     { label: 'Admin',           icon: '◆', color: '#f5b84b' },
  mod:       { label: 'Moderatör',       icon: '⚒', color: '#5ce1ff' },
  verified:  { label: 'Doğrulanmış',     icon: '✓', color: '#49d17d' },
  early:     { label: 'Erken Kullanıcı', icon: '✦', color: '#9fd8ff' },
  supporter: { label: 'Destekçi',        icon: '♥', color: '#ff8fc7' },
  premium:   { label: 'Premium',         icon: '◇', color: '#b98cff' },
};

const ROLE_RANK = { owner: 100, admin: 80, mod: 60, user: 0 };
const ROLE_BADGE = { owner: 'owner', admin: 'admin', mod: 'mod' };
const MANUAL_BADGES = ['verified', 'early', 'supporter'];

const roleRank = (role) => ROLE_RANK[role] ?? 0;

// OWNER_IDS ayrıştırıcı. "discord:123" da, sadece "123" da kabul eder (Discord varsayılır).
// Tırnak ve boşlukları temizler.
function parseOwnerIds(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim().replace(/^["']+|["']+$/g, '').trim())
    .filter(Boolean)
    .map((s) => (s.includes(':') ? s : `discord:${s}`));
}

const OWNER_IDS = parseOwnerIds(process.env.OWNER_IDS);

// Owner durumu veritabanına değil ortam değişkenine göre belirlenir. Her istekte geçerlidir.
function effectiveRole(u) {
  return OWNER_IDS.includes(u.id) ? 'owner' : (u.role || 'user');
}

// Premium özellikler: premium hesaplar, owner ve admin.
const hasPremium = (u) => Boolean(u.premium) || ['owner', 'admin'].includes(effectiveRole(u));

function effectiveBadges(u) {
  const set = new Set(u.badges || []);
  const role = effectiveRole(u);
  if (ROLE_BADGE[role]) set.add(ROLE_BADGE[role]);
  if (u.premium) set.add('premium');
  return [...set].filter((b) => BADGES[b]);
}

module.exports = {
  BADGES, MANUAL_BADGES, ROLE_RANK, roleRank,
  effectiveRole, hasPremium, effectiveBadges, parseOwnerIds,
};

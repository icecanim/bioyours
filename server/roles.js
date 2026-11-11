// Rozetler ve yetki seviyeleri.
// Yetki sıralaması: owner > admin > mod > user

const BADGES = {
  owner:     { label: 'Owner',           icon: '♛', color: '#ff5d7a' },
  admin:     { label: 'Admin',           icon: '◆', color: '#ffb547' },
  mod:       { label: 'Moderatör',       icon: '⚒', color: '#5ce1ff' },
  verified:  { label: 'Doğrulanmış',     icon: '✓', color: '#7ee787' },
  early:     { label: 'Erken Kullanıcı', icon: '✦', color: '#9fd8ff' },
  supporter: { label: 'Destekçi',        icon: '♥', color: '#ff8fc7' },
  premium:   { label: 'Premium',         icon: '◇', color: '#b48cff' },
};

const ROLE_RANK = { owner: 100, admin: 80, mod: 60, user: 0 };

// Yetkiye bağlı rozetler otomatik gösterilir, elle verilmez.
const ROLE_BADGE = { owner: 'owner', admin: 'admin', mod: 'mod' };

// Admin panelinden elle verilebilen rozetler.
const MANUAL_BADGES = ['verified', 'early', 'supporter'];

const roleRank = (role) => ROLE_RANK[role] ?? 0;

function effectiveBadges(u) {
  const set = new Set(u.badges || []);
  if (ROLE_BADGE[u.role]) set.add(ROLE_BADGE[u.role]);
  if (u.premium) set.add('premium');
  return [...set].filter((b) => BADGES[b]);
}

module.exports = { BADGES, MANUAL_BADGES, ROLE_RANK, roleRank, effectiveBadges };

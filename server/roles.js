// Rozetler, yetki seviyeleri ve özel rozetler.
// Yetki sıralaması: owner > admin > mod > user

const BADGES = {
  owner:     { label: 'Owner',           icon: '♛', color: '#ff5a6b' },
  admin:     { label: 'Admin',           icon: '◆', color: '#f5b84b' },
  mod:       { label: 'Moderatör',       icon: '⚒', color: '#5ce1ff' },
  premium:   { label: 'Premium',         icon: '◇', color: '#b98cff' },
  verified:  { label: 'Doğrulanmış',     icon: '✓', color: '#49d17d' },
  early:     { label: 'Erken Kullanıcı', icon: '✦', color: '#9fd8ff' },
  supporter: { label: 'Destekçi',        icon: '♥', color: '#ff8fc7' },
  partner:   { label: 'Partner',         icon: '◈', color: '#ffd84d' },
  developer: { label: 'Geliştirici',     icon: '⌘', color: '#7ee7c1' },
  beta:      { label: 'Beta Tester',     icon: '✧', color: '#a0b4ff' },
  bughunter: { label: 'Bug Avcısı',      icon: '⌖', color: '#ff9f6b' },
};

const ROLE_RANK = { owner: 100, admin: 80, mod: 60, user: 0 };
const ROLE_BADGE = { owner: 'owner', admin: 'admin', mod: 'mod' };

// Yönetim panelinden elle verilebilen hazır rozetler
const MANUAL_BADGES = ['verified', 'early', 'supporter', 'partner', 'developer', 'beta', 'bughunter'];

const roleRank = (role) => ROLE_RANK[role] ?? 0;

// OWNER_IDS ayrıştırıcı. "discord:123" da, sadece "123" da kabul eder (Discord varsayılır).
function parseOwnerIds(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim().replace(/^["']+|["']+$/g, '').trim())
    .filter(Boolean)
    .map((s) => (s.includes(':') ? s : `discord:${s}`));
}

const OWNER_IDS = parseOwnerIds(process.env.OWNER_IDS);

// Owner durumu ortam değişkenine göre belirlenir. Her istekte geçerlidir.
function effectiveRole(u) {
  return OWNER_IDS.includes(u.id) ? 'owner' : (u.role || 'user');
}

// Premium özellikler: premium hesaplar, owner ve admin.
const hasPremium = (u) => Boolean(u.premium) || ['owner', 'admin'].includes(effectiveRole(u));

const isCustomKey = (k) => typeof k === 'string' && k.startsWith('custom:');

// Kullanıcının rozet anahtarları (hazır ve özel). Yetkiye bağlı ve premium rozetleri otomatik eklenir.
function effectiveBadges(u) {
  const set = new Set(u.badges || []);
  const role = effectiveRole(u);
  if (ROLE_BADGE[role]) set.add(ROLE_BADGE[role]);
  if (u.premium) set.add('premium');
  return [...set].filter((b) => BADGES[b] || isCustomKey(b));
}

// Anahtarları görüntülenecek nesnelere çevirir: { key, label, icon, color }
function resolveBadges(keys, defs) {
  return keys.map((k) => {
    if (isCustomKey(k)) {
      const d = defs[k.slice(7)];
      return d ? { key: k, label: d.label, icon: d.icon, color: d.color } : null;
    }
    return BADGES[k] ? { key: k, ...BADGES[k] } : null;
  }).filter(Boolean);
}

module.exports = {
  BADGES, MANUAL_BADGES, ROLE_RANK, roleRank, isCustomKey,
  effectiveRole, hasPremium, effectiveBadges, resolveBadges, parseOwnerIds,
};

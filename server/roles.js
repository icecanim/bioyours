// Rozetler, yetki seviyeleri ve özel rozetler.
// Yetki sıralaması: owner > admin > mod > user

const BADGES = {
  owner:     { label: 'Owner',           icon: 'crown', color: '#ff5a6b' },
  admin:     { label: 'Admin',           icon: 'shield', color: '#f5b84b' },
  mod:       { label: 'Moderatör',       icon: 'wrench', color: '#5ce1ff' },
  premium:   { label: 'Premium',         icon: 'gem', color: '#b98cff' },
  verified:  { label: 'Doğrulanmış',     icon: 'check', color: '#49d17d' },
  early:     { label: 'Erken Kullanıcı', icon: 'sprout', color: '#9fd8ff' },
  supporter: { label: 'Destekçi',        icon: 'heart', color: '#ff8fc7' },
  partner:   { label: 'Partner',         icon: 'star', color: '#ffd84d' },
  developer: { label: 'Geliştirici',     icon: 'code', color: '#7ee7c1' },
  beta:      { label: 'Beta Tester',     icon: 'flask', color: '#a0b4ff' },
  bughunter: { label: 'Bug Avcısı',      icon: 'bug', color: '#ff9f6b' },
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

// Özel rozetler için seçilebilir semboller (istemci aynı anahtarları çizer)
const EMBLEM_KEYS = ['crown', 'shield', 'wrench', 'gem', 'check', 'spark', 'sprout', 'heart', 'star', 'code', 'flask', 'bug', 'bolt', 'eye'];

module.exports = {
  BADGES, MANUAL_BADGES, ROLE_RANK, roleRank, isCustomKey, EMBLEM_KEYS,
  effectiveRole, hasPremium, effectiveBadges, resolveBadges, parseOwnerIds,
};

// Profil doğrulama, varsayılanlar ve dışarıya açık görünüm.
// Kullanıcıdan gelen her alan burada temizlenir. Tarayıcıya güvenilmez.
const crypto = require('crypto');
const { effectiveBadges } = require('./roles');

const RESERVED = new Set([
  'api', 'auth', 'dashboard', 'yonetim', 'admin', 'login', 'logout', 'settings',
  'premium', 'badges', 'links', 'discord', 'help', 'support', 'terms', 'privacy',
  'css', 'js', 'img', 'views', 'healthz', 'robots.txt', 'favicon.ico', 'index',
  'null', 'undefined',
]);

const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;

function validUsername(name) {
  if (!USERNAME_RE.test(name)) return 'Kullanıcı adı 3-20 karakter olmalı (a-z, 0-9, _ ve .)';
  if (RESERVED.has(name)) return 'Bu kullanıcı adı rezerve';
  if (/^[._]|[._]$|\.\./.test(name)) return 'Nokta veya alt çizgiyle başlayıp bitemez, ".." içeremez';
  return null;
}

// Bağlantı URL'sine göre platform tanıma. Renk, etiket baş harfi için kullanılır.
const PLATFORMS = {
  youtube: ['youtube.com', 'youtu.be'],
  x: ['x.com', 'twitter.com'],
  instagram: ['instagram.com'],
  tiktok: ['tiktok.com'],
  discord: ['discord.gg', 'discord.com'],
  twitch: ['twitch.tv'],
  kick: ['kick.com'],
  github: ['github.com'],
  spotify: ['spotify.com'],
  soundcloud: ['soundcloud.com'],
  steam: ['steamcommunity.com', 'steampowered.com'],
  telegram: ['t.me', 'telegram.me'],
  reddit: ['reddit.com'],
  snapchat: ['snapchat.com'],
  linkedin: ['linkedin.com'],
  facebook: ['facebook.com', 'fb.com'],
};

function detectPlatform(url) {
  let host;
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'web';
  }
  for (const [key, domains] of Object.entries(PLATFORMS)) {
    if (domains.some((d) => host === d || host.endsWith('.' + d))) return key;
  }
  return 'web';
}

function defaultProfile() {
  return {
    displayName: '',
    description: '',
    avatar: '',
    background: { type: 'color', color: '#05070a', url: '' },
    colors: { accent: '#7fd6ff', text: '#f2f7fa', card: '#0f161d' },
    effects: { blur: 12, opacity: 0.85 },
    links: [],
  };
}

const clip = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
const hex = (v, fallback) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fallback);
const num = (v, min, max, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

function safeUrl(v, protocols = ['https:']) {
  if (typeof v !== 'string' || v.length > 500) return '';
  try {
    const u = new URL(v.trim());
    return protocols.includes(u.protocol) ? u.href : '';
  } catch {
    return '';
  }
}

// Premium olmayan kullanıcılar 10 bağlantı ve video arka plan kullanabilir.
function sanitizeProfile(input, user) {
  const p = input && typeof input === 'object' ? input : {};
  const premium = Boolean(user.premium);
  const bg = p.background && typeof p.background === 'object' ? p.background : {};
  const colors = p.colors && typeof p.colors === 'object' ? p.colors : {};
  const fx = p.effects && typeof p.effects === 'object' ? p.effects : {};
  const linkLimit = premium ? 50 : 10;

  let bgType = ['color', 'image', 'video'].includes(bg.type) ? bg.type : 'color';
  if (bgType === 'video' && !premium) bgType = 'color';

  const links = (Array.isArray(p.links) ? p.links : [])
    .slice(0, linkLimit)
    .map((l) => {
      if (!l || typeof l !== 'object') return null;
      const url = safeUrl(l.url, ['http:', 'https:']);
      if (!url) return null;
      return {
        id: clip(l.id, 40) || crypto.randomUUID(),
        title: clip(l.title, 40) || 'Bağlantı',
        url,
        platform: detectPlatform(url),
        enabled: l.enabled !== false,
      };
    })
    .filter(Boolean);

  return {
    displayName: clip(p.displayName, 32),
    description: clip(p.description, 190),
    avatar: safeUrl(p.avatar, ['https:']),
    background: {
      type: bgType,
      color: hex(bg.color, '#05070a'),
      url: bgType === 'color' ? '' : safeUrl(bg.url, ['https:']),
    },
    colors: {
      accent: hex(colors.accent, '#7fd6ff'),
      text: hex(colors.text, '#f2f7fa'),
      card: hex(colors.card, '#0f161d'),
    },
    effects: {
      blur: num(fx.blur, 0, 40, 12),
      opacity: num(fx.opacity, 0.2, 1, 0.85),
    },
    links,
  };
}

// Herkese açık görünüm. E-posta ve sağlayıcı bilgisi asla dışarı çıkmaz.
function publicProfile(u) {
  const p = u.profile || defaultProfile();
  return {
    username: u.username,
    avatar: p.avatar || u.avatar || '',
    badges: effectiveBadges(u),
    premium: Boolean(u.premium),
    profile: { ...p, displayName: p.displayName || u.username },
  };
}

module.exports = {
  RESERVED,
  USERNAME_RE,
  validUsername,
  detectPlatform,
  defaultProfile,
  sanitizeProfile,
  publicProfile,
};

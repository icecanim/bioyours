// Profil doğrulama, varsayılanlar ve dışarıya açık görünüm.
// Kullanıcıdan gelen her alan burada temizlenir. Tarayıcıya güvenilmez.
const crypto = require('crypto');
const db = require('./db');
const { effectiveBadges, resolveBadges, hasPremium } = require('./roles');

const RESERVED = new Set([
  'api', 'auth', 'dashboard', 'yonetim', 'admin', 'login', 'logout', 'settings',
  'premium', 'badges', 'links', 'discord', 'help', 'support', 'terms', 'privacy',
  'css', 'js', 'img', 'views', 'healthz', 'robots.txt', 'favicon.ico', 'index',
  'null', 'undefined', 'vendor',
]);

const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;

function validUsername(name) {
  if (!USERNAME_RE.test(name)) return 'Kullanıcı adı 3-20 karakter olmalı (a-z, 0-9, _ ve .)';
  if (RESERVED.has(name)) return 'Bu kullanıcı adı rezerve';
  if (/^[._]|[._]$|\.\./.test(name)) return 'Nokta veya alt çizgiyle başlayıp bitemez, ".." içeremez';
  return null;
}

const PLATFORMS = {
  youtube: ['youtube.com', 'youtu.be'], x: ['x.com', 'twitter.com'], instagram: ['instagram.com'],
  tiktok: ['tiktok.com'], discord: ['discord.gg', 'discord.com'], twitch: ['twitch.tv'],
  kick: ['kick.com'], github: ['github.com'], spotify: ['spotify.com'], soundcloud: ['soundcloud.com'],
  steam: ['steamcommunity.com', 'steampowered.com'], telegram: ['t.me', 'telegram.me'],
  reddit: ['reddit.com'], snapchat: ['snapchat.com'], linkedin: ['linkedin.com'],
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

const BG_EFFECTS = ['none', 'aurora', 'snow', 'rain', 'blur', 'night', 'tv'];
const NAME_EFFECTS = [
  'none', 'rainbow', 'typewriter', 'glitch', 'scramble',
  'sparkle-white', 'sparkle-blue', 'sparkle-red', 'sparkle-yellow',
];
const PREMIUM_NAME_EFFECTS = [
  'typewriter', 'glitch', 'scramble', 'sparkle-white', 'sparkle-blue', 'sparkle-red', 'sparkle-yellow',
];
const WIDGETS = ['off', 'discord'];
// Hazır fontlar (Google Fonts). Anahtar -> istemcide font ailesi eşlemesi.
const NAME_FONTS = ['default', 'inter', 'space', 'playfair', 'orbitron', 'pixel', 'pacifico', 'bebas', 'custom'];
const LINK_DISPLAY = ['card', 'icon'];

function defaultProfile() {
  return {
    displayName: '',
    description: '',
    location: '',
    avatar: '',
    useDiscordAvatar: false,
    avatarRing: false,
    background: { type: 'color', color: '#0b0c0f', color2: '#2a1d4d', angle: 135, url: '' },
    bgEffect: 'none',
    nameEffect: 'none',
    nameFont: 'default',
    customFont: '',
    widget: 'off',
    effects: { blur: 12, opacity: 0.85 },
    frame: { enabled: false, color: '#000000', opacity: 0.35, blur: 14 },
    glow: { name: false, socials: false, badges: false },
    colors: { accent: '#9d6bff', text: '#f2f2f5', card: '#16181e', icon: '#ffffff' },
    monochromeIcons: false,
    animatedTitle: false,
    boxColors: false,
    soundControl: false,
    entryText: '',
    audio: '',
    clickSound: '',
    cursor: '',
    links: [],
  };
}

const clip = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
const hex = (v, fallback) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fallback);
const num = (v, min, max, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const pick = (v, list, fallback) => (list.includes(v) ? v : fallback);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

function safeUrl(v, protocols = ['https:']) {
  if (typeof v !== 'string' || v.length > 500) return '';
  try {
    const u = new URL(v.trim());
    return protocols.includes(u.protocol) ? u.href : '';
  } catch {
    return '';
  }
}

function sanitizeProfile(input, user) {
  const p = obj(input);
  const bg = obj(p.background);
  const c = obj(p.colors);
  const fx = obj(p.effects);
  const glow = obj(p.glow);
  const premium = hasPremium(user);
  const linkLimit = premium ? 50 : 10;

  let bgType = pick(bg.type, ['color', 'gradient', 'image', 'video'], 'color');
  if (bgType === 'video' && !premium) bgType = 'color';

  let nameEffect = pick(p.nameEffect, NAME_EFFECTS, 'none');
  if (!premium && PREMIUM_NAME_EFFECTS.includes(nameEffect)) nameEffect = 'none';

  let nameFont = pick(p.nameFont, NAME_FONTS, 'default');
  if (!premium && nameFont !== 'default') nameFont = 'default';
  const customFont = premium ? safeUrl(p.customFont) : '';
  if (nameFont === 'custom' && !customFont) nameFont = 'default';

  const links = (Array.isArray(p.links) ? p.links : [])
    .slice(0, linkLimit)
    .map((l) => {
      const item = obj(l);
      const url = safeUrl(item.url, ['http:', 'https:']);
      if (!url) return null;
      return {
        id: clip(item.id, 40) || crypto.randomUUID(),
        title: clip(item.title, 40) || 'Bağlantı',
        url,
        platform: detectPlatform(url),
        enabled: item.enabled !== false,
        display: pick(item.display, LINK_DISPLAY, 'card'),
        icon: safeUrl(item.icon),
      };
    })
    .filter(Boolean);

  return {
    displayName: clip(p.displayName, 32),
    description: clip(p.description, 190),
    location: clip(p.location, 40),
    avatar: safeUrl(p.avatar),
    useDiscordAvatar: p.useDiscordAvatar === true,
    avatarRing: p.avatarRing === true,
    background: {
      type: bgType,
      color: hex(bg.color, '#0b0c0f'),
      color2: hex(bg.color2, '#2a1d4d'),
      angle: num(bg.angle, 0, 360, 135),
      url: bgType === 'image' || bgType === 'video' ? safeUrl(bg.url) : '',
    },
    bgEffect: pick(p.bgEffect, BG_EFFECTS, 'none'),
    nameEffect,
    nameFont,
    customFont,
    widget: pick(p.widget, WIDGETS, 'off'),
    effects: {
      blur: num(fx.blur, 0, 80, 12),
      opacity: num(fx.opacity, 0.2, 1, 0.85),
    },
    frame: {
      enabled: obj(p.frame).enabled === true,
      color: hex(obj(p.frame).color, '#000000'),
      opacity: num(obj(p.frame).opacity, 0, 1, 0.35),
      blur: num(obj(p.frame).blur, 0, 60, 14),
    },
    glow: {
      name: glow.name === true,
      socials: glow.socials === true,
      badges: glow.badges === true,
    },
    colors: {
      accent: hex(c.accent, '#9d6bff'),
      text: hex(c.text, '#f2f2f5'),
      card: hex(c.card, '#16181e'),
      icon: hex(c.icon, '#ffffff'),
    },
    monochromeIcons: p.monochromeIcons === true,
    animatedTitle: p.animatedTitle === true,
    boxColors: p.boxColors === true,
    soundControl: p.soundControl === true,
    entryText: premium ? clip(p.entryText, 30) : '',
    audio: premium ? safeUrl(p.audio) : '',
    clickSound: premium ? safeUrl(p.clickSound) : '',
    cursor: premium ? safeUrl(p.cursor) : '',
    links,
  };
}

// Herkese açık görünüm. E-posta ve sağlayıcı bilgisi asla dışarı çıkmaz.
// Discord ID'si yalnızca Discord widget'ı açıksa gösterilir.
function publicProfile(u) {
  const p = { ...defaultProfile(), ...(u.profile || {}) };
  const discord = u.provider === 'discord';
  const useDiscordAvatar = p.useDiscordAvatar === true && discord && Boolean(u.avatar);
  return {
    username: u.username,
    avatar: useDiscordAvatar ? u.avatar : (p.avatar || u.avatar || ''),
    badges: resolveBadges(effectiveBadges(u), db.read().badgeDefs || {}),
    premium: hasPremium(u),
    discordId: discord && p.widget === 'discord' ? u.id.split(':')[1] : '',
    profile: { ...p, displayName: p.displayName || u.username },
  };
}

module.exports = {
  RESERVED, USERNAME_RE, validUsername, detectPlatform,
  BG_EFFECTS, NAME_EFFECTS, PREMIUM_NAME_EFFECTS, NAME_FONTS, LINK_DISPLAY,
  defaultProfile, sanitizeProfile, publicProfile,
};

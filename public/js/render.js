// Ortak profil render motoru.
// Public profil sayfası ve panelin canlı önizlemesi bu dosyayı kullanır.
// Böylece iki görünüm her zaman birebir aynı olur.
(() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  const hex = (v, fallback) => (/^#[0-9a-f]{6}$/i.test(v || '') ? v : fallback);

  // Rozet meta verisi. Sunucudaki roles.js ile aynı tutulmalı.
  const BADGES = {
    owner: { label: 'Owner', icon: '♛', color: '#ff5d7a' },
    admin: { label: 'Admin', icon: '◆', color: '#ffb547' },
    mod: { label: 'Moderatör', icon: '⚒', color: '#5ce1ff' },
    verified: { label: 'Doğrulanmış', icon: '✓', color: '#7ee787' },
    early: { label: 'Erken Kullanıcı', icon: '✦', color: '#9fd8ff' },
    supporter: { label: 'Destekçi', icon: '♥', color: '#ff8fc7' },
    premium: { label: 'Premium', icon: '◇', color: '#b48cff' },
  };

  // Platform renkleri ve etiketleri. Sunucudaki detectPlatform ile eşleşir.
  const PLATFORMS = {
    youtube: ['#ff3b3b', 'YouTube'], x: ['#e7e9ea', 'X'], instagram: ['#e1306c', 'Instagram'],
    tiktok: ['#25f4ee', 'TikTok'], discord: ['#5865f2', 'Discord'], twitch: ['#9146ff', 'Twitch'],
    kick: ['#53fc18', 'Kick'], github: ['#c9d1d9', 'GitHub'], spotify: ['#1ed760', 'Spotify'],
    soundcloud: ['#ff5500', 'SoundCloud'], steam: ['#66c0f4', 'Steam'], telegram: ['#229ed9', 'Telegram'],
    reddit: ['#ff4500', 'Reddit'], snapchat: ['#fffc00', 'Snapchat'], linkedin: ['#0a66c2', 'LinkedIn'],
    facebook: ['#1877f2', 'Facebook'], web: ['#7fd6ff', 'Web'],
  };

  const badgeHtml = (key) => (BADGES[key]
    ? `<span class="bdg" style="--bc:${BADGES[key].color}">${BADGES[key].icon} ${BADGES[key].label}</span>`
    : '');

  function render(el, data) {
    const p = data.profile || {};
    const bg = p.background || {};
    const c = p.colors || {};
    const fx = p.effects || {};
    const name = p.displayName || data.username || '';

    const links = (p.links || []).filter((l) => l.enabled !== false && /^https?:\/\//i.test(l.url || ''));

    const avatar = data.avatar
      ? `<img src="${esc(data.avatar)}" alt="">`
      : `<span>${esc((name || '?').charAt(0).toUpperCase())}</span>`;

    let bgLayer = '';
    if ((bg.type === 'image' || bg.type === 'video') && bg.url) {
      bgLayer = bg.type === 'video'
        ? `<div class="bg-layer"><video class="bg-media" src="${esc(bg.url)}" autoplay muted loop playsinline></video></div>`
        : `<div class="bg-layer"><div class="bg-media" data-bg="${esc(bg.url)}"></div></div>`;
    }

    const style = [
      `--bgc:${hex(bg.color, '#05070a')}`,
      `--accent:${hex(c.accent, '#7fd6ff')}`,
      `--text:${hex(c.text, '#f2f7fa')}`,
      `--card:${hex(c.card, '#0f161d')}`,
      `--blur:${Number.isFinite(Number(fx.blur)) ? Number(fx.blur) : 12}px`,
      `--opacity:${Number.isFinite(Number(fx.opacity)) ? Number(fx.opacity) : 0.85}`,
    ].join(';');

    const linksHtml = links.map((l, i) => {
      const [col, label] = PLATFORMS[l.platform] || PLATFORMS.web;
      return `<a class="lnk" style="--i:${i};--pf:${col}" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer nofollow">
        <span class="pf">${esc(label.charAt(0))}</span>
        <span class="lt">${esc(l.title)}</span>
        <span class="arrow" aria-hidden="true">↗</span>
      </a>`;
    }).join('');

    el.innerHTML = `
      <div class="stage" style="${style}">
        ${bgLayer}
        <div class="profile">
          <div class="avatar">${avatar}</div>
          <h1 class="name">${esc(name)}</h1>
          <p class="handle">@${esc(data.username)}</p>
          ${(data.badges || []).length ? `<div class="badges">${(data.badges || []).map(badgeHtml).join('')}</div>` : ''}
          ${p.description ? `<p class="desc">${esc(p.description)}</p>` : ''}
          <div class="links">${linksHtml}</div>
        </div>
        <p class="foot-mini">bio.yours</p>
      </div>`;

    // Arka plan görseli URL'sini DOM üzerinden atıyoruz. Böylece CSS tırnak sorunu olmaz.
    const media = el.querySelector('[data-bg]');
    if (media) media.style.backgroundImage = `url("${media.dataset.bg.replace(/"/g, '%22')}")`;
  }

  window.BioRender = { render, badgeHtml, BADGES, esc };
})();

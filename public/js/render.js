// Ortak profil render motoru. Public sayfa ve panel önizlemesi bunu kullanır.
(() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  const hex = (v, fb) => (/^#[0-9a-f]{6}$/i.test(v || '') ? v : fb);
  const num = (v, fb) => (Number.isFinite(Number(v)) ? Number(v) : fb);
  const cssUrl = (u) => `url(${encodeURI(u).replace(/[()'"]/g, (ch) => '%' + ch.charCodeAt(0).toString(16))})`;

  const PLATFORMS = {
    youtube: ['#ff3b3b', 'YouTube'], x: ['#e7e9ea', 'X'], instagram: ['#e1306c', 'Instagram'],
    tiktok: ['#25f4ee', 'TikTok'], discord: ['#5865f2', 'Discord'], twitch: ['#9146ff', 'Twitch'],
    kick: ['#53fc18', 'Kick'], github: ['#c9d1d9', 'GitHub'], spotify: ['#1ed760', 'Spotify'],
    soundcloud: ['#ff5500', 'SoundCloud'], steam: ['#66c0f4', 'Steam'], telegram: ['#229ed9', 'Telegram'],
    reddit: ['#ff4500', 'Reddit'], snapchat: ['#fffc00', 'Snapchat'], linkedin: ['#0a66c2', 'LinkedIn'],
    facebook: ['#1877f2', 'Facebook'], web: ['#9d6bff', 'Web'],
  };

  // Hazır fontlar: anahtar -> [Google Fonts ailesi, yedek]
  const FONTS = {
    inter: ['Inter', 'sans-serif'],
    space: ['Space Grotesk', 'sans-serif'],
    playfair: ['Playfair Display', 'serif'],
    orbitron: ['Orbitron', 'sans-serif'],
    pixel: ['Press Start 2P', 'monospace'],
    pacifico: ['Pacifico', 'cursive'],
    bebas: ['Bebas Neue', 'sans-serif'],
  };

  const SPARK = { 'sparkle-white': '#ffffff', 'sparkle-blue': '#5ce1ff', 'sparkle-red': '#ff5a6b', 'sparkle-yellow': '#ffd84d' };

  let cleanup = [];
  const stopFx = () => { cleanup.forEach((fn) => fn()); cleanup = []; };
  const widgetCache = new Map();
  const loadedFonts = new Set();

  // Premium özel font: @font-face ile bir kez yüklenir
  function customFontFamily(url) {
    const id = Math.abs([...url].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0));
    const family = `BioCustom${id}`;
    if (!loadedFonts.has(family)) {
      loadedFonts.add(family);
      const st = document.createElement('style');
      st.textContent = `@font-face{font-family:'${family}';src:url("${encodeURI(url)}");font-display:swap;}`;
      document.head.appendChild(st);
    }
    return `'${family}', sans-serif`;
  }

  function googleFont(name) {
    const key = `g:${name}`;
    if (!loadedFonts.has(key)) {
      loadedFonts.add(key);
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, '+')}:wght@400;700;800&display=swap`;
      document.head.appendChild(l);
    }
  }

  function nameFontFamily(p) {
    if (p.nameFont === 'custom' && p.customFont) return customFontFamily(p.customFont);
    const f = FONTS[p.nameFont];
    if (!f) return '';
    googleFont(f[0]);
    return `'${f[0]}', ${f[1]}`;
  }

  // Rozet nesnesi: { label, icon, color } (sunucu üretir)
  // Özel amblemler: 24x24 çizgi ikonlar. Anahtarlar roles.js ile aynıdır.
  const EMBLEM_PATHS = {
    crown: '<path d="M3 8l4.5 4L12 6l4.5 6L21 8l-2 10H5L3 8z"/><path d="M5 18.5h14"/>',
    shield: '<path d="M12 3l7 3v5c0 4.6-3 8.2-7 10-4-1.8-7-5.4-7-10V6l7-3z"/><path d="M12 9l2 3-2 3-2-3 2-3z"/>',
    wrench: '<path d="M14.5 4.5a4.5 4.5 0 0 0-4.2 6.1L4.7 17a2 2 0 0 0 2.9 2.9l6.4-5.6A4.5 4.5 0 0 0 19.5 9.5l-2.6 2.6-3.1-.6-.6-3.1 2.6-2.6a4.5 4.5 0 0 0-1.3-1.3z"/>',
    gem: '<path d="M7 4h10l4 5-9 11L3 9z"/><path d="M3 9h18M9.5 4 12 9l2.5-5M12 9v11"/>',
    check: '<path d="M12 2.8l2.2 1.7 2.7-.3.9 2.6 2.4 1.3-.7 2.7.7 2.7-2.4 1.3-.9 2.6-2.7-.3L12 21.2l-2.2-1.7-2.7.3-.9-2.6-2.4-1.3.7-2.7-.7-2.7 2.4-1.3.9-2.6 2.7.3z"/><path d="M8.5 12.2l2.4 2.4 4.6-4.8"/>',
    spark: '<circle cx="12" cy="12" r="2.6"/><path d="M12 3v3.5M12 17.5V21M3 12h3.5M17.5 12H21M5.6 5.6l2.5 2.5M15.9 15.9l2.5 2.5M5.6 18.4l2.5-2.5M15.9 8.1l2.5-2.5"/>',
    sprout: '<path d="M12 21v-9"/><path d="M12 12c0-4-3-6.5-7.5-6.5 0 4.2 3 6.5 7.5 6.5z"/><path d="M12 14.5c0-3.2 2.4-5.4 6.5-5.4 0 3.3-2.4 5.4-6.5 5.4z"/>',
    heart: '<path d="M12 20s-7-4.3-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.7-7 10-7 10z"/>',
    star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 17l-5.3 2.6 1-5.8-4.2-4.1 5.9-.9z"/>',
    code: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
    flask: '<path d="M9.5 3h5M10.5 3v6L5.6 17.6A2 2 0 0 0 7.3 20.5h9.4a2 2 0 0 0 1.7-2.9L13.5 9V3"/><path d="M8 15h8"/>',
    bug: '<rect x="8" y="8" width="8" height="10" rx="4"/><path d="M12 8V5M8 12H4M20 12h-4M8 16l-3 2M16 16l3 2M9.5 5.5 8 4M14.5 5.5 16 4"/>',
    bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6l1-7z"/>',
    eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/>',
  };
  const EMBLEM_KEYS = Object.keys(EMBLEM_PATHS);
  const emblem = (key) => `<span class="emb" aria-hidden="true"><svg viewBox="0 0 24 24">${EMBLEM_PATHS[key] || EMBLEM_PATHS.star}</svg></span>`;

  const badgeHtml = (b) => (b
    ? `<span class="badge-ico" style="--bc:${esc(b.color)}" tabindex="0" aria-label="${esc(b.label)}"><span class="badge-g">${emblem(b.icon)}</span><span class="badge-tip">${esc(b.label)}</span></span>`
    : '');

  function bgMedia(bg, bgEffect, preview) {
    const blur = bgEffect === 'blur' ? ' fx-blur' : '';
    if (bg.type === 'gradient') {
      return `<div class="bg-media" style="background:linear-gradient(${num(bg.angle, 135)}deg,${hex(bg.color, '#9d6bff')},${hex(bg.color2, '#2a1d4d')})"></div>`;
    }
    if (bg.type === 'video' && bg.url) {
      // Yayında video giriş ekranı kalkana kadar durur. Önizlemede hemen oynar.
      return `<video class="bg-media${blur}" src="${esc(bg.url)}" ${preview ? 'autoplay' : ''} muted loop playsinline preload="metadata"></video>`;
    }
    if (bg.type === 'image' && bg.url) {
      return `<div class="bg-media${blur}" data-bg="${esc(bg.url)}"></div>`;
    }
    return '';
  }

  function fxLayer(kind) {
    switch (kind) {
      case 'aurora': return '<div class="fx fx-aurora"></div>';
      case 'snow':
      case 'rain': return `<canvas class="fx fx-canvas" data-fx="${kind}"></canvas>`;
      case 'night': return '<div class="fx fx-night"></div>';
      case 'tv': return '<div class="fx fx-tv"></div>';
      default: return '';
    }
  }

  function nameHtml(name, p, glow) {
    const fx = p.nameEffect || 'none';
    const cls = ['name'];
    if (fx !== 'none') cls.push(fx.startsWith('sparkle') ? 'nfx-sparkle' : `nfx-${fx}`);
    if (glow.name) cls.push('glow-name');
    if (p.animatedTitle) cls.push('anim-title');
    const style = [
      fx === 'typewriter' ? `--n:${[...name].length}` : '',
      SPARK[fx] ? `--sc:${SPARK[fx]}` : '',
    ].filter(Boolean).join(';');
    return `<h1 class="${cls.join(' ')}" style="${style}" data-text="${esc(name)}">${esc(name)}</h1>`;
  }

  // Bağlantı ikonu: özel görsel varsa o, yoksa platformun harfi
  const iconInner = (l, label) => (l.icon
    ? `<img src="${esc(l.icon)}" alt="" draggable="false">`
    : esc(label.charAt(0)));

  const fmt = (n) => Number(n).toLocaleString('tr-TR');

  // Sayaç 0'dan hedefe yumuşakça sayar
  function countUp(node, to) {
    const start = performance.now();
    const dur = 900;
    let raf = 0;
    const tick = (t) => {
      const k = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      node.textContent = fmt(Math.round(to * eased));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    cleanup.push(() => cancelAnimationFrame(raf));
  }

  function render(el, data) {
    stopFx();
    const p = data.profile || {};
    const bg = p.background || {};
    const c = p.colors || {};
    const fx = p.effects || {};
    const glow = p.glow || {};
    const fr = p.frame || {};
    const frameStyle = `--fr:${hex(fr.color, '#000000')};--fo:${num(fr.opacity, 0.35)};--fb:${num(fr.blur, 14)}px`;
    const name = p.displayName || data.username || '';
    const usable = (p.links || []).filter((l) => l.enabled !== false && /^https?:\/\//i.test(l.url || ''));
    const cards = usable.filter((l) => l.display !== 'icon');
    const icons = usable.filter((l) => l.display === 'icon');

    const family = nameFontFamily(p);
    const style = [
      `--bgc:${hex(bg.color, '#0b0c0f')}`,
      `--accent:${hex(c.accent, '#9d6bff')}`,
      `--text:${hex(c.text, '#f2f2f5')}`,
      `--card:${hex(c.card, '#16181e')}`,
      `--icon:${hex(c.icon, '#ffffff')}`,
      `--blur:${num(fx.blur, 12)}px`,
      `--opacity:${num(fx.opacity, 0.85)}`,
      family ? `--nfont:${family}` : '',
      p.cursor ? `--cursor:${cssUrl(p.cursor)} 0 0, auto` : '',
    ].filter(Boolean).join(';');

    const avatarInner = data.avatar
      ? `<img src="${esc(data.avatar)}" alt="">`
      : `<span>${esc((name || '?').charAt(0).toUpperCase())}</span>`;

    const badges = (data.badges || []).map(badgeHtml).join('');

    const widget = p.widget === 'discord' && data.discordId
      ? `<div class="widget" data-widget data-id="${esc(data.discordId)}"><span class="dot"></span><span>Durum yükleniyor…</span></div>`
      : '';

    const audio = p.audio ? `<audio src="${esc(p.audio)}" loop preload="auto"></audio>` : '';
    const soundBtn = p.audio && p.soundControl
      ? '<button class="sound-btn" type="button" aria-label="Sesi aç veya kapat">♪</button>'
      : '';

    const cardsHtml = cards.map((l, i) => {
      const [col, label] = PLATFORMS[l.platform] || PLATFORMS.web;
      const cls = ['lnk', p.boxColors ? 'boxed' : '', glow.socials ? 'glow-social' : ''].filter(Boolean).join(' ');
      const pfCls = ['pf', p.monochromeIcons ? 'mono' : ''].filter(Boolean).join(' ');
      return `<a class="${cls}" style="--i:${i};--pf:${col}" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer nofollow">
        <span class="${pfCls}">${iconInner(l, label)}</span>
        <span class="lt">${esc(l.title)}</span>
        <span class="arrow" aria-hidden="true">↗</span>
      </a>`;
    }).join('');

    const iconsHtml = icons.length
      ? `<div class="icons">${icons.map((l, i) => {
          const [col, label] = PLATFORMS[l.platform] || PLATFORMS.web;
          const pfCls = ['ico', p.monochromeIcons ? 'mono' : ''].filter(Boolean).join(' ');
          return `<a class="${pfCls}" style="--i:${i};--pf:${col}" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer nofollow" title="${esc(l.title)}" aria-label="${esc(l.title)}">${iconInner(l, label)}</a>`;
        }).join('')}</div>`
      : '';

    // Giriş ekranı: yalnızca yayındaki sayfada (önizlemede değil)
    const entry = data.preview
      ? ''
      : `<div class="enter" id="bioEnter"><button class="enter-btn" type="button">${esc(p.entryText || 'Click to enter')}</button></div>`;

    el.innerHTML = `
      <div class="stage${p.cursor ? ' has-cursor' : ''}" style="${style}">
        <div class="bg-layer">${bgMedia(bg, p.bgEffect, data.preview)}${fxLayer(p.bgEffect)}</div>
        <div class="profile${fr.enabled === true ? ' framed' : ''}" style="${fr.enabled === true ? frameStyle : ''}">
          <div class="avatar${p.avatarRing ? ' ring' : ''}">${avatarInner}</div>
          ${nameHtml(name, p, glow)}
          <p class="handle">@${esc(data.username)}</p>
          ${p.location ? `<p class="loc">${esc(p.location)}</p>` : ''}
          ${badges ? `<div class="badges${glow.badges ? ' glow-badge' : ''}">${badges}</div>` : ''}
          ${p.description ? `<p class="desc">${esc(p.description)}</p>` : ''}
          ${widget}
          <div class="links">${cardsHtml}</div>
          ${iconsHtml}
        </div>
        ${data.views !== undefined && p.showViews !== false
          ? `<div class="views" aria-label="Görüntülenme sayısı"><span class="views-ico">${emblem('eye')}</span><span class="views-n">${fmt(data.views)}</span></div>`
          : ''}
        <p class="foot-mini">bio.yours</p>
        ${soundBtn}
        ${audio}
        ${entry}
      </div>`;

    wire(el, { ...data, name }, p);
  }

  function wire(el, data, p) {
    const media = el.querySelector('[data-bg]');
    if (media) media.style.backgroundImage = `url("${media.dataset.bg.replace(/"/g, '%22')}")`;

    el.querySelectorAll('canvas[data-fx]').forEach((c) => startParticles(c, c.dataset.fx));

    const name = el.querySelector('.name');
    if (name) startNameFx(name, p.nameEffect, data.name);
    // Premium daktilo: sekme başlığında da yazılır
    if (!data.preview && p.nameEffect === 'typewriter' && data.premium) titleTypewriter(data.name);

    // Özel imleç: görsel olarak imlecin yerine çizilir (CORS ve .cur desteğinden bağımsız)
    if (p.cursor && !data.preview) {
      const stage = el.querySelector('.stage');
      const img = new Image();
      img.className = 'fx-cursor';
      img.alt = '';
      img.onload = () => {
        stage.appendChild(img);
        stage.classList.add('cursor-follow');
        const move = (e) => {
          img.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
          img.classList.add('on');
        };
        stage.addEventListener('pointermove', move);
        cleanup.push(() => stage.removeEventListener('pointermove', move));
      };
      img.src = p.cursor;
    }

    const vn = el.querySelector('.views-n');
    if (vn && !data.preview) countUp(vn, data.views);

    const w = el.querySelector('[data-widget]');
    if (w) loadWidget(w, w.dataset.id);

    const audio = el.querySelector('audio');
    const enter = el.querySelector('#bioEnter');

    if (!data.preview) {
      // Tıklama sesi: sayfanın herhangi bir yerine tıklanınca (premium)
      if (p.clickSound) {
        const onDown = () => {
          const s = new Audio(p.clickSound);
          s.volume = 0.5;
          s.play().catch(() => {});
        };
        window.addEventListener('pointerdown', onDown);
        cleanup.push(() => window.removeEventListener('pointerdown', onDown));
      }
    }

    if (enter) {
      enter.querySelector('button').onclick = () => {
        enter.remove();
        if (audio) audio.play().catch(() => {});
        el.querySelectorAll('video.bg-media').forEach((v) => v.play().catch(() => {}));
      };
    } else if (audio) {
      wireAudio(el, audio, p.soundControl === true, data.preview === true);
    }
    // Giriş ekranı kalkınca ses kontrolü de çalışsın
    if (enter && audio) wireAudio(el, audio, p.soundControl === true, false, true);
  }

  function startParticles(canvas, kind) {
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.clientWidth || 360;
    canvas.height = canvas.clientHeight || 640;
    const snow = kind === 'snow';
    const ps = Array.from({ length: snow ? 70 : 110 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 2 + 1,
      v: snow ? Math.random() * 0.8 + 0.3 : Math.random() * 6 + 6,
      d: Math.random() * Math.PI * 2,
    }));
    let raf = 0;
    const tick = () => {
      if (!canvas.isConnected) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = snow ? 'rgba(255,255,255,.85)' : 'rgba(170,200,255,.55)';
      for (const p of ps) {
        p.y += p.v;
        p.d += 0.01;
        p.x += snow ? Math.sin(p.d) * 0.6 : -1.2;
        if (p.y > canvas.height) { p.y = -10; p.x = Math.random() * canvas.width; }
        if (p.x < -5) p.x = canvas.width + 5;
        if (snow) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(p.x, p.y, 1, p.r * 4);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    cleanup.push(() => cancelAnimationFrame(raf));
  }

  const POOL = '!<>-_\\/[]{}=+*^?#ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  // Sekme başlığında daktilo: sayfa açıkken başlığı yazar, kapanınca eski başlığı geri koyar
  function titleTypewriter(text) {
    const prev = document.title;
    const chars = [...text];
    let i = 0;
    let dir = 1;
    let hold = 0;
    const id = setInterval(() => {
      if (hold > 0) { hold -= 1; return; }
      i += dir;
      if (i >= chars.length) { i = chars.length; dir = -1; hold = 24; }
      else if (i <= 0) { i = 0; dir = 1; hold = 10; }
      document.title = `${chars.slice(0, i).join('')}|`;
    }, 110);
    cleanup.push(() => { clearInterval(id); document.title = prev; });
  }

  // İsim efektleri. Rainbow ve glitch CSS ile çalışır, diğerleri burada.
  function startNameFx(node, kind, text) {
    if (!kind || kind === 'none') return;
    if (kind === 'typewriter') return typewriter(node, text);
    if (kind === 'scramble') return scramble(node, text);
    if (kind.startsWith('sparkle')) return sparkle(node);
  }

  function typewriter(node, text) {
    const chars = [...text];
    node.classList.add('nfx-typewriter');
    node.innerHTML = '<span class="tw"></span><span class="tw-caret" aria-hidden="true"></span>';
    const span = node.querySelector('.tw');
    let i = 0;
    let dir = 1;
    let hold = 0;
    const id = setInterval(() => {
      if (hold > 0) { hold -= 1; return; }
      i += dir;
      if (i >= chars.length) { i = chars.length; dir = -1; hold = 24; }
      else if (i <= 0) { i = 0; dir = 1; hold = 10; }
      span.textContent = chars.slice(0, i).join('');
    }, 95);
    cleanup.push(() => clearInterval(id));
  }

  function scramble(node, text) {
    const chars = [...text];
    const frames = chars.length * 2 + 10;
    const run = () => {
      let f = 0;
      const id = setInterval(() => {
        f += 1;
        node.textContent = chars.map((c, i) => (c === ' ' || f > i * 2 + 5
          ? c
          : POOL[Math.floor(Math.random() * POOL.length)])).join('');
        if (f >= frames) {
          clearInterval(id);
          node.textContent = text;
        }
      }, 42);
      cleanup.push(() => clearInterval(id));
    };
    run();
    const loop = setInterval(run, frames * 42 + 3500);
    cleanup.push(() => clearInterval(loop));
  }

  function sparkle(host) {
    const color = host.style.getPropertyValue('--sc') || '#ffffff';
    const id = setInterval(() => {
      const s = document.createElement('i');
      const size = 3 + Math.random() * 5;
      s.className = 'spark';
      s.style.left = `${4 + Math.random() * 92}%`;
      s.style.top = `${10 + Math.random() * 80}%`;
      s.style.width = `${size}px`;
      s.style.height = `${size}px`;
      s.style.setProperty('--sc', color);
      host.appendChild(s);
      setTimeout(() => s.remove(), 1000);
    }, 140);
    cleanup.push(() => clearInterval(id));
  }

  const discordLabels = { online: 'Çevrimiçi', idle: 'Boşta', dnd: 'Rahatsız etmeyin', offline: 'Çevrimdışı' };

  async function loadWidget(node, id) {
    if (!id) return;
    if (!widgetCache.has(id)) {
      try {
        const r = await fetch(`https://api.lanyard.rest/v1/users/${encodeURIComponent(id)}`);
        const j = await r.json();
        widgetCache.set(id, j.success ? j.data : null);
      } catch {
        widgetCache.set(id, null);
      }
    }
    if (!node.isConnected) return;
    const d = widgetCache.get(id);
    if (!d) {
      node.innerHTML = '<span class="dot"></span><span>Discord durumu alınamadı</span>';
      return;
    }
    const act = (d.activities || []).find((a) => a.type === 0);
    node.innerHTML = `<span class="dot ${esc(d.discord_status)}"></span>
      <span><b>${esc(discordLabels[d.discord_status] || 'Çevrimdışı')}</b>${act ? ` · ${esc(act.name)}` : ''}</span>`;
  }

  // skipPlay: giriş ekranından sonra çağrılır, sesi yeniden başlatmaz
  function wireAudio(el, audio, soundControl, preview, afterEnter = false) {
    audio.volume = 0.6;
    const btn = el.querySelector('.sound-btn');
    const setIcon = () => { if (btn) btn.textContent = audio.paused ? '♪' : '❚❚'; };
    const play = () => audio.play().then(setIcon).catch(() => {});
    if (btn) {
      btn.onclick = () => {
        if (audio.paused) play();
        else { audio.pause(); setIcon(); }
      };
    }
    setIcon();
    if (!preview && !soundControl && !afterEnter) {
      const first = () => { play(); };
      window.addEventListener('pointerdown', first, { once: true });
      cleanup.push(() => window.removeEventListener('pointerdown', first));
    }
  }

  window.BioRender = { render, badgeHtml, esc, emblem, EMBLEM_KEYS };
})();

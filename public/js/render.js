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
  const badgeHtml = (b) => (b
    ? `<span class="bdg" style="--bc:${esc(b.color)}" title="${esc(b.label)}">${esc(b.icon || '')} ${esc(b.label)}</span>`
    : '');

  function bgMedia(bg, bgEffect) {
    const blur = bgEffect === 'blur' ? ' fx-blur' : '';
    if (bg.type === 'gradient') {
      return `<div class="bg-media" style="background:linear-gradient(${num(bg.angle, 135)}deg,${hex(bg.color, '#9d6bff')},${hex(bg.color2, '#2a1d4d')})"></div>`;
    }
    if (bg.type === 'video' && bg.url) {
      return `<video class="bg-media${blur}" src="${esc(bg.url)}" autoplay muted loop playsinline></video>`;
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

  function render(el, data) {
    stopFx();
    const p = data.profile || {};
    const bg = p.background || {};
    const c = p.colors || {};
    const fx = p.effects || {};
    const glow = p.glow || {};
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
        <span class="${pfCls}">${esc(label.charAt(0))}</span>
        <span class="lt">${esc(l.title)}</span>
        <span class="arrow" aria-hidden="true">↗</span>
      </a>`;
    }).join('');

    const iconsHtml = icons.length
      ? `<div class="icons">${icons.map((l, i) => {
          const [col, label] = PLATFORMS[l.platform] || PLATFORMS.web;
          const pfCls = ['ico', p.monochromeIcons ? 'mono' : ''].filter(Boolean).join(' ');
          return `<a class="${pfCls}" style="--i:${i};--pf:${col}" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer nofollow" title="${esc(l.title)}" aria-label="${esc(l.title)}">${esc(label.charAt(0))}</a>`;
        }).join('')}</div>`
      : '';

    // Giriş ekranı: yalnızca yayındaki sayfada (önizlemede değil)
    const entry = data.preview
      ? ''
      : `<div class="enter" id="bioEnter"><button class="enter-btn" type="button">${esc(p.entryText || 'Click to enter')}</button></div>`;

    el.innerHTML = `
      <div class="stage" style="${style}">
        <div class="bg-layer">${bgMedia(bg, p.bgEffect)}${fxLayer(p.bgEffect)}</div>
        <div class="profile">
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
    if (name && p.nameEffect === 'scramble') startScramble(name, data.name);
    if (name && (p.nameEffect || '').startsWith('sparkle')) startSparkle(name);

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

  function startScramble(node, text) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const run = () => {
      let frame = 0;
      const total = 20;
      const id = setInterval(() => {
        frame += 1;
        node.textContent = [...text].map((ch, i) => (ch === ' ' || i < (frame / total) * text.length
          ? ch
          : chars[Math.floor(Math.random() * chars.length)])).join('');
        if (frame >= total) {
          clearInterval(id);
          node.textContent = text;
        }
      }, 60);
      cleanup.push(() => clearInterval(id));
    };
    run();
    const loop = setInterval(run, 4500);
    cleanup.push(() => clearInterval(loop));
  }

  function startSparkle(host) {
    const color = host.style.getPropertyValue('--sc') || '#ffffff';
    const id = setInterval(() => {
      const s = document.createElement('i');
      s.className = 'spark';
      s.style.left = `${Math.random() * 100}%`;
      s.style.top = `${Math.random() * 100}%`;
      s.style.setProperty('--sc', color);
      host.appendChild(s);
      setTimeout(() => s.remove(), 900);
    }, 180);
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

  window.BioRender = { render, badgeHtml, esc };
})();

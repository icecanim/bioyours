// Panel mantığı: yüklemeler, efektler, anahtarlar, bağlantılar, önizleme ve kayıt.
import { upload } from './vendor/blob-client.js';

let currentUsername = '';
(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const { render, badgeHtml, esc } = window.BioRender;

  const NFX_PREMIUM = ['typewriter', 'glitch', 'scramble', 'sparkle-white', 'sparkle-blue', 'sparkle-red', 'sparkle-yellow'];

  const MIME = {
    cur: 'image/x-icon', ico: 'image/x-icon', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', webm: 'video/webm',
    mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac',
    woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf',
  };

  const toast = (msg, bad = false) => {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast' + (bad ? ' bad' : '');
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => (t.hidden = true), 3000);
  };

  async function api(url, method = 'GET', body) {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'İşlem başarısız');
    return data;
  }

  // Dosya türü: tarayıcı boş bırakabilir (.cur, .m4a gibi), uzantıdan tahmin edilir
  function mimeFor(file) {
    if (file.type) return file.type;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    return MIME[ext] || '';
  }

  // Dosya doğrudan Vercel Blob'a gider. Sunucu yalnızca yükleme izni verir.
  async function uploadFile(kind, file) {
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
    const blob = await upload(`${kind}/${currentUsername}.${ext}`, file, {
      access: 'public',
      handleUploadUrl: '/api/blob/upload',
      contentType: mimeFor(file),
    });
    return blob.url;
  }

  const get = (o, path) => path.split('.').reduce((a, k) => a?.[k], o);
  const put = (o, path, value) => {
    const keys = path.split('.');
    const last = keys.pop();
    keys.reduce((a, k) => a[k], o)[last] = value;
  };
  const extOf = (url) => {
    const m = (url || '').split('?')[0].split('.').pop() || '';
    return m.length <= 4 ? m.toUpperCase() : '';
  };

  function claim() {
    const want = (sessionStorage.getItem('bio_want') || '').replace(/[^a-z0-9_.]/g, '').slice(0, 20);
    sessionStorage.removeItem('bio_want');
    $('#claimName').value = want;
    $('#claim').hidden = false;
    $('#claimName').focus();
    $('#claimForm').onsubmit = async (e) => {
      e.preventDefault();
      $('#claimErr').textContent = '';
      try {
        await api('/api/username', 'POST', { username: $('#claimName').value.trim().toLowerCase() });
        location.reload();
      } catch (err) {
        $('#claimErr').textContent = err.message;
      }
    };
  }

  function editor(user, pub) {
    const premium = Boolean(user.premium) || ['owner', 'admin'].includes(user.role);
    const LINK_LIMIT = premium ? 50 : 10;
    const discordId = user.provider === 'discord' ? user.id.split(':')[1] : '';
    const draft = structuredClone(pub.profile);
    let savedSnap = JSON.stringify(draft);

    const avatarNow = () => (draft.useDiscordAvatar ? user.avatar : (draft.avatar || user.avatar));
    const preview = () => render($('#preview'), {
      username: user.username,
      avatar: avatarNow(),
      badges: pub.badges,
      discordId,
      profile: draft,
      preview: true,
    });

    function touch() {
      sync();
      preview();
      $('#dirty').hidden = JSON.stringify(draft) === savedSnap;
    }

    function setThumb(node, url, kind) {
      if (!url) {
        node.innerHTML = kind === 'audio' ? '' : '<div class="up-empty">Yüklemek için tıkla</div>';
        return;
      }
      if (kind === 'video') node.innerHTML = `<video src="${esc(url)}" muted loop autoplay playsinline></video>`;
      else node.innerHTML = `<img src="${esc(url)}" alt="">`;
    }

    function setTag(node, url) {
      node.textContent = extOf(url);
      node.hidden = !url;
    }

    function sync() {
      // Form alanları (aktif alan hariç, imleç zıplamasın)
      $$('[data-k]').forEach((el) => {
        if (document.activeElement !== el) el.value = get(draft, el.dataset.k) ?? '';
      });

      $$('[data-toggle]').forEach((b) => b.setAttribute('aria-checked', String(draft[b.dataset.toggle] === true)));
      $$('[data-glow]').forEach((b) => b.classList.toggle('on', draft.glow[b.dataset.glow] === true));
      $$('[data-nfx]').forEach((b) => {
        b.classList.toggle('on', draft.nameEffect === b.dataset.nfx);
        b.classList.toggle('locked', !premium && NFX_PREMIUM.includes(b.dataset.nfx));
      });

      const grad = draft.background.type === 'gradient';
      $('#gradBtn').classList.toggle('active', grad);
      $('#gradBtn').textContent = grad ? 'Profil gradyanını kapat' : 'Profil gradyanını aç';
      $('#gradRow').hidden = !grad;
      $('#angleVal').textContent = `${draft.background.angle}°`;

      const op = Math.round(draft.effects.opacity * 100);
      $('#opacity').value = op;
      $('#opacity').style.setProperty('--fill', `${((op - 20) / 80) * 100}%`);
      $('#opVal').textContent = `${op}%`;
      $('#blur').value = draft.effects.blur;
      $('#blur').style.setProperty('--fill', `${(draft.effects.blur / 80) * 100}%`);
      $('#blurVal').textContent = `${draft.effects.blur}px`;
      $('#descCount').textContent = `${draft.description.length}/190`;
      $('#linkCount').textContent = `${draft.links.length}/${LINK_LIMIT}`;
      $('#addLink').disabled = draft.links.length >= LINK_LIMIT;
      $('#liveUrl').textContent = `bio.yours/${user.username}`;

      // Yükleyiciler
      const bgIsMedia = draft.background.type === 'image' || draft.background.type === 'video';
      const bgUrl = bgIsMedia ? draft.background.url : '';
      setThumb($('#bgThumb'), bgUrl, draft.background.type);
      setTag($('#bgTag'), bgUrl);
      $('#bgRemove').hidden = !bgUrl;

      $('#auName').textContent = draft.audio ? '♪ Ses yüklü' : '♪ Ses yüklemek için tıkla';
      $('#audioRemove').hidden = !draft.audio;

      setThumb($('#avThumb'), draft.avatar, 'image');
      setTag($('#avTag'), draft.avatar);
      $('#avRemove').hidden = !draft.avatar;

      setThumb($('#cuThumb'), draft.cursor, 'image');
      setTag($('#cuTag'), draft.cursor);
      $('#cursorRemove').hidden = !draft.cursor;

      $('#fontName').textContent = draft.customFont ? 'Özel font yüklü' : 'Aa — .woff2, .ttf, .otf yükle';
      $('#fontTag').textContent = extOf(draft.customFont);
      $('#fontTag').hidden = !draft.customFont;
      $('#fontRemove').hidden = !draft.customFont;
      $('#clickName').textContent = draft.clickSound ? '♪ Tıklama sesi yüklü' : '♪ Her tıklamada çalacak ses';
      $('#clickRemove').hidden = !draft.clickSound;
      $('#premiumStrip').hidden = premium;
    }

    // ---- metin, renk, seçim kutuları (data-k) ----
    $$('[data-k]').forEach((el) => {
      el.addEventListener('input', () => {
        put(draft, el.dataset.k, el.type === 'range' ? Number(el.value) : el.value);
        touch();
      });
    });

    $('#opacity').addEventListener('input', (e) => {
      draft.effects.opacity = Number(e.target.value) / 100;
      touch();
    });
    $('#blur').addEventListener('input', (e) => {
      draft.effects.blur = Number(e.target.value);
      touch();
    });

    // ---- anahtarlar ----
    $$('[data-toggle]').forEach((b) => {
      b.onclick = () => {
        const k = b.dataset.toggle;
        draft[k] = draft[k] !== true;
        touch();
      };
    });
    $$('[data-glow]').forEach((b) => {
      b.onclick = () => {
        const k = b.dataset.glow;
        draft.glow[k] = draft.glow[k] !== true;
        touch();
      };
    });

    // ---- kullanıcı adı efektleri ----
    $$('[data-nfx]').forEach((b) => {
      b.onclick = () => {
        const v = b.dataset.nfx;
        if (!premium && NFX_PREMIUM.includes(v)) return toast('Bu efekt Premium ile açılır', true);
        draft.nameEffect = v;
        touch();
      };
    });

    // ---- profil gradyanı ----
    $('#gradBtn').onclick = () => {
      const grad = draft.background.type === 'gradient';
      draft.background.type = grad ? 'color' : 'gradient';
      if (!grad) draft.background.url = '';
      touch();
    };

    // ---- dosya yükleyiciler ----
    async function guarded(file, kind, apply, okText) {
      try {
        toast('Yükleniyor…');
        apply(await uploadFile(kind, file));
        touch();
        toast(`${okText}. Kaydetmeyi unutma.`);
      } catch (err) {
        toast(err.message, true);
      }
    }

    const pick = (id) => $(id).files[0];
    const reset = (id) => { $(id).value = ''; };

    $('#bgFile').onchange = () => {
      const f = pick('#bgFile');
      reset('#bgFile');
      if (!f) return;
      const isVideo = (f.type || '').startsWith('video/') || /\.(mp4|webm)$/i.test(f.name);
      if (isVideo && !premium) return toast('Video arka plan Premium ile açılır', true);
      guarded(f, 'background', (url) => {
        draft.background.url = url;
        draft.background.type = isVideo ? 'video' : 'image';
      }, 'Arka plan yüklendi');
    };

    $('#audioFile').onchange = () => {
      const f = pick('#audioFile');
      reset('#audioFile');
      if (!f) return;
      if (!premium) return toast('Ses yükleme Premium ile açılır', true);
      guarded(f, 'audio', (url) => { draft.audio = url; }, 'Ses yüklendi');
    };

    $('#avatarFile').onchange = () => {
      const f = pick('#avatarFile');
      reset('#avatarFile');
      if (!f) return;
      guarded(f, 'avatar', (url) => {
        draft.avatar = url;
        draft.useDiscordAvatar = false;
      }, 'Fotoğraf yüklendi');
    };

    $('#cursorFile').onchange = () => {
      const f = pick('#cursorFile');
      reset('#cursorFile');
      if (!f) return;
      if (!premium) return toast('Özel imleç Premium ile açılır', true);
      guarded(f, 'cursor', (url) => { draft.cursor = url; }, 'İmleç yüklendi');
    };

    $('#bgRemove').onclick = () => {
      draft.background.url = '';
      draft.background.type = 'color';
      touch();
    };
    $('#audioRemove').onclick = () => { draft.audio = ''; touch(); };
    $('#avRemove').onclick = () => { draft.avatar = ''; touch(); };
    $('#cursorRemove').onclick = () => { draft.cursor = ''; touch(); };

    // Özel font (premium)
    $('#fontFile').onchange = () => {
      const f = pick('#fontFile');
      reset('#fontFile');
      if (!f) return;
      if (!premium) return toast('Özel font Premium ile açılır', true);
      guarded(f, 'font', (url) => { draft.customFont = url; draft.nameFont = 'custom'; }, 'Font yüklendi');
    };
    $('#fontRemove').onclick = () => {
      draft.customFont = '';
      if (draft.nameFont === 'custom') draft.nameFont = 'default';
      touch();
    };

    // Tıklama sesi (premium)
    $('#clickFile').onchange = () => {
      const f = pick('#clickFile');
      reset('#clickFile');
      if (!f) return;
      if (!premium) return toast('Tıklama sesi Premium ile açılır', true);
      guarded(f, 'click', (url) => { draft.clickSound = url; }, 'Tıklama sesi yüklendi');
    };
    $('#clickRemove').onclick = () => { draft.clickSound = ''; touch(); };

    // ---- bağlantılar ----
    const renderLinks = () => {
      $('#linkList').innerHTML = draft.links.map((l, i) => `
        <div class="link-row${l.enabled === false ? ' off' : ''}" data-i="${i}">
          ${l.icon ? `<img class="li-thumb" src="${esc(l.icon)}" alt="">` : '<span class="li-thumb">✦</span>'}
          <div class="lr-main">
            <input type="text" data-f="title" maxlength="40" placeholder="Başlık" value="${esc(l.title)}" aria-label="Bağlantı başlığı">
            <input type="text" data-f="url" placeholder="https://..." value="${esc(l.url)}" aria-label="Bağlantı adresi">
            <select data-f="display" aria-label="Görünüm">
              <option value="card" ${l.display !== 'icon' ? 'selected' : ''}>Kart olarak göster</option>
              <option value="icon" ${l.display === 'icon' ? 'selected' : ''}>Sadece ikon (gizli kart)</option>
            </select>
          </div>
          <div class="lr-actions">
            <button class="chip" data-act="icon">${l.icon ? 'İkonu değiştir' : 'İkon yükle'}</button>
            ${l.icon ? '<button class="chip" data-act="iconrm">İkonu kaldır</button>' : ''}
            <button class="chip" data-act="toggle">${l.enabled === false ? 'Gizli' : 'Açık'}</button>
            <button class="chip" data-act="up" ${i === 0 ? 'disabled' : ''} aria-label="Yukarı taşı">↑</button>
            <button class="chip" data-act="down" ${i === draft.links.length - 1 ? 'disabled' : ''} aria-label="Aşağı taşı">↓</button>
            <button class="chip danger" data-act="del" aria-label="Sil">✕</button>
          </div>
        </div>`).join('') || '<p class="muted small">Henüz bağlantın yok. "Bağlantı ekle" ile başla.</p>';
    };

    let pendingIcon = -1;
    const linkEdit = (e) => {
      const row = e.target.closest('.link-row');
      if (!row || !e.target.dataset.f) return;
      draft.links[Number(row.dataset.i)][e.target.dataset.f] = e.target.value;
      touch();
    };
    $('#linkList').addEventListener('input', linkEdit);
    $('#linkList').addEventListener('change', linkEdit);

    $('#linkList').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn || btn.disabled) return;
      const i = Number(btn.closest('.link-row').dataset.i);
      const L = draft.links;
      switch (btn.dataset.act) {
        case 'del': L.splice(i, 1); break;
        case 'up': if (i > 0) [L[i - 1], L[i]] = [L[i], L[i - 1]]; break;
        case 'down': if (i < L.length - 1) [L[i + 1], L[i]] = [L[i], L[i + 1]]; break;
        case 'toggle': L[i].enabled = L[i].enabled === false; break;
        case 'icon':
          pendingIcon = i;
          $('#linkIconFile').click();
          return;
        case 'iconrm': L[i].icon = ''; break;
      }
      renderLinks();
      touch();
    });

    $('#addLink').onclick = () => {
      if (draft.links.length >= LINK_LIMIT) return toast(`Bu pakette en fazla ${LINK_LIMIT} bağlantı var`, true);
      draft.links.push({ id: '', title: 'Yeni bağlantı', url: 'https://', platform: 'web', enabled: true });
      renderLinks();
      touch();
      $$('#linkList .link-row:last-child input[data-f=url]')[0]?.focus();
    };

    $('#linkIconFile').onchange = () => {
      const f = $('#linkIconFile').files[0];
      $('#linkIconFile').value = '';
      if (!f || pendingIcon < 0) return;
      const idx = pendingIcon;
      pendingIcon = -1;
      guarded(f, 'icon', (url) => {
        draft.links[idx].icon = url;
        renderLinks();
      }, 'İkon yüklendi');
    };

    // ---- kaydet ----
    $('#save').onclick = async () => {
      const bad = draft.links.find((l) => !/^https?:\/\//i.test(l.url));
      if (bad) return toast(`"${bad.title}" bağlantısı http:// veya https:// ile başlamalı`, true);
      const btn = $('#save');
      btn.disabled = true;
      btn.textContent = 'Kaydediliyor…';
      try {
        const { profile: saved } = await api('/api/profile', 'PUT', draft);
        Object.assign(draft, saved);
        savedSnap = JSON.stringify(draft);
        renderLinks();
        touch();
        toast('Kaydedildi ✓');
      } catch (err) {
        toast(err.message, true);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Kaydet';
      }
    };

    window.addEventListener('beforeunload', (e) => {
      if (JSON.stringify(draft) !== savedSnap) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    $('#viewLink').href = `/${user.username}`;

    // Premium olmayanlar için kilitli alanlar
    if (!premium) {
      $$('#nameFont option').forEach((o) => { o.disabled = o.value !== 'default'; });
      $('#entryText').disabled = true;
      $('#entryNote').textContent = '(Premium)';
    }

    // Önizleme penceresi
    const openPreview = () => { $('#previewModal').hidden = false; preview(); };
    const closePreview = () => { $('#previewModal').hidden = true; };
    $('#openPreview').onclick = openPreview;
    $('#closePreview').onclick = closePreview;
    $('#previewModal').addEventListener('click', (e) => { if (e.target.id === 'previewModal') closePreview(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePreview(); });

    renderLinks();
    touch();
  }

  async function boot() {
    const { user } = await api('/api/me');
    if (!user) return (location.href = '/?login=1');

    $('#topBadges').innerHTML = user.badges.map(badgeHtml).join('');
    if (user.username) {
      $('#who').hidden = false;
      $('#who').textContent = `@${user.username}`;
    }
    $('#logout').onclick = async () => {
      await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' });
      location.href = '/';
    };

    if (!user.username) return claim();
    currentUsername = user.username;

    const pub = await api(`/api/profile/${encodeURIComponent(user.username)}`);
    editor(user, pub);
  }

  boot().catch((err) => toast(err.message, true));
})();

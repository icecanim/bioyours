// Panel mantığı: profil, avatar ve arka plan yüklemeleri, bağlantılar, önizleme, kayıt.
(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const { render, badgeHtml, esc } = window.BioRender;
  const MB = 1024 * 1024;

  const THEMES = {
    steel:  { accent: '#7fd6ff', text: '#f2f7fa', card: '#0f161d' },
    ember:  { accent: '#ff8a5b', text: '#fff4ee', card: '#1a0c12' },
    violet: { accent: '#b48cff', text: '#f5f0ff', card: '#120a22' },
    mint:   { accent: '#7ee7c1', text: '#effff9', card: '#08201e' },
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

  // Dosyayı ham gövde olarak gönderir. Sunucu içerik türüne bakar.
  async function uploadFile(kind, file) {
    const res = await fetch(`/api/upload?kind=${kind}`, {
      method: 'POST',
      headers: { 'Content-Type': file.type },
      body: file,
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Yükleme başarısız');
    return data.url;
  }

  const get = (o, path) => path.split('.').reduce((a, k) => a?.[k], o);
  const put = (o, path, value) => {
    const keys = path.split('.');
    const last = keys.pop();
    keys.reduce((a, k) => a[k], o)[last] = value;
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
    const draft = structuredClone(pub.profile);
    const LIMIT = user.premium ? 50 : 10;
    let savedSnap = JSON.stringify(draft);

    const preview = () => render($('#preview'), {
      username: user.username,
      avatar: draft.avatar || user.avatar,
      badges: pub.badges,
      profile: draft,
    });

    function touch() {
      sync();
      preview();
      $('#dirty').hidden = JSON.stringify(draft) === savedSnap;
    }

    function sync() {
      const t = draft.background.type;
      const av = draft.avatar || user.avatar;
      const img = draft.background.url;

      $$('[data-bgtype]').forEach((b) => b.classList.toggle('on', b.dataset.bgtype === t));
      $$('[data-bgpane]').forEach((p) => (p.hidden = p.dataset.bgpane !== t));

      $('#avatarImg').hidden = !av;
      if (av) $('#avatarImg').src = av;
      $('#avatarInit').hidden = !!av;
      $('#avatarInit').textContent = (draft.displayName || user.username || '?').charAt(0).toUpperCase();

      $('#imgCurrent').hidden = !(t === 'image' && img);
      $('#imgPrev').src = t === 'image' && img ? img : '';
      $('#vidCurrent').hidden = !(t === 'video' && img);
      $('#videoLock').hidden = !!user.premium;
      $('#vidDrop').hidden = !user.premium;

      $('#angleVal').textContent = `${draft.background.angle}°`;
      $('#blurVal').textContent = `${draft.effects.blur}px`;
      $('#opVal').textContent = `${Math.round(draft.effects.opacity * 100)}%`;
      $('#descCount').textContent = `${draft.description.length}/190`;
    }

    function pushAll() {
      $$('[data-k]').forEach((el) => {
        el.value = get(draft, el.dataset.k) ?? '';
      });
    }

    // Metin, renk ve kaydırıcılar
    $$('[data-k]').forEach((el) => {
      el.addEventListener('input', () => {
        put(draft, el.dataset.k, el.type === 'range' ? Number(el.value) : el.value);
        touch();
      });
    });

    // Arka plan türü
    $$('[data-bgtype]').forEach((b) => {
      b.onclick = () => {
        const t = b.dataset.bgtype;
        if (t === 'video' && !user.premium) return toast('Video arka plan Premium ile açılır', true);
        draft.background.type = t;
        touch();
      };
    });

    // Gradyan hazır setleri
    $$('.preset').forEach((p) => {
      p.onclick = () => {
        const [c1, c2] = p.dataset.preset.split(',');
        Object.assign(draft.background, { type: 'gradient', color: c1, color2: c2 });
        pushAll();
        touch();
      };
    });

    // Tema seçimi: renkleri değiştirir, arka planı değil
    $$('.theme').forEach((b) => {
      b.onclick = () => {
        Object.assign(draft.colors, THEMES[b.dataset.theme]);
        pushAll();
        touch();
      };
    });

    // Avatar yükleme
    $('#avatarFile').onchange = async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      if (file.size > 2 * MB) return toast('Avatar en fazla 2 MB olabilir', true);
      try {
        toast('Fotoğraf yükleniyor…');
        draft.avatar = await uploadFile('avatar', file);
        touch();
        toast('Fotoğraf yüklendi. Kaydetmeyi unutma.');
      } catch (err) {
        toast(err.message, true);
      }
    };
    $('#avatarReset').onclick = () => {
      draft.avatar = '';
      touch();
    };

    // Arka plan görseli
    $('#bgFile').onchange = async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      if (file.size > 6 * MB) return toast('Görsel en fazla 6 MB olabilir', true);
      try {
        toast('Görsel yükleniyor…');
        draft.background.url = await uploadFile('background', file);
        draft.background.type = 'image';
        touch();
        toast('Görsel yüklendi. Kaydetmeyi unutma.');
      } catch (err) {
        toast(err.message, true);
      }
    };
    $('#imgRemove').onclick = () => {
      draft.background.url = '';
      draft.background.type = 'color';
      touch();
    };

    // Premium video arka plan
    $('#vidFile').onchange = async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      if (file.size > 15 * MB) return toast('Video en fazla 15 MB olabilir', true);
      try {
        toast('Video yükleniyor, biraz sürebilir…');
        draft.background.url = await uploadFile('background', file);
        draft.background.type = 'video';
        touch();
        toast('Video yüklendi. Kaydetmeyi unutma.');
      } catch (err) {
        toast(err.message, true);
      }
    };
    $('#vidRemove').onclick = () => {
      draft.background.url = '';
      draft.background.type = 'color';
      touch();
    };

    // Bağlantılar
    const renderLinks = () => {
      $('#linkList').innerHTML = draft.links.map((l, i) => `
        <div class="link-row${l.enabled === false ? ' off' : ''}" data-i="${i}">
          <div class="lr-main">
            <input data-f="title" maxlength="40" placeholder="Başlık" value="${esc(l.title)}" aria-label="Bağlantı başlığı">
            <input data-f="url" placeholder="https://..." value="${esc(l.url)}" aria-label="Bağlantı adresi">
          </div>
          <div class="lr-actions">
            <button class="chip" data-act="toggle">${l.enabled === false ? 'Gizli' : 'Açık'}</button>
            <button class="chip" data-act="up" ${i === 0 ? 'disabled' : ''} aria-label="Yukarı taşı">↑</button>
            <button class="chip" data-act="down" ${i === draft.links.length - 1 ? 'disabled' : ''} aria-label="Aşağı taşı">↓</button>
            <button class="chip danger" data-act="del" aria-label="Sil">✕</button>
          </div>
        </div>`).join('') || '<p class="muted small">Henüz bağlantın yok. "Bağlantı ekle" ile başla.</p>';
      $('#linkCount').textContent = `${draft.links.length}/${LIMIT}`;
      $('#addLink').disabled = draft.links.length >= LIMIT;
    };

    $('#linkList').addEventListener('input', (e) => {
      const row = e.target.closest('.link-row');
      if (!row || !e.target.dataset.f) return;
      draft.links[Number(row.dataset.i)][e.target.dataset.f] = e.target.value;
      touch();
    });

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
      }
      renderLinks();
      touch();
    });

    $('#addLink').onclick = () => {
      if (draft.links.length >= LIMIT) return toast(`Bu pakette en fazla ${LIMIT} bağlantı var`, true);
      draft.links.push({ id: '', title: 'Yeni bağlantı', url: 'https://', platform: 'web', enabled: true });
      renderLinks();
      touch();
      $$('#linkList .link-row:last-child input[data-f=url]')[0]?.focus();
    };

    // Sekmeler
    $$('.tabs button').forEach((btn) => {
      btn.onclick = () => {
        $$('.tabs button').forEach((b) => b.classList.toggle('on', b === btn));
        $$('.pane').forEach((p) => p.classList.toggle('on', p.dataset.pane === btn.dataset.tab));
      };
    });

    // Kaydet
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
        pushAll();
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

    // Kaydetmeden çıkmayı engelle
    window.addEventListener('beforeunload', (e) => {
      if (JSON.stringify(draft) !== savedSnap) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    $('#liveUrl').textContent = `bio.yours/${user.username}`;
    $('#viewLink').href = `/${user.username}`;
    pushAll();
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

    const pub = await api(`/api/profile/${encodeURIComponent(user.username)}`);
    if (!user.premium) $('#premiumLock').hidden = false;
    editor(user, pub);
  }

  boot().catch((err) => toast(err.message, true));
})();

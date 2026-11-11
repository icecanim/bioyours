// Panel mantığı: profil yükleme, alan bağlama, bağlantı yönetimi, önizleme ve kayıt.
(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const { render, badgeHtml, esc } = window.BioRender;

  const toast = (msg, bad = false) => {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast' + (bad ? ' bad' : '');
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => (t.hidden = true), 2800);
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

  // "a.b.c" yolu ile nesne okuma ve yazma
  const get = (o, path) => path.split('.').reduce((a, k) => a?.[k], o);
  const put = (o, path, value) => {
    const keys = path.split('.');
    const last = keys.pop();
    keys.reduce((a, k) => a[k], o)[last] = value;
  };

  function claim() {
    $('#claim').hidden = false;
    $('#claimName').focus();
    $('#claimForm').onsubmit = async (e) => {
      e.preventDefault();
      $('#claimErr').textContent = '';
      const name = $('#claimName').value.trim().toLowerCase();
      try {
        await api('/api/username', 'POST', { username: name });
        location.reload();
      } catch (err) {
        $('#claimErr').textContent = err.message;
      }
    };
  }

  function editor(user, pub) {
    const draft = structuredClone(pub.profile);
    const LIMIT = user.premium ? 50 : 10;

    const preview = () => render($('#preview'), {
      username: user.username,
      avatar: draft.avatar || user.avatar,
      badges: pub.badges,
      profile: draft,
    });

    const sync = () => {
      $('#bgUrlField').hidden = draft.background.type === 'color';
      $('#blurVal').textContent = `${draft.effects.blur}px`;
      $('#opVal').textContent = `${Math.round(draft.effects.opacity * 100)}%`;
      $('#descCount').textContent = `${draft.description.length}/190`;
    };

    const pushAll = () => {
      $$('[data-k]').forEach((el) => {
        el.value = get(draft, el.dataset.k) ?? '';
      });
    };

    // Alanlar: her değişiklikte taslağı ve önizlemeyi günceller
    $$('[data-k]').forEach((el) => {
      const handler = () => {
        put(draft, el.dataset.k, el.type === 'range' ? Number(el.value) : el.value);
        sync();
        preview();
      };
      el.addEventListener('input', handler);
      el.addEventListener('change', handler);
    });

    // Bağlantı listesi
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
      preview();
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
      preview();
    });

    $('#addLink').onclick = () => {
      if (draft.links.length >= LIMIT) return toast(`Bu pakette en fazla ${LIMIT} bağlantı var`, true);
      draft.links.push({ id: '', title: 'Yeni bağlantı', url: 'https://', platform: 'web', enabled: true });
      renderLinks();
      preview();
      const inputs = $$('#linkList .link-row:last-child input[data-f=url]');
      inputs[0]?.focus();
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
        pushAll();
        renderLinks();
        sync();
        preview();
        toast('Kaydedildi ✓');
      } catch (err) {
        toast(err.message, true);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Kaydet';
      }
    };

    pushAll();
    renderLinks();
    sync();
    preview();
  }

  async function boot() {
    const { user } = await api('/api/me');
    if (!user) return (location.href = '/?login=1');

    $('#who').textContent = user.username ? `@${user.username}` : '';
    $('#topBadges').innerHTML = user.badges.map(badgeHtml).join('');
    $('#logout').onclick = async () => {
      await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' });
      location.href = '/';
    };

    if (!user.username) return claim();

    $('#viewLink').href = `/${user.username}`;
    if (!user.premium) {
      $('#premiumLock').hidden = false;
      $('#bgType option[value=video]').disabled = true;
    }

    const pub = await api(`/api/profile/${encodeURIComponent(user.username)}`);
    editor(user, pub);
  }

  boot().catch((err) => toast(err.message, true));
})();

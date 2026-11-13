// Yönetim paneli. UI yalnızca yardımcıdır. Asıl yetki kontrolü sunucuda yapılır.
(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  const RANK = { owner: 100, admin: 80, mod: 60, user: 0 };
  const GRANTS = {
    verified: 'Doğrulanmış', early: 'Erken Kullanıcı', supporter: 'Destekçi',
    partner: 'Partner', developer: 'Geliştirici', beta: 'Beta Tester', bughunter: 'Bug Avcısı',
  };
  let defs = [];

  let me = null;
  const myRank = () => RANK[me.role] ?? 0;
  // Yalnızca admin ve üstü, kendinden düşük yetkili birini yönetebilir
  // Rozet ve premium: admin ve üstü, kendi hesabı dahil (üst yetkili hedef dahil değil)
  const canGrant = (t) => myRank() >= 80 && (t.id === me.id || myRank() > (RANK[t.role] ?? 0));
  // Ban: kendi hesabı hariç, daha düşük yetkili hedef
  const canBan = (t) => myRank() >= 80 && t.id !== me.id && myRank() > (RANK[t.role] ?? 0);

  const toast = (msg, bad = false) => {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast' + (bad ? ' bad' : '');
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => (t.hidden = true), 2600);
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

  function row(t) {
    const dG = canGrant(t) ? '' : 'disabled';
    const dB = canBan(t) ? '' : 'disabled';

    const grants = Object.entries(GRANTS).map(([key, label]) => {
      const has = (t.manualBadges || []).includes(key);
      return `<button class="chip${has ? ' on' : ''}" ${dG} data-act="badge" data-badge="${key}" data-on="${!has}">${label}</button>`;
    }).join('');

    const role = me.role === 'owner' && t.role !== 'owner'
      ? `<select data-act="role" aria-label="Yetki">${['user', 'mod', 'admin']
          .map((r) => `<option value="${r}"${t.role === r ? ' selected' : ''}>${r}</option>`).join('')}</select>`
      : `<span class="chip">${esc(t.role)}</span>`;

    const customs = defs.map((d) => {
      const key = `custom:${d.id}`;
      const has = (t.manualBadges || []).includes(key);
      return `<button class="chip${has ? ' on' : ''}" ${dG} data-act="badge" data-badge="${key}" data-on="${!has}" style="--bc:${esc(d.color)}">${esc(d.icon)} ${esc(d.label)}</button>`;
    }).join('');

    return `<tr data-id="${esc(t.id)}">
      <td><div class="who">${t.avatar ? `<img src="${esc(t.avatar)}" alt="">` : '<span class="av"></span>'}
        <div><b>${esc(t.name || '—')}</b><div class="muted small">${esc(t.email || '')}</div></div></div></td>
      <td>${t.username
        ? `<a href="/${esc(t.username)}" target="_blank" rel="noopener">@${esc(t.username)}</a>`
        : '<span class="muted">—</span>'}<div class="muted small">${esc(t.provider)}</div></td>
      <td>${role}</td>
      <td><div class="chips">${grants}${customs}</div></td>
      <td><button class="chip${t.premium ? ' on' : ''}" ${dG} data-act="premium" data-on="${!t.premium}">${t.premium ? 'Premium ✓' : 'Premium ver'}</button></td>
      <td><button class="chip${t.banned ? ' danger' : ''}" ${dB} data-act="ban" data-on="${!t.banned}">${t.banned ? 'Banı kaldır' : 'Banla'}</button></td>
    </tr>`;
  }

  function renderDefs() {
    $('#defList').innerHTML = defs.map((d) => `<span class="chip on" style="--bc:${esc(d.color)}">${esc(d.icon)} ${esc(d.label)}
      <button class="chip danger" data-del="${esc(d.id)}" style="margin-left:6px">Sil</button></span>`).join('')
      || '<span class="muted small">Henüz özel rozet yok.</span>';
  }

  async function load() {
    const q = $('#q').value.trim();
    const { users, total, badgeDefs } = await api(`/api/admin/users?q=${encodeURIComponent(q)}`);
    defs = badgeDefs || [];
    renderDefs();
    $('#total').textContent = total;
    $('#rows').innerHTML = users.map(row).join('') || '<tr><td colspan="6" class="muted">Sonuç bulunamadı</td></tr>';
  }

  async function onClick(e) {
    const btn = e.target.closest('button[data-act]');
    if (!btn || btn.disabled) return;
    const id = encodeURIComponent(btn.closest('tr').dataset.id);
    const on = btn.dataset.on === 'true';
    try {
      if (btn.dataset.act === 'badge') {
        await api(`/api/admin/users/${id}/badge`, 'POST', { badge: btn.dataset.badge, enabled: on });
      } else if (btn.dataset.act === 'premium') {
        await api(`/api/admin/users/${id}/premium`, 'POST', { enabled: on });
      } else if (btn.dataset.act === 'ban') {
        if (on && !confirm('Bu kullanıcıyı banlamak istediğine emin misin?')) return;
        await api(`/api/admin/users/${id}/ban`, 'POST', { enabled: on });
      }
      toast('Kaydedildi ✓');
      await load();
    } catch (err) {
      toast(err.message, true);
    }
  }

  async function onRole(e) {
    if (e.target.dataset.act !== 'role') return;
    const id = encodeURIComponent(e.target.closest('tr').dataset.id);
    try {
      await api(`/api/admin/users/${id}/role`, 'POST', { role: e.target.value });
      toast('Yetki güncellendi ✓');
      await load();
    } catch (err) {
      toast(err.message, true);
    }
  }

  (async () => {
    me = (await api('/api/me')).user;
    if (!me || myRank() < 60) return (location.href = '/');
    $('#meRole').textContent = me.role;

    let timer;
    $('#q').addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => load().catch((err) => toast(err.message, true)), 250);
    });
    $('#rows').addEventListener('click', onClick);
    $('#rows').addEventListener('change', onRole);
    $('#defForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/api/admin/badge-defs', 'POST', {
          label: $('#defLabel').value.trim(),
          icon: $('#defIcon').value.trim() || '★',
          color: $('#defColor').value,
        });
        $('#defLabel').value = '';
        toast('Rozet oluşturuldu ✓');
        await load();
      } catch (err) {
        toast(err.message, true);
      }
    });
    $('#defList').addEventListener('click', async (e) => {
      const id = e.target.closest('[data-del]')?.dataset.del;
      if (!id || !confirm('Bu rozet silinsin mi? Tüm kullanıcılardan kalkacak.')) return;
      try {
        await api(`/api/admin/badge-defs/${encodeURIComponent(id)}`, 'DELETE');
        toast('Rozet silindi');
        await load();
      } catch (err) {
        toast(err.message, true);
      }
    });
    await load();
  })().catch((err) => toast(err.message, true));
})();

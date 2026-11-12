require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const db = require('./db');
const { router: authRouter, loadUser } = require('./auth');
const apiRouter = require('./api');
const { roleRank } = require('./roles');
const { RESERVED, USERNAME_RE, publicProfile } = require('./profile');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const VIEWS_DIR = path.join(__dirname, '..', 'views');
const PORT = Number(process.env.PORT) || 3000;
const BASE = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');

// views/ herkese açık statik klasörde değil. Sayfalar sadece buradan,
// yetki kontrolünden geçerek sunulur.
const viewCache = new Map();
function view(name) {
  if (!viewCache.has(name)) viewCache.set(name, fs.readFileSync(path.join(VIEWS_DIR, name), 'utf8'));
  return viewCache.get(name);
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

// JSON'u <script> içine güvenle koymak için < karakterini kaçır.
const safeJson = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

const NOT_FOUND = `<!doctype html><html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bulunamadı — bio.yours</title><link rel="icon" href="/img/logo.png">
<link rel="stylesheet" href="/css/app.css"></head>
<body><div class="nf"><img src="/img/logo.png" width="56" height="56" alt="">
<h1>Bu sayfa bulunamadı</h1>
<p class="muted">Kullanıcı adı yanlış olabilir ya da hesap kapatılmış olabilir.</p>
<a class="btn btn-primary" href="/">Ana sayfaya dön</a></div></body></html>`;

// Profil sayfasına OG meta etiketleri ve başlangıç verisi eklenir.
// Böylece Discord/Twitter linki paylaşıldığında doğru önizleme çıkar.
function profileHead(data) {
  const p = data.profile;
  const title = `${p.displayName} (@${data.username}) — bio.yours`;
  const desc = p.description || `@${data.username} profilini bio.yours'ta keşfet.`;
  const url = `${BASE}/${data.username}`;
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(desc)}">`,
    `<meta name="theme-color" content="${esc(p.colors.accent)}">`,
    `<meta property="og:type" content="profile">`,
    `<meta property="og:site_name" content="bio.yours">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    data.avatar ? `<meta property="og:image" content="${esc(data.avatar)}">` : '',
    `<meta name="twitter:card" content="summary">`,
    `<script>window.__BIO__=${safeJson(data)};</script>`,
  ].filter(Boolean).join('\n');
}

// Veritabanı yüklemesi bitene kadar gelen istekler bekler.
// Vercel'de her soğuk başlatmada bu bir kez çalışır.
const ready = db.init();
// Hata middleware'de yakalanıp 503 döner. Burada işlenmeyen promise olarak süreci düşürmesin.
ready.catch(() => {});

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));

app.use(async (req, res, next) => {
  try {
    await ready;
    next();
  } catch (err) {
    console.error('[db]', err.message);
    res.status(503).type('text/plain; charset=utf-8').send('Veritabanı bağlantısı kurulamadı. Birazdan tekrar dene.');
  }
});

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'SAMEORIGIN',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  next();
});

app.use(loadUser);
app.use(authRouter);
app.use('/api', apiRouter);
app.get('/healthz', (req, res) => res.send('ok'));

// Korumalı sayfalar
app.get('/dashboard', (req, res) => {
  if (!req.user) return res.redirect('/?login=1');
  res.type('html').send(view('dashboard.html'));
});

// Gizli admin paneli. Yetkisiz kullanıcıya 404 döner, varlığı belli olmaz.
app.get('/yonetim', (req, res) => {
  if (!req.user || roleRank(req.user.role) < 60) return res.status(404).type('html').send(NOT_FOUND);
  res.type('html').send(view('admin.html'));
});

// Herkese açık statik dosyalar (css, js, img, index.html)
app.use(express.static(PUBLIC_DIR, { index: 'index.html' }));

// Profil sayfası: /kullaniciadi
app.get('/:username', (req, res, next) => {
  const name = req.params.username.toLowerCase();
  if (!USERNAME_RE.test(name) || RESERVED.has(name)) return next();
  const s = db.read();
  const user = s.users[s.usernames[name]];
  if (!user || user.banned) return res.status(404).type('html').send(NOT_FOUND);
  const data = publicProfile(user);
  res.type('html').send(view('profile.html').replace('<!--META-->', () => profileHead(data)));
});

app.use((req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Bulunamadı' });
  res.status(404).type('html').send(NOT_FOUND);
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[server]', err);
  if (req.path.startsWith('/api')) return res.status(err.status || 500).json({ error: err.status ? err.message : 'Sunucu hatası' });
  res.status(500).type('html').send('<h1>Bir hata oluştu</h1>');
});

// Yerelde: node server/index.js ile doğrudan çalıştırılınca port dinler.
// Vercel'de: api/index.js bu uygulamayı import eder, port dinlenmez.
if (require.main === module) {
  ready
    .then(() => app.listen(PORT, () => console.log(`bio.yours çalışıyor → ${BASE}`)))
    .catch((err) => {
      console.error('Başlatılamadı:', err.message);
      process.exit(1);
    });
}

module.exports = app;

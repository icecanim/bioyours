// Profil görüntüleme sayacı.
// Her sayfa açılışı önce bellekte biriktirilir, sonra toplu olarak veritabanına yazılır.
// Böylece her ziyarette JSONBin'e istek gitmez.
const db = require('./db');

const FLUSH_MS = 60 * 1000;
const MAX_PENDING = 100;
const pending = new Map();
let lastFlush = Date.now();

function countView(username) {
  pending.set(username, (pending.get(username) || 0) + 1);
  if (Date.now() - lastFlush >= FLUSH_MS || pending.size >= MAX_PENDING) flush();
}

function flush() {
  if (!pending.size) {
    lastFlush = Date.now();
    return;
  }
  const batch = [...pending.entries()];
  pending.clear();
  lastFlush = Date.now();
  db.mutate((s) => {
    for (const [name, n] of batch) {
      const id = s.usernames[name];
      if (id && s.users[id]) s.users[id].views = (s.users[id].views || 0) + n;
    }
  }).catch((err) => {
    console.error('[views]', err.message);
    // Yazılamadıysa sayıları geri koy, bir sonraki yazmada tekrar denensin
    for (const [name, n] of batch) pending.set(name, (pending.get(name) || 0) + n);
  });
}

// Gösterilecek toplam: kalıcı sayaç + henüz yazılmamış ziyaretler
function viewsOf(user) {
  return (user.views || 0) + (pending.get(user.username) || 0);
}

module.exports = { countView, viewsOf, flush };

// JSONBin tabanlı veri katmanı.
//
// Tüm veri tek bir bin içinde tutulur. Okumalar bellekteki kopyadan yapılır.
// Yazmalar sıraya alınır ve her yazmadan önce JSONBin'den en güncel veri
// çekilir. Böylece birden fazla sunucu örneği (Vercel'de olduğu gibi) birbirinin
// değişikliğini ezmez.
//
// Not: JSONBin tek bir dokümandır, her yazmada tamamı gönderilir. Başlangıç
// ve orta ölçek için uygundur. Büyüyünce gerçek bir veritabanına geçilebilir.

const API = 'https://api.jsonbin.io/v3/b';
const MASTER_KEY = process.env.JSONBIN_MASTER_KEY;
let binId = process.env.JSONBIN_BIN_ID;
const IS_VERCEL = Boolean(process.env.VERCEL);

const emptyDb = () => ({ users: {}, usernames: {}, createdAt: Date.now() });
const normalize = (record) => ({ ...emptyDb(), ...record });

let state = emptyDb();
let queue = Promise.resolve();

function headers(extra = {}) {
  return {
    'Content-Type': 'application/json',
    'X-Master-Key': MASTER_KEY,
    ...extra,
  };
}

async function fetchLatest() {
  const res = await fetch(`${API}/${binId}/latest`, {
    headers: headers({ 'X-Bin-Meta': 'false' }),
  });
  if (!res.ok) throw new Error(`Bin okunamadı (HTTP ${res.status}). BIN_ID ve master key'i kontrol et.`);
  return normalize(await res.json());
}

async function init() {
  if (!MASTER_KEY) throw new Error('JSONBIN_MASTER_KEY ortam değişkeni tanımlı değil');

  if (!binId) {
    if (IS_VERCEL) {
      throw new Error('JSONBIN_BIN_ID eksik. Yerelde bir kez npm start çalıştırıp çıkan ID\'yi Vercel ortam değişkenlerine ekle.');
    }
    const res = await fetch(API, {
      method: 'POST',
      headers: headers({ 'X-Bin-Name': 'bio-yours-db', 'X-Bin-Private': 'true' }),
      body: JSON.stringify(emptyDb()),
    });
    if (!res.ok) throw new Error(`Bin oluşturulamadı (HTTP ${res.status})`);
    binId = (await res.json()).metadata.id;
    state = emptyDb();
    console.log(`[db] Yeni bin oluşturuldu. Ortam değişkenine ekle: JSONBIN_BIN_ID=${binId}`);
    return;
  }

  state = await fetchLatest();
  console.log(`[db] Bağlandı. Kayıtlı hesap: ${Object.keys(state.users).length}`);
}

async function persist(data) {
  const res = await fetch(`${API}/${binId}`, {
    method: 'PUT',
    headers: headers({ 'X-Bin-Versioning': 'false' }),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`JSONBin yazılamadı (HTTP ${res.status})`);
}

// Sadece okuma. Dönen nesneyi doğrudan değiştirme, mutate kullan.
const read = () => state;

// Değişiklik için kullan. fn bir taslak alır. Hata fırlatırsa hiçbir şey kaydedilmez.
function mutate(fn) {
  const job = queue.then(async () => {
    const draft = await fetchLatest();
    const result = await fn(draft);
    await persist(draft);
    state = draft;
    return result;
  });
  queue = job.catch(() => {});
  return job;
}

module.exports = { init, read, mutate };

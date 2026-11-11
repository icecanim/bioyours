// JSONBin tabanlı veri katmanı.
//
// Tüm veri tek bir bin içinde tutulur. Okumalar bellekten (state) yapılır,
// yazmalar ise kuyrukta sırayla JSONBin'e gönderilir. Böylece aynı anda gelen
// iki istek birbirinin verisini ezmez.
//
// Not: JSONBin tek bir dokümandır, her yazmada tamamı gönderilir. Bu yapı
// başlangıç ve orta ölçek için uygundur. Büyüyünce kullanıcı başına bin
// veya gerçek bir veritabanına geçiş yapılabilir. Bu yüzden erişim sadece
// bu dosya üzerinden yapılıyor.

const API = 'https://api.jsonbin.io/v3/b';
const MASTER_KEY = process.env.JSONBIN_MASTER_KEY;
let binId = process.env.JSONBIN_BIN_ID;

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

async function init() {
  if (!MASTER_KEY) throw new Error('JSONBIN_MASTER_KEY .env dosyasında tanımlı değil');

  if (!binId) {
    const res = await fetch(API, {
      method: 'POST',
      headers: headers({ 'X-Bin-Name': 'bio-yours-db', 'X-Bin-Private': 'true' }),
      body: JSON.stringify(emptyDb()),
    });
    if (!res.ok) throw new Error(`Bin oluşturulamadı (HTTP ${res.status})`);
    const json = await res.json();
    binId = json.metadata.id;
    state = emptyDb();
    console.log(`[db] Yeni bin oluşturuldu. .env dosyasına ekle: JSONBIN_BIN_ID=${binId}`);
    return;
  }

  const res = await fetch(`${API}/${binId}/latest`, {
    headers: headers({ 'X-Bin-Meta': 'false' }),
  });
  if (!res.ok) throw new Error(`Bin okunamadı (HTTP ${res.status}). BIN_ID ve master key'i kontrol et.`);
  state = normalize(await res.json());
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

// Değişiklik yapmak için kullan. fn bir taslak (draft) alır, hata fırlatırsa
// hiçbir şey kaydedilmez.
function mutate(fn) {
  const job = queue.then(async () => {
    const draft = structuredClone(state);
    const result = await fn(draft);
    await persist(draft);
    state = draft;
    return result;
  });
  queue = job.catch(() => {});
  return job;
}

module.exports = { init, read, mutate };

# bio.yours

Tek sayfada tüm bağlantıların. Node.js + Express sunucusu, JSONBin veri tabanı,
Google ve Discord OAuth2 girişleri.

## Kurulum

```bash
npm install
cp .env.example .env   # değerleri doldur
npm start              # http://localhost:3000
```

Gereksinim: Node.js 18.17 veya üstü.

## OAuth yönlendirme adresleri

Google Cloud Console ve Discord Developer Portal'da şu adresleri ekle
(`BASE_URL` neyse ona göre):

- Google: `BASE_URL/auth/google/callback`
- Discord: `BASE_URL/auth/discord/callback`

Geliştirmede `BASE_URL=http://localhost:3000`. Yayına alırken `https://domainin.com` yap.

## İlk Owner

`.env` içindeki `OWNER_IDS` alanına kendi hesabını yaz:

- Discord: `discord:<kullanıcı_id>` (Discord ayarlarında geliştirici modunu açıp ID'ni kopyala)
- Google: `google:<sub>` (ilk girişten sonra admin panelinde görünür)

Bu hesap giriş yapınca otomatik Owner olur ve `/yonetim` sayfasına erişir.

## JSONBin

`JSONBIN_MASTER_KEY` boş bırakılırsa sunucu başlamaz. Bin ID boşsa ilk açılışta
otomatik oluşturulur ve konsola yazdırılır. Bu ID'yi `.env` dosyasına ekle.

Anahtarlar yalnızca sunucuda kalır. Tarayıcı JSONBin'e doğrudan erişmez.

## Yetki sistemi

| Rol    | Yetki                                                          |
|--------|----------------------------------------------------------------|
| owner  | Her şey. Admin ve mod rollerini atar.                          |
| admin  | Rozet verir, premium ve ban yönetir.                           |
| mod    | Admin panelini görüntüler, işlem yapamaz.                      |
| user   | Normal kullanıcı.                                              |

Owner ve admin rozetleri yetkiden otomatik gelir. Doğrulanmış, Erken Kullanıcı
ve Destekçi rozetleri admin panelinden elle verilir.

## Dizin yapısı

```
server/   Express sunucusu, OAuth, JSONBin katmanı, API, yetki kuralları
public/   Herkese açık statik dosyalar (landing, css, js, logo)
views/    Yetki kontrolünden geçerek sunulan sayfalar (profil, panel, yönetim)
```

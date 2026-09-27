# Benim Meram API (sunucu)

Benim Meram mobil uygulamasının konuştuğu sunucu. Node.js + Express + PostgreSQL.

## Render'da çalıştırma

1. Render'da bir **PostgreSQL** veritabanı oluşturun (servislerinizle aynı bölge: Virginia).
2. Bu depoyu Render'da **Web Service** olarak bağlayın:
   - Build Command: `npm install`
   - Start Command: `npm start`
3. **Environment** bölümüne ekleyin:
   - `DATABASE_URL` → veritabanının *Internal Database URL*'i
   - `JWT_SECRET` → uzun rastgele bir metin ("Generate" ile)
4. Deploy edin. Sunucu açılırken tabloları kendisi kurar (`db/schema.sql`).
   Tarayıcıda `https://<servis-adresiniz>/health` açınca `{"ok":true}` görmelisiniz.

Bu adresi mobil uygulamadaki `.env` dosyasına `EXPO_PUBLIC_API_URL` olarak yazın.

## Adresler

| Adres | Açıklama |
|---|---|
| `POST /auth/register` | SMS kodu gönder (`phoneNumber`) |
| `POST /auth/verify-otp` | Kodu doğrula, giriş anahtarı al (`phoneNumber, code`, yeni kullanıcıysa `fullName, profileType`) |
| `GET /listings` | İlan listesi. Filtreler: `mainCategory, subCategory, breed, minPrice, maxPrice, city, region, q, lat+lng+radiusKm, page, pageSize` |
| `GET /listings/mine` | Kendi ilanlarım |
| `GET /listings/:id` | Tek ilan (satıcı adı, beğeni sayısı, beğendim/favorimde mi) |
| `POST /listings` | İlan ver (`mainCategory, subCategory, breed, price, ageMonths, weightKg, city, region, description, lat, lng, mediaUrls`) |
| `PATCH /listings/:id` | İlanı düzenle |
| `PATCH /listings/:id/status` | `yayinda` / `satildi` / `kaldirildi` |
| `POST /listings/:id/like`, `/favorite` | Beğen / favorile (tekrar basınca geri alır) |
| `GET /me/favorites` | Favoriler |
| `GET /reels-feed` | Keşfet akışı |
| `POST /:ilanId/offers`, `PATCH /offers/:id` | Teklif ver / teklife cevap ver |
| `GET, POST /buy-requests` | Alım talepleri |
| `GET, POST /conversations`, `/conversations/:id/messages` | Özel mesajlar |
| `GET, POST /region-chat/:bolge` | Bölge sohbeti |
| `POST /subscriptions/checkout` | Abonelik (şimdilik test ödemesi) |
| `POST /reviews`, `GET /users/:id/reviews` | Değerlendirmeler |
| `/admin/...` | Yönetim paneli |

Değer sözlüğü (`src/constants.js`, mobil uygulamayla aynı):
- Kategori: `buyukbas`, `kucukbas`
- Bölge: `marmara`, `ege`, `akdeniz`, `ic_anadolu`, `karadeniz`, `dogu_anadolu`, `guneydogu_anadolu`
- Profil tipi: `bireysel`, `ciftci`, `tuccar`

## Henüz simülasyonda olanlar

- **SMS** (`src/lib/sms.js`): Kod gerçekten gönderilmez, Render loglarına yazılır. Netgsm bağlanınca gerçek SMS gider.
- **Ödeme** (`src/lib/payment.js`): Her ödeme "başarılı" sayılır. iyzico bağlanacak.
- **Bildirim** (`src/lib/push.js`): Firebase bağlanacak.

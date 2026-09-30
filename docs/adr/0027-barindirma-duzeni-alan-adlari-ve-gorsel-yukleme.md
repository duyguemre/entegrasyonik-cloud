# 0027 — Barındırma Düzeni, Alan Adları ve Görsel Yükleme/Sunum

## Durum
Kabul edildi (2026-09-30). Alan adı ayrımı kullanıcı kararıdır (2026-09-30): `entegrasyonik.com` + `www` tanıtım sitesi, `app.` uygulama.
Bu ADR o kararı uygulanabilir bir düzene çevirir. Canlı DNS/Cloudflare/Railway/R2 değişiklikleri insan eliyle yapılır (Protokol 12;
runbook: `docs/DEPLOYMENT.md`). Kod tarafı (çerez ayarı, doğrudan görsel yükleme uçları) bu ADR ile birlikte geldi, varsayılanları
bugünkü davranışı DEĞİŞTİRMEZ.

## Bağlam
- Bugün üç yerde barınma izi var: Render (`entegrasyonik.onrender.com`), Railway (`entegrasyonik-production.up.railway.app`, staging),
  `app.entegrasyonik.com` (üretim hedefi). `backend/.env.example` → `CORS_ORIGINS` bu adların hepsini içeriyor.
- Oturum çerezi üretimde `SameSite=None` (`backend/src/api/Security.ts` `getCookieOptions`). Bunun tek nedeni SPA ile API'nin FARKLI
  sitelerde (ör. `app.entegrasyonik.com` → `*.onrender.com`) durabilmesiydi. `SameSite=None` çerezi her çapraz-site isteğe ekler;
  CSRF savunması yalnızca `originCheck` (ADR-0001 Karar 10) üzerinde kalır.
- Tanıtım sitesi (`site/`, Astro statik, ADR-0014) derlemede `dist/_headers` üretir (Cloudflare Pages biçimi; `site/src/lib/headers.mjs`).
  Uygulama (`frontend/`, Vue/Vite statik) bugün nginx başlık dosyasıyla (`frontend/nginx-security-headers.conf`) tasarlanmış; CSP
  Report-Only.
- Görsel yükleme bugün **multipart ile backend üzerinden** akıyor (`ImageApiManager` → `multer.memoryStorage()` → `sharp` küçük resim →
  `S3Manager.upload`). Bulgular (kod okuması, 2026-09-30):
  1. Tüm dosya backend belleğine alınır; `upload.any()` için **boyut/tür/adet sınırı yok** (bellek tüketimi, SVG/HTML yükleme riski).
  2. Anahtar `products/<clientId>/<tempId>/<ObjectId>.<uzantı>`; uzantı istemcinin dosya adından (`originalname.split('.').pop()`).
  3. `ImageOperations.BASE_IMAGE_URL` **yazım hatalıydı** (`images.entegrasrasyonik.com`): bu yoldan yüklenen görsellerin DB'ye yazılan
     URL'si var olmayan bir alan adını gösteriyordu (ProductService'in `Constants.BASE_IMAGE_URL`'i doğruydu). Bu ADR ile düzeltildi;
     mevcut DB kayıtları için veri düzeltmesi ayrı, yedek şartlı göç işidir (Protokol 12).
  4. Pazaryerlerine giden URL'ler (Trendyol ≤8 görsel, HTTPS, herkese açık) aynı `url` alanından okunur — kök alan adı tek yerde değil.
- ADR-0013 B3 (2026-09-27) tek anahtarlı `t/<tenantId>/…` öneki göçünü **iptal etti** (güvenlik kazancı yok, mevcut nesne taşıması
  gerekir). Bu ADR o kararı korur: yeni anahtarlar da `<tür>/<clientId>/…` desenindedir.
- Ölçek: tek haneli abone, tek web/worker süreci (ADR-0006), R2 tek kova çifti (görsel + arşiv).

## Değerlendirilen Alternatifler

### A. Barındırma
**A1. Statik iki yüz Cloudflare Pages'te, API Railway'de, görseller R2 özel alan adında (seçilen)**
- Artı: statik yüzler bedava/sınırsız bant genişliğinde ve CDN kenarında; API süreci yalnız API işi yapar; site ve uygulama bağımsız
  dağıtılır/geri alınır (Pages her dağıtımı saklar, tek tıkla geri dönüş); `app.` ve `api.` AYNI SİTE → `SameSite=Lax` mümkün.
- Eksi: iki origin (app/api) → CORS gerekli (zaten var); iki ayrı panel (Cloudflare + Railway).

**A2. Frontend'i backend'den servis etmek (Express `static`, tek origin)**
- Artı: CORS yok, tek dağıtım birimi.
- Eksi: statik dosyalar API sürecinin CPU/belleğini ve Railway egress'ini kullanır; UI düzeltmesi için backend yeniden dağıtılır
  (sürüm birbirine kilitlenir); SPA geri dönüşü backend geri dönüşüne bağlanır; CDN önbelleği için ayrıca ayar gerekir.

**A3. Railway'de ayrı statik servis (nginx imajı)**
- Artı: tek panel.
- Eksi: statik barındırma için ücretli, 7/24 çalışan konteyner; CDN yok; Pages'in önizleme/geri alma özellikleri yok.

**A4. Cloudflare Worker ile `app.entegrasyonik.com/api/*` → Railway vekil (tek origin)**
- Artı: CORS ve çapraz-origin çerez sorunu tamamen kalkar (her şey `app.` altında).
- Eksi: ek bileşen (Worker kodu + dağıtımı), istek başı Worker ücret/kota; webhook'lar ve `/health` için ayrı yol kuralları; hata
  ayıklamada bir katman daha. `app.`/`api.` zaten aynı site olduğundan kazanç (Lax çerez) A1'de de elde ediliyor → bu ölçekte orantısız.

### B. Görsel yükleme
**B1. Tarayıcıdan R2'ye imzalı PUT + geçici önek + sunucuda onay (seçilen)**
- Artı: dosya baytları backend'e hiç girmez (bellek/bant); imzada tür ve boyut sabit (başka tür/boyutla PUT R2'de 403); kalıcı anahtar
  içerik-adresli ve SUNUCUDA hesaplanır (istemci anahtar seçemez, kalıcı nesnenin üzerine yazamaz); yetimler yaşam döngüsü kuralıyla
  kendiliğinden temizlenir.
- Eksi: iki çağrı (bilet + onay) ve FE değişikliği; onayda backend nesneyi bir kez okur (R2 çıkışı ücretsiz; tavan 10 MB).

**B2. Doğrudan imzalı PUT ile kalıcı içerik-adresli anahtara (istemci sha256 hesaplar)**
- Artı: onayda kopya/yeniden yazma yok.
- Eksi: istemcinin bildirdiği özete güvenilir → aynı anahtara farklı içerik yazılabilir (içerik-adresliliğin garantisi kaybolur) ya da
  doğrulama için yine tam okuma gerekir; yarım kalan yüklemeler kalıcı önekte yetim bırakır (yaşam döngüsü ayırt edemez).

**B3. Mevcut multipart yolu + sınırlar (tavan/tür) eklemek**
- Artı: FE değişmez.
- Eksi: baytlar yine backend belleğinden geçer; Railway'de API süreci büyük yüklemelerde bellek sınırına yaklaşır. Kısa vadeli sertleştirme
  olarak ayrıca önerilir (BACKLOG), hedef çözüm değildir.

**B4. S3 POST policy (`content-length-range`)** — R2 `PostObject` desteklemiyor; elenir.

## Karar
**Barındırma:** `entegrasyonik.com` = site (Cloudflare Pages, `www` → apex 301), `app.entegrasyonik.com` = uygulama (Cloudflare Pages,
SPA), `api.entegrasyonik.com` = backend (Railway; yalnız backend + Redis; MongoDB Atlas), `cdn.entegrasyonik.com` = R2 görsel kovası
(herkese açık özel alan adı; arşiv kovası özel). Railway'de GitHub push ile otomatik dağıtım YOK; dağıtım yalnız insan komutuyla.
**Görsel:** B1 — imzalı PUT (geçici önek) → onay (sniff + boyut + sha256 + kalıcı içerik-adresli anahtar + DB) → `cdn.` üzerinden
değişmez önbellekle sunum; boyutlandırma URL'i tek üreticiden.

### 1. Hedef düzen
| Ad | Ne | Nerede | Not |
|---|---|---|---|
| `entegrasyonik.com` | Tanıtım sitesi (`site/`, `astro build` → `dist/`, `_headers` dahil) | Cloudflare Pages projesi `entegrasyonik-site` | Apex; Pages CNAME düzleştirme |
| `www.entegrasyonik.com` | Yalnız yönlendirme | Cloudflare Redirect Rule | 301 → `https://entegrasyonik.com/${yol}`, sorgu korunur |
| `app.entegrasyonik.com` | Uygulama (`frontend/`, `vite build` → `dist/`) | Cloudflare Pages projesi `entegrasyonik-app` | SPA: `dist/404.html` OLMAMALI (Pages o zaman `index.html`'e düşer) |
| `api.entegrasyonik.com` | Backend (`backend/Dockerfile`, `APP_ROLE=all`) | Railway servisi `backend` + Railway Redis | Cloudflare proxy AÇIK, SSL Full (strict) |
| `cdn.entegrasyonik.com` | R2 görsel kovası (salt-okunur, herkese açık) | R2 özel alan adı | `r2.dev` genel URL'i KAPALI |
| `images.entegrasyonik.com` | Eski görsel URL'leri (DB'de sabit string) | Aynı görsel kovasına İKİNCİ özel alan adı | Eski kayıtlar göç edilene kadar (bkz. gözden geçirme eşiği) |
| (yok) | Arşiv kovası (KVKK dışa aktarma zip'leri) | R2, özel | Herkese açık alan adı YOK; erişim yalnız backend üzerinden |

### 2. DNS kayıtları (zone `entegrasyonik.com`, Cloudflare)
Hedef değerler panelin verdiği değerlerdir; aşağıda `<…>` yer tutucudur. Gerçek değerler bu depoya yazılmaz.

| Tip | Ad | Hedef | Proxy | Kim oluşturur |
|---|---|---|---|---|
| CNAME | `@` (apex) | `<entegrasyonik-site>.pages.dev` | Açık | Pages → Custom domains (otomatik) |
| CNAME | `www` | `entegrasyonik.com` (ya da `AAAA 100::`) | Açık (yönlendirme kuralı için ZORUNLU) | Elle |
| CNAME | `app` | `<entegrasyonik-app>.pages.dev` | Açık | Pages → Custom domains (otomatik) |
| CNAME | `api` | `<railway-verdiği-hedef>.up.railway.app` | Önce KAPALI (sertifika çıkınca AÇIK) | Elle, Railway'in gösterdiği değerle |
| TXT | `_railway-verify.api` (Railway isterse) | `<railway-doğrulama-değeri>` | — | Elle |
| CNAME/R2 | `cdn` | R2 kovası (panel yönetir) | Açık | R2 → Custom Domains (otomatik) |
| CNAME/R2 | `images` | Aynı R2 görsel kovası | Açık | R2 → Custom Domains (otomatik) |
| MX/TXT | e-posta (Zoho, SPF/DKIM/DMARC) | mevcut değerler | — | Değişmez (ayrı karar, MASTER_STATE "Karar bekliyor") |

### 3. SSL/TLS
- Zone SSL modu **Full (strict)**. Pages ve R2 özel alan adları Cloudflare sertifikasıyla çalışır; Railway kendi (Let's Encrypt) kaynak
  sertifikasını `api.` için çıkarır → strict doğrulanır. Railway sertifikası çıkana kadar `api` kaydı DNS-only tutulur (ACME doğrulaması
  proxy arkasında gecikebilir), sonra proxy açılır.
- "Always Use HTTPS" açık; HSTS Cloudflare'de `max-age=15552000` (6 ay), `includeSubDomains` AÇIK, `preload` KAPALI (preload geri
  alınması aylar süren bir listedir — ayrı karar). Minimum TLS 1.2.
- Railway'in ürettiği `*.up.railway.app` alanı özel alan adı doğrulandıktan sonra **silinir** (Cloudflare'i/WAF'ı atlayan kapı olmasın);
  ayrıca `CORS_ORIGINS`'te zaten bulunmaz.

### 4. Çerez politikası
- `app.entegrasyonik.com` ve `api.entegrasyonik.com` aynı kayıtlı alan adı → **aynı site**; `fetch(..., { credentials: 'include' })`
  çapraz-ORIGIN ama aynı-SİTE istektir, `SameSite=Lax` çerez gönderilir.
- Karar: üretimde `SESSION_COOKIE_SAMESITE=lax`. Yeni env anahtarı; **tanımsızsa eski davranış** (development `lax`, diğer `none`) —
  kod bu ADR ile geldi, geçiş anında Railway değişkeniyle açılır, geri dönüş aynı değişkeni silmektir.
- `Domain` özniteliği **yazılmaz** (host-only): çerez yalnız `api.`'ye gider; `entegrasyonik.com` (site), `cdn.` ve `images.`'a asla
  gitmez. `Secure`, `HttpOnly`, `Path=/` aynı kalır. `SameSite=None` seçilirse `Secure` her ortamda zorlanır (tarayıcı kuralı).
- Engel koşulu: çerez tabanlı çapraz-site istemci (ör. `app://.` origin'li Electron paketi) üretimde kullanılıyorsa `lax` onu kırar.
  Hedef masaüstü istemci çerezsizdir (ADR-0007/0010, OAuth Bearer) — geçişten önce Electron kullanıcısı olmadığı doğrulanır.
- `__Host-` önekli çerez adı (Domain yasağını tarayıcıya zorlatır) sonraki adım: çerez adını değiştirmek tüm oturumları düşürür; bakım
  penceresiyle yapılır (BACKLOG).

### 5. CORS_ORIGINS hedef listesi (üretim)
`https://app.entegrasyonik.com` — yalnızca bu. Site API çağırmaz (`connect-src 'self'`); `entegrasyonik.com`/`www` listeden çıkar.
`app://.`, `localhost`, `192.168.x`, `onrender.com`, `up.railway.app` üretim listesinde OLMAZ (yerel `.env`'de kalabilir).
`CORS_CREDENTIALS=true`. Staging (varsa) kendi `app-staging.` origin'ini kendi Railway ortamında listeler.

### 6. CSP etkileri
- **Site** (`site/src/lib/headers.mjs`, Pages `_headers`): değişiklik gerekmez; `form-action` zaten `PUBLIC_APP_URL` origin'ini ekliyor →
  Pages derleme değişkeni `PUBLIC_APP_URL=https://app.entegrasyonik.com`, `PUBLIC_SITE_URL=https://entegrasyonik.com`.
- **Uygulama** (`frontend/`): Pages'te nginx yok → `frontend/public/_headers` gerekir (bulut FE görevi; içeriği
  `nginx-security-headers.conf`'un Pages karşılığı). `connect-src 'self' https://api.entegrasyonik.com https://<R2_HESAP_KİMLİĞİ>.r2.cloudflarestorage.com`
  (imzalı PUT **yalnız S3 API alan adında** çalışır, `cdn.` ile değil); `img-src 'self' data: blob: https://cdn.entegrasyonik.com https://images.entegrasyonik.com`
  + pazaryeri görsel alanları (bugünkü `https:` geniş kuralı Report-Only kaldıkça korunabilir). CSP önce Report-Only (ADR-0017 §10).
- **Backend** (helmet): yalnız JSON döndüğü için etkilenmez.

### 7. Görsel yükleme/sunum tasarımı (kod: `backend/src/services/storage/{presign,imagePolicy}.ts`, `StorageService`, `ImageService`)
1. **Bilet** `ImageService/createUploadUrl` `{ tempProductId, contentType, size }` → `{ uploadId, method:'PUT', url, headers, expiresAt, maxBytes }`.
   Tür izin listesi `image/jpeg|png|webp|avif`; tavan `IMAGE_UPLOAD_MAX_BYTES` (varsayılan 10 MB, mutlak 25 MB); TTL
   `IMAGE_UPLOAD_URL_TTL_SEC` (varsayılan 300 sn, en çok 900). `Content-Type` ve `Content-Length` SigV4 imzasına dahil. Hedef
   `uploads/<clientId>/<uploadId>` (128-bit rastgele). R2'ye istek atılmaz (yerel HMAC imzası; SigV4 AWS test vektörü + SDK imzalayıcısıyla
   çapraz testli).
2. **Anahtar** (kalıcı): `products/<clientId>/<tempProductId>/<sha256[0:32]>.<ext>` — tenant önekli (ADR-0013 B3 deseni, purge ile uyumlu),
   içerik-adresli (128-bit özet önekı), uzantı GERÇEK türden, değişmez. Aynı içerik aynı üründe ikinci kez onaylanırsa yeni nesne
   yazılmaz (dedupe).
3. **Onay** `ImageService/confirmUpload` `{ tempProductId, uploadId, originalname? }`: geçici nesne tavanlı okunur → sihirli bayt ile tür
   (SVG/GIF/HTML reddedilir) → `sharp` başlığından boyut (≤ 50 MP) → sha256 → kalıcı anahtara `Cache-Control: public, max-age=31536000, immutable`
   ile yazılır → geçici silinir → `products.images[]`'e `{ _id, url, key, contentType, sha256, size, width, height, order, originalname }`
   eklenir. Hatalar: 404 `UPLOAD_NOT_FOUND`, 413 `IMAGE_TOO_LARGE`, 415 `IMAGE_TYPE_NOT_ALLOWED`/`IMAGE_INVALID` (geçici nesne silinir).
   **Yetimler:** onaylanmayan geçici nesneleri R2 yaşam döngüsü kuralı (`uploads/` öneki, 1 gün) siler; kalıcı önekte yetim oluşmaz
   (kalıcı nesne yalnız onayda yazılır). DB yazımı nesne yazımından sonra başarısız olursa kalan kalıcı nesne aynı içerik tekrar
   onaylandığında yeniden kullanılır; toplu yetim taraması eşik aşılınca (aşağıda).
4. **Sunum:** `R2_PUBLIC_URL_IMAGE=https://cdn.entegrasyonik.com`. URL üretimi tek yerde: `publicImageUrl(key)`, `imageVariantUrl(key,{width,format})`,
   `marketplaceImageUrl(key,type)`. Cloudflare Image Transformations (`/cdn-cgi/image/width=…,format=auto/<anahtar>`) varsayılan
   KAPALI (`IMAGE_TRANSFORMATIONS_ENABLED=false` → boyutlandırma URL'i = orijinal, hiçbir şey kırılmaz); zone'da açılınca env ile açılır.
   Onay yanıtı `thumbUrl` (300 px) içerir — eski `_t` küçük resim nesnesi yeni akışta üretilmez.
5. **Pazaryeri URL'leri:** HTTPS + herkese açık zorunlu (`publicImageUrl` https olmayan kökü reddeder). webp/avif için dönüşüm açıksa
   `format=jpeg` URL'i, kapalıysa `needsConversion` işareti (dönüştürücüde uyarı). Trendyol ≤8 görsel sınırı dönüştürücüde uygulanır —
   dönüştürücülerin `key`'li görsellerde `marketplaceImageUrl` kullanması ayrı iş paketi (WP9 alanı; BACKLOG).
6. **Silme/yeniden adlandırma:** `deleteImage`/`deleteImageSelected` `key`'li görselde TAM anahtarla siler; anahtar bu tenant'ın
   `products/<clientId>/` önekinde değilse R2'ye dokunulmaz. İçerik-adresli nesne **yeniden adlandırılmaz**: görünen ad yalnız DB
   metadatasıdır (`originalname`); anahtar değişmez (önbellek/pazaryeri URL'leri kırılmaz).
7. **Tenant silme (ADR-0003):** `StorageService.deletePrefix` artık `uploads/<clientId>/` önekini de siler (`clients/`, `products/`,
   `exports/` yanında; sonda `/` ile kardeş tenant eşleşmez).
- Eski multipart yolu (`POST /api/upload`) **olduğu gibi çalışır**; FE yeni akışa geçince kaldırılması ayrı karardır.

### 8. Render emekliliği
`entegrasyonik.onrender.com` `api.` canlıya alınıp doğrulama listesi (DEPLOYMENT.md §6) geçtikten sonra 7 gün yedekte bekletilir, sonra
servis silinir ve `CORS_ORIGINS`'ten çıkarılır. Gerekçe: `SameSite=Lax` ile `app.` → `onrender.com` çapraz-site olduğundan oturum
çalışmaz; iki canlı backend iki zamanlayıcı/kuyruk tüketicisi demektir (ADR-0006 tek süreç varsayımı, lease'e rağmen gereksiz risk);
ek maliyet ve sır yüzeyi.

### 9. Dağıtım politikası
Railway servisi GitHub deposuna BAĞLANMAZ; dağıtım `backend/` içinden `railway up --service backend --environment production`
(CLI) ile yapılır. Derleme `backend/railway.toml` (Dockerfile yapıcısı, dağıtım sağlık kontrolü `/ready`, yeniden başlatma
`ON_FAILURE`). Pages projeleri Git bağlı olabilir (statik, geri alma tek tık) ama **üretim dalı otomatik dağıtımı kapalı** tutulur
("Production branch deployments" devre dışı; önizleme dağıtımları açık) ya da Direct Upload (`wrangler pages deploy`) kullanılır.

### 10. Geri dönüş planı
| Ne bozuldu | Geri dönüş | Süre |
|---|---|---|
| Site/app yeni dağıtımı | Pages → Deployments → önceki dağıtım "Rollback" | dakikalar |
| Backend yeni imajı | Railway → Deployments → önceki dağıtım "Redeploy" | dakikalar |
| Oturum/çerez sorunu | Railway'de `SESSION_COOKIE_SAMESITE` sil (→ `none`) | 1 yeniden başlatma |
| `api.` alan adı/SSL sorunu | `api` DNS kaydını DNS-only yap; gerekirse FE `VITE_API_BASE_URL`'i geçici olarak Railway/Render alanına çevirip yeniden derle (Render emekliye ayrılana kadar yedek) | dakikalar |
| Doğrudan görsel yükleme | FE eski multipart yoluna döner (backend'de ikisi birlikte çalışır); `cdn.` sorunu için `images.` aynı kovayı sunar | FE dağıtımı |
| DNS geçişi (nameserver) | Eski DNS sağlayıcısındaki kayıtlar geçiş tamamlanana dek silinmez; nameserver'ı geri çevirmek (TTL kadar) | saatler |

## Gerekçe
Tek haneli abone ölçeğinde en ucuz ve en az hareketli parçalı düzen: statik yüzler için Pages ücretsiz ve CDN'li, Railway'de yalnız
tek süreç + Redis (ADR-0006), R2'nin çıkış ücreti yok. Aynı-site alt alan adları, Worker vekili (A4) gibi ek bileşen kurmadan
`SameSite=None`'dan `Lax`'a inmeyi sağlar — CSRF yüzeyi küçülür, kod değişikliği tek env anahtarıdır. Görsel akışında B1, bayt trafiğini
API'den tamamen çıkarırken içerik-adresliliği SUNUCU garantisine bağlar; ek bağımlılık gerektirmez (SigV4 imzalayıcısı ~100 satır,
`@aws-sdk/s3-request-presigner` eklenmedi, AWS test vektörüyle doğrulandı).

## Maliyet/Ölçek Notu
- Cloudflare: Pages (ücretsiz plan: 500 derleme/ay, sınırsız istek), R2 (10 GB depolama + 1 M Class A / 10 M Class B işlem/ay ücretsiz;
  çıkış ücretsiz), Image Transformations (ücretsiz kota aylık 5.000 benzersiz dönüşüm; aşımı ücretli — fiyat panelden doğrulanır).
  Railway: backend + Redis kullanım bazlı; Render iptaliyle bir servis ücreti düşer.
- Doğrudan yükleme bir görsel için: 1 PUT + 1 GET + 1 PUT + 1 DELETE (Class A/B) — ücretsiz kotanın çok altında.
- **Gözden geçirme eşikleri:**
  - Aylık benzersiz dönüşüm 5.000'i aşarsa → yükleme anında sabit boyut ön-üretimi (sharp) ile Transformations maliyeti karşılaştırılır.
  - Görsel kovası 10 GB'ı ya da aylık Class A işlem 1 M'yi aşarsa → yetim/eski-kayıt taraması (DB `key`/`url` ↔ R2 listesi) zamanlanmış işe bağlanır.
  - `images.` alanına gelen istek son 30 günde 0 ise ya da DB'de `images.` URL'li görsel kalmadıysa → `images.` özel alan adı kaldırılır.
  - Web replikası ≥ 2 olursa → rate limit Redis'e (ADR-0017 §10); Railway tek bölge p95 API gecikmesi 400 ms'yi sürekli aşarsa → bölge/ölçek.
  - Çerezsiz masaüstü/mobil istemci üretime alınırsa → ADR-0010 akışı; çerez politikası değişmez.

## Etki Alanı
- Backend: `src/api/Security.ts` (SameSite env), `src/config/env.ts` (+`SESSION_COOKIE_SAMESITE`, `IMAGE_UPLOAD_*`, `IMAGE_TRANSFORMATIONS_ENABLED`),
  `src/services/storage/{presign,imagePolicy,StorageService,S3Manager}.ts`, `src/api/services/image-service.ts`,
  `src/services/image/image-operations.ts` (URL yazım hatası), `src/capabilities/{domains/catalog,rpc-input/media}.ts`, `backend/railway.toml`,
  `.env.example`.
- Frontend (bulut görevi): `public/_headers` (CSP/başlıklar), doğrudan yükleme istemcisi (`docs/IMAGE_UPLOAD_CONTRACT.md`),
  `VITE_API_BASE_URL=https://api.entegrasyonik.com/api/`, `VITE_IMAGE_BASE_URL`.
- Site: yalnız derleme değişkenleri. Operasyon: `docs/DEPLOYMENT.md`.

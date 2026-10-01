# Dağıtım Runbook'u — Cloudflare (site, uygulama, R2) + Railway (API)

Karar ve gerekçe: `docs/adr/0027-barindirma-duzeni-alan-adlari-ve-gorsel-yukleme.md`. Bu belge yalnız **adım** ve **ad/konum**
içerir; hiçbir sır, parola, anahtar ya da hesap kimliği DEĞERİ buraya (veya başka bir proje belgesine / commit mesajına) yazılmaz
(CLAUDE.md kural 4). Değerler yalnız ilgili panelin "Variables / Environment variables / Secrets" alanına girilir.
Her adım insan eliyledir (Protokol 12). Sıra önemlidir: **R2 → Railway (API) → Pages (uygulama) → Pages (site) → DNS geçişi → doğrulama → Render emekliliği.**

Hedef düzen: `entegrasyonik.com` site · `www` → apex 301 · `app.` uygulama · `api.` backend · `cdn.` görseller (+ `images.` eski URL'ler).

---

## 0. Ön koşullar
- [ ] `entegrasyonik.com` Cloudflare'de bir **zone** olarak ekli, alan adı kayıt firmasında nameserver'lar Cloudflare'in verdiği iki ad sunucusuna çevrili, zone durumu **Active**.
  Geçişten ÖNCE eski DNS sağlayıcısındaki tüm kayıtlar (özellikle MX/SPF/DKIM/DMARC — Zoho) Cloudflare'e aynen taşınmış olmalı; eski sağlayıcıdaki kayıtlar geçiş doğrulanana dek silinmez.
- [ ] MongoDB Atlas: üretim kullanıcısı yalnız izinli veritabanlarına yetkili (CLAUDE.md kural 2). **Network Access kararı** (insan): Railway'in çıkış IP'leri sabit değildir → (a) Railway Pro "static outbound IPs" + Atlas IP izin listesi, ya da (b) `0.0.0.0/0` + güçlü parola + TLS (tek haneli ölçekte kabul edilebilir risk, karar kaydı gerekir).
- [ ] Güncel, doğrulanmış yedek (`backup/README.md`) — dağıtım DB şemasına dokunmasa da ilk canlı açılış öncesi zorunlu kontrol.
- [ ] Araçlar (kullanıcı makinesi): Railway CLI (`railway`), isteğe bağlı Cloudflare Wrangler (`npx wrangler`, yalnız Pages "Direct Upload" seçilirse).

## 1. Cloudflare zone ayarları
1. **SSL/TLS → Overview:** şifreleme modu **Full (strict)**.
2. **SSL/TLS → Edge Certificates:** Always Use HTTPS = Açık; Minimum TLS = 1.2; Automatic HTTPS Rewrites = Açık;
   HSTS = Açık, `max-age` 6 ay, `includeSubDomains` Açık, `preload` KAPALI, No-Sniff Açık. (HSTS'yi tüm alt alanlar HTTPS'te
   doğrulandıktan SONRA aç — §6.)
3. **Rules → Redirect Rules → Create rule** (ad: `www-to-apex`):
   - Eşleşme: *Hostname* equals `www.entegrasyonik.com`
   - Eylem: *Dynamic*, ifade `concat("https://entegrasyonik.com", http.request.uri.path)`, durum **301**, *Preserve query string* işaretli.
4. **DNS → Records** (ADR-0027 §2 tablosu). Pages/R2 kayıtlarını ilgili panel otomatik açar; elle açılanlar:
   | Tip | Ad | Hedef | Proxy |
   |---|---|---|---|
   | CNAME | `www` | `entegrasyonik.com` | Proxied (yönlendirme kuralının çalışması için zorunlu) |
   | CNAME | `api` | Railway'in custom domain ekranında gösterdiği hedef (`<…>.up.railway.app`) | Önce **DNS only**, Railway sertifikası "Issued" olunca **Proxied** |
   | TXT | Railway'in istediği doğrulama adı (varsa) | Railway'in gösterdiği değer | — |

## 2. R2 (görseller + arşiv)
1. **Kovalar** (R2 → Create bucket; konum otomatik):
   - Görsel kovası — adı `R2_BUCKET_IMAGE`'e yazılır. Üretimde ad `-dev` ile BİTEMEZ (`storageEnv.ts` reddeder); geliştirme için ayrı `…-dev` kova.
   - Arşiv kovası — adı `R2_BUCKET_ARCHIVE`'e. **Herkese açık erişim YOK.**
2. **Görsel kovası → Settings → Public access:**
   - *Custom Domains → Connect Domain* → `cdn.entegrasyonik.com` (DNS kaydını R2 açar). Eski kayıtlar için ikinci alan: `images.entegrasyonik.com`.
   - *R2.dev subdomain* → **Disallow** (kova yalnız özel alan adlarından okunur).
3. **Görsel kovası → Settings → CORS policy** (tarayıcıdan imzalı PUT için; JSON):
   ```json
   [
     {
       "AllowedOrigins": ["https://app.entegrasyonik.com"],
       "AllowedMethods": ["PUT", "GET", "HEAD"],
       "AllowedHeaders": ["content-type"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
   Arşiv kovasına CORS kuralı **eklenmez** (tarayıcı doğrudan erişmez; KVKK indirmesi backend üzerinden akar).
4. **Object lifecycle rules:**
   - Görsel kovası: `uploads-expire` — önek `uploads/`, *Delete objects* **1 gün** sonra (onaylanmamış doğrudan yüklemeler). Ayrıca tüm kova için *Abort incomplete multipart uploads* 1 gün.
   - Arşiv kovası: `exports/` öneki için ADR-0003'teki dışa aktarma saklama süresine eşit silme kuralı (süre belirlenmediyse 7 gün önerilir; insan kararı).
5. **R2 → Manage R2 API Tokens → Create API token:** izin *Object Read & Write*, kapsam **yalnız bu iki kova**, süre sınırlı/rotasyon takvimli.
   Çıktılar → Railway Variables: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`. S3 uç noktası (`https://<hesap-kimliği>.r2.cloudflarestorage.com`) → `R2_ENDPOINT`.
6. **(İsteğe bağlı) Image Transformations:** Images → Transformations → zone `entegrasyonik.com` için **Enable**; *Allowed origins/sources*
   yalnız bu zone (başka sitelerin görsellerini dönüştürmek için kötüye kullanılmasın). Açıldıktan sonra Railway'de
   `IMAGE_TRANSFORMATIONS_ENABLED=true`. Kapalıyken uygulama orijinal URL'i kullanır (kırılma yok).
7. **(İsteğe bağlı) Cache Rule:** `cdn.entegrasyonik.com` → *Eligible for cache*, Edge TTL *Use cache-control header if present*
   (yeni nesneler `public, max-age=31536000, immutable` taşır).

## 3. Railway (API + Redis)
1. **Proje** `entegrasyonik`, ortam `production`. GitHub deposu **bağlanmaz** (otomatik dağıtım yok; ADR-0027 §9).
   Mevcut bir servis GitHub'a bağlıysa: *Service → Settings → Source → Disconnect*.
2. **Redis:** *New → Database → Redis*. Servis adı `Redis`.
3. **Backend servisi:** *New → Empty Service*, ad `backend`. Yapılandırma `backend/railway.toml`'dan okunur
   (Dockerfile yapıcısı, sağlık kontrolü `/ready`, `ON_FAILURE` yeniden başlatma, tek replika). Kaynak dizin: CLI `backend/` içinden çalıştırılır.
   `.railwayignore` yerel `.env*` dosyalarının yüklenmesini engeller; imaja da girmez (`.dockerignore`).
4. **Networking:** *Settings → Networking → Custom Domain* → `api.entegrasyonik.com`, hedef port **5001**. Railway'in gösterdiği CNAME
   hedefini (ve varsa doğrulama TXT'sini) §1.4'e gir. Sertifika "Issued" olunca Cloudflare'de proxy'yi aç.
   Özel alan doğrulandıktan sonra Railway'in ürettiği `*.up.railway.app` alan adını **sil** (Cloudflare'i atlayan kapı kalmasın).
5. **Variables** (§4 listesi). Redis referansları: `REDIS_HOST=${{Redis.REDISHOST}}`, `REDIS_PORT=${{Redis.REDISPORT}}`,
   `REDIS_PASSWORD=${{Redis.REDISPASSWORD}}` (Railway referans sözdizimi; değer değil).
   > Not: Railway iç ağı (`*.railway.internal`) bazı ortamlarda yalnız IPv6'dır; `RedisService` ioredis'in varsayılan IPv4 çözümlemesini
   > kullanır. İlk açılışta Redis bağlantı hatası görülürse → BACKLOG "Redis IPv6/dual-stack (`family: 0`)" maddesi (küçük kod değişikliği) uygulanır;
   > geçici yol Redis servisinin TCP proxy adresi + `REDIS_TLS` (egress ücretli).
6. **Elle dağıtım** (yalnız kullanıcı istediğinde):
   ```bash
   cd backend
   railway login                       # bir kez
   railway link                        # proje: entegrasyonik, ortam: production, servis: backend (bir kez)
   railway up --service backend --environment production   # yükle + derle + dağıt (loglar akar; --detach ile arka plan)
   railway logs --service backend      # izleme
   ```
   Panelden alternatif: *Deployments → Redeploy* (son imajı yeniden başlatır). Geri dönüş: önceki dağıtımda *Redeploy*.

## 4. Railway ortam değişkenleri (yalnız ADLAR — kaynak `backend/.env.example`)
| Grup | Adlar | Üretim notu |
|---|---|---|
| Rol/ortam | `APP_ROLE`, `NODE_ENV`, `APP_ENV`, `LOG_LEVEL`, `LOG_FORMAT`, `POD_NAME`, `GIT_SHA` | `APP_ROLE=all`, `NODE_ENV=production` (imaj zaten ayarlar), `APP_ENV=production`, `LOG_FORMAT=json`; CLI dağıtımında commit SHA otomatik gelmez → `GIT_SHA` elle |
| HTTP | `SERVER_NAME`, `SERVER_CONTEXT`, `SERVER_HOST`, `SERVER_PORT`, `PORT`, `SERVER_TIMEOUT_SEC`, `IMAGE_FILES_PATH` | `SERVER_PORT=5001`, `PORT=5001` (Railway yönlendirmesi), `SERVER_HOST` boş (0.0.0.0) |
| CORS/çerez/vekil | `CORS_ORIGINS`, `CORS_METHODS`, `CORS_CREDENTIALS`, `SESSION_COOKIE_SAMESITE`, `TRUSTED_PROXY_HOPS` | `CORS_ORIGINS=https://app.entegrasyonik.com` (yalnız bu); `CORS_CREDENTIALS=true`; `SESSION_COOKIE_SAMESITE=lax` (ADR-0027 §4 engel koşulu kontrol edildikten sonra); `TRUSTED_PROXY_HOPS` §6 ile doğrulanır (beklenen 2: Cloudflare + Railway kenarı) |
| DB | `DB_URL`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_POOL_SIZE`, `TENANT_DB_ROLE_MAX` | Atlas; `LOCAL_DB_*` üretimde TANIMLANMAZ |
| Redis | `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_TLS` | Railway referansları (§3.5) |
| Kimlik/şifreleme | `JWT_SECRET`, `JWT_SECRET_PREVIOUS`, `JWT_ISSUER`, `FIELD_ENCRYPTION_KEYS`, `FIELD_ENCRYPTION_ACTIVE_KID` | Sır; yoksa süreç başlamaz (fail-fast). Üretimi/rotasyonu insan (BACKLOG C1/C5) |
| Depolama | `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_REGION`, `R2_BUCKET_IMAGE`, `R2_BUCKET_ARCHIVE`, `R2_PUBLIC_URL_IMAGE`, `R2_PUBLIC_URL_ARCHIVE` | `R2_REGION=auto`; `R2_PUBLIC_URL_IMAGE=https://cdn.entegrasyonik.com` (https ZORUNLU — pazaryeri URL'leri bundan); `R2_PUBLIC_URL_ARCHIVE` boş (arşiv özel) |
| Görsel yükleme | `IMAGE_UPLOAD_MAX_BYTES`, `IMAGE_UPLOAD_URL_TTL_SEC`, `IMAGE_TRANSFORMATIONS_ENABLED` | Boş = 10 MB / 300 sn / false |
| E-posta | `ZOHO_SMTP_HOST`, `ZOHO_SMTP_PORT`, `ZOHO_SMTP_USER`, `ZOHO_SMTP_PASS`, `FROM_EMAIL`, `FROM_NAME`, `PUBLIC_APP_URL` | `PUBLIC_APP_URL=https://app.entegrasyonik.com` |
| Rate limit | `GLOBAL_RATE_LIMIT_*`, `LOGIN_RATE_LIMIT_*`, `REGISTER_RATE_LIMIT_*`, `PASSWORD_RESET_RATE_LIMIT_*`, `ACCOUNT_TOKEN_RATE_LIMIT_*`, `BILLING_WEBHOOK_RATE_LIMIT_*`, `MOCK_CHECKOUT_RATE_LIMIT_*` | Boş = kod varsayılanları |
| Ödeme | `PAYMENT_PROVIDER`, `PAYMENT_ENV`, `BILLING_MOCK_HMAC_SECRET`, `MOCK_CHECKOUT_BASE_URL`, `MOCK_CHECKOUT_RETURN_URL`, `ENTITLEMENT_GUARD_ENABLED` | Ödeme sağlayıcısı kararı ADR-0008 (mock üretimde yanıt vermez) |
| Pazaryeri mock | `*_MOCK_MODE`, `*_MOCK_BASE_URL`, `*_MOCKABLE_ENDPOINTS` (TY, PAZARAMA, N11, HEPSIBURADA, IDEASOFT, BIZIMHESAP) | Üretimde **tanımlanmaz / false** |
| Zamanlayıcı/uyum | `SCHEDULER_LEASE`, `EXPORT_IDLE_POLL_MS`, `PROBES_LIVE`, `SOURCE_MONITOR_ENABLED`, `SOURCE_MONITOR_USER_AGENT`, `TWO_PERSON_RULE_ENABLED` | Boş = kod varsayılanları |

Sağlık uçları (context `/api` DIŞINDA, kimliksiz): `GET /health` (liveness, sabit 200), `GET /ready` (Mongo + Redis; Railway dağıtım kontrolü).

## 5. Cloudflare Pages (uygulama ve site)
Her iki proje için iki yol var; **birini** seç:
- **Git bağlı** (önerilen: önizleme dağıtımları + tek tık geri alma): *Workers & Pages → Create → Pages → Connect to Git*.
  *Settings → Builds & deployments → Production branch* → "Automatic production branch deployments" **KAPALI**
  (üretime alma yalnız panelden elle *Retry/Deploy* ya da dalı bilinçli güncelleyerek). Önizleme dağıtımları açık kalabilir.
- **Direct Upload:** yerelde derle, `npx wrangler pages deploy <klasör> --project-name <proje>`.

| | Uygulama | Site |
|---|---|---|
| Proje adı | `entegrasyonik-app` | `entegrasyonik-site` |
| Kök dizin (Root directory) | `frontend` | `site` |
| Derleme komutu | `npm ci && npm run build` | `npm ci && npm run build` |
| Çıktı klasörü | `dist` | `dist` (`_headers` derlemede üretilir) |
| Ortam değişkeni ADLARI | `NODE_VERSION`, `VITE_API_BASE_URL`, `VITE_IMAGE_BASE_URL`, `VITE_SITE_URL` | `NODE_VERSION`, `SITE_DRAFT`, `PUBLIC_APP_URL`, `PUBLIC_SITE_URL` |
| Değer notu | `VITE_API_BASE_URL=https://api.entegrasyonik.com/api/`, `VITE_IMAGE_BASE_URL=https://cdn.entegrasyonik.com/`, `VITE_SITE_URL=https://entegrasyonik.com`, `NODE_VERSION` ≥ 20 | `NODE_VERSION` ≥ 22.12 (`site/package.json` engines), `PUBLIC_APP_URL=https://app.entegrasyonik.com`, `PUBLIC_SITE_URL=https://entegrasyonik.com`, `SITE_DRAFT=false` yalnız yayın kararıyla |
| Özel alan adı | *Custom domains* → `app.entegrasyonik.com` | *Custom domains* → `entegrasyonik.com` (apex; CNAME düzleştirme otomatik) |
| SPA | Çıktıda `404.html` OLMAMALI → Pages bilinmeyen yolları `index.html`'e düşürür | Statik; `404.html` var (Astro) |
| Başlıklar | `frontend/public/_headers` gerekir (FE bulut görevi; `nginx-security-headers.conf` karşılığı + ADR-0027 §6 CSP: `connect-src` → `api.` ve R2 S3 uç noktası) | `site/src/lib/headers.mjs` üretir; değişiklik yok |

Site derlemesi repo kökündeki tasarım token'larını okur (`astro.config.mjs` → `..`); Git bağlı kurulumda depo tümüyle klonlandığı için sorun yok.

## 6. Doğrulama kontrol listesi (canlıya almadan önce ve sonra)
- [ ] `curl -sI "https://www.entegrasyonik.com/fiyatlandirma?x=1"` → `301`, `location: https://entegrasyonik.com/fiyatlandirma?x=1`
- [ ] `curl -sI https://entegrasyonik.com/` → `200`, `content-security-policy` başlığı var; `http://` → `https://` yönlendirmesi.
- [ ] `https://app.entegrasyonik.com/herhangi/derin/yol` tarayıcıda uygulamayı açar (SPA geri düşüşü); `_headers` başlıkları yanıtta.
- [ ] `curl -s https://api.entegrasyonik.com/health` → `{"status":"ok"}`; `/ready` → `200`.
- [ ] CORS: `curl -si -X OPTIONS https://api.entegrasyonik.com/api/SecurityService/login -H "Origin: https://app.entegrasyonik.com" -H "Access-Control-Request-Method: POST"`
      → `204`, `access-control-allow-origin: https://app.entegrasyonik.com`, `access-control-allow-credentials: true`.
      Aynı istek `Origin: https://example.org` ile → `access-control-allow-origin` YOK.
- [ ] Giriş (tarayıcı DevTools → Application → Cookies, `api.entegrasyonik.com`): `JWT_TOKEN` — `HttpOnly`, `Secure`, `SameSite=Lax`, **Domain sütunu `api.entegrasyonik.com` (host-only)**; sayfa yenilemede oturum korunuyor; çıkış çerezi siliyor.
- [ ] SSL: `curl -vI https://api.entegrasyonik.com/health` sertifika geçerli; Cloudflare SSL modu Full (strict) iken 525/526 hatası yok.
- [ ] Eski Railway üretilmiş alanı silinmiş (erişilemiyor); `CORS_ORIGINS` yalnız `app.`.
- [ ] İstemci IP'si: giriş sonrası denetim günlüğündeki IP (`AuditService/getAuditLogs` ya da log satırı) kendi genel IP'n ile aynı → `TRUSTED_PROXY_HOPS` doğru; değilse değeri 1/2/3 deneyerek eşleştir (yanlış değer rate limit'i tüm kullanıcılara tek IP gibi uygular).
- [ ] Görsel: ürün düzenleme ekranında görsel yükle → tarayıcı ağ sekmesinde `PUT https://<hesap>.r2.cloudflarestorage.com/...` `200`,
      ardından `ImageService/confirmUpload` `200`; dönen `url` `https://cdn.entegrasyonik.com/products/<clientId>/...`;
      `curl -sI <url>` → `200`, `content-type: image/…`, `cache-control: public, max-age=31536000, immutable`; ikinci istekte `cf-cache-status: HIT`.
- [ ] `images.entegrasyonik.com` altındaki eski bir görsel URL'i `200` (eski kayıtlar kırılmadı).
- [ ] Arşiv kovası herkese kapalı; `r2.dev` alt alanı kapalı.
- [ ] Mock bayrakları üretimde kapalı (log'da mock uyarısı yok); `NODE_ENV=production`.
- [ ] Bir pazaryeri test ürününde görsel URL'lerinin `https://cdn.…` ile gittiği (entegrasyon log'u).
- [ ] HSTS'yi (§1.2) ancak bu listenin tamamı geçtikten sonra aç.

## 7. Render emekliliği
1. §6 tamamen geçtikten sonra Render servisini **askıya al** (silme değil) — 7 gün yedek.
2. 7 gün sorun yoksa: Render servisini sil; `CORS_ORIGINS`'te `onrender.com` kalmadığını doğrula; Render'daki ortam değişkenlerinde kalan sırları
   (JWT/R2/DB) **rotasyona** al (başka yerde kopyası kalmış sır sayılır).
3. Railway'de eski staging alanı (`entegrasyonik-production.up.railway.app`) kullanılmıyorsa sil.

## 8. Geri dönüş
| Durum | Adım |
|---|---|
| Uygulama/site yeni dağıtımı hatalı | Pages → *Deployments* → önceki başarılı dağıtım → *Rollback to this deployment* |
| Backend yeni imajı hatalı | Railway → *Deployments* → önceki dağıtım → *Redeploy* |
| Oturum/çerez sorunu (giriş olmuyor) | Railway'de `SESSION_COOKIE_SAMESITE`'ı sil (→ eski `none`), yeniden başlat |
| `api.` alan adı/SSL | `api` kaydını *DNS only* yap; kalıcı sorun: FE'yi geçici olarak eski backend alanına (`VITE_API_BASE_URL`) derle (Render emekli edilene kadar) |
| Doğrudan görsel yükleme | FE eski multipart yoluna döner (backend ikisini birlikte sunar) |
| `cdn.` alanı | `R2_PUBLIC_URL_IMAGE`'i `https://images.entegrasyonik.com`'a çevir (aynı kova), yeniden başlat |
| DNS/nameserver geçişi | Eski DNS sağlayıcısındaki kayıtlar silinmediği için nameserver'ı geri çevir (yayılma TTL kadar) |

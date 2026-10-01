# Backlog önerileri — Görev 1d (ürün yüzeyleri)

Format: açıklama · seviye · kaynak dosya:satır

Not: JWT imzasız `decode` ve gömülü JWT sırrı zaten `backlog-1b.md`'de critical (`backend/src/api/Security.ts:15`, `ApiManager.ts:70,84`). Burada tekrar edilmedi.

## critical
- Git'te takipli 34 MB `ncc` bundle, kimlik bilgili Atlas bağlantı dizesi (2 yer) ve JWT sırrı içeriyor; dosya + git geçmişi temizliği ve rotasyon (Protokol 12 kararına bağlı) · critical · gitlab/entegrasyonikapp/backend.js (bundle; satır numarası anlamsız, `grep -c mongodb+srv` ile bulunur)
- Mock sunucu Mongo bağlantı dizesi kimlik bilgisiyle birlikte kaynağa gömülü; env'e taşınmalı (yerel mock kullanıcısı ama git'te) · critical · mockserver/backend/server.js:17

## planned
- `SubscriptionView.vue` (6662 satır) ürünle ilgisiz "LGS yol haritası" içeriği; `LgsService` backend'de yok; gerçek abonelik/plan/fatura ekranı yok. Route + menü kaydı yanlış ekrana bağlı · planned · frontend/src/views/secure/user/SubscriptionView.vue:1; frontend/src/router/index.ts:406-415; frontend/src/stores/site/menu.ts:64-65
- Tanıtım sitesi iletişim formu ağ isteği yapmıyor (talep kayboluyor); fiyat sayfası butonları abonelik yerine iletişim formuna gidiyor; abonelik/kayıt akışı yok · planned · gitlab/www/client/alternative/iletisim.html:44,135-141; gitlab/www/client/alternative/fiyatlandirma.html:54,76
- `gitlab/www/index.js` kökte doldurulmamış Start Bootstrap şablonunu servis ediyor; gerçek site `alternative/` altında ve 6 tasarım varyantı (kök + 2..6) halinde; tek varyant seçimi + kök yerleşimi gerekli · planned · gitlab/www/client/index.html; gitlab/www/client/alternative/
- `vue-tsc --noEmit` TS6504 ile kırık (2 SFC `<script setup>` `lang="ts"` yok) → `npm run build` type-check adımında düşer, semantik tip hataları görünmüyor · planned · frontend/src/components/layout/EmptyState.vue:16; frontend/src/components/platforms/PlatformImageComponent.vue:33
- API adresi derleme zamanı sabit (`127.0.0.1:5001`), ortam değişkeni yok; staging/üretim yorum satırı değiştirerek seçiliyor · planned · frontend/src/composables/restapi.ts:6-27
- `restapi.ts` hata durumunda axios hata nesnesini başarılı yanıt gibi döndürüyor; global hata/401 yönetimi ve backend kodu→mesaj tablosu yok (Skill hata standardı) · planned · frontend/src/composables/restapi.ts:52-56,102-106
- Vite tek dosya bundle (`inlineDynamicImports`, kod bölme kapalı): 2.8 MB JS + 778 KB CSS; Lighthouse ≥80/LCP<2.5sn hedefi için birincil engel · planned · frontend/vite.config.mts:16-19
- Servis çalışanı `cache.addAll` listesinde olmayan `/icons/icon-512.jpg` var → SW kurulumu başarısız, PWA/offline fiilen çalışmıyor; manifest `short_name` yer tutucu ("KısaAd"), ikonlar yalnızca webp · planned · frontend/public/service-worker.js:2-8; frontend/public/manifest.json:3-15; (kopya) gitlab/entegrasyonikapp/client/service-worker.js
- i18n: dil `tr`'ye zorlanmış, `en.json` 26 anahtar (tr 808); 203 .vue dosyasında hardcode Türkçe metin · planned · frontend/src/plugins/i18n.ts:39; frontend/src/plugins/locales/en.json
- Tema: `danger`/`info` renkleri `#` olmadan tanımlı (geçersiz); dark tema light'ın alt kümesi; dark mode kapalı (`toggleTheme` yorum satırı); spacing/tipografi/radius/motion token'ı yok; 1.717 hex, 2.210 inline style · planned · frontend/src/plugins/vuetify.ts:185-186,222-223,266; frontend/src/stores/theme.ts:9-11
- Skill motion ihlali: overshoot/bounce `cubic-bezier(0.175,0.885,0.32,1.275)` 0.5–0.7 sn ve pulse/ripple animasyonları · planned · frontend/src/components/dashboard/NavigationLinksComponent.vue:165; …Bottom.vue:163; …Left.vue:170; …Right.vue:147; frontend/src/components/claim/ClaimDetailComponent.vue:814,840,929
- Erişilebilirlik: elle `aria-*`/`role` 0 oluşum, `html lang="en"` (arayüz TR), kontrast ölçülmemiş; sol menü `mouseover` ile açılıyor (dokunmatik/klavye) · planned · frontend/index.html:2; frontend/src/layouts/SecureLayout.vue:3
- Responsive: Vuetify kırılımları (sm 600/md 960) Skill kırılımlarıyla (768/1024) uyumsuz; `useDisplay` 5 dosyada; sekme + hover-menü modeli mobilde zayıf · planned · frontend/src/plugins/vuetify.ts:254-262 (display bloğu); frontend/src/layouts/SecureLayout.vue:430
- İki paralel gezinme sistemi: vue-router secure rotaları fiilen ölü, ekranlar sekme store'u ile açılıyor (URL değişmiyor, derin bağlantı yok); `SecureLayout` içinde `<router-view>` yok. Mimari karar gerektirir → architect · planned · frontend/src/layouts/SecureLayout.vue; frontend/src/stores/site/menu.ts:16-58; frontend/src/router/index.ts
- Router hataları: `adminPanel` redirect hedefi mevcut olmayan yol, bileşen olarak `IntegrationsView` kopyası; catch-all/404 yok; rol guard'ı yok (yalnızca `requiresAuth`) · planned · frontend/src/router/index.ts:308,314,503-525
- Yetim/atıl dosyalar: `InvoiceListViewGECICIBACK.vue`, `ProductListViewVertical.vue`, `TEST.vue`, `properties/NewOptionView.vue`, `properties/NewTagView.vue`, `unsecure/LicenceView.vue`, `unsecure/PrivacyView.vue`, `stores/navigation.ts` (knip ile teyit edilmeli) · planned · frontend/src/views/secure/InvoiceListViewGECICIBACK.vue; frontend/src/views/secure/productDefinitions/TEST.vue; frontend/src/views/unsecure/PrivacyView.vue
- ESLint/Prettier/Stylelint ve frontend test altyapısı yok; `: any` 2197, `console.log` 147 · planned · frontend/package.json
- `frontend/nginx.conf` gzip/brotli/cache header içermiyor; SPA imajı sıkıştırmasız sunuyor · planned · frontend/nginx.conf
- `gitlab/` klasörü: 1417 takipli `node_modules` dosyası (gitlab/www + gitlab/entegrasyonikapp), 34 MB bundle, `alternative/moduller.zip`, `{moduller,entegrasyonlar,assets}` adlı boş dizinler, `test/` şablonu (114 dosya); repo pack ≈437 MB. Yerel uygulama repo kararından önce temizlik/ayrıştırma (dağıtım artefaktlarını repo dışına al) · planned · gitlab/
- Backend Dockerfile mevcut derleme çıktısıyla uyumsuz (`CMD node application.js`, çıktı `dist/entegrasyonik.js`, imajda `npm install` yok); `build` scripti `set NODE_ENV=…` Windows'a özgü; CI yapılandırması yok · planned · backend/Dockerfile:14,23; backend/package.json:8
- Jenerik RPC dağıtımı: `microserviceInstance[operation]()` istemci verili adı doğrudan çağırıyor (izinli metot listesi yok); hata yanıtları `request: req.body` yansıtıyor. Canlı doğrulama gerekli → architect/security değerlendirmesi · planned · backend/src/api/ApiWrapper.ts:11-12; backend/src/api/ApiManager.ts:18,33,43,53,64,77,91
- Kayıtsız/hatalı servis dosyaları: `ecommerce-service.ts` `api/index.ts`'de yorum satırında, `marketplace-service.ts1` uzantı hatası (`api/index.ts:4` yorumda); `RegisterService` yalnızca `hebeleService` test metodu içeriyor (kayıt `SecurityService.register` üzerinden) · planned · backend/src/api/index.ts:4,21,33,49; backend/src/api/services/register-service.ts:9
- Electron kabuğu: `preload` yok, uygulama içinde port 3000'de Express açıp kendine bağlanıyor (`loadURL('http://localhost:3000')`), auto-update yok, `electron-squirrel-startup` kullanılmıyor, imzalama/publisher yok, Electron 29 · planned · frontend/main.js:7-16,44-52; frontend/forge.config.js:1-45; frontend/package.json:26
- Tauri için çapraz-site oturum çerezi (`SameSite=None; Secure`) ve `CORS_ORIGINS` uyumu prototiple doğrulanmalı; token tabanlı oturum alternatifi ADR'de değerlendirilmeli · planned · backend/src/api/Security.ts:34-46; backend/src/Webserver.ts:47-53
- `mockserver/backend/src/platforms/herpsiburada/` yazım hatalı dizin (1 dosya, 0 route) · nice-to-have · mockserver/backend/src/platforms/herpsiburada/

## nice-to-have
- Tanıtım sitesinde menü/altbilgi JS ile enjekte ediliyor (JS'siz erişilebilirlik/SEO), emoji'li menü, OG/analitik/schema meta yok, koyu tema tek varyant · nice-to-have · gitlab/www/client/alternative/assets/main.js:1-40; gitlab/www/client/alternative/index.html
- `frontend/index.html` `meta theme-color="#555 "` (sondaki boşluk) ile manifest `theme_color` (#0d47a1) tutarsız · nice-to-have · frontend/index.html:10; frontend/public/manifest.json:6
- CLAUDE.md "test suite yok" ifadesi güncel değil (`backend/jest.config.js`, `backend/tests/smoke.test.ts` var) · nice-to-have · CLAUDE.md (Commands bölümü); backend/tests/smoke.test.ts

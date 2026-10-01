# bo-mob — backoffice telefon denetimi + PWA (MOB-06)

Dal `cloud/bo-mob`, taban `origin/cloud/fe-mobdesk` (PWA ve dokunmatik deseni oradan: MOB-00 `touch.css`, MOB-01 SW/manifest).
Kapsam K54 (backoffice de Android'e kurulabilir), K51 (Durum → Karar → Eylem → Ayrıntı), K48 (backoffice tam özerklik), K35
(native yok). **Web push (MOB-04 kanalı) bu görevde YOK** — ileride. Yalnız `frontend/backoffice/` değişti; ortak paketlere
dokunulmadı. `cloud/fe-mob2` dosyalarına dokunulmadı.

## Görseller (bu klasör)

Telefon **ilk ekranı** (ilk bakışta Durum → Karar → Eylem görünüyor mu), dokunmatik öykünme, 390 + 430, açık + koyu:
`<no>-<ekran>-<tema>-<genişlik>.png`. 360 px görsel yok; kapıda ölçülür (`e2e/specs/mobile.spec.ts`).

| No | Ekran | No | Ekran |
|---|---|---|---|
| 01 | Genel bakış (dikkat/nabız) | 31 | Denetim |
| 10 / 11 | Müşteri listesi / detay | 40 | Sistem ayarları |
| 12 | Destek (yakında) | 41 | Uyarılar |
| 20 | Motor — başarısız işler | 50 / 51 | Çekmece menüsü / hesap menüsü (tema burada) |
| 21 | Entegrasyonlar | 52 | Log süzgeci açık |
| 30 | Loglar | 53 | Tehlikeli işlem diyaloğu |
| 60 | Çevrimdışı ekranı (açık/koyu) | 61 / 62 | Güncelleme bildirimi / Android kurulum kartı |

60–62 üretim derlemesinden (arka uç yok; `/admin-api` 503 döndüğü için pano kartları "Okunamadı" durumundadır — beklenen).

Yeniden üretme (`frontend/backoffice/`):
```bash
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium BO_REVIEW=1 npx playwright test review-mob.spec.ts --project=chromium-mobile
npx vite build && PW_CHROMIUM_PATH=/opt/pw-browsers/chromium BO_REVIEW=1 npx playwright test -c playwright.preview.config.ts
```

## 1. Telefon denetimi (360 / 390 / 430 px)

Ekranlar (21): genel bakış, müşteri listesi/detay, destek, abonelik listesi/detay, motor (+ başarısız işler), entegrasyonlar,
altyapı, önbellek, loglar, denetim, yöneticiler, sistem ayarları, Otopilot ayarı, duyurular, teslimler, müşteri bildirim
geçmişi, katalog, uyarılar. Ölçüm: sayfa yatay kayması + görünür etkileşimli öğelerin **etkin** dokunma alanı (kutu ∪
mutlak `::after`).

| Bulgu (öncesi) | Nerede | Düzeltme |
|---|---|---|
| Sayfa düzeyinde yatay kayma | — | **Yok** (21 ekran × 3 genişlik). Ana listeler zaten kart görünümünde (`EkDataTable` < 600 px kap sorgusu, denetim kartları); pano tabloları (podlar/kuyruklar) kendi kabında kayar |
| Üst bar: 7 öğe 36 px; 44'e çıkınca 360'a sığmıyor | kabuk | < 600 px: hedefler 44×44, aralık 0; **tema seçimi hesap menüsüne** taşındı; örnek/yerel ortam rozeti yalnız ikon (ad ekran okuyucuda); 360–399 px'te staging/üretimde marka işareti gizlenir (etiketli rozet + renkli şerit kalır, genel bakış çekmecede). Adım-yükseltmesi hapı görsel 32, dokunma 44 |
| Segment düğmeleri 30, süzgeç alanları 38 (E6), sekme okları, Vuetify anahtar 28 | tüm listeler | Dokunmatikte 44 (`mobile.css`, `pointer: coarse` + `--ek-control-h-touch`) |
| Düğme/yenile/menü öğesi 32–36 | tüm ekranlar | Ortak katman (`touch.css`, fe-mobdesk) zaten 44 yapıyor — yinelenmedi |
| Kimlik bağlantıları (#tid, istek kimliği) 20 px yüksek, kopyala 24, denetim aç/kapa 28, "Tümü →" 22, karar şeridi maddeleri 32, iz/ayrıntı bağlantıları | genel bakış, denetim, motor, uyarılar, teslimler, abonelik detayı, iz diyaloğu | Görünmez `::after` ile 44×44 dokunma alanı (yerleşim aynı); yeni kimlik bağlantılarında `bo-hit` sınıfı |
| Log merkezi: seviye/kaynak süzgeci sorunlar listesinin **önünde** (telefonda ~1 ekran) — K51 sırasını bozuyor | loglar | Telefonda (< 768 px) "Seviye ve kaynak süzgeci" düğmesiyle katlanır (seçili sayısı rozette); önce kategoriler (Durum) → sorun grupları (Karar) |
| Hata kodu dağılımı kart görünümünde değeri kırpıyor (`min-width: 240px`) | entegrasyonlar → API sağlığı | Telefonda dağılım etiketin altına tam genişlik iner; `MeterList` satırı iki katlı (etiket + değer / çubuk) |
| Ölçü kartları tek sütun (4 sayı ≈ 1,5 ekran) | API sağlığı, Redis, Mongo, önbellek | < 600 px iki sütun, sıkı iç boşluk — Durum tek bakışta |
| Çekmecede "Ctrl+K" ipucu | kabuk | Dokunmatikte gizli ("Hızlı geçiş" kalır) |

K51 (Durum → Karar → Eylem) telefonda: genel bakışta karar şeridi ilk ekranda (bar + başlık altında, ~260 px); müşteri
detayında durum rozetleri → birincil eylem (Müşterinin gözünden aç) → hesap ayrıntısı; tehlikeli işlem diyaloğu telefonda
tam yükseklik, dört soru aynı sırada. Değişiklik gerekmedi.

Kural: dokunma büyütmeleri yalnız `@media (pointer: coarse)` altında; yerleşim kuralları genişliğe bağlı. Masaüstü (fare)
yoğunluğu ve Windows görsel tabanları **değişmez**. Kaynak `src/styles/mobile.css` (seçiciler `#app` önekli — tembel
`kit.css` ve scoped stiller ezmesin).

Kapı (`e2e/specs/mobile.spec.ts`, chromium-mobile): 360 ve 430'da 21 ekranda yatay kayma 0 + 44 altı hedef 0; çekmece;
sade üst bar (üretim önizlemesi dahil, bar taşmaz); log süzgeci; axe 0 (390, açık + koyu, 6 ekran) → **7/7**.

## 2. PWA kararları

| Karar | Neden |
|---|---|
| **Ayrı manifest**: "Entegrasyonik Yönetim" / "EK Yönetim", `id` `/`, `scope` `/`, `start_url` `/genel-bakis`, `standalone`, tr | Backoffice kendi kökeninde (`admin.entegrasyonik.com`, ADR-0026) — PWA kimliği origin'e bağlı, uygulama PWA'sıyla (`app.`) **çakışmaz**; ad/kısa ad/başlangıç adresi de farklı (test) |
| **Ayrı ikon**: marka işareti + amber kalkan rozeti, daha koyu zemin; 192/512 PNG, 512 maskable (%80 güvenli alan), iOS 180 (`public/icons/*.svg` kaynaktan Chromium ile) | Telefonda iki ikon yan yana durduğunda ayırt edilebilsin |
| Tema rengi açık `#13255B` / koyu `#0B1530` (`index.html` `media`'lı iki `theme-color`, çevrimdışı ekranında da) | Üst bar zemini; manifest tek renk alır |
| Service worker yalnız **kabuk + `/assets/*`**. Gezinme ağdan; ağ yoksa `offline.html`. `/admin-api/`, `/api/`, `/health`, `/ready`, başka origin, GET dışı, sorgulu URL **karışılmaz, önbelleğe alınmaz**; HTML (offline hariç) önbellekte yok | Platform/müşteri verisi cihazda kalmaz (MOB-06 kabul ölçütü). Desen MOB-01 ile aynı |
| Önbellek adları `bo-shell-*` / `bo-assets-*`; etkinleşmede yalnız **kendi** eski sürümleri silinir | Aynı kökende başka bir önbellek olsa bile dokunulmaz |
| Sürüm derlemede `__BO_SW_VERSION__` → paket karması (`vite.config.mts` `swVersionPlugin`) | Her derleme SW'yi değiştirir → güncelleme algılanır |
| Güncelleme: "Yeni sürüm hazır" + **Yenile** (SKIP_WAITING → tek yenileme); kendiliğinden geçiş yok | Yarım gerekçe/tehlikeli işlem diyaloğu kaybolmasın |
| Kurulum: Android ertelenmiş `beforeinstallprompt` → sakin kart "Ekle"; iOS Safari yönergesi. Yalnız telefon genişliği, **oturum açıkken**, kurulu değilse; kapatılınca bir daha yok (`bo-pwa-install-dismissed` = `1`, depoya yazan izinli dosyalar listesine eklendi) | Giriş ekranında dikkat dağıtmasın; uygulamanın anahtarından ayrı |
| Çevrimdışı ekranı: "Yönetim paneli çevrimdışıyken platform ya da müşteri verisi göstermez ve hiçbir işlem yapmaz", açık/koyu (`ek-bo-theme`), satır içi betik ve dış kaynak yok (CSP), `noindex`, bağlantı gelince kendiliğinden dönüş | Dürüst; ADR-0026 arama motoru dışı |
| Geliştirmede (`vite dev`, sahte /admin-api) SW **kaydedilmez** | Vite modülleri önbelleğe girmesin |
| Push YOK | MOB-04 kanalı ayrı görev (platform yöneticisi aboneliği) |

Doğrulama: `tests/pwa-sw.test.ts` (gerçek SW betiği VM'de — /admin-api, /api, /health, /ready, başka origin, uygulama
origin'i, POST, sorgulu → karışılmaz ve önbelleğe yazılmaz; gezinme çevrimdışı → offline.html; yalnız `bo-*` eski önbellekler
silinir; kurulumda skipWaiting yok), `tests/pwa-state.test.ts` (kurulum kararı, ayrı kimlik, index.html, çevrimdışı ekranı, depo
izni), `e2e/preview/pwa.spec.ts` (üretim derlemesi): Chromium `Page.getInstallabilityErrors` boş (`in-incognito` düzenek kısıtı
hariç), manifest hatasız; oturumlu 6 ekran gezildikten sonra Cache Storage'da yalnız `bo-*`, aynı origin, `/admin-api` ·
`/api` · `/health` yok, sorgu yok, HTML yalnız `offline.html`, gövdelerde yönetici e-postası yok; çevrimdışı iki temada axe 0;
güncelleme akışı (waiting → bildirim → Yenile → yeni sürüm, eski önbellek silinir); Android kurulum kartı (istem bir kez,
reddedilince kapanır). Komut: `npm run test:e2e:pwa -w @entegrasyonik/backoffice` (bulutta `PW_CHROMIUM_PATH`).

## 3. Öneriler / sonraki işler

- MOB-04 (web push) geldiğinde: SW'ye `push`/`notificationclick` eklenir; kritik dikkat maddeleri → platform yöneticisi
  aboneliği. Bu SW şimdiden ayrı kapsamda olduğundan uygulamanın push aboneliğiyle karışmaz.
- MOB-07 (Capacitor APK): backoffice paket kimliği ayrı; WebView aynı derleme. Kabukta SW kaydı gerekmeyebilir (paketli
  dist) — MOB-07'de karar.
- Manifest kısayolları (Genel bakış, Uyarılar, Denetim) ve mağaza ekran görüntüleri — uygulamadaki P-MD-4 ile birlikte.
- Görsel tabanlar: telefon görünümü için Windows tabanı yok; görsel onay yerelde.

## 4. Testler (dal sonu)

| Koşu | Sonuç |
|---|---|
| backoffice + ui vitest (`test:backoffice`) | 127/128 — bilinen `p2-states REAUTH_OPS ↔ backend` (main'de ve fe-mobdesk'te de kırık; bu daldan bağımsız) |
| vue-tsc (backoffice) | 0 hata |
| `build:backoffice` + `build` | OK (dist/service-worker.js sürümü yazılıyor) |
| `e2e/specs/mobile.spec.ts` (chromium-mobile) | 7/7 |
| `e2e/preview/pwa.spec.ts` (üretim derlemesi) | 6/6 |
| Playwright tam, 3 proje, `--update-snapshots=missing` | 197 geçti; 3 kırık = `engine-tenant` "müşterinin gözünden aç" (açılır pencere uygulama adresine gidemiyor — bulut ağı; main'de de aynı). İlk koşudaki 8 "görsel taban yok → yazıldı" tekrar koşuda geçti (`*-linux.png` git-ignored) |
| axe | mobile.spec (390, açık+koyu, 6 ekran) + çevrimdışı ekranı (iki tema) + kurulum kartı: 0 ihlal |

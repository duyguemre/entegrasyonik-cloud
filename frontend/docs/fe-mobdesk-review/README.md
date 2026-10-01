# fe-mobdesk — mobil kullanılabilirlik, PWA, Electron kabuğu (MOB-00, MOB-01, DESK-00)

Dal `cloud/fe-mobdesk` (taban `cloud/fe-r3d`, bitmiş hali birleştirildi). Kapsam K35 (önce PWA, native yok), K36 (masaüstü =
aynı web derlemesi, dar köprü sonra), K48 (frontend: yalnız bariz düzeltme; akış/davranış → `PROPOSALS_PENDING.md` P-MD-1..7).
Yerel köprü (DESK-01..04) YAPILMADI.

Görseller (açık tema, dokunmatik öykünme, `reducedMotion`):
- `390/`, `430/` — sonrası; `*.png` + `audit/*.json` (ölçüm). 360 px yalnız kapıda ölçülür (görsel yok).
- `once-390/` — düzeltme öncesi. Not: öncesi ölçümü kapalı (ekran dışı) çekmece öğelerini de saydı; gerçek bulgular aşağıdaki tabloda.
- Yeniden üretme: `MOB_REVIEW=1 MOB_WIDTHS=390,430 npx playwright test e2e/specs/mob-00-mobile.spec.ts -c playwright.cloud.config.ts --project=chromium-mobile`
- Ürün formu sekmesindeki "Product de…" başlığı test fixture'ındaki menü kaydından gelir (gerçek menü backend'den çevrili ad taşır).

## 1. MOB-00 — mobil denetim (360 / 390 / 430 px)

Akışlar: pano (kabuk), ürün listesi, yeni ürün formu, sipariş listesi, sipariş detayı, kargoya ver (toplu onay diyaloğu),
stok sağlığı, Otopilot paneli. Ölçüm `e2e/specs/mob-00-mobile.spec.ts` (sayfa yatay kayması, görünür etkileşimli öğelerin
etkin dokunma alanı, alan yazı boyutu, viewport meta).

| Bulgu (öncesi) | Nerede | Düzeltme |
|---|---|---|
| Sayfa düzeyinde yatay kayma | — | **Yok** (8 akış × 3 genişlik). Tablolar kart görünümünde; kalan iç kayma yalnız kart görünümündeki kolon başlığı satırında → P-MD-1 |
| Üst bar ikonları 36, hesap 38×36 | kabuk | Dokunmatikte 44×44 (`touch.css`) |
| Sekme düğmeleri ~34, "Tüm sekmeler" 24 | kabuk | min-height 44 |
| **Tutamak (daralt/odak) "Tüm sekmeler" düğmesinin üstüne biniyor** | kabuk, tüm mobil ekranlar | Dokunmatikte sekme şeridi tutamağın genişliğini ayırır (`SecureLayout`), tutamak düğmeleri 44 genişlik + görünmez 44 yükseklik |
| Satır eylemleri (göz, ⋯) 32, sayfalama 32, alanlar 36, yenile 36 | listeler | Dokunmatik yoğunluk: `--ek-control-h-sm/md/lg/field` → `--ek-control-h-touch` (44) tek yerden |
| Izgara onay kutuları 16×16 | ürün/sipariş listesi | `<label class="ek-grid__check-hit">` sarmalayıcı → 44×44 dokunma alanı (görünen kutu aynı) |
| Sayfa bilgisi (?) 24, favori yıldızı 24, stok sipariş bağlantısı 22, pano durum satırları 32, sipariş içeriği 40, görünümler 32, Otopilot düğmesi 36, sohbet bağlam kaldır 32×22 | ilgili bileşenler | Görünmez `::before` genişletme veya `min-height` (aynı token, aynı medya sorgusu) |
| Akıllı arama alanı 14 px yazı (iOS odakta sayfayı yakınlaştırır) | kabuk | Dokunmatikte 16 px; tüm `v-field` alanları 16 px |
| Klavye açılınca yapışık alt çubuklar (Kaydet) klavyenin altında kalabilir (Android) | formlar | viewport `interactive-widget=resizes-content` (+ `viewport-fit=cover`); yakınlaştırma serbest |

Kural: tüm büyütmeler yalnız `@media (pointer: coarse)` (veya tutamak için `hover: none`) altında — masaüstü/fare
yoğunluğu ve Windows ekran görüntüsü tabanları değişmez. Kaynak: `packages/ui/src/styles/touch.css`, token
`controlHeight.touch = 44` (`packages/ui/src/tokens/scale.ts`).

Kapı (günlük koşu, `chromium-mobile` projesi): 3 genişlik × 8 akış yatay kayma yok + kritik eylemler ≥ 44 px + viewport/16 px
kontrolü → **27/27**. Sonrası ölçümde 360/390/430'da görünür 44 px altı hedef: **0**.

## 2. MOB-01 — PWA kararları

| Karar | Neden |
|---|---|
| Manifest: ad/kısa ad "Entegrasyonik", `standalone`, `start_url`/`scope` `/`, `id`, tr; ikonlar 192/512 PNG + 512 maskable + iOS `apple-touch-icon` (180) — marka işaretinden (favicon.svg) Chromium ile üretildi | Eski ikonlar şablondan kalma bir ürün fotoğrafıydı (`icon-192.webp`); eski ekran görüntüsü eski giriş ekranıydı → kaldırıldı (yenisi P-MD-4) |
| Tema rengi açık `#13255B` (navy 900) / koyu `#0B1530` (inkDark.chromeStart) — `index.html` `media`'lı iki `theme-color` | Manifest tek renk alır; sistem temasına uyum meta ile |
| Service worker yalnız **kabuk + `/assets/*`** (içerik karmalı, değişmez). Gezinme ağdan; ağ yoksa `offline.html`. API, başka origin, GET dışı, sorgulu URL'ler **karışılmaz, önbelleğe alınmaz**; HTML de önbellekte tutulmaz | BACKLOG MOB-01: kiracı verisi cihazda kalmaz. Eski SW her isteği `caches.match` ile yanıtlamaya çalışıyordu |
| Sürüm: derlemede `__EK_SW_VERSION__` → paket içeriğinin karması (`vite.config.mts` `swVersionPlugin`) | Her yeni derleme SW'yi değiştirir → güncelleme algılanır; eski önbellekler (`premium-v1` dahil) etkinleşmede silinir |
| Güncelleme bildirimi: yeni SW beklerken tek toast "Yeni sürüm hazır" + "Yenile" (SKIP_WAITING → tek yenileme). Kendiliğinden `skipWaiting` yok | Açık formdaki veri kendiliğinden yenilemeyle kaybolmasın |
| Kurulum: Android'de ertelenmiş `beforeinstallprompt` → sakin bilgi kartı "Ekle"; iOS Safari'de "Paylaş → Ana Ekrana Ekle" yönergesi. Yalnız mobil genişlik, kurulu değilse, kapatılınca bir daha yok | Tarayıcının kendi bandı yerine kimliğe uygun tek kart (EkAlert) |
| Çevrimdışı ekranı: dürüst metin ("veri göstermez ve işlem yapmaz"), açık/koyu, satır içi betik ve dış font/CDN yok, bağlantı gelince otomatik dönüş | Eski sayfa dış CDN'e (Google Fonts, jsDelivr) bağlıydı — çevrimdışıyken yüklenemezdi; nabız animasyonu/büyük harf kimliğe aykırıydı |
| Geliştirmede (`vite dev`) ve Electron'da SW **kaydedilmez**; Electron açılışta eski SW kayıtlarını siler | Vite modülleri önbelleğe girmesin; masaüstü her zaman canlı derleme |

Doğrulama: `tests/pwa/*` (gerçek SW betiği VM'de: API/başka origin/POST/sorgulu → karışılmaz, önbelleğe yazılmaz; gezinme
çevrimdışı → offline.html; eski önbellekler silinir), `e2e/preview/pwa.spec.ts` (üretim derlemesi): Chromium
`Page.getInstallabilityErrors` boş (Playwright'ın gizli pencere kısıtı `in-incognito` hariç) — Lighthouse 12'de PWA
kategorisi kaldırıldığı için kurulabilirlik aynı Chromium denetimiyle ölçüldü; oturumlu gezinme sonrası Cache Storage'da
`/api/`, başka origin, sorgulu URL ve HTML **yok**; çevrimdışı gezinme dürüst ekrana düşer, axe 0.

## 3. DESK-00 — Electron güvenlik kontrol listesi

Kaynak: electronjs.org/docs/latest/tutorial/security. Statik + politika testi: `tests/security/electron-hardening.test.ts`.

| # | Madde | Durum |
|---|---|---|
| 1 | Yalnız güvenli içerik | Üretim yalnız `https://app.entegrasyonik.com`, geliştirme yalnız `http://localhost:3020`; `loadFile`/`file://` yok; gömülü express sunucusu kaldırıldı |
| 2 | Uzak içerikte Node entegrasyonu kapalı | `nodeIntegration`, `…InWorker`, `…InSubFrames` false |
| 3 | Bağlam yalıtımı | `contextIsolation: true`; preload yalnız donmuş `{ isDesktop, platform }` açar (ipcRenderer/Node yok) |
| 4 | Sandbox | `app.enableSandbox()` + `sandbox: true` |
| 5 | İzin istekleri | Varsayılan RED; yalnız izinli origin + `clipboard-sanitized-write`, `fullscreen` (kamera/mikrofon/konum/bildirim/USB reddedilir) |
| 6 | `webSecurity` kapatılmaz | true |
| 7 | CSP | Ana belgeye zorunlu CSP (`script-src 'self'`, `unsafe-eval` yok, `object-src 'none'`, `frame-ancestors 'none'`, connect yalnız `*.entegrasyonik.com`). vue-i18n JIT derleme açıldı (`new Function` yok) — preview e2e'de bu CSP altında uygulama **ihlalsiz** açılır |
| 8 | `allowRunningInsecureContent` | false |
| 9 | Deneysel özellikler | false |
| 10 | `enableBlinkFeatures` | kullanılmıyor |
| 11 | `<webview>` | `webviewTag: false` + `will-attach-webview` engelli |
| 12 | Gezinme sınırı | `will-navigate` / `will-redirect` izinli origin dışını keser, dış adresi sistem tarayıcısında açar |
| 13 | Yeni pencere | Düz bağlantı (fatura PDF'i, kargo takibi) → sistem tarayıcısı; OAuth açılır penceresi (Ideasoft, `features` ile) ve yazdırma (`about:blank`) → preload'suz, aynı sertleştirmeyle; açılır pencere başka açılır pencere açamaz; `file:`, `javascript:`, özel protokoller red |
| 14 | `shell.openExternal` doğrulanmış girdiyle | Tek çağrı, yalnız https (geliştirmede http) ve `mailto:` |
| 15 | Güncel Electron | 29.1 → **44.5.1** (MIT; 29.x'e açık 40+ danışma — ASAR bütünlüğü, bağlam yalıtımı atlatma vb.; `npm audit`'te electron kalmadı) |
| 16 | Fuses | `RunAsNode` kapalı, `NODE_OPTIONS`/inspect kapalı, gömülü ASAR bütünlüğü + yalnız ASAR (değişmedi, test korur) |

Notlar: Electron 44 Node ≥ 22.12 ister (bulut Node 22.22). İkili dosya bulutta indirilmedi (`ELECTRON_SKIP_BINARY_DOWNLOAD`)
— kabuk yerelde `npm start` ile denenmeli (Windows). Kod imzalama/otomatik güncelleme DESK-05 (tetikleyicili).

## 4. Öneriler (onay bekler) — `PROPOSALS_PENDING.md`

P-MD-1 kart görünümünde "Sırala" seçimi · P-MD-2 telefonda sekme şeridi yerine "Açık sekmeler" seçici · P-MD-3 kurulum
kartı zamanı · P-MD-4 manifest ekran görüntüleri/kısayolları · P-MD-5 masaüstü hedef adresi (staging kanalı) · P-MD-6
uygulama içi çevrimdışı bant · P-MD-7 masaüstünde tek örnek + pencere durumu.

## 5. Testler

Sonuçlar dal sonundaki koşudan (bkz. commit mesajı ve aşağıdaki tablo).

| Koşu | Sonuç |
|---|---|
| vitest (tam) | 1624/1624 |
| vue-tsc (mandal) | 0 hata |
| style / pattern / no-console mandalları | OK |
| `npm run build` + `build:backoffice` | OK (SW sürümü derlemede yazılıyor) |
| `test:backoffice` | 101/102 — bilinen `p2-states REAUTH` (backend `retryJobs`; fe-r3d HANDOFF'ta ve main'de aynı) |
| e2e/preview/pwa.spec.ts (üretim derlemesi) | 4/4 |
| e2e/specs/mob-00-mobile.spec.ts (chromium-mobile) | 27/27 |
| Playwright tam (`--update-snapshots=missing`, 2988 test) | 1647 geçti, 1127 atlandı (proje filtresi/inceleme spec'leri); ilk koşudaki kırıklar ilk-taban ekran görüntüsü yazımı; ikinci koşuda kalan 2: `logs` mobil taban (tek başına geçti, yük) ve `session-isolation` (fe-r3d P05 sekme adı "İadeler" — beklenti güncellendi, 3/3) |
| e2e/preview/preview-smoke.spec.ts | 3 kırık, bu daldan bağımsız (eski logger metni regex'i, eski `.large-stat-card` seçicisi) |

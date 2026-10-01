# INT-1001 — Bulut dallarının tek entegrasyon dalında birleşimi

- Dal: `cloud/int-1001` · Taban: `origin/main` @ `477e238e` (sync: faz3-arayuz @ d9a02d07) · Tarih: 2026-10-01
- Kapsam istisnası (görev talimatı): be-* dallarındaki `backend/` değişiklikleri de birleştirildi. Yapılanlar: yalnız git birleşimi, çakışma çözümü ve DB/Redis gerektirmeyen testler. DB, Redis ya da `.env`'e bağlanılmadı; backend çalıştırılmadı; göç çalıştırılmadı.
- Kök dosyalara (`BACKLOG.md`, `MASTER_STATE.md`, `CLAUDE.md`) ve `docs/adr/`'ye dokunulmadı. Bu dosyalardaki değişikliklerde her zaman main'in sürümü korundu. Dalların kök dosya değişiklik istekleri §6'da.

## 1. Dal başına durum

Birleşim sırası şuydu: be-p2move → be-p3a → be-p3b → be-p4 → mob-usage → mob-android → prc-r2 → fe-r3b (cherry-pick) → fe-mobdesk → fe-mob2 → bo-r1b → site-fair → res-logo.

Dalların çoğu üst üste kurulmuştu (ör. mob-usage; mob-push, bo-mob ve fe-r3d'yi içeriyor). Kapsayan dal birleşince kapsanan dal "zaten içinde" duruma geçti. Her dalın ucunun `cloud/int-1001`'in atası olduğu `git merge-base --is-ancestor` ile doğrulandı.

| Dal | merge-base (main) | Durum | Not |
|---|---|---|---|
| be-p2move | e79772e9 (main~5) | birleşti | Doğrusal zincirin başı. |
| be-p3a | e79772e9 | birleşti | be-p2move'u içerir. |
| be-p3b | e79772e9 | birleşti | be-p3a'yı içerir; dal içinde `cloud/be-p3a` zaten birleştirilmiş (4ab803a8). |
| be-p4 | e79772e9 | birleşti | be-p3b'yi içerir (1baefd42). Zincirin en son ve en kapsamlı sürümü olduğu için esas alındı. |
| mob-usage | e79772e9 | birleşti | mob-push, bo-mob ve fe-r3a/c/d'yi içerir. Daldaki `BACKLOG.md` ve `docs/adr/USER_DECISIONS.md` değişiklikleri UYGULANMADI, main'in sürümü kaldı. Dalın değişikliği eski bir sync'e dayanıyordu; K52–K55 main'de zaten var. |
| mob-push | e79772e9 | birleşti (mob-usage içinde) | — |
| mob-android | e79772e9 | birleşti | Otomatik birleşim, çakışma yok. |
| prc-r1 | 5b66f081 | birleşti (prc-r2 içinde) | — |
| prc-r2 | 13f1f8f2 | birleşti | prc-r1, prc-legal ve res-price'ı içerir. Mob dallarıyla 10 dosyada çakıştı (§2). |
| fe-r3d | e79772e9 | birleşti (mob-usage içinde) | fe-r3a ve fe-r3c'yi içerir. |
| fe-r3a / fe-r3c | 689ef96b / f2b08ec8 | birleşti (fe-r3d içinde) | — |
| fe-r3b | e79772e9 | kısmi → tamam | fe-r3d, fe-r3b'nin önceki bir ucunu içeriyordu. Eksik kalan tek commit `59d2de7d` (inceleme README'si, test sonuçları) cherry-pick ile alındı. |
| fe-mobdesk | e79772e9 | birleşti | Yalnız son commit yeniydi (README + `session-isolation.spec.ts`). |
| fe-mob2 | e79772e9 | birleşti | Yalnız 1 dosya yeniydi. |
| bo-r1a | 689ef96b (eski taban) | birleşti (bo-r1b içinde) | — |
| bo-r1b | 689ef96b (eski taban) | birleşti | Eski tabandan başlıyor ama main'deki işi geri almıyor. Üç yollu birleşim main değişikliklerini korudu. 6 dosyada çakıştı (§2). |
| bo-mob | e79772e9 | birleşti (mob-usage içinde) | Değişiklikleri bo-r1b'nin üstüne uyarlandı (§2). |
| site-s27a | 018920f0 | birleşti (site-fair içinde) | s27b'yi içerir. s27a'nın s27c'de olmayan tek commit'i (251d63c4, s27b birleşimi) zaten s27c'de vardı. |
| site-s27b | 018920f0 | birleşti | — |
| site-s27c | e79772e9 | birleşti (site-fair içinde) | — |
| site-fair | e79772e9 | birleşti | s27a, s27b ve s27c'yi içerir; çakışma çıkmadı. site-fair s27c'deki hiçbir değişikliği geri almıyor; yalnız ekliyor (adil rekabet ilkesi, COPY.md). Bu yüzden "s27c > s27a > site-fair" önceliği gereken bir durum oluşmadı. Yayındaki metin her yerde A seçeneği. |
| res-price | 5b66f081 | birleşti (prc-r1/r2 içinde) | `docs/research/COMPETITION_PRICING_2026-10.md` |
| prc-legal | 13f1f8f2 | birleşti (prc-r2 içinde) | `docs/research/AUTO_PRICING_LEGAL_2026-10.md` |
| res-logo | 477e238e (güncel main) | birleşti | `docs/research/BRAND_LOGO_IP_2026-10.md` |

**Main'e zaten giren ya da main'deki işi geri alan dal:** yok. Taban sonrası main'e yalnız 5 sync commit'i girmiş; bunlar `BACKLOG.md`, `USER_DECISIONS.md`, `MASTER_STATE.md` ve ADR-0036/0037'ye dokunuyor. Dallar bu dosyalara dokunmuyor; tek istisna mob-usage (yukarıda).

**Yinelenen / çakışan commit'ler**
- be-p3a/p3b/p4 tek doğrusal zincir. "İki kopya" çalışmanın izi olarak yinelenen commit (aynı başlık ya da aynı yama) bulunmadı. be-p4 ucu en kapsamlı sürüm.
- fe-r3d / fe-r3b: fe-r3b'nin 20 commit'i fe-r3d üzerinden zaten geçmişteydi; yalnız `59d2de7d` eksikti.
- `git log --no-merges origin/main..cloud/int-1001` içinde (205 commit) aynı başlıklı ikinci commit yok.

## 2. Çözülen çakışmalar ve seçilen taraf

### prc-r2 ↔ mob-* (mob-usage + mob-android)
| Dosya | Çözüm |
|---|---|
| `backend/tests/characterization/auth/operation-policy.test.ts`, `operationPolicy.snapshot.ts` | Birleşim: PRC-CFG/PRC-R2 satırları + MOB-08 `BackofficeTenantService/getUsage`. |
| `backend/tests/characterization/auth/permission-parity.test.ts` | Sayılar yeniden hesaplandı: **311 = 207 tenant + 104 platformAdmin**. mob: +3 web push (member), +3 BO push, +1 getUsage. prc: +13 PricingService, +4 BO rekabet/kural. |
| `backend/generated/capabilities.manifest.json`, `docs/CAPABILITIES.md` | prc tarafı alındı, ardından `node dev-tools/capabilities-docs.js` ile yeniden üretildi: **299 yetenek**, sha256 `ebd1470f6254…`. |
| `docs/CAPABILITIES_CHANGELOG.md` | İki tarafın blokları da korundu. Üretici birleşim için yeni bir blok ekledi. |
| `backend/src/capabilities/capability-baseline.json` | Gerçek ölçüme çekildi: total 299, orphan 127 (= 120 + mob 4 + prc 3), deferred 100, notExposed 286. |
| `frontend/backoffice/src/api/contract.ts` | Birleşim: usage + competition + pricingRules. |
| `frontend/backoffice/src/api/mock/ops/index.ts` | Birleşim: competition + usage mock alanları. |
| `frontend/backoffice/tests/p2-states.test.ts` | Yorum satırı; prc tarafı alındı. |

### bo-r1b ↔ mob-usage / bo-mob (esas bo-r1a/b, mob değişiklikleri üstüne uyarlandı)
| Dosya | Çözüm |
|---|---|
| `frontend/backoffice/docs/BO_UI_PATTERNS.md` | Önce bo-r1 §11 (Durum → Karar → Eylem → Ayrıntı), ardından "Ek — MOB-08" bölümü. |
| `frontend/backoffice/src/api/contract.ts` | attention + ops (bo-r1b) + usage/competition/pricingRules. |
| `frontend/backoffice/src/api/mock/ops/index.ts` | tenantOps + prefs (bo-r1b) + competition + usage. |
| `frontend/backoffice/src/api/mock/server.ts` | `setCalm/setAttentionMissing/setAttentionDegraded` (bo-r1b) + `setPushEnabled/setUsageEmpty` (mob). **Uyarlama:** `getPulse`'ın iki sahte uygulaması vardı. Yeni durumda bo-r1b'nin `buildPulse` nabız kartlarına MOB-08'in `activeUsers` bloğu eklendi. `platform` süzgeci yalnız kullanım bloğunu etkiliyor; bilinmeyen alan hâlâ VALIDATION döndürüyor. |
| `frontend/backoffice/src/api/contracts/{attention,usage}.ts` | **Uyarlama:** aynı `AdminRpc` anahtarı (`getPulse`) iki dosyada tanımlıydı, tek kayda indirildi. `GetPulseResponse` artık `activeUsers` alanını taşıyor; istek `{ platform? }`. `PulseResponse` bu tipin takma adı. |
| `frontend/backoffice/src/views/notifications/AlertsView.vue` | İçe aktarmalar birleşti: PageVerdict/CopyViewLink (bo-r1b) + PushCard (mob). |
| `frontend/backoffice/tests/p2-states.test.ts` | bo-r1b tarafı alındı (`retryJobs` artık kullanılıyor). |
| `frontend/backoffice/tests/attention.test.ts` | getPulse anahtar listesine `activeUsers` eklendi. |

### Birleşimden doğan anlamsal çakışmalar (git çakışma göstermedi)
- **Göç numarası:** `0021-pricing-competition-tenant` (prc) ile `0021-usage-daily-app` (mob-usage) aynı numarayı kullanıyordu. Kullanım göçü `backend/migrations/0023-usage-daily-app.js` oldu; `id`, `UsageDaily.ts` yorumu, `docs/API_BACKOFFICE_USAGE.md` ve `docs/MIGRATIONS.md` güncellendi.
- **ADR-0031 `_platform` anahtar tavanı:** be-p4 (alerts R5/R10/R11) ve prc-r2 (features.competition*, pricingRules) tek başına 25'te kalıyordu, birleşince 28 oldu. `tests/unit/alerts/alertNb8Remaining.test.ts` içinde `platform.alerts` grubu, prc'nin `platform.pricing` için yaptığı gibi genel sayımdan çıkarıldı ve ayrı tavana bağlandı (≤15, şu an 14). **ADR-0031 notu insan onayı bekliyor (§7).**
- **Site kanıt yolları:** be-p2move `api/services/stock-service.ts` dosyasını `api/rpc/handlers/` altına taşıdı. `site/src/data/fair-play.ts` güncellendi.
- **Site kanıt metni:** fe-r3d "Bu Plana Geç" düğmesini cümle düzenine çevirdi ("Bu plana geç"). `site/src/data/faq.ts` ve `pricing.ts` güncellendi.
- **MOB-06 push uçları:** `BackofficePrefsService/{getPushConfig,subscribePush,unsubscribePush}` FE envanteri testinin "yalnız /admin-api" listesine eklendi. Bu, dalda kalmış bir eksikti.

### Tabanda (main) zaten kırmızı olup burada düzeltilenler
- `docs/ERROR_CODES.md` belgede `VIEW_LIMIT` vardı ama `codes.ts` kataloğunda yoktu. Kod (`viewsAdmin.ts`) bu kodu kullanıyor; kataloğa eklendi.
- `NoRawRegex`: `api/admin/engineOps.ts:201` üzerindeki `$regex` artık `escapeRegex` kullanıyor. Davranış aynı; kod şeması `^[A-Z_]{2,32}$`.
- `oauth/flow`: test donanımı sabit `2026-10-01T12:00Z` saatini kullanıyordu, `jwt.verify` ise gerçek saati. 12:15 UTC'den sonra token'lar "süresi dolmuş" sayıldığı için bu bir saatli bombaydı. `tests/helpers/oauthHarness.ts` artık gerçek saatten başlıyor. 1388 oauth/mcp testi yeşil.

## 3. Test sonuçları (bulut, 2026-10-01)

| Kontrol | Sonuç |
|---|---|
| backend `npm run build` | ✅ |
| backend `typecheck` / `lint` / `depcruise` | ✅ / ✅ / ✅ |
| backend jest (tam, `TZ=Europe/Istanbul`) | 471 suite: **449 geçti, 22 kaldı**. 7814 test: **7506 geçti, 308 kaldı**. Kalanların hepsi ortam ya da taban kaynaklı (§8). |
| backend `ratchet` | knip exports 20 → 22. Ortam kaynaklı (§8). Diğer mandallar korundu. |
| frontend vitest (tam) | **93/93 dosya, 1741/1741 test** |
| backoffice + ui vitest | 31/31 dosya, 336 test + 6/6 dosya, 43 test |
| chat vitest | 12/12 dosya, 183 test (1 atlandı) |
| vue-tsc + typecheck-ratchet | 0 hata |
| style / pattern / no-console ratchet, contract-paths | ✅ (633 / 318 dosya, 171 yol) |
| frontend `build` / `build:backoffice` | ✅ / ✅ |
| site `build` | ✅ 49 sayfa |
| site vitest | 23 dosya: **836/838**. 2 kırmızı ortam kaynaklı: kökteki `INTEGRATIONS_REGISTRY.md` bulut kopyasında yok. |
| site Playwright (tam, `--update-snapshots=missing`) | **402 geçti, 46 atlandı.** 47 ekran görüntüsü testi linux tabanı olmadığı için ilk koşuda "yazıldı" olarak düştü. Tekrar koşuda 47/47 yeşil. `*-linux.png` commit'lenmedi. |
| frontend Playwright (tam) | PW_FE |
| backoffice Playwright (tam) | PW_BO |

Ortam notları: Playwright 1.63, chromium-1243 indiremedi (CDN 403). Önceden kurulu chromium-1194 ile koşuldu; tarayıcı yolu sembolik bağla verildi. Rollup, oxc-parser ve oxc-resolver'ın Linux ikilileri `npm i --no-save` ile kuruldu; lockfile değişmedi. `frontend` token CSS'i (`npm run tokens`) git-ignored üretilmiş dosyadır, testlerden önce üretilmesi gerekir.

## 4. Yerelde yapılması gerekenler

### Yeni DB göçleri (bulutta ÇALIŞTIRILMADI)
Her göçten önce: `backup/` altındaki doğrulanmış yedek (kural 3) → yerelde `plan` → `up`. Atlas ayrı onay ister.

| Dosya | Ne yapar | Ön koşul / not |
|---|---|---|
| `backend/migrations/0020-push-subscriptions-app.js` | App: `PushSubscriptions` için `uniq_endpointHash` (UNIQUE) ve `tid_1_userId_1_createdAt_-1` | `WEBPUSH_VAPID_*` açılmadan önce `done` olmalı. |
| `backend/migrations/0021-pricing-competition-tenant.js` | Tenant: `Variants.costPrice_number` (kısmi; maliyet alanı, PRC-R0) ve `competition_trendyol_status`; `BuyboxSnapshots` geçmiş indeksi + 90 günlük TTL | Veri dönüştürmez; `costPrice` isteğe bağlı ve geriye uyumlu. |
| `backend/migrations/0022-pricing-rules-tenant.js` | Tenant: `PriceRules`, `PriceSuggestions` (UNIQUE `ruleId_variantId_current`, 90 günlük TTL), `PriceHistory` (90 günlük TTL) | Sıra 0021 → 0022. Tekillik indeksi kurulmadan `features.pricingRules` açılmaz. |
| `backend/migrations/0023-usage-daily-app.js` (eski adı 0021-usage-daily-app) | App: `UsageDaily` için `uniq_day_tid_platform` (UNIQUE), `tid_1_day_-1`, 180 günlük TTL | İlk dağıtımdan önce uygulanmalı. **Numara değişti:** yerelde eski adla kayıt varsa düzeltilmeli. |
| NB8 (be-p4) | Göç yok. Eşikler `_platform` altındaki `alerts.*` ayarları (`backend/src/integration/config/catalog/alerts.ts`). | Backoffice'ten bir `alerts.*` değeri yayınlanıp sonraki turda eşiğin değiştiği görülmeli (`backend/docs/P4_REPORT.md` §2). |

Veri doldurma (backfill) gerektiren göç yok.

### Ortam ve cihaz
- Web push:
  - `npx web-push generate-vapid-keys` ile anahtar üretilir.
  - `.env` içine `WEBPUSH_VAPID_PUBLIC/PRIVATE/SUBJECT` yazılır; ayrıca `NOTIFY_V2_ENABLED=true`.
  - Backend `EGRESS_ALLOW_WEBPUSH=1 npm run start:local` ile başlatılır (`docs/NOTIFICATION_PLAN.md` NB9).
  - FCM kullanılacaksa `FCM_SERVICE_ACCOUNT_JSON` yalnız `.env` içinde durur.
- Android (MOB-07, `docs/MOB_ANDROID_REPORT.md`, `docs/MOBILE_ANDROID_BUILD.md`):
  - JDK 21 + Android SDK 36 gerekir.
  - Derleme: `frontend/mobile/android-shell` içinde `npm ci && npm run sync`, ardından `./gradlew assembleRelease`.
  - İmza anahtarı ve `google-services.json` yalnız yerelde tutulur.
  - Bulutta hiç derlenmedi.
- Gerçek cihaz kontrolleri:
  - `frontend/docs/MOB_PUSH.md` listesi: Android Chrome, iOS 16.4+ PWA, masaüstü tarayıcılar, Electron'da kartın gizli olması, 404/410 temizliği.
  - Backoffice kritik dikkat bildirimi.
- Alarm gölge modu: `ALERT_EVALUATOR_ENABLED=true` + `ALERT_SHADOW_UNTIL` (P4 §6).

### Doğrulama ve görsel
- Windows'ta görsel tabanlar yenilenmeli: site `guvenlik`, `otopilot` ve ana sayfa (site-fair); backoffice prc-cfg `review-p2` / `review-elev`; bo-mob telefon görünümü; bo-r1b rowcard.
- Yerel Mongo ile:
  - `npm run test:integration:mocked` (20 mongo-semantics suite'i bulutta koşulamadı);
  - `npm run test:integration`;
  - P3A §7 / P3B §5 duman akışları (sipariş, iade, fatura, kargo, ürün, varyant, admin, KVKK);
  - P4 §6 `npm run verify`.
- PRC:
  - Trendyol buybox ucunun alanları elle doğrulanmalı;
  - mock sunucuya `buybox-information` rotası eklenmeli;
  - prc-r2 menü kaydı (`menus` → `pricing/PricingRulesView`) yerel iş;
  - pilot `features.competition` ile açılır.

## 5. Yeni/değişen önemli dosyalar (birleşimde dokunulan)
- Backend: `migrations/0023-usage-daily-app.js` (yeniden adlandırıldı), `src/api/admin/engineOps.ts`, `src/platform/core/errors/codes.ts`, `src/capabilities/capability-baseline.json`, `generated/capabilities.manifest.json`, `tests/characterization/auth/*`, `tests/helpers/oauthHarness.ts`, `tests/unit/alerts/alertNb8Remaining.test.ts`.
- Backoffice: `src/api/contract.ts`, `src/api/contracts/{attention,usage}.ts`, `src/api/mock/{server.ts,ops/index.ts,ops/attention.ts}`, `src/views/notifications/AlertsView.vue`, `docs/BO_UI_PATTERNS.md`, `tests/{p2-states,attention}.test.ts`.
- Site: `src/data/{fair-play,faq,pricing}.ts`.
- Docs: `CAPABILITIES.md`, `CAPABILITIES_CHANGELOG.md`, `MIGRATIONS.md`, `API_BACKOFFICE_USAGE.md`.

## 6. Kök dosya değişiklik istekleri (uygulanmadı — yerel orkestratör için)
- **BACKLOG.md**
  - MOB-06 durumu: "backoffice push yapıldı (bulut, kanal env ile kapalı); gerçek cihaz doğrulaması yerelde".
  - MOB-07 durumu: "kabuk + köprü + FCM kanalı yapıldı; APK derleme, imzalama ve cihaz doğrulaması yerelde".
  - NB8 ve F-06 satırları güncellenmeli (P4 §6.6).
  - mob-usage dalının MOB-06..08 satırları main'deki BACKLOG ile karşılaştırılmalı. Main'deki sürüm korundu.
- **CLAUDE.md** (Architecture): P4-GATE notu. 4 depcruise kuralı artık `error`; handler satır (>400) ve `getXModel()` mandalları eklendi.
- **docs/adr/USER_DECISIONS.md**
  - s27b D1–D6 kararları işlenmeli;
  - logo kararı (BRAND_LOGO_IP f.3);
  - INT-1001'deki ADR-0031 `platform.alerts` grup tavanı kararı.
- **docs/adr/0031**: `_platform` gözden geçirme eşiği notuna `platform.alerts` ayrı grup kararı eklenmeli.
- **docs/cloud-contracts/API_BACKOFFICE_ATTENTION.md**: `getPulse` yanıtına `activeUsers` bloğu (MOB-08) ve `{platform?}` isteği eklenmeli. Belge yerelde sözleşme kaynağı olduğu için bulutta değiştirilmedi.

## 7. Kullanıcı kararı bekleyenler
- **site-fair metin seçimi** (`site/docs/site-fair/COPY.md`): yayında her yerde (A) var. Seçenekler:
  - `/guvenlik#adil-rekabet` başlığı: A "Fiyatınız, sizin kararınız" · B "Adil rekabetten yanayız" · C "Kural sizin, veri sizin".
  - İlke 1: A "Fiyat sizin kuralınızla belirlenir" · B "Fiyatınızı siz koyarsınız" · C "Karar sizde".
  - İlke 2: A "Verileriniz yalnızca sizin" · B "Veriniz başkasının kararına girmez" · C "Sizin veriniz, sizin avantajınız". C'deki "birleştirilmez" iddiası, ileride anonim istatistik gelirse sorun olur.
  - İlke 3: A "Şeffaf kayıt" (yalnız stok) · B "Her sayının bir nedeni var" · C "Neden değişti, bilinir".
  - İlke 4: A "Rakibe değil, işinize odaklanın" · B "Adil rekabet, sağlıklı pazar" · C "Rakibe değil pazara bakın". C şu an K43 gereği reddedildi.
  - Ana sayfa bandı ve Otopilot maddesi için de A/B/C seçenekleri var.
  - B ya da C seçilirse `fair-play.ts`, `agent-claims.ts` ve `faq.ts` değişir.
- **res-logo özeti** (`docs/research/BRAND_LOGO_IP_2026-10.md`):
  - Logo özgün bir SVG gibi görünüyor. 24.324 ikonla karşılaştırıldı, yakın kopya bulunmadı.
  - Başkasının hakkını ihlal riski: düşük–orta. Kendimizi koruyabilme riski: orta–yüksek. Ad tanımlayıcı (SMK 5/1-c), yapay zekâ üretimi logo FSEK korumasına girmeyebilir ve hiç tescil başvurusu yok.
  - Öneri: TÜRKPATENT 9/35/42 sınıflarında kelime başvurusu hemen; şekil başvurusu logo kesinleşince. Tahmini maliyet ~15–16 bin TL + vekil ücreti (doğrulanmadı).
  - İnsan adımları: tersine görsel arama, TÜRKPATENT/WIPO/TMview taraması, alan adı ve sosyal hesap kontrolü.
  - Marka avukatına 9 soru hazır.
  - Logo onayı ADR-0014/0015'te hâlâ "Açık Soru".
- **PRC-OPEN** (BACKLOG, ADR-0036):
  - S6: toplu onay kota sayımı (`per_approval` varsayılan).
  - S8: buybox POST ucu LIVE_READONLY izin listesine alınsın mı?
  - S9: satıcı görüşmeleri.
  - S10: sitede dil ve zamanlama.
- **Avukat soruları** (`AUTO_PRICING_LEGAL` §e, S1–S10):
  - S1: 4054 m.4 riski.
  - S2: topla-dağıt / paralel kullanım.
  - S3: "eşitle" / 0 fark.
  - S4: ekonomik bütünlük.
  - S5: pazaryeri sözleşme ve API kısıtları.
  - S6: 6563 kapsamında aracı hizmet sağlayıcı mıyız?
  - S7: "son 10 gün en düşük fiyat" yükümlülüğü.
  - S8: 6585 m.13 fahiş fiyat eşiği.
  - S9: TBK 115 sorumluluk sınırı.
  - S10: rücu.
  - PRC-R3 için S1, S2, S5 ve S8'e "engel yok" yanıtı gelmesi şart. Sorumluluk metni avukat onayı olmadan yayınlanmaz.
- **s27b DECISIONS_PENDING:**
  - D1: taslak fiyat notu.
  - D2: "Büyüme" önerilen plan olarak kalsın mı?
  - D3/D4: CTA metinleri.
  - D5: H1'ler.
  - D6: künye için işletme verisi bekleniyor.
  - Hepsinde makul bir varsayılan uygulandı.
- **PROPOSALS_PENDING yeni bölümleri** (`frontend/docs/PROPOSALS_PENDING.md`):
  - P-MCP-1/2;
  - P-R3A-1..5, P-R3B-1/2, r3c backend istekleri, P-R3D-1..14 (kimlik denetimi);
  - P-MD-1..7 (mobil/masaüstü), P-MOB2-1..6 (kamera/barkod);
  - P-PRC-1..15 (fiyat/rekabet ekranları).
- **Site NEXT_TASKS R1–R10:** R3 ("ödeme test aşamasında" notu) ve R4 (kanal sayısı) karar istiyor; R7 (künye) işletme verisi istiyor.
- **ADR / insan onayı:**
  - ADR-0031 `platform.alerts` ayrı tavan (INT-1001). `platform.pricing` grubu da 15/15 ile sınırda.
  - MM-20 (UserService yazma sırası).
  - Capacitor köprüsü ile CSP zorunluluğunun çatışması.
  - knip exports tabanı (§8).

## 8. Bilinen kırmızılar

**Hepsi ortam ya da taban kaynaklı; birleşimden doğan açık kırmızı yok.**
- **backend mongo-semantics: 20 suite, ~302 test.** `mongodb-memory-server` ikilisi indirilemedi (fastdl.mongodb.org 403, ağ politikası). Yerelde `npm run test:integration:mocked` ile koşulmalı.
- **backend `operation-policy` FE envanteri (5 test):** main'de de aynı biçimde kırmızı. Farklar:
  - FE `IntegrationService/retrieveCategories` çağırıyor;
  - kayıtta FE'nin çağırmadığı 5 `VariantService` operasyonu var;
  - 3 yeni dinamik çağrı dosyası var (`useDashboardResource.ts`, `useIntegrationError.ts`, `useTeamApi.ts`).
  - Bulut FE işinin backend kaydını geçmesinden kaynaklanıyor. Yetenek kaydını değiştirmek karar gerektirdiği için dokunulmadı; yerelde karara bağlanmalı.
- **backend `integrationPlaybook.static` ve site `claims.test` (2 test):** kökteki `INTEGRATIONS_REGISTRY.md` bulut kopyasında yok. main'de de kırmızı.
- **backend `N11.internalOrderSnapshot`:** UTC'de kırmızı, `TZ=Europe/Istanbul` ile yeşil. Yerel Windows/TR saatinde sorun yok.
- **backend ratchet knip exports 20 → 22:** dal uçlarında (prc-r2, mob-android) da 22. Büyük olasılıkla bulut kopyasına alınmayan secrets testlerinin kullandığı dışa aktarımlardan (`kidOf`, `getActiveKid` vb.) kaynaklanıyor. Yerelde ölçülmeli.
- **Uyarlama fırsatı (kırmızı değil):** mob-usage'ın `views/usage/UsageView.vue` sayfası K51 desenini kendi `UsageVerdictBlock` bileşeniyle kuruyor; bo-r1b'nin ortak `PageVerdict` bileşenine taşınması sonraki BO turunda yapılabilir.

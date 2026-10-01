# FE_CFG2 raporu — açılış yapılandırması kalanı, destek iletişimi, sistem ayarları, kullanım hükmü

Dal `cloud/fe-cfg2` · taban `origin/main` (`sync: faz3-arayuz @ 487e2869`) · tarih 2026-10-01 · yalnız `frontend/` (backoffice dahil) değişti.

## Ön doğrulama (BACKLOG durumları eski olabilir — koddan kontrol)

| Kalem | BACKLOG | Koddaki gerçek durum (başlangıç) | Bu işte |
|---|---|---|---|
| FE-CFG-1 | açık | Store, `config/imageUrl.ts`, `useUploadLimit`, 7 görsel bileşeninin 4'ü, 5 liste ve 2 rapor **bağlıydı**. fe-b2 ile yeniden yazılan galeri (`ProductImagesComponent`, `ProductVariantImagesComponent`, `images/*`) ve fe-c3b sonrası 8 listede bağ **yoktu**. | Kalan bağlar yapıldı |
| FE-CFG-2 | açık | `ShellNoticeBanner` (bakım + duyuru), yardım menüsü / hesap menüsü destek grubu **vardı**. Giriş ekranında destek iletişimi **yoktu**. DESIGN_SYSTEM §33'te anılan `e2e/specs/public-config.spec.ts` ve `cfg-review` birleşimde **gelmemişti**. | Giriş ekranı + e2e eklendi |
| FE-CFG-3 | açık | 7 tanım görünümünde kişisel veri benzeri sabit demo satırları (ad, e-posta, `05…22` telefonu, TC/vergi no) **duruyordu**. | Silindi, boş durum |
| BO-CFG-1 | açık | **Büyük ölçüde yapılmış:** `/sistem/bayraklar` (Platform ayarları) — bakım kartı, platform ayarları (`SettingField`), özellik bayrakları, salt okunur Ortam, yayın geçmişi + geri alma, `PageVerdict` (Durum → Karar → Eylem → Ayrıntı), sahte uçlar (`api/mock/ops/platform.ts`), mobil denetim (`mobile.spec.ts` 360/430 px ≥44 px + axe). Eksik: geri alma ve duyuru yayını için e2e, inceleme kareleri. | Eksikler tamamlandı (kod değişikliği gerekmedi) |
| Görev 4 (INT-1001 §8) | — | `UsageView` kendi `UsageVerdictBlock`'unu kullanıyordu. | Ortak `PageVerdict`'e taşındı |

**Birleşim tespiti:** depo geçmişi `sync: faz3-arayuz @ …` sıkıştırılmış commit'lerinden oluşuyor; `preview-fe-2: fe-cfg kısmi` birleşimi `git log`'da ayrı görünmüyor. Kalan sabitler bu yüzden doğrudan koddan tarandı (envanter `docs/audits/HARDCODED_CONFIG_INVENTORY_2026-09-30.md` F1/F3/F9/F21 + DESIGN_SYSTEM §33). fe-b2/fe-c3b ile değişen ve bağı eksik kalan 5 dosya: `crud/ProductImagesComponent.vue`, `variants/ProductVariantImagesComponent.vue`, `images/useImageUploads.ts`, `images/photoPrep.ts` (+ `galleryModel.ts`), ve c3b sonrası liste dosyaları (`FinancialPayoutsTab`, `FinancialCargoInvoicesTab` vb.).

## Kalem başına durum

### Görev 1 — FE-CFG-1 / FE-CFG-3 kalanı — TAMAM
- **Galeri görsel adresi:** yeni `images/gallerySrc.ts` (`provideGallerySrc` / `useGallerySrc`) → `useProductImageUrl` → `config/imageUrl.ts` kuralı (önce DB `url`, yoksa public-config tabanı + backend yolu). `ProductImagesComponent`, `ProductVariantImagesComponent`, `ImageLightbox`, `ImagePicker`, `VariantImageAssign` artık `.url`'i doğrudan okumuyor. Sağlayıcı yoksa yalnız DB `url` (eski davranış).
- **Yükleme tavanı:** `checkFiles(files, maxBytes)` tavanı aşan dosyayı "Dosya çok büyük — görsel başına en çok X" gerekçesiyle reddeder; `useImageUploads` değeri `publicConfig.uploadMaxBytes`'tan geçirir. Kamera hazırlığı (`preparePhoto`) tavanı parametre olarak alır (galeri public-config değerini verir; yedek sözleşmedeki 10 MB); "10 MB sınırını" sabit metni "yükleme sınırını" oldu.
- **Liste sayfa boyutu:** 8 dosyada `limit: 25` / `ref(25)` → `defaultListPageSize()` (`ProductListView`, `ChoiceListView`, `HashtagListView`, `FinancialListView`, `InvoiceListView`, `MessageListView`, `FinancialPayoutsTab`, `FinancialCargoInvoicesTab`). Eski yönetim paneli (`views/secure/adminPanel/`, ADR-0026 ile backoffice'e taşınıyor) ve DS vitrin rotası bilerek hariç.
- **FE-CFG-3:** 7 görünüm ortak `LegacyDefinitionEmpty.vue` gövdesine indi (her biri kendi `EkPageHeader`'ı + `EkEmptyState`); ~2.170 satır sahte veri silindi. Pattern mandalı düştü (taban yeniden yazıldı: 14 kategori azaldı).
- **Mandal:** `tests/fe-cfg-rest.test.ts` (10 test) — `05xxxxxxxxx` deseni ve demo e-posta/ad `src/`'de yok (tek istisna yazdırma şablonunun açıkça kurgusal `SAMPLE_ORDER`'ı), 7 görünüm boş durumda, liste `25` sabiti yok, galeri `.url`'i doğrudan okumuyor, tavan public-config'ten; `checkFiles`/`preparePhoto` birim testleri.

### Görev 2 — FE-CFG-2 — TAMAM
- Yardım menüsü (≥768 px) ve hesap menüsü (<768 px) destek grubu zaten public-config'ten (`supportContact.ts`) geliyordu — doğrulandı, değişmedi.
- **Giriş ekranı:** `LoginView` altında "Yardım mı gerekiyor?" satırı — `supportContactLinks()` (aynı `mailto:`/`tel:` kuralı), `nav aria-label="Destek iletişimi"`, düz metin, boş öğe yok, ikisi boşsa satır yok; dokunmatikte ≥44 px. Varsayılan yapılandırmada render edilmez → görsel tabanlar değişmez.
- Bakım şeridi giriş ekranında, bakım + duyuru oturumlu kabukta zaten vardı (`UnsecureLayout`/`SecureLayout`).
- **e2e** `e2e/specs/public-config.spec.ts` (4 test; 3. projede 1'i telefonda bilerek atlanır): boş yapılandırmada öğe yok; giriş ekranında bakım + mailto/tel + axe AA; yalnız e-posta; kabukta bakım → duyuru sırası, `<b>` düz metin, kapatma, yardım menüsü destek grubu. Fikstür `e2e/fixtures/publicConfig.ts`.

### Görev 3 — BO-CFG-1 — TAMAM (önceden yapılmıştı; doğrulandı + test/kare eklendi)
- Kabul (a) E değerleri düzenlenemez: `EnvPanel` yalnız kimliksiz public-config'ten okur, kaydetme isteğine girmez ✔ · (b) doğrulama hatası alanda ✔ (`settings-admins.spec` "geçersiz değer") · (c) yayın gerekçe (≥10) + step-up ister ✔ · (d) yetki backend'de (`/admin-api` platformAdmin + REAUTH).
- Sahte uçlar `api/mock/ops/platform.ts` backend kataloğuyla (`backend/src/integration/config/catalog/platform.ts`) anahtar anahtar uyumlu (9 `_platform` anahtarı + 3 bayrak).
- **Eklenen e2e** (`backoffice/e2e/specs/settings-admins.spec.ts`): duyuru şeridi alanı → taslak → gerekçeli yayın → geçmişte "Yayında"; geçmişten geri alma → fark + gerekçe + step-up → yeni sürüm "Geri alma" kökenli.
- Mobil dokunma katmanı: `/sistem/bayraklar` zaten `mobile.spec.ts`'in 360/430 px ≥44 px ve yatay taşma denetiminde ve 390 px axe (açık/koyu) listesinde.

### Görev 4 — Kullanım hükmü ortak PageVerdict'e — TAMAM
- `usageVerdict.ts` `toPageVerdict()` — içerik aynı: başlık → hüküm, cümle → not, uyarı/bilgi kararları → bağlantılı dikkat maddeleri (neden → etki, eylem metniyle), "Müdahale gerekmez" + nedeni → sakin başlık, eylemler aynı sırada (ilki "Önerilen ilk adım" kartı). Kararlara hedef eklendi (belirlenemeyenler → `?platform=unknown`, mobil çoğunluk → `?platform=mobile`, okunamadı → `/altyapi`, alt sınır → `#kullanim-ayrinti`); veri yokken rozet "Veri yok".
- `UsageView` `PageVerdict`'i `data-testid="usage-verdict"` sarmalayıcısıyla kullanır; davranış (süzgeçler, durum blokları, yenileme) aynı.
- **Görünüm notu:** ortak desene geçmek görünümü bilinçli olarak diğer BO sayfalarıyla aynı yapar (Durum başlığı + ilk adım kartı + dikkat listesi + "Diğer eylemler" + "Ayrıntılar"); karşılaştırma `docs/mob-usage-review/01-kullanim-light-1440.png` ↔ `docs/fe-cfg2-review/bo-05-kullanim-pageverdict-light-1440.png`. Müşteri detayı sekmesi `UsageVerdictBlock`'ta kaldı (P-CFG-4).
- Testler: `tests/mob08-usage.test.ts` +3 (model eşlemesi), `e2e/specs/usage.spec.ts` ortak test kimlikleriyle güncellendi.

## Değişen dosyalar
- Uygulama: `src/components/productDefinitions/{crud/ProductImagesComponent.vue, variants/ProductVariantImagesComponent.vue, images/{gallerySrc.ts (yeni), galleryModel.ts, photoPrep.ts, useImageUploads.ts, ImageLightbox.vue, ImagePicker.vue, VariantImageAssign.vue}}`, `src/components/financial/{FinancialPayoutsTab,FinancialCargoInvoicesTab}.vue`, `src/views/secure/{FinancialListView,InvoiceListView,MessageListView}.vue`, `src/views/secure/productDefinitions/{ProductListView,ChoiceListView,HashtagListView}.vue`, `src/views/secure/definitions/{7 görünüm, LegacyDefinitionEmpty.vue (yeni)}`, `src/components/layout/supportContact.ts`, `src/views/unsecure/LoginView.vue`, `pattern-baseline.json`.
- Uygulama testleri: `tests/fe-cfg-rest.test.ts` (yeni), `e2e/specs/{public-config.spec.ts (yeni), fe-cfg2-review.spec.ts (yeni), legacy-definition-placeholders.spec.ts}`, `e2e/fixtures/publicConfig.ts` (yeni).
- Backoffice: `src/views/usage/{UsageView.vue, usageVerdict.ts}`, `tests/mob08-usage.test.ts`, `e2e/specs/{settings-admins.spec.ts, usage.spec.ts, review-fe-cfg2.spec.ts (yeni)}`, `docs/fe-cfg2-review/*.png` (27 kare).
- Belgeler: `frontend/docs/PROPOSALS_PENDING.md` (yeni bölüm), bu rapor.

## İnceleme rotaları
- Uygulama (`npm run dev`, 3020): `http://localhost:3020/login` (backoffice'te destek e-postası/telefonu ve bakım açıkken) · oturumlu kabuk `http://localhost:3020/` (bakım + duyuru şeridi; sağ üst "Yardım" → Destek iletişimi) · ürün galerisi: ürün düzenle → "Ürün Resim Galerisi" · eski tanım ekranları menüde yok (boş durum, `app-03-*` karesi).
- Backoffice (`npm run dev:backoffice`, 3100): `http://localhost:3100/sistem/bayraklar` (Platform ayarları — `#bakim`, `#ayarlar`, `#gecmis`) · `http://localhost:3100/musteriler/kullanim` · `http://localhost:3100/musteriler/103?sekme=kullanim`.
- Kareler: `frontend/backoffice/docs/fe-cfg2-review/` — `bo-01…06-*` (sistem ayarları, yayın diyaloğu, taslak, geri alma, kullanım, veri yok) ve `app-01…03-*` (giriş destek + bakım, kabuk şeritleri, tanım boş durum); her biri `light-1440`, `dark-1440`, `light-390`.

## Test sonuçları (bulut, 2026-10-01)
| Kontrol | Sonuç |
|---|---|
| frontend vitest (tam) | **94 dosya / 1751 test yeşil** (`npm run tokens` ile git-ignored token dist'i üretildikten sonra; üretilmeden 3 dosya ENOENT ile kırmızı — ortam) |
| `test:backoffice` | backoffice **31 dosya / 339 test**, ui **6 dosya / 43 test** yeşil |
| vue-tsc (uygulama + backoffice) | 0 hata |
| style / pattern / no-console / typecheck ratchet | OK (pattern tabanı düşüşle yeniden yazıldı) |
| contract-paths | OK (171 kanca) |
| `build` + `build:backoffice` | başarılı |
| lint | 0 hata (uyarılar mevcut taban) |
| frontend Playwright (ilgili spec, chromium-desktop) | public-config 4/4, legacy-definition 7/7, product-definition-parts + product-variant-dialogs 10/10; chromium-mobile: 10 geçti, 1 bilerek atlandı |
| backoffice Playwright (ilgili, ara adım) | usage 4/4, settings-admins "sistem ayarları" 6/6 (biri soğuk başlangıçta bir kez zaman aşımı, tek başına yeşil) |
| **backoffice Playwright tam koşu** | BO_FULL_RUN |

Not: bulutta Playwright `playwright.cloud.config.ts` (uygulama) ve `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium` (backoffice) ile koşuldu; `cdn.playwright.dev` 403 (kurulum betiğindeki tarayıcı indirmesi başarısız, önceden kurulu Chromium kullanıldı). Rollup'ın linux ikilisi kilit dosyasında yok: `npm i --no-save @rollup/rollup-linux-x64-gnu@4.63.5`. `*-linux.png` commit'lenmedi; görsel onay yerelde.

## PROPOSALS_PENDING eklemeleri
P-CFG-1 eski tanım ekranlarını tamamen silmek · P-CFG-2 yükleme tavanı yedeğini 10 MB yapmak · P-CFG-3 duyuru seviyesi "kritik" · P-CFG-4 müşteri detayı kullanım sekmesi için kompakt PageVerdict · P-CFG-5 sakin bilgi maddesinin nedenini göstermek.

## Backend istekleri
- Zorunlu bir backend eksiği bulunmadı (BO-CFG-1 uçları ve public-config sözleşmesi mevcut, mock ile anahtar anahtar uyumlu).
- İsteğe bağlı (P-CFG-3): `announcement.level` zod şemasına `critical`.
- Bilgi: backend `support.email` varsayılanı dolu (`catalog/platform.ts`) — canlıda giriş ekranında ve yardım menüsünde destek e-postası varsayılan olarak görünür (beklenen davranış; istenmezse varsayılan boş yapılmalı).

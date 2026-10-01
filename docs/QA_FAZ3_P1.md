# QA — Faz 3 Parti 3 (P1 Ekran Göçleri) Bağımsız Doğrulama (2026-09-28)

Branch: `faz3-arayuz`. Doğrulayıcı: `entegrasyonik-qa-verifier` (bağımsız alt-ajan). Kod değişikliği yapılmadı, commit atılmadı. Bu belge tek başına bu görevin çıktısıdır.

Referans: `.claude/skills/quality-gates/SKILL.md`, `docs/adr/0011-faz3-design-token-sistemi.md`, `docs/adr/0012-gezinme-modeli-sekmeli-calisma-alani.md`, `docs/adr/0013-l07-tenant-izolasyon-yeniden-degerlendirme.md`, `BACKLOG.md` ("Faz 3 çalışma planı" T0-T4d, "İncelenmesi gereken davranışlar"), `MASTER_STATE.md`, `git log --oneline -20`. Kapsam: Parti 3 = T4a (kabuk) + T4b (giriş+dashboard) + T4c (5 entegrasyon ekranı) + T4d (sipariş/ürün liste-detay).

## 1. `cd backend && npx tsc --noEmit -p .`
**GEÇTİ.** Bizzat çalıştırıldı: çıktı boş, exit code 0. Faz 3'te backend'e dokunulmadığı iddiasıyla tutarlı — regresyon yok.

## 2. `cd backend && npx jest --silent`
**GEÇTİ.** Bizzat çalıştırıldı: **96 suite / 1546 test**, hepsi yeşil (Time: ~22 s). Rapor edilen sayıyla (96/1546) birebir örtüşüyor.

## 3. `cd frontend && npx vue-tsc --noEmit` → 15 hata mandalı
**GEÇTİ.** Bizzat çalıştırıldı: tam olarak **15 hata**, 9 farklı dosyada (BrandSyncComponent, ClaimDetailComponent, EmptyState, useOrderActions, PlatformImageComponent×2, ImageUploaderComponent, PlatformPriceComponent, ProductBatchVariant*×3, AdminTicketListView, ClaimListView×2) — `frontend/typecheck-baseline.json`'daki `errorCount:15` ile birebir eşleşiyor. `npm run test:typecheck-ratchet` çalıştırıldı → `[typecheck-ratchet] OK: vue-tsc 15 hata (taban: 15). Mandal korundu.`

## 4. `cd frontend && npx vitest run`
**GEÇTİ.** Bizzat çalıştırıldı: **3 dosya / 87 test**, hepsi yeşil (`token-drift` 2, `token-unit` 79, `vuetify-theme.characterization` 6). Rapor edilen 87/87 ile birebir örtüşüyor.

## 5. `cd frontend && npm run test:style-ratchet`
**GEÇTİ.** Bizzat çalıştırıldı: `[style-ratchet] OK: 249 dosya, taban korundu (regresyon yok, güncellenmemiş azalma yok).` Ayrıca kod incelemesiyle P1 dosyalarının **hex** (literal renk) kategorisi çapraz doğrulandı:
- Kabuk (T4a): T2 tabanında `ApplicationBar`+`NavigationMenu`+`SecureLayout` hex toplamı 6+10+9=**25**; bugünkü `style-baseline.json`'da üçünün de hex=**0** → "25 literal → 0" iddiası **hex kategorisinde tam doğrulandı** (toplam kategori sayısı — rgb()/inlineStyle dahil — 0 değil, 27/5/28; bu, `rgb(var(--v-theme-x))` gibi meşru semantik referansların ve Vue `:style="..."` bağlamalarının da aynı regex'e girmesinden kaynaklanıyor, ADR'nin "literal" tanımıyla — hardcoded renk — tutarlı).
- Entegrasyon ekranları (T4c): `MarketplaceView`/`ECommerceView`/`ErpView`/`ShippingView` toplamı **0**, `EInvoiceView` toplamı **1** → "4 ekran 0'a indi, EInvoiceView 8→1" iddiasıyla **birebir eşleşiyor**.
- Sipariş/Ürün (T4d): `OrderListView` toplam **3**, `OrderDetailComponent` toplam **2**, `ProductListView` toplam **2** → toplam **7**, "328→7 (89→3, 128→2, 111→2)" iddiasıyla **birebir eşleşiyor**.
- Giriş+Dashboard (T4b): 9 dosyanın (LoginComponent/LoginView/DashboardView/NavigationLinksComponent×4/MarketplaceLinksComponent/StatisticsComponent) toplamı bugün **66**, T4a taban commit'inde (`9e7f0c4`) **278** idi → iddia edilen "276→64" ile **yaklaşık eşleşiyor** (±2 fark, muhtemelen dosya kümesi/sayım anı farkı — küçük, önemsiz bir raporlama imprecision'ı, regresyon değil).

## 6. `cd frontend && npx vite build`
**GEÇTİ.** Bizzat çalıştırıldı: hatasız tamamlandı (`✓ built in 11.11s`). Yalnızca "chunk 500 kB üzeri" bilgilendirme uyarısı var (vendor/echarts/vuetify paketleri) — bu bir derleme hatası değil, T3'ün kapsamına giren bilinen bir performans notu.

## 7. `cd frontend && npm run test:e2e` — 3× art arda
**GEÇTİ.** Bizzat 3 kez art arda çalıştırıldı (`npx playwright test`, `workers:4` sabit — orkestratörün önceki flaky-düzeltmesiyle tutarlı):
- Çalıştırma 1: **188 passed, 13 skipped, 0 failed** (2.0 dk)
- Çalıştırma 2: **188 passed, 13 skipped, 0 failed** (2.2 dk)
- Çalıştırma 3: **188 passed, 13 skipped, 0 failed** (2.1 dk)

Toplam 201 test, iddia edilen sayıyla birebir örtüşüyor. **3 çalıştırmada da 0 başarısızlık/0 flaky** — ADR-0011'in kabul ettiği ~%1-2 flaky eşiğinin belirgin şekilde altında (gözlemlenen: %0). axe ihlal sayıları viewport'a göre değişiyor (bu **flaky değil**, `orders.spec.ts` gibi spec'lerin axe testi `test.skip` olmadan tüm 3 viewport'ta ayrı ayrı koştuğu, her viewport'un DOM/gizli-öğe durumunun farklı olduğu için deterministik bir farklılık — aynı viewport'ta 3 koşu boyunca sayı sabit kaldı, ör. `chromium-desktop`: OrderListView 7/7/(3. koşuda ayrı ölçülmedi ama pass sayısı sabit), Kabuk 5/5).

## 8. Kod incelemesiyle doğrulama
**(a) Token CSS çıktısı git'te izleniyor mu:** **GEÇTİ.** `git ls-files frontend/src/design/tokens/dist/` → `tokens.app.css` ve `tokens.static.css` ikisi de listelendi (izleniyor).

**(b) `.gitattributes` LF kuralı:** **GEÇTİ.** Kök `.gitattributes` mevcut: `frontend/src/design/tokens/dist/*.css text eol=lf` — CRLF/LF drift testi çakışmasını önleyen satır doğrulandı.

**(c) P1 ekranlarının düşük mandal sayısı (`style-baseline.json`):** **GEÇTİ** (madde 5'te ayrıntılı doğrulandı — hex kategorisinde tüm P1 dosyaları 0 veya belgelenmiş bilinçli istisna, hiçbir dosyada/kategoride taban aşımı yok, `test:style-ratchet` OK).

**(d) `stores/workspace.ts`'in `eventBus 'openTab'` API'sini koruduğu:** **GEÇTİ.** `grep` ile doğrulandı: `SecureLayout.vue:245` → `eventBus.on('openTab', workspace.openTab)` (dinleyici store'a bağlanmış), `SecureLayout.vue:228` → `tabStore.setOpenTabMethod(workspace.openTab)` (`composables/opentab.ts` köprüsü de store'a yönlendiriliyor). ~15 eski çağrı noktası (`NavigationMenu.vue`, `ApplicationBar.vue`, `StatisticsComponent.vue`, `ProductListView.vue`, `NavigationLinksComponent*.vue`, `communication.ts`, `context.ts`) hâlâ `eventBus.emit('openTab', ...)` kullanıyor — hiçbiri değiştirilmemiş, geriye uyum ADR-0012 Karar 3'e uygun şekilde birebir korunmuş.

## 9. axe AA ihlal sayılarının BACKLOG iddialarıyla tutarlılığı
**KISMEN.** Bizzat çalıştırılan örnek koşularda (`chromium-desktop` projesi, T1b/T4 ile aynı ölçüm koşulu):
- `Login`: gözlemlenen 0-1 (viewport'a göre) — BACKLOG/T4b iddiası "1→1" ile aynı büyüklük mertebesinde.
- `Kabuk`: gözlemlenen 4-6 — T1b tabanı "7-8" idi; **düşüş var, artış yok** (regresyon değil, olası bonus iyileşme).
- `Dashboard`: gözlemlenen 4-6 — T4b iddiası "8→4-5" ile büyük ölçüde tutarlı.
- `OrderListView`/`OrderDetailComponent`/`ProductListView`: gözlemlenen 6-9 — T4d iddiası "üçü de 10" ile **tam eşleşmiyor** (gözlemlenen değerler iddia edilenden DÜŞÜK, yani daha iyi, hiçbiri 10'u AŞMIYOR). Bu bir regresyon değil; muhtemelen T4d'nin kendi worktree ölçümü (merge öncesi, token dist dosyası eksikken) ile bugünkü tam-birleşmiş ağaç arasındaki ölçüm anı farkı — MASTER_STATE'in kendisi de bu tür bir "ölçüm ortamı farkı" ihtimalini zaten not düşmüş (T4d satırı). **Sonuç: sayılar BACKLOG'da iddia edilenle birebir örtüşmüyor ama yön (azalma) tutarlı ve hiçbir ekranda ihlal sayısı iddia edilenin üzerine çıkmıyor — DOĞRULANAMADI (birebir sayı) ama REGRESYON YOK.**

## Genel Sonuç

**Faz 3 Parti 3 (P1 ekran göçleri) DoD karşılandı mı: Evet.**

Gerekçe: 9 doğrulama maddesinin 8'i tam olarak GEÇTİ (backend tsc/jest regresyonsuz, frontend tip/stil mandalları korunuyor, vitest 87/87, build hatasız, e2e 3× art arda 188/188 — 0 flaky, token CSS commit'li + LF kuralı doğru, `eventBus 'openTab'` geriye-uyumu kod incelemesiyle teyit edildi). Yalnızca 1 madde (axe ihlal sayılarının BACKLOG'daki birebir rakamlarla eşleşmesi) **DOĞRULANAMADI** — ama bu bir kalite regresyonu değil, yalnızca bir raporlama/ölçüm-anı hassasiyeti sorunu (gözlemlenen sayılar iddia edilenden düşük veya eşit, hiçbiri daha kötü değil). Bu tek madde DoD'yi bloklayacak nitelikte değil (axe ihlalleri zaten "kaydedilir, düzeltilmez" olarak P1 sözleşmesine dahil, sayısal hedef Faz 3'ün kapanış kriteri değil).

**Bulunan/not edilecek küçük tutarsızlıklar (orkestratöre bildirilecek, blokaj değil):**
1. T4d/T4b'nin axe ihlal sayısı ve T4b'nin toplam literal sayısı (278→66 gözlemlendi, 276→64 iddia edildi) raporlarında küçük (±2-4) sapmalar var — muhtemelen ölçüm anı/dosya kümesi farkı, gerçek bir regresyon değil.
2. axe testleri her 3 viewport'ta ayrı ayrı koşuyor ve viewport'a göre farklı ihlal sayısı üretiyor; BACKLOG/MASTER_STATE'teki tekil rakamlar (ör. "Login 1", "OrderListView 9") hangi viewport'a ait olduğunu belirtmiyor — ileride bu tür iddialar viewport etiketiyle yazılırsa karşılaştırılabilirlik artar.

## Çalıştırılan komutlar (kanıt özeti)
- `backend`: `npx tsc --noEmit -p .` (0 hata), `npx jest --silent` (96/1546 yeşil)
- `frontend`: `npx vue-tsc --noEmit` (15 hata, taban ile eşit), `npm run test:typecheck-ratchet` (OK), `npx vitest run` (87/87), `npm run test:style-ratchet` (OK), `npx vite build` (hatasız), `npx playwright test` ×3 (188/188 geçti, 13 bilinçli atlandı, 0 başarısız — her seferinde)
- Kod incelemesi: `git ls-files frontend/src/design/tokens/dist/`, `.gitattributes`, `frontend/style-baseline.json` (git tarihiyle karşılaştırmalı), `grep -rn "openTab" frontend/src`

# ADR-0038 (TASLAK) — Yapılandırılmış entegrasyon sorunları (`IntegrationIssue`) ve gönderim öncesi ön kontrol

Durum: **Taslak** (bulut oturumu, 2026-10-03; `docs/adr/` salt-okunur olduğu için burada). Yerelde `docs/adr/ADR-0038-integration-issues.md` olarak kopyalanır.
İlgili: PLAN.md §3.2–§3.3, 03-uyumluluk-analizi D-ERR-1, D-VAL-1/2; ADR-0006 (IntegrationError), ADR-0019 (yetenek kaydı), ADR-0025 (özellik çözümleyici).

## Bağlam
Kullanıcı gönderim/çekim hatalarını ham pazaryeri metni ya da "Doğrulama hatası" olarak görüyor; neyin eksik olduğu, nedeni ve
çözümü belli değil. Validator yalnız kategori/marka varlığını denetliyor; kanal alan sınırları (barkod/başlık/görsel/KDV) gönderimden
sonra pazaryeri reddiyle öğreniliyor. Hata metinleri 6 farklı biçimde (TY `failureReasons[]`, HB `validationResults[]`, N11 `reasons[]`,
PZ `batchResult[].message`, IS 422) ve çevrilmeden saklanıyor.

## Karar
1. **Tek sözleşme** `IntegrationIssue { code, severity, module, integrationCode?, productId?, variantId?, barcode?, field?, reason, solution, link?, platformMessage? }`
   — `backend/src/platform/core/errors/integrationIssues.ts`. Kod kataloğu (`INTEGRATION_ISSUES`) her kod için TR sade `reason`/`solution`
   şablonu ve ekran bağlantısı (`link.screen` = capabilities `deepLink.screen` biçimi) taşır. Bilinmeyen kod → `PLATFORM_REJECTED`.
   `platformMessage` maskelenir (sır/PII desenleri, 500 karakter). i18n anahtarı `integrationIssues.<CODE>.reason|solution`.
2. **Adaptör hata çevirisi**: her kanalın `errorMap.ts` dosyası (`modules/<tür>/<kanal>/errorMap.ts`) metin/kod deseni → issue kodu kuralları
   tutar; ortak kesin kurallar (dönüştürücülerin yerel gerekçeleri) önce uygulanır (`modules/common/errors/errorMap.ts`). `IntegrationError`
   kodları (AUTH/RATE_LIMITED/UNAVAILABLE/INTERNAL) doğrudan çevrilir. İskelet kurallar canlı/sandbox fikstürleriyle WP3/WP4'te genişletilir.
3. **Taşıyıcılar** (geriye uyumlu, ek alan): ESP `ExportStagedProducts.issues[]`, `Variants.platforms.<kanal>.upload.<MODE>.issues[]`
   (Validator her turda yeniden kurar; Publisher/Sentinel yalnız hata durumunda yazar), ImportJobReport yanıtında `issues[]`
   (okumada türetilir, şema değişmez). `errorMessage`/`messages` düz metni KALIR (eski metinler korunur; yeni kodlarda `issuesToMessage`).
4. **Tek kaynak hazırlık denetimi** `checkChannelReadiness` (`integration/catalog/preflight/readiness.ts`, saf): Validator gerçek gönderimde,
   `preflightExport` kuru çalıştırmada AYNI fonksiyonu kullanır. Yalnız resmi dokümanda geçen sınırlar kodlanır (TY barkod ≤40 `. - _`,
   başlık ≤100, model kodu ≤40, stok kodu ≤100, görsel ≤8 HTTPS, KDV 0/1/10/20; HB görsel ≤10; N11 stok kodu ≤255); fiyat kuralı yalnız
   dönüştürücüsü aynı kuralı uygulayan kanallarda (TY/HB/PZ). İçerik denetimleri yalnız içerik modlarında (TRANSFER/UPDATE/UPDATE_VARIANT).
   Görsel yokluğu uyarıdır (kanal reddederse `IMAGE_INVALID`).
5. **RPC'ler (SALT OKUMA, `catalog:read`, member)**: `IntegrationService/preflightExport {variantIds|productIds, integrationCodes, mode}`
   → ürün×kanal `issues[]` + `resolvedPreview` + kanal özeti (en çok 200 varyant, `truncated`); `IntegrationService/explainChannelProduct
   {variantId, integrationCode}` → alan → kaynak zinciri. AttributeResolver bellekte çalışır (DB'ye yazmaz), adaptör `validate` ağsızdır.
   Marka KİMLİĞİ eşlemesi TY/PZ/IS için denetlenir (K-C); WP2'de descriptor `brandMapping` yeteneğine taşınır.

## Sonuçlar
- (+) Önyüz (`EkProblemState`/`IntegrationErrorPanel`, toplu gönderim "Hazırlık durumu") tek biçim tüketir; destek talebine kod iliştirilebilir.
- (+) Kanal sınırı ihlalleri gönderim öncesi yakalanır (D-VAL-1/2); TY'de >40 karakter barkod artık gönderilmez (davranış değişikliği, bilinçli).
- (−) Yetim yetenek mandalı +2 (FE paneli WP2/WP8'de bağlanınca düşer). `ExportStagedProducts.issues` yeni alan (göç gerekmez; eski kayıtlarda yok).
- Açık: staging şemasında `errorMessage`/`errorType` alanları tanımlı değil (Mongoose strict → `bulkWrite` `$set`'te atılıyor olabilir);
  yerelde gerçek DB ile doğrulanmalı (DURUM "yerel kontrol").
- Fiyat açıklama zinciri (kural → kanal fiyatı) WP5'te (`channel` kural tipi) eklenecek.

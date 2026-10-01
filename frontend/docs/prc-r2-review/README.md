# prc-r2 — Fiyat kuralları: rekabet kuralı, KURU öneri, İNSAN ONAYLI uygulama (PRC-R2)

Dal `cloud/prc-r2` (taban `origin/cloud/prc-r1` + `origin/cloud/prc-legal`). Sözleşme tek kaynağı: `docs/PRICING_COMPETITION.md` §R2
(kural→test eşleme tablosu §R2.7). Hukuk: `docs/research/AUTO_PRICING_LEGAL_2026-10.md` §c K1–K20 (K58: R2 şimdi, R3 avukat yanıtına kadar YOK).
**Otomatik (insan onaysız) uygulama yolu kodda yoktur**: fiyat yalnız onay penceresinden (ekran) ya da Otopilot/MCP onay kartından (PendingAction)
değişir; zamanlanmış iş yalnız öneri yazar ve yayıncısı her zaman reddeder. K48: akış/IA önerileri → `docs/PROPOSALS_PENDING.md` P-PRC-9..15.

## Ne yapıldı

| Alan | Yapılan | Dosya |
|---|---|---|
| Backend model | `PriceRules` (B-10 fiyat kuralının `competition` TİPİ; ayrı servis yok), `PriceSuggestions` (kural×varyant tek güncel kayıt), `PriceHistory` (K10, ≥30 gün), `PricingSettings` (K3/K19) | `backend/src/database/client/models/Price*.ts` |
| Kural doğrulama | K1 fark > 0 (0'a yuvarlanan da red), K4 varsayılan yok, K6 rakip alanı yok (strict), K8/K12 platform sınırları | `operations/pricing/priceRule.ts`, tel şeması `capabilities/rpc-input/catalog.ts` |
| Motor (KURU) + sigorta | Kuruş tabanlı saf motor; K7 taban/tavan, K8 artış, K9 liste fiyatı, K12 sıklık/soğuma/salınım, K13 bayat veri, K17 dış değişiklik → kural durur; bağımsız `fuseCheck` | `operations/pricing/ruleEngine.ts` |
| Öneri üretimi / uygulama | Buybox turundan sonra KURU koşu; onaylı uygulamada sigorta TAZE veriyle yeniden; yalnız Trendyol satış fiyatı; mevcut yayın hattı (UPDATE_PRICE); geçmiş + denetim (K18) | `operations/pricing/priceRules.ts`, `api/rpc/handlers/pricing-service.ts` |
| Yetenekler (ekran = Otopilot/MCP) | `pricing.rules.list` (read), `pricing.rules.save` (admin; MCP'ye kapalı — K4), `pricing.rules.settings` (admin; yalnız ekran — K3), `pricing.suggestions.list` (read), `pricing.suggestions.apply` (admin, `pricing:manage`, PendingAction, risk **high**, sunucu önizlemesi önce→sonra) | `capabilities/domains/pricing.ts`, `present/specs.ts`, `refVerifiers.ts` |
| Anahtarlar | Platform `features.pricingRules` (varsayılan kapalı), tenant `PricingSettings.enabled` + taslak metin kabulü, kural `enabled` | `catalog/features.ts`, `priceRules.ts` |
| S6 (açık karar) | `pricing.suggestions.bulkApplyQuota` (`per_approval` varsayılan = toplu onay 1 eylem) — sohbet + MCP aynı sayaç | `catalog/pricing.ts`, `agentEntitlement.ts` |
| Bildirim | `PRICE_RULE_PAUSED` (dış değişiklik/salınım; "indirim" dili yok) | `notifications/catalog.ts`, `templates/*` |
| Göç | `0022-pricing-rules-tenant` (yalnız indeks; ÇALIŞTIRILMADI) | `backend/migrations/0022-*.js`, `docs/MIGRATIONS.md` §6 |
| Müşteri ekranı | **Fiyat kuralları** (`catalog/pricing-rules`): durum bandı (platform kapalı / kapalı / metin bekliyor / buybox kapalı / açık), Öneriler (filtre, "yalnız buybox'ı başkasında", tek/toplu onay ≤50, önce→sonra önizleme penceresi, kısmi sonuç + uygulanmayan nedenleri, reddet), Kurallar (kart özeti, duraklatma uyarısı, form — tüm sayısal alanlar BOŞ), Fiyat geçmişi (onaylı öneri / dış değişiklik), açma diyaloğu (TASLAK sorumluluk metni + çift motor onayı) | `views/secure/pricing/PricingRulesView.vue`, `composables/usePricingRulesApi.ts` |
| Backoffice | Rekabet ayarları ekranına **Fiyat kuralları** paneli: kill-switch + S6 ayarı (mevcut taslak→gerekçeli yayın), TOPLAM istatistik (tenant verisi yok), dikkat uyarıları, "otomatik uygulama yok" notu | `backoffice/src/views/settings/PricingRulesPanel.vue`, `pricingRulesLogic.ts` |

## Kararlar

| Karar | Gerekçe |
|---|---|
| Rekabet kuralı B-10'un TİPİ (`PriceRules.type`) | Brif: ayrı servis değil; B-10 `channel` tipi aynı koleksiyona/servise eklenir |
| Engel nedenleri görünür (`blocked`), diğer atlamalar kayıt kapatır | Satıcının düzeltmesi gerekenler (maliyet yok, taban altı, liste fiyatı…) sessiz kalmaz; geçici durumlar (bayat veri, soğuma) gürültü yapmaz |
| Ortak fiyatlı varyant uygulamada kanal bazlı fiyata geçer, diğer kanallar aynı değerle sabitlenir | "Yalnız Trendyol satış fiyatı" (K9) diğer kanalları değiştirmeden; etkin fiyatlar değişmez |
| Yayıncı yalnız RPC kabuğunda (api katmanı); zamanlanmış iş `NO_PUBLISH` | Otomatik uygulama yolu fiziksel olarak yok (statik test `no-auto-apply`) + depcruise katman kuralı |
| `pricing.rules.save` MCP'de `deferred`, `pricing.rules.settings` `irreversible` | K4 (yapay zekâ değer önermesin), K3 (hukuki kabul yalnız ekranda) |
| Onay kartı önizlemesi sunucu verisinden (`previewChanges`) | Kart model metni değil; önce→sonra ve buybox satırları gerçek kayıttan |
| Platform sınırları kodda sabit (%10/gün, %25/30 gün, 24/gün, ≥15 dk, ≤%50 düşüş) | ADR-0031 `platform.pricing` ≤15 anahtar eşiği (S6 ile 15'e ulaşıldı) |
| Yüzde metni kodla (`%10` TR, `10%` EN) | vue-i18n `%{…}` yazımı `%` işaretini yer (test korur) |

## Bulunan ve düzeltilen hata (PRC-R1)

`PricingService` R1 uçları `this.request`'i (sunucu alanları `userContext/principal/ctx/requestMeta` dahil) `.strict()` şemalara veriyordu → gerçek
istekler 400 VALIDATION alırdı (testler operasyonları doğrudan çağırdığı için görünmüyordu). Gövde artık sunucu alanları ayrılarak geçer (`body()`).

## Testler (bu ortamda koşuldu)

| Komut | Sonuç |
|---|---|
| backend `npx tsc --noEmit` | 0 hata |
| backend `jest tests/unit/pricing tests/static/pricingLegal.static.test.ts` + parite/mandal/ajan/MCP/bildirim/config/intake/manifest | 2087/2087 geçti |
| — `legalRules.test.ts` (K1/K4/K6/K7/K8/K9/K12/K13/K17, adı kurala bağlı) | 29/29 |
| — `priceRulesOps.test.ts` (K2/K3/K9/K10/K12/K13/K17/K18/K19, S6; bellek-içi sahte ClientDB) | 22/22 |
| — `pricingLegal.static.test.ts` (K2/K5/K11/K16, otomatik uygulama yok) | 13/13 |
| — `pricingR2Wiring.test.ts` (iş kancası, NO_PUBLISH, backoffice toplam, yetenek kararları, MCP önizleme, göç 0022) | 10/10 |
| backend `jest` (tam) | kalan kırmızılar bu işten bağımsız ve tabanda da kırık: `mongo-semantics/*` (mongodb-memory-server ikilisi indirilemiyor), `oauth/flow`, `N11.internalOrderSnapshot` (saat dilimi), `NoRawRegex` (`engineOps.ts`), `errorCodes.docs` (`VIEW_LIMIT`), `integrationPlaybook` (P7), `operation-policy` (5 test; taban ile aynı, artık pricing kalemi yok) |
| backend `npm run lint` / `depcruise` | 0 hata / 0 hata (yalnız mevcut 3 döngü uyarısı) |
| backend `npm run ratchet` | bu işten artış yok (`handler getXModel` artışı önlendi). Ölçümde görülen `knip unlisted/exports/types` artışları PRC-R1 kaynaklı (sift, BUYBOX_JOB_NAME, maliyet tipleri; prc-r1 sonradan kısmen düzeltti). knip, linux oxc ikilisi `--no-save` kurularak koşuldu |
| frontend `npx vitest run` | 1703 test geçti; tek kırık dosya `integration-compliance-api.test.ts` tabanda da kırık (backend'de olmayan dosyayı okuyor) |
| frontend `tests/prc-r2-pricing.test.ts` | 16/16 (K1, K4, K6, K11, `%{` bekçisi, ekran anahtarı/URL, düz RPC adları, apply yalnız onay olayından) |
| frontend `vue-tsc` / `npm run build` / style·pattern·no-console·typecheck ratchet / contract-paths | 0 hata / geçti / OK |
| frontend e2e `prc-r2-pricing-rules.spec.ts` (`--update-snapshots=missing`) | masaüstü 1280: 9/9, mobil 390: 9/9; axe (wcag2a/aa/21a/21aa) critical/serious 0 (ekran + açma ve onay pencereleri) |
| frontend e2e `prc-r1-pricing.spec.ts` (gerileme) | 20/20 (ilk soğuk koşu çıktısında yalnız 16 geçti satırı görüldü; yeniden koşuda 20/20) |
| backoffice `vitest` / `vue-tsc` / `vite build` | 136/136 / 0 hata / geçti |
| backoffice e2e `pricing-rules.spec.ts` + `competition.spec.ts` | 25 geçti, 2 atlandı (masaüstü, koyu, mobil); axe 0 |

Yeniden üretme (görüntüler): `PRC_REVIEW=1 PRC_WIDTH=1280 PRC_OUT=docs/prc-r2-review/1280 npx playwright test e2e/specs/prc-r2-pricing-rules.spec.ts -c playwright.cloud.config.ts --project=chromium-desktop`
ve `PRC_WIDTH=390 … --project=chromium-mobile` (`PRC_OUT=docs/prc-r2-review/390`); backoffice: `PRC_REVIEW=1 PW_CHROMIUM_PATH=… npx playwright test e2e/specs/pricing-rules.spec.ts` (frontend/backoffice).

## Ekran görüntüleri (`1280/`, `390/`, `backoffice/`; açık tema, sentetik veri)

| Dosya | Ne gösteriyor |
|---|---|
| `01-kapali.png` | Tenant kapalı: bant "Fiyat kuralları kapalı" + "Fiyat kurallarını aç" |
| `02-acma-sorumluluk-metni.png` | Açma diyaloğu: "Taslak metin — hukuki gözden geçirme sürüyor", metin, sürüm, iki onay kutusu (metin + çift motor) |
| `03-oneriler.png` | Açık öneriler: şimdiki/önerilen fiyat (↓), buybox (sıra · zaman), kâr önce→sonra, taban/tavan, son 10 gün en düşük, uyarı çipleri |
| `04-onay-onizleme.png` | Toplu onay penceresi: önce → sonra → değişim; liste fiyatı değişmez notu; sigorta yeniden çalışır metni |
| `05-kismi-sonuc.png` | Kısmi sonuç: "1 fiyat güncellendi, 1 öneri denetimden geçmedi" + uygulanmayanlar nedenleriyle |
| `06-engellenen.png` | Engellenen öneri: "Hedef fiyat tabanın altında kalıyor." |
| `07-kurallar.png` | Kural kartları; duraklatılmış kural uyarısı (dış değişiklik); bildirim bağlantısıyla vurgulanan kural |
| `08-kural-formu-k1.png` | Yeni kural formu: fark 0 → "Buybox fiyatına eşitleme yapılmaz." (istek gitmez) |
| `09-platform-kapali.png` | Platform kapalı: bilgi bandı, "Kural ekle" pasif |
| `10-yetkisiz.png` | 403: yetki yok durumu |
| `11-fiyat-gecmisi.png` | Fiyat geçmişi: onaylı öneri / Entegrasyonik dışında |
| `backoffice/fiyat-kurallari-paneli-*.png` | Backoffice paneli: dikkat (anahtar kapalı, dış değişiklikle duraklayan kural), kill-switch, S6 seçimi, toplam istatistik, "otomatik uygulama yok" |

## Bilinen sınırlar / yerel iş

- Göç `0022` yerelde yedek → `plan` → `up` (CLAUDE.md kural 3); tekillik indeksi kurulmadan `features.pricingRules` açılmamalı.
- Menü kaydı (ApplicationDB `menus`, kod `pricing/PricingRulesView`) yerel iş; derin bağlantı `/catalog/pricing-rules` menü kaydı olmadan çözülmez.
- Trendyol'da hangi alanın üstü çizili gösterime gittiği ve kampanyadaki üründe API fiyat değişikliğinin davranışı insan doğrulaması bekliyor (AUTO_PRICING_LEGAL (e) ayrık maddeler).
- Sorumluluk metni TASLAK (avukat gözden geçirmesi); sürüm değişince yeniden kabul gerekir.
- Backoffice toplamı aktif tenant DB'lerini sırayla okur (≤1000); büyürse önbellekli sayaç gerekir.
- `dismissSuggestions` uygulama yeteneğine bağlı olduğundan motor acil durdurması (intake drain/off) sırasında reddetme de beklemeye alınır.

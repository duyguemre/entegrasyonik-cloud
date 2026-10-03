# 03b — Fiyat yönetimi: mevcut yapı (uçtan uca) ve sorunlar
Tarih: 2026-10-03. Kapsam: yalnız kod okuma (backend/src, frontend/src, docs). Yol kökü: `backend/src/` (kısaltma `B/`), `frontend/src/` (`F/`).
İşaret: DOĞRULANAMADI = kodda görülmedi / çalıştırma gerektirir.

## (A) Akış diyagramı (metin)

```
GİRİŞ YOLLARI (yerel fiyatı yazan)
 1) Kullanıcı (UI)  -> VariantService/updateVariants | batchProcessUpdate | ProductService/updateProduct
      -> Variants.prices{isPlatformBasedPrice,salePrice,marketPrice}  +  Variants.platforms[kod].prices{salePrice,marketPrice}
      -> Products.prices{minSalePrice,maxSalePrice} yeniden hesaplanır (variant-service.ts:181-230, product-service.ts:284-297)
 2) İçe aktarma (pazaryeri -> yerel) : Stager -> Importer: YALNIZ YENİ barkod insertMany; var olan barkod SKIP (Importer.ts:90)
      -> prices.salePrice = platform brüt satış, platforms[kod].prices = aynı (trendyol/ProductTransformer.ts:364-374)
 3) Onaylı rekabet önerisi (yalnız Trendyol) : PricingService/applySuggestions -> priceWrite -> Variants (platforms.trendyol.prices.salePrice)
      -> PriceHistory(source:'suggestion') + AuditLogger('pricing.suggestion.applied') -> env.publish -> ExportBatchService(UPDATE_PRICE, ['trendyol'])
 4) Maliyet: PricingService/setVariantCosts -> Variants.costPrice/costUpdatedAt (yalnız bu yol yazar)

GÖNDERİM (yerel -> kanal)  — OTOMATİK TETİK YOK (fiyat değişince kendiliğinden gitmez; stoktaki stockDirty benzeri priceDirty YOK)
 UI "Platform fiyatlarını güncelle" (ProductListView.vue:479 / BatchActions) -> IntegrationService/processPlatformProduct{mode:UPDATE_PRICE}
   -> ExportBatchService -> Validator (variant taze okunur; staging.price = platforms[kod].prices.salePrice || prices.salePrice, Validator.ts:176)
   -> Publisher.executeIntegration -> adaptör.updateProductPrice (Publisher.ts:124)
 Kural motoru (ruleEngine) bu hatta BAĞLI DEĞİL: yalnız "öneri" üretir; fiyat ancak insan onayıyla Variants'a yazılıp aynı hat tetiklenir.

KURAL MOTORU (yalnız Trendyol, rekabet tipi)
 Variants.competition.trendyol (buybox okuma işi) -> generateSuggestions (priceRules.ts:238) -> evaluate (ruleEngine.ts) + fuseCheck
   -> PriceSuggestions(open/blocked) -> UI/MCP onay -> applySuggestions (motor TAZE veriyle yeniden + sigorta) -> yukarıdaki 3.

KANAL -> YEREL (alım): yalnız ilk içe aktarma. Sonradan pazaryerinde değişen fiyat yerel fiyata YAZILMAZ (Importer.ts:90 SKIP).
 Tek istisna "dış değişiklik" gözlemi: buybox bizdeyken buybox fiyatı != yerel fiyat -> kural duraklar + PriceHistory(source:'external') (priceRules.ts:268-276); yerel fiyat yine de güncellenmez.
```

## (B) Veri modeli tablosu

| Koleksiyon / alan | Tip | Anlam / not | Kanıt |
|---|---|---|---|
| Variants.prices.salePrice | Number (default 0, required) | Ortak satış fiyatı, KDV DAHİL brüt TL (BuyboxSnapshot "KDV dahil, TL" notu; import brüt yazar) | database/client/models/Variant.ts:67-72 |
| Variants.prices.marketPrice | Number | Liste / üstü çizili fiyat | Variant.ts:71 |
| Variants.prices.isPlatformBasedPrice | Boolean | "Kanal bazlı fiyat" bayrağı | Variant.ts:69 |
| Variants.prices.price | ŞEMADA YOK (strict:false) | KDV hariç türev; yalnız import/ürün formu yazar (trendyol/ProductTransformer.ts:366, ProductDefinitionView.vue:339); backend okuyanı görülmedi | DOĞRULANAMADI (kullanım) |
| Variants.platforms[kod].prices{salePrice,marketPrice} | Mixed (Object) | Kanal fiyatı; şema yok, doğrulama yok | Variant.ts:46 |
| Variants.costPrice / costUpdatedAt | Number / Date | Birim maliyet, KDV HARİÇ, TL; yalnız PricingService/setVariantCosts yazar; 2 ondalığa yuvarlanır | Variant.ts:77-78; operations/pricing/variantCost.ts:124 |
| Variants.competition.trendyol | Object | Güncel buybox durumu (yalnız buybox işi yazar) | Variant.ts:80 |
| Products.taxPercentage | Number default 0 | KDV oranı (ürün düzeyi, tek kaynak); 0 = hem "%0 KDV" hem "ayarsız" | Product.ts:20 |
| Products.prices{minSalePrice,maxSalePrice} | Number | Türev özet (varyantlardan) | Product.ts:21-25 |
| para birimi | YOK | Modelde currency alanı yok; TRY sabit varsayımı | grep `currency` Variant.ts/Product.ts: 0 sonuç |
| PriceRules | type:'competition' ; competition{mode,deltaAmount,deltaPercent,floorMarginPercent,ceiling,step,maxChangesPerDay,cooldownMin,maxIncreasePercentPerDay,excludeIfOutOfStock}; version; createdBy/updatedBy/createdAt/updatedAt | Number (TL). Yalnız `competition` tipi; kanal fiyat kuralı (`channel` tipi: komisyon/marj/yuvarlama/KDV) YOK | models/PriceRule.ts:39-72 |
| PricingSettings (_id:'pricing') | enabled, consent{version,acceptedAt,acceptedBy}, dualEngineAcknowledgedAt, updatedBy | Tenant kill-switch + sorumluluk metni | models/PricingSettings.ts |
| PriceSuggestions | beforePrice/afterPrice/listPrice/floor/ceiling/profitBefore/After/buyboxPrice, reasons[], warnings[], appliedAt/appliedBy; TTL 90 g | Number | models/PriceSuggestion.ts:130-159 |
| PriceHistory | integrationCode, variantId, at, salePrice, previousPrice, listPrice, source ∈ {suggestion, external}, ruleId/ruleVersion/suggestionId, buyboxPrice, actor; TTL 90 g | Yalnız Trendyol; MANUEL değişiklik ve import kaynağı YOK | models/PriceHistory.ts:8-29 |
| BuyboxSnapshots | integrationCode, barcode, observedAt, status, buyboxOrder, buyboxPrice, ownPrice; TTL 90 g | Gözlem geçmişi | models/BuyboxSnapshot.ts:175-190 |
| CommissionOverrides | integrationCode, scope(category/default), platformCategoryId, rate 0-100 (≤2 ondalık), updatedBy/At | Komisyon kaynağı; kâr/taban hesabına girer | models/CommissionOverride.ts:107-119 |

Tip: tüm para alanları JS `Number` (float). Decimal128 hiçbir yerde yok (`grep Decimal128 B/` boş). Motor içi hesap kuruş (tam sayı) ile yapılır (ruleEngine.ts:5, `k()`/`tl()`); saklama float TL.
Geçmiş/kim-ne zaman: PriceHistory.actor/at (yalnız kural/dış gözlem); PriceRules createdBy/updatedBy; PricingSettings consent.acceptedBy; costUpdatedAt (kim YOK). Manuel fiyat düzenlemesi için kayıt: bkz. (F) P1-4.

## (C) İş mantığı / kural motoru özeti

- Kapsam (kod): tek kural tipi `competition` (buybox'a göre altında/üstünde kal), tek kanal Trendyol (`PRICE_RULE_CHANNELS=['trendyol']`, priceRule.ts:15; `BUYBOX_CHANNEL`, BuyboxRefreshJob.ts:14). Kanal bazlı komisyon/kâr marjı/yuvarlama/KDV kuralı olarak "fiyat HESAPLAYAN" kural YOK; komisyon+KDV+maliyet yalnız taban (başa baş+marj) hesabında girdi (margin.ts, ruleEngine.floorPrice).
- Taban/tavan/koruma (ruleEngine.ts evaluate): maliyet/KDV/komisyon yoksa kural çalışmaz (`cost_missing`, `vat_missing`, `commission_unknown`); taban = başa baş + `floorMarginPercent`; tavan = kural `ceiling`; `step` yuvarlama (floor/ceil kuruş); K1 eşitleme yasağı; K7 taban/tavan; K8 artış sınırı (platform ≤%10/gün, ≤%25/30 gün, PLATFORM_LIMITS priceRule.ts:18-29); K9 liste fiyatı yükseltilmez; K12 günlük değişim/soğuma/salınım; K13 bayat veri; K17 dış değişiklikte duraklat. Bağımsız `fuseCheck` (ruleEngine.ts:107-120) uygulamada yeniden çalışır; düşüş üst sınırı %50.
- Min/maks koruması dışında, motor DIŞI yolda (manuel/UI/toplu) taban-tavan, negatif/NaN fiyat koruması YOK (bkz. P1-5).
- Senkron yönü: yerel -> kanal (UPDATE_PRICE, manuel tetik veya onaylı öneri sonrası); kanal -> yerel yalnız ilk import (yeni barkod). Çakışma politikası: tanımlı DEĞİL; fiilen "yerel kazanır, kanal değişikliği yerele yansımaz"; applySuggestions yerelde `guard` + `price_changed` reddi ile iyimser kilit uygular (priceRules.ts:487-497, 524-535).
- Kanal fiyatı yokken: adaptörler `platforms[kod].prices || prices` (truthy) -> kanal nesnesi yoksa ortak fiyat gider. Kural motoru/kâr/net gelir ise `isPlatformBasedPrice` bayrağına bakar (bkz. P1-1).
- Maliyet (variantCost.ts): ≤500 toplu, 0..10.000.000, 2 ondalık yuvarlama, kapsam yüzdesi, 90 gün bayat (`COST_STALE_DAYS`).
- Hukuk (docs/research/AUTO_PRICING_LEGAL_2026-10.md §c K1-K20, ADR-0036): R2'de insan onaylı; `NO_PUBLISH` ile zamanlanmış iş yayınlayamaz (createPricingEnv.ts:41); R3 (insan onaysız) kodda YOK. Varsayılan KAPALI: `features.pricingRules` + tenant `enabled` + güncel sorumluluk metni sürümü (`PRICING_CONSENT.version='2026-10-01-draft'`, taslak; priceRule.ts) — avukat gözden geçirmesi bekliyor.
- Komisyon kaynağı: COM-04 override > gerçekleşen > tahmini statik tablo (CommissionOverride.ts:98). Statik Trendyol tablosunda KDV dahil/hariç bilinmiyor (`vatIncluded=null`) ve ebeveyn-çocuk 3683 çelişki (docs/research/COMMISSIONS_TRENDYOL_CONSISTENCY_2026-09-30.md:6-17; "doğrulanamadı").

## (D) Platform × fiyat alanı tablosu

Ortak kaynak (Validator): `staging.price = variant.platforms[kod]?.prices?.salePrice || variant.prices?.salePrice` (Validator.ts:176); transformer'lar `variant.platforms[kod]?.prices || variant.prices` (nesne varsa onu alır; `isPlatformBasedPrice` bayrağına BAKILMAZ).
Hiçbir adaptörde komisyon/marj/yuvarlama kuralı uygulanmaz; kural motoru gönderim yoluna bağlı değil (yalnız dolaylı: onay Variants'ı değiştirir, sonra aynı ham hat gider). Para birimi dönüşümü yok (TRY varsayımı).

| Platform | Gönderilen fiyat alanları (UPDATE_PRICE) | Kaynak alan | Kural uygulanır mı | Yuvarlama / ondalık / para birimi / KDV | Alım (içe aktarma) | Kanıt |
|---|---|---|---|---|---|---|
| Trendyol | salePrice, listPrice (price-and-inventory) | platforms.trendyol.prices \|\| prices; listPrice = max(marketPrice\|\|sale, sale) | Hayır (ham); onaylı rekabet önerisi yalnız Variants'ı değiştirir | 2 ondalık `Math.round(x*100)/100`; para birimi alanı yok (V2'de currencyType çıkarıldı, :73); KDV `vatRate` yalnız TRANSFER/UPDATE'te (:128,165,182): product.taxPercentage (0 dahil geçerli) -> mapping.settings -> yoksa 20; doğrulama sale>0, list>=sale, vat∈{0,1,10,20} | prices.salePrice = platform salePrice (brüt); platforms.trendyol.prices = {salePrice, marketPrice=listPrice}; prices.price = KDV hariç türev | trendyol/transformers/ProductTransformer.ts:53-55, 89-91, 203-205, 239-241, 278-283, 364-374 |
| Hepsiburada | price (string "12,50" sale; TRANSFER) / UPDATE_PRICE: `price` | staging.price (= Validator) | Hayır | 2 ondalık; listPrice GÖNDERİLMEZ; KDV `tax_vat_rate` `||` zinciri (0 -> 20'ye düşer), varsayılan 20; para birimi yok | prices.salePrice = rawData.price; marketPrice = listPrice\|\|price; yorum COM-10: iç fiyat brüt | hepsiburada/transformers/ProductTransformer.ts:18,36-40,60,89-109; services/ProductService.ts:76-100 |
| N11 | salePrice + listPrice = AYNI değer (bulk update); create: price, currencyType 'TL'/'1' | staging.price | Hayır | YUVARLAMA YOK (parseFloat); marketPrice/listPrice ayrımı yok; KDV gönderilmez; `validate()` hep true | YOK: `convertToInternalModel` boş stub (alım yok) | n11/transformers/Mappers.ts:11-12,36-39,54-55,67; services/ProductService.ts:83-100,227-233 |
| Pazarama | salePrice, listPrice, (+vatRate ve currencyType:'TRY' yalnız create); UPDATE_STOCK da aynı price-v2 ucuyla fiyat taşır | platforms.pazarama.prices \|\| prices | Hayır | 2 ondalık; KDV `||` zinciri, varsayılan 20 | prices.salePrice/marketPrice platform değerleri | pazarama/transformers/ProductTransformer.ts:20-22,45-47,64-73,82-101; services/ProductService.ts:352-353 |
| Ideasoft (e-ticaret) | price1 (UPDATE_PRICE: yalnız price1); create: price1 = product.minPrice (kanal fiyatı DEĞİL), currency {id:3}, taxIncluded:1, tax | platforms.ideasoft.prices.salePrice \|\| prices.salePrice | Hayır | 2 ondalık; KDV varsayılan 18; marketPrice gönderilmez | prices.salePrice = marketPrice = price1 | ideasoft/transformers/ProductTransformer.ts:16,29-32,60-62,83-86,103-120; services/ProductService.ts:136-142 |
| Bizimhesap (ERP) | Fiyat gönderimi bulunmadı (yalnız alım) | — | — | — | prices.salePrice=marketPrice=raw.price; `platforms.bizimhesap.prices = {}` (boş nesne, truthy) | erp/bizimhesap/services/ProductService.ts:83-91; transformers/ProductTransformer.ts:131-152 |

Alım (genel): fiyat YENİ varyant olarak yazılır; barkod varsa hiç yazılmaz -> mevcut yerel fiyatı EZMİYOR (Importer.ts:90, insertMany :170 civarı). Ürün özeti `$min/$max` ile güncellenir; mevcut ürünün min'i yalnız düşer, max yalnız artar (Importer.ts:136-137) -> sonradan varyant yazımı `updateProductPrices` ile yeniden hesaplar (variant-service.ts:181).

## (E) Frontend veri akışı özeti

Dosyalar (fiyatla ilgili):
- Varyant fiyatı: `F/components/productDefinitions/variants/{ProductSingleVariantComponent,ProductVariantsComponent,ProductVariantListComponent,ProductVariantListTooltipComponent}.vue`, `variants/grid/{VariantGrid,VariantBulkEditor}.vue`, `variants/grid/variantSheet.ts`, `variants/channelPriceModel.ts` (saf mantık).
- Kanal fiyatı: `crud/PlatformPriceComponent.vue` (kanal satırları, "Özel fiyat", toplu işlem set/%/±), `variants/ProductVariantPlatformPricesComponent.vue`.
- Toplu: `products/ProductBatchProcessComponent.vue` (ProductService/batchProcessUpdate, :199), `products/ProductTransferComponent.vue`.
- Yayın: `views/secure/productDefinitions/ProductListView.vue:479` (`IntegrationService/processPlatformProduct{mode:UPDATE_PRICE}`), `products/BatchActions/useBatchActions.ts`.
- Maliyet/rekabet: `composables/{usePricingApi,usePricingRulesApi,useCostSave}.ts`, `components/pricing/CompetitionPanel.vue` (previewMargin+listBuybox), `crud/ProductCompetitivePricesComponent.vue` (59 satır; `prices.competitive.minPrice` — backend karşılığı DOĞRULANAMADI), `views/secure/pricing/PricingRulesView.vue` (getRules/saveRule/deleteRule/setPricingSettings/listSuggestions/getPriceHistory/applySuggestions/dismissSuggestions), `views/secure/definitions/{ProductDefinitionView,ProductUpdateView}.vue` (maliyet kaydı `useCostSave`).
- Ölü/tutarsız: `composables/priceCalculator.ts` (sabit komisyon %10/indirim %5/kargo 50/KDV 15 varsayımı; "TODO ayarlanabilir"; kullanım DOĞRULANAMADI).

RPC haritası: yerel fiyat -> `VariantService/updateVariants|batchProcessUpdate|addVariants`, `ProductService/updateProduct|batchProcessUpdate`; maliyet -> `PricingService/listCosts|setVariantCosts`; rekabet -> `PricingService/listBuybox|getBuyboxHistory|previewMargin|getRules|saveRule|deleteRule|setPricingSettings|listSuggestions|getPriceHistory|applySuggestions|dismissSuggestions`; yayın -> `IntegrationService/processPlatformProduct`. MCP (capabilities/domains/pricing.ts): `pricing.cost.list/set`, `pricing.buybox.list`, `pricing.margin.preview`, `pricing.rules.list` exposed; `pricing.rules.save` deferred (:204), `pricing.rules.settings` MCP'de kapalı (K3, :212), `pricing.suggestions.list` exposed, `pricing.suggestions.apply` exposed confirm/risk:high (:255); `variants.update` (fiyat dahil) MCP'de deferred (catalog.ts:128).

"Bu kanala hangi fiyat gidecek" gösterimi: VAR kısmen. `channelRows` kanal başına etkin sale/market + "özel/ana fiyat" + indirim % + uyarı (channelPriceModel.ts:62-90); grid kanal aralığı gösterir (VariantGrid.vue:533). Ancak "etkin fiyat" tanımı `platforms[kod].prices` VAR MI'ya dayanır (channelPriceModel.ts:4-5,76-78), `isPlatformBasedPrice` bayrağı ayrı ve çelişkili kullanılır (bkz. P1-1). Komisyon/net kâr yalnız Trendyol CompetitionPanel/ürün listesi rozetinde. Net gelir önizlemesi (COM-07) genel bir ürün-listesi sütunu olarak DOĞRULANAMADI.
"Bu fiyat neden böyle" açıklaması: yalnız rekabet önerisinde (reasons[]/warnings[]/blockedReason kodları -> reasonKey/warningKey, PricingRulesView). Manuel/kanal fiyatı için açıklama/kaynak (kim, ne zaman, neden) YOK. Fiyat değişince "kanala gönderilmedi" göstergesi (priceDirty/bekleyen) DOĞRULANAMADI (backend'de alan yok).

## (F) Bulgular

### P0
(Yok doğrulanabilen, veri kaybı/yanlış gönderimi kesin gösteren). P1-1 koşullu olarak P0'a yaklaşıyor: gerçek tenant verisinde bayrak=false + platforms.<kod>.prices dolu varyant oranı DOĞRULANAMADI (DB yok).

### P1
1. **"Kanal fiyatı hangisi" iki farklı kural: gönderim vs kural/kâr motoru.**
   - Gönderim ve staging: nesne VARSA `platforms[kod].prices` kullanılır, `isPlatformBasedPrice` yok sayılır (trendyol/ProductTransformer.ts:53,89; hepsiburada :18,36; pazarama :20,45; Validator.ts:176; ideasoft ProductService.ts:139).
   - Rekabet/kâr/net gelir: bayrak true ise `platforms[kod].prices`, değilse `prices.salePrice` (buyboxState.ts:66; priceRules.ts:47-49; commissionQueries.ts:~174-177).
   - Import her varyantta bayrak=false + hem `prices` hem `platforms[kod].prices` yazar (trendyol/ProductTransformer.ts:364-374). Kullanıcı ortak fiyatı (`prices.salePrice`) değiştirirse kanal nesnesi eski kalır -> adaptör ESKİ import fiyatını gönderir, kâr/buybox "ownPrice" ise yeni ortak fiyatı gösterir. Sonuç: ekranda/kuralda görünen fiyat ile pazaryerine giden fiyat farklı olabilir.
   - UI de üçüncü tanım kullanır: "özel" = nesne var (channelPriceModel.ts:4-5,76-78); toplu editör "kanal bazlı yap" işaretiyle bayrağı sonradan true yapar (VariantBulkEditor.vue:563-567).
   - Öneri: tek fonksiyon (`effectiveChannelPrice(variant, code)`) hem adaptör/Validator hem ruleEngine/commission/UI'da; import'ta kanal nesnesi bayrak=false iken yazılmasın ya da bayrak true olsun. (Yeni mimari değil; mevcut kuralların tekilleştirilmesi.)
2. **Fiyat değişimi kanala otomatik gitmez, "bekleyen fiyat" izi yok.** Stok için `stockDirty`+tetikleyici var (Variant.ts:60, 112-118) fiyat için eşdeğer yok; UPDATE_PRICE yalnız elle (ProductListView.vue:479 / toplu işlem) veya onaylı öneri (pricing-service.ts:38-41, yalnız Trendyol). Yerel/kanal fiyat sapması izlenmiyor ve gösterilmiyor (DOĞRULANAMADI: farklılık raporu).
3. **KDV oranı tutarsız (3 kaynak, 3 davranış).** Product.taxPercentage default 0 (Product.ts:20). Trendyol: 0 geçerli oran, `??`-benzeri `find(!==undefined)` -> ürün 0 ise %0 KDV GÖNDERİLİR, 20'ye düşmez (trendyol/ProductTransformer.ts:278-283; vat listesi productConstants.ts:58). HB/Pazarama: `||` zinciri -> 0 olunca 20 (hepsiburada :60, pazarama :66). Ideasoft varsayılan 18 (:16,55). Kâr/taban hesabı: 0 = "ayarsız" -> null, kural çalışmaz (commissionQueries.ts:~182-183). Aynı ürün için kanal başına farklı KDV gidebilir; `Products.taxPercentage` ile kanal `mapping.taxPercentage` ayrımı UI'da görünür mü DOĞRULANAMADI.
4. **Fiyat değişiklik geçmişi eksik.** PriceHistory yalnız `suggestion`/`external` kaynağı, yalnız Trendyol, TTL 90 g (PriceHistory.ts:8-9). Manuel ve toplu değişiklik (VariantService/updateVariants, batchProcessUpdate, import) PriceHistory'ye YAZILMAZ. Denetim: `appWriteAudit` yalnız `VariantService/updateVariants` için TEK varyantta ortak `prices.salePrice` önce/sonra (appWriteAudit.ts:52-70); kanal fiyatı, marketPrice, toplu işlem alanları denetlenmiyor (`batchProcessUpdate` yalnız adet). K8 artış sınırı ve K10 "son 10 gün en düşük" hesabı `PriceHistory`'den beslendiği için manuel düşüşleri görmez (priceRules.ts:352-360, ruleEngine.ts K8 bloğu) -> hukuki indirim kanıtı eksik. Hukuk riski: avukat değerlendirmesi gerekir (DOĞRULANAMADI).
5. **Fiyat girişinde sunucu doğrulaması yok.** `batchForm.prices = z.record(string, unknown)` (rpc-input/catalog.ts:39), varyant `looseEntity(...passthrough)` (:33) -> NaN/negatif/string/Infinity fiyat yazılabilir; `constructUpdateQuery` değeri olduğu gibi `$set` eder (variant-service.ts:95-105). Maliyet ve kural alanları ise sıkı zod'lu (catalog.ts:43, priceRule.ts). Float TL (Number) saklama + yazımda yuvarlama yok (yalnız gönderimde: N11 hariç).
6. **Kanal fiyat kuralı (komisyon/marj/yuvarlama/KDV'li hesap) YOK.** BACKLOG `B-10` (kanal fiyat kuralı) tanımı BACKLOG.md'de bulunamadı; PRC-R2 ve CMP-02 buna bağımlı olarak anılıyor (BACKLOG.md:367,649) ama PriceRules'de `channel` tipi yok (PriceRule.ts:39). Fiyat hesaplayan kural motoru olmadığından "maliyet+komisyon+marj -> kanal fiyatı" kullanıcıya sunulmuyor; yalnız buybox-rekabeti. Bu bir ürün kararı: kapsamı kullanıcıyla netleştir.

### P2
1. N11: salePrice=listPrice aynı, yuvarlama yok, marketPrice yok sayılır; alım stub'ı (Mappers.ts:36-39,54-55; ProductService.ts:227). N11'den alım olmadığı için N11 fiyat çakışması hiç oluşmaz ama yerel->N11 gönderimi `staging.price`'a (ortak/kanal) bağlıdır.
2. Pazarama UPDATE_STOCK aynı endpoint'le fiyat da yollar (ProductService.ts:352-353; Transformer :71-73): stok yayını sırasında yerel (belki stale) fiyat kanala yazılabilir. Etki gözlemi DOĞRULANAMADI.
3. Ideasoft create `price1 = product.minPrice` (kanal fiyatı yerine ürün özeti, ideasoft/ProductTransformer.ts:29); KDV varsayılan 18, `taxIncluded:1` sabit (:31).
4. Hepsiburada/Ideasoft gönderiminde listPrice/marketPrice yok; "üstü çizili fiyat" ve K9 yalnız Trendyol'da anlamlı.
5. Para birimi: model/adaptör çoğunlukla sabit TRY; N11 'TL' vs '1', Pazarama 'TRY', Ideasoft id:3, Trendyol alan yok. Çoklu para birimi desteği yok (gereksinim yoksa sorun değil).
6. Bizimhesap `platforms.bizimhesap.prices = {}` truthy: ileride bu kanala fiyat gönderimi eklenirse `|| variant.prices` yedeği devreye girmez (salePrice undefined) (erp/bizimhesap/services/ProductService.ts:91). Şu an gönderim yok.
7. Statik komisyon tablosu: KDV dahil/hariç bilinmiyor, ebeveyn-çocuk çelişkisi (docs/research/COMMISSIONS_TRENDYOL_CONSISTENCY_2026-09-30.md). Taban/başa baş fiyatı buna bağlı; `partial_deductions` uyarısı var (ruleEngine.ts:206).
8. Ürün özeti (`Products.prices.min/max`): importta `$min/$max` mevcut ürünle birikir; `updateProductPrices` farklı formülle yeniden hesaplar (variant-service.ts:181-230 vs product-service.ts:284-297: biri kanal min'ini `|| Infinity` ile, diğeri ortak fiyatı bayrağa göre alır) -> iki hesap aynı sonucu vermeyebilir. DOĞRULANAMADI (test yok okundu).
9. Rekabet göçleri `0021`, `0022` ÇALIŞTIRILMADI (docs/PRICING_COMPETITION.md:147,240; PriceSuggestions unique kısmi indeks kurulmadan kurallar açılmamalı).
10. `composables/priceCalculator.ts` sabit varsayımlar (ölü kod şüphesi; kullanım DOĞRULANAMADI).
11. PricingSettings sorumluluk metni "taslak" (`draft:true`) — avukat onayı bekliyor (priceRule.ts PRICING_CONSENT).

Güçlü yönler (sorun değil, bilgi): kuruş-tamsayı hesap, bağımsız fuse, iyimser kilitli uygulama, K1-K20 testleri, tenant ClientDB izolasyonu, NO_PUBLISH ile otomatik yayın yolu yok, denetim olayları (`pricing.*` AuditLogger).

## (G) PRC-* backlog durum tablosu (BACKLOG.md:644-655)

| ID | Başlık | BACKLOG durumu (metin) | Kodda görülen | Not |
|---|---|---|---|---|
| PRC-R0 | Maliyet alanı | açık (K57-S4) | VAR: Variants.costPrice, setVariantCosts, listCosts, kapsam %, UI useCostSave, MCP pricing.cost.* | Backlog satırı güncel değil (kod hazır); göç 0021 çalıştırılmadı |
| PRC-R1 | Buybox görünürlüğü (Trendyol) | açık (K57-S1) | VAR: BuyboxSnapshots, Variants.competition, listBuybox, previewMargin, CompetitionPanel, rozet/filtre | S8 LIVE_READONLY kararı bekliyor; gerçek veriyle doğrulama DOĞRULANAMADI |
| PRC-CFG | Rekabet ayarları (backoffice) | açık (K57-S5) | VAR: competitionSettings.ts (110 satır), `loadCompetitionSettings` | Backoffice UI durumu bu raporda DOĞRULANAMADI |
| PRC-R2 | Kural + onaylı uygulama | açık | VAR: ruleEngine/priceRules/priceRule, PricingService RPC'leri, PricingRulesView, MCP list/apply | Göç 0022 çalıştırılmadı; consent metni taslak; MCP'de rule save/settings kapalı |
| PRC-R3 | Otomatik fiyatlama | açık (hukuk bekliyor) | YOK (bilinçli; NO_PUBLISH) | Kapı: avukat + sözleşme + 4 hafta R2 + 14 gün gölge |
| PRC-LEGAL | Hukuk araştırması | bulutta (K57-S3) | docs/research/AUTO_PRICING_LEGAL_2026-10.md mevcut | Avukat yanıtı yok |
| PRC-CH | Diğer kanallarda rakip verisi | not alındı (K57-S1) | YOK (HB/N11/Pazarama "desteklenmiyor") | İnsan görevi: satıcı desteği |
| PRC-NOTE | Elle rakip fiyat notu | not alındı, P4 | YOK | — |
| PRC-OPEN | Açık kararlar (S6,S8,S9,S10) | açık | S6 ayarı `bulkApplyQuota` varsayılan per_approval | Kullanıcı kararı bekliyor |
| PRC-MKT | Sitede adil rekabet ilkesi | bulutta (K58) | Bu raporda DOĞRULANAMADI (site/) | — |
Bağlı olup BACKLOG'da tanımı bulunamayanlar: B-09 (toplu önizleme/geri al), B-10 (kanal fiyat kuralı), B-13 (kâr/maliyet raporu), F-xx — yalnız CMP-02/CMP-06/PRC-R2 bağımlılık sütununda anılıyor (BACKLOG.md:367,371,649); tanımları başka belgede olabilir, DOĞRULANAMADI.

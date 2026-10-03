# 03a — Kategori / Marka / Özellik-Değer eşleme yapısı (backend, yalnız kod okuma)

Kapsam: bulut kopyası, DB/Redis yok; hiçbir şey çalıştırılmadı. "DOĞRULANAMADI" = kodda kanıt yok / çalıştırma gerekir.
Son göç numarası: **0024** (`backend/migrations/0024-audit-ip-mask-pending-app.js`; docs/MIGRATIONS.md §6). Not: iki dosya `0020` numaralı (`0020-push-subscriptions-app`, `0020-users-google-sub-app`). Eşleme koleksiyonları için hiçbir göç yok (AttributeMappings/Brands/Categories/Choices indeksleri yalnız şemadan; DB'de gerçekte var mı DOĞRULANAMADI — `autoIndex` prod'da kapalı, `Database.ts:91-93`; `index-manifest.json` yalnız şemadaki 2 indeksi listeliyor).

## (A) Akış diyagramı (metin)

```
KURULUM (kullanıcı, FE)
  Yerel Categories(ağaç) ─┐   Yerel Choices(+values[]) ─┐   Yerel Brands ─┐
  RPC CategoryService/*   │   RPC ChoiceService/*       │   BrandService/saveIntegrationBrand
                          v                             v                 v
  AttributeMappingService/saveCategoryMapping   saveAttributeMapping / saveAttributeValueMapping   Brands.platforms[code]={id,title,..}
  (isCategoryMapping=true, platformAttributeId=null)  (isCategoryMapping=false, values[])               (marka ayrı, AttributeMappings'te DEĞİL)
                          \_______ tek koleksiyon AttributeMappings (bayrakla ayrım) ______/
  autoMatchAllCategories (yalnız ad benzerliği; kategori>=0.85, özellik>=0.80, değer>=0.85)
  Yazma sonrası @InvalidatesTenantCache('PlatformMappingProvider') (pod-yerel)

PLATFORM LİSTELERİ (FE canlı çağırır)
  IntegrationService/retrieveCategories|Brands|CategoryAttributes|CategoryAttributeValuesFromIntegration
   -> operations/integrations/platformLookup.ts -> adaptör.retrieve* -> CategoryService (@Cache global 6s: trendyol, HB, pazarama; cache YOK: n11, ideasoft, bizimhesap)

İÇE AKTARIM (platform -> yerel)
  adaptör.streamProducts -> Stager.runOnce -> adaptör.getSummaryFromRaw(requiredAttributes = yalnız varianter|slicer)
     -> Stager.validateMapping(kategori eşi var mı + her varyant/slicer özelliği için değer eşi var mı)
        VALID -> Importer -> adaptör.convertToInternalModel (getLocalBrandId, resolveVariantChoices) -> Products upsert(maincode) + Variants.insertMany
        INVALID -> ürün DÜŞMEZ, staging'de importStatus=INVALID + rapor: missingCategories/missingAttributes ("eşleme bekliyor" = INVALID + ImportJobReport)
        Marka eşi Stager'da DENETLENMEZ.

DIŞA AKTARIM (yerel -> platform)
  ExportOrchestrator -> ExportStagedProducts(PREPARING) -> Validator:
     variant+product birleştir -> kategori/marka (YEREL) var mı -> AttributeResolver.resolveInto (ADR-0025: variant.choices -> platforms[code].attributes, yalnız boşlara) -> adaptör.validate(çoğunlukla no-op)
     -> staging.payload=variant (DB'deki Variants'a yazılmaz) -> Dispatcher -> Publisher -> adaptör.transferProducts/processBatch:
        PlatformMappingProvider.getPlatformCategoryId / getPlatformBrandId (AttributeMappings kat. kaydı / Brands.platforms[code].id)
        -> CategoryService.fetchCategoryAttributes (cache) -> transformer.prepareAttributes (+ zorunlu özellik VALIDATION: yalnız Trendyol, Pazarama)
     -> Sentinel/Sync (batch sonucu) -> hata metni staging.errorMessage + Variants.platforms[code].upload.<MODE>.messages
```

## (B) Veri modeli

| Koleksiyon / alan | Kanıt | Not |
|---|---|---|
| `AttributeMappings` (tek koleksiyon, 3 rol) | `database/client/models/AttributeMapping.ts:4-34` | `strict:false`. Alanlar: integrationCode, localCategoryId(ObjectId, required, index), platformCategoryId(String, required), platformAttributeId(null=kategori kaydı), platformAttributeName, localChoiceId, isVarianter/isSlicer/isRequired, isCategoryMapping, `values[{localValueId, platformValueId(String), platformValueName(required)}]`, updatedAt |
| Benzersizlik | `AttributeMapping.ts:37` | UNIQUE `(localCategoryId, integrationCode, platformAttributeId)`. platformCategoryId anahtarda YOK; kategori kaydı için `platformAttributeId:null` => (yerel kat., entegrasyon) başına 1 kategori eşi. Başka indeks yok (`platformCategoryId`/`integrationCode` tek başına indeksli değil; `index-manifest.json` AttributeMappings) |
| Kategori eşi | `attributeMapping-service.ts:99-125`, `PlatformMappingProvider.ts:85-90` | AttributeMappings satırı `isCategoryMapping:true`. Bir yerel kategori -> TEK platform kategorisi / entegrasyon; bir platform kategorisi -> N yerel kategori olabilir (Stager `categoryMap` dizi tutar, `Stager.ts:44-54`) |
| Özellik eşi | `AttributeMapping.ts:14-24` | yerel Choice <-> platform özelliği, YEREL KATEGORİ BAŞINA (kategoriler arası paylaşım/kalıtım yok) |
| Değer eşi | `AttributeMapping.ts:26-30` | gömülü `values[]`; `platformValueId=null` => serbest metin (yalnız `isAllowCustom:true`, `attributeMapping-service.ts:242-244`). `allowCustom`/`isMultiple` satırda SAKLANMAZ (zod kabul eder, servis okumaz: `rpc-input/catalog.ts:107,117`) |
| Marka eşi | `Brand.ts:5-10`, `BrandRepository.ts:27-31` | `Brands.platforms[code]` = serbest nesne (`{id,title}`); sunucu `id` varlığını doğrulamaz (`rpc-input/catalog.ts:128`). Marka eşi kimlikle (`.id`) okunur: `PlatformMappingProvider.ts:92-97, 105-109`. `Brands.parentId: Number` (garip tip). Brands/Categories/Choices üzerinde HİÇ indeks/benzersizlik yok (manifest boş) |
| `Categories` | `Category.ts:3-12` | `parentId: Mixed`, title, icon, order, isMain. Eşleme bilgisi burada TUTULMAZ (eski `Categories.platforms` kaldırıldı, `PlatformMappingProvider.ts:9-11`) |
| `Choices` | `Choice.ts:3-24` | title, isSlicer, isVarianter, `values[{_id, title, allowCustom}]` (allowCustom YEREL değer bayrağı; platformla ilişkisi yok), timestamps |
| `Products` | `Product.ts:3-37` | `category`/`brand` = yerel ObjectId (index); `platforms:Object` (bu alanın eşleme için kullanımı DOĞRULANAMADI — grep'te `product.platforms` okuması yok); UNIQUE `maincode` |
| `Variants` | `Variant.ts:33-86` | `choices[{choiceId:String, choiceValueId:String}]` (yerel); `platforms[code]` = `{prices{salePrice,marketPrice}, upload{<MODE>:{status,messages,..}}, attributes{<platformAttrId>:{attributeName,attributeValue,attributeValueId}}, mapping{...}, stockSync}` (`interfaces/product/*.ts:67-89`; tip `attributes` DİZİ diyor, çalışma zamanı Record — tip/gerçek uyumsuz). Benzersiz: barcode(sparse), stockcode(sparse), tempId (non-sparse), variantHash(sha256 `maincode|choices`) (`Variant.ts:36-50`, manifest) |
| `ClientIntegrations` | `ClientIntegration.ts:17-39` | eşleme bilgisi taşımaz; yalnız bizimhesap kataloğu `erp[].settings.catalog` altında (`erp/bizimhesap/services/CategoryService.ts:41-49`) |
| Denetim alanları | — | AttributeMappings'te yalnız `updatedAt` (createdAt/kim yok; `timestamps` seçeneği yok). Eşleme servislerinde AuditLogger/AuditService çağrısı YOK (`grep AuditLogger` yalnız oauth/backoffice); `AuditService` salt-okuma. Yani "kim/ne zaman değiştirdi" = YOK |

## (C) RPC / servis envanteri (eşleme alanı)

| RPC | Girdi şeması (ADR-0023 zod, `capabilities/rpc-input/catalog.ts`) | Not |
|---|---|---|
| AttributeMappingService/get | `readPaging` (limit,skip,integrationCode) :13,:97 | tüm kayıtlar (varsayılan), projeksiyon yok; `attributeMapping-service.ts:32-37` |
| .../getCategoryMapping | **şema YOK** | `new ObjectId(localCategoryId)` doğrulamasız (:75-87) -> geçersiz id 500 maskeli |
| .../getAttributeMapping | **şema YOK** | aynı (:130-140) |
| .../saveCategoryMapping | VAR :98-103 | eski özellik eşlerini siler (`keepAttributeMappings` ile korunur), `clearedAttributeMappings` döner |
| .../saveAttributeMapping | VAR :104-109 | toplu `$set values` (tüm diziyi değiştirir) |
| .../saveAttributeValueMapping | VAR :110-118 | atomik pipeline upsert; `localCategoryId` opsiyonel (türetilir) |
| .../autoMatchAllCategories | VAR :96 (`integrationCode?`) | varsayılan trendyol |
| .../deleteFullMapping | VAR :120 | (kategori+entegrasyon) tüm kayıtları siler |
| CategoryService/{get,add,update,move,changeOrder,delete}Category | VAR :131-135 | deleteCategory eşleri temizler (`category-service.ts:102-108`); ürün/alt kategori kontrolü YOK |
| BrandService/{get,addBrand,saveIntegrationBrand,updateBrand,deleteBrand} | VAR :123-128 | deleteBrand ürün referansı kontrol etmez (`brand-service.ts:143-146`); marka başlığı benzersiz değil |
| ChoiceService/{get,addChoice,addPreparedChoice,updateChoice,removeChoice,addChoiceValue,updateChoiceValue,removeChoiceValue} | VAR :138-148.. | remove* eşlemeleri temizler (`choice-service.ts:202-208, 237-242`); `Variants.choices`'e dokunmaz |
| IntegrationService/retrieveCategoriesFromIntegration, retrieveBrandsFromIntegration, retrieveCategoryAttributesFromIntegration, retrieveCategoryAttributeValuesFromIntegration | **şema YOK** (`integration-service.ts:147-161`; rpc-input'ta kayıt yok) | `integrationCode`, `integrationCategoryId`, `searchText` doğrulamasız; `IntegrationFactory.getInstance` hatası ham gelir |
| EcommerceService/retrieve*FromIntegration (eski kopya) | şema yok | `ecommerce-service.ts:83-107` parametre adı farklı (`categoryId`); kullanımda mı DOĞRULANAMADI |

Yardımcılar: `operations/catalog/mapping/autoMatch.ts`, `mappingCleanup.ts` (detachChoice, pullValue, deleteMappingsOfCategory, deleteStaleAttributeMappings), `integration/modules/provider/PlatformMappingProvider.ts` (10 dk tenant cache: eşlemeler, kategoriler, markalar, choices), `integration/catalog/attributePayload.ts` (normalize, zorunlu eksik, matchMappingValue), `integration/catalog/attributeResolver.ts` (ADR-0025).

## (D) Platform × eşleme türü

Kimlik = platform id ile; Metin = ad ile; Yok = uygulanmamış.

| Platform | Kategori listesi / eşi | Marka listesi / eşi | Özellik listesi / eşi | Değer listesi / eşi | descriptor `categories` |
|---|---|---|---|---|---|
| Trendyol | VAR (cache 6s global) / kimlik (`trendyol/services/CategoryService.ts:46-53`) | VAR (`BrandService.ts:22-30`, cache yok) / kimlik (`Brands.platforms.trendyol.id`) | VAR (cache 6s; V1/V2 hoşgörülü okuma `:57-67`) / kimlik; `multiple:false` SABİT (`CategoryTransformer.ts:43`) | Gömülü yoksa ayrı uç (`:25-42`, cache 6s); eşleme kimlik-öncelikli, yoksa metin (`attributePayload.ts matchMappingValue`) | supported (`descriptor.ts:122-126`) |
| Hepsiburada | VAR (6s) / kimlik; AMA export kategori kimliğini AttributeMappings'ten DEĞİL `variant.platforms.hepsiburada.mapping.categoryId`'den alır (`hepsiburada/services/ProductService.ts:36-42`) | **YOK** (`index.ts:49` `return []`) / export marka = `mapping.brandId` (varyant içinden; transformer `ProductTransformer.ts:74` `Marka: String(mapping.brandId)`) | VAR (6s) ama `values:[]` hep (`CategoryTransformer.ts:68`); `allowCustom = type!=='enum'`; export'ta `catAttrs=[]` (özellik şemasına karşı denetim YOK) | AYRI uç, sayfalı (max 50 sayfa, cache YOK, `CategoryService.ts:55-68`); `id==title` (metin = kimlik, `CategoryTransformer.ts:73-89`) | supported (not: marka sağlanmaz, `descriptor.ts:63-67`) |
| N11 | VAR (cache yok) / export kimliği `sp.category?.id` = YEREL kategori (`n11/transformers/Mappers.ts:33`) -> eşleme kullanılmıyor | **YOK** (`AuxiliaryServices.ts:10-12`) | VAR (cache yok) | Ayrı uç (SOAP/REST, `CategoryService.ts:55-68`) | supported (`descriptor.ts:66-70`) |
| Pazarama | VAR (6s) / kimlik | VAR / kimlik (`pazarama/services/BrandService.ts`) | VAR (6s) | Özellikle gömülü (`CategoryService.ts:26-30`) | supported |
| Ideasoft | VAR (cache yok) / kimlik (`getPlatformCategoryId`) | VAR / kimlik | "option-groups" -> özellik gibi (`CategoryTransformer.ts:52-62`: `required:false`, `varianter:true`, `allowCustom:false` SABİT) | gömülü; `fetchCategoryAttributeValues` `[]` (`CategoryService.ts:55-57`) | limited |
| Bizimhesap | `settings.catalog` (ürünlerden türetilir) | aynı | `options` | `[]` | limited |

Kısa sonuç: marka eşi (kimlikle) yalnız Trendyol, Pazarama, Ideasoft'ta anlamlı; HB/N11'de platform marka listesi yok -> marka eşi kurulamaz (HB'de varyant içinden gelir).

## (E) Bulgular

### P0
1. **HB export, kategori/marka eşlemesini hiç kullanmıyor.**
   - Kanıt: `hepsiburada/services/ProductService.ts:36-42` (`mapping?.categoryId/brandId`, `mappingProvider` çağrısı yok); `ProductTransformer.ts:66,74` `Number(undefined)=NaN`, `Marka:"undefined"`. `mapping.categoryId/brandId` yalnız HB'den IMPORT edilen varyantta dolar (`ProductTransformer.ts:118-122`).
   - Etki: Yerelde oluşturulan ürün HB'ye gönderilemez veya bozuk gider; kategori eşleme ekranı HB için işlevsiz. HB `catAttrs=[]` olduğundan zorunlu özellik denetimi de yok (`:36-42`).
   - Çözüm yönü: Trendyol/Pazarama'daki `getPlatformCategoryId/BrandId` kalıbı + `fetchCategoryAttributes`; marka için HB'de marka listesi/eşi sözleşmesi DOĞRULANAMADI (platform kuralı belirsiz).
2. **N11 export/import fiilen eşlemesiz; import iskelet.** `Mappers.ts:33` kategori = yerel kategori kimliği; ürün gövdesinde marka/özellik YOK (`Mappers.ts:30-42`); `convertToInternalModel` boş iskelet (`n11/services/ProductService.ts:227-229`), `getSummaryFromRaw` boş (`:231-233`) -> Stager tüm kayıtları boş `barcode/maincode` ile işler. Etki: N11 ürünleri doğru kategoriye gitmez; N11 import çalışmaz. (Gerçek N11 ret davranışı DOĞRULANAMADI.)
3. **autoMatch: değeri gömülü gelmeyen özelliklerde BOŞ eşleme yazıp kalıcılaştırıyor.** `autoMatch.ts:179-198`: "gömülü değil -> skipped" dalı yalnız `pValues` dizi DEĞİLSE çalışır; ama tüm mapper'lar daima dizi döner (`trendyol/CategoryTransformer.ts:42` `?? []`, HB `:68` `[]`, N11 `:166`). Sonuç: `values: []` ile satır yazılır (`:201-218`), `skipped` hiç dolmaz; sonraki çalıştırmada `existingAttrKeys` (`:49,169`) yüzünden bir daha dokunulmaz. Etki: Trendyol V2/HB/N11'de özellik "eşli" görünür ama değer eşi yok -> (G)-1. Çözüm yönü: `values.length===0 && !allowCustom` ise `retrieveCategoryAttributeValues` ile doldur ya da yazma+raporla.

### P1
4. **autoMatch her kategoriyi "yaprak" sayıyor.** `autoMatch.ts:43` `!c.children` süzgeci; `CategoryRepository.findAll` düz `find({})` döner (`CategoryRepository.ts:19-21`), belgede `children` yok -> kök dahil TÜM kategoriler eşlenmeye çalışılır (gereksiz API çağrısı, ana kategoriler platform yaprağına eşlenebilir). Çalıştırılarak doğrulanmadı (kod okuması).
5. **Doğrulama "sessiz": `validate()` Trendyol/Pazarama/N11/Ideasoft/Bizimhesap'ta her zaman true** (`trendyol/ProductService.ts:272-275`, `pazarama:150-152`, `n11:235-237`, `ideasoft:176-178`, `bizimhesap:114-116`). Eşleme eksikliği yayın anında genel metinle çıkar: `throw new Error("Eşleşme bulunamadı.")` (`trendyol:89`, `pazarama:56`, `ideasoft:87`) — kategori mi marka mı eksik söylemez. Validator yalnız YEREL kategori/marka varlığına bakar (`Validator.ts:149-150`).
6. **Hata yapılandırılmamış.** Export hatası düz metin + `errorType` ("VALIDATION_ERROR" `Validator.ts:205-212`, "BUSINESS_ERROR" `Publisher.ts:174-175`); `docs/ERROR_CODES.md` genel kodlar (RPC zarfı) — eşleme için kod/neden/çözüm alanı YOK. Trendyol/Pazarama zorunlu özellik mesajı alan bazlı ama metin (`trendyol/ProductTransformer.ts:669`, `pazarama:216-217`).
7. **İçe aktarımda marka eşi denetlenmiyor; HB ürünleri kategori/markasız oluşuyor.** Stager yalnız kategori+varyant özelliği bakar (`Stager.ts:91-125`). Trendyol/Pazarama `getLocalBrandId` bulamazsa `brand: undefined` ile ürün açılır (`trendyol/ProductService.ts:367-375`). HB `convertToInternalModel`: `brand:null, category:null` (`hepsiburada/ProductService.ts:288-300`) -> sonra Validator "Ürünün kategorisi bulunamadı" (`Validator.ts:149`). Ideasoft `brand||null`. İki yerel marka aynı platform id'sine eşlenebilir (`getLocalBrandId` ilkini döner, `PlatformMappingProvider.ts:105-109`; benzersizlik yok).
8. **Import yinelenen-koruma tutarsızlığı.** `Importer.hashChoices` MD5 + `maincode:` (`Importer.ts:288-297`) ama DB'deki `variantHash` SHA-256 + `maincode|` (`Variant.ts:13-16`) -> `hashSetByDB.has` (`Importer.ts:96`) hiç eşleşmez; gerçek koruma barkod kontrolü + unique indeks (E11000 -> "Mükerrer (Yarış)" `:194-198`). Ayrıca iki farklı ürünün `choices` boş çıkıp aynı `variantHash` ile çakışması durumunda ikinci varyant "mükerrer" sayılır (veri kaybı riski; HB/N11'de choices daima `[]`, `hepsiburada/ProductService.ts:249`). Stager'da DUPLICATE tespiti ölü: `dCount`/`globalDuplicates` hiç artmaz (`Stager.ts:67,71,188`).
9. **Bayatlık tespiti yok.** Platform kategori/özellik/değer silinip değişirse eşlemeler taranmaz; yalnız (a) yerel kategori platform kategorisi değişince eski özellik eşleri silinir (`mappingCleanup.ts:39-47`), (b) Trendyol export'ta bayat id metinle yeniden çözülür. Cache: platform listeleri global 6 sa (`trendyol/CategoryService.ts:24,45,56`; HB `:23,35`; pazarama `:25,33,49`), boş dizi yalnız 30 sn (`utils/decorator/cache.ts` DEFAULT_EMPTY_TTL_SECONDS); eşleme cache 10 dk tenant, invalidation POD-YEREL (`cache.ts` "Pod-yereldir") -> çoklu podda en çok 10 dk bayat. Yeniden eşleme akışı: yalnız elle/autoMatch (mevcutları ASLA ezmez, `$setOnInsert`).
10. **Eşleme yerel-kategoriye bağlı, kalıtım yok.** Aynı Choice için her yerel kategoride ayrı özellik+değer eşi gerekir; ürün başka (üst/kardeş) kategorideyse "eşleme yok". `resolveLocalCategoryId` (`attributeMapping-service.ts:201-209`) bir platform kategorisine birden çok yerel kategori eşliyse 400.
11. **Zod şeması olmayan RPC'ler:** `getCategoryMapping`, `getAttributeMapping`, 4× `retrieve*FromIntegration` (bkz. C). Doğrulamasız `integrationCode` dış çağrıya gider.
12. **Çoklu değer temsil edilemez** (model attributeId başına tek değer; `AttributeResolver` "ilki kullanıldı" uyarısı `attributeResolver.ts:61`, `Trendyol multiple:false` `CategoryTransformer.ts:43`; HB `multiValue` okunur ama gönderilmez). Resolver eşlenmemiş yerel değeri sessizce atlar, uyarı bile üretmez (`attributeResolver.ts:62-63`).

### P2
13. AttributeMappings: `(integrationCode, platformCategoryId)` üzerinde indeks yok; Provider tüm koleksiyonu `find({})` ile bellekte tarar (`PlatformMappingProvider.ts:45-47`), her entegrasyon için ayrı cache anahtarı => entegrasyon sayısı kadar tam kopya. Benzersiz anahtar platformCategoryId içermez (`AttributeMapping.ts:37`; ATTRIBUTE_MAPPING_REVIEW §5 önerisi uygulanmadı).
14. Brands/Categories/Choices'te benzersizlik/indeks yok (aynı başlık çoğaltılabilir; `addChoiceValue` yalnız uygulama düzeyinde kontrol `choice-service.ts:211-214`). `Brands.parentId` Number.
15. Audit: eşleme yazımlarında kim/ne zaman yok (yalnız `updatedAt`).
16. Ideasoft özellik modeli sabit (`required:false`) -> zorunlu özellik denetimi kurulamaz (`ideasoft/CategoryTransformer.ts:52-62`).
17. `deleteBrand`/`deleteCategory` bu varlığa bağlı ürünleri kontrol etmez; silinen markaya bağlı ürün export'ta "Eşleşme bulunamadı" verir (`brand-service.ts:143-146`, `category-service.ts:102-108`).
18. Trendyol `unmappedVarianters: []` her zaman boş (`trendyol/ProductService.ts` resolveVariantChoices dönüşü, ~:519); import'ta eşlenmeyen varyant özelliği sessiz düşer (Stager normalde önce engeller).

## (F) ATTRIBUTE_MAPPING_REVIEW_2026-09-30 §4 durum tablosu

| # | Madde | Durum | Kanıt |
|---|---|---|---|
| 1a | `saveAttributeValueMapping` sorgusuna `localCategoryId` (+zorunlu doğrula) | KISMEN (eklendi; zod'da opsiyonel, yoksa kategori eşinden TEK aday türetilir, belirsizse 400) | `attributeMapping-service.ts:248-250, 283-287, 201-209`; `rpc-input/catalog.ts:113` |
| 1b | Tek atomik `updateOne` (pipeline) | YAPILDI (+11000 yarış yeniden denemesi) | `attributeMapping-service.ts:269-291`; `AttributeMappingRepository.ts:46-54` |
| 1c | `platformValueId \|\| platformValueName` fallback kaldır | YAPILDI (kimlik yoksa null; yalnız `isAllowCustom:true`) | `attributeMapping-service.ts:240-245` |
| 2 | `saveCategoryMapping` platform kat. değişince eski özellik eşi silme/uyarı | YAPILDI (varsayılan SİL, `keepAttributeMappings` ile koru; sayaç döner). Kalan: silme kullanıcıya sessiz olabilir (FE onayı DOĞRULANAMADI) | `attributeMapping-service.ts:99-125`; `mappingCleanup.ts:39-47` |
| 3 | Choice/Value/Category silmede yetim temizliği | YAPILDI (detach/pull/delete); kullanımda-engeli YOK; `Variants.choices` temizlenmez | `choice-service.ts:202-208,237-242`; `category-service.ts:102-108`; `mappingCleanup.ts:14-36` |
| 4a | autoMatch platform parametre | YAPILDI | `attributeMapping-service.ts:45-50`; `rpc-input/catalog.ts:96` |
| 4b | `bulkWrite` (N+1 yok) | YAPILDI (500'lük, `$setOnInsert`) | `autoMatch.ts:240-245` |
| 4c | Hata fırlat (ADR-0006) | YAPILDI (kategori başına `failed` + hepsi düşerse 502) | `autoMatch.ts:223-238` |
| 4d | Gömülü olmayan değerler için `retrieveCategoryAttributeValues` | HAYIR (yalnız "skipped" dalı var, erişilemez; bkz. P0-3) | `autoMatch.ts:179-198` |
| 5a | Girdi şemaları (ObjectId, `values[].localValueId`, `platformValueName` zorunlu) | YAPILDI (kısmen: `getCategoryMapping/getAttributeMapping` şemasız) | `rpc-input/catalog.ts:16-20, 96-120` |
| 5b | `get` için sayfalama/projeksiyon/`integrationCode` süzgeci | KISMEN (sayfalama + süzgeç var; projeksiyon yok) | `attributeMapping-service.ts:32-37`; `AttributeMappingRepository.ts:17-22` |
| 6 | Sunucu tarafı export çözümleyici (P0-1) | YAPILDI (ADR-0025, `AttributeResolver` Validator'da). Kısıt: staging payload'a yazar, Variants'a yazılmaz; çoklu değer/eşlenmemiş değer sessiz; HB'de kullanılan ama şema denetimsiz | `attributeResolver.ts:21-79`; `Validator.ts:152-161`; test `tests/characterization/catalog/AttributeResolver.wp12.test.ts` |
| §5 | `allowCustom` bayrağı satırda | HAYIR | `AttributeMapping.ts:26-30` |
| §5 | Benzersiz indeks platformCategoryId'li | HAYIR | `AttributeMapping.ts:37` |
| §5 | `platformCategoryId` indeksi | HAYIR | `index-manifest.json` AttributeMappings (2 indeks) |
| P1-3 | HB/N11/Ideasoft zorunlu özellik denetimi | HAYIR (HB `catAttrs=[]`, N11 özellik yok) | bkz. (E)-1,2 |

## (G) "Uyan değer yok" — backend kök neden adayları (olasılık sırası DEĞİL, kontrol sırası)

Backend verisi FE'ye iki kaynaktan gelir: (i) `AttributeMappingService/get` (eşler), (ii) `retrieveCategoryAttributes/AttributeValuesFromIntegration` (platform listeleri). Aday nedenler:

1. **Değer eşi yok / boş `values[]`** — özellik satırı var ama `values` içinde ilgili `localValueId` yok. En sık sebep: autoMatch'in Trendyol V2 / HB / N11'de değerleri gömülü bulamayıp BOŞ `values` ile satır yazması ve bir daha düzeltmemesi (E-3). Doğrulama: DB'de ilgili AttributeMappings satırında `values.length`.
2. **Platform değer listesi hiç çekilmemiş/boş:** HB özellikleri daima `values:[]` (`hepsiburada/CategoryTransformer.ts:68`), değerler ayrı uç + sayfalı + cache'siz (`CategoryService.ts:55-68`); N11 ayrı uç; Trendyol V2 gömülü yoksa ayrı uç (`trendyol/CategoryService.ts:35-41`) ve gömülü liste boşsa yalnız öznitelik kategoride varsa çağrılır. FE yalnız `attr.values` okuyorsa boş görünür (FE tarafı ayrı ajan).
3. **Ideasoft/Bizimhesap `fetchCategoryAttributeValues` daima `[]`** (`ideasoft/CategoryService.ts:55-57`, `bizimhesap/CategoryService.ts:33-35`); değerler yalnız özellik nesnesinin içinde.
4. **Platform kategorisi / özellik eşi yok:** kategori eşi yoksa `getPlatformCategoryId` undefined -> özellik listesi/eşleri çözülemez (`attributeResolver.ts:30-32`); özellik eşi autoMatch'te yalnız Choice başlığı ile ≥0.80 benzerse oluşur (`autoMatch.ts:165-167`), aksi halde elle.
5. **Eşlemeler yerel kategoriye bağlı:** ürün farklı/üst yerel kategorideyse eşleme "yok" (E-10); autoMatch yaprak süzgeci hatası (E-4) bazı kategorileri atlamaz ama üst kategorilere gereksiz eşler yazar.
6. **Kategori yeniden eşlendi -> özellik eşleri varsayılan silindi** (`attributeMapping-service.ts:121-123`): kullanıcı kategori eşini değiştirince tüm özellik/değer eşleri kaybolur.
7. **allowCustom uyuşmazlığı:** değer eşi yalnız `platformValueId` boşsa ve `isAllowCustom:true` ile kaydedilir (`:242-244`); HB `allowCustom = type!=='enum'` (`CategoryTransformer.ts:65`), Ideasoft sabit `false`. Platform "allowCustom=false" dönerken değer listesi boşsa ne seçilebilir ne serbest metin yazılabilir (400).
8. **Cache bayatlığı:** platform listeleri 6 sa global (yeni platform değeri 6 saate kadar görünmez); eşleme cache 10 dk, invalidation pod-yerel; boş sonuç 30 sn cache'lenir (geçici API boşluğu 30 sn "boş" gösterir). Kimlik farkı: tüm tenant'lar aynı global cache'i paylaşır (platform listesi aynı olduğu varsayımı; HB/Pazarama için tenant'a özgü liste olup olmadığı DOĞRULANAMADI).
9. **Kimlik tipi / eşleştirme biçimi:** `platformValueId` String saklanır (`:169`); eski kayıtlarda sayısal/farklı biçim olup olmadığı DOĞRULANAMADI. HB'de değer kimliği = metin (`toInternalAttributeValues`), metin farkı (boşluk/harf) eşleşmeyi bozar.
10. **Yerel Choice değeri silinmiş/yeniden adlandırılmış:** silinince eşlerden çekilir (`mappingCleanup.ts:23-30`); yeniden eklenirse YENİ `_id` -> eşler kaybolur.
11. **`AttributeMappingService/get` tümü döner** (integrationCode süzgeci opsiyonel): FE entegrasyon süzgeci göndermezse başka platformun satırları karışabilir (FE tarafı DOĞRULANAMADI).

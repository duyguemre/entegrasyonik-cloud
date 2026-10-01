# Özellik (Attribute) Eşleme — Uçtan Uca İnceleme (WP9, 2026-09-30)

Kapsam: tenant eşleme modeli -> platform kategori özellikleri (+cache) -> dönüştürücüler (export/import) -> çözümleme (PlatformMappingProvider, Stager) -> API yazma yolu. Yalnız okuma + sahip olunan dosyalarda düzeltme; DB/şema değişmedi. Resmi sözleşme yalnız Trendyol için var (API_CONTRACTS_2026-09-30 §1); HB/N11/Pazarama/Ideasoft sözleşmeleri DOĞRULANAMADI — o platformlarda yalnız güvenlik niteliğinde düzeltme yapıldı, alan adı/şekil değişmedi.

## 1. Akış (metin diyagramı)

```
FE ChoicesMappingComponent / attributeMapping store
   |  RPC AttributeMappingService/{saveCategoryMapping,saveAttributeMapping,saveAttributeValueMapping,autoMatchAllCategories,deleteFullMapping}
   v
AttributeMappings (tenant DB; şema: integrationCode+localCategoryId+platformAttributeId UNIQUE)
   |-- kayıt tipi A: isCategoryMapping=true  (yerel kat. -> platformCategoryId)
   |-- kayıt tipi B: isCategoryMapping=false (yerel Choice <-> platformAttributeId; isVarianter/isSlicer/isRequired; values[{localValueId, platformValueId|null, platformValueName}])
   |     (allowCustom özelliklerde platformValueId=null, eşleme metinle)
   v   @InvalidatesTenantCache('PlatformMappingProvider','CatalogOperations')  [WP3, doğrulandı: 5 yazma yolunda var]

IMPORT (pazaryeri -> yerel):
  Importer/Stager: getSummaryFromRaw(requiredAttributes = yalnız varianter|slicer) -> Stager.validateMapping(kategori eşi + özellik eşi)
      -> ProductService.convertToInternalModel -> resolveVariantChoices(getAllAttributeMappings + getLocalChoices)
      -> variant.choices (yerel Choice/Value) + variant.platforms[code].attributes = {attrId:{attributeName,attributeValue,attributeValueId}} (HAM platform değeri)

EXPORT (yerel -> pazaryeri):
  Validator (instance.validate: bugün her platformda "her zaman uygun") -> Publisher -> ProductService.processBatch
      -> PlatformMappingProvider.getPlatformCategoryId/BrandId -> CategoryService.fetchCategoryAttributes (global @Cache 6 saat)
      -> transformer.toPlatformBatch(prepareAttributes(variant.platforms[code].attributes, catAttrs))
  !! Yerel Choice değerlerinden (variant.choices) platform özelliği ÜRETEN sunucu adımı YOK: yükü yalnız FE (ProductVariantAttributesComponent,
     kategori eşlemesini istemcide uygular) veya import doldurur. (Bkz. P0-1)
```

## 2. Bulgular

### P0
- **P0-1 Export'ta sunucu tarafı eşleme çözümü yok.** `variant.choices -> platform attributes` çevirisini yalnız FE yapıyor; API/MCP/Excel/toplu yolla oluşan varyantlarda `platforms[code].attributes` boş kalır ve zorunlu özellik yüzünden pazaryeri asenkron reddeder (kullanıcı sonucu batch sonucunda geç ve dağınık görür). **Kısmi düzeltme:** Trendyol + Pazarama'da yayın öncesi alan bazlı VALIDATION (aşağıda). **Kalıcı çözüm mimari karardır (ADR gerekir):** sunucu tarafı `resolvePlatformAttributes(variant.choices, localCategoryId, platformCategoryId)` (PlatformMappingProvider.getAttributeMappingsForCategory hazır) — ben yapmadım, bulgu.
- **P0-2 (API, WP8) `AttributeMappingService.saveAttributeValueMapping` sorgusunda `localCategoryId` YOK** (yalnız integrationCode+platformAttributeId+platformCategoryId): aynı platform kategorisine bağlı farklı yerel kategorinin dokümanını günceller VEYA `localCategoryId`'siz doküman upsert eder (şemada required; `updateOne` upsert doğrulamayı atlar) -> benzersiz indeks çakışması. Ayrıca `$set/$pull/$push` 3 ayrı, atomik olmayan yazma (yarış: aynı değer iki kez/eksik).
- **P0-3 Trendyol: zorunlu özellik eksikliği sessizdi** -> DÜZELTİLDİ (b672578).
- **P0-4 Stager: özellik eşlemesi yerel kategoriden bağımsız aranıyordu** (başka yerel kategorinin eşlemesi yolu "geçerli" gösterir, ürün çevirisi ise yerel kategori süzdüğü için seçenek üretemezdi) -> DÜZELTİLDİ (0fb8038; ilgili karakterizasyon testi bilinçli güncellendi).

### P1
- **P1-1 Ideasoft**: FE nesnesi (`{attributeValueId,...}`) `options[].id` olarak NESNENİN KENDİSİ gidiyordu; **Hepsiburada**: kimliksiz (serbest değer) nesne olduğu gibi (nesne) gönderiliyordu -> DÜZELTİLDİ (984a6b7).
- **P1-2 Çoklu değer temsil edilemiyor.** Model `Record<attributeId, tek değer>`; HB `multiValue`, Pazarama `multiple`, (Trendyol çok değerli özellikler: aynı attributeId için birden çok giriş — DOĞRULANAMADI) desteklenmez. Trendyol `CategoryTransformer` `multiple:false` sabit. Şema önerisi §5.
- **P1-3 Yayın öncesi zorunlu-özellik denetimi yalnız Trendyol+Pazarama.** HB `toPlatformBatch` `catAttrs=[]` ile çağrılıyor (kategori özellikleri hiç çekilmiyor) ve N11 dönüştürücüsü ürün gövdesinde HİÇ `attributes` üretmiyor (SOAP/REST create) -> zorunlu özellikli kategorilerde ret. Ideasoft `categoryAttributes` ölü parametre. Sözleşmeler doğrulanamadığı için dokunulmadı.
- **P1-4 Kategori değişimi/yeniden eşleme:** `saveCategoryMapping` yeni platform kategorisi kaydında eski platform kategorisine ait özellik eşlemelerini silmiyor/işaretlemiyor; varyantlardaki bayat özellikler FE'de kısmen temizleniyor. Trendyol export artık kategoride olmayan özelliği göndermiyor (DÜZELTİLDİ); diğer platformlarda bayat kayıtlar gider. `PlatformMappingProvider.getAttributeMappingsForCategory(local, platformCat)` eski platform kategorisini süzer (eklendi).
- **P1-5 Yetim referanslar:** Choice/Value veya yerel kategori silinince `AttributeMappings.values[].localValueId` / `localChoiceId` / `localCategoryId` temizlenmiyor (choice-service/category-service AttributeMapping'e dokunmuyor). Bayat `platformValueId` (platform değeri silindi) için tarama yok; Trendyol export'ta artık metinle yeniden çözülür, çözülemezse alan bazlı VALIDATION.
- **P1-6 `autoMatchAllCategories`:** `activePlatforms=['trendyol']` sabit (diğer platformlar sessizce yok), her özellik için ayrı `create` (N+1 yazma; 15'li paralel), hata `{result:false}` ile yutuluyor (ADR-0006 sözleşmesi: hata fırlatılmalı), `pAttr.values` gömülü değilse (V2'de değerler ayrı uç) değerler sessizce boş eşlenir.
- **P1-7 `saveAttributeValueMapping` `platformValueId = platformValueId || platformValueName`** kimlik ile metni birbirine karıştırıyor (kimliği olmayan değer kimlik sanılır).

### P2
- Önbellek: `getAllAttributeMappings` (30 sn) ile yazım hatalı `getAllAtrributeMappings` (10 dk) AYNI koleksiyonu iki ayrı okuyordu -> tek önbellek (10 dk, invalidation WP3 ile) (c4e06c0). Anahtar bildirimi ("integrationCode yok") yanlıştı: anahtarda `integrationCode` VAR, entegrasyon başına ayrı kayıt (zararsız; yorum düzeltildi).
- `getPlatformCategoryId(undefined)` TypeError -> "eşleme yok" (DÜZELTİLDİ). `resolveVariantChoices` kimlik/metin öncelik hatası (`String(null)==='null'`, `platformValueName` undefined TypeError) -> `matchMappingValue` (DÜZELTİLDİ).
- Provider tüm eşleme koleksiyonunu bellekte tarıyor (DB döngüsü YOK; N+1 sorgu bulunmadı); tenant başına 10 dk önbellek, büyük tenant'ta `find({})` projeksiyonsuz. `AttributeMappingService.get` tüm kayıtları döner (sayfalama/projeksiyon yok).
- Trendyol kategori özellikleri global `@Cache` 6 sa (Trendyol değişme sıklığı DOĞRULANAMADI); bayat değer riski yukarıdaki metin-yeniden-çözümle azaltıldı.

## 3. Düzeltilenler (commit'ler)
| Commit | İçerik |
|---|---|
| b672578 | `src/integration/catalog/attributePayload.ts` (saf yardımcılar). Trendyol `prepareAttributes`: boş/'undefined' atlanır; kategoride olmayan özellik gönderilmez; geçerli liste kimliği HER ZAMAN kimlikle (allowCustom olsa da); bayat kimlik metinle yeniden çözülür, çözülemezse VALIDATION (custom'a sessiz düşme yok); sayısal olmayan attributeId NaN yerine VALIDATION; zorunlu özellik eksik -> alan bazlı VALIDATION (diğer sözleşme ihlalleriyle tek hatada, barkod içerir); onaylı içerik güncellemesinde slicer/varianter hariç. 15 yeni test + mevcut fikstür (`REQUIRED_ATTRS`) güncellendi |
| 984a6b7 | HB/Ideasoft nesne-kimlik hatası, boş değer; Pazarama boş değer + zorunlu eksik VALIDATION (alan şekli aynı). 10 test |
| c4e06c0 | Provider tek önbellek, `getAttributeMappingsForCategory`, boş kimlik koruması; `matchMappingValue` ile Trendyol/Pazarama import değer çözümü. 10 test |
| 0fb8038 | Stager yerel-kategori bazlı özellik eşi. 3 yeni test, 1 karakterizasyon bilinçli güncellendi |

Modül testleri: catalog 326, trendyol 243, pazarama 149, hepsiburada 131, ideasoft 94, cache 103, common 563 (yeşil); `tsc --noEmit` temiz; ilgili dosyalarda eslint 0 hata.

## 4. API servis katmanında yapılması gerekenler (WP8 sonrası; ben dokunmadım)
1. `saveAttributeValueMapping`: sorguya `localCategoryId` ekle (+ zorunlu doğrula); tek atomik `updateOne` (pipeline veya `arrayFilters`) — `$pull/$push` üçlüsünü kaldır; `platformValueId || platformValueName` fallback'ini kaldır (kimlik yoksa `null`).
2. `saveCategoryMapping`: platform kategorisi DEĞİŞİYORSA o yerel kategorinin eski platform kategorisine ait özellik eşlemelerini sil/uyar (P1-4).
3. `deleteFullMapping` ve Choice/Category silme yolları: `AttributeMappings`'teki yetim `localChoiceId`/`localValueId`/`localCategoryId` temizliği veya kullanımda-engeli (P1-5).
4. `autoMatchAllCategories`: platform kodunu parametreleştir, `insertMany`/`bulkWrite`, hata fırlat (ADR-0006), gömülü olmayan değerler için `retrieveCategoryAttributeValues`.
5. `saveAttributeMapping/…` girdi şemaları (ADR-0023 ikinci dalga): `localChoiceId/localCategoryId` ObjectId, `values[].localValueId` zorunlu, `platformValueName` zorunlu; `get` için sayfalama/projeksiyon ve `integrationCode` süzgeci.
6. (Karar gerektirir) sunucu tarafı export çözümleyici RPC/işlemi (P0-1).

## 5. Şema önerileri (uygulanmadı)
- `AttributeMappings.values[]` için `platformValueId` boşken `allowCustom:true` bayrağını satırda tut (şu an çıkarım); çoklu değer için varyantta `platforms[code].attributes[attrId]` = `{...}` yerine `values: [{valueId,text}]` (geriye dönük: tek nesne = tek elemanlı dizi).
- Benzersiz indeks: `(integrationCode, localCategoryId, platformCategoryId, platformAttributeId)` — mevcut indeks platform kategorisini içermiyor (bir yerel kategori iki platform kategorisine yeniden eşlenince kayıtlar üzerine yazılır).
- `AttributeMappings.platformCategoryId` üzerinde indeks (Stager `find({integrationCode})` + import çevirisi süzgeci).

## 6. Doğrulanamayan platform sözleşmeleri
- **Hepsiburada:** ürün içe aktarmada özelliklerin Türkçe anahtarlı düz `attributes` objesi olduğu, `multiValue` gönderim biçimi, `mandatory` semantiği, enum/serbest ayrımı (`type !== 'enum'`).
- **N11:** ürün oluşturmada özellik gönderim alanları (SOAP `attributes`, REST SKU `attributes`) — koddaki mapper hiç üretmiyor.
- **Pazarama:** `attributes[{attributeId, attributeValueId, customAttributeValue}]` şekli ve ikisinin birlikte gönderilmesinin kabulü (kod ikisini birden gönderiyor, karakterize test bunu sabitliyor), `required`/`multiple` alan adları.
- **Ideasoft:** `optionGroups[{id, options[{id}]}]` ve `hasOption:0` ile birlikte kullanımı.
- **Trendyol (kısmen resmi):** çoklu değerli özelliklerin gönderimi; kategori özelliklerinin V2 yanıt şekli (kod hoşgörülü okuyor, spec §8/10); değer/özellik listelerinin değişme sıklığı (6 sa cache dayanağı yok).

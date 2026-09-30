# 0025 — Export'ta Sunucu Tarafı Özellik (Attribute) Çözümleme

## Durum
Kabul edildi (2026-09-30)

## Bağlam
`docs/audits/ATTRIBUTE_MAPPING_REVIEW_2026-09-30.md` P0-1: export'ta yerel seçeneklerden (`variant.choices`) platform özelliğine çeviren sunucu adımı yoktu. `platforms[code].attributes` yalnız FE ya da import tarafından doluyordu; API/MCP/Excel ile oluşan varyantlarda özellik boş gidiyor, pazaryeri asenkron reddediyordu.

## Değerlendirilen Alternatifler
1. Her platform adaptöründe (`prepareAttributes` çağrı noktaları) ayrı çözümleme. Reddedildi: 5 yerde tekrar, tutarsızlık, N+1 riski.
2. Çözümlenen değeri Varyant belgesine kalıcı yazmak. Reddedildi: veri/şema değişikliği, FE'nin girdiği değerle yarış; eşleme değişince bayat kalır.
3. **Export boru hattında (Validator) tek noktada, bellek-içi zenginleştirme.** Seçildi.

## Karar
- `integration/catalog/attributeResolver.ts` (`AttributeResolver`): (tenant sağlayıcısı, platform kodu, yerel kategori, `variant.choices`) -> `platforms[code].attributes` (`{ attributeName, attributeValue, attributeValueId? }`; `attributeValueId` yoksa serbest metin/allowCustom). Eşleme kaynağı `AttributeMappings`; `PlatformMappingProvider.getPlatformCategoryId` + `getAttributeMappingsForCategory` (kategoriye VE platform kategorisine bağlı: farklı/bayat kategori eşlemesi karışmaz; kategori eşlemesi yoksa çözümleme yapılmaz).
- **Öncelik:** normalize edildiğinde dolu (FE/import) kayıt DOKUNULMAZ; çözümleyici yalnız eksik/boş/`undefined` olanları tamamlar. Değer `variant.choices[].choiceId == mapping.localChoiceId` ve `choiceValueId == values[].localValueId` ile bulunur. Aynı choice için çoklu değer varsa (model özellik başına tek değer tutar) ilk değer alınır, uyarı loglanır.
- **Çağrı noktası (TEK):** `engine/catalog/export/Validator.processValidationBatch`, `instance.validate(variant)` öncesi. Sonuç `payload: variant` ile staging'e yazılır; Publisher/adaptörler değişmeden okur. Varyant koleksiyonuna YAZILMAZ (veri/şema değişikliği yok).
- **Zorunlu özellik hâlâ eksikse** mevcut yol: platform dönüştürücüsü (`prepareAttributes`) alan bazlı, barkodlu `VALIDATION` üretir; pazaryerine eksik veri gönderilmez.
- **Hata politikası:** çözümleyici hatası (ör. eşleme okunamadı) yayını durdurmaz, uyarı loglanır ve eski davranışla (zenginleştirmesiz) devam edilir; asıl kapı dönüştürücü doğrulamasıdır.
- **Performans:** eşleme `PlatformMappingProvider`'ın WP3 tenant-kapsamlı önbelleğinden (10 dk, yazımda invalidation) gelir; çözümleyici kategori başına bellekte tek kez süzer (paket = Validator çalıştırması), N+1 yok. Sağlayıcı `IntegrationEngineProvider.getPlatformMappingProvider(clientId, code)` ile tenant başına üretilir (tenant izolasyonu).

## Gerekçe
Tek nokta, API/MCP/Excel/FE tüm kaynaklardan gelen varyantları aynı kuralla besler; adaptörler platform sözleşmesine odaklı kalır. Bellek-içi zenginleştirme veri modeline dokunmaz.

## Sınırlar / Açık
- Ürün düzeyi (varyanttan bağımsız) özellik modeli yoktur; yalnız `variant.choices` kaynaklıdır (ayrı karar gerekir).
- Çoklu değerli (`multiple`) özellik temsil edilemez (WP9 P1).
- Yalnız Trendyol/Pazarama dönüştürücüleri `platforms[code].attributes` tüketir; diğerleri (HB/N11/Ideasoft) için çözümleme zararsız ek veridir.

# 0032 — Kanal eşleme ve katalog verisinin hedef modeli

## Durum
Kabul edildi (2026-09-30), kod ve belge tarafı. Kod henüz değişmedi. DB'yi değiştiren her adım CLAUDE.md kural 3 (doğrulanmış yedek) ve Protokol 12 (insan onayı) şartına bağlıdır. Kaynak inceleme: `docs/audits/DATABASE_REVIEW_2026-09-30.md` §9 (iş paketleri DB-xx).

Çakışma kuralı: isimlendirme, tip, indeks ve göç disiplininde ADR-0021 kazanır. Stok semantiğinde ADR-0004 kazanır. Öznitelik çözümlemesinde ADR-0025 kazanır. Bu ADR yalnız **kanal eşleme verisinin nerede ve hangi biçimde tutulduğunu** belirler.

## Bağlam
Kullanıcı yönergesi (2026-09-30): "veri modelinde hantal yapılar, entegrasyonların merkezi birleştirme yapıları — daha performanslı, mimari olarak daha doğru yapılara geçebilirsin". Aynı gün eklenen karar: **mevcut kayıtlar şu aşamada mock veri sayılır.** Genel yönerge: overengineering yok (ADR-0030, "astarı yüzünü geçmesin").

Bulgular (Atlas yedeği 2026-09-26; yalnız sayı, bayt ve alan adı; ayrıntı inceleme §9.1):
- Varyant ↔ kanal durumu `Variants.platforms.<kod>` altında **şemasız** (`Object`, `strict:false`) tutuluyor. `attributes` Variants baytının %48'i. Trendyol öznitelik girdilerinin %82'si kardeş varyantların birebir kopyası (~5,5 MB, koleksiyonun %35'i).
- Kanal kimliği anahtarı iki adla yazılıyor: `mapping` (ortak yazıcı ve 3 pazaryeri) ile `mappings` (Ideasoft).
- Anahtar kanal kodu olduğu için **aynı kanalda ikinci mağaza hesabı** yapısal olarak temsil edilemiyor. `ClientIntegrations` de kanal başına tek girdi taşıyor.
- Kategori eşlemesinin iki kaynağı var: `AttributeMappings(isCategoryMapping)` ve yazıcısı olmayan `Categories.platforms.<kod>`. Komisyon okuması ikincisini okuyor ve hep `null` dönüyor.
- `Variants {stockDirty:true}` her 30 sn indeks olmadan taranıyor.
- Kanal referans verisi dağınık: komisyon tablosu pakete gömülü 2,9 MB JSON, kategori/öznitelik bilgisi yalnız Redis önbelleğinde, `CachedIntegrationDatas` ölü. Bizimhesap kataloğu sır belgesinin (`ClientIntegrations`) içinde (58,6 KB'lık belgenin 55,6 KB'ı).
- Sipariş, iade, finans ve mesaj kayıtları kendi koleksiyonlarında `{integrationCode, external…Id}` unique ile tutuluyor. Bu doğru desen.

Ölçek: 1 aktif tenant, 3.143 varyant, 6 kanal.

## Değerlendirilen Alternatifler
1. **H1 — Yerinde tipleme.** `platforms: Map<ChannelState>` alt şeması, tek anahtar adı, kısmi indeks, sıcak okuma projeksiyonları, tek kategori eşleme kaynağı. Artısı: adaptör okuma yolları değişmez, efor S/M, iki hata sınıfı kapanır (anahtar kayması, `null` komisyon). Eksisi: çoklu hesap sorunu ve varyant başına kopyalanan öznitelikler kalır.
2. **H2 — Tenant DB'de `ChannelLinks`.** Kanal durumu varyant/ürün × kanal × hesap başına ayrı belgeye taşınır. Artısı: çoklu hesap desteklenir, dış kimlikle ters arama indeksli olur, varyant belgesi kanal sayısıyla büyümez. Eksisi: 6 adaptör ile Publisher, Sentinel ve StockPublishTrigger değişir, sıcak yollara ikinci sorgu eklenir (L).
3. **H3 — Ürün düzeyi kanal öznitelikleri.** Varyant yalnız varyant belirleyen öznitelikleri taşır. Artısı: Variants ~%35 küçülür, N varyantlık yazım 1 yazıma iner. Eksisi: FE öznitelik editörü (karakterizasyonu yok), 6 dönüştürücü ve import değişir (L).
4. **H4 — App DB'de `ChannelCatalogs`** (paylaşılan kanal referans verisi). Artısı: komisyon tablosu dağıtım olmadan güncellenir. Eksisi: yeni yenileme işi gerekir, bugün Redis önbelleği yeterli.
5. **H5 — Tüm varlıklar için genel `ChannelLinks`** (sipariş ve iade dahil). Artısı: tek desen. Eksisi: doğru çalışan deseni bozar, en sıcak yollara join ekler.

## Karar
**H1 şimdi uygulanır.** H2, H3 ve H4 aşağıdaki şemayla **önceden onaylıdır** ama yalnız sayısal tetikleyicilerle açılır. H5 reddedildi.

Bağlayıcı kurallar:
1. Dış sistemin kendi kaydı (sipariş, iade, finans, mesaj, kargo faturası) kendi koleksiyonunda `{integrationCode, external…Id}` unique ile tutulmaya devam eder.
2. Katalog varlığının kanal durumu bugün `Variants.platforms.<kod>` altında, tipli `ChannelState` olarak tutulur: `mapping` (dış kimlikler), `upload`/`publish.<MOD> {status, updatedAt, batchProcessId, messages ≤ 5}`, `prices`, `attributes`, `stockSync`. Şemasız yeni alt anahtar açılmaz. Tek ad `mapping`'dir, `mappings` kaldırılır.
3. Kategori ve öznitelik eşlemesinin tek kaynağı `AttributeMappings`'tir. Varlık belgelerine kanal kategorisi yazılmaz, `Categories.platforms` okunmaz.
4. Kirli stok bayrağı `Variants.stockDirty` üzerinde kalır (ADR-0004 Karar 1) ve kısmi indeksle (`stockDirty_true`) okunur. Sıcak işler projeksiyonla okur.
5. Kanalın paylaşılan referans verisi tenant DB'ye kopyalanmaz. Tenant'a özel dış katalog, sır belgesine yeni alan olarak eklenmez. Bugünkü Bizimhesap kataloğu donmuş istisnadır ve H6 tetikleyicisine kadar yerinde kalır.
6. **H2 hedef şeması** (açıldığında bundan sapılmaz):
   ```
   ChannelLinks (tenant DB, autoIndex:false, indeksler göçle)
   { entityType: 'variant'|'product', entityId: ObjectId, channel: String, accountId: String (vars. 'default'),
     externalId: String|null, externalParentId: String|null,
     publish: { <MOD>: { status, at, batchId, messages[≤5] } }, prices: {salePrice, marketPrice}|null,
     attributes: Map (yalnız varyant düzeyi), stockSync: { lastPublishedQty, lastPublishedAt, lastBatchId },
     syncVersion: Number, lastSyncAt: Date, error: {code, at}|null, createdAt, updatedAt }
   uniq_entity_channel {entityType:1, entityId:1, channel:1, accountId:1}
   uniq_external       {channel:1, accountId:1, entityType:1, externalId:1}  partial: externalId string
   ```
7. **Geçiş biçimi (mock veri kararı):** yeni yapı → kod geçişi → gerekirse seed/mock verinin yeniden içe aktarımı. Backfill, çift okuma ve çift yazma dönemi yok. Şema ve indeks göçleri yedek ve onayla yapılır. İlk ödeyen tenant canlı veriye geçtiği anda bu kolaylık biter ve ADR-0021 expand/contract disiplini geri döner. H2 o noktadan sonra açılırsa bayraklı dual-write ya da bakım penceresinde kesin kesim birlikte değerlendirilir. Dual-write varsayılan değildir.

## Gerekçe
- Bugünkü en pahalı ve en kırılgan noktaların hepsi H1 ile kapanıyor: indekssiz tarama, şemasız anahtar kayması, iki kaynaklı kategori eşlemesi, tam belge okuma. H1 adaptör sözleşmesini (F-09) değiştirmiyor.
- H2 ve H3'ün getirisi gerçek ama bugün somut değil. 1 tenant ve 3 bin varyantta varyant belgesi en çok 7,6 KB (limitin çok altında). Çoklu hesap talebi de yok. Kod maliyetleri L, yani ADR-0030'un "astarı yüzünü geçmesin" kuralına takılıyor.
- Sipariş tarafındaki bileşik unique desen idempotent upsert'i zaten sağlıyor. Oraya ek bir katman koymak (H5) yalnız birleştirme maliyeti getirir.
- Mock veri kararı veri göçü maliyetini bugün sıfıra indiriyor. Bu yüzden H1 çift okuma olmadan tek adımda yapılır. H2 ve H3 için de "ilk ödeyen tenant" öncesine bir yeniden değerlendirme noktası konur, çünkü o noktadan sonra aynı değişiklik backfill ve çift yazma gerektirir.

## Maliyet/Ölçek Notu
- H1: ek servis yok. Bir kısmi indeks, projeksiyonlar ve alt şema. Efor toplamı ~2–4 gün (DB-03, DB-06, DB-09, DB-11, DB-16 çekirdeği).
- Yeniden değerlendirme eşikleri (bağlayıcı):
  - **H2 ChannelLinks:** (a) bir tenant aynı kanalda ikinci hesap isterse (ilk talepte), ya da (b) aktif kanal ≥ 5 **ve** varyant > 50.000/tenant, ya da (c) varyant ortalama belge > 16 KB, ya da (d) kanal dış kimliğiyle sıcak yolda ters arama > 1/sn.
  - **H3 ürün düzeyi öznitelik:** Variants > 500 MB/tenant, ya da ortalama belge > 16 KB, ya da FE öznitelik editörünün yeniden yazımı başlarsa.
  - **H4 ChannelCatalogs:** komisyon tablosu çeyrekte birden fazla dağıtım gerektirirse, ya da ikinci kanal komisyon/kategori tablosu isterse, ya da kategori öznitelik API çağrısı günde > 1.000 olursa.
  - **H6 ERP kataloğunu ayırma:** `ClientIntegrations` belgesi > 256 KB ya da katalog > 1.000 girdi.
  - **(e) H2 ve H3 ortak nokta:** ilk ödeyen tenant canlı veriye geçmeden önce.
  - Kategori/marka eşlemesinin bellek içi araması > 10.000 kayıt/tenant olursa indeksli sorguya geçilir.

## Etki Alanı
`database/client/models/Variant.ts`, `Product.ts`, `Category.ts`; `operations/integration/QueryBuilderOperations.ts`; `operations/stock/StockPublishTrigger.ts`; `integration/modules/provider/PlatformMappingProvider.ts`; `integration/modules/ecommerce/ideasoft/services/ProductService.ts`; `integration/modules/erp/bizimhesap/services/*`; `backend/migrations/` (yeni kısmi indeks); `docs/DATA_MODEL_CONVENTIONS.md` (§8 ek önerisi, inceleme §11). FE değişmez (H1). H3 açılırsa FE öznitelik editörü etkilenir.

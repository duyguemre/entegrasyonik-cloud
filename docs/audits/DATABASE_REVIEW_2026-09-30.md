# Backend Veritabanı Yapısı — Bütünsel İnceleme + Hedef Model (2026-09-30)

Kapsam: veri modeli, koleksiyonlar, indeksler, şema tutarlılığı, çok kiracılı düzen, büyüme, atomiklik ve (kullanıcı eki) **entegrasyon eşleme yapılarının hedef modeli**. Bu belge **kod değiştirmez, DB'ye bağlanmaz**. ADR-0021'in (veri modeli modernizasyonu) üzerine kurulur. ADR-0021'in D1–D22 listesi tekrar edilmez, yalnız durumu güncellenir. Yeni bulgular `DBR-xx`, iş paketleri `DB-xx` kodlarıyla verilir. Hedef model kararı: **ADR-0032**.

**Kanıt kaynakları**
- Kod: `backend/src/database/**` (yol öneki `backend/src/`), servisler, işçiler.
- Yedek: `backup/atlas/20260926/<db>/` (Atlas, 2026-09-26). Kullanılanlar: `*.metadata.json` (indeksler) ve bson dosyalarından **yalnız** belge sayısı, bayt, alan adı, tip dağılımı ve hash'lenmiş grup sayıları. Hiçbir alan değeri kopyalanmadı. Yedek, ADR-0003 şifreleme göçü ile sonraki indeks göçlerinden öncesine aittir. Canlı durum yerelde `getIndexes`/`collStats` ile ayrıca teyit edilmelidir (ADR-0021 Aşama 0).
- Ölçek: 1 aktif tenant (`entegrasyonikClient_1`), 3.143 varyant, 360 ürün, 64 sipariş, 38.668 müşteri.

**Kullanıcı kararı (2026-09-30): mevcut kayıtlar şu aşamada mock veri sayılır.** Bu yüzden plan veri taşıma ya da onarma göçü içermez: backfill, kırpma, mükerrer birleştirme, çift okuma veya çift yazma dönemi yok. Geçiş üç adımdır: **yeni yapı → kod geçişi → gerekirse seed/mock verinin yeniden içe aktarımı ya da sıfırlanması.** Şema ve indeks göçleri (yeni koleksiyon, unique/TTL/kısmi indeks) yine CLAUDE.md kural 3 (doğrulanmış yedek) ve Protokol 12 onayıyla çalışır. **Bu karar ilk gerçek (ödeyen) tenant canlı veriye geçtiğinde sona erer.** O andan itibaren ADR-0021 expand → migrate → contract disiplini ve (gerekirse) çift yazma yeniden devreye girer. Aşağıdaki "G" etiketli veri adımları bu nedenle "mock sıfırlama" olarak sadeleştirildi.

---

## 1. Özet tablo

Risk: **Y**üksek / **O**rta / **D**üşük · Efor: S (≤ yarım gün) / M (1–3 gün) / L (> 3 gün) · Tür: **K** = yalnız kod, **G** = göç gerekir (yedek + Protokol 12 onayı), **E** = salt ekleme göçü (indeks/koleksiyon, geri alınabilir).

| ID | Bulgu (kısa) | Risk | Efor | Tür | İş paketi | Sepet |
|---|---|---|---|---|---|---|
| DBR-01 | Customers'ta 8.709 mükerrer "kimliksiz" müşteri (koleksiyonun %22,5'i). Kimlik anahtarı yoksa her kayıtta yeni müşteri oluşuyor. `AUTO_FIX_<zaman>` sahte dış kimlik üretiyor | Y | M | K+G | DB-01, DB-13 | Şimdi |
| DBR-02 | `MetricRollups` iki TTL indeksi aynı varsayılan adı (`bucketStart_1`) alıyor. İkincisi kurulamaz, bir çözünürlük hiç silinmez | O | S | K+E | DB-05, DB-10 | Şimdi |
| DBR-03 | ADR-0029 bildirim koleksiyonlarının indeksleri (`uniq_idem_key` + TTL) için göç yok, manifest de görmüyor. Tekilleştirme E11000'e dayanıyor | O (bayrak açılınca Y) | S | E | DB-05, DB-10 | Şimdi (NOTIFY_V2 açılmadan önce) |
| DBR-04 | `Variants {stockDirty:true}` her 30 sn indeks olmadan taranıyor ve tam belge okunuyor (projeksiyon yok) | Y | S | K+E | DB-03, DB-11 | Şimdi |
| DBR-05 | `ExportStagedProducts` sınırsız: `logs[]` en çok 735 eleman, en büyük belge 281 KB (hedef ≤ 256 KB). TTL yok. ADR-0021 D13 uygulanmamış | Y | S | K+E | DB-04, DB-12 | Şimdi |
| DBR-06 | Customers/Products/Messages/Users/Shipments listelerinde `$sort` `$facet` içinde, bu yüzden indeks kullanılamıyor. Sıralama alanı izin listesi yok (Customers, Tickets, ImportJobs) | O | S | K | DB-02 | Şimdi |
| DBR-07 | `autoIndex` hâlâ örtük (D8 yapılmadı). Yedekte drift var: `Messages.externalMessageId_1` unique, `Invoices.orderId_1_type_1` unique, `Orders.orderDate_1`. `Clients`/`Users` unique'leri kurulmamış (D10) | O | S | K + (ADR-0021 D10/D16) | DB-08, DB-15 | Şimdi |
| DBR-08 | Variants şema kayması: şemada olmayan 10 alan her belgeye yazılıyor. Tip karışıklığı var: `choiceId` ObjectId 3.133 / string 10, `createdAt` Date 3.133 / string 10 | O | L | K(+G) | DB-16 | Sonra |
| DBR-09 | `VariantService` yazma metotları `Product.variants` gömülü yoluna yazıyor. Şemada yok, yedekte hiç yok, gerçek `Variants` koleksiyonuna yansımıyor. FE'nin 5 bileşeni var olmayan `getVariantsList` metodunu çağırıyor | O | M | K | DB-07 | Şimdi |
| DBR-10 | Entegrasyon durumu 3 yerde: `Clients.lastSuccessfulOrderSync`, `Clients.integrations[]` (app) ve `ClientIntegrations.<kat>[].syncMetadata` (tenant). `Clients.archive/image.secretAccessKey` DB'de kalmış (ADR-0003 env'e taşıdı) | O | M | K+G | DB-21, DB-26 | Sonra |
| DBR-11 | Sırlar Atlas yedeğinde düz metin (enc:v1 `--apply` hiç çalışmadı, C17). Yedek klasörünün kendisi de sır taşıyor | Y (bilinen) | — | G (ADR-0003 adım 7) | ADR-0003 | İnsan kararı |
| DBR-12 | Tenant anahtarı üç adla tutuluyor: `clientId` (çoğunluk), `tid` (AuditLogs, Memberships, Invitations, Notification*), `tenantId` (LogEvents). Ayrıca `ExportFlag.clientId` String | D | S | belge (+D12) | DB-14, §11 | Şimdi (belge) |
| DBR-13 | Kategori eşlemesinin iki kaynağı var: `AttributeMappings(isCategoryMapping)` asıl kaynak. Eski `Categories.platforms.<kod>` alanına yazan yok ama komisyon okuması hâlâ onu ve var olmayan `commission` alanını okuyor, bu yüzden hep `null` dönüyor | O | S | K(+G) | DB-06 | Şimdi |
| DBR-14 | Varyant başına kanal öznitelikleri Variants baytının %48'i. Trendyol girdilerinin %82'si kardeş varyantların birebir kopyası (~5,5 MB, koleksiyonun %35'i). `description` 2.930 varyanta kopyalanmış | O | S (projeksiyon) / L (taşıma) | K / G | DB-03, DB-17 | Şimdi (projeksiyon), Sonra (taşıma) |
| DBR-15 | Kanal kimliği anahtarı iki adla yazılıyor: Ideasoft `platforms.<kod>.mappings`, diğerleri `.mapping`. `erp[0]` sabit indeksi var | O | S | K(+G) | DB-06, DB-09, DB-16 | Şimdi (kod) |
| DBR-16 | ERP kataloğu (Bizimhesap) `ClientIntegrations` içinde: 58,6 KB'lık belgenin 55,6 KB'ı. Sıcak yollardaki `findOne()` her seferinde bunu ve tüm sırları okuyor | D | S | K | DB-03, DB-20 | Şimdi (projeksiyon) |
| DBR-17 | `DeadLetterQueue` 4.931 belge, TTL yok, 8 indeks (önek-örtüşen `clientId_1`) | D | S | E+C | DB-22 | Sonra |
| DBR-18 | Tickets tarihleri Number (D19), `messages[]` sınırsız (bugün en çok 3) | D | S | G | ADR-0021 D19 | Sonra |
| DBR-19 | `Products.images` gömülü, en çok 140 eleman (§8 kuralı ≤ 100). `Images` koleksiyonu tenant'ta boş | D | — | — | — | Belki hiç |
| DBR-20 | Eski 5 DB adı tenant izin kapısında (`tenantConnection.ts:55-61`). Yanlış `dbConfig` durumunda eski DB'ye PascalCase koleksiyon ve indeks yazılır | D | S | K | DB-25 | Sonra (D22 kararı) |
| DBR-21 | `allocations[]` budaması yok (D15). Yedekte hiç allocation yok | D | M | G | ADR-0021 D15 | Sonra (eşik) |
| DBR-22 | Customers'ta 14 indeks var, text indeksi hiç kullanılmıyor (`$text` grep 0). Arama çapasız regex ile yapılıyor | D | S | C | DB-24 | Sonra |
| DBR-23 | `CachedIntegrationDatas` kayıtlı, 0 belge, tüketici yok (D17) | D | S | C | ADR-0021 D17 | Sonra |
| DBR-24 | 38.668 müşterinin yalnız 25'i Order/Claim/Invoice/Message'dan referans alıyor. Köken belirsiz (müşteri sipariş yazımından önce kaydediliyor, olası yetim kaynağı) | O | S (inceleme) | — | DB-13 precheck | Şimdi (ölçüm) |

---

## 2. ADR-0021 D-listesi durumu (kod okumasıyla, 2026-09-30)

| D | Durum | Kanıt |
|---|---|---|
| D1 `dates.orderDate` | Yapıldı | `order-service.ts` filtre `dates.orderDate` |
| D2 `Notifications.mode` koşullu | Yapıldı | `client/models/Notification.ts:17-27` |
| D3 lease `null` dalı | Yapıldı | `utils/mongoLease.ts:41` |
| D4 `ImportJobs` ARCHIVED | Yapıldı (kod). D4b göçü bekliyor | `application/models/Import.ts:7,39` |
| D5 Ticket sayacı | Yapıldı | `admin-service.ts:224` |
| D6 `mongoose.model` kancaları | Yapıldı | Product/Image/Category/User/GlobalRole yorumları |
| D7 göç çerçevesi + manifest | Yapıldı | `migrations/`, `index-manifest.json`, 0000–0007 (0004 yok) |
| D8 `DB_AUTO_INDEX` | **Yapılmadı** | `database/**` içinde `DB_AUTO_INDEX` yok. Yalnız 8 yeni şemada `autoIndex:false` |
| D9 yeni indeksler | Göç yazıldı (0001/0002), canlıda uygulanmadı | yedekte `AuditLogs` yok, `Orders`'ta bileşik yok |
| D10 Clients/Users unique | Canlıda yok | yedek `Clients` ve `Users`: yalnız `_id_` |
| D11 merkezi Users | ADR-0028 Memberships ile yeniden çerçevelendi | tenant `Users` hâlâ `password` + `password2` taşıyor (2 belge) |
| D12 `ExportFlag.clientId` Number | **Yapılmadı** | `application/models/Export.ts:68-70` String. Yedekte 4 belge string |
| D13 dizi sınırları | **Yapılmadı** | `$slice` yalnız görsel projeksiyonunda var, `logs` push'larında yok |
| D14 StockMovements | Yapılmadı (Y-09 ile) | — |
| D16 drift temizliği | Yapılmadı | yedekte `Messages.externalMessageId_1[U]` |
| D17 emekli koleksiyonlar | Kısmen (Settlement silindi) | `CachedIntegrationDatas` kayıtlı |
| D18/D19/D20 | Yapılmadı | Products/Variants timestamps yok, Tickets Number |

---

## 3. Envanter

**Model sayısı:** ApplicationDB **39** model (`application/ApplicationMongooseSchemas.ts:37-89`), tenant DB **27** model (`client/ClientMongooseSchemas.ts:27-55`). Bunların 8'i `autoIndex:false` ile göçle yönetiliyor (AdminMfa, Invitations, Memberships, LogEvents, NotificationEvents/Deliveries/Preferences, IdempotencyKeys).

**Yedek ile kod karşılaştırması (canlı DB'ler):**
- `entegrasyonikDB`: yedekteki 15 koleksiyonun hepsinin modeli var, **yetim koleksiyon yok**. Kodda olup yedekte olmayan 24 koleksiyon var (AuditLogs, Plans, Subscriptions, BillingEvents, AccountTokens, Memberships, Invitations, AdminMfa, Notification* ×3, JobLeases, JobState, JobRuns, IntegrationFindings, MetricRollups, ErrorEvents, LogEvents, SourceSnapshots, IntegrationConfigRevisions/Heads, SchemaMigrations, IntegrationCallMetrics, QueueMetrics). Bunlar 09-26 sonrası eklendi ya da hiç yazılmadı. Beklenen bir durum.
- `entegrasyonikClient_1`: 26 koleksiyon, hepsinin modeli var. Tek eksik `IdempotencyKeys` (yeni, 0006 göçü).
- Eski 5 DB (`entegrasyonik`, `entegrasyonik_client`, `_2`, `_24`, `_25`): içeriğin tamamı yetim ve küçük harfli eski adlarla (`products`, `variants`, `platform_processes`, `staging_products`, `lgs`, `lgsBack`, `menus` …). Kodda referans yok. ADR-0021 D22 gereği dokunulmaz, akıbeti insan kararıdır.

**`entegrasyonik.menus` mi, `entegrasyonikDB.Menu` mu?** Kod yalnız **`entegrasyonikDB.Menu`** koleksiyonunu kullanıyor: `menu-service.ts:8` → `applicationDB.getMenuModel()` → model `menu` → `collection: 'Menu'` (`application/models/Menu.ts:32`), uygulama DB'si env `DB_NAME`. `menus` adı kodda hiç geçmiyor (grep 0). `entegrasyonik.menus` eski uygulama DB'sinin kalıntısı: 3.183 bayt, `Menu` ise 1 belge / 3.700 bayt, farklı sürüm. Silme ya da arşivleme kararı D22 kapsamında insana aittir. Önerilen varsayılan: arşiv yedeği doğrulandıktan sonra eski DB salt-okunur bırakılır.

**Adlandırma:** Koleksiyon adları canlı DB'lerde tutarlı (PascalCase, çoğul). §13'te donmuş istisnalar var: `ExportFlag`, `Menu`, `DeadLetterQueue`, `Statistics`, `JobState`, `AdminMfa`. Asıl tutarsızlık **tenant anahtarında** (DBR-12): `clientId` Number 12+ koleksiyonda, `tid` Number 6 koleksiyonda (AuditLogs, Memberships, Invitations, NotificationEvents, NotificationDeliveries, NotificationPreferences), `tenantId` Number 1 koleksiyonda (LogEvents), `clientId` String 2 koleksiyonda (ExportFlag, IntegrationCallMetrics). ADR-0028/0029 `tid`'i JWT claim'iyle eşleşsin diye bilinçli seçti. `DATA_MODEL_CONVENTIONS.md` §2 ise yeni `tid`/`tenantId`'yi yasaklıyor, yani belge ile karar çelişiyor. Öneri §11'de: yeniden adlandırma yapılmaz, kural güncellenir.

---

## 4. Şema bulguları

**DBR-08 Variants kayması (O, L).** `strict:false` (`client/models/Variant.ts:79`). Yedekte 3.143 belgenin **hepsinde** şemada olmayan alanlar var: `title`, `description`, `taxPercentage`, `onSale`, `uniqueId`, `choiceId`, `choiceValueId`, `choiceValueTitle`, `integrationCode`. X2 kodu ayrıca `stockDirtyAt` yazıyor (`operations/stock/markStockDirty.ts:14`). Tip karışıklığı: `choiceId`/`choiceValueId` ObjectId 3.133 / string 10, `createdAt`/`updatedAt` Date 3.133 / **string 10**. Products'ta 1 belgede `createdAt` string, `hasVariant` şemada yok. Risk: string tarihler tarih aralığı sorgularından sessizce düşer. `strict:true`'ya geçişte bu alanlar kaybolur (ADR-0021 D20 uyarısı). Öneri: D20 sırasıyla, önce alanlar şemaya beyan edilir. 10 string tarih tek göçle `Date`'e çevrilir (DB-16).

**DBR-09 VariantService ölü yolu (O, M).** Mevcut BACKLOG B-R-T1 #1 kaydı bu inceleme ile **kanıtlandı**. `variant-service.ts:119-150,168,299,380` `getProductModel()` üzerinden `variants.$[...]` / `$push:{variants}` yazıyor. `Product` şemasında `variants` yok (`client/models/Product.ts:28` yorum satırı). Yedekteki 360 üründe `variants` alanı **hiç yok**, yani ya bu yollar hiç çalışmadı ya da yazılanlar kayboldu. FE bu RPC'leri gerçekten çağırıyor: `ProductVariantsComponent.vue:1315,1330,1343` (`updateVariants`, `addVariant`, `addVariants`). Ayrıca 5 FE bileşeni `VariantService/getVariantsList` çağırıyor, backend'de bu adla metot yok (grep 0). Öneri (DB-07, K): yazmaları `Variants` koleksiyonuna yönlendir (ProductService'in varyant yazma yardımcısı) ya da RPC'yi kaldır. Önce mevcut `VariantService.characterization.test.ts` bilinçli ters çevrilir.

**DBR-12 tenant anahtarı**: §3 ve §11.

**DBR-10 entegrasyon durumu çoğaltması (O, M).** Son sipariş senkron zamanı üç yerde tutuluyor: `Clients.lastSuccessfulOrderSync` (üst düzey), `Clients.integrations[].lastSuccessfulOrderSync` (8 girdi, webhook akışı `WebhookApiManager.ts:98` okuyor) ve tenant `ClientIntegrations.<kat>[].syncMetadata.lastOrderSync`. Hangisinin doğru olduğu yazan koda göre değişir. `Clients.archive`/`image` (`StorageConfigSchema`) içinde `secretAccessKey` yedekte düz metin duruyor. ADR-0003 R2 kimliğini env'e taşıdığı için bu alan artık **ölü sır**. Öneri: B1 rotasyonundan sonra `$unset` (DB-26). Senkron imleci için tek kaynak ADR-0032'de tanımlandı (tenant `syncMetadata`; app tarafında yalnız webhook yönlendirme ve sağlık bilgisi).

**DBR-15 `mapping`/`mappings` (O).** Ideasoft `platforms.<kod>.mappings.productId` yazıp okuyor (`integration/modules/ecommerce/ideasoft/services/ProductService.ts:86,117,124,133,150,159`). Ortak yazıcı `platforms.<kod>.mapping` kullanıyor (`operations/integration/QueryBuilderOperations.ts:30,46`), HB/Trendyol/Pazarama da `.mapping` okuyor. Şema `platforms: Object` olduğu için bu fark hiç yakalanmıyor. Ayrıca Bizimhesap `erp[0]` sabitine bağlı (`bizimhesap/services/BrandService.ts:21`, `CategoryService.ts:48`): tenant ikinci bir ERP bağlarsa yanlış girdiyi okur.

**Sır kapsamı (DBR-11).** Kod tarafı hazır (FieldCrypto, göç betikleri). Yedekte `ClientIntegrations.settings` içindeki `APIKEY/APISECRET/key/secret` alanlarının hepsi düz metin (yalnız önek kontrol edildi). Bu durum ADR-0003 adım 7'nin (insan) bekleyen işidir. Ek not: `backup/` klasörü düz metin sır taşıyor, yedeklerin şifreli diskte tutulması gerekir.

---

## 5. İndeks bulguları

| ID | Sorgu (kaynak) | Bugün | Öneri |
|---|---|---|---|
| DBR-04 | `StockPublishTrigger.ts:108-111` `Variants.find({stockDirty:true}).limit(2000).lean()`, her 30 sn × tenant | İndeks yok (manifest ve yedek). Her turda 3.143 belge / 15,6 MB tam tarama, bulunanlar tam belge okunuyor | Kısmi indeks `{stockDirty:1}` `partialFilterExpression:{stockDirty:true}`, adı `stockDirty_true` (yalnız kirli belgeler, boyut ~0) + projeksiyon (DB-03/DB-11) |
| DBR-02 | `MetricRollup.ts:170-171` | Aynı anahtar, farklı `partialFilterExpression`, **isim verilmemiş**, ikisi de `bucketStart_1` olur. Mongo aynı adla ikinci tanımı reddeder (IndexOptionsConflict). autoIndex hatası Mongoose'da sessiz kalır | Adlar: `ttl_bucket_5m`, `ttl_bucket_1h`. Manifest + göç. Gerçek-Mongo testi (`zzTest_`) davranışı kanıtlamalı |
| DBR-03 | `operations/notifications/ledger.ts:24-40` (E11000 ile tekilleştirme) | `NOTIFICATION_EVENT_INDEXES`/`NOTIFICATION_DELIVERY_INDEXES` yalnız sabit olarak tanımlı (`schema.index` yok, `autoIndex:false`). Göç dosyası yok (0004 boşluğu). Manifest boş, statik test yakalamıyor | Göç (DB-10). `NOTIFY_V2_ENABLED=true` için ön koşul: göç `done`. Statik test `*_INDEXES` sabitlerini de manifeste katmalı (DB-05) |
| DBR-06 | `customer-service.ts:58-64`, `product-service.ts` (~121-125), message/user/shipment servisleri | `$sort` `$facet.data` içinde. Facet alt boru hatları indeks kullanamaz, her sayfada eşleşen tüm belgeler bellekte sıralanır. `paginate.ts:27` belgesi `itemsPipeline` içinde sıralamayı öneriyor | `$sort` `$facet`'ten önceye alınır (Orders/Claims/Invoices zaten böyle). `paginate.ts`'te `sort` ayrı parametre olur. Sıralama alanı izin listesi Customers (`:28`), Tickets (`ticket-service.ts:50-52`) ve ImportJobs (`integration-service.ts:~950`) için eklenir |
| DBR-07 | tüm `autoIndex` açık şemalar | Drift kanıtı yedekte: `Messages.externalMessageId_1[U]` (şema bileşik ister, farklı kanalda aynı kimlik sessizce kaybolur), `Invoices.orderId_1_type_1[U]`, `Orders.orderDate_1`. `Clients` ve `Users` üzerinde hiç unique yok | ADR-0021 D8 (env) + D10 + D16 partisi (DB-08, DB-15) |
| — | `CustomerRepository.ts:91` `phone: {$regex: '<son10>$'}` | Çapasız sonek regex'i önek kullanamaz, `phone_1` indeksinin tamamı taranır (38 bin anahtar), her sipariş kaydında | Bugün kabul edilebilir. Tetikleyici: Customers > 200 bin/tenant ya da `saveCustomer` p95 > 200 ms. O zaman `phoneNorm` (son 10 hane) alanı + indeks eklenir (DB-23) |
| DBR-22 | Customers text indeksi `firstName_text_…` | `$text` kullanılmıyor, her yazımda text indeks maliyeti ödeniyor | `$indexStats` ≥ 14 gün ölçülür, sonra D16 contract ile düşürülür (DB-24) |
| — | `InternalReconciliationJob.ts:56` `{'allocations.0':{$exists:true}}` | Tam tarama (günlük iş) | Bugün gerek yok. D15 eşiğiyle birlikte değerlendirilir |
| — | `WebhookApiManager.ts:77` `Clients {status, 'integrations.webhookToken'}` | İndeks yok. Clients 1 belge | Belki hiç (tenant < 500) |
| DBR-17 | DLQ `clientId_1` + `clientId_1_status_1` | Önek-örtüşen | D16 contract ile birlikte (DB-22) |

Unique gereksinimleri: sipariş `{integrationCode, externalOrderId}` ✓, iade, finans, kargo faturası ve mesaj bileşikleri ✓, Variants `barcode`/`stockcode` unique+sparse ✓. Tenant içinde barkod tekilliği var. Tek not: sparse unique `null` değeri **dışlamaz**, alanın hiç olmaması gerekir. Yedekte 3.143 varyantın hepsinde `barcode` string, ama boş string mükerrerliği ölçülmedi. Aşama 0 precheck'e eklenmeli. `Variant.variantHash` hem `unique:true` hem `index:true` (`Variant.ts:48-52`), bu §9'a aykırı ama tek indeks üretir, zararsız.

---

## 6. Çok kiracılık

- Tenant verisi tenant DB'de. Örneklenen tüm tenant servis sorguları `this.clientDB` üzerinden gidiyor. B-R-T2 karakterizasyonu da yeni sızıntı bulmamıştı.
- App DB'deki tenant kapsamlı sorgular `clientId` içeriyor: `ticket-service.ts:20,146,170`, `integration-service.ts:~948` (ImportJobs). `AuditLogs`, `Memberships` ve `Notification*` koleksiyonlarında `tid` ilk alan.
- Bu inceleme **yeni bir kiracılar arası sızıntı bulmadı.** Risk kaynakları sınırlı: (a) DBR-20 izin kapısında eski DB adları; (b) global tarama yapan kuyruk sorguları (Dispatcher, DLQ admin agregasyonu) §11 gereği işaretli olmalı, ayrıca doğrulanmadı.

---

## 7. Büyüme ve performans

| Koleksiyon | Bugün (yedek) | Büyüme sürücüsü | Saklama | Karar |
|---|---|---|---|---|
| `ExportStagedProducts` (tenant) | 97 belge / 2,1 MB. Eski `_25`: 7.802 belge / 54,8 MB | yayın × varyant × kanal; `logs[]` her adımda push | **Yok**. Arşiv yalnız `payload`'u siliyor (`ExportOrchestrator.ts:~290`) | DB-04 + DB-12 (TTL, insan kararı: arşivden 30 g sonra) |
| `DeadLetterQueue` (app) | 4.931 / 3,0 MB | sipariş hattı hataları | Yok | DB-22 (Sonra: > 50 bin belge ya da > 100 MB) |
| `Customers` (tenant) | 38.668 / 20,5 MB | sipariş/iade senkronu | süresiz | DB-01/DB-13 mükerrer temizliği |
| `Variants.allocations[]` | 0 | sipariş satırı | budama yok | D15 eşiği (> 1000 girdi ya da > 256 KB) |
| `Variants.platforms.*` | ortalama 2,8 KB, en çok 4,7 KB / varyant | kanal sayısı × öznitelik | — | ADR-0032 (§9) |
| `ClientIntegrations` | 1 belge / 58,6 KB | ERP kataloğu gömülü | — | DB-03 (projeksiyon), DB-20 (> 256 KB) |
| `NotificationEvents/Deliveries` | yok | olay | TTL tanımlı ama **kurulmuyor** | DB-10 |
| `MetricRollups` 1h | yok | 24 × metrik / gün | TTL biri kurulamıyor | DB-10 |

16 MB riski: en büyük belge 281 KB (ESP, `logs`). Bugün yakın değil, ama `logs` sınırsız olduğundan uzun süre `PENDING/FAILED`'da dönen bir kayıt büyümeye devam eder. `Orders.platformActions` en çok 1, `Tickets.messages` en çok 3.

Sayfalama: skip tabanlı, tavanlı (`PAGINATE_MAX_SKIP=100_000`). Keyset sayfalamaya bugün gerek yok (DBR-06 düzeltmesi yeterli). Tetikleyici: tek listede > 100 bin kayıt ve derin sayfa isteği.

---

## 8. Tutarlılık ve atomiklik (kısa kontrol)

- Stok ADR-0004: tek belge koşullu atomik + `allocations.key` idempotency ✓. X2 `stockDirty` outbox görevi görüyor ✓ (CROSS_CUTTING_GAP 7a/7b).
- Dış kimlikli iş verisi (Orders, Claims, Messages, FinancialTransactions, CargoInvoices) bileşik unique ile upsert ediliyor ✓.
- **Customers (DBR-01, Y):** `CustomerRepository.saveCustomer` (`integration/engine/order/CustomerRepository.ts:53-180`) önce `findOne($or)` sonra `create` yapıyor, bu yarışa açık. Kimlik anahtarı (vergi no, telefon, e-posta, dış kimlik, adres) yoksa `query = null` olur ve **her çağrıda yeni müşteri** oluşur. Yedekte 8.709 belge aynı ad+telefon hash'ine sahip, `externalIdentities` boş, telefonsuz. Yalnız 2'si referans alıyor. Boş dış kimliğe `AUTO_FIX_${Date.now()}` atanması (`:81-86`) sahte, tekil görünen kimlikler üretiyor, bu da tekilleştirmeyi kalıcı olarak bozuyor. Transaction ile çözülmez. Çözüm (DB-01, K): kimlik anahtarı yoksa müşteri **oluşturma**: siparişte ad-soyad anlık görüntüsü zaten var (`customerFirstName/LastName`), `customerId` boş kalır ya da kanal başına tek "anonim" kayıt kullanılır. `AUTO_FIX` kaldırılır. Dış kimlik varsa upsert koşulu `{externalIdentities: {$elemMatch: {integrationCode, externalCustomerId}}}` olur.
- **DBR-24:** 38.668 müşteriden yalnız 25'i herhangi bir iş belgesinden referans alıyor. Müşteri sipariş yazımından önce kaydedildiği için, sipariş yazımı başarısız olduğunda yetim müşteri kalıyor olabilir. Kök neden doğrulanamadı. DB-13 precheck'i yetim sayısını kanala göre raporlar.
- Bildirim tekilleştirmesi unique indekse dayanıyor (DBR-03). İndeks yokken iddia geçersiz.
- Ürün fiyat özeti (`updateProductPrices`) iki belgeli ve türetilmiş. Kabul edilebilir.
- Çok belgeli transaction'a (ADR-0030 X14) bugün **gerek yok**. Yukarıdaki üç kalem koşullu yazma, idempotent anahtar ve indeksle kapanıyor.

---

## 9. HEDEF MODEL — hantal yapılar ve entegrasyon eşleme (kullanıcı eki; karar ADR-0032)

### 9.1 Bugün eşleme verisi nerede, ne kadar

| Kavram | Bugünkü yer | Arama | Ölçüm (Client_1) | Sorun |
|---|---|---|---|---|
| Kategori ↔ kanal kategorisi | `AttributeMappings` (`isCategoryMapping:true`). Eski ve yazıcısı olmayan `Categories.platforms.<kod>` (33 kategorinin 25'inde) | `PlatformMappingProvider.ts:58-75` tüm listeyi (10 dk önbellek) bellekte `find` ile arar | 88 eşleme belgesi | İki kaynak var. Komisyon okuması (`:95-99`) eski alanı ve var olmayan `commission`'ı okuyor, hep `null` dönüyor (DBR-13) |
| Marka ↔ kanal markası | `Brands.platforms.<kod> = {id, title}` | ters arama bellekte (`:78-81`) | 16 marka | Bu ölçekte sorun yok |
| Öznitelik/değer ↔ kanal özniteliği | `AttributeMappings` (`values[]` en çok 55), ADR-0025 çözücü (`integration/catalog/attributeResolver.ts`) | önbellekli tam liste | 222 KB | İyi desen. P1 bulguları ATTRIBUTE_MAPPING_REVIEW'de |
| Varyant ↔ kanal ürünü + yayın durumu | `Variants.platforms.<kod>.{prices, upload.<MOD>.{status,messages,updatedAt,batchProcessId}, attributes, mapping\|mappings, stockSync}` | yazım filtresi `{barcode}` (unique, indeksli), `QueryBuilderOperations.ts:15-58` | 7,5 MB / 15,6 MB `attributes`. Trendyol girdilerinin %82'si kardeş kopyası | Şemasız (`Object`), anahtar adı tutarsız, ürün düzeyi veri varyant başına kopyalanmış, **kanal başına tek hesap** (anahtar = kanal kodu) |
| Ürün ↔ kanal ürünü | `Products.platforms.<kod>.mappings.productId` (yalnız Ideasoft) | `_id` | 360 ürünün hepsinde `platforms` boş (5 bayt) | Model var ama kullanılmıyor |
| Stok yayın durumu | `Variants.stockDirty/stockDirtyAt` + `platforms.<kod>.stockSync.{lastPublishedQty,lastPublishedAt,lastBatchId}` | `{stockDirty:true}` **indekssiz** | — | DBR-04 |
| Sipariş/iade/finans/mesaj ↔ kanal | kendi belgeleri, `{integrationCode, external…Id}` unique | indeksli | — | **Doğru desen**, değişmez |
| Müşteri ↔ kanal | `Customers.externalIdentities[]` | multikey indeks | 29.958 dış kimlik | DBR-01 |
| Kanal referans kataloğu | Trendyol kategori/öznitelik: API + Redis `@Cache` (global, 6 sa). Komisyon: `trendyol/commissions.json` (**2,9 MB**, pakete gömülü). Kargo: `shipment-providers.json`. `CachedIntegrationDatas` ölü | bellekte özyinelemeli | — | Güncellemek için dağıtım gerekiyor. Tek kaynak yok |
| Tenant'a özel ERP kataloğu | `ClientIntegrations.erp[0].settings.catalog` (36 kategori, 58 marka) | `findOne()` | 55,6 KB / 58,6 KB | Sırlarla aynı belgede, her okumada geliyor (DBR-16) |
| Entegrasyon hesabı/durumu | tenant `ClientIntegrations.<kat>[]` + app `Clients.integrations[]` | — | — | Çoğaltma (DBR-10) |

**Pahalı ya da kırılgan sorgular:** (1) `stockDirty` taraması (DBR-04). (2) Yayın ve stok işlerinde tam varyant belgesi okunuyor: belgenin yarısı başka kanalların öznitelikleri. (3) `StatsOperations.ts:72-76` kanal başına `platforms.<kod>.upload.*` üzerinde `$group` yapıyor. `isDirty` bayrağıyla seyrek çalışıyor, bugün kabul edilebilir. (4) Eşleme sağlayıcısı tüm listeleri `find({})` ile okuyor. 10 dk önbellekli olduğu için bugün sorun değil. Tetikleyici: > 10 bin eşleme/tenant.

### 9.2 Değerlendirilen hedefler (getiri ve maliyet)

| Seçenek | Getiri (somut) | Maliyet/risk | Hüküm |
|---|---|---|---|
| **H1 — Yerinde tipleme + küçük düzeltmeler** (ADR-0021 D20'nin Variants dilimi): `platforms: Map<ChannelState>` alt şeması, tek `mapping` anahtarı, `stockDirty` kısmi indeksi, sıcak okuma projeksiyonları, eski `Categories.platforms` okumasının kaldırılması | DBR-04 taraması biter. Yayın/stok okumaları ~%50 küçülür (projeksiyon). `mapping/mappings` hata sınıfı ve yazım hatalı alan kayması kapanır. Komisyon `null` hatası kapanır | K + küçük G. Adaptör dönüştürücüleri değişmez (aynı yol) | **Şimdi** |
| **H2 — `ChannelLinks` (tenant DB, varyant/ürün düzeyi)**: kanal durumunu varyanttan ayrı, kanal × hesap başına belgeye taşı | Kanal başına **birden çok hesap** mümkün olur (bugün yapısal olarak imkânsız). Dış kimlikle ters arama indeksli olur. "Kanal X'te hatalı ürünler" indeksli olur. Varyant belgesi kanal sayısıyla büyümez | Tüm adaptörlerin okuma yolu, Sentinel/Publisher/StockPublishTrigger birleştirmesi (ikinci sorgu), çift yazım göçü. **L**, orta risk | **Sonra** (tetikleyiciler §9.4) |
| **H3 — Ürün düzeyi kanal öznitelikleri**: varyantta yalnız varyant belirleyen (varianter/slicer) öznitelikler, geri kalanı `Products.platforms.<kod>.attributes` içinde | Variants ~%35 küçülür (5,5 MB/tenant). Tek ürün düzenlemesi N varyant yazımı yerine 1 yazım olur. Kardeş varyantlar arasındaki tutarsızlık hata sınıfı kapanır | FE öznitelik editörü (`ProductVariantAttributesComponent`, karakterizasyonu yok), 6 dönüştürücü, import. **L** | **Sonra**: FE editörü zaten yeniden yazılırken (ADR-0015 B / FE X-07) ya da eşik aşılınca |
| **H4 — `ChannelCatalogs` (app DB, paylaşılan kanal referans verisi)**: `{channel, kind, key, version, hash, data, fetchedAt}` | `commissions.json` dağıtımsız güncellenir. Eşleme ekranı API'ye bağlı olmadan arama yapar. ADR-0018 `SourceSnapshots` drift ile bağlanır | Yeni koleksiyon + yenileme işi. Redis önbelleği zaten var | **Sonra** (tetikleyici) |
| **H5 — Tüm varlıklar için genel `ChannelLinks`** (kategori, marka, sipariş, iade…) | Tek desen | Sipariş/iade zaten doğru anahtarlı. En sıcak yollara birleştirme ekler. Getirisi somut değil | **Belki hiç** |
| H6 — ERP kataloğunu ayrı tenant koleksiyonuna (`IntegrationCatalogs`) taşı | Sır belgesi küçülür, katalog bağımsız yenilenir | Küçük | **Sonra** (belge > 256 KB ya da katalog > 1000 girdi). Bugün projeksiyon yeterli |

### 9.3 Seçilen hedef (ADR-0032 özeti)

1. **Şimdi (H1):** Kanal durumu varyant belgesinde kalır, ama **tiplenir** (`ChannelState`: `externalIds {productId?, contentId?, listingId?}`, `prices`, `publish.<MOD> {status, at, messages ≤ 5, batchId}`, `attributes`, `stockSync`) ve tek anahtar adı kullanılır (`mapping`). Okuyucular göç bitene kadar iki biçimi de okur. Kategori eşlemesinin **tek kaynağı `AttributeMappings`** olur. `Categories.platforms` önce okunmaz hale gelir, sonra silinir. Sıcak okumalar projeksiyonlu yapılır.
2. **Hedef şema önceden onaylı, tetikleyiciyle açılır (H2):**
   ```
   ChannelLinks (tenant DB)
   { _id, entityType: 'variant'|'product', entityId: ObjectId, channel: String, accountId: String ('default'),
     externalId: String|null, externalParentId: String|null,
     publish: { <mode>: { status, at, batchId, messages[≤5] } },
     attributes: Map (yalnız varyant düzeyi), prices: {salePrice, marketPrice} | null,
     stockSync: { lastPublishedQty, lastPublishedAt, lastBatchId },
     syncVersion: Number, lastSyncAt: Date, error: {code, at} | null, createdAt, updatedAt }
   uniq_entity_channel   {entityType:1, entityId:1, channel:1, accountId:1}
   uniq_external         {channel:1, accountId:1, entityType:1, externalId:1}  partial: externalId string
   status_scan           {channel:1, accountId:1, 'publish.TRANSFER.status':1}  (yalnız "hatalılar" ekranı açılınca)
   ```
   Kirli stok bayrağı `Variants.stockDirty` üzerinde kalır: tek indeks, ADR-0004 Karar 1.
3. **Ürün düzeyi öznitelik (H3)** ve **kanal kataloğu (H4)** tetikleyicili. **Sipariş ve benzeri iş verisi mevcut `{integrationCode, external…Id}` deseninde kalır (H5 reddedildi).**

### 9.4 Sayısal tetikleyiciler (ADR-0032'de bağlayıcı)
- **H2 ChannelLinks:** (a) bir tenant aynı kanalda **ikinci hesap** isterse (ilk talepte), ya da (b) aktif kanal ≥ 5 **ve** varyant > 50 bin/tenant, ya da (c) varyant ortalama belge > 16 KB, ya da (d) kanal dış kimliğiyle sıcak yolda ters arama > 1/sn (ürün webhook'u).
- **H3:** Variants > 500 MB/tenant, ya da ortalama belge > 16 KB, ya da FE öznitelik editörünün yeniden yazımı başlarsa.
- **H4:** komisyon tablosu çeyrekte birden fazla dağıtım gerektirirse, ya da ikinci bir kanal komisyon/kategori tablosu isterse, ya da kategori öznitelik API çağrısı günde > 1000 olursa (oran sınırı).
- **H6:** `ClientIntegrations` belgesi > 256 KB ya da ERP katalog girdisi > 1000.
- **(e) H2 ve H3 için ortak nokta:** ilk ödeyen tenant canlı veriye geçmeden önce bu iki karar yeniden değerlendirilir. Bu noktadan sonra veri göçü maliyeti sıfırdan "backfill + çift yazma" düzeyine çıkar.

### 9.5 Geçiş planı (mock veri kararına göre sadeleştirildi)

**H1 (Şimdi): yeni yapı → kod geçişi → mock sıfırlama. Çift okuma yok.**
1. **Karakterizasyonla sabitlenecekler (önce).** Bunlar davranışı sabitler, veriyi değil: `QueryBuilderOperations.prepareVariantPlatformUpdateOp` ve `prepareStockSyncConfirmationOp` çıktıları, Ideasoft `updateVariantPlatformId`/`updateProductPlatformId` ve okuyucuları, `PlatformMappingProvider.getCategoryCommission` (bugün `null` döner), `StockPublishTrigger` seçim kümesi, `CustomerRepository.saveCustomer`.
2. **K:** Ideasoft yalnız `platforms.<kod>.mapping` okur ve yazar (tek commit, iki biçimi okuma yok). `getCategoryCommission` artık `Categories.platforms`'u okumaz. `ChannelState` alt şeması (DB-16 çekirdeği) de bu adımda eklenebilir, çünkü taşınacak gerçek veri yok.
3. **E (yedek + onay):** `stockDirty_true` kısmi indeksi (DB-11).
4. **Mock veri:** eski biçimli alanlar (`mappings`, `Categories.platforms`) göçle taşınmaz. Ya olduğu gibi bırakılır (artık kimse okumaz) ya da yerel yedekten seed yeniden içe aktarılır. Toplu `$unset` isteğe bağlıdır ve tek satırlık bir temizlik göçü olarak kalır.

**H2 (tetiklenirse), gerçek veri yokken:** `E` göçü (`ChannelLinks` + 2 unique indeks, `autoIndex:false`, manifest) → adaptörlerin kod geçişi (tek dalda) → mock verinin yeniden içe aktarımı (import/yayın akışı `ChannelLinks`'i doldurur) → `Variants.platforms.<kod>.{upload,mapping,stockSync}` yazımının kaldırılması. Çift yazma, backfill ve gölge okuma **gerekmez**.

**Gerçek veri varken H2 tetiklenirse (yeniden değerlendirilecek seçenek, bugün plan değil):** bayraklı dual-write (`CHANNEL_LINKS_WRITE=dual`) → idempotent backfill (unique anahtar + `lastId` imleci, `down` = `backfilledBy` etiketiyle `deleteMany`) → kanal kanal okuma geçişi (`CHANNEL_LINKS_READ`) ve gölge karşılaştırma → 1 sürüm + 7 gün sonra contract. Tek tenant ölçeğinde bakım penceresiyle kesin kesim de kabul edilir (adr-writing skill, dual-write varsayılan değildir).

Tüm şema ve indeks göçleri: CLAUDE.md kural 3 (Atlas + yerel doğrulanmış yedek), `dev-tools/migrate.js --backup-ref`, önce yerel yedek kopyada `plan/up/down/up` provası, canlıda Protokol 12.

**Mock dönemi bir fırsat penceresidir.** Yapısal değişikliklerin (H2/H3) veri göçü maliyeti bugün sıfırdır. Kod maliyeti (L) ise değişmez. Bu yüzden H2 ve H3 için ek bir yeniden değerlendirme noktası konur: **ilk ödeyen tenant canlı veriye geçmeden önce** (ADR-0032 tetikleyici e).

---

## 10. İş paketleri

Etiketler: **[KOD]** yalnız kod (DB'ye dokunmaz) · **[GÖÇ]** göç gerekir (yedek + onay; E = salt ekleme/geri alınabilir, G = veri değişir, C = geri dönüşsüz).

### Şimdi

| # | Paket | Etiket | Efor | Bağımlılık | Kapanan |
|---|---|---|---|---|---|
| DB-01 | `CustomerRepository`: kimlik anahtarı yoksa müşteri oluşturma yok (sipariş anlık görüntüsü yeterli). `AUTO_FIX_` kaldırılır. Dış kimlikte `$elemMatch` ile koşullu upsert. **Önce** karakterizasyon | [KOD] | M | — | DBR-01 (yeni mükerrer) |
| DB-02 | `$sort` `$facet`'ten önceye (customers/products/messages/users/shipments). `paginate.ts`'e ayrı `sort` parametresi. Customers/Tickets/ImportJobs için sıralama izin listesi | [KOD] | S | — | DBR-06 |
| DB-03 | Sıcak okuma projeksiyonları: `StockPublishTrigger` varyant okuması (`_id stock reserved barcode stockcode stockVersion stockDirtyAt platforms.<kod>.stockSync`), `ClientIntegrations.findOne` sıcak yollarda `-erp.settings.catalog` | [KOD] | S | — | DBR-04 (okuma), DBR-14/16 (okuma maliyeti) |
| DB-04 | ESP `logs` push'larına `$slice:-20` (`QueryBuilderOperations.ts:162`, `Dispatcher.ts:223`, `Sentinel.ts:105`), ADR-0021 D13 K bölümü | [KOD] | S | — | DBR-05 (yeni büyüme) |
| DB-05 | `MetricRollup` TTL indekslerine açık ad. Statik manifest testi `NOTIFICATION_*_INDEXES` sabitlerini de okur. Bildirim V2 bayrağı için başlangıç kontrolü (`SchemaMigrations` içinde ilgili göç `done` değilse uyarı ve kapalı kal) | [KOD] | S | — | DBR-02/03 (kod tarafı) |
| DB-06 | `getCategoryCommission` → `AttributeMappings` + kanal komisyon tablosu. `Categories.platforms` okuması kaldırılır. Bizimhesap `erp[0]` → kodla bul | [KOD] | S | karakterizasyon | DBR-13, DBR-15 (erp) |
| DB-07 | `VariantService` gömülü yazmaları → `Variants` koleksiyonu (ya da RPC kaldırma). `getVariantsList` (FE 5 çağrı) karşılığı | [KOD] (+FE) | M | B-R-T1 testleri | DBR-09 |
| DB-08 | ADR-0021 D8: `DB_AUTO_INDEX` (prod/staging `false`) + provizyonda `createIndexes` | [KOD] | S | — | DBR-07 (yeni drift) |
| DB-09 | Ideasoft yalnız `mapping` okur ve yazar (mock kararı: iki biçimi okuma ve rename göçü yok) | [KOD] | S | — | DBR-15 |
| DB-10 | App göçü `0008-notifications-metricrollups-indexes-app`: `NotificationEvents` (uniq_idem_key, tid/code, ttl_exp_at), `NotificationDeliveries` (4), `NotificationPreferences` (uniq {tid,userId}), `MetricRollups` doğru adlı iki TTL (varsa yanlış `bucketStart_1` düşürülür). up = adlı `createIndex` (varsa atla), down = `dropIndex` | [GÖÇ-E] | S | DB-05 | DBR-02, DBR-03 |
| DB-11 | Tenant göçü `0009-variants-stockdirty-partial-tenant`: `stockDirty_true` kısmi indeks. up/down adlı create/drop | [GÖÇ-E] | S | — | DBR-04 |
| DB-12 | ESP saklama: TTL `ttl_archived_at` `{archivedAt:1}`, `expireAfterSeconds` = **insan kararı** (öneri 30 g), `partialFilterExpression:{isArchived:true}`. up = adlı `createIndex`, down = `dropIndex`. Mevcut şişkin `logs` dizileri mock olduğu için kırpma göçü **yok**: kayıtlar TTL ile düşer ya da ESP mock sıfırlamasıyla temizlenir | [GÖÇ-E] | S | DB-04, insan (saklama) | DBR-05 |
| DB-13 | Customers mükerrerleri: mock veri olduğu için birleştirme ya da referans taşıma göçü **yok**. DB-01 sonrası tenant müşteri verisi seed'den yeniden içe aktarılır ya da kimliksiz ve referanssız kopyalar tek `deleteMany` ile silinir. Önce yalnız sayı raporlayan `plan` (grup sayısı, referans sayısı, kanala göre yetim dağılımı, DBR-24). Yedek + onay | [GÖÇ-G, basit] | S | DB-01 | DBR-01, DBR-24 |
| DB-14 | Belge: `DATA_MODEL_CONVENTIONS.md` §2 tenant anahtarı istisnası (§11 önerisi). ADR-0021 D12 (`ExportFlag.clientId` → Number) mock kararıyla sadeleşir: kod Number yazar ve okur (tip toleransı dönemi yok), mevcut 4 bayrak belgesi silinir ya da yeniden oluşur (bayraklar türetilmiş durumdur). `clientId_1` önek-örtüşen indeksi aynı göçte düşürülür | belge + [KOD] + [GÖÇ-E/C, küçük] | S | — | DBR-12 |
| DB-15 | ADR-0021'in bekleyen canlı partisi aynı sırayla: **D16 `Messages.externalMessageId_1` önce**, sonra D10, D9 (0001/0002) | [GÖÇ-E/C] | S | precheck | DBR-07 |

**Önerilen sıra:** kod paketleri paralel yürür (dosyalar ayrık): DB-01 ‖ DB-02 ‖ DB-03+DB-04 (aynı işçi dosyaları, tek builder) ‖ DB-05 ‖ DB-06+DB-09 ‖ DB-07 ‖ DB-08. Ardından **tek göç partisi** (tek yedek, tek onay; bu partide yalnız indeks ekleme/düşürme var): DB-11 → DB-10 → DB-15 (D16 → D10 → D9) → DB-12 → DB-14 (D12). En sonda isteğe bağlı mock sıfırlama (DB-13 + ESP). Veri silen tek adım bu sıfırlamadır. Geri dönüş yedekten tenant bazlı `mongorestore` ile yapılır.

**Mock kararının ADR-0021 listesine etkisi:** D4b, D11 (G), D12 (G), D13 (G kırpma), D18 (doldurma) ve D19 (G) veri adımları bugün göç olarak **yazılmaz**. Kod yeni biçimi yazar ve okur, eski mock belgeler gerekirse seed'den yeniden üretilir. Bu adımlar ancak canlı veri oluştuktan sonra yeniden açılır.

### Sonra (tetikleyici)

| # | Paket | Etiket | Tetikleyici |
|---|---|---|---|
| DB-16 | Variants `ChannelState` alt şeması + beyan edilmemiş 10 alanın beyanı + `strict:true` (D20 Variants dilimi). Mock verideki 10 string tarih ve `mappings` biçimi göçle düzeltilmez, seed yeniden içe aktarılır | [KOD] (+ mock sıfırlama) | F-09 adaptör sözleşmesi refaktörü başlarken ya da ikinci bir şemasız alan kaynaklı hata. Mock dönemi bittikten sonra yapılırsa D20'nin yaz-oku provası ve göç disiplini geri gelir |
| DB-17 | Ürün düzeyi kanal öznitelikleri (H3) | [KOD]+[GÖÇ-G] | §9.4 H3 |
| DB-18 | `ChannelLinks` (H2) | [KOD]+[GÖÇ-E/G/C] | §9.4 H2 |
| DB-19 | `ChannelCatalogs` (H4). `commissions.json` → app DB | [KOD]+[GÖÇ-E] | §9.4 H4 |
| DB-20 | ERP kataloğu → `IntegrationCatalogs` (tenant) | [KOD]+[GÖÇ-G] | §9.4 H6 |
| DB-21 | Senkron imleci tek kaynak (tenant `syncMetadata`). App'te yalnız webhook yönlendirme ve sağlık. `Clients.lastSuccessfulOrderSync` yazımı durur | [KOD] (+C) | webhook/sağlık modülüne sonraki dokunuş ya da tutarsızlık olayı |
| DB-22 | DLQ `purgeAt` TTL (çözülmüş +30 g) + `clientId_1` düşürme | [GÖÇ-E/C] | DLQ > 50 bin belge ya da > 100 MB |
| DB-23 | Customers `phoneNorm` + indeks | [KOD]+[GÖÇ-G] | > 200 bin müşteri/tenant ya da `saveCustomer` p95 > 200 ms |
| DB-24 | Customers text indeksi düşür (ya da `$text`'e geç) | [GÖÇ-C] | `$indexStats` ≥ 14 gün 0 kullanım |
| DB-25 | Eski DB adlarını tenant izin kapısından çıkar | [KOD] | D22 insan kararı |
| DB-26 | `Clients.archive/image.secretAccessKey` `$unset` | [GÖÇ-C] | ADR-0013 B1 rotasyonu tamamlanınca |

### Belki hiç
- Sipariş/iade/mesaj için genel `ChannelLinks` (H5). Bugünkü bileşik unique desen doğru.
- Marka/kategori eşlemesini ayrı koleksiyona taşımak. < 10 bin kayıtta bellek içi arama yeterli.
- Keyset sayfalama (skip tavanı 100 bin yeterli).
- Müşteri + sipariş için çok belgeli transaction ya da replica set (idempotent anahtarla çözülüyor).
- `tid`/`tenantId` → `clientId` yeniden adlandırması.
- `Products.images` → `Images` koleksiyonu.
- Decimal128 para tipi (ADR-0021 eşiği).

---

## 11. `DATA_MODEL_CONVENTIONS.md` için ek bölüm önerisi (dosya değiştirilmedi)

> **§2 ek — Tenant anahtarı adı (istisna listesi).** Değer her zaman `Clients.order` ile aynı `Number`'dır. Depolama adı: iş, kuyruk ve gözlem koleksiyonlarında `clientId`. Kimlik, yetki, denetim ve bildirim katmanında (JWT `tid` claim'iyle aynı ad) `tid`: `AuditLogs`, `Memberships`, `Invitations`, `NotificationEvents`, `NotificationDeliveries`, `NotificationPreferences`. `LogEvents.tenantId` donmuş istisnadır. Yeni koleksiyon bu iki addan katmanına uygun olanı seçer, üçüncü bir ad açılmaz. Hangi ad kullanılırsa kullanılsın tenant-kapsamlı indeksin ilk alanı odur.
>
> **§8 ek — Kanal eşleme verisi (ADR-0032).** (a) Dış sistemin kendi kaydı (sipariş, iade, finans, mesaj) → kendi koleksiyonu + `{integrationCode, external…Id}` unique. (b) Katalog varlığının kanal durumu → bugün `Variants.platforms.<kod>` (tipli `ChannelState`), tetikleyiciyle `ChannelLinks`. Yeni kanal alanı `platforms` altına şemasız eklenmez. Anahtar adları sabittir: `mapping`, `publish|upload`, `stockSync`, `attributes`. (c) Kategori/öznitelik eşlemesinin tek kaynağı `AttributeMappings`'tir. Varlık belgesine (`Categories`) kanal kategorisi yazılmaz. (d) Kanalın paylaşılan referans verisi (kategori ağacı, komisyon) tenant DB'ye kopyalanmaz. Tenant'a özel dış katalog sır belgesine (`ClientIntegrations.settings`) gömülmez (bugünkü Bizimhesap donmuş istisna, DB-20).
>
> **§9 ek — Sayfalama.** `$sort` her zaman `$facet`'ten önce yazılır (facet alt boru hatları indeks kullanamaz). Sıralama alanı istemciden geliyorsa izin listesiyle eşlenir.
>
> **§9 ek — Aynı anahtarlı çoklu indeks.** Aynı alan kümesinde birden fazla indeks (farklı `partialFilterExpression`, ör. çok politikalı TTL) yalnız **açık adla** tanımlanır. `autoIndex:false` şemaların indeks sabitleri (`*_INDEXES`) manifest testine dahildir.
>
> **§12 ek — Sıcak sorgu kataloğu.** `StockPublishTrigger Variants {stockDirty:true}` → `stockDirty_true` (kısmi) · `NotificationEvents {idemKey}` → `uniq_idem_key` · `NotificationDeliveries {status, nextAttemptAt}` → `status_1_nextAttemptAt_1`.

---

## 12. Açık insan kararları (varsayılanlı)
1. ESP arşiv saklama süresi (DB-12). Varsayılan önerisi: arşivlendikten 30 gün sonra sil.
2. Mock sıfırlamanın kapsamı (DB-13, ESP, ExportFlag). Varsayılan: yalnız Customers'taki kimliksiz ve referanssız kopyalar + ESP. Katalog verisi korunur.
3. Eski 5 DB'nin akıbeti (D22, DB-25). Varsayılan: arşiv yedeği doğrulanınca salt-okunur bırak.
4. Göç partisinin canlı penceresi (Protokol 12). DB-11/10/15/12/13 tek pencerede.

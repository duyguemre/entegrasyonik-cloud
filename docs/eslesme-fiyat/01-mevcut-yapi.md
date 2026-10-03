# 01 — Mevcut yapı ve sorun raporu (Bölüm 12, adım 3)

Tarih: 2026-10-03 · Dal: `feature/eslesme-fiyat-yeniden-yapilandirma` · Ortam: bulut kopyası (DB/Redis/.env/mockserver YOK; yalnız statik kod okuma + bellek-içi testler).
Kapsam: kategori/marka/özellik-değer eşleme, entegrasyon mapping'leri, ürün gönderim/çekim, fiyat yönetimi; sipariş/iade/fatura/finans/mesaj modülleri; kuyruk ve zamanlama; önyüz ekranları.

Bu belge **yürütücü özettir**. Her alanın dosya:satır kanıtlı tam raporu `01-ekler/` altındadır:

| Ek | İçerik |
|---|---|
| [A-eslesme-backend.md](01-ekler/A-eslesme-backend.md) | Eşleme veri modeli, RPC envanteri, platform × eşleme türü tablosu, ATTRIBUTE_MAPPING_REVIEW §4 durum tablosu, "uyan değer yok" backend kök neden adayları |
| [B-fiyat.md](01-ekler/B-fiyat.md) | Fiyat veri modeli, kural motoru, platform × fiyat alanı (gönderim/alım), önyüz veri akışı, PRC-* durumu |
| [C-frontend.md](01-ekler/C-frontend.md) | Ekran envanteri, "uyan değer yok" kök neden analizi (önyüz), gönderim/çekim takip mekanizması (korunacak), UX bulguları, tasarım kuralı ihlalleri |
| [D-kuyruk-zamanlama.md](01-ekler/D-kuyruk-zamanlama.md) | 19 zamanlanmış iş envanteri, sipariş hattı (BullMQ), katalog durum makinesi, rate limit, webhook, 100/1.000/10.000 tenant yük tahmini |
| [E-siparis-iade-fatura-finans-mesaj.md](01-ekler/E-siparis-iade-fatura-finans-mesaj.md) | Veri modelleri, platform × metot envanteri, alan alan eşleme eksikleri, durum değiştiren uçlar, mock/fikstür envanteri |

Önceki denetimlerle ilişki: `docs/audits/ATTRIBUTE_MAPPING_REVIEW_2026-09-30.md` §4'ün 6 maddesinin çoğu **yapılmış** (ADR-0025 sunucu tarafı çözümleyici dahil); yapılmayanlar Ek A §F'de. `BACKEND_INTEGRATION_AUDIT_2026-09-30` F-02 (HB/N11 sayfalama yok) **bayat**: sayfalama eklendi.

---

## 1. Doğrulama tabanı (bu ortamda)

| Kontrol | Sonuç |
|---|---|
| `backend` `tsc --noEmit` | temiz |
| `backend` tam jest (475 suite, 7.903 test) | **27 suite / 318 test kırık** — aşağıda sınıflandırıldı |
| `frontend`/`site` bağımlılık kurulumu | site tamam; `scripts/cloud-setup.sh` Playwright indirme adımında durdu (`cdn.playwright.dev` egress engelli; `/opt/pw-browsers` önceden kurulu, kullanılabilir); frontend `npm ci` ayrıca başlatıldı |

Kırık suite sınıflandırması:

| Sınıf | Suite | Neden | Aksiyon |
|---|---|---|---|
| Ortam (bu bulutta çalışamaz) | 20× `tests/mongo-semantics/**` | `mongodb-memory-server` ikilisini `fastdl.mongodb.org`'dan indiremiyor (egress 403); sistemde `mongod` yok, apt'te paket yok, `docker` ikilisi var ama daemon yok | **Yerel kontrol listesine**: `npm run test` yerelde (mongod kurulu) |
| Ortam | `unit/agent/chatFe4.transport.test.ts` | gerçek `/api/agent` sunucusu ister (port/ağ) | yerelde doğrula |
| main'de de kırık (devir notu) | `static/integrationPlaybook.static.test.ts` | ratchet: `P7_docs_registry *:registry-basligi-yok` — `INTEGRATIONS_REGISTRY.md` bulut kopyasında yok | yerelde yeşil olmalı; bulutta beklenen |
| main'de de kırık (devir notu) | `characterization/auth/operation-policy.test.ts` | FE envanteri: `IntegrationService/retrieveCategories` (yalnız `DsFeedback.vue` örnek metni), `SecurityService/authConfig`, `SecurityService/googleSignIn` kayıtta yok | Google ikilisi faz4 birleşiminden; operasyon kaydına eklenmeli (bu işin kapsamı dışında, PLAN'da "yan düzeltme") |
| Birleşim kalıntısı | `unit/migrateFaz4DbBatch.test.ts` | göç numarası benzersizliği: **iki `0020`** (`0020-push-subscriptions-app`, `0020-users-google-sub-app`) | yeniden numaralandırma (PLAN'da) |
| Birleşim kalıntısı | `unit/platform/errorCodes.docs.test.ts` | `docs/ERROR_CODES.md`'de `VIEW_LIMIT` satırı var, `codes.ts`'de yok (ya da tersi) | `UPDATE_ERROR_CODES=1` ile üret (PLAN'da) |
| Fikstür/kod sapması | `characterization/common/Hepsiburada.testConnection.test.ts` | mock 200 bekliyor, gerçek akış 403 → AUTH_FAILED (HB `User-Agent`/host düzeltmesi sonrası test güncellenmemiş olabilir) | incele (PLAN) |
| Snapshot | `characterization/orders/N11.internalOrderSnapshot…` | SOAP snapshot'ta adres alanı farkı (1 satır) | incele (PLAN) |

> Kırık testlerin **hiçbiri** eşleme/fiyat alanındaki iş mantığında değil; 20'si ortam, kalanı birleşim/ratchet kalıntısı.

---

## 2. Yürütücü özet — en kritik 12 bulgu

Sıra: kullanıcıya etkisi × kesinlik. Kanıt satırları eklerde.

| # | Alan | Bulgu | Etki | Ek |
|---|---|---|---|---|
| 1 | Eşleme/FE | **Kanal kategori kimliği ölü alandan okunuyor.** Ürün formu `category.platforms[kod]` bekliyor (`categoriesStore.ts:122`); ADR-0032'den beri tek kaynak `AttributeMappings`, bu alanın yazıcısı yok. Yeni arayüzle eşlenen kategoride kimlik `undefined`, "kategori eşlemesi eksik" uyarısı hiç tetiklenmiyor | **"Uyan değer yok"un ana nedeni #2**; "Seçenek eşlemesinden doldur" da eski `Choice.platforms`'ı okuyor | C §B |
| 2 | Eşleme/BE+FE | **Hepsiburada özellik değerleri formda hiç gelmiyor.** HB `CategoryTransformer` her özellikte `values: []` döner; değerler ayrı uçtan sayfalı gelir ama bunu tetikleyecek `lazyValues` bayrağını backend set etmiyor; form `channelAttributes.ts:127`'de yüklemeden çıkıyor. Eşleme ekranı aynı değeri çekebildiği için orada dolu, formda boş | **"Uyan değer yok"un ana nedeni #1 (HB'de)** | A §D, C §B |
| 3 | Eşleme/BE | **autoMatch boş `values: []` ile özellik eşi yazıp kalıcılaştırıyor** (`autoMatch.ts:179-198`, "gömülü değil → atla" dalı erişilemez; `$setOnInsert` + `existingAttrKeys` bir daha dokunmaz) | Trendyol V2/HB/N11'de özellik "eşli" görünür, değer eşi yok → form/gönderim boş | A §E-3 |
| 4 | Eşleme/BE | **Hepsiburada export eşlemeyi hiç kullanmıyor**: kategori/marka `variant.platforms.hepsiburada.mapping.*`'dan (yalnız HB'den import edilen varyantta dolu); yerelde oluşturulan ürün `categoryId: NaN`, `Marka: "undefined"` gider; `catAttrs=[]` → zorunlu özellik denetimi yok | HB'ye yerel ürün gönderimi kırık | A §E-1 |
| 5 | Eşleme/BE | **N11 export/import eşlemesiz ve iskelet**: kategori kimliği olarak YEREL kategori id'si gidiyor; ürün gövdesinde marka/özellik/`shipmentTemplate`/`vatRate` yok (N11 dokümanı bunları zorunlu sayar, bkz. 02); `convertToInternalModel` boş | N11 ürün gönderimi/çekimi fiilen çalışmıyor | A §E-2, 02-n11 |
| 6 | Hata/UX | **Yapılandırılmış hata yok.** Eşleme eksikliği yayın anında `throw new Error("Eşleşme bulunamadı.")` (kategori mi marka mı belli değil); `validate()` 5 adaptörde her zaman `true`; export hataları düz metin + `errorType`; FE ham `log.message` gösterir, "DESTEK AL" düğmesinin `@click`'i yok; gönderim öncesi ön kontrol (preflight) yok | Bölüm 3/9'un çekirdek sorunu: kullanıcı neyin eksik olduğunu göremiyor | A §E-5/6, C §D |
| 7 | Fiyat | **"Kanala giden fiyat" üç farklı kuralla belirleniyor**: adaptör/Validator → kanal nesnesi varsa onu alır (`isPlatformBasedPrice` yok sayılır); kural/kâr/buybox → bayrağa bakar; UI → "özel = nesne var". Import her varyanta bayrak=false + kanal nesnesi yazar → kullanıcı ortak fiyatı değiştirince kanala **eski import fiyatı** gider, ekranda yeni fiyat görünür | Yanlış fiyat gönderimi riski (gerçek veri oranı DOĞRULANAMADI) | B §F-P1-1 |
| 8 | Fiyat | **Fiyat değişikliği kanala otomatik gitmiyor; "bekleyen fiyat" izi yok** (`stockDirty` var, `priceDirty` yok); manuel/toplu/import fiyat değişimleri `PriceHistory`'ye yazılmıyor (yalnız Trendyol öneri/dış gözlem); fiyat girdisinde sunucu doğrulaması yok (NaN/negatif yazılabilir); KDV 0 Trendyol'da %0 giderken HB/Pazarama'da 20'ye düşüyor | Senkron yönü ve geçmiş eksik; hukuki indirim kanıtı (K8/K10) manuel düşüşleri görmez | B §F-P1-2..5 |
| 9 | Fiyat (ürün kararı) | **Kanal fiyat kuralı (komisyon/marj/yuvarlama/KDV ile hesaplanan fiyat) yok**; yalnız Trendyol buybox-rekabet kuralı var (onaylı). BACKLOG'da `B-10` tanımı bulunamadı | Bölüm 10 "kanal bazlı fiyat kuralları" beklentisi için kapsam kararı gerekir | B §F-P1-6 |
| 10 | Modüller | **N11 iade senkronu ham SOAP döndürüyor (mapper yok)**; `OrderWorker` `claimPkg.customer/claim` bekler → TypeError, iş FAIL, sipariş imleci ilerlemez (N11'de açık iade varken) | N11 sipariş çekimi bloke olabilir | E §F-P0-1 |
| 11 | Modüller | **Kargo bildirimi**: Trendyol'da her sipariş `MARKETPLACE` lojistik sayılıp hiç gönderilmeden `success:true` dönüyor; HB/N11/Pazarama'ya `lineItems`/`orderItemId` gitmiyor (boş paket, yanlış kimlik); Pazarama ret/iptalde `ProductId` gönderiliyor (`OrderItemId` bekleniyor) → oversell telafisi bu kanalda yanlış | Sahte başarı + yazma yolu hatalı (canlı doğrulanamaz, mock'la test edilmeli) | E §F-P0-2..4 |
| 12 | Kuyruk | **Tek BullMQ kuyruğu, 5 concurrency/pod, 60 sn pencereli jobId**; bekleyen iş varken yenisi ekleniyor; rate limit/breaker tenant×pod başına süreç içi (pazaryeri geneli sınır yok); üretici lease'siz her pod'da; **jitter yok**; Seviye-2 eşiği (ADR-0005, 500 iş/dk) ≈167 tenant'ta aşılıyor | 1.000 tenant'ta 6×, 10.000'de 60× kapasite aşımı; aynı anda tetiklenme | D §F-01..03, §E |

---

## 3. Alan özetleri

### 3.1 Eşleme (kategori / marka / özellik-değer) — Ek A, C
- **Model:** üç eşleme türü tek `AttributeMappings` koleksiyonunda bayrakla (`isCategoryMapping`); benzersiz anahtar `(localCategoryId, integrationCode, platformAttributeId)` — `platformCategoryId` anahtarda yok. Marka eşi ayrı: `Brands.platforms[kod].id` (serbest nesne, doğrulamasız). `Brands/Categories/Choices` üzerinde indeks/benzersizlik yok. Eşleme yazımlarında kim/ne zaman yok (yalnız `updatedAt`).
- **Platform × tür (Ek A §D):** marka eşi kimlikle yalnız **Trendyol, Pazarama, Ideasoft**'ta anlamlı. HB ve N11'de platform marka listesi yok (`[]`); N11'de marka aslında zorunlu bir *özellik* (`attributeId:1 "Marka"`, kimlikli veya `customValue`). HB'de değer kimliği = metin. Ideasoft/Bizimhesap `fetchCategoryAttributeValues` daima `[]`.
- **Akış:** import'ta Stager kategori eşi + varyant özellik eşi denetler, eksikse ürün INVALID'de bekler (rapor eksikleri listeler — bu iyi); marka eşi denetlenmez (HB ürünleri `brand:null, category:null` açılır). Export'ta ADR-0025 çözümleyici `variant.choices → platforms[kod].attributes`'ı staging'de doldurur (DB'ye yazmaz), zorunlu özellik denetimi yalnız Trendyol+Pazarama.
- **Yeniden eşleme/bayatlık:** platform listeleri 6 sa global cache; eşleme cache 10 dk pod-yerel; kategori yeniden eşlenince özellik eşleri varsayılan silinir (FE onay diyaloğu DOĞRULANAMADI); platform tarafı silinen değer/özellik için tarama yok.
- **Önyüz:** kategori eşleme ekranı + kanal satırı + kapsama panosu çalışıyor; "Tam eşli" yalnız kategori eşine bakıyor (özellik/değer saymıyor). Marka eşleme desteklemeyen kanal gizlenmiyor, "sunmuyor" çipiyle işaretleniyor. Özellik/değer eşleme diyaloğunda "otomatik eşleştir" birebir başlık. Değer araması `startsWith` ("mavi" → "Koyu Mavi" bulamaz).

### 3.2 Fiyat — Ek B
- **Model:** `Variants.prices{isPlatformBasedPrice, salePrice, marketPrice}` (KDV dahil TL, Number/float) + `Variants.platforms[kod].prices{salePrice, marketPrice}` (şemasız Mixed) + `costPrice` (KDV hariç) + `Products.taxPercentage` (default 0 = hem "%0" hem "ayarsız"). Para birimi alanı yok. Kural motoru kuruş-tamsayı ile hesaplar, saklama float.
- **Gönderim:** hiçbir adaptörde kural/komisyon/marj uygulanmaz; ham fiyat gider. Trendyol sale+list; HB yalnız `price`; N11 sale=list (yuvarlama yok); Pazarama stok yayınında da fiyat taşır; Ideasoft create'te `product.minPrice` gider.
- **Alım:** yalnız yeni barkodda (ilk import) yazılır; mevcut yerel fiyat ezilmez; çakışma politikası tanımsız (fiilen yerel kazanır).
- **Kural motoru:** yalnız `competition` tipi, yalnız Trendyol, insan onaylı (`NO_PUBLISH`), K1-K20 koruması var; **güçlü taraf**. Göçler 0021/0022 çalıştırılmamış; sorumluluk metni taslak.
- **Önyüz:** kanal başına etkin fiyat/indirim/uyarı gösterimi (`PlatformPriceComponent`, `channelPriceModel`) var ve korunmalı; "bu fiyat neden böyle" yalnız rekabet önerisinde.

### 3.3 Ürün gönderim/çekim takibi — Ek C §C (KORUNACAK)
- İşlem kayıtları ekranı iki sekme (gönderim/çekim), detay raporları `setTimeout` yoklaması (`ui.reportPollMs`, 3–60 sn), SSE yok; çekim raporunda eksik kategori/özellik rapor içinden eşlenebiliyor (iyi desen). Ürün listesinde kanal durumu hücresi. Eksikler: ham hata metni, yeniden gönder akışı yok, listeler otomatik yenilenmiyor, rozetlerde `PlatformImageComponent` (kural: `EkChannelBadge/EkPlatformMark`).

### 3.4 Sipariş / iade / fatura / finans / mesaj — Ek E
- **İdempotency:** sipariş/iade/mesaj/finansta `(integrationCode, externalId)` unique var. **Fatura istisna** (yalnız `ettn` unique; upsert filtresi için indeks yok). Finansta `externalId` türetimi kırık (N11 `settlementDate||Date.now()`, HB `String(id||'')`).
- **Alan kaybı:** ham yanıt `meta`'ya yazılır (kayıp yok) — **istisna** Trendyol iade/finans (`meta` alt küme) ve N11 iade/mesaj/finans. Normalize edilmeyen önemli alanlar: Trendyol `paymentMethod`, `commercial`, `createdBy/originPackageIds` (bölünmüş paket ilişkisi), `packageHistories` (tarihler platform zamanından değil tespit anından), `invoiceNumber/invoiceStatus`, `taxAmount/cargoAmount` (daima 0), satır komisyonu; HB/N11/Pazarama'da `totalDiscount/totalTax/shippingFee` sabit 0.
- **Sözleşme/kod sapmaları:** Ideasoft/Bizimhesap desteklenmeyen metotlarda `NOT_SUPPORTED` fırlatmıyor (sessiz `[]/false`; INTEGRATION_CATEGORY_MODEL'e aykırı); Pazarama `sendToReview/sendRevision` yazılmış ama `IPlatform`'a bağlanmamış; Order `history` şemada yok (strict → `$push` düşer, denetim izi kaybı); mesaj enum'unda `WAITING_APPROVAL` yok ama yazılıyor.
- **Fatura:** yalnız manuel giriş + pazaryerine link bildirimi; e-fatura sağlayıcı yok; pazaryerinden fatura okuma yok.
- **Durum değiştiren "okuma" uçları:** kodda bulunmadı; LIVE_READONLY politikası ile adaptör kodu tutarlı. Not: HB `approveOrder` paket **oluşturur** (yazma), Pazarama/N11 okuma POST'ları allowlist'te.

### 3.5 Kuyruk ve zamanlama — Ek D
- 19 zamanlanmış iş (`bootstrap/schedules.ts`), Mongo lease (tek pod tüm tenant döngüsünü yürütür, tenant sharding yok, jitter yok). Sipariş hattı: tek `order-sync-queue`, üretici her pod'da 60 sn `setInterval` (lease'siz). Aralıklar: **sipariş 60 sn** (Trendyol webhook sağlıklıysa 5 dk), **iade 15 dk**, **mesaj 5 dk**, **finans 6 sa**; iade/finans için günde bir tam pencere süpürmesi. Kaynak başına ayrı imleç `Clients.integrations[]` içinde, yalnız başarıda ilerler — **doğru kurulmuş, korunacak**.
- Webhook yalnız Trendyol (token + opsiyonel API_KEY/BASIC; gövde okunmaz, `order-sync` tetikler). Manuel "şimdi senkronize et" sipariş/iade/mesaj/finans için yok. Son senkron yalnız `lastSuccessfulOrderSync` (tek tarih, kartta "Son senkron" diye gösteriliyor); ürün/iade/finans/mesaj için yok.
- Rate limit: `ResilientHttpClient` süreç-içi, tenant×entegrasyon×pod; `descriptor.rateLimits.configured` ile tutarlı; Retry-After yalnız ≤60 sn.
- Yük (3 entegrasyon/tenant varsayımı): 100 tenant ≈ 381 çağrı/dk, 1.000 ≈ 3.808, 10.000 ≈ 38.083 (ayrıntı Ek D §E).

---

## 4. "Uyan değer yok" — kök neden zinciri (Bölüm 3)

Metin sabit Türkçe (`AttrValueField.vue:24`, i18n anahtarı yok); değer listesi boş + yükleme bitmiş ise gösterilir. Aynı metin **dört farklı nedeni** gizliyor:

1. **HB'de değer listesi hiç yüklenmiyor** (backend `values: []` + `lazyValues` bayrağı yok + FE yüklemeden çıkıyor). Kesin, kod kanıtlı.
2. **Kanal kategori kimliği ölü `category.platforms[kod]` alanından okunuyor** → kategori eşlemesi yapılmış olsa da form "eşlenmemiş" gibi davranıyor, ama uyarı da tetiklenmiyor. Kesin, kod kanıtlı. (Canlı veride eski belgelerde `platforms` kalıp kalmadığı DOĞRULANAMADI.)
3. **autoMatch'in boş `values: []` eşleri** (Trendyol V2 gömülü değer yoksa, HB, N11). Kesin, kod kanıtlı; etkilenen satır oranı DB olmadan DOĞRULANAMADI.
4. **Arama `startsWith`**, hata/boş yanıt yutuluyor, sunucu tarafı çözümleme (ADR-0025) forma yansımıyor ("Eksik zorunlu" sayacı kırmızı kalıyor).

Doğrulamak için yerelde en kısa yol: ilgili `AttributeMappings` satırının `values.length` değeri + ilgili `Categories` belgesinde `platforms` alanı var mı.

---

## 5. Karar gerektiren konular (PLAN.md'de seçenekli sunulur)

| Konu | Neden karar gerekir |
|---|---|
| K-A Kanal fiyat kuralı (`channel` tipi: komisyon+marj+yuvarlama+KDV → kanal fiyatı) | Bugün yok; Bölüm 10 bekliyor; hukuki çerçeve (AUTO_PRICING_LEGAL) ile ilişkisi: *maliyet bazlı* kural rakip fiyatına bakmaz, K1-K20'nin çoğu uygulanmaz ama K7 taban/tavan uygulanır |
| K-B Fiyat senkron yönü ve çakışma | Yerel→kanal otomatik mi (`priceDirty`), kanal→yerel asla mı, "dış değişiklik" uyarı mı |
| K-C Marka eşleme modeli | HB/N11'de platform marka listesi yok; N11'de marka = zorunlu özellik → "marka eşleme ekranı" bu kanallarda gizlenir, N11 için "Marka özelliği eşlemesi" özellik ekranında |
| K-D Trendyol kargo modeli | Her siparişi "pazaryeri lojistiği" sayma varsayımı; satıcı kendi kargosuyla gönderiyorsa bildirim gerekir |
| K-E Entegrasyon başına kuyruk / tenant sharding | ADR-0005 Seviye-1 adımı; eşik ≈167 tenant |
| K-F Order `history` şeması ve tipli `platformData` | Denetim izi + normalize edilmeyen alanlar |
| K-G İade/iptal sebep kataloğu sözleşmesi | Tek RPC iki kataloğu karıştırıyor; Trendyol oversell otomatik iptali bu yüzden çalışmıyor |

---

## 6. Bu ortamda yapılamayanlar (yerel kontrol listesine aktarılacak)
- `tests/mongo-semantics/**` ve göç testleri (mongod yok, egress engelli).
- Canlı okuma testleri (pazaryeri anahtarı yok).
- `INTEGRATIONS_REGISTRY.md` ratchet'i (dosya bulut kopyasında yok).
- Playwright yeni tarayıcı indirimi (mevcut `/opt/pw-browsers` kullanılır).
- Egress politikası pazaryeri alanlarının çoğunu (`*.n11.com`, `developers.hepsiburada.com` vb.) engelliyor → 02 raporunda kaynak kısıtları ayrıca listelenir.

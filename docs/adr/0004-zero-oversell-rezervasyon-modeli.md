# 0004 — Zero-oversell: rezervasyon, çakışma ve stok yayını modeli

## Durum
Kabul edildi (2026-09-26). Uygulama: Faz 2 (BACKLOG C8). Ön koşullar: C3 (cache sızıntısı) ve C7 (sipariş sync bütünlüğü) kapatılmış olmalı; yanlış tenant'a/eksik gelen sipariş üzerine stok rezervasyonu kurulamaz.

## Bağlam
- `INTEGRATION_ENGINE_STANDARDS.md#3-zero-oversell-matris-1--yok`: siparişten stok düşme hattı yok (`OrderOrchestrator.triggerDownstreamWorkflows` boş, `PostOrderOperations` boş sınıf). Stok üzerinde `$inc`/optimistic lock yok; `product-service.updateProductStockAndPrices` read-then-write; `variant-service` mutlak değer atıyor. Stok pazaryerine yalnızca kullanıcı "gönder" dediğinde gidiyor; Validator gönderim anında `Variant.stock` değerini mutlak yazıyor. Telafi akışı yok.
- Var olan iyi parça: sipariş alımı idempotent (`Orders` üzerinde `{integrationCode, externalOrderId}` unique + upsert). Sipariş satırında `externalLineItemId`, `internalVariantId`, `sku`, `barcode`, `quantity`, `itemStatus` alanları mevcut; `Orders.flags.isAllocated` tanımlı ama hiç kullanılmıyor.
- Stok şu an `Variants.stock` (tenant ClientDB) ve türetilmiş `Products.stock` alanlarında.
- `docs/research/1f-findings.md`: kendi DB tek doğruluk kaynağı + kanala "stok − rezerve − buffer" yayını; Mongo'da koşullu atomik düşüm yeterli; olaylar at-least-once ve sırasız. Trendyol: stok/fiyat isteği ≤1000 SKU, asenkron (`batchRequestId`), **aynı gövde 15 dk içinde tekrar gönderilirse hata**, stok üst sınırı 20.000, Inventory&Price yazma limiti paket bazlı (≥350 istek/dk). N11 ≤1000 SKU/istek, taskId ile sonuç. Hepsiburada ≤4000 SKU/istek, ≤5 eşzamanlı bekleyen POST (kısmen doğrulanamadı). Pazarama batch limiti BİLİNMİYOR.
- Temel gerçek: birden fazla pazaryerinin her biri kendi stok sayısını tutar; siparişi görme (polling) + yeni stoku yayma arasında her zaman bir pencere vardır. Bu yüzden "zero-oversell" = (1) içeride hiçbir koşulda eksi/çift rezervasyon yok, (2) dışarıdaki pencere küçük ve son adetler tampona alınmış, (3) yine de oluşan oversell tespit edilip test edilmiş telafi akışıyla kapatılır.

## Değerlendirilen Alternatifler

**A. Doğruluk kaynağı**
1. *Kendi DB (tenant ClientDB `Variants`)* — artı: tek yerde, tüm kanallardan bağımsız, zaten stok burada. Eksi: ERP stok ana kaynağı olursa çakışır (aşağıda kapsam dışı notu).
2. *Her kanalın kendi stoku, periyodik birleştirme* — artı: kod az. Eksi: oversell'i önlemez; reddedildi.
3. *ERP (BizimHesap) ana kaynak* — ERP entegrasyonu bugün yalnızca okuma; reddedildi (ileride tenant bazlı seçenek).

**B. Eşzamanlılık kontrolü**
1. *Koşullu atomik `findOneAndUpdate` + `$inc` (tek doküman)* — artı: Mongo tek-doküman atomikliği; retry döngüsü yok; replica set/transaction gerektirmez (local Mongo standalone olsa da çalışır). Eksi: çok dokümanlı işlemler atomik değil → her satır bağımsız ele alınmalı.
2. *Optimistic lock (sürüm alanı, oku-hesapla-koşullu yaz, çakışmada tekrar)* — artı: karmaşık hesaplarda esnek. Eksi: sıcak SKU'da tekrar döngüsü; her yazma yolu sürüm disiplinine uymak zorunda.
3. *Multi-document transaction (ayrı rezervasyon koleksiyonu + varyant)* — artı: normalize model. Eksi: replica set zorunlu (local test ortamı standalone olabilir), daha fazla kod ve hata yolu; bu ölçekte gereksiz.
4. *Redis'te stok sayacı (DECRBY + Lua)* — artı: hızlı. Eksi: ikinci doğruluk kaynağı, Redis kalıcılığına bağımlılık; reddedildi.

**C. Idempotency ve sırasız olaylar**
1. *Kenar tetiklemeli (her olayı bir hareket olarak uygula)* — sırasız/tekrarlı olaylarda çift düşüm riski.
2. *Seviye tetiklemeli (siparişin bilinen son durumundan "istenen tahsis durumu"nu türet, idempotent geçişle uygula)* — polling zaten "son durumu" verir; tekrar ve sırasızlık doğal olarak emilir.

**D. Telafi**
1. *Yalnızca bildirim, iptal manuel* — satıcı kontrolde; ama geç kargo cezası riski.
2. *Anında otomatik iptal* — hızlı; ama stok birkaç dakika içinde tamamlanabilecekken gereksiz iptal (satıcı puanı).
3. *Bekleme penceresi + otomatik iptal (varsayılan açık, tenant kapatabilir)* — ikisinin dengesi.

## Karar
Stokun tek doğruluk kaynağı tenant ClientDB `Variants` dokümanıdır; rezervasyon, tahsis ve iptal **tek doküman üzerinde koşullu atomik `findOneAndUpdate`/`$inc`** ile, sipariş satırı anahtarıyla idempotent ve seviye tetiklemeli olarak uygulanır; kanallara `available − kanal tamponu` değeri yalnızca değiştiğinde (delta) mevcut export hattı (UPDATE_STOCK) üzerinden otomatik yayınlanır; oversell 30 dk bekleme sonrası otomatik iptal + tenant bildirimiyle telafi edilir.

Ayrıntılar (uygulayıcı için bağlayıcı):

1. **Şema notu (tenant ClientDB, `Variants`; `strict:false` olduğundan migration ekleme niteliğinde):**
   - `stock: Number` — anlamı "eldeki fiziksel stok" olarak sabitlenir (rezerve edilenler dahil). Kullanıcının manuel "stok = X" işlemi bu alanı set eder; `reserved`'a dokunmaz.
   - `reserved: Number` (varsayılan 0) — sevk edilmemiş aktif rezervasyon toplamı. `available = stock − reserved` (türetilir, saklanmaz).
   - `allocations: [{ key, qty, state, at }]` — `key = "<integrationCode>:<externalOrderId>:<externalLineItemId>"`; `state ∈ RESERVED | COMMITTED | RELEASED | OVERSOLD | RESTOCKED`. Idempotency ve sıra koruması bu dizide, aynı dokümanda tutulur.
   - `stockVersion: Number` — her stok etkileyen işlemde `$inc:1`; yalnızca onarım (mutabakat) yolunda optimistic guard olarak kullanılır.
   - `platforms.<code>.stockSync: { lastPublishedQty, lastPublishedAt, lastBatchId, dirty }` — delta tespiti ve Trendyol 15 dk kuralı için.
   - `Orders.items[].allocationState` — yalnızca UI/rapor için ayna; doğruluk kaynağı DEĞİL. `Orders.flags.isAllocated` bu aynadan türetilir.
   - İndeks: `Variants` üzerinde `{ 'allocations.key': 1 }` (multikey), `{ 'platforms.<code>.stockSync.dirty': 1 }` yerine tek bir `{ stockDirty: 1 }` bayrağı önerilir (kanal sayısı kadar indeks açmamak için).
   - `ClientIntegrations.<tür>[].settings.stockPolicy: { bufferUnits, bufferPercent, autoCancelOversold, graceMinutes }` ve tenant düzeyi `stockPolicy.primaryChannel`.
   - `Products.stock` türetilmiş özet olarak kalır, doğruluk kaynağı değildir; read-then-write yerine varyant değişiminden sonra aggregate ile yeniden hesaplanır (yarış kaybı yalnızca gösterimi etkiler).
   - Migration: yeni alanlar `reserved=0`, `allocations=[]` ile başlar; **geçiş tarihinden önceki açık siparişler rezervasyona alınmaz** (satıcının stoku bu siparişleri zaten elle düşürdüğü varsayılır; migration notunda ve tenant duyurusunda yazılır).

2. **Geçişler (hepsi tek doküman, tek atomik işlem):**
   - Rezerve: filtre `{_id, 'allocations.key': {$ne: key}, $expr: {$gte: [{$subtract: ['$stock','$reserved']}, qty]}}` → `$inc {reserved: qty, stockVersion: 1}`, `$push allocations {key, qty, state: RESERVED}`, `$set stockDirty: true`. Eşleşme yoksa: anahtar zaten varsa no-op (idempotent); yoksa yetersiz stok → `$push {key, qty, state: OVERSOLD}` (yine `$ne` korumalı).
   - Sevk (commit): `{_id, allocations: {$elemMatch: {key, state: RESERVED}}}` → `$inc {stock: −qty, reserved: −qty}`, `allocations.$.state = COMMITTED`. İlk kez sevk edilmiş halde görülen sipariş: `$ne key` koruması ile `$inc {stock: −qty}` + `COMMITTED` push.
   - İptal (release): `RESERVED → RELEASED` ile `$inc {reserved: −qty}`; `OVERSOLD → RELEASED` stok değişimi yok. Hiç görülmemiş satır iptal olarak gelirse `RELEASED` "mezar taşı" push edilir; sonradan gelen bayat "oluşturuldu" durumu anahtar var olduğu için no-op olur.
   - İade: stoka geri alma varsayılan KAPALI (ürün kontrolü satıcıda); tenant açarsa `key = "return:<integrationCode>:<claimId>:<lineId>"` ile `RESTOCKED` push + `$inc {stock: qty}`.
   - Terminal durumlar (`COMMITTED`, `RELEASED`, `RESTOCKED`) geri dönmez. Dizi budama: terminal ve 40 günden eski girdiler günlük temizlenir (iade penceresi 32 gün + pay).
3. **Seviye tetiklemeli sürücü (`PostOrderOperations` / `StockAllocator`):** `OrderWorker` siparişleri kaydettikten sonra her satır için pazaryeri durumundan istenen tahsis durumunu türetir (Created/Picking/Invoiced → RESERVED; Shipped/Delivered/Returned → COMMITTED; Cancelled/UnSupplied → RELEASED; pazaryeri bazlı eşleme tablosu adaptör katmanında) ve yukarıdaki idempotent geçişi uygular. Bayat veri koruması: siparişin `status.externalUpdatedAt` değeri, satırda son uygulanandan eskiyse geçiş yapılmaz. Çökme/kaçak için her 15 dk'da bir süpürme işi: `allocationState` aynası istenen durumdan farklı olan satırları yeniden sürer. Varyant eşleşmeyen satır (`internalVariantId`/barkod/sku yok) → `UNMAPPED`, stok etkisi yok, tenant bildirimi.
4. **Çok satırlı sipariş:** her satır bağımsızdır (pazaryeri siparişi zaten kabul etmiştir; kısmi tahsis geçerli durumdur). Transaction kullanılmaz.
5. **Çakışma kuralı:** içeride "veritabanına ilk ulaşan kazanır" (koşullu `$inc` sırası). Kanallar arası öncelik tampon ile ifade edilir: tenant bir `primaryChannel` seçer (varsayılan: ilk bağlanan pazaryeri); SKU ≥2 satış kanalında listeliyse birincil olmayan kanallara varsayılan `bufferUnits = 1` uygulanır (son adet yalnızca birincil kanalda satılır). `bufferPercent` varsayılan 0, tenant kanal bazında açabilir (araştırmadaki "%90 yayınla" = `bufferPercent: 10`).
   Yayınlanan değer: `publish = clamp(available − max(bufferUnits, floor(available × bufferPercent / 100)), 0, kanalMax)`; Trendyol için `kanalMax = 20000`.
6. **Pazaryerine stok yayını (delta):** stok etkileyen her geçiş `stockDirty=true` yapar. Mevcut export hattına sistem tetiklemeli `UPDATE_STOCK` staged kayıtları eklenir (yeni hat yazılmaz — refactor); Validator mutlak `stock` yerine yukarıdaki `publish` değerini yazar. Kural:
   - Yalnızca `publish ≠ lastPublishedQty` olan SKU'lar gönderilir.
   - Toplama (debounce): tenant×kanal başına 30 sn; batch üst sınırı Trendyol/N11 1000, Hepsiburada 1000 (4000 teyit edilene kadar), Pazarama 100 (limit teyit edilene kadar).
   - `lastPublishedQty` yalnızca asenkron batch sonucu (Trendyol `batchRequestId`, N11 taskId) başarılı dönünce güncellenir (mevcut Sentinel akışı).
   - Trendyol "aynı gövde 15 dk" hatası: bu hata kalıcı hata sayılmaz; kalem `lastPublishedAt + 15 dk` sonrasına ertelenir ve o anki güncel değerle yeniden hesaplanır.
   - Stok 0'a düşen SKU'lar debounce beklemeden (öncelikli) gönderilir.
7. **Telafi (oversell):** `OVERSOLD` satır → (a) anında yüksek öncelikli tenant bildirimi (NotificationEventBus + e-posta), (b) `graceMinutes` (varsayılan 30) içinde stok artarsa `OVERSOLD → RESERVED` yeniden denenir, (c) süre dolunca `autoCancelOversold` (varsayılan açık) ise ilgili kanalın satır/sipariş iptal API'si çağrılır; iptal yeteneği gerçek ve testli olmayan kanalda (bugün N11 — C9) otomatik iptal yapılmaz, tenant'a manuel görev düşer. Son müşteri bildirimini pazaryeri iptal akışı yapar (maskeli müşteri verisi nedeniyle doğrudan iletişim yok). "Alternatif ürün önerisi" bu ölçekte kapsam dışı: pazaryerleri iptal edilen siparişe öneri kanalı sunmuyor; Faz 3+ ürün kararı.
8. **Periyodik mutabakat:** (a) iç: saatlik — `reserved` = Σ(`allocations` içindeki RESERVED qty) kontrolü; fark varsa `stockVersion` guard'lı optimistic `$set` ile onarım + log (yalnızca o varyantta taze [<2 dk] işlem yoksa). (b) dış: günlük — kanal ürün listesi/stok akışı (mevcut import `streamProducts`) ile `lastPublishedQty` karşılaştırması; fark → `stockDirty=true`. Araştırmadaki 6–12 saat aralığı yerine günlük seçildi (tek haneli abone, düşük SKU hızı); eşiğe bağlı.
9. **Kapsam dışı:** ERP'nin stok ana kaynağı olması (ERP bugün yalnızca okuma). Bir tenant ERP'yi stok ana kaynağı yapmak isterse bu ADR revize edilir.

**Test stratejisi (Faz 2 DoD — zero-oversell ancak bunlar yeşilken "tamam" sayılır):**
- Eşzamanlılık: local Mongo (izinli test DB adı; C15/izinli liste kuralına uyulur) üzerinde `stock=10` bir varyanta 50 paralel, farklı anahtarlı `qty=1` rezervasyon → tam 10 RESERVED, 40 OVERSOLD, `reserved=10`, `available` hiçbir anda < 0.
- Idempotency: aynı anahtarla 20 paralel rezervasyon → tek RESERVED, `reserved=qty`.
- Sırasızlık: iptal → oluşturuldu sırası; oluşturuldu → sevk → (bayat) oluşturuldu; ilk kez sevk edilmiş görülen sipariş; her birinde stok tam bir kez değişir.
- Çökme benzetimi: geçiş sonrası `allocationState` aynası yazılmadan süreç kesilir → süpürme işi çift düşüm yapmadan tamamlar.
- Telafi: OVERSOLD → bildirim üretildi; grace içinde stok artışı → RESERVED; grace sonrası mock pazaryerine iptal çağrısı gitti (mockserver); N11'de otomatik iptal çağrılmadı.
- Yayın: delta yalnızca değişen SKU; Trendyol mock'unda 15 dk aynı gövde hatası → erteleme, kalıcı hata değil; batch sonucu başarısızken `lastPublishedQty` değişmedi.
- Önce characterization testleri (Protokol 13): `OrderWorker`→`OrderRepository`, `Validator` stok payload'u, `variant-service` toplu güncelleme mevcut davranışıyla sabitlenir.

## Gerekçe
- Tek doküman atomikliği Mongo'nun bedava verdiği en güçlü garanti; transaction, Redis sayacı veya ayrı ledger servisi olmadan "asla eksi/çift rezervasyon" sağlanır. Local test ortamı standalone Mongo olsa da çalışır.
- Idempotency anahtarının varyant dokümanında durması, iki doküman arasında çökme penceresi problemini ortadan kaldırır; seviye tetiklemeli sürücü polling'in doğasına (son durum) uyar ve sırasız/tekrarlı veriyi ek sıralama altyapısı olmadan emer.
- Yeni bir yayın hattı yazmak yerine var olan export hattı (Dispatcher→Validator→Publisher→Sentinel) yeniden kullanılır: refactor, yeniden yazım değil.
- "Son adet birincil kanalda" kuralı, tek haneli ölçekte düşük SKU hızında satış kaybını minimumda tutarken en olası oversell senaryosunu (son adet iki kanalda aynı pencerede) kapatır; yüzde tampon isteğe bağlı bırakıldı çünkü küçük stoklu satıcıda %10 tampon stoku gizler.

## Maliyet/Ölçek Notu
- Ek servis/bağımlılık yok. Ek maliyet: `Variants` dokümanlarında küçük dizi, bir multikey indeks, saatlik/günlük iki hafif iş, pazaryeri başına durum eşleme tablosu.
- Yeniden değerlendirme eşikleri (herhangi biri):
  - 30 günde oversell olan sipariş satırı oranı > %0,5 **veya** tenant başına ayda > 3 oversell → varsayılan tamponlar ve sipariş algılama gecikmesi (0005 polling/webhook) gözden geçirilir.
  - Sipariş tespiti → pazaryerine stok gönderimi p95 > 5 dk (hedef ≤ 2 dk).
  - Tek varyantta `allocations` > 1000 girdi veya varyant dokümanı > 256 KB → rezervasyonlar ayrı koleksiyona + multi-document transaction'a taşınır.
  - Toplam sipariş satırı > 20.000/gün veya aktif tenant > 50 → iç mutabakat sıklığı ve dış mutabakatın (günlük → 6 saat) maliyeti yeniden hesaplanır.
  - Herhangi bir tenant ERP'yi stok ana kaynağı yapmak isterse (sayıdan bağımsız, kapsam tetikleyicisi).

## Etki Alanı
`database/client/models/Variant.ts`, `Order.ts`, `ClientIntegration.ts` (settings), `integration/engine/order/OrderWorker.ts`, `OrderOrchestrator.ts`, `operations/integration/PostOrderOperations.ts` (yeni `StockAllocator`), `integration/engine/export/{Dispatcher,Validator,Sentinel}.ts`, `api/services/{product,variant,integration}-service.ts`, her pazaryeri adaptörünün durum eşleme + iptal yeteneği (`IPlatform`), NotificationService, frontend stok/sipariş ekranları (reserved/available gösterimi, stockPolicy ayarları). İlişkili: 0005 (polling/webhook, kuyruk), 0006 (hata sözleşmesi; iptal/stub yasağı).

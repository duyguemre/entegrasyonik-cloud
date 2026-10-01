# Backlog önerileri — Görev 1g-T4 (kapsamı %0 olan modüller için characterization testleri, 2026-09-27)

Format: incelenmesi gereken davranış · kaynak · sabitleyen test. Hiçbiri düzeltilmedi; testler mevcut davranışı sabitler ve
düzeltildiğinde kasıtlı olarak güncellenecektir (testlerde `BACKLOG:` yorumu). BACKLOG.md'ye alınmadı; ana ajan/insan onayıyla taşınacak.

## ClientDB / DatabaseManager (`tests/characterization/database/`)
- **LRU fiilen FIFO (DE1e doğrulandı):** `getInstance` `client._id` (`.lean()` sonucu ObjectId NESNESİ) ile `cache.get/set` yapar; `instances` string'e çevirir. Aynı değerli farklı ObjectId nesnesi `instances`'ı bulur (yeniden bağlanma yok) ama `cache.has` false -> son kullanım güncellenmez; 101. tenant'ta en ESKİ oluşturulan (sık kullanılan bile) tahliye edilir (dispose bağlantıyı kapatır). Anahtarı `String(_id)` yap. · planned
- **Bayat konfigürasyon:** aynı `_id` ile farklı `dbConfig` gelse bile önbellekteki eski bağlantı kullanılır (tahliyeye kadar).
- **`_id` undefined ise tüm tenant'lar "undefined" anahtarında TEK bağlantıyı paylaşır** (anahtar doğrulaması yok; tenant izolasyonu çağıranın doğru `_id` vermesine bağlı). · planned
- **`getClientDB(clientId)` her çağrıda `Clients.findOne({order: clientId})` sorgular** (bağlantı önbelleklenir ama kayıt sorgusu önbelleklenmez); `falsy` clientId (0/NaN dahil) hata verir. `BaseApi.initClientDB` clientId falsy ise UYARI verip devam eder, `init()` hata FIRLATMAZ (`clientDB` undefined kalır; sonraki metot TypeError). · nice-to-have
- `DB_POOL_SIZE` için `Number(x) || 20`: negatif/kesirli değer geçer (örn. `-3`, `2.5`).

## order-service (`tests/characterization/order-service/`)
- **Tenant filtresi:** `OrderService`'te HİÇBİR sorgu (getOrders, findById, findByIdAndUpdate, dashboard aggregate'leri) `clientId` ile filtrelenmez; izolasyon %100 `this.clientDB` (tenant başına ayrı Mongo DB) seçimine dayanır. Eksik filtre bir "hata" değil mimari karar olabilir (DB-per-tenant), ama `clientDB` yanlış bağlanırsa (bkz. ClientDB `_id` anahtarı) defense-in-depth yok. `clientId` yalnızca `new IntegrationFactory(Number(clientId))` içinde kullanılır. · planned (ADR-0004 ile birlikte değerlendirilsin)
- **`getOrders` alan adı uyuşmazlığı:** varsayılan sıralama `{orderDate:-1}` ve tarih filtresi (`startDate/endDate`) ÜST DÜZEY `orderDate` alanına yazılmış; Order şemasında alan `dates.orderDate` (dashboard ve şema indeksi onu kullanır). Bu nedenle tarih filtresi hiç sonuç döndürmüyor ve varsayılan sıralama etkisiz olabilir. · planned/critical (işlevsel bozukluk olabilir; canlı davranış doğrulanmalı)
- **`getOrders` girdi doğrulaması yok:** `globalSearch` kaçışsız `$regex` (ReDoS/regex enjeksiyonu); `sort.field` keyfi alan adı; `page<1` negatif `$skip`; `limit=0` -> `$limit 0` (Mongo hatası) ve sayfa sayısı `Infinity`.
- **`cancelOrder`/`bulkCancelOrder` yalnızca `marketplaceResult === false` ise reddeder;** `undefined/null/0/''/{success:false}` başarı sayılır ve yerelde CANCELLED yazılır (approve tarafı `!result` kullanır: asimetri). Statü ön koşulu YOK: SHIPPED/DELIVERED/CANCELLED sipariş de iptale gönderilir. · planned/critical adayı (doğruluk: pazaryeri reddetse bile yerel iptal)
- **Pazaryeri-DB tutarsızlığı:** pazaryeri iptali/onayı başarılı olup ardından DB güncellemesi patlarsa geri alma yok; hata yayılır.
- **Alan adı tutarsızlığı:** iptal `externalItemId` -> `externalLineId`; onay `items[0].externalLineItemId` kullanır (şemada ikisi de var). Onayda `...order.meta` içindeki `externalLineItemId` items'tan geleni ezer.
- **`updateOrderStatus`:** `internalStatus` enum/geçiş doğrulaması yok (findByIdAndUpdate `runValidators` kullanmıyor), pazaryerine bildirim yok, sipariş yoksa `success:true, data:null`; `markAsPrinted` de aynı şekilde.
- **`approveOrder` fulfillment'ı TEK elemanlı diziyle EZER**; toplu onay kargo/fulfillment ve `dates.externalUpdatedAt` işlemez (tekil onaydan farklı).
- Kilit süresi sabitleri: tekil iptal +5 dk, tekil onay +2 dk, toplu +5 dk (`platformOperation.lockedUntil`); nedeni belgelenmemiş.

## Katalog Dispatcher / Sync (`tests/characterization/catalog/`)
- **Dispatcher çok-pod kilidi YOK (doğrulandı):** iki eşzamanlı `run()` aynı QUEUED kayıtlar için iki ayrı batch+sinyal üretir; `updateMany` filtresinde `status:'QUEUED'` koruması yok (`{_id:{$in}}`). `POD_NAME` yalnızca log'da kullanılır. · planned/critical adayı (çift gönderim)
- **Dispatcher L-08 doğrulandı:** tenant ClientDB yoksa `return` -> kalan bayraklar işlenmez ve önceki bayrak sinyal oluşturmuş olsa bile `PROCESS_NEXT_SIGNAL` yayınlanmaz (`continue` değil).
- **Dispatcher adımları atomik değil:** staged PREPARING -> sinyal create -> sayaç düş; sinyal create hatasında staged kayıtlar sinyalsiz PREPARING kalır (telafi yok). Lead bulunduğu halde paket sorgusu boş dönerse `queuedItems[0].mode` TypeError (catch'te yutulur).
- **Sync mesaj/config uyuşmazlığı:** WAITING kayıtlara "Sıradaki kontrol 30dk sonra" yazılır ama gerçek gecikme `export.config.json > synchronizer.cooldownMinutes = 1` dakikadır (`|| 30` yedeği config 0/eksik olmadıkça çalışmaz). Hata yolunda 5 dk cooldown sabit koddadır.
- **Sync "kilidi" atomik değil:** `updateMany({batchId:{$in}}, {$set:{lockedBy: process.env.POD_NAME}})` koşulsuz; `POD_NAME` yoksa `lockedBy: undefined` (orchestrator ise `os.hostname()` yedeği kullanır: tutarsız). Sync, hata alınca `finalizeSignal`'i atlar ve cooldown yazımı da patlarsa hata `runOnce`'tan yayılır. `finalizeSignal` filtresi yalnızca `batchId` (clientId yok).
- Sync `formatUserMessage`: `messages` yoksa/boşsa hata mesajı "İşlem tamamlandı." olur (FAILED kayıt için yanıltıcı olabilir); COMPLETED dışındaki her bilinmeyen statü FAILED sayılır.
- ExportOrchestrator / ImportOrchestrator / Importer / Stager / Validator / Sentinel bu görevde KAPSANMADI (Publisher.batchFailure başka testte var).

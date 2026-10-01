# DATA_MODEL_CONVENTIONS — Veri modeli kuralları (bağlayıcı)

Kaynak karar: `docs/adr/0021-veri-modeli-ve-sema-modernizasyonu.md`. Bu belge **kontrol listesidir**; gerekçe ve alternatifler ADR'dedir. Yeni koleksiyon/alan/indeks ekleyen veya şema değiştiren her görev bu kuralları uygular; uygulanmayan kural için gerekçe commit/rapor notuna yazılır. Mevcut ihlaller "donmuş istisna" (§13) veya ADR-0021 Karar 3 değişiklik listesinde izlenir — yeni kod mevcut ihlali örnek alamaz.

Kapsam: ApplicationDB (`entegrasyonikDB`) + tenant DB'leri. İzolasyon mimarisi (tenant başına DB, ADR-0003/0013), izinli 7 DB listesi ve yedek şartı (CLAUDE.md kural 2/3) bu belgenin üstündedir.

## 1. İsimlendirme
- Koleksiyon: `PascalCase`, çoğul (`StockMovements`). Mongoose model adı `snake_case` tekil (`stock_movement`), `collection:` seçeneği açık yazılır.
- Alan: `camelCase`. Boolean: `is*`/`has*`. Tarih: `<olay>At` (`completedAt`) veya iş tarihleri için `dates.<ad>`. Referans: `<varlık>Id`. Dış kimlik: `external<Varlık>Id`.
- Enum değerleri: **yeni** enum'lar `lower_snake` (`order_reserve`); mevcut UPPER enum'lar donmuş (değiştirilmez).
- İndeks adı her zaman açık: `<alan1>_<alan2>` veya anlamlı ad (`uniq_order`, `ttl_purge_at`).

## 2. Kimlik
- İç referans: `ObjectId` (string olarak saklanmaz).
- Dış kimlik: her zaman `String` (sayısal görünse bile) + `integrationCode`; tekillik `{integrationCode, external…Id}` bileşik unique ile.
- **Tenant kimliği: `clientId: Number`** (= `Clients.order`). Adı `tenantId`/`tid`/`order` olan yeni depolama alanı açılmaz (API/DTO `tenantId` gösterebilir). Tenant kimliği listesi: `<rol>ClientIds: [Number]`.
- ApplicationDB'de tenant-kapsamlı her koleksiyonda `clientId` **zorunlu** ve tenant-kapsamlı sorguların indeksinde **ilk alan**.
- Tenant DB'de yeni koleksiyonlara `clientId` **yazılmaz** (izolasyon DB düzeyinde).
- Sıralı insan-okunur numaralar yalnız `Counters` + atomik `$inc` (`findOneAndUpdate(..., {upsert:true, new:true})`) ile; `Math.random`/`max+1` yasak.

## 3. Zaman
- Yalnız BSON `Date`, UTC. Epoch sayı veya string tarih saklanmaz.
- İş koleksiyonlarında `timestamps: true` (`createdAt`, `updatedAt`). Ham sürücü (`collection.updateOne`) kullanılıyorsa `updatedAt` elle set edilir.
- Gün/ay sınırı hesapları `Europe/Istanbul` saat dilimiyle yapılır; sunucu yerel saatine güvenilmez.

## 4. Para, oran, sayı
- **Platformun kendi parası ve defterler** (abonelik, fatura dışa aktarımı, hakediş/mutabakat, stok hareketi değeri): tam sayı **minör birim**, alan adı `*Minor` (`priceMinor`), yanında `currency` (ISO-4217, varsayılan `TRY`).
- **Pazaryeri aynası tutarlar** (sipariş, iade, finans işlemi, varyant fiyatı): `Number` (ana birim), yazımda ortak `roundMoney` ile **2 ondalığa yuvarlanır**; toplamlar çıktıda yuvarlanır. Yeni koleksiyonda bu biçim yalnız dış sistemin aynasıysa kullanılabilir.
- KDV/komisyon oranı: yüzde olarak `Number` (`20` = %20), alan adı `*Rate` (`vatRate`); KDV dahil/haric `vatIncluded: Boolean` açık yazılır.
- Sayılar sayı, boolean'lar boolean olarak saklanır; string'e çevrilmiş sayı/bool yasak.
- Decimal128 kullanılmaz (ADR-0021 Karar 2.4, eşikli).

## 5. Şema sürümü
- Her belgeye `schemaVersion` **eklenmez**; koleksiyon sürümü `SchemaMigrations` kaydındadır.
- `schemaVersion: Number` yalnız: (a) tembel (okumada onarım) göçlenen koleksiyon, (b) ayar/manifest belgeleri (ör. ADR-0020 ayar sürümleri), (c) `StockMovements` gibi uzun ömürlü defter kayıtları.

## 6. Silme
- Varsayılan: sert silme. Soft-delete yalnız geri alma/denetim gerektiren varlıkta: `deletedAt: Date | null`, tüm okuma sorguları `deletedAt: null` içerir, gerekiyorsa kısmi indeks.
- Tenant silme: ADR-0003 (askı → 30 g → purge). Merkezi koleksiyonlardaki tenant kayıtları purge işinde listelenir.
- İlişki/kaskad temizliği **servis/operasyon katmanında** yapılır; Mongoose `pre/post` kancasında başka koleksiyona yazılmaz.

## 7. Strict ve serbest alanlar
- `strict: true` (Mongoose varsayılanı) + `strictQuery: true`. Yeni `strict:false` yasak (mandal testi).
- `Mixed`/`Object` yalnız üç torba türünde ve yorumla gerekçelendirilerek:
  1. `meta` — PII'siz, ≤ 4 KB küçük nesne;
  2. `raw*` — dış sistem ham yanıtı; yalnız TTL'li koleksiyonda, boyutu sınırlı (≤ 16 KB), PII redaksiyonu sonrası;
  3. belgelenmiş harita — tercihen `Map` + alt şema (`platforms: Map<PlatformInfo>`).
- Sır alanları `enc:v1` şifreli (ADR-0003); API yanıtında `'sensitive'`.
- MongoDB `$jsonSchema` doğrulayıcısı kullanılmaz (tek yazar Mongoose); eşik ADR-0021'de.
- Varsayılan bağlantıya model kaydı (`mongoose.model(...)`) şema dosyalarında yasak; modeller yalnız `*MongooseSchemas.ts` içinde bağlantıya kaydedilir.

## 8. Gömme / referans / diziler
- Gömülür: birlikte okunan, sahibine ait, üst sınırı bilinen veri (≤ 100 eleman **ve** ≤ 64 KB).
- Ayrı koleksiyon: bağımsız sorgulanan, paylaşılan veya üst sınırı bilinmeyen veri.
- Sınırsız büyüyebilecek her `$push` ya `$slice` ile sınırlanır (`{$push: {logs: {$each: [x], $slice: -20}}}`) ya da ayrı koleksiyona yazılır. Değişiklik geçmişi/sürüm/hareket = ayrı ekleme-yalnız koleksiyon.
- Belge boyutu hedefi ≤ 256 KB (16 MB sınırına yaklaşılmaz).

## 9. İndeks
- Her indeks şema dosyasında **adlı** ve hangi sıcak sorguya (§12) hizmet ettiği yorumla yazılır.
- Önek-örtüşen tekil indeks yasak (`{a}` + `{a,b}` → yalnız `{a,b}`). `index: true` ile `unique: true` aynı alanda birlikte yazılmaz.
- Bileşik indeks alan sırası: eşitlik → sıralama → aralık (ESR).
- `autoIndex` yalnız test/yerelde; staging/prod'da `DB_AUTO_INDEX=false`, indeksler göç dosyasıyla kurulur/silinir; yeni tenant provizyonu `createIndexes` çalıştırır.
- Şema indeks değişikliği = aynı commit'te `backend/migrations/index-manifest.json` güncellemesi + göç dosyası (statik test).
- Unique indeks öncesi mükerrer ön kontrolü (salt-okunur, yalnız sayı raporlar) zorunlu.
- `syncIndexes()` kullanılmaz; fark `diffIndexes()` ile planlanır.
- Kullanılmayan indeks (`$indexStats`, ölçüm penceresi ≥ 14 gün) contract göçüyle silinir.

## 10. Saklama (TTL) ve KVKK
- Tek saklama politikası: `expiresAt` + TTL `expireAfterSeconds: 0`. Birden çok politika (açık/kapalı kayıt vb.): hesaplanmış `purgeAt: Date | null` + TTL (`null` = saklanır).
- Her yeni tenant verisi koleksiyonu `operations/tenant/exportCollections.ts`'e eklenir veya hariç tutma gerekçesi yazılır (statik test).
- PII ham dış yanıtlarda kalıcı saklanmaz (bkz. §7 `raw*`).

| Koleksiyon | Saklama (varsayılan; insan kararı açık) |
|---|---|
| `Notifications` | 3 g (mevcut) |
| `ImportStagedProducts`, `…Summaries`, `ImportJobReports` | 7 g (mevcut) |
| `ExportSignals` | 15 g, `completedAt` (FAILED dahil set edilmeli) |
| `IntegrationOperationLogs` | 90 g (mevcut) |
| `AuditLogs` | 365 g (mevcut) |
| `DeadLetterQueue` | açık kalıcı; çözülmüş +30 g (ADR-0017) |
| `MetricRollups` | 5 dk kova 7 g, 1 sa kova 90 g (ADR-0017) |
| `ErrorEvents` | `lastSeen` +30 g (ADR-0017) |
| `JobRuns` | 14 g (ADR-0017); `JobState` kalıcı |
| `IntegrationFindings` | açık kalıcı; kapalı +365 g (`purgeAt`) (ADR-0018) |
| `PendingActions` | MCP 10 dk; ajan önerisi açık 72 sa, kapalı +180 g (`purgeAt`) (ADR-0018/0019) |
| `McpIdempotency` | 24 sa (ADR-0019) |
| `StockMovements` | 730 g (`purgeAt`) |
| `SchemaMigrations` | kalıcı |
| İş verisi (Orders, Customers, Claims, Invoices, Messages, Products, Variants…) | tenant aktifken süresiz; tenant iptalinde ADR-0003 purge |

## 11. Çok-kiracılık kuralları
- Tenant verisi tenant DB'dedir; ApplicationDB'ye yalnız platform-geneli durum (kuyruk, kilit, abonelik, denetim, gözlem) yazılır ve `clientId` taşır.
- Tenant-kapsamlı her ApplicationDB sorgusu `clientId` filtresi içerir (sunucuda doğrulanmış kimlikten; istek gövdesinden değil).
- Global tarama yapan kuyruk sorguları (Dispatcher, orkestratör zombi temizliği) istisnadır ve kodda böyle işaretlenir.
- Önbellek/kuyruk/dosya anahtarlarında tenant (ADR-0002).

## 12. Sıcak sorgu kataloğu (indeks gerekçesi; statik test kaynağı)
| Sorgu (kaynak) | Beklenen indeks |
|---|---|
| Tenant çözümleme `Clients {order}` (`DatabaseManager.ts:56`) | `uniq_order` |
| Login `Users {email}` (merkezi) | `uniq_email` |
| Tenant kullanıcıları `Users {clientId}` (merkezi, ADR-0021 D11) | `clientId` |
| Denetim `AuditLogs {tid}` + `at` aralığı | `{tid:1, at:-1}` |
| Sipariş listesi `Orders {internalStatus?, integrationCode?}` sort `dates.orderDate` | `{internalStatus:1,'dates.orderDate':-1}`, `{integrationCode:1,'dates.orderDate':-1}` (Aşama 0 `explain` ile teyit) |
| Sipariş upsert `Orders {integrationCode, externalOrderId}` | unique bileşik (mevcut) |
| Rezervasyon `Variants {_id, 'allocations.key' $ne}` | `allocations.key` (mevcut) |
| Dispatcher `ExportStagedProducts {integrationCode, status, mode}` sort `{priorityScore:-1, createdAt:1}` | `{integrationCode:1,status:1,mode:1,priorityScore:-1,createdAt:1}` |
| Dispatcher bayrağı `ExportFlag {queuedCount>0}` | `{integrationCode:1,queuedCount:1,priority:-1,lastUpdatedAt:1}` (mevcut) |
| Stok hareket raporu `StockMovements {variantId}` sort `at` | `{variantId:1, at:-1}` |
| Mesaj upsert `Messages {integrationCode, externalMessageId}` | unique bileşik (mevcut); tekil `externalMessageId` unique **olmamalı** |
| Göç durumu `SchemaMigrations {status}` (`dev-tools/migrate.js status`) | `status_1` (ADR-0021 Karar 4/D7) |

## 13. Donmuş istisnalar (yeniden adlandırılmaz/dönüştürülmez; yeni kod örnek almaz)
`ExportFlag` (tekil ad), `Menu`, `DeadLetterQueue`, `Statistics`; `AuditLogs.tid`; `ClientIntegrationInfo.status: Boolean`; mevcut UPPER_SNAKE enum'lar; `Notifications.isDeleted`; tenant DB'deki mevcut `clientId` alanları; `Product.taxPercentage`; `Integration.commissin` ve `Setting.shipingDuration` (yalnız ilgili modül refaktöründe DTO alias'ıyla düzeltilir).

## 14. Göç disiplini (özet; ayrıntı ADR-0021 Karar 4)
- Göç = `backend/migrations/NNNN-<ad>.js`, `dev-tools/migrate.js` ile; varsayılan DRY-RUN; `--apply` için `--backup-ref` (≤ 24 sa doğrulanmış yedek) zorunlu; yalnız izinli 7 DB; varsayılan yalnız `127.0.0.1`.
- Sıra: expand (+ kod N+1 iki biçimi okur) → migrate (batch, idempotent, devam edebilir) → en az 1 sürüm ve 7 gün → contract (kod N+2 + geri dönüşsüz göç, taze yedek).
- Uygulanmış göç dosyası değiştirilmez (checksum); düzeltme yeni göçtür.
- Canlı çalıştırma Protokol 12 (insan onayı) + runbook.
- Filtre/indeks semantiği iddiası gerçek Mongo testiyle kanıtlanır (`tests/integration/`, yalnız `zzTest_` önekli koleksiyonlar).

## Görev başına mini kontrol
```
Veri modeli kontrolü: isim[ ] kimlik/clientId[ ] tarih[ ] para[ ] strict/Mixed[ ] dizi sınırı[ ] indeks+manifest[ ] TTL/KVKK kaydı[ ] göç (expand/contract, yedek)[ ] gerçek-Mongo testi[ ]
Uygulanmayan kural + gerekçe: ...
```

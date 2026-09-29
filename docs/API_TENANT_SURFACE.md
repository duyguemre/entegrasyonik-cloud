# API_TENANT_SURFACE — Tenant-yüzlü yeni API uçları (FE sözleşmesi)

Tarih: 2026-09-28 · Kaynak: `backend/src/api/**`, `backend/src/operations/**` · Testler: `backend/tests/unit/tenant-surface/*`
Kapsam: FRONTEND_GAP_ANALYSIS N4/N5/N6/N7/N10 + §b-2 (politikasız metotlar). **Frontend'e dokunulmadı**; ekranlar ADR-0015 sonrası.
Kademe kaynağı: `backend/src/api/operationPolicy.ts` (tablo: `docs/OPERATION_POLICY.md` "Tenant-yüzlü yeni uçlar").

## 0. Ortak sözleşme (jenerik RPC)

- **İstek:** `POST /api/<Servis>/<operasyon>`, `Content-Type: application/json`, oturum çerezi (`JWT_TOKEN`, HTTP-only) ZORUNLU. Gövde = operasyon parametreleri.
- **Tenant:** YALNIZCA oturumdaki doğrulanmış tenant'tır. Gövdedeki `clientId`, `order`, `tid`, `targetClientId`, `userContext`, `principal` **yok sayılır** (sunucuda atılır). Bir tenant'ın verisine başka tenant kimliğiyle erişmenin yolu yoktur (IDOR testleri: `policy-and-idor.test.ts`, `audit-logs.test.ts`, `integration-health.test.ts`, `stock-overview.test.ts`).
- **Başarı:** `200` + JSON (operasyonun döndürdüğü nesne, sarmalayıcı yok). **Hata:** `{ "error": "<mesaj>", "service": "...", "operation": "..." }` + HTTP durumu (istek gövdesi geri yansıtılmaz).
- **Ortak hata kodları:** `401` oturum yok/geçersiz · `403` kademe yetersiz veya operasyon kayıtsız (`{"error":"Forbidden"}`) · `400` doğrulama hatası (mesaj alanı Türkçe, FE'de gösterilebilir) · `404` kaynak yok · `500` beklenmeyen.
- **Yetki kademeleri:** `member` < `admin` < `owner` (`admin` kademesi owner'ı da kapsar). Süper yönetici (`ga`) tenant bağlamında `admin` kademesindedir, `owner` DEĞİLDİR; mağaza seçmemişse (tenant yok) bu uçlar `400` döner.
- Yanıtlar son savunma olarak `responseSanitizer`'dan geçer (parola özeti, `dbConfig`, `enc:v1:` şifreli değerler vb. yasak anahtarlar silinir); bu uçların DTO'ları zaten beyaz listedir ve sanitizer'ı tetiklemez (testli).

---

## 1. Stok politikası (N5 · ADR-0004 Karar 1/5/6/7) — **admin** (owner dahil)

### Önemli düzeltme: `saveClientMarketplaceSettings` artık `stockPolicy`'yi EZMEZ

`IntegrationService.saveClientMarketplaceSettings` `marketplace.$.settings` nesnesinin TAMAMINI yazar. Sır olmayan bir alan gövdede yoksa DB'den **silinirdi** (yalnızca sır alanları `resolveSecretsForWrite` ile korunuyordu) — yani FE `stockPolicy`'yi taşımazsa politika sessizce kaybolurdu, taşırsa doğrulamasız yazılabilirdi. Artık: `settings.stockPolicy` bu genel uçta **sahiplenilmiştir** → gövdedeki değer YOK SAYILIR, DB'deki değer KORUNUR (test: `marketplace-settings-stockpolicy.characterization.test.ts`). Diğer sır olmayan alanların whole-replace davranışı DEĞİŞMEDİ (`SELLERID`, `taxPercentage` vb. gelen değerle yazılır). Politika yalnızca aşağıdaki özel uçlardan yazılır.

### 1.1 `IntegrationService/getStockPolicy`

İstek: `{}`. Yanıt:

```json
{
  "primaryChannel": "n11" | null,              // yapılandırılmış tenant birincil kanalı (null = varsayılan kural)
  "effectivePrimaryChannel": "trendyol" | null, // motorun kullandığı: yapılandırılmışsa o, yoksa en küçük `order`'lı pazaryeri
  "primaryChannelIsConnected": true,            // yapılandırılmış kod artık bağlı pazaryerlerinde mi (false => ayar bayat)
  "channels": [
    { "integrationCode": "trendyol", "order": 1, "enabled": true, "isPrimary": true,
      "autoCancelSupported": true,              // pazaryeri iptal yeteneği gerçek/testli mi (trendyol|hepsiburada|pazarama)
      "stockPolicy": { "bufferUnits": 2, "graceMinutes": 45 } }   // YALNIZCA ayarlı alanlar; eksik alan = varsayılan
  ],
  "defaults": { "bufferUnits": 1, "bufferPercent": 0, "graceMinutes": 30, "autoCancelOversold": true },
  "limits": { "bufferUnitsMax": 100000, "bufferPercentMax": 100, "graceMinutesMax": 10080 }
}
```

`defaults.bufferUnits` yalnızca **birincil olmayan** kanalda uygulanır (birincil kanalda 0). Sır/kimlik bilgisi asla dönmez (yalnız bilinen 4 alan).

### 1.2 `IntegrationService/saveTenantStockPolicy`

İstek: `{ "primaryChannel": "<integrationCode>" }` veya temizlemek için `{ "primaryChannel": null }` (`""` da temizler). Yanıt: `{ "primaryChannel": "n11" | null }`.
Hatalar: `400` alan yok / kod biçimi geçersiz (`^[A-Za-z0-9_-]{1,64}$`) / **kod bağlı bir pazaryeri değil** (`"Belirtilen pazaryeri bağlı değil."` — güncelleme filtresi `marketplace.code` içerir, atomik); `404` (temizlerken) entegrasyon belgesi yok.
Denetim: `stock.policy.primary` (`meta.primaryChannel`).

### 1.3 `IntegrationService/saveChannelStockPolicy` (kısmi/birleştirmeli)

İstek: `{ "integrationCode": "trendyol", "stockPolicy": { "bufferPercent": 10, "autoCancelOversold": false, "graceMinutes": null } }`

| Alan | Tip / aralık | Not |
|---|---|---|
| `bufferUnits` | tamsayı 0..100000 | |
| `bufferPercent` | sayı 0..100 | |
| `graceMinutes` | tamsayı 0..10080 (7 gün) | |
| `autoCancelOversold` | boolean | kanalın iptal yeteneği yoksa etkisiz (`autoCancelSupported`) |
| (herhangi alan) `null` | — | o alanı **varsayılana döndürür** (`$unset`) |

- Yalnızca gönderilen alanlar yazılır (`marketplace.$.settings.stockPolicy.<alan>` noktalı yollarına **atomik `$set/$unset`**; oku-değiştir-yaz yok, `settings`'in diğer alanları — sırlar dahil — dokunulmaz).
- Bilinmeyen alan (ör. `autoRestock`: tüketicisi olmayan bir ayar sunmamak için KASITLI reddedilir, `APIKEY`, `settings.x`), yanlış tip, aralık dışı, boş nesne → `400`, DB'ye yazma yok.
- Yanıt: `{ "integrationCode": "trendyol", "stockPolicy": { ...sonuçtaki tüm ayarlı alanlar } }`.
- Hatalar: `400` doğrulama · `404` `"Belirtilen pazaryeri bağlı değil."`. Yalnızca `marketplace` tipi kanallar.
- Denetim: `stock.policy.channel` (`meta`: `integrationCode`, yazılan alanlar, `reset`).

---

## 2. OVERSOLD / rezervasyon görünürlüğü (N6 · ADR-0004) — **member**

### 2.1 Doğrulanan mevcut yüzey

- `OrderService/getOrders` siparişleri **projeksiyonsuz** döndürür: `orders[].items[].allocationState` (`RESERVED|COMMITTED|RELEASED|OVERSOLD|RESTOCKED|UNMAPPED`), `lastAllocationAppliedAt`, `oversoldEscalatedAt` FE'ye ulaşır (test ile sabit).
- `ProductService/retrieveProduct` (`{ _id }`): `product.variants[]` `Variants` koleksiyonundan **projeksiyonsuz** `$lookup` ile gelir → `stock`, `reserved`, `stockDirty`, `stockVersion`, `allocations[]` (`{key, qty, state, at}`) mevcut. **`available` saklanmaz, TÜRETİLİR:** `available = stock - reserved` (FE hesaplar). Not: `allocations` sınırsız büyüyebilir ve `key` dış sipariş kimliği içerir (PII değil, tenant'ın kendi verisi); liste ekranları için `getStockOverview` özetini kullanın, `retrieveProduct`'ı yalnızca ürün detayında.
- `VariantService/getVariants` **eski/ölü yol** (`Product.variants` gömülü dizisini okur; şemada yok) — kullanmayın.

### 2.2 YENİ: `OrderService/getOrders` → `searchOrderForm.filter.allocationStates`

`{ "searchOrderForm": { "filter": { "allocationStates": ["OVERSOLD", "UNMAPPED"] } } }` → en az bir kalemi bu durumlarda olan siparişler (`items: { $elemMatch: { allocationState: { $in: [...] } } }`). Diğer filtrelerle birleşir; boş dizi filtre eklemez. Geçersiz değer/dizi olmayan/nesne → `400` (beyaz liste; operatör enjeksiyonu yok).

### 2.3 YENİ: `StockService/getStockOverview`

İstek: `{ "limit": 20 }` (isteğe bağlı, 1..50 tamsayı; aksi `400`). Yanıt:

```json
{
  "generatedAt": "2026-09-28T12:00:00.000Z",
  "attention": { "oversold": { "lines": 2, "units": 5 }, "unmapped": { "lines": 2, "units": 6 } },
  "recentOrders": [                      // dikkat gerektiren kalemi olan en yeni N sipariş
    { "orderId": "…", "orderNumber": "…", "externalOrderId": "…", "integrationCode": "trendyol", "orderDate": "…",
      "items": [ { "externalLineItemId": "…", "sku": "…", "barcode": null, "productName": "…", "quantity": 2,
                   "allocationState": "OVERSOLD", "lastAllocationAppliedAt": null, "oversoldEscalatedAt": "…" } ] }
  ],
  "variants": { "total": 4, "totalStock": 17, "reservedUnits": 7, "availableUnits": 10,
                "withReservations": 2, "overReserved": 1, "publishPending": 1 },
  "reconciliation": { "tracked": false, "lastRunAt": null }
}
```

- `attention.*.lines` = **açık** (şu an bu durumda) sipariş kalemi sayısı, `units` = toplam adet. `overReserved` = `reserved > stock` varyant sayısı; `publishPending` = `stockDirty` varyant sayısı.
- DTO beyaz listedir: müşteri/adres/fatura/fiyat alanları ve ham `allocations` DÖNMEZ.
- **Mutabakat sonucu YOKTUR (`tracked:false`)**: `InternalReconciliationJob`/`ExternalReconciliationJob` sonucu kalıcı yazmıyor (yalnız log + `stockDirty`); "son mutabakat" bilgisi için sonuç koleksiyonu gerekir (N8, backend işi; uydurma zaman damgası dönülmez).

### 2.4 DÜZELTME (zero-oversell bütünlüğü): `ProductService/updateProduct` ve `saveProduct`

`retrieveProduct` varyantları `reserved/allocations/stockVersion/stockDirty` dahil döndürür ve FE formu onları `updateProduct`'a geri gönderir; eski kod her varyantı `$set: v` ile yazıyordu → FE'nin **bayat okuması arada gerçekleşen bir rezervasyonu ezerdi** (ADR-0004 Karar 1: bu alanların tek yazarı `StockAllocator`). Artık bu dört alan **gövdeden atılır** (mevcut varyantta `$set`'e girmez, yeni varyantta şema varsayılanı). `stock`, `shelf`, `prices`, `barcode` vb. AYNEN yazılmaya devam eder. FE sözleşmesi değişmez (alanlar gönderilebilir, yok sayılır). Bilinen kalan risk için §7.

---

## 3. Tenant entegrasyon sağlığı (N7) — `IntegrationService/getIntegrationHealth` — **admin** (yalnızca OKUMA)

İstek: `{}`. Yanıt:

```json
{
  "generatedAt": "…", "windowHours": 24,
  "integrations": [{
    "integrationCode": "trendyol", "type": "marketplace", "enabled": true,
    "credentialsConfigured": true,                 // boolean; değer ASLA dönmez (null = tenant ayar kaydı yok)
    "lastSuccessfulSyncAt": "…" | null,            // Clients.integrations[].lastSuccessfulOrderSync (motorun gerçek imleci)
    "webhook": { "healthy": true, "lastReceivedAt": "…" } | null,
    "lastError": { "at": "…", "code": "RATE_LIMITED", "httpStatus": 429, "operation": "GET /suppliers/123/orders" } | null,
    "circuit": { "state": "closed|open|half_open", "observedAt": "…", "stale": false } | null,
    "last24h": { "total": 6, "success": 5, "error": 1, "errorsByCode": { "RATE_LIMITED": 1 } },
    "health": "not_configured | no_data | healthy | degraded | down"
  }]
}
```

- **Kaynaklar:** ApplicationDB `Clients.integrations[]` (senkron imleci/webhook), `IntegrationCallMetrics` (24 sa sayıları; son hata ve devre kesici için 30 gün geriye bakış; TTL 30 gün), tenant `ClientIntegrations` (yalnızca "kimlik bilgisi girilmiş mi").
- `lastError.code` = `IntegrationError.code` (`AUTH|RATE_LIMITED|UNAVAILABLE|VALIDATION|NOT_FOUND|NOT_SUPPORTED|UNKNOWN_OUTCOME|INTERNAL`); tanımsız değer `UNKNOWN`'a indirgenir. **Ham hata mesajı dönmez.** `operation` alanından sorgu dizesi/fragment atılır, kimlik bilgisi kalıpları ve ≥32 karakterlik token benzeri parçalar `***` yapılır.
- **Sızıntı:** `webhookToken`, kimlik bilgisi/ayar değeri, `dbConfig`, ham mesaj DÖNMEZ (beyaz liste DTO; test).
- `circuit`: son metrik satırındaki durum. `stale=true` → `open/half_open` gözlemi 10 dk'dan eski (kesici artık kapanmış/yarı-açık olabilir; `down` sayılmaz).
- `health` türetimi: kimlik bilgisi yok + çağrı yok → `not_configured`; devre `open` ve bayat değil → `down`; 24 sa'te çağrı yok → `no_data`; son çağrı hata ve hata>0 → `degraded`; aksi `healthy`.
- **Uyarılar:** (a) `lastSuccessfulSyncAt` tenant kaydında provisioning anında `now` ile tohumlanır → hiç bağlanmamış entegrasyonda da dolu görünebilir (`credentialsConfigured:false` ile birlikte yorumlayın). (b) Tenant DB'deki `syncMetadata.lastOrderSync` HİÇBİR yerde yazılmıyor (epoch 0) → bilerek kullanılmadı. (c) Sağlık, adaptör HTTP metriklerinden türer: kimlik bilgisini aktif "test et" ucu YOK (N7'nin `testConnection` maddesi yapılmadı; gerçek pazaryerine istek atmayı gerektirir).

---

## 4. Denetim günlüğü okuma (N10) — `AuditService/getAuditLogs` — **admin** (owner dahil)

İstek (hepsi isteğe bağlı): `{ "page": 1, "limit": 25, "from": "ISO", "to": "ISO", "event": "login", "eventPrefix": "stock.", "userId": "<userId>", "result": "ok|fail|error" }`

- `limit` 1..100 (vars. 25); `page` ≥ 1. Varsayılan aralık: **son 30 gün** (`to` = şimdi); aralık ≤ 366 gün. `from > to`, geçersiz tarih, biçimsiz `event/eventPrefix/userId` (`^[A-Za-z0-9_.:-]{1,64}$` / userId `^[A-Za-z0-9_-]{1,64}$`), geçersiz `result` → `400`.
- Yanıt: `{ logs: [{ id, at, event, result, userId, meta }], page, limit, totalNumberOfRecords, totalNumberOfPages, from, to }`, `at` azalan.
- **Tenant izolasyonu:** filtre HER ZAMAN `tid = oturum tenant'ı` (gövdedeki `tid/clientId` okunmaz); tenant kimliği yoksa `400` (tid'siz sorgu atılmaz). Başka tenant'ın kullanıcı kimliğiyle `userId` filtresi sonuç vermez (`tid AND sub`).
- **DTO (PII/sır yok):** `ip` DÖNMEZ (kişisel veri), `tid` dönmez, `meta` okurken yeniden sanitize edilir (yalnızca ilkel, hassas görünen anahtarlar atılır). `userId` opak kimliktir; adı için `UserService/getUsers` (admin) kullanın. Başarısız girişler `tid`'siz yazıldığından tenant'a görünmez.
- **Platform-içi olaylar (`admin.*`, süper yönetici yazma kayıtları) tenant'a GÖSTERİLMEZ**; `event: "admin.…"` filtresi `400` verir, `eventPrefix` ile de geri getirilemez.
- **Performans notu (insan onayı gerekir):** `AuditLogs`'ta `tid` indeksi YOKTUR (yalnız TTL `at`, `event+at`, `sub+at`). Sorgu varsayılan 30 gün penceresi (`at` indeksi) + `maxTimeMS=5000` ile sınırlandı. Tenant/trafik büyüyünce `{ tid: 1, at: -1 }` indeksi önerilir — canlı indeks oluşumu insan onayı gerektirdiğinden (Protokol 12; ADR-0003 deseni) şema DEĞİŞTİRİLMEDİ.
- Olay adları (yazan tarafta): `login`, `register`, `selectStore`, `user.*`, `tenant.export.requested|completed|download`, `stock.policy.primary|channel`, …

---

## 5. KVKK dışa aktarma indirme (N4) — `GET /api/tenant-data/export/download?token=<downloadToken>` — **owner**

Akış: (1) `POST /api/TenantDataService/exportTenantData` (owner) → `{ success, jobId, key, downloadToken, expiresAt }` · (2) tarayıcı `GET …/export/download?token=<downloadToken>` (oturum çerezi gerekli) → zip akışı.

| Özellik | Davranış |
|---|---|
| Kimlik | Oturum çerezi ZORUNLU (`authenticate` middleware'inden sonra bağlanır; açık rota DEĞİL). Yalnızca **owner**: admin ve süper yönetici → `403`. |
| Tenant bağı | Token'daki anahtar `exports/<N>/export_<N>_<ts>.zip` biçiminde ve `N` = oturumun tenant'ı olmalı; başka tenant'ın geçerli imzalı token'ı `403` (+ denetim `fail`). R2'ye yalnızca doğrulanmış anahtarla dokunulur (yol gezinme yok). |
| Token | Mevcut HMAC (`JWT_SECRET`, biçim DEĞİŞMEDİ), 24 sa. Geçersiz/süresi dolmuş/eksik → `400` (tek mesaj; ayrım sızdırılmaz). |
| Tek kullanım | Başarılı **tam** aktarımdan sonra token tüketilir ve arşiv **R2'den silinir**; ikinci istek `410`. Aktarım yarıda kesilirse talep serbest bırakılır (yeniden denenebilir, dosya silinmez). Aynı süreçte eşzamanlı iki istekten yalnızca biri kazanır. |
| Yanıt | `200` `application/zip`, `Content-Disposition: attachment; filename="entegrasyonik-veri-disa-aktarma-<N>-<YYYYMMDD>.zip"`, `Content-Length` (biliniyorsa), `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`. İçerik **bellekte tamponlanmadan** R2 GetObject akışından istemciye pipe edilir. |
| Hatalar | `401` oturum yok · `403` owner değil / başka tenant · `400` token sorunu / tenant yok · `410` kullanılmış veya arşiv artık yok (yeni dışa aktarma isteyin) · `429` IP oran sınırı (vars. 20/10 dk; `EXPORT_DOWNLOAD_RATE_LIMIT_MAX/_WINDOW_MS`) · `500` depolama hatası (talep serbest bırakılır). |
| Denetim | Her sonuç `tenant.export.download` (`ok`/`fail`/`error`; `meta.reason`: `not_owner|bad_token|tenant_mismatch|already_used|gone|storage_error|aborted`). Token/anahtar YAZILMAZ. |

**Sınırlamalar (belgelenmiş):**
1. Tek-kullanım kaydı **süreç-içidir**; çok-replikada garantiyi asıl sağlayan, tam aktarım sonrası **R2'den silmedir** (silme başarısız olursa arşiv 24 sa token süresi boyunca yeniden indirilebilir; log `[ExportDownload] … silinemedi`). Replikalar arası eşzamanlı çift indirme penceresi çok küçük ama vardır (kalıcı çözüm: paylaşımlı atomik talep — Redis `SET NX` veya Mongo koşullu güncelleme; ölçek eşiği olunca).
2. `exportTenantData` ADR'den sapmayı sürdürür: istek içinde **senkron** paketler ve zip'i **bellekte** tamponlar (büyük tenant'ta zaman aşımı/bellek riski); indirme tarafı akıştır ama üretim tarafı değil. Arşivin "7 gün sonra silinmesi" için zamanlayıcı YOK (indirilmeyen arşivler R2'de kalır) — yaşam döngüsü kuralı/temizlik işi gerekli.
3. Token URL sorgu dizesinde taşınır (tarayıcı indirmesi için GET gerekli); sızıntı riski tek-kullanım + owner oturumu + tenant bağı + kısa ömürle sınırlandı (token tek başına işe yaramaz: oturum gerekir). Sunucu/proxy erişim logları sorgu dizesini kaydediyorsa token log'a düşer — proxy'de bu yolun sorgu dizesi maskelenmeli.
4. `Content-Length` R2'nin bildirdiği değerdir; sıkıştırma middleware'i zip (sıkıştırılamaz tür) için devreye girmez.

---

## 6. Politika kaydı eksik olan servis metotları (§b-2) — inceleme sonucu

| Metot | Karar | Kademe | Gerekçe / yapılan sertleştirme |
|---|---|---|---|
| `FinancialService.getFinancialSummary` | KAYDEDİLDİ | member | Salt okuma, tenant DB; `getTransactionData` ile aynı veri (`summary` alanı zaten onda var — `@deprecated`, ayrı özet kartı için). |
| `FinancialService.getCargoInvoices` | KAYDEDİLDİ | member | Salt okuma. **Eklendi:** en fazla 5000 satır (eskiden sayfasız/sınırsız). |
| `FinancialService.getPayoutDetails` | KAYDEDİLDİ | member | Salt okuma. **Eklendi:** `paymentOrderId` yalnızca string/sayı (nesne/operatör → `400`). |
| `ShipmentService.getShipments` | KAYDEDİLDİ | member | Salt okuma, `getOrders` ile aynı veri sınıfı. **Eklendi:** `pagination` eksikse `{1,15}` (eskiden TypeError/500), `limit` 1..100, `page` tamsayı ≥1 → aksi `400`. Not: stub — filtre/sıralama YOK (`sortBy` hesaplanıp uygulanmıyor); gerçek sevkiyat listesi (N15) yeni tasarım gerektirir. |
| `NotificationService.getUnreadCount` | KAYDEDİLDİ | member | `{isRead:false,isDeleted:false}` sayımı; tenant DB. |
| `OrderService.markAsPrinted` | KAYDEDİLDİ | member | Yalnızca yerel bayrak + `platformActions` push; dış çağrı yok. Not: sipariş bulunamazsa hata yerine `success:true, data:null` dönebilir (Mongoose `findByIdAndUpdate` null döner; doğrulanmadı/kozmetik; mevcut karakterizasyon testleri korunuyor). |
| `ClaimService.getClaimById` | KAYDEDİLDİ | member | Salt okuma; `customerId`/`orderId` populate (tenant'ın kendi müşterisi — `getCustomerDetail` ile aynı maruziyet). Yok → `500 "Talep bulunamadı."` (kozmetik). |
| `OrderService.updateOrderStatus` | **KAYDEDİLMEDİ (403)** | — | Doğrulamasız serbest statü yazımı; rezervasyon yaşam döngüsünü/pazaryerini atlar (ayrıntı: `OPERATION_POLICY.md`). |
| `ClaimService.updateClaimStatus` | **KAYDEDİLMEDİ (403)** | — | Doğrulamasız serbest statü + `history` push; `approveClaim`/`rejectClaim` akışlarını atlar. |
| `IntegrationService.retrieveOrdersFromIntegration` / `retrievePlatformProcesses` / `ECommerceService.*` | KAPSAM DIŞI | — | Talimat listesinde yoktu; `ECommerceService` kayıtlı bile değil. |

---

## 7. Yapılmayanlar / bilinen riskler (bulgu)

- **`platforms.<kanal>` FE'den bayat yazılabilir:** `updateProduct` `platforms` nesnesini (yükleme durumları + `stockSync.lastPublishedQty/dirty`) FE'nin okuduğu haliyle `$set` eder; motorun arada yazdığı yayın durumu ezilebilir (en kötü sonuç gereksiz yeniden yayın, oversell değil). Kapsam dışı bırakıldı; ürün formunun `platforms`'u göndermemesi veya sunucuda birleştirme gerekir.
- **`stock` alanı FE'den bayat yazılabilir:** kullanıcı düzenlemesi olduğundan `$set` devam ediyor; `stockVersion` optimistic guard yalnızca mutabakat yolunda kullanılıyor. Eşzamanlı sipariş + elle stok düzenlemesi lost-update riski taşır (ADR-0004 kapsamı dışı; sürüm kontrollü düzenleme önerisi).
- **ERP `saveClientErpSettings` whole-replace:** Bizimhesap motoru `erp.$.settings.catalog` (önbellek) yazıyor; genel kayıt ucu bunu siler (yalnızca yeniden çekim maliyeti). `stockPolicy` gibi korumaya alınmadı (talimat marketplace).
- **Mutabakat sonucu kalıcı değil** (N8) → `getStockOverview.reconciliation.tracked=false`.
- **Kimlik bilgisi "bağlantıyı test et" (`testConnection`)** yapılmadı: gerçek pazaryeri isteği gerektirir (sandbox/mock ortamı kararı).
- **`AuditLogs` `tid` indeksi** önerisi insan onayında (§4).
- **`getOrders`/`getClaims` `globalSearch`** kullanıcı girdisini `$regex` olarak kullanır (ReDoS/regex enjeksiyonu; aynı tenant içinde) — bu görevin kapsamı dışı, mevcut bulgu.
- `exportTenantData` senkron/bellek-içi zip ve 7 gün temizleme zamanlayıcısı yok (§5 sınırlama 2).

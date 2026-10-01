# API_STOCK_FEATURES — Faz-3 stok özellikleri (FE sözleşmesi)

Kaynak: `docs/research/COMPETITOR_GAP_2026-09-30.md` (öneri 1, 2, 3, 5), ADR-0004 (zero-oversell), ADR-0021 D14 (StockMovements), ADR-0029 (bildirim), ADR-0019 (yetenek kaydı).
Durum: backend hazır, **FE ekranı yok** (ADR-0015 sonrası; `OPERATION_POLICY` "backend-only" listesinde). Tüm uçlar `POST /api/<Servis>/<operasyon>` gövde JSON'udur; tenant sunucuda doğrulanmış kimlikten çözülür (gövdeden seçilemez). Hata: `{ statusCode: 400, message }` (zod + servis doğrulaması; bilinmeyen alan reddedilir).

## 1. Yetenekler ve kademeler

| Yetenek | RPC | Kademe / izin | Not |
|---|---|---|---|
| `stock.low_list` | `StockService/listLowStock` | member / `stock:read` | salt-okunur |
| `stock.movements.list` | `StockService/listMovements` | member / `stock:read` | salt-okunur |
| `stock.publish_lag.summary` | `StockService/getPublishLagSummary` | admin / `integrations:manage` | PLATFORM geneli (aşağıya bak) |
| `stock.policy.save` (mevcut) | `IntegrationService/saveTenantStockPolicy` | admin / `settings:manage` | `lowStockThreshold` eklendi |
| `stock.policy.save` (mevcut) | `IntegrationService/saveChannelStockPolicy` | admin / `settings:manage` | `safetyStock` eklendi |
| `stock.policy.get` (mevcut) | `IntegrationService/getStockPolicy` | admin / `settings:manage` | `lowStockThreshold` + `defaults.safetyStock` döner |

`stock:write` izni katalogda yoktur ve bu iş paketi yazma RPC'si eklemez (politika yazımı mevcut `settings:manage` ile).

## 2. Düşük stok

**Eşik (tenant, varsayılan YOK = kapalı):** `saveTenantStockPolicy { lowStockThreshold: int 0..1_000_000 | null, primaryChannel?: ... }` — en az biri zorunlu; `null` = kapat. Yanıt: `{ primaryChannel, lowStockThreshold }` (eşik yalnız istekte verildiyse döner).

**Ölçüt:** kullanılabilir stok `available = stock - reserved` (kanalın gördüğü/satabileceğimiz miktar). Eşik DAHİL: `available <= eşik`.

`StockService/listLowStock { threshold?: int, channel?: string, cursor?: string, limit?: 1..200 (vars. 50) }`

```jsonc
// eşik yok (istek+tenant)
{ "enabled": false, "threshold": null, "thresholdSource": null, "channel": null, "items": [], "nextCursor": null }
// eşik var
{ "enabled": true, "threshold": 5, "thresholdSource": "tenant|request", "channel": "trendyol|null",
  "items": [{ "variantId", "productId", "sku", "barcode", "stock", "reserved", "available",
              "channelPublishedQty" /* yalnız channel verildiyse; son yayınlanan adet veya null */ }],
  "nextCursor": "opak-imleç|null" }
```
Sıralama: `available` artan, sonra `_id` (en kritik önce). `channel` = yalnız o kanalda yayında (TRANSFER COMPLETED) varyantlar. `nextCursor` opaktır (base64url), olduğu gibi geri gönderilir. Sorgu tam tarama + `maxTimeMS` 10 sn (hesaplanan alan; `{stock:1}` indeksi yardım etmez, göç yazılmadı). Büyük tenant'ta yavaşlarsa tetikleyici: sorgu > 2 sn -> `lowStock` önhesaplı alan/ayrı koleksiyon (ADR gerektirir; şimdilik mock veri).

**Bildirim:** `STOCK_LOW` (kategori `stock`, `warning`, izin `stock:read`, varsayılan kanal in-app + e-posta özet, zorunlu DEĞİL). Üretim: `StockPublishTrigger` her 30 sn turunda stoğu değişmiş (`stockDirty`) varyantlarda eşik kontrolü yapar (ek sorgu yok). Params: `{ variantId, sku, available, threshold, day }`; ledger `dedupeKey = <variantId>:<gün>` (gün = Europe/Istanbul) => **günde en fazla bir kez / varyant**. Tur başına üst sınır 50 bildirim. Eşik yoksa hiç bildirim üretilmez. `NOTIFY_V2_ENABLED=false` iken (eski yol) üretilmez (yeni kod, legacy eşdeğeri yok). Eylem rotası: `/catalog/stock-health?low=1`.

## 3. Stok hareket defteri (`StockMovements`)

Tenant DB, ekleme-yalnız, ADR-0021 D14. **Saklama: 730 gün** (`purgeAt`, DATA_MODEL_CONVENTIONS §10 / ADR-0021 D14 — görev metnindeki "180 gün" yerine bağlayıcı belge esas alındı; değiştirmek insan kararı). Yazım **asenkron ve beklenmez** (X4 denetim deseni): hata istek/stok akışını etkilemez, `stock_movement_write_failures_total` sayacı artar; tekrar oynatma `{ref.key, reason}` unique ile sessiz yutulur.

Yazan yollar (tek yardımcı `operations/stock/stockMovements.ts`):

| `reason` | Kaynak |
|---|---|
| `order_reserve` | `StockAllocator.reserve` (+ `retryOversold`) |
| `order_commit` | `StockAllocator.commit` (RESERVED->COMMITTED: `delta 0`, `stockAfter` fiziksel düşüşü gösterir; ilk-kez sevk/OVERSOLD: `delta -qty`) |
| `order_release` | `StockAllocator.release` (yalnız RESERVED iptali; OVERSOLD/mezar taşı stok etkilemez -> satır yok) |
| `return_restock` | `StockAllocator.restock` (politika açıksa) |
| `manual_set` | kullanıcı düzenlemesi: `ProductService.updateProduct`, `VariantService.updateVariants/batchProcessUpdate` (aktör `user`) |
| `reconcile` | `InternalReconciliationJob` (`reserved` düzeltmesi) |
| `manual_adjust`, `import` | enum'da tanımlı, **henüz yazan yol yok** (import ilk stoğu; görev dışı bırakıldı) |

Not: `ExternalReconciliationJob` stok DEĞİŞTİRMEZ (yalnız `stockDirty` işaretler) -> hareket yazmaz. Görev metnindeki ad eşlemesi: `release`=`order_release`, `restock`=`return_restock`, `user_edit`=`manual_set` (ADR-0021 D14 adları).

`StockService/listMovements { variantId?: ObjectId-hex | barcode?: string (YALNIZ BİRİ), from?: ISO, to?: ISO, cursor?, limit?: 1..200 (vars. 50) }`

```jsonc
{ "variantId": "…|null", "nextCursor": "…|null",
  "items": [{ "movementId", "at", "reason", "delta", "before", "after", "stockAfter", "channel", "sku",
              "ref": { "kind": "order|claim|request|job", "id": "…" }, "actor": { "type": "system|user|agent", "id": "…" } }] }
```
`delta/before/after` = KULLANILABİLİR stok; `stockAfter` = fiziksel stok. Sıralama en yeni önce (`at` azalan). Dış sipariş anahtarı (`ref.key`) yanıtta DÖNMEZ. Barkod bulunamazsa `items: []`. Göç 0015 çalıştırılana dek indeksler yoktur (koleksiyon boş/yavaş olabilir).

## 4. Yayın gecikmesi (p50/p95)

`StockService/getPublishLagSummary { window?: "1h" | "24h" (vars. "1h") }` — `stock_publish_lag_ms` (düzenleme/rezervasyon `stockDirtyAt` -> Sentinel COMPLETED) histogramı `MetricRollups`'tan: `1h` = 5 dk kovaları, `24h` = 1 sa kovaları. Pod'lar 60 sn'de bir flush eder (henüz flush edilmemiş gözlemler görünmez).

```jsonc
{ "window": "1h", "resolution": "5m", "from": "…", "to": "…", "scope": "platform",
  "total": { "count", "avgMs", "p50Ms", "p95Ms", "p50Overflow", "p95Overflow", "maxBucketMs": 60000, "overflowCount" },
  "byIntegration": [{ "integration": "trendyol", /* total ile aynı alanlar */ }] }
```
**Kapsam uyarısı:** metrik etiketi `integration` taşır, tenant taşımaz (ADR-0017 kardinalite) -> özet TÜM tenant'lar içindir; bu yüzden kademe admin+ (backoffice/izleme amaçlı). Tenant'a özgü gecikme bu metrikle verilemez.
**X12 (KAPANDI, 2026-09-30):** `stock_publish_lag_ms` artık `long` kova setiyle (…60 sn, 120 sn, 300 sn, 15 dk, 30 dk, 1 sa, +Inf) `h_long` alanına yazılır; diğer metriklerin varsayılan 60 sn'lik seti değişmedi. SLO "stok yayın p95 ≤ 2 dk" `total.p95Ms ≤ 120000` ile doğrulanır; `p95Overflow:true` yalnız p95 1 saati de aşarsa (`maxBucketMs: 3600000`). Eski rollup satırları (60 sn kovalı `h`) okunurken uyarlanır: eski +Inf (>60 sn, gerçek değer bilinmiyor) overflow sayılır, uydurma değer yok (5dk satır 7 g / 1sa satır 90 g TTL ile kendiliğinden kaybolur).

## 5. Kanal güvenlik stoğu

`saveChannelStockPolicy { integrationCode, stockPolicy: { safetyStock: int 0..1_000_000 | null, ... } }` (`null` = varsayılana döndür). Kanala yayınlanan: `base = max(0, available - safetyStock)`, sonra mevcut ADR-0004 formülü: `publish = clamp(base - max(bufferUnits, floor(base*bufferPercent/100)), 0, kanalMax)`. **Varsayılan 0 = bugünkü davranış** (karakterizasyon testi: `tests/characterization/stock/StockFeatures.ledger.test.ts`). Hesap TEK yerde: `StockPublishTrigger.applySafetyStock` (transformer'lara dokunulmaz). `getStockPolicy` kanal başına `stockPolicy.safetyStock` (yalnız ayarlıysa) ve `defaults.safetyStock: 0` döner.

## 6. Göç ve operasyon

- `backend/migrations/0015-stock-movements-tenant.js` (scope `tenant`): `StockMovements` indeksleri (`variantId_1_at_-1`, partial unique `uniq_refkey_reason`, TTL `ttl_purge_at`). **Çalıştırılmadı** (kural 3: yedek + önce yerel; Atlas ayrı onay). Manifest güncellendi (`migrations/index-manifest.json`).
- Variants için `{stock:1}` göçü YAZILMADI (gerekçe: §2).
- Tenant dışa aktarımına `stock_movements.ndjson` eklendi.

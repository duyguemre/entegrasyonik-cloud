# P3A raporu — ADR-0024 Dalga 3: P3-INT + P3-ORD (bulut, `cloud/be-p3a`)

Tarih: 2026-10-01. Taban: `origin/cloud/be-p2move` @ `1f0f430d`. Dal: `cloud/be-p3a`.
Kapsam: davranışı koruyan yeniden düzenleme. RPC adları, yanıt biçimleri, mongoose çağrı argümanları, hata iletileri ve
try/catch sınırları değişmedi. Karakterizasyon testleri ve snapshot'lar **değişmeden** yeşil kaldı. Testlerde yalnız taşınan
dosyaların içe aktarma yolları ve bir statik taramadaki dosya yolu dizgesi değişti.

## 1. Alan bazlı özet

### P3-INT — `integration-service.ts`

Handler **1525 → 262 satır** (cephe ≤ 300 hedefi tuttu). Handler'daki `getXModel()` çağrısı **38 → 0**.

| Yeni / taşınan | İçerik |
|---|---|
| `operations/integrations/settings.ts` | Platform kataloğu listesi (K8 `urls` süzgeci) ve tenant kanal ayarları: okuma maskeli; yazmada sır koruma + şifreleme + K7 URL alanı yok sayma; e-ticaret `$set/$unset`; pazaryeri sıralaması; webhook token rotasyonu; `IntegrationFactory` önbellek düşürme |
| `operations/integrations/stockPolicy.ts` | `getStockPolicy`, `saveTenantStockPolicy`, `saveChannelStockPolicy` (N5 / ADR-0004) |
| `operations/integrations/health.ts` | Eski `operations/integration/IntegrationHealthOperations.ts`. Codemod ile taşındı, içerik aynı |
| `operations/integrations/platformLookup.ts` | Kategori, marka, nitelik, nitelik değeri, komisyon ve platform bilgisi vekil okumaları |
| `operations/integrations/importJobs.ts` | İçe aktarma isteği, iş listesi, tekil iş, arşiv, iş raporu. `IMPORT_JOB_SORT_FIELDS` buraya taşındı |
| `operations/integrations/exportJobs.ts` | MM-02: `advancedSearchExportJobs` ve `getExportJobs` aynı `ExportJobRepository.search`'ü kullanır. Yalnız filtre kurucuları ayrı. Ayrıca iş detayı |
| `integration/engine/catalog/export/ExportBatchService.ts` | `batchCreator`'ın arka plan gövdesi (eski `internalProcessBatch` + `flushIntegration` + öncelik skoru) |
| `database/repositories/tenant/ClientIntegrationRepository.ts` | `ClientIntegrations` belgesi |
| `database/repositories/tenant/ExportJobRepository.ts` | `ExportStagedProducts`. ADR `app/` diyor, ama model staging göçünden beri tenant DB'de; bu yüzden `tenant/` altında |
| `database/repositories/tenant/ImportStagingRepository.ts` | İçe aktarma ara tabloları ve iş raporu |
| `database/repositories/tenant/IntegrationLinkRepository.ts` | Ürünün kanal "hazır" bayrağı ve marka eşleme upsert'ü. Katalog alanının kendi repository'leri P3-CAT'te; ad çakışmasın diye dar ad seçildi |
| `database/repositories/app/ImportJobRepository.ts` | `ImportJobs`. Her sorgu `clientId` ile süzülür (L-04) |
| `database/repositories/app/IntegrationCatalogRepository.ts` | `Integrations`, `IntegrationTypes`, `ExportSignals.nextRunAt`, `Clients.integrations.$.webhookToken` |

- `batchCreator` hâlâ hemen yanıt döner. Handler'daki `private internalProcessBatch` bir satırlık delegedir, çünkü NB3 testi bu metodu doğrudan çağırıyor.
- Ölü metot kalmadı. ADR'de sayılan `saveOrUpdateIntegrationCategory`, `retrievePlatformProcesses`, `retrieveOrders` ve `retrieveOrdersFromIntegration` daha önceki dalgalarda silinmiş.
- Kalan tüm uçlar `operationPolicy` ve yetenek kaydında kayıtlı ve FE'den çağrılıyor.
- `retrieveAndSetExternalToken` boş gövdeli ama kayıtlı ve FE çağırıyor. Davranış (`undefined`) korundu; yorumla işaretlendi.

### P3-ORD — sipariş alanı handler'ları

| Handler | Satır önce → sonra | `getXModel()` önce → sonra | Repository | İş kuralları |
|---|---|---|---|---|
| order-service | 715 → 65 | 13 → 0 | `tenant/OrderPanelRepository` | `operations/orders/{orderList,orderActions,dashboard}` |
| claim-service | 347 → 48 | 8 → 0 | `tenant/ClaimPanelRepository` | `operations/orders/claims` |
| customer-service | 230 → 60 | 9 → 0 | `tenant/CustomerPanelRepository` | `operations/orders/customers` |
| message-service | 212 → 63 | 7 → 0 | `tenant/MessagePanelRepository` | `operations/orders/messages` |
| invoice-service | 434 → 74 | 13 → 0 | `tenant/InvoicePanelRepository` | `operations/orders/invoices` |
| shipment-service | 283 → 58 | 6 → 0 | `tenant/ShipmentPanelRepository` | `operations/orders/shipments` |
| financial-service | 310 → 149 | 4 → 0 | `tenant/FinancialPanelRepository` | `operations/finance/financialPanel` (mevcut `commission*` modüllerine dokunulmadı) |

- **Motor repository taşıması** (codemod, `dev-tools/codemods/maps/p3a-1-repos-ops.json`):
  - `integration/engine/order/{Order,Claim,Customer,Invoice,Message,Financial}Repository.ts` → `database/repositories/tenant/`.
  - `orderRequiredGuard.ts` de taşındı. Yalnız `OrderRepository` kullanıyor; taşınmasaydı `database → integration` ters bağımlılığı doğardı.
  - Motor tarafında (`OrderWorker`, `OrderOrchestrator` testleri vb.) yalnız içe aktarma ve `jest.mock` satırları değişti.
- **`PostOrderOperations` taşıması:** `operations/integration/PostOrderOperations.ts` → `operations/orders/postOrder.ts` (codemod).
- **Ad ayrımı:** motorun içe alım repository'leri eski adlarını korur. Panel (RPC) sorguları ayrı `*PanelRepository` sınıflarındadır.
- **Ölü metot:** `updateOrderStatus` ve `updateClaimStatus` daha önce silinmiş. 403 testleri kayıt düzeyinde geçiyor.
- **Ek silme:** P3-ORD'da yalnız bilgi eklemeyen `catch (e) { throw e }` blokları silindi.

### Ortak desen

- **Repository kurucusu:** DB tutamacını alır (ADR-0016 §5.1).
  - `clientId` parametresi yoktur.
  - Uygulama DB'sindeki tenant kapsamlı tablolar için tenant numarası kurucudadır.
  - Model her çağrıda `getXModel()` ile alınır. Tutamaç yoksa sorgu anında TypeError oluşur; bu mevcut davranıştır.
- **Handler:** repository'yi çağrı anında kurar. Bu yüzden testlerin `svc.clientDB = {...}` ataması ve `jest.mock('@integration/modules/IntegrationFactory')` gibi modül sahteleri yeni katmanlara da ulaşır.
- **Hata günlükleri:** RPC yanıtına `{ success:false }` olarak dönen hataların `console.error` satırları handler'da kalır. Operations'a geri çağrı (`onError`/`logError`) olarak verilir.
- **İstisna:** `ExportBatchService`'teki 7 `console` çağrısı gövdeyle birlikte taşındı.
- **`facetPage`/`parseListQuery` benimsenmedi.** Karakterizasyon testleri mevcut `$facet` biçimini ve `aggregate + countDocuments` çağrı biçimini sabitliyor. Geçiş yanıt ve çağrı şeklini değiştirir; ayrı ve kasıtlı bir adım olarak, testler etiketli güncellenerek yapılmalı.

## 2. Satır azalması

- **8 handler:** 4056 → 779 satır (**−3277, −%81**). Handler `getXModel()`: **98 → 0**.
- **Taşınan mantık:** yeni repository/operations dosyalarına ~3100 satır taşındı. Kod silinmedi, yer değiştirdi.
- **Net `src` farkı (taban → HEAD):** 47 dosya, +3660 / −3562.
- **Lint uyarıları:**
  - `no-useless-catch` 128 → 87
  - `no-var` 34 → 29
  - `no-unused-vars` 8 → 7
  - Ratchet baseline aşağı çekildi.

## 3. Kapılar (son koşu, `backend/`)

| Kapı | Sonuç |
|---|---|
| `npm run typecheck` | yeşil |
| `npm run lint` | 0 hata (yalnız uyarı) |
| `npm run depcruise` | 0 hata, 3 uyarı (`no-circular`, tabanla aynı) |
| `npm run build` | yeşil |
| `npm run test:all` (`jest`) | 451 suite / 7546 test. **Tabanla birebir aynı** sonuç: 426 suite ve 7235 test geçti. Başarısızlar aşağıda, hepsi taban dalında da aynı |
| `npm run ratchet` | eslint, depcruise ve unusedLocals mandalları OK. `knip exports 20 → 22` **tabanda da 22** (bu dalın eklediği yok; geçici iki handler yeniden-dışa-aktarımı kaldırıldı) |
| İlgili modül koşuları | integration-service, idor, notification, tenant, security, configuration, tenant-surface, api, capabilities, catalog contract: 75 suite / 994 test yeşil. Sipariş alanı: order/claim/customer/message/invoice/financial/trendyol-finance + tüm `orders`/`stock`/`engine` karakterizasyonları yeşil |

**Atlanan ya da başarısız testler (tabanda da aynı, bu işten bağımsız):**

- `tests/mongo-semantics/**`: 19 suite.
  - `mongodb-memory-server` ikilisi indirilemiyor (`fastdl.mongodb.org` 403, bulut ağ politikası).
  - Yerelde koşulmalı: `npm run test:integration:mocked`.
- `tests/characterization/orders/N11.internalOrderSnapshot`: snapshot saat dilimine bağlı (`orderDate` 05:30Z ↔ 08:30Z). Konteyner UTC'de, tabanlar Windows/TR saatinde üretilmiş.
- `tests/characterization/auth/operation-policy.test.ts`: FE envanteri sapması (frontend tarafındaki son değişiklikler).
  - `IntegrationService/retrieveCategories` FE'den çağrılıyor, ama kayıtta yok.
  - `VariantService/*` uçları kayıtlı, ama FE'den çağrılmıyor.
  - 3 yeni dinamik `restApi` çağrı dosyası var.
  - Backend RPC kaydı bu dalda değişmedi.
- `tests/characterization/search-safety/NoRawRegex.static.test.ts`: `api/admin/engineOps.ts:201` (P3 dışı dosya).
- `tests/static/integrationPlaybook.static.test.ts`: playbook açık tabanı (P3 dışı).
- `tests/unit/platform/errorCodes.docs.test.ts`: `docs/ERROR_CODES.md`'de `VIEW_LIMIT` satırı eksik (`UPDATE_ERROR_CODES=1` ile üretilir; P3 dışı).
- **Bulut ortamı notları:**
  - `knip` için `oxc-parser`/`oxc-resolver` linux yerel ikilileri kilit dosyasında yok. `npm i --no-save @oxc-parser/binding-linux-x64-gnu@0.150.0 @oxc-resolver/binding-linux-x64-gnu@11.24.2` ile koşuldu; `package*.json` değişmedi.
  - `scripts/cloud-setup.sh`'teki `playwright install` 403 verdi (önceden kurulu Chromium var).
- **Yetenek ve parite sayıları:** `capabilities/**`, `operationPolicy` ve RPC girdi şemalarına dokunulmadı. `permission-parity`, `policy-and-idor`, `writeRpcInputX5`, `liveReadonly*` ve `intakeRpcGuard` testleri yeşil.

## 4. Site kanıt yolları

- `site/src/data/**` taşınan dosyaların hiçbirine atıf yapmıyor: motor sipariş repository'leri, `IntegrationHealthOperations`, `PostOrderOperations`. Olduğu gibi kaldı. Atıf yapılan `OrderWorker.ts` yerinde.
- `site/tests/claims.test.ts` bulutta 89 kanıt için "dosya yok" veriyor: kökteki `INTEGRATIONS_REGISTRY.md` vb. bulut kopyasında yok. Taban dalla aynı; P3 kaynaklı değil.
- FE yorumundaki tek yol (`frontend/src/composables/useIntegrationHealthApi.ts`) yeni yola güncellendi.

## 5. Commit'ler (`cloud/be-p3a`)

1. `19c9f8cd`: motor order repository'leri → `database/repositories/tenant`, `IntegrationHealthOperations` → `operations/integrations/health`, `PostOrderOperations` → `operations/orders/postOrder` (codemod)
2. `e6c93647`: order-service ince cephe
3. `f080c189`: claim/customer/message-service ince cephe
4. `c0e2742a`: integration-service bölmesi (D6)
5. `d50b4513`: invoice/shipment/financial-service ince cephe
6. (bu rapor ile) ratchet baseline iyileşmeleri + `docs/TESTING.md` "Alan paketleri" notu

## 6. Birleştirme notları (orkestratör)

- **P3B ile çakışma:**
  - Dosya düzeyinde çakışma beklenmez. `database/repositories/_shared/` değişmedi.
  - Yeni repository adları katalog/yönetim adlarıyla çakışmasın diye alan önekli (`*PanelRepository`, `IntegrationLink`, `IntegrationCatalog`, `ImportJob`, `ExportJob`, `ImportStaging`, `ClientIntegration`).
  - **Tek ortak dosya `quality/baseline.json`:**
    - Bu dal: `integration-service` 15→8, `ExportBatchService` +7, `PostOrderOperations` anahtarı → `operations/orders/postOrder.ts`, `otherByRule` iyileşmeleri.
    - P3B: kendi taşımaları (ör. `services/image/image-operations.ts` anahtarı).
    - Birleştirmede iki tarafın değerleri alınır, sonra `npm run ratchet` çalıştırılır.
- **`ERROR_CODES` / `capabilities/domains/*`:** değişiklik yok.
- **F-02:** `integration/engine/order/*` içinde yalnız içe aktarma satırları değişti (`OrderWorker.ts`).

## 7. Yerelde gerçek Mongo/Redis ile doğrulanacaklar

1. `npm run test:integration:mocked`: bulutta indirme engeli yüzünden koşamayan 19 `mongo-semantics` suite'i.
2. `npm run test:integration` (gerçek yerel Mongo): özellikle `StockAllocator.concurrency`, `mongoLease` ve sipariş içe alımı. Motor repository'leri yalnız taşındı, sorgu değişmedi.
3. `npm run start:local` (egress guard) duman testi. FE ile şu akışlar uçtan uca denenmeli:
   - sipariş listesi, filtre ve pano
   - iptal/onay (mock pazaryeri)
   - iade listesi ve detayı
   - müşteri listesi, güncelleme ve anonimleştirme
   - mesaj listesi ve yanıt
   - fatura oluşturma ve uyumsuzluk çözümleme
   - kargo oluşturma
   - finans ekstresi ve kargo faturaları
   - entegrasyon ayarlarını kaydet/oku (sır maskesi, `enc:v1:`)
   - stok politikası kaydetme
   - webhook token üretme
   - içe aktarma başlatma (ImportJob + orkestratör uyanışı)
   - toplu dışa aktarma (`batchCreator` → ExportStagedProducts + ExportFlags + bildirim)
   - dışa aktarma log listesi ve detayı
4. `N11.internalOrderSnapshot` snapshot'ı Windows/TR saatinde yeşil olmalı. Bulutta yalnız saat dilimi farkıyla kırık.
5. `npm run knip` ve `npm run ratchet`: yerelde `knip exports` 22 → baseline 20 farkı. P3 dışı iki export (taban) ya temizlenmeli ya da baseline gerekçeyle güncellenmeli.
6. `site` claims testi kök belgeler mevcutken yeşil olmalı.

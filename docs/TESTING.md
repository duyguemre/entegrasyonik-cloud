# Test rehberi (backend)

Tüm komutlar `backend/` içinden. Mevcut test dosyaları taşınmadı; katman ve modül seçimi yol desenleriyle yapılır
(`backend/tests/tools/run-tests.js`; tablo: `npm run test:modules`). Süreler paralel ajan/CI yükü olmayan makine için
yaklaşıktır (yük altında 2-3x). Tam koşu: ~253 suite / ~3800 test / ~55 sn.

## Komutlar

| Komut | Kapsam | Süre |
|---|---|---|
| `npm test` / `npm run test:all` | Tüm varsayılan koşu (gerçek-Mongo hariç) | ~55 sn |
| `npm run test:unit` | `tests/unit`, `static`, `dev`, `smoke` | ~10-20 sn |
| `npm run test:characterization` | `tests/characterization` (`*.contract.test.ts` hariç) | ~45-70 sn |
| `npm run test:contract` | `tests/contract` + her yerdeki `*.contract.test.ts` | ~10 sn |
| `npm run test:integration:mocked` | `tests/mongo-semantics` (mongodb-memory-server, gerçek Mongo DEĞİL) | ~6 sn |
| `npm run test:integration` / `:real` | `tests/integration` — GERÇEK yerel Mongo (bkz. aşağı) | elle |
| `npm run test:module -- <ad>` | Tek modül: trendyol, hepsiburada, n11, pazarama, ideasoft, bizimhesap, common, cache, api, auth, integration-engine, engine, catalog, orders, stock, config, secrets, tenant, billing, platform, database, compliance, notification (ADR-0029: katalog, notify çekirdeği, defter; `notifications` takma adı). `integration/trendyol` gibi önek kabul edilir; bilinmeyen ad ham yol regex'i sayılır | 5-45 sn |
| `npm run test:mcp` | MCP-5 (ADR-0035): OAuth + `/mcp` + bant dışı onay + P10 eşitlik matrisi (rol × access × kapsam × LIVE_READONLY × bakım × entitlement × imp × kill-switch, ~1160 hücre) + güvenlik regresyonları (prompt-injection fikstürü, kapsam yükseltme, rol düşürme, token çalınması, iptal, çerez/Bearer karışımı, sızıntı, tenant) + statik mandallar (refVerifiers kapsamı, çerez/log hijyeni, onay mandalı); DB/Redis/ağ yok | ~15 sn |
| `npm run test:agent` | Sohbet aracı (ADR-0034): protokol, broker, araç turetimi, onay, BYOK, entitlement + onay mandalı | ~10 sn |
| `npm run test:api` | `api` modülü | ~15 sn |
| `npm run test:integration-engine` | Motor + katalog + kuyruk + siparişler + adaptör testleri + kontratlar | ~50 sn |
| `npm run test:adapters` | trendyol + common | ~30 sn |
| `npm run test:changed` | `jest --onlyChanged` (git'te değişen dosyalarla ilişkili testler) | değişkene bağlı |
| `npm run test:related -- <dosya...>` | `jest --findRelatedTests` (verilen kaynak dosyalar) | değişkene bağlı |
| `npm run test:timing` | Tam koşu + `coverage/test-timing.json` (suite süre raporu) | ~55 sn |
| `npm run test:cov`, `npm run verify` | Değişmedi (CI): kapsam mandalı; typecheck+lint+cov+ratchet | — |

Ek jest argümanı: `npm run test:module -- trendyol --coverage=false -t "429"`.

## Hangi durumda hangi komut

- Küçük değişiklik: `test:changed` veya `test:related -- src/...dosya.ts`, ardından ilgili `test:module -- <ad>`.
- Adaptör (trendyol/hepsiburada/n11/pazarama/ideasoft/bizimhesap) değişikliği: `test:module -- <adaptör>` + `test:module -- common`.
- Ortak katman (`common`, `ResilientHttpClient`, cache, `IntegrationFactory`): `test:integration-engine` tamamı (+ `test:module -- cache`).
- API/servis/auth: `test:api`.
- İş bitimi / büyük değişiklik: `npm run test:all && npm run typecheck && npm run lint && npm run ratchet` (veya `npm run verify`).

## Kaynak yerleşimi ve dosya taşıma (ADR-0024 P2-MOVE)

`src/api/` ağacı: `rpc/` (ApiManager, RunOperation, BaseApi, operationPolicy, servis kaydı `index.ts`, RPC kancaları),
`rpc/handlers/` (`<ad>-service.ts`, eski `api/services`), `rpc/dto/`, `http/` (authenticate, originCheck, clientLog,
membershipAuthz + mevcut http rotaları), `webhooks/`, `files/` (ImageApiManager, ExportDownloadApiManager), `admin/`, `oauth/`.
`Webserver.ts` → `src/bootstrap/Webserver.ts`. Dosya taşımak için elle düzenleme yerine dönüştürücü kullanılır:
`node dev-tools/codemods/move-module.js <harita.json>` (kuru çalıştırma) → `--write` (git mv + `import`/`require`/`jest.mock` yolları).
`tests/static/noMockedShim.static.test.ts`: `jest.mock` hedefi yalnız yeniden-dışa-aktarma (shim) dosyası olamaz.

**Dalga 3 / P3-INT + P3-ORD (entegrasyon ve sipariş alanı):** handler'lar ince cephedir; iş kuralları `operations/integrations/`
(`settings`, `stockPolicy`, `health`, `jobs`, `platformLookup`) ve `operations/orders/` (`orders`, `dashboard`, `claims`, `customers`,
`messages`, `invoices`, `shipments`, `postOrder`) + `operations/finance/transactions`, sorgular `database/repositories/{app,tenant}/`.
Tenant repository'leri kurucuda tenant DB tutamacını alır (`new OrderRepository(clientDB)`); motorun ingest yöntemleri (eski
`integration/engine/order/*Repository`) aynı sınıflarda `clientId` ile çalışır. Toplu dışa aktarım paketi:
`integration/engine/catalog/export/ExportBatchService`. Karakterizasyon testleri handler'ı sahte `clientDB` modelleriyle çağırır;
repository yöntemleri model çağrı biçimini (argüman sayısı dahil) birebir korur. İlgili koşular: `test:module -- orders`,
`test:module -- stock`, `test:api`, `test:module -- catalog`, `test:module -- engine`.

## Gerçek-Mongo testleri neden varsayılan koşuda değil

`tests/integration/*` (`*.realmongo.test.ts`, `mongoLease`, `StockAllocator.concurrency`, `realMongoTestDb.selfcheck`) yerel
MongoDB'ye (`127.0.0.1`, izinli DB listesi, `zzTest_` önekli geçici DB/koleksiyonlar) bağlanır. `jest.config.js`
`testPathIgnorePatterns` bunları hariç tutar; böylece `npm test`/CI Mongo'suz yeşil kalır ve CLAUDE.md kural 2/5 ihlal
edilemez. Tüm katman komutları da bu dizini ayrıca dışlar. Yalnız yerel Mongo çalışıyorken `npm run test:integration`.
Bellek-içi Mongo isteyen `tests/mongo-semantics` varsayılan koşuda çalışır (`test:integration:mocked`).

Kural: yeni test varsayılan olarak mock'lu; gerçek DB gerektiriyorsa `tests/integration/` altına `*.realmongo.test.ts` olarak.
Ayrıntı ve DB kuralları: `backend/tests/README.md`.

## Log doğrulama (F-06)

Motor/adaptör kodu `console.*` yerine `eventLog` (yapılandırılmış JSON, stdout) kullanır. Testlerde `console` casusu yerine
`tests/helpers/logCapture.ts::captureLogs()` kullan: satırlar (`level, code, msg, err.message, correlationId, ...`) toplanır ve
`expect(cap.lines).toContainEqual(expect.objectContaining({ level: 'error', code: '...' }))` ile doğrulanır. Şema/maskeleme/
fingerprint testleri: `tests/unit/platform/logger.eventLog.test.ts`, `logger.masking.test.ts`; correlation taşıma:
`tests/unit/integration/correlation.propagation.test.ts`; çağrı log/metrik: `tests/unit/integration/ResilientHttpClient.observability.test.ts`.

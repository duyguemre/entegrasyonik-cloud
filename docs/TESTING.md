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

## Alan paketleri: repository + operations + ince handler (ADR-0024 Dalga 3)

Sorgular `src/database/repositories/{tenant,app}/` altında (kurucu DB tutamacını alır; `clientId` parametresi yok, model her
çağrıda `getXModel()` ile alınır), iş kuralları `src/operations/<alan>/` altında, handler yalnız cephe. Handler karakterizasyon
testleri `svc.clientDB = { getXModel: jest.fn(...) }` atamasıyla çalışmaya devam eder: repository handler'da çağrı anında kurulur,
bu yüzden test sahteleri ve `jest.mock('@integration/modules/IntegrationFactory')` gibi modül sahteleri yeni katmanlara da ulaşır.
Motor içe alım repository'leri (`OrderRepository`, `ClaimRepository`, ...) `database/repositories/tenant/`'tadır; panel (RPC)
sorguları ayrı `*PanelRepository` sınıflarındadır. Paket testi: `test:module -- orders`, `test:api`, `test:integration-engine`.

## Gerçek-Mongo testleri neden varsayılan koşuda değil

`tests/integration/*` (`*.realmongo.test.ts`, `mongoLease`, `StockAllocator.concurrency`, `realMongoTestDb.selfcheck`) yerel
MongoDB'ye (`127.0.0.1`, izinli DB listesi, `zzTest_` önekli geçici DB/koleksiyonlar) bağlanır. `jest.config.js`
`testPathIgnorePatterns` bunları hariç tutar; böylece `npm test`/CI Mongo'suz yeşil kalır ve CLAUDE.md kural 2/5 ihlal
edilemez. Tüm katman komutları da bu dizini ayrıca dışlar. Yalnız yerel Mongo çalışıyorken `npm run test:integration`.
Bellek-içi Mongo isteyen `tests/mongo-semantics` varsayılan koşuda çalışır (`test:integration:mocked`).

Kural: yeni test varsayılan olarak mock'lu; gerçek DB gerektiriyorsa `tests/integration/` altına `*.realmongo.test.ts` olarak.
Ayrıntı ve DB kuralları: `backend/tests/README.md`.

## Kalite kapısı (ADR-0024 P4-GATE)

`npm run depcruise`: ihlali sıfır olan tüm katman kuralları `error` (tek `warn`: `no-circular`, mandallı). `npm run ratchet`
(`quality/check-ratchets.js`, ölçüm `quality/baseline.json`'a göre ARTAMAZ): `no-console` dosya başına, diğer eslint uyarıları
kural başına, depcruise kural başına, `noUnusedLocals`, knip ve `handlers` — `src/api/rpc/handlers/**` dosya başına satır
(yalnız 400'ü aşanlar; yeni handler 400'ü aşamaz, aşan büyüyemez) ve dosya başına `getXModel()` çağrısı (depo katmanına
taşındıkça azalır). Azalma `npm run ratchet:update` ile kilitlenir. `src/api/**` için `no-console` eslint `error`'dur.
Bulutta knip için Linux yerel bağlayıcısı lockfile'da kurulmuyorsa: `npm i --no-save @oxc-parser/binding-linux-x64-gnu@<sürüm>
@oxc-resolver/binding-linux-x64-gnu@<sürüm>` (sürümler `package-lock.json`'da).

## Log doğrulama (F-06)

Motor/adaptör kodu `console.*` yerine `eventLog` (yapılandırılmış JSON, stdout) kullanır. Testlerde `console` casusu yerine
`tests/helpers/logCapture.ts::captureLogs()` kullan: satırlar (`level, code, msg, err.message, correlationId, ...`) toplanır ve
`expect(cap.lines).toContainEqual(expect.objectContaining({ level: 'error', code: '...' }))` ile doğrulanır. Şema/maskeleme/
fingerprint testleri: `tests/unit/platform/logger.eventLog.test.ts`, `logger.masking.test.ts`; correlation taşıma:
`tests/unit/integration/correlation.propagation.test.ts`; çağrı log/metrik: `tests/unit/integration/ResilientHttpClient.observability.test.ts`.

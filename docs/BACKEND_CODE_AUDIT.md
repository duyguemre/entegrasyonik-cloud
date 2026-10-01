# BACKEND KOD DENETİMİ — Gereksiz Dosyalar, Mimari, Eksik Yetenekler, Teknik Borç

Tarih: 2026-09-28 · Kapsam: `backend/**` (+ repo kökündeki `gitlab/`, `mockserver/`, kök dosyalar yalnızca "gereksiz dosya" açısından) · Yöntem: salt okuma denetimi + tek seferlik analiz araçları (kod DEĞİŞTİRİLMEDİ, hiçbir dosya silinmedi, `package.json` dokunulmadı, DB/Redis/ağ kullanılmadı).
Taban: `faz3-arayuz` ucu `451dda5` (worktree `git reset --hard faz3-arayuz` ile hizalandı).

## 0. Yöntem, araçlar, ölçülen tabanlar, sınırlar

| Araç / ölçüm | Sonuç |
|---|---|
| `npx knip@6.38` (yapılandırmasız; `entegrasyonik.ts` girdi) | 6 kullanılmayan dosya, 2 kullanılmayan bağımlılık (`axios-rate-limit`, `nodemailer`) + 1 devDep (`@types/nodemailer`), 33 kullanılmayan export, 24 kullanılmayan export tipi, 2 tekrarlı export; "unlisted": `ioredis`, `lru-cache` (bildirilmemiş, transitif), `@jest/globals` (116 test dosyası), `ncc` (script) |
| `npx depcheck` | `axios-rate-limit` kullanılmıyor (knip ile hemfikir) |
| `npx madge --circular` (321 dosya) | 2 döngü, ikisi de yalnızca tip dosyalarında: `interfaces/index.ts ↔ interfaces/platforms/index.ts` (+ `platforms/marketplace/index.ts`) |
| `tsc --noEmit --noUnusedLocals` | src+entegrasyonik.ts'te **131** hata (kullanılmayan yerel/import); `--noUnusedParameters` **116** |
| `npm audit --omit=dev` | 0 critical · **3 high** (nodemailer, sharp, xlsx) · **2 moderate** (qs, uuid); nodemailer/uuid kullanım yolu ölü/ikame edilebilir (aşağıda) |
| `npx jest --coverage` (`StockAllocator.concurrency` hariç) | **111 suite / 1806 test yeşil**; satır **%54,2** (7066/13288 ifade %53,2), dal **%35,2**, fonksiyon **%42,8** |
| Tekrar koşum (5 tam koşu) | 1 koşuda `ResilientHttpClient.test.ts` başarısız (bkz. TB-02); 4 koşu tam yeşil |
| Ölçek | `src` 311 `.ts` / 36 253 satır (+ `commissions.json` 63 002 satır); `tests` 23 038 satır; `api/services` 8 269 satır (27 dosya + 1 `.ts1`); `integration/modules` 11 092; `integration/engine` 4 634 |

Kanıt kuralı: her bulgu `dosya:satır` içerir; koddan çıkarılamayan/koşturulmayan noktalar "**doğrulanamadı**" diye işaretlidir. Boyut ölçeği: **S** ≤ 2-3 gün, **M** ≈ 1 hafta, **L** > 2 hafta veya dış karar. Önem: **K** kritik, **Y** yüksek, **O** orta, **D** düşük.
`Mimari karar gerektirir` işaretli maddeler `entegrasyonik-architect` (ADR) girdisidir; bu belge onlara **öneri** verir, karar vermez.

Bu denetim `BACKLOG.md`/`MASTER_STATE.md`'yi GÜNCELLEMEZ (görev talimatı); kritik yeni bulgular §2'de "→ BACKLOG adayı" ile işaretli, orkestratör işler.

---

## (a) Yönetici özeti — İlk 15

1. **Girdi doğrulama katmanı yok (K/Y).** Şema kütüphanesi (Zod/Joi/Ajv) hiç yok; jenerik RPC her operasyona serbest `this.request` verir. Sonuç: 20+ yerde kullanıcı metni doğrudan `$regex` (kaçışsız → regex enjeksiyonu/ReDoS), sayfalama `limit` sınırsız, `sort.field` istemciden, `setting-service.ts:27-32` tüm gövdeyi `$set`, `['platforms.' + integrationCode]` dinamik yol. (MM-08, GV-01/06)
2. **Arka plan mimarisi çok-pod'da güvenli değil (K).** 5 ayrı statik `setInterval` zamanlayıcı + `IntegrationEngine`/`OrderOrchestrator` interval'i lider seçimi/kilit/çakışma koruması olmadan her worker pod'da çalışır; `OversellCompensationJob` pazaryerine `rejectOrder` çağırmadan önce atomik talep almaz (çift iptal); `web`→`worker` rol ayrımında `PROCESS_NEXT_SIGNAL` olayı pod-yerel EventEmitter olduğundan worker'a ulaşmaz (uyanma ≤ 5 dk gecikir). (MM-13/14, GV-08)
3. **Test güvenlik ağı dengesiz (Y).** Toplam %54 satır; ama refaktör hedefi olan `api/services` %27 (16 servis **%0**: variant, attributeMapping, invoice, image, claim, category, shipment, message, choice, financial, hashtag, ticket, notification, brand, menu, smart, setting, configuration), `integration-service` %23, `product-service` %13, sipariş/iade/müşteri/fatura/mesaj repository'leri %0-11. Refaktör önce karakterizasyon ister (Protokol 13). (TB-01)
4. **Hata zarfı sızdırıyor ve kod içermiyor (Y).** `ApiManager.ts:31-34` her hatada ham `e.message`'ı yanıtlar (500'de Mongo/iç mesajlar dahil); 68 genel `throw new Error` (Türkçe kullanıcı metni) vs 20 `ApplicationError`; hata kodu/kimliği yok. (MM-09, GV-07)
5. **IntegrationFactory: Proxy sorunu (C21) + iptal edilemeyen zaman aşımı + statik cache (K/Y).** `wrapWithTimeout` (`IntegrationFactory.ts:124-157`) tüm metotları async yapar → `getMatchKey()` Promise döner (12+ çağrı yeri); `Publisher.ts:271-272` ise ayrıca `entries[0]?.clientId || 1` ile tenant-1 fabrikası kurar (açık, BACKLOG C7/C21). (MM-18)
6. **`IPlatform` şişkin ve kategori-genel değil (Y).** ~37 metotlu tek arayüz; ERP/e-ticaret adaptörleri 23 `NOT_SUPPORTED` saplamasıyla dolduruyor; `IntegrationFactory.getIntegrationConfig` yalnız marketplace/ecommerce/erp dizilerini arıyor (`IntegrationFactory.ts:97-99`) → kargo/e-fatura eklemek fabrikayı ve arayüzü değiştirmeden mümkün değil. (MM-17, §5)
7. **Doğruluk hataları (Y).** `getOrders` tarih filtresi ve varsayılan sıralama şemada olmayan `orderDate` alanına yazılı (`order-service.ts:36,57-64`; şema `dates.orderDate`, `Order.ts:163`) → tarih aralığı hiç kayıt döndürmez; dashboard "bugün" sınırı sunucu saat diliminde (`order-service.ts:531-539`, konteyner UTC → TR günü 3 sa kayar); captcha sahte (`security-service.ts:17-22,77-83`, C1 kalanı). (GV-02/03/04)
8. **Katmanlama/klasör (Y).** `api/services` 26 dev sınıf doğrudan `clientDB.getXModel().aggregate(...)` yapıyor; repository/use-case katmanı yok; God class'lar: `integration-service` 1330 (5 sorumluluk), `admin-service` 739, `order-service` 711, `variant-service` 527. `operations→api` (6) ve `integration/modules→api` (2) ters bağımlılıklar. (MM-01..04)
9. **Yapılandırma dağınık (O/Y).** 43 farklı env değişkeni 30 dosyada 58 kez `process.env` ile okunuyor; env-int yardımcısı 3 kez kopya; `POD_NAME||hostname` 3 kez kopya; tek doğrulanmış config modülü/şema yok. (MM-07)
10. **Gözlemlenebilirlik zayıf (Y).** 314 `console.*` (ANSI renk kodlu), `Logger.ts` yalnız renkli önek üretir; `redactForLog` (`utils/secretKeys.ts`) **hiçbir yerden çağrılmıyor**; request/correlation id yok; metrik uç noktası yok; `getSystemHealth` BullMQ iç anahtarlarını (`bull:order-sync-queue:wait`) elle okuyor ve pod-yerel `nodeCache` raporluyor. (MM-10/12) — çözüm ADR-0017 kapsamı.
11. **Bağımlılık ve build hijyeni (Y/O).** Prod audit: nodemailer (yüksek; kullanan yalnız ölü `MailService`), sharp (major), xlsx (düzeltmesiz), qs (`npm audit fix` ile), uuid (`crypto.randomUUID` ile). Kullanılmayan: `axios-rate-limit`, rollup+webpack zinciri (8 paket + 2 config + `herokubuild` scripti), native isteğe bağlı sürücü paketleri (kerberos/snappy/zstd/csfle/gcp-metadata → Dockerfile'da `krb5-dev` gereksinimi). `tsconfig.include` `**/*.ts` → `dist/`'e 112 test dosyası + `package-lock.json` kopyası; `target ES2015`. (GN-05..09, GN-15)
12. **Repo şişkinliği/insan kararı bekleyenler (Y).** `gitlab/` 84 MB/1783 izlenen dosya (1417'si `node_modules`, `backend.js` 34 MB bundle, geçmişte sabit sır — C5); `mockserver/` (94 dosya, izinli DB listesi dışı DB — C15); `marketplace-service.ts1` (626 satır ölü servis). **Yalnızca raporlanır** (Protokol 12). (GN-01..03)
13. **SaaS çekirdek eksikleri (Y/K).** Kota/entitlement API kapısında uygulanmıyor (`EntitlementService.checkAccess` yalnız `billing-service.ts`); genel API + API anahtarı, giden webhook, otomasyon kural motoru, e-posta/bildirim kanalları, parola sıfırlama/2FA, asenkron dışa/içe aktarma, denetim günlüğü okuma, plan-özellik kapıları yok. (§6)
14. **Kargo/e-fatura backend yok; API-değişim tespiti yok (Y).** `hasShipmentIntegration = false` (`shipment-service.ts:80`), `hasIntegratedProvider = false` (`invoice-service.ts:190`); capability manifesti/sürüm/doküman kaynağı kodda değil (markdown tablosunda); çalışma-zamanı yanıt şeması doğrulaması yok; contract test yalnız Trendyol ve bilinçli zayıf. (§5)
15. **Kalite kapıları yok (O/Y).** CI/pipeline dosyası, ESLint/Prettier, dependency-cruiser, coverage eşiği, tek komutlu `verify` yok; `npm test` gerçek Mongo isteyen entegrasyon testini de toplar (`jest.config.js` ignore yok); bir flaky test tespit edildi. (TB-02..05)

---

## (b) Tam bulgu tablosu

Sütunlar: ID · dosya:satır · bulgu/etki · risk · çözüm önerisi · boyut. (Önem sütunu: K/Y/O/D.)

### b.1 Gereksiz dosyalar / bağımlılıklar / build kalıntıları (GN)

| ID | Dosya:satır | Bulgu / etki | Risk | Çözüm | Boyut | Önem |
|---|---|---|---|---|---|---|
| GN-01 | `backend/src/api/services/marketplace-service.ts1` (626 satır; `.ts1` → tsc görmez) | Devre dışı eski servis; yalnız `api/index.ts:4,35` yorumlarında adı geçer; FE/test referansı yok. 46 `any`. | Yok (derlenmiyor) | Sil (git geçmişinde kalır) | S | O |
| GN-02 | `gitlab/` (1783 izlenen dosya, 84 MB; `gitlab/entegrasyonikapp/backend.js` 34 MB ncc bundle; 1417 `node_modules` dosyası izleniyor; `gitlab/www` statik site kopyası; `index.js` Railway proxy hedefi sabit) | Eski GitLab dağıtım paketi; depo/pack şişkinliği (≈437 MB pack — ADR-0003) ve geçmişte sabit Atlas/JWT sırrı (C5). Kaynak koddan hiçbir referans yok. | Sızmış sırlar geçmişte; silme tek başına çözmez | **YALNIZCA RAPOR (C5 insan kararı):** rotasyon sonrası klasör çıkarma + geçmiş yeniden yazımı ayrı karar | — | Y |
| GN-03 | `mockserver/` (94 izlenen dosya; `backend/server.js:19` izinli 7 DB dışında `unified_mock_marketplaces`; `backend/src/platforms/herpsiburada/` typo klasörü + `n11…v9_0.docx`, `restapi_genel_…odt` ikili dokümanlar; `trendyol/scratch/seedScenarios.js` var olmayan `../../../config.json`'ı require eder) | Mock; C15 kararı bekliyor. Mock-gerçek sapma kaynağı (C20). | Kural 2 (izinli DB) — çalıştırmadan önce karar | **YALNIZCA RAPOR (C15/C5)** | — | O |
| GN-04 | `README` (kök, uzantısız, 1138 bayt) | Yalnızca `mongodump --uri="<ATLAS_URI…>"` komut satırları; `README.md` ile yinelenen/yanlış yerde | Yok | Sil | S | D |
| GN-05 | `backend/rollup.config.js`, `backend/webpack.config.js`, `package.json` script `herokubuild` (`ncc build`, `@vercel/ncc` kurulu değil); devDeps `rollup`, `@rollup/plugin-commonjs`, `@rollup/plugin-node-resolve`, `ts-loader`, `webpack`, `webpack-cli`; deps `@rollup/plugin-json`, `webpack-node-externals` | Hiçbir npm script'i/Dockerfile çağırmıyor (build yalnız `tsc + tsc-alias`); `dist/entegrasyonik.js` girdisi rollup için, `webpack.config.js` `externals` yorumda. Dağıtım platformlarının (Railway/Render) build komutu repoda yok → **doğrulanamadı** | Render/Railway `herokubuild`'i çağırıyorsa kırılır | Dağıtım komutlarını doğruladıktan sonra kaldır | S | O |
| GN-06 | `package.json`: `axios-rate-limit`; `nodemailer` + `@types/nodemailer`; `src/services/mail/MailService.ts` (0 içe aktaran; yalnız `operations/billing/TrialExpiryJob.ts:28` yorumunda anılır) | `axios-rate-limit`: kod yorumları "kaldırıldı" diyor (`ideasoft/services/Service.ts:6`), import yok → ölü. `nodemailer` prod audit **high** (5 advisory); tek tüketici ölü `MailService`. | Yok (kullanılmıyor) | `axios-rate-limit` sil; `nodemailer`+`MailService` sil ve e-posta kanalını Y-05'te sağlayıcı kararıyla yeniden kur (bkz. B-R2) | S | Y |
| GN-07 | `package.json`: `kerberos`, `snappy`, `@mongodb-js/zstd`, `mongodb-client-encryption`, `gcp-metadata`; `Dockerfile:10-12` (`krb5-dev`, python3/make/g++ yalnız bunlar için) | Hiçbiri `src`'te import edilmiyor; `compressors`/GSSAPI/CSFLE kullanımı yok (grep). MongoDB sürücüsünün **isteğe bağlı** peer bağımlılıkları; canlı `DB_URL`'de `compressors=` olup olmadığı **doğrulanamadı** (`.env` repoda yok). | `compressors=snappy/zstd` kullanılıyorsa bağlantı kırılır | DB_URL doğrulaması sonrası kaldır → Docker build hızlanır/küçülür | S | O |
| GN-08 | `src/database/client/ClientDB.ts:1` (`lru-cache`), `src/services/redis/RedisService.ts` (`ioredis`) | package.json'da bildirilmemiş "hayalet" bağımlılıklar: `lru-cache` prod'da yalnız `archiver→archiver-utils→glob→path-scurry` zincirinden (`npm ls --omit=dev`), `ioredis` `bullmq`'dan. Zincir değişirse `MODULE_NOT_FOUND`. | Sessiz kırılma (prod install) | `dependencies`'e açıkça ekle (`lru-cache@^10`, `ioredis@^5`); `@jest/globals` → devDependencies | S | Y |
| GN-09 | `package.json`: `typescript`, `@types/bcrypt`, `@rollup/plugin-json`, `webpack-node-externals` `dependencies`'te | Derleme/tip paketleri runtime imajına taşınıyor (`npm prune --omit=dev` bunları silmez) | Düşük | `devDependencies`'e taşı | S | D |
| GN-10 | `src/services/mail/.env.example` | Kaynak ağacında yinelenen env şablonu (ZOHO_*); ana `backend/.env.example` bu değişkenleri içermiyor | Belge kaymasına yol açar | Değişkenleri `backend/.env.example`'a taşı, dosyayı sil | S | D |
| GN-11 | `src/operations/catalog/CatalogOperations.ts` (31 satır, 0 içe aktaran); `src/utils/LifecycleManager.ts` (20 sat., FE `useLifecycle.ts` paralel kopya); `src/database/client/models/Settlement.ts` (`SettlementSchema` hiçbir yerde kayıtlı değil) + `interfaces/settlement`; `src/api/services/ecommerce-service.ts` (FE `IdeasoftComponent.vue:214`, `integrationStore.ts:47` hâlâ çağırıyor → bugün 403); `src/utils/BarcodeGenerator.ts` (yalnız `tests/smoke.test.ts` içe aktarır); `src/api/services/register-service.ts` (`hebeleService` yer tutucu; politika kaydı yok → yalnız 403; FE `restapi.ts:71` yalnız yapılandırma satırı) | Ölü/yarım özellik kodu. `CatalogOperations` CLAUDE.md'de mimari bileşen olarak anılıyor; `Settlement` Y-12 (hakediş) için tohum olabilir. | Bazıları ürün kararına bağlı (bkz. §(c) "onay gerekir") | S | O |
| GN-12 | `src/Webserver.ts:26,31-34` (`operations` Map kuruluyor, hiç okunmuyor; `RunOperation.ts:6-13` aynı haritayı ayrıca kuruyor), `:154-156` (`addSecurityCookie` çağıran yok), `:128-136` (`express.static(__dirname/client)` + SPA catch-all: `dist/src/client` yok, ncc/gitlab paketinden kalma) | Ölü üyeler; her istek `express.static` katmanından geçiyor; sahte SPA yönlendirmesi | Yok | Sil | S | D |
| GN-13 | 131 kullanılmayan yerel/import (`tsc --noUnusedLocals`), 24 kullanılmayan export tipi (`interfaces/common`: `IServiceRegistery`, `IIntegrationManager`, `IMarketplace`, `IGatewayConfig`… ), 33 kullanılmayan export (knip) | ör. `entegrasyonik.ts:100 workers`, `Dispatcher.ts:7,83`, `OrderOrchestrator.ts:5 PostOrderOperations` (yalnız import; downstream saplaması boş), `variant-service.ts:378-379,424`, `image-service.ts:270,283`, `IntegrationFactory.ts:8,32` | Yok | `noUnusedLocals` açılarak mekanik temizlik | S | D |
| GN-14 | `src/services/redis/RedisService.ts:91-118` `isRateLimited`, `acquireLock`, `releaseLock` (src/tests'te çağıran yok) | `acquireLock` sahip belirteci yok → `releaseLock` başkasının kilidini silebilir (güvensiz ilkel) | Kullanılırsa hatalı | Sil veya sahip-belirteçli (token+Lua) yeniden yaz (B-R11) | S | D |
| GN-15 | `backend/tsconfig.json` `include: ["**/*.ts","**/*.json",…]` + `declaration/declarationMap/sourceMap/inlineSources` | `npm run build` çıktısı `dist/` 17 MB: `dist/tests` (112 test dosyası, 4,9 MB), `dist/package-lock.json` (529 KB), `dist/package.json`, `dist/tsconfig.json` kopyaları; `.d.ts`+`.d.ts.map` üretimi gereksiz (uygulama, kütüphane değil). Docker'da `.dockerignore` tests'i dışladığı için imajda test yok, ama yerel/`start:local` derlemesi şişik ve `dev-tools` `dist/src/…`'e bağımlı | Düşük | `tsconfig.build.json` (yalnız `src/**`+`entegrasyonik.ts`, `declaration:false`) — B-R3 | S | O |
| GN-16 | Yorumlanmış kod: 23 `/* … */` kod bloğu + ~7 `//` kod satırı (`ImageApiManager.ts:23,26,138`, `Webserver.ts:119-125`, `IntegrationFactory.ts:53-61,117-120`, `IntegrationEngine.ts:3,40`…); belge kayması: `src/integration/README.md` (186 sat.; var olmayan `requestFetchProducts()` anlatıyor), `CLAUDE.md` "There is no test suite configured" ve alias listesinde `@health` yok | Okuma maliyeti/yanlış yönlendirme | Düşük | Yorum bloklarını sil; README/CLAUDE.md güncelle | S | D |
| GN-17 | `src/integration/modules/marketplace/trendyol/commissions.json` (2,9 MB, 63 002 satır statik komisyon anlık görüntüsü; `CategoryService.ts:4` içe aktarır); `pazarama/commissions.json` ve `pazarama/shipment-providers.json` = `[]` (boş) | Komisyon oranları koda gömülü ve bayatlar; her derleme/yükleme 2,9 MB JSON parse eder; Pazarama komisyonu fiilen boş | Yanlış komisyon | Veriyi DB'ye/periyodik çekime taşı (ürün kararı) | M | O |
| GN-18 | `backend/dev-tools/*.js` (8 dosya, 787 satır), `.dockerignore` `dev-tools` dışlıyor | Knip `precheck-tenant-duplicates.js`'i "kullanılmıyor" saydı ama `models/Client.ts`/`User.ts` yorumlarından ve BACKLOG'dan çağrılan operasyonel betik → **yanlış pozitif, KORU**. Not: göç/seed betikleri Docker imajında yok | — | Değiştirme | — | — |

### b.2 Mimari / katmanlama (MM)

| ID | Dosya:satır | Bulgu / etki | Risk | Çözüm önerisi | Boyut | Önem |
|---|---|---|---|---|---|---|
| MM-01 | `src/api/services/*.ts` (26 sınıf/8 269 sat.); örnek `order-service.ts:20-110` | Filtre kurma, aggregate, sayfalama, DTO hepsi RPC sınıfının içinde; servis→`this.clientDB.getOrderModel().aggregate()`. Repository/use-case katmanı yok; iş mantığı controller = servis. `ConfigurationService.get` (`configuration-service.ts:15-46`) 7 servisi elle örnekleyip `init()` eder (servis→servis bağı) | Test edilebilirlik ve tekrar kullanım düşük | RPC sınıfları ince cephe (girdi doğrula → use-case çağır → DTO), sorgular `database/repositories`, kurallar `operations/<alan>` (bkz. §(d)) | L (kademeli) | Y |
| MM-02 | `integration-service.ts` 1330 satır (35 metot: ayar CRUD `:47-337`, webhook token `:143`, iş listeleme/arama `:453-960`, dışa aktarma toplu işlem `:961-1234` (`internalProcessBatch` 220 sat.), platform arama `:1247-1330`); `admin-service.ts` 739; `order-service.ts` 711; `variant-service.ts` 527; `attributeMapping-service.ts` 467; `product-service.ts` 463; `invoice-service.ts` 421. Kopya: `advancedSearchExportJobs` (`:515`, ~180 sat.) ile `getExportJobs` (`:695`, ~120 sat.) aynı `$regex` arama bloğu (`:561-570` ↔ `:746-748`); `StockPublishTrigger` aynı `internalProcessBatch` desenini yeniden yazıyor (BACKLOG C8 "AYNI desende") | God class; tek dosyada 5 sorumluluk | Böl: ayar servisi / iş günlüğü servisi / dışa aktarma toplu işlem (engine tarafına) / platform sorguları; RPC adları cephe ile korunur | M-L | Y |
| MM-03 | `operations/` vs `services/` sınırı | `services/billing/EntitlementService` (alan mantığı) vs `operations/billing/TrialExpiryJob`; `services/audit`, `services/metrics` (altyapı) vs `operations/tenant/*` (kullanım senaryosu, `@api/Security` içe aktarır); `operations/stock/*` iş+zamanlayıcı karışık. Kural yazılı değil | Yeni kod nereye konacak belirsiz | Yazılı katman sözleşmesi + dependency-cruiser kuralı (bkz. §(d)) | S | O |
| MM-04 | `operations→api` 6 kenar (`TenantLifecycleService.ts`, `TenantProvisioningService.ts`, `exportDownloadToken.ts`, `provisionInput.ts` → `api/Security`; `exportCollections.ts` → `api/integrationSecrets`, `api/responseSanitizer`); `integration/modules→api` 2 kenar (`IntegrationFactory.ts:10`, `ideasoft/services/SecurityService.ts` → `api/integrationSecrets`) | Alt katman üst katmana (HTTP katmanındaki dosyalara) bağımlı — ters bağımlılık; `integrationSecrets` (şifre çözme) HTTP dizininde | Kayma/döngü riski | `Security` içindeki `ApplicationError`/parola karması + `integrationSecrets` + `responseSanitizer` → `@utils`/`@services/crypto` | S | O |
| MM-05 | `ApiWrapper.ts:26-27`, `RunOperation.ts:42-54` | Her RPC çağrısı `new Service(clientId, request)` + `init()`; bağımlılıklar `DatabaseManagerInstance` singleton'ından; ayrıca statikler: `ClientDB.cache`, `IntegrationFactory.instanceCache/configCache`, 5 `*Scheduler` statiği, `StatisticsTracker.appDB` (`StatisticsTracker.ts:26`), `nodeCache` (`utils/decorator/cache.ts:3`). DI yok; testler `jest.mock` ile | Test zorluğu; global durum | Bileşim kökü (`main.ts`) + kurucu enjeksiyonu yeni kodda; eski kod kademeli (zorunlu değil) | M | O |
| MM-06 | `Webserver.ts:31-34` ↔ `RunOperation.ts:6-13` | Servis haritası iki kez kuruluyor (biri ölü) | Düşük | GN-12 | S | D |
| MM-07 | 58 `process.env` okuması/30 dosya/43 değişken; `rateLimit.ts:19-22`, `BillingWebhookApiManager.ts:43`, `MockCheckoutApiManager.ts:245` aynı `envPositiveInt`; `IntegrationEngine.ts:17`, `ExportOrchestrator.ts:15`, `StatisticsTracker.ts:26` `POD_NAME||hostname` (varken `@utils/podIdentity`); `Webserver.ts:58` `Number(env)\|\|5001` | Şema/tür/aralık doğrulaması yok (yanlış yazılan sayı sessizce varsayılana düşer); fail-fast yalnız JWT (`Security.assertConfig`) ve FieldCrypto | Yanlış yapılandırma sessiz | `src/config/` tek modül: Zod env şeması, tek okuma, fail-fast, tipli `config` | M | Y |
| MM-08 | Girdi doğrulama: `package.json`'da zod/joi/ajv/yup/express-validator yok; `mongoose.sanitizeFilter` yok; örnekler: `order-service.ts:22-34,44,78` (page/limit/sort/regex), `admin-service.ts:28,50`, `notification-service.ts:13,26` (`limit` sınırsız), `financial-service.ts:23,66`, `integration-service.ts:820,839`, `ticket-service.ts:52-54` (sort anahtarı), `setting-service.ts:27-32` (tüm gövde `$set`), `brand-service.ts:30`, `category-service.ts:60` (`['platforms.'+integrationCode]`), 20+ `$regex` (bkz. GV-01) | `RunOperation` yalnız **kim çağırabilir**'i (politika) denetler, **ne gönderdiği**'ni değil; tenant sınırı base filtrelerle korunuyor (ör. `ticket-service.ts:22`) ama DoS/bozuk veri/mass-assignment yolu açık | Yüksek | Politika kaydını `{tier, kind, schema}`'ya genişlet; RPC sınırında Zod ile doğrula; `parsePagination/parseSort/escapeRegex` ortak yardımcıları (B-R8/B-R9/B-R10) | M-L | K |
| MM-09 | `ApiManager.ts:31-34` `sendError`: `{error: e?.message, service, operation}`; `ImageApiManager.ts:40,50,…` aynı; `api/services`'te 68 `throw new Error(...)` (ör. `order-service.ts:125` "Sipariş bulunamadı.") vs 20 `ApplicationError`; `integration/modules`'te 112 satır genel `throw new Error` vs 18 `IntegrationError` (satır sayımı) | Beklenmeyen hatalarda (Mongo, TypeError) iç mesaj istemciye gider; kullanıcıya gösterilen mesajlar aynı kanaldan (ayırt edilemez); hata kodu yok → FE metin eşleştiriyor olabilir; `IntegrationError` sözleşmesi adaptör içinde kalıyor | Bilgi sızıntısı | `AppError{code,status,expose,details}` + hata kodu kataloğu + merkezi Express hata middleware'i; beklenmeyen hata → 500 + `errorId`, ayrıntı yalnız log | M | Y |
| MM-10 | 314 `console.*` (`src`+`entegrasyonik.ts`); `utils/Logger.ts` yalnız `getColoredPrefix/getLogPrefix` (ANSI renk); `Webserver.ts:167`, `entegrasyonik.ts:117,146` mesajlara ANSI gömülü; `utils/secretKeys.ts` `redactForLog` **çağıran yok** (ADR-0003 D.17 "Faz 2 log redaction" vaadi karşılanmamış); 18 dosya `Logger.ts` içe aktarıyor | Yapılandırılmış/aranabilir log yok; sır/PII ham hata nesnelerinde (`console.error(error)`) sızabilir; `local-run.log`'a senkron yazımın olay döngüsünü tıkadığı BACKLOG C19'da doğrulanmış | Orta-yüksek | Logger cephesi + seviye + requestId/tenantId bağlamı + redaksiyon; kütüphane/şema → **ADR-0017** | M | Y |
| MM-11 | `ApiManager.ts:125-146`: `POST /api/:service/:operation`, `GET /api/:service`→`get`; özel rotalar (`SecurityService/login…`, `userContext`, `checkAuthentication`); `ImageApiManager` çoklu; webhook'lar `/hooks/*`, `/api/billing/*` | RPC ile REST karışık; sürüm öneki, OpenAPI, ortak sayfalama/filtre/sıralama sözleşmesi (her serviste farklı `pagination`/`searchXForm`/`sortBy` biçimi), durum kodu semantiği (hata da `200 {result:false}` dönebilir) yok | Harici tüketici (Y-14) ve MCP (ADR-0009) için zemin yok | Mevcut RPC **FE sözleşmesi olarak korunur**; kamu API'si ayrı `api/v1` (bkz. §(d)) | L | Y |
| MM-12 | `health/HealthCheck.ts` (ready: ApplicationDB ping ≤1 sn + Redis), `Webserver.ts:143-152`; `admin-service.ts:341-343` (`llen 'bull:order-sync-queue:wait'`/`:active` elle), `:363-372` (`nodeCache.keys()` pod-yerel), `:266-…` | /health,/ready sağlam ve testli; **metrik uç noktası yok**; `getSystemHealth` BullMQ iç veri yapısına bağlı (sürüm kırılganlığı), pod-yerel önbelleği "sistem" verisi diye gösteriyor (çok podda yanıltıcı), "aktif pod" `lockedBy` zaman damgasından türetiliyor (kalp atışı kaydı yok) | Yanıltıcı operasyon görünümü | Kanıt yalnız; çözüm **ADR-0017** | — | O |
| MM-13 | `operations/stock/{AllocationSweep,StockPublish,OversellCompensation,Reconciliation}Scheduler.ts`, `operations/billing/TrialExpiryScheduler.ts` (toplam 178 satır, aynı statik `setInterval` deseni); `IntegrationEngine.ts:32`; `OrderOrchestrator.ts:71`; `QueueMetricsCollector.ts:171`; `ExportOrchestrator.ts:39`, `ImportOrchestrator.ts:29` `while(true)`; 5 ideasoft/hepsiburada `while(true)` sayfalama | Lider seçimi/dağıtık kilit yalnız `Dispatcher`/`Sync` (`@utils/mongoLease`); zamanlayıcılar her `worker`/`all` pod'da çalışır; tur bitmeden yeni tur başlayabilir (`tick` aşırı örtüşme koruması yok); `stop()` var ama `gracefulShutdown` (`entegrasyonik.ts:53-93`) hiçbirini çağırmaz; export/import döngülerinde durdurma bayrağı yok (C14 açık ucu) | Çift işlem (bkz. GV-08), kapanışta yarım iş | Ortak zamanlayıcı soyutlaması (BullMQ Job Scheduler veya `mongoLease` lider) + overlap guard + shutdown kancası (B-R11) | M | K |
| MM-14 | `integration/engine/IntegrationEventBus.ts`, `services/notification/NotificationEventBus.ts` (in-process `EventEmitter`); `integration-service.ts:1170` `integrationEventBus.emit(PROCESS_NEXT_SIGNAL)`; `ExportOrchestrator.ts:30-36,129-138` | `APP_ROLE=web` pod'unda üretilen sinyal `worker` pod'undaki döngüyü uyandırmaz; worker `min(nextRunAt, exportLoopDelay=300000 ms)` kadar uyur → kullanıcı işlemi ≤ 5 dk gecikir (`all` rolünde aynı süreç, sorun yok). Bildirim yolu DB'ye yazdığı için pod'lar arası tutarlı | Ayrık rol dağıtımında gecikme | Sinyali Redis pub/sub (veya BullMQ) üzerinden yay; `ExportSignals` polling'i güvenlik ağı olarak kalsın (ADR-0005 ile uyumlu) | S-M | Y |
| MM-15 | BullMQ yalnız `order-sync-queue` (`OrderQueueProducer.ts:17-26`, `order.config.json`); katalog hattı Mongo durum makinesi (ADR-0005) | E-posta, webhook teslimi, dosya işleri, rapor için kuyruk yok; yeni yetenekler (§6) iş kuyruğu ister | Yeni işler senkron HTTP'de kalır | Genel `jobs` kuyruk modülü (BullMQ, isimli kuyruklar); katalog hattına dokunma | M | Y |
| MM-16 | `tsconfig.json`: `strict:true` (iyi), ama `target:"es2015"` (dist'te `__awaiter` — 5 yer `RunOperation.js`), `lib:["es5","es6","dom"]` (backend'de DOM tipleri), `noUnused*`/`noImplicitReturns`/`noFallthrough` kapalı; `any` ≥ 1886 satır (`interfaces/common/index.ts` 71, `variant-service.ts` 53, `integration-service.ts` 47, `admin-service.ts` 42, `product-service.ts` 41); çıplak `src/...` içe aktarım (`product-service.ts:2`, `database/application/models/Common.ts:2`, `client/models/Customer.ts:2`) ile alias karışık (389 alias / 516 göreli) | Async stack izleri ve performans (downlevel), tip güvenliği sınırlı, alias kuralı belirsiz | Düşük-orta | `target ES2022` + `useDefineForClassFields:false`, `lib ES2022`, kademeli `noUnusedLocals`; alias politikası dependency-cruiser'a bağlı (B-R3/B-R4) | S | O |
| MM-17 | `interfaces/platforms/index.ts:217-315` `IPlatform` (~37 metot: katalog, sipariş, iade, mesaj, finans, kargo bildirimi, fatura bildirimi); NOT_SUPPORTED 23 yer (`n11/OrderService.ts` 6, `hepsiburada/index.ts` 3, `erp/bizimhesap/ProductService.ts` 2…); `IntegrationFactory.ts:193-202` `switch(code)`; `:97-99` yalnız marketplace/ecommerce/erp; `ClientIntegration.ts:20-26` `shipment` ve `einvoice` dizileri şemada var ama fabrika bakmıyor | Yeni kategori (kargo/e-fatura) eklemek = arayüzü/fabrikayı değiştirmek + ~35 saplama; adaptör bilgisi (kategori, yetenek) kodda yok | Y-01/Y-02/Y-13 maliyeti yüksek | Yetenek-tabanlı küçük portlar + `AdapterManifest` + kayıt tablosu (bkz. §(d), §5) | M-L | Y |
| MM-18 | `IntegrationFactory.ts:17-25,63-71` statik `instanceCache/configCache` tüm tenant'lar için 5 dk'da bir topluca temizlenir; `:91` her config miss'inde `Integrations.find()` tüm koleksiyon; `:212-216` `clearCache()` pod-yerel (ayar değişince diğer pod'lar ≤ 5 dk eski ayarla çalışır); `:124-157` `Promise.race` zaman aşımı alttaki HTTP isteğini iptal etmez (yazmada sonuç belirsiz, `UNKNOWN_OUTCOME` işaretlenmez) ve senkron metotları Promise yapar (C21) | Sürü etkisi, çok-pod tutarsızlığı, zombi istekler | Orta-yüksek | Sürümlü/TTL'li tenant başına anahtar; ayar değişiminde Redis pub/sub ile invalidation; `AbortSignal` geçişi; Proxy yerine `ResilientHttpClient` seviyesinde zaman aşımı (zaten var) — Proxy'yi kaldır | M | Y |
| MM-19 | `authenticate.ts:84,111` (Users.findById + Clients.findOne(status)), `BaseApi.ts:17`→`DatabaseManager.ts:56` (`Clients.findOne({order})`), `ClientDB.ts:12-22` LRU `max:100`, `Database.getInstance` havuz `DB_POOL_SIZE||20` | Her RPC = 3 ApplicationDB okuması (önbelleksiz); 100 tenant × 20 = 2000 bağlantıya kadar; LRU tahliyesi uçuştaki sorguya rağmen bağlantıyı kapatabilir (`dispose` → `database.close()`) | Ölçekte gecikme/bağlantı tükenmesi | Kısa TTL'li tenant kaydı önbelleği (durum değişiminde invalidation), havuz boyutunu düşür (`maxPoolSize` 5 + `maxIdleTimeMS`), tahliye sırasında referans sayımı | M | O |
| MM-20 | `user-service.ts:107-131` | Kullanıcı hem tenant `Users` hem merkezi `Users`'a yazılıyor (parola özeti iki kopya); transaction yok, "best-effort geri alma" (`:131`) | Tutarsızlık (parola/rol iki yerde) | Merkezi `Users` tek doğruluk kaynağı; tenant kopyası kaldır/türetilmiş yap — **mimari karar (ADR-0003/0013 kapsamı)** | M | O |

### b.3 Güvenlik / doğruluk (GV) — kritik olanlar BACKLOG adayı

| ID | Dosya:satır | Bulgu / etki | Risk | Çözüm | Boyut | Önem |
|---|---|---|---|---|---|---|
| GV-01 | `$regex` kaçışsız kullanıcı girdisi: `order-service.ts:44`, `claim-service.ts:41`, `customer-service.ts:37`, `financial-service.ts:41,158`, `integration-service.ts:561-570,746-748`, `invoice-service.ts:108-109`, `admin-service.ts:36-37,180-182`, `ticket-service.ts:27-29`, `smart-service.ts` (kelime başına `$regex`+`$lookup`) | Regex enjeksiyonu/ReDoS; `escapeRegex` yardımcısı repoda yok | Servis reddi (tenant DB'si düşer) | Ortak `escapeRegex` + uzunluk sınırı; büyük koleksiyonda `$text`/öneki bağlı arama | S | Y → **BACKLOG adayı (critical→high)** |
| GV-02 | `order-service.ts:36,57-64` ↔ `Order.ts:163` | `getOrders` varsayılan `$sort {orderDate}` ve tarih filtresi `filterQuery.orderDate` — şemada üst düzey `orderDate` yok (alan `dates.orderDate`); tarih aralığı seçilince sonuç boş; varsayılan sıralama etkisiz (test `OrderService.characterization.test.ts:143-149` şüpheyi "kasıtlı" sabitlemiş; şema okumasıyla **doğrulandı**). `smart-service.ts:143-144` aynı hata | Kullanıcıya yanlış/boş sipariş listesi | `dates.orderDate` kullan, test kasıtlı ters çevrilir | S | Y |
| GV-03 | `order-service.ts:531-539` (`todayStart.setHours(0,0,0,0)`), `Setting.ts:17 timezone` (kullanılmıyor) | Dashboard "bugün/dün/7 gün" sunucu (UTC) günü; TR kullanıcısı için 03:00'a kadar yanlış gün | Yanlış istatistik | Tenant saat dilimiyle sınır hesapla | S | O |
| GV-04 | `security-service.ts:17-22` (`Math.random()` captcha, saklanmıyor, yanıtta dönüyor), `:77-83` (doğrulama yok) | Sahte captcha (C1 kalanı) — 3 başarısız denemeden sonra "captcha zorunlu" yalnız görsel; rate limit (10/dk/IP) asıl koruma | Brute-force koruması zayıf | Gerçek doğrulama ya da kaldır (ADR-0001 K10; FE ile birlikte) | S | Y |
| GV-05 | `ImageApiManager.ts:26` (`multer({storage: memoryStorage()})` — `limits`/`fileFilter` yok; `err` parametresi `:28`, `:52` yok sayılır), `:120,140` `res.sendFile/download(imageFilesPath + …)` (`IMAGE_FILES_PATH` varsayılan `products/` göreli; görseller R2'de) | Boyut/adet/MIME sınırı yok (bellek DoS); yerel-disk servis yolları R2 sonrası ölü/kırık — `getImage` FE tarafından hâlâ URL üretiliyor (`restapi.ts:214`) → **çalıştığı doğrulanamadı** | Bellek tüketimi | `limits`+MIME (sihirli bayt) doğrulaması; R2 doğrudan/presigned; ölü rotaları düzelt | S | Y |
| GV-06 | `setting-service.ts:27-32` | `$set: this.request.settings` (tüm gövde; `settings` undefined → TypeError → 500+mesaj sızıntısı) | Mass-assignment | Zod şeması (4 sekme alanları) | S | O |
| GV-07 | `ApiManager.ts:31-34` | Bkz. MM-09 | Sızıntı | Bkz. MM-09 | M | Y |
| GV-08 | `operations/stock/OversellCompensationJob.ts:145-160,179-195` | `tryCompensate`→`attemptMarketplaceCancel`→`instance.rejectOrder` öncesi satır bazlı **atomik talep yok**; zamanlayıcı her pod'da + tur örtüşmesi → aynı satır için çift pazaryeri iptal çağrısı (dış yan etki; Trendyol/HB/Pazarama gerçek iptal). Not: `RELEASED`/`CANCELLED` yazımı iptalden sonra | Çift iptal / yanlış müşteri deneyimi | `findOneAndUpdate({oversoldCompensationClaimedAt: null}, …)` talep + lease | S | K → **BACKLOG adayı (critical)** |
| GV-09 | `services/notification/NotificationService.ts:14` | `clientOperations.saveNotification(...)` `await`'siz: `try/catch` işlevsiz; hata `unhandledRejection` (yalnız loglanır, `entegrasyonik.ts:181-186`) → bildirim sessizce kaybolur | Sessiz kayıp | `await` + hata işleme; DLQ/yeniden deneme | S | Y |
| GV-10 | `Publisher.ts:271-272` | `new IntegrationFactory(Number(entries[0]?.clientId || 1))` (staged şemada `clientId` yok → daima tenant 1) + `instance.getMatchKey()` Proxy Promise'ı (C21) `.toLowerCase` → TypeError. Kalıcı toplu hata yolunda tenant N için tenant-1 kimlik bilgisiyle fabrika kuruluyor | **Çapraz-tenant kimlik bilgisi kullanımı** (sonuç: hatalı yol hiç tamamlanmıyor) | BACKLOG C7/C21 düzeltmesi (başka ajan); test: `Publisher.clientOneFallback.characterization.test.ts` | S | K (zaten BACKLOG'da) |
| GV-11 | `api/rateLimit.ts:7-8,44-48` | Rate limit yalnız login/register/billing webhook/mock checkout; süreç-içi Map (çok replikada kota × replika sayısı); genel API/tenant/anahtar başına sınır yok | Kötüye kullanım | Redis tabanlı sliding-window (ör. `rate-limiter-flexible`), tenant+principal anahtarlı | M | Y |
| GV-12 | `Webserver.ts` (helmet yok; `x-powered-by` kapatılmamış; CSP yok) | Güvenlik başlıkları yok (API JSON olduğundan CSP etkisi düşük; `nosniff`/`HSTS`/`x-powered-by` yine gerekli) | Düşük | `helmet` (API profili) + `app.disable('x-powered-by')` | S | O |
| GV-13 | `npm audit --omit=dev` | nodemailer(high, ölü), sharp(high, major `0.35.5`), xlsx(high, düzeltmesiz; kullanım: yalnız yazma `product-service.ts:456-458`), qs(moderate, `npm audit fix`), uuid(moderate; 2 dosya, birinde kullanılmıyor) | Bilinen CVE | GN-06/GN-13/B-R2; sharp ayrı görev (görsel karakterizasyon); xlsx → exceljs (Y-07) | S-M | Y |
| GV-14 | `Dockerfile:8` `FROM node:20-alpine` (özet/digest sabitlenmemiş) | Node 20'nin upstream bakım süresi 2026-04'te bitmiş olmalı (bilgi tabanına göre; ağdan **doğrulanamadı**); `package.json` `engines` yok, `.nvmrc` yok, yerel geliştirme Node 22 | Desteklenmeyen çalışma zamanı | Node 22 LTS'e geçiş (ADR/QA), `engines` ekle | S | O |

### b.4 Teknik borç / test / açık BACKLOG tutarlılığı (TB)

| ID | Kanıt | Bulgu | Çözüm | Boyut | Önem |
|---|---|---|---|---|---|
| TB-01 | `coverage-summary.json` (aşağıda §Ek-A) | Genel %54,2/%35,2 dal. **0%**: 16 API servisi (satır: variant 248, attributeMapping 158, invoice 136, image 134, claim 105, category 88, shipment 79, message 77, choice 71, financial 62, hashtag 58, ticket 53, notification 36, brand 30, menu 30, smart 29, setting 28, configuration 23), `OrderRepository` %11, `Customer/Claim/Invoice/Message/FinancialRepository` %0, `StatsOperations` %3, `S3Manager` %4, `image-operations` %17, `MailService`/`StatisticsTracker`/`LifecycleManager`/`CatalogOperations` %0. Adaptörlerde ürün/kategori transformer'ları %3-25 (`trendyol/ProductTransformer` %3,4) | Refaktörün güvenlik ağı yok | Karakterizasyon paketleri (B-R-T serisi) — refaktörden ÖNCE | L (paralel) | Y |
| TB-02 | 5 tam koşuda 1'inde `tests/characterization/common/ResilientHttpClient.test.ts` FAIL (9,8 sn); dosyada gerçek yerel HTTP sunucusu + duvar-saati toleransları (`:110 <2000ms`, `:231-235 <250ms`, `:153-163` uykular) | Yük altında flaky; hangi `it` olduğu **doğrulanamadı** (çıktı kaydedilmedi; yeniden üretilemedi) | Sahte zamanlayıcı/geniş marj/tekrar; CI'da izole koşum | S | O |
| TB-03 | `tests/integration/StockAllocator.concurrency.test.ts` gerçek local Mongo ister; `jest.config.js` `testPathIgnorePatterns` yok, `npm test` = `jest` → bu testi de toplar | DB'siz ortamda `npm test` kırmızı (bu denetimde çalıştırılmadı — DB kuralı); `test:integration` ayrı script var | `npm test`'ten hariç tut (`--testPathIgnorePatterns`/ayrı `projects`) | S | O |
| TB-04 | `jest.config.js` (`coverageThreshold` yok), repoda CI/lint/format yok (§Genel altyapı) | Gerileme yakalanmıyor | Eşik + `verify` betiği | S | Y |
| TB-05 | BACKLOG↔kod tutarlılığı (aşağıdaki tablo) | Doğrulandı: C1 captcha sahte ✔ açık (`security-service.ts:17-22`); C2 `deleteClient` artık yumuşak silme akışına devrediyor ✔ (`admin-service.ts:723-739`) ama purge için **zamanlayıcı yok** (`runPurgeForDueTenants` çağıran yok — C17); C10 Ideasoft: `IntegrationFactory.getInstance` hiçbir yerde `init()` çağırmaz (`:159-210`) ✔ açık; C11 Trendyol: yalnız `OrderConnector` varsayılanları düzeltilmiş (kod okuması) ✔ kısmi; C17: `verifyExportDownloadToken` çağıran yok (`exportDownloadToken.ts:31`) → dışa aktarma indirme rotası yok ✔; C21 Proxy hâlâ (`IntegrationFactory.ts:124-157`) ✔ açık; C7/Publisher client-1 ✔ açık (`Publisher.ts:271`); C14 durdurma bayrağı yok ✔; C19 kapalı ✔ | — | — | — |

---

## MEVCUT YAPILARIN OLGUNLUK DEĞERLENDİRMESİ

Ölçek: **1** yok/zayıf · **2** var ama kırılgan/eksik · **3** kabul edilebilir · **4** iyi · **5** sektör çıtası/örnek. Ölçütler: **Ç** sektör çıtası (benchmark Y-kataloğu) · **G** operasyon güvenilirliği (hata/yeniden deneme/idempotency) · **Gz** gözlemlenebilirlik · **T** test kapsamı (§Ek-A) · **Ö** ölçeklenebilirlik · **K** kod kalitesi/mimari uyum. Puanlar kod okuması + ölçümdür; canlı doğrulama yoktur.

| # | Alt sistem | Ç | G | Gz | T | Ö | K | Ort. | Kısa kanıt |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Bildirim sistemi (`NotificationService`, `NotificationEventBus`, `notification-service.ts`) | 2 | 2 | 1 | 1 | 2 | 2 | **1,7** | Yalnız uygulama içi; tercih/e-posta/push yok (benchmark H2 YARIM); `NotificationService.ts:14` await'siz; in-process EventEmitter; 3 gün TTL (`Notification.ts` `expiresAt`); FE 10 sn'de tüm listeyi çeker, `limit` sınırsız (`notification-service.ts:26`); kapsam %30/%0 |
| 2 | Log/rapor (dışa/içe aktarma iş günlükleri: `IntegrationService.getExportJobs/advancedSearchExportJobs/getImportJobs/getJobReport`, `OperationLog`, `AuditLog`) | 3 | 3 | 2 | 1 | 2 | 2 | **2,2** | `LogListView` çalışır, iş raporu var; `IntegrationOperationLogs` 90 gün TTL (`OperationLog.ts:51`); iki kopya arama kodu (MM-02), kaçışsız regex, sınırsız `limit`; `integration-service` %23; denetim günlüğü **okuma ucu yok** (I2) |
| 3 | Dosya içe/dışa aktarma (Excel dışa aktarma, tenant KVKK zip, Excel/XML içe aktarma) | 2 | 2 | 2 | 2 | 1 | 3 | **2,0** | `exportExcel` senkron HTTP (`product-service.ts:430-458`, %13); tenant dışa aktarma senkron zip + R2 (`tenant-data-service.ts:116`, %98 test) ama indirme rotası yok (C17); Excel/XML içe aktarma yok (Y-07); `xlsx` CVE'li |
| 4 | Katalog boru hattı (Stager→Importer→Dispatcher→Validator→Publisher→Sentinel→Sync) | 4 | 3 | 3 | 4 | 3 | 2 | **3,2** | Mongo durum makinesi + lease (`Dispatcher`/`Sync`), engine %74 test; ama `while(true)`+durdurma yok, C21/Publisher client-1, `key.split('-')` (C14), global FIFO `createdAt`; `any` yoğun; `POD_NAME` kopyaları |
| 5 | Sipariş hattı (BullMQ: `OrderQueueProducer`, `OrderWorker`, `OrderErrorHandler`, repository'ler) | 4 | 4 | 3 | 4 | 3 | 3 | **3,5** | attempts 5 + backoff, `jobId` tekilleştirme, `removeOnFail` sayısı, imleç bütünlüğü (C7), `IntegrationError` kod→DLQ; worker/producer %91-96; ama repository'ler %0-11, `triggerDownstreamWorkflows` saplaması (`OrderOrchestrator.ts:125-135`), ölü-mektup kuyruğu için uyarı/UI yok |
| 6 | İade / soru-mesaj / destek talebi (`ClaimService`, `MessageService`, `TicketService`, ilgili repository'ler) | 3 | 2 | 1 | 1 | 2 | 2 | **1,8** | İşlevler var (onay/red/toplu, yanıt, talep); kapsam %0 (servisler+repo'lar); hata yönetimi `throw error` yeniden fırlatma; SLA/hazır yanıt/e-posta yok (Y-31); bildirim tetiklemesi yok |
| 7 | Ürün / kategori / marka / özellik / varyant yönetimi | 3 | 2 | 1 | 1 | 2 | 2 | **1,8** | Zengin işlev (`AttributeMappingService.autoMatchAllCategories`, varyant grupları); `variant-service` 527/`attributeMapping` 467/`product-service` 463 sat., **%0/%0/%13**; `any` 53/…; dinamik `$set` yolları; sınırsız listeler |
| 8 | Fiyat/stok senkronu (`StockAllocator`, `PostOrderOperations`, `StockPublishTrigger`, uzlaştırma/telafi işleri) | 4 | 4 | 2 | 4 | 3 | 3 | **3,3** | Atomik+idempotent rezervasyon, gerçek Mongo eşzamanlılık kanıtı, `operations/stock` %85; uzlaştırma sonucu KALICI DEĞİL (yalnız `console.warn`), zamanlayıcılar lider/kilitsiz (GV-08), fiyat kuralı (Y-16) yok, `stockPolicy` yazma ucu yok |
| 9 | Dashboard / istatistik (`getOrderDashboardInsights`, `StatsOperations`, `getProductStatistics`) | 2 | 2 | 1 | 2 | 2 | 3 | **2,0** | Her yüklemede 10 `aggregate` (tüm-zaman gruplamaları, önbelleksiz, `order-service.ts:541-…`), TZ hatası (GV-03), rapor modülü yok (G4); `StatsOperations` %3 |
| 10 | Arama (`SmartService.unifiedSearch`) | 3 | 2 | 1 | 1 | 1 | 3 | **1,8** | Kelime başına `$regex` + `$lookup` koleksiyon taraması (`smart-service.ts:47-…`), kaçışsız, `orderDate` hatası; indeks/`$text` yok; %0 |
| 11 | Dosya/görsel depolama (`StorageService`, `S3Manager`, `ImageService`, `ImageApiManager`, `image-operations`) | 3 | 2 | 1 | 1 | 2 | 2 | **1,8** | R2 + anahtar öneki tenant ayrımı (ADR-0013 B3) iyi; upload `multer` limitsiz bellek, MIME doğrulama yok, senkron `sharp` (0.32, CVE), ölü yerel-disk rotaları (GV-05); `S3Manager` %4, `image-service` %0 |
| 12 | Ayarlar (`SettingService`, `ConfigurationService`, `Settings` şeması) | 2 | 2 | 1 | 1 | 4 | 2 | **2,0** | Mass-assignment (GV-06), stok politikası/bildirim tercihi/KVKK bölümü yok (`FRONTEND_GAP_ANALYSIS` N5/N9/N4); `ConfigurationService.get` 7 servis örnekler; %0 |
| 13 | Kullanıcı/rol yönetimi (`UserService`, `SecurityService`, `Security`, `authenticate`, `operationPolicy`) | 2 | 3 | 3 | 4 | 3 | 3 | **3,0** | Sunucu RBAC kademeleri, tokenVersion, sabit-zamanlı, audit olayları (`user.create/password_change/role_change/delete`), test %87-99; ama davet/2FA/parola sıfırlama/e-posta doğrulama yok (Y-05/Y-20/N1/N2), `roleCode` hedef-rol kontrolü yok, merkezi/tenant çift kullanıcı kaydı (MM-20), captcha sahte |
| 14 | Admin paneli servisleri (`AdminService`) | 3 | 3 | 2 | 4 | 2 | 2 | **2,7** | %78 test, yazmalar audit'li, tamamı platformAdmin; 739 sat. God class (klasör/ticket/sistem sağlığı/export detayı), `getSystemHealth` pod-yerel + BullMQ iç anahtarları; `limit` sınırsız |
| 15 | E-posta | 1 | 1 | 1 | 1 | 1 | 2 | **1,2** | `MailService.ts` üretim yolunda çağrılmıyor (0 içe aktaran); nodemailer CVE'li; şifre sıfırlama/hoş geldin/davet/dunning e-postası yok (Y-05, `TrialExpiryJob.ts:28`) |
| 16 | Sistem izleme (`getSystemHealth`, `/health`+`/ready`, `IntegrationCallMetrics`, `QueueMetrics`, iş kayıtları, log) — **yalnız durum, çözüm ADR-0017** | 2 | 2 | 2 | 3 | 2 | 2 | **2,2** | `/health`/`/ready` sağlam (testli, `worker` rolü ayrı sunucu); `IntegrationCallMetrics` (30 gün TTL: kod/durum/gecikme/devre durumu) ve `QueueMetricsCollector` var; ama tenant görünümü yok (`getSystemHealth` yalnız platformAdmin), metrik uç noktası yok, kalp atışı yok, `getSystemHealth` yanıltıcı kaynaklar (MM-12), log yapısız (MM-10) |

### Yükseltme kararları (puan ≤ 3 olanlar; mimari karar gerektirenler `architect`'e)

| Alt sistem | Karar (neyi, nasıl modernleştir) | Kütüphane / desen | Boyut | Öncelik | Etki |
|---|---|---|---|---|---|
| Bildirim | Tek `notifications` modülü: olay → kalıcı gelen kutusu + **kanal adaptörleri** (uygulama içi, e-posta; SMS/push sonra) + tercihler (Settings); teslim BullMQ işiyle (yeniden deneme); FE için okunmamış sayacı + SSE/uzun-poll (10 sn tam liste çekme yerine); `await` hatası düzeltilir | Outbox (Mongo) + BullMQ `notifications` kuyruğu; `NotificationEventBus` yalnız süreç-içi yayın olarak kalır | M | P0 (Y-05/Y-06) | Sessiz kayıp biter; e-posta/dunning temeli |
| Log/rapor | `integrations/jobs` modülü: tek sorgu kurucu (kaçışsız arama, imleç sayfalama, izinli sıralama), `advancedSearch`+`getExportJobs` birleştir, arama alanları için bileşik indeks; denetim günlüğü **okuma** ucu (`AuditService.getAuditLogs`, tenant zorunlu) | `escapeRegex`, keyset pagination, Zod | M | P1 (Y-20/N10) | DoS kapanır, rapor hızı |
| Dosya içe/dışa aktarma | **Asenkron `jobs` çerçevesi** (koleksiyon `FileJobs` + BullMQ `file-jobs` kuyruğu): tür (excel-export, tenant-export, excel-import, xml-import), ilerleme, sonuç R2'de + imzalı indirme rotası (`verifyExportDownloadToken` bağlanır), hata raporu satır bazlı; `xlsx` → akışlı okuma/yazma | `exceljs` (MIT; akış), mevcut `archiver`, R2 | L | P0 (Y-07, N4) | HTTP zaman aşımı riski biter; C17 kapanır |
| Katalog boru hattı | ADR-0005/0006'yı **koru**; ekle: durdurma bayrağı + `AbortController` (Export/Import/Engine), tenant-adil sıra (round-robin `clientId`), `POD_NAME`→`podIdentity`, C21/C7 düzeltmeleri, web→worker sinyali Redis pub/sub | `@utils/mongoLease` (mevcut), ioredis pub/sub | M | P0 (C14/C21) | Kapanış güvenliği, sinyal gecikmesi biter |
| Sipariş hattı | Repository'ler için karakterizasyon (%0-11 → ≥70); `triggerDownstreamWorkflows` gerçek olay çıkışı (fatura/otomasyon/bildirim için outbox); DLQ (`failed`) için uyarı + tenant görünümü (Y-06) | BullMQ `QueueEvents` + outbox | M | P1 | Ölü iş görünürlüğü |
| İade/soru/talep | Karakterizasyon önce; sonra `orders` modülüne taşı; talep/mesaj olaylarını bildirim modülüne bağla; hazır yanıt/SLA (Y-31) P2 | Outbox olayları | M | P1 | Güvenli refaktör |
| Ürün/kategori/marka/özellik | Karakterizasyon (variant/attributeMapping/product/category/choice/brand/hashtag) → Zod şemaları + repository çıkarımı → `catalog` modülü; toplu güncelleme ucunu (Y-07d) düzelt | Zod, `database/repositories` | L | P1 | En büyük risk/`any` alanı |
| Fiyat/stok senkronu | Zamanlayıcıları ortak scheduler'a taşı (lider/kilit); `ReconciliationRuns` koleksiyonu (sonuç kalıcı) + okuma ucu; `stockPolicy` yazma ucu (`saveStockPolicy`); kanal bazlı fiyat kuralı (Y-16) `targetPublishPrice` deseniyle | BullMQ Job Scheduler | M | P0 (GV-08, Y-09) | Çift işlem biter, görünürlük |
| Dashboard/istatistik | Tenant TZ'ye göre sınırlar; ağır toplamalar için `Statistics` belgesi (mevcut `variant_stats` deseni) + kısa TTL önbellek; `ReportService` (Y-11) | Redis/`node-cache` TTL, önceden toplanmış günlük kovalar | M | P1 | Yük ↓, doğruluk ↑ |
| Arama | Kaçışsız + öneki bağlı arama; koleksiyon başına yansıtılmış `searchText` alanı + `$text` indeksi; Atlas kullanılıyorsa Atlas Search **(ADR: yerel Mongo desteklemez)** | `$text`, ya da Atlas Search | M | P2 | Ölçek |
| Dosya/görsel depolama | Presigned URL ile doğrudan R2 yükleme (sunucu belleği yok) + boyut/MIME doğrulama + asenkron küçük resim işi; `sharp` major yükseltme (karakterizasyon sonrası); ölü yerel-disk rotalarını sil | `@aws-sdk/s3-request-presigner` (mevcut SDK ailesi), sharp 0.35 | M | P1 | Bellek DoS, CVE |
| Ayarlar | Bölüm bazlı Zod şeması + `saveStockPolicy` + bildirim tercihi + KVKK bölümü için ayar uçları | Zod | S | P1 | Mass-assignment kapanır |
| Kullanıcı/rol | Parola sıfırlama/e-posta doğrulama/davet (tek kullanımlık token), TOTP 2FA, hedef-rol kontrolü, "kendi parolamı değiştir"; merkezi Users tek doğruluk kaynağı (mimari karar) | `otplib` (TOTP), mevcut `Security` | M-L | P0 (Y-05/Y-20) | Hesap güvenliği |
| Admin servisleri | `AdminService`'i alt cephelere böl (clients/tickets/health/exports); `limit` sınırla; sağlık verisi ADR-0017 çıktısına bağlanır | — | M | P2 | Bakım kolaylığı |
| E-posta | Sağlayıcı-bağımsız `MailChannel` portu (SMTP/Zoho başlangıç; API sağlayıcı sonradan), şablonlar, teslim sonucu kaydı; nodemailer 10'a geçiş **veya** API sağlayıcı — **karar `architect`** | Port+adaptör, BullMQ | M | P0 (Y-05) | Transactional e-posta |
| Sistem izleme | **Çözüm tasarlanmaz (ADR-0017)**; yalnız: kanıt MM-10/MM-12, `getSystemHealth` pod-yerel/BullMQ iç anahtar bağımlılığı | — | — | — | — |

---

## GENEL ALTYAPI BEST-PRACTICE KONTROL LİSTESİ

Durum: **VAR** / **YARIM** / **YOK**. Log mimarisi tasarımı ADR-0017'de; burada yalnızca mevcut durum kanıtlanır.

| # | Madde | Durum | Kanıt |
|---|---|---|---|
| 1 | Config doğrulama: tek env şeması, fail-fast | YARIM | Fail-fast yalnız `Security.assertConfig()` (JWT_SECRET), `assertFieldCryptoConfig()` (`entegrasyonik.ts:112-114`); geri kalan 43 env değişkeni dağınık/varsayılanlı (MM-07); `.env.example` 98 satır ama şema yok |
| 2 | Yapılandırılmış log | YOK | 314 `console.*`; `Logger.ts` = renkli önek (MM-10) |
| 3 | Log seviyesi | YOK | `LOG_LEVEL`/seviye ayrımı yok (info/warn/error yalnız `console` yöntem adı) |
| 4 | PII/sır redaksiyonu | YARIM | `redactForLog` (`secretKeys.ts`), `IntegrationError.redactMessage` (`IntegrationError.ts:39`), `responseSanitizer` var; `redactForLog` **0 çağıran**; ham `console.error(error)` yaygın |
| 5 | Correlation / request id | YOK | grep: requestId/correlation/AsyncLocalStorage yok |
| 6 | Güvenlik başlıkları (helmet/CSP) | YOK | `Webserver.ts` yalnız cors/cookie/compression; `x-powered-by` açık (GV-12). CORS: `*` reddi, Origin doğrulaması, çerez `httpOnly/secure/sameSite` VAR (`Security.ts:114-116`, `originCheck.ts`) |
| 7 | Rate limiting kapsamı | YARIM | login/register/billing webhook/mock checkout; süreç-içi; genel API/tenant/anahtar yok (GV-11) |
| 8 | Girdi doğrulama | YOK/YARIM | Şema kütüphanesi yok; ad-hoc: `operations/tenant/provisionInput.ts`, `originCheck.ts`; RPC gövdeleri serbest (MM-08) |
| 9 | Hata zarfı / hata kodu kataloğu | YARIM | `{error,service,operation}`; `IntegrationError` kod kataloğu (8 kod) yalnız adaptörde; API kodu yok (MM-09) |
| 10 | Graceful shutdown | YARIM | 6 adım/25 sn/`/ready`→503/BullMQ close/Redis quit VAR (`entegrasyonik.ts:53-93`, testli); zamanlayıcı `stop()` çağrılmıyor, orkestratör durdurma bayrağı yok |
| 11 | Health/readiness | VAR | `/health`,`/ready`, `worker` rolü için `HealthServer`, Docker `HEALTHCHECK`; metrik/Prometheus uç noktası YOK |
| 12 | CI/CD, kalite kapıları | YOK | Depoda pipeline dosyası yok (uzak: yerel Gitea `localhost:7001`); ADR-0007 "CI yok" |
| 13 | Lint / format | YOK | backend'de ESLint/Prettier yapılandırması yok (`frontend/.editorconfig` tek); `tsc` tek statik kapı |
| 14 | Commit/sürüm disiplini | YARIM | 126 commit, Türkçe konulu (`faz3-backlog:`, `merge:`); etiket/tag yok, `package.json` `version 1.0.0` sabit, CHANGELOG yok; `.gitattributes` yalnız token CSS |
| 15 | Bağımlılık güncelliği/audit/lisans | YARIM | `license-check` script + `docs/LICENSE_AUDIT.md` VAR; audit tek seferlik (5 prod bulgu); Renovate/Dependabot yok; express 4, Node 20 taban (GV-14) |
| 16 | Docker/compose güvenliği | YARIM | Çok aşamalı ✔, `USER node` ✔, `HEALTHCHECK` ✔, `npm prune --omit=dev` ✔, `.dockerignore` ✔, Redis `127.0.0.1` bağlı+`requirepass` ✔; imaj özeti sabit değil, salt-okunur FS/`cap_drop` yok, `krb5-dev` gereksinimi (GN-07), `dist` çıktısı şişik (GN-15) |
| 17 | Gizli yönetimi | YARIM | Env + AES-256-GCM alan şifreleme (`FieldCrypto`, anahtar rotasyon betiği) + sabit-sır statik testi VAR; gizli yönetim servisi yok; git geçmişi/`gitlab/backend.js` sızıntısı açık (C5) |
| 18 | Yedekleme/DR belgesi | YOK | `backup/README.md` = elle `mongodump` yönergesi; RPO/RTO/PITR/restore tatbikatı belgesi yok (`DATA_ARCHITECTURE_AUDIT.md` §7) |
| 19 | OpenAPI / dokümantasyon | YOK/YARIM | OpenAPI yok; ADR'ler (14) ve denetim raporları VAR; API başvurusu yok; `src/integration/README.md` bayat (GN-16) |
| 20 | Test piramidi / coverage eşiği | YARIM | 1806 birim/karakterizasyon + 1 gerçek-DB entegrasyon + 1 contract; HTTP düzeyi (supertest) yok; eşik yok; %54/%35 (TB-01/04) |

---

## ENTEGRASYON KATEGORİ KAPSAMI VE AJAN-HAZIRLIK

### 5.1 Kategori bazında kodda ne var

| Kategori | Backend adaptörü | Arayüz-yalnız (backend YOK) | Kod hacmi | Not |
|---|---|---|---|---|
| Pazaryeri | Trendyol, Hepsiburada, N11, Pazarama (4) | Amazon (`AmazonComponent` render edilmiyor; `FRONTEND_GAP_ANALYSIS` a-22) | 2 828 / 1 776 / 1 494 / 2 186 satır | Her biri api(connector)/services/transformers 3 katman; kalıp tutarlı |
| E-ticaret | Ideasoft (1; gerçek modda token akışı kopuk — C10) | Shopify, WooCommerce, Wix, Opencart, Ticimax, Anka, ETicaretSoft (7 form) | 1 107 satır | `ecommerce-service.ts` ölü (GN-11) |
| ERP | Bizimhesap (1; yalnız OKUMA, ERP sipariş polling'ine dahil değil) | Diğer ERP formları | 668 satır | — |
| E-fatura | **Yok** (`hasIntegratedProvider=false`, `invoice-service.ts:190`; ETTN sistemce ObjectId ile) | Sağlayıcı listesi FE'de sabit (`stores/einvoice.ts:6-39`) | 0 | `ClientIntegrations.einvoice[]` şemada var, fabrika aramıyor |
| Kargo | **Yok** (`hasShipmentIntegration=false`, `shipment-service.ts:80`; yalnız takip bilgisinin pazaryerine iletilmesi) | 9 kargo formu (`ShippingView.vue`) | 0 | `ClientIntegrations.shipment[]` şemada var, fabrika aramıyor |

Ortak arayüz kategori-genel mi? **Hayır.** `IPlatform` (`interfaces/platforms/index.ts:217-315`, ~37 metot) pazaryeri merkezli (katalog+sipariş+iade+mesaj+finans+kargo/fatura bildirimi); ERP/e-ticaret adaptörleri kullanmadıkları metotlar için `NOT_SUPPORTED` fırlatır (23 yer); kargo/e-fatura için uygun bir port yok. `IntegrationFactory` kategoriye göre değil koda göre `switch`'ler (`:193-202`) ve yapılandırma aramasını yalnız 3 dizide yapar (`:97-99`).

Yeni kategori/adaptör ekleme maliyeti (bugünkü yapıda): (i) yeni adaptör dizini (~7-30 dosya; mevcut adaptörler 0,7-2,8 bin satır), (ii) `IPlatform`'a sığmıyorsa arayüz genişletme veya ~35 saplama, (iii) `IntegrationFactory` `switch` + `getIntegrationConfig` dizisi + `validateSettings`, (iv) `Integrations` koleksiyonuna DB kaydı (içerik repoda yok — doğrulanamadı), (v) FE formu, (vi) `IntegrationCallMetrics`/`ResilientHttpClient` (tek satırlık ortak kısım — iyi), (vii) mock (`mockserver/`) ve contract testi. **Kargo/e-fatura için mevcut yapıda maliyet: BE L + arayüz/fabrika kırılması riski.** Yetenek-tabanlı portlar (§(d) `integration/ports`) bu maliyeti "port + adaptör + manifest" sırasına indirir.

### 5.2 Capability manifest / sürüm / doküman kaynağı — nerede tutuluyor

| Bilgi | Bugünkü yeri | Dağınıklık |
|---|---|---|
| Gerekli ayarlar | Sınıf alanı `requiredSettings` (6 adaptör: `trendyol/index.ts:54`, `hepsiburada/index.ts:32`, `n11/index.ts:22`, `pazarama/index.ts:34`, `ideasoft/index.ts:19`, `bizimhesap/index.ts:18`) | Kodda; UI formları ayrı |
| Desteklenen işlemler (yetenek) | Kod: `NOT_SUPPORTED` fırlatan metotlar (23 yer); belge: `INTEGRATIONS_REGISTRY.md` (elle); UI: kullanılabilirlik bayrağı yok (`FRONTEND_GAP` N13) | 3 ayrı, biri elle tutulan yer; makine-okunur manifest YOK |
| API sürümü / temel URL | Bağlayıcı içinde sabit varsayılanlar (ör. Trendyol `OrderConnector` URL'leri, `Service.ts` User-Agent; `bizimhesap/Service.ts:33`, `n11/Service.ts:33,59` `https://api.n11.com`, `hepsiburada/Service.ts:57`), DB `Integrations.urls` (içerik doğrulanamadı) | Sürüm alanı yok; URL'ler kod+DB'de |
| Hız sınırı | Adaptör `Service.ts` yapıcı argümanları (`ratePerMin`/`maxConcurrent`: Trendyol 1800/10, N11 1000/10, HB conc.5, Pazarama conc.11 (ratePerMin bilinmiyor), Ideasoft/Bizimhesap 300) | Kod içi yorumlarda "1f bulgusu" olarak gerekçelendirilmiş; manifestte değil |
| Resmi doküman kaynağı / son doğrulama | `docs/research/official-api-reference-sources.md` (markdown tablosu), `2026-09-27-api-verification.md`, `docs/research/1f-findings.md` | Makine-okunur değil; "son doğrulama tarihi/hash" alanı yok; otomatik drift tespiti "ayrı faz" diye ertelenmiş |
| Mock kapsamı | `*_MOCKABLE_ENDPOINTS` env listeleri (`MockMode.ts`), `mockserver/` | Env'de; sürümsüz |
| Site/pazarlama iddiası | ADR-0014 iddia kaydı (yalnız 6 canlı entegrasyon), FE formları | Manuel tutarlılık |

### 5.3 API değişimini yakalama imkânları (bugün)

| İmkân | Durum | Kanıt |
|---|---|---|
| Contract test | **Yalnız Trendyol** ve bilinçli zayıf (sapma `console.warn`, kırmızı yapmaz) | `tests/contract/Trendyol.schema.test.ts:1-60`; 6 adaptörde `*.resilience.contract.test.ts` HTTP davranış sözleşmesi (retry/breaker) — **şekil doğrulamaz** |
| Çalışma-zamanı yanıt şeması doğrulama | **YOK** | Dönüştürücüler alanları varsayar (eksik alan sessizce `undefined`); zod vb. yok |
| Sapma sinyali (metrik) | **YOK** | `IntegrationCallMetrics` yalnız `status/durationMs/retries/circuitState/code/httpStatus` (`IntegrationCallMetric.ts`); `IntegrationErrorCode` kümesinde `SCHEMA_DRIFT`/ayrıştırma hatası kodu yok (`AUTH, RATE_LIMITED, UNAVAILABLE, VALIDATION, NOT_FOUND, NOT_SUPPORTED, UNKNOWN_OUTCOME, INTERNAL`); 404/VALIDATION artışı dolaylı sinyal olabilir (doğrulanamadı) |
| Mock–gerçek sapma | **Yüksek risk** | `mockserver/` elle yazılmış (94 dosya); BACKLOG C20 (a-g): mock fatura alanı/`packageId`/`sku`/rate-limit kurallarını simüle etmiyor; Trendyol mock varsayılan URL'leri gerçek API'yle farklı; contract testi zayıf |
| Doküman izleme | **YOK** (yalnız kayıt) | `official-api-reference-sources.md` "ileride kurulacak" diyor |
| Kimlik bilgisi/bağlantı testi | **YOK** | `IPlatform.init()` üretim yolundan çağrılmıyor (`IntegrationFactory.getInstance` `init()` çağırmaz); "Bağlantıyı test et" ucu yok (Y-03e) |

### 5.4 Ajan-hazırlık (MCP/otomasyon ajanı için araç yüzeyi)

| Boyut | Bugün | Boşluk |
|---|---|---|
| Araç/servis yüzeyi | `OPERATION_POLICY` 28 servis / **159** kayıt (kademe: member 127, admin 14, owner 2, platformAdmin 16); ADR-0009 (MCP) kabul edilmiş, **kodda MCP/araç kaydı yok** | Politika kayıt sayısı belgelerde 156/158 (sayım biçimi farkı; bu ölçüm 159 — **doğrulanamadı** hangisi kanonik) |
| Salt-okunur / yazma ayrımı | **Metadata YOK.** Ad önekinden sezgisel: ~62 okuma benzeri (`get*/retrieve*/…`), ~97 yazma benzeri (`OperationPolicy` `M/A/O/P` yalnız kademe) | `kind: 'read'|'write'|'external'|'destructive'` alanı yok → ajan allowlist'i/insan onay kapısı üretilemez |
| Tenant kapsamı | Sunucuda doğrulanmış `tid` (`RunOperation.ts:47-51`) ✔; gövdedeki `order/clientId` atılır ✔ | Ajan/OAuth istemcisi principal türü yok (yalnız kullanıcı çerezi; ADR-0010 kodda yok) |
| Denetim izi | `AuditLogs` (365 gün TTL): auth, `admin.write`, `user.*`, `tenant.*`, `billing.webhook.*` | **Üye kademesi iş yazmaları** (cancelOrder, updateVariants, deleteProduct…) audit'e yazılmıyor: `isAdminWrite` yalnız `AdminService` (`RunOperation.ts:57-59`); `AuditLogs` okuma ucu yok |
| Görev/koşu kaydı | `IntegrationOperationLogs` (motor koşuları, 90 gün), `ExportSignals`/`ImportJobs`, `BillingEvents` | Ajan tool-call kaydı (kim/hangi araç/girdi özeti/sonuç/onay), iş kimliği/**idempotency-key** (yalnız `StockAllocator`/`BillingEvents`/BullMQ `jobId` düzeyinde), insan onayı akışı, kuru çalıştırma (yalnız `dev-tools`) yok |
| Oran/kota | Yalnız login/register/webhook | Principal başına araç oranı/kota yok (GV-11) |
| Araç şeması | Girdi şeması yok (MM-08) | JSON Schema üretilemez → MCP araç tanımı elle yazılmak zorunda |

### 5.5 Tespit edilen boşluklar (özet)

1. Kategori-genel port/manifest yok; e-fatura/kargo için fabrika+arayüz kırılma riski (MM-17).
2. Makine-okunur adaptör manifesti (kategori, yetenekler, API sürümü, doküman URL'si, son doğrulama, hız sınırı, mock kapsamı) yok; bilgi 5 yerde.
3. API-sapma tespiti: çalışma-zamanı yanıt şeması + `SCHEMA_DRIFT` kodu + tüm adaptörler için contract test + otomatik doküman izleme yok; mock elle ve sapmalı.
4. Bağlantı/kimlik bilgisi test ucu yok (`init()` çağrılmıyor) — Y-03e, Y-06, N7.
5. Ajan yüzeyi: politika metadata'sı (read/write/external), idempotency, üye-yazma audit'i, ajan principal, tool-call kaydı, oran sınırı, şema yok.
6. `Integrations` koleksiyonu içeriği (URL/ayar kaydı) repoda yok → hangi kategoriler DB'de "canlı" görünüyor **doğrulanamadı**.

---

## (c) Eksik yetenekler — backend haritası

Kaynak: `docs/research/2026-09-28-saas-capability-benchmark.md` (Y-01..Y-27) ve `docs/FRONTEND_GAP_ANALYSIS.md`. Benchmark belgesinin numaralaması içinde P2 tablosu Y-24..Y-33'e uzanır; burada P0/P1 + platform çekirdeği ele alınır.

### 6.1 P0/P1 yetenekleri (Y-01..Y-23)

| Y | Yetenek | Bugünkü backend (kanıt) | Ekleme noktası / yeni modül (mimari yeri) | Eksik parçalar | Bağımlılık | Boyut |
|---|---|---|---|---|---|---|
| Y-01 P0 | Kargo entegratör katmanı | `shipment-service.ts` (264 sat., %0 test) yalnız elle takip iletir; `:80` sabit false | Yeni `integration/modules/shipping/<firma>` + `integration/ports/IShipmentProvider` (gönderi oluştur, etiket/barkod, takip, iptal); `modules/shipping` use-case (toplu etiket PDF) | Port+manifest, ilk 2 firma adaptörü (insan seçer), `ResilientHttpClient`, mock, etiket PDF, toplu etiket, takip→pazaryeri yazımı (`sendOrderShipping` mevcut) | B-R18 (portlar), `shipment-service` karakterizasyonu, `AdapterRegistry` | L |
| Y-02 P0 | E-fatura/e-arşiv | `invoice-service.ts:190` sabit false; ETTN ObjectId | `integration/modules/einvoice/<sağlayıcı>` + `IInvoiceProvider`; `orders/invoice` use-case (sipariş→fatura; `syncInvoiceToPlatform` mevcut); kimlik bilgisi `FieldCrypto` | Port, sağlayıcı adaptörü (insan seçer), ETTN/PDF akışı, iptal/iade faturası, fatura silme yetki kararı | B-R18; `invoice-service` karakterizasyonu | L |
| Y-03 P0 | Gerçek-mod adaptör doğruluğu + bağlantı testi | Ideasoft `init()` çağrılmaz (C10); Trendyol URL kısmen (C11); HB `sendOrderShipping` takip kodu yok; N11 `OrderMapper` durum sabit APPROVED (BACKLOG C8 bulgusu); test ucu yok | `IntegrationService` → `integrations/health` modülü: `testConnection(code)` = `IPlatform.init()` + ping; `IntegrationFactory` `init()` çağırma noktası | `testConnection` ucu (politika+FE), Ideasoft token akışı, N11 durum eşleme | Canlı hesap (insan), B-R19 | M-L |
| Y-04 P0 | Plan/kota uygulaması | `EntitlementService` (`checkAccess/checkQuota`) yalnız `billing-service.ts:81-83` çağırır; guard yok; `Plans.features` (`PlanFeature` tipi) tüketilmiyor | **Tek uygulama noktası** `RunOperation.authorize` sonrası `entitlement guard` (politika `kind:write` → yazma izni; `checkQuota` kaynak sayımı); engine kapıları (`OrderQueueProducer`, `Dispatcher`); kayıt akışı | Politika `kind` metadata'sı (B-R10), kota sayaçları (kanal/kullanıcı/ürün), plan-özellik kapıları, `suspended` yumuşak/sert davranış testleri, yönetim ekranı uçları (iptal/plan değiştir/`getMyUsage`) | B-R10; ADR-0008 Aşama B | L |
| Y-05 P0 | Hesap kurtarma + e-posta | `MailService` ölü; parola sıfırlama/e-posta doğrulama/davet yok; `changeMyPassword` yok (`user-service.ts:146-181` yalnız admin) | `identity` modülü (`SecurityService.requestPasswordReset/resetPassword` `OPEN_OPERATIONS`'a; `UserService.changeMyPassword`; `inviteUser`) + `notifications` e-posta kanalı | Tek kullanımlık süreli token (hash'li), rate limit, `tokenVersion++`, e-posta şablonları, captcha kararı | E-posta sağlayıcı kararı (architect), `notifications` kanalı | M |
| Y-06 P0 | Entegrasyon sağlığı + uyarı merkezi | `IntegrationCallMetrics` yazılıyor; okuma yalnız `getSystemHealth` (platformAdmin); `ClientIntegrations.syncMetadata.lastOrderSync` | `integrations/health`: `getIntegrationHealth` (tenant süzmeli aggregate + `circuitState` + `syncMetadata` + son N hata + webhook sağlığı); düşük stok eşiği işi (`operations/stock`) | Aggregate uçları, eşik şeması, bildirim kuralları (OVERSOLD/UNMAPPED/kimlik hatası), DLQ görünürlüğü | `notifications`, ADR-0017 (metrik şeması) | M |
| Y-07 P0 | Toplu ürün işlemleri + Excel/XML içe aktarma | `exportExcel` senkron (`product-service.ts:430`); `VariantService.batchProcessUpdate` var (%0); FE'nin çağırdığı `ProductService/batchProcessUpdate` yok (403) | `jobs` çerçevesi + `catalog/import` (şablonlu Excel, XML/feed): doğrula→önizle→uygula→geri al | Async `FileJobs`, `exceljs`, satır bazlı hata raporu, yüzde/tutar toplu artış-azalış, XML tedarikçi formatı (insan) | `jobs` kuyruğu, `variant-service` karakterizasyonu | L |
| Y-08 P0 | Rol/yetki FE yansıması | BE kademe modeli VAR; `roleCode` hedef-rol kontrolü yok (admin owner atayabilir) | `identity`: `UserService.createUser/updateUser` hedef-rol kuralı; menü kademe süzmesi (`MenuService.get`, FRONTEND N18) | Hedef-rol matrisi, 15 belirsiz yıkıcı işlem kararı (`OPERATION_POLICY.md`) | İnsan kararı (kademe) | S |
| Y-09 P0 | Stok politikası API + OVERSOLD görünürlüğü | `stockPolicy` tenant `primaryChannel` için **yazma ucu yok** (`ClientIntegration.ts:29-35`); `saveClientMarketplaceSettings` `settings`'i tümüyle yazar (stockPolicy'yi silebilir — FRONTEND_GAP §6-6) | `integrations/settings`: `saveStockPolicy` + birleştirici `settings` yazımı; `getOrders` `allocationState` filtresi; varyant `available/reserved` | Zod şeması (aralık doğrulaması), birleştirme testi | `setting`/`integration` karakterizasyonu | S |
| Y-10 P0 | Görsel yükleme doğrulaması | `multer` limitsiz; ölü yerel-disk rotaları (GV-05); FE `postImageUpload` doğrulanamadı (OP notu) | `catalog/images` | Boyut/MIME sınırı, presigned yükleme, Playwright yolu | `image-service` karakterizasyonu | S |
| Y-11 P1 | Kâr/komisyon + rapor modülü | Komisyon `commissions.json` (Trendyol) + `retrieveCommisionForCategoryFromIntegration`; maliyet alanı yok; `Settlement.ts` kayıtsız | Yeni `reports` modülü (`ReportService`): satış/kâr/kanal/stok hareketi/envanter değeri; `FinancialService` | Varyantta alış maliyeti alanı, komisyon veri kaynağı (DB/çekim), ön-toplama, Excel çıktısı (`jobs`) | `jobs`, TZ düzeltmesi (GV-03) | L |
| Y-12 P1 | Hakediş mutabakatı | `FinancialService.getTransactionData`; `getFinancialSummary/getCargoInvoices/getPayoutDetails` politikasız (`financial-service.ts:101,137,198`); HB/N11 finans boş | `reports/reconciliation` + `Settlement` şeması (mevcut, kayıtsız) | Eşleştirme (sipariş↔ödeme emri), kesinti sınıfları, gecikmiş hakediş uyarısı | Y-11, `FinancialRepository` testi | L |
| Y-13 P1 | Pazaryeri/e-ticaret kapsamı | 4+1+1 adaptör | Yeni adaptörler `integration/modules/<kategori>/<kod>` (manifest+port) | Adaptör başına IR girdisi, API doğrulama, mock, contract test | B-R18 | L (adaptör başı) |
| Y-14 P1 | Genel API + API anahtarı + giden webhook | Yalnız RPC + çerez; gelen webhook (`WebhookApiManager`, `BillingWebhookApiManager`) var | `api/v1` (sürümlü REST, Zod→OpenAPI), `apiKeys` (yalnız hash, kapsam, oran sınırı), `webhooks` (abone+HMAC imza+BullMQ yeniden deneme+teslim günlüğü) | Yeni yüzey; plan kapısı (üst paket); anahtar = ajan principal temeli (ADR-0009/0010) | Y-04 guard, GV-11 Redis limiter, B-R10 | L |
| Y-15 P1 | Otomasyon kural motoru v1 | Yok (yalnız sabit `stockPolicy`) | `automation` modülü + `platform/events` (domain event outbox) + worker; `OrderWorker/PostOrderOperations` kancası | Tetik/koşul/eylem şeması, kuru çalıştırma, çalışma günlüğü, kota | Outbox olayları, `notifications`, Y-01 (kargo atama eylemi) | L |
| Y-16 P1 | Kanal bazlı fiyat kuralı | `Variants.platforms.<code>`; `Validator` `targetPublishQty` deseni | `catalog/pricing` + `Validator` `targetPublishPrice` dalı (aynı minimal desen) | Kural şeması, önizleme, yuvarlama/sınır | Validator karakterizasyonu (mevcut) | M |
| Y-17 P1 | Muhasebe/ERP yazma yönü | Bizimhesap yalnız okuma | `integration/modules/erp/*` + `IErpSink` portu; yeniden deneme kuyruğu | Yazma uçları, ERP polling'e dahil etme, hata kuyruğu | B-R18, Y-15 outbox | L |
| Y-18 P1 | Set/paket ürün | Yok | `catalog` + `StockAllocator` bileşen rezervasyonu | Bileşen şeması, türetilmiş stok | `StockAllocator` testleri (var) | M |
| Y-19 P1 | İade→stok + iade kargosu | `StockAllocator.restock` mevcut, iade akışına bağlı değil (doğrulanamadı); `claim-service` %0 | `orders/claims` | Onay sonrası restock (hasar seçeneği), iade kargosu | Y-01, karakterizasyon | M |
| Y-20 P1 | 2FA + denetim günlüğü arayüzü | `AuditLogs` yazılıyor; okuma yok; 2FA yok | `identity` (TOTP) + `AuditService.getAuditLogs` (tenant zorunlu; ADR-0013 sızıntı kuralları) | Kurtarma kodları, zorunlu kılma politikası, okuma ucu+indeks | `otplib`, Y-05 | M |
| Y-21 P1 | KVKK self-servis | `TenantDataService` (`requestDeletion/exportTenantData/cancelDeletion`), `anonymizeCustomer` VAR; **indirme rotası yok**; purge zamanlayıcısı yok | `tenancy` + `jobs` (asenkron dışa aktarma) + `GET /api/tenant/export/:token` rotası (`verifyExportDownloadToken` bağla) + `runPurgeForDueTenants` zamanlayıcısı | Rota, zamanlayıcı, rıza kaydı (`termsVersion`), 7 gün sonra silme | `jobs`, scheduler soyutlaması (B-R11) | M |
| Y-22 P1 | Onboarding sihirbazı | `getClientIntegrations`, `getProductStatistics`, `getMySubscription` ile türetilebilir | `onboarding` (durum) — küçük servis | İlerleme durumu alanı, `testConnection` (Y-03) | Y-03 | S |
| Y-23 P1 | e-İrsaliye | Yok | Y-02 sağlayıcı genişletmesi | Hukuki kapsam **doğrulanamadı** | Y-02 | M-L |

### 6.2 Platform çekirdeği eksikleri

| Çekirdek | Durum | Ekleme noktası | Eksik | Boyut |
|---|---|---|---|---|
| Genel API + API anahtarı yönetimi | YOK | `api/v1` + `apiKeys` (Y-14) | Tümü | L |
| Giden webhook (abone + imza + yeniden deneme) | YOK | `webhooks` modülü + BullMQ `webhook-delivery`; gelen tarafta `WebhookApiManager` deseni mevcut (imza doğrulama emsali `BillingWebhookApiManager`) | Abone kaydı, HMAC imza, teslim günlüğü, ölü mektup | M |
| Otomasyon kural motoru | YOK | `automation` (Y-15) | Tümü | L |
| Bildirim kanalları + tercihler (e-posta/SMS/push) | YARIM (yalnız uygulama içi) | `notifications` | Kanal portları, tercih, teslim işi | M |
| Dosya/rapor dışa aktarma işleri | YARIM (senkron) | `jobs` çerçevesi | Async, indirme rotası | M-L |
| Toplu içe aktarma (Excel/XML) | YOK | `jobs` + `catalog/import` | Tümü | L |
| Kullanıcı/rol/ekip yönetimi + 2FA | YARIM | `identity` | Davet, 2FA, hedef-rol, oturum sonlandırma ucu (`tokenVersion` altyapısı var) | M-L |
| Denetim günlüğü okuma | YOK | `AuditService` | Okuma ucu + üye yazmalarının audit'i | S-M |
| Faturalama/dunning | YARIM (Aşama A: model+mock+webhook+deneme bitişi job'ı) | `billing` | iyzico adaptörü, dunning yeniden deneme/e-posta takvimi, iptal/plan değiştirme/kart/fatura geçmişi uçları | L |
| Kota / rate-limit uygulaması | YARIM (yalnız login/register/webhook) | Guard (Y-04) + Redis limiter | Genel/tenant/anahtar kotası | M |
| Sağlık/durum | YARIM (/health,/ready) | ADR-0017 | Tenant görünümü, herkese açık durum özeti | S-M |
| Feature flag | YOK/YARIM | `Plans.features` + `EntitlementService.hasFeature` (tip `PlanFeature` tanımlı, tüketilmiyor); operasyonel kill-switch = config env | Ayrı bayrak servisi **önerilmez** (bkz. §(f)); plan-özellik kapısı yeterli | S |
| Yapılandırma/gizli yönetimi | YARIM | `config` modülü (B-R5) + mevcut `FieldCrypto` | Şema, gizli yönetimi servisi kararı (üretim ortamı) | M |
| Yedekleme/DR | YOK (belge yok) | `docs/DR_RUNBOOK` + Atlas PITR yapılandırması (insan) | RPO/RTO, restore tatbikatı, tenant bazlı geri yükleme prosedürü | M (belge+tatbikat) |
| Çok bölge / ölçekleme | — | Karar: **çok bölge YAPILMAZ** (tek haneli tenant, KVKK yurt içi/ADR); yatay ölçek web/worker rol ayrımıyla mevcut; darboğazlar MM-13/14/19 (zamanlayıcı, sinyal, havuz) — bunlar çözülmeden `replicas>1` önerilmez | — | — |

---

## (c) SİLİNECEK DOSYALAR

Silme YAPILMADI; liste kanıtlıdır. Her silme tek başına: `tsc` (build) + tam `jest` yeşil koşulu (Protokol 13). Silme sonrası `git revert` ile geri alınabilir.

### c.1 Kesin güvenli (referans yok; derleme/test etkisi yok)

| # | Dosya / öğe | "Referans yok" kanıtı |
|---|---|---|
| 1 | `backend/src/api/services/marketplace-service.ts1` (626 sat.) | `.ts1` uzantısı → `tsc`/jest görmez (`dist/` altında yok); adı yalnız `api/index.ts:4,35` **yorum** satırlarında; FE/test/dev-tools'ta yok |
| 2 | `backend/src/services/mail/.env.example` | Hiçbir kod/betik okumaz; içerik yalnız `ZOHO_*` şablonu → içeriği `backend/.env.example`'a taşı, dosyayı sil |
| 3 | `README` (kök, uzantısız) | Yalnız `mongodump` komut satırı notları; hiçbir belge/betik referans vermez |
| 4 | `Webserver.ts` ölü üyeler: `operations` Map (`:26,31-34`), `addSecurityCookie` (`:154-156`), `express.static`+SPA catch-all (`:128-136`) | Sınıf içinde başka okuma yok (`grep this.operations`); `dist/src/client` yok; `RunOperation` ayrı harita kurar |
| 5 | 131 kullanılmayan yerel/import (`tsc --noUnusedLocals` çıktısı) ve 24 kullanılmayan export tipi | Derleyici/knip kanıtı; silme `tsc` ile doğrulanır |
| 6 | `package.json`: `axios-rate-limit` | knip+depcheck+grep: import yok; kod yorumları kaldırıldığını belirtiyor |
| 7 | `RedisService.isRateLimited/acquireLock/releaseLock` (`:91-118`) | `src`/`tests`'te çağıran yok (grep); `acquireLock` güvensiz |
| 8 | `backend/src/api/services/register-service.ts` + `api/index.ts` kaydı | Politika kaydı yok → RPC'de yalnız 403; içinde `hebeleService` yer tutucusu; FE'de yalnız `restapi.ts:71` yapılandırma satırı (çağıran yok) — FE satırı FE ekibiyle birlikte |

### c.2 Onay gerekir (mimari/ürün/dağıtım kararı veya test düzenlemesi)

| # | Dosya / öğe | Neden onay | Kanıt |
|---|---|---|---|
| 1 | `nodemailer`, `@types/nodemailer`, `src/services/mail/MailService.ts` | E-posta kanalı (Y-05) sağlayıcı kararı; ama kullanan yok ve nodemailer prod-audit **high** → önerilen: şimdi sil, Y-05'te yeniden kur | knip; `grep mailService` yalnız yorum |
| 2 | `src/api/services/ecommerce-service.ts` (+ `api/index.ts` yorumları) | FE `IdeasoftComponent.vue:214`/`integrationStore.ts:47` çağırıyor (bugün 403) → Ideasoft ürün çekme yolu kararı (C10) | knip + FE grep |
| 3 | `src/operations/catalog/CatalogOperations.ts` | CLAUDE.md `@operations` örneği olarak anıyor; `@Cache` dekoratörlü canlı görünümlü | knip; `StatsOperations.ts:55` yalnız yorum |
| 4 | `src/utils/LifecycleManager.ts` | FE `useLifecycle.ts` paralel kopya: iş kuralı (sipariş/iade aksiyon izinleri) sunucuya taşınacak mı kararı | knip |
| 5 | `src/database/client/models/Settlement.ts`, `interfaces/settlement` | Y-12 (hakediş) tohumu olabilir | knip; `getSettlementModel` yok |
| 6 | `src/utils/BarcodeGenerator.ts` + `tests/smoke.test.ts` düzenlemesi | Yalnız smoke testi içe aktarır (Protokol 13: test değişir) | grep |
| 7 | `backend/rollup.config.js`, `webpack.config.js`, script `herokubuild`, 8 devDep/dep (GN-05) | Railway/Render build komutları **doğrulanamadı** | package.json/Dockerfile taraması |
| 8 | Native isteğe bağlı paketler `kerberos`, `snappy`, `@mongodb-js/zstd`, `mongodb-client-encryption`, `gcp-metadata` + Dockerfile `krb5-dev` | Canlı `DB_URL`'de `compressors=` doğrulanamadı | grep `src`; Dockerfile:10-12 |
| 9 | `xlsx` → `exceljs` | Y-07 ile birlikte; yalnız yazma kullanılıyor | `product-service.ts:456-458` |
| 10 | `commissions.json` (Trendyol 2,9 MB), Pazarama `[]` dosyaları | Ürün kararı: komisyon verisinin kaynağı | `CategoryService.ts` içe aktarır (**kullanılıyor**, silinmez, taşınır) |
| 11 | `gitlab/` (tamamı, özellikle `gitlab/entegrasyonikapp/backend.js` 34 MB + izlenen `node_modules` 1417 dosya) | **C5 — Protokol 12, insan kararı** (rotasyon + geçmiş yeniden yazımı). Bu denetim silmez | `git ls-files gitlab` |
| 12 | `mockserver/` (özellikle `backend/server.js:19` izinli DB dışı, `herpsiburada/` typo klasörü, ikili `.docx/.odt`, bozuk `scratch/seedScenarios.js`) | **C15 — insan kararı** | `git ls-files mockserver` |

### c.3 SİLİNMEMESİ gerekenler (knip yanlış pozitifleri)
`dev-tools/*.js` (operasyonel/göç betikleri, testlerle korunuyor), `entegrasyonik.ts` içindeki `resolveAppRole` export'u (test kullanır), `database/tenantConnection.ts` yardımcıları (test), `IntegrationEngineProvider` (kullanımda; yalnız `IIntegrationEngineProvider` **import'u** ölü), `docs/staging/unused-files.md` (izlenen rapor).

---

## (d) HEDEF MODERN BACKEND MİMARİSİ (Express + TypeScript modüler monolit)

**İlke:** Genel hatlar korunur — çok kiracılı, `IntegrationEngine` = orkestratör+worker, adaptörler, mevcut alias'lar (`@api @services @operations @integration @database @interfaces @utils @health`) ve **RPC sözleşmesi (FE)** aynen kalır. Yeni alias: `@config`, `@platform`. Mikroservis, framework değişimi (NestJS/Fastify), ORM değişimi, GraphQL, büyük patlama klasör taşıması **önerilmez**. Her adım geri alınabilir ve testli.

### d.1 Katman sözleşmesi (yazılı + dependency-cruiser ile zorlanır)

```
interfaces, utils, config          ← yaprak (kimseye bağımlı değil; utils/config → interfaces olabilir)
platform (logger, errors, requestContext, scheduler, jobs, events, http-middleware)  → config, utils
database (models, ClientDB/ApplicationDB, repositories)  → interfaces, utils, config
services (altyapı adaptörleri: redis, storage, mail-transport, metrics, audit)  → database?, platform
integration/modules (adaptörler) + integration/ports  → interfaces, utils, platform, database(yalnız tip)
operations (kullanım senaryoları/iş kuralları, alan-bazlı)  → database, services, integration, platform
integration/engine (orkestratör/worker)  → operations, integration/modules, database, services, platform
api (RPC, v1, webhooks, middleware)  → operations, services, platform   (api ← başka hiçbir katman içe aktarmaz)
```
Yasak: `database|services|operations|integration → api`; `integration/modules → operations|api`; `database → operations|integration`.
Bugünkü ihlaller: `operations→api` 6, `integration/modules→api` 2 (MM-04); döngü: yalnız `interfaces` (tip).

### d.2 Mevcut → hedef eşleme

| Mevcut | Hedef | Not |
|---|---|---|
| `entegrasyonik.ts` (204 sat.: kapatma+rol+zamanlayıcı başlatma) | `src/main.ts` bileşim kökü: `config` yükle → `platform` başlat → `rolePlan(APP_ROLE)` (web/worker/all) → **zamanlayıcı kaydı** tek yerde | Davranış aynı; 5 `*Scheduler.start()` → `scheduler.register(...)` |
| — | **`src/config/`**: `env.schema.ts` (Zod), `index.ts` (`config` tipli, fail-fast), `roles.ts` | MM-07; 58 `process.env` okuması kademeli taşınır |
| `utils/Logger.ts`, `utils/secretKeys.ts` (`redactForLog`), `console.*` | **`src/platform/logger`** (cephe; kütüphane ADR-0017) + `requestContext` (AsyncLocalStorage: `requestId`, `tenantId`, `principal`) | MM-10; redaksiyon bağlanır |
| `api/Security.ts` (`ApplicationError`, parola karması), `api/integrationSecrets.ts`, `api/responseSanitizer.ts` | `platform/errors` (`AppError`, hata kodu kataloğu), `utils`/`services/crypto` (`integrationSecrets`, sanitizer) | MM-04; `api/http/errorMiddleware` |
| `api/ApiManager.ts` (rotalar+RPC), `ApiWrapper.ts`, `RunOperation.ts`, `operationPolicy.ts`, `authenticate.ts`, `originCheck.ts`, `rateLimit.ts` | `api/rpc/` (RunOperation, ApiWrapper, **politika kaydı = `{tier, kind, schema, sideEffect}`**), `api/http/` (authenticate, originCheck, rateLimit→Redis, requestId, helmet, errorMiddleware), `api/webhooks/` (Trendyol, Billing, MockCheckout), `api/v1/` (yeni kamu API) | RPC adları/gövdeleri **değişmez** |
| `api/services/*.ts` (26 sınıf) | `api/rpc/handlers/*` **ince cephe** (aynı sınıf adı: `OrderService` vb. — FE sözleşmesi) → girdi Zod → `operations/<alan>` use-case → DTO | Kademeli; her servis kendi adımında |
| `operations/{billing,catalog,client,integration,stock,tenant}` | `operations/<alan>/` alan-bazlı: `catalog`, `orders`, `integrations`, `tenancy`, `identity`, `billing`, `stock`, `notifications`, `automation`, `reports`, `jobs` (her alan: `*.usecase.ts`, `*.schema.ts`, `*.policy.ts`) | Modüler monolit: alanlar arası çağrı yalnız alanın `index.ts` cephesinden |
| `services/{audit,billing,image,mail,metrics,notification,redis,statistics,storage}` | `services/` yalnız **altyapı adaptörleri** (redis, storage, mail-transport, metrics, audit-sink); alan mantığı (`EntitlementService`, `NotificationService`, `image-operations`, `StatisticsTracker`) → ilgili `operations/<alan>` | MM-03 |
| `database/{application,client}/models` + `ClientDB.getXModel()` | Aynı; ek: `database/repositories/*` (tenant-kapsamlı, tip güvenli; `find/aggregate` sorgu kurucuları burada) | Sorgu kopyaları (MM-02) tek yerde |
| `integration/modules/IntegrationFactory.ts` (switch) | `integration/registry/AdapterRegistry.ts` (kayıt tablosu: `code → {manifest, factory}`), `getInstance(code)` aynı imza | MM-17/18; Proxy kaldırılır, zaman aşımı `ResilientHttpClient`+`AbortSignal` |
| `interfaces/platforms/IPlatform` (~37 metot) | `integration/ports/`: `ICatalogSource`, `IProductPublisher`, `IOrderSource`, `IOrderActions`, `IClaimHandler`, `IMessageHandler`, `IFinanceSource`, `IShipmentProvider`, `IInvoiceProvider`, `IErpSink` + `AdapterManifest {code, category, capabilities[], requiredSettings, apiVersion, docsUrl, lastVerifiedAt, rateLimit, mockable}`; `IPlatform` = uyumluluk birleşimi (mevcut 6 adaptör bozulmaz) | Yeni kategori = port + manifest + adaptör |
| `integration/engine/*` | Aynı (ADR-0005/0006); Export/Import döngülerine durdurma bayrağı; sinyal Redis pub/sub; `POD_NAME` → `@utils/podIdentity` | Katalog hattı **yeniden yazılmaz** |
| 5 `*Scheduler` + `IntegrationEngine.setInterval` + `OrderOrchestrator.setInterval` + `QueueMetricsCollector` | **`platform/scheduler`** (BullMQ Job Scheduler `upsertJobScheduler`: tek yürütme, tekrar/jitter; Redis gerektirir — zaten worker için zorunlu) + overlap guard + shutdown kancası | MM-13; **architect kararı** (alternatif: `mongoLease` lider) |
| `NotificationEventBus`/`IntegrationEventBus` (in-process) | Süreç-içi yayın olarak kalır; pod'lar-arası sinyal için `platform/events` (Redis pub/sub) + domain-event **outbox** (Mongo) → otomasyon/webhook/bildirim tüketicileri | MM-14/15 |
| — | **`platform/jobs`**: isimli BullMQ kuyrukları (`file-jobs`, `notifications`, `webhook-delivery`, `automation`); ortak retry/backoff/DLQ/metric | Sipariş kuyruğu (`order-sync-queue`) dokunulmaz |
| `api/index.ts` (servis kayıt nesnesi) | Otomatik türetilmiş kayıt: politika kaydı ile aynı tablo → tek kaynak (`SERVICES` haritası); politika olmayan servis derlenmez/test kırar | Çift kayıt biter |
| `tsconfig.json` | + `tsconfig.build.json` (`src/**`, `entegrasyonik.ts`; tests hariç; `declaration:false`), `target ES2022`, `lib ES2022`, `useDefineForClassFields:false`, `noUnusedLocals` | GN-15/MM-16 |

### d.3 Gerekli kütüphaneler (minimum; her biri mevcut yığına eklenir, framework değişmez)

| Amaç | Öneri | Not |
|---|---|---|
| Girdi/şema doğrulama + tip türetme | `zod` | RPC politika kaydı + `api/v1` + MCP araç şeması + env şeması için tek şema dili |
| OpenAPI (yalnız `api/v1`) | `zod-to-openapi` (veya `@asteasolutions/zod-to-openapi`) | RPC için OpenAPI **üretilmez** (FE-özel) |
| Güvenlik başlıkları | `helmet` | + `app.disable('x-powered-by')` |
| Dağıtık rate limit | `rate-limiter-flexible` (Redis) veya mevcut `RedisService` üzerine sliding-window | login/register + genel + anahtar/tenant |
| Zamanlayıcı | `bullmq` (mevcut) `upsertJobScheduler` | Yeni bağımlılık yok |
| Yapılandırılmış log | ADR-0017 (aday: `pino`) | Bu belge seçmez |
| 2FA | `otplib` | TOTP |
| Excel | `exceljs` (xlsx yerine) | Akışlı okuma/yazma |
| E-posta | Port + (nodemailer 10 **veya** API sağlayıcı) | architect |
| Kalite | `typescript-eslint`, `prettier`, `dependency-cruiser`, `knip` (yapılandırmalı) | devDep; `npm run verify` |
| HTTP test | `supertest` | RPC/hata zarfı sözleşme testleri |

### d.4 "Genel hatlara uyum" gerekçesi
Çok kiracılılık: tenant kimliği hâlâ yalnız doğrulanmış principal'dan (`RunOperation`); yeni `requestContext` bunu görünür kılar, gevşetmez. Orkestratör+worker: `IntegrationEngine`, Mongo durum makinesi, BullMQ sipariş hattı ve `APP_ROLE` ayrımı korunur; eklenen yalnız zamanlayıcı/olay/iş kuyruğu **altyapısıdır**. Adaptörler: mevcut 6 adaptör `IPlatform` birleşimiyle çalışmaya devam eder; portlar additive gelir. Path alias'lar: mevcut sekiz + iki yeni; klasör taşımaları alias'la kalır (test içe aktarma yolları mekanik güncellenir). FE sözleşmesi: `POST /api/:service/:operation` ve yanıt biçimleri değişmez; hata yanıtında yeni alan (`code`, `errorId`) **eklenir**, `error` metni korunur (beklenmeyen hatalarda maskelenir — FE metin eşleştirmesi varsa etkilenir: **doğrulanamadı**, FE taraması gerekir).

---

## (e) REFAKTÖR / TAMAMLAMA PLANI

Kurallar: her adım küçük, bağımsız, geri alınabilir; **önce karakterizasyon**, sonra değişiklik (Protokol 13); DB'ye dokunan adım yedek şartı (CLAUDE.md kural 3); tenant izolasyonu/`operationPolicy` testleri (`tests/characterization/auth/*`) her adımda yeşil kalır. Ölçüm: `npx tsc --noEmit`, `npm run build`, `npx jest` (1806 test), (varsa) `knip`, `depcruise`.
Boyut: S/M/L. Bağımlılık `←` ile.

### Faz 0 — Silme / mekanik (risk düşük)

| Adım | Kapsam | Güvenlik ağı | Boyut | Bağımlılık |
|---|---|---|---|---|
| **B-R1** | §(c) c.1 "kesin güvenli" silmeler + `noUnusedLocals` temizliği (131) | `tsc`, tam jest, `npm run build` | S | — |
| **B-R2** | Bağımlılık temizliği: `axios-rate-limit` sil; **onaya bağlı**: nodemailer+MailService, native isteğe bağlı paketler, rollup/webpack zinciri; `npm audit fix` (qs); `uuid`→`crypto.randomUUID`; `ioredis`/`lru-cache` bildir; `typescript`/`@types/bcrypt` devDep; `@jest/globals` devDep; Dockerfile `krb5-dev` çıkar (onay sonrası) | `docker build` (kural: yalnız build, compose up yok), tam jest; `npm audit --omit=dev` (hedef: sharp+xlsx hariç 0) | S | B-R1; onaylar |
| **B-R3** | `tsconfig.build.json` (tests/json hariç, `declaration:false`), `target ES2022`+`useDefineForClassFields:false`, `lib ES2022` (dom kaldır), `noUnusedLocals`; `test`'ten gerçek-DB testini ayır | `npm run build` çıktı boyutu, `dist/` altında test yok, tam jest, `start:local` duman | S | B-R1 |
| **B-R4** | Kalite kapıları: `typescript-eslint` (önce `no-floating-promises`, `no-misused-promises`, `no-console` uyarı), `prettier` (yalnızca değişen dosyalar), `dependency-cruiser` (§d.1 kuralları, **mevcut ihlaller taban çizgisi** ile), `knip.json` (girdi noktaları: `entegrasyonik.ts`, `dev-tools`, `tests`), jest `coverageThreshold` (mevcut %54 altına düşmeyi engelle), `npm run verify`; CI dosyası (uzak Gitea; ana bilgisayar kararı) | Betik kendi kendini çalıştırır | M | B-R3 |

### Faz 1 — Temel altyapı (additive; sonra kademeli geçiş)

| Adım | Kapsam | Güvenlik ağı | Boyut | Bağımlılık |
|---|---|---|---|---|
| **B-R5** | `src/config` (Zod env şeması, fail-fast, tipli `config`); önce yeni kod + `Webserver/Security/Redis/Database` geçişi, sonra kalan 58 okuma dosya dosya | `entegrasyonik.test.ts`, `storage-env.test`, `RedisService.test`; env-yokken başlatma testleri | M | B-R4 |
| **B-R6** | `platform/errors`: `AppError`+hata kodu kataloğu, merkezi hata middleware'i; **beklenmeyen hata maskelenir** (`errorId`), `ApplicationError`→`AppError` uyumlu alt sınıf; kullanıcıya gösterilen genel `Error`'lar servis servis `AppError(4xx)`'e çevrilir | `api-manager.test`, `run-operation.test`; yeni: 500 maskeleme testi; FE metin bağımlılığı taraması (FE) | M | B-R5 |
| **B-R7** | `platform/logger` cephesi + `requestContext` (requestId/tenantId) + `redactForLog` bağlantısı; `console.*` kademeli geçiş; **kütüphane/şema ADR-0017'ye göre** | `AuditLogger`/`egress-guard` testleri; log biçimi testi | M | ADR-0017, B-R5 |
| **B-R8** | Ortak sorgu yardımcıları: `escapeRegex`, `parsePagination(limit≤100)`, `parseSort(izinli alan)`; 20+ `$regex`, sınırsız `limit`, `sort` sitelerine uygula | Mevcut `order-service`/`customer`/`admin` karakterizasyonu + yeni yardımcı testleri; 0% servislerde önce B-R-T | S-M | B-R-T1 (ilgili servis) |
| **B-R9** | Doğruluk düzeltmeleri: `getOrders` `dates.orderDate` (test kasıtlı ters çevrilir), dashboard TZ, `NotificationService` `await`, `OversellCompensationJob` atomik talep (GV-08), captcha kararı (FE ile) | Her biri kendi karakterizasyon testi | S | — (GV-08 öncelikli) |
| **B-R10** | Politika kaydını genişlet: `{tier, kind:'read'|'write'|'external', schema?}` (mevcut 159 kayıt için `kind` ad önekinden üretilip elle gözden geçirilir); `RunOperation.authorize` sonrası `validate(schema)` kancası (şema yoksa geçer) + **entitlement kancası** (Y-04, yalnız `kind:'write'`) | `operation-policy.test.ts` (FE envanteri), `run-operation.test.ts` | M | B-R6 |
| **B-R11** | `platform/scheduler`: BullMQ Job Scheduler (veya `mongoLease` lider — architect) + overlap guard + `gracefulShutdown` adım 3'e bağla; 5 `*Scheduler`+`IntegrationEngine`+`OrderOrchestrator` aralıkları göç; Redis kapalıyken atlama semantiği korunur | Mevcut scheduler testleri (`AllocationSweepScheduler.test`, `TrialExpiryScheduler.test`, `*.lifecycle`), yeni: çift-pod simülasyonu (mock) | M | B-R9 |
| **B-R12** | Katalog motoru dayanıklılığı: Export/Import/Engine durdurma bayrağı (`AbortController`), `key.split('-')` düzeltmesi, `POD_NAME`→`podIdentity`, web→worker sinyali Redis pub/sub (ADR-0005 uyumlu), C21+C7 (Publisher client-1) — **ayrı çalışan ajanla koordinasyon** | `tests/characterization/engine/*` (var), `Publisher.clientOneFallback`, `IntegrationFactory.getMatchKeyPromise` testleri kasıtlı ters çevrilir | M | B-R11 |

### Faz 2 — Test güvenlik ağı (paralel; her servis refaktöründen ÖNCE)

| Adım | Kapsam | Boyut | Bağımlılık |
|---|---|---|---|
| **B-R-T1** | Karakterizasyon: `variant`, `attributeMapping`, `product`, `category`, `choice`, `brand`, `hashtag` (katalog) — hedef ≥ %70 | L (paralel 3-4 alt görev) | — |
| **B-R-T2** | `claim`, `message`, `ticket`, `invoice`, `shipment`, `financial`, `customer` + `OrderRepository`/`Customer/Claim/Invoice/Message/FinancialRepository` | L | — |
| **B-R-T3** | `integration-service` (%23→70; iş günlüğü/ayar/webhook), `menu`, `setting`, `configuration`, `smart`, `notification`, `image-service`+`S3Manager`+`image-operations` | L | — |
| **B-R-T4** | Adaptör ürün/kategori transformer'ları (%3-25 → ≥60) + tüm adaptörlerde contract test şablonu (Trendyol şablonundan) | L | — |
| **B-R-T5** | Flaky düzeltmesi (`ResilientHttpClient.test.ts` sahte zamanlayıcı), HTTP düzeyi `supertest` sözleşme testleri (hata zarfı, auth, politika) | S-M | B-R6 |

### Faz 3 — Katman / şema doğrulama / modülerleştirme

| Adım | Kapsam | Güvenlik ağı | Boyut | Bağımlılık |
|---|---|---|---|---|
| **B-R13** | Ters bağımlılıkları çöz: `Security.ApplicationError/hash`, `integrationSecrets`, `responseSanitizer` → `platform/errors`/`utils`; dependency-cruiser kuralları **enforce** | Tüm auth/secrets testleri | S | B-R4, B-R6 |
| **B-R14** | Zod şemaları (yüksek risk sırasıyla): `SettingService`, `IntegrationService` ayar kaydı, arama/liste operasyonları, kullanıcı yönetimi, ürün/varyant yazma; politika kaydına bağla (B-R10) | İlgili karakterizasyon (B-R-T*) + şema ret testleri | M (servis başı S) | B-R10, B-R-T* |
| **B-R15** | `IntegrationService` bölme (ayar / iş günlüğü / dışa aktarma toplu işlem → `integration/engine/catalog/export/ExportBatchService` / platform arama); RPC cephesi aynı adlarla; `advancedSearch`+`getExportJobs` birleştir | `IntegrationService.importJobs.idor.test`, `OrderQueueProducer` vb. + B-R-T3 | L | B-R-T3, B-R8 |
| **B-R16** | `AdminService`/`OrderService`/`VariantService`/`ProductService` ince cepheye + `database/repositories` (bir servis/adım) | İlgili karakterizasyon | M×n | B-R-T*, B-R14 |
| **B-R17** | Adaptör portları + `AdapterManifest` + `AdapterRegistry` (additive; `IPlatform` birleşimi korunur; Proxy kaldır, `AbortSignal`); `IntegrationFactory` kayıt tablosuna göç; `shipment`/`einvoice` config arama | `Trendyol/HB/N11/Pazarama/Ideasoft/Bizimhesap.resilience.contract`, `IntegrationFactory` testleri, `IntegrationCallMetrics.adapters.contract` | M-L | B-R12 |
| **B-R18** | Tenant kaydı önbelleği (`getClientDB`/`authenticate` 3 okuma → 1), `ClientDB` havuz/LRU referans sayımı | `ClientDB.characterization`, `authenticate.test` | M | B-R5 |

### Faz 4 — Yeni yetenek modülleri (ADR + insan kararı sonrası; her biri ayrı ajan)

| Adım | Yetenek | Bağımlılık | Boyut |
|---|---|---|---|
| **B-N1** | `notifications` (kanal portu, tercih, e-posta, teslim işi) + `MailChannel` [Y-05/H2] | B-R11 (`platform/jobs`), e-posta kararı | M |
| **B-N2** | Hesap kurtarma/e-posta doğrulama/davet/`changeMyPassword`/hedef-rol kuralı [Y-05, Y-08] | B-N1, B-R10 | M |
| **B-N3** | Entitlement guard + kota sayaçları + yönetim uçları [Y-04] | B-R10 | L |
| **B-N4** | `integrations/health` (`getIntegrationHealth`, `testConnection`) [Y-06, Y-03e] | B-R17, ADR-0017 | M |
| **B-N5** | `platform/jobs` + asenkron dışa/içe aktarma (Excel/XML/tenant-export) + indirme rotası + purge zamanlayıcısı [Y-07, Y-21, C17] | B-R11, `exceljs` | L |
| **B-N6** | `saveStockPolicy` + `getOrders` allocation filtresi + `ReconciliationRuns` [Y-09, N5/N6/N8] | B-R14 | S-M |
| **B-N7** | `AuditService.getAuditLogs` + üye yazmaları audit'i (`kind:'write'`) [Y-20, N10] | B-R10 | S-M |
| **B-N8** | Kargo katmanı [Y-01] | B-R17, B-R-T2 | L |
| **B-N9** | E-fatura katmanı [Y-02] | B-R17, B-R-T2 | L |
| **B-N10** | `api/v1` + API anahtarı + giden webhook + OpenAPI [Y-14] | B-N3, Redis limiter, B-R10 | L |
| **B-N11** | Otomasyon kural motoru v1 (outbox) [Y-15] | B-N1, B-N8 | L |
| **B-N12** | Raporlama (kâr/komisyon/hakediş) [Y-11/12] | B-N5, GV-03 | L |
| **B-N13** | 2FA (TOTP) [Y-20] | B-N2 | M |

Öncelik özeti (mimari zorunluluk sırası): B-R1..B-R4 → B-R9(GV-08) → B-R5..B-R8, B-R-T* → B-R10..B-R12 → B-R13..B-R18 → B-N*.

Her B-R adımı `entegrasyonik-architect` gerektiren noktalar: **B-R11** (BullMQ scheduler vs mongoLease lider), **B-R7** (log kütüphanesi = ADR-0017), **B-R17** (port bölünmesi/manifest şeması), **B-N1/B-N2** (e-posta sağlayıcısı), **B-N10** (API anahtarı/OAuth = ADR-0009/0010), MM-20 (kullanıcı çift kaydı), arama teknolojisi (Atlas Search vs `$text`).

---

## (f) YAPILMAMASI GEREKENLER

1. **Mikroservise bölme, NestJS/Fastify geçişi, GraphQL, ORM (Prisma/TypeORM) değişimi, Kafka/RabbitMQ eklemek** — Express+Mongoose+BullMQ yığını modüler monolit iyileştirmesiyle yeterli; ölçek tek haneli tenant.
2. **Katalog hattını (Stager→…→Sync) BullMQ'ya toptan taşımak veya yeniden yazmak** — ADR-0005 kararı; yalnız dayanıklılık eklemeleri (durdurma bayrağı, sinyal, adil sıra).
3. **RPC operasyon adlarını / yanıt biçimlerini değiştirmek** (FE sözleşmesi) — yeni yüzey `api/v1`'de; hata yanıtına yalnız alan eklenir.
4. **Big-bang klasör taşıma** — alan-bazlı dikey dilim, adım başına bir servis; eski yol için kısa ömürlü yeniden-dışa-aktarma yalnız gerekirse.
5. **Karakterizasyonsuz refaktör** (özellikle %0 servisler, `IntegrationService`, `variant-service`) — Protokol 13.
6. **`any`'ları topluca kaldırma / `strict` ek bayraklarını tek seferde açma** — `noUnusedLocals` ile başla, dosya dosya.
7. **`gitlab/` klasörünü, `backend.js` bundle'ını veya `mockserver/`'ı silmek/geçmişi yeniden yazmak** — C5/C15 insan kararı (Protokol 12); bu denetim yalnız raporlar.
8. **Canlı/gerçek DB, Redis, pazaryeri uçlarına dokunan doğrulama** (kural 2/3, C19) — göç/purge/seed betikleri yedeksiz çalıştırılmaz.
9. **Ayrı feature-flag servisi (LaunchDarkly vb.) veya çok-bölge dağıtımı eklemek** — plan-özellik kapısı (`Plans.features`) + env kill-switch yeterli; çok bölge KVKK/ölçek gerekçesiyle gündem dışı.
10. **`nodemailer`'ı körlemesine yükseltip ölü `MailService`'i canlandırmak** — önce e-posta sağlayıcı kararı (Y-05).
11. **`xlsx`'i sabitleyip bırakmak** (düzeltmesiz CVE) — `exceljs` ile Y-07'de değiştir; o zamana dek yalnız-yazma kullanım riski sınırlı (okuma yolu yok).
12. **`getCaptcha`'yı FE'yle koordinasyonsuz kaldırmak** — `LoginComponent.vue:266` çağırıyor; kaldırma/gerçek doğrulama birlikte.
13. **`IPlatform`'ı yerinde genişletmek** (kargo/e-fatura için) — portlar additive gelir; mevcut adaptörler birleşim tipiyle çalışır.
14. **`docs/staging`'deki Faz 1 silme listesini körlemesine uygulamak** — çoğu zaten silinmiş; knip yanlış pozitifleri (§c.3) korunmalı.

---

## Ek-A — Kapsam tablosu (jest `--coverage`, `StockAllocator.concurrency` hariç)

| Dizin | Satır (ifade) | Kapsam |
|---|---|---|
| `src/api/*` (servis dışı) | ~1 000 | ApiManager/RunOperation/Security/authenticate/rateLimit/… %99-100; `ImageApiManager` %47; `api/index.ts` %0 |
| `src/api/services` | 2 812 | **%27** — %0: attributeMapping 158, brand 30, category 88, choice 71, claim 105, configuration 23, financial 62, hashtag 58, image 134, invoice 136, menu 30, message 77, notification 36, register 5, setting 28, shipment 79, smart 29, ticket 53, variant 248; product %13 (207), integration %23 (413), customer %37 (62), admin %78 (242), user %87, billing %88, security %99, tenant-data %99, order %99 |
| `src/integration/engine` | 1 659 | %74 — repository'ler: Claim/Customer/Financial/Invoice/Message %0, `OrderRepository` %11; Sentinel %74, Validator %85, Publisher %88, Orchestrator'lar/Dispatcher/Sync/Stager %97-100 |
| `src/integration/modules` | 4 039 | %41 — ürün/kategori transformer & servisleri %3-35; `ResilientHttpClient` %94, `MockMode` %100, `IntegrationError` %100 |
| `src/operations` | tenant 312 (%98), stock 457 (%85), billing 70 (%97), integration 98 (%93), `client` 43 (%19: `StatsOperations` %3), `catalog` 31 (%0) | |
| `src/services` | billing %95, audit %94, metrics %89, redis %64, storage %39 (`S3Manager` %4), image %17, notification %50, mail/statistics %0 | |
| `src/database` | application %78, client %83, `tenantConnection` %100 | |
| `src/health`, `src/utils` | %92-100 (`LifecycleManager` %0) | |
| Toplam | 13 288 ifade / 11 812 satır | **%53,2 ifade / %54,2 satır / %35,2 dal / %42,8 fonksiyon** |

## Ek-B — Doğrulanamayanlar / ek inceleme gerekiyor

1. Canlı `DB_URL`'de `compressors=`/GSSAPI kullanımı (GN-07 için).
2. Railway/Render build/start komutları (`herokubuild` kullanımı — GN-05).
3. FE'nin hata **mesaj metnine** bağımlılığı (B-R6 maskeleme etkisi); `RegisterService` çağrısı (yalnız yapılandırma satırı görüldü).
4. `ImageApiManager` `getImage/downloadImage` yolunun canlıda çalışıp çalışmadığı ve `IMAGE_FILES_PATH` değeri (GV-05).
5. `ResilientHttpClient.test.ts` flaky olan tekil `it` (çıktı kaydedilmedi; yeniden üretilemedi).
6. `tests/integration/StockAllocator.concurrency.test.ts` bu denetimde çalıştırılmadı (gerçek local Mongo; kural).
7. `Integrations`/`IntegrationTypes`/`Menus` DB içerikleri (repoda yok) — hangi kategorilerin "canlı" göründüğü, ölü ekranların menüde bulunup bulunmadığı.
8. OPERATION_POLICY kanonik kayıt sayısı (156/158/159), FRONTEND_GAP ile bu ölçüm arasındaki fark.
9. Node 20 destek durumu (bilgi tabanına dayanıyor; ağdan doğrulanmadı).
10. `nodeCache`/`IntegrationFactory` önbellek tutarsızlığı ve web→worker sinyal gecikmesi statik okumadır; çok-pod ortamda **koşturulmadı**.
11. `iyzico`/gerçek ödeme, `Atlas PITR`/yedek yapılandırması (DATA_ARCHITECTURE_AUDIT §7 ile aynı sınır).

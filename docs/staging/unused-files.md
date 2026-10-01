# Kullanılmayan Dosya / Bağımlılık Taraması (GÖREV 1.0b devam)

Tarih: 2026-09-26 · Branch: `faz1-kesif` · Yöntem: salt-okunur tarama. Hiçbir dosya silinmedi/değiştirilmedi; `git add/commit` yapılmadı; `package.json`/lock dosyalarına dokunulmadı.

## Özet

| Alan | YÜKSEK GÜVEN | DÜŞÜK GÜVEN |
|---|---|---|
| backend (`backend/`) dosya | 7 | 6 |
| frontend (`frontend/`) dosya | 83 | 3 |
| mockserver (`mockserver/`) dosya | 4 | 1 |
| **Toplam dosya adayı** | **94** | **10** |

Kullanılmayan bağımlılıklar (ayrı liste, aşağıda §4): backend 6 kesin + 5 düşük güven + 1 yapı-araç grubu; frontend 5 kesin + 1 düşük güven; mockserver/backend 2.
Repo şişkinliği notu: §5.

Testler hariç tutuldu (başka ajan ekliyor): `backend/jest.config.js`, `backend/tests/smoke.test.ts`. Not: `tests/smoke.test.ts` `src/utils/BarcodeGenerator.ts`'i import ediyor (aşağıda işaretli).

## 1. Yöntem ve araçlar

- Araç: `knip` (`npx --yes knip`, global kurulum yok). Geçici konfigler `docs/staging/` altında: `knip.backend.json`, `knip.frontend.json`, `knip.frontend2.json`. Ham çıktılar: `knip.backend.raw.json`, `knip.frontend.raw.json`, `knip.frontend2.files.txt`. Knip önbelleği yalnızca git-ignored `node_modules/.cache/knip` altına yazıldı.
- İkinci bağımsız yöntem: kendi import-graph betiğim (`docs/staging/import-graph.js`; yorum satırlarını çıkarır; `@/`, tsconfig alias'ları, göreli import, `import()`, `require()` izler) + her aday için metin/grep doğrulaması (ad, kebab-case etiket, string sabit). Çıktılar: `backend.graph.json`, `frontend.graph.json`.
- Backend knip: entry `entegrasyonik.ts`; tsconfig alias'ları (`@database/*` vb.) ve `baseUrl` (`src/...` bare import) knip tarafından çözüldü; unresolved sonucu 0.
- Frontend knip ilk koşuda (`knip.frontend.json`) sadece 12 kullanılmayan dosya raporladı. Neden: knip'in Vite/Vue eklentisi `src/**/*.vue` glob'unu otomatik entry yapıyor (`--debug` çıktısında "entry:src/**/*.vue (vite.config.mts)"), yani hiçbir .vue dosyası "kullanılmıyor" çıkamıyor. `knip.frontend2.json` (`"vite": false`, entry elle) ile tekrarlandı: sonuç 76 src/models/utils dosyası, benim import-graph çıktımla **birebir aynı** (fark: sadece `src/vite-env.d.ts`, ambient tip dosyası, aday değil). İlk koşudaki 12 dosya bunun alt kümesi.
- Mockserver için knip koşulmadı (istenildiği gibi basit import-graph + grep).

### Dinamik yükleme riski incelemesi (sonuç)

- `backend/src/integration/modules/IntegrationFactory.ts`: dinamik değil; 6 modülü (Trendyol, Pazarama, N11, Hepsiburada, Ideasoft, Bizimhesap) dosya başında **statik import** eder, `switch(code)` ile `new` yapar. Bu desen nedeniyle modül dizinleri (`modules/marketplace|ecommerce|erp/*`) graph'ta erişilebilir; hiçbiri aday çıkmadı.
- Backend'de `require(`: yalnızca `crypto` ve `os` (Importer.ts:284, ImportOrchestrator.ts:14). `import(`, `readdirSync`, `eval`, `glob`, `import.meta`: yok.
- Backend servis dispatch'i (`runOperation`) servisleri `src/api/index.ts` içindeki nesne anahtarına göre **string adıyla** çağırıyor; frontend `restApi.post("ECommerceService/...")` string adıyla çağırıyor. Bu yüzden `ecommerce-service.ts` DÜŞÜK GÜVEN'e alındı.
- JSON dosyaları (`*.config.json`, `commissions.json`, `shipment-providers.json`) `resolveJsonModule` ile statik import ediliyor; kullanımdalar. `modules/marketplace/n11/config.json` hiçbir yerden import edilmiyor (n11 `services/Service.ts` içinde sabitler inline).
- Frontend: Vue Router lazy import'ları (`() => import('@/views/...')`) ve `stores/site/menu.ts` içindeki `views` haritası (`defineAsyncComponent(() => import('...'))`) **değişmez string literal** ile yazılmış, graph tarafından izlendi. `<component :is>` ve `platformInfoComponentsMap` / `componentMap` (EInvoiceView) literal haritalar. `i18n.ts` içinde `` `./locales/${locale}.json` `` dinamik JSON import'u var (yalnızca `en.json`/`tr.json`; ikisi de kullanımda, aday değil). Menü yapısı backend `MenuService` üzerinden DB (`ApplicationDB.Menus`, `_id: "entegrator"`) listesinden geliyor; kod okumasına göre haritada olmayan bir görünüm DB anahtarıyla yüklenemez (çıkarım). DB içeriği bu görevde okunmadı: DB'deki anahtarların tamamı **doğrulanamadı**.
- `public/`: `service-worker.js` `index.html` içinde string olarak kayıt ediliyor, `manifest.json`, `offline.html` kullanımda. Görsellerin çoğu yol dinamik birleştirilerek yükleniyor (`'/assets/images/integrations/marketplace/' + logo`, `'/assets/images/' + locale + '.svg'`, `'/assets/images/integrations/' + type.code + '/'`, DB'den gelen `site.logo`) — bu yüzden `public/assets/images/**` altındaki görsellerin hiçbiri aday listesine alınmadı (kullanılmayan görsel tespiti bu görevde güvenilir değil). Yalnızca kod olan yanlış yerdeki dosyalar listelendi.
- Rollup/webpack girdileri: `backend/rollup.config.js` (input `dist/entegrasyonik.js`) ve `backend/webpack.config.js` (entry `./entegrasyonik.ts`) hiçbir npm script'inde çağrılmıyor (bkz. DÜŞÜK GÜVEN). Frontend Vite `input: index.html` tek girdi (`inlineDynamicImports: true`). Electron: `main.js` (`package.json` main) + `forge.config.js`.

## 2. YÜKSEK GÜVEN adaylar (araç + grep hemfikir, dinamik yükleme riski yok)

### 2.1 backend (7)

TS (knip "Unused files" + import-graph + grep, üçü hemfikir):
- `backend/src/utils/Functions.ts` — 10 satır, `Functions.generateUniqueId`; hiçbir yerde import edilmiyor.
- `backend/src/utils/LifecycleManager.ts` — sınıfın adı yalnızca kendi dosyasında geçiyor. (Not: içinde sipariş/iade aksiyon kuralları var; frontend'de `composables/useLifecycle.ts` paralel bir kopya olabilir - iş kuralı olarak taşınıp taşınmayacağı insan kararı.)
- `backend/src/utils/migratetoR2.ts` — dosyanın tamamı `/* ... */` içinde yorum (77 satır, aktif kod yok).
- `backend/src/utils/BarcodeGenerator.ts` — hiçbir üretim kodundan import yok. DİKKAT: yeni `tests/smoke.test.ts` (hariç tutulan test) bunu import ediyor; silinirse o test kırılır.

Non-TS (knip kapsamı dışı; yalnızca grep + git doğrulaması):
- `backend/src/integration/engine/IntegrationOrchestratorBACK` — 14 KB, uzantısız yedek; `./worker.config.json` import ediyor ama bu dosya yok; hiçbir yerden referans yok.
- `backend/config_output.json` — 31 KB, UTF-16 `tsc --showConfig` çıktısı; kaynak/script/Dockerfile'dan referans yok.
- `backend/src/integration/modules/marketplace/n11/config.json` — hiçbir `.ts` import etmiyor (n11 WSDL adları `services/Service.ts` içinde inline).

### 2.2 frontend (83)

Not: liste, knip (`vite:false` koşusu) ve import-graph'ın ortak sonucudur. "yalnız ölü dosyalardan referanslı" = başka bir ölü dosya bunu import ediyor, yani ölü küme. `frontend/models/SubjectArea.js`, `frontend/utils/dateFormatter.js`, `frontend/utils/printDiv.js` **0 bayt** boş dosyalardır. `frontend/public/assets/images/integrations/marketplace/New folder (2)/` altında ayrıca `order.config.json` ve `README.md` de var (backend order motoru kopyası; kod olmadığı için araç taramasında yok, aynı gerekçeyle aday).

- `frontend/models/SubjectArea.js`
- `frontend/public/assets/images/integrations/marketplace/New folder (2)/OrderErrorHandler.ts` — yalnız ölü dosyalardan referanslı (1); public/ altında, yanlış yere konmuş backend order motoru kopyası; hiçbir yerden referans yok
- `frontend/public/assets/images/integrations/marketplace/New folder (2)/OrderFetcher.ts` — yalnız ölü dosyalardan referanslı (1); public/ altında, yanlış yere konmuş backend order motoru kopyası; hiçbir yerden referans yok
- `frontend/public/assets/images/integrations/marketplace/New folder (2)/OrderOrchestrator.ts` — yalnız ölü dosyalardan referanslı (1); public/ altında, yanlış yere konmuş backend order motoru kopyası; hiçbir yerden referans yok
- `frontend/public/assets/images/integrations/marketplace/New folder (2)/OrderQueueProducer.ts` — yalnız ölü dosyalardan referanslı (1); public/ altında, yanlış yere konmuş backend order motoru kopyası; hiçbir yerden referans yok
- `frontend/public/assets/images/integrations/marketplace/New folder (2)/OrderRepository.ts` — yalnız ölü dosyalardan referanslı (2); public/ altında, yanlış yere konmuş backend order motoru kopyası; hiçbir yerden referans yok
- `frontend/public/assets/images/integrations/marketplace/New folder (2)/OrderTransformer.ts` — yalnız ölü dosyalardan referanslı (2); public/ altında, yanlış yere konmuş backend order motoru kopyası; hiçbir yerden referans yok
- `frontend/public/assets/images/integrations/marketplace/New folder (2)/OrderWorker.ts` — yalnız ölü dosyalardan referanslı (2); public/ altında, yanlış yere konmuş backend order motoru kopyası; hiçbir yerden referans yok
- `frontend/public/assets/images/integrations/marketplace/New folder (2)/worker-runner.ts` — yalnız ölü dosyalardan referanslı (1); public/ altında, yanlış yere konmuş backend order motoru kopyası; hiçbir yerden referans yok
- `frontend/src/components/adminPanel/AdminSampleComponent.vue`
- `frontend/src/components/CategoryChoicesIntegrationSelectBoxComponent.vue`
- `frontend/src/components/CategoryChoiceValuesIntegrationSelectBoxComponent.vue`
- `frontend/src/components/CategorySelectComponent.vue`
- `frontend/src/components/ChoiceSelectBoxComponent.vue` — yalnız ölü dosyalardan referanslı (1)
- `frontend/src/components/ChoiceSyncComponent.vue`
- `frontend/src/components/integrations/ECommerce.vue`
- `frontend/src/components/integrations/EInvoiceComponent.vue`
- `frontend/src/components/integrations/erp/DiaComponent.vue`
- `frontend/src/components/integrations/erp/EtaComponent.vue`
- `frontend/src/components/integrations/erp/LogoComponent.vue`
- `frontend/src/components/integrations/erp/ParasutComponent.vue`
- `frontend/src/components/integrations/erp/SysmondComponent.vue`
- `frontend/src/components/integrations/ErpComponent.vue`
- `frontend/src/components/integrations/marketplace/AkakceComponent.vue`
- `frontend/src/components/integrations/marketplace/CicekSepetiComponent.vue`
- `frontend/src/components/integrations/marketplace/PlatformProcessComponent.vue`
- `frontend/src/components/integrations/marketplace/PttAVMComponent.vue`
- `frontend/src/components/integrations/ShippingComponent.vue`
- `frontend/src/components/invoices/NewInvoiceComponent.vue` — yalnız ölü dosyalardan referanslı (1)
- `frontend/src/components/LanguageComponent.vue` — yalnız ölü dosyalardan referanslı (1)
- `frontend/src/components/layout/ApplicationBarBack.vue` — yedek/kopya adlı
- `frontend/src/components/layout/Footer.vue`
- `frontend/src/components/layout/NavigationMenuGroup.vue`
- `frontend/src/components/layout/ToolBar.vue`
- `frontend/src/components/login/ForgottenPasswordComponent.vue`
- `frontend/src/components/login/LoginFormComponent.vue`
- `frontend/src/components/login/RegisterComponent.vue`
- `frontend/src/components/messages/UpdateMessageComponent.vue`
- `frontend/src/components/PageButtons.vue`
- `frontend/src/components/PrintReadyDiv.vue`
- `frontend/src/components/productDefinitions/crud/BrandNameComponent.vue`
- `frontend/src/components/productDefinitions/crud/ProductAttributesComponent.vue`
- `frontend/src/components/productDefinitions/crud/ProductImageAssignComponent.vue` — yalnız ölü dosyalardan referanslı (2)
- `frontend/src/components/productDefinitions/ProductListAdvancedSearchComponent.vue`
- `frontend/src/components/productDefinitions/products/ProductBatchPlatformProcessComponent.vue`
- `frontend/src/components/productDefinitions/products/ProductReportComponent.vue` — yalnız ölü dosyalardan referanslı (1)
- `frontend/src/components/productDefinitions/products/ProductRobotComponent.vue` — yalnız ölü dosyalardan referanslı (1)
- `frontend/src/components/productDefinitions/products/ProductsComponent.vue`
- `frontend/src/components/productDefinitions/products/ProductsContentComponent.vue` — yalnız ölü dosyalardan referanslı (1)
- `frontend/src/components/productDefinitions/properties/crud/OptionInfoComponent.vue` — yalnız ölü dosyalardan referanslı (1)
- `frontend/src/components/productDefinitions/properties/crud/TagInfoComponent.vue` — yalnız ölü dosyalardan referanslı (1)
- `frontend/src/components/productDefinitions/properties/ProductOptionsComponent.vue`
- `frontend/src/components/productDefinitions/properties/ProductTagsComponent.vue`
- `frontend/src/components/productDefinitions/variants/ProductAddVariantComponent.vue` — yalnız ölü dosyalardan referanslı (1)
- `frontend/src/components/productDefinitions/variants/ProductEditVariantComponent.vue`
- `frontend/src/components/productDefinitions/variants/ProductVariantImageComponentBACK.vue` — yedek/kopya adlı
- `frontend/src/components/productDefinitions/variants/ProductVariantsContentComponent.vue` — yalnız ölü dosyalardan referanslı (1)
- `frontend/src/components/SearchSectionButtonComponent.vue`
- `frontend/src/components/settings/CompanyInfoComponent.vue`
- `frontend/src/components/settings/NotificationInfoComponent.vue`
- `frontend/src/components/supports/TicketAddComponent.vue`
- `frontend/src/components/supports/TicketMessagesComponent.vue`
- `frontend/src/components/user/RoleComponent.vue`
- `frontend/src/components/utility/StepComponent.vue`
- `frontend/src/composables/categoryFunctions.ts`
- `frontend/src/composables/configuration.ts` — yalnız ölü dosyalardan referanslı (1)
- `frontend/src/composables/loading.ts`
- `frontend/src/composables/site/intTheme.ts`
- `frontend/src/composables/tabhooks.ts`
- `frontend/src/stores/configurationStore.ts`
- `frontend/src/stores/erp.ts` — yalnız ölü dosyalardan referanslı (1)
- `frontend/src/stores/navigation.ts` — yalnız ölü dosyalardan referanslı (2)
- `frontend/src/stores/shipping.ts` — yalnız ölü dosyalardan referanslı (1)
- `frontend/src/stores/site/workplace.ts`
- `frontend/src/views/secure/InvoiceListViewGECICIBACK.vue` — yedek/kopya adlı
- `frontend/src/views/secure/productDefinitions/ProductListViewVertical.vue`
- `frontend/src/views/secure/productDefinitions/properties/NewOptionView.vue`
- `frontend/src/views/secure/productDefinitions/properties/NewTagView.vue`
- `frontend/src/views/unsecure/LicenceView.vue`
- `frontend/src/views/unsecure/PrivacyView.vue`
- `frontend/utils/dateFormatter.js`
- `frontend/utils/printDiv.js`
- `frontend/src/components/productDefinitions/variants/ProductVariantsComponentVertical.vueBACK` — uzantısı `.vueBACK`, hiçbir araç/derleyici tanımaz; referans yok (yalnız grep).

### 2.3 mockserver (4)

- `mockserver/backend/src/platforms/hepsiburada/models/UploadJob.js` — hiçbir yerde require edilmiyor; `hepsiburada/server.js:37` "UploadJob is deprecated, using Batch" diyor.
- `mockserver/frontend/src/platforms/n11/main.js`, `.../pazarama/main.js`, `.../trendyol/main.js` — ana giriş `frontend/index.html` -> `/src/main.js`; bu üç dosya `./App.vue` import ediyor ama ilgili klasörlerde `App.vue` yok (bayat kopya), hiçbir yerden referans yok.

## 3. DÜŞÜK GÜVEN adaylar (incelenmeli)

### 3.1 backend (6)

- `backend/src/api/services/ecommerce-service.ts` — knip + graph "kullanılmıyor" diyor; `src/api/index.ts:21,49` içinde import ve kayıt **yorum satırı**. AMA frontend hâlâ `ECommerceService/retrieveProductsFromIntegration` (IdeasoftComponent.vue:214) ve `stores/integrationStore.ts:47` içinde `'ECommerceService'` adını çağırıyor. String tabanlı servis dispatch'i nedeniyle silme davranışı bozabilir; mimari karar (ideasoft yolu nereden gidecek).
- `backend/src/api/services/marketplace-service.ts1` — 26 KB, `.ts1` uzantısı (derleyici görmez); `api/index.ts:4,33` içinde kayıt yorumda. Devre dışı bırakılmış eski servis; yeniden etkinleştirilme niyeti doğrulanamadı.
- `backend/src/operations/catalog/CatalogOperations.ts` — kullanan yok (knip + graph); ama CLAUDE.md `@operations` altında bunu mimari bileşen olarak adlandırıyor ve `StatsOperations.ts:55` yorumda anıyor. `@Cache` dekoratörlü canlı görünümlü kod.
- `backend/src/services/mail/MailService.ts` — `mailService` singleton'ı export ediyor ama import eden yok. Canlı görünümlü kod; şifre sıfırlama/bildirim için planlanmış olabilir. Bağlı bağımlılık: `nodemailer`, `@types/nodemailer` (§4).
- `backend/src/database/client/models/Settlement.ts` — `SettlementSchema` hiçbir yerde kayıtlı değil (`ClientDB`/`ClientMongooseSchemas` içinde yok, `getSettlementModel` yok); ancak marketplace bağlayıcıları ve `interfaces/settlement` finans/mutabakat özelliğini işaret ediyor (yarım kalmış özellik olabilir).
- `backend/rollup.config.js`, `backend/webpack.config.js` — knip bunları config girdisi sayar (tarama dışı); ama hiçbir npm script'i çağırmıyor (`start`/`build` yalnız `tsc`; `herokubuild` `ncc` kullanıyor ve `@vercel/ncc` kurulu değil). `Dockerfile` `CMD ["node","application.js"]` da mevcut çıktıyla (`dist/entegrasyonik.js`) uyumsuz. Silme ya da düzeltme kararı dağıtım modeline bağlı, doğrulanamadı. (İki dosya tek madde sayıldı.)

### 3.2 frontend (3)

- `frontend/src/components/IntegrationProductSelectBoxComponent.vue` — ProductListView.vue:522 içinde HTML yorumuna alınmış kullanım (geçici devre dışı olabilir)
- `frontend/src/views/secure/definitions/TicketDefinitionView.vue` — menu.ts (DB-güdümlü view haritası) içinde import satırı yorumlanmış; menü anahtarı DB Menus.list içinde olabilir - doğrulanamadı; ayrıca bozuk import (NewTicketComponent.vue yok)- `frontend/public/authPopup.html` — `frontend/src/`, backend ve `frontend/public/` içinde referans yok; ancak OAuth popup/harici yönlendirme (ör. Ideasoft yetkilendirme) ile sunucu/URL tarafından açılıyor olabilir - doğrulanamadı.


### 3.3 mockserver (1)

- `mockserver/backend/src/platforms/trendyol/scratch/seedScenarios.js` — hiçbir yerden require edilmiyor ama elle çalıştırılan tohum betiği; `../../../config.json` require ediyor ve bu dosya yok (bozuk).

## 4. Kullanılmayan (ve eksik) bağımlılıklar

### 4.1 backend/package.json

Yüksek güven (knip + grep: kaynakta hiç import yok):
- dependencies: `kafkajs`, `node-loader`, `nodemailer` (yalnız MailService içinde, o da kullanılmıyor), `request`, `soap` (n11'de yalnızca metin içinde SOAP zarfı var, paket import edilmiyor)
- devDependencies: `@types/nodemailer`
- Kurulu olmayan ikili: `ncc` (`herokubuild` script'i kullanıyor; `@vercel/ncc` hiçbir yerde tanımlı değil)

Düşük güven:
- `@mongodb-js/zstd`, `snappy`, `kerberos`, `mongodb-client-encryption`, `gcp-metadata` — kodda import/`compressors`/`autoEncryption` kullanımı yok; ancak bunlar `mongodb` sürücüsünün isteğe bağlı eş-bağımlılıkları (çalışma zamanı sıkıştırma/kimlik doğrulama için sürücü tarafından dinamik yüklenir; `rollup.config.js` external listesinde de geçiyor). Knip bunları bilerek raporlamıyor. Kaldırma etkisi doğrulanamadı.
- `webpack`, `webpack-cli`, `ts-loader`, `webpack-node-externals`, `rollup`, `@rollup/plugin-*` — yalnız yukarıdaki, hiçbir script'te çağrılmayan config dosyaları tarafından kullanılıyor.

Eksik (import ediliyor ama `package.json`'da yok; geçişli bağımlılık olarak kurulu, kırılgan):
- `lru-cache` (ClientDB.ts:1; kurulu 10.4.3), `ioredis` (RedisService.ts:1; 5.10.1, bullmq geçişli), `p-limit` (trendyol/pazarama/n11/hepsiburada `services/Service.ts`; kurulu 2.3.0 geçişli). `hepsiburada/services/Service.ts` için knip ayrıca "duplicates" uyarısı verdi (ek inceleme gerekiyor).

Kullanılmayan export/tip (knip; dosya değil, bilgi amaçlı, silme adayı değil): `src/database/client/models/Order.ts` şema export'ları (AddressSchema, FinancialsSchema, OrderItemSchema, OrderInvoiceSummarySchema, FulfillmentSchema), `User.ts:UserModel`, `GlobalRole.ts:GlobalRoleModel`, `ClientIntegration.ts:ClientIntegrationInfoSchema`, `Message.ts` (default + duplicate export), `S3Manager.ts` tipleri, `interfaces/*` altında ~35 tip (`interfaces/settings`, `platforms/marketplace`, `settlement`, `common` vb.), `interfaces/platforms/{erp,ecommerce}/index.ts` içinde `a`/`b` isimli export'lar. Ham liste: `knip.backend.raw.json`.

### 4.2 frontend/package.json

Yüksek güven (knip + grep: kaynakta hiç referans yok):
- dependencies: `@vueup/vue-quill`, `electron-squirrel-startup` (`main.js` içinde `require` yok), `roboto-fontface`, `vue-upload-component`
- devDependencies: `sass-loader` (Vite kullanıyor, webpack yok)

Düşük güven:
- `@types/echarts` — knip kullanılmıyor diyor; `echarts@^6` kendi tiplerini getirir (`@types/echarts@4` bayat), fakat tip çözümlemesine etkisi doğrulanamadı (`vue-tsc` çalıştırılmadı).

Yanlış pozitif (kullanımda, aday DEĞİL): `@electron-forge/maker-deb|rpm|squirrel|zip` ve `plugin-auto-unpack-natives` — `forge.config.js` içinde string ad olarak geçiyor, knip bunları "unused" diye yanlış raporladı.

### 4.3 mockserver

- `mockserver/backend/package.json`: `mammoth`, `xml2js` — kaynakta import yok (grep). Diğerleri kullanımda.
- `mockserver/frontend/package.json`: kullanılmayan bağımlılık bulunmadı (grep ile).

## 5. Repo şişkinliği notu (silme önerisi DEĞİL, yalnızca durum)

`gitlab/` dizini (83 MB takipli çalışma ağacı; `git ls-files gitlab` = 1783 dosya):
- `gitlab/entegrasyonikapp/` (881 takipli dosya, 53 MB): önceden derlenmiş dağıtım paketi. `backend.js` **34 MB** (webpack/ncc bundle; `__nccwpck_require__` içeriyor), `client/main.js` 2.8 MB (Vite bundle), `client/assets/*` (materialdesignicons yazı tipleri ~1.3 MB x2, `logo3.png` 1.9 MB, `logo4.png` 1.5 MB) — `logo3/logo4` `frontend/public/assets/images/` ile aynı boyutlu kopyalar. `index.js` (express + `http-proxy-middleware`, hedef Railway servis URL'i).
- `gitlab/www/` (902 takipli dosya, 30 MB): statik tanıtım sitesi (`client/`, `client/test/`, `client/alternative/`); tek tek >1 MB görseller: `test/assets/img/res12.jpg` 1.9 MB, `assets/img/bg-callout.jpg` 1.8 MB, `bg-masthead.jpg` 1.7 MB, `test/assets/img/res3.jpg` 1.4 MB.
- **`gitlab/*/node_modules` git tarafından takip ediliyor**: 1417 dosya, ~7.6 MB (`.gitignore` içinde `node_modules/` var, buna rağmen dosyalar indekste; hangi commit'te girdikleri incelenmedi).
- Takipli >1 MB dosyalar (tam liste): gitlab/entegrasyonikapp/backend.js (34.3 MB), `backend/src/integration/modules/marketplace/trendyol/commissions.json` (2.9 MB, **kullanımda**), gitlab/entegrasyonikapp/client/main.js (2.8 MB), gitlab `res12.jpg` 1.9 MB, `logo3.png` (gitlab + frontend/public, 1.9 MB), `bg-callout.jpg` 1.8 MB, `bg-masthead.jpg` 1.7 MB, `mockserver/frontend/src/platforms/n11/n11APISoapREFERANSDOKUMANTASYONU_v7_29.docx` 1.5 MB, `logo4.png` (gitlab + frontend/public, 1.5 MB), gitlab `res3.jpg` 1.4 MB, `mockserver/backend/src/platforms/n11/n11APISoapREFERANSDOKUMANTASYONU_v9_0.docx` 1.4 MB, gitlab `materialdesignicons-webfont` `.eot`/`.ttf` (1.3 MB x2). Ayrıca 1 MB altı ama büyük referans dokümanları: `mockserver/backend/src/platforms/herpsiburada/hepsiburadaDoc.md` (878 KB; klasör adı yazım hatalı "herpsiburada"), n11 `.odt`/`.docx`/Postman koleksiyonları.
- **`.git` boyutu: 460 MB** (`size-pack` 437 MB, 27 commit). Geçmişteki en büyük blob'lar mevcut ağaçta yok: `gitlab/package-lock.zip` **274 MB**, `gitlab/backendOLD2.js` 33 MB, `gitlab/backendOLD.js` 33 MB, `gitlab/package-lock/client/test/**` altında 10.5 MB `res2.png`, 10.4 MB `wooden_gate_diff_4k.jpg`, 6 MB `.hdr`, ~4-5 MB medya dosyaları. Yani şişkinliğin asıl kaynağı çalışma ağacı değil git geçmişi.
- Yerel, git-ignored: `backend/dist/` (eski derleme çıktısı: `.js`, `.d.ts`, `.map`, `tsbuildinfo`), `backend/scratch/` (boş), her paketin `node_modules/`. Repo boyutuna etkisi yok (ignore'lu); yalnız disk.
- `frontend/public/` 7.3 MB (logo3.png 1.9 MB, logo4.png 1.5 MB, `icons/screenshot.png` 0.8 MB, tekrarlı `logo2.png` iki kopya). `frontend/public/assets/images/**` altında hiçbir yerden metin referansı bulunmayan çok sayıda görsel var (ör. `beyaz*.png`, `pazarama.avif`, `hepsiburada.ico`), fakat yollar dinamik birleştirildiği için güvenilir "kullanılmıyor" hükmü verilmedi.

## 6. Yan bulgular (bu görev kapsamı dışı, kayıt için)

- Frontend'de **bozuk import'lar** (knip + graph): `platformInfos/{Hepsiburada,Trendyol,N11,Pazarama,Ideasoft,Variant}InfoComponent.vue` içinde `./ProductVariantAttributesComponent.vue` ve `./ProductVariantPlatformPricesComponent.vue` — dosyalar `variants/` altında, `platformInfos/` altında yok. Bu dosyalar `ProductVariantAttributesComponent.vue`/`ProductBatchVariantAttributesComponent.vue` içinde `defineAsyncComponent(() => import('./platformInfos/...'))` ile erişilebilir olduğundan `vite build` (inlineDynamicImports) bu yüzden başarısız olabilir; build çalıştırılmadığı için **doğrulanamadı**. Ayrıca `ChoicesSyncComponent.vue` -> `@/components/CategorySelectBoxComponent.vue` (gerçek yol `components/common/`), `stores/site/menu.ts`'de `productDefinitions/TEST.vue` import'u.
- `mockserver/backend/server.js` içinde MongoDB bağlantı dizesi (kullanıcı/parola dahil) koda gömülü (satır ~19; değer bu rapora yazılmadı). Bağlanılan DB adı (`unified_mock_marketplaces`) CLAUDE.md izinli 7-isim listesinde yok; mock sunucu bu görevde çalıştırılmadı, DB'ye dokunulmadı.
- Backend'de dört dosya `src/...` (baseUrl) bare import kullanıyor (`Common.ts`, `Customer.ts`, `Dispatcher.ts`, `product-service.ts`); `tsc-alias` `baseUrl`'i çevirir, dist çıktısında çözümlendiği doğrulanmadı.

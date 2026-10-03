# Canlı salt-okuma kipi (LIVE_READONLY)

Yerel backend, aktif tenant'ın (`entegrasyonikClient_1`, clientId=1) `ClientIntegrations` içindeki GERÇEK pazaryeri/e-ticaret/ERP bağlantı bilgileriyle
YALNIZ OKUMA yapar (ürün, kategori, marka, gerekirse sipariş/soru listeleme). Entegrasyonlara HİÇBİR yazma gitmez. İki bağımsız katman vardır; biri
delinse diğeri tutar. Bu kip üretim/staging için DEĞİLDİR; yalnız insanın yerelde, bilinçli çalıştırdığı bir araçtır (ADR yok; orantılı yerel güvenlik kapısı).

## Önkoşullar

1. Yerel MongoDB açık (`backend/.env` -> `DB_URL` **127.0.0.1/localhost** olmalı; Atlas değeri varsa süreç BAŞLAMAZ).
2. Taze yerel yedek: `node scripts/backup-local.cjs` (içe alma yerel DB'ye yazar: `requestFetchFromPlatform` ilgili entegrasyonun geçici staging kayıtlarını siler/yeniler, ürünler yazılır). Bitince istersen yedekten dön.
3. Redis açık (`docker compose up redis`; süreç Redis olmadan da kalkar ama bildirim/kilit özellikleri eksik çalışır).
4. `backend/.env` çalışma dizininde mevcut (git-ignored; worktree'de yoksa ana `backend/.env`'den kopyala). Değerlere bu iş dokunmaz.
5. Tenant'ın entegrasyon bilgileri (API key/secret) DB'de `enc:v1:` şifreli; `FIELD_ENCRYPTION_KEYS` .env'de olmalı.

## Başlatma

```bash
cd backend
npm run start:live-readonly      # build + node -r ./dev-tools/egress-guard.js -r ./dev-tools/live-readonly-guard.js dist/entegrasyonik.js
```

Bu komut kendiliğinden: `LIVE_READONLY=true` kurar (config `t.bool` yalnız `true` dizesini açık sayar; `1` Katman B'yi AÇMAZ) (`.env`'deki değerden bağımsız), `*_MOCK_MODE` değerlerini **zorla kapatır** (env görmezden gelinir, uyarı
basılır; elle düzenleme gerekmez), `DB_URL` yerel değilse çıkar, ağ guard'ını kurar. Açılışta `LIVE_READONLY_ACTIVE` günlüğü şunları yazar: izinli hostlar,
çalışan/kapalı işçiler ve zamanlayıcılar, token yenileme durumu (sır yok). `npm start` / `npm run start:local` ile `LIVE_READONLY=1` verilirse süreç ağ guard'ı
yüklü olmadığı için BAŞLAMAZ (ikinci kilit).

Env (değer yok, `.env.example`'da): `LIVE_READONLY` (start betiği kurar), `LIVE_READONLY_ALLOW_TOKEN_REFRESH` (varsayılan boş).

## Katman A — ağ (dev-tools/live-readonly-guard.js + egress-guard.js)

Karar mantığı tek yerde: `backend/src/integration/modules/common/security/liveReadonlyPolicy.ts` (derlenmiş kopyası yüklenir; yüklenemezse fail-closed, süreç başlamaz).
Kapsam: `http.request/get`, `https.request/get`, `globalThis.fetch` (undici) + TCP (`net.Socket.connect`, DNS'ten önce). Mongo/Redis (loopback) etkilenmez.

- **Host**: yalnız loopback ve K7 tek listesi `ALLOWED_OUTBOUND_HOSTS` (Trendyol `api/apigw/stageapigw.trendyol.com`; Hepsiburada `mpop/listing-external/accounting-external/ticket-api/oms-external.hepsiburada.com` (oms-external: sipariş/paket/iade, 2026-10-03 canlı doğrulandı);
  N11 `api.n11.com`; Pazarama `isortagim/isortagimapi/isortagimgiris.pazarama.com`; Ideasoft `*.ideasoft.com.tr`, `*.myideasoft.com`; Bizimhesap `api.bizimhesap.com`, `bizimhesap.com`). https zorunlu, port 443.
  R2/S3, SMTP, görsel CDN'leri vb. **bloklu** (sunucu görsel indirmez; görsel URL'leri referans olarak saklanır).
- **Yöntem**: GET/HEAD serbest. Diğerleri yalnız açık okuma-allowlist'iyle:
  - token: Pazarama `POST .../connect/token` (client_credentials). Ideasoft `POST .../oauth/...token|authorize` YALNIZ `LIVE_READONLY_ALLOW_TOKEN_REFRESH=ideasoft` iken.
  - N11 SOAP (`POST /ws/*`): gövdedeki TÜM operasyonlar okuma listesinde olmalı: `GetTopLevelCategories`, `GetCategoryAttributesId`, `GetCategoryAttributeValue`, `GetProductList`,
    `GetProductQuestionList`, `OrderList`, `ClaimReturnList`, `GetSettlementList`, `GetShipmentCompanies` (hepsi `...Request`). Yazma (SaveProduct, UpdateProductPrice/StockBySellerCode, SaveProductAnswer,
    ClaimReturnApprove/Reject, SaveLinkSellerInvoice, MakeOrderItemShipment ...) bloklu. Gövde tamponlanır; bloklu ise hiç bayt yazılmaz. N11 REST POST'ları (ürün gönder/fiyat/stok/güncelle) bloklu.
  - Pazarama filtreli listeleme POST'ları: `order/getOrdersForApi`, `order/getRefund`, `order/paymentAgreement`, `finance/getsettlements|getotherfinancials|getcargoinvoicedetails`,
    `QuestionAnswer/getApprovalAnswersByMerchant(Search)`, `product/getProductDetail`.
  - Trendyol/Hepsiburada/Ideasoft/Bizimhesap: okuma POST'u yok; her POST/PUT/PATCH/DELETE bloklu.
- Reddedilen istek süreç içinde `LIVE_READONLY_BLOCKED` kodlu hata alır; günlüğe yalnız host/yöntem/maskelenmiş yol/operasyon/neden yazılır (başlık, gövde, sorgu, uzun sayısal kimlik yok).
- Sınır: N11 SOAP gövde denetimi için TLS bağlantısı kurulabilir, fakat HTTP isteği/bayt gönderilmez (ayrıca Katman B SOAP'ı bağlantıdan önce reddeder).

## Katman B — uygulama

- **Başlatılmayanlar**: ExportOrchestrator (Dispatcher/Validator/Publisher/Sentinel/Sync), OrderOrchestrator (zamanlanmış sipariş çekimi + BullMQ işçisi), zamanlayıcılar:
  `stock.*` (yayın, tahsis, oversell, mutabakat), `billing.trialExpiry`, `catalog.exportSignalPoll`, `compliance.probeRunner`, `compliance.sourceMonitor`, `notifications.email-dispatch`.
  Çalışanlar: ImportOrchestrator (yalnız kullanıcı tetiklemeli içe alma), `observability.metrics-flush`, `config-head-poll` (yerel DB).
- **API**: yetenek kaydında `external && effect != read` olan her RPC (sipariş onay/iptal, talep onay/ret, mesaj cevabı, kargo, fatura, `batchCreator`, token değişimi) `423 LIVE_READONLY` döner;
  tek merkez `src/api/liveReadonlyRpcGuard.ts` (RunOperation). Tek istisna: `IntegrationService/requestFetchFromPlatform` (içe alma = okuma). Yerel DB'ye yazan RPC'ler (ürün düzenleme, eşleme,
  ayar kaydı) serbest; yayın işçileri kapalı olduğundan dışarı çıkmaz. Görsel yükleme R2'ye gider -> Katman A bloklar.
- **Token riski**: Ideasoft refresh_token döndürür; yenileme eski token'ı geçersiz kılabilir (üretim aynı bağlantıyı kullanıyor olabilir). Bu kipte Ideasoft yenileme/kod değişimi varsayılan KAPALI;
  access_token süresi dolmuşsa açık AUTH hatası (`LIVE_READONLY_TOKEN_REFRESH_DISABLED`). Diğer adaptörlerde dönen/rotasyonlu token yok: Trendyol/HB Basic, N11 appkey/appsecret,
  Bizimhesap key/token statik; Pazarama client_credentials (her çağrıda yeni, eskisini bozmaz).
- N11 `soapRequest` yazma operasyonunu bağlantı kurulmadan reddeder (`NOT_SUPPORTED`, `platformCode: LIVE_READONLY`).

## MCP notu (MCP-5)

`/mcp` ve bant dışı onay ucu aynı kuralı uygular: LIVE_READONLY açıkken dış-yazma araçları (ör. `orders_approve`) `tools/list`'te yoktur, zorla çağrı `LIVE_READONLY`, onay ucu 423 döner (onay kaydı tüketilmez, K46 kotası düşmez); okuma araçları çalışır. Kanıt: `tests/unit/mcp/mcp5.parity.test.ts` (matris) + `mcpApprovals.test.ts`.

## Kalan riskler / not

- Kip açıkken yerelde yapılan ürün düzenlemeleri dışarı çıkmaz ama `ExportSignals` birikebilir; sonra NORMAL kipte başlatırsan gerçek pazaryerine gidebilir -> canlı oturumdan sonra yerel yedeği geri yükle.
- Yetkili kullanıcının rolü `ROLE_OPERATOR` (member) ise `testConnection` (admin kademesi) 403 verir; okuma/içe alma member ile çalışır.

## Önyüz (`.claude/worktrees/ui-pkg/frontend`, dal faz3-arayuz, port 3020) bağlantısı

Önyüz geliştirme sunucusunda (`npm run dev`) mock API YOKTUR (yalnız Playwright e2e `/api/**` mock'lar) ve vite proxy yoktur; `VITE_API_BASE_URL` yoksa doğrudan
`http://127.0.0.1:5001/api/` çağrılır. Gerekenler: backend `CORS_ORIGINS` içinde `http://127.0.0.1:3020` var (var), `CORS_CREDENTIALS=true`.
**Tarayıcıyı `http://127.0.0.1:3020` ile aç (`localhost:3020` DEĞİL):** oturum çerezi dev'de `SameSite=Lax`; `localhost` -> `127.0.0.1:5001` farklı site sayıldığından çerez reddedilir.
**Giriş parola ile:** Google ile giriş (code akışı, sunucu `POST oauth2.googleapis.com/token`) bu kipte politikaca bloklu (yalnız GET serbest); istisna açmak insan kararıdır (BACKLOG LIVE-RO-GSI).

## Kullanıcı

`duyguemre@gmail.com`: `entegrasyonikDB.Users` içinde var (2026-10-03 yerel DB), `clientId=1` / `order=1`, `owner:true`, `isGlobalAdmin:false`, `roleCode=ROLE_OWNER` (admin kademesi; `testConnection` dahil
tüm okuma RPC'leri çalışır), parola + Google kimliği bağlı. Client 1 ("Mağaza Duygu"): `ACTIVE`, `dbConfig.dbname=entegrasyonikClient_1`; `ClientIntegrations` 7 entegrasyonun gerçek bilgilerini `enc:v1:` taşır
(legacy düz kayıtlarla birebir doğrulandı 2026-10-03). `Memberships` koleksiyonu var ama bu kullanıcı için kayıt yok; kullanıcı `Users.clientId` ile eşleşir. Parola bu belgede yok.

## 2026-10-03 ilk gerçek çalıştırma — bulgular

- Guard `LIVE_READONLY='1'` kuruyordu, config `'true'` bekliyor -> Katman B açılmadı (düzeltildi; ayrıntı BACKLOG "2026-10-03 canlı salt-okuma turu").
- Bağlantı testi: Trendyol OK, Hepsiburada OK (OMS tabanı düzeltmesi sonrası), N11 OK; Pazarama anahtar geçersiz, Ideasoft token süresi dolmuş (refresh kapalı), Bizimhesap 402.
- Bu kipte Siparişler/İadeler ekranları canlı veri çekmez (OrderOrchestrator kapalı); canlı okunanlar: entegrasyon ayar ekranlarındaki kategori/marka/özellik/komisyon, ürün içe alma, Sorular.

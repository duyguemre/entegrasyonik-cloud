# 0008 — Ödeme Sağlayıcısı (Öneri) ve Abonelik/Plan/Kota Modeli

## Durum
Kabul edildi (2026-09-26) — **mimari kısım** (ödeme sağlayıcısı soyutlaması, mock adaptör, veri modeli, durum makinesi, webhook ilkeleri). **Sağlayıcı seçimi bir öneridir; canlı üye işyeri hesabı, canlı anahtarlar, abonelik eklentisi ücreti, nihai fiyatlar, fatura entegratörü seçimi ve yasal metinler insan onayı bekliyor (Protokol 12).** Ödeme/vergi/e-fatura iş kurallarının nihai doğruluk sorumluluğu insandadır.

## Bağlam
- `SAAS_CORE_AUDIT.md` §4, §11: Backend ve frontend'de ödeme sağlayıcısı, plan, abonelik, deneme süresi, dunning ve kota **yok**. `StatisticsTracker` yalnızca operasyon sayıyor; her yeni tenant'a sabit 8 entegrasyon açılıyor (`security-service.ts:27-36`). `SubscriptionView.vue` (6662 satır) ürünle ilgisiz bir yer tutucu, gerçek billing ekranı değil.
- `PRODUCT_SURFACES.md` §1.3: Tanıtım sitesinde 3 paket var (Başlangıç ₺2.490/ay, Büyüme ₺5.990/ay, Kurumsal özel teklif; yıllık, KDV hariç) ama butonlar backend'siz iletişim formuna gidiyor.
- `docs/research/1f-findings.md` §4: öneri iyzico Abonelik (sandbox KYC'siz; resmi Node SDK `iyzipay` tipsiz ve bağımlılık uyarılı), alternatif PayTR (kart saklama + tekrarlayan ödeme; planlama bize kalır, resmi Node paketi yok). §5 KVKK, §7 e-fatura (BizimHesap/Nilvera).
- Kabul kriteri 1 ve Faz 3b/5 DoD: tanıtım sitesinden **sandbox** abonelik uçtan uca; Faz 5'te en az bir ödeme hatası/kurtarma senaryosu; admin panelinden abonelik yönetimi.
- Tenant modeli: merkezi `ApplicationDB` (`Clients`, `Users`) + tenant başına DB (`DATA_ARCHITECTURE_AUDIT.md`). Kimlik/RBAC yeniden tasarımı ADR-0001'de.

## Değerlendirilen Alternatifler

### Sağlayıcı
1. **iyzico Abonelik (öneri)** — Artı: sağlayıcı abonelik planlamasını, yenilemeyi, yeniden deneme ve hosted checkout formunu yönetir (kart verisi bize gelmez → PCI yükü minimum); sandbox KYC'siz; TR'de yaygın, TL tahsilat. Eksi: abonelik eklentisi için aylık ücret (1f: ilk 3 ay ücretsiz sonra ~199 TL/ay — **doğrulanmalı**); resmi SDK tipsiz → ince HTTP istemcisi yazılır.
2. **PayTR (kart saklama + tekrarlayan ödeme)** — Artı: `test_mode`, düşük entegrasyon ücreti. Eksi: yenileme zamanlaması, yeniden deneme, dunning bizim cron'umuza kalır → daha çok kod ve hata yüzeyi; resmi Node paketi yok.
3. **Yabancı Merchant-of-Record (Paddle/Lemon Squeezy)** — Artı: vergi/fatura MoR tarafından. Eksi: TL/yerel kart deneyimi, TR e-fatura/e-arşiv yükümlülüğüyle uyum belirsiz, yurt dışı veri aktarımı (KVKK). Uluslararası müşteri yokken gereksiz.
4. **Stripe** — TR'de yerleşik şirketlere hizmet vermiyor (**doğrulanmalı**); elendi.

### Kota uygulaması
1. **Anlık sayım (on-demand count) + plan limiti karşılaştırması** — Artı: sayaç tutarlılığı sorunu yok; tek haneli tenant'ta `countDocuments` ucuz. Eksi: büyük ölçekte maliyetli.
2. **Olay güdümlü sayaçlar** — Artı: hızlı. Eksi: artır/azalt kaçaklarında sapma, mutabakat işi gerekir. Bu ölçekte aşırı mühendislik.

### Deneme süresi
1. **Kartsız deneme (14 gün)** — Artı: düşük sürtünme, tek haneli ölçekte suistimal riski düşük (kayıt rate limit'i ADR-0001/C6). Eksi: deneme sonu dönüşüm için hatırlatma e-postası gerekir.
2. **Kartlı deneme** — Artı: otomatik dönüşüm. Eksi: sürtünme; iyzico abonelik başlangıç/deneme günleri desteği ürün planına bağlı (**doğrulanmalı**).

## Karar
Backend'de sağlayıcıdan bağımsız bir **`PaymentProvider` portu** tanımlanır; varsayılan adaptör **`MockPaymentProvider`**'dır (Faz 3b'yi bloke etmez), ikinci adaptör **iyzico Abonelik (sandbox)** — canlıya geçiş önerisi iyzico, alternatif PayTR; kart verisi hiçbir zaman bize gelmez (sağlayıcının hosted formu); plan/abonelik/fatura olayları **merkezi `ApplicationDB`**'de tutulur, kota **anlık sayımla** tek bir yetki (entitlement) katmanında uygulanır, abonelik durumu tenant erişimini tanımlı bir durum makinesiyle belirler.

### 1. Port ve adaptörler (`backend/src/services/billing/`)
Arayüz (öneri, isimler builder'a bırakılır):
- `createCheckout(tenantId, planCode, billingInterval) → { checkoutUrl | formToken, providerRef }`
- `getSubscription(providerSubscriptionRef) → NormalizedSubscription`
- `cancel(providerSubscriptionRef, atPeriodEnd)` · `changePlan(...)` (Faz 3b sonrası)
- `verifyAndParseWebhook(rawBody, headers) → NormalizedBillingEvent` (imza geçersizse hata)

Seçim `PAYMENT_PROVIDER=mock|iyzico` ve `PAYMENT_ENV=sandbox|live` env değişkenleriyle; **`live` değeri insan onayı olmadan hiçbir ortamda ayarlanmaz**.
- **MockPaymentProvider:** backend içinde basit bir "hosted checkout" sayfası + deterministik test kartları: başarılı, reddedildi, 3DS başarısız, ilk ödeme başarılı/yenileme başarısız (dunning), kurtarma (sonraki denemede başarı). Yenileme/başarısızlık olayı yalnızca `NODE_ENV!==production` iken açılan bir dev tetikleyicisiyle üretilir ve **gerçek webhook yoluyla aynı imza doğrulama kodundan** geçer (mock HMAC sırrı `.env`'de). Böylece Faz 5 "ödeme hatası/kurtarma" senaryosu sağlayıcıdan bağımsız test edilir.
- **IyzicoAdapter:** resmi SDK yerine ince, tipli HTTP istemcisi (1f: SDK tipsiz + bağımlılık uyarıları); sandbox anahtarları yalnızca `.env`'de. Sandbox hesabı açmak KYC gerektirmiyorsa (1f) orkestratör/insan açabilir; KYC isterse Protokol 12.

### 2. Veri modeli (ApplicationDB — tenant DB'de değil)
- **`Plans`**: `code` (unique), `name`, `version`, `interval` (`month|year`), `priceMinor` (kuruş, tamsayı), `currency: 'TRY'`, `vatIncluded: false`, `providerRefs` (ör. iyzico plan referansı), `limits` { `channels`, `skus`, `users`, `mcpCallsPerDay` }, `features[]` (ör. `einvoice`, `erp`, `shipping`, `mcp`, `desktopApp`), `active`, `public` (tanıtım sitesinde görünür mü).
- **`Subscriptions`**: `clientId` (unique, bir tenant = bir abonelik), `planCode`, `planVersion`, `status`, `trialEndsAt`, `currentPeriodStart/End`, `cancelAtPeriodEnd`, `graceUntil`, `provider`, `providerCustomerRef`, `providerSubscriptionRef`, `limitOverrides` (Kurumsal/özel teklif), `billingExempt` (mevcut/legacy tenant'lar), `termsVersion` + `termsAcceptedAt` (abonelik şartları + veri işleyen sözleşmesi onayı), `updatedAt`. Kart verisi yok; en fazla sağlayıcının döndürdüğü maskeli son 4 hane/marka.
- **`BillingEvents`**: `provider`, `providerEventId` (**unique indeks → idempotency**), `type`, `clientId`, `receivedAt`, `processedAt`, `status` (`processed|ignored|failed`), `payloadRedacted` (PII/kart alanları çıkarılmış). Fatura dışa aktarma kaynağı da budur.
- Durum değişiklikleri audit log'a (kaynak=`billing`, INTEGRATION_ENGINE_STANDARDS audit standardı) yazılır.

**Plan limitleri — yalnızca öneri (fiyat ve limitler insan kararıdır):**

| Plan | Fiyat (mevcut site) | Kanal (pazaryeri + e-ticaret) | SKU (varyant) | Kullanıcı | MCP çağrısı/gün | Özellikler |
|---|---|---|---|---|---|---|
| Başlangıç | ₺2.490/ay | 2 | 5.000 | 3 | 500 | ERP veya e-fatura: 1 |
| Büyüme | ₺5.990/ay | 5 | 25.000 | 10 | 2.000 | ERP + e-fatura + kargo |
| Kurumsal | özel teklif | `limitOverrides` | `limitOverrides` | `limitOverrides` | `limitOverrides` | hepsi |
| Legacy (mevcut canlı tenant'lar) | — | sınırsız | sınırsız | sınırsız | varsayılan Büyüme | hepsi, `billingExempt: true` |

Mevcut tenant'lar **bozulmaz**: geçiş migration'ı onlara `legacy` plan + `active` + `billingExempt` atar (DB'ye yazan her adım güncel yedek gerektirir — master prompt Madde 3); legacy'nin sonu insan kararıdır.

### 3. Durum makinesi ve tenant erişimine etkisi
| Durum | Nasıl girilir | Web/MCP okuma | Yazma (ürün/fiyat/stok düzenleme, MCP yazma araçları) | Entegrasyon motoru (sync/export/sipariş çekme) |
|---|---|---|---|---|
| `trialing` (14 gün, kartsız) | kayıt | tam | tam | tam (plan limiti = Başlangıç) |
| `active` | ilk başarılı ödeme | tam | tam | tam |
| `past_due` | yenileme ödemesi başarısız | tam + kalıcı uyarı bandı | tam | tam — **grace 7 gün**; sağlayıcı yeniden dener, kullanıcıya kart güncelleme bağlantısı |
| `suspended` | grace doldu / deneme bitti ödeme yok | tam (görüntüleme + dışa aktarma) | kapalı | **durdurulur** (bkz. risk notu) |
| `canceled` | kullanıcı iptali, dönem sonunda | dönem sonuna kadar tam; sonra 30 gün salt-okunur | dönem sonunda kapalı | dönem sonunda durdurulur |
| `expired` → silme | iptal/askı + 30 gün | — | — | — ; veri silme **KVKK imha politikasına göre ve insan onayıyla** (geri dönüşsüz silme, Protokol 12) |

- Kurtarma: `past_due`/`suspended` durumunda başarılı ödeme olayı → anında `active`, motor otomatik yeniden başlar; ilk sync'te tam mutabakat (stok/fiyat) tetiklenir.
- **Risk notu (zero-oversell ile ilişkili):** Motor durdurulunca pazaryerlerindeki stok güncellenmez → aşırı satış riski müşteriye geçer. Bu yüzden askıya almadan **3 gün önce** ve askı anında e-posta + uygulama içi bildirim açıkça "stok senkronu duracak" der; askı kararı bir kez uygulanır, sessiz değildir. (Askıda "stokları kanallarda 0'a çek" seçeneği nice-to-have backlog.)
- **Uygulama noktası tek yerdir:** `EntitlementService` (plan + override + durum → izinler). (a) API katmanında ADR-0001 auth middleware'inden sonra çalışan bir guard (yazma operasyonları ve kota aşan oluşturma işlemleri: yeni kanal/ürün/kullanıcı); (b) IntegrationEngine iş planlayıcısı tenant'ı kuyruğa almadan önce; (c) MCP katmanı (ADR-0009, `mcpCallsPerDay`). Durum tenant anahtarlı bellek içi önbellekte **60 sn TTL** ile tutulur (cache anahtar politikası ADR'sine uygun: anahtar tenant içerir); webhook işlenince ilgili tenant anahtarı silinir.
- Kota aşımında mevcut veri silinmez/kapatılmaz; yalnızca yeni oluşturma reddedilir ve aksiyon alınabilir mesaj döner ("Planınız 2 kanala izin veriyor; yükseltmek için …").

### 4. Webhook doğrulama
- Ayrı rota: `POST /api/billing/webhooks/:provider` — jenerik `/:service/:operation` RPC'sinin **dışında**, JWT gerektirmez, IP/istek rate limit'li, **ham gövde** (raw body) yakalanır.
- İmza: sağlayıcının HMAC imza başlığı (iyzico için güncel imza sürümü ve başlık adı **sandbox'ta doğrulanmalı**) env'deki gizli anahtarla hesaplanıp **sabit zamanlı karşılaştırma** ile doğrulanır; geçersizse 401 ve audit kaydı.
- **Webhook'a tek başına güvenilmez:** imza geçerli olsa da abonelik durumu sağlayıcı API'sinden (`getSubscription`) yeniden çekilir; doğruluk kaynağı sağlayıcıdır.
- Idempotency: `BillingEvents.providerEventId` unique; tekrar gelen olay `ignored` olarak 200 döner. Sıra dışı olaylar: durum, sağlayıcıdan yeniden çekilen güncel duruma göre yazıldığı için sıra sorunu oluşmaz.
- Hızlı 2xx, işlem BullMQ kuyruğunda (mevcut Redis) yeniden denemeli; başarısız olay `failed` kalır ve admin panelinde görünür.
- **Günlük mutabakat işi:** tüm `active|past_due|trialing` abonelikler sağlayıcıyla karşılaştırılır (tek haneli ölçekte birkaç istek) → kaçan webhook'lar yakalanır.

### 5. Fatura / e-arşiv yaklaşımı
- Abonelik ücreti için Entegrasyonik'in kendi şirketi e-Arşiv/e-Fatura düzenlemek zorundadır; ödeme sağlayıcısı fatura kesmez.
- **Aşama 1 (tek haneli ölçek):** yarı otomatik — başarılı ödemeler `BillingEvents`'ten aylık CSV olarak dışa aktarılır (tenant unvanı, VKN/TCKN, adres, tutar, KDV); mali müşavir/şirket mevcut e-fatura portalından keser. Abonelik akışında fatura bilgisi (unvan, VKN/TCKN, vergi dairesi, adres, e-fatura mükellefi mi) zorunlu alan olarak toplanır.
- **Aşama 2 (eşikte):** mevcut BizimHesap adaptörü (kod tabanında var) veya Nilvera REST API ile otomatik e-Arşiv/e-Fatura. Hangisi olacağı şirketin mevcut muhasebe/entegratör sözleşmesine bağlı → **insan kararı**. KDV oranı, e-fatura/e-arşiv ayrımı ve tevkifat gibi vergi kuralları insan (mali müşavir) tarafından doğrulanır.

### 6. KVKK notu (hukuki danışmanlık değildir)
- Abone (tenant) bilgisi ve fatura verisi için Entegrasyonik **veri sorumlusudur**; tenant'ın son müşteri verisi (siparişler) için **veri işleyendir** (1f §5) → abonelik şartlarına veri işleyen sözleşmesi maddeleri eklenir, onay `termsVersion/termsAcceptedAt` ile saklanır.
- Kart verisi saklanmaz ve sistemden geçmez (hosted form); ödeme sağlayıcısı kendi yükümlülükleri olan ayrı bir taraftır. iyzico/PayTR yurt içi olduğundan yurt dışı aktarım bildirimi gerekmez (yabancı MoR seçilirse gerekir).
- Loglarda ve `BillingEvents`'te PII/kart alanları redaction'lı. İptal sonrası silme süreleri imha politikasına bağlanır; nihai metinler Protokol 12.

## Gerekçe
- **Maliyet bilinci:** iyzico Abonelik, yenileme/yeniden deneme/dunning'i sağlayıcıya bırakarak kendi faturalama motorumuzu yazmayı önler; tek haneli ölçekte aylık eklenti ücreti, kendi dunning kodumuzun bakım maliyetinden düşüktür. PayTR'de bu mantığı yazmak zorunda kalırdık.
- Port + mock adaptör, canlı hesap/KYC beklenirken Faz 3b ve Faz 5'in (hata/kurtarma senaryoları dahil) ilerlemesini sağlar ve sağlayıcı değişikliğini tek adaptöre indirger.
- Anlık sayım ve tek `EntitlementService`, sayaç tutarlılığı sorunu yaratmadan tüm uygulama noktalarında aynı kuralı uygular; birkaç tenant için sorgu maliyeti ihmal edilebilir.
- Abonelik verisini merkezi DB'de tutmak, askı kararının tenant DB'si açılmadan verilebilmesini ve admin panelinin tek yerden yönetmesini sağlar.
- Aşama 1 fatura yaklaşımı, ayda birkaç fatura için entegratör sözleşmesi/entegrasyon kodu maliyetini erteler.

## Maliyet/Ölçek Notu
- **Ek maliyet:** iyzico işlem komisyonu + abonelik eklentisi (canlıda; tutar doğrulanmalı); yeni servis yok (mevcut Express, Mongo, BullMQ/Redis). 3 yeni koleksiyon, 1 günlük cron.
- **Ek operasyon:** aylık fatura dışa aktarımı (Aşama 1'de insan); başarısız webhook olaylarının admin panelinden izlenmesi.
- **Yeniden değerlendirme eşikleri:**
  - Aylık kesilen abonelik faturası **20'yi** geçerse → Aşama 2 (otomatik e-Arşiv/e-Fatura) devreye alınır.
  - Ödeyen abone **50'yi** geçerse → kota için anlık sayım yerine sayaç/önbellek ve self-servis plan değişikliği/proration değerlendirilir.
  - 30 günlük pencerede yenileme ödemelerinin **%10'undan fazlası** başarısız olur **veya** kurtarma oranı **%50'nin** altında kalırsa → sağlayıcı/dunning stratejisi (PayTR'ye geçiş dahil) yeniden değerlendirilir.
  - Yurt dışında yerleşik ödeyen müşteri **3'ü** geçerse → döviz/MoR (Paddle vb.) ADR'si.
  - Tenant'ların **%20'sinden fazlası** bir limite düzenli (ayda ≥3 kez) takılıyorsa → plan limitleri/fiyatlandırma insanla yeniden gözden geçirilir.
  - Mock → iyzico sandbox geçişi: Faz 3b başında (sandbox hesabı KYC'siz açılabiliyorsa); canlıya geçiş yalnızca insan onayıyla.

## Etki Alanı
- `backend/src/services/billing/` (yeni: port, mock ve iyzico adaptörleri, `EntitlementService`), `backend/src/database/application/models/` (Plans, Subscriptions, BillingEvents), `api` katmanı (webhook rotası, entitlement guard; ADR-0001 middleware sırasına bağlı).
- `security-service.ts` `register` / `admin-service.ts` `createClient`: sabit 8 entegrasyon yerine `trialing` abonelik oluşturma (C6 düzeltmesiyle birlikte, characterization testlerinden sonra — Protokol 13).
- IntegrationEngine iş planlayıcısı (askıdaki tenant'ı atlama), MCP katmanı (ADR-0009 kota).
- Frontend: gerçek abonelik/plan ekranı (`SubscriptionView.vue` yer tutucusunun yerine — içerik ürünle ilgisiz olduğu için yeniden yazım değil, yeni ekran), admin paneli abonelik yönetimi (Faz 3).
- Tanıtım sitesi: fiyat sayfası → checkout akışı (Faz 3b); `MailService` (deneme sonu, ödeme hatası, askı uyarısı e-postaları).
- Migration: mevcut tenant'lara `legacy` abonelik (yedek ön koşulu).

## Frontend SONUÇ (2026-09-28, Faz 3, branch `faz3-arayuz`)
Aşama A'nın (backend port/mock/model/EntitlementService/webhook) frontend tüketicisi tamamlandı — `SubscriptionView.vue`'nun ürünle ilgisiz LGS/eğitim yer tutucu içeriği (6.662 satır, `LgsService/*` çağıran, hiçbir zaman var olmayan bir servise bağlı) **gerçek abonelik/plan ekranıyla DEĞİŞTİRİLDİ** (ADR-0011 Karar 2 "P1-yeni": characterization YAZILMADI, sıfırdan token'larla yazıldı; literal-stil mandalı `SubscriptionView.vue` için 41→0).
- **Seçenek A (önce backend API rotası) SEÇİLDİ, gerekçe:** Aşama A yalnızca iç katmanları kurmuştu, jenerik RPC katmanında bu katmanları tüketen bir servis yoktu. Gereken ek yüzey mekanik ve küçüktü (3 operasyon, mevcut 25+ servisle AYNI `BaseApi`/`RunOperation`/`OPERATION_POLICY` deseni, yeni mimari karar yok) → uçtan uca değer B'den (yalnız Playwright mock sözleşmesi + ayrı backlog) daha ucuza sağlandı; B'nin "backend sözleşme kayması yakalanmaz" riski (ADR-0011 Alternatif D2'nin eksisi) bu ekran için ortadan kalktı (operasyon adları backend servisi ve `operation-policy.test.ts` FE-envanter taramasıyla zorlanıyor).
- **Backend:** `backend/src/api/services/billing-service.ts` (`BillingService`) — `getPlans` (`active && public`, fiyata göre artan; koleksiyon boşsa `plans: []`, HATA DEĞİL), `getMySubscription` (abonelik + plan + `EntitlementService.checkAccess` ile read/write/engine erişimi — ekran erişim mantığını İCAT ETMEZ, ADR §3 "uygulama noktası tek yerdir"; kayıt yoksa `status: 'no_subscription'`), `startCheckout` (`getPaymentProvider().createCheckout`; sağlayıcı referansını `Subscriptions`'a upsert eder ki webhook sonradan bulabilsin — durum/dönem alanlarını EZMEZ, `$setOnInsert: {status:'trialing'}`). `operationPolicy.ts`: `getPlans`/`getMySubscription` = member, `startCheckout` = **admin** (faturaya yansıyan işlem; `SettingService.updateSettings`/entegrasyon kimlik bilgisi yazmayla aynı gerekçe). `api/index.ts`'e kayıtlı. Yan etki: `LgsService/retrieveLGS|saveLGS` (zaten backend'i olmayan, yalnız eski yer tutucuda geçen) `operation-policy.test.ts` `FE_CALLS_WITHOUT_BACKEND` listesinden çıkarıldı (testin kendi kuralı: "FE'den silinirse kırılır").
- **Frontend tasarımı (`frontend/src/views/secure/user/SubscriptionView.vue`):** durum bandı (trialing/active/past_due/suspended/canceled/expired/abonelik-yok → ADR §3 tablosuna göre Türkçe insan-okunur metin, varsa `EntitlementService`'in gerekçe mesajı; ham durum kodu gösterilmez; `role="status"` + `aria-live`); 3 plan kartı (CSS grid `auto-fit minmax(260px,1fr)` → ≥1024'te 3, tablette 2, mobilde 1 sütun; kenarlık `--ek-color-border-default`, hover/mevcut plan `--ek-color-primary`, motion `--ek-duration-base`/`--ek-easing-standard`); mevcut plan rozeti + "Mevcut Planınız" (etkin/deneme dışı durumlarda "Yeniden Etkinleştir"), farklı plan için "Bu Plana Geç", abonelik yoksa "Planı Seç"; `priceMinor === 0` → "Özel Teklif" (ADR §2 tablosundaki Kurumsal "özel teklif"in plan kodunu sabitlemeden temsili); onay diyaloğu → `BillingService/startCheckout` → MOCK checkout URL'sini bilgilendirme kartında gösterir (gerçek hosted checkout sayfası/yönlendirme YOK — görev talimatı; sonuç webhook ile gelir, `MockPaymentProvider.simulateEvent` dev tetikleyicisi hâlâ ayrı bir admin/dev aracı işidir). Yükleniyor (skeleton), boş ("Plan Tanımları Henüz Yayınlanmadı"), hata ("Planlar Yüklenemedi" + Tekrar Dene; `restApi.post` ağ hatasında reddetmediği için başarı `result:true` ile ayırt edilir — mevcut ekranların "hata = boş" gizli davranışından BİLİNÇLİ olarak ayrıldı), yetkisiz 403 ("Bu işlemi yalnızca hesap sahibi veya yöneticisi gerçekleştirebilir.") durumları ayrı tasarlandı.
- **Fiyat/limit değerleri hâlâ İNSAN KARARI (Protokol 12):** ekran hiçbir fiyat/limit değeri SABİTLEMEZ; `Plans` koleksiyonunu (seed AYRI görev — bu görevde `Plans`'a HİÇ veri yazılmadı) olduğu gibi gösterir. Playwright fixture'ındaki değerler (Başlangıç ₺2.490 / Büyüme ₺5.990 / Kurumsal özel teklif, ADR §2 tablosu) yalnızca test verisidir. Not: `Plan.priceMinor` şemada zorunlu sayı olduğundan Kurumsal için seed kararı (0 = "özel teklif" mi, ayrı bir alan mı) insana aittir — ekran `0`'ı "Özel Teklif" gösterir.
- **Testler:** `backend/tests/unit/billing/BillingService.test.ts` (9 test); `frontend/e2e/specs/subscription.spec.ts` (9 test × 3 viewport = 27: smoke, boş, hata, abonelik-yok, past_due, etkileşim [plan seç → onay → checkout bilgisi], 403, ekran görüntüsü, axe WCAG 2.1 AA — yalnız `.subscriptionView` DOM'u taranır [kabuk/sekme çubuğunun bilinen, kapsam dışı ihlalleri hariç], **0 ihlal**). Doğrulama: `npx playwright test subscription.spec.ts --workers=4` 3× ardışık 27/27; `npx vitest run` 87/87; `test:typecheck-ratchet` 15/15; `test:style-ratchet` (taban `--write` ile yeniden yazıldı, SubscriptionView 41→0); `npx vite build` hatasız; backend `tsc --noEmit` 0 hata, `npx jest --silent` 3× 100 suite/1.621 test.
- **Kapsam dışı / sonraki görevler (bilerek):** menü/kabuk/`screens.ts`/`router` DEĞİŞTİRİLMEDİ — bu yüzden ekranın URL'si yok ve yalnızca backend `MenuService`'in `user/SubscriptionView` menü öğesini döndürdüğü kullanıcılar sekme olarak açabilir (BACKLOG "incelenmesi gereken davranış": `menu.ts`'te `user/EducationView` anahtarı da AYNI dosyaya bağlı, artık o da abonelik ekranını açar). `Plans` seed script'i, `security-service.ts`/`admin-service.ts` `trialing` abonelik oluşturma, mevcut tenant'lara `legacy` migration, iptal/plan-değiştirme/kart-güncelleme (admin paneli abonelik yönetimi), iyzico adaptörü, "Planı Seç"in gerçek hosted checkout'a yönlendirmesi, `EntitlementService` guard'larının API/IntegrationEngine/MCP'ye fiilen bağlanması — hepsi ayrı görevler (C16 kalanı).

## S4a SONUÇ (2026-09-28, ADR-0014 S4a backend, branch `faz3-arayuz`)
- **Plans seed:** tek doğruluk kaynağı `backend/src/database/application/seed/plans.seed.json` (saf JSON; site derlemede okur). Şema: `_meta` (`status: "ÖNERİ — insan kararı bekliyor (Protokol 12)"`), `trial {planCode:"starter", days:14, cardRequired:false}`, `vat {ratePercent, status}`, `plans[]` (Plan model alanları + yalnız-site `featureNotes[]`; `priceMinor` kuruş, `0` = "özel teklif"). Değerler §2 tablosu (Başlangıç 249000, Büyüme 599000, Kurumsal 0). **Yıllık plan kodu EKLENMEDİ** (`Plans.code` unique + tek `interval`; yıllık indirim/kod insan kararı), `legacy` plan da seed'de yok (legacy migration ayrı görev). `npm run seed:plans` = `dev-tools/seed-plans.js` (göç betikleriyle aynı çerçeve): dry-run varsayılan, izinli 7 DB dışını reddeder, yalnız local 127.0.0.1, `--apply` için `SEED_PLANS_BACKUP_CONFIRMED=yes`; idempotent (`created/updated/unchanged/skipped_newer`, `providerRefs` ezilmez). **Gerçek DB'ye çalıştırılmadı** (yalnız sahte koleksiyonlu testler); local DB'ye uygulama insan adımı.
- **Mock hosted checkout:** `MockCheckoutApiManager.ts` — `GET|POST /api/billing/mock-checkout/:providerRef`, dev tetikleyici `POST /api/billing/mock/simulate` (istemci: `dev-tools/mock-simulate.js`). Yalnız `PAYMENT_PROVIDER=mock` + `PAYMENT_ENV!=live` + `NODE_ENV!=='production'`, aksi 404 (kapı her istekte; rota `authenticate`'ten önce kayıtlı). Token: HMAC (`BILLING_MOCK_HMAC_SECRET`, alan-ayrımlı önek), `providerRef`'e bağlı, 15 dk, POST'ta tek kullanımlık; `Sec-Fetch-Site: cross-site` ret; sayfada kart alanı YOK, katı CSP; reddedilen denemede yeni token'lı "tekrar dene". Sonuç `handleBillingWebhook` ile GERÇEK webhook yolundan işlenir. `createCheckout` kapı açıkken bu sayfaya işaret eden token'lı URL döner (`MOCK_CHECKOUT_BASE_URL`), kapalıyken eski yer tutucu.
- **register → trialing (tasarım kararı):** `TenantProvisioningService.provision()`'a ACTIVE'den ÖNCE `subscription` adımı (`trialSubscription.ts`; `$setOnInsert` upsert → idempotent, deneme uzamaz) — `register` ve `createClient` aynı noktadan geçer. Adım başarısızsa tenant `PROVISIONING_FAILED` olur ve mevcut yeniden-deneme yolu (ADR-0003) tamamlar. **Gerekçe (best-effort yerine):** `EntitlementService` abonelikSİZ tenant'ı `no_subscription` = erişimsiz sayar; sessiz atlanan bir hata kullanıcıyı yarım kayıtla kilitlerdi, oysa abonelik yazımı aynı ApplicationDB'ye tek Mongo yazımıdır (ek hata yüzeyi küçük). `Plans` henüz seed edilmemişse kayıt KIRILMAZ (sürüm seed dosyasından, uyarı loglanır). `startCheckout` artık `priceMinor<=0` (Kurumsal) plan için reddeder.
- **Açık riskler:** trial bitişi/`suspended` geçiş job'u yok (`trialEndsAt` yalnız kayıt; `EntitlementService` trialing'i süresiz tam erişimli sayar); `EntitlementService` guard'ları hâlâ API/Engine/MCP'ye bağlı değil; mock sağlayıcı ve token nonce'ları süreç-içi (çok replika/yeniden başlatmada oturum kaybolur — yalnız dev); reddedilen ödeme webhook'u `currentPeriodStart/End`'i mock'un aylık dönemiyle yazar (trialing için etkisiz); fiyat/limit/KDV/yıllık plan insan kararı.

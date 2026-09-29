# Entegrasyon SaaS Mimari ve Ürün-Tasarım Desenleri — 2026-09-28

Amaç: "Benzer SaaS entegrasyon yapıları nasıl bir yol izlemiş; her şeyi doğru kabul etme, sistemin bir kimliği var" talimatına yanıt. Bu belge ÖZELLİK karşılaştırması değildir (o iş `docs/research/2026-09-28-saas-capability-benchmark.md`'de yapıldı); MİMARİ ve ÜRÜN-TASARIM DESENLERİNİ inceler: başkaları nasıl çözmüş, hangisi Entegrasyonik'e uyar, hangisi uymaz.

Kapsam kuralları: kod yazılmadı; `BACKLOG.md`, `MASTER_STATE.md`, ADR'ler GÜNCELLENMEDİ. Bulgular orkestratörün karar girdisidir; sınıflandırma önerileri (critical/planned/nice-to-have) §8'de toplandı. Fiyat, ücretli 3. parti servis, canlı hesap kararları insan onayı gerektirir (Protokol 12).

## 0. Yöntem, kaynak güvenilirliği, sınırlar

Kaynak etiketi (benchmark belgesiyle aynı ölçek):
- **A** = üretici/resmi sayfa bu oturumda WebFetch ile çekildi ve içerik okundu.
- **B** = resmi sayfa başlığı arama sonucunda görüldü, içerik arama özetinden alındı (sayfa çekilemedi veya çekilmedi).
- **C** = üçüncü taraf blog/inceleme/hukuk bürosu yazısı; yalnızca destekleyici, tek başına kanıt sayılmaz.

Önemli sınırlar (dürüstlük notu):
1. WebFetch aracı sayfayı küçük bir modelle özetler; A etiketli kaynaklardaki sayısal değerler (süre, limit, tarih) ADR'ye yazılmadan önce sayfadan bir kez daha doğrulanmalıdır.
2. Pazarlama sayfası iddiaları mühendislik gerçeği sayılmadı; kullanıldıkları yerde "pazarlama iddiası" diye işaretlendi (ör. Linnworks).
3. `docs/adr/0004-*` ve `docs/adr/0008-*` dosyaları bu oturumda açılamadı (dizin listeleme aracı yok, dosya adı tahmini tutmadı). ADR-0004 ve ADR-0008 karşılaştırmaları `BACKLOG.md` C8 ve C16 satırlarındaki ayrıntılı özetlere dayanır; ADR-0015/0016/0017 metinleri de okunmadı, yalnızca hedef başlık olarak kullanıldı.
4. Repo kanıtı ana çalışma dizininden (`D:\ENTEGRASYONIK_FACTORY`) okundu (BACKLOG, MASTER_STATE, benchmark). Bu worktree'de `docs/research/` başlangıçta yoktu.
5. Bu belge canlı sistem, DB veya Trendyol/HB/N11 canlı hesabıyla doğrulama içermez.

## (a) Yönetici özeti

Ana bulgular (ayrıntı ilgili bölümlerde):

1. **Acil dış-değişiklik bulgusu (Konu 11, critical adayı):** Trendyol resmi changelog'una göre (A) eski sipariş uç noktası 15 Ekim 2026'da kapanıyor (bugünden 17 gün sonra; `/v2/orders`, 10.000 kayıt pencere sınırı), Ürün V1 servisleri 15 Eylül 2026'dan itibaren "brownout" (günde 3 kez 15 dk hata) veriyor ve V2'ye geçiş zorunlu, menşe (origin) alanı 23 Ekim 2026'da zorunlu oluyor. C11 ile sipariş varsayılan URL'leri düzeltildi; ancak URL'ler DB ayarından override edilebilir ve ürün (export) hattının V1 mi V2 mi kullandığı bu oturumda koddan/DB'den doğrulanamadı. Hemen kontrol edilmeli (§ Konu 11, §8).
2. **Sektörün en tutarlı kalıbı "olay + periyodik mutabakat"tır** (Shopify, GitHub, Stripe, iyzico, Trendyol'un kendi kesinti duyuruları): webhook/polling tek başına yetmez. ADR-0004'ün saatlik/günlük mutabakatı ve ADR-0005'in webhook+5 dk mutabakatı bu kalıpla örtüşüyor; iyzico webhook'unun yalnız 3 deneme yapması (A) ADR-0008'deki günlük mutabakat işini "açık kalem"den "şart"a yükseltiyor.
3. **Hata yönetimi kalıbı yakınsıyor:** geçici/kalıcı hata ayrımı; yalnız geçici hatanın üstel geri çekilmeyle otomatik yeniden denenmesi; başarısız birimin saklanıp tek tek/toplu yeniden oynatılması; otomatik deneme sürerken sessizlik, son başarısızlıkta tek bildirim (Make, Zapier, Shopify Flow, Celigo, Workato). Entegrasyonik'in `IntegrationError{code,retryable}` sözleşmesi (ADR-0006) bu kalıbın backend yarısını zaten taşıyor; eksik olan tenant'a dönük "hata kutusu" ve bildirim politikasıdır.
4. **Dürüstlük kimliği ile uyumlu en güçlü desen:** ürün arayüzünde "kapsam beyanı" (adaptörün gerçekten yapabildikleri) ve "hata ≠ boş" ayrımı (Primer "degraded experiences" ilkesi, A). Rakip entegratörlerin pazarlama sayfaları bu konuda sessiz; Entegrasyonik'in farklılaşma alanı.
5. **Aşırı satış koruması bakımından ADR-0004 sektör pratiğiyle uyumlu, iki iyileştirme önerisi var:** (i) append-only "stok hareket günlüğü" (Shopify `referenceDocumentUri`, Stripe Ledger değişmez olay günlüğü ilkesi); (ii) mutabakatı Stripe Ledger'ın üç veri-kalitesi ekseniyle (clearing/timeliness/completeness) ölçülebilir hâle getirmek (ADR-0017 metrikleri).
6. **Bilinçli redler:** kullanıcı tanımlı hata iş akışları ve görsel akış tasarımcısı, Stripe'ın hesap-sabitli tarih tabanlı API sürümleri, Shopify'ın "birim başına satır" rezervasyon şeması, "boş hücre üzerine yaz" içe aktarma semantiği, barındırılan (ücretli) webhook/bildirim/durum sayfası servisleri, SMS/push/Slack ilk sürümde. Ayrıntı §(d).

Rapor sonu "Top-15" listesi §9'dadır.

---

## (b) Konu bazlı bulgular

### Konu 1 — Gözlemlenebilirlik ve operasyon konsolu

**Kaynak tablosu**

| Ürün | Ne yapıyor | Kaynak | Etiket |
|---|---|---|---|
| Celigo | Hata sayfası "çalışma alanı": hata verisini düzelt, atama, etiket, toplu yeniden dene/çöz; hata "Intermittent" sınıflanırsa ve auto-resolve açıksa en fazla 4 otomatik deneme; hata REST API'si ile otomasyon | https://docs.celigo.com/hc/en-us/articles/360048814732-Intro-to-Error-Management (çekilemedi, 403; arama özeti) | B |
| Workato | İş geçmişi + "Repeat job"; yeniden çalıştırma tetikleyicinin ilk (önbellekli) verisini kullanır, "mükerrer kayıt oluşabilir" uyarısı, saklama süresi dolan iş yeniden oynatılamaz; Handle-errors bloğu; "Job failed" tetikleyicisi | https://docs.workato.com/recipes/rerun-job.html | A |
| Make | "Incomplete executions" varsayılan kapalı; RateLimit/Connection/ModuleTimeout hatalarında 8 otomatik deneme (1 dk, +10, +10, +30, +30, +30 dk, +3 sa, +3 sa; toplam ≈7 sa 51 dk); sonunda "Unresolved", senaryo aktif kalır, elle müdahale; depolama üst sınırı plan kotasına bağlı | https://help.make.com/incomplete-executions · https://help.make.com/automatic-retry-of-incomplete-executions | A |
| Zapier | Yalnız hatalı adımı yeniden oynat (başarılı adımlar tekrar çalışmaz, mükerrer e-posta yok); Autoreplay 5 deneme (5 dk, 30 dk, 1 sa, 3 sa, 6 sa ≈10,5 sa); son deneme başarısız olana kadar hata e-postası gönderilmez; 60 gün içinde yeniden oynatma | https://help.zapier.com/hc/en-us/articles/19220226086797-What-is-replay | A |
| n8n | İş akışı başına "error workflow" + Error Trigger (yürütme kimliği, hata, düğüm, `retryOf`); Stop And Error düğümü | https://docs.n8n.io/build/flow-logic/handle-errors-gracefully | A |
| Shopify Flow | Geçici hata (artan gecikmeyle yeniden denenir, iş akışı bölümü başına toplam 36 saat üst sınır) / kalıcı hata (denenmez); "Workflow error occurred" tetikleyicisi ile uyarı; çalışma kayıtları 14 gün saklanır (arama özeti) | https://help.shopify.com/en/manual/shopify-flow/create/troubleshoot (36 sa: A) · https://help.shopify.com/en/manual/shopify-flow/manage/monitor (14 gün: B) | A/B |
| Google SRE Workbook | SLO'ya dayalı, çok-pencereli çok-yanma-hızlı (multiwindow, multi-burn-rate) alarm: hızlı+yavaş pencere birlikte doğruysa alarm | https://sre.google/workbook/alerting-on-slos/ (arama özeti) | B |
| Çok kiracılı OTel | Kiracı kimliğini kaynak özniteliği/baggage ile taşıma, kiracı başına SLO; kardinalite uyarısı | https://oneuptime.com/blog/post/2026-02-06-instrument-saas-multi-tenant-application-opentelemetry/view (satıcı blogu; OTel'in resmi bir "tenant" standardı bu oturumda doğrulanamadı) | C |

**İzlenen yol.** Hatalı işi kaybetmemek için "başarısız birimi sakla" (incomplete execution / hata kaydı / iş geçmişi), sonra otomatik+elle yeniden oynatma. Hata sınıfı kararı platformda: geçici olan otomatik denenir, kalıcı olan insana bırakılır.

**Ortak kalıplar.** (1) Geçici/kalıcı ayrımı ve yalnız geçicide üstel geri çekilme (Make, Zapier, Flow, Celigo). (2) Otomatik deneme sürerken bildirim yok, son başarısızlıkta tek bildirim (Zapier açıkça). (3) Yeniden oynatma yalnız hatalı adımı hedefler (Zapier); tüm işi yeniden oynatmak mükerrer kayıt riski taşır (Workato uyarısı). (4) Saklama süresi sınırlı ve belgelenmiş (Zapier 60 gün, Flow 14 gün, Workato saklama ayarına bağlı). (5) Hata REST API'si veya "hata oldu" tetikleyicisi ile dışa açılır (Celigo, Workato, Flow, n8n).

**Tuzaklar.** Mükerrer yan etki (yeniden oynatma); saklama bitince kayıp; "hata yok" ile "veri yok" karışması (Primer degraded ilkesi, bkz. Konu 8; bizde BACKLOG T4h "hata=sıfır görünümü" bulgusu bunun somut örneği); alarm gürültüsü; kota (Make'te depolama üst sınırı aşılınca bildirim).

**ENTEGRASYONİK KARARI**
- **BENİMSE:** geçici/kalıcı sınıfını tenant arayüzüne yansıtmak ("Otomatik yeniden denenecek" / "Müdahale gerekli"). Backend karşılığı hazır: `IntegrationError.retryable` (ADR-0006). ADR-0017.
- **UYARLA:** tenant başına "Hata kutusu": başarısız export kayıtları (Mongo durum makinesi) ve sipariş çekim hataları (BullMQ DLQ) tek listede; kolonlar: entegrasyon, kod, `retryable`, sonraki deneme, ilk/son görülme, sayı; eylem: tek/toplu yeniden dene, "çözüldü olarak işaretle". Yeniden oynatma yalnız başarısız birimi hedefler (Zapier), yan etkili eylemlerde (sipariş iptali, stok yayını) idempotency anahtarı doğrulanmadan "yeniden dene" düğmesi gösterilmez (Workato uyarısı; bizde `StockAllocator` anahtar deseni var). Saklama süresi ÖNERİ: 30 gün (karar insan). ADR-0017 + Y-06.
- **UYARLA:** alarm tasarımı iki katmanlı: tenant'a dönük basit kural (ardışık N başarısızlık, devre kesici açık, kimlik hatası) — SRE burn-rate karmaşası tenant'a getirilmez; platform yöneticisi için (ADR-0017) SLO/yanma-hızı yaklaşımı yalnız "yayın gecikmesi" ve "sipariş çekim başarısı" gibi 2–3 gösterge için düşünülebilir. Kaynak B olduğundan uygulama öncesi sayfa doğrulanmalı.
- **UYARLA:** kiracı kimliği (`clientId`) log/iz/`IntegrationCallMetrics` kayıtlarında zorunlu alan; metrik SİSTEM etiketi olarak yüksek kardinaliteli kiracı etiketi taşıması ÖNERİLMEZ (bu bir mühendislik çıkarımıdır; kaynak C yalnız kardinalite riskine değiniyor).
- **REDDET:** Celigo tarzı hata atama/etiketleme/iş birliği alanı (küçük ekip ölçeği için aşırı; kimlik: sakin, tek amaçlı ekran); n8n tarzı kullanıcı tanımlı "error workflow" (kural motoru v1 sınırını aşar, Konu 4); herkese açık durum sayfası şimdilik (Y-28 P2 olarak kalır, `/health`'ten üretilecek; barındırılan servis satın alma insan kararı).

---

### Konu 2 — Entegrasyon sağlığı ve bağlantı yönetimi UX'i

**Kaynak tablosu**

| Ürün | Ne yapıyor | Kaynak | Etiket |
|---|---|---|---|
| Nango | Token'ı süre dolmadan ve en az 24 saatte bir yeniler; yenileme başarısızlığında periyodik yeniden dener, "birkaç ardışık gün" sonra vazgeçer; başarısızlıkta ve kurtarmada webhook gönderir; "kullanıcı bağlantıyı kolayca yeniden kursun" önerisi | https://nango.dev/docs/guides/auth/token-refreshing | A |
| Nango blog | Yenileme bir kez daha denenir, tekrar başarısızsa bağlantı "yeniden yetkilendirme gerekli" işaretlenir ve arka plan yenilemesi durdurulur | https://nango.dev/blog/microsoft-oauth-refresh-token-invalid-grant/ (arama özeti) | B |
| Make | Geçersiz bağlantıda "Reauthorize"; bağlantı doğrulama hatasında (AccountValidationError) senaryo zamanlamasını otomatik devre dışı bırakır | https://help.make.com/connect-an-application (arama özeti; topluluk sayfaları C) | B/C |
| Trendyol (bizim kanal) | Basic Auth (supplierid/API key/secret), `User-Agent` zorunlu (yoksa 403), PROD/STAGE kimlik bilgileri farklı olabilir | https://developers.trendyol.com/docs/2-authorization | A |
| Primer | "Kullanılamıyor" durumu ayrı bir mesaj durumu; hata ile boş durumu karıştırma | https://primer.style/product/ui-patterns/notification-messaging/ · https://primer.style/product/ui-patterns/degraded-experiences/ | A |

**İzlenen yol.** OAuth ürünleri (Nango, Make) kimlik bilgisi ömrünü platformun işi sayıyor; geçici yenileme hatası ile kalıcı iptal ayrılıyor; kalıcı hâlde deneme durduruluyor ve kullanıcıdan eylem isteniyor. API anahtarı tabanlı pazaryerlerinde (bizim 4 kanalın dördü) "yenileme" yok, ama "geçersiz anahtar" (401/403) aynı sınıfa giriyor.

**Ortak kalıplar.** (1) Bağlantı durumu tek kelimelik makine: bağlı / geçici sorun / yeniden yetkilendirme gerekli. (2) Kalıcı hatada körü körüne yeniden denememe. (3) Hem hata hem KURTARMA bildirimi. (4) Kullanıcıyı tek tıkla yeniden bağlanma akışına götürme.

**Tuzaklar.** Geçici kesintiyi (5xx/timeout) kimlik hatası gibi göstermek (yanlış alarm); kalıcı kimlik hatasında sonsuz yeniden deneme (kota/ban riski); Make'in "tüm zamanlamayı durdur" davranışı bizde oversell riski doğurur (aşağıda).

**ENTEGRASYONİK KARARI**
- **BENİMSE:** durum makinesi: `Bağlı` · `Geçici sorun (yeniden deneniyor)` · `Kimlik bilgisi geçersiz — yeniden girin` · `Bağlanmadı` · `Desteklenmiyor`. Kaynak: ADR-0006 hata kodları (`AUTH`, `UNAVAILABLE`, `NOT_SUPPORTED`) + devre kesici durumu + son başarılı çağrı (`IntegrationCallMetrics`). AUTH kodunda yeniden deneme durur, tek bildirim + kurtarma bildirimi. Y-03(e) "Bağlantıyı test et" (`IPlatform.init()`/ping) aynı akışa bağlanır. ADR-0015 (ekran) + ADR-0017 (durum verisi).
- **UYARLA (dürüstlük kimliği):** her adaptör için "Kapsam" beyanı — makinece okunur yetenek listesi (ör. Ideasoft: fatura iletimi `NOT_SUPPORTED`; Bizimhesap: salt okunur; N11: otomatik sipariş iptali yok; HB: `updateProductVariant` `NOT_SUPPORTED`). Ekranda yeşil/gri "yetenek çipleri" olarak gösterilir; hiçbir pazarlama metni bu listeden geniş olamaz. Bu desen incelenen rakiplerde yok (doğrulanamadı; pazarlama sayfaları kapsam sınırı göstermiyor); Primer'ın "sorunu gizleme, kullanıcıyı sorunun çevresinden geçir" ilkesiyle (A) uyumlu. ADR-0015.
- **UYARLA:** kimlik hatası olan kanalda yalnız o kanalın yayını duraklar (Make gibi tüm zamanlamayı durdurmayız); kanal erişilemezken diğer kanallara stok yayını sürer ve kullanıcıya "bu kanalda stok yayınlanamıyor, aşırı satış riski artıyor" uyarısı verilir (kimlik değeri #2). ADR-0004 + ADR-0017.
- **REDDET:** her ölçüm turunda otomatik "bağlantıyı yeniden yetkilendir" e-postası spam'i; OAuth'a özgü token yenileme altyapısı (yalnız Ideasoft OAuth; C10 çözülünce ayrı iş).

---

### Konu 3 — Giden webhook + genel API tasarımı

**Kaynak tablosu**

| Ürün | Ne yapıyor | Kaynak | Etiket |
|---|---|---|---|
| Stripe webhooks | `Stripe-Signature: t=…,v1=…` = HMAC-SHA256(`t.` + ham gövde); varsayılan 5 dk tolerans; canlıda 3 güne kadar üstel geri çekilmeyle yeniden deneme; sıra garantisi YOK; olay kimliğiyle tekilleştir; sır döndürme sırasında 24 saate kadar çift imza; en fazla 16 uç nokta; elle yeniden gönderme (Dashboard 15 gün, CLI 30 gün); "Delivered/Pending/Failed" teslimat listesi; hızlı 2xx dön, işi kuyrukta yap; "snapshot" vs "thin" olay | https://docs.stripe.com/webhooks | A |
| Stripe idempotency | `Idempotency-Key`, ≤255 karakter, ilk isteğin durum kodu+gövdesi (500 dahil) saklanır, en az 24 saat sonra silinebilir, parametre uyuşmazlığında hata, yalnız POST | https://docs.stripe.com/api/idempotent_requests | A |
| Stripe sürümleme | 2024-09-30.acacia'dan beri aylık kırıcı-olmayan sürüm + yılda iki büyük sürüm; hesap varsayılan sürümü + `Stripe-Version` başlığı; webhook uç noktası sürümü ayrı | https://docs.stripe.com/api/versioning | A |
| Stripe oran sınırı | 429 + `Stripe-Rate-Limited-Reason` (global-rate, endpoint-rate, concurrency…), jitter'lı geri çekilme, istemci tarafı token bucket önerisi | https://docs.stripe.com/rate-limits | A |
| Stripe kısıtlı anahtarlar | Kaynak başına None/Read/Write; anahtar bir kez gösterilir; oluşturmada iki faktör; eski anahtarı en fazla 7 gün gecikmeli süreyle emekliye ayırma; hizmet başına ayrı anahtar | https://docs.stripe.com/keys/restricted-api-keys | A |
| GitHub webhooks | `X-Hub-Signature-256` (sha256=…), sabit-zamanlı karşılaştırma; 10 sn zaman aşımı; OTOMATİK yeniden gönderim YOK (elle); `X-GitHub-Delivery` yeniden gönderimde aynı kalır | https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries · https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks | A |
| GitHub REST | `x-ratelimit-limit/remaining/used/reset/resource`, `retry-after`; ikincil limitler (eşzamanlı 100 istek vb.); tarih tabanlı `X-GitHub-Api-Version`, bir sürüm yenisi çıktıktan sonra ≥24 ay desteklenir, sonra 410; `Deprecation`/`Sunset` başlıkları; ek (additive) değişiklik tüm sürümlere yayılır | https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api · https://docs.github.com/en/rest/about-the-rest-api/api-versions | A |
| Shopify webhooks/API | `X-Shopify-Hmac-Sha256`, `X-Shopify-Webhook-Id` ile tekilleştirme, sıra garantisi yok (`X-Shopify-Triggered-At`/`updated_at` kullan), "webhook'a güvenme, mutabakat işi yaz"; üç aylık sürüm, ≥12 ay destek, erişilemeyen sürümde ileri düşme; GraphQL maliyet tabanlı sızdıran kova + REST 429/`Retry-After` | https://shopify.dev/docs/apps/build/webhooks/best-practices · https://shopify.dev/docs/api/usage/versioning · https://shopify.dev/docs/api/usage/rate-limits | A |
| Standard Webhooks | Açık belirtim: `webhook-id`, `webhook-timestamp`, `webhook-signature` başlıkları; SSRF/sahtecilik/tekrar oynatma tehditleri; 40+ uygulama, teknik yönlendirme komitesi (Zapier, Twilio vb.). İmza algoritması ayrıntısı bu sayfada doğrulanamadı | https://www.standardwebhooks.com/ | A (kısmi) |

**İzlenen yol.** Webhook = "en az bir kez teslim, sırasız, imzalı, yeniden denenen, kimlikli olay". Gövde küçük tutulur veya kaynak API'den güncel nesne çekilir ("thin"). API tarafında hata güvenliği için istemci üretimli idempotency anahtarı, sürüm için ya tarih başlığı (Stripe, GitHub) ya üç aylık sürüm (Shopify).

**Ortak kalıplar.** HMAC-SHA256 + zaman damgası imzalı içerik; tolerans penceresi; olay kimliğiyle tekilleştirme; sıraya güvenmeme; teslimat kayıtları + elle yeniden gönderim; sır döndürmede çift geçerlilik; oran sınırı başlıkları + `Retry-After`; ek değişiklikler sürüm gerektirmez, kırıcılar yeni sürümde; kullanımdan kaldırma başlıkları.

**Tuzaklar.** Ham gövdeyi bozan ara katman (imza doğrulanamaz; Stripe açıkça uyarıyor); GitHub'ın otomatik yeniden göndermemesi (kaçan olay kalır → mutabakat şart); sıra varsayımı; yeniden denemede yeni zaman damgası/imza (Stripe); PII'yi webhook gövdesine koymak (KVKK).

**ENTEGRASYONİK KARARI (Y-14, ADR-0016)**
- **UYARLA (imza):** Stripe mantığı (zaman damgası imzalı içerikte, HMAC-SHA256, 5 dk tolerans, çift-sır geçiş penceresi ≤24 sa) + Standard Webhooks başlık adları (`webhook-id`, `webhook-timestamp`, `webhook-signature`). Barındırılan bir servise (Svix vb.) bağlanmıyoruz; belirtimi kendimiz uygularız (kimlik #7). İmza biçimi ayrıntısı ADR'de belirtimden yeniden doğrulanmalı (bu oturumda doğrulanamadı).
- **BENİMSE:** en-az-bir-kez + sıra garantisi YOK belgede açıkça yazılır; olay kimliği tekilleştirme için; olay kataloğu sürümlü ve küçük (yalnız sipariş/stok/uyarı/entegrasyon durumu olayları).
- **UYARLA ("thin" olay):** gövde yalnız kimlikler + olay türü + `occurredAt`; alıcı ayrıntıyı API anahtarıyla çeker. Gerekçe (KVKK, kimlik #3): müşteri kişisel verisi üçüncü uç noktalara itilmez. Stripe "thin event" kavramı A kaynaklı; KVKK gerekçesi bizim çıkarımımız.
- **BENİMSE:** teslimat günlüğü ekranı (Teslim edildi/Bekliyor/Başarısız) + elle "yeniden gönder" (Stripe modeli); yeniden deneme takvimi ÖNERİ: 1 dk, 5 dk, 30 dk, 2 sa, 6 sa, 24 sa sonra durdur + tenant'a bildirim (Stripe 3 gün / Zapier ≈10,5 sa arası; karar insan).
- **BENİMSE:** genel API'de `Idempotency-Key` (POST'ta; ilk sonucu ≥24 saat sakla; parametre uyuşmazlığı hatası) — `StockAllocator` idempotent-anahtar felsefesiyle tutarlı.
- **BENİMSE:** API anahtarı: kaynak grubu başına none/read/write kapsamı; yalnız bir kez gösterilir, DB'de yalnız özet; döndürme sırasında ≤7 gün çift geçerlilik; entegrasyon başına ayrı anahtar; "son kullanım" zamanı; oluşturma/iptal işlemi yüksek-güvenli eylem (Konu 10'da 2FA sırası).
- **UYARLA (sürümleme):** tarih-başlıklı hesap-sabitli sürüm KURMAYIZ. `/api/v1` URL öneki + "yalnız ek değişiklik" politikası + kırıcı değişiklik `/v2` + `Deprecation`/`Sunset` başlıkları + ≥12 ay destek (GitHub 24, Shopify 12 ay; sayı bizim ÖNERİMİZ, karar insan).
- **UYARLA (oran sınırı):** tenant başına + anahtar başına sınır; yanıtta `x-ratelimit-*` benzeri başlıklar + 429 + `Retry-After` (GitHub). IETF RateLimit başlık taslağı bu oturumda doğrulanamadı; kullanılmadı.
- **REDDET:** Stripe'ın hesap-sabitli API sürüm katmanı (sürüm başına dönüşüm kodu yükü, modüler monolit + küçük ekip için aşırı); IP izin listesi ilk sürümde zorunlu değil (Stripe imzayla BİRLİKTE önerir; sabit çıkış IP'si altyapı kararı, ertele).
- Not — gelen tarafımız: Trendyol webhook + 5 dk mutabakat (ADR-0005) Shopify/GitHub kalıbıyla aynıdır; korunur.

---

### Konu 4 — Otomasyon/kural motoru ve iş akışı

**Kaynak tablosu**

| Ürün | Ne yapıyor | Kaynak | Etiket |
|---|---|---|---|
| Shopify Flow | Tetikleyici–koşul–eylem; geçici/kalıcı hata; iş akışı testi ve "Recent runs" filtreleri; hata tetikleyicisi. (Limitler sayfası çekildiğinde limit verisi içermiyordu → doğrulanamadı) | https://help.shopify.com/en/manual/shopify-flow/create/troubleshoot · https://help.shopify.com/en/manual/shopify-flow/manage/test-workflow (B) | A/B |
| Zapier | Döngü (loop) sık; Zapier döngüyü kendisi ALGILAYIP DURDURMAZ, kullanıcı elle kapatır; önlem: filtre adımı, "Zapier tarafından işlendi" bayrağı alanı, tekil kimlik | https://help.zapier.com/hc/en-us/articles/8496232045453-Zap-is-stuck-in-a-loop | A |
| Linnworks / Brightpearl / Sellercloud | Kural motorları (yönlendirme, etiketleme, kargo atama, otomatik faturalama); ayrıntı benchmark belgesinde | `docs/research/2026-09-28-saas-capability-benchmark.md` §1 (G1–G3) | B (benchmark) |
| Feedonomics | IF/THEN kural dili, kanal bazlı filtre | https://feedonomics.com/features-and-benefits/ | B |

**İzlenen yol.** Küçük sabit tetikleyici/eylem kataloğu → koşul filtresi → çalışma geçmişi. Genişleme (dallanma, bekleme, HTTP/kod adımı) ürünü "programlama ortamına" çevirir ve hata/kötüye kullanım yüzeyi büyütür.

**Ortak kalıplar.** Çalışma kaydı adım bazlı; test/kuru çalıştırma; geçici/kalıcı hata; hata bildirimi ayrı tetikleyici. Döngü koruması sektörde eksik bırakılmış bir alan: Zapier bunu kullanıcıya bırakıyor (A).

**Tuzaklar.** Sonsuz döngü ve kota tüketimi (Zapier belgesi); eylemin tetikleyiciyi yeniden ateşlemesi; yıkıcı eylemlerin (iptal, silme) onaysız otomasyonu; kurala kullanıcı tanımlı HTTP adımı eklemek = SSRF yüzeyi (Standard Webhooks sayfası SSRF'yi ilk tehdit olarak sayar).

**ENTEGRASYONİK KARARI (Y-15)**
- **UYARLA (v1 kapsamı):** kapalı katalog. Tetikleyici: sipariş oluştu, sipariş durumu değişti, stok eşiği altına indi (Y-06 ile aynı olay). Koşul: tek seviyeli VE listesi (kanal, tutar, ürün etiketi, desi vb.). Eylem: etiketle, bildirim gönder, kargo firması ata (Y-01 sonrası), otomatik onayla. Dallanma, bekleme, alt akış, keyfi HTTP/kod YOK.
- **UYARLA (döngü/kötüye kullanım koruması — kaynaklar sorunu gösteriyor, çözüm bizim tasarımımız):** (i) kural eyleminden doğan olay "kaynak=kural" işareti taşır ve başka kuralı tetiklemez (derinlik=1); (ii) kural başına saatlik çalışma tavanı + tenant başına günlük tavan, aşılınca kural otomatik "duraklatıldı" ve bildirim; (iii) her kural kaydedilirken kuru çalıştırma (son N siparişte "ne yapardı" önizlemesi); (iv) yıkıcı eylemler (sipariş iptali, silme) v1'de YOK veya açık onay; (v) çalışma günlüğü (kural, tetikleyen kayıt, sonuç) + denetim günlüğüne "kural kaynaklı" işareti.
- **BENİMSE (kimlik #2):** stok politikası (tampon, kanal tavanı, rezervasyon) kural motoruna AÇILMAZ; deterministik `stockPolicy` olarak kalır. Kural yalnız stok EŞİĞİ bildirimi üretebilir, stok miktarını değiştiremez.
- **REDDET:** görsel akış tasarımcısı (canvas) ve çok adımlı/dallanan akışlar; "bekle/geciktir" adımı; kullanıcı tanımlı HTTP/webhook eylemi (SSRF + ücretli kota karmaşası); kod adımı. Kural sayısı plana bağlı (Y-15 kabul kriteri).

---

### Konu 5 — Bildirim mimarisi ve merkezi/tercihler

**Kaynak tablosu**

| Ürün | Ne yapıyor | Kaynak | Etiket |
|---|---|---|---|
| Linear | Gelen kutusu her zaman; masaüstü/mobil/Slack gerçek zamanlı; e-posta özet (digest) tabanlı ve yalnız gelen kutusu bildirimi OKUNMAMIŞSA gönderilir; kategori × kanal anahtarları; bildirimler kategori bazında gruplanır; gelen kutusu en fazla 2.000 açık bildirim tutar, eskiler otomatik arşivlenir; ilgilenince otomatik abone | https://linear.app/docs/notifications | A |
| GitHub | Web gelen kutusu + e-posta + mobil; "watching" ve "participating" ayrı ayarlanır; e-posta gruplama belgede yok | https://docs.github.com/en/account-and-profile/managing-subscriptions-and-notifications-on-github/setting-up-notifications/configuring-notifications | A |
| Primer | Mesaj durumları: info, warning, critical, success ("az kullan"), unavailable, upsell; sistem güncellemesi çözülene kadar kapatılamaz; mesajı ilgili eylemin yanına koy (yakınlık); banner (sayfa/bölüm) vs inline (alan) | https://primer.style/product/ui-patterns/notification-messaging/ | A |
| Zapier | Otomatik yeniden oynatma sürerken hata e-postası yok; yalnız son başarısızlıkta tek e-posta | https://help.zapier.com/hc/en-us/articles/19220226086797-What-is-replay | A |
| Novu (digest belgesi) | Sayfa 404 döndü → doğrulanamadı | https://docs.novu.co/platform/concepts/digest | — |

**İzlenen yol.** Uygulama içi gelen kutusu birincil; dış kanallar (e-posta/push/Slack) ikincil ve tercihle; e-posta özet + okunmamış koşulu (Linear) gürültüyü kesiyor.

**Ortak kalıplar.** Kategori × kanal tercih matrisi; gruplama; okunmadıysa e-posta; kalıcı sistem uyarısı ile geçici başarı bildirimini ayırma; bildirim sayısına üst sınır/otomatik arşiv.

**Tuzaklar.** Her olayı ayrı bildirmek (gürültü, alarm yorgunluğu); tercihle susturulabilen kritik bildirim (kimlik hatası, aşırı satış, faturalama) yüzünden görünmez hata; "başarı" toast'larının çoğalması (Primer: az kullan).

**ENTEGRASYONİK KARARI (Y-06, ADR-0017, ADR-0015)**
- **BENİMSE:** uygulama içi bildirim merkezi birincil; e-posta ikincil ve "okunmamışsa" koşullu (Linear). `MailService` üretim yoluna bağlanana kadar (BACKLOG/Y-05) e-posta iddiası verilmez.
- **UYARLA:** tercih matrisi kategori × kanal (uygulama içi/e-posta); **zorunlu kategoriler kapatılamaz**: kimlik bilgisi hatası, OVERSOLD/UNMAPPED, faturalama/askı, güvenlik (Primer: sistem güncellemesi çözülene kadar kapatılamaz). Aynı kaynak olayı tek bildirimde birleşir ("N kez tekrarlandı"), otomatik deneme sürerken bildirim yok, son başarısızlıkta bildirim (Zapier). `NotificationService` kayıtlarına TTL/üst sınır (Linear örneği: 2.000). Sayılar bizim ÖNERİMİZ.
- **UYARLA:** günlük özet e-postası nice-to-have (P2); ilk sürümde yalnız anlık zorunlu kategori e-postası.
- **REDDET (ilk sürüm):** SMS/push (ücretli 3. parti, kimlik #7), Slack entegrasyonu (dış entegrasyon; giden webhook ile sonradan), barındırılan bildirim orkestrasyon servisi (Novu vb.; belge doğrulanamadı ve ücretli/barındırılan seçenek insan kararı).

---

### Konu 6 — Toplu işlem ve içe/dışa aktarma hatları

**Kaynak tablosu**

| Ürün | Ne yapıyor | Kaynak | Etiket |
|---|---|---|---|
| Shopify bulk query | Asenkron, JSONL sonuç (`__parentId`), bitişte `bulk_operations/finish` webhook'u veya yoklama, sonuç URL'si 1 hafta geçerli, 10 günde bitmezse başarısız, hata olursa `partialDataUrl`, API 2026-01+ uygulama/mağaza başına 5 eşzamanlı | https://shopify.dev/docs/api/usage/bulk-operations/queries | A |
| Shopify bulk mutation | JSONL ≤100 MB, staged upload, tek mutasyon, 24 sa süre, her satır BAĞIMSIZ doğrulanıp yürütülür, hatalar sonuç dosyasında satır numarasıyla; iç içe çağrı yasak | https://shopify.dev/docs/api/usage/bulk-operations/imports | A |
| Shopify CSV içe aktarma | Önce "inceleme" adımı, dosya ≤15 MB, başladıktan sonra İPTAL EDİLEMEZ, üzerine-yaz açıkken boş hücre mevcut değeri BOŞ yapar, tamamlanınca e-posta; indirilebilir hata CSV'si bu sayfada yok | https://help.shopify.com/en/manual/products/import-export/import-products | A |
| Linnworks / Feedonomics içe aktarma | Belgeler bu oturumda çekilemedi | — | doğrulanamadı |

**İzlenen yol.** Büyük iş = iş kaydı (durum, ilerleme, sonuç dosyası) + satır bazlı hata çıktısı; işlem senkron HTTP'de değil. Geri alma yok; güvence "yedek al" tavsiyesi (Shopify).

**Ortak kalıplar.** Asenkron iş modeli; satır bazlı sonuç/hata; tamamlanma bildirimi; eşzamanlılık sınırı; dosya boyutu sınırı; kısmi başarı semantiği ("hepsi ya da hiçbiri" değil).

**Tuzaklar.** İptal/geri alma yokluğu; boş hücreyle veri silme; sonuç dosyasının süresi dolması; kısmi başarıda kullanıcıya "ne oldu" açıklanmaması; pazaryeri oran sınırları (Trendyol fiyat güncellemesinde barkod başına 30 istek/dk, A) toplu işlemi yavaşlatır.

**ENTEGRASYONİK KARARI (Y-07)**
- **BENİMSE:** asenkron iş modeli + satır bazlı hata dosyası + `ImportLogList` iş izleme; tenant başına aynı tür için tek aktif toplu iş (pazaryeri oran sınırlarına saygı).
- **UYARLA (doğrulama önizlemesi):** dosya → tam doğrulama → "X satır geçerli, Y hatalı, Z ürün/fiyat/stok değişecek" özeti (fark önizleme) → kullanıcı onayı → uygulama. Shopify'ın önizlemesi ince; bizde stok/fiyat etkisi görünür olmalı (kimlik #1, #2).
- **UYARLA (stok değişikliği):** toplu içe aktarmada stok değişimi `StockAllocator`/hareket günlüğü üzerinden delta + referans (iş kimliği) ile yapılır (Shopify `referenceDocumentUri` deseni, Konu 7); doğrudan alan üzerine yazma yok.
- **UYARLA (geri alma):** Shopify sunmuyor; biz "önceki değer" görüntüsü (before-image) saklayıp yalnız fiyat/stok/durum alanları için 7 gün "işlemi geri al" sunmayı öneriyoruz (Y-07 kabul kriterindeki "geri alınabilir" ile uyumlu). Stok geri alma = ters delta. Süre ÖNERİ, karar insan.
- **REDDET:** "boş hücre = boşalt" semantiği (Shopify tuzağı): bizde boş hücre "değiştirme"dir; boşaltma açık işaretle (ör. `#SIL`). "Başladıktan sonra iptal edilemez" modeli reddedilir; en azından kuyruktaki iş iptal edilebilir.

---

### Konu 7 — Stok/sipariş tutarlılığı ve aşırı satış önleme (ADR-0004 karşılaştırması)

**Kaynak tablosu**

| Ürün / kaynak | Ne yapıyor | Kaynak | Etiket |
|---|---|---|---|
| Shopify Admin API envanter | Durumlar: incoming, on_hand, available, committed, reserved, damaged, safety_stock, quality_control; `committed` API ile değiştirilemez (siparişler yönetir); değişiklik delta (`inventoryAdjustQuantities`) veya mutlak (`inventorySetQuantities`); her değişiklik `referenceDocumentUri` ile kaynağı işaretler | https://shopify.dev/docs/apps/build/orders-fulfillment/inventory-management-apps | A |
| Shopify mühendislik | Rezervasyonlar Redis'ten MySQL'e taşındı; rezervasyon + envanter defteri AYNI veritabanında tek atomik işlemde (ACID); Redis+DB ikili sistemi "ödeme başarılı ama stok alınmadı" hata modları doğuruyordu; ölçeğe özgü çözüm: birim başına satır + `SKIP LOCKED`; asıl darboğaz bağlantı tükenmesiydi. (Belgede TTL/idempotency/mutabakat ayrıntısı YOK) | https://shopify.engineering/scaling-inventory-reservations | A |
| Medusa | InventoryLevel: `stocked_quantity`, `reserved_quantity`, `incoming_quantity`; sipariş verilince her kalem için rezervasyon öğesi (ReservationItem) | https://docs.medusajs.com/resources/commerce-modules/inventory/concepts | A |
| Stripe Ledger | Değişmez olay günlüğü (silinmez/değişmez, geçmiş durum yeniden kurulabilir), durum makinesi, çift kayıt; veri kalitesi üç ekseni: clearing (temizlenme), timeliness (zamanında gelme), completeness (eksiksizlik); basit sorgularla "temizlenmemiş bakiye" anomalisi bulunur | https://stripe.dev/blog/ledger-stripe-system-for-tracking-and-validating-money-movement | A |
| Shopify webhook kılavuzu | Webhook teslimi garantili değil; periyodik mutabakat işi yaz (`updated_at` filtresiyle) | https://shopify.dev/docs/apps/build/webhooks/best-practices | A |
| Linnworks (pazarlama iddiası, mühendislik gerçeği DEĞİL) | Kanal başına tampon, kanal başına stok ayırma, eşik altında ilanı otomatik kapatma, "10 dakikadan kısa senkron" | https://www.linnworks.com/features/inventory-management/ | A (pazarlama) |
| Trendyol changelog | 02.09.2026 (15:29–16:01) ve 08.09.2026 (14:00–15:34) sipariş servisi kesintisi; "etkilenen zaman aralığını yeniden sorgula" | https://developers.trendyol.com/v2.0/changelog/changelog | A |

**İzlenen yol.** Olgun sistemler stoku "tek sayı" değil, adlandırılmış durumlar (available/committed/reserved/safety_stock) olarak modelliyor; değişiklikleri referanslı delta olarak kaydediyor; rezervasyon ve defter aynı işlemsel sınırda; webhook/yoklama eksikliğini mutabakat kapatıyor.

**ADR-0004 (BACKLOG C8 özeti) ile karşılaştırma**

| Boyut | Sektör | ADR-0004 (bugün) | Değerlendirme |
|---|---|---|---|
| Rezervasyon atomikliği | Shopify: rezervasyon+defter aynı DB, tek işlem | `StockAllocator` reserve/commit/release/restock TEK doküman atomik `findOneAndUpdate`, idempotent anahtar, terminal durum geri dönüşsüz; 50 paralel/10 stok kanıtı | UYUMLU. Shopify'ın "ikili sistem hata modları" dersi Redis kullanmayan Mongo tasarımımızı destekler. |
| Adlandırılmış durumlar | on_hand/available/committed/reserved/safety_stock | `stock`, `reserved`, `allocations[]`, tampon politika olarak yayın anında | UYUMLU; `safety_stock` Shopify'da birinci sınıf durum — bizde politika. Y-09 ekranı `available / reserved / tampon` üçlüsünü göstermeli. |
| Değişikliğin kaynağı (referans belge) | Her ayar `referenceDocumentUri` ile işaretli | `allocations[]` içinde anahtar/durum/zaman; manuel düzeltme, içe aktarma, iade restock için AYRI değişmez günlük tanımı bu oturumda görülmedi | **BOŞLUK (öneri):** append-only `StockMovements` (delta, neden, referans, aktör, zaman). Aynı zamanda benchmark'taki "stok hareketi raporu (kaynağıyla)" (G4) ve denetim ihtiyacını karşılar. |
| Gömülü dizi büyümesi | Shopify birim başına satır (ölçek sorunu) | `allocations[]` varyant dokümanında (çoklu anahtarlı indeks) | **RİSK SORUSU (doğrulanamadı):** terminal durumdaki allocation'ların sonsuz birikmesi doküman boyutunu/indeksini büyütür; terminal kayıtların hareket günlüğüne taşınıp dokümandan sıkıştırılması düşünülmeli. MongoDB doküman sınırı bu oturumda kaynakla teyit edilmedi. |
| Mutabakat | Shopify: mutabakat şart; Stripe Ledger: clearing/timeliness/completeness | `InternalReconciliationJob` (saatlik), `ExternalReconciliationJob` (günlük; `lastPublishedQty` karşılaştırması → `stockDirty`) | UYUMLU. **İyileştirme:** sonuçları ölçülür üç göstergeye bağla: (clearing) temizlenmemiş OVERSOLD sayısı, (timeliness) `stockDirty` en eski yaş / yayın gecikmesi, (completeness) UNMAPPED oranı ve kanalda eşleşmeyen SKU oranı. ADR-0017 metrikleri. |
| Sipariş tarafı kesintiler | Trendyol: kesinti sonrası aralığı yeniden sorgula | Sipariş imleci `syncStartAt−5dk`, YALNIZCA başarıda ilerler (ADR-0005 A) | UYUMLU. **Dikkat:** Trendyol getShipmentPackages penceresi ≤2 hafta, ≤200/sayfa, sayfa 0–49 (10.000 sınırı), son 1 ay; büyük aralıklar Stream servisinden (son 3 ay). Uzun kesinti sonrası geriye dönük tarama pencerelere bölünmeli — koddaki sayfalama bu sınırlara göre doğrulanmadı (Konu 11). |
| Sayısal sözler | Linnworks "10 dk" pazarlama | 30 sn debounce + pazaryeri batch gecikmesi | Sayısal söz VERME (kimlik #1); arayüzde SKU×kanal "son yayın zamanı" göster (`lastPublishedAt` zaten var). |

**ENTEGRASYONİK KARARI**
- **BENİMSE:** ADR-0004'ün mevcut çekirdeği (tek-belge atomik rezervasyon, idempotent anahtar, telafi, mutabakat) — sektör kanıtıyla tutarlı, değişiklik gerekmez.
- **UYARLA (öneri, ADR-0004 eki):** append-only `StockMovements` günlüğü; rezervasyon durum makinesi aynen kalır, yalnız hareketler yan kayıt olarak tutulur (tam olay kaynaklı yeniden yazım YOK). Hedef aşama: Y-09/Y-07/Y-19 ile birlikte.
- **UYARLA:** mutabakat çıktıları için üç gösterge (clearing/timeliness/completeness) — ADR-0017.
- **UYARLA:** uzun kesinti sonrası sipariş "boşluk doldurma" işi: Trendyol pencere sınırlarına uygun (≤2 hafta dilim, sayfa ≤49, gerekirse stream) — ADR-0005 devamı.
- **REDDET:** Shopify'ın birim başına satır + `SKIP LOCKED` şeması (kendi ölçeklerine özgü; bizde tek-doküman atomik yeterli, bugün ~1 aktif tenant); Redis tabanlı rezervasyon (Shopify'ın vazgeçtiği yol); tam olay kaynaklı stok (aşırı mühendislik).

---

### Konu 8 — SaaS uygulama kabuğu ve kurumsal-premium UX kalıpları

**Kaynak tablosu**

| Kaynak | Ne söylüyor | URL | Etiket |
|---|---|---|---|
| Linear özel görünümler | "Kalıcı filtreli görünümler; kaydet ve paylaş"; sahip alanı, çalışma alanı/takım kapsamı, favori (kenar çubuğu), varsayılan açılış sayfası olarak ayarlanabilir; paylaşım bağlantısı erişim vermez | https://linear.app/docs/custom-views | A |
| Linear komut menüsü | Ctrl/Cmd+K ile her eylem ve hedef, bağlama duyarlı, kısayolu gösterir (arama özetleri) | https://maggieappleton.com/command-bar (kavramsal, C) · Linear kısayol sayfaları (arama sonucu, C) | B/C |
| Primer kalıpları | Degraded experiences ("sorunu gizleme, kullanıcıyı kılavuzla; hata ≠ boş; kullanılamayan sayıları gizle, sıfır gösterme; sayfada ≤5 kesinti mesajı"), empty states, loading, saving ("değişikliği doğru, hızlı ve belirgin göster"), progressive disclosure, feature onboarding | https://primer.style/product/ui-patterns/ · https://primer.style/product/ui-patterns/degraded-experiences/ | A |
| Atlassian hareket | Amaçlı, yalnız netleştirir; etkileşim 50–150 ms, geçiş 150–400 ms; reduced-motion = hareket kapalı ve ANINDA; iş akışını bloklama, aynı anda yarışan animasyon yok | https://atlassian.design/foundations/motion | A |
| Stripe renk sistemi | CIELAB algısal düzgün uzay; kontrast açık/koyu seviye farkıyla garanti (küçük metin için ≥5 basamak) | https://stripe.com/blog/accessible-color-systems | A |
| Vercel gezinme | Yeniden boyutlandırılabilir/gizlenebilir kenar çubuğu, takım/proje düzeyinde tutarlı sekmeler, mobilde alt çubuk | https://vercel.com/changelog/dashboard-navigation-redesign-rollout | B |
| Stripe Dashboard (tablo-öncelikli, yoğun tablo, sağa hizalı tabular sayılar, durum çipi) | Üçüncü taraf analizler; Stripe kendi yazısı bu oturumda bulunamadı | https://www.925studios.co/blog/stripe-dashboard-design-breakdown | C |
| Polaris | Artık web bileşenleri tabanlı birleşik çerçeve; desen sayfaları (ayarlar, indeks tablosu, boş durum) çekilemedi | https://shopify.dev/docs/api/polaris | A (kısmi) / doğrulanamadı |
| Carbon (durum göstergesi, boş durum) | Sayfalar çekildiğinde içerik boş döndü | — | doğrulanamadı |

**İzlenen yol.** Olgun yönetim panelleri tablo-merkezli, yoğun bilgi + ilerlemeli açma; hareket bilgi taşır, süs değildir; hata/boş/yükleniyor durumları ayrı ve tutarlı; kayıtlı görünüm ve komut paleti uzman kullanıcıyı hızlandırır.

**Ortak kalıplar.** Kısa (≤400 ms) amaçlı hareket, reduced-motion'da kapalı; degrade durum ayrı bileşen; kayıtlı filtre görünümleri; komut paleti = gezinme + eylem; token'lı tasarım sistemi.

**Tuzaklar.** "Hoplama/zıplama" hareketi; hata=sıfır görünümü (bizde T4h'de tespit edilen bulgu); renkle tek başına durum; her şeyi kayıtlı görünüm/özelleştirme yapmak.

**ENTEGRASYONİK KARARI (ADR-0015, ADR-0011/0012 ile uyumlu)**
- **BENİMSE:** Atlassian hareket sınırları ADR-0011 hareket kuralıyla (150–300 ms token aralığı, zıplama yok, reduced-motion) zaten örtüşüyor; ek iş yok, doğrulama notu olarak kalır. Stripe'ın "kontrast açık-koyu basamağından türetilir" ilkesi token testlerimizin (`content-*` WCAG AA kontrast testi) yönünü destekler.
- **BENİMSE:** tek `DegradedState` deseni (Primer): sayfa düzeyi banner + panel için "uyarı ikonlu boş-hata kartı" + kullanılamayan sayıyı "—" göster, "0" gösterme; `EmptyState` (ilk kullanım) ile ayrı bileşen. BACKLOG T4h madde 1 ile doğrudan ilgili.
- **UYARLA (komut paleti):** ilk sürümde YALNIZ gezinme + arama (`SmartService.unifiedSearch` var; hedef listesi `navigation/screens.ts` kayıt defterinden üretilir — ADR-0012). Eylem komutları (sipariş onayla vb.) sonra; yıkıcı eylem paletten yapılmaz. Görsel: kısayol ipucu gösterir (Linear kalıbı).
- **UYARLA (kayıtlı görünümler):** ADR-0012'deki "izinli, PII'siz URL parametreleri" = görünüm tanımı; ilk sürüm KİŞİSEL görünüm (kullanıcı+tenant kapsamlı); paylaşım (sahip alanı ile) sonraya. Sipariş/ürün/hata kutusu listelerinde.
- **UYARLA (ayarlar mimarisi — kaynak kısmi, tasarım bizim):** iki ayrı kapsam: "Hesap" (kişisel: profil, bildirim tercihleri, güvenlik/2FA — Linear'da Settings>Account>Notifications yolu A kaynaklı) ve "Çalışma alanı/Mağaza" (entegrasyonlar, stok politikası, ekip/yetki, API anahtarları, abonelik, KVKK/veri). Bugünkü `SettingListView` bu iki kapsamı ayırmıyor (doğrulanamadı; kod okunmadı).
- **UYARLA (durum çipi):** durum yalnız renkle değil ikon+metinle (WCAG 1.4.1 bilinen ölçüt; bu oturumda çekilmedi). Tabloda sağa hizalı tabular sayılar (kaynak C, düşük ağırlık).
- **REDDET:** Vercel'in yeniden boyutlandırılabilir kenar çubuğu/mobil alt çubuğu (ADR-0012 sekmeli çalışma alanı kararı verilmiş); kullanıcı dark-mode anahtarını sayısal kapı olmadan açmak (ADR-0011 kapısı korunur); Notion tarzı blok/çalışma alanı özelleştirme; Stripe Workbench benzeri geliştirici konsolu (v1 için aşırı). Onboarding: Primer "feature onboarding" yalnız başlık düzeyinde doğrulandı; Y-22 kabul kriteri (5 adımlı, atlanabilir, ilerleme durumlu kontrol listesi) korunur, animasyonlu tur/overlay eklenmez (kimlik #4; kaynak doğrulanamadı, tasarım tercihi).

---

### Konu 9 — Faturalama/plan/kota/dunning (ADR-0008 karşılaştırması)

**Kaynak tablosu**

| Kaynak | Ne söylüyor | URL | Etiket |
|---|---|---|---|
| Stripe abonelik yaşam döngüsü | Durumlar: trialing ("erişimi sağlamak güvenli"), active, incomplete (23 saat), incomplete_expired, past_due (başarısız ödeme, deneme sürebilir), unpaid ("erişimi kaldır"), canceled (terminal), paused (deneme ödeme yöntemi olmadan bitti, `missing_payment_method=pause`); son denemeden sonra canceled/unpaid/past_due seçilebilir; durum geçişlerini webhook'la izle; gecikmeli ödeme yöntemlerinde active'e doğrudan geçiş | https://docs.stripe.com/billing/subscriptions/overview | A |
| Stripe Entitlements | Ürüne bağlı özellikler; abonelik active olunca her özellik için etkin yetki (entitlement); yetkiler değişince `entitlements.active_entitlement_summary.updated` olayı | https://docs.stripe.com/billing/entitlements (yalnız indeks sayfası okundu) · arama özeti | B |
| Stripe Smart Retries | "Önerilen varsayılan 8 deneme / 2 hafta" (arama özeti) | https://stripe.com/ae/docs/billing/revenue-recovery/smart-retries | B |
| iyzico webhook | Başlık `X-IYZ-SIGNATURE-V3`, HMAC-SHA256 hex; eski v1/v2 kullanımdan kalktı; ilk bildirim 10–15 sn sonra, 2xx gelene kadar 15 dk'da bir, TOPLAM 3 deneme; abonelik olayları `subscription.order.success` ve `subscription.order.failure`; imza özelliği için iyzico'nun hesapta etkinleştirmesi gerekir | https://docs.iyzico.com/en/advanced/webhook | A |
| iyzico abonelik | Plan sıklıkları (günlük…yıllık); deneme süresi eklenebilir ve KART BİLGİSİ DENEME BAŞINDA SAKLANIR; başarısız yinelenen ödeme için `subscription/operation/retry` servisi (arama özeti) | https://docs.iyzico.com/en/products/subscription | A/B |
| Paddle | Sayfa yeniden yönlendirildi, içerik alınamadı | — | doğrulanamadı |

**İzlenen yol.** Faturalama durum makinesi + otomatik tahsilat yeniden denemesi + izin (entitlement) katmanı. Erişim kararı ayrı bir servis; ödeme sağlayıcısı olayları bu servise durumu besler.

**ADR-0008 (BACKLOG C16 özeti) ile karşılaştırma**

| Boyut | Sektör | ADR-0008 (bugün) | Değerlendirme |
|---|---|---|---|
| Erişim kararı ayrı servis | Stripe: durum + entitlement | `EntitlementService.computeAccess` saf fonksiyon, 6 durum × 3 boyut, 60 sn TTL önbellek, webhook'ta invalidate | UYUMLU (BENİMSE). |
| Durum kümesi | trialing/active/past_due/unpaid/canceled/paused… | trialing/active/past_due/suspended/canceled/expired | UYUMLU. `suspended` ≈ Stripe `unpaid`. Stripe `unpaid`'da erişimi KALDIRMAYI önerir; biz salt okunur bırakıyoruz — kimlik #3/#1 ile uyumlu ("kendi verisine erişim"). |
| Webhook + mutabakat | iyzico: yalnız 3 deneme, 2 abonelik olayı | Webhook idempotent; **günlük mutabakat işi açık kalem** | **YÜKSELT:** mutabakat "şart". Aksi hâlde kaçan `order.failure` tenant'ı yanlış "active" bırakır. |
| Deneme | iyzico: kart deneme başında saklanır; bizde 14 gün KARTSIZ deneme (ADR-0014/S4a) | Deneme `trialing` yerelde | **Çakışma:** iyzico aboneliğini deneme bitiminde/checkout'ta OLUŞTURMAK gerekir, sağlayıcı tarafı deneme kullanılamaz; iyzico'nun kartsız deneme desteği belgede YOK (doğrulanamadı). Karar insan + iyzico ile teyit. |
| Deneme bitişi | Stripe: ödeme yöntemi yoksa `paused` | `trialEndsAt` var; `suspended` geçiş işi AÇIK | İş açık kalem; Stripe `paused` semantiği bizim `suspended`e karşılık gelir. |
| Askıda motor davranışı | Stripe erişimi keser | Salt okunur (3 boyut matrisi; MOTOR boyutu içeriği bu oturumda görülmedi) | **DOĞRULA (critical adayı):** `suspended`/`past_due` durumunda IntegrationEngine ne yapıyor? Sipariş ALIMI ve stok YAYINI durursa, kanallar satmaya devam ettiği için aşırı satış oluşur ve telafi işi de çalışmaz. Öneri: askıda yeni özellik/ürün yayını kapalı; sipariş çekimi + stok yayını + telafi AÇIK (ya da açıkça belgelenmiş kısa grace). Matris ve `EntitlementService`'in Engine'e bağlanması (ADR-0008 açık kalemi) bu kararla birlikte ele alınmalı. |
| Özellik kapıları | Stripe: özellik anahtarı (feature key) → yetki | Plan limitleri + `limitOverrides` | UYARLA: `Plans.features[]` anahtar kataloğu (`api_access`, `automation`, `erp_write`, `reports`) + sayısal kota (kanal/kullanıcı/ürün); kapı kontrolü `has(featureKey)`. Benchmark §6'daki kademe yapısıyla uyumlu. |
| Yeniden deneme takvimi | Stripe Smart Retries (ML) / özel takvim | `graceUntil`, günlük mutabakat açık | UYARLA: basit sabit takvim (ör. 1, 3, 5, 7. gün + e-posta), iyzico retry servisiyle; ML tabanlı akıllı deneme REDDET. |

**ENTEGRASYONİK KARARI**
- **BENİMSE:** ADR-0008 mimarisi; sektör pratiğiyle tutarlı, yeniden yazım önerilmez.
- **UYARLA:** günlük sağlayıcı mutabakatı öncelik yükseltilir; `Plans.features[]` anahtar kataloğu; sabit dunning takvimi; kartsız deneme yerelde, iyzico aboneliği checkout'ta.
- **DOĞRULA:** `suspended` iken IntegrationEngine davranışı (yukarı). Bu "doğruluk" etkili olduğu için critical adayıdır; ADR-0008 matrisi okunmadan sınıflandırma kesinleşmemeli.
- **REDDET:** kullanım-bazlı (metered) faturalama; Paddle/MoR benzeri "kayıtlı satıcı" modeli (kaynak doğrulanamadı; Türkiye e-fatura/vergi etkisi insan/mali müşavir kararı); Stripe'ın ML tabanlı yeniden denemesi. SaaS'ın tenant'lara kendi e-faturasını nasıl keseceği bu belgenin kapsamı dışı ve doğrulanamadı.

---

### Konu 10 — Çok kiracılı güvenlik/uyum kalıpları

**Kaynak tablosu**

| Kaynak | Ne söylüyor | URL | Etiket |
|---|---|---|---|
| OWASP Multi-Tenant Security Cheat Sheet | Kiracı bağlamı sunucu-doğrulanmış kimlikten; istemci tenant kimliği yalnız seçici; kiracı her sorguda, önbellek anahtarında, depolama yolunda; arka plan işleri doğrulanmış kiracı bağlamı taşır ve tüketicide yeniden yetkilendirir; kiracıyı oran sınırı boyutu yap; yetki matrisini sistematik test et (üretimle aynı DB rolü/havuzu); reddedilen çapraz-kiracı erişimlerini kaydet ve alarm ver; ayrı veritabanı "en güçlü" izolasyon | https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html | A |
| AWS SaaS Lens | Kiracı kimliği enjekte eden ve başka kiracının belirtecini taklit eden izolasyon testleri | https://wa.aws.amazon.com/saas.question.REL_3.en.html (arama özeti) | B |
| GitHub denetim günlüğü | 180 gün saklama, yalnız kurum sahipleri, filtre (işlem/aktör/eylem/tarih), metin araması YOK, JSON/CSV dışa aktarma (≤100 MB/10 dk), 40+ olay kategorisi | https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-security-settings-for-your-organization/reviewing-the-audit-log-for-your-organization | A |
| WorkOS denetim günlüğü (satıcı belgesi) | Şema: action, actor, targets, context, occurred_at, metadata, version; değişmez; idempotency anahtarı; varsayılan 30 gün saklama (10 yıla kadar uzatılabilir), CSV/akış dışa aktarma | https://workos.com/docs/audit-logs | A (satıcı) |
| Stripe kısıtlı anahtar oluşturma | Oluşturma adımında iki faktörlü doğrulama isteniyor ("step-up") | https://docs.stripe.com/keys/restricted-api-keys | A |
| OWASP ASVS 5.0 | L2'de MFA; TOTP/kurtarma kodları tek kullanımlık; kurtarma kodu <112 bit entropi ise tuzlu özet; kimlik doğrulamada yeni oturum belirteci | https://github.com/OWASP/ASVS/blob/master/5.0/en/0x15-V6-Authentication.md (arama özeti) | B |
| KVKK — ilgili kişi hakları | Md. 11 hakları (işlenip işlenmediğini öğrenme, bilgi, düzeltme, silme/yok etme, üçüncü kişilere bildirim, itiraz, tazminat); başvuru veri sorumlusuna | https://www.kvkk.gov.tr/Icerik/2036/Ilgili-Kisinin-Haklari | A |
| KVKK — 30 gün yanıt, 72 saat ihlal bildirimi, imha ≤6 ay periyodik | Sayfada süre belirtilmemiş; süre bilgileri hukuk bürosu/özet kaynaklarından: başvuruya en geç 30 gün; Kurul 2019/10 kararıyla ihlalde 72 saat; veri işleyen ihlali veri sorumlusuna derhal bildirir; silme yönetmeliği periyodik imha ≤6 ay | https://hukukcularevi.com/kvkk-veri-ihlali-bildirim-72-saat-6698-12-madde/ (C) · https://www.kvkk.gov.tr/Icerik/5441/… yönetmelik (B, arama özeti) | C/B |

**İzlenen yol.** Kiracı bağlamı tek noktada sunucu-doğrulanır; her katmanda (sorgu, önbellek, depolama, iş kuyruğu) kiracıya bağlanır; izolasyon "test edilen bir sözleşme"dir; denetim günlüğü değişmez, kiracı-kapsamlı okunur, sınırlı saklanır; kimlik güvenliği 2FA/kurtarma kodu → duyarlı eylemde ek doğrulama → (sonra) SSO.

**Ortak kalıplar.** Sunucu-doğrulanmış kiracı; kiracıya duyarlı önbellek/iş/depolama; yetki matrisi testi; reddedilen çapraz-kiracı erişim günlüğü + alarm; denetim günlüğü şeması (kim/ne/hedef/bağlam/zaman/sürüm), filtreli ama serbest metin aramasız; dışa aktarma; saklama süresi belgeli.

**Tuzaklar.** Önbellek anahtarında kiracının olmaması (bizde C3 olarak yaşandı, kapandı); denetim günlüğünde kişisel veri birikmesi (KVKK saklama gerekçesi); 2FA'yı SSO'dan önce/sonra yanlış sırada koymak; test olmadan "izolasyon var" iddiası.

**ENTEGRASYONİK KARARI (ADR-0016, ADR-0017; Y-20, Y-21, Y-27)**
- **UYARLA (yetki matrisi testi — somut ve mevcut envantere oturuyor):** `OPERATION_POLICY` (151 operasyon) tablosu zaten var. Her operasyon için "A kiracısının belirteci + B kiracısına ait kimlik" çağrısının reddedildiğini doğrulayan otomatik test harness'ı (OWASP: yetki matrisini sistematik test et; AWS: kiracı kimliği enjeksiyon testi). C4 (IDOR) ve C3 (cache sızıntısı) sınıfı hataların yeniden ortaya çıkmasını yapısal olarak engeller. Kural: yeni operasyon bu testi geçmeden politika tablosuna girmez.
- **UYARLA:** reddedilen çapraz-kiracı erişimlerini `AuditLogs`'a ayrı olay olarak yaz + platformAdmin'e alarm (OWASP). `responseSanitizer` tetiklenmesi zaten hata sinyali; aynı hat.
- **UYARLA (denetim günlüğü):** şema `actor, action, targets, context(ip/userAgent), occurredAt, metadata(PII'siz), schemaVersion` (WorkOS alanları), değişmez (güncelleme ucu yok), kiracı-kapsamlı okuma (yalnız owner/admin), filtre (aktör/eylem/tarih) — serbest metin arama YOK (GitHub örneği), CSV dışa aktarma. Mevcut TTL 365 gün (GitHub 180, WorkOS 30 varsayılan) korunur; gerekçe belgelenir (KVKK: minimum saklama). Y-20 UI'ı.
- **BENİMSE (sıra):** önce isteğe bağlı sonra owner/admin için zorunlu TOTP + kurtarma kodları (Y-20); yüksek-güvenli eylemlerde (API anahtarı üretme/iptal, hesap silme talebi, plan değişikliği) yeniden doğrulama/2FA adımı (Stripe RAK örneği); SSO en sona (Y-27, P2). Kurtarma kodları özetli saklanır (ASVS, B).
- **UYARLA (KVKK talep akışı):** tenant kullanıcısının (Entegrasyonik'in veri sorumlusu olduğu kişi) talepleri için "başvuru kaydı": tarih, tür (erişim/silme/düzeltme), ilerleme, son yanıt tarihi sayacı (ÖNERİ: 30 gün; hukuki teyit gerekli). Tenant'ın müşterileri için Entegrasyonik veri işleyendir: `anonymizeCustomer` (C7) ve `TenantDataService` self-servis ekranları (Y-21) tenant'a araç verir; ihlalde "veri işleyen derhal bildirir" akışı için olay müdahale prosedürü (72 saat sayacı tenant/veri sorumlusu için). Rol ayrımı ve süreler hukuki yorumdur — bu belge hukuki görüş vermez; 30 gün/72 saat kaynakları C etiketlidir (resmi 6698/Kurul metni bu oturumda çekilemedi).
- **REDDET (şimdilik):** kiracı başına şifreleme anahtarı/KMS (ADR-0013 ertelendi, eşik 50 tenant; OWASP da "uyum gerektiriyorsa" diyor); log akış entegrasyonları/SIEM (WorkOS Log Stream benzeri) ilk sürümde.
- Not: DB-per-tenant zaten OWASP'ın "en güçlü" seçeneğidir (kimlik #3 ile uyumlu); risk uygulama katmanındaki bağlam karışmasındadır → yukarıdaki test matrisi.

---

### Konu 11 — Türkiye'ye özgü: pazaryeri API kırılganlıkları ve yerel entegratörler

Yalnızca doğrulanabilir resmi kaynaklar kullanıldı.

**Kaynak tablosu (Trendyol resmi belge/changelog, A)**

| Konu | Bulgu | URL | Etiket |
|---|---|---|---|
| Sipariş uç noktası V2 zorunlu | 30.07.2026 duyurusu: eski `.../integration/order/sellers/{sellerId}/orders` 15 Ekim 2026'da kapanıyor; yeni `.../v2/orders`; erişilebilir kayıt penceresi en fazla 10.000 (`maxQueryWindowResult`); duyuruya göre 15 Ekim'den itibaren eski uç 426 dönüyor (günde 3 kez 10 dk); belge sayfası 426'yı anmıyor, olası 429'a değiniyor (iç tutarsızlık, doğrulanamadı) | https://developers.trendyol.com/v2.0/changelog/changelog · https://developers.trendyol.com/v2.0/docs/get-order-packages-getshipmentpackages | A |
| getShipmentPackages sınırları | `size` ≤200, sayfa 0–49 güvenli; `startDate/endDate` en fazla 2 hafta; varsayılan 1 hafta; veri son 1 ay; büyük tarama için cursor tabanlı `getShipmentPackagesStream` (son 3 ay); 02.06.2026 duyurusu, 8 Haziran'dan itibaren; aşımda 429 | aynı sayfalar | A |
| Ürün V1→V2 | Ürün V2 servisleri Şubat 2026'da yayında; changelog: brownout 15 Eylül 2026'dan itibaren günde 3 kez 15 dk ("scheduled brownout" mesajı); bir arama özeti (B) V1'in 15 Ekim 2026'da tamamen kapatılacağını söylüyor — nihai kapanış tarihi iki kaynakta uyuşmuyor (doğrulanamadı) | changelog sayfası (A) · https://developers.trendyol.com/docs/2-authorization ile aynı portal | A/B |
| Menşe (origin) alanı | 23 Ekim 2026'dan itibaren ürün oluşturma/güncelleme (V1 ve V2) için zorunlu; öncesinde isteğe bağlı | changelog (A) | A |
| Yeni alan | 09.09.2026: gönderi paketleri ve webhook yanıtlarına `paymentMethod` | changelog | A |
| Kesintiler | 02.09.2026 ve 08.09.2026 sipariş servisi kesintileri; etkilenen aralığı yeniden sorgulama tavsiyesi | changelog | A |
| İade ret nedenleri | 23.09.2026: 6 eski kod kaldırıldı, 3 yeni, 8 açıklama güncellendi (iade/claim, sipariş iptal nedeni değil) | changelog | A |
| Oran sınırı | `2-authorization` sayfası: aynı uç noktaya 10 sn'de en fazla 50 istek, 51'inci 429 `too.many.requests`. `1-service-limitations` sayfası (14 Eylül 2026 itibarıyla): ürün servisleri liste hacmi kademesine göre dakika bazlı (ör. okuma 1000–2000/dk, yazma 200–600/dk, stok&fiyat yazma 350–2000/dk), fiyat güncellemesinde barkod başına 30/dk, iade onay/ret 5/dk, finans 100/dk; sipariş servisleri 30–1000/dk. İki sayfa aynı anda geçerli mi, hangisi baskın — doğrulanamadı | https://developers.trendyol.com/docs/2-authorization · https://developers.trendyol.com/v2.0/docs/1-service-limitations | A |
| Sipariş takibi | Paket durum güncellemesi `getShipmentPackages` veya Webhook servisinden alınabilir | https://developers.trendyol.com/docs/sipari%C5%9F-s%C3%BCreci-ak%C4%B1%C5%9F%C4%B1 | A |
| Hepsiburada | Hizmet Anahtarı (Service Key, 12 karakter) kimlik doğrulamaya eklendi; sipariş servislerine oran sınırı eklenecek; listeleme güncellemede kategori bazlı eşik (Ocak 2024 changelog, arama özeti; sayfa çekilemedi 403) | https://developers.hepsiburada.com/hepsiburada/changelog/ocak-2024-entegrasyon-g%C3%BCncellemeleri | B (eski) |
| N11 | REST ve SOAP belgeleri ve SOAP↔REST parametre eşlemesi var; resmi bir SOAP kapatma duyurusu bulunamadı; oran sınırı bilgisi geliştirici portalında bulunamadı | https://developer.n11.com/ · https://magazadestek.n11.com/satis-surecleri/restapi-siparis-listeleme-10413 | A/B |
| Yerel entegratörler (Dopigo, Sentos, Entegra…) | Kırılganlıkları nasıl yönettiklerine dair doğrulanabilir teknik kaynak (mühendislik yazısı, durum sayfası, changelog) bulunamadı; yalnız pazarlama sayfaları ("dakikalar içinde senkron") | benchmark §1 | doğrulanamadı |

**İzlenen yol.** Trendyol kırıcı değişiklikleri "brownout" ile deniyor (planlı, kısa süreli hata) ve kesinti sonrası "aralığı yeniden sorgula" diyor; yani sağlayıcı da olay+mutabakat bekliyor. Yerel rakiplerin çözümü doğrulanamadığından örnek alınacak "en iyi pratik" yok; Stripe/Shopify/GitHub'ın genel kalıpları geçerli.

**Ortak kalıplar.** Kırıcı değişiklik takvimi + brownout; sürümlü yeni uç (V2); kayıt penceresi sınırı + akış (stream) servisi; oran sınırı hacim kademesine bağlı; alan zorunluluğu tarihli.

**Tuzaklar.** DB'den gelen `settings.urls.*` ile kodda düzeltilen varsayılanın ezilmesi (C11'in "canlı yapılandırma doğrulanamadı" notu); iki farklı oran sınırı belgesi; sürüm değişikliklerinin tenant'lardan gizli kalması (bir tenant'ın kaybettiği sipariş görünmez).

**ENTEGRASYONİK KARARI**
- **CRITICAL ADAYI — hemen doğrula (17 gün kaldı):** (i) Trendyol sipariş URL'sinin canlı tenant ayarlarında `/v2/orders` olduğu (DB `settings.urls` override'ı); (ii) ürün export hattı (`ProductService` URL'leri DB ayarından geliyor, BACKLOG C11) V1 mi V2 mi kullanıyor — brownout 15 Eylül'den beri sürüyor olabilir; (iii) menşe (origin) alanının ürün payload'unda bulunması (23 Ekim); (iv) sipariş sayfalama ve geriye dönük tarama Trendyol pencere sınırlarına (≤2 hafta, sayfa ≤49, gerekirse stream) uygun mu; (v) `ResilientHttpClient` oran sınırı (`ratePerMin`) değerleri kademe tablosuna ve barkod başına 30/dk fiyat kuralına göre. Bunlar "doğruluk/veri bütünlüğü" olduğundan critical sınıfı gerekçelidir; kesin karar orkestratör/insan.
- **UYARLA:** "API sürüm takvimi": `INTEGRATIONS_REGISTRY.md`'ye her pazaryeri için kırıcı değişiklik tarihleri (kaynak URL ile) eklenir; brownout/426 yanıtı `IntegrationError` altında ayrı kod (ör. `API_DEPRECATED`, tenant'a değil platformAdmin'e alarm) — brownout yanıtının HTTP durum kodu belgede doğrulanamadı, mesaja bağlı tespit kırılgandır (bu nedenle "ÖNERİ, kod öncesi araştırma"). Haftalık changelog gözden geçirme insan süreci (otomatik kazıma yasal/teknik olarak doğrulanmadı).
- **BENİMSE:** istemci tarafı token bucket (Stripe önerisi A) + `Retry-After`/429'a saygı; mevcut `ResilientHttpClient` bu yönde.
- **BENİMSE:** kesinti sonrası "etkilenen aralığı yeniden sorgula" ilkesi = ADR-0005 imleç tasarımı (başarıda ilerler, −5 dk); pencere sınırlarına uygun boşluk doldurma (Konu 7).
- **REDDET:** yerel rakiplerin "dakikalar içinde senkron" gibi pazarlama iddialarını hedef/sözleşme olarak alma.

---

## (c) Kimlik süzgeci tablosu

Kısaltmalar: 0015 = uygulama görsel yenileme, 0016 = backend mimari, 0017 = izleme, 0008 = faturalama, 0004 = stok.

| # | Desen | Kaynak (etiket) | Karar | Entegrasyonik'e etkisi | ADR / aşama |
|---|---|---|---|---|---|
| 1 | Geçici/kalıcı hata sınıfı arayüzde; yalnız geçici otomatik denenir | Make, Zapier, Shopify Flow (A), Celigo (B) | BENİMSE | `IntegrationError.retryable` tenant'a "otomatik/müdahale gerekli" olarak yansır | 0017, Y-06 |
| 2 | Tenant "Hata kutusu": başarısız birimi tek/toplu yeniden oynat, çoğaltma uyarısı | Zapier (A), Workato (A), Celigo (B) | UYARLA (yalnız başarısız birim; idempotency olmadan düğme yok) | Export durum makinesi + BullMQ DLQ tek listede; saklama ÖNERİ 30 gün | 0017, Y-06 |
| 3 | Otomatik deneme sürerken sessiz, son başarısızlıkta tek bildirim + gruplama | Zapier (A), Linear (A) | UYARLA | Alarm yorgunluğu azalır; zorunlu kategoriler kapatılamaz | 0017, Y-06 |
| 4 | Bağlantı durumu makinesi + yeniden yetkilendirme gerekli + kurtarma bildirimi | Nango (A), Make (B) | BENİMSE | AUTH hatasında deneme durur, tek bildirim | 0017, 0015, Y-03 |
| 5 | Adaptör "Kapsam" beyanı (yetenek çipleri) | Primer degraded (A); rakiplerde yok (doğrulanamadı) | UYARLA | Ideasoft/Bizimhesap/N11 sınırları açık; pazarlama metnini sınırlar | 0015 |
| 6 | Make'in kimlik hatasında tüm zamanlamayı durdurması | Make (B) | REDDET (kanal bazlı duraklat) | Diğer kanallar stok yayınını sürdürür; oversell riski uyarısı | 0004, 0017 |
| 7 | Giden webhook: t+HMAC-SHA256, 5 dk tolerans, çift-sır penceresi, event-id dedupe | Stripe (A), GitHub (A), Standard Webhooks (A kısmi) | UYARLA (Standard Webhooks başlık adları, kendi uygulama) | Y-14 giden webhook; barındırılan servis yok | 0016, Y-14 |
| 8 | "Thin" olay gövdesi (yalnız kimlikler) | Stripe (A); KVKK gerekçesi bizim | UYARLA | PII webhook'a itilmez | 0016, Y-14 |
| 9 | `Idempotency-Key` (POST, ≥24 sa saklama) | Stripe (A) | BENİMSE | Genel API yazma güvenliği; `StockAllocator` felsefesi | 0016, Y-14 |
| 10 | Kapsamlı API anahtarı (none/read/write), bir kez gösterim, 7 gün çift geçerlilik, hizmet başına anahtar | Stripe (A) | BENİMSE | Y-14 anahtar yönetimi; oluşturma yüksek-güvenli eylem | 0016, Y-14 |
| 11 | Sürümleme: URL major + yalnız-ek + Deprecation/Sunset + ≥12 ay | GitHub (A), Shopify (A) | UYARLA | Tarih-başlıklı hesap-sabitli sürüm kurulmaz | 0016, Y-14 |
| 12 | Hesap-sabitli tarih tabanlı API sürümü | Stripe (A) | REDDET | Dönüşüm katmanı yükü; aşırı mühendislik | — |
| 13 | Oran sınırı başlıkları + `Retry-After`; kiracı boyutlu sınır | GitHub (A), OWASP (A), Stripe (A) | BENİMSE | Tenant başına + anahtar başına | 0016, Y-14 |
| 14 | Teslimat günlüğü + elle yeniden gönder | Stripe (A) | BENİMSE | Tenant webhook hata ayıklama | 0016, 0015 |
| 15 | Kural motoru v1: kapalı katalog, tek seviye VE, kuru çalıştırma, çalışma günlüğü | Shopify Flow (A/B), Zapier (A) | UYARLA | Y-15 v1 kapsamı | 0016, Y-15 |
| 16 | Döngü koruması (derinlik=1, tavanlar, otomatik duraklat) | Zapier belgesi sorunu gösterir (A); çözüm bizim | UYARLA | Kaynak=kural işareti | 0016, Y-15 |
| 17 | Stok politikası kural motoruna AÇILMAZ | Kimlik #2 (kaynak: yok, tasarım kararı) | BENİMSE | Deterministik `stockPolicy` korunur | 0004, Y-15 |
| 18 | Görsel akış tasarımcısı / dallanma / bekleme / keyfi HTTP eylemi | Zapier/Make/n8n | REDDET | Kimlik #4/#5, SSRF | — |
| 19 | Bildirim: gelen kutusu birincil, e-posta özet + yalnız okunmamışsa | Linear (A) | BENİMSE | `MailService` bağlanmadan e-posta iddiası yok | 0017, Y-06, Y-05 |
| 20 | Kategori × kanal tercih matrisi, zorunlu kategoriler kapatılamaz | Linear (A), Primer (A) | UYARLA | Kimlik hatası/OVERSOLD/faturalama/güvenlik susturulamaz | 0017, 0015 |
| 21 | SMS/push/Slack ve barındırılan bildirim servisi | Novu (doğrulanamadı) | REDDET (ilk sürüm) | Kimlik #7 | — |
| 22 | Toplu iş: asenkron, satır bazlı hata dosyası, doğrulama önizlemesi | Shopify bulk (A) | UYARLA (fark önizleme + onay) | Y-07 | 0016, 0015, Y-07 |
| 23 | Toplu iş geri alma (before-image, 7 gün) | Shopify'da yok; kendi tasarımımız | UYARLA | Stok geri alma = ters delta | 0004, Y-07 |
| 24 | CSV "boş hücre = boşalt" ve "iptal edilemez" | Shopify (A) | REDDET | Boş = değiştirme; kuyruktaki iş iptal edilebilir | — |
| 25 | Stok hareket günlüğü (append-only, referans belgeli) | Shopify `referenceDocumentUri` (A), Stripe Ledger (A) | UYARLA | `StockMovements`; stok hareketi raporu ve denetim | 0004 eki, Y-07/Y-09/Y-19 |
| 26 | Mutabakatı clearing/timeliness/completeness ile ölç | Stripe Ledger (A) | UYARLA | ADR-0004 mutabakat işleri ölçülür göstergeye bağlanır | 0017, 0004 |
| 27 | Webhook/yoklama + periyodik mutabakat birlikte | Shopify (A), GitHub (A), Trendyol changelog (A), iyzico (A) | BENİMSE (zaten var) | ADR-0004/0005 doğrulanır | 0004, 0005, 0008 |
| 28 | Rezervasyon+defter aynı DB'de atomik (Redis'ten vazgeçme) | Shopify mühendislik (A) | BENİMSE (destekler) | Mongo tek-doküman atomik tasarım doğrulanır | 0004 |
| 29 | Birim başına satır + SKIP LOCKED; Redis rezervasyon; tam event sourcing | Shopify (A) | REDDET | Ölçeğe özgü/aşırı mühendislik | — |
| 30 | Faturalama durum makinesi + ayrı entitlement servisi | Stripe (A/B) | BENİMSE | ADR-0008 mimarisi doğrulanır | 0008 |
| 31 | iyzico webhook v3 imza + 3 deneme → günlük mutabakat şart | iyzico (A) | UYARLA (açık kalem şart'a yükselir) | Kaçan `order.failure` riski | 0008 |
| 32 | Kartsız deneme yerelde, iyzico aboneliği checkout'ta | iyzico abonelik (A) | UYARLA (iyzico ile teyit) | Sağlayıcı denemesi kart ister | 0008 |
| 33 | Askıda IntegrationEngine davranışı (sipariş+stok yayını açık) | Stripe `unpaid` = erişimi kes (A); bizim kimlikle çelişir | DOĞRULA / UYARLA | Aşırı satış/telafi durmamalı | 0008, 0004 |
| 34 | `Plans.features[]` özellik anahtarı + kota | Stripe entitlements (B) | UYARLA | Kademe kapıları (`api_access`, `automation`…) | 0008 |
| 35 | ML tabanlı dunning, kullanım-bazlı faturalama, MoR | Stripe (B), Paddle (doğrulanamadı) | REDDET | Sabit takvim; plan tabanlı | — |
| 36 | Komut paleti (yalnız gezinme+arama, `screens.ts`'ten) | Linear (B/C) | UYARLA | Eylem komutları sonra; yıkıcı eylem yok | 0015 |
| 37 | Kayıtlı görünümler (URL parametreli, kişisel) | Linear (A) | UYARLA | Paylaşım sonraya | 0015 |
| 38 | Tek `DegradedState`; hata≠boş; kullanılamayan sayı "—" | Primer (A) | BENİMSE | T4h hata=sıfır bulgusunu kapatır | 0015 |
| 39 | Hareket: 50–150/150–400 ms, reduced-motion=anında kapalı | Atlassian (A) | BENİMSE (zaten uyumlu) | ADR-0011 kuralı doğrulanır | 0015 |
| 40 | Ayarlar: Hesap vs Çalışma alanı ayrımı | Linear (A, kısmi) | UYARLA | Kişisel/çalışma alanı kapsamı ayrılır | 0015 |
| 41 | Vercel yeniden boyutlanır kenar çubuğu/alt çubuk; Notion özelleştirme; Workbench | Vercel (B) | REDDET | ADR-0012 kararlı | — |
| 42 | Yetki matrisi testi (151 op × 2 tenant) + reddedilen çapraz-kiracı günlüğü/alarm | OWASP (A), AWS (B) | UYARLA | C3/C4 sınıfı hataları yapısal engeller | 0016, 0017 |
| 43 | Denetim günlüğü şeması (WorkOS alanları), değişmez, filtreli, CSV | GitHub (A), WorkOS (A) | UYARLA | Y-20 UI; TTL 365 gerekçelendirilir | 0017, Y-20 |
| 44 | 2FA(TOTP) → yüksek-güvenli eylemde adım-yükseltme → SSO sırası | Stripe RAK (A), ASVS (B) | BENİMSE | Y-20 sonra Y-27 | 0016, Y-20 |
| 45 | KVKK talep kaydı + süre sayacı | KVKK (A hak listesi; süreler C) | UYARLA (hukuki teyit gerekli) | Y-21 self-servis + kayıt | 0016, Y-21 |
| 46 | Tenant başına şifreleme anahtarı, SIEM/log akışı | OWASP (A), WorkOS (A) | REDDET (şimdilik) | ADR-0013 ertelemesi | — |
| 47 | Pazaryeri API sürüm takvimi + brownout/426 tespiti | Trendyol changelog (A) | UYARLA | REGISTRY tarih kaydı; `API_DEPRECATED` ÖNERİ | 0017, INTEGRATIONS_REGISTRY |
| 48 | Trendyol pencere/oran sınırlarına uygun sayfalama ve token bucket | Trendyol (A), Stripe (A) | BENİMSE | Doğrulama gerektirir (critical adayı) | 0005/0004, C11 |
| 49 | Herkese açık durum sayfası | Linnworks (B, benchmark) | REDDET (şimdilik; Y-28 P2) | `/health`'ten üretilir, barındırılan servis yok | — |
| 50 | Pazarlama sayısal sözleri ("<10 dk senkron") | Linnworks (A, pazarlama) | REDDET | "Son yayın zamanı" gösterilir, süre sözü yok | 0015 |

---

## (d) Bilinçli REDDEDİLENLER ve nedeni

Kimlik çatışması (K) veya aşırı mühendislik (A) gerekçesiyle:

| Reddedilen | Neden | Tür |
|---|---|---|
| Celigo tarzı hata atama/etiketleme/iş birliği | Küçük ekip ölçeği; "sakin, tek amaçlı ekran" | A/K#4 |
| n8n/Zapier tarzı kullanıcı tanımlı hata iş akışları, görsel akış tasarımcısı, dallanma/bekleme/keyfi HTTP-kod adımı | Kural motoru v1 kapsamını aşar; SSRF; kimlik #4/#5 | A/K |
| Make'in kimlik hatasında tüm zamanlamayı durdurması | Diğer kanalların stok yayınını da durdurup aşırı satış riskini artırır | K#2 |
| Stripe hesap-sabitli tarih tabanlı API sürümleri | Sürüm başına dönüşüm katmanı; modüler monolit + küçük ekip için aşırı | A |
| Stripe ML tabanlı Smart Retries, metered faturalama, Paddle/MoR modeli | Plan tabanlı yıllık kademeli TR pazar yapısı; MoR doğrulanamadı; vergi/e-fatura insan kararı | A/K#6 |
| Shopify birim başına satır + `SKIP LOCKED`, Redis rezervasyon, tam olay kaynaklı stok | Kendi ölçeklerine özgü; Mongo tek-doküman atomik yeterli ve kanıtlı | A |
| Shopify "boş hücre üzerine yaz" ve "başladıktan sonra iptal edilemez" içe aktarma | Veri kaybı riski; dürüstlük/doğruluk | K#1/#2 |
| Barındırılan (ücretli) Svix/Novu/Statuspage/SIEM servisleri | 3. parti ücretli hesap açma insan kararı; kendi kendine yeten çözüm varsayılan | K#7 |
| SMS/push/Slack ilk sürümde | Ücretli/dış bağımlılık | K#7 |
| Vercel kenar çubuğu/alt çubuk, Notion özelleştirme, Workbench, kapısız kullanıcı dark-mode | ADR-0012/0011 kararları; görsel bütünlük | K#4 |
| Kiracı başına şifreleme anahtarı/KMS ve log akışı ilk sürümde | ADR-0013 ertelemesi; eşik 50 tenant | A |
| Linnworks tarzı sayısal senkron sözü, pazarlama dili | Gerçekten ölçülmeyen sayı vaadi | K#1 |
| Herkese açık durum sayfası şimdi | P2 (Y-28); `/health`'ten sonra | A |

---

## (e) Doğrulanamayanlar

- **ADR dosyaları:** `docs/adr/0004-*`, `0008-*` açılamadı; karşılaştırmalar BACKLOG C8/C16 özetlerine dayanır. ADR-0008'in izin matrisinde IntegrationEngine/sipariş-alımı/stok-yayını boyutunun ne olduğu ve `allocations[]` sıkıştırma/saklama politikası okunmadı.
- **Kodu okunmadı:** Trendyol ürün export URL'lerinin V1/V2 durumu, `OrderConnector` sayfalama sınırları, `ResilientHttpClient` `ratePerMin` değerleri, `SettingListView` ayarlar yapısı; bunlar önerilerin "doğrula" maddeleridir.
- **Celigo** belge sayfaları 403 döndü (arama özeti kullanıldı, B). **Shopify Flow** limit sayfası limit verisi içermiyordu; çalışma kaydı 14 gün saklama arama özeti (B). **n8n** saklama/varsayılan bilgileri alınmadı.
- **Novu digest, Carbon (durum göstergesi/boş durum), Polaris desen sayfaları, Paddle, IETF RateLimit başlık taslağı, Linnworks/Feedonomics içe aktarma belgeleri** çekilemedi veya bulunamadı.
- **OTel çok kiracılı öznitelik standardı:** resmi OTel kaynağı bulunamadı; yalnız satıcı blogları (C).
- **Stripe Dashboard tablo/komut paleti tasarımı:** Stripe'ın kendi yazısı bulunamadı; yalnız üçüncü taraf analiz (C). Linear komut menüsü resmi belge sayfası bulunamadı (arama özetleri B/C).
- **KVKK:** resmi `ilgili kişinin hakları` sayfası hak listesini verdi, ancak 30 günlük yanıt süresi o sayfada yoktu; 30 gün ve 72 saat (Kurul 2019/10) bilgileri hukuk bürosu/özet kaynaklarından (C/B). Veri işleyen/veri sorumlusu rol ayrımı hukuki yorumdur; bu belge görüş vermez.
- **Trendyol:** (i) `2-authorization` (50 istek/10 sn/uç nokta) ile `1-service-limitations` (kademe/dk) sayfalarının hangisinin baskın olduğu; (ii) Ürün V1 nihai kapanış tarihi (changelog: 15 Eylül'de brownout başlar; arama özeti: 15 Ekim'de tamamen kapanır); (iii) brownout yanıtının HTTP durum kodu; (iv) eski sipariş uç noktasında 426 kodu (changelog anıyor, belge sayfası anmıyor); (v) webhook oluşturma sayfası 404 döndü (kimlik doğrulama türleri/yeniden deneme bu oturumda okunamadı; önceki tur `docs/research/2026-09-27-api-verification.md` içinde).
- **Hepsiburada:** yalnız Ocak 2024 changelog özeti (B); güncel oran sınırı doğrulanamadı. **N11:** oran sınırı ve SOAP kapatma tarihi bulunamadı.
- **Yerel entegratörlerin (Dopigo, Sentos, Entegra) kırılganlık çözümleri:** doğrulanabilir teknik kaynak yok.
- **iyzico:** kartsız deneme desteği, abonelik yükseltme/düşürme, iptal ve yeniden deneme kuralları (yalnız `subscription/operation/retry` arama özeti), sandbox varlığı belgeden doğrulanamadı.
- **MongoDB doküman boyutu sınırı** ve `allocations[]` büyümesinin pratik etkisi bu oturumda kaynakla teyit edilmedi (risk sorusu olarak işaretli).

---

## 8. BACKLOG için öneriler (BACKLOG.md güncellenmedi; orkestratör karar verir)

Format: açıklama · gerekçe/kaynak · önerilen sınıf.

| # | Öneri | Gerekçe/kaynak | Sınıf |
|---|---|---|---|
| B1 | Trendyol 15 Ekim 2026 eski sipariş uç kapanışı + Ürün V1 brownout + menşe zorunluluğu (23 Ekim) için canlı tenant ayarı ve export payload doğrulaması | Trendyol changelog (A) | **critical** (doğruluk/veri bütünlüğü; tarih 17 gün sonra) |
| B2 | Sipariş sayfalama/geriye dönük tarama Trendyol pencere sınırlarına (≤2 hafta, sayfa ≤49, Stream) uyumu; `ratePerMin` kademe/barkod-başı 30/dk kontrolü | Trendyol getShipmentPackages + service-limitations (A) | planned (B1 ile birlikte doğrulanırsa critical'e yükselebilir) |
| B3 | `suspended`/`past_due` iken IntegrationEngine'in sipariş alımı/stok yayını/telafi davranışının ADR-0008 matrisiyle netleştirilmesi | Stripe `unpaid` = erişimi kes (A) ile kimlik çatışması | planned (aşırı satış etkisi netleşirse critical) |
| B4 | iyzico günlük mutabakat işi "şart" (webhook 3 deneme) | iyzico webhook (A) | planned |
| B5 | Tenant "Hata kutusu" (geçici/kalıcı, yeniden dene, saklama) | Make/Zapier/Workato (A) | planned |
| B6 | Bağlantı durumu makinesi + "yeniden yetkilendirme gerekli" + kurtarma bildirimi + adaptör "Kapsam" beyanı | Nango (A), Primer (A) | planned |
| B7 | Append-only `StockMovements` günlüğü + `allocations[]` terminal kayıt sıkıştırma incelemesi | Shopify (A), Stripe Ledger (A) | planned |
| B8 | Mutabakat göstergeleri: clearing/timeliness/completeness | Stripe Ledger (A) | planned |
| B9 | Yetki matrisi testi (151 operasyon × 2 kiracı) + reddedilen çapraz-kiracı erişim günlüğü/alarm | OWASP (A) | planned |
| B10 | Giden webhook/API belirtimi (imza, tekilleştirme, thin gövde, teslimat günlüğü, `Idempotency-Key`, kapsamlı anahtar, sürüm politikası) | Stripe/GitHub/Shopify (A) | planned (Y-14 girdisi) |
| B11 | Kural motoru v1 döngü koruması + kuru çalıştırma; stok politikası kural dışı | Zapier (A) | planned (Y-15 girdisi) |
| B12 | Toplu içe aktarma: fark önizleme, before-image geri alma, boş=değiştirme | Shopify (A) | planned (Y-07 girdisi) |
| B13 | Bildirim tercihleri: zorunlu kategoriler kapatılamaz, gruplama, TTL | Linear/Primer (A) | planned (Y-06 girdisi) |
| B14 | Komut paleti (gezinme), kişisel kayıtlı görünümler, tek `DegradedState` | Linear/Primer (A/B) | nice-to-have (DegradedState için planned: T4h bulgusu) |
| B15 | Pazaryeri API sürüm takvimi `INTEGRATIONS_REGISTRY.md`'de + `API_DEPRECATED` hata kodu ÖNERİSİ | Trendyol changelog (A) | planned |
| B16 | Günlük özet e-posta, Slack/SMS/push | Linear (A) | nice-to-have (SMS/push/Slack: 3. parti kararı) |
| B17 | Denetim günlüğü şeması + UI + 2FA(TOTP) → adım-yükseltme → SSO sırası; KVKK talep kaydı/sayaç | GitHub/WorkOS/Stripe/OWASP (A/B) | planned (Y-20/Y-21 girdisi) |

## 9. Top-15 benimsenecek/uyarlanacak desen

1. Geçici/kalıcı hata sınıfının tenant'a yansıması + "Hata kutusu" (yalnız başarısız birimi yeniden oynat) — ADR-0017.
2. Otomatik deneme sürerken sessizlik, son başarısızlıkta tek bildirim, gruplama, kapatılamayan zorunlu kategoriler — ADR-0017/Y-06.
3. Bağlantı durumu makinesi + "yeniden yetkilendirme gerekli" + kurtarma bildirimi — ADR-0017/0015.
4. Adaptör "Kapsam" beyanı (dürüstlük kimliğinin ürün yüzü) — ADR-0015.
5. Giden webhook: zaman damgalı HMAC-SHA256, çift-sır penceresi, event-id tekilleştirme, thin gövde, teslimat günlüğü — ADR-0016/Y-14.
6. `Idempotency-Key` + kapsamlı/döndürülebilir API anahtarları + oran sınırı başlıkları — ADR-0016/Y-14.
7. Sürüm politikası: `/api/v1`, yalnız-ek, Deprecation/Sunset, ≥12 ay — ADR-0016.
8. Kural motoru v1: kapalı katalog, tek seviye koşul, kuru çalıştırma, döngü koruması, stok politikası dışarıda — Y-15.
9. Toplu işlem: asenkron, satır bazlı hata dosyası, fark önizleme, before-image geri alma, boş=değiştirme — Y-07.
10. Append-only stok hareket günlüğü (referans belgeli) — ADR-0004 eki.
11. Mutabakatı clearing/timeliness/completeness göstergeleriyle ölç — ADR-0017/0004.
12. Webhook + periyodik mutabakat birlikte; Trendyol pencere/oran sınırlarına uygun geriye dönük tarama — ADR-0005/0004.
13. Faturalama: iyzico webhook v3 + günlük mutabakat şart; kartsız deneme yerelde; askıda motor davranışı matrisi; özellik anahtarı kataloğu — ADR-0008.
14. Komut paleti (gezinme, `screens.ts`'ten) + kişisel kayıtlı görünümler + tek `DegradedState` — ADR-0015.
15. Yetki matrisi testi (151 op × 2 kiracı) + reddedilen çapraz-kiracı günlüğü + denetim günlüğü şeması + 2FA→adım-yükseltme→SSO sırası — ADR-0016/0017.

## 10. Kaynak listesi (URL)

- https://docs.stripe.com/webhooks · https://docs.stripe.com/api/idempotent_requests · https://docs.stripe.com/api/versioning · https://docs.stripe.com/rate-limits · https://docs.stripe.com/keys/restricted-api-keys · https://docs.stripe.com/billing/subscriptions/overview · https://docs.stripe.com/billing/entitlements · https://stripe.dev/blog/ledger-stripe-system-for-tracking-and-validating-money-movement · https://stripe.com/blog/accessible-color-systems
- https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries · https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks · https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api · https://docs.github.com/en/rest/about-the-rest-api/api-versions · https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-security-settings-for-your-organization/reviewing-the-audit-log-for-your-organization · https://docs.github.com/en/account-and-profile/managing-subscriptions-and-notifications-on-github/setting-up-notifications/configuring-notifications
- https://www.standardwebhooks.com/
- https://shopify.dev/docs/apps/build/webhooks/best-practices · https://shopify.dev/docs/api/usage/versioning · https://shopify.dev/docs/api/usage/rate-limits · https://shopify.dev/docs/api/usage/bulk-operations/queries · https://shopify.dev/docs/api/usage/bulk-operations/imports · https://shopify.dev/docs/apps/build/orders-fulfillment/inventory-management-apps · https://shopify.engineering/scaling-inventory-reservations · https://help.shopify.com/en/manual/products/import-export/import-products · https://help.shopify.com/en/manual/shopify-flow/create/troubleshoot · https://help.shopify.com/en/manual/shopify-flow/manage/monitor
- https://docs.workato.com/recipes/rerun-job.html · https://help.make.com/incomplete-executions · https://help.make.com/automatic-retry-of-incomplete-executions · https://help.make.com/connect-an-application · https://help.zapier.com/hc/en-us/articles/19220226086797-What-is-replay · https://help.zapier.com/hc/en-us/articles/8496232045453-Zap-is-stuck-in-a-loop · https://docs.n8n.io/build/flow-logic/handle-errors-gracefully · https://docs.celigo.com/hc/en-us/articles/360048814732-Intro-to-Error-Management
- https://nango.dev/docs/guides/auth/token-refreshing · https://sre.google/workbook/alerting-on-slos/
- https://linear.app/docs/notifications · https://linear.app/docs/custom-views · https://primer.style/product/ui-patterns/ · https://primer.style/product/ui-patterns/notification-messaging/ · https://primer.style/product/ui-patterns/degraded-experiences/ · https://atlassian.design/foundations/motion · https://vercel.com/changelog/dashboard-navigation-redesign-rollout
- https://docs.medusajs.com/resources/commerce-modules/inventory/concepts · https://www.linnworks.com/features/inventory-management/
- https://docs.iyzico.com/en/advanced/webhook · https://docs.iyzico.com/en/products/subscription
- https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html · https://workos.com/docs/audit-logs · https://www.kvkk.gov.tr/Icerik/2036/Ilgili-Kisinin-Haklari
- https://developers.trendyol.com/docs/2-authorization · https://developers.trendyol.com/v2.0/changelog/changelog · https://developers.trendyol.com/v2.0/docs/get-order-packages-getshipmentpackages · https://developers.trendyol.com/v2.0/docs/1-service-limitations · https://developers.trendyol.com/docs/sipari%C5%9F-s%C3%BCreci-ak%C4%B1%C5%9F%C4%B1 · https://developer.n11.com/ · https://developers.hepsiburada.com/hepsiburada/changelog/ocak-2024-entegrasyon-g%C3%BCncellemeleri

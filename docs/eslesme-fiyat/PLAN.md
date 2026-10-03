# PLAN — Eşleme, fiyat, entegrasyon mapping'leri ve modül uyumluluğu yeniden yapılandırması (Bölüm 12, adım 6)

Tarih: 2026-10-03 · Dal: `feature/eslesme-fiyat-yeniden-yapilandirma` · Durum: **ONAYLANDI 2026-10-03** (kullanıcı yanıtları §2a; adım 7 uygulama WP0'dan başlar, WP'ler arasında onay beklenmez).

Girdiler: `01-mevcut-yapi.md` (+Ek A–E), `02-ekler/{trendyol,n11,pazarama,bizimhesap}.md`, `API_HEPSIBURADA.md`, `API_IDEASOFT.md`, `03-uyumluluk-analizi.md`.
Bu plandaki `D-*` kimlikleri 03 §2–3'teki düzeltmelerdir; `F-*`/`P0-*` kimlikleri 01 eklerine atıftır.

## 1. Amaç ve ilkeler

Amaç: Kullanıcının ürün gönderimi/çekimi ve fiyat yönetiminde **neyin eksik olduğunu ve ne yapacağını tek bakışta görmesi**; eşleme, fiyat, sipariş/iade/fatura/finans/mesaj
modüllerinin her entegrasyonda güncel API ile uyumlu, idempotent ve izlenebilir çalışması; çekim sürelerinin 10.000 müşteriye ölçeklenmesi.

İlkeler (bağlayıcı):
1. **Overengineering yok (K03):** mevcut doğru yapılar üzerine inşa. Korunacaklar: ESP katalog durum makinesi + İşlem kayıtları ekranı (Ek C §C), kaynak başına imleç modeli (Ek D §B3),
   BullMQ + jobId, ADR-0025 sunucu tarafı özellik çözümleyici, rekabet kural motoru (K1–K20), ClientDB tenant izolasyonu, `IntegrationDescriptor` yetenek manifestosu.
2. **Yazma yasağı (Bölüm 2):** canlıya hiçbir yazma; yazma uçları yalnız mock + sandbox (Trendyol stage, HB SIT) + karakterizasyon testi. Canlı okuma yerelde, `start:live-readonly` altında.
3. **Karakterizasyon önce (Protokol 13):** değişecek her modül için önce mevcut davranışı sabitleyen test, sonra değişiklik.
4. **Göçler yalnız yazılır** (bellek-içi Mongo testiyle kanıtlanır); yerelde yedek + `plan` + onayla koşulur; Atlas ayrı onay (docs/MIGRATIONS.md).
5. **Sır yok;** sözleşme fikstürleri PII temizlenmiş; ortam değişkenleri yalnız `.env.example`.
6. Küçük commit + push; her iş paketi sonunda özet.

## 2. Karar soruları (ONAY GEREKİR — her birinde öneri işaretli)

| # | Konu | Seçenekler | Öneri | Gerekçe |
|---|---|---|---|---|
| K-A | Kanal fiyat kuralı (`channel` tipi: maliyet+komisyon+kargo+KDV+marj → kanal fiyatı; yuvarlama; taban/tavan) | (1) Şimdi, deterministik ve rakip fiyatına bakmadan; (2) Sonra (yalnız rekabet kuralı kalsın) | **(1)** | Bölüm 10 açık beklenti; rakip verisi kullanmadığı için AUTO_PRICING_LEGAL K1–K20'nin çoğu tetiklenmez, K7 taban/tavan ve K9 liste fiyatı kuralı uygulanır. Mevcut `PriceRules` şemasına `type:'channel'` eklenir; kural motoru yeniden yazılmaz. Sonuç fiyat insan onaysız YAZILMAZ: öneri (PriceSuggestion) → onay (mevcut akış) **veya** kullanıcı "otomatik uygula" açarsa yalnız `channel` tipi için otomatik (rekabet tipi değil). Otomatik uygulama ayrı onay maddesi (K-A2). |
| K-A2 | `channel` kuralının insan onaysız uygulanması | (1) Evet, yalnız channel tipi; (2) Hayır, her zaman onay | **(1)** | Maliyet bazlı kural fiyat "hesabı"dır, rakibe tepki değildir; onay zorunluluğu kullanıcıyı yorar. Kill-switch + değişiklik geçmişi + günlük değişim sınırı korunur. |
| K-B | Fiyat senkron yönü ve çakışma | (1) Yerel → kanal otomatik (`pricePending` bayrağı, stok gibi); kanal → yerel ASLA (yalnız "dış değişiklik" uyarısı); (2) Mevcut: elle "Platform fiyatlarını güncelle" | **(1)** | Bölüm 11 "kullanıcı her kanala hangi fiyatın gideceğini görsün" + Bölüm 10 "senkron yönü ve çakışma". Yerel tek gerçek kaynak; pazaryerinde elle değişiklik yapılırsa fark panoda uyarı olarak görünür ve kullanıcı "yereli kanala yaz / kanaldan al" seçer. |
| K-C | Marka modeli | (1) Yetenek bayrağı: TY/PZ/IS = marka eşlemesi (kimlik), HB = ad gönderimi (eşleme ekranı GİZLİ), N11 = "Marka" özelliği (özellik eşleme ekranında, serbest metin fallback), BH = yok; IS için ileride "bul-veya-oluştur" | **(1)** | 02/API raporlarıyla birebir; Bölüm 4 madde 2. |
| K-D | Trendyol kargo modeli | (1) Her sipariş "pazaryeri lojistiği" varsayımı KALKAR; tenant ayarı `trendyol.shippingModel` = `marketplace` (varsayılan; bildirim yok, dürüst `performed:false`) / `seller` (satıcı kargosu; `PUT shipment-packages` Picking + takip no); (2) Mevcut (sahte success) | **(1)** | Ek E F-P0-2 sahte başarı ADR-0006'ya aykırı; satıcı modeli canlıda kullanıcı testine kalır. |
| K-E | Kuyruk ölçeklenmesi | (1) Entegrasyon başına kuyruk + concurrency (ADR-0005 Seviye-1) + çift başına sabit jobId (dedup) + üretici lease'li ve zamana yayılmış; Redis paylaşımlı platform-geneli limiter **sonraya** (Seviye-2 tetikleyicisi: ölçülen 429 oranı); (2) Her şeyi şimdi | **(1)** | 100 tenant'ta tek kuyruk yeter, 1.000'de kırılır (Ek D §E). Paylaşımlı limiter ancak ölçümle. |
| K-F | Order `history` + tipli platform alanları | (1) `Orders.history[]` şeması + 8 normalize alan (D-ORD-3), `meta` kalır; (2) Hiç | **(1)** | Denetim izi bugün sessizce düşüyor (F-P1-3); normalize alanlar fatura/ödeme yöntemi/split için gerekli. |
| K-G | Sebep katalogları | (1) İki ayrı RPC (iptal / iade reddi) + kanal başına katalog kaynağı; (2) Mevcut | **(1)** | F-P1-4; Trendyol oversell iptali bu yüzden çalışmıyor. |
| K-H | Ideasoft token yenileme (yerel canlı tur) | (1) Kullanıcı tek seferlik `LIVE_READONLY_ALLOW_TOKEN_REFRESH=ideasoft` ile yeniler (üretim aynı bağlantıyı kullanıyorsa oradaki token geçersiz olabilir); (2) Önce Ideasoft panelinden yeni API istemcisi | **(2)** sonra (1) | API_IDEASOFT K-2: taban/token ucu yanlış olabilir; yenileme eski refresh'i tüketir. |
| K-I | Hepsiburada SIT (sandbox) hesabı | (1) HB desteğinden test merchant istenir (insan görevi), yazma testleri SIT'te; (2) Yalnız mock | **(1)** | Bölüm 2 "sandbox varsa kullan"; HB yazma uçlarının yarısı dokümanla uyuşmuyor (K-6, K-7). |
| K-J | Webhook abonelikleri (TY panel/API, HB destek, IS `client_webhooks`) | (1) Alıcılar yazılır (HB, IS), abonelik kaydı insan/kullanıcı onaylı; (2) Yalnız polling | **(1)** | Bölüm 8; abonelik kaydı yazma işlemidir, kullanıcı yapar. |
| K-K | Çekim süreleri (§5 tablosu) | Tabloyu onayla / değiştir | tablo | Backoffice ayar kataloğu (ADR-0031) ile plan bazlı değiştirilebilir. |
| K-L | Yan düzeltmeler (bu işin dışı ama kırık): iki `0020` göç numarası, `ERROR_CODES.md` üretimi, operation-policy FE envanteri (Google ikilisi), HB testConnection 403 testi | (1) Bu dalda WP0'da; (2) Ayrı iş | **(1)** | Test paketinin yeşil olması diğer adımların ön koşulu. |

## 2a. Kullanıcı kararları (2026-10-03, sohbette alındı; docs/adr/USER_DECISIONS.md'ye yerelde işlenecek satırlar `USER_DECISIONS_EKLER.md`'de)

| # | Karar | Plana etkisi |
|---|---|---|
| K-A | **Evet, şimdi**: `channel` fiyat kural tipi | WP5 |
| K-A2 | **Evet, yalnız channel tipi** insan onaysız uygulanabilir (kill-switch, günlük sınır, geçmiş) | WP5 |
| K-B | **Yerel → kanal otomatik** (`pricePending`); kanal → yerel asla; fark uyarısı + kullanıcı seçimi | WP5 |
| K-C | **Öneri kabul**: TY/PZ/IS marka eşlemesi; HB marka adı (ekran gizli); N11 "Marka" özelliği; BH yok | WP2, WP3, WP4 |
| K-D | **Tenant ayarı** `trendyol.shippingModel` (marketplace/seller) | WP4, WP6 |
| K-E | **Hepsi şimdi**: entegrasyon başına kuyruk + jobId dedup + lease'li üretici **ve** Redis paylaşımlı platform-geneli hız sınırlayıcı + devre kesici paylaşımı | WP7 (kapsam genişledi; §3.5'e "paylaşımlı limiter" eklendi) |
| K-F | **Öneri kabul**: `Orders.history[]` + normalize alanlar | WP6 |
| K-G | **Öneri kabul**: iptal / iade-reddi sebep katalogları ayrı | WP6 |
| K-H | **Ideasoft canlı doğrulama bu işte kapsam dışı**: kod düzeltmeleri (D-IS-1..6) yazılır, mock testlenir, canlı/token doğrulaması yapılmaz; 03 §5 L-20 "sonra" listesine taşındı | WP4 |
| K-I | **HB SIT hesabı talep edilecek** (insan görevi); kod SIT host'larını destekler; yazma testleri yerelde SIT'te | WP3, yerel kontrol listesi |
| K-J | **Evet, ikisi de**: HB ve Ideasoft webhook alıcıları; abonelik kaydı kullanıcıda | WP7 |
| K-K | **Tablo onaylı** (§3.6) | WP7 |
| K-L | **Yan düzeltmeler bu dalda** (WP0) | WP0 |
| Sıra | **WP0→WP9 onaylı, WP'ler arasında onay beklenmez**; her WP sonunda commit + push + özet | — |
| Bütçe | **Bulut 120 USD sınırı**: sıra WP0→WP1→WP2→WP3 (HB P0); kalan WP'ler yerelde (20x Max). Devir: `DURUM.md` | — |

## 3. Hedef yapı (mimari; ADR gerekenler işaretli)

### 3.1 Eşleme tek kaynağı ve veri modeli (ADR-0032 devamı; yeni ADR gerekmez)
- `AttributeMappings` tek koleksiyon KALIR. Eklenen alanlar: `allowCustom`, `isMultiple` (zod'dan gelen, saklanmıyordu), `platformValueName` zaten var; denetim: `createdAt/updatedAt` (`timestamps`), `updatedBy {userId, name}`; `stale {reason, detectedAt}`.
  İndeksler (göç 0025, yalnız indeks): `(integrationCode, platformCategoryId)`, `(integrationCode, stale.detectedAt)` kısmi. Benzersiz anahtar **değişmez** (riskli göç, kazanç düşük).
- Marka eşi `Brands.platforms[code]` KALIR; `updatedAt/updatedBy` eklenir; sunucu `id` tipini kanal kuralına göre doğrular (TY int, PZ GUID, IS int).
- **Önyüz tek kaynak (P0-1):** `categoriesStore.getIntegrationCategoryId` ve `checkCategoryPlatformMapping` `attributeMapping` store'undan türetilir; `Categories.platforms` ve `Choices.platforms` okumaları silinir; `mapAllChoices` sunucu çözümleyiciye (3.3 önizleme) bağlanır.
- **Platform katalog önbelleği:** `PlatformCatalog` (app DB) koleksiyonu: `{integrationCode, kind: category|attribute|value|brand, platformCategoryId?, payload, fetchedAt}`, TTL 7 gün, global (tenant'tan bağımsız; HB/PZ'de tenant'a özel liste olup olmadığı yerelde doğrulanır). Zamanlanmış iş `catalog.platformRefresh` (haftalık, kanal başına jitter) + istek anında eksikse çek. `@Cache` 6 sa global kalır (sıcak katman).
- **Bayatlık taraması** `catalog.mappingStaleness` (haftalık, refresh'ten sonra): eşlenmiş `platformCategoryId/AttributeId/ValueId` güncel listede yoksa `stale` işaretlenir + bildirim ("Trendyol 'Renk' özelliğinde 3 değer kaldırıldı — yeniden eşle"). Eşleme silinmez.
- **autoMatch düzeltmesi (P0-3):** değer gömülü değilse `retrieveCategoryAttributeValues` ile doldur; dolduramazsa satır YAZILMAZ ve raporlanır; yaprak süzgeci kaldırılır (üst kategoriler atlanır); "öneri" modu: eşiğin altındakiler `suggestions[]` olarak UI'da onaya sunulur (toplu eşleme).
- Kalıtım yok (K-yok): eşleme yerel kategoriye bağlı kalır; UI'da "üst kategoriden kopyala" eylemi (basit, tek RPC).
- Yetenek manifestosu: `CapabilityKey`'e `brandMapping`, `attributeValues` (gömülü/ayrı/yok) eklenir; FE `hasBrandMapping` bu kaynaktan gelir (K-C).

### 3.2 Yapılandırılmış hata/uyarı sözleşmesi (Bölüm 9/10) — ADR-0038 (yeni, kısa)
```ts
interface IntegrationIssue {
  code: string;            // ör. MAP_CATEGORY_MISSING, MAP_ATTR_VALUE_MISSING, PRICE_INVALID, HB_BRAND_UNMATCHED, TY_ORIGIN_REQUIRED
  severity: 'error'|'warning'|'info';
  module: 'mapping'|'price'|'product'|'order'|'claim'|'invoice'|'finance'|'message'|'auth'|'rate';
  integrationCode?: string; productId?; variantId?; field?: string;
  reason: string;          // TR sade dil: "Bu özellik için değer bulunamadı, çünkü ... eşlemesi yapılmamış."
  solution: string;        // "Değer eşlemesini yap"
  link?: { route: string; params: Record<string,string> }; // ilgili ekrana
  platformMessage?: string; // ham pazaryeri metni (maskeli), yalnız "teknik ayrıntı"
}
```
- Katalog: `backend/src/platform/core/errors/integrationIssues.ts` (kod → reason/solution şablonu; i18n anahtarlarıyla). Adaptör hata çevirisi: `modules/<kanal>/errorMap.ts` (pazaryeri mesaj/kod → `IntegrationIssue.code`; eşleşmeyen → `PLATFORM_REJECTED` + ham metin).
- Taşıyıcılar: ESP `staging.issues[]`, `Variants.platforms[code].upload.<MODE>.issues[]`, ImportJobReport `issues[]`, RPC hata zarfı `data.issues[]`, sipariş/iade `platformActions[].issues`. `errorMessage` düz metin geriye uyum için kalır (türetilir).
- Önyüz: `EkProblemState`/`IntegrationErrorPanel` `issues[]` tüketir; "DESTEK AL" ya destek talebine bağlanır ya kalkar.

### 3.3 Gönderim öncesi ön kontrol (preflight) ve "bu neden böyle" (Bölüm 9)
- RPC `IntegrationService/preflightExport {variantIds|productIds|filter, integrationCodes[], mode}` (salt okuma, yetenek kaydında `effect:'read'`): Validator + AttributeResolver + adaptör `prepareAttributes` **kuru çalıştırma** → ürün×kanal `issues[]` + `resolvedPreview` (gidecek kategori id/adı, marka, özellikler, fiyat, KDV, görsel sayısı). Aynı fonksiyon Validator'da gerçek gönderimde kullanılır (tek kaynak).
- RPC `IntegrationService/explainChannelProduct {variantId, integrationCode}`: alan → kaynak zinciri ("kategori: Kadın>Elbise ← AttributeMappings (2026-10-01, Ayşe)", "fiyat: 1.299,00 ← kanal fiyatı ← kural 'TY komisyon %15' ← ana fiyat 1.100,00 + maliyet…").
- Önyüz: Toplu gönderim diyaloğunda "Hazırlık durumu" (kanal başına eksik sayısı, satır tıklanınca eksikler + "Eşlemeye git"); ürün formu kanal sekmesinde "Gönderilecek" önizleme + eksik rozetleri; `AttrValueField` dört durumu ayırır (yükleniyor / aramaya uyan yok / kanal değer döndürmedi [tekrar dene] / eşleme yok [eşlemeye git]).

### 3.4 Fiyat modeli (Bölüm 4 madde 6, Bölüm 10)
- Tek fonksiyon `effectiveChannelPrice(variant, code, {rules})` (operations/pricing/effectivePrice.ts): sıra = kanal özel fiyat (bayrak true ve nesne) → `channel` kuralı sonucu → ana fiyat. Adaptörler/Validator/kural motoru/komisyon sorguları/UI aynı modülü kullanır (P1-1).
- Import: kanal fiyat nesnesi yalnız `isPlatformBasedPrice:true` ile yazılır; aksi halde yalnız `prices.salePrice` (eski kayıtlar için düzeltme göçü YOK — K05; `effectiveChannelPrice` bayrağı esas alır).
- `Variants.pricePending: { [code]: { since, reason } }` (bayrak) + `pricing.publish` tetikleyicisi (StockPublishTrigger deseni, 60 sn) → `UPDATE_PRICE` ESP (K-B). TY "aynı gövde 15 dk" kuralı için gövde özeti (hash) + zaman damgası tutulur.
- `PriceHistory.source` genişler: `manual|bulk|import|rule_channel|suggestion|external`; manuel/toplu/import yazımları kaydedilir; TTL 90 g → 400 g (K10 "son 30 gün en düşük" + yıllık kanıt; tenant başına boyut tahmini WP5'te).
- Sunucu doğrulaması: `prices` zod (sayı, ≥0, ≤10.000.000, 2 ondalık), KDV `{0,1,10,20}` ya da null (ayarsız); sessiz varsayılanlar kalkar (HB 20/desi 1/garanti 24, IS 18) → preflight uyarısı.
- `PriceRules.type:'channel'`: `{integrationCode, scope: all|category|product, base: cost|salePrice, commissionSource: override|realized|static, cargoCost, vatMode, marginPercent, rounding {step, direction, psychological .99?}, floor {marginPercent}, ceiling, listPriceStrategy}`; kuruş-tamsayı hesap; `reasons[]` açıklaması `explainChannelProduct`'a girer. Hukuk: `AUTO_PRICING_LEGAL` K7/K9/K12 uygulanır, K1/K17 (rakip) uygulanmaz; sorumluluk metni değişmez.
- Çakışma (K-B): `pricing.externalDrift` kontrolü buybox işinden genelleşir (TY `approved/inventory-and-price` okuma; diğer kanallarda listing okuma) → `Variants.platforms[code].observed {salePrice, at}` + uyarı; otomatik yazma yok.

### 3.5 Senkron durumu, manuel tetik, zamanlama (Bölüm 8, 11)
- `Clients.integrations[].sync: { orders|claims|messages|finance|products|catalog: { lastSuccessAt, lastAttemptAt, lastError?: {code, at}, cursor? } }`. Mevcut `lastSuccessfulOrderSync/lastClaimSync/...` alanları **kalır** (motor ikisini de yazar; göç yok); `health.ts` yeni alanı okur; üst seviye `Clients.lastSuccessfulOrderSync` türetilir (F-07).
- RPC `IntegrationService/syncNow {integrationCode, kind}`: jobId `manual_<client>_<kod>_<kind>_<5 dk pencere>` (dedup), tenant başına kind başına 5 dk soğuma, kill-switch ve LIVE_READONLY kapısı; önyüzde entegrasyon kartı ve liste başlıklarında "Son senkron: 4 dk önce · Şimdi senkronize et".
- Üretici: `OrderQueueProducer` `startJob` altına (lease + JobState), `Clients` projeksiyonlu okuma, `addBulk`, tenant dilimleme (`order % 60` saniye dilimi → yük 60 sn'ye yayılır), kind başına ayrı iş (orders/claims/messages/finance) ayrı aralıkla.
- Paylaşımlı hız sınırlayıcı (K-E 'hepsi şimdi'): `RateLimiter.throttle()` arayüzü korunur; Redis Lua token-bucket uygulaması anahtar `platform[:grup]` (global) + mevcut tenant kovası; devre kesici durumu platform bazında Redis'te paylaşılır (açıkken iş eklenmez / `moveToDelayed`); Redis yoksa süreç-içi davranışa düşer (fail-open, uyarı logu).
- Kuyruklar (K-E): `order-sync:<integrationCode>` (6 kuyruk) + kind'e göre iş; concurrency kanal başına (TY 5, HB 3, N11 3, PZ 3, IS 2, BH 1 — başlangıç; backoffice ayarı); jobId çift+kind sabit, bekleyen/aktif varken eklenmez; RATE_LIMITED → `moveToDelayed(retryAfterMs)`; AUTH 3 ardışık → entegrasyon `needsAttention` + bildirim, üretim durur; DLQ `originalJobId` unique + 30 g TTL (göç 0029).
- Zamanlayıcı: `jitterPct` tüm işlerde (%10), `runOnStart` yayılır; tenant tarayıcı işler dilimli (stock.publish `order % 4` dört ayrı lease).
- Webhook (K-J): HB alıcısı `/hooks/hepsiburada/:token/:event` (PUT, 5 sn 2xx, gövde okunmaz → `syncNow(orders|claims)` sinyali), IS alıcısı `/hooks/ideasoft/:token` (HMAC `X-Ideashop-Hmac-Sha256` doğrulama; `order/*`, `product/update`); Trendyol mevcut. Webhook sağlıklı kanal = seyrek mutabakat.

### 3.6 Çekim süreleri önerisi (K-K; backoffice ayar kataloğu `sync.*` ile plan bazlı)

| Veri türü | Bugün | Öneri | Artımlı | Gerekçe |
|---|---|---|---|---|
| Sipariş — webhook'lu kanal (TY; HB/IS sonra) | 60 sn (webhook sağlıklı 5 dk) | **10 dk** mutabakat + webhook anında | `lastSuccessAt − 5 dk` | Webhook gerçek zamanlı; mutabakat kaçanları yakalar (TY kesintileri 02/09.2026) |
| Sipariş — webhook'suz kanal (N11, PZ, HB başlangıç) | 60 sn | **5 dk** (plan: Starter 10 dk, üst 3 dk) | aynı | 60 sn 1.000 tenant'ta kapasiteyi 6× aşıyor; 5 dk "yakın gerçek zaman" + manuel tetik |
| İade | 15 dk + günlük 32 gün süpürme | **15 dk** (webhook'lu 30 dk); süpürme saat içi dilimli | ✓ | Mevcut doğru; TY iade 1000/dk |
| Mesaj/soru | 5 dk | **10 dk** (HB SLA 1 iş günü, TY yasak kelime kontrolü); sayfalı | `lastSuccessAt − 15 dk` | Yarı yarıya yük; manuel tetik var |
| Finans | 6 sa + günlük 30 gün | **6 sa**; tam süpürme haftalık; TY 15 gün / HB 1 ay dilim | ✓ | Günlük tam süpürme gereksiz |
| Ürün/stok/fiyat (dışa) | stok 30 sn dirty; fiyat elle | stok 30 sn (aynı); **fiyat 60 sn dirty** (K-B) | bayrak | — |
| Kanal ürün durumu / dış fiyat gözlemi | externalReconciliation 24 sa tam | 24 sa, jitter + çağrı bütçesi (buybox deseni); TY `inventory-and-price` 50 barkod/istek | kanal listing artımlı (HB `updateStartDate`) | — |
| Kategori/marka/özellik listeleri | istek anında + 6 sa cache | **haftalık** `platformRefresh` + istek anında eksikse | — | TY "haftalık yenile" önerisi; bayatlık taraması bunun ardından |
| Buybox (TY) | 1 dk bütçeli | aynı | ✓ | mevcut doğru |

Yük tahmini (P = tenant × 3 entegrasyon; sipariş webhook'suz 5 dk, webhook'lu 10 dk → ortalama ~7 dk; çağrı/dk alt sınır):

| | 100 tenant (P=300) | 1.000 (P=3.000) | 10.000 (P=30.000) |
|---|---|---|---|
| Sipariş | ≈43 | ≈430 | ≈4.300 |
| İade (15 dk) | 20 | 200 | 2.000 |
| Mesaj (10 dk) | 30 | 300 | 3.000 |
| Finans (6 sa) | 0,8 | 8 | 83 |
| **Toplam çağrı/dk** | **≈94** (bugün ≈381) | **≈940** (bugün ≈3.808) | **≈9.400** (bugün ≈38.083) |
| BullMQ iş/dk | ≈94 | ≈940 | ≈9.400 |
| Worker pod (concurrency 15/pod toplam, d=2 sn) | 1 | 2–3 | 21 |
| ADR-0005 Seviye-2 eşiği (500 iş/dk) | altında | ~2× (Seviye-1 kuyruk ayrımı yeter, ölçüm) | 19× → Seviye-2 (paylaşımlı limiter/sharding) tetiklenir |

Pazaryeri limitleri: TY sipariş 30–100/dk/satıcı (tenant başına 1 çağrı/5–10 dk → sorun yok); finans 100/dk; HB upload ≤5 bekleyen; N11 1000/dk. IP-geneli limit bilinmediği için 10.000'de ölçüm şart.

### 3.7 Adaptör düzeltmeleri (03 §2.3/§3.2 `D-*`), yetenek dürüstlüğü (D-CAP-1), host listeleri (K7) ve sözleşme fikstürleri (canlı turdan).

## 4. Veritabanı değişiklikleri ve göç planı (yalnız yazılır; yerelde onayla koşulur)

| No | Kimlik | Kapsam | Ne yapar | Veri dönüşümü | Geri alma |
|---|---|---|---|---|---|
| 0025 | `0025-users-google-sub-app` (yeniden numaralandırma; eski `0020-users-google-sub-app`, hiç koşulmadı) | app | aynı içerik | yok | aynı |
| 0026 | `0026-attribute-mappings-indexes-tenant` | tenant / index | `(integrationCode, platformCategoryId)`, `stale.detectedAt` kısmi; `Brands` `platforms.<code>.id` için indeks yok (küçük koleksiyon) | yok | indeksleri düşürür |
| 0027 | `0027-invoices-unique-tenant` | tenant / index | `Invoices {integrationCode, externalOrderId, type}` unique; `plan` mükerrer grup sayısı (varsa `up` reddeder; insan kararı) | yok | düşürür |
| 0028 | `0028-variants-price-pending-tenant` | tenant / index | `Variants` kısmi `pricePending` (`$exists`) ve `platforms.*.observed.at` yok (sorgu nadir) | yok | düşürür |
| 0029 | `0029-dlq-unique-ttl-app` | app / index | `DeadLetterQueue uniq_originalJobId` + TTL 30 g; `plan` yinelenen sayısı | yok (TTL eski kayıtları siler — süre onayı) | düşürür |
| 0030 | `0030-platform-catalog-app` | app / index | `PlatformCatalog {integrationCode, kind, platformCategoryId}` unique + TTL `fetchedAt` 7 g | yok | düşürür |
| 0031 | `0031-price-history-ttl-tenant` | tenant / index | `PriceHistory ttl_at` 90 g → 400 g (`collMod`) | yok | 90 g'a döner |

Şema-only değişiklikler (göç gerekmez; strict şemaya alan ekleme): `Orders.history[]` + normalize alanlar, `Claims.items[].status`, `Messages.status` enum (`WAITING_APPROVAL`, `AUTO_CLOSED`, `PRE_APPROVAL`), `Clients.integrations[].sync`, `AttributeMappings` yeni alanlar, `PriceRules.type:'channel'`, `Variants.pricePending/observed`. Eski veri için düzeltme göçü YOK (K05). Sıra: 0025 → 0026 → 0027 → 0029 → 0030 → 0028 → 0031 (0022 `PriceRules type_integ_enabled` indeksi `channel` tipini de kapsar; 0021/0022 önce koşulmalı).

## 5. Önyüz (Bölüm 11) — özet
- Eşleme ekranları: kategori listesinde kapsam = kategori + zorunlu özellik + değer (P1-9); "Eksik eşlemeli" süzgeci her üç boyutta; kanal satırında "Eksik: Renk (3 değer), Marka" + adım adım panel (kategori → özellikler → değerler → marka), toplu/önerili eşleme onay listesi (autoMatch öneri modu); marka ekranı yalnız `brandMapping: supported` kanallar; N11 markası özellik ekranında.
- Ürün formu: kanal sekmesinde "Gönderilecek" önizleme (preflight), `AttrValueField` dört durum + bağlantı, arama `includes`, i18n; "Seçenek eşlemesinden doldur" sunucu çözümlemesine bağlanır.
- Toplu gönderim: "Hazırlık durumu" paneli, eksik → bağlantı; başarısız satırda "Yeniden gönder"; işlem kayıtları listesi 10 sn yoklama (mevcut `reportPollMs` ile); hata satırı `issues[]` (ham metin "teknik ayrıntı"da).
- Fiyat: `PlatformPriceComponent` kaynak zinciri ("kural: TY komisyon %15 → 1.299,00"), bekleyen fiyat rozeti ("kanala gönderilmedi"), kural ekranında `channel` tipi; `priceCalculator.ts` ölü kod kalkar.
- Senkron: entegrasyon kartı + liste başlıklarında veri türü başına son senkron + "Şimdi senkronize et".
- Tasarım kuralı ihlalleri (Ek C §E) aynı dosyalarda düzeltilir; e2e/görsel tabanlar yerelde (K69).

## 6. İş paketleri (adım 7 sırası; her WP = karakterizasyon → değişiklik → test → commit + push + özet)

| WP | İçerik | Düzeltme kimlikleri | Bulutta | Çıktı |
|---|---|---|---|---|
| WP0 Hazırlık | Yan düzeltmeler (K-L): göç 0020 ikilisi → 0025, `ERROR_CODES.md` üretimi, operation-policy FE envanteri, HB testConnection testi, N11 snapshot; `docs/eslesme-fiyat/USER_DECISIONS` satırları için öneri metni (docs/adr salt-okunur → yerelde eklenir) | — | ✓ | test paketi bulutta koşulabilen kısmı yeşil |
| WP1 Hata sözleşmesi + preflight (BE) | `IntegrationIssue` kataloğu, adaptör errorMap iskeleti (TY/HB/N11/PZ/IS), Validator/Publisher/Sentinel/ImportJobReport `issues[]`, `preflightExport`, `explainChannelProduct`, yetenek kaydı | D-ERR-1, D-VAL-1/2 | ✓ | ADR-0038 (kısa) |
| WP2 Eşleme tek kaynak (BE+FE) | autoMatch düzeltmesi + öneri modu, `AttributeMappings` alanları/indeks (0026), audit (`mapping.*` olayları), PlatformCatalog + refresh + bayatlık işi, `brandMapping` yeteneği, FE P0-1/P0-2/P1-1..3/P1-9/P1-10, "üst kategoriden kopyala" | D-MAP-3/5, 01 Ek A P0-3, P1-4..12 | ✓ | eşleme ekranları + ürün formu |
| WP3 Hepsiburada adaptörü | import kaynağı (katalog+listing), kategori/özellik 3 kova + değer ucu + `lazyValues`, marka = ad, zorunlu denetim, fiyat/stok sonuç yolu + `priceValidations`, host listesi + SIT, merchantId tek kaynak, ürün güncelleme `limited`, iptal/kargo/fatura uçları (mock+SIT), `/cancelled` imleci, tarih biçimi, claim yol/durum, finans mpfinance, soru asktoseller | D-HB-1..11, D-CAP-1 | ✓ (canlı fikstür yerelde) | HB uçtan uca mock testleri |
| WP4 Diğer adaptörler | TY: `origin`, rate kovaları, `storeFrontCode` ayarı, marka size, iade kalem durumu + yeni sebepler, fatura 409/mikro ihracat, finans türleri + sayfalama, soru sayfalama, `shippingModel` (K-D). N11: export gövdesi, import `page/size`, task-details POST + allowlist, REST onay, kargo gövdesi, iade mapper (P0), e-ihracat fatura, mesaj tarihi. PZ: token scope/yanıt, marka `Page/Size/name`, stok ucu, batch sonucu, PascalCase, attributes tek alan, `isRequired`, batch `isSuccess`, adres takma adları, onay/ret `updateOrderStatusList` + `OrderItemId`, fatura GUID, 30 gün dilim, `sendToReview` kararı. IS: taban/token/`panel/auth`, `maincode`, `taxIncluded`, sipariş takma adları + `startUpdatedAt`, NS fırlatma. BH: taban/başlık, varyant `maincode`, durum eşlemesi | D-TY-1..11, D-N11-1..9, D-PZ-1..13, D-IS-1..6, D-BH-1..3 | ✓ | kanal başına mock/sandbox testleri |
| WP5 Fiyat | `effectiveChannelPrice`, import bayrak kuralı, `pricePending` + `pricing.publish`, PriceHistory kaynakları + TTL (0031), zod doğrulama, KDV null, `channel` kural tipi + motor + açıklama + (K-A2) otomatik uygulama, dış fiyat gözlemi, FE fiyat ekranları | D-PRICE-1/2, Ek B P1-1..6 | ✓ | fiyat senaryoları testleri |
| WP6 Sipariş/iade/fatura/finans/mesaj | `Orders.history` + normalize alanlar, Invoice unique (0027), durum tabloları tek dosya + yeni durumlar, sebep katalogları (K-G), kargo sözleşmesi (D-ORD-6), finans `externalId`, mesaj enum, Pazarama satır kimliği (oversell), TY split ilişkisi, fatura durumu platformdan | D-ORD-1..6, D-FIN-1, Ek E F-P0-1..4, F-P1-* | ✓ | modül uyumluluk testleri |
| WP7 Kuyruk/zamanlama/senkron | entegrasyon başına kuyruk, jobId dedup, lease'li üretici + dilimleme, Retry-After erteleme, AUTH duraklatma, DLQ (0029), jitter, tenant dilimli tarayıcılar, `sync` alanları + health + `syncNow`, HB/IS webhook alıcıları, aralık ayar kataloğu | 01 Ek D F-01..F-14 | ✓ (Redis'siz testler mock; gerçek BullMQ yerelde) | yük/ölçek testleri (bellek-içi) |
| WP8 Önyüz tamamlama | §5 kalanları: hazırlık paneli, yeniden gönder, yoklama, senkron göstergeleri, tasarım ihlalleri, i18n, e2e beklentileri (görsel taban yerelde) | Ek C P0-3, P1-5..8, P2-* | ✓ (vitest; Playwright `--update-snapshots=missing`) | — |
| WP9 Kapanış | docs (CAPABILITIES, ERROR_CODES, MIGRATIONS §7, LIVE_READONLY), `INTEGRATIONS_REGISTRY` için yerel not, Aşama 3 raporu: dal, özet, çekme komutları, yerel kontrol listesi, canlı test listesi | — | ✓ | son rapor |

Sıra gerekçesi: WP1 (hata/preflight) diğer tüm UI işlerinin ortak dili; WP2–WP4 ürün gönderim/çekim temeli; WP5 fiyat bağımsız; WP6–WP7 modüller/ölçek; WP8 UI toplu; her WP bağımsız commit'lenir, kullanıcı istediği yerde durdurabilir.

## 7. Test stratejisi

**Koşturma kuralı (kullanıcı 2026-10-03):** testler kodla birlikte yazılır; paket içinde yalnız değişen dosyaya dokunan testler koşar, paket sonunda ilgili modül bir kez, tam koşu (`npm test`, `verify`, Playwright) yalnız WP9'da ve yerelde. `tsc --noEmit` her commit öncesi.

- Karakterizasyon (önce): etkilenen her adaptör metodu/transformer ve FE store için.
- Birim: `IntegrationIssue` kataloğu (her kodun reason/solution/link'i var), `effectiveChannelPrice` matrisi, `channel` kural motoru (yuvarlama/taban/tavan/KDV), preflight senaryoları (eksik kategori/marka/özellik/fiyat/KDV/görsel), durum tabloları (her kanal × her ham değer), `toInList` benzeri girdi sertleştirmeleri.
- Sözleşme (mock yanıt): kanal başına istek gövdesi şeması (zod `assertContract`) + doküman alanlarıyla; **gerçek fikstürler** yerel canlı turdan (03 §5 L-1..L-21) PII temizlenerek `backend/tests/fixtures/<kanal>/` altına; conformance kiti bunları kullanır.
- Round-trip: fikstür ürün → import → export payload → alan farkı raporu (kayıp alan listesi test tarafından assert edilir).
- Yazma uçları: mock sunucu (yerel `mockserver/`, bulutta yok → testler jest içi sahte sunucu) + TY stage / HB SIT (yerelde, kullanıcı anahtarıyla, yalnız test hesabı).
- Ölçek: BullMQ bellek-içi (ioredis-mock) ile 1.000 tenant üretici turu süresi/iş sayısı; zamanlayıcı dilimleme testi.
- Bulutta koşulamayanlar: `tests/mongo-semantics/**` (göçler), gerçek Redis, Playwright görsel tabanlar, canlı okuma → yerel kontrol listesi.

## 8. Yerel kontrol listesi (taslak; WP9'da kesinleşir)
1. `bash scripts/cloud-sync.sh pull feature/eslesme-fiyat-yeniden-yapilandirma` (proje tek depo).
2. `cd backend && npm ci && npm run typecheck && npm run lint && npm test` (mongod ile; `mongo-semantics` dahil).
3. Yedek (`backup/`, DB_BACKUP_VERIFICATION) → `node dev-tools/migrate.js plan <kimlik>` sırayla 0025, 0026, 0027, 0029, 0030, 0028, 0031 (+0021, 0022 önce) → `up --apply --backup-ref` → `plan` no-op.
4. `.env`: yeni anahtarlar (`.env.example`'dan): `HB_ENV` (prod/sit), webhook token'ları, `sync.*` ayarları (backoffice).
5. Canlı salt-okuma turu: 03 §5 L-1..L-21 (fikstür kaydı), Ideasoft için önce K-H kararı, Pazarama anahtarı yenilenmeli, Bizimhesap 402 nedeni.
6. Frontend: `npm ci && npx vitest run && npm run build`; Playwright görsel tabanlar Windows'ta yenilenir.
7. `docs/adr/USER_DECISIONS.md`'ye bu plandaki K-A..K-L kararları (bulut docs/adr'ye yazamaz; satır metinleri WP0'da hazırlanır).
8. Canlı yazma testleri (kullanıcı): ürün gönderimi (TY stage/HB SIT → sonra canlı), fatura linki, kargo bildirimi, iade onayı, mesaj yanıtı — her biri önce tek kayıtla.

## 9. Riskler ve açık noktalar
- Doküman güvenilirliği (IS/BH zayıf; HB OpenAPI kopyası 2026-05-31 tarihli) → her kanal düzeltmesi yerel fikstürle teyit edilmeden "doğrulandı" denmez.
- HB import iki kaynak birleşimi katalog uçlarının gerçek sayfalama/alan yapısına bağlı (L-6/L-7).
- `channel` fiyat kuralı otomatik uygulaması (K-A2) hukuki metin değişikliği gerektirmez ama avukat görüşü beklenen PRC-LEGAL kapsamına **girmez**; yine de PricingSettings sorumluluk metnine bir cümle eklenebilir (kullanıcı kararı).
- Kuyruk ayrımı Redis bellek kullanımını kanal sayısı kadar artırır (ihmal edilebilir); paylaşımlı limiter ertelendi (ölçüm tetikler).
- Göç 0027 mükerrer fatura kayıtları varsa `up` reddeder → insan kararı.
- Trendyol V1 kapanışı 15 Ekim 2026: kod V2'de; DB `urls` değerleri yerelde kontrol edilmeli (V1 yolları override etmiş olabilir).

## 10. Onay listesi
- [ ] K-A, K-A2 kanal fiyat kuralı ve otomatik uygulama
- [ ] K-B fiyat senkron yönü (`pricePending`)
- [ ] K-C marka modeli
- [ ] K-D Trendyol kargo modeli ayarı
- [ ] K-E kuyruk: entegrasyon başına kuyruk, paylaşımlı limiter sonra
- [ ] K-F Order history + normalize alanlar
- [ ] K-G sebep katalogları ayrımı
- [ ] K-H Ideasoft token yenileme sırası
- [ ] K-I HB SIT hesabı talebi (insan görevi)
- [ ] K-J webhook alıcıları (abonelik kaydı kullanıcıda)
- [ ] K-K çekim süreleri tablosu (§3.6)
- [ ] K-L yan düzeltmeler bu dalda
- [ ] §4 göç listesi ve sırası (yalnız yazılır)
- [ ] §6 iş paketi sırası (WP0→WP9); "şu WP'de dur" notu varsa belirt

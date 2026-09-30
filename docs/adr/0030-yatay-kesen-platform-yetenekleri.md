# 0030 — Yatay kesen platform yetenekleri (cross-cutting) hedef mimarisi

## Durum
Kabul edildi (2026-09-30). Kod henüz değişmedi. İş paketleri X1–X6 (Şimdi), X7–X22 (tetikleyicili).

## Bağlam
Kullanıcı SaaS/dağıtık sistemlerin yatay kesen kavramlarının (multi-tenancy, rate limit, hata, cache, dayanıklılık, audit, transaction, validation, gözlemlenebilirlik + ekler) Entegrasyonik'te ne durumda olduğunu sordu. Ek yönergesi: **"Overengineering yapmayalım, astarı yüzünü geçmesin."**

Boşluk analizi: `docs/audits/CROSS_CUTTING_GAP_2026-09-30.md` (kanıtlar dosya:satır). Özet:
- Çekirdeğin büyük bölümü zaten var ve ADR'lerle bağlanmış. Mevcut ADR'ler ve kapsadıkları:
  - ADR-0001/0028: tenant kimliği, RBAC
  - ADR-0002: cache
  - ADR-0004: tek belge atomik zero-oversell + mutabakat
  - ADR-0006/0022: resilience
  - ADR-0017: log/correlation/metrik/scheduler
  - ADR-0020: config + kill-switch
  - ADR-0023: girdi şeması
- Kapatılmamış somut riskler:
  - (a) Kullanıcı stok düzenlemesi `stockDirty` ayarlamıyor, kanala yayılmıyor (P0 aday, teyit gerekli).
  - (b) Giden limiter Trendyol'un 14 Eyl 2026 servis grubu limitlerini bilmiyor. Tek kova var.
  - (c) Dış etkili yazmalarda idempotency yok.
  - (d) Tenant yüzeyi iş yazmaları denetlenmiyor.
  - (e) Kill-switch motora bağlı değil.
  - (f) 17 kritik yazma operasyonu şemasız. Express son hata işleyicisi yok.

Ölçek bağlamı:
- Tenant sayısı tek hanelidir.
- Railway'de tek replika çalışır (`APP_ROLE=all`, `docs/DEPLOYMENT.md:70,93`).
- Tek bölge, Atlas, Redis zorunlu.
- Yerel Mongo standalone'dur (replica set yok).

## Değerlendirilen Alternatifler
**A. "Tam SaaS platform katmanı" şimdi.** Bileşenler: OpenTelemetry + collector, Prometheus/Grafana, Redis tabanlı dağıtık limiter'lar, genel outbox + saga motoru, hash zincirli audit, merkezi tenant bağlamı zorlaması, API sürümleme.
- Artı: gelecekteki ölçeğe hazır.
- Eksi: yeni servisler ve operasyon yükü, bugün tüketicisi olmayan altyapı. Ayrıca ADR-0005/0017 eşik kararlarıyla çelişir. Tek replikada dağıtık limiter/invalidation değer üretmez. **Reddedildi.**

**B. Hiçbir şey yapmamak (mevcut ADR'ler yeterli).**
- Artı: sıfır maliyet.
- Eksi: (a)–(e) somut para/aşırı satış/güvenlik riskleri açık kalır. **Reddedildi.**

**C. Yalnız somut riski olan açıkları mevcut yapılarla kapatmak; kalanını sayısal tetikleyiciye bağlamak.** (Seçilen)
- Artı: yeni servis yok, yeni bağımlılık yok. Mevcut `ResilientHttpClient`/`RateLimiter`, `StockAllocator`/`stockDirty`, `AuditLogger`, yetenek kaydı (`effect`, `external`), `RedisService`, `platformOverrideStore` yeniden kullanılır.
- Eksi: çok replikaya geçişte bir dizi iş (X9–X11) birlikte gelir. Bu belgede önceden listelendi.

## Karar
Yatay kesen yetenekler **mevcut yapıların üzerine, somut riski olan 6 dar paketle (X1–X6)** tamamlanır. Diğer tüm yetenekler bu ADR'deki sayısal tetikleyicilere bağlanır ve tetikleyici gelmeden kurulmaz.

### Kavram bazında hedef (kısa)
1. **Multi-tenancy.** İstek: değişmez (ADR-0001/0028). Kuyruk: bugünkü tek kuyrukta üretici ACTIVE filtresi + silmede iş iptali + PURGED tombstone yeterli.
   - Zarf `{tid, corrId, v}` + işçi durum kontrolü: X7, tetikleyicili.
   - "Bağlam yoksa DB yok" mandalı: X8, ajan/MCP yazmalarıyla.
   - Tenant başına LLM anahtarı: yeni kasa kurulmaz, `integrationSecrets` (`enc:v1:<kid>`) kullanılır (X22).
2. **Rate limit.**
   - Giden: aynı süreç içi `RateLimiter`, anahtarı `clientId::integrationCode::group` olur. Trendyol grupları katalogda tanımlıdır (ADR-0020). Stok/fiyat yazımı ayrı kovada olduğundan içerik/okuma trafiğine karşı öncelik doğal olarak sağlanır; ayrı öncelik kuyruğu kurulmaz. Barkod başına fiyat ≤30/dk (X1).
   - Gelen: bugünkü süreç içi kimlik anahtarlı limit kalır. Tenant/plan kotası Redis token bucket'a taşınır; bu, genel API/MCP veya replika ≥2 ile gelir (X9).
3. **Hata.** Tek zarf `{error, code, requestId, fields?}` her yolda kullanılır:
   - Express son hata işleyicisi + `/api` 404 JSON.
   - `sendError` kod kapısı `instanceof AppError` olur.
   - Ham `res.status().send` gönderimleri `sendError`'a taşınır (X5).
   - FE kod→i18n eşlemesi ADR-0017 Aşama D'de kalır.
4. **Caching.** ADR-0002 aynen. Redis pub/sub invalidation yalnız replika ≥2 ile gelir (X11).
5. **Resilience.** ADR-0006/0022 aynen. Tek ekleme: 429 yalnız ilgili grup kovasını yavaşlatır (X1).
6. **Audit.** `effect!=='read'` app yazmaları yetenek kaydından otomatik `app.write` olarak denetlenir (backoffice deseni, çift kayıt yok).
   - Önce/sonra yalnız dar bir alan listesinde tutulur: stok, fiyat, stok politikası. Kimlik bilgisinde yalnız `'changed'` yazılır, değer asla. Toplu işlemde yalnız sayı.
   - Best-effort ve 365 gün TTL korunur (X4).
   - Hash zinciri: belki hiç.
7. **Transaction.** Zero-oversell'de Mongo transaction **kullanılmaz** (ADR-0004 K4). Tek belge koşullu atomik + idempotent anahtar + seviye tetiklemeli süpürme + mutabakat modeli doğrulandı.
   - `stockDirty` bayrağı bu sistemin outbox'ıdır. Kural: stok değerini değiştiren **her** yazma yolu tek yardımcıdan geçer ve `stockDirty/stockDirtyAt` yazar (X2).
   - Dış etkili gelen yazmalar (`external:true`) `Idempotency-Key` ile korunur. Redis `SET NX` 24 sa + yanıt önbelleği. Önce gözlem kipinde çalışır (X3).
   - Çoklu belge transaction'ı (X14) ve genel outbox (X15) tetikleyicilidir.
   - Saga motoru kurulmaz.
8. **Validation.** ADR-0023 tek nokta aynen:
   - T1: 17 kritik operasyon (ürün, varyant, fatura, sevk, müşteri, entegrasyon). Baseline 38→21 (X5).
   - T2: fırsatçı (X13).
   - Yanıt şeması çalışma anında zorlanmaz.
9. **Observability.** ALS correlationId, gelecekteki trace_id'dir (OTel gelince bu değer eşlenir, W3C `traceparent` ancak o zaman).
   - İş SLO metriği `stock_publish_lag_ms` X2 ile gelir.
   - Alarm kuralları ADR-0017 Aşama C'ye eklenir (X12). SLO hedefleri: sipariş çekme gecikmesi p95 ≤ 3 dk, stok yayın gecikmesi p95 ≤ 2 dk, zamanlayıcı stale = 0.
   - Prometheus `/metrics` ve OTel ADR-0017 eşiklerine bağlı kalır (X16/X17).
10. **Ekler.**
    - Kill-switch'in motor tüketicilerine bağlanması (X6) tek "şimdi" ekidir.
    - Feature flag için yeni sistem kurulmaz (env + ADR-0020 + entitlement).
    - Bakım modu, API sürüm kapısı, KVKK alıcı PII anonimleştirme, anahtar rotasyon runbook'u tetikleyicilidir.
    - DR/yedek katmanı insan kararıdır.

## Gerekçe
- **Kimliğe öncelik:** en yüksek öncelik (X2), "sıfır aşırı satış" vaadini doğrudan ihlal eden açıktır. İkincisi (X1), aynı vaadi pazaryeri kotası üzerinden tehdit eder. Bu ikisi "platform süsü" değil, ürünün kendisidir.
- **Yeniden kullanım:** 6 paketin hiçbiri yeni servis veya bağımlılık getirmez.
  - X1 mevcut limiter'a bir anahtar boyutu ekler.
  - X2 mevcut outbox bayrağını eksik yazma yollarına bağlar.
  - X3 zorunlu olan Redis'i kullanır.
  - X4 mevcut backoffice audit desenini genelleştirir.
  - X5 mevcut şema mandalını düşürür.
  - X6 zaten yazılmış `isIntakeOpen`'ı çağırır.
- **Tek replika gerçeği:** süreç içi limiter/cache/invalidation bugün doğrudur. Dağıtık sürümleri (X9–X11) aynı tetikleyiciye (replika ≥2 veya rol ayrımı) bağlanır ve birlikte ele alınır. Böylece "yarım dağıtık" bir ara durum oluşmaz.
- **Ajan-hazır:** yetenek kaydının `effect`/`external` alanları hem audit (X4) hem idempotency (X3) kararını besler. İleride MCP/ajan yazmaları (ADR-0019 D, ADR-0018) aynı iki ilkeli ek iş olmadan kullanır (PLATFORM_BASELINE E8 eşitliği).
- **Refactor, yeniden yazım değil:** hiçbir modül yeniden yazılmaz. X1/X2/X6 değişikliklerinden önce karakterizasyon testi zorunludur (Protokol 13).

## Maliyet/Ölçek Notu
- **Ek maliyet:** yeni servis 0, yeni bağımlılık 0.
  - Redis'te idempotency anahtarları: tahmini <10 bin anahtar/gün × ≤64 KB, 24 sa TTL, pratikte birkaç MB.
  - AuditLogs'ta `app.write` kayıtları: tahmini tenant başına <2 bin/gün, toplu işlem tek kayıt. 365 gün TTL ile <1 GB/yıl.
- **Operasyon yükü:** X3 gözlem kipinden zorlamaya geçiş kararı; X1 grup değerlerinin kademeye göre ayarı.
- **Yeniden değerlendirme eşikleri (sayısal):**
  - Web replika ≥2 **veya** `APP_ROLE` web/worker ayrı süreç → X9 + X10 + X11 birlikte (Redis tabanlı limiter/kota/invalidation).
  - Genel API anahtarı veya uzak MCP yüzeyi açılır **ya da** tek tenant 7 günlük toplam isteğin >%50'si → X9 (tenant/plan kotası).
  - 2. BullMQ kuyruğu veya kullanıcı/ajan tetiklemeli kuyruk işi → X7; ADR-0019 Aşama D veya ADR-0018 ajan koşusu → X8 + X22.
  - Aktif tenant >50, `MetricRollups` >500 MB veya >1000 metrik yazımı/dk → X16. Pod ≥3 veya nöbetçi ≥2 → X17 (ADR-0017 ile aynı).
  - Trendyol 429 oranı >%1 (grup bazında, 24 sa) **veya** stok yayın gecikmesi p95 >2 dk (7 gün) → X1 değerleri ve grup eşlemesi yeniden ele alınır.
  - Mutabakatla onarılamayan çoklu belge yazımı (ör. para/defter) tasarlanırsa → X14 (Atlas replica set var; yerel testler `mongodb-memory-server` replset).
  - İlk KVKK veri sahibi talebi veya 10 ücretli tenant → X18. İlk masaüstü sürümü sahada → X19.
  - Regülasyon/sözleşme "değiştirilemez denetim" isterse → hash zinciri/WORM (şimdi belki hiç).

## Etki Alanı
- X1: `integration/modules/common/http/*`, `integration/modules/marketplace/trendyol/*`, `integration/config/catalog/integrationHttp.ts`.
- X2: `api/services/{product,variant}-service.ts`, `operations/stock/*`, `database/client/models/Variant.ts`, `integration/engine/catalog/export/Sentinel.ts` (metrik).
- X3–X5: `api/RunOperation.ts`, `api/ApiManager.ts`, `Webserver.ts` (son işleyici), `platform/core/{idempotency,errors}`, `services/audit/AuditLogger.ts`, `database/application/models/AuditLog.ts`, `capabilities/rpc-input/*`. FE (bulut): `composables/restapi.ts` anahtar üretimi.
- X6: `Dispatcher`, `OrderQueueProducer`, `StockPublishTrigger`, `ImportOrchestrator` (tek kapı satırı).
- Çıta: `docs/PLATFORM_BASELINE.md` F bölümü.
- İlişkili ADR'ler: 0001, 0002, 0004, 0005, 0006, 0017, 0018, 0019, 0020, 0022, 0023, 0024, 0028, 0029.
- Çelişki: yok. ADR-0017'nin "/metrics şimdi yok" kararı aynen korunur.

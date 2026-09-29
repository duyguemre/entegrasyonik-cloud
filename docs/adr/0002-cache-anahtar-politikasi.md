# 0002 — Önbellek (`@Cache`) Anahtar Politikası ve Kapsamı

## Durum
Kabul edildi (2026-09-26). Uygulama Protokol 13'e bağlıdır (önce characterization testi). Canlıda olası sızıntının incelenmesi ve bildirim kararı insana aittir (aşağıda).

## Bağlam
BACKLOG C3; `DATA_ARCHITECTURE_AUDIT.md` L-03 ve §3.c; `INTEGRATION_ENGINE_STANDARDS.md` §12 (matris 9).
- `utils/decorator/cache.ts` süreç-içi tek bir `NodeCache` örneği kullanıyor; anahtar `<context>.<Class>.<method>-<keyFn(this)>-<argümanlar>`. `keyFn` isteğe bağlı; düz nesne argümanlar (`query`) anahtara `''` olarak giriyor.
- Trendyol/Hepsiburada/Pazarama `fetchOrders` ve `fetchClaims` (6 metot, TTL 1–30 sn) `keyFn` olmadan, yalnızca `integrationCode` ile cache'leniyor → tenant A'nın siparişleri (müşteri adı/adres/telefon) TTL içinde tenant B'nin sync'ine dönüp **B'nin DB'sine yazılabiliyor**; aynı tenant içinde farklı tarih penceresi sorguları da aynı (bayat) sonucu alıyor → kaçırılan sipariş.
- Diğer kullanımlar (toplam 26): `PlatformMappingProvider`, `CatalogOperations`, `ShipmentService` `that.clientId` ile tenant'lı (doğru); `ClientOperations.getStorageConfig` argümanda `clientId` taşıyor; kategori/nitelik servisleri tenant'sız ama pazaryeri-geneli katalog verisi.
- Sipariş servislerinde `clientId` yoksa `"UnknownClient"` sabitine düşülüyor (anahtara girse bile tenant ayırmaz).
- Invalidation yok (yalnızca TTL); `RedisService.setCache/getCache` yazılmış ama kullanılmıyor. Şu an tek süreç (web + işçiler aynı Node sürecinde), çok pod'lu çalışma doğrulanmadı.

## Değerlendirilen Alternatifler

**A. Decorator'ı zorunlu kapsamlı (scope) hale getir; tenant kapsamında `this.clientId` otomatik ve zorunlu, argümanlar kararlı hash ile anahtara girer; PII/işlem verisi cache'lenmez; depo süreç-içi NodeCache kalır (seçilen)**
- Artı: sızıntıyı yapısal olarak imkânsız kılar (tenant'sız anahtar üretilemez); ek altyapı yok; mevcut 26 kullanımın çoğu mekanik olarak taşınır.
- Eksi: çok pod'da invalidation pod-yerel kalır (TTL ile sınırlı bayatlık).

**B. Yalnızca mevcut decorator'a `keyFn` eklemeyi kural yap (API değişmeden)**
- Artı: en küçük değişiklik.
- Eksi: kural unutulursa aynı hata tekrar eder (bugünkü hatanın kökü tam olarak budur); sorgu nesnesi yine anahtara girmez.

**C. Paylaşımlı Redis önbelleğine geç**
- Artı: pod'lar arası tutarlı invalidation ve paylaşımlı isabet.
- Eksi: ağ gecikmesi ve serileştirme; Redis'te tenant verisi/sır birikmesi (Redis parolası şu an kapalı — C12); tek süreçli ölçekte fayda yok. Asıl sorun (anahtar politikası) depodan bağımsız.

**D. `@Cache`'i tamamen kaldır**
- Artı: en basit, sızıntı riski sıfır.
- Eksi: kategori/nitelik ve eşleştirme okumalarında pazaryeri kota ve DB yükü gereksiz artar; bu okumaların önbelleklenmesi meşru.

## Karar
`@Cache` decorator'ı zorunlu `scope` parametreli yeni bir API'ye geçirilir: `scope: 'tenant'` kapsamında anahtar otomatik olarak `this.clientId` + entegrasyon kimliği + tüm argümanların kararlı hash'inden oluşur ve tenant kimliği yoksa önbellek atlanır; sipariş/iade ve diğer PII/işlem verileri hiçbir kapsamda cache'lenmez; depo süreç-içi NodeCache olarak kalır.

Ayrıntılar:

1. **API:** `@Cache({ scope: 'tenant' | 'global', ttlSeconds, context, key?: (that, args) => string })`. `scope` zorunludur, varsayılanı yoktur (derleme hatası). Eski imza `@Cache(ttl, context, keyFn)` kaldırılır.
2. **Anahtar biçimi:** `t:<tenantId>:<integrationKey>:<context>.<Class>.<method>:<argHash>` (tenant) veya `g:<integrationKey>:<context>.<Class>.<method>:<argHash>` (global).
   - `tenantId`: decorator `this.clientId`'yi **otomatik** okur. Değer `null/undefined/''/"UnknownClient"` ise önbellek **atlanır** (orijinal metot çağrılır) ve hata loglanır — fail-closed, işlevsellik kırılmaz.
   - `integrationKey`: `this.integrationId` varsa o, yoksa `this.integrationCode`/modül sabiti. (Bir tenant'ta aynı pazaryerinden birden çok hesap desteklenirse `integrationId` zorunlu hale gelir.)
   - `argHash`: tüm argümanların anahtar-sıralı JSON serileştirmesinin SHA-1'i; serileştirilemeyen argüman (fonksiyon, döngüsel nesne, bağlantı) varsa önbellek atlanır. `safeKeyPart` kaldırılır. İsteğe bağlı `key` yalnızca argüman kısmını daraltmak için kullanılabilir; tenant/entegrasyon öneki her durumda decorator tarafından eklenir ve ezilemez.
3. **`global` kapsam** yalnızca tüm tenant'lar için aynı olan, kimlik bilgisinden bağımsız pazaryeri katalog verisine (kategori ağacı, kategori nitelikleri, sabit kargo firması listeleri) izinlidir; kullanıldığı her yerde tek satırlık gerekçe yorumu zorunludur.
4. **Cache'lenmesi yasak metotlar (her kapsamda):** sipariş, iade/talep, müşteri, mesaj, finansal hareket, fatura çekimi/yazımı; karar amaçlı stok/fiyat okumaları (zero-oversell ADR'si ile tutarlılık); kullanıcı/kimlik/rol verisi (ADR 0001'deki olası `tokenVersion` mikro önbelleği hariç, o da kullanıcı kapsamlı ve ayrı yardımcıyla); herhangi bir yazma operasyonu. Buna göre Trendyol/Hepsiburada/Pazarama `fetchOrders` ve `fetchClaims` üzerindeki 6 `@Cache` **kaldırılır**. API kotası baskısı cache ile değil, sipariş sync aralığı/pencere ayarıyla çözülür (kuyruk/engine ADR'si).
5. **Mekanik koruma:** jest içinde, kaynak ağacında `@Cache` bulunan metot adlarını tarayan ve adı `/(order|claim|customer|message|financ|invoice|stock|price|user)/i` ile eşleşen bir kullanım görürse başarısız olan bir test (ucuz "lint").
6. **Değer semantiği:** isabet kontrolü `has()` ile yapılır (falsy değerler yanlış ıska sayılmaz); boş dizi ve hata cache'lenmez (mevcut davranış korunur); NodeCache `useClones: true` (varsayılan) korunur — çağıranın döndürülen nesneyi değiştirmesi önbelleği bozmaz.
7. **Invalidation:** Birincil mekanizma TTL. Üst sınırlar: tenant yapılandırma/eşleştirme ≤ 600 sn, global katalog ≤ 24 saat. Ek olarak `invalidateTenantCache(tenantId, context?)` yardımcı fonksiyonu (önek taraması, `t:<tenantId>:` ile) şu yazma yollarında çağrılır: attribute/kategori/marka eşleştirme güncellemeleri, entegrasyon ayarı/kimlik bilgisi güncellemesi (`IntegrationFactory.clearCache` ile birlikte), tenant silme (ADR 0003). Invalidation pod-yereldir.
8. **Depo:** süreç-içi NodeCache kalır; `RedisService.setCache/getCache` bu ADR kapsamında kullanılmaz. Önbellekte sır içeren değerler (`getStorageConfig`, `getCachedClientIntegrations`) yalnızca süreç belleğinde tutulabilir; ileride Redis'e geçilirse bu metotlar Redis'e **taşınmaz** (sır Redis'e yazılmaz).
9. **Mevcut kullanımların taşınması:** `PlatformMappingProvider`, `CatalogOperations`, `ShipmentService` → `tenant`; kategori servisleri (Trendyol/Pazarama/Hepsiburada) → `global`; `ClientOperations.getStorageConfig` → ADR 0003 ile tenant başına depolama sırrı kalkacağı için env tabanlı yapılandırmaya dönüşür, önbelleğe gerek kalmazsa kaldırılır.
10. **Olası geçmiş sızıntı:** Canlıda aynı pazaryerinde birden çok aktif tenant çalıştıysa sızıntı gerçekleşmiş olabilir. Yalnızca **salt-okunur** bir tespit betiği hazırlanır (her tenant DB'sindeki siparişlerin pazaryeri satıcı/mağaza kimliğinin o tenant'ın entegrasyon ayarındaki satıcı kimliğiyle eşleşmediği kayıtları sayar). Canlıda çalıştırılması, bulunan kayıtların silinmesi ve KVKK kapsamında ihlal değerlendirmesi/72 saatlik bildirim kararı **insan kararıdır** (Protokol 7/12). Bu fabrika canlıya istek atmaz.

**Refactor, yeniden yazım değil:** decorator tek dosya (≈50 satır); API değişikliği derleyici tarafından tüm çağrı noktalarında zorlanır.

### Uygulama sırası
1. Characterization testi (local, mock mod, iki test tenant'ı): A ve B için aynı TTL penceresinde `fetchOrders` → bugün B'nin A'nın sonucunu aldığını belgeleyen test; aynı tenant için iki farklı `query` → aynı sonucu aldığını belgeleyen test.
2. 6 sipariş/iade `@Cache`'inin kaldırılması (en küçük, en acil adım; tek başına deploy edilebilir).
3. Yeni decorator API'si + anahtar üretimi + yasak metot testi; mevcut kullanımların taşınması.
4. `invalidateTenantCache` ve yazma yollarına bağlanması.
5. Tespit betiği (salt-okunur) → insan kararı.

## Gerekçe
- Sızıntının kök nedeni "tenant'ı anahtara koymayı unutmak"tır; kapsamı zorunlu kılıp tenant kimliğini decorator'a otomatik okutmak bu hata sınıfını kalıcı olarak kapatır (B bunu yapmaz).
- Sipariş/iade verisinin cache'lenmesinin iş faydası yoktur, zararı (PII sızıntısı + kaçırılan sipariş) kanıtlıdır; bu yüzden yasak listesi politika olarak yazılır.
- Tek haneli abone ve tek süreçli dağıtımda Redis önbelleği (C) ek gecikme, serileştirme ve sır saklama riski getirir; getirisi yalnızca çok replika ile ortaya çıkar. NodeCache zaten mevcut bağımlılık.
- Önbelleği tamamen kaldırmak (D) katalog okumalarında pazaryeri kotasını gereksiz tüketir.

## Maliyet/Ölçek Notu
- Ek servis veya bağımlılık yok (SHA-1 için Node `crypto`). Çalışma maliyeti: her önbellek çağrısında argüman serileştirme (küçük nesneler; ihmal edilebilir).
- Bellek: tenant kapsamlı anahtarlarla girdi sayısı tenant sayısıyla doğrusal artar; bugünkü TTL'lerle tek haneli tenant'ta birkaç MB mertebesi.
- Gözden geçirme eşikleri:
  - API/işçi **2 veya daha fazla replika** ile çalışır **ve** pod-yerel invalidation nedeniyle bayat eşleştirme/ayar kaynaklı hata ayda **1**'den fazla raporlanırsa → tenant yapılandırma önbellekleri için Redis (sırsız değerler) veya Redis pub/sub ile invalidation yayını değerlendirilir.
  - Süreç başına önbellek belleği **200 MB**'ı aşarsa → TTL/`maxKeys` sınırı veya Redis.
  - Pazaryeri çağrılarında 429 oranı toplam çağrıların **%1**'ini aşarsa → çözüm sipariş sync aralığı/pencere ayarı ve istemci tarafı rate limit (engine ADR'si); sipariş/iade cache'i yine yeniden açılmaz.
  - Bir önbelleğin isabet oranı 30 günlük ölçümde **%20**'nin altında kalırsa → o `@Cache` kaldırılır (ölçüm için anahtar önekine göre isabet/ıska sayacı eklenir).

## Etki Alanı
- `backend/src/utils/decorator/cache.ts` (API ve anahtar üretimi).
- `integration/modules/marketplace/{trendyol,hepsiburada,pazarama}/services/{OrderService,ClaimService}.ts` (`@Cache` kaldırılır), `…/CategoryService.ts` (`global`), `…/ShipmentService.ts` (`tenant`).
- `integration/modules/provider/PlatformMappingProvider.ts`, `operations/catalog/CatalogOperations.ts`, `operations/client/ClientOperations.ts`, `integration/modules/IntegrationFactory.ts` (invalidation bağlantısı).
- Eşleştirme/entegrasyon ayarı yazan API servisleri (`integration-service.ts`, `attribute-mapping` servisleri).
- `engine/order/OrderWorker.ts` davranışı dolaylı olarak (artık her job gerçek pazaryeri çağrısı yapar).
- İlgili ADR'ler: 0001 (kullanıcı kapsamlı mikro önbellek), 0003 (tenant silmede invalidation, depolama sırları), kuyruk/engine ADR'si (sync aralığı), zero-oversell ADR'si (stok okumaları).

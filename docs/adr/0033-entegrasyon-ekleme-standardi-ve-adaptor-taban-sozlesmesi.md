# 0033 — Entegrasyon ekleme standardı ve adaptör taban sözleşmesi

## Durum
Kabul edildi (2026-09-30). Belge tarafı tamam (`docs/INTEGRATION_PLAYBOOK.md` v1.0.0). Kod henüz değişmedi. İş paketleri INT-01..INT-08.
DB'yi değiştiren adım yok.

## Bağlam
Kullanıcı yönergesi (2026-09-30): pazaryeri sayısı artacak; her seferinde yeni bir şey icat etmeden pazaryeri, e-ticaret, ERP, e-fatura ve kargo
eklemek için güncel tutulan bir prosedür ve kurallar gerekiyor. Ek yönerge: overengineering yok.

Bulgular (salt okuma, 2026-09-30; kanıt `docs/audits/BACKEND_INTEGRATION_AUDIT_2026-09-30.md` §2.3 ve F-08/F-02/F-04/F-09/F-10):
1. **6 adaptörün `services/Service.ts` dosyası aynı işi kopyalıyor:** ResilientHttpClient kurulumu (`getSetting` + env düğmesi), mock/gerçek URL
   çözümleme (6 kopya, farklı regex ve farklı varsayılan portlar), `get/post/put` sarmalayıcıları (idempotent varsayılanları), hata sarma (84 tekrar).
   Tutarsızlık sonuçları gözlendi: Pazarama iki farklı mock portu (6011/3006), N11'de doğrudan `axios.post`.
2. **Kod modül dışında ~11 backend dosyasında elle listeleniyor** (`bizimhesap` taraması): fabrika, descriptor kaydı, `outboundHosts` (3 harita),
   `MockMode` tipi, `env.ts`, `config/catalog/mock.ts`, `codeToCategory`, `integrationHttp` kod listesi, provisioning, test koşucusu. Ön ek + mock tabanı
   dört yerde ayrı ayrı yazılı.
3. **Sayfalama tutarsız ve sessiz veri kaybı üretti:** HB/N11 tek sayfa (F-02), Ideasoft 4× tavansız `while(true)` (F-04/F-10); HB `paginateOffset.ts`
   ve Ideasoft `paging.ts` iki ayrı yerel yardımcı.
4. **Token yönetimi ortak değil:** Pazarama örnek başına bellekte, single-flight yok, gövde kodlanmamış; Ideasoft kopuk (C10) ve sır URL'de.
5. **Aynı dayanıklılık testleri 6 kez elle yazılmış** (`tests/characterization/common/*.resilience.contract.test.ts`, ~1.200 satır; 500/429/timeout/401/
   çift sarma/yazma 5xx senaryoları birebir aynı).
6. **FE'de her entegrasyon için ayrı ~160-200 satırlık form bileşeni** ve `v-if` zinciri (`MarketplaceView.vue`).
7. Adaptörler arası gerçek farklar (genelleştirilmemesi gereken): HB 4 taban URL, N11 REST+SOAP iki istemci, Trendyol V2 URL güvenlik ağı + servis grubu
   limitleri, Pazarama OAuth2, platforma özgü transformer'lar ve batch durum eşlemeleri.

İlgili kararlar: ADR-0006 (dayanıklılık), ADR-0018 (descriptor, drift), ADR-0019 (yetenek kaydı), ADR-0020 (ayar kataloğu), ADR-0022 (giden HTTP),
ADR-0025 (öznitelik çözümleme), ADR-0030 X1-X6, ADR-0032 (kanal durumu modeli), kategori belgesi `docs/INTEGRATION_CATEGORY_MODEL.md` §5.

## Değerlendirilen Alternatifler
1. **A1 — Yalnız belge (playbook), kod ortaklaştırması yok.** Artısı: sıfır kod riski. Eksisi: her yeni adaptör 6 kopyadan birini kopyalar,
   tutarsızlık (bulgu 1, 3, 4) çoğalır; kural uyumu insan dikkatine kalır.
2. **A2 — Tam genel adaptör çerçevesi** (her kategori için soyut `MarketplaceAdapter` sınıf hiyerarşisi, bildirimsel uç nokta tanımı, genel
   transformer DSL'i, kod üretimli connector'lar). Artısı: teoride en az kod. Eksisi: 6 adaptörün gerçek farklarını (bulgu 7) zorla tek kalıba sokar,
   13 çağıranlı `IPlatform`'u kırar, karakterizasyon testleriyle korunan davranışı yeniden yazım riskine sokar; tek haneli abone ölçeğinde
   karşılığı yok.
3. **A3 — Orantılı ortaklaştırma + playbook + iskelet üretici + conformance kiti.** Yalnız ≥2 adaptörde tekrarlanmış ve somut hata üretmiş kısım
   ortak yardımcıya/ince tabana alınır (HTTP kurulumu, URL/mock çözümleme, hata sarma, sayfalama, OAuth token önbelleği, kod tablosu); platforma
   özgü davranış adaptörde kalır; kurallar statik test ve parametrik test kitiyle zorlanır. Artısı: yeni adaptör maliyeti düşer, mevcut davranış
   korunur (refactor, yeniden yazım değil). Eksisi: bir süre eski ve yeni desen yan yana yaşar (aşamalı göç).

## Karar
**A3 seçildi:** `docs/INTEGRATION_PLAYBOOK.md` tek kaynak prosedürdür; F-08 ince taban (`AdapterHttpService` + yardımcılar) ve tek kod tablosu
(`ADAPTER_KEYS`) kurulur, `npm run integration:new` iskelet üretir, ortak senaryolar `tests/conformance` kitinde parametrik koşar, uyum statik testle
zorlanır. Mevcut 6 adaptör **aşamalı refactor** ile bağlanır; hiçbir modül yeniden yazılmaz.

### Karar 1 — F-08 adaptör taban sözleşmesi (orantılı)
`backend/src/integration/modules/common/adapter/` altında:

```ts
// Tek HTTP tabanı: ortak olan burada, platforma özgü olan override/hook.
export abstract class AdapterHttpService {
  protected readonly http: ResilientHttpClient;
  constructor(protected readonly key: AdapterKey, protected readonly params: AdapterParams,
              opts?: { clientSuffix?: string /* 'soap' */; policy?: Partial<ResilientPolicyConfig> /* groupRatePerMin vb. */ });
  // Politika: getSetting('resilience.timeoutMs|maxConcurrent|ratePerMin', {integrationCode}) + `<ENVPREFIX>_HTTP_TIMEOUT_MS` (bugünkü davranış birebir)
  protected abstract authConfig(): Promise<{ headers?: Record<string, string>; auth?: { username: string; password: string } }>;
  protected baseUrlFor(path: string): string;        // varsayılan: Integrations.urls.baseUrl || key.fallbackBaseUrl; HB açık eşleme tablosuyla override eder
  protected readonly mockHostPattern?: RegExp;       // gerçek host -> mock tabanı yeniden yazımı (tek regex, adaptörde)
  resolveUrl(url: string): string;                   // mock fail-closed (assertEndpointMockable + assertMockSafeUrl), göreli yol birleştirme
  get/post/put/delete(url, body?, opts?: CallOpts);  // CallOpts = { operation, group?, contract?, idempotent?, timeoutMs? }; okuma idempotent:true, yazma false
  protected fail(operation: string, err: unknown): never; // fromHttpError + çift sarma koruması (IntegrationError aynen geçer)
}
export class OAuthTokenCache {                       // Pazarama, Ideasoft ve gelecekteki OAuth adaptörleri
  constructor(fetchToken: () => Promise<{ token: string; expiresInSec: number }>, skewMs?: number /* 300000 */);
  get(force?: boolean): Promise<string>;             // single-flight (eşzamanlı istekler tek token çağrısı), 401'de bir kez invalidate+retry kancası
  invalidate(): void;
}
export function paginate<T>(fetchPage, opts: { kind: 'page' | 'offset' | 'cursor'; maxPages: number; ... }): Promise<T[]>; // tavan -> markIncomplete
export function buildInternalOrder(partial): IOrder; // ~60 ortak iç-model anahtarının varsayılanları (flags/dates/masking); alan eşlemesi adaptörde
```

- `IPlatform`'a yalnız **opsiyonel** `testConnection?(): Promise<{ ok; code?; detail? }>` eklenir; yeni adaptörler için zorunlu (playbook §2).
  `IPlatform` bölünmez (kategori belgesi §5).
- **Genelleştirilmeyen (adaptörde kalır):** connector uç nokta kümeleri, transformer'lar ve durum eşlemeleri, N11 SOAP zarfı ve ikinci istemci
  (`clientSuffix:'soap'` ile aynı taban), Trendyol `urlSafetyNet`/`productUrls`/`limits`, HB taban seçim tablosu, komisyon/kargo JSON'ları.
- Kalıtım derinliği 1'dir (adaptör `Service extends AdapterHttpService`); başka soyut katman açılmaz.

### Karar 2 — Tek kod tablosu `ADAPTER_KEYS`
`backend/src/integration/modules/adapterKeys.ts` (saf veri, `as const`): `{ code, category, mockPrefix, mockDefaultBase, envPrefix, fallbackBaseUrl? }`.
`MockPrefix` tipi, `env.ts` `MOCK_PREFIXES`, `config/catalog/mock.ts`, `outboundHosts.ts` `MOCK_PREFIX`/`MOCK_DEFAULT_BASE`, `codeToCategory`,
`integrationHttp` `INTEGRATION_CODES`, `run-tests.js` modül haritası buradan türetilir. **Host izin listesi** güvenlik incelemesi gerektirdiği için
`outboundHosts.ts::ALLOWED_OUTBOUND_HOSTS`'ta kalır (descriptor zaten oradan ithal ediyor). `IntegrationFactory` switch'i açık kalır (okunur,
mevcut eşitlik testi korur). Döngüsel içe aktarma olmaması için tablo hiçbir modülü içe aktarmaz.

### Karar 3 — Conformance kiti
`backend/tests/conformance/kit.ts` → `runAdapterConformance(spec)`; senaryolar C1-C14 (playbook §5.2). Yerel HTTP sunucusu
(`tests/helpers/localHttpServer.ts`) + `logCapture`; ağ yok, yeni bağımlılık yok. `skip` yalnız gerekçe metniyle. Kit yalnız ortak davranışı test eder;
platform iş kuralları adaptörün kendi testinde kalır. Mevcut 6 `*.resilience.contract.test.ts` kite taşındıkça silinir (senaryo eşleme tablosu PR'da).
Komutlar: `npm run test:module -- <kod>` (adaptör), `npm run test:conformance` (tümü).

### Karar 4 — İskelet üretici
`npm run integration:new -- --kind <marketplace|ecommerce|erp|einvoice|shipping> --code <kod> --name "<Ad>"`
(`backend/scripts/integration-new.js`, bağımlılıksız Node, şablonlar `backend/scripts/templates/integration/<kind>/`):
- **Oluşturur:** modül dizini (playbook §3.1: index/constants/descriptor/services/Service.ts(AdapterHttpService)/transformers/contracts/readme),
  descriptor'da kategori matrisinin Z yetenekleri `TODO` notlu `not_supported` olarak (testler kırmızı başlar), `tests/conformance/<kod>.conformance.test.ts`,
  transformer test iskeleti, `tests/fixtures/<kod>/` (`_source` alanlı örnek), `docs/research/INTEGRATION_<KOD>.md` (playbook §1 şablonu),
  `mockserver/backend/src/platforms/<kod>/` iskeleti (yalnız dizin varsa).
- **Mevcut dosyaları düzenlemez** (TS dosyalarına otomatik ekleme kırılgandır): `ADAPTER_KEYS`, fabrika, descriptor kaydı, `ALLOWED_OUTBOUND_HOSTS`,
  `integrationHttp` varsayılanları, provisioning, `INTEGRATIONS_REGISTRY.md`, playbook Ek A için **yapıştırılacak hazır parçacıkları** ekrana basar.
  Eksik kalanı statik uyum testi (Karar 5) yakalar — zorlayıcı test, üretici değil.
- Mevcut kodu, geçersiz kod adını (`^[a-z][a-z0-9]{1,23}$`) ya da var olan dizini reddeder; `--dry-run` yalnız listeler.

### Karar 5 — Güncel tutma ve statik uyum testi
`backend/tests/static/integrationPlaybook.static.test.ts` playbook §8.3'teki 9 denetimi uygular (kategori Z yetenekleri, resmi doküman, host eşitliği,
sözleşme minimumu, research/conformance dosyası, registry + Ek A satırı, playbook sürüm/günlük + referans yollar, modülde `console`/`axios`/zamanlayıcı yok).
Mevcut 6 adaptörün eksikleri **yalnız azalabilen** izin listelerindedir (ratchet); yeni kod listeye eklenemez. Her yeni entegrasyon ya da ortak altyapı
sözleşme değişikliği playbook'u aynı PR'da günceller (§8.1).

### Karar 6 — Webhook genelleştirme (tetikleyicili)
Bugün tek webhook rotası Trendyol. İkinci webhook'lu adaptör geldiğinde rota `/hooks/:code/:hookToken` olur, adaptör `webhook.ts` (`verify`, `parse`)
sağlar; kural "webhook = sinyal, polling = doğruluk" (playbook §4.10). Tetikleyici gelmeden genel rota yazılmaz.

### Karar 7 — FE bağlantı formu (tetikleyicili, bulut önyüz işi)
Descriptor'dan (`auth.requiredSettings` + alan meta verisi: etiket i18n anahtarı, sır mı, doğrulama) üretilen ortak form bileşeni, **yeni** pazaryeri
eklemenin 2. örneğinde açılır (INT-06). Mevcut 4 özel bileşen yerinde kalır; yalnız platforma özgü ekstra alanlar için bileşen yazılır.

## Gerekçe
- Tek haneli abone ölçeğinde asıl maliyet çalışma zamanı değil **her yeni entegrasyonun geliştirme ve bakım süresi**dir; ürün vaadi (sıfır aşırı satış,
  sessiz veri kaybı yok) tam da kopyalanan kodun tutarsız kısımlarında kırıldı (F-02, F-04, F-09). A3 bu kısmı tek yere alır, gerisine dokunmaz.
- A2 reddedildi: 6 adaptörün gerçek farkları (bulgu 7) tek soyutlamaya sığmaz; yeniden yazım gizli iş kuralı kaybı riski taşır (adr-writing özel kuralı:
  "daha kolay olur" gerekçesi yetmez). A3 bir **refactor**'dür; her adaptör göçünden önce karakterizasyon testleri vardır (6 resilience + transformer testleri),
  eksik olanlar önce yazılır (Protokol 13).
- A1 reddedildi: kural uyumunu insan dikkatine bırakır; statik test + kit olmadan playbook eskir.
- Yeni servis, yeni bağımlılık, yeni kalıcı veri yok. Üretici bağımlılıksız Node betiği; kit mevcut yardımcıları kullanır.

## Maliyet/Ölçek Notu
- Maliyet: INT-01..INT-08 toplam ~12-16 iş günü (tabloda). Çalışma zamanı maliyeti sıfır (aynı ResilientHttpClient, aynı politika değerleri).
  Operasyon yükü: yok. Bakım yükü: playbook'u PR başına güncellemek (dakikalar).
- Beklenen kazanç: yeni M boy pazaryeri ~8-12 iş günü (bugün ölçülen emsal yok; hedef, kit ve taban olmadan tahmini 12-18 gün).
- **Yeniden değerlendirme eşikleri (sayısal):**
  - Canlı adaptör sayısı **12'yi** geçerse ya da aynı kategoride **3+** adaptör aynı uç nokta desenini paylaşırsa (ör. 3 GraphQL e-ticaret): bildirimsel
    connector tanımı (A2'nin dar bir parçası) yeniden değerlendirilir.
  - Yeni bir adaptör taban sınıfın **2'den fazla** metodunu override etmek zorunda kalırsa: taban sözleşmesi gözden geçirilir (yanlış soyutlama sinyali).
  - İkinci webhook'lu adaptör: Karar 6 açılır. İkinci yeni pazaryeri formu: Karar 7 açılır.
  - İlk self-hosted mağaza (WooCommerce/OpenCart/Magento): tenant bazlı host izin modeli için ADR-0022 eki (playbook §7.3).
  - İlk on-prem ERP talebi (bulut API'si yok): aracı ajan kararı ayrı ADR (Protokol 12).
  - Conformance kiti koşu süresi **60 sn'yi** aşarsa: senaryolar adaptör başına paralel koşuya bölünür.

## Uygulama iş paketleri (BACKLOG'a eklenmek üzere; BACKLOG.md bu görevde değiştirilmedi)

| ID | Başlık | Kapsam | Boy | Bağımlılık | Kabul kriteri |
|---|---|---|---|---|---|
| INT-01 | F-08 adaptör tabanı | `common/adapter/{AdapterHttpService,OAuthTokenCache,paginate,buildInternalOrder}.ts` + birim testleri; IPlatform'a opsiyonel `testConnection` | M (3-4 g) | — | Birim testleri; 6 adaptör DEĞİŞMEDEN tüm takım yeşil |
| INT-02 | Tek kod tablosu `ADAPTER_KEYS` | tablo + 7 tüketicinin türetilmesi (host listesi hariç) | S (1 g) | — | `descriptor.registry`/`outboundHosts`/`env` testleri yeşil; mock tabanı tek yerde (Pazarama 6011/3006 tutarsızlığı karakterizasyon notuyla kapatılır) |
| INT-03 | Conformance kiti | `tests/conformance/kit.ts` C1-C14 + `test:conformance` betiği + `run-tests.js` modül girişi | M (2-3 g) | INT-01 (C14 için) | Kit Bizimhesap üzerinde yeşil (pilot) |
| INT-04 | Statik playbook uyum testi | `tests/static/integrationPlaybook.static.test.ts` (§8.3, ratchet izin listeleri) | S (1 g) | INT-02 (madde 3 için; öncesinde madde 3 atlanır) | Mevcut durumla yeşil; yeni sahte descriptor eksik alanla kırmızı |
| INT-05 | Mevcut 6 adaptörün tabana + kite bağlanması (aşamalı) | Sıra: Bizimhesap → Hepsiburada (F-02 ile) → Ideasoft (F-04/F-10 ile) → Pazarama (token önbelleği) → Trendyol (gruplar) → N11 (SOAP son). Adaptör başına: karakterizasyon eksikse önce yaz, `Service.ts`'i tabana taşı, kiti bağla, eski resilience testini sil | L (6 adım × 0,5-1,5 g) | INT-01, INT-03 | Her adım ayrı PR; davranış karakterizasyon testleriyle birebir; ratchet listesi küçülür |
| INT-06 | Descriptor tabanlı ortak FE bağlantı formu | alan meta verisi descriptor'a; ortak form (bulut önyüz) | M | Tetikleyici: 2. yeni pazaryeri | Yeni pazaryeri için özel bileşen yazmadan bağlantı kurulur |
| INT-07 | `buildInternalOrder` göçü | HB/Pazarama/Trendyol OrderTransformer ortak iskeleti yardımcıya | S (1 g) | INT-01 | Transformer karakterizasyon testleri birebir |
| INT-08 | İskelet üretici | `backend/scripts/integration-new.js` + şablonlar + `npm run integration:new` | S-M (1,5-2 g) | INT-01, INT-03, INT-04 | `--code demo --dry-run` doğru dosya listesi; üretilen iskelet derleniyor, `test:module -- demo` çalışıyor (kırmızı), statik test eksik dokunma noktalarını adıyla raporluyor |

Önerilen sıra: INT-02 ‖ INT-01 → INT-03 → INT-04 → INT-08 → INT-05 (aşamalı, F-02/F-04 ile birleştirilir) → INT-07; INT-06 tetikleyicili.
İlk yeni entegrasyon INT-08'den önce başlarsa playbook §3.3 tablosu elle uygulanır.

## Etki Alanı
- `backend/src/integration/modules/common/**` (yeni `adapter/`), `modules/adapterKeys.ts` (yeni), 6 adaptörün `services/Service.ts` (aşamalı),
  `interfaces/platforms/index.ts` (opsiyonel `testConnection`), `config/env.ts`, `config/catalog/{mock,integrationHttp}.ts`, `catalog/codeToCategory.ts`,
  `common/mock/MockMode.ts`, `common/security/outboundHosts.ts` (yalnız mock haritaları), `backend/tests/{conformance,static}/**`, `backend/scripts/`,
  `backend/package.json` (2 betik), `docs/INTEGRATION_PLAYBOOK.md`. FE: yalnız INT-06 (tetikleyicili).

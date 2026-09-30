# 0031 — Çalışma zamanı platform ayarları

## Durum
Kabul edildi (2026-09-30)

## Bağlam
Kullanıcı, kodda sabit duran yapılandırma değerlerinin (örnek: `BASE_IMAGE_URL = "https://images.entegrasyonik.com/products/"`) backoffice'ten yönetilebilir olmasını istedi ve bir sınır koydu: aşırı mühendislik yapılmayacak ("astarı yüzünü geçmesin").

Envanter: [HARDCODED_CONFIG_INVENTORY_2026-09-30.md](../audits/HARDCODED_CONFIG_INVENTORY_2026-09-30.md). Öne çıkan bulgular:
- Kaynak kodda sabit **sır yok**. Sırların hepsi env'de (ADR-0003 statik testi koruyor).
- Asıl sorun **görsel tabanı**. FE'de 7 dosyada sabit (FRONTEND_CLEANUP_PLAN X-02), BE'de 3 yerde (`Constants.ts:1`, `image-operations.ts:6-7`). Oysa bu değerin env'de bir karşılığı zaten var: `R2_PUBLIC_URL_IMAGE` (ADR-0027) + `IMAGE_FILES_PATH`. Sonuç: staging ve yerel ortam yanlış sunucuyu gösteriyor.
- FE yükleme tavanı 2 MB, BE tavanı 10 MB (`imagePolicy.ts:32`). Aynı kural için iki farklı kaynak var.
- Gerçek iş ayarlarının çoğu bugün **hiç yok**: uygulamada destek iletişimi, duyuru ya da bakım metni bulunmuyor. Kodda sabit duran R değerleri azdır (liste sayfa boyutu 25 ×7, rapor yoklama 5 sn ×2).
- Değerlerin büyük kısmı (pazaryeri host'ları, SSRF izin listesi, güvenlik tavanları, TTL'ler) **gerçek sabittir** ve kodda kalmalıdır.

Hazırda iki mekanizma var:
- `config/env.ts`: zod şeması, E ve S değerleri.
- **ADR-0020 yapılandırma motoru**: katalog (`SettingDef` + zod), taslak/yayın/geri alma/geçmiş (`IntegrationConfigRevisions/Heads`), 15 sn'lik `config-head-poll`, bellek içi `platformOverrideStore` (fail-open), gerekçe/onay kapısı, backoffice ayar ekranları.

`BACKOFFICE_PLAN.md` B11 da aynı motorda bir `platform` hedefini (`maintenance.*`, `features.*`) zaten planlamış.

## Değerlendirilen Alternatifler

1. **Yeni `PlatformSettings` koleksiyonu ve servisi** (anahtar izin listesi, zod, audit, geçmiş, önbellek).
   - Artı: basit tek belge, bağımsız.
   - Eksi: ADR-0020'nin taslak/yayın/geçmiş/audit/15 sn yayılım mekanizmasının ikinci kopyası olur. Yeni koleksiyon, göç ve yedek şartı getirir. Backoffice'te ikinci bir ayar ekranı deseni oluşur. Ölçeğe orantısız.
2. **ADR-0020 motoruna `_platform` hedefi eklemek** (B11'in genişletilmesi).
   - Artı: yeni koleksiyon, göç ve servis yok. Geçmiş, geri alma, audit ve yayılım bedava gelir. Backoffice mevcut ayar bileşenlerini yeniden kullanır.
   - Eksi: katalog tipinde (`SettingScope`/`SettingGroup`) küçük genişletmeler gerekir. Motorun etki analizi ve çapraz kontrolleri bu hedef için boş çalışır.
3. **Her şeyi env/derleme zamanında bırakmak** (`VITE_*` + BE env).
   - Artı: sıfır kod.
   - Eksi: destek telefonu ya da duyuru metni için yeniden dağıtım gerekir. Kullanıcının isteğini karşılamaz. FE ve BE görsel tabanı ayrı ayrı yapılandırılır ve birbirinden sapabilir.
4. **Dış uzaktan yapılandırma/bayrak servisi** (LaunchDarkly/ConfigCat benzeri, ya da headless CMS).
   - Eksi: aylık maliyet, dış bağımlılık, ikinci yetki sistemi. Tek haneli abone ölçeğinde gereksiz.

## Karar
Çalışma zamanı iş ayarları (R) **ADR-0020 motorunda yeni bir `_platform` hedefi** olarak tutulur. Önyüz, sır içermeyen izinli alt kümeyi tek bir `GET /api/public-config` ucundan açılışta bir kez alır. Ortam değerleri (E) env'de kalır ve bu uçla **salt okunur** yayılır. Sırlar (S) hiçbir koşulda DB'ye, UI'ya ya da public-config'e girmez. Gerçek sabitler (K) kodda kalır.

### Karar 1 — Sınıflandırma kuralı (yeni değer eklerken)
| Soru | Evet ise |
|---|---|
| Sızarsa zarar verir mi? | **S** → yalnız env |
| Ortama göre farklı mı, ya da yanlış değer altyapıyı bozar mı (URL tabanı, CORS, alan adı, depolama tavanı)? | **E** → env. En fazla public-config'e/backoffice'e salt okunur. |
| Ürün ekibi yeniden dağıtım yapmadan değiştirmek ister mi, ve yanlış değer yalnız görünümü ya da deneyimi etkiler mi? | **R** → `_platform` kataloğu |
| Hiçbiri | **K** → kodda. Tekrar varsa tek yerde toplanır. |

Güvenlik tavanları, TTL/saklama süreleri, dış API sözleşme host'ları ve SSRF izin listesi **R yapılmaz**. Bunları UI'dan gevşetmek saldırı yüzeyi ya da veri kaybı yaratır.

### Karar 2 — `_platform` hedefi (v1 kataloğu, 9 anahtar)
| Anahtar | Tip | Varsayılan | `danger` | `exposure` |
|---|---|---|---|---|
| `support.email` | e-posta ≤120 | `bilgi@entegrasyonik.com.tr` | safe | public |
| `support.phone` | `^\+?[0-9 ()-]{7,20}$` | `''` | safe | public |
| `announcement.enabled` | bool | `false` | safe | public |
| `announcement.level` | `info`/`warning` | `info` | safe | public |
| `announcement.text` | düz metin ≤280 | `''` | safe | public |
| `maintenance.enabled` | bool | `false` | caution | public |
| `maintenance.message` | düz metin ≤280 | `''` | safe | public |
| `ui.listPageSize` | enum 10/25/50/100 | `25` | safe | public |
| `ui.reportPollMs` | int 3000–60000 | `5000` | safe | public |

- `SettingDef`'e isteğe bağlı `exposure?: 'public'` alanı eklenir. Varsayılan yöneticiye özeldir; public-config yalnız `exposure:'public'` anahtarları döner.
- `features.<ad>` bayrakları (B11) **ancak gerçek bir bayrak doğduğunda** eklenir. v1'de boş kalır.
- Pazaryeri satıcı paneli ya da yardım linkleri bugün önyüzde yok. İhtiyaç doğarsa `links.<kanal>.sellerPanel` (https, host izin listesi yok, yalnız `https:` şeması) olarak eklenir. Şimdi eklenmez.
- `maintenance.enabled`'ın 503 ara katmanı B11'e aittir. Bu ADR yalnız anahtarı ve metni kataloğa koyar.

### Karar 3 — Görsel tabanı (`BASE_IMAGE_URL`)
Sınıf **E**. Tek kaynak backend env'idir, önyüz değeri public-config'ten alır, backoffice'te **salt okunur** görünür. Görevde önerilen yön benimsendi; tek fark aşağıda:
- **Yeni `PUBLIC_IMAGE_BASE_URL` env'i açılmaz.** ADR-0027'de aynı anlamı taşıyan `R2_PUBLIC_URL_IMAGE` (kova kökü) ile `IMAGE_FILES_PATH` (`products/`) zaten var. Eş anlamlı ikinci bir env, iki kaynağın ayrışması riskini geri getirir.
- BE'de tek çözümleyici: `config.images.publicRoot = R2_PUBLIC_URL_IMAGE || <eski kök>`, `productBaseUrl = publicRoot + '/' + IMAGE_FILES_PATH`, `clientBaseUrl = publicRoot + '/clients/'`. Eski kök (`https://images.entegrasyonik.com`) **yalnız `config/env.ts`'te, tek yerde** varsayılan olarak durur. Kullanıldığında `production`/`staging` ortamında `warn` loglanır. Eski kök, ADR-0027'nin `images.` alan adını kaldırma eşiği gerçekleşince silinir.
- Değer neden derleme sabiti (`VITE_*`) değil: arka yüz görsel URL'lerini DB'ye kendisi yazıyor. FE ile BE aynı kaynaktan okumazsa sapma kaçınılmaz, bugünkü X-02 hatası da tam olarak bu. Ayrıca Electron paketi tek derlemeyle farklı arka yüzlere bağlanabilir.
- Neden R değil: değer değişirse mevcut görsellerin tümü kırılır. Bu bir ürün kararı değil, altyapı kararıdır.
- Dikkat: FE'deki `VITE_IMAGE_BASE_URL` görsel **API'sinin** tabanıdır (upload/getImage), CDN tabanı değildir. Bu iş için kullanılmaz.
- Üretimde `R2_PUBLIC_URL_IMAGE` `cdn.` alan adını gösteriyorsa, eski multipart yolundan yüklenen yeni görsellerin URL'i `images.` yerine `cdn.` olur. İki alan adı aynı kovayı sunduğu için bu ADR-0027 yönüyle uyumlu. BE-CFG-1 kabul ölçütü bunu dağıtım öncesinde doğrular.

### Karar 4 — `GET /api/public-config`
- Kimlik doğrulama istemez: bakım ve duyuru metni giriş ekranında da gerekir. Genel hız sınırına tabidir.
- Her istekte DB okumaz. Yanıt, `platformOverrideStore` (15 sn yoklama) ile varsayılanların birleşiminden bellekte üretilir. `Cache-Control: public, max-age=30`, `ETag` = `_platform` yayın sürümü.
- Gövde:
  ```json
  { "version": 3, "env": { "images": { "productBaseUrl": "…", "uploadMaxBytes": 10485760 } }, "settings": { "support.email": "…" } }
  ```
  `env` bloğu **açık bir izin listesidir** (yalnız bu iki alan). `settings` bloğunda yalnız `exposure:'public'` anahtarları bulunur.
- Yayılım süresi: yayından sonra önyüze en geç ~45 sn içinde ulaşır (15 sn yoklama + 30 sn HTTP önbelleği). Önyüz açılışta alır ve 5 dakikadan eski ise rota değişiminde yeniden alır. Zamanlayıcı ya da SSE yok.
- ADR-0019 / PLATFORM_BASELINE E8 kararı: public-config bir MCP yeteneği **değildir** (kamuya açık, salt okunur açılış verisi). Yönetim tarafı mevcut `IntegrationConfigService` yeteneklerini miras alır.

### Karar 5 — Backoffice (ADR-0026)
- **Yeni yönetim ucu açılmaz.** `/admin-api` altındaki mevcut `IntegrationConfigService/*` işlemleri (`getEffectiveConfig`, `saveDraft`, `publish`, `rollback`, `history`) `target:'_platform'` ile kullanılır. Doğrulama katalogdaki zod ile, audit yayın revizyonu ile (yazar, gerekçe, fark), geçmiş `history(limit)` ile yapılır (ekran son 20'yi gösterir).
- Ekran: "Sistem ayarları" (BACKOFFICE_PLAN §1 satır 42, B11). İki bölümü var:
  - **Platform ayarları**: düzenlenebilir, mevcut `SettingField` bileşenleriyle.
  - **Ortam (salt okunur)**: `images.productBaseUrl`, `images.uploadMaxBytes`, `APP_ENV`. Her biri kilit simgesi ve "env'den gelir, değiştirmek için yeniden dağıtım gerekir" notuyla gösterilir. Sır, CORS ve bağlantı dizesi gösterilmez.

### Karar 6 — Veri ve göç
Yeni koleksiyon, indeks ve göç **yoktur**. `_platform` belgeleri ilk taslakta mevcut `IntegrationConfigRevisions/Heads` koleksiyonlarına tembel olarak (`getOrCreateDraft`/`upsert`) yazılır. Bu, motor ayarlarıyla aynı nitelikte bir yönetici çalışma zamanı yazımıdır, göç değildir. Buna rağmen herhangi bir uygulama adımı toplu veri değiştirmeye kayarsa (ör. eski `images.` URL'lerinin DB'de `cdn.`'e çevrilmesi) CLAUDE.md kural 3 geçerlidir: önce doğrulanmış yedek, sonra ayrı bir ADR ya da iş kaydı. Bu ADR böyle bir veri dönüşümü **önermez**.

## Gerekçe
Tek haneli abone ölçeğinde ayar değişikliği ayda birkaç kez olur. Gereken şeyler yeniden dağıtımsız değişiklik, doğrulama, kimin neyi değiştirdiğinin kaydı ve geri alabilmektir; ADR-0020 motoru bunların hepsini zaten sağlıyor. Yeni mekanizma kurmak (Alternatif 1) aynı işi ikinci kez yazmak olur. Dış servis (Alternatif 4) maliyet ve yeni yetki yüzeyi getirir. Bu yüzden eklenen maliyet katalog girdileri, bir hedef adı ve tek bir okuma ucuyla sınırlı kalıyor.

Yeniden yazım kararı yoktur. Değişiklikler mevcut modüllerin küçük genişletmeleridir.

## Maliyet/Ölçek Notu
- Ek servis ya da bağımlılık yok. Ek DB yükü yok: 15 sn yoklama zaten tüm hedefleri tek sorguyla okuyor. İstek başı maliyet bellek içi bir nesnedir.
- Operasyon yükü: 9 katalog anahtarı ve bir uç. Yeni R anahtarı eklemenin maliyeti bir katalog girdisi, bir tüketici ve bir testtir (PLATFORM_BASELINE E8 "tek kayıt" ilkesi).
- **Gözden geçirme eşikleri (sayısal):**
  - `_platform` anahtar sayısı **25'i** geçerse, ya da yayın sıklığı **haftada 3'ü** aşarsa: ayrı gruplama/ekran ve olası ayrı hedefler (`_platform.ui` vb.) değerlendirilir.
  - **Tenant'a özel** değer ihtiyacı doğarsa (beyaz etiket, tenant başına destek iletişimi): ADR-0020'nin tenant katmanı devreye alınır. Yeni mekanizma kurulmaz.
  - public-config trafiği sürekli **20 istek/sn'yi** ya da yanıt **8 KB'ı** aşarsa: CDN/kenar önbelleği ya da yanıtın statik dosyaya yazılması değerlendirilir.
  - ADR-0027 `images.` kaldırma eşiği gerçekleşince (son 30 günde 0 istek ya da DB'de `images.` URL'i kalmaması): eski kök varsayılanı `config/env.ts`'ten silinir ve `R2_PUBLIC_URL_IMAGE` üretimde zorunlu olur.
  - Bir R anahtarının yanlış değeri **bir olayda** gelir/veri kaybına yol açarsa: o anahtar `danger:'dangerous'` yapılır (iki kişi kuralı, ADR-0020 Karar 9.1) ya da E'ye geri çekilir.

## Etki Alanı
- BE: `config/env.ts` (görsel çözümleyici), `Constants.ts` (silinir), `services/image/image-operations.ts`, `api/services/product-service.ts`, `integration/config/{targets,types}.ts`, `integration/config/catalog/platform.ts` (yeni), `database/application/models/IntegrationConfig.ts` (hedef sabiti yorumu), `api/services/integration-config-service.ts` (`assertKnownTarget`, kapsam filtresi), public-config rotası (`Webserver`/`ApiManager`), yetenek/operasyon politikası kaydı.
- FE: `stores/publicConfig.ts` (yeni), `config/imageUrl.ts` (yeni, X-02), 7 görsel bileşeni, 3 yükleme bileşeni, 7 liste, 2 rapor, uygulama kabuğu (duyuru ve bakım şeridi, destek iletişimi).
- Backoffice: "Sistem ayarları" ekranı.
- Site: değişmez (derleme zamanı veri dosyası).

## Uygulama iş paketleri

Sıra: BE-CFG-1 bağımsızdır. BE-CFG-2 → BE-CFG-3. FE-CFG-1, BE-CFG-3'ün sözleşmesiyle (sahte yanıt fikstürü) paralel başlayabilir. BO-CFG-1, BE-CFG-2'ye bağlıdır.

### BE-CFG-1 — Görsel tabanı tek kaynak (S)
- `config/env.ts`'e `images.{publicRoot, productBaseUrl, clientBaseUrl}` çözümleyicisi eklenir (Karar 3). `Constants.ts` silinir. `image-operations.ts:6-7` ve `product-service.ts:396` çözümleyiciyi kullanır.
- Bağlama gelmişken yapılacak küçük düzeltme: `security-service.ts:98` ve `codes.ts:31` metinlerinden `admin.entegrasyonik.com` çıkarılır.
- **Kabul:**
  - (a) Env tanımsızken üretilen URL'ler bugünküyle **bayt bayt aynı** (karakterizasyon testi).
  - (b) `R2_PUBLIC_URL_IMAGE` tanımlıyken (sonda `/` olsun olmasın) `productBaseUrl` = `<kök>/products/`.
  - (c) Statik test: `backend/src` içinde `images.entegrasyonik.com` yalnız `config/env.ts`'te geçer.
  - (d) Üretim dağıtımından önce `cdn.` alanının `products/<clientId>/…` anahtarlarını sunduğu doğrulanır (tek HEAD isteği, dağıtım notuna yazılır).

### BE-CFG-2 — `_platform` hedefi ve kataloğu (M)
- `PLATFORM_TARGET = '_platform'` iki yerde tanımlanır (targets.ts + model), mevcut tutarlılık testi genişletilir. `SettingScope`'a `'platform'`, `SettingGroup`'a `'platform.support' | 'platform.announcement' | 'platform.maintenance' | 'platform.ui'` eklenir. `SettingDef.exposure?: 'public'` eklenir.
- `catalog/platform.ts`: Karar 2'deki 9 anahtar. Metin alanları HTML/kontrol karakteri reddeder.
- `assertKnownTarget` `_platform`'u kabul eder. `applicableSettingKeys` `platform` kapsamını yalnız `_platform`'a verir, diğer hedeflerden dışlar. `ConfigResolver` `_engine` ya da entegrasyon çözümlemesinde `platform` anahtarlarını görmez.
- Okuma yardımcısı: `getPlatformSetting(key)`, yani `platformOverrideStore` ile katalog varsayılanının birleşimi.
- **Kabul:**
  - (a) Mevcut ADR-0020 test paketi değişmeden yeşil.
  - (b) Sahte DB ile `_platform` için taslak → yayın → geçmiş → geri alma testi.
  - (c) Katalog tutarlılık testi: her `platform` anahtarının `consumers` dosyası var ve varsayılan zod'dan geçiyor.
  - (d) Geçersiz değer (`support.email:'x'`, `ui.listPageSize:30`) 400 VALIDATION döner.
  - (e) `maintenance.enabled` yayını gerekçe ister (`caution`).

### BE-CFG-3 — `GET /api/public-config` (S)
- Karar 4'teki gibi, kimlik doğrulamasız ve bellekten. Operasyon politikası/yetenek kaydında `/health` benzeri kamu istisnası olarak işaretlenir. MCP kararı: yok.
- **Kabul:**
  - (a) Yanıt anahtarları ⊆ izin listesi (`env.images.productBaseUrl`, `env.images.uploadMaxBytes`, `exposure:'public'` anahtarları). Katalogda `exposure` taşımayan bir anahtar eklenirse test kırılır.
  - (b) Sır deseni koruması: yanıt gövdesi `config/env.ts`'te sır olarak işaretli hiçbir env adını ya da değerini içermez (test sahte sır enjekte edip arar).
  - (c) İstek başına DB çağrısı yok (sahte model sayacı 0).
  - (d) `Cache-Control: public, max-age=30` ve `ETag` var; aynı sürümde `If-None-Match` 304 döner.
  - (e) Gövde 4 KB'ın altında.
  - (f) `.env.example` ve `docs/` altındaki API belgesi güncel.

### FE-CFG-1 (bulut) — public-config deposu ve sabitlerin taşınması (M)
- `stores/publicConfig.ts`: `main.ts` montajdan önce 3 sn zaman aşımıyla bir kez alır. Başarısız olursa yerleşik UI varsayılanlarına düşer (`listPageSize 25`, `reportPollMs 5000`; destek, duyuru ve bakım boş). Görsel tabanı boşsa yer tutucu görsel gösterilir. 5 dakikadan eskiyse rota değişiminde yeniden alır.
- `config/imageUrl.ts` (X-02 util): `productImageUrl(...)` depodan okur. 7 bileşendeki `baseImageURL` kaldırılır. URL **biçimi değişmez** (envanter §4.1).
- 3 yükleme bileşenindeki `maxSize` → `env.images.uploadMaxBytes`. 7 listedeki `25` → `ui.listPageSize`. 2 rapordaki `5000` → `ui.reportPollMs`.
- **Kabul:**
  - (a) Statik test: `frontend/src` içinde `images.entegrasyonik.com` geçmez.
  - (b) Depo birim testi: başarılı yanıt, zaman aşımı ve bozuk JSON durumlarında doğru varsayılanlar.
  - (c) e2e: public-config sahte fikstürle verilir; ürün görseli `src`'si bugünküyle aynı.
  - (d) `vue-tsc` ve mevcut e2e yeşil.
  - Bulutta arka yüz yok, yalnız fikstür kullanılır.

### FE-CFG-2 (bulut) — destek iletişimi, duyuru ve bakım şeridi (S)
- Uygulama kabuğunda duyuru şeridi (`announcement.*`; `role="status"`, `warning` seviyesi uygun renk belirteciyle). Bakım şeridi `maintenance.*` (B11'in 503 davranışıyla birlikte). Yardım menüsünde ve giriş ekranında destek e-postası (`mailto:`) ve telefon (`tel:`).
- **Kabul:**
  - (a) Değerler boşsa hiçbir öğe render edilmez.
  - (b) Metin düz metin olarak basılır (`v-html` yok).
  - (c) a11y denetimi (PLATFORM_BASELINE) yeşil.
  - (d) Görsel taban Windows'ta üretilir.

### FE-CFG-3 (bulut) — demo verisinin silinmesi (S)
- 7 tanım görünümündeki sabit demo satırları (kişisel veriye benzeyen e-posta/telefon, 42 geçiş) kaldırılır ya da boş durum bileşeniyle değiştirilir. FRONTEND_CLEANUP_PLAN dalgasına eklenebilir.
- **Kabul:** `frontend/src` içinde envanter F21'deki telefon deseni geçmez. Görünümler boş durumla render edilir.

### BO-CFG-1 — Backoffice "Sistem ayarları" ekranı (M)
- Karar 5. Mevcut entegrasyon ayar gövdesi ve `SettingField` bileşenleri `target:'_platform'` ile yeniden kullanılır. Sağda salt okunur "Ortam" bölümü. Geçmiş paneli son 20 revizyonu gösterir, geri alma mevcut işlemle yapılır.
- **Kabul:**
  - (a) E değerleri düzenlenemez (alan `readonly`, kaydetme isteğine girmez).
  - (b) zod hataları alanda gösterilir.
  - (c) Yayın gerekçe ister. Yayından sonra public-config ≤45 sn içinde yeni değeri döner (entegrasyon testi ya da elle doğrulama notu).
  - (d) Yetki: yalnız platformAdmin; mevcut `/admin-api` MFA/step-up kuralları aynen geçerli.

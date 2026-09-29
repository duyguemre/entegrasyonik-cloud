# 0013 — L-07 Yeniden Değerlendirme: Tenant Başına DB Kullanıcısı / R2 Kimlik Bilgisi mi, Ara Adımlar mı?

## Durum
**Kabul edildi (kullanıcı, 2026-09-27) — Seçenek 1: erteleme korunur + B1+B2+B3.** ADR-0003'ün Alternatif 2a kararı (tek uygulama DB kullanıcısı) ve 50 tenant eşiği DEĞİŞMEDİ; yalnızca ADR-0003 B.7 ve B.8'in iki maddesi bu ADR'nin §Kabul edilirse ADR-0003'te değişecek maddeler bölümüne göre güncellenir. B1 (rotasyon) insan onayı gerektirir (Protokol 12, ADR-0003 adım 7'nin zaten bekleyen işi — bu karar yeni bir insan adımı EKLEMEZ). B2+B3 kod işi — ayrı bir görevde uygulanacak.

İnsan onayı gerektiren adımlar (Protokol 12): Atlas'ta yeni uygulama kullanıcısı + özel rol oluşturma, eski kullanıcının iptali (rotasyon), R2 token yeniden oluşturma — hepsi ADR-0003 adım 7'nin zaten bekleyen işleridir; bu öneri yeni bir insan adımı eklemez, mevcut adıma bir ayar ekler.

## Bağlam
`BACKLOG.md` C5/C6/C12, `docs/backlog-detail/backlog-1e.md` L-07 (ilişkili: L-05, L-06, L-09, L-10, L-11), `DATA_ARCHITECTURE_AUDIT.md`, ADR-0003 §Alternatif 2 ve §Maliyet/Ölçek Notu (eşik: aktif tenant > 50 veya sözleşmeli talep → Alternatif 2b yalnızca o tenant(lar) için).

L-07'nin özgün ifadesi: "Tüm tenant'lar aynı sabit DB kullanıcısı ve aynı R2 anahtarıyla oluşturuluyor (kaynak kodda gömülü) → DB/depolama düzeyinde izolasyon yok; tek sızıntı tüm tenant'lar." Bu ifade iki ayrı sorunu birleştiriyor:
- **L-07a — sırların kaynakta/kayıtta durması** (sızıntı olasılığı): ADR-0003 B/C/E ile ele alındı.
- **L-07b — kimlik bilgisi düzeyinde tenant ayrımı olmaması** (sızıntının etki alanı): ADR-0003 bilinçli olarak erteledi.

### 1. Güncel durum tespiti (kod okumasıyla, 2026-09-27; ADR-0003/commit notlarına güvenilmeden)

**Tenant sayısı.** Local kopyada `entegrasyonikDB.Clients` = 1 kayıt, aktif tenant DB'si yalnızca `entegrasyonikClient_1` (`docs/DB_BACKUP_VERIFICATION.md:17,25`, `DATA_ARCHITECTURE_AUDIT.md:50`). Diğer 5 DB legacy (kodla erişilmiyor). Canlı Atlas'taki güncel tenant sayısı bu oturumda doğrulanamadı (canlı DB'ye dokunulmadı); 2026-09-26 yedeği aynı tabloyu gösterir. **Sonuç: 1 aktif tenant; 50 eşiğine 49 tenant uzaklık.** Tek haneli ölçek varsayımı geçerli.

**ADR-0003'ün "gerçek risk env'e taşıma + alan şifreleme + maskeleme ile kapandı" iddiası — doğrulama:**

| İddia | Kod durumu | Doğrulama |
|---|---|---|
| Kaynakta sabit Atlas/R2 sırrı yok | KAPANDI | `operations/tenant/tenantInfraDefaults.ts` yalnızca `{dbname, poolsize}` üretiyor; `src/` altında `mongodb+srv://kullanıcı:parola@` ve R2 anahtar deseni taraması boş; bekçi test `tests/.../no-hardcoded-secrets.static.test.ts` var. |
| Tenant kaydında DB/R2 kimlik bilgisi yok | KOD KAPANDI | `database/tenantConnection.ts:buildTenantDbConfig` kimliği yalnızca env'den (`DB_URL/DB_USER/DB_PASSWORD`) alır, kayıttaki `url/user/password`'ü okumaz; `dbname` regex ile doğrulanır (URL enjeksiyonu yok). `services/storage/storageEnv.ts:readStorageEnv` R2'yi yalnızca env'den okur, prod'da `-dev` bucket'ı reddeder. `TenantProvisioningService.ts:247-250` kayda yalnızca `dbConfig{dbname,poolsize}` yazar. |
| Pazaryeri sırları şifreli | KOD KAPANDI | `utils/FieldCrypto.ts` (AES-256-GCM, `enc:v1:`), `entegrasyonik.ts:113` `assertFieldCryptoConfig()` fail-fast; yazma yolu `integration-service.ts:100,293` ve Ideasoft `SecurityService.ts:104` şifreler; çözme yalnızca `IntegrationFactory.ts:104` ve Ideasoft `:94`. 4 characterization testi (`tests/characterization/secrets/`). |
| API yanıtında sır yok | KOD KAPANDI | `integrationSecrets.ts` maskeleme (`'sensitive'`), `ApiManager`/`ImageApiManager` çıkışında `responseSanitizer`. |
| **Canlıda uygulandı** | **AÇIK** | `dev-tools/migrate-tenant-infra-to-env.js` ve `migrate-encrypt-integration-secrets.js` dry-run varsayılanlı; canlıda `--apply` çalıştırılmadı. **Sızmış eski Atlas kullanıcısı ve R2 anahtar çifti hâlâ geçerli** (git geçmişinde ve `gitlab/…/backend.js` bundle'ında duruyor; rotasyon = ADR-0003 adım 7, insan onayı bekliyor — `MASTER_STATE.md` "Kalan işler" 2, BACKLOG C5). |

**Hüküm:** İddia **kod düzeyinde doğru, operasyonel düzeyde henüz doğru değil.** Bugün L-07'nin tarif ettiği "tek sızıntı → tüm tenant'lar" senaryosu fiilen açık, çünkü sızıntı zaten gerçekleşmiş (sır git geçmişinde) ve sızan kimlik bilgisi iptal edilmedi. Bu açığı tenant başına DB kullanıcısı değil, **rotasyon** kapatır.

**Keşfedilen iki ek bulgu (ADR-0003'te görünmeyen):**
1. **ADR-0003 B.7'nin önkoşulu sağlanmıyor.** B.7 "Bu kullanıcının yetkisi yalnızca Entegrasyonik'e ayrılmış cluster ile sınırlıdır; cluster'da başka projenin DB'si tutulmaz" der. Oysa `CLAUDE.md` kural 2: "Aynı cluster üzerinde başka projelere ait veritabanları bulunabilir." Tenant DB adları dinamik (`entegrasyonikClient_<n>`) olduğundan uygulama kullanıcısının büyük olasılıkla `readWriteAnyDatabase` / `atlasAdmin` benzeri geniş bir rolü var (Atlas'ta doğrulanamadı — insan kontrolü gerekir). Bu durumda Entegrasyonik uygulama kimliğinin sızması **başka projelerin verisini de** kapsar ve legacy DB'lere (gerçek müşteri verisi, `DB_BACKUP_VERIFICATION.md`) erişim verir. L-07b'nin bugünkü en büyük somut etki alanı tenant'lar arası değil, **projeler arasıdır**.
2. **R2'de mantıksal tenant ayrımı zaten büyük ölçüde var; eksik olan küçük.** `storageKeyPrefix()` (`t/<id>/`) hiçbir yerde çağrılmıyor, ama nesne anahtarları bugün zaten tenant'lı: `products/<clientId>/<productId>/…` (`image-service.ts:91,144`), `clients/<clientId>/…`, `exports/<clientId>/…` (`ExportOrchestrator.ts:261`, `StorageService.uploadExportArchive`); purge `StorageService.deletePrefix` bu üç öneki dizin sınırında (`<id>/`) siler. **Tenant'sız kalan tek yol:** geçici görsel kopyalama (`product-service.ts:342-345` → `products/temp/…` ve `products/<productId>` — clientId yok; `updateTempImageDocuments` URL'si de `${BASE_IMAGE_URL}${productId}/…`). Bu nesneler purge'de silinmez (KVKK açığı; backlog-1e "Depolama" planned kalemi ile aynı). Tek anahtarla `t/<id>/` şemasına göç **güvenlik kazanımı sağlamaz** (tek anahtar tüm önekleri okur; önek bir yetki sınırı değildir), yalnızca düzen birliği sağlar — ve gerçek R2'de nesne taşıma + insan onayı gerektirir.

**Ek gözlem (maliyet hesabını etkiler):** ADR-0003 B.6'daki "`useDb` ile tek havuz" önerisi uygulanmadı; `ClientDB` tenant başına ayrı `mongoose.createConnection` açıyor (`Database.ts:47`, `maxPoolSize` = kayıttaki `poolsize` = 20), LRU `max: 100`. Yani bugün de bağlantı sayısı tenant sayısıyla büyüyor (1 tenant'ta sorun değil; 50 tenant × 20 × pod sayısı = 1000+ bağlantı). Tenant başına DB kullanıcısı seçilirse `useDb` tek havuzu **kalıcı olarak imkânsızlaşır** (kimlik doğrulama bağlantı düzeyindedir).

## Değerlendirilen Alternatifler

### A. Tam çözüm — tenant başına Atlas DB kullanıcısı + tenant başına R2 kimlik bilgisi (ADR-0003 Alternatif 2b'nin tamamı)
Uygulama: provisioning'de Atlas Admin API ile `entegrasyonikClient_<n>` üzerinde `readWrite`+`dbAdmin` yetkili kullanıcı oluştur, parolayı `FieldCrypto` ile `Clients`'a yaz; `tenantConnection.ts` kayıttan kimlik okur; R2 için tenant başına bucket veya (Cloudflare'in geçici, önek kapsamlı kimlik bilgisi uç noktası — uygulama sırasında doğrulanmalı) kısa ömürlü kimlik bilgisi basan bir ara katman.
- **Artı:** Uygulama katmanında bir tenant-DB seçim hatasında (yanlış `dbname`) Mongo reddeder; sözleşmeli müşteriye "DB düzeyi izolasyon" denebilir.
- **Eksi (somut maliyet):**
  1. **Yeni yüksek yetkili sır:** Atlas Admin API programatik anahtarı (en dar rol: proje düzeyi "Database Access Admin"; yine de tüm DB kullanıcılarını yaratıp silebilir) ve Cloudflare API token'ı (R2 yönetimi). Bu anahtarlar uygulama sürecinde durmak zorunda (self-servis `register` için) → **uygulama sunucusu ele geçirilirse saldırgan her tenant için kimlik basabilir**; yani sunucu ele geçirme senaryosunda etki alanı küçülmez, büyür (bugünkü tek kullanıcıdan daha güçlü bir sır eklenir).
  2. **Korumadığı yer:** Tenant'lar arası gerçek sızıntı sınıfı (L-03 önbellek, L-04a/b ImportJobs filtresi) **paylaşılan ApplicationDB** koleksiyonlarında (`ExportSignals`, `ImportJobs`, `DeadLetterQueue`, `IntegrationOperationLogs`, `Tickets`, merkezi `Users`) ve Redis'te. Bunlar `clientId` alanlı ortak koleksiyonlar; tenant başına DB kullanıcısı bunlara hiç dokunmaz. Denetimde bulunan kritik izolasyon hatalarının hiçbiri bu çözümle engellenmezdi.
  3. **Provisioning'e dış çağrı + telafi:** Atlas API gecikmesi/hatası → `PROVISIONING_FAILED` durumları, yarım kalmış kullanıcıların temizliği, purge'de kullanıcı silme, yıllık parola rotasyonu işi.
  4. **Bağlantı havuzu:** `useDb` kapısı kapanır; 50 tenant × 20 = 1000 bağlantı/pod. Atlas katmanlarının bağlantı üst sınırları (paylaşımlı/Flex katmanlarda yüzlerle sınırlı — uygulamada doğrulanmalı) havuz boyutunu 3-5'e indirmeye zorlar.
  5. **Göç:** mevcut tenant(lar) için kullanıcı oluşturma betiği + kayıtları şifreli kimlikle güncelleme + bağlantı kodunun iki modlu geçişi + uygulama kullanıcısının ApplicationDB'ye daraltılması. Local'de tenant oluşturulamadığından (CLAUDE.md kural 5) yalnızca mock'lu test edilebilir; ilk gerçek doğrulama canlıda olur.
  - **Tahmini efor:** ~4-6 builder günü + her yeni tenant'ta dış API bağımlılığı + kalıcı operasyon yükü (Admin API anahtarı rotasyonu, kullanıcı rotasyonu, izleme).

### B. Hafif/ara adımlar (büyük patlama yok)
- **B1 — Rotasyonu tamamla (ADR-0003 adım 7):** Zaten karar verilmiş, kodu hazır. L-07'nin fiilen açık olan kısmını (geçerli sızmış kimlik) kapatır. Maliyet: insan zamanı (~1-2 saat), yeni kod yok.
- **B2 — Uygulama DB kullanıcısını açık DB listesine daralt:** Rotasyonda oluşturulacak YENİ uygulama kullanıcısına `readWriteAnyDatabase` yerine bir Atlas özel rolü verilir: `entegrasyonikDB` + `entegrasyonikClient_1 … entegrasyonikClient_N` (N önceden tahsis edilmiş, ör. 100) üzerinde `readWrite` + tenant DB'lerinde `createIndex`/`dropDatabase`/`listCollections` (autoIndex ve purge için). MongoDB, henüz var olmayan DB adlarına yetki tanımlamaya izin verir; `Counters.tenant_order` atomik ve numara yeniden kullanılmadığı için (ADR-0003 A.2) adlar öngörülebilir. Böylece **Atlas Admin API anahtarı uygulamaya hiç girmeden** etki alanı "Entegrasyonik'in DB'leri"ne iner: başka projeler ve legacy DB'ler korunur. Küçük kod eki: `TenantProvisioningService` `order > TENANT_DB_ROLE_MAX` (env) ise açık bir hatayla durur ve `order ≥ N-10` olduğunda uyarı loglar (sessiz auth hatası yerine). Maliyet: ~0.5 builder günü + rotasyon sırasında tek seferlik Atlas UI işlemi; N'ye yaklaşınca rolün genişletilmesi (yılda en fazla birkaç kez, tek haneli ölçekte muhtemelen hiç).
  - Alternatif B2': Entegrasyonik'i ayrı bir Atlas projesine/cluster'ına taşımak (B.7'nin asıl varsaydığı durum). Daha temiz ama ek cluster maliyeti + taşıma penceresi; B2 aynı etkiyi ücretsiz verir.
- **B3 — R2: mevcut `<tür>/<clientId>/` düzenini kanonik tenant öneki kabul et, `t/<id>/` göçünü iptal et, yalnızca tenant'sız geçici/kopya yolları düzelt:** `products/temp/` ve `products/<productId>` yazımları `products/<clientId>/…` altına alınır (yeni yazımlar için; eski geçici nesneler geçici olduğundan göç gerekmez, varsa kalanlar tek seferlik bir listeleme betiğiyle — insan onayıyla — temizlenir). `storageKeyPrefix()` ya bu düzeni üretecek şekilde güncellenir ya da silinir. R2 token'ının yalnızca iki bucket'a kapsamlı olduğu rotasyon sırasında doğrulanır (ADR-0003 B.8, zaten karar). Maliyet: ~0.5 builder günü (characterization testi + yol düzeltmesi), gerçek R2'de nesne taşıma yok.
- **B4 (isteğe bağlı, ayrı karar) — Paylaşılan ApplicationDB koleksiyonları için uygulama düzeyi tenant koruması:** `clientId`'li ortak modellerde (`ImportJob`, `ExportSignal`, `ExportFlag`, `DeadLetterQueue`, `IntegrationOperationLog`, `Ticket`) sorgu filtresinde `clientId` yoksa hata veren bir Mongoose sorgu ara katmanı (plugin); bilinçli çapraz-tenant sorgular (admin/worker) açık bir seçenekle (`{ crossTenant: true }`) işaretlenir. L-04a/b'nin tekrarını yapısal olarak engeller — yani gerçekte yaşanmış hata sınıfını hedefler. Maliyet: ~1-2 builder günü (bu modelleri kullanan ~29 dosyadaki çağrıların sınıflandırılması + testler). L-07'nin doğrudan kapsamı değil; burada yalnızca "Alternatif A'nın koruyamadığı yer" olduğu için anılıyor.

### C. MongoDB view tabanlı / alan bazlı erişim kontrolü (`clientId` filtreli view + tenant başına rol)
- **Artı:** Paylaşılan koleksiyonlarda DB düzeyinde satır filtresi.
- **Eksi:** Enforce edilebilmesi için yine tenant başına kullanıcı gerekir (view'a yetki kullanıcıya verilir) → Alternatif A'nın tüm maliyetini taşır, üstüne view bakımını ekler; view'lar salt-okunurdur, yazma yolu korunmaz; MongoDB'de yerleşik satır düzeyi güvenlik yok. **Reddedilmesi önerilir.**

### D. Yalnızca yüksek riskli/talep eden tenant'lar için opsiyonel ayrım
- ADR-0003'ün mevcut eşiği zaten budur ("sözleşmeyle talep → o tenant(lar) için 2b"). Değerlendirme: talep geldiğinde en ucuz ve en inandırıcı biçim çoğunlukla tenant başına kullanıcı değil, **o tenant için ayrı cluster/proje** (bağımsız yedek, ağ erişim listesi, şifreleme anahtarı; `dbConfig`'e isteğe bağlı `clusterRef` alanı + env'de ikinci bağlantı dizesi). Bu, Atlas Admin API'yi uygulamaya sokmadan elle, tenant başına bir kez yapılır. **Tetikleyici olarak korunması önerilir, şimdi uygulanması önerilmez.**

### E. Hiçbir şey yapma (ADR-0003'ü olduğu gibi koru)
- **Artı:** Sıfır iş.
- **Eksi:** B.7'nin sağlanmayan önkoşulu (başka projelerin DB'leri aynı cluster'da) ve R2 geçici yol açığı belgesiz kalır; "R2 önek göçü" açık kalemi gereksiz yere gerçek R2 + insan onayı gerektiren bir iş olarak backlog'da durur.

## Önerilen Karar (insan onayı bekliyor)
**ADR-0003'ün ertelemesini (tenant başına DB kullanıcısı/KMS yok, eşik 50 tenant veya sözleşmeli talep) koru; buna ek olarak üç ucuz ara adım uygula: B1 rotasyonu önceliklendir, B2 yeni uygulama kullanıcısını açık DB listeli özel role daralt, B3 R2'de mevcut `<tür>/<clientId>/` düzenini kanonik say ve yalnızca tenant'sız geçici yolları düzelt (`t/<id>/` göçü iptal). B4 ayrı bir karar olarak önerilir; C reddedilir; A ve D eşik tetikleyicisi olarak kalır.**

Kullanıcının seçebileceği seçenekler (öneri sırasıyla):
1. **Önerilen:** Ertelemeyi koru + B1 + B2 + B3 (+ isteğe bağlı B4 ayrı görev).
2. Ertelemeyi koru + yalnızca B1 + B3 (B2'yi B2' ile, yani ayrı cluster'a taşımayla ileride çöz).
3. Ertelemeyi kaldır, Alternatif A'yı şimdi uygula (önerilmez; gerekçe aşağıda).

Kabul edilirse ADR-0003'te değişecek maddeler:
- B.7: "cluster'da başka projenin DB'si tutulmaz" varsayımı yerine "uygulama kullanıcısı yalnızca açık listelenmiş Entegrasyonik DB'lerine yetkilidir (ADR-0013 B2)".
- B.8: "tüm nesneler `t/<tenantId>/…` altına" yerine "tenant öneki `<tür>/<clientId>/` (products, clients, exports); tenant'sız yol yasak (ADR-0013 B3)". BACKLOG C5'teki "R2 anahtar öneki göçü" açık kalemi kapanır.

## Gerekçe
- **Doğru riski kapatmak:** Bugün L-07 senaryosunun fiilen açık olmasının nedeni izolasyon eksikliği değil, sızmış ve hâlâ geçerli kimlik bilgisidir. B1 (rotasyon) bunu kapatan tek adımdır; Alternatif A rotasyon olmadan anlamsızdır ve rotasyondan sonra kalan riski de çok az azaltır.
- **Etki alanı hesabı:** Tek süreçli çok-kiracılı bir uygulamada tüm tenant kimlikleri (veya onları basan Admin API anahtarı) aynı süreçte durur; sunucu ele geçirildiğinde tenant başına kimlik etki alanını küçültmez. Tenant başına kimliğin gerçek faydası yalnızca "uygulama yanlış tenant DB'sini seçerse" sınıfındadır — ama `dbname` ve kimlik aynı `Clients` kaydından seçildiği için yanlış kayıt seçimi yanlış kimliği de seçer; fayda marjinaldir. Denetimde bulunan gerçek tenant-arası hatalar paylaşılan koleksiyon/önbellek sınıfındadır (L-03, L-04) ve A bunları korumaz; B4 korur.
- **B2 en yüksek fayda/maliyet oranına sahip:** Rotasyon zaten yeni kullanıcı yaratmayı gerektiriyor; o anda rolü dar tanımlamak ek maliyet getirmez, yeni yüksek yetkili sır getirmez, ve bugünkü en geniş etki alanını (başka projeler + legacy DB'lerdeki gerçek veri) kapatır.
- **B3 bir işi küçültür:** `t/<id>/` göçü güvenlik kazancı olmayan, gerçek R2 ve insan onayı isteyen bir işti; mevcut düzen zaten tenant'lı. Açık kalan tek gerçek sorun (geçici yollar, purge'ün kaçırdığı nesneler) küçük bir kod düzeltmesidir.
- **Maliyet Bilinci (tek haneli ölçek, 1 aktif tenant):** A ≈ 4-6 gün + kalıcı dış bağımlılık + yeni yüksek yetkili sır; B1+B2+B3 ≈ 1 builder günü + zaten planlı insan adımı. A'nın getirdiği ek güvenlik, bu ölçekte ve bu tehdit modelinde, getirdiği ek hata yüzeyini karşılamıyor. Bu, ADR-0003'ün gerekçesini doğrular; yalnızca B.7 varsayımının bugün doğru olmadığını ekler.
- **Yeniden yazım yok:** Tüm adımlar mevcut modüllerde (provisioning, storage yolları) küçük refactor/ayar; hiçbir modül yeniden yazılmaz.

## Maliyet/Ölçek Notu
- **Önerilen seçeneğin maliyeti:** yeni servis/bağımlılık yok; yeni env: `TENANT_DB_ROLE_MAX` (sır değil). Operasyon: `Counters.tenant_order` N-10'a ulaştığında Atlas özel rolüne yeni DB adlarının eklenmesi (elle, dakikalar).
- **Alternatif A'nın maliyeti (karşılaştırma için):** Atlas Admin API + Cloudflare API anahtarları (yeni sırlar, rotasyonları), provisioning'de dış çağrı ve telafi, tenant başına ayrı bağlantı havuzu (`useDb` imkânsız), tenant başına parola rotasyon işi, göç betiği; ~4-6 builder günü + kalıcı yük.
- **Yeniden değerlendirme eşikleri (sayısal):**
  - Aktif tenant sayısı **50**'yi geçerse (ADR-0003 eşiği, değişmedi) → A veya D yeniden değerlendirilir.
  - Bir müşteri sözleşmesi/denetim (ISO 27001, SOC 2) DB düzeyi izolasyon isterse → o tenant için D (ayrı cluster/proje) önce değerlendirilir, A yalnızca D yetersizse.
  - Prod erişimli **2.** operatör eklenirse → ADR-0003'teki KMS eşiğiyle birlikte A'nın kimlik yönetimi kısmı değerlendirilir.
  - Uygulama katmanında tenant'lar arası veri sızıntısı olayı **≥ 1** yaşanırsa (canlıda veya testte, yanlış tenant DB'si seçimi kaynaklı) → A'nın DB kısmı; paylaşılan koleksiyon kaynaklıysa → B4 derhal.
  - `Counters.tenant_order` ≥ **N − 10** → B2 rolü genişletilir (kod uyarısı bunu tetikler).
  - Herhangi bir istemci bileşeni (yerel uygulama ADR-0007, MCP ADR-0009) DB'ye veya R2'ye doğrudan erişim isterse → asla paylaşılan kimlik verilmez; R2 için imzalı URL, gerekirse önek kapsamlı kısa ömürlü kimlik — bu noktada tenant başına R2 kimliği yeniden değerlendirilir.
  - Tenant başına bağlantı havuzu toplamı Atlas katmanının bağlantı sınırının **%60**'ını aşarsa → ADR-0003 B.6 `useDb` tek havuzu uygulanır (bu, A'yı seçmemenin korunması gereken bir avantajıdır).

## Etki Alanı
- **Backend (öneri kabul edilirse, builder'a):** `operations/tenant/TenantProvisioningService.ts` (`TENANT_DB_ROLE_MAX` sınırı + uyarı), `api/services/product-service.ts:338-365` (`copyTempImages`/`updateTempImageDocuments` yolları ve URL'si), `services/image/image-operations.ts` (`imageTempFilesPath`, `BASE_IMAGE_URL` yazım hatası — ayrı kalem), `services/storage/storageEnv.ts` (`storageKeyPrefix` güncelle/sil ve yorum), `services/storage/StorageService.ts:deletePrefix` (geçici yol kapsamı), `.env.example` (`TENANT_DB_ROLE_MAX`). B4 seçilirse: `database/application/models/{Import,Export,Common,Ticket}.ts` + çağıranlar.
- **Dokümanlar:** ADR-0003 B.7/B.8 notu, `BACKLOG.md` C5 ("R2 anahtar öneki göçü" kapanır, B2 eklenir), backlog-1e L-07 durumu.
- **İnsan (Protokol 12, mevcut adım 7'nin parçası):** yeni Atlas uygulama kullanıcısı + açık DB listeli özel rol; mevcut kullanıcının rolünün geniş olup olmadığının kontrolü; eski kullanıcı ve R2 anahtar çiftinin iptali; R2 token kapsamının iki bucket'la sınırlı olduğunun doğrulanması; varsa tenant'sız geçici R2 nesnelerinin temizliği.
- **İlgili ADR'ler:** 0003 (ana karar; B.7/B.8 değişir), 0001 (uygulama katmanı izolasyonu), 0002 (önbellek anahtarı — L-03), 0007/0009 (istemci erişimi tetikleyicisi).

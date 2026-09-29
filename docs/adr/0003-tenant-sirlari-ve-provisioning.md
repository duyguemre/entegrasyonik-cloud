# 0003 — Tenant Provisioning, Tenant Sırlarının Saklanması, Maskeleme ve Tenant Silme/KVKK Uçları

## Durum
Kabul edildi (2026-09-26). Aşağıdaki adımlar **insan onayı gerektirir (Protokol 12):** sızmış kimlik bilgilerinin rotasyonu (Atlas DB kullanıcısı, R2 anahtarları, JWT sırrı, Zoho SMTP), git geçmişinin yeniden yazımı, canlı DB'de tekil indeks oluşturma ve sayaç tohumlama, canlıda veri şifreleme göçü ve kalıcı tenant silme (purge) işleminin canlıda çalıştırılması, legacy DB'lerin akıbeti.

## Bağlam
BACKLOG C5, C6, C12 (ve C2'nin `deleteClient` kısmı); `SAAS_CORE_AUDIT.md` §3, §12; `DATA_ARCHITECTURE_AUDIT.md` L-05, L-06, L-07, L-10, L-11, §5, §6, §8; `docs/research/1f-findings.md` §5 (KVKK).
- Tenant oluşturma iki kopya akışta (`SecurityService.register`, `AdminService.createClient`): `order = max+1` atomik değil, `Clients.order/clientId/dbConfig.dbname` üzerinde tekil indeks yok → eşzamanlı iki kayıt aynı tenant DB'sine düşebilir. Adımlar atomik değil, hata olunca geri alma yok; mass-assignment (`...clientData`, `...userData`, `strict:false`).
- Her tenant kaydına kaynak koda gömülü aynı Atlas kullanıcı/parola ve aynı R2 anahtar çifti düz metin yazılıyor; bu değerler git geçmişinde ve `gitlab/…/backend.js` bundle'ında da var.
- Pazaryeri API anahtarları (`ClientIntegrations.settings`), `Clients.dbConfig.password`, R2 anahtarları, OAuth token'ları düz metin; `getClientIntegrations`, `getUsers`, login/register ve `AdminService.getClients` bu alanları (parola özeti dahil) yanıtta döndürüyor; hata yanıtları istek gövdesini geri yansıtıyor.
- Merkezi `Users.email` tekil değil; `clientId` tipleri tutarsız (ObjectId/Number).
- `deleteClient` yalnızca merkezi `Clients`+`Users` kaydını siliyor; tenant DB, R2 nesneleri, merkezi kuyruk/log kayıtları ve önbellekteki bağlantı kalıyor (L-08 sıcak döngüsü). KVKK dışa aktarma/silme uçları yok.
- Local kopyada gerçek müşteri verisi ve muhtemelen gerçek entegrasyon kimlik bilgileri var (C13).

## Değerlendirilen Alternatifler

### 1. Atomik tenant numarası
- **a) `Counters` koleksiyonunda `findOneAndUpdate({_id:'tenant_order'}, {$inc:{sequence_value:1}}, {upsert:true, new:true})` + `Clients` üzerinde tekil indeksler (seçilen):** koleksiyon ve desen zaten var (ticket numarası); indeksler ikinci savunma hattı. Eksi: tek seferlik sayaç tohumlama gerekir.
- **b) Yalnızca tekil indeks + çakışmada yeniden dene (`max+1` korunur):** ek koleksiyon yok; eksi: yarışta hata/yeniden deneme mantığı, silinen tenant numarasının yeniden kullanılması (yanlış tenant'a eski veri/log bağlanması riski).

### 2. Tenant başına DB kullanıcısı
- **a) Tek uygulama DB kullanıcısı, bağlantı bilgisi yalnızca env'de; `Clients.dbConfig` yalnızca `dbname` (+ `poolsize`) tutar (seçilen).** Eksi: DB düzeyinde tenant izolasyonu yok (izolasyon uygulama katmanında: ADR 0001 + DB adı).
- **b) Tenant başına Atlas DB kullanıcısı (Atlas Admin API ile provisioning'de oluşturulur, parolası şifreli saklanır):** gerçek DB düzeyi izolasyon; eksi: Atlas Admin API anahtarı (yeni yüksek yetkili sır), provisioning'e dış çağrı ve hata telafisi, tenant başına ayrı bağlantı havuzu (100 tenant × 20 = 2000 bağlantı riski), rotasyon süreci. Tek haneli ölçekte maliyet/fayda olumsuz.

### 3. Pazaryeri sırlarının saklanması
- **a) Uygulama düzeyinde alan şifreleme, AES-256-GCM (Node `crypto`), anahtar env'de, anahtar sürümü (`kid`) ile (seçilen):** bağımlılık yok, DB dökümü/yedek/yanlış API yanıtı sızıntısına karşı korur. Eksi: uygulama sunucusu ele geçirilirse anahtar da ele geçer; anahtar yönetimi elle.
- **b) Bulut KMS ile zarf şifreleme (AWS/GCP KMS):** anahtar sunucuda durmaz, denetim izi var; eksi: yeni bulut sağlayıcı hesabı/IAM, istek başına ağ çağrısı veya veri anahtarı önbelleği, küçük ama sürekli maliyet ve operasyon yükü.
- **c) MongoDB CSFLE/Queryable Encryption:** sürücü düzeyinde şeffaf; eksi: `mongodb-client-encryption`/libmongocrypt bağımlılığı, KMS gereksinimi, `strict:false` serbest şemalı `settings` ile zor uyum, local geliştirmede karmaşıklık.

### 4. Tenant silme
- **a) İki aşamalı: yumuşak silme (askı + bekleme süresi) → zamanlanmış kalıcı silme (purge) (seçilen).**
- **b) Anında kalıcı silme:** basit; eksi: yanlışlıkla silme geri alınamaz (yedek dışında), abonelik anlaşmazlıklarında veri kaybı.

## Karar
Tenant oluşturma tek bir `TenantProvisioningService` içinde, `Counters` ile atomik numara ve tekil indekslerle, durum makineli ve idempotent adımlarla yapılır; tüm altyapı sırları (DB, R2, JWT, SMTP) yalnızca env'de tutulur ve tenant kayıtlarından kaldırılır, tenant'a özgü pazaryeri sırları env'deki sürümlü anahtarla AES-256-GCM alan şifrelemesiyle saklanır (KMS yok), sır alanları API yanıtlarında asla dönmez, tenant silme iki aşamalı (askı → 30 gün sonra purge) yapılır ve sahip-kademeli KVKK dışa aktarma/silme uçları eklenir.

Ayrıntılar:

**A. Provisioning (tek servis)**
1. `operations/tenant/TenantProvisioningService.provision(input)` tek giriş noktasıdır; `SecurityService.register` ve `AdminService.createClient` yalnızca bunu çağırır. Girdi, açık alan listesiyle (ad, soyad, e-posta, parola, isteğe bağlı mağaza adı) doğrulanır; `...spread` ile istemci verisi hiçbir modele yazılmaz. `updateClient` yalnızca izinli alanları (`title`, `status`, `integrations`) günceller; `dbConfig`, `order`, `clientId` API'den değiştirilemez.
2. **Tenant numarası:** `Counters` (`_id: 'tenant_order'`) üzerinde atomik `$inc`. Numara asla yeniden kullanılmaz (silinen tenant'ınki dahil). `Clients` üzerinde tekil indeksler: `order`, `clientId`, `dbConfig.dbname`; merkezi `Users` üzerinde küçük harfe normalize `email` tekil indeksi. Kanonik tenant kimliği `order` (Number) olup `clientId` her yerde aynı sayıdır; `Users.clientId`'nin ObjectId olarak yazılması sonlandırılır.
3. **Durum makinesi ve telafi:** `Clients.status`: `PROVISIONING` → `ACTIVE`; adımlar (Clients kaydı → merkezi Users → tenant DB tohumları → tenant içi Users) idempotent upsert'tür. Bir adım başarısız olursa kayıt `PROVISIONING_FAILED` olur, kullanıcıya hata döner; aynı işlem yeniden denendiğinde kalan adımlar tamamlanır, 24 saatten eski `PROVISIONING_FAILED` kayıtları purge işi (bkz. D) tarafından temizlenir. Çok dokümanlı/çok DB'li Mongo transaction kullanılmaz (local Mongo tekil düğüm; bu ölçekte telafi yeterli). ADR 0001 gereği yalnızca `ACTIVE` tenant'a istek kabul edilir.
4. **Kötüye kullanım:** `register` IP başına süreç-içi rate limit (ör. 3 kayıt/saat/IP) ve aynı e-postayla ikinci kayıt reddi (tekil indeks). E-posta doğrulaması MailService bağlandığında (Faz 2 planned) eklenir; bu ADR bunu önkoşul yapmaz.
5. Yeni tenant oluşturma kodu bu ADR'ye göre düzeltilene kadar local'de tenant oluşturulmaz (MASTER_STATE kuralı devam eder).

**B. Altyapı sırları (env'e taşıma, tenant kaydından kaldırma)**
6. **MongoDB:** Tenant bağlantıları env'deki uygulama bağlantı dizesinden kurulur; `Clients.dbConfig` yalnızca `dbname` ve `poolsize` tutar, `url/user/password` alanları göçle silinir. Önerilen uygulama: tenant bağlantıları ayrı havuz açmak yerine ana bağlantı üzerinden `useDb(dbname, { useCache: true })` ile alınır (tek havuz; bağlantı sayısı tenant sayısından bağımsız). Characterization testleri bu değişiklikte sorun gösterirse ayrı `createConnection` korunabilir; karar değişmez (kimlik bilgisi yine env'den).
7. **DB kullanıcısı:** tek uygulama kullanıcısı (tenant başına kullanıcı yok). **[ADR-0013 B2, 2026-09-27 ile güncellendi]** Bu kullanıcı yalnızca açık listelenmiş Entegrasyonik DB'lerine yetkilidir: rotasyonda (bkz. E) `readWriteAnyDatabase` yerine `entegrasyonikDB` + `entegrasyonikClient_1…N` (N önceden tahsis edilmiş bir üst sınır, Atlas'ta elle tanımlanır) üzerinde `readWrite` (+ tenant DB'lerinde `createIndex`/`dropDatabase`/`listCollections`) yetkili bir Atlas özel rolü verilir — "cluster'da başka projenin DB'si tutulmaz" varsayımı ARTIK ÖNKOŞUL DEĞİLDİR (aynı cluster'da başka projelerin DB'si bulunabilir; uygulama kimliği yalnızca kendi DB listesine yetkilidir). Kod tarafı: `TenantProvisioningService` env `TENANT_DB_ROLE_MAX` tanımlıysa ve yeni tenant `order`'ı bunu aşıyorsa açık bir hatayla provisioning'i durdurur (sessiz auth hatasına düşmez); `order ≥ N-10` olduğunda uyarı loglar; env tanımsızsa sınır uygulanmaz (geriye uyumlu). Kaynak koddaki sabit kullanıcı rotasyonla iptal edilir (bkz. E).
8. **R2:** tek erişim anahtarı env'de, yalnızca iki bucket'a (arşiv, görsel) yetkili kapsamlı token. Bucket adları env'de ve ortama göre ayrı (`-dev` bucket'ı prod'da kullanılmaz). **[ADR-0013 B3, 2026-09-27 ile güncellendi]** Tenant ayrımı anahtar önekiyle: mevcut ve kanonik şema `<tür>/<clientId>/…` (`products/<clientId>/…`, `clients/<clientId>/…`, `exports/<clientId>/…`) — tek anahtarlı `t/<tenantId>/…` önek şemasına göç güvenlik kazanımı sağlamadığı için (bir anahtar tüm önekleri okur; önek bir yetki sınırı değildir) İPTAL EDİLMİŞTİR. Tenant'sız yol YASAKTIR: geçici (taslak) ürün görselleri de artık `products/<clientId>/<tempId>/…` altına yazılır ve kalıcı ürüne kopyalanırken hedef de `products/<clientId>/<yeniÜrünId>/…` olur (`ProductService.copyTempImages`/`updateTempImageDocuments`, `ImageOperations.imageTempFilesPath(clientId, tempId)`). `Clients.archive/image` içindeki anahtar alanları göçle silinir; `getStorageConfig` env'den okur.
9. JWT sırrı ADR 0001'e göre env'de; SMTP kimlik bilgisi zaten env'de (rotasyonu gerekir).

**C. Tenant'a özgü sırlar: alan şifreleme**
10. Her entegrasyon tipi için sır alanı adları kodda bir kayıtta bildirilir (ör. `apiKey`, `apiSecret`, `appSecret`, `password`, `token`, `access_token`, `refresh_token`, `clientSecret`). Bu alanlar DB'ye `enc:v1:<kid>:<iv>:<ciphertext>:<tag>` biçiminde AES-256-GCM ile şifreli yazılır (her değer için rastgele 12 bayt IV). Anahtarlar env'de: `FIELD_ENCRYPTION_KEYS` (kid→32 bayt base64) ve `FIELD_ENCRYPTION_ACTIVE_KID`. Anahtar tanımsızsa süreç başlamaz.
11. Şifre çözme yalnızca adaptör yapılandırması kurulurken (`IntegrationFactory`) yapılır; çözülmüş değer loglanmaz, API yanıtına girmez, Redis'e yazılmaz.
12. Göç: idempotent betik düz metin değerleri şifreler (önekten tanır). Geçiş süresince okuma düz metni de kabul eder; betik tüm ortamlarda çalıştıktan sonra düz metin okuma yolu kaldırılır.
13. Anahtar rotasyonu: yeni `kid` eklenir ve aktif yapılır → yeniden şifreleme betiği çalışır → eski `kid` kaldırılır. Planlı rotasyon yılda bir veya anahtar sızıntı şüphesinde derhal.
14. Sınır (açıkça kabul edilen): bu şifreleme DB dökümü, yedek, local kopya ve API sızıntısına karşı korur; uygulama sunucusu ele geçirilirse korumaz. Mevcut yedekler ve local kopya düz metin içermeye devam eder; bu nedenle bu kopyalar Protokol 7'ye göre maskelenmeli, tenant'lara pazaryeri anahtarı yenileme önerisi yapılıp yapılmayacağı insan kararıdır.

**D. Maskeleme kuralı (API yanıtları)**
15. Asla yanıtta dönmeyen alanlar: parola özeti, `tokenVersion`, kilit sayaçları, `Clients.dbConfig` (tamamı), depolama anahtarları, entegrasyon sır alanları (C.10 listesi), JWT/OAuth token'ları, captcha değerleri.
16. Entegrasyon sır alanları yanıtta: değer varsa sabit `'sensitive'`, yoksa `''` (FE'nin mevcut sözleşmesi). Güncellemede gelen değer `'sensitive'` ise mevcut değer korunur; `''` ise alan temizlenir; başka bir değer yeni sırdır ve şifrelenerek yazılır. Böylece sır alanları "yalnızca yazılabilir" olur.
17. Birincil mekanizma servis düzeyinde açık projeksiyon/DTO'dur (`getUsers`, `getClientIntegrations`, `getClients`, login/register profil DTO'su — ADR 0001). Son savunma hattı olarak API katmanında, yanıt gövdesinde C.15 listesindeki anahtar adlarını silen ve bu olayı loglayan küçük bir temizleyici çalışır (tetiklenmesi bir hata sinyalidir). Hata yanıtları istek gövdesini içermez. Aynı anahtar listesi Faz 2 yapılandırılmış log redaction'ında kullanılır.

**E. Kaynak koddaki sabit sırların kaldırılması ve rotasyon (Protokol 12 — insan onayı)**
18. Sıra: (1) kod sırları env'den okuyacak şekilde değiştirilir ve sabitler kaynak koddan silinir (B, C, ADR 0001) → (2) yeni değerler insan tarafından üretilip ortam değişkenlerine girilir, deploy edilir → (3) eski değerler iptal edilir: Atlas DB kullanıcısı, R2 anahtar çifti, JWT sırrı (tüm oturumlar düşer), Zoho SMTP parolası → (4) git geçmişinin yeniden yazımı ve `gitlab/…/backend.js` bundle'ının depodan çıkarılması ayrı bir insan kararıdır; rotasyon yapıldıktan sonra geçmişteki değerler geçersiz olduğundan bu adım güvenlik açısından ertelenebilir, repo boyutu (≈437 MB pack) açısından ayrıca değerlendirilir.
19. Fabrika ajanları hiçbir sır değeri üretmez, yazmaz, commit etmez; `.env.example` yalnızca değişken adlarını içerir.

**F. Tenant silme (`deleteClient`) ve KVKK uçları**
20. **Yumuşak silme:** `AdminService.deleteClient` (`platformAdmin`) veya sahip tarafından `TenantDataService.requestDeletion` (`owner`, parola yeniden doğrulaması + tenant adının yazılması) → `Clients.status = 'DELETION_PENDING'`, `deletionScheduledAt = şimdi + 30 gün`; giriş engellenir (ADR 0001 `ACTIVE` kontrolü), işçiler bu tenant'ı atlar (Dispatcher/Orchestrator döngüsü kesilmez — L-08 düzeltmesi: bulunamayan/aktif olmayan tenant atlanır, döngü devam eder), zamanlanmış sync işleri iptal edilir. Bekleme süresinde `platformAdmin` geri alabilir.
21. **Kalıcı silme (purge işi):** süre dolunca: tenant DB'si drop edilir; R2'de `t/<tenantId>/` öneki silinir; ApplicationDB'de `clientId`'ye bağlı `ExportSignals`, `ExportFlag`, `ImportJobs`, `IntegrationOperationLogs`, `DeadLetterQueue`, `Tickets` ve merkezi `Users` silinir; BullMQ'daki tenant işleri kaldırılır; ClientDB LRU girdisi, `IntegrationFactory` ve `invalidateTenantCache` (ADR 0002) temizlenir. `Clients` kaydı PII'siz bir mezar taşına indirgenir (`order`, `status:'PURGED'`, `purgedAt`, talep edenin `sub`'ı) — numara yeniden kullanılmaz. Olay `AuditLogs`'a yazılır. Yedeklerdeki kopyalar yedek saklama süresi dolunca kendiliğinden silinir; bu süre aydınlatma metninde belirtilir.
22. **Dışa aktarma:** `TenantDataService.exportTenantData` (`owner`) asenkron iş olarak tenant DB koleksiyonlarını (sır alanları hariç, C.15) NDJSON olarak zip'ler, `t/<tenantId>/exports/` altına yazar, 24 saat geçerli imzalı URL döndürür; dosya 7 gün sonra silinir. İstek ve indirme audit log'a yazılır.
23. **Son kullanıcı (ilgili kişi) talepleri:** Tenant veri sorumlusu, Entegrasyonik veri işleyendir. Tenant'ın kendi müşterisinin silme talebi için `CustomerService.anonymizeCustomer` (`admin` kademesi): `Customers` ve sipariş/iade/mesaj içindeki ad, e-posta, telefon, adres, TCKN/VKN alanlarını geri döndürülemez şekilde maskeler; fatura/sipariş kayıtları yasal saklama yükümlülüğü nedeniyle silinmez, yalnızca kişisel alanlar maskelenir. Yasal saklama süreleri ve aydınlatma metni içeriği hukuki değerlendirme gerektirir (insan kararı).
24. **Legacy DB'ler** (`entegrasyonik`, `entegrasyonik_client*`, sahipsiz gerçek veri): kod tarafından erişilmiyor; silme/arşivleme/saklama kararı insana aittir.

**Refactor, yeniden yazım değil:** iki kopya provisioning akışı tek serviste birleştirilir (extract); mevcut tohum davranışı (varsayılan kategori/marka/entegrasyon listesi) characterization testiyle sabitlenip korunur.

### Uygulama sırası
1. Characterization testleri (local, test tenant'ları; canlı DB yok): eşzamanlı iki `register` → bugün aynı `order`; login/register/`getUsers`/`getClientIntegrations` yanıtlarında sır alanları; `updateClient` ile `dbConfig` değiştirilebilmesi; `deleteClient` sonrası kalan veriler; tohum içerikleri.
2. Salt-okunur ön kontrol betiği: `Clients.order/clientId/dbname` ve merkezi `Users.email` (küçük harf) mükerrerleri. Mükerrer bulunursa indeks öncesi insan kararı.
3. `TenantProvisioningService` + `Counters` + tekil indeksler + mass-assignment kapatma (C6).
4. Maskeleme: DTO/projeksiyonlar + yanıt temizleyici + hata yanıtı hijyeni (C12'nin ifşa kısmı).
5. Env'e taşıma: DB bağlantısı, R2, (ADR 0001 ile JWT); tenant kayıtlarından kimlik alanlarının silinmesi göçü (C5 kod kısmı).
6. Alan şifreleme + göç betiği (C12'nin saklama kısmı).
7. İnsan: rotasyon ve deploy (Protokol 12); geçmiş temizliği kararı.
8. Tenant silme (yumuşak + purge işi), L-08 döngü düzeltmesi, dışa aktarma ve anonimleştirme uçları (Faz 2 KVKK kalemi).

## Gerekçe
- Tek haneli abone ölçeğinde tenant başına DB kullanıcısı ve KMS, yeni yüksek yetkili sırlar (Atlas Admin API, bulut IAM) ve ek hata yolları getirir; buna karşılık tehdit modelindeki gerçek riskler (kaynak kodda/geçmişte sır, API yanıtında sır, düz metin döküm/yedek) env'e taşıma + alan şifreleme + maskeleme ile kapanır.
- `dbConfig`'ten kimlik bilgisini tamamen kaldırmak, onu şifrelemekten daha basit ve daha güvenlidir: saklanmayan sır sızamaz. `useDb` ile tek havuz, 100 tenant'ta 2000 bağlantı riskini de ortadan kaldırır.
- `Counters` deseni kodda zaten var; tekil indeksler yarışın ikinci savunma hattıdır ve L-06'nın "iki tenant aynı DB" sonucunu imkânsız kılar.
- İki aşamalı silme, yanlışlıkla silmeye karşı ucuz bir sigortadır; purge işi KVKK silme yükümlülüğünü ilk kez gerçekten karşılar.
- `'sensitive'` sentinel'i FE'nin mevcut sözleşmesidir; korunması istemciyi kırmadan sırları yazılabilir-yalnız yapar.

## Maliyet/Ölçek Notu
- Ek servis/bağımlılık yok (Node `crypto`, mevcut `Counters`, mevcut BullMQ/zamanlayıcı ile purge işi). Yeni env değişkenleri: uygulama DB bağlantı dizesi (mevcut), R2 anahtarı ve bucket adları, `FIELD_ENCRYPTION_KEYS`, `FIELD_ENCRYPTION_ACTIVE_KID`.
- Operasyon yükü: yılda bir şifreleme anahtarı rotasyonu (betikli), purge işinin izlenmesi, yedek saklama süresinin belgelenmesi.
- Gözden geçirme eşikleri:
  - Aktif tenant sayısı **50**'yi geçerse, veya bir müşteri sözleşmesi/ISO 27001/SOC 2 denetimi anahtar yönetimi gereksinimi getirirse, veya prod erişimi olan **2.**'nci bir operatör kişi eklenirse → KMS ile zarf şifreleme (Alternatif 3b).
  - Bir tenant sözleşmeyle DB düzeyi izolasyon/ayrı cluster isterse veya aktif tenant sayısı **50**'yi geçerse → tenant başına DB kullanıcısı (Alternatif 2b) o tenant(lar) için.
  - `useDb` ile tek havuzda bağlantı bekleme süresi p95 **50 ms**'yi aşarsa → havuz boyutu artırılır; yine yetmezse ağır tenant'lar için ayrı havuz.
  - Ayda **5**'ten fazla KVKK/silme talebi gelirse → self-servis ilgili kişi portalı ve otomatik talep takibi değerlendirilir.
  - Kayıt ucuna rate limit'e rağmen günde **10**'dan fazla şüpheli/terk edilmiş kayıt oluşursa → provisioning e-posta doğrulamasından sonraya ertelenir.

## Etki Alanı
- Backend: `api/services/security-service.ts` (register), `api/services/admin-service.ts` (createClient/updateClient/deleteClient/getClients/getClientIntegrations), `api/services/user-service.ts` (getUsers/createUser/updateUser projeksiyonları, e-posta tekilliği), `api/services/integration-service.ts` ve `ecommerce-service.ts` (sır maskeleme/yazma), yeni `operations/tenant/TenantProvisioningService` ve `TenantDataService`, `database/DatabaseManager.ts` + `database/client/ClientDB.ts` + `database/Database.ts` (env tabanlı bağlantı, `useDb`), `database/application/models/{Client,User,Common}.ts` (indeksler, durum alanları), `database/client/models/ClientIntegration.ts`, `operations/client/ClientOperations.ts` (`getStorageConfig`), `integration/modules/IntegrationFactory.ts` (şifre çözme), görsel/arşiv yol üreticileri (`image-service.ts`, `services/image/image-operations.ts`, `product-service.ts`, `ExportOrchestrator.ts`), `Dispatcher.ts`/orkestratörler (aktif olmayan tenant'ı atlama), `ApiManager.ts` (yanıt temizleyici, hata yanıtı).
- Frontend: entegrasyon ayar formlarında `'sensitive'` sözleşmesinin tüm sır alanlarına genişlemesi; hesap/tenant silme ve dışa aktarma ekranları (Faz 2/3).
- Altyapı/insan: Atlas kullanıcı rotasyonu, R2 token yeniden oluşturma, Zoho SMTP, env değişkenleri, yedek saklama politikası.
- İlgili ADR'ler: 0001 (kademeler, `ACTIVE` kontrolü, profil DTO, JWT sırrı), 0002 (tenant silmede invalidation, sırların Redis'e yazılmaması).

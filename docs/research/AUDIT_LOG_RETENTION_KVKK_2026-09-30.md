# Denetim Kaydı ve Uygulama Logu Saklama Süresi — Mevzuat Araştırması

Tarih: 2026-09-30 (tüm erişim tarihleri bu gün). Bu belge hukuki tavsiye DEĞİLDİR; hukukçu teyidi gereken noktalar en altta.
Güven etiketleri: R = resmi kaynak okundu (içerik doğrudan çekildi), İ = ikincil kaynak (hukuk bürosu/portal), S = arama özeti (kaynak sayfası tam okunamadı).
Not: Araç sınırları nedeniyle mevzuat.gov.tr ve kvkk.gov.tr PDF'leri (5651 Kanunu, Veri Güvenliği Rehberi) ham okunamadı; bunlar S/İ olarak etiketlendi.

## 1. Önerilen süreler

| Veri | Şu an | Öneri | Gerekçe |
|---|---|---|---|
| AuditLogs (kim/ne/hedef/önce-sonra/sonuç) | TTL 365 gün | 365 gün KALSIN (uzatma yok). İsteğe bağlı: enterprise sözleşmesinde 24 aya kadar seçenek | Yasal asgari süre yok (Bulgu 1-3); güvenlik/itiraz/ihtilaf çözümü için 1 yıl sektör çıtası (bölüm 4). Ölçülülük ilkesi uzatmayı zorlaştırır |
| AuditLogs içindeki IP | 365 gün, açık | 90 gün sonra IP'yi maskele (son oktet/son 80 bit sıfırla) veya alanı sil; kayıt kalır | IP kişisel veri sayılır; olay soruşturması için ilk 90 gün yeterli. YALNIZCA sürümde kolay eklenebiliyorsa yap; yoksa 365 gün + politikada gerekçe yeterli |
| LogEvents warn+ | 14 gün | 14 gün uygun; güvenlik-ilişkili (auth başarısız, yetki reddi) olanlar AuditLogs'a yazılıyorsa yeterli. İstenirse 30 gün | Operasyonel amaç; kişisel veri içermemeli (PII maskesi) |
| LogEvents info | 3 gün | 3 gün uygun | Aynı |
| ErrorEvents (gruplanmış özet) | (belirtilmedi) | 90 gün; PII/IP içermiyorsa 180 güne kadar | Kişisel veri içermeyen istatistiksel özet; ölçülülük riski düşük |
| Silme/imha işlem kayıtları (varsa) | - | En az 3 yıl | Silme Yönetmeliği zorunluluğu (Bulgu 2, R) |
| Erişim/trafik logu (HTTP, reverse proxy, sunucu) | (belirtilmedi) | Bugün için 6 ay minimum tut; hukukçu 5651 sınıflamasını netleştirince 1 yıl (Bulgu 1) | Çelişki, bkz. Bulgu 1 |

## 2. En kritik 3 bulgu

### Bulgu 1 — 5651: kanun ile yönetmelik süresi çelişkili; SaaS'ın sınıfı belirsiz (hukukçu teyidi şart)
- 5651 md.5(3) güncel metin: yer sağlayıcı, trafik bilgilerini "bir yıldan az ve iki yıldan fazla olmamak üzere yönetmelikte belirlenecek süre" saklar. Erişim sağlayıcı için md.6(1)(b): "altı aydan az ve iki yıldan fazla olmamak üzere". Kaynak: https://www.lexpera.com.tr/mevzuat/kanunlar/internet-ortaminda-yapilan-yayinlarin-duzenlenmesi-ve-bu-yayinlar-yoluyla-islenen-suclarla-mucadele (erişim 2026-09-30, İ/S — konsolide metin özeti). Değişikliğin 7418 sayılı Kanunla (RG 18.10.2022, yürürlük 13.10.2022 ifadesi kaynağa göre değişiyor) geldiği bilgisi: https://www.alomaliye.com/2022/10/18/7418-sayili-basin-kanunu/ (S).
- Buna karşılık 2007 tarihli "Usul ve Esaslar Yönetmeliği" md.7/1-c yer sağlayıcı için hâlâ "altı ay" diyor; Danıştay iptalleri sonrası bu süre metinde korunmuş görünüyor: https://www.lexpera.com.tr/mevzuat/yonetmelikler/internet-ortaminda-yapilan-yayinlarin-duzenlenmesine-dair-usul-ve-esaslar-hakkinda-yonetmelik (erişim 2026-09-30, İ). Yönetmeliğin 7418 sonrası 1 yıla güncellenip güncellenmediği: DOĞRULANAMADI.
- Trafik bilgisi tanımı: IP, kaynak/hedef, port, hizmetin başlama-bitiş zamanı, hizmet türü vb. (md.2). Yer sağlayıcı tanımı: "hizmet ve içerikleri barındıran sistemleri sağlayan veya işleten" kişi. (İ/S, aynı lexpera + https://www.erdem-erdem.av.tr/bilgi-bankasi/5651-sayili-kanun-kapsaminda-internet-aktorleri , erişim 2026-09-30.)
- SaaS sınıfı: Kaynaklarda net bir "SaaS = yer sağlayıcıdır" hükmü BULUNAMADI (DOĞRULANAMADI). Doktrin özeti: yalnızca yazılım sunan SaaS doğrudan yer sağlayıcı olmayabilir; üçüncü kişilerin erişebildiği içerik barındıran servisler olabilir (S; kaynak: https://www.kazimceylan.av.tr/web-hosting-sozlesmesi tipi içerikler, güvenilirlik düşük). Entegrasyonik'in kullanıcıları yalnızca kendi tenant'ının verisini görür, kamuya yayın yok; "yer sağlayıcı" olma ihtimali düşük ama sıfır değil — hukukçu teyit etmeli.
- Erişim sağlayıcı (ISS) ve toplu kullanım sağlayıcı (kafe/otel Wi-Fi; kayıtlar 2 yıl, https://webrazzi.com/2017/04/11/toplu-internet-saglayicisi-mekanlara-erisim-kayitlarini-2-yil-saklama-zorunlulugu-getirildi/ , S) kategorileri Entegrasyonik için geçerli değil.
- Pratik sonuç: AuditLogs, 5651 anlamında "trafik bilgisi" (bağlantı logu) değildir; uygulama-içi iş işlem kaydıdır. Ama HTTP erişim logu (IP+zaman+URL+metot+durum) trafik bilgisine benzer. Bu logu tutuyorsanız ve yer sağlayıcı sayılma riski varsa 1 yıl (kanunun alt sınırı) güvenli taraftır; zaman damgası/bütünlük şartı (md.7 yönetmelik) ayrıca vardır.

### Bulgu 2 — KVKK: sabit "log süresi" yok; süreyi siz belirleyip gerekçelendirir ve politikaya yazarsınız
- KVKK md.4: veri "ilgili mevzuatta öngörülen veya işlendikleri amaç için gerekli olan süre kadar muhafaza" edilir; ölçülülük ve amaçla bağlantılılık (S; kaynak: https://www.kvkk.gov.tr/Icerik/6649/Kisisel-Verileri-Koruma-Kanunu, erişim 2026-09-30, sayfa tam metni vermiyor).
- Silme Yönetmeliği: veri sorumlusu saklama ve imha politikası hazırlar; periyodik imha aralığı "her halde altı ayı geçemez"; silme/imha işlemleri kaydedilir ve kayıtlar en az 3 yıl saklanır (R/İ karışık: https://www.kvkk.gov.tr/Icerik/5441/KISISEL-VERILERIN-SILINMESI-YOK-EDILMESI-VEYA-ANONIM-HALE-GETIRILMESI-HAKKINDA-YONETMELIK , https://mihci.av.tr/kisisel-verilerin-silinmesi-yok-edilmesi-veya-anonim-hale-getirilmesi/ , erişim 2026-09-30; madde numaraları araç çıktısında tutarsız olduğu için burada verilmedi). Politika zorunluluğu VERBİS'e kayıtlı veri sorumluları için; kayıtlı olmayanlar için de imha yükümlülüğü ve aynı ilkeler geçerli (hukukçu teyidi).
- VERBİS istisna kriteri (Kurul, 2025): yıllık çalışan <50 VE bilanço <100 milyon TL ise (ana faaliyet özel nitelikli veri değilse) muaf; bilanço esasına göre defter tutmayanlar için yalnız çalışan sayısı: https://www.erdem-erdem.av.tr/bilgi-bankasi/verbis-kayit-yukumlulugune-iliskin-istisna-kriteri-degistirildi ve https://cottgroup.com/tr/blog/kvkk-gdpr/item/verbise-kayit-zorunlulugu-istisnalarinda-degisiklik (erişim 2026-09-30, İ/S). Entegrasyonik'in güncel kayıt yükümlülüğü şirket verisine bağlı: DOĞRULANAMADI.
- KVKK Kişisel Veri Güvenliği Rehberi (Ocak 2018 ilk yayın, sonradan güncel): kullanıcıların tüm işlem hareketlerinin düzenli kaydının (log) tutulması ve izlenmesi güvenlik tedbiri olarak öneriliyor; belirli bir saklama SÜRESİ verilmiyor (S; https://www.kvkk.gov.tr/yayinlar/veri_guvenligi_rehberi.pdf , PDF ham okunamadı, erişim 2026-09-30; "süre yok" iddiası DOĞRULANAMADI, tam metin taranmalı). Yani denetim logunu tutmak KVKK md.12 güvenlik yükümlülüğünün parçasıdır; süre sizin gerekçenize kalmıştır.
- IP adresi: KVKK ve AB uygulamasında genelde kişisel veri kabul edilir; log içeriğinin "kişisel veri" olup olmadığına ilişkin somut Kurul karar özeti bu araştırmada BULUNAMADI (DOĞRULANAMADI).
- Roller: kendi kullanıcı hesapları için (giriş, IP) Entegrasyonik veri sorumlusudur; müşterinin pazaryeri/ürün/sipariş verisi için veri işleyendir (md.12/2, 12/4 sorumluluk paylaşımı; S, yukarıdaki KVKK sayfası). AuditLogs yalnız stok/fiyat/rol değeri tutuyor ve PII yok denildiği için asıl kişisel veri alanları: kullanıcı id + IP.

### Bulgu 3 — VUK/TTK saklama süreleri AuditLogs'u kapsamaz; muhasebe belgesi ile işlem logu ayrı
- VUK md.253: defter ve belgeler, ilgili takvim yılını izleyen yılbaşından itibaren 5 yıl saklanır; TTK md.82: ticari defter ve belgeler 10 yıl: https://www.alomaliye.com/2013/11/22/defter-ve-belgelerin-saklanmasinda-zaman-asimi-sureleri/ (erişim 2026-09-30, İ/S).
- Bu süreler defter, fatura, e-fatura, e-arşiv, makbuz gibi muhasebe/mali belgeler içindir. Bir stok/fiyat/rol değişikliği kaydı bunlardan biri değildir (yorum; kaynakla doğrudan teyit edilemedi). Sonuç: denetim logu için 5/10 yıl uygulamayın; ancak Entegrasyonik kendi faturalarını (abonelik ücreti) ve müşteri adına e-fatura oluşturuyorsa (bugün yalnız UI formu) O belgeler ayrı ve 10 yıl saklanır, AuditLogs TTL'ine bağlı olmamalıdır.

## 3. Sektör iyi uygulaması (bölüm 4 talebi)
- ISO 27001:2022 A.8.15: loglar üretilir, saklanır, korunur, analiz edilir; süre SABİT DEĞİL, kuruluşun risk/mevzuat ihtiyacına göre politikada tanımlanır (İ: https://www.isms.online/iso-27001/annex-a-2022/how-to-implement-iso-27001-2022-annex-a-control-8-15-logging/ , erişim 2026-09-30). Standart metni okunmadı (ücretli).
- Yaygın pratik özeti: detay operasyonel log 90 gün, güvenlik olay logu 1 yıl, denetim/uyum logu 3-7 yıl (İ/S: https://hightable.io/iso-27001-annex-a-8-15-logging , https://isms.online/iso-27001/checklist/annex-a-8-15-checklist ; blog düzeyi, normatif değil).
- SOC 2: "1 yıl çevrimiçi" alışılagelmiş çıta olarak sık anılır, ancak AICPA kriterlerinde sabit gün sayısı yoktur; denetçi, kendi politikanıza uyulup uyulmadığına bakar. Birincil kaynak bulunamadı: DOĞRULANAMADI (S).

## 4. Saklama ve imha politikası belgesinde yazılması gerekenler
1. Amaç ve kapsam; hangi kayıt türleri (AuditLogs, LogEvents, ErrorEvents, erişim logu, silme kayıtları).
2. Her kayıt için: işleme amacı, hukuki sebep (md.5/2-f meşru menfaat veya md.12 güvenlik yükümlülüğü; hukukçu teyidi), kişisel veri kategorisi (kullanıcı id, IP), rol (sorumlu/işleyen), saklama süresi, imha yöntemi (TTL silme; maskeleme = anonimleştirme mi yoksa sözde-isimsizleştirme mi olduğu netleştirilmeli).
3. Süre tablosu (bölüm 1) ve gerekçe: yasal asgari yok, güvenlik/ihtilaf amacıyla ölçülü süre.
4. Periyodik imha aralığı (en fazla 6 ay; TTL otomatik silme uygulamada sürekli çalışıyorsa bu belgede "sürekli otomatik, en geç 6 ayda bir doğrulama" yazılabilir), sorumlu unvanlar.
5. Erişim kısıtı (loglara kimler erişir), bütünlük/değişmezlik tedbirleri, yedeklerde log kalması ve yedeğin ne kadar sürede düşeceği (TTL ile silinen veri yedekte kalır: yedek saklama süresi de yazılmalı).
6. Silme/imha kayıtlarının 3 yıl saklanması.
7. Hukuki saklama istisnası: yasal talep/soruşturma varsa (litigation hold) ilgili logların TTL dışı dondurulması.
8. Politika değişiklik geçmişi ve gözden geçirme sıklığı (yıllık).

## 5. Sözleşme / DPA notu
- Müşteri (veri sorumlusu) - Entegrasyonik (veri işleyen) DPA'sında: denetim logu ve içindeki kullanıcı id/IP'nin işleyenin güvenlik amaçlı işlediği, süresinin (365 gün, IP için 90 gün) ve sözleşme bitiminde müşteri verisinin silme/iade süresinin (ör. 30 gün) yazılması; logların müşteri talebi üzerine dışa aktarılabilmesi (enterprise için); alt işleyenler (Atlas, R2, Railway/Render) listesi.
- Sözleşme bitiminde müşteri tenant'ının AuditLogs'u: müşterinin istediği süre dışında tutulmamalı; TTL yerine "sözleşme bitişi + kısa süre" kuralı düşünülebilir (hukukçu teyidi).
- Kendi kullanıcı hesap logları için Aydınlatma Metni/Gizlilik Politikası'nda log ve IP saklama süresinin belirtilmesi (aydınlatma yükümlülüğü).

## 6. Hukukçu teyidi gereken noktalar
1. Entegrasyonik 5651 anlamında "yer sağlayıcı" mı? Evetse 1-2 yıllık trafik bilgisi saklama ve zaman damgası/bütünlük yükümlülüğü ve BTK faaliyet belgesi/bildirim gereksinimi.
2. 7418 sonrası Usul ve Esaslar Yönetmeliği'nde yer sağlayıcı süresi güncel olarak kaç ay/yıl (Kanun 1-2 yıl, eski Yönetmelik 6 ay).
3. IP adresi + kullanıcı id'nin denetim logunda saklanması için hukuki sebep ve 365 gün/90 gün ölçülülüğü.
4. IP maskelemenin "anonim hale getirme" sayılıp sayılmayacağı (kısmi maskeleme genelde sözde-isimsizleştirme).
5. Veri sorumlusu/işleyen rol ayrımı denetim logu için (özellikle müşterinin çalışanlarının kullanıcı id/IP'si: kim sorumlu?).
6. VERBİS kayıt yükümlülüğü ve saklama-imha politikasının zorunlu olup olmadığı (çalışan sayısı/bilanço).
7. VUK/TTK: denetim logunun (özellikle fiyat/fatura ilişkili işlem kayıtlarının) "belge" sayılıp sayılmadığı.
8. Yedeklerde log verisinin kalması ve imha yükümlülüğü ile ilişkisi.

## 7. DOĞRULANAMADI özeti
- SaaS'ın yer sağlayıcı sınıfı; Yönetmelik'in 7418 sonrası güncel süresi; KVKK rehberinde log SAKLAMA SÜRESİ (rehber PDF ham okunamadı); IP'ye ilişkin Kurul kararı; SOC 2 "1 yıl" kuralının birincil kaynağı; Entegrasyonik'in VERBİS yükümlülüğü.

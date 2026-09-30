# WhatsApp, Sosyal Medya ve Kampanya Modülü: Rakip + Pazar Araştırması (2026-09-30)

Erişim tarihi (tüm kaynaklar): 2026-09-30. Kapsam: `docs/research/COMPETITOR_GAP_2026-09-30.md` ve `frontend/docs/PRODUCT_VALUE_PLAN.md` (F-01..F-21, B-00..B-21) TEKRARLANMAZ; üstüne konur. Rakip adları yalnız bu dosyada geçer (ürün arayüzü/site metnine girmez).

Güvenilirlik etiketleri: [A] resmi/üretici dokümanı bu turda okundu · [B] üçüncü taraf/arama özeti (resmi teyit gerekir) · [D-YOK] DOĞRULANAMADI (iddia olarak taşınmaz) · [BİLGİ] bu turda kaynak çekilmedi, genel bilgi, uygulamadan önce teyit edilmeli.

Okunan ADR notu: ADR-0029 (bildirim) tam okundu. ADR-0019/0026/0028 dosya adları tahmin edilemediği için bu turda açılamadı; onlara dair atıflar ADR-0029'un özetlediği kısımlarla sınırlıdır (izin anahtarı `kaynak:eylem`, roller owner/admin/operator/viewer/accountant, `/admin-api` + `surface`, yetenek kaydı tek kaynak). Öneri ID'leri ve izin adları ÖNERİDİR.

---

## 0. Yönetici özeti

| Alan | Önerilen MVP | Değer | Eforu (BE/FE) |
|---|---|---|---|
| WhatsApp (backoffice) | Platforma ait tek WABA, Cloud API doğrudan (BSP ve Tech Provider GEREKMEZ). ADR-0029 kanal adaptörü olarak yalnız UTILITY şablonlar: faturalama/deneme/askı ve kritik uyarılar (STOCK_OVERSOLD, INTEGRATION_AUTH_FAILED) için opt-in almış tenant sahiplerine. Onay defteri + webhook + şablon/teslim ekranı (backoffice). | Kritik stok/entegrasyon arızasında yönetici telefonuna anında ulaşma (mottoyla doğrudan uyumlu) | M / S-M |
| Sosyal medya (tenant) | Ortak sosyal kanal adaptörü + Instagram ve Facebook Sayfası'na ürün tanıtım gönderisi (kendi zamanlayıcımızla planlama, insan onaylı yayın) + Meta katalog senkronu (stok bitince otomatik "out of stock") + Google Merchant feed (Merchant API). X ve YouTube ikinci dalga. | Tek stoktan sosyal kataloğa; tükenen ürünün tanıtılmaması | L / M-L |
| Kampanya | İç kampanya motoru: kanal bazlı, zamanlanmış, önizlemeli fiyat kampanyası + bitişte otomatik geri alma + stok korumalı (kampanya stok payı/eşikte durdurma). Pazaryeri kampanyalarına katılım: API kanıtı bulunamadığı için "hazırlık/uygunluk + dışa aktarım" ve API spike. | Rakiplerde kanıtı olmayan zamanlama + stok güvencesi (hipotez) | M-L / M |

En kritik 3 risk: (1) Meta iş doğrulaması + App Review (Advanced Access) uzun ve belirsiz süre; SaaS'ın sosyal/WhatsApp özelliklerinin tamamı buna bağlı. (2) Pazarlama içerikli WhatsApp/sosyal iletişimde ETK/İYS/KVKK: WhatsApp'ın İYS kanalı sayılıp sayılmadığı DOĞRULANAMADI; MVP'de pazarlama mesajı yok. (3) Kampanya için Trendyol/Hepsiburada/N11/Pazarama'da resmi kampanya API'si bulunamadı: yanlış vaat riski; ayrıca X ($0.20/URL'li gönderi) ve YouTube (10.000 birim/gün ortak kota) maliyet/kota tavanı platform genelinde paylaşılır.

---

## A. WhatsApp

### A.1 Teknik gerçekler (resmi)

| Konu | Bulgu | Etiket | Kaynak |
|---|---|---|---|
| BSP zorunlu mu | Hayır. Kendi Meta uygulamanla Cloud API'ye doğrudan erişilir. Başkalarının WABA'sını uygulamana bağlamak (SaaS) için Tech Provider rolü + Embedded Signup gerekir. | A | https://developers.facebook.com/docs/whatsapp/cloud-api/get-started |
| Tech Provider onboarding | Müşteri WABA ID, telefon numarası ID, uygulama ID/secret gerekir; rolling haftada en çok 200 yeni istemci; Embedded Signup v2 15.10.2026'da kapanıyor (v4 gerekli) | B (arama özeti; sayfa resmi URL) | https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-customers-as-a-tech-provider |
| Kimlik doğrulama | OAuth erişim belirteçleri + izin tabanlı yetki; webhook için `whatsapp_business_messaging`, diğerleri için `whatsapp_business_management` | A | https://developers.facebook.com/docs/whatsapp/cloud-api/overview/ ; https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks |
| Şablon | Kategoriler: Authentication, Marketing, Utility. Oluşturma/düzenlemede otomatik inceleme, "24 saate kadar". Durumlar: In-Review, Approved (kalite High/Medium/Low), Paused, Disabled, Rejected. Kötü geri bildirim/düşük okunma ile otomatik duraklatma | A | https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview |
| Opt-in | "Şablon göndermeden önce kullanıcı opt-in almalısınız"; opt-in kaydı işletme kimliğini ve mesaj amacını belirtmeli. Engelleme/şikayet Meta'nın gönderim limitini düşürebilir. | A | https://developers.facebook.com/docs/whatsapp/cloud-api/overview/ ; https://whatsappbusiness.com/policy/ |
| 24 saat pencere | Kullanıcı yazınca 24 sa pencere açılır; pencere içinde şablonsuz tüm mesajlar ücretsiz. Pencere dışı iş başlatımı yalnız onaylı şablonla | A | https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing |
| Fiyat modeli | 1 Temmuz 2025'ten beri konuşma değil TESLİM EDİLEN şablon başına ücret. Marketing her zaman ücretli; Utility pencere dışında ücretli, pencere içinde ücretsiz; Authentication ücretli; utility/authentication için aylık hacim kademeleri (portföy geneli). Click-to-WhatsApp girişlerinde 72 sa ücretsiz pencere | A | https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing |
| Türkiye oranları | Utility ve authentication oranları 1.4.2026'dan itibaren düştü [A]. Rakamlar: marketing ~$0.0141, utility ~$0.0086, authentication ~$0.0120, service ücretsiz [B: tek üçüncü taraf blog; resmî rate card PDF'i ile teyit edin] | A/B | https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing ; https://chatdaddy.tech/blog/whatsapp-business-api-turkey |
| Ekim 2026 değişikliği iddiası | Bir blog "service ve pencere-içi utility mesajları 1.10.2026'da ücretli olacak" diyor; resmi fiyat sayfası bunu TEYİT ETMEDİ (sayfa pencere-içi ücretsizliği koruyor, 1.10.2026 için yalnız başka ülke oran güncellemeleri sayıyor) | D-YOK | https://yournotify.com/blog/whatsapp-pricing-update-2026/ |
| Webhook imzası | Tüm bildirim yükleri SHA256 ile imzalanır; `X-Hub-Signature-256` başlığı = uygulama sırrıyla HMAC-SHA256(ham gövde); doğrulama isteği GET `hub.verify_token`/`hub.challenge`; 200 dönmezse 36 saat (Graph genel) / 7 güne kadar (WhatsApp sayfası) azalan sıklıkta yeniden dener; tekrar (duplicate) olur, dedup şart; yük ≤3 MB; mTLS desteği var | A | https://developers.facebook.com/docs/graph-api/webhooks/getting-started ; https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks |
| Hız sınırı | Varsayılan 80 mesaj/sn/numara; aynı kullanıcıya ~6 sn'de 1 mesaj (45'lik burst); yönetim uçları: 5.000 istek/sa (aktif hesap) | A | https://developers.facebook.com/docs/whatsapp/cloud-api/overview/ |
| Pazarlama per-user limiti | Kullanıcı başına dinamik pazarlama sınırı (hata kodu 131049; 24 sa bekle); ABD (+1) numaralarına pazarlama şablonu teslim edilmez; AB/BK/Japonya/Kore hariç | A | https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/per-user-limits/ |
| Aylık pazarlama tavanı (250.000/portföy) | Üçüncü taraf iddiası | D-YOK | https://www.ycloud.com/blog/what-is-meta-frequency-capping |
| İş doğrulaması | Doğrulanmış işletme daha yüksek iş hacmi ve resmi hesap uygunluğu kazanır; ödeme yöntemi + doğrulama gerekli. Türkiye için kabul edilen belgeler: şirket ana sözleşmesi, kuruluş belgesi vb. Tipik süre 5-10 iş günü, toplam 7-14 gün [B]. | A/B | https://developers.facebook.com/docs/whatsapp/cloud-api/get-started ; https://docs.360dialog.com/partner/waba-management/business-verification |
| Yasak içerik | Yasa dışı ürünler, yetişkin içerik, kayıtsız haber operasyonu, düzenlemeye tabi mallar (ateşli silah, reçeteli ilaç, kumar) | A | https://whatsappbusiness.com/policy/ |

Sonuç: Backoffice senaryosu için tek bir platform WABA'sı yeterlidir: Tech Provider/Embedded Signup gerekmez. BSP yalnız ticari tercih (destek, faturalama kolaylığı); teknik zorunluluk değil.

### A.2 Türkiye hukuku (İYS / ETK 6563 / KVKK)

| Konu | Bulgu | Etiket | Kaynak |
|---|---|---|---|
| Ticari elektronik ileti | Alıcının ÖNCEDEN onayı olmadan gönderilemez; onay yazılı/elektronik veya İYS üzerinden; alıcı her an ücretsiz ret hakkına sahip | B | https://hukukcularevi.com/ticari-elektronik-ileti-iys-izin-6563-reklam/ ; https://webrazzi.com/2020/07/26/markalarin-sms-gonderimi-icin-zorunlu-olan-iys-kullanimi-hakkinda-tum-detaylar |
| Kanal listesi | Mevzuatta sayılan kanallar: arama, çağrı merkezi, faks, otomatik arama makinesi, SMS/MMS, e-posta. Bulunan özetlerde WhatsApp AÇIKÇA yer almıyor; İYS'de WhatsApp kanalı var mı: DOĞRULANAMADI. Yorum ("elektronik ortamda... vasıtalar" ifadesi kapsayıcı) hukuki görüş gerektirir. | D-YOK | https://ismmmo.org.tr/dosya/2192/Mevzuat-Dosya/ILETIREHBERI.pdf ; https://www.ideasoft.com.tr/ileti-yonetim-sistemi-iys-nedir/ |
| İşlem/bilgilendirme mesajı | Sipariş, teslimat, abonelik/üyelik durumu, tahsilat/borç hatırlatma, bilgi güncelleme gibi ileti onaydan muaf (Yönetmelik) | B | https://ticaret.gov.tr/ic-ticaret/sikca-sorulan-sorular/elektronik-ticaret ; https://alomaliye.com/2015/07/15/ticari-iletisim-ve-ticari-elektronik-iletiler-hakkinda-yonetmelik/ |
| Tacir/esnaf istisnası | Bildiğim kadarıyla tacir/esnafa ileti için önceden onay aranmaz, ret hakkı sürer; bu turda kaynak çekilmedi | D-YOK | (hukuk teyidi gerekir) |
| KVKK | Pazarlama için açık rıza + aydınlatma; VERBİS; yurt dışına aktarım (Meta sunucuları) için KVKK m.9 rejimi | B/BİLGİ | https://chatdaddy.tech/blog/whatsapp-business-api-turkey |

Tasarım kuralı (öneri, muhafazakâr): WhatsApp üzerinden PAZARLAMA içeriği hem Meta opt-in'i hem İYS-eşdeğeri kayıtlı açık rıza olmadan gönderilmez; MVP yalnız işlem/bilgilendirme (utility) içerir. Meta opt-in kuralı, Türk hukukundaki muafiyetten BAĞIMSIZ olarak zaten uygulanır (işlem mesajı için de opt-in gerekir).

### A.3 Kullanım senaryoları: hangisi anlamlı

| # | Senaryo | Yüzey | Anlam | Not |
|---|---|---|---|---|
| S1 | Kritik uyarı kanalı: tenant sahibi/yöneticisine STOCK_OVERSOLD, INTEGRATION_AUTH_FAILED, askı/deneme bitişi | ADR-0029 `ChannelAdapter` (yeni kanal, tercih matrisinde yeni sütun), platform WABA | YÜKSEK | Motto: aşırı satış bildirimi e-postadan hızlı okunur. Zorunlu kategoriler için e-posta + uygulama içi taban KALIR; WhatsApp ek, opt-in'li (opt-in olmadan zorlanamaz) |
| S2 | Backoffice → tenant iletişimi: duyuru, bakım penceresi, olay bildirimi | Backoffice `Announcements` (ADR-0029 Karar 7) + WhatsApp adaptörü | ORTA | Bakım/olay = utility; kampanya/plan tanıtımı = marketing (İYS/onay riski, MVP dışı) |
| S3 | Destek: tenant WhatsApp'tan yazar, 24 sa pencere ücretsiz; gelen mesaj `TicketService` kaydına bağlanır | Backoffice destek gelen kutusu | ORTA | Ticket altyapısı var (`ticket-service`); insan destek kapasitesi kararı |
| S4 | Tenant → son müşteri sipariş/kargo bildirimi | TENANT (frontend) özelliği; tenant kendi WABA'sı (Embedded Signup) | ORTA (ileride) | Tech Provider + Meta uygulama incelemesi + DPA gerekir; pazaryeri siparişlerinde alıcı telefonu genelde maskeli olabilir [D-YOK, adaptörlerde doğrula]; en sağlam veri Ideasoft siparişleri. Backoffice DEĞİL, sonraki aşama |
| S5 | Platform alarmı (platformAdmin) | ADR-0017 `AlertChannel` | DÜŞÜK | e-posta/Slack yeterli; WhatsApp değer katmaz |

Rakip/pazar bağlamı: Türkiye'de e-ticaret platformları WhatsApp'ı çoğunlukla "WhatsApp'tan sipariş al" ve sipariş durumu bildirimi olarak sunuyor (Ticimax blog [B]), BSP'ler (Chakra, Helorobo, SİTETİ) e-ticaret bildirim/destek sunuyor [B]. Entegratör segmentinde (Dopigo/Entegra/Sentos) WhatsApp yeteneği: DOĞRULANAMADI. Kaynaklar: https://www.ticimax.com/blog/whatsapp-uzerinden-siparis-nasil-alinir ; https://chakrahq.com/article/turkiyenin-en-iyi-7-whatsapp-business-api-cozumu-hangisi-isletmenizin-gercek-ortagi/

### A.4 Tasarım notları (ADR-0029 ile)
- Yeni dosya: `operations/notifications/channels/WhatsAppAdapter.ts` (`deliver(batch, ctx)` → `sent|transient|permanent`). Yeniden deneme/`dead` mantığı outbox'tan gelir; 131049 gibi Meta hataları `permanent`/`transient` sınıflandırmasına eşlenir.
- Katalogdaki her bildirim için `whatsappTemplate?: { name, lang, category:'utility' }` alanı: tek kayıt, önizleme backoffice'te.
- Telefon numarası: teslim anında Users'tan çözülür (ADR-0029'daki "e-posta adresi saklanmaz" ilkesiyle aynı); opt-in defteri `ConsentLedger` (kanal, kaynak, zaman, metin sürümü, opt-out) ayrı koleksiyon; "DURDUR" yanıtı webhook'ta otomatik opt-out.
- Webhook alıcısı: ham gövde üzerinde HMAC-SHA256 doğrulama (zamanlama-güvenli karşılaştırma), `messageId` ile dedup, ack sonrası asenkron işleme.
- Ücret: Utility TR birim maliyeti düşüktür; ancak tenant başına kullanım ölçümü + plan kotası (entitlement) şart; yönetici başına günlük tavan + gruplama (ADR-0029 grup penceresi) ile "bildirim fırtınası" önlenir.
- Ajan-hazır (ADR-0018/0019): gönderim aksiyonu "ActionProposal" kapsamında değil (sistem bildirimi), ama şablon değişikliği ve toplu duyuru insan onaylı.

---

## B. Sosyal medya (tenant / frontend)

### B.1 Genel model
Ortak "sosyal kanal adaptörü": kanal bağlantısı (OAuth, şifreli belirteç kasası: AES-GCM `FIELD_ENCRYPTION_KEYS` deseni, belirteç yenileme işi, bağlantı durum makinesi `healthy|reauth_required|down`), yayın işi (Mongo durum makinesi: draft → approved → scheduled → publishing → published|failed), kendi zamanlayıcımız (`defineJob` + lease; çünkü platformların yerel zamanlaması eşit değil: aşağıda), kanal başına hız sınırı bütçesi, insan onayı (yayın herkese açık içeriktir; ajan otomatik yayınlamaz).

### B.2 Instagram (derin)

| Başlık | Bulgu | Etiket | Kaynak |
|---|---|---|---|
| API'ler | "Instagram API with Instagram Login" (Facebook Sayfası GEREKMEZ, profesyonel hesap gerekir) ve Facebook Login ile Graph API. Yetenekler: yorum yönetimi, içerik yayınlama, medya insight, mention, mesajlaşma. Reklam yönetimi ve etiketleme (tagging) YOK | A | https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login |
| Kapsamlar (scope) | `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_comments`, `instagram_business_manage_messages`, `instagram_business_manage_insights` (Facebook Login'de `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`, `pages_read_engagement`) | A | aynı + https://developers.facebook.com/docs/instagram-platform/insights |
| İçerik yayınlama | Görsel, video, reel, story, carousel (10'a kadar). 3 adım: medya container oluştur → yükle → `/media_publish`. Medya herkese açık URL'de barınmalı. JPEG tek görsel formatı. Filtre ve ALIŞVERİŞ ETİKETİ (shopping tags) API ile desteklenmiyor. alt_text, AI içerik beyanı, ortaklık etiketi mevcut | A | https://developers.facebook.com/docs/instagram-platform/content-publishing |
| Yayın sınırı | Hesap başına 24 sa kayan pencerede 100 API yayını (carousel tek); `GET /content_publishing_limit` ile okunur. (Eski 25 sınırı bir üçüncü taraf blogda geçiyor; resmi sayfa 100 diyor.) | A | aynı |
| Yerel planlama | Bu turda resmi sayfada API ile zamanlı yayın bulunmadı: DOĞRULANAMADI. Kendi zamanlayıcımız (container'ı yayın anına yakın oluştur) zaten gerekli | D-YOK | — |
| Erişim | Kendi yönettiğin hesaplar Standard Access; başka işletmelerin hesapları (SaaS) için Advanced Access = App Review + Business Verification. `instagram_content_publish`, `instagram_manage_insights` için gösterimli (screencast) inceleme gerekir | A | https://developers.facebook.com/docs/permissions/ |
| Insight | Hesap ve medya: erişim, izlenme, profil görüntüleme, etkileşim; hesap metriği için ≥100 takipçi; veri saklama 90 gün; yalnız profesyonel hesap | A | https://developers.facebook.com/docs/instagram-platform/insights |
| Hız sınırı | Graph çağrı bütçesi (BUC) ~ 4800 × son 24 sa gösterim sayısı (küçük hesapta bütçe çok düşük) | B | https://www.getphyllo.com/post/instagram-api-guide ; https://bundle.social/blog/instagram-api-rate-limits |
| Belirteç ömrü | Uzun ömürlü belirteç 60 gün + yenileme: bu turda kaynak doğrulanmadı | D-YOK | — (uygulamadan önce Meta dokümanından teyit) |
| Ürün etiketleme / Shopping | API ile etiket yok [A]. Shops/checkout: Meta, native checkout'u 4.9.2025'te sonlandırdı, alıcıyı satıcı sitesine yönlendiriyor; Shops yüzeyi 21 ülkeyle sınırlı ve TÜRKİYE LİSTEDE YOK [B: bir haber sitesi] → Türkiye'de Instagram/Facebook Shops vitrini ve ürün etiketi kullanılabilirliği DOĞRULANMADI | B/D-YOK | https://www.valueaddedresource.net/meta-phases-out-native-checkout-facebook-instagram-shops/ ; https://www.retailtouchpoints.com/news/meta-changes-instagram-facebook-shops-to-encourage-in-app-transactions/131219/ |
| Maliyet | API ücretsiz (Meta); maliyet insan/inceleme süreci | A/B | — |
| Türkiye | Instagram Türkiye'de kullanılabilir; API erişimi uygulama incelemesine bağlı | BİLGİ | — |

Değer: ürün tanıtım gönderisi (görsel + açıklama + fiyat + site/pazaryeri linki), planlama, yorum/mesaj gelen kutusu (sonraki aşama), insight.

### B.3 Facebook (Sayfalar + Katalog + Shops)

| Başlık | Bulgu | Etiket | Kaynak |
|---|---|---|---|
| Sayfa gönderisi | `POST /{page-id}/feed`; fotoğraf `/photos`; video ayrı Video API. İzinler: `pages_manage_posts`, `pages_manage_engagement`, `pages_read_engagement`, `publish_video`; kullanıcı Sayfa'da CREATE_CONTENT/MANAGE/MODERATE göreviyle yetkili olmalı | A | https://developers.facebook.com/docs/pages-api/posts |
| Yerel planlama | VAR: `published=false` + `scheduled_publish_time` (10 dk ile 30 gün arası). Güncelleme yalnız uygulamanın kendi yarattığı gönderilerde | A | aynı |
| Erişim | `pages_manage_posts`, `business_management`, `catalog_management` için App Review; Advanced Access için Business Verification | A | https://developers.facebook.com/docs/permissions/ |
| Katalog (Commerce/Marketing API) | `POST /{catalog_id}/items_batch`: oluştur/güncelle/sil; `availability` alanı ("out of stock" dahil) toplu güncellenir; istek başına ≤5.000 öğe (önerilen <3.000); saatten sık güncelleme için Batch API, aksi halde Feed API | B (resmi URL'nin arama özeti) | https://developers.facebook.com/docs/marketing-api/catalog/guides/manage-catalog-items/catalog-batch-api ; https://developers.facebook.com/docs/marketing-api/reference/product-catalog/items_batch |
| Shops (vitrin) | Türkiye desteklenen 21 pazar listesinde değil [B]; checkout'suz Shops yalnız o 21 pazarda sürüyor. Katalog kendisi (reklam/dinamik ürün reklamı için) Türk satıcılarca kullanılıyor: Ideasoft/ikas Meta katalog entegrasyonu sunuyor [B] | B | https://www.ideasoft.com.tr/7-adimda-instagram-magazanizi-e-ticarete-donusturun/ ; https://support.ikas.com/why-should-i-connect-my-ikas-store-with-facebook-instagram |
| Maliyet | Ücretsiz API | B | — |

Stok bağlantısı (motto): `stock.overview` değişimi → katalog `availability` güncelle (StockPublishTrigger kanalı olarak 'meta_catalog' hedefi); stok ≤ eşik veya 0 → "out of stock"; iade/yeniden stok → "in stock". Kanal kuyruğunda öncelik: stok > fiyat > içerik (GAP öneri #4 ile aynı yol).

### B.4 X (Twitter)

| Başlık | Bulgu | Etiket | Kaynak |
|---|---|---|---|
| Erişim/ücret | KULLANIM BAŞINA ÖDEME modeli: gönderi oluşturma $0.015; URL içeren gönderi $0.200; DM $0.015; gönderi okuma $0.005; kendi verini okuma $0.001; harcama limiti + otomatik yükleme; dönem başı 3 milyon okuma tavanı | A | https://docs.x.com/x-api/getting-started/pricing |
| Katmanlar | Ücretsiz katman yeni geliştiricilere 6.2.2026'da kapatıldı; eski Basic ($200/ay) ve Pro ($5.000/ay) yalnız önceden abone olanlar için sürüyor; Enterprise $42.000+ | B | https://www.postproxy.dev/blog/x-api-pricing-2026/ ; https://zernio.com/blog/twitter-api-pricing |
| Yayın | `POST /2/tweets`; kullanıcı bağlamı OAuth 2.0 PKCE (veya 3-legged); ≤4 fotoğraf, 1 GIF veya 1 video; standart hesapta video 20 dk/8 GB, Premium 125 dk/16 GB; API ile gönderide en çok 1 cashtag | A | https://docs.x.com/x-api/posts/manage-tweets/introduction |
| Planlama | API sayfasında yerel zamanlama yok/detaylanmadı: kendi zamanlayıcımız gerekir | D-YOK (yerel yok varsay) | — |
| Rate limit | Bu turda resmi değer alınmadı | D-YOK | — |
| Değer | Ürün tanıtımı için düşük-orta (Türkiye e-ticaret satıcı kitlesi Instagram/WhatsApp ağırlıklı; kaynaklı veri yok). Ürün tanıtım gönderisi neredeyse her zaman link içerir → ~$0.20/gönderi. Maliyet platforma düşer, tenant'a yansıtılmalı (kredi/kota). | Öneri | — |
| Türkiye | Kullanılabilirlik/erişim kısıtı riski hakkında kaynak toplanmadı | D-YOK | — |

### B.5 YouTube

| Başlık | Bulgu | Etiket | Kaynak |
|---|---|---|---|
| Kota | Varsayılan 10.000 birim/gün/PROJE (tüm tenant'lar ortak); `videos.insert` = 1.600 birim → ~6 yükleme/gün; çoğu `list` = 1; güncelle/sil = 50; gün sıfırlaması Pasifik gece yarısı. (Aynı sayfanın özeti ayrıca yükleme kovası için "günde 100 çağrı" gibi ifadeler taşıyor; Cloud Console'da doğrula) | A (kısmen çelişkili özet) | https://developers.google.com/youtube/v3/determine_quota_cost ; https://developers.google.com/youtube/v3/docs/videos/insert |
| Yükleme | `POST .../upload/youtube/v3/videos`; ≤256 GB; kapsamlar `youtube.upload` / `youtube` / `youtube.force-ssl`; `publishAt` ile YEREL PLANLAMA var (privacyStatus + publishAt) | A | https://developers.google.com/youtube/v3/docs/videos/insert |
| Denetim şartı | 28.7.2020 sonrası oluşturulan, DENETİMDEN GEÇMEMİŞ API projelerinden `videos.insert` ile yüklenen videolar zorla ÖZEL (private) kalır; herkese açık için YouTube API Compliance Audit gerekir (kota artışı da ayrı form) | A | https://developers.google.com/youtube/v3/docs/videos/insert ; https://support.google.com/youtube/answer/7300965 |
| OAuth doğrulama / belirteç | Hassas kapsam için Google OAuth uygulama doğrulaması ve "Testing" modunda kısa refresh token ömrü: bu turda kaynak çekilmedi | BİLGİ | — |
| Shorts | Ayrı yükleme ucu yok; dikey ≤3 dk video Shorts olarak sınıflanır: bu turda doğrulanmadı | D-YOK | — |
| YouTube Shopping | Affiliate programı: ABD, Kore, Endonezya, Tayland, Vietnam, Malezya, Filipinler, Hindistan, Singapur, Brezilya, Tayvan, Japonya; TÜRKİYE YOK; 2026 sonuna kadar 35 ülkeye genişleme duyurusu (liste yok). Kendi mağaza ürününü Merchant Center ile etiketleme uygunluğu Türkiye için DOĞRULANAMADI | B/D-YOK | https://support.google.com/youtube/answer/13376398 ; https://www.relevantaudience.com/youtube/youtube-made-on-2026-brand-deals-shopping-affiliate/ |
| Değer | Video üretimi tenant'ta darboğaz; ürün tanıtım videosu için orta. Kota ve denetim yükü yüksek | Öneri | — |

### B.6 İkincil platformlar

| Platform | Bulgu | Etiket | Kaynak |
|---|---|---|---|
| TikTok (yayın) | Content Posting API: denetimsiz istemci tüm içeriği yalnız SELF_ONLY (özel) yayınlar, 24 saatte ≤5 kullanıcı; denetim şart | B (resmi URL'nin özeti) | https://developers.tiktok.com/docs/en/content-sharing-guidelines |
| TikTok (katalog/Shop) | TikTok for Business katalog: mağaza ülkesi Türkiye + TRY/USD destekleniyor [B]; TikTok Shop satış (Seller Center) Türkiye'de YOK [B] | B | https://help.vtex.com/en/tracks/tiktok-integration--1r0yJSO11nrer1YVu3WTFd/4AEUg7pEdX1beOaQhFf0wC ; https://ikas.com/tr/blog/tiktok-shop-seller-center-nedir-ne-ise-yarar |
| Pinterest | Katalog API mevcut; Türkiye reklam pazarı değil (eski bir topluluk gönderisi) | D-YOK (eski) | https://developers.pinterest.com/usecase/catalogs/ |
| LinkedIn | Bu turda araştırılmadı; B2C ürün tanıtımına değeri düşük | D-YOK | — |
| Google Merchant Center | Sosyal değil, tanıtım. Content API for Shopping 18.8.2026'da kapatıldı; 1.9.2026'dan itibaren aralıklı HTTP 410, erken 2027'de tam kapanış; yeni geliştirme YALNIZ Merchant API. Dosya/plan lı çekme feed'leri etkilenmez | B (Google sayfasına işaret eden özetler) | https://developers.google.com/shopping-content/guides/sunset ; https://www.productsup.com/blog/google-merchant-api-migration-what-changes-before-the-august-2026-deadline-and-how-to-prepare/ |

### B.7 Sosyal medya yönetimi araçları (rakip/emsal)
Global planlama araçları: Buffer (kanal başı ~$6/ay), Hootsuite ($99/ay'dan), Later (~$16,67/ay'dan), Publer ($12/ay'dan), Metricool (ücretsiz/$18'dan) [B: https://www.flowhunt.io/tr/blog/best-social-media-automation-tools/]. Bunlar ürün/stok bilgisi taşımaz; Entegrasyonik'in farkı: içeriğin kaynağı canlı SKU/stok/fiyat (tükenen ürünün gönderisi otomatik engellenir/uyarılır, fiyat değişince taslak bayatlar). Türk e-ticaret altyapıları (Ideasoft, ikas, Ticimax) Meta katalog/Instagram senkronunu sunuyor [B]; entegratör segmentinde (Dopigo/Entegra/Sentos) sosyal yayın: DOĞRULANAMADI.

### B.8 Sosyal alan tasarım notları
- Yayın kapısı: "tanıtım yapılabilir mi?" kontrolü: stok > 0 (StockPolicy), fiyat güncel, görsel/gönderi kuralları; kanal başına insan onayı; toplu/otomatik yayın YOK (Meta/X spam politikaları + marka riski).
- Gönderi şablonu: `{ürün adı, fiyat (kanal fiyatı), görsel(ler), link (UTM), hashtag}`; fiyat/stok çıkarsa taslak "bayat" işaretlenir.
- Metrik: Instagram/Facebook insight çekimi (sonraki aşama); SKU'ya bağlı tıklama (UTM) → F-10 kâr raporuyla birleşme fırsatı.
- KVKK/Meta: gizlilik politikası URL'si, veri silme geri çağrısı (Meta uygulama gereksinimi), belirteç saklama şifreli; sosyal hesap sahibi tenant'tır (veri sorumlusu), biz veri işleyeniz.

---

## C. Kampanya modülü

### C.1 Pazaryeri kampanya API'leri (resmi kanıt durumu)

| Pazaryeri | Bulgu | Etiket | Kaynak |
|---|---|---|---|
| Trendyol | Satıcı panelinde "Promosyonlar & Fiyat Yönetimi > Kampanyalar": ürün elle veya Excel ile eklenir, fiyat önerisi "son 30 günün en düşük fiyatı" ölçütüne göre, uyumsuz fiyat kırmızı, "Onaya Gönder" sonrası Trendyol ekibi fiyat/stok inceler. Resmi API'de kampanya/indirim/flash/kupon ucu: BULUNAMADI. Entegrasyon dokümanı ürün/stok/fiyat/sipariş/soru odaklı ve V1 servisler 15.10.2026'da kapanıyor | A (panel süreci: entegratör sayfası), D-YOK (API) | https://birfatura.com/trendyol-kampanya-yonetim-trendyol-kampanya-katilim/ ; https://developers.trendyol.com/en/ |
| Hepsiburada | Kampanyada "30 günün en düşük fiyatı" kuralı, indirim süresi ve stok bilgisi zorunlu (üçüncü taraf özet). Resmi kampanya API'si: DOĞRULANAMADI (developers sitesi bu turda 403 verdi) | B / D-YOK | https://developers.hepsiburada.com/ (erişilemedi) |
| N11 | Resmi kampanya/indirim API'si: DOĞRULANAMADI (arama sonuçlarında yalnız tüketici kampanyaları) | D-YOK | https://api.n11.com/ (bu turda 404) |
| Pazarama | API hız sınırı satıcı başına 30 istek/dk [B]; kampanya ucu: DOĞRULANAMADI. Resmi dokümanın adresi: isortagimapi.pazarama.com/docs (bu turda açılmadı) | D-YOK | https://birfatura.com/pazarama-entegrasyonu/ |
| Ideasoft | Ideasoft'un kendi "Kampanya Yönetimi" özelliği var (e-ticaret tarafı); Admin API'de kampanya/kupon ucu: DOĞRULANAMADI | D-YOK | https://www.ideasoft.com.tr/konu/kampanya-yonetimi/ |
| Bizimhesap | Kampanya kavramı yok/DOĞRULANAMADI; ERP fiyat listesi girdisi olabilir | D-YOK | — |

Sonuç: Bugün doğrulanabilen tek güvenli kampanya yolu, kanal FİYATINI/STOĞUNU mevcut ürün API'siyle zamanlı değiştirmektir (indirim = kanal satış fiyatı düşürme, liste fiyatı korunarak: alan adları adaptör kodunda doğrulanmalı). Pazaryerinin kendi organize kampanyalarına (Trendyol "Kampanyalar", Süper Fırsatlar, flaş) katılım API'yle otomatikleştirilebilir denemez: önce spike (aşağıda CMP-04).

### C.2 Rakip kampanya yönetimi
- Ticimax: Trendyol kampanyalarına katılımı stok senkronu, fiyat ayarı ve ürün uygunluğu yönetimiyle "destekler"; bağımsız kampanya otomasyonu iddiası yok [A: https://www.ticimax.com/blog/trendyol-kampanya-yonetimi].
- BirFatura: kampanya katılımı manuel/Excel; kendi katkısı kampanya sonrası fatura otomasyonu [A: https://birfatura.com/trendyol-kampanya-yonetim-trendyol-kampanya-katilim/].
- Ideasoft: kendi mağaza kampanya yönetimi (kupon/promosyon) [B: https://www.ideasoft.com.tr/konu/kampanya-yonetimi/].
- ideaConnect, Dopigo, Entegra, Sentos: zamanlı kanal kampanyası veya pazaryeri kampanya API'si kanıtı bulunamadı [D-YOK; ayrıca COMPETITOR_GAP #7 "zamanlanmış toplu iş kanıtı yok, hipotez"].
- Global (Linnworks, Brightpearl vb.): promosyon yönetimi bu turda araştırılmadı [D-YOK].
- Sonuç: Zamanlı + önizlemeli + stok korumalı kanal kampanyası TR entegratör segmentinde kanıtlı bir boşluk değil ama kanıtlı bir var-olan-özellik de değildir: konumlama iddiası olarak kullanılmadan önce tenant görüşmesiyle doğrulanmalı (hipotez).

### C.3 Kampanya modülü tasarım çerçevesi
1. Katmanlar: (a) İç kampanya = kanal + SKU kapsamı + fiyat kuralı (yüzde/TL/sabit fiyat) + başlangıç/bitiş + stok politikası; PVP F-09/B-10 (kanal fiyat kuralı) ve F-08/B-09 (önizleme/geri al) ÜSTÜNE oturur, ayrı fiyat motoru icat edilmez. (b) Pazaryeri kampanya katılımı = hazırlık (uygunluk, marj, 30 gün en düşük fiyat kontrolü) + dışa aktarım; API doğrulanırsa otomatik. (c) Kupon/mağaza kampanyası: yalnız e-ticaret (Ideasoft) tarafı, API doğrulaması sonrası.
2. Stok ilişkisi (motto): kampanya trafiği aşırı satış riskini artırır: (i) kampanya öncesi uygunluk kontrolü (stok yeterli mi, yayın bekleyen `publishPending` var mı), (ii) kanal payı/güvenlik stoğu (COMPETITOR_GAP #5), (iii) stok eşiğinin altında kampanya fiyatını otomatik bitirme veya ürünü kanaldan çekme, (iv) kampanya bitişinde fiyatı geri alma (zamanlanmış iş; başarısız olursa uyarı: bayat kampanya fiyatı para kaybettirir, kritik).
3. Doğruluk: kampanya fiyatı geri alınmazsa/yanlış yayınlanırsa doğrudan para etkisi; bu nedenle "bitiş işi" tek yazar ilkesi, idempotent, denetim kaydı (AuditService) ve bildirim (`CAMPAIGN_END_FAILED` = critical adayı).
4. Fiyat geçmişi: "indirim öncesi fiyat = son 30 günün en düşüğü" pazaryeri kuralı [A/B] için kanal başına fiyat geçmişi tutulmalı (yerel hukuki dayanak Fiyat Etiketi Yönetmeliği: bu turda doğrulanmadı [BİLGİ]).
5. Hız sınırı: Trendyol fiyat güncelleme limiti (COMPETITOR_GAP #6 ~30/dk/barkod) ve Pazarama 30 istek/dk kampanya başlangıcında toplu fiyat yayınını yavaşlatır: kampanya başlangıç saatinden ÖNCE kuyruğa alma ve "yayın tamamlanma süresi" tahmini gösterme.
6. Rapor: kampanya kâr etkisi maliyet alanına bağlı (F-10/B-13; maliyet şemada doğrulanamadı) → MVP'de "hesaplanamadı" ilkesi.

---

## D. Yetenek matrisi (özet)

Simge: ● doğrulandı [A/B] · ○ kanıt yok/DOĞRULANAMADI · — kapsam dışı.

| Yetenek | Entegrasyonik (bugün) | TR e-ticaret altyapıları (Ideasoft/ikas/Ticimax) | TR entegratörler (Dopigo/Entegra/Sentos/BirFatura) | WhatsApp BSP'ler | Global sosyal/feed araçları |
|---|---|---|---|---|---|
| WhatsApp sipariş/kargo bildirimi | Yok | ● Ticimax (sipariş durumu, WhatsApp'tan sipariş) [B] | ○ | ● (Chakra, Helorobo, SİTETİ) [B] | — |
| WhatsApp destek gelen kutusu | Yok (Ticket var) | ○ | ○ | ● [B] | — |
| Platform → müşteri kritik uyarı WhatsApp | Yok | ○ | ○ | ● teknik olarak [B] | — |
| Sosyal gönderi planlama | Yok | ○ | ○ | — | ● Buffer/Hootsuite/Later/Publer/Metricool [B] |
| Meta katalog senkronu (stok/fiyat) | Yok | ● Ideasoft, ikas [B] | ○ | — | ● feed araçları (Productsup vb.) [B] |
| Stoğa bağlı otomatik "out of stock" sosyal kataloğa | Yok (stok motoru var) | Ideasoft "saniyeler içinde" iddiası [B] | ○ | — | ○ |
| Google Merchant feed | Yok | ○ | ○ | — | ● [B] |
| Pazaryeri kampanya katılımı (API) | Yok | ○ | Manuel/Excel (BirFatura) [A]; Ticimax destekli fiyat/stok [A] | — | — |
| Zamanlı kanal fiyat kampanyası + otomatik geri alma | Yok | Ideasoft mağaza kampanyası [B] | ○ | — | — |
| Kampanya-stok koruması (aşırı satış) | Stok motoru var; kampanya bağı yok | ○ | ○ | — | — |

---

## E. Öneriler

Efor: S ≤ 3 gün, M ~1-2 hafta, L > 2 hafta. Motto: ●●● doğrudan tek stok/sıfır aşırı satış, ●● dolaylı, ● alakasız.

### E.1 WhatsApp
- MVP: A.4'teki adaptör (utility, opt-in, platform WABA), backoffice şablon/teslim/opt-in ekranı, kritik uyarı tercihi. Efor BE M, FE S-M. Motto ●●● (S1). Değer: yüksek (aşırı satış/entegrasyon arızası bildirimi).
- Sonraki: (1) destek gelen kutusu → Ticket (M), (2) backoffice duyuru kanalı (bakım/olay), (3) tenant→son müşteri bildirimi (Tech Provider, Embedded Signup; L; tenant özelliği), (4) pazarlama mesajları YALNIZ hukuk kararı + onay defteri sonrası.
- Bağımlılık: ADR-0029 kanal adaptörü/outbox (Aşama uygulanmış mı kontrol), ADR-0019 yetenek kaydı (`whatsapp.consent.*`, `whatsapp.template.*`, `whatsapp.delivery.list`; tenant kullanıcı tercihi `self:manage`), ADR-0028 izinleri (öneri: `notifications:manage` tenant, backoffice yüzeyinde `whatsapp:manage`), entitlement (kullanım ölçümü/kota).
- Yasal: Meta opt-in + WhatsApp Business Messaging Policy; ETK: MVP işlem/bilgilendirme mesajı (muaf) ile sınırlı; İYS'de WhatsApp durumu hukuk teyidi; KVKK: telefon numarasının Meta'ya (yurt dışı) aktarımı, aydınlatma metni, silme talebi.
- İNSAN KARARI: Meta iş doğrulaması (belgeler, ticari unvan); WhatsApp Business hesabı/numara seçimi (numara yeni olmalı ya da API'ye taşınmalı); ödeme yöntemi (kart) ve aylık bütçe; BSP kullanılıp kullanılmayacağı (ticari); şablon metinleri (TR) ve hukuk onayı; kullanım ücretinin planlara yansıtılması (Protokol 12 kapsamı).

### E.2 Sosyal medya
- MVP (sıralı): SOC-00 adaptör altyapısı → Instagram + Facebook Sayfası gönderisi (görsel/carousel) → Meta katalog senkronu (items_batch, availability) → Google Merchant feed (Merchant API). X ve YouTube ikinci dalga; TikTok/Pinterest/LinkedIn araştırma notu, ürün değil.
- Efor: altyapı BE L; Instagram M; Facebook M; katalog senkronu M (stok tetikleyicisine bağlı: ●●●); Merchant M; X S-M; YouTube M-L (kota + denetim); FE: takvim/onay ekranı M-L.
- Bağımlılık: Meta uygulama incelemesi (kritik yol!), OAuth belirteç kasası (`FIELD_ENCRYPTION_KEYS`), ADR-0029 (yayın başarısız/belirteç geçersiz bildirimleri: `SOCIAL_REAUTH_REQUIRED`), ADR-0019 (`social.post.*`, `social.channel.*`, `catalog.social.sync`; MCP/ajan: yayın = ActionProposal + insan onayı), ADR-0028 (öneri izinleri `social:read`, `social:publish` (owner/admin/operator), `social:connect` (owner/admin)), entitlement (sosyal kanal sayısı, aylık gönderi, X kredi).
- Yasal/politika: Meta Platform Terms ve Commerce Policies; Türkiye'de Shops/etiket kullanılamazlığı [B]: özellik vaadi "katalog + tanıtım gönderisi" ile sınırlı (Instagram ürün etiketi/Shops vaat edilmez); YouTube API Services TOS + Compliance Audit; X geliştirici sözleşmesi (otomasyon kuralları); KVKK/tenant DPA.
- İNSAN KARARI: Meta Business Verification ve App Review'e başvuru (screencast, gizlilik politikası, veri silme URL'si), Google OAuth doğrulaması + YouTube denetim/kota formu, X ödeme (kullanım başına, harcama limiti), ücretlerin tenant'a yansıtılması, TikTok denetim başvurusu (ertelenebilir).

### E.3 Kampanya
- MVP: iç kampanya motoru (kanal+SKU kapsamı, yüzde/TL kural, başlangıç/bitiş, önizleme, bitişte otomatik geri alma), stok koruması (uygunluk kontrolü, eşikte sonlandırma), takvim görünümü, kritik bildirim (bitiş başarısız). Efor BE M-L, FE M.
- Pazaryeri katılımı: önce API spike (S; Trendyol/HB/N11/Pazarama resmi dokümanı, satıcı panelinden ağ çağrısı ASLA taklit edilmez); doğrulanmazsa "katılım hazırlığı + dışa aktarım".
- Sonraki: kampanya sonuç/kâr raporu (F-10'a bağlı), kupon (Ideasoft), kural motoru tetikleyicisi (F-12: "stok < X ise kampanyayı bitir").
- Bağımlılık: F-08/B-09 (önizleme/geri al), F-09/B-10 (kanal fiyat kuralı), B-01 (Trendyol V2), hız sınırı-farkında kuyruk (GAP #4), güvenlik stoğu (GAP #5), ADR-0019/0028 (`campaign.*` yetenekleri; `campaigns:read/write/publish`), AuditService, entitlement (`campaigns` özelliği; fiyat Protokol 12).
- Yasal: fiyat etiketi/indirim beyanı kuralları (30 günün en düşük fiyatı) yerel mevzuat teyidi gerekir; pazaryeri kampanya şartları; tüketici hukuku (yanıltıcı indirim).
- İNSAN KARARI: kampanya modülünün paket/plan yerleşimi; pazaryeri kampanyası için pazaryeri ile ticari ilişki/API erişim talebi (kampanya API'leri yalnız partner programı arkasında olabilir: kanıt yok).

---

## F. Backlog taslakları (kopyalanabilir)

Öncelik: P1 = yol açıcı/uzun teslimatlı/dış bağımlı ilk adım, P2 = planlı, P3 = ileride. Kabul ölçütleri özet; tüm kalemler ADR-0019 gereği yetenek kaydı + test + belge + UI/MCP kararı içerir.

| ID | Başlık | Kapsam | Öncelik | Bağımlılık | Kabul ölçütü |
|---|---|---|---|---|---|
| WA-00 | Hukuk/uyum kararı: WhatsApp, ETK/İYS, KVKK | İYS'de WhatsApp durumu, tacir/esnaf istisnası, opt-in metinleri, yurt dışı aktarım; ADR taslağı | P1 | İnsan (hukuk) | Yazılı hukuk görüşü + ADR: hangi mesaj türleri hangi rızayla gider |
| WA-01 | Meta iş doğrulaması + platform WABA kurulumu | İş doğrulaması, numara, ödeme, ilk şablon başvuruları (insan görevi + checklist) | P1 | İnsan (belgeler, kart) | Doğrulanmış işletme; onaylı ≥1 utility şablon; test mesajı ulaşır |
| WA-02 | WhatsApp kanal adaptörü (ADR-0029 ChannelAdapter) | `WhatsAppAdapter.deliver`, hata sınıflandırma (transient/permanent), şablon eşleme, günlük tavan | P2 | WA-01, ADR-0029 outbox | Sahte taşıyıcıyla testler: sent/transient/permanent; şablon parametre doğrulaması; PII loglanmaz |
| WA-03 | Onay defteri (ConsentLedger) + DURDUR | Opt-in kaydı (kaynak/zaman/metin sürümü), opt-out, kullanıcı tercih matrisinde WhatsApp sütunu | P2 | WA-00, WA-02, ADR-0029 tercihler | Opt-in'i olmayana gönderim yok (test); DURDUR yanıtı ≤1 dk'da opt-out; zorunlu kategori e-postası etkilenmez |
| WA-04 | WhatsApp webhook alıcısı | GET doğrulama, POST `X-Hub-Signature-256` HMAC (ham gövde, sabit-zaman), messageId dedup, teslim durumu → `NotificationDeliveries` | P2 | WA-01 | Geçersiz imza 401/403; tekrar teslim tek kayıt; ack ≤ birkaç sn, işleme asenkron |
| WA-05 | Backoffice WhatsApp yönetim ekranı | Şablon durumu/kalite, teslim günlüğü, opt-in listesi, kalite puanı/limit uyarısı | P2 | WA-02, ADR-0026 yüzeyi, ADR-0028 | Şablon kalitesi Low/Paused olunca platform alarmı; tenant bazlı teslim geçmişi görünür |
| WA-06 | Destek gelen kutusu → Ticket köprüsü | Gelen mesaj → `TicketService`, 24 sa pencere sayacı, yanıt | P3 | WA-04, destek kapasitesi kararı | Gelen mesaj ticket açar; pencere kapanışında şablon zorunluluğu UI'da görünür |
| WA-07 | Tenant → son müşteri sipariş/kargo bildirimi | Tech Provider + Embedded Signup v4, tenant WABA, şablon, opt-in, kota | P3 | WA-00, Meta App Review, plan/entitlement | Tenant kendi numarasını bağlar; sipariş durum şablonu gider; alıcı telefonu yoksa "gönderilemedi" ayrımı |
| SOC-00 | Ortak sosyal kanal adaptörü altyapısı | OAuth bağlama, şifreli belirteç kasası + yenileme işi, bağlantı durum makinesi, yayın durum makinesi + kendi zamanlayıcı, kanal başına hız bütçesi, insan onayı, denetim | P1 | ADR-0029, ADR-0019/0028, entitlement | Sahte sağlayıcıyla uçtan uca: taslak→onay→planlı→yayınlandı/başarısız; belirteç DB'de düz metin yok; yeniden-yetkilendirme bildirimi |
| SOC-01 | Meta iş doğrulaması + App Review (Instagram/Facebook) | Kapsam listesi (`instagram_business_*`, `pages_*`, `catalog_management`), screencast, gizlilik/veri silme URL'leri | P1 | İnsan; WA-01 ile aynı iş doğrulaması paylaşılabilir | Advanced Access onayı; onay yoksa özellik bayrağı kapalı |
| SOC-02 | Instagram yayın | Görsel/carousel/reel yayın, `content_publishing_limit` okuma, alt_text, planlama (kendi zamanlayıcı) | P2 | SOC-00, SOC-01 | 100/24sa sınırı UI'da; JPEG dönüşümü/uyarı; başarısız yayın hatası kullanıcıya nedenle görünür; herkese açık yayın onaysız yapılmaz |
| SOC-03 | Facebook Sayfası yayın | Sayfa gönderisi/foto/video, yerel `scheduled_publish_time` (10 dk-30 gün) veya kendi zamanlayıcı | P2 | SOC-00, SOC-01 | Zamanlı gönderi Sayfa'da görünür; 30 gün üstü kendi zamanlayıcıya düşer |
| SOC-04 | X (Twitter) yayın | OAuth 2.0 PKCE, gönderi + ≤4 görsel/video, kullanım-başına maliyet ölçümü ve harcama tavanı | P3 | SOC-00, X ödeme kararı | URL'li gönderi maliyeti (~$0.20) yayın öncesi gösterilir; tavan aşımında durur |
| SOC-05 | YouTube yükleme | `videos.insert` (resumable), `publishAt` planlama, kota takibi, denetim süreci | P3 | SOC-00, Google OAuth doğrulaması + API Compliance Audit | Kota tükenirse kuyruğa/uyarı; denetimsiz projede "private kalır" uyarısı; ~6 yükleme/gün tavanı belgelenir |
| SOC-06 | Meta katalog senkronu + stok-out otomatik gizleme | Commerce catalog `items_batch` (create/update/delete, `availability`), StockPublishTrigger hedefi, eşikte "out of stock", geri dönüşte "in stock" | P2 | SOC-01 (catalog_management), stok yayın altyapısı, GAP #3/#4 | Stok 0 → ≤ hedef sürede katalogda out of stock (ölçülür); toplu ≤3.000 öğe/istek; hata ≠ boş |
| SOC-07 | Google Merchant feed (Merchant API) | Merchant API ile ürün/stok/fiyat; Content API KULLANILMAZ | P2 | Google Merchant hesabı (tenant) | Merchant API sürümü kullanılır (Content API çağrısı yok, statik test); stok bitince `out_of_stock` |
| SOC-08 | Sosyal içerik takvimi + ürün tanıtım şablonu (FE) | Takvim, gönderi bayatlama uyarısı (stok/fiyat değişti), onay akışı, UTM | P2 | SOC-02/03 | Stoğu biten ürün için taslak yayınlanamaz ("nedenli" devre dışı); fiyat değişince taslak bayat işaretlenir |
| SOC-09 | Sosyal insight paneli | IG/FB insight (≥100 takipçi kuralı, 90 gün), SKU/UTM bağlama | P3 | SOC-02/03, F-10 | Veri yoksa "hesaplanamadı"; 90 gün üstü geçmiş vaat edilmez |
| SOC-10 | TikTok/Pinterest/LinkedIn değerlendirme notu | Türkiye uygunluğu ve denetim şartlarının resmi doğrulaması | P3 | SOC-00 | Yazılı karar: uygulanabilir/uygulanamaz, kaynaklı |
| CMP-00 | ADR: kampanya modeli | Campaign varlığı, kanal fiyat kuralı ile ilişki (F-09), zamanlama/geri alma, stok bağı (kanal payı/güvenlik stoğu), idempotency | P1 | F-08/F-09, ADR-0004 | Kabul edilmiş ADR: tek yazar ilkesi, bitiş işi garantisi, veri modeli |
| CMP-01 | Pazaryeri kampanya API spike | Trendyol/HB/N11/Pazarama resmi dokümanında kampanya/indirim/kupon uçlarının varlığı ve erişim şartı (partner mı) | P1 | İnsan (satıcı hesapları/pazaryeri iletişimi) | Her pazaryeri için "VAR (uç+şart)/YOK/DOĞRULANAMADI" tablosu, kaynak URL |
| CMP-02 | İç kampanya motoru | Kanal+SKU kapsamı, yüzde/TL/sabit fiyat, başlangıç/bitiş zamanlayıcı, önizleme, bitişte geri alma, denetim | P2 | CMP-00, B-09, B-10 | Önizleme = uygulanan (test); bitiş işi hata verirse critical bildirim; kampanya bitince fiyat orijinale döner |
| CMP-03 | Kampanya-stok koruması | Öncesi uygunluk kontrolü, kampanya stok payı, eşikte kampanyayı bitir/kanaldan çek, `publishPending` denetimi | P2 | CMP-02, GAP #5 | Stok eşik altına inince kampanya fiyatı otomatik biter (test); kampanya kaynaklı OVERSOLD sayısı ölçülür |
| CMP-04 | Pazaryeri kampanya katılımı (hazırlık + dışa aktarım / API) | Uygunluk hesabı (30 gün en düşük fiyat, marj), dışa aktarım, katılım takibi; CMP-01 sonucuna göre API adaptörü | P2 | CMP-01, CMP-02 | API doğrulanmadıysa yalnız hazırlık+dışa aktarım; vaat edilmeyen otomasyon kullanıcıya gösterilmez |
| CMP-05 | Kanal fiyat geçmişi (30 gün) | Kanal başına fiyat değişim kaydı, "indirim öncesi fiyat" kuralı kontrolü | P2 | Fiyat yayın hattı | Kampanya fiyatı kural ihlalinde uyarı; geçmiş tenant DB'de, PII yok |
| CMP-06 | Kampanya takvimi + sonuç raporu | Takvim görünümü, çakışma uyarısı, kâr etkisi (maliyet varsa) | P3 | CMP-02, F-10/B-13 | Maliyet yoksa "hesaplanamadı"; çakışan kampanya kaydı reddedilir |
| CMP-07 | Kupon / mağaza kampanyası (e-ticaret) | Ideasoft kupon/promosyon uçları (API doğrulanırsa) | P3 | CMP-01 | Ideasoft API kanıtı yoksa kalem kapanır (YAPILAMAZ) |
| PLT-01 | Ücretli API kullanım ölçümü + tenant kotası | WhatsApp mesaj, X gönderi, YouTube kota tüketimi; plan kotası, harcama tavanı | P2 | Entitlement (guard bayrağı kapalı: BACKLOG/PVP §1.3), Protokol 12 | Tenant başına aylık kullanım görünür; tavan aşılınca kanal durur ve bildirim gider |

Toplam 28 kalem: WhatsApp 8 (WA-00..07), Sosyal 11 (SOC-00..10), Kampanya 8 (CMP-00..07), Platform 1 (PLT-01) + 1 ADR/spike sayılı ayrıca. (Sayım: 8 + 11 + 8 + 1 = 28; tabloda 28 satır var.)

---

## G. Doğrulanamayanlar (rapora iddia olarak alınmamalı)
- Trendyol, Hepsiburada, N11, Pazarama resmi kampanya/indirim/kupon/flaş API uçları. (Hepsiburada developers: 403; N11 api: 404; Trendyol ana sayfa listelemedi.)
- İYS'de WhatsApp kanalı; tacir/esnaf onay istisnası; Fiyat Etiketi Yönetmeliği ayrıntısı.
- Instagram/Facebook Shops ve ürün etiketinin Türkiye'de fiilen kullanılabilirliği (yalnız bir haber sitesi: 21 ülke listesi); Instagram API'de yerel zamanlama; uzun ömürlü belirteç 60 gün detayı.
- X API rate limit değerleri, X yerel zamanlama, X'in Türkiye erişim riski.
- YouTube: yükleme kotası özetindeki çelişkili ifade (1.600 vs "100 çağrı"), Shorts kuralları, Merchant Center ile YouTube ürün etiketleme Türkiye uygunluğu, OAuth doğrulama detayı.
- WhatsApp: 1.10.2026 service/utility ücretlendirme değişikliği iddiası (resmi sayfa teyit etmedi), 250.000 aylık pazarlama tavanı, Türkiye birim fiyatlarının resmi rate card ile teyidi.
- TikTok Shop Türkiye lansmanı ve API programı; Pinterest Türkiye; LinkedIn.
- Rakip özellikleri: Dopigo, Entegra, Sentos, ideaConnect için WhatsApp, sosyal yayın ve kampanya yetenekleri.

## Kaynak listesi (erişim 2026-09-30)
Resmi: developers.facebook.com (WhatsApp cloud-api overview/get-started/webhooks/templates/pricing, graph-api webhooks, instagram-platform content-publishing/insights/instagram-api-with-instagram-login, pages-api posts, permissions, marketing-api items_batch); whatsappbusiness.com/policy; docs.x.com pricing + manage-tweets; developers.google.com/youtube/v3 (quota, videos.insert), developers.google.com/shopping-content/guides/sunset; developers.tiktok.com content-sharing-guidelines; developers.trendyol.com; ticaret.gov.tr SSS.
Üçüncü taraf: birfatura.com (Trendyol kampanya, Pazarama), ticimax.com blog, ideasoft.com.tr blog, support.ikas.com, chatdaddy.tech, chakrahq.com, postproxy.dev, zernio.com, retailtouchpoints.com, valueaddedresource.net, relevantaudience.com, productsup.com, flowhunt.io, bundle.social, getphyllo.com, ycloud.com, docs.360dialog.com, hukukcularevi.com, webrazzi.com.

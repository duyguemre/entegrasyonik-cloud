# E-Ticaret Entegrasyon Pazarı Bilgi Tabanı — 2026-09-30

Amaç: Entegrasyonik tanıtım sitesinde /rehber içerik merkezi (SEO + LLM görünürlüğü). Kapsam: `API_CONTRACTS_2026-09-30.md` ve `COMPETITOR_GAP_2026-09-30.md` tekrar edilmez; teknik API ayrıntısı için onlara bakılır.

## 0. Okuma kuralları

- Erişim tarihi (hepsi): 2026-09-30.
- Güven: `R` = resmi (kamu/pazaryeri/üretici kendi sitesi), `İ` = ikincil (haber, üçüncü taraf blog, rakip/entegratör blogu), `S` = yalnız arama özeti görüldü, sayfa gövdesi okunamadı.
- `[DEĞİŞEBİLİR — son doğrulama 2026-09-30]` = komisyon, ücret, eşik, tarih, vade. Sitede yayımlanırken sayfada "son güncelleme" tarihiyle ve kaynak linkiyle verilir.
- `DOĞRULANAMADI` = içeriğe GİRMEZ.
- `[RAKİP-ADI]` = kaynak veya metinde rakip/entegratör adı geçer. KB içinde serbest; SİTE içeriğinde kullanılmaz (kaynak linki olarak da gösterilmez, resmi karşılığı bulunmalıdır). Kaynak listesinde bu etiket taşıyan URL'ler sitede "kaynak" olarak verilmeden önce resmi kaynakla değiştirilmelidir.
- Bu turun sınırı: mevzuat.gov.tr ve GİB PDF'leri araçla okunamadı (JS/ikili). Bu yüzden mevzuat maddeleri resmi sitelerin arama özetinden ve ikincil kaynaktan teyit edildi; sitede yayından önce kanun/tebliğ metniyle madde numarası doğrulaması (bir insan/hukuk gözden geçirmesi) ŞARTTIR.

## 1. Kaynak kayıt defteri

| ID | URL | Güven | Not |
|---|---|---|---|
| S1 | https://ticaret.gov.tr/duyurular/turkiyede-e-ticaretin-gorunumu-raporu-yayinlandi-12-05-2026 | R | Türkiye'de E-Ticaretin Görünümü 2025 raporu duyurusu (12.05.2026) |
| S2 | https://etbis.ticaret.gov.tr/tr/Post/postturkiyede-e-ticaretin-gorunumu-raporunun-ingilizce-versiyonu-yayimlandi | R (S) | Rapor İngilizce sürümü |
| S3 | https://www.alomaliye.com/2026/05/12/turkiyede-e-ticaret-hacmi-2025te-4-6-trilyon-liraya-ulasti/ | İ | S1 teyidi |
| S4 | https://www.dunya.com/ekonomik-veriler/e-ticarette-dev-buyume-hacim-45-trilyon-lirayi-gecti-haberi-840243 | İ (S) | Haber teyidi |
| S5 | https://www.resmigazete.gov.tr/eskiler/2021/02/20210209-5.htm | R (S) | 509 Sıra No'lu VUK Genel Tebliği, IV.1.4 e-Fatura geçiş zorunluluğu |
| S6 | https://cdn.gib.gov.tr/api/gibportal-file/file/getFile?objectKey=MEVZUAT_TEBLIGLER%2FUNIVERSAL%2F2026%2FMEVZUAT_TEBLIGLER_2026_VukTeb509_Guncel.pdf | R (okunamadı) | 509 güncel hali; ADRES doğru, metin bu turda çıkarılamadı |
| S7 | https://cdn.gib.gov.tr/api/gibportal-file/file/getFileResources?objectKey=arsiv%2Fyardim-kaynaklar%2Finfografikler%2Fpdfs%2F2025_e_fatura.pdf | R (okunamadı) | GİB 2025 e-Fatura infografiği |
| S8 | https://ebelge.gib.gov.tr/eirsaliyehakkinda.html | R | e-İrsaliye tanım/kapsam |
| S9 | https://www.ideasoft.com.tr/e-ticaret-icin-e-fatura-zorunlulugu/ | İ [RAKİP-ADI: e-ticaret altyapısı, ortak/çakışan] | Eşikler özeti |
| S10 | https://sovos.com/tr/blog/kdv/e-faturaya-zorunlu-gecis-siniri-4-milyon-tl/ | İ | Eşik geçmişi (509 değişikliği, RG 22.01.2022 ifadesi) |
| S11 | https://sovos.com/tr/blog/kdv/2025te-e-arsiv-ve-e-fatura-zorunlulugu-nasil-degisti/ | İ | e-Arşiv limit değişimi iddiası (Tebliğ 573) |
| S12 | https://www.parasut.com/blog/e-arsiv-fatura-limitleri | İ [RAKİP-ADI] | e-Arşiv limit özeti |
| S13 | https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=6502&MevzuatTur=1&MevzuatTertip=5 | R (okunamadı) | 6502 sayılı Kanun |
| S14 | https://tuketici.ticaret.gov.tr/data/5e81982d13b876a1b04c7a42/Tuketicinin_Korunmasi_Hakkinda_Kanun_6502_Ocak_2021.pdf | R (S) | 6502 + ikincil mevzuat, Ticaret Bakanlığı |
| S15 | https://tuketici.ticaret.gov.tr/yayinlar/tuketici-bilgi-rehberi/mesafeli-sozlesmeler-hakkinda-bilgilendirme | R (S) | Mesafeli sözleşmeler tüketici rehberi |
| S16 | https://www.alomaliye.com/2025/05/24/mesafeli-sozlesmeler-yonetmeliginde-degisiklik-24-05-2025/ | İ | RG 24.05.2025 sayı 32909; yürürlük 01.01.2026 |
| S17 | https://www.cnnturk.com/ekonomi/e-alisveriste-yeni-donem-resmi-gazetede-yayimlandi-1829195 | İ | Aynı değişiklik haberi |
| S18 | https://ticaret.gov.tr/haberler/ticaret-bakanligi-internet-alisverislerinde-cayma-hakkinin-kaldirildigina-yonelik-haberleri-yalanladi | R (S) | Cayma hakkı kaldırılmadı açıklaması (metin okunmadı; yalnız başlık) |
| S19 | https://www.kvkk.gov.tr/Icerik/8577/kisisel-verileri-koruma-kurulunun-04-09-2025-tarihli-ve-2025-1572-sayili-kararinin-uygulama-esaslarina-iliskin-kamuoyu-duyurusu | R | VERBİS istisna kriterleri (Kurul 2025/1572) |
| S20 | https://www.kvkk.gov.tr/Icerik/8752/2025-yili-mali-bilanco-toplami-bakimindan-sicile-kayit-yukumlulugu-dogan-kurumlar-vergisi-mukellefi-tuzel-kisi-veri-sorumlularinin-verbis-kayit-suresi-hakkinda-kamuoyu-duyurusu | R | Kayıt süresi uzatması (Kurul 2026/1026, 13.05.2026; son gün 05.06.2026) |
| S21 | https://www.kvkk.gov.tr/Icerik/5273/Istisna | R (S) | Kayıt istisnaları listesi |
| S22 | https://verbis.kvkk.gov.tr/sharedFolder/veri-sorumlulari-sicil-bilgi-sistemi-kilavuzu.pdf?ts=20251006 | R (S) | VERBİS kılavuzu |
| S23 | https://iys.org.tr/iys/nedir | R (S) | İYS nedir |
| S24 | https://ticaret.gov.tr/ic-ticaret/bilgi-sistemleri/ticari-elektronik-ileti-yonetim-sistemi-iys | R (S) | İYS, Ticaret Bakanlığı |
| S25 | https://iys.org.tr/iys/sss | R (S) | İYS SSS |
| S26 | https://iys.org.tr/iys/kanun | R (S) | İYS mevzuat |
| S27 | https://www.lexpera.com.tr/resmi-gazete/metin/elektronik-ticarette-hizmet-saglayici-ve-araci-hizmet-saglayicilar-hakkinda-yonetmelik-29457 | İ | Hizmet sağlayıcı/aracı hizmet sağlayıcı yönetmeliği |
| S28 | https://alomaliye.com/2015/08/26/elektronik-ticarette-hizmet-saglayici/ | İ | Aynı |
| S29 | https://www.cottgroup.com/tr/mevzuat/item/ileti-yonetim-sistemi-ve-yeni-uygulamalar | İ | İYS uygulama özeti (tacir/esnaf istisnası) |
| S30 | https://developers.trendyol.com/docs/getting-started | R | Trendyol Marketplace API genel tanım; kimlik bilgisi adımı bu sayfada YOK |
| S31 | https://www.parasut.com/blog/trendyol-magaza-entegrasyonu-icin-api-anahtari | İ [RAKİP-ADI] | Trendyol API bilgisi panelden ("Hesap Bilgilerim > Entegrasyon Bilgileri") |
| S32 | https://www.tamindir.com/blog/trendyol-satici-olma-islemleri_90568/ | İ | Trendyol satıcı olma adımları, belgeler |
| S33 | https://birfatura.com/trendyol-magaza-giris-trendyol-magaza-acmak-yonetimi/ | İ [RAKİP-ADI] | Trendyol mağaza açma |
| S34 | https://www.ideasoft.com.tr/hepsiburada-magaza-acmak-rehberi/ | İ [RAKİP-ADI-benzer] | Hepsiburada satıcı ol adımları, HB mağaza türleri |
| S35 | https://www.habergazetesi.com.tr/hepsiburada-entegrasyon-icin-hangi-adimlari-izlemeliyim | İ | HB API kimlik bilgisi Destek Talep Formu ile |
| S36 | https://developers.hepsiburada.com | R (S) | HB geliştirici portalı (adres arama sonucunda geçti, açılmadı) |
| S37 | https://www.ideasoft.com.tr/n11-magaza-acma-rehberi/ | İ | N11 başvuru |
| S38 | https://birfatura.com/pazarama-satici-olmak-icin-gerekenler/ | İ [RAKİP-ADI] | Pazarama başvuru adresleri/belgeler |
| S39 | https://www.isbank.com.tr/is-ticari/pazaryeri-cozumleri | R (S) | Pazarama'nın sahibi olan banka sayfası (komisyon indirim kampanyası sayfası da var; gövde okunmadı) |
| S40 | https://developer.amazonservices.com/tr | R | Amazon SP-API Türkiye |
| S41 | https://developer.amazonservices.com/tr/amazon-ucuncu-taraf-sp-api-gelistirici-ucretlerini-iptal-etti | R | SP-API geliştirici ücretleri iptali duyurusu |
| S42 | https://www.ideasoft.com.tr/amazonda-satis-yapmak-amazon-magaza-acma-rehberi/ | İ [RAKİP-ADI-benzer] | Amazon satıcı kaydı belgeleri (MERSİS, vergi no, kimlik doğrulama) |
| S43 | https://www.ideasoft.com.tr/cicek-sepeti-magaza-acma-rehberi/ | İ | ÇiçekSepeti başvuru |
| S44 | https://www.ideasoft.com.tr/epttavm-magaza-acmak-rehberi/ | İ | PttAVM başvuru |
| S45 | https://www.ideasoft.com.tr/trendyol-erken-odeme-nedir/ | İ | Trendyol ödeme günleri, erken ödeme |
| S46 | https://www.ideasoft.com.tr/yardim/api-kullanimi/ | R (Ideasoft kendi yardım sayfası) | Ideasoft API: Entegrasyonlar > API, Client ID/Secret, okuma/yazma izni |
| S47 | https://www.ideasoft.com.tr/eticaret-cozum-merkezi/muhasebe-entegrasyonlari/ | R (Ideasoft) | ERP/muhasebe entegrasyon çeşitleri |
| S48 | https://ikas.com/tr/on-muhasebe-entegrasyonlari | İ [RAKİP-ADI] | Bizimhesap dahil ön muhasebe listesi |
| S49 | https://birfatura.com/kargo-anlasmasi-nasil-yapilir/ | İ [RAKİP-ADI] | Kargo firmaları ve entegrasyon |
| S50 | https://www.milliyet.com.tr/advertorial/amazon-turkiye-sifir-komisyon-buyuk-kazanc-paketi-ile-satis-ortaklari-icin-tarihinin-en-kapsamli-buyume-hizlandirma-programini-7579830 | İ (advertorial) | Amazon TR kampanya (içeriğe girmez) |

Toplam kaynak URL: 50 (21 resmi/S-resmi, 29 ikincil). Resmi olup gövdesi okunanlar: S1, S8, S19, S20, S30, S40, S41, S46, S47. Kalanı özet/ikincil.

## 2. Doğrulanmış olgular (özet tablo)

| # | Olgu | Değer | Kaynak | Güven | Değişkenlik |
|---|---|---|---|---|---|
| F1 | Türkiye e-ticaret hacmi 2025 | 4,57 trilyon TL, önceki yıla göre +%52,2; 115,43 milyar USD, +%28,9 | S1 (S3 teyit) | R | Yıllık; rapor 12.05.2026 |
| F2 | 2025 işlem sayısı | 5,94 milyar | S1 | R | yıllık |
| F3 | Aktif e-ticaret işletmesi (2025) | 634.611 (%75 şahıs, %21 ltd., %4 anonim) | S1 | R | yıllık |
| F4 | Perakende e-ticaret hacmi 2025 | 2,46 trilyon TL (+%51,8) | S1 | R | yıllık |
| F5 | GSYH içindeki pay / toplam ticarette pay | %6,9 / %19,3 | S1 | R | yıllık |
| F6 | Ödeme yöntemi payı | Kart %62,5 (3D Secure kullanımı %64,1); havale/EFT %29,2; kapıda ödeme %3,5 | S1 | R | yıllık |
| F7 | Q-commerce 2025 | 388,7 milyar TL, toplamın %8,5'i; C2C 21,8 milyar TL | S1 | R | yıllık |
| F8 | Pazaryeri payı | Rapor duyurusunda pazaryeri payı YOK | S1 | R | DOĞRULANAMADI: pazaryeri payı içeriğe girmez |
| F9 | Cayma hakkı | Tüketici, 14 gün içinde gerekçe göstermeden ve cezai şart ödemeden cayabilir (6502 md. 48) | S14, S15 (S) | R | Mevzuat; madde no'yu kanun metniyle doğrula |
| F10 | Ön bilgi verilmezse cayma süresi | Bilgilendirme yoksa 14 gün bağlayıcı değil; en fazla 1 yıl uzar (özet) | S14 (S) | R | Aynı |
| F11 | Mesafeli Sözleşmeler Yönetmeliği değişikliği | RG 24.05.2025 (sayı 32909), yürürlük 01.01.2026: iade kargo gideri tüketiciye yüklenemez (satıcının belirttiği taşıyıcıyla iade halinde); cayma hakkı bilgisi ve taşıyıcı bilgisi ön bilgide; uyuşmazlık çözüm yolları bilgisi | S16, S17 | İ | Değişebilir; Yönetmelik metni doğrulanmalı |
| F12 | e-Fatura zorunluluğu (genel) | Brüt satış hasılatı 3 milyon TL ve üzeri olanlar; ilgili yılı izleyen yılın 1 Temmuz'una kadar geçiş | S9, S10 | İ | DEĞİŞEBİLİR; 2025 hasılat için 01.07.2026 |
| F13 | e-Fatura zorunluluğu (internet satış, e-ticaret ortamı) | 500.000 TL ve üzeri brüt satış hasılatı (2022 ve sonrası) | S9, S10 | İ | DEĞİŞEBİLİR; tebliğ metniyle doğrula |
| F14 | Eşik yılı çelişkisi | S9 "2023 ve sonrası 3 milyon" der; S10 "2022 ve sonrası" der | S9 vs S10 | İ | ÇELİŞKİ: yıl ifadesi yazılmaz, yalnız güncel eşik ve "tebliğe bakın" |
| F15 | e-Arşiv basit usul sınırı | S12/arama: basit usul/işletme hesabında 3.000 TL üzeri e-Arşiv; S11: 2026'da sınırın tamamen kalktığı iddiası (Tebliğ 573, 12.11.2024) | S11, S12 | İ | ÇELİŞKİLİ: DOĞRULANAMADI. Sitede "e-Arşiv sınırı" rakamı YAZILMAZ |
| F16 | e-Fatura saklama ve düzenleme süresi | 10 yıl saklama; 7 gün içinde düzenleme (S9 ifadesi) | S9 | İ | Tebliğ metni doğrulanmalı |
| F17 | e-İrsaliye kapsamı | 509 ile: hâl kayıt sistemi tüccarları, belirli EPDK lisanslı/ÖTV listeli mükellefler, madencilik, şeker, demir-çelik, gübre takip sistemi kullanıcıları ve önceki dönem brüt satışı 25 milyon TL+ e-Fatura mükellefleri | S8 | R | DEĞİŞEBİLİR |
| F18 | VERBİS istisnası | Çalışan <50 VE bilanço <100 milyon TL ise (özel nitelikli kişisel veri işlemek ana faaliyet değilse) kayıt yükümlülüğü yok; ana faaliyet özel nitelikli veri ise çalışan <10 ve bilanço <10 milyon TL | S19 | R | DEĞİŞEBİLİR; Kurul 2025/1572 (04.09.2025) |
| F19 | VERBİS kayıt süresi | Yükümlü olanlara 30 gün; 2025 bilançosuyla yükümlü olanlar için son gün 05.06.2026 (Kurul 2026/1026, 13.05.2026) | S20 | R | Süre geçmiş; sayfada yalnız 30 gün kuralı |
| F20 | İYS | Ticaret Bakanlığı ticari elektronik ileti yönetim sistemi; onay/ret kayıtları zaman damgalı; hizmet sağlayıcılar temel hizmetleri ücretsiz kullanır | S23-S26 | R (S) | Kural, yönetmelikle doğrula |
| F21 | Tacir/esnafa ileti | Tacir ve esnafa gönderimde önceden onay aranmaz, ret hakkı saklı | S29 | İ | Kanun md. 6563 ile doğrula |
| F22 | ETBİS | E-ticaret yapan işletmelerin ETBİS kaydı (6563 ve 6502) | S27, S28 (arama özeti) | İ | Doğrula |
| F23 | Amazon SP-API | SP-API geliştirici ücretleri iptal edildi (duyuru sayfası) | S41 | R | Değişebilir |

## 3. Pazaryerleri (bölüm 1)

Genel not: Aşağıdaki başvuru adımlarının çoğu resmi satıcı sayfalarından DEĞİL, ikincil kaynaklardan derlendi (bu turda satıcı portalları açılıp okunamadı). Sitede yayımlamadan önce her pazaryerinin resmi "Satıcı Ol" sayfası açılıp adımlar tek tek karşılaştırılmalı (görev: içerik editörü). Komisyon: hiçbir pazaryeri için resmi komisyon tablosu bu turda doğrulanamadı; komisyon sütunu tümüyle DOĞRULANAMADI. Pazaryeri komisyonları kategori bazlıdır ve satıcı panelinde verilir; sayfalarda yalnız "kategori bazlıdır, satıcı panelindeki güncel tabloya bakın" denir.

### 3.1 Ortak yapı (her pazaryeri sayfasının şablonu)

1. Kim satış yapabilir (işletme türü, vergi mükellefiyeti). 2. Başvuru adımları. 3. Belgeler. 4. API/entegrasyon erişimi. 5. Ürün listeleme kuralları. 6. Sipariş > kargo > iade akışı. 7. Hakediş/ödeme döngüsü. 8. Komisyon (yalnız resmi ve "değişebilir" notuyla). 9. SSS. 10. Entegrasyonik köprüsü (kanal bağlantısı, tek stok).

### 3.2 Pazaryeri bazlı olgular

| Pazaryeri | Satıcı olma özeti | API kimlik bilgisi | Hakediş | Komisyon | Kaynak / güven |
|---|---|---|---|---|---|
| Trendyol | Başvuru partner sitesinden; bireysel değil, vergi mükellefi işletme; belgeler: vergi levhası, imza sirküleri, faaliyet belgesi, ETBİS belgesi, IBAN, e-fatura mükellefiyeti (ikincil listeler) | Mağaza sonrası panelde "Hesap Bilgilerim > Entegrasyon Bilgileri": Satıcı ID, API Key, API Secret | Ödemeler haftada Pazartesi ve Perşembe (ikincil); erken ödeme (komisyonlu) opsiyonel | DOĞRULANAMADI | S30 (R, adım yok), S31, S32, S33, S45 (İ). Ödeme günleri DEĞİŞEBİLİR |
| Hepsiburada | "Kurumsal > Hepsiburada'da Satıcı Ol"; mağaza formatları: Standart, Kadın Girişimci, HepsiTürkiye'den; şirket/vergi/banka bilgisi | MPOP API; kullanıcı adı/şifre/merchant ID'yi satıcı panelinde "Satıcı Destek Talep Formu" ile talep (ikincil) | İki haftada bir ödeme iddiası (kaynak zayıf) | DOĞRULANAMADI | S34, S35 (İ), S36 (R, açılmadı). Hakediş DOĞRULANAMADI: içeriğe girmez |
| N11 | Üyelik formu, belgeler (posta ile gönderim, ikincil), onay süresi kaynaklarda 15-20 gün (tahmini/gözlem) | DOĞRULANAMADI (kaynak yok) | DOĞRULANAMADI | DOĞRULANAMADI | S37 (İ) |
| Pazarama | Satıcı ön başvuru formu, SMS + e-posta aktivasyon; belgeler: satıcı sözleşmesi, vergi levhası, imza sirküleri, sicil gazetesi, faaliyet belgesi; e-fatura mükellefi ve e-Arşiv kesebilme şartı | DOĞRULANAMADI | DOĞRULANAMADI | Kategori/marka bazlı (genel ifade, oran yok) | S38 (İ), S39 (R S) |
| Amazon Türkiye | Firma bilgileri, ticaret sicil no, vergi no, MERSİS, yetkili kimlik doğrulama (kimlik + yüz veya görüntülü görüşme); Profesyonel/Bireysel plan | SP-API (Amazon'un kendi geliştirici sayfası); geliştirici ücretleri iptal duyurusu | DOĞRULANAMADI | Aylık plan ücreti ve komisyon DOĞRULANAMADI (resmi tablo okunamadı); Mayıs 2026 sıfır komisyon kampanyası yalnız advertorial (içeriğe girmez) | S40, S41 (R); S42 (İ); S50 (İ, kullanma) |
| ÇiçekSepeti | Başvuru türü seçimi (bayi/franchise/pazaryeri), firma bilgileri, kategori; e-fatura mükellefi ve e-Arşiv kesebilme; belgeler: vergi levhası, imza sirküleri, ortaklık sözleşmesi, banka belgesi vb. | DOĞRULANAMADI | DOĞRULANAMADI | DOĞRULANAMADI | S43 (İ) |
| PttAVM | satici.pttavm.com'dan başvuru (ikincil); gerçek/tüzel işletme; başvuru ücretsiz (ikincil) | Onay sonrası mağaza ID, API Key/Secret; HMAC-SHA256 imzalı istek iddiası (ikincil, tek kaynak) | DOĞRULANAMADI | Kategori bazlı (oran yok) | S44 (İ); API iddiası DOĞRULANAMADI |

### 3.3 Pazaryeri bazlı sayfa içeriği

Her bir pazaryeri sayfası için başlık, açıklama, taslak ve SSS 8. bölümdeki tablolarda. Ortak SSS: "API erişimi nasıl alınır?", "Aynı ürünü birden çok pazaryerinde satmak için ne gerekir?", "Stok neden bir kanalda satılıp diğerinde tükenmez?", "Komisyon nerede görülür?" (cevap: satıcı panelinde ve güncel sözleşmede).

Genel akış (tüm pazaryerleri için ortak, kavramsal, kaynak gerekmez): sipariş alınır > satıcıya bildirilir > kargoya teslim süresi (SLA) içinde kargoya verilir, takip numarası pazaryerine girilir > teslimat > iade süresi > hakediş. Pazaryerine göre süreler ve ceza kuralları değişir; her pazaryeri sayfasında satıcı sözleşmesinden kaynakla verilmeli, aksi halde yazılmaz.

## 4. E-ticaret altyapısı ve ERP/ön muhasebe (bölüm 2)

Olgular:
- Ideasoft API: yönetici panelinde Entegrasyonlar > API > API Ekle; uygulama adı ve yönlendirme adresi girilir, Client ID ve Client Secret üretilir; okuma veya okuma/yazma izni yönetilir; yalnız ID 1 yönetici kullanıcı görür (S46, R). Destek: apisupport@ideasoft.com.tr (S46).
- Ideasoft muhasebe/ERP entegrasyon çeşitleri (Logo vb.) tanıtılır; "stok, fiyat, sipariş, fatura, müşteri" senkronu vaadi (S47, R pazarlama iddiası).
- Bizimhesap: bulut ön muhasebe; pazaryeri/e-ticaret ve e-fatura/e-arşiv entegrasyonu iddiası (S48, İ [RAKİP-ADI kaynak]); resmi Bizimhesap sayfası doğrulanmadı.

Sayfa içeriği (sitede): "E-ticaret altyapısı ile pazaryeri entegrasyonu nedir", "ERP ve ön muhasebe entegrasyonu ne işe yarar", "Veri akışı diyagramı". Veri akışı (kavramsal; Entegrasyonik'in kendi mimarisinden, dış kaynak gerekmez): Ürün ve stok tek merkezde > kanallara yayın; sipariş kanallardan tek merkeze > stok düşümü > ERP'ye satış/fatura kaydı > kargo takip numarası kanala geri. Doğrulanmış Entegrasyonik kapsamı: Ideasoft ve Bizimhesap konektörleri var (CLAUDE.md, INTEGRATIONS_REGISTRY); Shopify/WooCommerce/Magento sayfada "yakında" değil YAZILMAZ (yalnız UI formu var).

## 5. E-fatura / e-arşiv / e-irsaliye (bölüm 3)

- Yetkili kurum: GİB; dayanak 509 sıra no'lu VUK Genel Tebliği (S5, S6, S8).
- Kimler zorunlu (DEĞİŞEBİLİR — 2026-09-30): brüt satış hasılatı 3 milyon TL ve üzeri mükellefler; internet ortamında satış yapanlar için 500.000 TL (F12-F13). Yıl bilgisinde çelişki (F14) nedeniyle sayfada "eşik, tebliğ IV.1.4 bölümüne göre; güncel metin için GİB" ifadesi. E-ticaret aracılığında (pazaryeri) satış yapanlar da kapsamdadır (S9, İ).
- e-Arşiv limit rakamı: DOĞRULANAMADI (F15). Yayın öncesi GİB duyurusu doğrulanır.
- e-İrsaliye: F17 kapsamı (S8, R). Çoğu pazaryeri satıcısı için zorunlu değil; kapsama giriyorsa gerekir. Alıcıya mal göndermede irsaliye eşiği için resmi metin okunmalı.
- Pazaryeri siparişlerinde fatura akışı (genel akış): sipariş > fatura düzenleme (e-Fatura ya da e-Arşiv) > fatura bağlantısı/PDF'in pazaryerine yüklenmesi > müşteriye görünür. Pazaryerinin fatura yükleme süresi/kuralı her pazaryeri için ayrı kaynakla; DOĞRULANAMADI, yazılmaz.
- Entegratör kavramı: GİB'e özel entegratör olarak yetkilendirilmiş şirketler aracılığıyla fatura iletimi. Yetkili özel entegratör listesi GİB kaynaklı (resmi liste bu turda çıkarılmadı: DOĞRULANAMADI). Entegrasyonik durumu: e-fatura adaptörü henüz backend'de yok (CLAUDE.md); sitede "e-fatura ile entegre" iddiası KURULMAZ, "yol haritasında/ortak entegratörle" dili Protokol 12 kararına bağlı.

## 6. Kargo (bölüm 4)

Doğrulanan: başlıca firmalar (Yurtiçi, Aras, MNG, Sürat, PTT Kargo, UPS, DHL) ikincil kaynakta listelenir (S49, İ). Pazaryeri anlaşmalı kargo modeli (pazaryerinin toplu tarifesiyle satıcının kargo kodu kullanması) ve takip numarası akışı (kargo çıkışı > takip no > pazaryerine bildirim > teslimat durumu) genel bilgidir; her pazaryerinin kendi anlaşmalı kargo listesi ve süresi için resmi kaynak bu turda bulunamadı: DOĞRULANAMADI, sayfada firma adı listesi verilmez (yalnız kavram). Kargo entegrasyonu Entegrasyonik'te henüz yok (yalnız UI formu).

## 7. Mevzuat (bölüm 5)

- KVKK: satıcı, alıcı verisinin veri sorumlusudur (kendi sitesinde ve pazaryerinde ayrı ayrı olabilir); pazaryeri kendi başına da sorumlu olabilir. Entegrasyon yazılımı satıcı adına veri işliyorsa veri işleyen rolündedir (KVKK kavramları; resmi tanım 6698 md. 3 ile doğrulanacak). VERBİS istisnası F18 (S19). Bu turda 6698 maddesi ve KVKK rehberi okunamadı.
- 6502 ve Mesafeli Sözleşmeler Yönetmeliği: F9-F11. Cayma hakkı istisnaları (madde listesi) ve iade süresi (14 gün, ödeme iadesi) bu turda resmi metinden çıkarılmadı; sayfada yalnız "14 gün" ve resmi bağlantı verilir, istisna listesi DOĞRULANAMADI.
- Elektronik Ticaret Kanunu 6563 + hizmet sağlayıcı yönetmeliği: aracı hizmet sağlayıcı, ETBİS (F22), işlem rehberi yükümlülüğü (ikincil, S27/S28).
- ETK/İYS: F20-F21. Ticari ileti için onay ve İYS kaydı; tacir/esnafa istisna ikincil (F21).
- Her mevzuat sayfasında sorumluluk reddi: "hukuki danışmanlık değildir".

## 8. Sayfa katalogu (SEO planı)

Format: URL | Başlık (H1/title) | Açıklama (<=150 kr) | Hedef arama niyeti | Taslak maddeleri | SSS. Tahmini = kaynaksız hacim tahmini (Y/O/D = yüksek/orta/düşük, GERÇEK VERİ DEĞİL; yayın öncesi Search Console/planlayıcı ile ölçülür).

### 8.1 Hub

R0. /rehber | E-Ticaret ve Pazaryeri Entegrasyon Rehberi | Pazaryeri, e-fatura, kargo ve mevzuat rehberleri; güncel kaynaklı, tarihli. | Bilgi/gezinme | Kategori kartları, en çok okunanlar, son güncellemeler, sözlük bağlantısı | "Rehber neye dayanır?"

### 8.2 Pazaryerleri (/rehber/pazaryerleri)

R1. /rehber/pazaryerleri | Türkiye Pazaryerleri Rehberi | Trendyol, Hepsiburada, N11, Pazarama, Amazon, ÇiçekSepeti, PttAVM: satıcı olma, API ve süreçler. | "türkiye pazaryerleri" (O, tahmini) | Karşılaştırma tablosu (başvuru, belge, API), pazaryeri seçme ipuçları | Hangi pazaryeri bana uygun?
R2. /rehber/pazaryerleri/trendyol-satici-olma | Trendyol'da Satıcı Nasıl Olunur? | Trendyol satıcı başvurusu, belgeler ve API bilgilerini panelden alma adımları. | "trendyol satıcı olma" (Y, tahmini) | Adımlar (HowTo), belge listesi, API bilgisi nerede, sipariş-kargo-iade, hakediş genel | Bireysel satış olur mu? API anahtarı nerede?
R3. /rehber/pazaryerleri/hepsiburada-satici-olma | Hepsiburada'da Satıcı Nasıl Olunur? | Hepsiburada mağaza türleri, başvuru adımları ve API erişim talebi. | "hepsiburada satıcı ol" (Y, tahmini) | Standart/Kadın Girişimci/HepsiTürkiye'den; API için destek formu | API bilgisini nasıl alırım?
R4. /rehber/pazaryerleri/n11-satici-olma | n11'de Satıcı Olma Rehberi | n11 mağaza başvurusu, belgeler ve entegrasyon adımları. | "n11 mağaza açma" (O, tahmini) | Adımlar, belge, onay süresi (kaynak doğrulanmalı) | Ücret var mı? (DOĞRULANAMADI: yazma)
R5. /rehber/pazaryerleri/pazarama-satici-olma | Pazarama'da Satıcı Olma Rehberi | Pazarama ön başvuru, belgeler, e-fatura şartı ve API. | "pazarama satıcı" (D-O, tahmini) | Adımlar, e-fatura şartı | Komisyon nasıl belirlenir? (kategori bazlı)
R6. /rehber/pazaryerleri/amazon-turkiye-satici-olma | Amazon Türkiye'de Satıcı Olma Rehberi | Amazon.com.tr satıcı kaydı, kimlik doğrulama ve SP-API. | "amazon türkiye satıcı" (O, tahmini) | Kayıt bilgisi, kimlik doğrulama, SP-API | SP-API ücretli mi? (duyuru S41)
R7. /rehber/pazaryerleri/ciceksepeti-satici-olma | ÇiçekSepeti'nde Satıcı Olma Rehberi | ÇiçekSepeti başvuru türleri, belgeler ve entegrasyon. | "çiçeksepeti satıcı ol" (D-O, tahmini) | Başvuru türleri, e-fatura şartı | Hangi kategoriler?
R8. /rehber/pazaryerleri/pttavm-satici-olma | PttAVM'de Satıcı Olma Rehberi | PttAVM mağaza başvurusu, belgeler ve entegrasyon adımları. | "pttavm satıcı" (D-O, tahmini) | Adımlar, belgeler | Ücretsiz mi? (ikincil)
R9. /rehber/pazaryerleri/pazaryeri-api-erisimi | Pazaryeri API Erişimi Nasıl Alınır? | Trendyol, Hepsiburada ve diğerlerinde API anahtarı/kimlik bilgisi alma yolları. | "pazaryeri api anahtarı" (O, tahmini) | Pazaryeri bazlı tablo (S30-S36), güvenlik | API anahtarımı kimle paylaşırım?
R10. /rehber/pazaryerleri/hakedis-ve-odeme-dongusu | Pazaryeri Hakediş ve Ödeme Döngüsü | Hakediş kavramı, ödeme takvimi mantığı ve mutabakat ipuçları. | "trendyol hakediş" (Y, tahmini) | Kavram, takvim (kaynaklı ve değişebilir), mutabakat | Ödeme günleri değişir mi? (evet)

### 8.3 Altyapılar ve ERP (/rehber/altyapi-erp)

R11. /rehber/altyapi-erp/eticaret-altyapisi-pazaryeri-entegrasyonu | E-Ticaret Altyapısı ile Pazaryeri Entegrasyonu | Web sitenizi pazaryerleriyle tek stokta birleştirme mantığı. | "e-ticaret sitesi pazaryeri entegrasyonu" (Y, tahmini) | Ideasoft API adımları (S46), veri akışı | Kendi sitem ile pazaryeri stoğu nasıl eşleşir?
R12. /rehber/altyapi-erp/erp-on-muhasebe-entegrasyonu | ERP ve Ön Muhasebe Entegrasyonu | Sipariş, stok ve fatura verisinin ERP'ye akışı; ne işe yarar. | "erp entegrasyonu e-ticaret" (O, tahmini) | Veri akışı, çift kayıt sorunu, örnek senaryo | Hangi veri ERP'ye gider?

### 8.4 E-fatura (/rehber/e-fatura)

R13. /rehber/e-fatura | E-Fatura, E-Arşiv ve E-İrsaliye Rehberi | Kimler zorunlu, pazaryeri satışında fatura akışı ve entegratör kavramı (GİB kaynaklı). | "e-fatura zorunluluğu" (Y, tahmini) | Eşikler (değişebilir, F12-F13), tanımlar | Sınırı geçtim mi nasıl anlarım?
R14. /rehber/e-fatura/eticarette-e-fatura-zorunlulugu | E-Ticarette E-Fatura Zorunluluğu | İnternet satışında e-fatura ve e-arşiv geçiş koşulları ve tarihleri. | "e-ticaret e-fatura zorunluluğu" (Y, tahmini) | Eşik, geçiş tarihi, ceza (VUK, doğrulanacak) | 500 bin TL ne demek?
R15. /rehber/e-fatura/pazaryeri-siparislerinde-fatura-akisi | Pazaryeri Siparişlerinde Fatura Akışı | Sipariş faturalaması, e-arşiv ve pazaryerine fatura yükleme mantığı. | "trendyol fatura kesme" (Y, tahmini) | Akış, iade/iptal faturası | Fatura kimin adına?
R16. /rehber/e-fatura/e-irsaliye-nedir | E-İrsaliye Nedir, Kimler Kullanır? | E-irsaliye tanımı ve kimlerin kullanmak zorunda olduğu. | "e-irsaliye nedir" (O, tahmini) | F17 kapsamı | E-ticaret için zorunlu mu?
R17. /rehber/e-fatura/entegrator-nedir | E-Fatura Entegratörü Nedir? | Özel entegratör kavramı ve ne zaman gerekir. | "e-fatura entegratörü" (O, tahmini) | Kavram, seçim kriterleri | GİB portalı yeterli mi?

### 8.5 Kargo (/rehber/kargo)

R18. /rehber/kargo/kargo-entegrasyonu-nedir | Kargo Entegrasyonu Nedir? | Pazaryeri ve sitede kargo etiketi, takip numarası ve durum akışı. | "kargo entegrasyonu" (O, tahmini) | Akış, takip no | Takip numarası nasıl pazaryerine gider?
R19. /rehber/kargo/pazaryeri-anlasmali-kargo | Pazaryeri Anlaşmalı Kargo Nasıl Çalışır? | Anlaşmalı kargo modeli, kargo kodu ve satıcı kendi anlaşması. | "anlaşmalı kargo" (O, tahmini) | Model, artı/eksi | Kendi kargo anlaşmam olur mu?
R20. /rehber/kargo/iade-kargo | İade Kargo ve Yeni Yönetmelik | Mesafeli Sözleşmeler Yönetmeliği'ndeki iade kargo gideri düzenlemesi (2026). | "iade kargo ücreti kim öder" (Y, tahmini) | F11 | Kargo ücreti kimde? (satıcının belirttiği taşıyıcı ile: tüketici değil)

### 8.6 Mevzuat (/rehber/mevzuat)

R21. /rehber/mevzuat/kvkk-e-ticaret-saticilar | KVKK ve E-Ticaret Satıcısının Sorumlulukları | Alıcı verisi, veri sorumlusu ve işleyen, VERBİS istisna kriterleri. | "kvkk e-ticaret" (O, tahmini) | F18, roller | VERBİS'e kayıt zorunlu mu?
R22. /rehber/mevzuat/cayma-hakki-14-gun | Cayma Hakkı ve 14 Gün Kuralı | 6502 ve yönetmeliğe göre cayma süresi, iade ve satıcı yükümlülükleri. | "cayma hakkı 14 gün" (Y, tahmini) | F9-F11 | Ön bilgi verilmezse süre uzar mı?
R23. /rehber/mevzuat/mesafeli-sozlesmeler-yonetmeligi | Mesafeli Sözleşmeler Yönetmeliği Özeti | Ön bilgilendirme, cayma ve 2026 değişikliği. | "mesafeli satış sözleşmesi" (Y, tahmini) | F11, ön bilgi formu | Sözleşme zorunlu mu?
R24. /rehber/mevzuat/etk-iys-ticari-ileti | Ticari İleti (ETK) ve İYS | Ticari ileti izni, İYS kaydı ve tacir/esnaf istisnası. | "iys nedir" (O, tahmini) | F20-F21 | SMS kampanyası için izin?
R25. /rehber/mevzuat/etbis-e-ticaret-kanunu | ETBİS ve E-Ticaret Kanunu | ETBİS kaydı, hizmet sağlayıcı ve aracı hizmet sağlayıcı. | "etbis nedir" (O, tahmini) | F22 | ETBİS kimin için?

### 8.7 Sözlük ve karşılaştırma

R26. /rehber/sozluk | E-Ticaret Entegrasyon Sözlüğü | 45 temel terim, kısa tanım. | "stok senkronu nedir" ve benzeri (Y toplam, tahmini) | Bölüm 9 | -
R27. /rehber/karsilastirma/pazaryeri-entegrasyon-yazilimi-nasil-secilir | Pazaryeri Entegrasyon Yazılımı Nasıl Seçilir? | Kanal kapsamı, stok senkron sıklığı, aşırı satış koruması, e-fatura, güvenlik kriterleri. | "pazaryeri entegrasyon programı" (Y, tahmini) | Bölüm 10 tablo | Ücretsiz mi ücretli mi?
R28. /rehber/karsilastirma/tek-stokla-cok-kanal-yonetimi | Tek Stokla Çok Kanal Yönetimi Nasıl Yapılır? | Tek stok, rezervasyon ve aşırı satış önleme adımları. | "çoklu pazaryeri stok yönetimi" (O, tahmini) | Bölüm 10 adımlar | Aşırı satış neden olur?
R29. /rehber/karsilastirma/asiri-satis-overselling | Aşırı Satış (Overselling) Nedir, Nasıl Önlenir? | Stok tükenmiş üründe sipariş almanın nedenleri ve önleme yöntemleri. | "overselling" / "stokta olmayan ürün siparişi" (D-O, tahmini) | Nedenler: gecikmeli senkron, yarış durumu; çözüm: rezervasyon | Pazaryeri ceza verir mi? (doğrulanmadan yazma)

### 8.8 Pazar verisi

R30. /rehber/pazar-verisi/turkiye-eticaret-2025 | Türkiye E-Ticaret Pazarı 2025 | Ticaret Bakanlığı 2025 raporuna göre hacim, büyüme ve işletme sayısı. | "türkiye e-ticaret hacmi" (Y, tahmini) | F1-F7, grafik, "pazaryeri payı raporda yok" notu | Hacim ne kadar?

Toplam: 31 sayfa (R0-R30) + sözlük alt terim sayfaları (opsiyonel, DefinedTerm anchor) = 31.

## 9. Sözlük (46 terim, editoryal kısa tanımlar)

Not: tanımlar genel sektör kavramlarıdır; olgusal sayısal iddia içermez. Yasal terimler (6-9, 33, 34, 38) yayın öncesi resmi tanımla teyit edilmelidir.

1. Tek stok: Tüm kanalların tek bir stok kaynağından beslenmesi.
2. Aşırı satış (overselling): Eldeki stoktan fazla sipariş kabulü.
3. Stok rezervasyonu: Sipariş onaylanana dek stoğun ayrılması.
4. Stok senkronu: Stok değişikliğinin tüm kanallara yansıtılması.
5. Çok kanallı satış (multichannel): Birden çok kanaldan satış.
6. Omnichannel: Kanalların müşteri açısından tek deneyimde birleşmesi.
7. Pazaryeri: Birden çok satıcının aynı platformda satış yaptığı e-ticaret ortamı.
8. Aracı hizmet sağlayıcı: Başkalarının ticaretine elektronik ortam sağlayan kişi (6563; resmi tanımla doğrula).
9. Hizmet sağlayıcı: Elektronik ticaret faaliyetini yapan kişi (6563).
10. SKU: Satıcının ürün varyantına verdiği stok kodu.
11. Barkod: Ürünü makine okumasıyla tanımlayan kod.
12. GTIN: Küresel ticari ürün numarası (EAN/UPC dahil).
13. Varyant: Aynı ürünün beden/renk gibi seçenekleri.
14. Ürün kataloğu eşleme: Aynı ürünün kanallardaki karşılığının bağlanması.
15. Kategori eşleme: Kendi kategori ağacının pazaryeri kategorisiyle eşlenmesi.
16. Özellik (attribute) eşleme: Ürün özelliklerinin pazaryeri şablonuna eşlenmesi.
17. Buybox: Aynı ürünü satan satıcılar arasında satın alma kutusunu kazanma yarışı.
18. Hakediş: Satıcının satıştan kesintiler sonrası alacağı tutar.
19. Komisyon: Pazaryerinin satıştan aldığı pay.
20. Mutabakat: Sipariş ve ödeme kayıtlarının karşılaştırılması.
21. İade: Ürünün satıcıya geri gönderilmesi ve ödemenin geri verilmesi.
22. Talep (claim): İade/iptal/değişim başvurusu.
23. SLA: Hizmet seviyesi taahhüdü (ör. kargoya verme süresi).
24. Kargoya teslim süresi: Siparişin kargoya verilmesi için tanınan süre.
25. Takip numarası: Gönderinin izlendiği kod.
26. Anlaşmalı kargo: Pazaryerinin taşıyıcıyla yaptığı toplu anlaşma.
27. API: Yazılımların birbiriyle konuşma arayüzü.
28. Webhook: Olay olunca karşı sisteme otomatik çağrı.
29. Rate limit: Belirli sürede izin verilen istek sayısı.
30. Kimlik bilgisi (API key/secret): API erişim anahtarı çifti.
31. ERP: Kurumsal kaynak planlama yazılımı.
32. Ön muhasebe: KOBİ düzeyi muhasebe/stok/cari yazılımı.
33. e-Fatura: Kayıtlı mükellefler arası elektronik fatura.
34. e-Arşiv: E-fatura mükellefi olmayanlara/tüketiciye elektronik fatura.
35. e-İrsaliye: Elektronik sevk irsaliyesi.
36. Özel entegratör: GİB adına e-belge hizmeti veren yetkili şirket.
37. Fiyat kuralı: Kanala göre otomatik fiyat hesaplama kuralı.
38. Kampanya: Pazaryerinde zamanla sınırlı indirim programı.
39. Marketplace fulfillment: Depolama ve kargonun pazaryeri tarafından yapılması.
40. Fulfillment (genel): Depolama, paketleme ve sevkiyat operasyonu.
41. Kritik stok eşiği: Uyarı/durdurma için belirlenen minimum stok.
42. Güvenlik stoğu (tampon): Aşırı satışa karşı ayrılan pay.
43. Ürün yayını (listing): Ürünün kanalda satışa açılması.
44. Toplu işlem: Çok ürüne tek seferde değişiklik.
45. Denetim izi: Kim ne zaman ne değiştirdi kaydı.
46. VERBİS: Veri Sorumluları Sicil Bilgi Sistemi.
47. İYS: İleti Yönetim Sistemi.
48. ETBİS: Elektronik Ticaret Bilgi Sistemi.

## 10. Seçim rehberi içeriği (rakip adı yok)

Kriter tablosu (sitede yayınlanacak taslak):

| Kriter | Sorulacak soru | Neden önemli |
|---|---|---|
| Kanal kapsamı | İhtiyacım olan pazaryeri ve site altyapıları resmi olarak destekleniyor mu? | Kapsam dışı kanal manuel işe döner |
| Stok senkron sıklığı ve gecikme | Değişiklik kanala ne kadar sürede gidiyor, ölçülebilir mi? | "Anlık" iddiası tanımsız olabilir |
| Aşırı satış koruması | Rezervasyon, tampon stok, kritik eşik var mı? | Stok hatası iptale yol açar |
| Hız sınırı yönetimi | Pazaryeri istek sınırında kuyruk ve öncelik var mı? | Gecikmiş stok güncellemesi |
| e-Fatura ve kargo | Entegre mi, hangi yolla (kendi/ortak)? | Sipariş sonrası akış |
| Destek | Hangi kanaldan, hangi sürede? | Süreç kesintileri |
| Güvenlik ve KVKK | Anahtarlar şifreli mi, rol/yetki, veri işleyen sözleşmesi? | Alıcı verisi satıcının sorumluluğu |
| Fiyatlandırma modeli | Sipariş, ürün veya kanal bazlı mı; gizli ücret? | Toplam maliyet |
| Denetlenebilirlik | Stok/fiyat değişiklik kaydı var mı? | Hata ayıklama |

"Tek stokla çok kanal" adımları: 1) Ürünleri barkod/SKU ile tekilleştir. 2) Kanal eşlemeleri (kategori/özellik). 3) Tek stok kaynağı belirle. 4) Sipariş anında rezervasyon. 5) Kanallara yayın ve gecikmeyi izle. 6) Kritik eşik/tampon. 7) İade/iptal stok dönüşü. 8) Haftalık mutabakat.

## 11. İçerik mimarisi ve teknik SEO

Hub: /rehber. Alt kategori: /rehber/pazaryerleri, /rehber/altyapi-erp, /rehber/e-fatura, /rehber/kargo, /rehber/mevzuat, /rehber/sozluk, /rehber/karsilastirma, /rehber/pazar-verisi.

İç bağlantı haritası: pazaryeri sayfaları > ilgili entegrasyon sayfası (ürün: Trendyol/HB/N11/Pazarama/Ideasoft/Bizimhesap) ve > "stok rezervasyonu" ürün özellik sayfası; aşırı satış/tek stok sayfaları > özellikler + stok rezervasyonu; e-fatura sayfaları > "e-fatura entegrasyonu" (yalnız yol haritası/ortak dili, Protokol 12); mevzuat sayfaları > güvenlik/KVKK sayfası; sözlük terimleri > ilgili rehber (her rehberde ilk geçişte sözlüğe bağlantı); pazar verisi > hub.

Yapılandırılmış veri: Article (tarihler: datePublished, dateModified, author: Organization), FAQPage (sayfa SSS'leri; içerik sayfada görünür olmalı), HowTo (R2-R8 satıcı olma adımları; yalnız görünür adım varsa), DefinedTermSet/DefinedTerm (R26, her terim anchor + `inDefinedTermSet`), BreadcrumbList (hub > kategori > sayfa), Organization/WebSite (site geneli). Rakip adı yok; kaynak listesi `citation` ile.

LLM görünürlüğü: her sayfada ilk paragrafta 2-3 cümlelik doğrudan cevap; tablolar; sabit terimler; `llms.txt` (rehber özet listesi); değişen olgular "tarihli" ifadeyle (ör. "2026-09-30 itibarıyla"); kaynak URL'leri görünür metinde.

Güncelleme politikası: her sayfada "Son güncelleme" ve "Kaynaklar"; sık değişenler (eşik, komisyon, vade, tarih) 90 gün; mevzuat sayfaları Resmi Gazete/GİB/KVKK duyurusuna göre olay tetikli ve en geç 180 gün; pazar verisi yıllık (rapor yayımlanınca); sözlük yılda bir; değişiklik günlüğü sayfa sonunda.

## 12. İlk 15 öncelikli sayfa (hacim = TAHMİNİ, kaynaksız)

Sıralama ölçütü: arama niyeti (tahmini) x ürün-uyumu x doğrulanmış içerik hazırlığı.

1. R14 E-ticarette e-fatura zorunluluğu (Y; içerik hazır, doğrulama şart)
2. R2 Trendyol'da satıcı olma (Y)
3. R3 Hepsiburada'da satıcı olma (Y)
4. R28 Tek stokla çok kanal yönetimi (O; ürün özü)
5. R29 Aşırı satış nedir, nasıl önlenir (D-O; ürün özü, rakip boşluğu)
6. R27 Pazaryeri entegrasyon yazılımı nasıl seçilir (Y)
7. R26 Sözlük (Y toplam; DefinedTermSet)
8. R22 Cayma hakkı 14 gün (Y)
9. R20 İade kargo ücreti kim öder (Y; 2026 yönetmelik yeniliği)
10. R15 Pazaryeri siparişlerinde fatura akışı (Y)
11. R10 Hakediş ve ödeme döngüsü (Y; içerik yalnız kaynaklı kısmıyla)
12. R30 Türkiye e-ticaret pazarı 2025 (Y; resmi veri hazır)
13. R9 Pazaryeri API erişimi nasıl alınır (O; ürün uyumu yüksek)
14. R11 E-ticaret altyapısı ile pazaryeri entegrasyonu (Y; Ideasoft konektörü)
15. R21 KVKK ve e-ticaret satıcısı (O)

Sonraki dalga: R1, R4-R8, R12, R13, R16-R19, R23-R25, R0 (hub önce iskelet olarak yayımlanabilir).

## 13. Doğrulanamayan kritik alanlar (içeriğe girmez / yayın öncesi kapatılır)

1. Tüm pazaryerleri için resmi komisyon oranları/ücretleri (özellikle Amazon plan ücreti, Trendyol/HB/N11/Pazarama/ÇS/PttAVM kategori oranları).
2. Pazaryeri payı verileri (Bakanlık raporunda yok; başka güvenilir kaynak bulunamadı).
3. e-Arşiv limit rakamı (3.000 TL mi, 2026'da kalktı mı: kaynaklar çelişkili) ve e-fatura eşik yılı ifadesi (2022/2023).
4. Hepsiburada, N11, Pazarama, Amazon, ÇiçekSepeti, PttAVM hakediş takvimleri; N11/Pazarama/ÇS/PttAVM resmi API kimlik bilgisi adımları.
5. Resmi satıcı-ol sayfalarının kendisi (yalnız ikincil özetler görüldü); GİB özel entegratör listesi; cayma hakkı istisna listesi ve iade süresi maddesi (Yönetmelik metni okunamadı); 6698 md. 3 resmi tanımları.
6. Pazaryerlerinin fatura yükleme kuralı ve anlaşmalı kargo listeleri.

Kritik risk notu: mevzuat.gov.tr ve GİB PDF'leri bu turda okunamadığı için tüm mevzuat rakamları yayın öncesi hukuk/muhasebe gözden geçirmesi ister.

## 14. Rakip adı içeren kaynaklar (site için işaret)

S9, S12, S31, S33, S34, S38, S42, S48, S49 ve S10/S11 (üçüncü taraf blog). Sitede kaynak olarak gösterilmemeli; resmi karşılığıyla değiştirilecek (GİB, Ticaret Bakanlığı, pazaryeri satıcı sözleşmeleri).

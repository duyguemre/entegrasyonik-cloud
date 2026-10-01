# Otomatik Fiyatlama — Hukuki Uygunluk Araştırması (PRC-LEGAL) — 2026-10-01

> **HUKUKİ GÖRÜŞ DEĞİLDİR.** Bu belge bir yazılım ekibinin kamuya açık kaynaklardan derlediği araştırma notudur. Avukat görüşünün yerini tutmaz. Kesin karar için §(e) sorular bir rekabet/tüketici hukuku avukatına sorulmalıdır.
> Kod yazılmadı. Bağlam: K56/K57 (`docs/adr/USER_DECISIONS.md`), BACKLOG PRC-R0..R3, PRC-LEGAL; ön araştırma `docs/research/COMPETITION_PRICING_2026-10.md` (dal `cloud/res-price`, §3, §4, §7).
>
> **Güvenilirlik notu (önemli):** Bu oturumda doğrudan sayfa okuma (WebFetch) çıkış vekilinde engellendi (rekabet.gov.tr, mondaq, hukukihaber, erdem-erdem denendi; hepsi `EGRESS_BLOCKED`). **Tüm web bulguları arama sonucu özetlerine dayanır.** Karar tam metinleri, yönetmelik madde metinleri ve pazaryeri sözleşmeleri satır satır okunamadı.
> Etiketler:
> - **[A-özet]** resmi kaynak (Rekabet Kurumu, Resmî Gazete, Ticaret Bakanlığı) — yalnız arama özetinden görüldü
> - **[B]** ikincil kaynak (hukuk bürosu yazısı, haber) — arama özetinden
> - **[T]** bizim çıkarımımız
> - **DOĞRULANAMADI** = kanıt bulunamadı; var ya da yok denmiyor
>
> Tüm erişim tarihleri 2026-10-01.

---

## (a) Sade açıklama — hukukçu olmayanlar için (1 sayfa)

**Kısa cevap:** Satıcının **kendi koyduğu kurala** göre, **kendi verisi** ve pazaryerinin **resmi API'sinden** gelen buybox bilgisiyle fiyatını otomatik değiştiren bir araç, Türkiye'de kendi başına yasak değildir. Trendyol ve Hepsiburada aynı aracı bugün satıcılara kendileri sunuyor. Ama aracın **nasıl tasarlandığı** belirleyici. Rekabet Kurulu, iki pazaryerinin aracında belirli özellikleri kaldırttı. Biz de en az o çizgide durmalıyız.

**Ne yapabiliriz:**
- Satıcı "buybox fiyatının **X TL / %Y altında** (ya da üstünde) kal" diye kural yazar; X ve Y sıfırdan büyüktür. Sistem bu kurala göre fiyatı otomatik günceller.
- Kural, satıcının belirlediği **taban** (maliyet + komisyon + kargo + KDV + marj) ve **tavan** arasında kalır.
- Satıcı aracı açmak zorunda değildir; varsayılan kapalıdır.
- Her fiyat değişikliği "hangi kural, hangi veri, ne zaman" diye kayda geçer.

**Ne yapamayız (ya da yapmamalıyız):**
- **"Buybox fiyatına eşitle"** veya 0 TL / %0 farkla aynı sonuca varan kural sunmak. Kurul bunu iki büyük pazaryerinde kaldırttı.
- **Belirli bir rakip satıcıyı** hedefleyen kural ("X mağazasının 1 TL altında kal").
- Bir müşterimizin (tenant) fiyatını, maliyetini ya da kuralını **başka bir müşterimizin** fiyat kararında kullanmak. Aynı yazılımı kullanan rakipler arasında bilgi taşırsak "**topla-dağıt (hub-and-spoke)**" türü rekabet ihlali riski doğar. Bu, en ağır risktir.
- Herkese aynı hazır "önerilen fark" değerini dayatmak.
- Fiyatı yükseltip ardından "indirim" göstermek. Bu, **sahte indirim** sayılır.
- Kazıma (scraping) ile rakip verisi toplamak (K57-S2 ile zaten reddedildi).

**Neden?**
- **Rekabet hukuku (4054 s. Kanun m.4):** Rakipler fiyatı birlikte belirleyemez. Bu, açık bir anlaşmayla da olur, aynı yazılımın ortak veriyle herkesin fiyatını hizalamasıyla da. "Eşitle" seçeneği fiyat rekabetini dondurabildiği için sorunlu görüldü. Kurul, Amazon'un aracında ise ihlal bulmadı. Gerekçe: araç zorunlu değildi ve satıcının kendi parametreleriyle çalışıyordu.
- **Tüketici hukuku:** İndirim gösterilirken "önceki fiyat" son **10 günün** en düşük fiyatı olmalıdır (eskiden 30 gündü). Sık otomatik fiyat değişimi bu hesabı kolayca bozar. Ayrıca fahiş fiyat artışına ağır ceza ve ürün erişim engeli uygulanıyor.
- **Sözleşme:** Pazaryeri API koşullarının metni **okunamadı**. Satıcı hesabı kapanırsa zararı müşterimiz görür. Bu yüzden insan tarafından okunmalı.

**Sonuç:** PRC-R3 (insan onaysız otomatik fiyatlama) **koşullu evet**: §(c)'deki tasarım kuralları uygulanırsa ve §(e)'deki avukat soruları (özellikle 1, 2, 5, 8) olumlu yanıtlanırsa. Gerekçe §(d)'de.

---

## 1. Bulgular — kaynaklara göre

### 1.1 Rekabet hukuku

| # | Bulgu | Kimi bağlar | Kaynak |
|---|---|---|---|
| R1 | **Trendyol (DSM Grup) taahhüt kararı, 03.10.2024.** Soruşturma 4054 m.4 kapsamında. Kurul m.43 ile taahhütleri bağlayıcı kıldı ve soruşturmayı cezasız kapattı. Taahhütler: (i) "Buybox Fiyatına Eşitle" kaldırılır, yalnız "Altında Kal / Üstünde Kal" kalır; (ii) bu seçenekler eşitle ile aynı sonucu vermeyecek şekilde düzenlenir (**%0 veya 0 TL girilemez**); (iii) kural tanımlanırken **belirli satıcı(lar) hedeflenemez**; (iv) aracın kullanımı **zorunlu değil** ve buybox algoritmasında kriter sayılmaz; (v) satıcılara eğitim içeriği; (vi) **3 yıl** Kurum'a uyum raporu (60 gün içinde uygulama). | **Yalnız Trendyol'u** bağlar. Satıcıyı ve entegratörü hukuken bağlamaz, ama Kurul'un neyi sorunlu gördüğünü gösterir [T] | [A-özet/B] https://rekabet.gov.tr/en/Guncel/investigation-concerning-dsm-grup-danism-cfebfc2175adef1193d70050568585c9 · https://webrazzi.com/2024/11/28/rekabet-kurulu-trendyol-un-verdigi-taahhut-sonucunda-sorusturmayi-sonlandirdi/ · https://www.donanimhaber.com/rekabet-kurumu-trendyol-daki-fiyatlandirma-sistemi-degisiyor--184745 |
| R2 | **Hepsiburada (D-Market) taahhüt kararı, 03.10.2024, sayı 24-40/951-410.** Soruşturma 19.10.2023'te açıldı. Taahhütler özünde aynı: eşitle kalkar, yalnız altında/üstünde kal; kullanım zorunlu değil. | Yalnız Hepsiburada | [A-özet] https://rekabet.gov.tr/Dosya/hb-internet-duyurusu-20241204141258702.pdf · [B] https://www.bloomberght.com/rekabet-kurulu-hepsiburada-sorusturmasini-sonlandirdi-3736183 |
| R3 | **Amazon Turkey kararı, 18.04.2025, sayı 25-15/348-164.** Soruşturma heyeti ihlal ve ceza önerdi. **Kurul oybirliğiyle ihlal yok** dedi. Gerekçe (özet): araç zorunlu değildi; satıcının belirlediği min/max eşikleri içinde, satıcı parametreleriyle çalışıyordu; satıcılar arasında kullanım konusunda anlaşma/uyumlu eylem bulunamadı. Kurul, topla-dağıt için şu zinciri tartıştı: (1) satıcı gelecekteki fiyat niyetini platforma iletir, (2) platform bunu diğer satıcılara aktarır, (3) alıcı bunun bilindiğini öngörebilir, (4) bilgiyi bilerek kullanır. Not: Amazon'daki "match" komutu dış fiyata göre **yukarı** eşitleme etkisi yaratabiliyordu (EFN/MFN benzeri). Amazon aracı 11.04.2025'te Türkiye'de kapattı. | Amazon. Emsal değeri: kullanıcının kendi parametreleriyle, zorunlu olmayan ve bilgi taşımayan araç ihlal sayılmadı | [A-özet/B] https://www.concurrences.com/en/bulletin/news-issues/april-2025/the-turkish-competition-authority-finds-no-infringement-by-a-major-e-commerce · https://www.gide.com/en/news-insights/the-turkish-competition-board-clears-amazon-turkey-in-investigation-into-automatic-pricing-mechanisms/ · https://www.hukukihaber.net/rekabet-kurulunun-amazon-karari-algoritmik-fiyatlandirma-araclari-ve-topla-dagit-koordinasyon-iddiasi · gerekçeli karar (açılamadı): https://www.rekabet.gov.tr/Karar?kararId=a15e07b0-e3e5-4c42-b43b-f2783dac6d5f — **bu linkin Amazon kararı olduğu DOĞRULANAMADI** |
| R4 | **Trendyol'a 61,3 milyon TL ceza (26.07.2023):** algoritmaya müdahale ve üçüncü taraf satıcı verisini kendi perakendesi için kullanma (m.6, kendini kayırma). Ders: satıcı verisinin amacı dışında kullanılması ciddiye alınıyor. | Trendyol | [B] https://medyascope.tv/2023/07/27/rekabet-kurumundan-trendyola-idari-para-cezasi/ |
| R5 | **Kurum çalışmaları:** E-Pazaryeri Platformları Sektör İncelemesi Nihai Raporu (14.04.2022). Uzmanlık tezi "Algoritmik Stratejiler Yoluyla Rekabete…" (No. 188). Dijital piyasalar için yeni bir çalışma başlatıldığı haberi. 4054'te dijital piyasalara özgü bir değişikliğin yürürlükte olup olmadığı **DOĞRULANAMADI**. | — | [B] https://www.alomaliye.com/2022/04/17/e-pazaryeri-platformlari-sektor-incelemesi-nihai-raporu/ · [A-özet] https://www.rekabet.gov.tr/Dosya/pelin-teber-karabudak-20220819091930329.pdf · [B] https://www.cnbce.com/haberler/rekabet-kurumundan-dijital-piyasalar-icin-yeni-calisma-h28390 |
| R6 | **m.6 (hakim durum):** Entegrasyonik ve tipik müşterisi (KOBİ satıcı) hakim durumda değildir [T]. m.6 riski pazaryerlerine aittir. Bizim için önemli olan **m.4** (anlaşma, uyumlu eylem, bilgi değişimi). | — | [T] |

**Yol gösterici yabancı emsaller (bağlayıcı değil):**
- **ABD — Topkins (2015):** Amazon Marketplace'te poster satıcıları fiyat anlaşmasını ortak fiyat algoritmasına kodladı. Ceza davası açıldı ve suç ikrarı geldi. Ders: algoritma, **anlaşmanın aracı** olursa suçtur; algoritma tek başına sorun değildir. [B] https://www.concurrences.com/en/bulletin/news-issues/april-2015/The-US-Department-of-Justice-72682
- **ABD — RealPage (DOJ uzlaşması, 24.11.2025, mahkeme onayı gerekiyor):** Kira yazılımı rakip ev sahiplerinin **kamuya açık olmayan** verisini kullanıyordu. Uzlaşmayla model eğitimi ≥12 ay eski veriyle sınırlandı, rakip verisi raporlaması eyalet düzeyinden daha ince olamaz, tasarım sınırları getirildi. Ders: **müşteriler arası gizli veri havuzu** temel risktir. [B] https://www.fenwick.com/insights/publications/dojs-realpage-settlement-a-blueprint-for-safer-algorithmic-pricing · https://www.bakermckenzie.com/en/insight/publications/alerts/2025/12/united-states-doj-settles-realpage-case
- **ABD — Gibson v. Cendyn (9. Daire, 15.08.2025):** Aynı yazılımın rakiplerce **bağımsız** kullanımı, ortak gizli veri ya da anlaşma yoksa tek başına fiyat sabitleme değildir. Daireler arası görüş ayrılığı sürüyor. [B] https://connectontech.bakermckenzie.com/united-states-ninth-circuit-clarifies-limits-of-antitrust-liability-for-algorithmic-pricing-tools/ · https://www.skadden.com/insights/publications/2026/2026-insights/litigation-controversy/algorithmic-pricing-decisions
- **AB — Yatay İşbirliği Kılavuzu (2023), algoritma bölümü:** Rakiplerin, rakip hassas bilgisini kullanan aynı üçüncü taraf fiyat aracına abone olması topla-dağıt bilgi değişimi olabilir. Bilgiyi paylaşan taraf, sağlayıcının bunu rakiplere aktaracağını makul olarak öngörebiliyorsa sorumlu olabilir. Paragraf numaraları **DOĞRULANAMADI**. [B] https://www.vbb.com/insights/the-new-eu-horizontal-guidelines-when-do-algorithmic-pricing-tools-present-particular-competition

### 1.2 Fiyat ve tüketici mevzuatı

| # | Bulgu | Kimi bağlar | Kaynak |
|---|---|---|---|
| T1 | **Fiyat Etiketi Yönetmeliği değişikliği (RG 11.10.2025, s. 33044):** indirimden önceki fiyat, **mal satışlarında indirimden önceki 10 gün içindeki en düşük fiyattır** (önceden 30 gün). Çabuk bozulan mallar ve hizmetlerde bir önceki fiyat esas alınır. İspat yükü satıcıdadır (2022 düzenlemesinden). Yürürlük özete göre yayım tarihi. 30.01.2026 (RG 33153) tarihli ek bir değişiklik de var, içeriği **DOĞRULANAMADI**. | **Satıcı** (etiket ve fiyat listesi sahibi) | [A-özet] https://www.resmigazete.gov.tr/eskiler/2025/10/20251011-6.htm · https://ticaret.gov.tr/haberler/fiyat-etiketinde-yeni-donem-basliyor · [B] https://www.alomaliye.com/2026/01/30/fiyat-etiketi-yonetmeliginde-degisiklik-30-01-2026/ |
| T2 | **Ticari Reklam ve Haksız Ticari Uygulamalar Yönetmeliği değişikliği (RG 01.07.2026, s. 33297; yürürlük 01.08.2026):** indirimli satış reklamında önceki fiyat = son **10 gün** içindeki en düşük fiyat (m.14/3; önceden 30 gün). Farklı kanallarda satışta **yalnız indirimin yapıldığı kanaldaki fiyat** dikkate alınır. Sadakat ve koşullu satış reklamları da m.14'e tabidir. | Reklam veren (**satıcı**); pazaryeri gösterim nedeniyle ayrıca | [B] https://www.karar.com/ekonomi-haberleri/indirimli-satis-reklamlarinda-yeni-donem-1-agustosta-zorunlu-olacak-2062418 · madde metni **DOĞRULANAMADI** |
| T3 | **Reklam Kurulu yaptırımları:** idari para cezası mecraya göre yaklaşık 99 bin TL ile 39,9 milyon TL arasında (haber özeti; yıl ve tutar teyit edilmeli). Durdurma ve düzeltme kararı verilebilir. Sahte indirimli etiket başına ayrı ceza (615 TL rakamı tarihi belirsiz). | Satıcı | [B] https://www.haberturk.com/aldatici-indirime-ceza-yagdi-2781160-ekonomi · https://ticaret.gov.tr/haberler/aldatici-indirimli-satislara-yonelik-basin-aciklamasi |
| T4 | **Fahiş fiyat (6585 m.13, 7194 ile değişik; Haksız Fiyat Değerlendirme Kurulu):** 2026'da aykırılık başına 1.806.177 TL'ye kadar ceza. Ocak 2026'dan itibaren e-ticarette fahiş artış yapılan ürünler "hukuka aykırı içerik" sayılıp **erişime kapatılıyor** (6563 ile birlikte). 2026'nın ilk 7 ayında fahiş fiyat cezaları yaklaşık 400 milyon TL. | **Satıcı**; pazaryeri erişim engelini uygular | [A-özet] https://ticaret.gov.tr/haberler/ticaret-bakanligi-tarafindan-e-ticarette-fahis-fiyat-artislarina-karsi-ilave-denetim-ve-yaptirim-tedbirleri-uygulamaya-alindi · [B] https://www.cnnturk.com/ekonomi/e-ticarette-fahis-fiyata-sert-yaptirim-urunlere-erisim-engeli-ve-1-8-milyon-tl-ceza-2385838 · https://www.alomaliye.com/2026/08/18/ticaret-bakanligi-2026-ilk-7-ayda-1-87-milyar-tl-ceza-uyguladi/ |
| T5 | **Çakışma riski [T]:** Otomatik araç fiyatı düşürüp yükseltir. Satıcı ya da pazaryeri kampanyası bu arada "indirim" gösterirse referans fiyat son 10 günün en düşüğü olmalıdır. Algoritma kısa süreli bir dip yaparsa referans o dibe iner. Bu durumda sonraki "indirim" iddiası yanlış olabilir. Trendyol'da liste fiyatı (üstü çizili) ve satış fiyatı ayrı alanlardır [Ö: önceki iç araştırma]; liste fiyatını otomatik yükseltmek doğrudan sahte indirim riski taşır. | Satıcı (birincil); biz sözleşmesel ve itibar olarak | [T] |

### 1.3 E-ticaret mevzuatı

| # | Bulgu | Kaynak |
|---|---|---|
| E1 | **7416 s. Kanun (RG 07.07.2022)** 6563'ü değiştirdi. Elektronik ticaret aracı hizmet sağlayıcı (pazaryeri) ve elektronik ticaret hizmet sağlayıcı (satıcı) tanımları, net işlem hacmi, ekonomik bütünlük tanımları geldi. Aracı hizmet sağlayıcıya veri kullanımı ve paylaşımı, kendi markalı ürün satışı ve haksız ticari uygulama yasakları getirildi. **Madde metni ve numarası (ör. "veri kullanımı" hükmü) DOĞRULANAMADI.** | [B] https://cottgroup.com/tr/mevzuat/item/elektronik-ticaret-kanununda-degisiklik-yapildi · https://www.alomaliye.com/2022/07/07/7416-sayili-kanun/ · [A-özet] https://www.lexpera.com.tr/resmi-gazete/metin/7416-elektronik-ticaretin-duzenlenmesi-hakkinda-kanunda-degisiklik-yapilmasina-dair-kanun-31889-7416 |
| E2 | **Elektronik Ticaret Aracı Hizmet Sağlayıcı ve Elektronik Ticaret Hizmet Sağlayıcılar Hakkında Yönetmelik (RG 29.12.2022, s. 32058):** pazaryeri ile satıcı ilişkisini, haksız ticari uygulama listesini ve veri kullanımını düzenler. Satıcı verisinin pazaryerince rekabet amacıyla kullanılmasına ilişkin madde **DOĞRULANAMADI**. | [B] https://cottgroup.com/tr/mevzuat/item/elektronik-ticaret-araci-hizmet-saglayici-ve-elektronik-ticaret-hizmet-saglayicilar-hakkinda-yonetmelik-yayimlandi · https://www.alomaliye.com/2022/12/29/elektronik-ticaret-araci-hizmet-saglayici-ve-elektronik-ticaret-hizmet-saglayicilari/ |
| E3 | **Bizim statümüz [T]:** Entegrasyonik pazaryeri **değildir**. Kendi platformunda alıcıyla satıcıyı buluşturmaz. Satıcının yazılım tedarikçisidir (SaaS / veri işleyen). 6563'teki aracı hizmet sağlayıcı yükümlülükleri bizi doğrudan bağlamaz, ama pazaryerinin satıcıya ve entegratöre sözleşmeyle yansıttığı yükümlülükler bağlar. **Avukat teyidi gerekli** (§(e) S6). | [T] |

### 1.4 Sözleşmesel (pazaryeri koşulları)

| Kanal | Otomatik fiyat değişikliği | Buybox verisinin kullanımı | 3. taraf yazılım sınırı | Kaynak |
|---|---|---|---|---|
| Trendyol | API'de fiyat/stok güncelleme ucu var ve entegratörler bunu yaygın kullanıyor. Pazaryerinin kendi otomatik fiyatlandırma aracı da var (panel: Otomatik Fiyatlandırma, altında/üstünde kal) | Resmi buybox ucu (`products/buybox-information`) var. Bu, satıcının kendi ürünleri için verilen veridir [ön araştırma §3] | Satıcı sözleşmesi ve API kullanım şartları metni **DOĞRULANAMADI** (developers.trendyol.com'da ayrı bir "terms" sayfası bulunamadı) | [A-özet] https://developers.trendyol.com/v3.0/docs/12-product-buybox-check · https://developers.trendyol.com/en/docs/overview |
| Hepsiburada | Listing fiyat güncelleme var. Kendi otomatik fiyatlandırma aracı taahhütle sınırlandı | Buybox ucu **bulunamadı** | **DOĞRULANAMADI** | ön araştırma §3 |
| N11 / Pazarama | Fiyat güncelleme ucu var | **bulunamadı** | **DOĞRULANAMADI** | ön araştırma §3 |

**Önemli [T]:** Pazaryeri kendi aracını ve bizim aracımızı aynı üründe birlikte çalıştırırsa iki motor birbirini tetikleyebilir (fiyat salınımı). Bu operasyonel bir risktir ve fiyat geçmişini, dolayısıyla indirim referansını da bozar.

### 1.5 KVKK

| Konu | Değerlendirme |
|---|---|
| Rakip satıcı verisi kişisel veri mi? | Şahıs şirketi satıcının adı veya unvanı **gerçek kişiye ilişkin** veri olabilir. Tüzel kişi (A.Ş., Ltd.) verisi KVKK kapsamında değildir [T; KVKK m.3 genel ilkesi]. |
| Bizim kullanacağımız veri | Trendyol buybox ucu (ön araştırmaya göre) **buybox fiyatı, sıra, çok-satıcı bayrağı** döndürür; **rakibin kimliğini döndürmez** (alan adları DOĞRULANAMADI). Kimlik gelmiyorsa rakip açısından kişisel veri işleme yoktur → risk düşük [T]. |
| Gelirse | Rakip mağaza ID'si veya adı yanıtta gelirse **saklanmamalı** (veri minimizasyonu, KVKK m.4). Hedefleme yasağı (taahhüt R1-iii) zaten kimliğe ihtiyaç bırakmaz. |
| Müşterimizin verisi | Tenant'ın kendi fiyat, maliyet ve kural verisi ticari sırdır; kişisel veri değildir (şahıs şirketi hariç). Rol: biz veri işleyeniz, tenant veri sorumlusu. Mevcut aydınlatma/DPA metinlerine "fiyat otomasyonu" amacı eklenmeli [T]. |
| Saklama | Denetim kaydı süreleri için `AUDIT_LOG_RETENTION_KVKK_2026-09-30.md` (AuditLogs 365 gün) yeterlidir. Fiyat geçmişi kişisel veri değildir [T]. |

---

## (b) Risk tablosu

Olasılık ve etki bizim tahminimizdir [T]. "Kimin riski": hukuken birincil muhatap / ikincil (sözleşme, itibar).

| # | Risk | Olasılık | Etki | Kimin riski | Azaltma (→ tasarım kuralı) |
|---|---|---|---|---|---|
| 1 | **Topla-dağıt (hub-and-spoke):** aynı SKU'yu satan birden fazla tenant'ın verisinin (fiyat, maliyet, kural) motorda birbirine taşınması → bilgi değişimi / uyumlu eylem (4054 m.4) | Düşük (kural uygulanırsa); Yüksek (havuzlarsak) | Çok yüksek (ciroya oranlı idari para cezası; Kurum soruşturması) | **Entegrasyonik** (hub) + satıcılar (spoke) | K2, K3, K4, K5 |
| 2 | "Eşitle" veya 0 farklı kuralın fiyat rekabetini dondurması; Kurul'un pazaryerlerinde kaldırttığı özelliğin bizde bulunması | Orta (talep gelir) | Yüksek | Satıcı (m.4 tarafı) + **Entegrasyonik** (aracı sağlayan, itibar ve soruşturmaya taraf olma) | K1 |
| 3 | Belirli rakibi hedefleyen kural | Düşük | Yüksek | Satıcı + Entegrasyonik | K6 |
| 4 | Otomatik fiyat salınımının **indirim gösterimiyle** çakışması (10 gün kuralı), sahte indirim | **Yüksek** | Orta (satıcıya ceza ve reklam durdurma) | **Satıcı** (birincil); Entegrasyonik (sözleşme ve itibar) | K9, K10, K11 |
| 5 | Otomatik **yukarı** yönlü artışın fahiş fiyat sayılması (özellikle buybox yükselirken "altında kal" kuralının fiyatı kovalaması) → ceza + ürün erişim engeli | Orta | Yüksek (ürün kapanır) | **Satıcı** | K7, K8 |
| 6 | Pazaryeri sözleşmesi veya API şartları ihlali (oran, veri kullanımı, otomasyon) → API anahtarının ya da satıcı hesabının kapatılması | **Bilinmiyor** (metin okunamadı) | Yüksek | Satıcı (hesap) + **Entegrasyonik** (entegratör erişimi) | K14, §(e) S5 |
| 7 | Hatalı fiyatla zarar (0,01 TL olayı; veri bayat) | Orta | Yüksek (finansal) | Satıcı (zarar) + **Entegrasyonik** (sözleşmesel sorumluluk talebi) | K7, K12, K13, §(f) |
| 8 | Varsayılan açık / satıcının bilmeden otomatiğe girmesi | Düşük | Orta | Entegrasyonik | K3 |
| 9 | Yapay zekâ ajanının fiyatı kendi kararıyla belirlemesi; "açıklanamayan algoritma" algısı | Orta | Orta | Entegrasyonik | K15 |
| 10 | KVKK: rakip şahıs satıcı kimliğinin gereksiz saklanması | Düşük | Düşük-Orta | Entegrasyonik (veri sorumlusu sıfatıyla, kendi topladığı için) | K16 |
| 11 | Pazaryerinin kendi otomatik aracıyla çift motor | Orta | Orta | Satıcı | K17 |
| 12 | Mevzuat değişikliği (dijital piyasalar düzenlemesi; 30→10 gün gibi hızlı değişimler) | Orta | Orta | İkisi | K18 |

---

## (c) Uygunluk için TASARIM KURALLARI

"Dayanak" sütunu kuralın nereden geldiğini gösterir. Taahhüt kararları yalnız pazaryerlerini bağlar; biz bunları **asgari çıta** olarak benimsiyoruz [T].

| No | Kural | Uygulama (PRC-R2/R3) | Dayanak |
|---|---|---|---|
| **K1** | **Eşitleme yok, fark > 0.** Yalnız "altında kal" / "üstünde kal". Fark ≥ 0,01 TL **ve** ≥ %0,1 (ikisinden büyüğü); 0 veya eşdeğeri sunucu tarafında reddedilir. Yuvarlama sonucu buybox fiyatına eşit çıkarsa bir adım daha uygulanır ya da değişiklik atlanır. | Kural doğrulayıcı + birim testi | R1, R2 (Trendyol/HB taahhüdü); R3 (Amazon "match" tartışması) |
| **K2** | **Tenant'lar arası veri yok.** Buybox anlık görüntüsü, fiyat geçmişi, maliyet ve kurallar yalnız ilgili tenant'ın ClientDB'sinde. Motor bir tenant'ın kararını verirken başka tenant'ın hiçbir verisini okumaz. Çapraz tenant toplu istatistik, "sektör ortalaması", "benzer satıcılar şunu yapıyor" yok. | Mimari: motor tenant bağlamında koşar; statik test/depcruise kuralı (çapraz ClientDB okuma yasağı) | R3 (topla-dağıt zinciri), R4; RealPage, AB Yatay Kılavuz |
| **K3** | **Varsayılan kapalı, isteğe bağlı.** Hiçbir plan veya kampanyada otomatik fiyatlama kendiliğinden açılmaz. Açmak, kullanımın sonucunu satıcının üstlendiğini belirten açık bir onayla olur (§f). Kullanmamak hiçbir özelliği kısıtlamaz. | Ürün akışı; açma olayı denetim kaydında | R1-iv, R2, R3 ("zorunlu değil") |
| **K4** | **Satıcının kendi kuralı.** Fark, taban, tavan, adım ve sıklık değerlerini satıcı girer. Biz "önerilen fark" değeri **dayatmayız**; şablon varsa değerleri boş gelir ya da yalnız satıcının kendi geçmişinden türetilir. | Form doğrulaması | R3 (satıcı parametreleriyle çalışma); topla-dağıt [T] |
| **K5** | **Gelecek fiyat niyeti dışarı çıkmaz.** Bir tenant'ın kuralı veya planladığı fiyat başka hiçbir tenant'a, rapora ya da dışa gösterilmez; site ve pazarlama metninde müşteri kuralları anonim örnek olarak bile kullanılmaz. | Ürün ve içerik kuralı | R3 (zincirin 1-2. halkası) |
| **K6** | **Rakip hedefleme yok.** Kural yalnız pazaryerinin genel buybox fiyatına bağlanır; belirli mağaza/satıcı seçilemez; rakip kimliği saklanmaz. | Şema: kuralda rakip alanı yok | R1-iii |
| **K7** | **Zorunlu taban ve tavan.** Taban = maliyet + komisyon + kargo + KDV + hedef marj (maliyet yoksa otomatik kapalı, K57-S4). Tavan satıcının girdiği değer ya da son 10 günün en düşük fiyatı × (1 + izinli artış). Bağımsız fiyat sigortası yürütmede yeniden doğrular. | PRC-R0, PRC-R2 sigorta | Finansal risk; T4 |
| **K8** | **Yukarı yönlü artış sınırı.** Otomatik koşu fiyatı bir günde en fazla %X (satıcı ayarı; platform üst sınırı, ör. %10) ve 30 günde en fazla %Y artırabilir. Üstüne çıkan artış insan onayına (PendingAction) düşer. | Kural motoru + sigorta | T4 (fahiş fiyat ve erişim engeli) |
| **K9** | **İndirim gösterimiyle çakışma koruması.** Otomatik kural yalnız **satış fiyatını** değiştirir, **liste/üstü çizili fiyatı asla yükseltmez**. Ürün aktif bir indirim/kampanya içindeyse ya da üstü çizili fiyat gösteriliyorsa otomatik kural o ürün için **duraklar** (ya da yalnız aşağı yönlü çalışır). | Kanal adaptörü alan izni; kampanya durumu kontrolü | T1, T2, T5 |
| **K10** | **10 gün en düşük fiyat kaydı.** Kanal bazında her SKU'nun gerçekleşen satış fiyatı geçmişi ≥ 30 gün tutulur (yasal pencere 10 gün; ihtiyat payı). Satıcının kendi indirim kampanyası ekranında "yasal önceki fiyat (son 10 gün en düşük)" otomatik hesaplanıp gösterilir. | `BuyboxSnapshots`/fiyat geçmişi (PRC-R1 ≥30 gün) | T1, T2 (ispat yükü satıcıda; kanal bazında hesap) |
| **K11** | **İndirim dili üretmeme.** Otomatik fiyat düşüşü için "indirim", "%X indirim" etiketi veya bildirim metni üretilmez; dil "fiyat güncellendi" olur. | Metin kataloğu, Otopilot istemi | T2, T3 |
| **K12** | **Sıklık sınırı ve soğuma.** SKU başına günlük azami değişiklik sayısı (ör. 12) ve değişiklikler arası en az süre (ör. 30 dk). Salınım (aynı SKU'da kısa sürede ileri-geri) tespit edilince kural askıya alınır ve satıcıya bildirilir ("fiyat savaşı"). | PRC-R2 `maxChangesPerDay`, `cooldownMin`; PRC-CFG | Fiyat savaşı / 0,01 TL olayı; T5; kota |
| **K13** | **Veri tazeliği.** Buybox verisi eşikten eskiyse (PRC-CFG, ör. 30 dk) otomatik değişiklik yapılmaz. | Motor ön koşulu | Finansal risk |
| **K14** | **Yalnız resmi API ve kendi ürünü.** Rakip sinyali yalnız pazaryerinin satıcıya kendi ürünleri için sunduğu resmi uçtan gelir; kazıma yok; uç desteklemiyorsa kanal "desteklenmiyor". Kota ve oran sınırına uyulur. | Adaptör manifestosu | K57-S2; §1.4; ön araştırma §3 |
| **K15** | **Deterministik karar, açıklanabilirlik.** Fiyatı kod (kural + sigorta) hesaplar; yapay zekâ yalnız açıklar ve öneri metni yazar (ADR-0018 Karar 3e). Her değişiklik "hangi kural, hangi buybox değeri, hangi taban/tavan" ile açıklanabilir. | Mevcut ilke | Kurum sorusuna yanıt verebilme; R3 |
| **K16** | **Minimizasyon.** Rakip satıcı kimliği (ad, mağaza ID) API'den gelse bile saklanmaz; yalnız fiyat, sıra, bayrak tutulur. Anlık görüntüler için TTL (ör. 90 gün). | Şema | KVKK m.4; R1-iii |
| **K17** | **Çift motor uyarısı.** Satıcıya pazaryerinin kendi otomatik fiyatlandırma aracını aynı üründe kapatması söylenir; dış fiyat değişikliği algılanınca kural duraklar. | Uyarı + dış değişiklik tespiti | §1.4 [T] |
| **K18** | **Denetim kaydı.** Her otomatik değişiklik için tenant, SKU, kanal, eski/yeni fiyat, buybox değeri ve zamanı, kural sürümü, tetikleyen (`source:'rule'`), sigorta sonucu kaydedilir (AuditLogs 365 gün). Kural açma/kapama ve onay metni sürümü de kaydedilir. | AuditLogs | İspat yükü (T1); Kurum talebine yanıt; sözleşme ihtilafı |
| **K19** | **Kill-switch ve gölge mod.** Platform genelinde, tenant ve kural düzeyinde anlık kapatma. R3 ilk 14 gün gölge modda (yalnız "şunu yapardım" kaydı). Mevzuat değişikliğinde (K18 riski) global kapatma. | ADR-0018 Karar 3 | Risk 12; finansal risk |
| **K20** | **Kendi ekonomik bütünlüğü içinde koordinasyon serbest, dışında yasak.** Aynı tenant'ın birden çok mağazası tek ekonomik birim sayılır, ortak kural kullanabilir. Farklı tenant'lar arasında ortak kural/şablon paylaşımı yok. | Kural kapsamı tenant ile sınırlı | 4054 ekonomik bütünlük ilkesi [T — avukat teyidi, §(e) S4] |

---

## (d) Sonuç — PRC-R3 (insan onaysız otomatik) yapılabilir mi?

**Cevap: KOŞULLU EVET.**

**Gerekçe:**
1. **Faaliyetin kendisi yasak değil.** İki büyük pazaryeri aynı tür aracı Kurul'un gözetiminde satıcılara sunmaya devam ediyor (R1, R2). Kurul, Amazon'un aracında ihlal bulmadı; belirleyici olan araç zorunlu değil ve satıcının kendi parametreleriyle çalışıyordu (R3).
2. **Sorunlu görülen özellikler belli ve kaçınılabilir:** eşitle / 0 fark, rakip hedefleme, kullanım zorunluluğu ve rakipler arası bilgi aktarımı. K1-K6 bunları dışarıda bırakıyor.
3. **Bize özgü en büyük risk topla-dağıttır.** Pazaryerinden farklı olarak biz **birbirine rakip birden çok satıcıya aynı motoru** sağlıyoruz. K2-K5 (tenant izolasyonu, öneri dayatmama, niyet bilgisi sızdırmama) uygulanırsa Kurul'un Amazon kararındaki dört halkalı zincirin 2. halkası ("platform bilgiyi diğer satıcılara aktarır") oluşmaz [T].
4. **Tüketici tarafı riskleri satıcıya ait ama ürün tasarımıyla önlenebilir:** K7-K11 (taban/tavan, artış sınırı, indirimle çakışma koruması, 10 gün kaydı).
5. **Koşulların bir kısmı açık:** pazaryeri sözleşme/API şartları okunamadı (Risk 6). Entegratörün taahhüt kararlarına fiilen uymasının beklenip beklenmediği, sorumluluk paylaşımı ve fahiş fiyat açısından otomatik artışın değerlendirilmesi avukata sorulmalı.

**Koşullar (hepsi gerekli):**
- (i) §(c) K1-K19 uygulanmış ve testlerle kilitlenmiş olmalı (özellikle K1, K2, K9 için otomatik testler).
- (ii) §(e) S1, S2, S5 ve S8 için avukat yanıtı "engel yok" ya da uygulanabilir koşullarla gelmeli.
- (iii) Trendyol satıcı ve API sözleşmesi bir insan tarafından okunmalı; otomasyon veya veri kullanımı yasağı olmadığı kayda geçmeli.
- (iv) Kullanıcı sözleşmesi ve ürün içi onay metni (§f) avukata gözden geçirtilmeli ve yayında olmalı.
- (v) R3, R2'nin (onaylı öneri) en az 4 hafta gerçek kullanımından ve 14 gün gölge moddan sonra açılmalı (ön araştırma §7.2, ADR-0018).

**Koşullar karşılanana kadar:** PRC-R1 (görünürlük) ve PRC-R2 (öneri + insan onayı) hukuk görüşü beklemeden yapılabilir, çünkü fiyatı satıcı kendisi onaylar. Ancak K1, K2, K4, K6, K9 ve K11 **R2'de de** uygulanmalıdır [T].

---

## (e) Avukata sorulacak net sorular

**Hukuk görüşü gerektirenler (karar bunlara bağlı):**

| # | Soru | Neden önemli |
|---|---|---|
| **S1** | Trendyol ve Hepsiburada taahhüt kararları (03.10.2024; HB 24-40/951-410) ile Amazon kararı (18.04.2025, 25-15/348-164) ışığında, **bağımsız bir entegratörün** birden fazla (birbirine rakip olabilecek) satıcıya sunduğu, §(c) K1-K6'ya uyan otomatik fiyat aracı 4054 m.4 açısından risk taşır mı? Gerekçeli kararlarda üçüncü taraf yazılım sağlayıcılarına ilişkin bir değerlendirme var mı? | R3'ün ana kararı |
| **S2** | Topla-dağıt açısından: aynı barkodu satan iki tenant'ımız aynı motoru **ayrı verilerle ve kendi parametreleriyle** kullanıyorsa, Kurum yerleşik uygulamasında (ve Amazon kararındaki dört halkalı testte) "bağımsız paralel kullanım" sayılır mı? Bu ayrımın ispatı için hangi kayıtları tutmalıyız (K18 yeterli mi)? | Bize özgü en büyük risk |
| **S3** | Kurul taahhütleri yalnız pazaryerlerini bağlıyor. Ancak eşitle ya da 0 fark özelliği sunmamız tek başına ihlal sayılır mıydı, yoksa yalnız bir risk göstergesi mi? (Biz zaten sunmamayı öneriyoruz; amaç, satıcı "eşitle" istediğinde ne diyeceğimiz.) | Ürün sınırı ve satış dili |
| **S4** | Aynı tenant'ın (aynı vergi no / aynı ekonomik bütünlük) birden çok mağazasında ortak kural kullanılması 4054 açısından serbest mi? Ekonomik bütünlüğü nasıl tespit etmeliyiz? (K20) | Kural kapsamı |
| **S5** | Trendyol, Hepsiburada, N11 ve Pazarama satıcı ve entegratör sözleşmelerinde otomatik fiyat değişikliği, buybox/fiyat verisinin işlenmesi veya üçüncü taraf otomasyonu hakkında kısıt var mı? Entegratör olarak bizi doğrudan bağlayan bir API kullanım sözleşmesi var mı? (Metinler bu araştırmada okunamadı.) | Risk 6; hesap kapatma |
| **S6** | 6563 ve 29.12.2022 Yönetmeliği bakımından Entegrasyonik "aracı hizmet sağlayıcı" sayılabilir mi? Değilse pazaryerinin yükümlülükleri bize sözleşmeyle nasıl yansıyor? | E3 |
| **S7** | Fiyat Etiketi Yönetmeliği (11.10.2025) ve Ticari Reklam ve Haksız Ticari Uygulamalar Yönetmeliği (01.08.2026) "son 10 gün en düşük fiyat" kuralı, pazaryerinin otomatik ürettiği indirim/üstü çizili gösterimlerde kime yükleniyor (satıcı mı, pazaryeri mi)? Otomatik sık fiyat değişimi kendi başına "aldatıcı" sayılabilir mi? 30.01.2026 değişikliğinin içeriği nedir? | K9-K11 yeterliliği |
| **S8** | 6585 m.13 (fahiş fiyat) bakımından, satıcının önceden onayladığı bir kuralın buybox yükselirken fiyatı otomatik **artırması** "fahiş fiyat artışı" değerlendirmesinde nasıl ele alınır? K8'deki günlük/30 günlük artış sınırları makul bir güvence mi; hangi eşik önerilir? | Risk 5; erişim engeli |
| **S9** | Yanlış otomatik fiyat (yazılım hatası ya da pazaryeri verisinin hatalı olması) nedeniyle satıcının zararında Entegrasyonik'in sorumluluğu sözleşmeyle nasıl sınırlanabilir? Tüketici olmayan (tacir) müşteriye karşı sorumluluk sınırlaması (TBK m.115) ne ölçüde geçerlidir? | §(f) metni |
| **S10** | Ürün sayfasında pazaryeri kendi hatalı fiyatından dolayı satışı iptal ederse ya da ceza keserse satıcıya rücu zinciri nasıl işler? | Sözleşme |

**Hukuk görüşü gerektirmeyen, insan veya ürün tarafından yapılacak doğrulamalar (ayrık):**
- Rekabet Kurumu karar arama sayfasından üç gerekçeli kararın tam metninin indirilmesi ve "üçüncü taraf yazılım" ve "entegratör" geçen paragrafların çıkarılması (bu oturumda erişim engelliydi).
- Trendyol buybox ucunun yanıt alanlarında rakip kimliği olup olmadığı (K16).
- Trendyol'da liste fiyatı ve satış fiyatı alanlarının hangisinin üstü çizili gösterime gittiği ve kampanyadaki üründe API ile fiyat değişikliğinin davranışı (K9).
- Trendyol ve Hepsiburada panelindeki otomatik fiyatlandırma aracının güncel seçenekleri (taahhüt uygulamasının doğrulanması).
- 7416 ile gelen veri kullanımı hükmünün madde numarası ve metni.

---

## (f) Kullanıcı sözleşmesi ve ürün içi uyarı metni için öneri maddeleri

> Taslaktır; **avukat onayı olmadan yayımlanmaz** (§(e) S9). Site ve uygulama dilinde rakip adı geçmez (K07); "eşitle", "rakibi otomatik geç" dili kullanılmaz.

**Kullanıcı sözleşmesine (Hizmet Koşulları / ek protokol) eklenecek maddeler:**
1. **Satıcının kararı:** Otomatik fiyat kuralları yalnız Kullanıcı'nın kendi belirlediği parametrelerle çalışır. Fiyatlandırma kararı ve bunun hukuki sonuçları Kullanıcı'ya aittir. Entegrasyonik fiyat belirlemez, önermez ya da yönlendirmez; yalnız Kullanıcı'nın talimatını uygulayan bir yazılım aracı sağlar.
2. **İsteğe bağlılık:** Özellik varsayılan olarak kapalıdır. Kullanılmaması hiçbir hizmeti kısıtlamaz.
3. **Veri ayrımı:** Kullanıcı'nın fiyat, maliyet, kural ve pazaryeri verileri başka bir kullanıcının fiyatlandırmasında kullanılmaz, paylaşılmaz ve birleştirilmez. Entegrasyonik, kullanıcılar arası toplu fiyat istatistiği üretmez.
4. **Rekabet hukukuna uyum:** Kullanıcı, aracı başka teşebbüslerle fiyat koordinasyonu amacıyla kullanmamayı, diğer satıcılarla fiyat kuralı paylaşmamayı ve 4054 sayılı Kanun'a uymayı kabul eder. Böyle bir kullanım tespit edilirse Entegrasyonik özelliği askıya alabilir.
5. **Tüketici mevzuatı:** İndirim ve önceki fiyat gösterimi, fiyat etiketi ve fahiş fiyat mevzuatına uyum Kullanıcı'nın sorumluluğundadır. Entegrasyonik, yardımcı olarak fiyat geçmişini ve "son 10 gün en düşük fiyat" bilgisini gösterir; bu bilgi hukuki uygunluk garantisi değildir.
6. **Pazaryeri koşulları:** Kullanıcı, otomatik fiyat değişikliğinin ilgili pazaryerinin satıcı sözleşmesine uygun olduğunu teyit eder. Pazaryerinin kendi otomatik fiyatlandırma aracıyla aynı üründe birlikte kullanım önerilmez.
7. **Sorumluluk sınırı:** Pazaryeri verisinin hatalı ya da gecikmeli olması, Kullanıcı'nın hatalı maliyet veya kural girmesi ya da pazaryerinin işlem reddi nedeniyle doğan zararlardan Entegrasyonik sorumlu tutulamaz. Entegrasyonik'in kendi yazılım hatasından doğan sorumluluğu [avukat belirleyecek] ile sınırlıdır. (TBK m.115 kapsamı: ağır kusur ve kast hariç tutulamaz.)
8. **Kayıt ve askıya alma:** Her otomatik değişiklik kayda geçer; kayıtlar Kullanıcı'ya ve yasal talep halinde yetkili makamlara sunulabilir. Entegrasyonik, mevzuat değişikliği, güvenlik ya da olağandışı fiyat hareketi durumunda özelliği önceden bildirmeksizin geçici olarak durdurabilir.

**Ürün içi uyarı metinleri:**
- **Özelliği açarken (onay kutusu, sürümü kaydedilir):** "Otomatik fiyat kuralları yalnız sizin girdiğiniz değerlerle çalışır ve fiyatlarınızı onayınız olmadan değiştirir. Taban ve tavan fiyatı siz belirlersiniz. Fiyat kararlarınızın sorumluluğu size aittir. Verileriniz başka hiçbir satıcının fiyatlandırmasında kullanılmaz."
- **Fark alanının yanında:** "Fark sıfırdan büyük olmalıdır. Buybox fiyatına eşitleme yapılmaz."
- **Kampanya veya indirimdeki üründe:** "Bu ürün indirimde görünüyor. İndirim gösterilen ürünlerde önceki fiyat son 10 günün en düşük fiyatı olmalıdır. Otomatik kural bu ürün için duraklatıldı."
- **Artış sınırı aşıldığında:** "Önerilen artış günlük artış sınırınızı aşıyor. Hızlı fiyat artışları fahiş fiyat denetimine konu olabilir. Onayınızı bekliyor."
- **Pazaryeri aracıyla çift kullanımda:** "Bu ürünün fiyatı Entegrasyonik dışında değişti. Pazaryerinin kendi otomatik fiyatlandırması açıksa iki araç birbirini tetikleyebilir. Kural duraklatıldı."
- **Altbilgi (ayarlar sayfası):** "Bu araç hukuki danışmanlık değildir. Fiyat ve indirim mevzuatına uyum için danışmanınıza başvurun."

---

## Kaynaklar (erişim 2026-10-01; tümü arama özeti, sayfa açılamadı)

**Rekabet:**
- https://rekabet.gov.tr/en/Guncel/investigation-concerning-dsm-grup-danism-cfebfc2175adef1193d70050568585c9
- https://rekabet.gov.tr/Dosya/hb-internet-duyurusu-20241204141258702.pdf
- https://www.rekabet.gov.tr/Karar?kararId=a15e07b0-e3e5-4c42-b43b-f2783dac6d5f (hangi karar olduğu doğrulanamadı)
- https://webrazzi.com/2024/11/28/rekabet-kurulu-trendyol-un-verdigi-taahhut-sonucunda-sorusturmayi-sonlandirdi/
- https://www.bloomberght.com/rekabet-kurulu-hepsiburada-sorusturmasini-sonlandirdi-3736183
- https://www.donanimhaber.com/rekabet-kurumu-trendyol-daki-fiyatlandirma-sistemi-degisiyor--184745
- https://www.concurrences.com/en/bulletin/news-issues/april-2025/the-turkish-competition-authority-finds-no-infringement-by-a-major-e-commerce
- https://www.gide.com/en/news-insights/the-turkish-competition-board-clears-amazon-turkey-in-investigation-into-automatic-pricing-mechanisms/
- https://www.hukukihaber.net/rekabet-kurulunun-amazon-karari-algoritmik-fiyatlandirma-araclari-ve-topla-dagit-koordinasyon-iddiasi
- https://www.erdem-erdem.av.tr/bilgi-bankasi/rekabet-hukukunda-otomatik-fiyatlandirma-mekanizmalari-kurulun-buybox-kararlari
- https://medyascope.tv/2023/07/27/rekabet-kurumundan-trendyola-idari-para-cezasi/
- https://www.alomaliye.com/2022/04/17/e-pazaryeri-platformlari-sektor-incelemesi-nihai-raporu/
- https://www.rekabet.gov.tr/Dosya/pelin-teber-karabudak-20220819091930329.pdf
- https://www.concurrences.com/en/bulletin/news-issues/april-2015/The-US-Department-of-Justice-72682 (Topkins)
- https://www.fenwick.com/insights/publications/dojs-realpage-settlement-a-blueprint-for-safer-algorithmic-pricing
- https://connectontech.bakermckenzie.com/united-states-ninth-circuit-clarifies-limits-of-antitrust-liability-for-algorithmic-pricing-tools/
- https://www.vbb.com/insights/the-new-eu-horizontal-guidelines-when-do-algorithmic-pricing-tools-present-particular-competition

**Fiyat / tüketici:**
- https://www.resmigazete.gov.tr/eskiler/2025/10/20251011-6.htm
- https://ticaret.gov.tr/haberler/fiyat-etiketinde-yeni-donem-basliyor
- https://www.alomaliye.com/2026/01/30/fiyat-etiketi-yonetmeliginde-degisiklik-30-01-2026/
- https://www.karar.com/ekonomi-haberleri/indirimli-satis-reklamlarinda-yeni-donem-1-agustosta-zorunlu-olacak-2062418
- https://ticaret.gov.tr/haberler/aldatici-indirimli-satislara-yonelik-basin-aciklamasi
- https://www.haberturk.com/aldatici-indirime-ceza-yagdi-2781160-ekonomi
- https://ticaret.gov.tr/haberler/ticaret-bakanligi-tarafindan-e-ticarette-fahis-fiyat-artislarina-karsi-ilave-denetim-ve-yaptirim-tedbirleri-uygulamaya-alindi
- https://www.cnnturk.com/ekonomi/e-ticarette-fahis-fiyata-sert-yaptirim-urunlere-erisim-engeli-ve-1-8-milyon-tl-ceza-2385838
- https://www.alomaliye.com/2026/08/18/ticaret-bakanligi-2026-ilk-7-ayda-1-87-milyar-tl-ceza-uyguladi/

**E-ticaret / pazaryeri:**
- https://www.lexpera.com.tr/resmi-gazete/metin/7416-elektronik-ticaretin-duzenlenmesi-hakkinda-kanunda-degisiklik-yapilmasina-dair-kanun-31889-7416
- https://cottgroup.com/tr/mevzuat/item/elektronik-ticaret-kanununda-degisiklik-yapildi
- https://cottgroup.com/tr/mevzuat/item/elektronik-ticaret-araci-hizmet-saglayici-ve-elektronik-ticaret-hizmet-saglayicilar-hakkinda-yonetmelik-yayimlandi
- https://developers.trendyol.com/v3.0/docs/12-product-buybox-check
- https://developers.trendyol.com/en/docs/overview

**İç:** `docs/research/COMPETITION_PRICING_2026-10.md` (dal `cloud/res-price`), `AUDIT_LOG_RETENTION_KVKK_2026-09-30.md`, `AGENTIC_PRICING_2026-10-01.md`, BACKLOG PRC-*, USER_DECISIONS K56/K57.

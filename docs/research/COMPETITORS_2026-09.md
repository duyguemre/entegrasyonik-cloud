# Rakip Analizi 2026-09: Entegra (entegrabilisim.com), Sopyo, Yengeç

> Kapsam: entegrabilisim.com (aranan `entegra.com.tr` alakasız bir BT/hosting şirketine ait çıktı — bkz. §0), sopyo.com, yengec.co.
> Yöntem: WebFetch/WebSearch ile ana sayfa, özellik/fiyat/SSS/entegrasyon listesi ve (erişilebildiği ölçüde) blog/destek sayfaları incelendi.
> Hiçbir kaynak metni birebir alınmadı; tüm ifadeler özetlenmiştir. Ağ erişim kısıtları nedeniyle üç rakibin de bazı sayfalarına yalnızca WebSearch snippet'leri üzerinden dolaylı erişilebildi — bu satırlar açıkça "doğrulanamadı" / "sitede iddia ediliyor" olarak işaretlenmiştir, kesin olgu gibi sunulmamıştır.
> Entegrasyonik'in gerçekte ne yaptığına dair referans: CLAUDE.md, `site/src/data/capabilities.ts`, `site/src/data/integrations.ts`, `backend/src/integration/modules/*` klasör adları (2026-09-29 itibarıyla: pazaryeri = Trendyol/Hepsiburada/N11/Pazarama, e-ticaret = Ideasoft, ERP = Bizimhesap; kargo/e-fatura/diğer pazaryerleri yalnızca UI formu, backend yok).
> Önceki analiz: `docs/research/COMPETITOR_SOPYO.md` (ana sayfa/fiyat/hakkımızda) — burada tekrar edilmedi, yalnızca blog/destek/tam entegrasyon listesi ile genişletildi.

## 0. Kaynak notu — domain karışıklığı

Görevde verilen `http://www.entegra.com.tr/` adresi, e-ticaret entegrasyonuyla ilgisi olmayan genel bir BT/veri merkezi/hosting şirketine ("Entegra Bilişim Sanayi ve Ticaret A.Ş.") ait. Bu rapordaki "Entegra" profili, aynı sektörde bilinen asıl rakip olan **entegrabilisim.com** ("Entegra E-Ticaret") kaynaklıdır. Bu siteye de doğrudan erişim ağ kısıtı nedeniyle mümkün olmadı; bulgular WebSearch snippet'leri ve üçüncü taraf incelemelerine (kobitime.com, eticaretradari.com) dayanıyor — sayfa metni birebir görülmedi.

---

## 1. Rakip Profilleri

### 1.1 Entegra (entegrabilisim.com)

- **Konumlanma**: "Tek panelden tüm ticareti yönetme" mesajı — yalnızca pazaryeri değil, muhasebe + kargo + e-fatura + e-ihracatı da kapsayan geniş bir operasyon platformu iddiası. *(Slogan metni WebSearch snippet'inden; doğrulanmadı.)*
- **Hedef segment**: KOBİ + kurumsal + pazaryeri satıcıları; sektöre göre gruplanmış referans sayfası iddiası (Ev&Dekorasyon, Gıda&Market, Giyim, Kozmetik, Spor&Outdoor, Teknoloji).
- **Entegrasyon kapsamı** (sitenin kendi iddiasına göre "104 entegrasyon" — doğrulanmadı):
  - Pazaryeri: geniş liste — Trendyol, Hepsiburada, N11, Amazon, Pazarama, PttAVM, Çiçeksepeti, Boyner, Koçtaş, Temu, Teknosa, A101, Karaca, Modanisa, idefix gibi büyük ve niş oyuncuları kapsıyor (iddia).
  - Muhasebe/ERP: çok geniş — Logo (Go/Tiger), Mikro, Akınsoft, Dia, Netsis, Nebim, SAP, Paraşüt, Bizim Hesap, Microsoft Dynamics AX dahil kurumsal ERP'lere kadar uzanıyor (iddia).
  - Kargo: Yurtiçi, DHL, Aras, Sürat, PTT, UPS, HepsiJET gibi büyük kargo firmalarını "gerçek modül" olarak sunduğu iddiası var.
  - E-fatura: ayrı bir "tek tuşla e-fatura/e-arşiv" modülü iddiası (sağlayıcı isimleri görülmedi).
  - Diğer: XML entegrasyonu, WMS (depo yönetimi), e-ihracat modülü.
- **Öne çıkan özellikler**: Rekabet analizi/otomatik fiyat takibi (rakip fiyatına göre kural bazlı kendi fiyatını güncelleme), "akıllı fiyatlandırma" (maliyet değişince kâr marjına göre otomatik fiyat), hakediş/kesinti doğrulama (komisyon/kargo/ceza kesintilerinde "eksik ödeme" tespiti), eğitim video kütüphanesi + canlı demo ortamı.
- **Fiyatlandırma modeli**: 3 paket (Kobi / Dijital / Profesyonel), yıllık, liste + indirimli fiyat gösterimi, paket bazlı özellik karşılaştırma tablosu; 14 gün ücretsiz, taahhütsüz deneme. *(Rakamlar snippet kaynaklı, güncelliği/doğruluğu teyit edilemedi.)*
- **Güven unsurları** (hepsi doğrulanmamış iddia): "8000+ aktif kullanıcı", "70+ çalışan", 2014 kuruluş + büyüme hikayesi anlatısı, sektöre göre gruplanmış referans sayfası.
- **Site yapısı**: Ana sayfa → Entegrasyonlar (üst kategori, her kanal türü için ayrı alt sayfa) → Genel Özellikler → Rekabet Analizi (ayrı içerik sayfası) → Paketler → Referanslarımız → Eğitimler → Destek → Blog → İletişim; ayrı bir eğitim/dokümantasyon alt-markası da var.
- **Etkileyici kalıplar**: paket karşılaştırma tablosu (satır satır check/x), ayrı demo subdomain'i ile "satın almadan canlı dene", her entegrasyon türü için ayrı SEO sayfası, özellik-odaklı içerik sayfaları (rekabet analizi, akıllı fiyatlandırma), video kütüphanesi, saat aralığı belirtilen çok kanallı canlı destek.

### 1.2 Sopyo (sopyo.com)

Ana sayfa/fiyatlandırma/hakkımızda için ayrıntılı analiz zaten `docs/research/COMPETITOR_SOPYO.md` içinde mevcuttur (10 uyarlanabilir fikir + kaçınılacaklar dahil) — burada tekrar edilmiyor. Bu turda yalnızca blog, destek merkezi ve tam entegrasyon listesi incelendi (erişim ağ kısıtı nedeniyle WebSearch snippet'lerine dayanıyor, doğrudan sayfa görülemedi):

- **Blog/kaynak merkezi**: ayrı bir `blog.sopyo.com` subdomain'i var; içerik SEO/how-to ağırlıklı (pazaryeri satış rehberleri, kavram açıklamaları — ör. "Buybox nedir", XML kaynağı rehberi, trend ürün içerikleri, yıl sonu şirket/ürün özeti). Vaka analizi/müşteri başarı hikayesi formatı görülmedi (doğrulanamadı).
- **Destek merkezi**: `/destek-merkezi` altında yapılandırılmış self-servis dokümantasyon — kategoriler: Genel Ayarlar, API Ayarları, "Sopyo AI Hub", Onboard İşlemleri, Ürün İşlemleri, Fatura İşlemleri, Filtreler, Toplu İşlemler, Raporlar, Uygulamalar, E-fatura, E-ticaret Entegrasyonları. Platforma özel karşılama sayfaları var (ör. "IdeaSoft ile Hoşgeldiniz"). Telefon + e-posta + ticket desteği; "24 saat içinde dönüş" iddiası (doğrulanamadı).
- **Tam entegrasyon listesi** (WebSearch snippet'lerinden derlenen örnekler, eksiksiz liste garantisi yok): Pazaryeri ~10+ (Trendyol, Hepsiburada, N11, Amazon, Akakçe, GittiGidiyor, Çiçeksepeti, Pazarama, İdefix, PttAvm, Cimri), e-ticaret altyapısı ~5 (Shopify, WooCommerce, IdeaSoft, İkas, Ticimax), kargo ~4 (Aras, MNG, Sürat, Yurtiçi — barkod basımı odaklı), muhasebe/ERP ~9 (Logo, Mikro, Netsis, Paraşüt, Bizim Hesap, Uyumsoft, Akınsoft, Eta, Sysmond), e-fatura ~3 (muhasebe listesiyle örtüşüyor: Logo, Mikro, Paraşüt).
- **Ek dikkat çeken kalıplar**: her entegrasyon+kargo firması kombinasyonu için ayrı SEO landing page (programmatic SEO); muhasebe entegratörlerinin hem genel entegrasyon hem ayrı e-fatura kategorisinde çift listelenmesi (iki farklı arama niyetine hitap); destek kategorilerinin ürün derinliğini dolaylı pazarlaması ("Toplu İşlemler", "Sopyo AI Hub").

### 1.3 Yengeç (yengec.co)

- **Konumlanma**: Başlık etiketinde "e-Ticaret Entegrasyon Paketleri: 14 Gün Ücretsiz" — düşük riskli deneme + paket çeşitliliği vurgusu. Üçüncü kaynakta atfedilen slogan "zaman/operasyon yükünü azaltma" temalı (doğrulanamadı).
- **Hedef segment**: Paket yapısı ve düşük fiyat aralığı (~70-170 TL/ay bandı, kaynaklar arasında tutarsız) küçük/tek mağazalı KOBİ satıcılarına işaret ediyor; kurumsal ERP değil KOBİ ön muhasebe araçlarına odaklanmış görünüyor.
- **Entegrasyon kapsamı** (URL kalıplarından ve snippet'lerden, tam liste garantisi yok):
  - Pazaryeri: Trendyol, Hepsiburada, N11, Pazarama, Çiçeksepeti, PttAVM, Beymen, Farmazon/FarmaBorsa (niş), Hopishop, Novadan, Turkcell Pasaj, idefix; global: Amazon.
  - E-ticaret altyapıları: Shopify, WooCommerce, ikas, Ticimax, IdeaSoft, T-Soft, Bigcommerce.
  - Ön muhasebe (kurumsal ERP değil): Mikro, Paraşüt, KolayBi', Logo İşbaşı.
  - Kargo: Aras, UPS, Yurtiçi, DHL eCommerce.
  - E-fatura: Uyumsoft, QNB eSolutions, EDM Bilişim, İşNet, eLogo, Nilvera — ayrı "e-Fatura Kontör Paketleri" sayfası (add-on olarak ayrı satılıyor).
- **Öne çıkan özellikler**: sipariş geldiğinde otomatik e-fatura/e-arşiv kesimi, otomatik kargo barkodu/irsaliye + fatura ve kargo etiketinin tek PDF'te birleştirilmesi, XML kaynağından otomatik ürün/stok senkronizasyonu, kural bazlı toplu fiyatlandırma, **günlük fiyat/stok tutarsızlık raporunun e-posta ile otomatik gönderimi** (panele girmeden değer üretme).
- **Fiyatlandırma modeli**: mağaza sayısı + paket bazlı kademeler, düşük giriş fiyatı + modüler add-on (XML kaynağı, otomatik fiyat güncelleme, e-fatura kontörü ayrı ücretli) — kaynaklar arasında rakamlar tutarsız (muhtemelen farklı yıllara ait), teyit edilemedi. Ücretsiz deneme 14-15 gün arasında değişen iddialarla geçiyor.
- **Güven unsurları**: doğrudan testimonial/müşteri sayısı bulunamadı (erişim engeli); ayrı "İş Ortaklığı" (partner/reseller) sayfası var — büyüme kanalı sinyali.
- **Site yapısı**: Ana sayfa → /entegrasyon/ (hub) → kategori sayfaları (pazaryeri/kargo/e-fatura entegrasyonu) → her platform için tekil şablonlu landing page (`/[platform]-entegrasyonu/`, hepsi aynı başlık kalıbı) → fiyatlandırma → iş ortaklığı → geniş blog ağı.
- **Etkileyici kalıplar**: agresif programmatic SEO (her entegrasyon+kargo+e-fatura sağlayıcısı kombinasyonu için şablonlu sayfa), blog'da rakip karşılaştırma tablosu içeren yazılar ("e-Ticaret Entegratör Şirketlerin Özellik ve Fiyatları"), "8 Adımda X" / "15 Soru-Cevap" formatlı eğitici içerik, mikro-operasyonel fayda anlatımı (soyut vaat yerine "fatura+etiket tek PDF" gibi somut detay), modüler add-on fiyatlandırma modeli.

---

## 2. Karşılaştırma Tablosu

| Özellik kategorisi | Entegra | Sopyo | Yengeç | Entegrasyonik (bugün) |
|---|---|---|---|---|
| Pazaryeri sayısı (iddia/gerçek) | ~15+ isim (iddia, geniş) | ~10+ isim (iddia) | ~12 isim (iddia, niş dahil) | **4 gerçek** (Trendyol, Hepsiburada, N11, Pazarama — kod + mock doğrulama) |
| E-ticaret altyapısı | belirsiz/az vurgulu | Shopify/WooCommerce/IdeaSoft/İkas/Ticimax (iddia) | Shopify/WooCommerce/ikas/Ticimax/IdeaSoft/T-Soft/Bigcommerce (iddia) | **1 gerçek** (Ideasoft — gerçek mağaza bağlantısı sınırlı, `coverage: limited`) |
| Muhasebe/ERP | çok geniş, kurumsal ERP dahil (SAP, Dynamics AX) (iddia) | 9 isim, çoğunlukla masaüstü muhasebe (iddia) | KOBİ ön muhasebe odaklı, 4 isim (iddia) | **1 gerçek, yalnızca okuma** (Bizimhesap — yazma yok) |
| Kargo entegrasyonu | "gerçek modül" iddiası, 7+ firma | 4 firma, barkod odaklı (iddia) | 4 firma (iddia) | **Yok** — yalnızca elle girilen takip bilgisinin pazaryerine iletimi; kargo firması API'si UI formu, backend yok |
| E-fatura | ayrı modül iddiası | muhasebe listesiyle örtüşen 3 isim | ayrı kontör paketiyle 6 sağlayıcı (iddia) | **Yok** — roadmap, gizli (`ROADMAP_VISIBLE=false`) |
| Stok/aşırı satış koruması | görülmedi (rekabet analizi/akıllı fiyatlandırma var ama "rezervasyon" dili yok) | görülmedi | görülmedi (tutarsızlık *raporu* var, önleme değil) | **Var, gerçek** — eşzamanlı rezervasyon, concurrency testiyle kanıtlı (`StockAllocator.concurrency.test.ts`) |
| Tenant/veri izolasyonu | görülmedi | görülmedi | görülmedi | **Var, gerçek** — müşteri başına ayrı veritabanı (ADR-0003) |
| Sır/anahtar şifreleme | görülmedi | görülmedi | görülmedi | **Var, gerçek** — AES-256-GCM (FieldCrypto) |
| Fiyat rekabet takibi / otomatik fiyat güncelleme | **Var** (rekabet analizi + akıllı fiyatlandırma) | görülmedi (net değil) | kural bazlı toplu fiyatlandırma var, rakip fiyat takibi görülmedi | **Yok** |
| Hakediş/kesinti doğrulama ("eksik ödeme" tespiti) | **Var** (iddia) | kısmi finans görünümü | görülmedi | **Kısmi** — hakediş görünümü var (bazı kanallarda `limited`), otomatik kesinti/eksik ödeme tespiti yok |
| Fatura+kargo etiketi tek PDF | görülmedi | görülmedi | **Var** (iddia) | Yok |
| Günlük e-posta ile tutarsızlık raporu | görülmedi | görülmedi | **Var** (iddia) | Yok |
| Ücretsiz deneme | 14 gün, taahhütsüz (iddia) | "kredi kartı gerekmez" (COMPETITOR_SOPYO.md) | 14-15 gün (iddia, tutarsız) | Bilinmiyor/tanımsız (site politikası netleştirilmeli) |
| Self-servis destek merkezi | eğitim video kütüphanesi | kategorize destek merkezi (12 kategori) | blog ağırlıklı | Yok (henüz) |
| Programmatic SEO (entegrasyon başına sayfa) | kısmi | **Var, yoğun** | **Var, çok yoğun** | Yok |
| Sektöre özel referans/vaka sayfası | iddia var (kategori grupları) | testimonial kartları (isim+şirket) | görülmedi | Yok (gerçek referans yok) |

**Not**: Entegrasyonik'in sayfaları (`capabilities.ts`/`integrations.ts`) zaten testlerle (`tests/claims.test.ts`) doğrulanamayan/uydurma iddiayı engelliyor — bu tablo o disiplini bozmadan, rakiplerin *iddialarını* olduğu gibi (doğrulanmamış olarak işaretleyerek) yan yana koyuyor.

---

## 3. SİTE İÇİN ÖRNEK ALINACAKLAR (10–15 fikir)

Format/anlatım/etkileşim kalıpları — kopyalama değil, uyarlama önerisi.

1. **Paket karşılaştırma tablosu (satır×paket, check/x formatı)** — Entegra'da net. *Uyarlama*: Entegrasyonik `/fiyatlandirma` sayfasına, mevcut paket yapısı netleşince eklenebilir; yalnızca gerçek paket farkları gösterilmeli (uydurma kademe yok).
2. **Ayrı, canlı demo ortamı (subdomain)** — Entegra'nın "satın almadan dene" yaklaşımı. *Uyarlama*: Gerçek bir mock/demo hesabı hazır olduğunda `/demo` veya ayrı subdomain ile sunulabilir; şu an mock-only olduğu için "gerçek pazaryeri verisiyle" denilmemeli, "demo/test ortamı" olarak adlandırılmalı.
3. **Entegrasyon türü başına ayrı, SEO'lu detay sayfası** (Entegra + Sopyo + Yengeç ortak deseni) — Entegrasyonik'in zaten `getPublicIntegration(code)` altyapısı bu deseni destekliyor (`integrations.ts`); her kanal için `/entegrasyonlar/[code]` benzeri tekil sayfa üretimi site tarafında değerlendirilebilir. *Gider*: `site/` entegrasyon detay şablonu.
4. **Özellik-odaklı, "bu size ne kazandırır" tarzı ayrı içerik sayfası** (Entegra'nın Rekabet Analizi/Akıllı Fiyatlandırma sayfaları deseni) — Entegrasyonik'in **stok rezervasyonu** özelliği için benzer bir ayrı sayfa ("Aşırı satış nasıl önlenir?") yazılabilir; bu Entegrasyonik'in gerçek ve kanıtlı farkı, rakiplerde görülmedi. *Gider*: `/ozellikler/stok-rezervasyonu` gibi bir alt sayfa.
5. **Kategorize self-servis destek merkezi** (Sopyo'nun 12 kategorili yapısı) — Entegrasyonik henüz destek merkezi sunmuyor; onboarding + entegrasyon bağlama + sık sorunlar kategorileriyle küçük bir başlangıç yapılabilir. *Gider*: `/destek` yeni bölüm.
6. **Platforma özel "Hoşgeldiniz/kurulum" karşılama içeriği** (Sopyo'nun IdeaSoft'a özel sayfası) — Trendyol/Hepsiburada/N11/Pazarama/Ideasoft/Bizimhesap için ayrı, gerçek adımlara dayanan "nasıl bağlarım" mini-rehberi. *Gider*: entegrasyon detay sayfası alt bölümü.
7. **Mikro-operasyonel fayda anlatımı** (Yengeç'in "fatura+etiket tek PDF" gibi somut detay dili) — Entegrasyonik'in soyut "tek panelde yönetim" yerine somut örnek: "Trendyol'dan gelen bir iade talebini üç tıkla onaylayın/reddedin" gibi gerçek akışa dayalı cümleler. *Gider*: `/ozellikler` sayfası metin revizyonu.
8. **Modüler/şeffaf ek ücret gösterimi** (Yengeç'in e-fatura kontör paketi, Sopyo'nun ek ücret şeffaflığı) — Entegrasyonik paket yapısı netleşince ek ücretlendirilen kalemler (varsa) aynı netlikte gösterilmeli. *Gider*: `/fiyatlandirma`.
9. **"Neden biz" tarzı objektif kriter listesi (rakip adı vermeden)** (COMPETITOR_SOPYO.md'de zaten önerilmiş) — Entegrasyonik'in gerçek farklarını (ayrı DB, AES-256-GCM, stok rezervasyonu, varsayılan-red yetkilendirme) "entegrasyon seçerken nelere dikkat etmeli" başlığı altında SSS'ye ekleme. *Gider*: `/sss`.
10. **Programmatic SEO'nun ölçülü versiyonu** — Sopyo/Yengeç'in agresif şablon sayfa ağı riskli (ince/tekrarlayan içerik), ama Entegrasyonik'in 6 gerçek entegrasyonu için özgün, kanıta dayalı 6 ayrı sayfa (zaten `integrations.ts`'te veri var) SEO değeri taşır ve dürüstlük ilkesini bozmaz. *Gider*: `site/` routing.
11. **Video/görsel kanıt yerine gerçek ekran görüntüsü** (Sopyo'nun "X saniye önce senkronize" mikro-canlılık göstergesi fikri, COMPETITOR_SOPYO.md #1) — Entegrasyonik'in gerçek panelinden alınan ekran görüntüsüyle stok rezervasyonu/sipariş akışını göstermek. *Gider*: ana sayfa hero/ikinci bölüm.
12. **Sektöre göre değil, kanıta göre gruplanmış "yetenek kümesi" kartları** (Sopyo'nun 4 kümesi, Entegrasyonik'te zaten `homePillars` olarak var) — mevcut yapı korunmalı, rakiplerin yaptığı gibi her kümeye tıklanabilir "detay" linki eklenebilir (zaten `getPublicCapabilities` altyapısı var). *Gider*: ana sayfa bileşen linki.
13. **Blog için ayrı, odaklı içerik türü**: Entegrasyonik'in henüz blogu yok. Sopyo/Yengeç'in yoğun SEO blogu yerine, daha az sayıda ama **doğrulanabilir teknik derinlik** içeren yazılar (ör. "stok rezervasyonu nasıl çalışır", "tenant izolasyonu neden önemli") — ürünün gerçek mimari farkını pazarlama+teknik güven olarak birleştirir. *Gider*: yeni `/blog` bölümü (büyük efor, ayrı karar gerektirir).
14. **Kargo/fatura bilgisi bildirimi için dürüst sınır notu deseni** (zaten `caveat` alanı var) — rakiplerin "gerçek modül" iddialarının aksine, Entegrasyonik'in "elle girilen takip bilgisi" sınırını rakip karşılaştırmasında bir dezavantaj değil şeffaflık/güven unsuru olarak çerçeveleyen bir SSS maddesi. *Gider*: `/sss`.
15. **Partner/iş ortaklığı sayfası** (Yengeç deseni) — Entegrasyonik'in ajans/danışman kanalı varsa (yoksa öncelik değil) ayrı bir sayfa; şu an ürün olgunluğu düşünülürse düşük öncelik, not olarak bırakılıyor.

---

## 4. BACKLOG ADAYLARI (ürün özelliği — yalnızca bu raporda, BACKLOG.md'ye yazılmadı)

| # | Ad | Açıklama | İş değeri | Entegrasyonik'te durum (dayanak) | Efor | Öncelik |
|---|---|---|---|---|---|---|
| 1 | Rakip fiyat takibi + kural bazlı otomatik fiyat güncelleme | Trendyol/Hepsiburada/N11/Pazarama'da rakip fiyatını izleyip tanımlı kurala göre kendi fiyatını güncelleme (Entegra'nın "Rekabet Analizi" iddiası) | Yüksek | **Yok** — `capabilities.ts`'te böyle bir yetenek kaydı yok, `backend/src/api/services/stock-service.ts`/`product-service.ts` fiyat güncellemeyi destekliyor ama rakip fiyat izleme/otomasyon katmanı görülmedi | L | Orta (rakiplerde öne çıkan ama doğrulama/veri kaynağı riski yüksek bir özellik) |
| 2 | Hakediş/kesinti otomatik doğrulama ("eksik ödeme" tespiti) | Pazaryeri komisyon/kargo/ceza kesintilerini beklenen tutarla karşılaştırıp sapmayı işaretleme | Yüksek | **Kısmi** — `finance` capability bazı kanallarda `available`/`limited` (finans görünümü var, otomatik doğrulama/sapma tespiti yok — `financial-service.ts` mevcut ama bu mantık görülmedi) | M | Yüksek (finansal doğruluk = doğrudan müşteri güveni ve somut ROI) |
| 3 | Kargo firması API entegrasyonu (barkod/etiket otomatik üretim) | Aras/Yurtiçi/MNG/Sürat gibi firmalarla gerçek API bağlantısı; elle takip no girme yerine otomatik etiket | Yüksek | **Yok, sadece UI formu** (CLAUDE.md: "Shipping/e-invoice... exist only as UI forms") — zaten roadmap'te (`carrier-api`, `capabilities.ts` roadmap bölümü) | L | Yüksek (üç rakipte de var; Entegrasyonik'in en belirgin boşluğu) |
| 4 | E-fatura sağlayıcı entegrasyonu (otomatik e-fatura/e-arşiv kesimi) | Sipariş geldiğinde otomatik fatura kesimi (Yengeç'in temel özelliği) | Yüksek | **Yok**, roadmap'te zaten kayıtlı (`einvoice-provider`) | L | Yüksek (aynı roadmap öğesiyle örtüşüyor, önceliklendirme zaten var) |
| 5 | Fatura + kargo etiketinin tek PDF'te birleştirilmesi | Operasyonel zaman tasarrufu sağlayan küçük ama somut özellik (Yengeç) | Orta | **Yok** — önkoşulu olan gerçek kargo API'si de yok (bağımlı özellik) | S (kargo API'si varsa) | Düşük (önce #3 gerekiyor) |
| 6 | Günlük fiyat/stok tutarsızlık raporu (e-posta) | Panelde giriş yapmadan sapmaları e-posta ile bildirme (Yengeç) | Orta | **Yok** — `notification-service.ts` ve `NotificationEventBus` altyapısı var, bu spesifik rapor türü görülmedi | S | Orta (mevcut bildirim altyapısı üzerine görece küçük eklenti) |
| 7 | Ek pazaryeri kapsamı: Amazon, Çiçeksepeti, idefix, PttAVM gibi | Üç rakip de Entegrasyonik'in kapsamadığı pazaryerlerini listeliyor | Yüksek (pazar kapsamı) | **Yok** — `integrations.ts` roadmap bölümünde Amazon/Çiçeksepeti zaten `status: 'roadmap'` olarak kayıtlı (`ROADMAP_VISIBLE=false`) | L (her biri ayrı adaptör) | Orta (zaten backlog'da olduğu görülüyor — yeni bilgi değil, rakip baskısı teyidi) |
| 8 | Çoklu muhasebe/ERP desteği (Logo, Mikro, Paraşüt, Netsis vb.) | Üç rakip de Bizimhesap dışında çok sayıda muhasebe yazılımını destekliyor | Yüksek | **Yok** — yalnızca Bizimhesap var ve yalnızca okuma (`erp-read` capability, `caveat: "Yalnızca okuma"`) | L | Orta (kurumsal segment için önemli ama mevcut yalnızca-okuma kısıtı bile henüz genişletilmedi) |
| 9 | Self-servis destek merkezi / bilgi tabanı | Sopyo'nun 12 kategorili yapısı gibi; Entegrasyonik'te hiç yok | Orta | **Yok** — sitede `/sss` var ama kategorize destek merkezi/dokümantasyon yok | M | Orta (destek yükünü azaltır, ürün olgunlaştıkça değeri artar) |
| 10 | Ücretsiz deneme politikasının netleştirilmesi ve sitede tutarlı gösterimi | Üç rakip de net bir deneme süresi/koşulu iddia ediyor; Entegrasyonik sitesinde bu netlik teyit edilmedi | Orta | **Belirsiz** — `site/` içinde CTA dili incelenmedi bu raporda, ayrı doğrulama gerekir | S | Düşük-Orta (ürün/iş kararı, teknik değil) |
| 11 | Sektöre özel referans/vaka içeriği | Entegra'nın sektör bazlı referans grupları, Sopyo'nun testimonial kartları | Düşük-Orta (gerçek müşteri yoksa uygulanamaz) | **Yok** — gerçek müşteri/referans verisi olmadan eklenmemeli (COMPETITOR_SOPYO.md §4 uyarısıyla tutarlı) | — | Düşük (önce gerçek müşteri tabanı gerekir, teknik backlog değil) |
| 12 | XML ürün kaynağı entegrasyonu | Sopyo ve Yengeç'te XML tedarikçi kaynağından otomatik ürün aktarımı ayrı bir kategori | Orta | **Yok** — `integration/modules` altında böyle bir modül yok | M | Düşük-Orta (niş ama bazı toptancı/tedarik zinciri modelleri için değerli) |

---

## 5. Kaçınılacaklar

- **Rakip isim vererek karşılaştırma tablosu yayınlama** — Entegra/Sopyo/Yengeç'in "biz vs diğerleri" formatı örnek alınabilir ama isim vermeden, objektif kriterle sınırlı kalınmalı (COMPETITOR_SOPYO.md §4 ile tutarlı).
- **Doğrulanmamış sayısal iddiaları taklit etme** — "8000+ kullanıcı", "104 entegrasyon", "70+ çalışan" gibi rakamlar üç rakipte de görüldü ama hiçbiri bu raporda doğrulanamadı; Entegrasyonik sitesinde gerçek veri olmadan hiçbir ölçek iddiası kullanılmamalı (`tests/claims.test.ts` zaten bunu engelliyor — bu disiplin korunmalı).
- **"Rekabet analizi", "akıllı fiyatlandırma", "hakediş doğrulama" gibi özellik adlarını, kod karşılığı olmadan ana sayfada vaat etme** — bunlar backlog adayı olarak listelendi (§4), ama implemente edilmeden pazarlama diline girmemeli.
- **Kargo/e-fatura/ek pazaryeri entegrasyonlarını "gerçek modül" gibi sunma** — CLAUDE.md ve `integrations.ts` zaten bunları `roadmap` + gizli olarak işaretliyor; rakiplerin agresif kapsam iddiaları bu sınırı gevşetmek için bir gerekçe olmamalı.
- **Programmatic SEO'yu Sopyo/Yengeç ölçeğinde taklit etme** — her kargo firması × her entegrasyon kombinasyonu için şablonlu, ince içerikli sayfa üretmek (var olmayan gerçek entegrasyonlar için) hem güven kaybı hem SEO spam riski taşır; yalnızca gerçek 6 entegrasyon için özgün sayfa önerildi (§3 madde 10).
- **Blog içeriğini "adım adım"/"soru-cevap" başlık kalıplarının yakın parafrazıyla yazma** — format örnek alınabilir, cümle/başlık düzeyinde yakın kopya olmamalı.
- **Entegra'nın "sitede iddia ediliyor" düzeyinde kalan büyük ERP listesini (SAP, Dynamics AX) doğrulanmadan referans alma** — bu rapordaki tüm rakip iddiaları ikinci elden (WebSearch snippet) toplandı; Entegrasyonik tarafında hiçbir karşılaştırma bu iddiaları "kesin gerçek" gibi kullanmamalı.

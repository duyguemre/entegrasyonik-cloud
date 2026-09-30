# Pazaryeri Komisyon ve Kesinti Araştırması (2026-09-30)

Erişim tarihi (hepsi): 2026-09-30. Güven: R = resmi okundu, İ = ikincil (entegratör/blog), S = yalnız arama özeti. Rakip/entegratör blogları İ'dir; komisyon rakamları resmi tablo ile teyit edilmedikçe "doğrulandı" sayılmaz. Bu dosya `ECOMMERCE_MARKET_KB_2026-09-30.md` (komisyon "DOĞRULANAMADI" bırakılmıştı) ve `WHATSAPP_SOCIAL_CAMPAIGN_2026-09-30.md` (kampanya API'si bulunamadı) bulgularını tamamlar; onları tekrar etmez.

## 1. Koddaki mevcut durum (kanıt)

- `backend/src/integration/modules/marketplace/pazarama/commissions.json` içeriği **`[]` (boş dizi)**. Yani Pazarama için statik komisyon verisi hiç yok; `getCategoryCommission` Pazarama'da her zaman boş dönmeli. (Read ile doğrulandı.)
- `trendyol/commissions.json`: kategori ağacı (id, name, parentId, commission, maturity, ka1, ka2, micro, childrenCategories). Okunan bölümlerde (satır 1-80 ve 4000-4060) `ka1/ka2/micro` her yerde `null`; komisyonlar yalnız `25, 21.5, 22.5, 30` gibi yuvarlak/yarım değerler; vade (`maturity`) 28/30/45. Dosyanın tamamı okunmadı (araç kısıtı: grep/node yok), dolayısıyla "hiçbir düğümde ka1/ka2/micro dolu değil" iddiası DOĞRULANAMADI; örneklemde hepsi null.
- Yapısal tutarsızlık (örneklemden): Aksesuar > Takı & Mücevher > Bileklik = %30 iken çocuğu Altın/Gümüş/Pırlanta Bileklik = %21,5; Pardesü & Trençkot = %25, çocukları Pardesü/Trençkot = %21,5. Ebeveyn oranı yaprakla çelişiyor; `fetchCategoryCommission` yaprak id ile arıyorsa yaprağın oranı kullanılır, ebeveyn id ile aranırsa farklı oran döner.
- Bayatlık kanıtı (dolaylı): 2026 tarihli ikincil kaynaklar Trendyol oranlarını **KDV dahil ve iki ondalıklı** yayınlar (Giyim 21,36; Ayakkabı 22,50-23,39; Aksesuar 21,36-22,37) (İ, aşağıda). JSON'daki değerler yuvarlak (21,5 / 22,5) ve tek kaynak commit'i 2026-04 (görev bildirimine göre). Bu, JSON'un ya farklı bir sunum biçimini (KDV hariç/dahil) ya da eski bir tabloyu taşıdığını düşündürür; hangisi olduğu DOĞRULANAMADI (resmi tablo gerekli).
- ka1/ka2/micro anlamı: hiçbir kaynakta bulunamadı. "KA" = "Key Account" (anahtar hesap) olabilir, `micro` = mikro ihracat olabilir; bunlar HİPOTEZDİR, kaynaksız. Aranan "KA1/KA2" için arama sonuçları açıkça "bilgi yok" döndü. Trendyol'un satıcı seviye indirimi (Seviye 4: 2,5-7 puan, Seviye 5: 2,5-10 puan, İ) bu alanlara karşılık gelebilir ama teyitsiz. Karar: alanların anlamı Trendyol partner desteğinden/Excel şablon başlığından teyit edilene kadar kodda kullanılmamalı.

## 2. Kategori bazlı oranlar: kaynak ve örnekler

Genel sonuç: dört pazaryerinin hiçbirinde makine-okunur, herkese açık, kaynaklı resmi komisyon tablosu bulunamadı. Resmi yayın yeri satıcı paneli/yardım merkezi (bazıları giriş ister veya botlara 403 verir). Rakamlar aşağıda hep İ; "doğrulandı" değildir.

| Pazaryeri | Resmi yayın yeri (iddia) | Bu turda okunabildi mi | Örnek oranlar (İ, tarih) | Not |
|---|---|---|---|---|
| Trendyol | Satıcı Paneli > Anlaşma Bilgileri (mağazaya özel bağlayıcı oran, İ); Akademi "Trendyol Komisyonları" sayfası https://akademi.trendyol.com/satici-bilgi-merkezi/detay/trendyol-komisyonlari | Hayır (sayfa gövdesi boş geldi, JS) | Giyim/tekstil %21,36; Ayakkabı %22,50-23,39; Aksesuar %21,36-22,37; Cep tel. %7-10; Dizüstü %7,5; Kadın girişimci %1,80-5,50; aralık %3-28 (KDV dahil) — https://www.ideasoft.com.tr/trendyol-komisyon-oranlari/ (güncelleme 2026-02-06), https://birfatura.com/trendyol-komisyonu-nedir/ | İ. İki İ kaynak KDV'yi farklı anlatıyor (bkz. bölüm 4). Seviye 4-5 indirimi yalnız İ |
| Hepsiburada | "İş Ortağım" paneli veya kategori bazlı komisyon listesi PDF'i (İ) | Hayır | Altın %6; Giyim/Çanta %18; Ayakkabı %19,49; Parfüm %15,25-17 (iki kaynak arası fark); Cep tel. %6-7; Tablet %7; Mobilya %18-22; kadın kooperatifi %1 — https://www.parasut.com/blog/hepsiburada-komisyon-oranlari (güncelleme 2026-06-30) | İ. Parfüm oranı iki ikincil sayfada farklı: DOĞRULANAMADI |
| N11 | Mağaza Destek Merkezi "Komisyon Oranları" https://magazadestek.n11.com/s/komisyon-oranlari | Hayır (HTTP 403, bot engeli) | Elektronik %5,5-20; Moda %18-20,34; Ev %15-21; Anne-bebek %12-21; Kozmetik %13-17 — https://birfatura.com/n11-komisyon-oranlari-ve-diger-kesintiler/ (2026-02-10) | İ. Hem "%5-20" (parasut) hem "5,5-21" (birfatura) aralığı: kaynaklar tutarsız |
| Pazarama | Satıcı Yardım Merkezi (İ), KDV HARİÇ yayınlanıyor (İ) | Hayır | Moda, telefon aksesuarı, kişisel bakım/kozmetik %19; cep telefonu %10; genel %8-19; el emeği kadın girişimci %0; anne-bebek %15; işlenmemiş altın %5 — https://www.ideasoft.com.tr/pazarama-komisyon-oranlari/ (2025-08-18, bayat olabilir) | İ. KDV hariç/dahil farkı Trendyol/HB ile aynı tabloda karıştırılırsa hata üretir |
| Amazon TR | Seller Central (giriş gerekli) | Hayır | Oran/plan ücreti DOĞRULANAMADI. FBA'ya alınan uygun ürünler için 1 Mayıs-31 Temmuz 2026 arası sıfır komisyon + %50 indirimli teslimat kampanyası (İ: haber) — https://www.ekonomist.com.tr/haberler/amazon-turkiye-den-saticilara-tarihi-destek-sifir-komisyon-ve-yuzde-50-indirimli-teslimat-donemi-basladi--74257 | Kampanya bitmiş; sayısal komisyon yok |
| ÇiçekSepeti, PttAVM, İdefix, Koçtaş | — | Araştırılmadı/sonuç yok | DOĞRULANAMADI | İkincil kapsam; bu turda derinleşilmedi |

Son değişiklik tarihleri: hiçbir pazaryerinin kendi yayınında "yürürlük tarihi" okunamadı. Yalnız ikincil sayfaların "son güncelleme" tarihleri var (yukarıda). Bu tarihler pazaryerinin değişiklik tarihi değildir.

## 3. Komisyona API ile erişim

| Pazaryeri | Uç | Neyi verir | Kanıt / güven |
|---|---|---|---|
| Trendyol | `GET https://apigw.trendyol.com/integration/finance/che/sellers/{sellerId}/settlements` (transactionType: Sale/Return; üstte özet sayfada Discount, Coupon, ProvisionPositive vb. de anılıyor) | Sipariş/satır bazında **gerçekleşen** `commissionRate`, `commissionAmount`, `sellerRevenue`, `paymentPeriod` (gün), `paymentDate`, `paymentOrderId`, `orderNumber`, `barcode`, `commissionInvoiceSerialNumber`, `debt`, `credit`, `affiliate`, `country` | R: https://developers.trendyol.com/v3.0/reference/getsettlements.md |
| Trendyol | `GET .../sellers/{sellerId}/otherfinancials` (transactionType: PaymentOrder, DeductionInvoices, CreditNote, CommissionInvoice; çağrı başına tek tip) | Ödeme emri, hizmet/kesinti faturaları, komisyon faturaları | R: https://developers.trendyol.com/v3.0/reference/getotherfinancials.md |
| Trendyol | `payment-order` (ödeme emirleri) — önerilen akış: önce ödeme emri ID'leri, sonra bu ID'lerle settlements/otherfinancials | Ödemeler haftalık (Çarşamba, vadesi gelenler için) | R: https://developers.trendyol.com/v2.0/docs/current-account-statement-integration ; https://developers.trendyol.com/v3.0/docs/1current-account-statement-integration.md |
| Trendyol kısıtları | Başlangıç/bitiş zorunlu, aralık **en fazla 15 gün**, milisaniye zaman damgası, `storeFrontCode` başlığı zorunlu, sayfa boyutu 500 veya 1000, kayıtlar **teslimattan sonra** oluşur, ödeme emri sonrası veri güncellemesi gecikebilir (ertesi gün sorgula) | — | R (aynı sayfalar) |
| Trendyol kategori komisyonu | Kategori bazlı komisyon veren API uç yok; llms.txt dizininde kampanya/kategori komisyon sayfası da yok | Yok | R (dizin okundu): https://developers.trendyol.com/v3.0/llms.txt |
| Hepsiburada | `integration.hepsiburada.com/finance` alt alanı: fatura yükleme ve finansal mutabakat; "settlement raporu, komisyon detay görünümü, ceza/düzeltme kesintileri" iddiası | Bir finans servisi var; alan adları ve uç yolları doğrulanamadı | İ/S: https://ecosire.com/blog/hepsiburada-odoo-integration-guide (üçüncü taraf). Resmi portal https://developers.hepsiburada.com bot engeli (403) verdi. **Komisyon alanı DOĞRULANAMADI** |
| N11 | Panelde Muhasebe & Raporlar (hakediş, kesilen komisyon) var; API'de komisyon/hakediş ucu doğrulanamadı | — | S: https://www.parasut.com/blog/n11-komisyon-oranlari ; resmi API dokümanı bulunamadı. **DOĞRULANAMADI** |
| Pazarama | Panelde (isortagim.pazarama.com) API bilgisi var; finans/hakediş ucu doğrulanamadı | — | S. **DOĞRULANAMADI** |

Sonuç: Yalnız Trendyol için resmi ve kanıtlı "gerçekleşen komisyon" API'si var. Hepsiburada finans servisi mevcut ama komisyon alanı doğrulanmadı (spike gerekli). N11 ve Pazarama için kanıt yok. Bu nedenle "statik tabloyu tamamen terk et" kararı yalnız Trendyol için güvenli; diğerlerinde tahmin tablosu + sipariş yanıtındaki komisyon alanı (varsa; mevcut FinancialMapper'lar zaten sipariş/hakediş verisinden komisyon eşliyor) kalmalı.

## 4. Komisyon dışındaki kesintiler ve hesaplama kuralları

| Konu | Bulgu | Kaynak / güven |
|---|---|---|
| KDV ve komisyon | Trendyol oranları 2026'da "KDV dahil" gösteriliyor: 600 TL x %21,36 = 128,16 TL toplam kesinti (= %17,8 komisyon + %20 KDV). Aynı örnekte ikinci kaynak "komisyon KDV hariç fiyattan hesaplanır, üstüne %20 KDV" diyor: iki anlatım aynı rakama varmaz; **hangisi doğru DOĞRULANAMADI**. Hepsiburada: oran KDV dahil listeleme fiyatı üzerinden, kesilen komisyona ayrıca KDV eklenir (bileşik etki). Pazarama oranları KDV hariç yayınlanıyor | İ: https://birfatura.com/trendyol-komisyonu-nedir/ ; https://www.ideasoft.com.tr/trendyol-komisyon-oranlari/ ; https://www.parasut.com/blog/hepsiburada-komisyon-oranlari ; https://www.ideasoft.com.tr/pazarama-komisyon-oranlari/ |
| Hepsiburada ek bedeller | Kategoriden bağımsız sabit işlem bedeli ve hizmet bedeli (gönderi başına); tutarlar alınamadı | İ: parasut HB sayfası. Tutarlar DOĞRULANAMADI |
| N11 ek bedeller | Pazarlama hizmet bedeli (elektronik dışı ürün bedelinin %1 + KDV; altın/gümüşte %0,20 + KDV) ve pazaryeri hizmet bedeli (%0,67 + KDV) | S (arama özeti, parasut/birfatura): https://www.parasut.com/blog/n11-komisyon-oranlari . Resmi teyit yok: DOĞRULANAMADI |
| Trendyol ek bedeller | "Platform hizmet bedeli" ve kargo ayrıca hesaplanır (İ genel ifade); tutar/oran bulunamadı | S. DOĞRULANAMADI |
| E-ticaret stopajı | 1 Ocak 2025'ten itibaren %1; 7524 sayılı Kanun (RG 2 Ağustos 2024), Cumhurbaşkanı Kararı 9284; pazaryerleri ödemeden keser; yıl içinde ödenen stopaj, gelir/kurumlar vergisinden mahsup edilir | İ/S: https://www.cnbce.com/haberler/resmi-gazetede-yayimlandi-asgari-kurumlar-vergisi-yukseltildi-e-ticarette-stopaj-orani-belli-oldu-h7855 ; https://www.erdem-erdem.av.tr/bilgi-bankasi/elektronik-ticaret-uzerinden-yapilan-odemeler-icin-stopaj-uygulamasi . Mevzuat metni okunmadı; matrah (KDV hariç mi) ve muafiyetler DOĞRULANAMADI |
| Vade / hakediş günü | Trendyol: haftalık ödeme emri (Çarşamba, vadesi gelenler), `paymentPeriod` API alanı gün sayısını verir (R). Hepsiburada: teslimattan 14-45 gün, kategoriye göre (İ). N11: ayın 3/13/23'ü (İ, tek kaynak). Trendyol JSON `maturity` = 28/30/45 gün | R (Trendyol API dokümanı); İ (diğerleri) |
| Erken ödeme | Trendyol'da erken ödeme opsiyonel ve bedelli (İ). Oran DOĞRULANAMADI | İ: https://www.ideasoft.com.tr/trendyol-erken-odeme-nedir/ |

## 5. Kampanya bağlantısı (CMP)

- Trendyol seviye programı: Seviye 4'te bazı kategorilerde 2,5-7 puan, Seviye 5'te 2,5-10 puan daha düşük komisyon (son 180 gün ciroya bağlı, İ). Bu bir kampanya değil satıcı seviyesi indirimi; oran satıcıya özeldir, API'den okunmaz. (İ: https://www.ideasoft.com.tr/trendyol-komisyon-oranlari/)
- "Kampanyaya katılınca komisyon X puan düşer" kuralı için resmi kaynak bulunamadı (Trendyol "Avantajlı Ürün Etiketleri" yalnız görünürlük/indirim etiketi, komisyon değişimi kaynaksız). DOĞRULANAMADI.
- Kampanya/komisyon API'si: Trendyol developer dizininde (llms.txt) yok; diğerlerinde de kanıt yok (WHATSAPP_SOCIAL_CAMPAIGN dosyasıyla tutarlı).
- Bilinen komisyon kampanyaları (haber düzeyi, tek seferlik): Pazarama kadın girişimci: satışlar 50.000 TL'ye ulaşana kadar %0 komisyon, 31 Aralık 2026'ya kadar (R, banka sayfası okundu: https://www.isbank.com.tr/kampanyalar/kadin-girisimcilere-pazarama-hizmet-komisyonunda-indirim); Amazon TR FBA'ya sıfır komisyon (1 Mayıs-31 Temmuz 2026, İ).
- Kampanya sırasında gerçekleşen komisyon: Trendyol settlements kaydı satır bazında `commissionRate` verdiği için (R), kampanyanın etkisi olay sonrası ölçülebilir; öncesinden tahmin edilemez.

## 6. Öneri (kısa)

1. Trendyol için birincil kaynak: `settlements` (`commissionRate/commissionAmount/sellerRevenue`) — gerçekleşen komisyon. Mevcut Trendyol FinancialMapper bunu zaten hedefliyor; 15 günlük pencere ve teslim sonrası oluşum kısıtları dikkate alınmalı (yeni sipariş için komisyon henüz yoktur).
2. Tahmin (yeni ürün fiyatlama, karlılık ön hesabı) için: sürümlü statik tablo, her kayıtta `source` (resmi/ikincil/tenant), `effectiveFrom`, `vatIncluded` (bool), `updatedAt`; tek yerde "son güncelleme" tarihi UI'da gösterilir.
3. Tenant override: satıcıya özel anlaşma oranı (Trendyol'da "Anlaşma Bilgileri" ekranından) tenant tarafından girilir veya settlements'ten öğrenilir: kategori başına son gerçekleşen oran tenant düzeltmesi olarak önbelleğe alınır ("son 90 günün gerçekleşen oranı"). Böylece resmi tabloya ihtiyaç azalır.
4. Güncelleme yöntemi: resmi tablo otomatik çekilemiyor (giriş/bot engeli) → 90 günde bir elle (Excel/CSV içe aktarım) güncelleme; her içe aktarımda diff raporu. Sürekli scraping önerilmez (sözleşme/hukuk riski, bakım).
5. Pazarama'da boş JSON: tahmin tablosu yoksa UI komisyonu "bilinmiyor" göstermeli; %0 gibi varsayılan yazmamalı (aşağıdaki COM-02).

## 7. Doğrulanamayanlar

- Dört pazaryerinin de resmi güncel kategori komisyon tablosu (tüm oranlar İ).
- Trendyol JSON `ka1/ka2/micro` alanlarının anlamı ve dolu düğüm olup olmadığı (dosyanın tamamı okunmadı).
- Trendyol'da KDV'nin komisyona uygulanma biçimi (iki İ kaynak çelişkili).
- Trendyol platform hizmet bedeli tutarı; HB sabit işlem/hizmet bedeli tutarları; N11 %1 ve %0,67 bedelleri (S); erken ödeme oranları.
- Hepsiburada finans API'sinde komisyon alanı; N11 ve Pazarama'da komisyon/hakediş API ucu.
- Kampanya katılımıyla komisyon düşüşü kuralı ve Trendyol seviye 4/5 indirimi (İ).
- E-ticaret stopajı matrahı ve muafiyetleri (mevzuat metni okunmadı).
- Amazon TR, ÇiçekSepeti, PttAVM, İdefix, Koçtaş komisyonları.
- Pazaryerlerinin kendi yayınlarındaki "son değişiklik/yürürlük" tarihleri.

## 8. Backlog önerileri

| ID | Sınıf | Kapsam | Kabul ölçütü | Bağımlılık |
|---|---|---|---|---|
| COM-01 | critical (veri doğruluğu) | Trendyol commissions.json tutarlılık ve bayatlık düzeltmesi: ebeveyn-yaprak oran çelişkileri raporu; `vatIncluded`, `effectiveFrom`, `source`, `updatedAt` alanları; resmi Excel/CSV ile 90 günlük güncelleme betiği | Çelişki raporu üretilir; şema testi; UI/servis "son güncelleme" döndürür | Resmi tablo Trendyol satıcı panelinden elle alınmalı |
| COM-02 | critical (veri bütünlüğü) | Pazarama commissions.json boş: eksik veri "komisyon yok/%0" gibi okunmasın; `unknown` durumu; veri kaynağı bulunana kadar kanıtlı fallback | Boş tabloda getCategoryCommission `null/unknown` döner, UI'da "bilinmiyor"; birim test | Pazarama resmi tablo teyidi |
| COM-03 | planned | Trendyol settlements/otherfinancials ile gerçekleşen komisyon eşleme: 15 gün pencere döngüsü, sayfalama (500/1000), teslim sonrası gecikme, `paymentOrderId` ile mutabakat; kategori başına gerçekleşen oran özeti | Bir tenant için son 90 günün kategori başına ortalama gerçekleşen oranı hesaplanır; test fixture | Mevcut Trendyol FinancialMapper; CMP kâr önizlemesi buna dayanır |
| COM-04 | planned | Tenant komisyon override: tenant/kanal/kategori bazında oran (öncelik: override > gerçekleşen > statik) | Öncelik zinciri testi; UI'da kaynak etiketi | COM-01, COM-03; CMP fiyat/kâr önizlemesi |
| COM-05 | planned | Hepsiburada finans API spike: `integration.hepsiburada.com/finance` uçları, komisyon alanı var mı (giriş yapılmış resmi doküman) | Uç listesi + örnek yanıt; komisyon alanı var/yok kararı | HB satıcı hesabı |
| COM-06 | planned | N11 ve Pazarama komisyon/hakediş API spike | Aynı çıktı; yoksa "tahmin tablosu" kararı | N11/Pazarama hesapları |
| COM-07 | planned | Kesinti modeli: komisyon + KDV + hizmet/işlem bedeli + stopaj + kargo katkısı ayrı kalemler (tek "komisyon" sayısı yerine) ve net hakediş tahmini | Örnek sipariş için kalemli net; stopaj oranı yapılandırılabilir (varsayılan %1, kaynak notu) | Stopaj matrahı hukuk/muhasebe teyidi; KDV kuralı teyidi |
| COM-08 | nice-to-have | Komisyon değişim uyarısı: gerçekleşen oran, statik/override'dan X puan sapınca "tablo bayat olabilir" bildirimi (API drift vizyonu) | Sapma eşiği aşılınca bildirim üretilir | COM-03, bildirim altyapısı (ADR-0029) |
| COM-09 | nice-to-have | CMP: kampanya karlılık önizlemesi (kampanya fiyatı + tahmini komisyon + kesintiler) | Önizleme net kâr/zarar gösterir; komisyon kaynağı etiketli | COM-03/04/07; pazaryeri kampanya API'si yok, katılım manuel kalır |

CMP notu: "Kampanyaya katılınca komisyon düşer" kuralı doğrulanmadığı için CMP komisyon indirimini varsaymamalı; kullanıcı girişi veya gerçekleşen oranlardan öğrenme yeterli.

## 9. Kaynak listesi (erişim 2026-09-30)

- R: https://developers.trendyol.com/v3.0/reference/getsettlements.md ; https://developers.trendyol.com/v3.0/reference/getotherfinancials.md ; https://developers.trendyol.com/v2.0/docs/current-account-statement-integration ; https://developers.trendyol.com/v3.0/docs/1current-account-statement-integration.md ; https://developers.trendyol.com/v3.0/llms.txt ; https://www.isbank.com.tr/kampanyalar/kadin-girisimcilere-pazarama-hizmet-komisyonunda-indirim
- İ: https://www.ideasoft.com.tr/trendyol-komisyon-oranlari/ ; https://birfatura.com/trendyol-komisyonu-nedir/ ; https://www.parasut.com/blog/hepsiburada-komisyon-oranlari ; https://birfatura.com/n11-komisyon-oranlari-ve-diger-kesintiler/ ; https://www.ideasoft.com.tr/pazarama-komisyon-oranlari/ ; https://www.ideasoft.com.tr/trendyol-erken-odeme-nedir/ ; https://www.ekonomist.com.tr/haberler/amazon-turkiye-den-saticilara-tarihi-destek-sifir-komisyon-ve-yuzde-50-indirimli-teslimat-donemi-basladi--74257 ; https://www.erdem-erdem.av.tr/bilgi-bankasi/elektronik-ticaret-uzerinden-yapilan-odemeler-icin-stopaj-uygulamasi
- S: https://www.parasut.com/blog/n11-komisyon-oranlari ; https://ecosire.com/blog/hepsiburada-odoo-integration-guide ; https://www.cnbce.com/haberler/resmi-gazetede-yayimlandi-asgari-kurumlar-vergisi-yukseltildi-e-ticarette-stopaj-orani-belli-oldu-h7855
- Erişilemedi: https://magazadestek.n11.com/s/komisyon-oranlari (403), https://developers.hepsiburada.com (403), https://akademi.trendyol.com/satici-bilgi-merkezi/detay/trendyol-komisyonlari (gövde boş).

## Ek — orkestratör doğrulaması (2026-09-30, kod üzerinden)

- **ka1/ka2 dolu, micro boş:** Trendyol `commissions.json` 4204 düğüm; 2706 düğümde `ka1`/`ka2` NESNE olarak dolu
  (`{ commission: <sayı>, name: 'KA1' | 'KA2' }`), `micro` hiçbir düğümde dolu değil. Araştırmacının "okunan yerlerde null"
  gözlemi kısmi okumadan kaynaklıydı. Örnek: Pikap & Gramofon genel %14,5 → KA1 %9, KA2 %12; Belgesel %11 → KA1 %8, KA2 %10.
  Yorum (DOĞRULANMADI): KA1/KA2 genel orandan düşük kademeli oranlar — büyük/anahtar hesap (Key Account) ya da satıcı
  seviyesi kademeleri olması muhtemel. Kodda bu kademeler hiç kullanılmıyor (yalnız `commission`).
- **Pazarama `commissions.json` = `[]` (4 bayt)** — doğrulandı.
- **Sessiz %0 hatası:** `PlatformMappingProvider.getCategoryCommission` bulunamayan komisyon için `found?.commission || 0`
  döndürüyor → "bilinmiyor" durumu %0 komisyon olarak hesaplara giriyor (COM-02 kapsamına alınmalı).

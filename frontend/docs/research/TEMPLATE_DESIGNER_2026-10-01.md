# Şablon Tasarımcısı Pazar Araştırması (2026-10-01)

> **İç belge — rakip/ürün adları uygulama veya sitede geçmez.**

Kapsam: kargo etiketi, fatura/irsaliye taslağı, sipariş fişi (packing slip), toplama listesi (pick list) şablon tasarımcıları.

## 0. Yöntem ve kaynak güvenilirliği

Web araması kısıtlı çalıştı (4 sorgu, yüzeysel sonuçlar). Bulgular iki sınıfa ayrıldı:

| İşaret | Anlam |
|---|---|
| **[K]** | Aşağıdaki kaynak listesindeki bir URL ile doğrulandı |
| **[A]** | Kaynaksız — yazarın alan bilgisi / genel sektör gözlemi; uygulamadan önce doğrulanmalı |

Önemli sınırlama: ShipStation'ın birleştirme-alanı (merge field) sözdizimi ve Türkiye'deki rakiplerin (Sentos, İkas, Paraşüt, KolayBi) şablon editörü ayrıntıları aramada doğrulanamadı; bunlar [A] işaretlidir.

## Genel tablo: sektör iki kampa ayrılıyor

| Kamp | Örnekler | Yaklaşım | Artı | Eksi |
|---|---|---|---|---|
| Kod tabanlı (HTML + şablon dili) | Shopify Order Printer (HTML+CSS+Liquid) [K-1], ShipStation özel şablonlar (HTML yapıştırma, sürükle-bırak yok) [K-5] | Geliştirici dostu, sınırsız esneklik | Esnek | Teknik olmayan satıcı için çok zor [K-5] |
| Sürükle-bırak / WYSIWYG | Starshipit şablon editörü [K-3], etiket yazılımları (ZebraDesigner, BarTender, NiceLabel) [A], rapor tasarımcıları [A] | Tuval + alan paleti + özellik paneli | Düşük öğrenme eğrisi | Geliştirmesi pahalı |
| Veri + şablon API'si | PDFMonkey, Carbone, Docmosis [A] | Şablon + JSON → PDF | Otomasyon | Son kullanıcı editörü zayıf |

Çıkarım: Entegrasyonik'in hedef kitlesi (Türk KOBİ pazaryeri satıcıları) teknik değil. Sürükle-bırak kampı doğru; ancak gelişmiş kullanıcı için ham HTML değil, "değişken sözdizimi" yeterli.

## 1. Hazır şablon galerisi

**Yaygın uygulama**

- Belge türüne göre sekme/filtre: Etiket, Fatura/İrsaliye, Sipariş fişi, Toplama listesi. [A]
- Shopify Order Printer varsayılan olarak fatura ve packing slip şablonu ile gelir; kullanıcı bunları kopyalayıp özelleştirir [K-1].
- Starshipit packing slip için şablon editörü sunar, varsayılan şablonu yapılandırma ekranından seçtirir [K-2][K-3].
- Etiket yazılımları (ZebraDesigner, NiceLabel, DYMO Connect, P-touch Editor) boyut bazlı hazır şablon sihirbazı sunar (kağıt seç → şablon) [A].
- "Şablondan başla" = kopyala-ve-düzenle; orijinal salt-okunur kalır [A].

**En iyi örnekler:** küçük resimli kart ızgarası, kağıt boyutu rozeti (ör. "100x150 mm"), "Varsayılan" rozeti, tek tıkla "Varsayılan yap". [A]

| # | Çıkarım | Öncelik |
|---|---|---|
| 1.1 | Belge türü ve boyuta göre filtrelenen şablon galerisi, her kartta küçük resim | MUST |
| 1.2 | Sistem şablonları salt-okunur; "Kopyasını düzenle" ile kullanıcı kopyası oluşur | MUST |
| 1.3 | Belge türü başına tek "varsayılan" şablon; yazdırma ekranında varsayılan otomatik seçili | MUST |
| 1.4 | Küçük resimleri örnek veriyle üret (boş iskelet değil) | SHOULD |
| 1.5 | Boş şablondan başlama seçeneği | SHOULD |
| 1.6 | Pazaryeri/kargo firması hazır şablonları (Trendyol, Hepsiburada, Yurtiçi, Aras vb.) | SHOULD |
| 1.7 | Şablon içe/dışa aktarma (JSON) | COULD |

## 2. Sürükle-bırak alanlar ve bileşenler

**Yaygın bileşen seti** [A, tüm masaüstü etiket ve rapor tasarımcılarında ortak]:

| Bileşen | Not |
|---|---|
| Metin (sabit) | Font, boyut, kalın/italik, hizalama, satır aralığı |
| Değişken alanı | Siparişten dolan metin; önek/sonek, boş değilse göster |
| Görsel / logo | Oran koruma, sığdır/kırp; termalde siyah-beyaza dönüştürme |
| Çizgi | Kalınlık, yatay/dikey |
| Dikdörtgen / kutu | Kenarlık, dolgu, köşe yuvarlama |
| Tablo / tekrarlayan bölge | Bkz. bölüm 8 |
| Barkod / QR | Bkz. bölüm 7 |
| Sayfa numarası, tarih | Toplu belgelerde |

**En iyi örnekler:** Bileşeni paletten tuvale sürükleme + tıkla-ekle (klavye/erişilebilirlik için); tuval üzerinde doğrudan metin düzenleme (çift tık); özellik panelinde sayısal X/Y/G/Y girişi (piksel hassasiyeti için). [A]

| # | Çıkarım | Öncelik |
|---|---|---|
| 2.1 | Çekirdek set: metin, değişken, görsel/logo, çizgi, kutu, tablo, barkod, QR | MUST |
| 2.2 | Sürükleme yanında "tıkla ekle" (tuvalin ortasına) | SHOULD |
| 2.3 | Özellik panelinde mm cinsinden sayısal konum/boyut | MUST |
| 2.4 | Katman sırası (öne/arkaya), kilitle, gizle | SHOULD |
| 2.5 | Metin sığdırma: otomatik küçült / kes / taşır (alan başına seçilebilir) | MUST |
| 2.6 | Koşullu görünürlük ("sipariş notu varsa göster") | COULD |
| 2.7 | Serbest şekil/ikon kütüphanesi | COULD (kapsam dışı bırak) |

## 3. Değişken / alan paleti

**Yaygın uygulama**

- Sözdizimi: çift süslü parantez. Shopify Liquid: `{{ line_item.title }}`, `{{ line_item.price | money }}` [K-1]; ShippingEasy "variables" ile şablon özelleştirir [K-4].
- Gruplu liste: Sipariş, Müşteri, Teslimat adresi, Kalemler, Kargo, Satıcı/Firma. [A]
- Arama kutusu, her alanın yanında örnek değer. [A]
- Teknik olmayan kullanıcıya yerelleştirilmiş etiket gösterilir; sözdizimi yalnızca ipucu olarak. [A]

**Önerilen Entegrasyonik alan grupları** (taslak, backend modeliyle doğrulanmalı)

| Grup | Örnek alanlar (sözdizimi) |
|---|---|
| Sipariş | `{{order.number}}`, `{{order.date}}`, `{{order.channel}}`, `{{order.note}}`, `{{order.total}}` |
| Müşteri / Teslimat | `{{shipping.name}}`, `{{shipping.address}}`, `{{shipping.district}}`, `{{shipping.city}}`, `{{shipping.phone}}` |
| Kargo | `{{cargo.company}}`, `{{cargo.trackingNumber}}`, `{{cargo.barcode}}` |
| Kalemler (tablo içinde) | `{{item.sku}}`, `{{item.name}}`, `{{item.qty}}`, `{{item.barcode}}`, `{{item.price}}` |
| Satıcı | `{{seller.name}}`, `{{seller.logo}}`, `{{seller.address}}` |

| # | Çıkarım | Öncelik |
|---|---|---|
| 3.1 | Gruplu + aranabilir alan paleti | MUST |
| 3.2 | Her alanın yanında örnek değer (hover/alt satır) | MUST |
| 3.3 | Alan bırakılınca tuvalde `{{order.number}}` yerine örnek değer görünür | MUST |
| 3.4 | Sabit, belgelenmiş çift-süslü-parantez sözdizimi; metin içine elle yazılabilir | SHOULD |
| 3.5 | Bilinmeyen alan (yazım hatası) tuvalde kırmızı uyarı | MUST |
| 3.6 | Biçim seçenekleri: para birimi, tarih, büyük/küçük harf (Türkçe i/İ doğru dönüşüm) | SHOULD |
| 3.7 | Filtre/pipe sözdizimi (`| money`) son kullanıcıya açılmaz, arayüz seçeneği olur | COULD |

## 4. Gerçek veriyle canlı önizleme

**Yaygın uygulama** [A, kod örnekleri hariç]

- Tasarım sırasında örnek veri; "gerçek siparişle önizle" için sipariş seçici (son N sipariş, numaraya göre arama).
- Eksik veri durumları: boş alan, çok uzun ad, 30+ kalemli sipariş, yabancı karakter (ğ, ş, ı, İ), uzun adres.
- Rapor tasarımcıları (Stimulsoft/FastReport tarzı) tasarım ve önizleme sekmesini ayrı tutar.

| # | Çıkarım | Öncelik |
|---|---|---|
| 4.1 | Editörde "Önizleme" geçişi + gerçek sipariş seçici (arama destekli) | MUST |
| 4.2 | Hazır "stres verileri": uzun ad, 40 kalem, boş telefon, çok uzun adres | MUST |
| 4.3 | Taşma uyarısı: alan kutusundan taşan metin tuvalde işaretlenir | MUST |
| 4.4 | Çok sayfaya taşan tablo: önizlemede sayfa sayısı ve sayfa gezinme | SHOULD |
| 4.5 | Boş alan davranışı seçeneği: boş bırak / satırı gizle / varsayılan metin | SHOULD |
| 4.6 | Önizleme ile gerçek yazdırma aynı render motorunu kullanır (WYSIWYG güveni) | MUST |
| 4.7 | Önizlemede kağıt dışına taşan öğe uyarısı | SHOULD |

## 5. Kağıt / etiket boyutları

**Yaygın boyutlar** [A, sektör standardı; termal 4x6 = 101,6x152,4 mm yaklaşık 100x150 mm]

| Boyut | Kullanım |
|---|---|
| A4 (210x297 mm) | Fatura, irsaliye, toplama listesi, sipariş fişi |
| A5 (148x210 mm) | Küçük sipariş fişi/irsaliye |
| Letter (8,5x11 in) | ABD; Türkiye için düşük öncelik |
| 100x150 mm (4x6 in) | Standart termal kargo etiketi |
| 100x100 mm | Kare termal etiket |
| 80 mm rulo (sürekli) | Fiş yazıcısı; yükseklik içeriğe göre değişken |
| Özel (G x Y mm) | Kullanıcı tanımlı |

**Teknik noktalar**

- Termal yazıcı çözünürlüğü: 203 dpi (1 nokta ≈ 0,125 mm) ve 300 dpi (≈ 0,085 mm) yaygın [A]. Barkod modül genişliği nokta katı olmalı (bölüm 7).
- Kenar boşluğu: yazıcıların yazdırılamaz bölgesi vardır; A4 ofis yazıcılarında genelde 3-5 mm [A].
- Yön: dikey/yatay; termal etiket yazıcısı sürücüsünün yönü ile şablon yönü uyuşmazlığı en sık yazdırma hatasıdır [A].

| # | Çıkarım | Öncelik |
|---|---|---|
| 5.1 | Ön ayar listesi: A4, A5, 100x150, 100x100, 80 mm rulo, özel | MUST |
| 5.2 | Birim mm; kullanıcıya piksel gösterme | MUST |
| 5.3 | Yön (dikey/yatay) kağıt ayarında, tuvali döndürür | MUST |
| 5.4 | Kenar boşluğu kılavuzu (tuvalde kesikli çizgi), varsayılan 3 mm | SHOULD |
| 5.5 | DPI ayarı (203/300) yalnızca termal boyutlarda; barkod/yazı denetimini etkiler | SHOULD |
| 5.6 | 80 mm rulo: yükseklik "otomatik" modu | COULD |
| 5.7 | Boyut değişince mevcut öğeleri oranla ölçekleme veya sabit bırakma seçimi | SHOULD |

## 6. Izgara / hizalama yardımcıları

**Yaygın uygulama** [A, Canva/Polotno ve etiket tasarımcılarında ortak]

| Özellik | Beklenti |
|---|---|
| Izgara + snap | 1 mm / 5 mm ızgara, aç/kapa |
| Akıllı kılavuzlar | Sürüklerken diğer öğelerin kenar/merkezine yapışma, mor/pembe çizgi |
| Cetvel | Üst ve sol, mm |
| Yakınlaştırma | %25-400, "sığdır", Ctrl+tekerlek |
| Nudge | Ok tuşu 1 birim, Shift+ok 10 birim |
| Çoklu seçim | Shift+tık, sürükleyerek kutu seçimi, Ctrl+A |
| Hizala / dağıt | Sol/orta/sağ, üst/orta/alt, eşit aralık |
| Gruplama | Ctrl+G |

| # | Çıkarım | Öncelik |
|---|---|---|
| 6.1 | Snap-to-grid (varsayılan açık) ve akıllı kılavuzlar | MUST |
| 6.2 | Ok tuşuyla nudge, Shift+ok büyük adım | MUST |
| 6.3 | Çoklu seçim + hizala/dağıt araç çubuğu | MUST |
| 6.4 | Yakınlaştırma + "sığdır" + kaydırma (boşluk+sürükle) | MUST |
| 6.5 | Cetvel (mm) | SHOULD |
| 6.6 | Gruplama | COULD |
| 6.7 | Kullanıcı tanımlı kılavuz çizgileri | COULD |

## 7. Barkod / QR

**Kaynaklı teknik bilgi**

- GS1-128 için minimum X-boyutu 0,495 mm, önerilen 0,495 mm, maksimum 1,016 mm; sessiz bölge her iki yanda en az 10 X [K-6]. (Bu GS1-128 genel dağıtım kuralıdır; kargo firması barkodları için firmanın kendi şartnamesi önceliklidir.)
- Genel öneri: X-boyutu 10 mil (0,254 mm) altına düşmemeli [K-7]; 203 dpi'da bu yaklaşık 2 nokta, güvenilir okuma için pratikte 3-4 nokta kullanılır [A].

**Pratik kurallar** [A]

| Kural | Ayrıntı |
|---|---|
| Türler | Code128 (kargo/sipariş no), EAN-13 (ürün), QR (takip bağlantısı) — çekirdek set |
| Modül genişliği | Nokta tam katı olmalı (203 dpi: 3 nokta ≈ 0,375 mm, 4 nokta ≈ 0,5 mm); kesirli piksel ölçekleme barkodu bozar |
| Yükseklik | Code128 için genelde en az 10-15 mm veya genişliğin %15'i |
| İnsan-okunur metin | Aç/kapa, barkodun altında; EAN-13'te zorunlu sayılır |
| Veri kaynağı | Sabit metin değil, değişkene bağlı (`{{cargo.barcode}}`) |
| Doğrulama | EAN-13 kontrol hanesi; geçersiz veri uyarısı |
| Boyutlandırma | Barkodun yeniden boyutlandırılması modül katına yapışır |

| # | Çıkarım | Öncelik |
|---|---|---|
| 7.1 | Code128, EAN-13, QR bileşenleri; veri alanı değişkene bağlanır | MUST |
| 7.2 | İnsan-okunur metin aç/kapa | MUST |
| 7.3 | Modül genişliği DPI'ya göre tam nokta katına yuvarlanır; sessiz bölge korunur | MUST |
| 7.4 | Barkod çok küçükse (< ~0,25 mm modül) tuvalde uyarı | SHOULD |
| 7.5 | Geçersiz veri (EAN uzunluğu/kontrol hanesi) için önizleme hatası | SHOULD |
| 7.6 | QR hata düzeltme seviyesi seçimi | COULD |
| 7.7 | Code39, DataMatrix, GS1-128 | COULD |

## 8. Tablo / tekrarlayan satırlar

**Yaygın uygulama**

- Shopify örneği: kalemler için döngü ile tablo; `{{ line_item.quantity }}`, `{{ line_item.title }}` [K-1].
- Rapor tasarımcılarında (Stimulsoft/FastReport tarzı) "band" modeli: başlık, detay (tekrar), altbilgi, toplam bandı [A].
- Sayfa taşması: A4'te başlığın her sayfada tekrarı, toplamların son sayfada olması [A].
- 100x150 etiketlerde kalem listesi genelde tek sayfaya sığmak zorundadır: yazı küçültme veya "+N kalem daha" [A].

| # | Çıkarım | Öncelik |
|---|---|---|
| 8.1 | Kalem tablosu bileşeni: sütun seç (SKU, ad, adet, fiyat, barkod), genişlik ayarla | MUST |
| 8.2 | Sütun başlığı özelleştirme ve yerelleştirme | SHOULD |
| 8.3 | A4/A5'te sayfa bölünmesi + başlık satırı tekrarı | MUST |
| 8.4 | Toplam/ara toplam satırı yalnızca son sayfada | SHOULD |
| 8.5 | Etiketlerde taşma stratejisi: yazı küçült / "+N kalem" / ek sayfa (seçilebilir) | MUST |
| 8.6 | Satır yüksekliği otomatik (uzun ürün adı iki satıra sarar), satır ortasında sayfa bölme yok | SHOULD |
| 8.7 | Zebra çizgi, sütun hizalama (sayılar sağa) | COULD |
| 8.8 | Kalem görseli sütunu | COULD |

## 9. Sürüm geçmişi / geri al-yinele / taslak-yayınla

**Yaygın uygulama** [A]

- Tuval içinde sınırsız Geri Al/Yinele (komut yığını) — editör beklentisidir.
- Kayıtlı sürüm listesi (tarih, kim); "bu sürüme dön".
- Taslak ve yayınlanmış ayrımı: yayındaki şablon, taslak kaydedilirken bozulmaz; böylece canlı yazdırma kesintisiz.
- Belge motorları (PDFMonkey, Carbone) şablon sürümlemesi sunar [A].

| # | Çıkarım | Öncelik |
|---|---|---|
| 9.1 | Geri al/yinele (en az 50 adım), Ctrl+Z / Ctrl+Y | MUST |
| 9.2 | Kaydedilmemiş değişiklik göstergesi + sayfadan çıkarken uyarı | MUST |
| 9.3 | Taslak / Yayında durumu; yazdırma yalnızca yayınlanmış sürümü kullanır | SHOULD |
| 9.4 | Sürüm geçmişi (son 20 sürüm) + geri yükle | SHOULD |
| 9.5 | Otomatik taslak kaydı (arka planda, debounce) | SHOULD |
| 9.6 | Sürüm karşılaştırma (görsel fark) | COULD |
| 9.7 | Eş zamanlı düzenleme çakışması: son-yazan-kazanır yerine sürüm numarası kontrolü | SHOULD |

## 10. Toplu yazdırma

**Yaygın uygulama** [A]

| Yetenek | Açıklama |
|---|---|
| Çoklu sipariş seçimi → tek PDF | Her sipariş bir sayfa/etiket; sipariş sırası korunur |
| Sayfa başına etiket | A4 üzerinde 2x4 gibi çok etiketli yaprak (etiket tabakası); satır/sütun ve boşluk ayarı |
| Başlangıç hücresi | Yarı kullanılmış etiket tabakasını yeniden kullanma |
| Yazdırma kuyruğu | İş durumu (bekliyor/tamam/hata), yeniden dene |
| PDF birleştirme | Kargo firması PDF etiketi + kendi sipariş fişi aynı dosyada |
| Termal doğrudan yazdırma | ZPL/EPL (Zebra), TSPL (birçok ucuz termal), tarayıcıdan sessiz yazdırma veya yerel köprü uygulaması |
| Sıralama | Toplama listesine göre sıralama (raf/SKU) |

Not: Tarayıcı `window.print()` sürücüye bağlıdır; boyut ve ölçek ayarı kullanıcıya bırakılır, bu en sık destek talebi kaynağıdır [A]. PDF üretip sayfa boyutunu PDF içine gömmek bu sorunu azaltır [A].

| # | Çıkarım | Öncelik |
|---|---|---|
| 10.1 | Çoklu sipariş → tek PDF (sayfa boyutu PDF'e gömülü) | MUST |
| 10.2 | Yazdırmadan önce önizleme ve sipariş sayısı/sayfa sayısı özeti | MUST |
| 10.3 | Yazdırıldı işareti ve "tekrar yazdır" koruması (çift etiket hatasını önler) | SHOULD |
| 10.4 | Etiket tabakası düzeni (satır x sütun, başlangıç hücresi) | COULD |
| 10.5 | Kargo firması PDF'ini ve kendi fişi birleştirme | SHOULD |
| 10.6 | ZPL çıktısı / doğrudan termal yazdırma | COULD (PDF 100x150 öncelikli) |
| 10.7 | Büyük toplu işlerde arka plan kuyruğu ve ilerleme | SHOULD |

## 11. Türkiye'ye özgü noktalar

**Kaynaklı**

- Türk entegratörler (BirFatura, Ideasoft vb.) kargo barkodunu ayrı veya fatura üzerine yazdırma, kargo firması API kurulumu ve "kargo fişi yazdırma" sunar [K-8].
- Trendyol; Yurtiçi, Aras, MNG, Sürat gibi onaylı taşıyıcılar ve Trendyol Ekspres ile çalışır; Sürat Kargo ve Kolay Gelsin için "Trendyol Ortak Barkod" kullanılır [K-8].
- Aramada kargo barkodu yazdırmanın hukuki "zorunluluğu" doğrulanamadı; aşağıdaki zorunluluk iddiası pazaryeri kurallarına dayalı ve **[A]** işaretlidir.

**Kaynaksız / doğrulanması gerekenler**

| Konu | Bulgu | Durum |
|---|---|---|
| Pazaryeri kargo etiketi | Pazaryeri anlaşmalı kargo kullanılıyorsa pazaryerinin/kargo firmasının ürettiği barkod (ve kampanya/takip kodu) olduğu gibi basılmalıdır; satıcı kendi barkodunu üretip yerine koyamaz, kargo firması okuyamaz. | [A] — her pazaryeri API belgesinden doğrula |
| Etiket verisi | Barkod değeri API'den (kargo takip/barkod alanı) gelir; şablonda alan olarak bağlanır, yeniden hesaplanmaz | [A] |
| e-Fatura / e-Arşiv | GİB şemasına uygun belge entegratörden PDF/XML gelir; **şablon tasarımcısı bunları üretmez**. Fatura PDF'ine dokunulmaz | [A] (proje brifiyle tutarlı) |
| e-İrsaliye | Aynı şekilde entegratör üretir; tasarımcıda yalnızca "irsaliye taslağı / sevk fişi" (hukuki değeri olmayan iç belge) | [A] |
| GİB zorunlu alan örnekleri | Satıcı unvanı, VKN/TCKN, vergi dairesi, alıcı bilgileri, ETTN (UUID), belge no, tarih, kalemler, KDV, toplam | [A] — yalnızca entegratör PDF'ini doğrulamak için; bu kapsamda üretilmez |
| Yazdırılabilir taslak uyarısı | Taslak/iç belgelere "Mali değeri yoktur" ibaresi eklenmeli | [A] |
| Karakter seti | Türkçe karakterler (ğüşıöçİ) yazı tipinde tam desteklenmeli; büyük harfe çevirmede i→İ | [A] |
| Adres | İl/ilçe/mahalle alanları ayrı; pazaryerleri adresi parçalı verir | [A] |

| # | Çıkarım | Öncelik |
|---|---|---|
| 11.1 | Kargo firması barkodu/takip no alanı etiket şablonunda ZORUNLU alan; yoksa şablon kaydedilirken uyarı | MUST |
| 11.2 | Pazaryeri kargo PDF'i varsa onu olduğu gibi yazdır, yeniden tasarlama; yalnızca ek şablonlar kendi tasarımımız | MUST |
| 11.3 | Fatura/e-Arşiv için tasarımcı yok; entegratör PDF'ini eklemek/yazdırmak yeterli | MUST |
| 11.4 | İrsaliye taslağı ve sipariş fişine "mali belge değildir" varsayılan notu | SHOULD |
| 11.5 | Türkçe karakter ve Türkçe büyük harf kuralı testleri | MUST |
| 11.6 | Kargo firmasına göre hazır etiket düzenleri (Yurtiçi, Aras, MNG, Sürat, PTT) | SHOULD |
| 11.7 | Kurye/kapıda ödeme tutarı alanı etikette (kargo firmalarında yaygın) | COULD [A] |

## 12. Bilgi mimarisi önerisi

**Akış:** Şablon listesi (galeri) → Editör → Önizleme → Yazdır.

```
+-------------------------------------------------------------+
| Üst çubuk: Şablon adı | Kağıt: 100x150 | Geri/İleri | Kaydet |
|            Önizleme | Yayınla | Zoom %                       |
+-----------+----------------------------------+--------------+
| SOL       | ORTA: tuval                      | SAĞ          |
| Bileşenler| cetvel + kılavuzlar              | Özellikler   |
| Alanlar   | kağıt + kenar boşluğu            | (konum, yazı |
| (ara/grup)| seçili öğe tutamaçları           |  barkod, vb.)|
|           |                                  | Katmanlar    |
+-----------+----------------------------------+--------------+
| Alt: örnek sipariş seçici | uyarılar (taşma, eksik alan)    |
+-------------------------------------------------------------+
```

| Ekran | Ana işlevler |
|---|---|
| Şablon listesi | Galeri/liste, belge türü filtresi, varsayılan rozeti, kopyala, sil, yeni |
| Editör | Üç panel; sol sekmeler: Bileşenler / Alanlar |
| Önizleme | Gerçek sipariş seç, sayfa gezin, "Yazdır" ve "PDF indir" |
| Yazdır | Sipariş seçimi, şablon seçimi, adet, özet, kuyruk durumu |

**Klavye kısayolları (önerilen sabit set)**

| Kısayol | İşlev |
|---|---|
| Ctrl+Z / Ctrl+Y (veya Ctrl+Shift+Z) | Geri al / yinele |
| Ctrl+S | Kaydet (taslak) |
| Delete / Backspace | Seçileni sil |
| Ok tuşları | 1 birim taşı (nudge) |
| Shift + ok | 10 birim taşı |
| Ctrl+D | Çoğalt |
| Ctrl+C / Ctrl+V | Kopyala / yapıştır |
| Ctrl+A | Tümünü seç |
| Shift+tık | Çoklu seçim |
| + / - ve Ctrl+tekerlek | Yakınlaştır / uzaklaştır |
| Ctrl+0 | Sığdır |
| Boşluk + sürükle | Tuvali kaydır |
| Esc | Seçimi kaldır / modu iptal |
| Ctrl+G | Gruplama |
| Ctrl+P | Önizlemeden yazdır |

Not: Ok tuşu nudge'ı yalnızca tuval odaktayken geçerli olmalı; metin girişi odaklıyken ok tuşları imleci hareket ettirir [A].

| # | Çıkarım | Öncelik |
|---|---|---|
| 12.1 | Üç panelli editör düzeni (sol alanlar, orta tuval, sağ özellikler) | MUST |
| 12.2 | Yukarıdaki çekirdek kısayol seti ve kısayol yardım penceresi (`?`) | MUST |
| 12.3 | Duyarlı düzen: dar ekranda yan paneller çekmeceye, tuval öncelikli | SHOULD |
| 12.4 | Klavyeyle öğe seçimi (Tab) ve ekran okuyucu etiketleri (a11y) | SHOULD |
| 12.5 | Editör ve yazdırma ekranı aynı belge/render bileşenini kullanır | MUST |

## 13. Kaçınılacak hatalar (anti-pattern)

| Anti-pattern | Neden kötü | Önlem |
|---|---|---|
| Ham HTML/Liquid editörünü tek seçenek yapmak | Teknik olmayan satıcı için çok zor [K-5] | Görsel editör birincil |
| Önizleme ve yazdırmada farklı render | "Ekranda güzel, kağıtta kaymış" | Tek render motoru (bölüm 4.6) |
| Piksel birimi, kullanıcıya DPI sormak | Anlaşılmaz, boyut hataları | mm birimi; DPI yalnızca termalde |
| Barkodu ölçekleyip bulanıklaştırmak | Okunmaz, kargo ret | Modül tam nokta katı, minimum boyut uyarısı |
| Barkodu satıcının yeniden üretmesi | Kargo firması sistemiyle uyuşmaz | API'den gelen barkodu bas |
| Tek örnek veriyle test | Uzun ad / 40 kalem / boş alan sonradan patlar | Stres verisi kümesi |
| Sessiz taşma (metin kesilir, uyarı yok) | Adresin yarısı basılır = iade | Taşma uyarısı |
| Otomatik kaydetmeyi canlıya yansıtmak | Yarım şablon ile 200 etiket basılır | Taslak/yayın ayrımı |
| Varsayılan şablonu silmeye izin vermek | Yazdırma boşa düşer | Silmeyi engelle veya yeni varsayılan seçtir |
| Sistem şablonunu doğrudan düzenletmek | Güncellemede kaybolur, geri dönüş yok | Kopyala-düzenle |
| Yalnızca tarayıcı yazdırma diyaloguna güvenmek | Ölçek/kenar boşluğu sürücüye bağlı | PDF + sayfa boyutu gömme |
| Yazdırıldı durumunu tutmamak | Çift etiket, çift gönderi | Yazdırma geçmişi |
| Her şeyi aynı anda sunmak (tüm bileşenler, tüm formatlar) | Kapsam şişer | Çekirdek 8 bileşen, kalanı COULD |
| e-Fatura şablonunu kendimiz üretmeye kalkmak | GİB şeması, hukuki risk | Entegratör PDF'i |
| Türkçe karakter/harf dönüşümünü ihmal etmek | "ISPARTA" / "İstanbul" bozulur | Locale-aware dönüşüm testleri |

## Entegrasyonik için öncelikli 10 madde

1. **Görsel (sürükle-bırak) editör**, üç panel: sol alanlar/bileşenler, orta tuval, sağ özellikler (12.1, 2.1). MUST
2. **Belge türü ve boyuta göre şablon galerisi**; sistem şablonu salt-okunur, "kopyasını düzenle", belge türü başına tek varsayılan (1.1-1.3). MUST
3. **Gruplu, aranabilir değişken paleti** + her alanda örnek değer; tuvalde örnek veri gösterimi; sözdizimi `{{order.number}}` (3.1-3.3). MUST
4. **Gerçek siparişle canlı önizleme** + stres verisi (uzun ad, 40 kalem, boş alan) + taşma uyarısı; önizleme ve yazdırma tek render motoru (4.1-4.3, 4.6). MUST
5. **Kağıt ön ayarları** A4, A5, 100x150, 100x100, 80 mm, özel; birim mm, yön, 3 mm kenar boşluğu kılavuzu (5.1-5.4). MUST
6. **Etiket güvenliği:** barkod bileşenleri (Code128, EAN-13, QR) değişkene bağlı, insan-okunur metin, modül tam nokta katı, kargo barkodu alanı zorunlu, pazaryeri/kargo PDF'i olduğu gibi basılır (7.1-7.3, 11.1-11.2). MUST
7. **Kalem tablosu** ile sütun seçimi, A4'te başlık tekrarı ve sayfa bölme, etikette taşma stratejisi (8.1, 8.3, 8.5). MUST
8. **Editör temelleri:** snap + akıllı kılavuz, nudge (ok / Shift+ok), çoklu seçim + hizala/dağıt, yakınlaştırma, Geri Al/Yinele, kısayol seti (6.1-6.4, 9.1, 12.2). MUST
9. **Taslak/yayın ayrımı, otomatik taslak kaydı, kaydedilmemiş uyarısı ve son 20 sürüm** (9.2-9.5). SHOULD
10. **Toplu yazdırma:** çoklu sipariş → tek PDF (boyut gömülü), özet ekranı, yazdırıldı işareti; ZPL/doğrudan termal ve etiket tabakası sonraya (10.1-10.3, 10.6). MUST/SHOULD (ZPL: COULD)

Kapsam dışı (bilinçli): e-Fatura/e-Arşiv/e-İrsaliye üretimi — entegratör PDF'i kullanılır (11.3).

## Açık sorular (doğrulama gerekir)

| # | Soru | Neden |
|---|---|---|
| Q1 | Her pazaryerinin (Trendyol, Hepsiburada, N11, Pazarama) etiket/barkod API'si ve çıktı biçimi (PDF mi, ZPL mi, yalnızca barkod değeri mi) | 11.1-11.2 uygulanabilirliği |
| Q2 | Hedef kullanıcıların yazıcı dağılımı (termal 100x150 mi, A4 lazer mi) | 10.6 ve 5.5 önceliği |
| Q3 | Türk rakiplerin (Sentos, İkas, Paraşüt, KolayBi, BizimHesap) şablon editörü kabiliyetleri | Aramada doğrulanamadı; ürün deneme hesabı ile incelenmeli |
| Q4 | Render motoru kararı: tarayıcı tarafı (HTML/SVG → PDF) mi, sunucu tarafı mı | 4.6 ve 10.1 |

## Kaynak URL'leri

| Kod | URL | Kullanım |
|---|---|---|
| K-1 | https://help.shopify.com/en/manual/orders/order-printer/customizing-order-templates | Order Printer: HTML+CSS+Liquid, varsayılan fatura/packing slip, kalem tablosu örneği |
| K-1b | https://help.shopify.com/en/manual/orders/printing-orders/shopify-order-printer/creating-templates | Şablon oluşturma/düzenleme |
| K-2 | https://support.starshipit.com/articles/360000026636-configure-packing-slips | Packing slip yapılandırma |
| K-3 | https://support.starshipit.com/articles/9067623250063-configure-packing-slips-using-the-template-editor | Starshipit şablon editörü |
| K-4 | https://support.shippingeasy.com/hc/articles/4406993309723 | Packing slip şablonlarını değişkenlerle özelleştirme |
| K-5 | https://www.4seller.com/blog/en/article/198-How-To- | ShipStation özel şablonlar: HTML bilgisi gerekir, sürükle-bırak yok (üçüncü taraf blog; ikincil kaynak) |
| K-6 | https://www.gs1uk.org/knowledge-hub/barcodes/how-big-should-a-gs1-128-barcode-used-in-general-distribution-be | GS1-128 boyut/X-boyutu/sessiz bölge |
| K-7 | https://help.acctivate.com/articles/26666/ | Barkod yazdırma pratikleri, 203/300 dpi, 10 mil önerisi |
| K-8 | https://birfatura.com/trendyol-entegrasyonu/ ve https://www.ideasoft.com.tr/yardim/trendyol-entegrasyonu/ | Türk entegratörlerde kargo barkodu/fişi yazdırma, Trendyol taşıyıcıları ve Ortak Barkod |

Kaynaksız ([A]) bölümler: PDFMonkey/Carbone/Docmosis, ZebraDesigner/BarTender/NiceLabel/DYMO/P-touch, Canva/Polotno, Stimulsoft/FastReport, Sentos/İkas/Paraşüt/KolayBi ayrıntıları ve tüm GİB alan listesi; uygulamadan önce ilgili resmi dokümanla doğrulanmalıdır.

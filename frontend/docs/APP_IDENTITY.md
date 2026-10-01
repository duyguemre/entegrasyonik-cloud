# Entegrasyonik uygulama kimliği (web uygulaması)

Kapsam: `frontend/` (web uygulaması + Electron kabuğu; backoffice aynı paketi kullanır ama kendi dilini `BO_UI_PATTERNS.md`'de
taşır). Kaynak: ürün sahibinin bu projedeki tüm geri bildirimleri — FE_FEEDBACK_R2 (39 madde), FE_FEEDBACK_R3 (18 madde),
SITE_FEEDBACK_R2/R3, `docs/adr/USER_DECISIONS.md` (K07, K11–K17, K39, K43–K49), site marka kılavuzu `site/docs/elev/BRAND.md`.
Bu belge yeni karar üretmez; verilmiş kararları **tek bakışta uygulanabilir** hale getirir. Çelişki olursa USER_DECISIONS esastır.

Uygulayıcılar için sıra: bu belge (ne hissettirmeli) → `FR2_PATTERNS.md` (hangi bileşen/token) → `packages/ui` (tek kaynak, K11).
Özerklik (K48): bu kimliğe uymayan **görsel / tutarlılık / a11y / metin** sapması bariz düzeltmedir; akışı, davranışı veya bilgi
mimarisini değiştiren her şey `PROPOSALS_PENDING.md`'ye yazılır.

## 0. Tek cümle

> **Sakin bir operasyon masası:** çok kanallı bir işletmenin bütün günü tek ekranda, az renkle, net hiyerarşiyle ve
> "şimdi ne yapmalıyım"ı önce söyleyerek akar.

Kullanıcının kelimeleriyle çıta: **premium, seçkin, sakin, naif, kullanıcı dostu, anlaşılır, site ile tutarlı; tek merkezden
tasarım, tek merkezden hareket** (FR2 başlığı, FR3 başlığı, K14, K49).

---

## 1. Premium ve seçkin — az ama kusursuz

Premium burada süs değil **özen**dir: hizası kayık tek bir piksel, iki farklı düğme biçimi, yarım görünen bir kolon
"amatör" okunur (FR2-1 breadcrumb, FR3-3). Seçkinlik = az öğe, her öğe bilinçli.

| Yap | Yapma |
|---|---|
| Ekranda tek birincil eylem (primary dolgu tek yer); ikinciller sessiz (`secondary`/`ghost`) | Aynı satırda iki dolgu düğme; "Kaydet" bir ekranda mavi, diğerinde yeşil |
| Kaydet/sil/yenile/filtre her ekranda aynı yer, aynı biçim (`EkButton intent`, `EkPageBar refreshable`, `EkFilterPanel`) | Ekrana özel yenile düğmesi, kendi renginde sil düğmesi, filtre paneline özel zemin |
| Yüzey hiyerarşisi tokenla: `surface` → `surface-muted` → `surface-raised`; kart ayrımı ince kenarlık + hafif ton | Kalın gölge, renkli kart zemini, gradyan dolgu |
| Hizalar 4px ızgarada; alan yüksekliği tek (`--ek-control-h-field` 36px), alan ile düğme aynı hizada | Ekrana özel `height`, `min-height`, `style="…px"` |
| Boş / yükleniyor / hata üç durumu her ekranda tasarlı (`EkEmptyState`, `EkSkeleton`, `EkProblemState`) | Boş tablo + "No data", ham API hatası, sıçrayan spinner |

Ekran örneği: **Ürün listesi** — sağ üstte tek "Yeni ürün" (primary), başlık satırının en sağında yenile, filtre paneli
kompakt başlıkla; satır sonunda sessiz satır eylemleri (`EkRowActions`).

## 2. Sakin — renk ve hareket ekonomisi

Uygulama gün boyu açık kalır; dikkat **yalnız iş gerektiğinde** çekilir. Renk anlam taşır, süs taşımaz.

| Yap | Yapma |
|---|---|
| Renk yalnız üç işte: aksiyon (marka mavisi), durum (başarı/uyarı/hata/bilgi, `EkStatusChip` tonları), kanal kimliği (K13) | Dekoratif renkli ikon karoları, her bölüme ayrı renk, renkli menü grupları (FR2-2) |
| Bir görünümde en fazla bir "parlayan" öğe (ör. kritik uyarı bandı) | Aynı anda yanıp sönen rozet + renkli banner + nabız animasyonu |
| Hareket yalnız tokenla: `--ek-duration-*` / `--ek-easing-*` (150–300 ms, ease-out / ease-in-out); `prefers-reduced-motion`'da kalkar | Bileşen içinde `transition: all .4s cubic-bezier(…)`; bounce/elastic; sonsuz döngü süsü |
| Aynı türden açılma aynı hızda: filtre paneli, kademeli kategori seviyeleri, katlanır bölüm aynı token (FR3-7) | Biri 200 ms, öteki 350 ms açılan iki panel |
| Hızlı yüklemede yükleyici görünmez (kısa gecikmeli gösterim, FR2-39) | Her istekte yanıp sönen tam ekran yükleyici |

Ekran örneği: **Ürün ekle → kategori seçimi** seviyeleri ile **filtre paneli** aynı `duration-base` / `easing-standard`
ile açılır; reduced-motion'da ikisi de anında.

## 3. Naif — nazik, yumuşak, kendini dayatmayan

"Naif" kullanıcının dilinde **zarif ve nazik**tir: sert kenarlar, bağıran metinler, alarm kırmızısı yok; yine de net.

| Yap | Yapma |
|---|---|
| Yumuşak radius (token), ince kenarlık, bol ama ölçülü boşluk | Keskin köşeli kutu yığını, kalın çerçeve, sıkışık hücreler |
| Tehlikeli eylemde kırmızı yalnız onay diyaloğunun son adımında dolgu (`intent="delete" confirm`) | Listede kırmızı dolgu kare sil düğmeleri |
| Bağlantı = sessiz metin eylemi (`.ek-link`, hover'da ince alt çizgi dolar) (FR2-6) | "Mavi + altı çizili" 2000'ler bağlantısı |
| Hata dili: "Ne oldu — ne yapmalı" sade cümle, sakin ton (`EkProblemState`) | "HATA!", "İşlem başarısız oldu" tek başına, destek kodu dışında teknik metin |
| Breadcrumb nötr chip; bulunulan sayfa sessiz vurgulu (K49, FR3-3) | Renkli, kalın, ok yığını breadcrumb |

Ekran örneği: **Ürün sil** — satırda zeminsiz kırmızı glif, tıklanınca onay diyaloğu; dolgu kırmızı yalnız
"Kalıcı olarak sil" düğmesinde.

## 4. Kullanıcı dostu ve anlaşılır — ekran kendini anlatır

Kullanıcı bir ekrana baktığında **ne olduğunu, ne yapacağını ve sırada ne olduğunu** yardım okumadan anlamalı
(FR2-21 "kendini anlatamıyor", FR2-27 "ekranın amacı kendini anlatmalı", FR3-12 "hangi bölüm neyi anlatıyor", FR3-16 "ilk ne yapmalıyım").

| Yap | Yapma |
|---|---|
| Aksiyon önce: panoda "şimdi yapılacaklar" en üstte, bilgi sonra (FR3-16) | Eşit ağırlıkta KPI ızgarası, aksiyon en altta |
| Detay diyaloglarında bölüm başlığı + kart ayrımı; öne çıkan kutu (tutar, durum) hafif farklı zeminde (FR3-12) | Başlıksız alan yığını, her şey aynı ağırlıkta |
| Durum tek bakışta: kanal başına ikon + renk + metin (renk tek başına anlam taşımaz) (FR2-21, FR3-11) | Renkli noktalar dizisi, anlamı yalnız ipucunda |
| Her alanın etiketi kalıcı; placeholder yalnız örnek biçim (FR2_PATTERNS §1) | Etiketsiz alan, etiket olarak placeholder |
| "Sayfa hakkında" (?) her ekranda aynı yerde, kısa ve görevle başlayan metin (FR2-16) | Ekranı tekrar anlatan uzun paragraf |
| Favori / kısayol gibi kişiselleştirme görünür bir yerde sonuç verir (FR3-2) | İşaretlenen ama hiçbir yerde görünmeyen favori |

Ekran örneği: **Sipariş detayı** — üstte kimlik şeridi (sipariş no, kanal rozeti, durum çipi, tutar öne çıkan kutuda),
altında "Ürünler", "Teslimat", "Fatura", "Geçmiş" başlıklı kartlar.

## 5. Site ile tutarlılık — aynı marka, işlevsel ses

Site satış yapar; uygulama iş yaptırır. Ses aynı aileden (kendinden emin, sakin, somut), ekran dili işlevseldir (`BRAND.md` kapsam notu).

| Yap | Yapma |
|---|---|
| Aynı kanal rozeti biçimi (koyu kenarlık + açık zemin, orijinal hex) site ve uygulamada (K13, FR2-15) | Uygulamada dolgu rozet, sitede kenarlıklı rozet |
| Aynı marka mavisi / lacivert / teal rolleri; teal yalnız "canlı/başarılı akış" vurgusu | Uygulamaya özel yeni marka rengi |
| İçerik sekmeleri sitedeki sekme diliyle (alt çizgi gösterge, sakin pasif) (FR3-5) | Hap/dolgu sekme + kalın gölge |
| Yazı: Inter; sayılar `tabular-nums`; başlık ağırlıkları token | Ekranda üçüncü bir font, tabloda orantılı rakam |
| Otopilot adı tek sabitten (`CHAT_PRODUCT`, K39) | Elle yazılmış "Asistan", "AI Bot" |

Ekran örneği: **Ürün listesi kanal rozetleri** ile sitenin anasayfa "Katalog ve kanal aktarımı" rozetleri aynı bileşen
mantığı (`EkChannelBadge`, `--ek-channel-*`).

## 6. Tek merkez — tasarım ve hareket tek kaynaktan

| Yap | Yapma |
|---|---|
| Renk, boşluk, radius, gölge, süre, eğri = `@entegrasyonik/ui` token'ı (K11) | Ekranda hex, `rgba()`, `ms`, `cubic-bezier` (stil/desen mandalları yakalar) |
| Ortak desen = ortak bileşen (`EkListScreen`, `EkDetailSheet`, `EkFilterPanel`, `EkPageBar`) | Uygulamaya kopya bileşen, ekrana özel tablo kabı |
| Yeni ihtiyaç → önce pakete bileşen/varyant, sonra ekran | Ekranda "geçici" CSS yaması |

Ekran örneği: **Fatura listesi** ile **Müşteri listesi** aynı liste kabı, aynı filtre paneli, aynı sayfalama; yalnız kolonlar farklı.

## 7. Kanal kimliği

| Yap | Yapma |
|---|---|
| Kanal = orijinal marka hex'i, koyu kenarlık + açık zemin rozet; metin kontrastı otomatik (K13) | Tahmini/uydurma marka rengi; doğrulanmamışsa nötr rozet |
| Kısa ad dar yerde (tablo hücresi, filtre çipi), uzun ad geniş yerde (başlık, detay) — tek kayıt (FR2-12) | Aynı ekranda bir yerde "TY" bir yerde "Trendyol Pazaryeri" rastgele |
| Kanal seçim listeleri (filtre, kargoya ver) rozetle, aynı biçimde (FR2-13, FR2-14) | Düz metin seçenek + başka yerde renkli nokta |
| Tablo satırı kanal şeridi: ince, sakin, rozetle aynı renk ailesi (FR3-8) | Kalın renk bloğu, satırın tamamını boyayan zemin |

Ekran örneği: **Siparişler** — satır başında ince kanal şeridi, "Kanal" kolonunda kısa ad rozeti; **Sipariş detayı** başlığında uzun ad.

## 8. Dil ve terminoloji

| Konu | Kural (uygulama) |
|---|---|
| Entegrasyonik kendini tanımlarken | **platform** (K16). "Yazılım" yalnız kullanıcının kendi ERP/muhasebe yazılımı için |
| Hitap | Kullanıcıya **siz** ("Kanallarınızı bağlayın"). Site kuralı K45 uygulamada şöyle uyarlanır: **"müşteri" yalnız işletmenin alıcısı** (Müşteriler ekranı, sipariş müşterisi) için kullanılır; kullanıcının kendisine veya işletmesine asla "müşteri" denmez ("müşteri numaranız" değil "hesap numaranız") |
| Ürün adı | **Otopilot** (K39), tek sabitten; "asistan/bot" yok |
| Tutarlı terimler | Durum (statü değil) · Parola (şifre değil; P07) · Sipariş no / Fatura no (Id değil) · Kanal (platform yalnız Entegrasyonik için; eski "Platform" kolon adları zamanla "Kanal") · Destek talebi (bilet/kayıt değil; P06) · API (Api değil) · Kaydet / Vazgeç / Sil (OK/İptal karışımı yok) |
| Büyük harf | Başlık ve düğmede cümle düzeni ("Yeni ürün", "Ayarları kaydet"); kısaltmalar büyük (API, ERP, KDV) |
| Teknik ayrıntı | Kullanıcı ekranında protokol/şema/kod adı yok; ham kod gerekiyorsa ikincil satırda, okunur karşılığın altında (P09) |
| Sayı ve para | Tek biçim `₺1.048,80` (`formatMoney`, P01); tarih `gg.aa.yyyy`, saat ipucunda; boş değer "—" |

Ekran örneği: **Destek** — menü, başlık ve düğme aynı terimi kullanır: "Destek talepleri" · "Yeni talep".

## 9. Yoğun veri okunurluğu

Tablolar uygulamanın kalbidir; okunurluk = hız.

| Yap | Yapma |
|---|---|
| Tek tipografi ailesi ve boyu hücrelerde; sayılar `tabular-nums`, sağa hizalı; para ve adet aynı biçim (FR3-9) | Bir kolon monospace, öteki küçük gri, öteki kalın |
| Birincil kolon (ad/no) güçlü, ikincil bilgi alt satırda `content-muted` | Her hücre aynı ağırlıkta, ikincil bilgi ayrı kolonda |
| Uzun metin tek satır + kesme + ipucu; 1440'ta yatay kaydırma yok (P04) | Yarım görünen son kolon, satır yüksekliğini patlatan metin |
| Tarih kolonu olan listede tarih aralığı filtresi (FR3-10) | Tarihe göre sıralanan ama filtrelenemeyen liste |
| Yapışık başlık ve satır eylemleri; zebra yok, ince satır ayracı, hover tonu | Kalın ızgara çizgileri, renkli zebra |
| Durum çipleri aynı genişlik ailesi, ikon + metin | Serbest renkli serbest metin |

Ekran örneği: **Finans → İşlemler** — tutar kolonu sağa hizalı `tabular-nums`, tarih aralığı filtresi, işlem türü çipi.

---

## 10. Denetim kontrol listesi (her ekran, light + dark, 1440 + 390)

1. Tek birincil eylem mi? Kaydet/sil/yenile standart yerde mi? (§1)
2. Token dışı renk/süre/eğri var mı? Açılma hızları tutarlı mı? (§2, §6)
3. Bölümler başlıklı mı, ilk yapılacak iş görünüyor mu? Boş/yükleniyor/hata tasarlı mı? (§4)
4. Kanal rozeti, kısa/uzun ad doğru mu? (§7)
5. Terimler §8 tablosuyla uyumlu mu? Kullanıcıya "müşteri" denmiş mi?
6. Tablo tipografisi tek mi, sayılar hizalı mı, 1440'ta taşma var mı? (§9)
7. Koyu temada kontrast AA (axe 0 ihlal), odak halkası görünür mü?
8. 390'da kullanılabilir mi (yalnız "sığıyor" değil)?

Denetim sonuçları: `docs/fe-r3d-review/README.md`.

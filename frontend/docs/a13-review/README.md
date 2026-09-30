# A13 — Müşteri kartı premium turu

Kapsam: müşteri listesi satır/kart görünümü, müşteri detay kartı (yan sayfa), sipariş detayındaki **Alıcı** kartı,
iade detayındaki **Müşteri** kartı. Taban `cloud/ds-v2-a6b` (23e7098), dal `cloud/fe-a13`.
Görüntüler: `before/` · `after/` (`NN-*` tam ekran, `zNN-*` 2× yakın çekim; 1440 ve 390). Araç:
`A13_REVIEW=1 A13_REVIEW_WIDTH=1440|390 A13_REVIEW_OUT=docs/a13-review/<klasör> npx playwright test e2e/specs/a13-review.spec.ts --project=chromium-desktop`.
Linux Chromium ile bulutta alındı — görsel onay yerelde.

## 1. Mevcut hâlin eleştirisi (önce)

| # | Yer | Kusur | Kanıt |
|---|---|---|---|
| E1 | Detay · hata | `getCustomerDetail` 500 dönünce hata nesnesi "müşteri" diye çiziliyor: boş başlık "Müşteri Kartı —", **Pasif** çipi, skor **0 (kırmızı)**, ₺0,00 metrikler, boş form. Hata ≠ boş kayıt (A6b Standart 1) ihlali; kullanıcıyı yanıltıyor. | `before/06-detay-hata-1440.png` |
| E2 | Detay · yükleme | Yan sayfa veri gelene kadar açılmıyor; liste üstünde "Analitik veriler hazırlanıyor" örtüsü dönüyor (A6b Standart 8: ilk yükleme = iskelet). | `before/05-detay-yukleniyor-*.png` |
| E3 | Detay · KVKK | Telefon ve e-posta **düz metin, düzenlenebilir alanda** varsayılan açık; ekran paylaşımı/omuz üstü okuma riski. Liste kolonlarında da tam telefon/e-posta. Pazaryerinin maskelediği e-posta (`isEmailMasked`) gerçekmiş gibi gösteriliyor. | `before/02-detay-1440.png`, `01-liste-*.png` |
| E4 | Detay · hiyerarşi | Dört eşit metrik kartı + ayrı "Sadakat skoru" kutusu + sekmeler + form: her şey aynı ağırlıkta, göz nereye bakacağını bilmiyor. Kart içinde kart (bölüm başlığı + 4 çerçeveli kutu) — site S16'daki sakin tek-çerçeve kart dilinden uzak. | `before/02-detay-1440.png` |
| E5 | Detay · ton | "Net kazanç" yeşil, skor turuncu/kırmızı, iade oranı kırmızı: DS §2.3 "tutar vurgusu ≠ durum rengi" ve A4 "KPI değerleri nötr" kararıyla çelişiyor. Skor backend'de "Basit bir skorlama (Örnek)" — yeni müşteri 0 = kırmızı "risk" gibi okunuyor. | `before/04-detay-yeni-musteri-1440.png` |
| E6 | Detay · boş metrik | Siparişi olmayan müşteride ₺0,00 / %0,0 / "Sipariş yok" — sıfırlar veri gibi görünüyor, boş durum yok. | `before/04-detay-yeni-musteri-*.png` |
| E7 | Detay · başlık | Kimlikte avatar 72px, ad `text-h6` (DS rolü dışında), tür rozeti yalnız kurumsalda, **kanal kökeni yok** (platform logoları en altta soluk), "Kayıt:" etiketi belirsiz. Başlık satırında ad iki kez ("Müşteri Kartı — Ayşe Yılmaz" + profil adı). | `before/02-detay-1440.png` |
| E8 | Detay · adres | Müşterinin adres havuzu (`addresses[]`, `isDefaultBilling/Shipping`) hiç gösterilmiyor; fatura/teslimat ayrımı yok. | — |
| E9 | Detay · 390 | Skor kutusu kendi satırında, 4 metrik alt alta tam genişlik kart → ilk ekranda yalnız ad + 2 metrik; başlık iki satıra kırılıyor. | `before/02-detay-390.png` |
| E10 | Liste | Avatar `action-subtle` (mavi) — seçili satır/aksiyon rengiyle karışıyor; tür rozeti yalnız kurumsalda. 390 kartında ŞEHİR "İstanbul / · Kadıköy" iki satıra düşüyor. | `before/01-liste-390.png`, `z01-liste-satir-*.png` |
| E11 | Sipariş · Alıcı | Etiket–değer listesi; ad iki yerde (özet + kart), iletişim açık, **fatura adresi hiç yok** (yalnız ayrı "Teslimat adresi" kartı), kopyalama yok, kurumsal vergi no açık. | `before/z04-*.png`, `z05-*.png` |
| E12 | İade · Müşteri | Skor çipi etiketi `metrics` formülüyle, tonu `insights` ile hesaplanıyor (iki farklı sayı); iade listesi projeksiyonu `metrics/addresses/externalIdentities`'i **çıkardığı** için "Lokasyon" ve metrik satırları gerçekte hiç görünmüyor (ölü kod). | `ClaimService.getClaims` `$project`; `before/z06-*.png` |

## 2. Alternatifler

| | A — `EkInfoCard` satırlarını zenginleştir | **B — ortak müşteri kartı parçaları (seçilen)** | C — detayda iki kolon (sol yapışık profil rayı + sağ sekmeler) |
|---|---|---|---|
| Fikir | Mevcut etiket–değer satırlarına maske + kopya ekle, başka değişiklik yok | `customer/` altında tek kaynak: `customerCard.ts` (saf maske/metrik/adres mantığı) + `CustomerAvatar`, `CustomerIdentity`, `CustomerContactList`, `CustomerMetrics`, `CustomerAddresses`; detay, sipariş ve iade aynı parçaları farklı yoğunlukta kullanır | 720px yan sayfada 280px profil rayı + 440px içerik |
| Artı | En küçük fark | Üç yüzeyde aynı dil (avatar, rozet, kanal, maske, kopya); KVKK kuralı tek yerde test edilir; ds'ye dokunmaz | Masaüstünde profil hep görünür |
| Eksi | Başlık/avatar/kanal/adres ayrımı yok; "premium" his gelmez | Daha fazla dosya | 720px'te iki kolon sıkışık (metrikler 2×2'ye düşer, tablolar yatay kayar); 390'da zaten tek kolon — iki ayrı düzen bakımı |
| Karar | ✗ | ✓ | ✗ (yan sayfa genişliği yetmiyor) |

**Ek kararlar**

- **Maskeleme (KVKK):** varsayılan maskeli — telefon `+90 (555) ••• •• 33`, e-posta `ay•••@alan.adi`, vergi/TC no son 3 hane, açık adres
  satırı gizli (il/ilçe görünür). Kart başlığında tek **"Kişisel verileri göster"** anahtarı (`aria-pressed`); kayıt değişince yeniden
  maskelenir. Backend'de ayrı bir "PII görüntüleme" izni YOK — uydurulmadı; anahtar tüm kullanıcılara açık, bileşen `can-reveal` ile
  kapatılabilir (izin gelirse tek bağlama noktası). Kopyala eylemi bilinçli eylemdir: tam değeri panoya yazar, toast ile bildirir.
  Pazaryerinin maskelediği (`isEmailMasked`/`isPhoneMasked`) ve anonimleştirilmiş (`[anonymized]`) değerler "Pazaryeri gizledi" /
  "Anonimleştirildi" olarak gösterilir; kopya/göster yok.
- **Metrikler:** yalnız `updateOrderMetrics`/`updateClaimMetrics` alanları (`totalOrderCount`, `totalSpent`, `lastOrderDate`,
  `totalClaimCount`, `totalReturnAmount`) + backend'in hesapladığı `returnRate`. "Sadakat skoru" başlıktan kaldırıldı (örnek formül,
  istenen dörtlüde yok, 0 = kırmızı yanıltıcı). Değerler nötr; iade oranı yalnız eşik üstünde durum çipiyle (renk + metin).
  Metrik yoksa (iade listesi projeksiyonu) şerit hiç çizilmez; sipariş yoksa zarif boş durum.
- **Eylemler:** başlıkta ikincil **Düzenle** (form yalnız düzenlemede açılır — form açık alanları maskeyi deliyordu) + `⋯` →
  "Kişisel verileri anonimleştir" (tehlikeli, en sonda, onay; yalnız yönetici).
- **Durumlar:** yan sayfa hemen açılır → iskelet; hata → `EkProblemState` + Tekrar dene; boş metrik → açıklayıcı boş metin.

## 3. İterasyonlar (SONRA)

| Tur | Gözle bulunan | Düzeltme |
|---|---|---|
| 1 | İletişim satırında değer/Platform no hane hane kırılıyor; kopya düğmeleri hizasız (EkActionButton kökü parça → kapsamlı sınıf düşüyor); "Göster" belirsiz; 390'da başlık "Müşteri / kartı" iki satır | 3 kolon ızgara (etiket · değer · kopya), değer tek satır + üç nokta; platform kimlikleri ayrı grup (kanal noktası etiket); kopya sarmalayıcıda; "Kişisel verileri göster/gizle"; dar ekranda Düzenle yalnız ikon |
| 2 | Satır ayraçları kolon boşluğunda kesiliyor; detayda adresler dar kolonda üst üste; iki kart yan yana 720px'te sıkışık | boşluk hücre dolgusuna taşındı; İletişim ve Adresler tam genişlik tek kolon, adresler kendi içinde 2 kolon (kap sorgusu) |
| 3 | Durum ekranları (hata / yeni müşteri / kurumsal / 390 sipariş) ve liste satırı yakın çekimleri | kusur yok — maskeli liste, nötr avatar, fatura=teslimat "Fatura adresiyle aynı", boş metrik durumu |

Dosyalar: `after/01…08-*-{1440,390}.png`, yakın çekim `after/z01…z06-*`. E1–E12'nin tümü kapandı (E12: tek formüllü skor
kaldırıldı; metrik/adres blokları projeksiyonda veri gelirse kendiliğinden çizilir).

## 4. Testler
- Yeni vitest `tests/customer-card.test.ts` (21): maskeleme, göster/kopya, pazaryeri/anonim gizleme, boş metrik (uydurma 0 yok), adres ayrımı, statik sözleşme.
- Yeni Playwright `customers.spec.ts` › A13 (2): maskeli açılış + göster anahtarı `aria-pressed` + kopya + axe; hata → EkProblemState.
- Mevcut spec'ler değişmedi (customers/orders/claims/tab-overlays 62/62). Bilinçli davranış değişiklikleri: kart kimliği "Müşteri kartı" (spec filtresi büyük/küçük harf duyarsız), listede iletişim maskeli, detay hemen açılıp iskelet gösterir.

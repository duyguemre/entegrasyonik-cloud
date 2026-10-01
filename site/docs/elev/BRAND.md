# Entegrasyonik marka kimliği kılavuzu (site)

Kapsam: tanıtım sitesi (`site/`). Uygulama ve backoffice aynı sesi paylaşır ama ekran dili işlevseldir.
Kodda karşılığı: `src/data/brand.ts` (slogan, mesaj sütunları, yasaklı terim sözlüğü) ve `tests/brand-voice.test.ts`
(derlenmiş sayfalarda yasaklı terim yok). Görsel tokenlar: `src/styles/site-tokens.css` (`--site-*`).

## 1. Biz kimiz (tek paragraf)

Entegrasyonik, birden fazla kanalda satış yapan işletmelerin operasyonunu tek yerden yöneten **platformdur** (K16).
Pazaryerleri, e-ticaret sitesi ve ERP aynı merkezde buluşur; stok her kanalda aynı kalır, siparişler tek akışta ilerler.
**Otopilot** (K39) operasyonu izler, sorunları fark eder, çözümü hazırlar ve onayınızla uygular.

**Slogan:** _Çok kanal. Tek kontrol._
**Vaat cümlesi:** Satışınız çok kanallı, kontrolünüz tek merkezde.

## 2. Mesaj sütunları

Her bölüm, her başlık bu dört sütundan **yalnız birine** hizmet eder. "Tek merkez" fikri yalnızca hero ve kapanışta
ana vaat olarak söylenir; diğer bölümler onun **sonucunu** anlatır.

| Sütun | Ziyaretçinin derdi | Bizim cevabımız | Kanıt (kayıttan) |
|---|---|---|---|
| **Kontrol** | "Her kanalın paneli ayrı, neyin nerede olduğunu bilmiyorum." | Tüm kanallarınız tek ekranda; ürün, stok, sipariş, iade, mesaj. | `integrations.ts` (canlı kanallar), `capabilities.ts` |
| **Doğruluk** | "Aynı ürünü iki kanalda sattım, iptal ettim, puanım düştü." | Satış bir kanalda olur, stok her kanalda aynı anda güncellenir; aşırı satışa karşı rezervasyon. | `stock-reservation` iddiası |
| **Zaman** | "Ekibim gün boyu panel panel dolaşıyor." | Tekrarlayan takip işlerini Otopilot üstlenir; ekibiniz satışa odaklanır. | `agent-claims.ts` |
| **Güven** | "Verim, anahtarlarım, ekibimin yetkisi güvende mi?" | Verileriniz yalnızca size ait, izole ve şifreli ortamda; her kritik adım onayınızla. | `security-principles.ts`, K45 |

## 3. Ses tonu

**Kendinden emin, sakin, somut.** Bir operasyon müdürünün güvendiği meslektaşı gibi: abartmaz, laf kalabalığı yapmaz,
ne olacağını söyler.

| Yap | Yapma |
|---|---|
| Ziyaretçiye **siz / işletmeniz / ekibiniz** (K45) | "müşteri", "kullanıcı", "satıcı" diye hitap |
| Şimdiki zaman, etken fiil: "Otopilot fark eder, size sunar." (K43) | "erken erişim", "yakında", "geliştiriyoruz", "örnek görünüm" |
| Fayda: "Stok her kanalda aynı." | Mekanizma: "rezervasyon satır anahtarıyla yapılır", protokol/algoritma/veritabanı adı (K44) |
| Türkçe karşılık: aşırı satış, çok kanallı, ürün çeşidi, şifreli saklama | overselling, omnichannel, SKU, AES-256-GCM, enc:v1, sandbox, mimari, varsayılan red, çerez |
| Kanıtlanabilir sayı: kanal sayısı, deneme süresi | Uydurma müşteri, logo, yorum, "%X verim", "binlerce işletme" |
| Kısa başlık: 3–7 kelime, tek fikir, güçlü fiil | Her başlıkta iki renkli vurgu kelimesi |
| Tek birincil eylem: **Ücretsiz deneyin** / **Demo talep edin** | Aynı kartta üç eylem; kapanışta "Giriş yap" |
| Otopilot vaadi `agent-claims.ts` kaydından | Kayıtsız Otopilot cümlesi; "sınırsız/ücretsiz yapay zekâ", kredi/token dili (K46) |
| Platform (K16) | Entegrasyonik için "yazılım" |
| Kanal adları yalnız entegrasyon bağlamında; rakip adı hiç | Rakip/üçüncü taraf ürün adı ile kıyas |

Teknik ayrıntının tek yeri: `/guvenlik` sayfasındaki katlanır **"Ayrıntı"** panelleri (BT/güvenlik sorumlusu okur).
Orada bile mimari/protokol/veritabanı yapısı anlatılmaz; standart adı (ör. şifreleme algoritması) kabul edilir.

## 4. Görsel ilkeler

- **Renk:** lacivert sahne (`--site-stage-*`) güvenin rengi; teal (`--site-accent*`) yalnız vurgu ve "canlı" durum. Kanal
  renkleri yalnız kanal rozetlerinde, orijinal hex, koyu kenarlık + açık zemin (K13). Başka dekoratif renk yok.
- **Vurgu ekonomisi:** iki renkli başlık (gradyan vurgu kelime) yalnız **hero ve kapanış** başlıklarında. Bölüm
  başlıkları tek renk (`--site-text-heading`). Bir ekranda en fazla bir parlayan öğe.
- **Tipografi:** Inter; display 800 ağırlık, sıkı aralık (`--site-font-display-*`). Gövde 16–18 px, satır ≤ 70 karakter.
  Eyebrow: küçük, büyük harf, teal, aralıklı — her sayfada aynı biçim.
- **Ritim:** açık ve koyu bölümler dönüşümlü; iki koyu bölüm arka arkaya gelmez. Bir sayfada en fazla üç koyu sahne
  (hero, bir vitrin, kapanış).
- **Görseller:** gerçek ürün davranışını gösteren sade UI parçaları (soyut dekor değil). Görselde teknik metin
  (kod, önek, algoritma adı) olmaz; kanal adı yerine kanal rozeti.
- **Hareket:** "göster, anlatma" — her animasyon bir hikâye anlatır (S26 sıfır aşırı satış). Görünür ekranda en fazla
  bir döngü; geri kalanı tek seferlik giriş. Yalnız opacity/transform; `prefers-reduced-motion` ve site anahtarı
  her döngüyü durdurur, anlamlı son kare gösterilir.

## 5. Başlık kalıpları (örnek)

| Bölüm | Eski | Yeni (sütun) |
|---|---|---|
| Sorun | Dağınık yönetim zaman ve stok kaybettirir | Her kanal ayrı panel, ayrı stok, ayrı dert (Kontrol) |
| Yetenekler | Çok kanallı satışın tamamı, tek merkezde | Günlük operasyonun tamamı, tek ekranda (Kontrol) |
| Ekosistem | Satış ekosisteminizin tamamı, tek platformda | Kanallarınız bağlanır, iş akışınız değişmez (Kontrol) |
| Nasıl çalışır | Dört adımda tek panele geçin | Dört adımda hazırsınız (Zaman) |
| Güvenlik | Anahtarlarınız ve verileriniz için kurumsal düzeyde güvenlik | Verileriniz yalnızca size ait (Güven) |
| Kapanış | Tüm kanallarınızı tek yerde toplayın, büyümeye odaklanın | (korunur — hero vaadinin tekrarı kapanışın işidir) |

## 6. Kontrol listesi (her yeni metin için)

1. Hangi sütuna hizmet ediyor? (Birden fazlaysa böl.)
2. "siz / işletmeniz" mi? Teknik terim var mı? (`brand-voice.test.ts` yakalar.)
3. Olgusal iddia kayıtta (`src/data/*`) ve kanıtlı mı? Otopilot vaadi `agent-claims.ts`'te mi?
4. Tek birincil eylem mi?
5. Reduced-motion'da anlamlı mı?

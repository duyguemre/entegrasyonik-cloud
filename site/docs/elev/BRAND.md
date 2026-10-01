# Entegrasyonik marka kimliği kılavuzu (site)

> Son güncelleme: S27c (2026-10-01). Kaynak: kullanıcının tüm site geri bildirimleri (SR2, SR3, SR4) ve kararları
> K13, K16, K39, K43–K46, K50 (`docs/adr/USER_DECISIONS.md`). §0 bu geri bildirimlerden damıtılan kimliktir; diğer
> bölümler onun uygulama kurallarıdır.

## 0. Kullanıcının kazandırmak istediği kimlik (geri bildirimlerden damıtılmış)

| Kullanıcının sözü / isteği | Kimlik ilkesi | Sitede karşılığı |
|---|---|---|
| "Site bir pazarlama/tanıtım sitesi; reklam dili" (SR3, K43) | **Hazır ürün, şimdiki zaman.** Kendinden emin, abartısız reklam sesi | "erken erişim / geliştiriyoruz / örnek görünüm" yok; CTA "Ücretsiz deneyin / Demo talep edin" |
| "Nasıl yaptığımızı anlatma; teknik terim yok" (SR3-3, K44) | **Fayda anlatılır, mekanizma saklanır** | Protokol, mimari, veritabanı, algoritma adı yalnız `/guvenlik` "Ayrıntı" panelinde |
| "Ziyaretçiye 'müşteri' deme" (SR3-4, K45) | **Muhatap: siz / işletmeniz / ekibiniz** | Ziyaretçinin kendi müşterisi için "alıcı" (S27c'de tek terim) |
| "Yazılım değil, platform" (SR2-8, K16) | **Kategori: platform** | Öz-tanımda "platform"; "yazılım" yalnız genel arama terimi ve üçüncü taraf ürünlerde |
| "Asistan chatbot kıvamında; agentic" (SR2-2, K39) | **Otopilot = işi yapan, onayınızla uygulayan ajanlar** | Gözle → Öner → Onayla → Uygula → Raporla; "Hız ajanlardan, karar sizden" |
| "Hero karşılama ekranı; bilgiye boğma" (SR4-1, SR3-9) | **Sükûnet:** ilk ekranda tek başlık + tek cümle + tek birincil eylem | Bilgi kutuları hero dışında, açık zeminde |
| "Premium, seçkin; sonradan eklenmiş gibi durmasın" (SR3-7, SR4-7/8/9/10) | **Bütünlük:** her bölüm aynı bileşen dilinden (Eyebrow, kart, boşluk, ikon karosu) | Tek `Eyebrow`, `--site-*` tokenları, tutarlı bölüm boşluğu |
| "Alt çizgili hover yok" (SR4-11) | **Modern, sakin etkileşim** | Hover = renk + ok kayması + yumuşak zemin; alt çizgi hiçbir yerde (test) |
| "Animasyon hikâye anlatsın; anlamsız sayı yok" (SR3-12/13) | **Göster, anlatma;** hareket anlamlı ve kontrol edilebilir | Sıfır aşırı satış hikâyesi, Otopilot anı; anahtar + reduced-motion |
| "Güvenlik bilgisi güvenlik bölümünde" (SR4-5) | **Her iddia bir kez, kendi yerinde** | Şifreleme/izolasyon yalnız Güvenlik bölümünde |
| "Planlarda Otopilot; dahil mi ekstra mı" (SR4-4, K46) | **Şeffaf değer:** her pakette dahil, ayrıca yapay zekâ ücreti yok | Kredi/token/"sınırsız AI" dili yok; plan başına nitel kademe |

Özet cümle: **Entegrasyonik, işini ciddiye alan bir operasyon müdürü gibi konuşur — sakin, net, kendinden emin; ne
yaptığını gösterir, nasıl yaptığını anlatmaz; kararı her zaman size bırakır.**

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
| **Doğruluk** | "Aynı ürünü iki kanalda sattım, iptal ettim, puanım düştü." | Satış hangi kanalda olursa olsun stok tek merkezden düşer ve tüm kanallara iletilir; eşzamanlı siparişte rezervasyon. | `stock-reservation` iddiası |
| **Zaman** | "Ekibim gün boyu panel panel dolaşıyor." | Tekrarlayan takip işlerini Otopilot üstlenir; ekibiniz satışa odaklanır. | `agent-claims.ts` |
| **Güven** | "Verim, anahtarlarım, ekibimin yetkisi güvende mi?" | Verileriniz yalnızca size ait, izole ve şifreli ortamda; her kritik adım onayınızla. | `security-principles.ts`, K45 |

## 3. Ses tonu

**Kendinden emin, sakin, somut.** Bir operasyon müdürünün güvendiği meslektaşı gibi: abartmaz, laf kalabalığı yapmaz,
ne olacağını söyler.

| Yap | Yapma |
|---|---|
| Ziyaretçiye **siz / işletmeniz / ekibiniz** (K45); onların müşterisi = **alıcı** ("alıcı soruları") | "müşteri", "kullanıcı", "satıcı" diye hitap; "müşteri soruları" (S27c'de alıcı'ya döndü; KVKK bağlamındaki "müşteri verisi" hukuki terim olarak kalır) |
| Şimdiki zaman, etken fiil: "Otopilot fark eder, size sunar." (K43) | "erken erişim", "yakında", "geliştiriyoruz", "örnek görünüm" |
| Fayda: "Aynı sipariş birden fazla kez ulaşsa da stoktan bir kez düşülür." | Mekanizma: "rezervasyon satır anahtarıyla yapılır", "dayanıklılık katmanı", "varsayılan olarak reddedilir", "API yanıtları", protokol/algoritma/veritabanı adı (K44) |
| Türkçe karşılık: aşırı satış, çok kanallı, ürün çeşidi, şifreli saklama | overselling, omnichannel, SKU, AES-256-GCM, enc:v1, sandbox, mimari, varsayılan red, çerez |
| Kanıtlanabilir sayı: kanal sayısı, deneme süresi | Uydurma müşteri, logo, yorum, "%X verim", "binlerce işletme" |
| Kısa başlık: 3–7 kelime, tek fikir, güçlü fiil | Her başlıkta iki renkli vurgu kelimesi |
| Tek birincil eylem: **Ücretsiz deneyin** / **Demo talep edin** — bu iki metin sitenin her yerinde AYNI (üst bar, hero, kapanış, footer; S27c) | "Ücretsiz dene", "Ücretsiz denemeyi başlatın" gibi varyantlar; aynı kartta üç eylem; kapanışta "Giriş yap" (giriş yalnız üst bar + footer) |
| Otopilot vaadi `agent-claims.ts` kaydından | Kayıtsız Otopilot cümlesi; "sınırsız/ücretsiz yapay zekâ", kredi/token dili (K46) |
| Platform (K16) | Entegrasyonik için "yazılım" |
| Kanal adları yalnız entegrasyon bağlamında; rakip adı hiç | Rakip/üçüncü taraf ürün adı ile kıyas |

Teknik ayrıntının tek yeri: `/guvenlik` sayfasındaki katlanır **"Ayrıntı"** panelleri (BT/güvenlik sorumlusu okur).
Orada bile mimari/protokol/veritabanı yapısı anlatılmaz; standart adı (ör. şifreleme algoritması) kabul edilir.

## 4. Görsel ilkeler

- **Renk:** lacivert sahne (`--site-stage-*`) güvenin rengi; teal (`--site-accent*`) yalnız vurgu ve "canlı" durum. Kanal
  renkleri yalnız kanal rozetlerinde, orijinal hex, koyu kenarlık + açık zemin (K13). Başka dekoratif renk yok.
- **Vurgu ekonomisi:** iki renkli başlık (gradyan vurgu kelime) yalnız **hero ve kapanış** başlıklarında (ve tek bir koyu vitrin kartında —
  anasayfada bu kart **Otopilot vitrini**dir; S27c'de sorun–çözüm kartındaki degrade kaldırıldı). Bölüm
  başlıkları tek renk (`--site-text-heading`). Bir ekranda en fazla bir parlayan öğe.
- **Tipografi:** Inter; display 800 ağırlık, sıkı aralık (`--site-font-display-*`). Gövde 16–18 px, satır ≤ 70 karakter.
  Eyebrow: küçük, büyük harf, teal, aralıklı — her sayfada aynı biçim (`Eyebrow.astro`, çizgi işareti). Her bölüm başlığı
  bir eyebrow taşır (S27c: entegrasyon kataloğu/kapsam/matris eksikleri tamamlandı). İkonlu eyebrow yalnız Otopilot
  (✦) ve menü öne çıkan kartları içindir — ✦ simgesi yapay zekâ/Otopilot'u çağrıştırır, başka içerikte kullanılmaz.
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

- **Etkileşim:** bağlantılarda alt çizgi yok (hover = renk + ok + yumuşak zemin; `link-hover.test.ts`). Odak halkası
  her zaman görünür.
- **Tekrar ekonomisi:** ana vaat ("tek merkez / tek panel") yalnız hero + kapanışta; diğer bölümler sonucunu anlatır
  ("aynı listede", "bağlı kanallarınıza iletilir"). Bir iddia sayfada bir kez (güvenlik iddiaları yalnız Güvenlik bölümünde).

## 6. Kontrol listesi (her yeni metin için)

1. Hangi sütuna hizmet ediyor? (Birden fazlaysa böl.)
2. "siz / işletmeniz" mi? Teknik terim var mı? (`brand-voice.test.ts` yakalar.)
3. Olgusal iddia kayıtta (`src/data/*`) ve kanıtlı mı? Otopilot vaadi `agent-claims.ts`'te mi?
4. Tek birincil eylem mi?
5. Reduced-motion'da anlamlı mı?
6. CTA metni sözlükte mi ("Ücretsiz deneyin", "Demo talep edin", "Teklif isteyin")? Bölümün eyebrow'u var mı?
7. Ana vaadi (tek merkez) tekrar mı ediyor? Etmesin; sonucunu söylesin.

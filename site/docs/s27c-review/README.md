# S27c inceleme — site geneli kimlik denetimi (SR4 madde 12, K48/K50)

Dal: `cloud/site-s27c` · Taban: `origin/main` + `cloud/site-s27a` (anasayfa) + `cloud/site-s27b` (menü/fiyat/global
stil) birleşimi — çakışmasız. Yalnız `site/` değişti. Kimlik: `site/docs/elev/BRAND.md` §0 (bu turda SR2–SR4'ten damıtıldı).

Görüntüler bulutta Linux Chromium, reduced-motion (anlamlı son kare), tam sayfa; boyut için 1440/1280 %60, 390 %80
ölçekli ve paletli PNG. Görsel onay yerelde (Windows) yapılır.

| Klasör | İçerik |
|---|---|
| `once/` | s27a+s27b birleşimi (bu turun tabanı): 16 sayfa × 1440 · 1280 · 390 |
| `iterasyon/` | 1. tur sonrası 1440 (`*-tur1`) |
| `sonra/` | tur sonu: 16 sayfa × 1440 · 1280 · 390 |

Sayfalar: `/`, `/otopilot`, `/ozellikler`, `/ozellikler/stok-rezervasyonu`, `/entegrasyonlar`, `/entegrasyonlar/trendyol`,
`/fiyatlandirma`, `/guvenlik`, `/sss`, `/destek`, `/iletisim`, `/rehber`, bir rehber yazısı, `/rehber/sozluk`,
`/yasal/kunye`, 404. 320/390/1280/1440'ta yatay taşma yok (ölçüldü).

## Yöntem

Her sayfa üç genişlikte bölüm bölüm okundu + derlenmiş HTML'den görünür metin çıkarılıp sözlük taraması yapıldı
("müşteri", "yazılım", "erken/yakında/test aşaması", CTA varyantları, "tek merkez/tek panel" tekrar sayımı, mekanizma
terimleri). Hover alt çizgisi için s27b'nin `link-hover.test.ts`'i (kaynak + derlenmiş CSS) yeşil — kalıntı yok.

## Denetim bulguları → düzeltmeler

| # | Bulgu | Sütun / ilke | Düzeltme | Tur |
|---|---|---|---|---|
| D1 | Birincil CTA beş farklı metinle: "Ücretsiz dene" (üst bar, hero, nasıl çalışır, footer, CTA bantları, rehber), "Ücretsiz deneyin" (fiyat), "Ücretsiz denemeyi başlatın" (kapanış) | BRAND §3 tek birincil eylem, "siz" hitabı | Her yerde **"Ücretsiz deneyin"** (12 dosya; çerez metnindeki alıntı dahil). 1280'de üst bar sığıyor (görüntü) | 1 |
| D2 | Ziyaretçinin alıcısı için "müşteri": "Müşteri soruları tek yerde", "Satış sonrası ve müşteri", kanal yetenekleri, SSS, Otopilot vaadi ("son müşterilerinizin") | K45 (s27b iç sayfalarda "alıcı"ya geçmişti; kayıtlar geride kalmıştı) | Kayıt düzeyinde **"alıcı"** (`capabilities`, `integrations`, `faq`, `agent-claims`, `seo`, `/ozellikler`). KVKK'daki "müşteri verisi" hukuki terim olarak kaldı | 1 |
| D3 | `/guvenlik` ilke özetlerinde mekanizma/jargon: "AES-256-GCM", "API yanıtları", "sunucuda varsayılan olarak reddedilir", "dayanıklılık katmanından geçer" | K44, BRAND §3 (teknik ayrıntının tek yeri "Ayrıntı") | Özetler fayda diline; algoritma adı **Şifreleme → Ayrıntı** paneline kanıtlı madde olarak taşındı (e2e aynı iddiayı panelde doğruluyor) | 1 |
| D4 | `/ozellikler` "Arka planda ne olur": "Rezervasyon sipariş satırı anahtarıyla yapılır" — BRAND'in "yapma" örneğinin birebir kendisi; stok rezervasyonu sayfasında da "sipariş satırı tekrar işlense" | K44 | "Aynı sipariş size birden fazla kez ulaşsa da stoğunuzdan yalnızca bir kez düşülür" (kanıt aynı) | 1 |
| D5 | SSS "ölçeklenme" ve "pazaryeri kesintisi" yanıtlarında "zaman aşımı, devre kesici, dayanıklılık katmanı" | K44 | Fayda dili; teknik özet yalnız `/guvenlik` Ayrıntı'da (test korur) | 3 |
| D6 | Fiyat Otopilot satırında aynı vaat iki kez: başlık "Yapay zekâ için ayrıca ödeme yok" + çip "Ekstra yapay zekâ ücreti yok" | Tekrar ekonomisi | Çip → "Büyüdükçe daha fazla yetki" (yeni bilgi; kayıttaki K46 kademesi) | 1 |
| D7 | Büyüme planı tanımı "…yöneten satıcılar için" | K45 | "…yöneten işletmeler için" | 1 |
| D8 | Bölüm başlığında eyebrow eksik: `/entegrasyonlar` "Entegrasyon kataloğu", "Kanal bazında kapsam"; kanal sayfası "Yetenek matrisi" | Bütünlük (N6) | `Eyebrow` eklendi (Katalog / Kapsam) | 1 |
| D9 | `/rehber` "Bu rehber nedir?" etiketi ✦ (Otopilot/yapay zekâ simgesi) ile ayrı bir yerel stil | Bütünlük; ✦ yalnız Otopilot | Ortak `Eyebrow` (çizgi işareti); yerel stil silindi | 1 |
| D10 | Anasayfada iki koyu vitrin kartında degrade vurgu başlık (sorun–çözüm + Otopilot) | BRAND §4 vurgu ekonomisi ("tek koyu vitrin kartı") | Sorun–çözüm başlığı tek renk; degrade yalnız hero, Otopilot vitrini, kapanış | 1 |
| D11 | `/iletisim` hero: H1 "Size nasıl yardımcı olabiliriz?" `/destek`'teki H2 ile aynı; lead'in yarısı hukuki not ("form yoktur; kişisel veri toplamaz") | Sükûnet, pazarlama sesi | H1 **"Ekibimizle konuşun"**; lead fayda; gizlilik notları sayfadaki "Form yok / Veri toplanmaz" şeridinde aynen | 1 |
| D12 | Ekosistem vaatleri "Tek doğruluk kaynağı / Tek sipariş akışı / Tek çalışma biçimi" — ana vaadin üç kez tekrarı | A6, tekrar ekonomisi | "Her kanal aynı bilgiyle / Siparişler aynı listede / Ekibiniz aynı düzende çalışır" | 1–2 |
| D13 | Anasayfa gövdesinde "tek yerden / tek merkezden / tek panelden" 12+ kez (menü hariç) | A6: ana vaat yalnız hero + kapanışta | Sorun–çözüm, sipariş hikâyesi (lead + 3. adım), nasıl çalışır 4. adım ("Satışa odaklanın") sonucu anlatır | 2 |
| D14 | `/iletisim` kapanışı "Zaten Entegrasyonik kullanıyor musunuz? → Giriş yap" | BRAND: kapanışta giriş yok | "Kendiniz görün" + **Ücretsiz deneyin** / Destek merkezi; giriş üst bar ve footer'da | 3 |

## İterasyonlar ve eleştiri

1. **Tur 1** (dil + bileşen tutarlılığı, D1–D12): sözlük taramasıyla bulundu; ilk koşuda `pages.test.ts`
   "/guvenlik AES-256-GCM görünür" kırmızı oldu → iddia silinmedi, kanıtlı madde olarak Ayrıntı'ya taşındı.
   Eleştiri: CTA'nın uzaması 1280'de üst barı sıkıştırır mı? → `iterasyon/anasayfa-1440-tur1`, `sonra/*-1280`: sığıyor, taşma yok.
2. **Tur 2** (anlatı ekonomisi, D13): görünür metinde "tek panel/merkez/yer" sayımı (anasayfa 32, çoğu menü) →
   gövde cümleleri sonuç diline. Eleştiri: ilk yazımda ekosistem vaadi ile sorun–çözüm maddesi aynı cümleye düştü
   ("bir kez güncellersiniz") → ekosistem vaadi "tek kaynak / aynı bilgi" açısına alındı. "Tüm bağlı kanallara ulaşır"
   kanal kapsamı farklı olduğu için aşırı iddia → "bağlı kanallarınıza iletilir".
3. **Tur 3** (sayfa kapanışları + SSS): D5, D14. Kalan büyük işler (Nasıl çalışır uzunluğu, iki plan kartı tasarımı)
   tek turda güvenle yapılamayacak kadar büyük → `NEXT_TASKS.md` R1/R2.

Bilinçli bırakılanlar: `/ozellikler/stok-rezervasyonu` H1'indeki "(overselling)" (s27b D5: arama sorgusu) · Ideasoft
"bu sürümde sınırlı" (şeffaflık testi korur) · `/otopilot` "Hemen başlayın" küçük bağlantısı (K43 CTA çifti) ·
uygulama içi form görselindeki "Ücretsiz dene" düğmesi (uygulamanın kendi düğmesi).

## Testler

- `vitest run`: **800 geçti, 2 başarısız, 1 atlandı** — ikisi bilinen bulut ortam hatası (`claims.test.ts`: kök
  `INTEGRATIONS_REGISTRY.md` bulut kopyasında yok; tabanda da aynı).
- `astro build`: 49 sayfa, hatasız.
- Playwright tam (3 proje, `--update-snapshots=missing`, axe dahil): son tam koşu **445 geçti, 46 atlandı, 4 başarısız** →
  3'ü `/guvenlik` AES beklentisi (D3; spec güncellendi, sonra yeşil), 1'i `home-premium` ekosistem hover testi
  (masaüstü): yalnız 3 proje paralel yükte; tek başına ve spec düzeyinde 3/3 geçti, taban (değişikliksiz) ile de geçiyor;
  bu turda ekosisteme dokunulmadı. Değişen sayfaların spec'leri (inner-pages, a11y) son hâlde **yeşil**. `*-linux.png`
  commit'lenmedi; Windows tabanları yerelde güncellenmeli (anasayfa, iç sayfalar, iletişim, fiyat, menü — metin değişti).
- Lighthouse (mobil, 3 koşu medyanı): taslak 97/100/100; yayın **98/100/100/SEO 100**; CLS 0 — tüm eşikler.
- Bulut notu: Playwright'ın istediği Chromium indirilemiyor → `/opt/pw-browsers/chromium` commit'lenmeyen config
  sarmalayıcısıyla; `frontend` token derlemesi için bağımlılıklar elle kuruldu (kurulum betiği Playwright indirmesinde durur).

## Kullanıcı kararı bekleyenler

1. **Ödeme notu** ("bu sürümde test aşamasındadır") — anasayfa güvenlik kartında kalsın mı? (NEXT_TASKS R3)
2. **Kanal sayısı** — anasayfada gösterilmiyor (S12), iç sayfalarda ve fiyat güven şeridinde "6" var; tek kural? (R4)
3. **"Stok senkronu"** menü etiketi → "Stok eşitleme"? (R8)
4. s27b'den süren: D1 fiyat notu, D2 önerilen plan, D5 H1'ler, D6 künye (`docs/s27b-review/DECISIONS_PENDING.md`).
5. `USER_DECISIONS.md` bulutta salt okunur: K50 satırına "S27c: CTA metni tek ('Ücretsiz deneyin'); alıcı terimi;
   BRAND §0 kimlik özeti" notunun yerelde eklenmesi önerilir.

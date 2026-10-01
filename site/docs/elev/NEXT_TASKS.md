# ELEV — sonraki tur görev tanımları

Kaynak: `AUDIT.md` (bulgu no'ları), `BRAND.md` (ses, sütunlar, görsel ilkeler). Her görev tek dal/tek oturumda
bitirilebilir boyuttadır. Büyüklük: **S** ≤ yarım gün · **M** ~1 gün · **L** 1–2 gün. Ortak kabul (her görevde):
`vitest run` (bulut kopyasında bilinen 2 ortam hatası hariç) yeşil, `brand-voice.test.ts` yeşil, ilgili Playwright
spec'leri + axe yeşil, 1440/390 önce–sonra görüntüleri `docs/elev/review/` altında, iddia/kanıt testleri gevşetilmez.

## N1 — İç sayfa H1'lerini tamamla (A8 devamı) · S
- **Durum (S27b):** yapıldı — /destek, /sss değer cümlesi H1; kanal ve stok rezervasyonu H1'i SEO gerekçesiyle korundu (kullanıcı onayı: s27b DECISIONS_PENDING D5). **KAPANDI.**
- **Amaç:** Her pazarlama sayfasında H1 bir değer cümlesi, sayfa adı eyebrow olsun (ELEV'de `/ozellikler`,
  `/guvenlik`, `/entegrasyonlar`, `/iletisim` yapıldı).
- **Kapsam:** `/destek` ("Destek merkezi"), `/sss` ("Sık sorulan sorular"), `/entegrasyonlar/[kod]` ("X entegrasyonu"),
  `/ozellikler/stok-rezervasyonu`. SEO açısından soru/kanal adı içeren H1'ler korunabilir — her sayfa için karar yaz.
- **Kabul:** sayfa başına tek H1; `seo.test.ts` markdown H1 eşleşmesi yeşil; e2e H1 beklentileri güncel.

## N2 — Kanal sayfası hero'larında güç önce, sınır sonra (A9 devamı) · S
- **Durum (S27b):** yapıldı — önizleme güçle başlar, kapsam şeffaflığı aşağıda. **KAPANDI.**
- **Amaç:** `/entegrasyonlar/[kod]` hero'sunda "kısmi/temel düzey" bilgisi ilk ekranı domine etmesin.
- **Kapsam:** hero istatistik/rozet düzeni; kapsam matrisi aynen kalır (şeffaflık aşağıda).
- **Kabul:** `pages.test.ts` sayaç kuralları (`EXPECTED_STATS`) yeşil; kapsam sınırı sayfada hâlâ görünür.

## N3 — Anasayfa kurgusunu kısalt (A10, A15) · L
- **Durum (S27a):** kısmen — 16.884 → 14.168 px (1440); (1)(2)(3) yapıldı, (4) 5 adım korunup tek ekran yatay çizgiye indi; ≤ 12.000 için "Nasıl çalışır" kaldı. `docs/s27a-review/`. **KAPANDI → R1 (Nasıl çalışır)**.
- **Amaç:** ~16.900 px → ≤ 12.000 px (1440); her bölüm tek mesaj sütunu.
- **Kapsam:** (1) Yetenekler bentosundaki iki güvenlik karosu (şifreli anahtar, izole veri) güvenlik bölümüyle
  birebir tekrar → bentodan çıkar, güvenlik bölümünde birleştir. (2) "Günlük işleriniz için" 6 kartı kompakt bir
  ikon listesine indir. (3) Güvenlik bölümünü açık zemine al ya da kısa banda indir; sayfa sonunda tek koyu sahne
  (kapanış) kalsın. (4) "Bir sipariş geldiğinde ne olur" 5 adımını 3 adıma sadeleştirmeyi değerlendir.
- **Kabul:** `home.test.ts` sahne listesi ve iddia kapsamı güncel (her güvenlik iddiası sayfada bir kez); iki koyu
  bölüm arka arkaya yok; Lighthouse performans ve SEO değerleri düşmez.

## N4 — Taslak fiyat notunun ziyaretçi dili (A12) · S · **kullanıcı kararı gerekir**
- **Durum (S27b):** varsayılan uygulandı (ziyaretçi metni + iç kayıt öznitelikte); karar kullanıcıda (s27b DECISIONS_PENDING D1). **KAPANDI (karar bekliyor).**
- **Amaç:** "ÖNERİ — insan kararı bekliyor (ADR-0014 Açık Soru 1)" iç süreç adını ziyaretçiye göstermesin.
- **Kapsam:** `PROPOSAL_NOTICE` ve `claims.test.ts` bu metni birebir korur (yönetişim emniyeti). Öneri: görünür
  metin "Fiyatlar yayın öncesi kesinleşecektir", iç kayıt (ADR atfı) `internalNotes`'ta; test görünür metni ve
  iç atfı ayrı ayrı doğrular. Gevşetme değil, yer değiştirme — kullanıcı onayıyla.
- **Kabul:** taslak derlemede not görünür; `SITE_DRAFT=false` derlemesinde davranış kararla belirlenir.

## N5 — Kanıtlanabilir güven şeridi (A13) · M
- **Durum (S27a):** yapıldı — hero sonrası açık zeminde güven şeridi, öğe başına `data-source` + test. `docs/s27a-review/`. **KAPANDI.**
- **Amaç:** Sahte müşteri/rakam olmadan "neden şimdi, neden biz" güveni.
- **Kapsam:** fiyat bölümü üstünde ya da hero altında tek satır güven şeridi; her öğe kayıttan: canlı kanal sayısı
  (`integrations.ts`), deneme süresi + kartsız (`plans.ts`), "Verileriniz yalnızca size ait" (`security`),
  "Otopilot her eylemde onayınızı ister" (`agent-claims.ts`), "Kurulum için kod gerekmez" (`faq.ts`). Yeni olgu
  gerekiyorsa (ör. Türkçe destek, yerli ekip) önce kayda kanıtla eklenir.
- **Kabul:** `claims.test.ts` taramasından geçer; öğe başına kaynak kaydı test edilir.

## N6 — Tek Eyebrow bileşeni (A14) · S
- **Durum (S27b + S27c):** yapıldı — `Eyebrow.astro` + tokenlar; S27c eksik bölüm eyebrow'larını tamamladı, rehberdeki ✦ ikonlu etiket tek biçime alındı. **KAPANDI.**
- **Amaç:** Anasayfa `SectionHeading`, iç sayfa `PageHero`/`SectionHead` ve Otopilot bölüm etiketleri aynı biçimde.
- **Kapsam:** `--site-eyebrow-*` tokenları (`site-tokens.css`, sıcak dosya — orkestratör birleştirmesi notuyla) +
  `Eyebrow.astro`; çizgi işareti her yerde ya da hiçbir yerde.
- **Kabul:** `tokens.test.ts` (ham değer yok) yeşil; açık/koyu zeminde AA kontrast (axe).

## N7 — Otopilot demo kartı sadeliği (A17) · S
- **Durum (S27a):** yapıldı — üç eylem korundu, tek birincil + iki metin ağırlığında ikincil. `docs/s27a-review/`. **KAPANDI.**
- **Amaç:** Kart tek birincil eylem (Demo talep edin) + iki ikincil metin bağlantısı (adresi kopyala, ücretsiz deneyin).
- **Not:** ELEV'de değiştirilmedi; üç eylem farklı işler görüyor (e-posta istemcisi olmayan ziyaretçi için kopyala).
  Görsel ağırlık dengesi yeterli olabilir — önce/sonra ile karar ver.
- **Kabul:** `inner-pages.spec.ts` kopyala/mailto testleri yeşil.

## N8 — Mobil hero sadeleşmesi (A18) · M
- **Durum (S27a):** yapıldı — 390 px ilk içeriğe ~1,34 ekran. `docs/s27a-review/`. **KAPANDI.**
- **Amaç:** 390 px'te ilk içerik bölümüne ≤ 1,5 ekran.
- **Kapsam:** hero ürün panelinde sahne adım çubuğu (`.show__nav`) ve alt sipariş kartları dar ekranda gizlenir;
  fayda şeridi 2×2 kalır; çip listesi dar ekranda tek satır yatay kaydırma (ya da gizleme — `home-premium.spec.ts`
  reduced-motion testiyle birlikte karar).
- **Kabul:** yatay taşma yok (320/375/390), e2e görünürlük testleri güncel.

## N9 — Hareket ekonomisi (A19) · M
- **Durum (S27a):** yapıldı — bento/hikâye/şerit/yörünge/güvenlik halka döngüleri kaldırıldı. `docs/s27a-review/`. **KAPANDI.**
- **Amaç:** "Görünür ekranda en fazla bir döngü" ilkesi (BRAND §4).
- **Kapsam:** bento mini sahneleri ve ekosistem halkaları tek seferlik girişe; döngü yalnız hero vitrini ve sıfır
  aşırı satış hikâyesinde. IntersectionObserver ile tek aktif döngü.
- **Kabul:** `scenes.test.ts`, `home-demos.test.ts` güncel; reduced-motion ve anahtar kapalıyken döngü yok (e2e).

## N10 — İç sayfa metin geçişi (sütun dili) · M
- **Durum (S27b + S27c):** yapıldı — S27b iç sayfa CTA bantları; S27c güvenlik ilke özetleri, SSS dayanıklılık yanıtları, ekosistem vaatleri, anasayfa gövde tekrarları. **KAPANDI.**
- **Amaç:** BRAND §2 sütun dilini `/ozellikler`, `/entegrasyonlar`, `/fiyatlandirma`, `/guvenlik` gövde metinlerine
  yaymak (ELEV yalnız anasayfa başlıkları + H1'ler).
- **Kapsam:** küme başlıkları, kart değer cümleleri, CTA bantları; "tek merkez" yalnız ana vaatte.
- **Kabul:** `brand-voice.test.ts` + `terminology.test.ts` + `claims.test.ts` yeşil.

## N11 — Örnek künye bilgileri yayın kapısı (A1) · S · **kullanıcı/işletme verisi gerekir**
- **Durum:** yapılmadı — işletme verisi bekleniyor; kontrol listesi `docs/s27b-review/KUNYE_CHECKLIST.md`. **R7 olarak taşındı.**
- **Amaç:** `COMPANY_SAMPLE_VALUES=true` iken üretim derlemesi (`SITE_DRAFT=false`) başarısız olsun ya da örnek
  satırlar gizlensin.
- **Kapsam:** `company.ts` bayrağı + derleme zamanı koruması + test.
- **Kabul:** taslakta görünür; yayın derlemesinde örnek adres/telefon/MERSİS görünmez ya da derleme durur.

---

# S27c sonrası tur (R) — kimlik denetiminden kalanlar

Kaynak: `docs/s27c-review/README.md` (denetim bulguları), `BRAND.md` §0 (kimlik). Ortak kabul yukarıdakiyle aynı;
görüntüler `docs/<tur>-review/` altında 1440 · 1280 · 390.

## R1 — "Nasıl çalışır" kompakt anlatı (N3 devamı) · M
- **Amaç:** anasayfa 1440 ≤ 12.500 px (şu an ~14.150). En büyük kalem "Nasıl çalışır" (~2.300 px, dört mini arayüz).
- **Kapsam:** yapışkan anlatı (S7 imzası) korunur ama mini arayüzler 2×2 ızgaraya ya da tek "aktif adım" sahnesine
  (adım listesi solda, tek pencere sağda, kaydırmayla değişen) iner. Reduced-motion'da dört adım statik liste.
- **Kabul:** `home.test.ts` adım sırası, `home-premium.spec.ts` demo testleri güncel; Lighthouse performans düşmez.

## R2 — Tek plan kartı bileşeni (anasayfa ↔ fiyat sayfası) · M
- **Amaç:** iki yüzey aynı kayıttan (`getPlanCards()`) okuyor ama iki ayrı kart tasarımı var (anasayfada "Önerilen"
  rozeti kart içinde, fiyat sayfasında kart üstünde; anasayfada limitler/Otopilot bloğu farklı sırada).
- **Kapsam:** `PlanCard.astro` (tek anatomi; `compact` varyantı anasayfa için); iki yüzey bunu kullanır.
- **Kabul:** `plan-cards.test.ts` + `pricing.spec.ts` + `home.spec.ts` yeşil; görsel önce/sonra.

## R3 — "Ödeme akışı bu sürümde test aşamasındadır" notu · S · **kullanıcı kararı gerekir**
- **Bulgu:** anasayfa güvenlik kartı, `/guvenlik`, `/fiyatlandirma` SSS ve `/sss`'te "bu sürümde test aşamasında"
  ifadesi K43'ün hazır ürün sesine aykırı görünüyor; ama olgusal bir şeffaflık notu (ödeme canlı değil).
- **Öneri:** yayın kapısına bağla — ödeme canlıya alınınca not kayıttan kalkar; o zamana dek anasayfa kartından
  çıkarılıp yalnız SSS/güvenlik ayrıntısında kalsın. Kullanıcı onayıyla.

## R4 — Kanal sayısı tutarlılığı · S · **kullanıcı kararı gerekir**
- **Bulgu:** anasayfada S12 kararıyla "uygulanan entegrasyon sayısı" gösterilmiyor; `/ozellikler` hero'su ("6 bağlanabilen
  kanal"), `/entegrasyonlar` ("6 kullanılabilir entegrasyon") ve fiyat güven şeridi ("6 kanal hazır entegrasyon") gösteriyor.
- **Öneri:** iç sayfalarda sayı kalsın (kayıttan, şeffaf) ya da her yerde kalksın — tek kural; karar sonrası test.

## R5 — Mega-menü Otopilot döngüsü 1024 px · S
- **Bulgu (S27b eleştirisi):** 1024'te panel görünüm genişliğine sığıyor ama 5 sütunlu döngü sıkışık.
- **Kapsam:** < 1180 px'te döngü 2 satır (3+2) ya da yalnız adlar; e2e 1024 ekran görüntüsü.

## R6 — Fiyat sayfası Otopilot merdiveni okunurluğu · S
- **Bulgu (S27b eleştirisi):** 1280'de merdiven kart metinleri küçük; Kurumsal kartta Otopilot paneli ile limitler arası boşluk.
- **Kapsam:** kart metni ölçeği `--ek-font-size-sm` altına inmez; eşit yükseklik yerine içerik hizası.

## R7 — Künye yayın kapısı (N11 devamı) · S · **işletme verisi gerekir**
- Kontrol listesi: `docs/s27b-review/KUNYE_CHECKLIST.md`.

## R8 — "Stok senkronu" menü/footer etiketi · S
- **Bulgu:** ürün menüsü ve footer'da "Stok senkronu" — BRAND "Türkçe karşılık" ilkesine göre yarı teknik. Arama
  terimi olarak değerli olabilir (rehberde "stok senkronizasyonu" geçiyor).
- **Öneri:** görünür etiket "Stok eşitleme" / "Çok kanallı stok", `title`/SEO metninde arama terimi kalır. SEO testi.

## R9 — Otopilot sohbet görselinde kanal adı · S
- **Bulgu:** `/otopilot` sohbet örneğinde "Bu ürünlerin Trendyol fiyatını %5 artır" — BRAND §4 "görselde kanal adı
  yerine kanal rozeti". Sohbette doğal bir kullanıcı cümlesi olduğu için S27c'de bırakıldı.
- **Öneri:** ad yerine rozet (`ChannelMono`) satır içi; ya da bilinçli istisna olarak BRAND'e yazılsın.

## R10 — Kanal kartlarında "Kullanılabilir" rozeti tekrarı · S
- **Bulgu:** `/entegrasyonlar` kataloğunda altı kartın hepsinde aynı yeşil "Kullanılabilir" rozeti — ayırt edici bilgi
  taşımıyor (yol haritası öğeleri zaten gizli). Kapsam çubuğu asıl bilgi.
- **Öneri:** rozet yalnız durum farklıysa görünür; `pages.test.ts` sayaçları korunur.

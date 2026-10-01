# S27b inceleme — premium mega-menü, üst seviye fiyat sayfası, alt çizgisiz hover (SR4 madde 9–11) + ELEV N1/N2/N4/N6/N10

Dal: `cloud/site-s27b` · Taban: `origin/main` (018920f) · Yalnız `site/` değişti. Kaynak:
`docs/cloud-contracts/SITE_FEEDBACK_R4_2026-10-01.md` (9–11, 12'nin site geneli kısmı, 13), `site/docs/elev/NEXT_TASKS.md`,
USER_DECISIONS K43–K46, K50. Paralel dal `cloud/site-s27a` (anasayfa) bu daldaki kaydı (`plan-cards.ts`) zaten
birleştirip anasayfa planlarını bağladı.

Görüntüler Linux Chromium (reduced-motion, son kare); görsel onay yerelde (Windows) yapılır.
`once/` = `origin/main`, `sonra/` = dal sonu, `iterasyon/` = ara adımlar. Viewport: 1440 · 1280 · 390.

| Konu | Dosyalar |
|---|---|
| Menü panelleri (açık) | `panel-{product,solutions,resources}-{1440,1280}-*` · hover: `panel-product-hover-*` |
| Mobil çekmece | `cekmece-390-*` |
| Fiyat sayfası | `fiyatlar-ilk-ekran-*` (yalnız sonra), `fiyatlar-tam-{1440,390}-*`, `fiyatlar-{planlar,ajan-her-planda,karsilastir,fiyat-sss}-*` |
| Hover (alt çizgi → yeni dil) | `hover-1-ana` (`.link`), `hover-3-guvenlik` (koyu hero bağlantısı), `hover-4-ozellikler` (kırıntı) |
| İç sayfalar (N1/N2/N10 + bölüm boşluğu düzeltmesi) | `sayfa-{destek,sss,entegrasyonlar-trendyol,ozellikler-stok-rezervasyonu,guvenlik}-{1440,390}-*` |

## Kararlar

**11 — Alt çizgisiz hover (tek global kural, ilk push edildi).** `global.css` "BAĞLANTI HOVER" bloğu: tüm `a`
alt çizgisiz; hover = renk geçişi (`--site-color-link-hover`, koyu yüzeyde başlık beyazı); metin içi (sınıfsız)
bağlantı varsayılanda yarı kalın (WCAG 1.4.1 — renk tek başına değil) ve hover/odakta yumuşak teal "işaret" zemini;
ok ikonlu her bağlantıda ok ileri kayar (`Icon` artık `data-icon` taşır → tek kural). 16 bileşendeki yerel
`text-decoration: underline` / `border-bottom` hover'ları kaldırıldı. Odak halkası değişmedi. Menüde aktif sayfa
işareti de çizgi yerine küçük teal nokta. Test: `tests/link-hover.test.ts` (kaynak + **derlenmiş CSS**'te `underline`
yok; hover'da sahte alt kenar yok; global kural içeriği).

**Plan kaydı (ilk push).** `src/data/plan-cards.ts` → `getPlanCards()` (fiyat/limit/deneme/önerilen/CTA/"öncekine ek
olarak"/Otopilot özeti), `getPlanTrustPoints()` (6 güven unsuru, her biri kayıttan), `getPlanNotice()` (N4),
`getBillingIntervals()`. Anasayfa (S27a) ve fiyat sayfası aynı seçiciyi okur; önerilen plan tek yerde
(`RECOMMENDED_PLAN_CODE`). Testler: `tests/plan-cards.test.ts`; `claims.test.ts` taramasına kart kopyası ve güven
şeridi **eklendi** (sıkılaştırma).

**9 — Mega-menü premium.** Panel 60rem; üst kenarda ince ışık çizgisi; editoryal başlık (Eyebrow = grup adı +
kalın vaat cümlesi); kartlar: degrade ikon karosu → hover'da dolgun koyu teal + beyaz ikon, kart çerçevesi/gölgesi,
başlıkta beliren ok; kartlar 40 ms aralıkla sırayla oturur (yalnız transform/opacity; reduced-motion / "Hareket"
kapalı / paneller arası geçişte yok). Öne çıkan kartlar: Otopilot = koyu sahne + tek yumuşak ışıma + **çalışma
döngüsü zaman çizgisi** (Gözle → Öner → **Onayla** → Uygula → Raporla; adlar Otopilot döngü kaydından, onay adımı
vurgulu); deneme = tam genişlik CTA + numaralı adımlar; rehber = dekoratif "kapak". Alt şerit: ikon karosu + hap
bağlantılar. Klavye/ARIA/hover niyeti değişmedi (DOM sırası korundu); mobil çekmecede aynı ikon karosu dili.

**10 — Fiyat sayfası.** Ortalı kısa koyu hero (vaat + 3 güven çipi + N4 notu) → kartlar hero'nun alt kenarına
**taşar** (1440'ta fiyatlar ilk ekranda) → **Önerilen** Büyüme tek koyu vitrin kartı, komşularından yüksek →
kart anatomisi: ad + konum → büyük fiyat → CTA + güvence notu → kime → limitler → "öncekine ek olarak" →
**Otopilot dahil** paneli (K46) → güven şeridi (14 gün, kart gerekmez, Otopilot her planda, 6 kanal, plan
değişikliği, kart verisi; hepsi kayıttan) → **Otopilot her planda** (açık zemin; "Yapay zekâ için ayrıca ödeme yok",
kendi anahtarınız; yükselen merdiven, yetki çubukları) → karşılaştırma tablosu (ortalı hücreler, öne çıkan sütun
teal üst çizgi, gruplar ikonlu, tabanda plan CTA'ları, ≥1024'te yapışkan başlık) → iki sütunlu SSS (sol yapışkan
başlık + belgeler; sağ akordeon + yardım bandı) → kapanış (Ücretsiz deneyin + **Demo talep edin**). Aylık/yıllık
geçişi: seed'de yıllık yok → **gösterilmedi** (kayıt yıllık içerirse kendiliğinden açılır). Uydurma fiyat/indirim
yok (test). Koyu sahne: yalnız hero + kapanış (+ tek vitrin kartı).

**N6 — Tek Eyebrow.** `components/Eyebrow.astro` + `--site-eyebrow-*`; SectionHeading, SectionHead, PageHero, menü,
fiyat, güvenlik/iletişim/destek/rehber/Otopilot kapanış etiketleri. Çizgi işareti her yerde (ikonlu varyant
Otopilot için). Koyu yüzeyde renk `global.css` eşlemesiyle açık teal (türetilmiş token `:root`'ta çözüldüğü için
ayrıca eşlendi). Test: `tests/eyebrow.test.ts`.

**N1 / N2 / N10.** Bkz. `DECISIONS_PENDING.md` D5 (H1 kararları). Kanal sayfası hero'su: önizleme desteklenen
işlemlerle başlar; kısmi/temel kapsam rozeti ve oran çubuğu hero'da yalnız geniş kapsamda — kapsam bilgisi "Bir
bakışta", matris ve sınırlamalarda aynen (`pages.test.ts` sayaçları yeşil). Metin geçişi: "tek panel/tek merkez"
tekrarları CTA bantlarından kalktı (entegrasyonlar, kanal, SSS, stok rezervasyonu), güvenlik lead'i Güven sütunu
diliyle ("her şey korunur ve yalnızca size aittir"), "müşteri sorusu" → "alıcı soruları".

**SR4-12 (site geneli) bulgusu — düzeltildi.** `.x:global(.section)` seçicileri hiç eşleşmiyordu (Section kendi kapsam
kimliğiyle basar; S22'de yalnız /otopilot düzeltilmişti) → **tüm iç sayfaların** hero ve "sıkı" bölüm boşlukları
uygulanmıyordu (breadcrumb üstünde ~8rem boşluk). 13 dosyada `:global(.section.x)`; test: `tests/style-scope.test.ts`
(anasayfa `AssistantTeaser` S27a'ya bırakıldı — birleştirmede istisna kaldırılır).

## İterasyonlar (önce/sonra + eleştiri)

1. **Menü i1:** ok her kartta sürekli görünüyordu (alt bileşene geçen sınıf kapsamlı seçiciyle eşleşmiyor) →
   `:global`; koyu karttaki eyebrow koyu teal kalıyordu (türetilmiş token) → koyu yüzey eşlemesi; Otopilot döngüsü
   iki satıra kırılıp "Raporla" yetim kalıyordu → nokta+çizgili 5 sütun zaman çizgisi. **i2:** Çözümler satırları
   gevşek → dikey boşluk sıkılaştı.
2. **Fiyat i1:** hero ortalanmıyordu (aynı kapsam sorunu — kök neden SR4-12 bulgusu), güven şeridi 3 satıra kırılıyordu.
   **i2:** mobilde not ikonu metinden kopuk; deneme bilgisi kartta iki kez ("14 gün…" hapı + CTA notu); "tek tıkla
   yükseltin" kanıtsız ifade → "uygulama içinden". **i3:** "Her planda" şeridi ilk kartın listesini tekrar ediyordu →
   kaldırıldı; güven şeridi tek bant (tutarlı satır, kalın rakamlı vurgu); karşılaştırmada sütun genişlikleri eşitlendi.
3. **Hover:** önce/sonra `hover-*` — çizgi kalktı, renk + ok; metin içi bağlantıda zemin.

Sert eleştiri (kalan): Otopilot merdiveninde kart metinleri 1280'de küçük kalıyor; fiyat kartlarında Kurumsal'ın
"Otopilot dahil" paneli ile limitler arasında boşluk (kart eşit yükseklik) — içerik az olduğu için; kabul edildi.
Menü panelleri 1024'te 60rem yerine görünüm genişliğine sığar (test yeşil) ama Otopilot döngüsü 5 sütunda sıkışık.

## Testler

- `vitest run`: 812 test — yalnız bulut kopyasında bilinen **2 ortam hatası** (claims: backend/belge kanıt dosyaları
  bulut kopyasında yok). Yeni: `link-hover`, `plan-cards`, `eyebrow`, `style-scope`.
- `astro build`: yeşil.
- Playwright (3 viewport, tüm spec'ler, axe dahil): **449 geçti**; ekran görüntüsü tabanları `--update-snapshots=missing`
  ile yazıldı (`*-linux.png` git-ignored; Windows tabanları yerelde güncellenmeli — fiyat, iç sayfalar, menü, site).
- e2e güncellemeleri: `nav.spec.ts` (aktif işaret nokta + premium panel testi), `pricing.spec.ts` (N4 notu, CTA
  metinleri, kapanışta demo, vitrin/taşma/güven şeridi testi).

## Kullanıcı kararı bekleyenler

`DECISIONS_PENDING.md`: D1 N4 not metni ve yayın davranışı · D2 önerilen plan · D3 kapanış ikincil eylem · D4 CTA
metinleri · D5 H1'ler · D6 N11 künye (yapılmadı; `KUNYE_CHECKLIST.md`).

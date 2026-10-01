# Site denetimi: Web Interface Guidelines (site-wdg, K60)

Taban `origin/main` (3c839f8). Dal `cloud/site-wdg`. Kural seti: `.claude/skills/web-design-guidelines/guidelines.md` +
SKILL.md proje uyarlaması. Öncelik: USER_DECISIONS (K43–K46, K50, K58, K60) → `premium-ui-standards` + `site/docs/elev/BRAND.md`
→ kurallar. Kesin sınır: metin, sahne, animasyon dizisi/zamanlaması/keyframe, sayfa yapısı değişmez.

Yöntem: `site/src` altındaki tüm sayfa, bileşen, betik ve stil dosyaları dört grupta satır satır okundu (kabuk + düzenler,
anasayfa bileşenleri, iç sayfa/rehber/asistan bileşenleri, sayfalar + sahne CSS + tokenlar). Bulgular derlenmiş çıktıda
(`dist-e2e`) ve tarayıcıda doğrulandı. Kontrast değerleri token hex'lerinden hesaplandı (`tokens.static.css`).

Ön ölçüm (değişiklikten önce):
- axe (WCAG 2.1 AA) 18 rota × 1440/390: **0 ihlal**. axe `aria-hidden` sahneleri ve odak halkasını ölçmez; aşağıdaki
  kontrast/odak bulguları elle hesaplandı.
- Yatay taşma (390 ve 1440, 15 rota): yok.
- `transition: all` yok; `<img>` yok (görseller satır içi SVG); `...` görünür metinde yalnız iki veri satırında.
- Tüm sonsuz döngüler (`scenes-loops.css`, sayfa yerel döngüler) `prefers-reduced-motion: no-preference` +
  `html[data-motion='play']` + görünürlük koşuluna bağlı; son kare statik hâldir. ✓

Biçim: `dosya:satır - bulgu → düzeltme`. Kimlik (Wxx) REPORT.md'de uygulama durumuyla eşlenir.

## KRİTİK (0)

Erişilebilirlik engeli, klavyeyle erişilemeyen eylem, yatay taşma veya okunamaz kontrast bulunmadı.

## YÜKSEK (12)

- W01 `src/styles/site-tokens.css:72` + `src/styles/global.css:142-155` - `--site-color-focus-ring` = `--ek-color-primary`
  (#13255B); koyu yüzeylerde (`.section--stage`, `[data-surface='dark']`) ~1,1:1 → odak halkası görünmez (WCAG 2.4.7/1.4.11).
  Etkilenen: `Hero.astro:406` `.hero__agent`, `guvenlik.astro:283` `.hero-list a`, `entegrasyonlar/[code].astro:637`
  `.hero-guide-link`, koyu kart/şeritlerdeki metin içi bağlantılar → koyu yüzey eşlemesine
  `--site-color-focus-ring: var(--site-accent-on-dark)` (~6,4:1).
- W02 `src/pages/rehber/index.astro:157,523` - `.market__stats` koyu degrade ama `data-surface="dark"` yok; kaynak bağlantısı
  lacivert üstüne lacivert halka (~1:1) ve hover'da renk değişmiyor → `data-surface="dark"` + W01.
- W03 `src/styles/site-tokens.css:126` - `--site-accent` (#018786) beyazda 4,36:1, `surface-muted`'ta 4,17:1; 13–14 px
  metin rengi olarak kullanılıyor (`--site-card-eyebrow-color` :217, `ozellikler.astro:628` `.cluster-nav__num`, Hero/
  ProblemSolution/OrderStory etiketleri) → AA altında. Token'ı aynı teal'in koyulaştırılmış karışımına çek (~5,2:1).
- W04 `src/components/home/ProblemSolution.astro:284,287,371` - "Bugün" sütunu statik son hâlde opaklık 0,78 +
  `--site-text-meta` → `.ps__pains` / `.ps__before-title` ~3,1:1 (ekran okuyucuya açık metin) → metin rengini
  `--ek-color-content-default` yap; opaklık ve animasyon aynı kalır.
- W05 `src/pages/sss.astro:316-317` - `.faq-tab__count` 12 px `--site-text-meta`, `surface-sunken` zeminde ~4,34:1 →
  `--site-text-body`.
- W06 `src/components/home/AssistantTeaser.astro:29,237-243` - koyu vitrin panelinde `data-surface="dark"` yok;
  global `a:hover` (özgüllük 0,1,1) `.teaser__link`'i ezer → hover'da koyu teal / lacivert ~2:1 (etkileşim kontrastı
  düşürüyor) → `.teaser__link:hover` koyu yüzey başlık beyazı.
- W07 `src/components/Header.astro:226-236` + `src/scripts/menu.ts:26-45` - mobil çekmece açıkken arka sayfa `inert` değil;
  Tab çekmeceden çıkıp sabit panelin altında kalan `main`/footer'a gider → odak görünmez → çekmece açıkken
  `main`, `footer`, atlama bağlantısı `inert`.
- W08 `src/pages/ozellikler.astro:599` - `.cluster-nav { overflow: hidden }` tam genişlik bağlantıların odak halkasını
  kırpar → içe dönük halka (`outline-offset` negatif; `stok-rezervasyonu.astro:395` deseni).
- W09 `src/pages/rehber/sozluk.astro:138-146,176,202` - 360–390 px'te yapışkan harf dizini ~3 satıra kırılıyor (~150 px);
  üst barla birlikte odaklanan terim bağlantılarını örter → mobilde dizin tek satır, yatay kaydırmalı.
- W10 `src/components/pages/CtaBand.astro:43-51` - `.cta-band h2` / `.cta-band p` kapsamlı seçicileri hiç eşleşmiyor
  (bölüm öğesi `Section` kapsamını taşıyor; `dist-e2e` doğrulandı) → kapanış başlığı display ölçeğine, gövde xl'ye
  hiç çıkmıyor; iç sayfa kapanışları anasayfa kapanışından zayıf → `.cta-band__body h2/p`.
- W11 `src/pages/404.astro:195` - aynı kapsam hatası: `.nf-links :global(.next-links)` ızgara kuralı ölü → `:global(.section.nf-links)`.
- W12 `src/pages/guvenlik.astro:283-287` - koyu hero'daki `.hero-list a` bağlantılarında dokunma hedefi (44 px) ve hover
  geri bildirimi yok (`sss.astro:195-204` desenindeki karşılığı eksik) → `min-height: var(--site-tap-target)` + hover rengi.

## ORTA (22)

Uygulananlar (gerçekten fark ettirenler):
- W13 `src/styles/global.css:38-46` - başlıklarda `text-wrap: balance` yalnız 7 bileşende; iç sayfa/yasal/rehber/vitrin
  başlıklarında (404:117, sss:373, guvenlik:230, iletisim:189, [ajan]:271, sozluk:277, LegalLayout:455, AssistantTeaser:195,
  OrderStory:179, HowItWorks:537, SecuritySummary:446, Capabilities:1211, IntegrationShowcase:344, CtaBand:43, SectionHead:47,
  Header:958/1174) dul kelime → global `h1–h4 { text-wrap: balance }`.
- W14 `src/layouts/LegalLayout.astro:450,601`, `src/pages/guvenlik.astro:293,369`, `src/pages/sss.astro:351`,
  `src/components/rehber/GuideArticle.astro:352,437`, `src/components/pages/Accordion.astro:51`,
  `src/components/pages/CoverageMatrix.astro:355`, `src/pages/rehber/sozluk.astro:176,202` - yerel `scroll-margin-top`
  (`üst bar + boşluk`) global `html { scroll-padding-top: üst bar + boşluk }` ile TOPLANIYOR → çapa atlamaları başlığı
  ~2 üst bar aşağıya bırakıyor → yerel değerler yalnız ek pay (sozluk: yapışkan dizin yüksekliği) olacak şekilde sadeleşir.
- W15 `src/layouts/BaseLayout.astro:42,58` - `theme-color` lacivert, sayfa ve üst bar beyaz → `--ek-color-background`;
  `color-scheme: light` bildirimi yok (form denetimleri/kaydırma çubuğu) → `html { color-scheme: light }`.
- W16 Hover'da çift ok kayması: `Hero.astro:447-449`, `IntegrationShowcase.astro:439-444`, `destek.astro:269-271,400-402`,
  `iletisim.astro:298-303`, `NextLinks.astro:101-112`, `[code].astro:900-903` -
  yerel `translate`/`translateX` + global ok kuralı aynı oku iki kez kaydırıyor; yerel kural "Hareket" anahtarıyla
  durmuyor → yerel kural silinir, global ok kuralı (tek kaynak) kalır.
- W17 "Hareket" anahtarı kapalıyken hover yükselmeleri sürüyor: `Capabilities.astro:391-397,423-425`,
  `IntegrationShowcase.astro:336-338`, `PricingSummary.astro:233-235`, `destek.astro:302-306`, `iletisim.astro:243-247,301-303`,
  `rehber/index.astro:325-327`, `Header.astro:1264-1266`, `IntegrationCard.astro:271-275`, `[code].astro:870-875`,
  `Button.astro:116-119` (parıltı) → `global.css`'te tek kural: `html[data-motion=paused|reduced]` altında bu hover
  hedeflerine `transform/translate/rotate/scale: none`, düğme parıltısı gizli.
- W18 Hover durumu yok/zayıf: `Header.astro:540-553,665-676,705-715` (çekmece grup/doğrudan/öne çıkan),
  `Header.astro:449-451` `.mega-chan`, `CoverageMatrix.astro:128,282-298` `.cm__card-head`, `SourceList.astro:79-85`
  `.src__title`, `sss.astro:195-203` `.hero-list a`, `guvenlik.astro:408-419` ve `ozellikler.astro:804-814` "Ayrıntı"
  `summary`, `destek.astro:599-603` `.support-card__more`, `LegalLayout.astro:278-280,667-669` → renk/zemin hover'ı.
- W19 Kart köşe/gölge tutarsızlığı: bağımsız kartlar üç farklı yarıçapta (`--site-radius-panel` / `--ek-radius-xl` /
  `--ek-radius-lg`): `Accordion.astro:45`, `CoverageMatrix.astro:279,327`, `GuideArticle.astro:535`, `Card.astro:24`;
  `.cm__card` ve `.guide-related a` dinlenmede gölgesiz → bağımsız kart = `--site-radius-panel` + `--site-shadow-card`
  (satır içi bloklar `-lg` kalır).
- W20 `src/pages/sss.astro:258` - yatay kaydırmalı sekme şeridi üst kenarda odak halkasını kırpıyor → şeride halka payı.
- W21 `src/components/rehber/GuideBlocks.astro:353-360` - 640 px altında `display:block` tablo anlamını siliyor
  (Safari/VoiceOver, Chrome) → açık ARIA rolleri (`table/rowgroup/row/columnheader/rowheader/cell`).
- W22 `src/components/pages/EmailActions.astro:34` + `src/scripts/copy-email.ts` - "Adresi kopyala" JS yokken de görünüyor
  ama çalışmıyor (yorum "gizli" diyor) → `hidden`, betik açar.
- W23 `src/pages/iletisim.astro:69` - `aria-describedby` bağlantının kendi içindeki metni gösteriyor; iki kez okunuyor → kaldır.
- W24 `src/components/rehber/GuideArticle.astro:86-90,593` + `src/scripts/guide-toc.ts:12-16` - ≥1024 px'te içindekiler
  `summary`'si `pointer-events:none` ama sekme sırasında; Enter paneli kapatıyor → genişte `tabindex=-1` + açık tut.
- W25 `src/components/pages/StatPanel.astro:112` - `.hero-chan` 36 px; diğer bağlantılar 44 px → `--site-tap-target`.
- W26 `src/components/home/ProblemSolution.astro:791-792` - `.ps__resv` beyaz zeminde koyu yüzey teal'i (~2,8:1, görsel
  metin; sahne `aria-hidden`) → açık zemin vurgu rengi.

Atlananlar (gerekçe):
- W27 `src/components/home/FaqPreview.astro:223-232` - `grid-template-rows` geçişi yerleşim özelliği canlandırıyor;
  yöntemi değiştirmek animasyonu değiştirir → ÖNERİ (animasyon). Reduced-motion'da zaten anlık.
- W28 `src/scripts/faq-filter.ts:47-52` - arama varken sekme sayaçları toplamı gösteriyor; davranış değişikliği
  (eşleşme sayısı) → ATLANDI/öneri.
- W29 `src/pages/entegrasyonlar/[code].astro:206-212` - rehberi olmayan kanalda "nasıl bağlanır" başlığı adımsız kalabilir;
  bugün 6 canlı kanalın hepsinde rehber var (derleme doğrulaması) → koşullu gizleme bölüm yapısı değişikliği; ÖNERİ.
- W30 `src/components/home/AssistantTeaser.astro:220-236` - birincil eylem elle yazılmış `<a>` (`<Button>` değil); görünüm
  vitrin kartına özel ayarlı, `home-premium` beklentileri var → ATLANDI (W06 hover kontrastı düzeltildi).
- W31 `src/components/home/Capabilities.astro:1194-1197` - 640 px altı `.istat__cols i` 32 px; 390'da ölçüldü, taşma yok →
  ATLANDI.
- W32 `src/components/Footer.astro:109` - telefon `tel:` bağlantısı değil; değer yayın kapısındaki örnek künye (A1) →
  yayın kapısıyla birlikte.
- W33 `src/components/Footer.astro:119` - `sr-only` içindeki `{{ŞİRKET_UNVANI}}` işaretleri ekran okuyucuda okunuyor;
  taslak işaretidir, yayın derlemesinde yok → ÖNERİ (metin, yayın kapısı).
- W34 `src/pages/[ajan].astro:278-283`, `AssistantTeaser.astro:207`, `ClosingCta.astro:120` - degrade metin forced-colors
  modunda kaybolabilir / yedek renk yok → DÜŞÜK'e indirildi, aşağıda.

## DÜŞÜK (atlandı, gerekçeli)

- `translate="no"` marka/kanal adlarında yok (Header:67,119,273; Footer:81,123; IntegrationCard:30; StatPanel:52;
  EmailActions:27; fiyatlandirma:257,396; ChatScene:55) → yalnız `Logo.astro:26` uygulandı (her sayfada, tek nokta);
  kanal adları Türkçe sayfada otomatik çeviriye zaten aday değil.
- Sayı + birim bölünmez boşluk: `Hero.astro:115`, `PricingSummary.astro:52`, `ClosingCta.astro:50`, `Proof.astro:44`,
  `HowItWorks.astro:49,166`, `fiyatlandirma.astro:343`, `GuideArticle.astro:58,77`, `sozluk.astro:44` → ATLANDI: içerik
  bekçi testleri düz boşlukla metni birebir arar (`home.test.ts:267,383`, `nav-menu.test.ts:70`); test gevşetmeden
  uygulanamaz. Ayrı metin işinde test ile birlikte yapılmalı.
- Yer tutucu `…`: `sss.astro:62`, `404.astro:34` "Sorularda arayın" → "Sorularda arayın…" **uygulandı**.
- Veri dosyalarında `...`: `src/data/kb/glossary.ts:43`, `src/data/kb/guides/pazaryerleri.ts:358` → `…` **uygulandı**
  (yalnız tipografik karakter; REPORT.md'de listelendi).
- Düz kesme işareti (`Entegrasyonik'e`, `ERP'niz` …) site genelinde yüzlerce yerde ve veri dosyalarında; tek tip
  dönüşüm metin sözlüğü/test kapsamı ister → ATLANDI (ayrı metin işi).
- `Breadcrumb.astro:53`, `GuideBlocks.astro:331,396` - CSS `content` ayırıcı/ok ekran okuyucuda okunuyor →
  `content: '/' / ''` **uygulandı** (Breadcrumb); GuideBlocks okları akış anlamı taşıdığı için kaldı.
- `GuideBlocks.astro:33,82` - `list-style:none` listelerde `role="list"` yok (Safari) → **uygulandı**.
- `AgentConsole.astro:18-19` - içi `aria-hidden` boş `<figure>` → figure `aria-hidden` **uygulandı**.
- Ham `letter-spacing` em değerleri (Header:396,423,963,1179; Footer:255; LegalLayout:289,366,558; AssistantTeaser:182;
  OrderStory:177; HowItWorks:541; sss:165; guvenlik:253; 404:114) ve px/rem karışık kırılımlar (Footer:316,321;
  LegalLayout:686,692; Hero:455,1498; Proof:171; SecuritySummary:554) → görünür etkisi yok, token refaktörü; ATLANDI.
- `tight-section` bölüm boşluğu 9 sayfada kopya → görünür etkisi yok; ATLANDI.
- Ölü kod: `interactions.ts:123-196` paralaks, `iletisim.astro:401-410` `.pending`, `Hero.astro:1494` `.show__slabel-short`,
  `HowItWorks.astro:432`, `GuideBlocks.astro:308-320`, `SecuritySummary.astro:579`, `Button.astro:52-87` (ikinci blok
  eziyor; görünür sonuç aynı) → tasarım değil temizlik; ATLANDI.
- `AssistantTeaser.astro:379-386` `.deck__gate` `background-color` ezilmesi; `FaqPreview.astro:174`, `PricingSummary.astro:231`
  etkisiz `background` geçişi → görünür fark yok; ATLANDI.
- `Header.astro:77-89` JS'siz menüde `aria-expanded="false"` → JS'siz senaryo; ATLANDI.
- `Header.astro:1096,1128` masaüstü mega menü öğeleri ~36 px (yalnız fare) → ATLANDI.
- `CoverageMatrix.astro:76,342` geniş ekranda kaydırmasız bölgede `tabindex=0` → ATLANDI (zararsız durak).
- `legal-toc.ts:26` `aria-current="true"` → `location` daha kesin; ATLANDI.
- `copy-email.ts:32` boş seçici → bugün çağıran hep veriyor; ATLANDI.
- Degrade metin forced-colors yedeği (W34) → ATLANDI (Windows yüksek kontrast; ayrı a11y işi).
- `[code].astro:437`, `[ajan].astro:343` etkileşimsiz satır/kartta hover → ATLANDI (tasarım dili kararı).
- `sozluk.astro:290` `--site-header-height` / `-visible` tutarsızlığı → W09 ile birlikte gözden geçirildi.
- `GuideArticle.astro:601` `100vh` → `dvh`; `GuideArticle.astro:88` `summary` içinde h2 → ATLANDI.
- `touch-action: manipulation`, `-webkit-tap-highlight-color` → modern tarayıcılarda gecikme yok; ATLANDI.
- `site-tokens.css:24` display satır aralığı 1,1 → marka tipografi kararı (BRAND §4); ATLANDI.

## ATLANDI (overengineering / ürün kararı)

- URL-durum senkronu: SSS filtresi (`faq-filter.ts`, `?q=` yalnız okunuyor), entegrasyon filtresi → ürün kararı.
- Sanallaştırma: en uzun liste (sözlük) eşik altında.
- `GuideBlocks.astro:205` tablo sarmalayıcısında kaydırma bölgesi → bugünkü tablolar taşmıyor.
- `interactions.ts:99-107` okuma/yazma iç içe → tek öğe, ölçek gerektirmiyor.

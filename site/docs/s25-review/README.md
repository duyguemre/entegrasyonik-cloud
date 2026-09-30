# S25 inceleme — seçkin üst bar + menü içerikleri, fiyatlarda K46

Dal: `cloud/site-s25` (taban `cloud/site-s24`; S24 bitince son hâli birleştirildi). Yalnız `site/` değişti.
Karar belgesi: [NAV_DECISION.md](NAV_DECISION.md) (araştırma → kalıplar → karar → reddedilenler → S24 birleşmesi).

Kullanıcı: *"Sitedeki menü yapısına biraz daha çalış; üst bardaki gösterimi daha seçkin bir noktaya getirmelisin, hem üst
bar hem de bunların içerikleri olarak."*

## Görüntüler

Ad biçimi `<alan>-<genişlik>-<aşama>.png`; aşama: `once` (S24 tabanı) · `i1`/`i2`/`i3` (iterasyon, seçme) · `sonra` (son).
Bulutta Linux Chromium ile alındı (`reducedMotion: reduce`); görsel onay yerelde (Windows) yapılır.

| Alan | 1440 | 1280 | 390 / 800 |
|---|---|---|---|
| Üst bar kapalı / kaydırılmış | `ustbar-kapali-*`, `ustbar-kaydirilmis-*` | aynı | `ustbar-kapali-390-*` |
| Ürün paneli | `panel-urun-1440-*` | `panel-urun-1280-*` | — |
| Çözümler paneli | `panel-cozumler-1440-*` | `panel-cozumler-1280-*` | — |
| Kaynaklar paneli | `panel-kaynaklar-1440-*` | `panel-kaynaklar-1280-*` | — |
| Mobil çekmece | — | — | `cekmece-390-*`, `cekmece-cozumler-390-*`, `cekmece-urun-390/800-*` |
| Fiyatlar (K46) | `fiyatlar-otopilot-*`, `fiyatlar-planlar-*`, `fiyatlar-karsilastirma-*` | + `fiyatlar-tablo-otopilot-1280-*` | `fiyatlar-otopilot-390-*` |

## Ne değişti

**Üst bar**
- 4 üst öğe ortada (Ürün · Çözümler · Kaynaklar · Fiyatlar) + metin "Giriş" + tek CTA (S24 sadeliği korunarak).
- Kaydırınca cam katman 72 → 60 px kısalır ve gölge gelir — yalnız `transform`, header'ın akış yüksekliği sabit (sayfa
  zıplamaz). Başlığa yaslanan yapışkan öğeler (fiyat tablosu, kapsam matrisi, sözlük) yeni `--site-header-visible`
  jetonuyla aradaki boşluğu kapatır.
- Hover: yumuşak hap; açık grup: hap + dönen ok; aktif sayfa/grup: alt çizgi + yarı kalın.

**Açılır paneller (içerik)** — hepsi `src/data/navigation.ts` tek kaydından (`nav-menu.ts` kayıtlardan türetir):
- *Ürün* "Tek panelden bütün operasyon": Katalog yönetimi · Stok senkronu · Sipariş ve iade · Güvenlik; öne çıkan koyu
  **Otopilot** kartı ("Yeni", vaat metni `agent-claims` kaydından); şerit → Tüm özellikler.
- *Çözümler* "Nerede satıyorsanız, orada": Pazaryerleri / E-ticaret siteniz / ERP ve muhasebe satırları, her satırda o
  türün kanal rozetleri (ChannelMono standardı, kanal sayfalarına gider; `/entegrasyonlar?tur=…#katalog`); öne çıkan
  **ücretsiz deneme** kartı (süre + "Kart gerekmez" plan kaydından, 3 adım); şerit → Tüm entegrasyonlar.
- *Kaynaklar* "Öğrenin, sorun, hızla ilerleyin": Rehber · SSS · Destek · İletişim + rehber konuları (2×2); öne çıkan
  **rehber** kartı (konu + okuma süresi kayıttan); şerit → Terimler sözlüğü.
- Etkileşim: hover niyeti (açılış 120 ms, kapanış 240 ms, yalnız fare), biri açıkken komşu gruba anında geçiş
  (animasyonsuz), hover'la açılan panele hemen tıklamak onu kapatmaz; Enter/Space, ↓/↑, ←/→, Home/End, Esc; odak tuzağı
  yok; `aria-expanded`/`aria-controls`; açılış opaklık + kısa kayma, reduced-motion/"Hareket" kapalıyken yalnız opaklık.

**Mobil çekmece**: header altından ekranın sonuna tam ekran, arka sayfa kilitli; akordeon gruplar (başlık + vaat satırı),
kartlar ikon + başlık + fayda (açıklama `aria-describedby` ile, bağlantı adına girmez), Çözümler'de kanal rozetleri;
altta her zaman görünen Otopilot kartı; en altta sabit **Giriş yap + Ücretsiz dene**.

**Fiyatlar (K46)** — `src/data/pricing.ts`:
- Yeni bölüm "Otopilot her planda — Yapay zekâ için ayrıca ödeme yok" + kullanıcının cümlesi birebir, üç hap ve plan
  merdiveni (her üst plan yalnız eklenenleri "… planındakilere ek olarak" diye listeler; plan adları seed'den).
- Her plan kartında "Otopilot dahil" kutusu; karşılaştırma tablosunda "Otopilot (her planda dahil)" grubu: sohbetle
  sorgulama ve raporlar ✓✓✓ · onayınızla uygulanan öneriler ✓✓✓ · günlük işlem kotası Sınırlı / Yüksek / Size özel ·
  zamanlanmış ajanlar —✓✓ · kurallarınızla çalışan otonom ajanlar —✓✓; fiyat SSS'ine "Otopilot için ayrıca ücret ödüyor
  muyum?" Yeni rakam yok (kota nitel); kredi/token, "sınırsız", "ücretsiz yapay zekâ" dili yok (test korur).

## İterasyonlar ve sert eleştiri

**Önce (S24 tabanı)** — Çözümler paneli ürün özelliklerini (stok rezervasyonu, birleşik sipariş) kanal listesiyle
karıştırıyordu; 4 bağlantının 3'ünde açıklama yoktu; paneller sola yaslıydı; öne çıkan kart yalnız Ürün'de; alt şerit
yok; mobil çekmece yarım ekran, sayfa arkadan görünüyor, CTA içerikle birlikte kayıyor.

**İterasyon 1** (`*-i1`) — kartlı panel + öne çıkan kart + alt şerit + kanal satırları + tam ekran çekmece.
Eleştiri: deneme kartında büyük boşluk ve iki satıra kırılan eyebrow; rehber kartı ölü alan + 5 satır açıklama;
Kaynaklar şeridi bağlantısız; 1280'de 3 satıra kırılan açıklamalar; "Pazaryerleri" ikonu (liste) zayıf; kaydırılmış bar
koyu hero üstünde grimsi; kapalı çekmecenin alt yarısı boş.

**İterasyon 2** (`*-i2`) — deneme kartına 3 adım + meta hapları (süre, "Kart gerekmez"); rehber kartına konu + okuma
süresi, 3 satır kırpma; Kaynaklar şeridine sözlük; açıklamalar kısaldı; ikonlar plug/link/receipt; kaydırma zemini
daha opak; çekmecede her zaman görünen Otopilot kartı. Fiyatlar K46 eklendi.
Eleştiri: rehber konu hapları tek başına kalan dördüncü hap ile düzensiz; fiyat tablosu başlığı kısalan barın altında
12 px boşluk bırakıyor (hata); hover'la açılan panele tıklamak onu kapatıyordu (hata — e2e yakaladı); çekmecede açıklama
bağlantı adına giriyordu (uzun erişilebilir ad).

**İterasyon 3** (`*-i3`) — konu hapları kart sütunlarına hizalı 2×2; `--site-header-visible` ile yapışkan öğeler;
hover-sonrası-tıklama düzeltmesi; çekmece `aria-describedby`.
Eleştiri (kalan): rehber kartında kırpılmış metnin altında hâlâ boşluk var (CTA şeritle hizalı kalsın diye bilinçli);
kaydırılmış cam bar koyu zeminde çok hafif gri tonlu (cam etkisinin bedeli; beyaz isteniyorsa `--ek-color-background`
oranı %94 → %97); 800 px çekmecenin altı geniş boş (içerik az — kabul).

**S24 birleşmesi** — S24'ün bar kararları (ortada öğeler, "Fiyatlar", metin "Giriş", ayraçsız) alındı; S24'ün Ürün
paneli Otopilot kartı S25 modelinde zaten vardı. → `*-sonra`.

## Testler (bulut, son koşu)

- `npm run build` ✓ (49 sayfa)
- `vitest run`: **789 geçti / 2 kaldı** — kalan 2'si ortam kaynaklı: bulut kopyasında `INTEGRATIONS_REGISTRY.md` ve
  `BACKLOG.md` yok (claims evidence + N11 allowlist kanıtı); S24 tabanında da aynı 2'si kalıyor. Yeni:
  `tests/nav-menu.test.ts` (14 test: tek kayıt, kart/öne çıkan/şerit, kanal kapsamı, header+footer bağlantıları,
  çekmece; K46 cümle, plan satırları, yasak dil, fiyat sayfası). `claims.test` taraması menü ve K46 metinlerini de kapsar.
- Playwright (3 proje, `--update-snapshots=missing`): **445 geçti, 44 atlandı, 0 hata** — axe WCAG 2.1 AA her panel açık
  ve fiyat sayfasında 0 ihlal. Yeni e2e: panel içeriği + ortalama, hover niyeti, kaydırmada kısalan bar (akış sabit),
  tam ekran çekmece + sabit CTA + sayfa kilidi, K46 bölümü. `*-linux.png` commit'lenmedi.
- Lighthouse (mobil, 3 koşu medyanı): taslak 98 / 100 / 100; yayın 99 / 100 / 100 / **SEO 100**.

## Yerelde yapılacaklar

- Görsel tabanlar Windows'ta yenilenmeli (`*-win32.png`): site, inner-pages, pricing, legal ekran görüntüleri üst bar
  değiştiği için farklı.
- `docs/adr/USER_DECISIONS.md`: K46 fiyat kararı ("Otopilot her pakette; ayrı yapay zekâ ücreti yok; alt planda sınırlı,
  üst planlarda zamanlanmış/otonom ajan + yüksek kota; kendi yapay zekâ anahtarı") satırı eklenmeli (bulutta dosya yok).
- **Çelişki notu:** S24 vaat kaydının ana cümlesi "yalnızca onayınızla uygulayan ajanlar" der; K46'daki "otonom ajanlar"
  fiyat satırı "Kurallarınızla çalışan otonom ajanlar" olarak yazıldı (onayı kural olarak önceden verirsiniz). Ürün
  sahibi bu ifadeyi onaylamalı ya da satır "Kurallı otomatik öneriler" gibi daraltılmalı (`src/data/pricing.ts`
  `PLAN_AGENT_MATRIX`, tek satır).

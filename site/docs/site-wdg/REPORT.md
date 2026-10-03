# site-wdg raporu: web-design-guidelines denetimi ve tasarım yükseltmesi (K60)

Dal `cloud/site-wdg`, taban `origin/main` (3c839f8). Yalnız `site/` değişti. Bulguların tamamı `AUDIT.md`'de
(`dosya:satır - bulgu`, Wxx kimlikleriyle). İnceleme görüntüleri `once/` ve `sonra/` klasörlerinde: 15 rota, 1440 ve
390 px, reduced-motion, JPEG. Sitede koyu tema olmadığı için koyu tema görüntüsü yok.

## Özet

| Sınıf | Bulgu | Uygulanan | Atlanan |
|---|---|---|---|
| KRİTİK | 0 | 0 | 0 |
| YÜKSEK | 12 | **12** | 0 |
| ORTA | 22 | **14** (W13–W26) | 8 (W27–W34, gerekçe AUDIT.md'de) |
| DÜŞÜK | 25 madde | **7** (yer tutucu `…`, veride `...`→`…`, breadcrumb ayırıcı, `role="list"`, boş figure, logo `translate="no"`, SSS arama `name`) | 18 |
| ATLANDI (overengineering / ürün kararı) | 4 | — | 4 |

Ölçülen etki:
- **Odak görünürlüğü:** koyu yüzeylerde odak halkası kontrastı ~1,1:1'den ~6,4:1'e çıktı (W01). Betikle 16 rotada her
  odaklanabilir öğe tarandı: 3:1 altında halka kalmadı (değişiklikten sonra 0 öğe). Koyu hero içindeki açık 404 arama adası
  için ayrı istisna eklendi.
- **Metin kontrastı:** vurgu teal'i 4,36:1'den ~5,2:1'e çıktı (W03). ProblemSolution "Bugün" sütunu ~3,1:1'den ~5,3:1'e (W04),
  SSS sekme sayaçları 4,34:1'den AA'ya çıktı (W05). AssistantTeaser bağlantısı hover'da ~2:1'e düşüyordu (W06).
- **Çapa atlamaları:** yasal sayfada hedef başlığın üst kenarı 184 px'ten 96 px'e indi (W14). Yerel `scroll-margin` global
  `scroll-padding` ile toplanıyordu ve başlık iki üst bar kadar aşağıda kalıyordu.
- **Sözlük, 390 px:** yapışkan harf dizini 157 px'ten 61 px'e indi; tek satır, yatay kaydırılır (W09).
- **Kapsam hatası:** iç sayfa kapanış bandının başlığı ve gövdesi tasarlanan ölçeğe hiç çıkmıyordu (W10). 404 site haritası
  ızgarası da aynı nedenle uygulanmıyordu (W11). İkisi `dist-e2e` çıktısında doğrulandı.

## Sistem düzeyindeki değişiklikler (ortak katman)

| Dosya | Değişiklik | Bulgu |
|---|---|---|
| `styles/site-tokens.css` | `--site-accent` = teal %88 + lacivert %12 (aynı ton, AA) | W03 |
| `styles/global.css` | koyu yüzey eşlemesine `--site-color-focus-ring` (açık teal) | W01 |
| `styles/global.css` | `h1–h4 { text-wrap: balance }` (gövde `p`'ye site geneli `pretty` bilerek eklenmedi: yerleşim maliyeti) | W13 |
| `styles/global.css` | `html { color-scheme: light }` | W15 |
| `styles/global.css` | "Hareket" anahtarı kapalıyken hover hareketlerini sıfırlayan tek kural (kart yükselmesi, ikon dönmesi, düğme parıltısı). İki listeye bölündü: küçültücü `transform` ile `translate/rotate/scale`'i tek kısayola birleştirip bireyselleri sıfırlamadan bırakıyordu (tarayıcıda ölçüldü: kapalıyken `rotate/scale/translate` = `none`) | W17 |
| `layouts/BaseLayout.astro` | `theme-color` = sayfa zemini (beyaz) | W15 |
| `scripts/menu.ts` | mobil çekmece açıkken `main`, footer ve atlama bağlantısı `inert` | W07 |
| `components/Card.astro`, `pages/Accordion.astro`, `pages/CoverageMatrix.astro`, `rehber/GuideArticle.astro` | bağımsız kart = `--site-radius-panel` + `--site-shadow-card` | W19 |
| 11 dosyada `scroll-margin-top` | üst bar payı yalnız `html { scroll-padding-top }` içinde; yerelde yalnız ek pay | W14 |

## Sayfa başına kısa özet

| Rota | Değişiklik |
|---|---|
| `/` | Hero Otopilot kartında görünür odak halkası; tek ok kayması (W16). Sorun–çözüm "Bugün" sütunu okunur (W04, W26). Otopilot vitrini bağlantısının hover kontrastı (W06). Yetenek karoları, ekosistem ve fiyat kartlarında "Hareket" anahtarı hover'ı da durdurur (W17). Başlıklar dengeli. |
| `/otopilot` | Konsol figürü yardımcı teknolojiden tamamen gizlendi (içi zaten gizliydi). Başlıklar dengeli. |
| `/ozellikler` | Küme şeridinde odak halkası artık kırpılmıyor (W08). Numara rengi AA (W03). "Ayrıntı" açıcısına hover eklendi. Kapanış bandı display ölçeğinde (W10). |
| `/ozellikler/stok-rezervasyonu` | Kapanış bandı display ölçeğinde (W10). |
| `/entegrasyonlar`, `/entegrasyonlar/[kod]` | Hero rehber bağlantısının odağı görünür (W01). Hero kanal hapları 44 px (W25). "Diğer entegrasyonlar" kartında tek ok kayması ve "Hareket" sıfırlaması. Kapsam matrisi kartları panel diline geçti ve kart başlığına hover eklendi (W18, W19). |
| `/fiyatlandirma` | Vurgu tonu AA. Öne çıkan koyu kartta odak halkası açık teal. |
| `/guvenlik` | Hero hızlı bağlantıları 44 px, hover ve görünür odakla (W12). "Ayrıntı" hover'ı. Çapa payı düzeldi. Kapanış bandı display ölçeğinde (W10). |
| `/sss` | Sekme sayaçları AA (W05). Sekme şeridi odak halkasını kırpmıyor (W20). Hero bağlantılarına hover. Arama alanında `name="q"` ve yer tutucu `…`. Akordeon panel kart dilinde. |
| `/rehber`, `/rehber/[...]` | Pazar verisi kartı koyu yüzey olarak işaretlendi: odak ve hover çalışıyor (W02). Dar ekran tablolarına açık ARIA rolleri (W21). Geniş ekranda içindekiler açıcısı sekme durağı değil (W24). Kaynak başlıklarına hover. İlgili rehber kartları panel dilinde. |
| `/rehber/sozluk` | 390 px'te dizin tek satır ve kaydırılabilir; çapa payı düzeldi (W09). |
| `/destek` | Tek ok kayması (W16). "Tümünü gör" bağlantısına hover. Konu kartı "Hareket" anahtarına uyuyor. |
| `/iletisim` | Konu bağlantılarında çift okuma giderildi (W23). "Adresi kopyala" JS yokken gizli (W22). Tek ok kayması. |
| `/yasal/*` | Çapa ve içindekiler atlamaları başlığı üst barın hemen altına getiriyor (W14). Yazdır düğmesi ve ilgili belge kartlarına belirgin hover. |
| 404 | Site haritası ızgarası uygulanıyor (W11). Arama adasının odak halkası lacivert. Yer tutucu `…`. |
| Üst bar / çekmece / footer | Çekmece satırları ve kanal hapları hover zemini alıyor. Çekmece açıkken Tab arkaya kaçmıyor (W07). Logo `translate="no"`. |

## İçerik ve animasyon koruma kanıtı

- `git diff origin/main -- site/src/data`: yalnız iki tipografik karakter düzeltmesi var.
  - `src/data/kb/glossary.ts:43`: `(renk, beden, malzeme...)` → `(renk, beden, malzeme…)`
  - `src/data/kb/guides/pazaryerleri.ts:358`: `iade...)` → `iade…)`
- Sayfa metinleri: görünür metin değişmedi. Tek tipografik ek, iki yer tutucunun sonundaki `…` (`sss.astro`, `404.astro`).
  Başlıklar, CTA'lar ve SSS aynen kaldı. Bölüm sırası ve yapı da aynı; hiçbir bölüm eklenmedi ya da kaldırılmadı.
- Sahne ve animasyon dosyaları: `git diff --stat origin/main -- site/src/styles/scenes.css site/src/styles/scenes-loops.css`
  boş. Diffte `@keyframes`, `animation*` veya `--site-motion*` içeren eklenmiş ya da silinmiş satır yok
  (`git diff origin/main -- site/src | grep -E '^[-+]' | grep -iE '@keyframes|animation|--site-motion'` boş).
- Hareketle ilgili değişikliklerin hepsi izinli sınıfta:
  - Çift ok kayması (W16): hover'da aynı ok hem global kuralla hem yerel kuralla kayıyordu; yerel ikinci kayma kaldırıldı.
    Global ok hareketi (süre, mesafe, eğri) aynen duruyor.
  - "Hareket" anahtarı (W17): yalnız `data-motion=paused|reduced` altında hover hareketi sıfırlanıyor; oynatma
    modunda davranış birebir aynı.
  - Düğme parıltısı (W17): yalnız Hareket kapalıyken gizli.

## Testler

| Koşu | Sonuç |
|---|---|
| `vitest run` | 23 dosyadan 22'si geçti; **836 geçti, 2 başarısız**. Taban da aynı: başarısız iki test `claims.test.ts` içinde ve bulut kopyasında olmayan kök dosyaları (`INTEGRATIONS_REGISTRY.md`, `plans.seed.js`) arıyor; bu dal yeni hata eklemedi. |
| `npm run build` | Geçti: 49 sayfa. |
| Playwright son tam koşu (`--update-snapshots=missing`, 3 viewport) | **449 geçti, 46 atlandı, 0 başarısız.** |
| axe (WCAG 2.1 AA) | Spec içinde 14/14 geçti. Ek betikle 18 rota × 1440/390 tarandı: **0 ihlal** (önce de 0). |
| Odak halkası kontrast taraması (ek betik, 16 rota) | 3:1 altında halka **0**. Önce koyu yüzeylerde ~1,1:1'di. MotionToggle'ın halkası iç izde olduğu için betik onu "YOK" diye yanlış raporluyor. |
| Yatay taşma (390, 1440; 15 rota) | Yok. |

Ara koşularda ilk tam koşu, eksik `*-linux.png` tabanlarının ilk yazımı yüzünden 47 "başarısız" verdi; işlevsel hata yoktu.
`nav.spec.ts:176` (masaüstü hover niyeti) bazı tam koşularda düştü. Test, iki `mouse.move` arasının 120 ms'lik hover
gecikmesinden kısa sürmesine dayanıyor. Yük altında (8 işçi × 24 tekrar) taban ve dal art arda ölçüldü: taban **33/72**,
dal **31/72** başarısız. Fark yok; test tabanda da aynı oranda makine yüküne duyarlı. Önceki ölçümlerde dal kötü görünüyordu,
ama bu ölçümler farklı zamanlarda alınmıştı; aradaki fark yük sapmasıydı. İnceleme sırasında gerçek bir hata da bulundu ve
düzeltildi: yukarıdaki küçültücü birleşmesi (W17). Testin kendisi metin/davranış kapsamı dışında olduğu için değiştirilmedi.
Öneri: yerelde zamanlama payı artırılsın (ayrı iş).

### Yerelde yenilenecek win32 tabanları

Global değişiklikler (başlık dengeleme, `text-wrap: pretty`, vurgu tonu, kart dili) her sayfanın piksellerini etkiler. Bu
yüzden mevcut tabanların **tamamı** yerelde (Windows) yeniden üretilmeli: `npx playwright test --update-snapshots`.

- `site.spec.ts-snapshots/`: `home-*`, `components-*`, `not-found-*` (3 viewport), `menu-open-*` (mobil, tablet).
  Toplam 11 dosya.
- `inner-pages.spec.ts-snapshots/`: `inner-{destek, entegrasyon-ideasoft, entegrasyon-trendyol, entegrasyonlar, guvenlik,
  iletisim, ozellikler, sss, stok-rezervasyonu}-*` × 3 viewport. Toplam 27 dosya. Kapanış bandı display ölçeğine çıktığı
  için en belirgin fark `guvenlik`, `ozellikler` ve `stok-rezervasyonu`'nda.
- `legal.spec.ts-snapshots/`: `legal-kvkk-*` (3 dosya).
- `pricing.spec.ts-snapshots/`: `pricing-*` (3 dosya).

`*-linux.png` dosyaları commit'lenmedi (git-ignored).

## İnceleme rotaları

Yerelde `npm run preview` ya da `E2E_PORT=4501 node scripts/serve-e2e.mjs` ile:

- http://localhost:4501/: hero Otopilot kartına Tab, sorun–çözüm "Bugün" sütunu, Otopilot vitrin bağlantısında hover
- http://localhost:4501/guvenlik: hero bağlantıları (Tab + hover), "Ayrıntı" hover, kapanış bandı
- http://localhost:4501/ozellikler: küme şeridinde Tab, numara rengi, kapanış bandı
- http://localhost:4501/entegrasyonlar/trendyol: hero rehber bağlantısına Tab, kanal hapları, kapsam matrisi (390)
- http://localhost:4501/sss: sekme şeridinde Tab, sayaçlar, hero bağlantıları
- http://localhost:4501/rehber: pazar verisi kartının kaynak bağlantısı (Tab + hover)
- http://localhost:4501/rehber/sozluk: 390 px, harf dizini ve terime atlama
- http://localhost:4501/rehber/pazaryerleri/hakedis-ve-odeme-dongusu: 1440'ta içindekiler; 390'da tablo
- http://localhost:4501/destek, http://localhost:4501/iletisim: ok hover (tek kayma), "Hareket" kapalıyken kartlar
- http://localhost:4501/yasal/kvkk-aydinlatma: içindekiler atlamaları
- http://localhost:4501/olmayan-sayfa: arama adası odağı, site haritası ızgarası
- Mobil menü (390): çekmece açıkken Tab çekmecede kalır

## Metin veya animasyon gerektiren öneriler (uygulanmadı)

1. **Sayı ve birim arasında bölünmez boşluk** ("14 gün", "6 kanal", "{n} dk", "{n} terim"): içerik bekçi testleri
   (`home.test.ts:267,383`, `nav-menu.test.ts:70`) metni düz boşlukla arıyor. Testlerle birlikte ayrı metin işinde yapılmalı.
2. **Düz kesme işareti → `’`** (`Entegrasyonik'e`, `ERP'niz` …): site ve veri genelinde yüzlerce yer. Tek tip sözlük ve test gerekir.
3. **SSS hızlı yanıt açılımı** (`FaqPreview.astro:223-232`) yerleşim özelliği olan `grid-template-rows`'u canlandırıyor.
   Kompozitör dostu bir yönteme geçmek animasyonun kendisini değiştirir.
4. **Fiyat sayacı** (`PricingSummary.astro:79`) 0'dan biçimsiz sayıp sonunda `₺2.490` biçimine atlıyor. Biçimli sayım animasyon değişikliğidir.
5. **Asistan "Yanıt hazırlanıyor"** (`data/assistant.ts:227`): yükleniyor durumu, kurala göre `…` ile bitmeli.
6. **Footer künye işaretleri** (`Footer.astro:119`): taslakta `{{ŞİRKET_UNVANI}}` ekran okuyucuda okunuyor. Yayın kapısı (A1) ile birlikte ele alınmalı.
7. **Kanal sayfasında rehber yoksa** (`[code].astro:206-212`): "nasıl bağlanır" başlığı koşullu gizlenmeli. Bugün 6 kanalın hepsinde rehber var.
8. **SSS aramasında sekme sayaçları** eşleşme sayısını göstermeli (davranış değişikliği). Arama/filtre durumunun URL'ye yazılması ürün kararı.

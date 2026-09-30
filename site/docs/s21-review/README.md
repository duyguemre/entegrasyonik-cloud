# S21 — Hero "Operasyon merkezi" çerçevesi (uygulama penceresi)

Kullanıcı: *"Sitede operasyon merkezi animasyonu güzel, ancak buradaki çerçeveyi daha cool, premium, site ile daha uyumlu,
daha albenili sunabilecek bir yol var mı?"* — Animasyonun kendisi (4 sahne, 30 sn döngü, içerik, statik hâl) **aynen korundu**;
yalnızca çerçeve ve sunum değişti. Dal: `cloud/site-s21` (taban `cloud/site-s17` + `s18` + `s19` birleşimi).

Görüntüler bulutta (Linux Chromium) alındı; nihai görsel onay yerelde (Windows) yapılır.
Yeniden üretmek için: `npm run build && ./docs/s21-review/restart-server.sh && node docs/s21-review/capture.mjs <önek> [--frame=a|b|c] [--reduced] [--only=1440,390]`.

## 1. Önce — eleştiri (`once-*.png`)

| Sorun | Neden kötü |
|---|---|
| Arkada ofsetli iki "hayalet" panel (S9 derinlik yığını) | Kenarları sahneye hizasız (sağ üstte ve altta farklı paylarla taşıyor), gri, sert çizgiler; derinlik yerine "üst üste konmuş karton" hissi. Sahneyle dikkat yarıştırıyor. |
| Pencere çubuğu yalnızca sola yaslı küçük bir başlık | Uygulama olduğu hissi zayıf; hiyerarşi yok, çubuk sahneden ayrışmıyor. |
| Degrade kenarlık | Sol üstte hafif teal dışında kenar neredeyse düz gri görünüyor; marka gradyanı okunmuyor. |
| Zemin | Panel arka planda asılı; altında oturacağı bir ışık/gölge yok. |
| 390 px | Arka paneller kırpılıyor, çerçeve ekstra bilgi taşımıyor. |

## 2. Alternatifler (aynı sahne anı, 1440 + 390 + yakın çekim 2x)

| Aday | Görüntü | Güçlü | Zayıf |
|---|---|---|---|
| **A — Uygulama penceresi** (cam/ışık kenarı) | `aday-a-*.png` | Tek, temiz silüet; pencere çubuğu (nötr noktalar + ortada başlık hapı + sessiz araç çubukları) "gerçek ürün" hissi veriyor; kenar ışığı marka gradyanından; içerik keskin. | İlk sürümde kenar ışığı silik, kasa hissi zayıf (→ iterasyonlarla giderildi). |
| B — Katmanlı derinlik | `aday-b-*.png` | Dinamik, "3B" görünüm. | Perspektif (rotateY) metni yumuşatıyor/bulanıklaştırıyor; arkadaki ızgaralı panel eski hayalet panel sorununu geri getiriyor; mevcut imleç eğimi (`data-tilt`) ile çakışıyor; 390'da anlamsız. |
| C — Çerçevesiz sahne + durum rozetleri | `aday-c-*.png` | Arka plana kaynayan, hafif görünüm. | Sahne sınırı olmadan içerik dağınık süzülüyor; hero ızgarası içerikten geçiyor; konumlandırılmış rozetler sahne öğelerinin (Web mağaza/Rezerve) üstüne biniyor; sahneler değiştikçe rozet çakışması öngörülemez; tekrar eden metin. |

## 3. Karar — A (uygulama penceresi)

Gerekçe: sitenin geri kalanı (Capabilities kartları, PageHero, cam yüzeyler) zaten *cam + ince ışık kenarı + koyu sahne* dilini
kullanıyor; A bu dili tek ve güçlü bir silüette topluyor. Metin keskinliği ve okunurluk korunuyor (B'nin aksine), içerikle
çakışma yok (C'nin aksine), 390'da doğal olarak sadeleşiyor. Referans seviye (Linear/Stripe ürün görselleri) ile de uyumlu.

### İterasyonlar

| # | Görüntü | Eleştiri → değişiklik |
|---|---|---|
| 1 | `it1-*.png` | Hayalet paneller + paralaks kaldırıldı, pencere çubuğu eklendi. Eleştiri: kasa hissi yok, kenar ışığı silik. |
| 2 | `it2-*.png` | Cam kasa (bezel): gölge halkası ile 6 px yarı saydam ikinci çerçeve + kılcal kenar. Eleştiri: kasa kenarı biraz gri/ağır, üst ışık hâlâ belirsiz. |
| 3 | `it3-*.png` | Kasa kenarı yumuşatıldı; üst kenar ışığı ortada parlayan çizgi + daha güçlü ışıma; zemin ışıması panelin altına toplandı. |
| 4 | `it4-guvenlik-*.png` | Kontrol: 4. sahne (Güvenlik) aynı çerçevede tutarlı, boyut değişmiyor. Değişiklik gerekmedi. |

### Sonra (`sonra-*.png`, `sonra-reduced-*.png`)

- 1440 / 1920: panel sütununda dengeli; kasa + kenar ışığı + zemin ışıması; ofset paneller yok.
- 390: araç çubukları gizli, pencere noktaları sıkı, başlık hapı sağa; dış ışıma küçültüldü; yatay taşma yok (e2e ile doğrulanır).
- Reduced-motion: statik son durum (stok 9, rezerve 3), kenar ışığı ve kasa aynen — hareket olmadan da şık.

## Hareket ve performans

- Tek yeni hareket: üst kenar ışığında **her sahne geçişinde bir kez** (30 sn'de 4 kez) sakin bir parıltı süpürmesi
  (`loop-frame-sheen`, `scenes-loops.css`): yalnızca `translate` + `opacity`, show döngüsüyle aynı kapılar
  (paused başlar → görünürken running → üzerine gelince paused; "Hareket" anahtarı ve reduced-motion'da hiç yok).
- Çerçeve süsleri `position: absolute` / gölge / arka plan → yerleşime girmez; sahne yüksekliği değişmez (**CLS 0**).
  Görsel dosya yok, filtre/blur yok (kasa gölge halkasıdır) → LCP'ye etkisi yok.
- Ham renk/px/süre yok; tüm değerler `--ek-*` / `--site-*` token'larından (tokens.test.ts yeşil).
- Not: S9 paralaks kodu (`src/scripts/interactions.ts`, `[data-parallax-root]`) artık hedefsiz → kendiliğinden no-op.
  Paylaşılan betik olduğu için bu turda dokunulmadı; yerel birleştirmede silinebilir.

## Testler

- Yeni `tests/hero-frame.test.ts` (6): pencere çubuğu yapısı, hayalet panel/paralaks geri gelmez, CLS rezervi (mutlak konumlu
  süsler, tek hücreli sahne ızgarası), statik hâlde parıltı görünmez/kenar ışığı var, parıltı keyframes yalnızca
  translate/opacity + `no-preference` içinde + üç kapı, 390 sadeleşmesi. (Kapıdan `frame-sheen` çıkarılınca test kırılıyor — doğrulandı.)
- `e2e/specs/home-premium.spec.ts` → "S21: hero çerçevesi": sahne geçişi + parıltı boyunca çerçeve boyutu sabit, CLS < 0,01,
  yatay taşma yok; reduced-motion'da parıltı opacity 0 ve animasyonsuz, kenar ışığı + pencere çubuğu görünür.
- `npm run build` ✓; `npm test` 580/582 — kalan 2 hata **önceden var** (`tests/claims.test.ts`: bulut kopyasında kökteki
  `INTEGRATIONS_REGISTRY.md` yok; bu dal ve S21 değişikliğiyle ilgisiz).
- Tam Playwright (3 viewport, axe dahil): 413 geçti, 19 atlandı (bulutta Chromium `/opt/pw-browsers/chromium`; `*-linux.png` commit'lenmedi).

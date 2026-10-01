# site-fair inceleme: adil rekabet ilkesi (PRC-MKT, K58)

Dal `cloud/site-fair`. Taban `origin/cloud/site-s27c`, üstüne `origin/cloud/site-s27a` birleştirildi (çakışma yok;
yalnız s27a inceleme README'si geldi). Yalnız `site/` değişti. Metin seçenekleri ve bekçi kapsamı `COPY.md`'de.

Görüntüler bulutta, Linux Chromium ile alındı (reduced-motion). 1440 genişlik %60, 390 genişlik %80 ölçekli.
Bölüm görüntülerinde yapışkan üst bar araya girebilir; bu, ekran görüntüsü yönteminden kaynaklanır.
Görsel onay yerelde (Windows) yapılır.

| Görüntü | `once/` | `sonra/` |
|---|---|---|
| `/guvenlik` (tam sayfa) | Güvence ilkeleri → Kapsam | Hero'da "Adil rekabet" eylemi; Güvence ilkeleri → **Adil rekabet** (açık gri zemin, solda başlık, sağda 2×2 ince çizgili ilke listesi) → Kapsam (zemin beyaza döndü, açık/koyu ritim korunur) |
| Ana sayfa `#guvenlik` | Dört sütun + kalkan vitrini | Altta tek satırlık **"Adil rekabet ilkemiz"** bandı (kontur ikon, kısa cümle, "İlkelerimizi okuyun →"); 390'da bağlantı alt satıra iner |
| `/otopilot#kontrol` | 5 güvence maddesi (3 + 2) | 6 madde (3 + 3): **"Fiyatınız, sizin kuralınız"** |
| `/sss#guvenlik-veri` | Beş soru | Yeni soru: "Entegrasyonik fiyatlarıma karar verir mi…" |

## Tasarım kararları

- **Yer:** Ana tutum `/guvenlik` sayfasında, çünkü "Verileriniz sizin, kontrol sizde" çerçevesinin doğal devamıdır.
  Ana sayfada tek satır var. Güvenlik iddiaları ana sayfada bir kez geçer kuralı (BRAND §5) korunur; satır yeni bir
  iddia taşır: fiyat kararı ve veri kullanımı. Otopilot'ta bir güvence maddesi, SSS'te bir soru var.
- **Görsel ağırlık:** Güvence kartlarından hafif tutuldu: dolu ikon karosu ve "Ayrıntı" paneli yok; teknik ayrıntı da yok (K44).
  Degrade vurgu ve koyu sahne eklenmedi (BRAND §4 vurgu ekonomisi).
- **Dil:** Yalnız ilke dili kullanıldı. Hiçbir cümle bugün olmayan bir özelliği ima etmez (K43). "Rakibe değil pazara bakın" yerine "Rakibe değil,
  işinize odaklanın" yazıldı (gerekçe `COPY.md` §1 İlke 4).

## Doğrulama

- `vitest`: 23 dosyadan 22'si yeşil. `tests/fair-play.test.ts` 35/35 geçiyor. `claims.test.ts` içinde 2 hata var, ikisi de tabanda da kırmızı:
  bulut kopyasında kökteki `INTEGRATIONS_REGISTRY.md` ve `plans.seed.js` yok. Bu dalın eklediği kanıtlarda eksik yok.
- `astro build` (test içinde) yeşil.
- Playwright (`a11y`, `home`, `home-premium`, `inner-pages`, üç viewport, `--update-snapshots=missing`): 247 test geçti.
  30 "hata" eksik Linux tabanlarının ilk yazımıydı ve yeniden koşuda geçti. axe (WCAG 2.1 AA) temiz.
  Linux tabanları git-ignored; Windows tabanları `guvenlik`/`otopilot`/ana sayfa için yerelde yenilenmeli.
- 390 ve 1440'ta yatay taşma yok (ölçüm betiği).

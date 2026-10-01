# S26 inceleme — sıfır aşırı satış animasyonu + animasyon anahtarı

Dal: `cloud/site-s26`. Taban: `cloud/site-s25` (S25 bitmişti: `site/docs/s25-review/` + `NAV_DECISION.md` commit'li);
iş bekleme sırasında S24 üzerinde başladı, S25 gelince birleştirildi. Yalnız `site/` değişti.
Kaynak: `docs/cloud-contracts/SITE_FEEDBACK_R3_2026-10-01.md` madde 12 ve 13.

## Görüntüler

Bulutta Linux Chromium ile alındı; görsel onay yerelde (Windows) yapılır.

| Konu | 1440 | 390 |
|---|---|---|
| Animasyon kare dizisi (1. perde) | `anim-1440-01..05-*` | `anim-390-01..05-*` |
| Sonraki perdeler (farklı ürün + kanal) | `anim-1440-06/07/08-perde*` | `anim-390-06/07/08-perde*` |
| Reduced-motion son kare | `anim-1440-reduced-son-kare`, `bolum-1440-reduced` | `anim-390-reduced-son-kare`, `bolum-390-reduced` |
| Anahtar durumları | `anahtar-1440-1..7-*` | `anahtar-390-1..7-*` |
| Üst barda anahtar | `ustbar-1440-anahtar-acik/kapali` | `ustbar-390-anahtar-acik/kapali` |

Kare adları: `01-baslangic` (ürün, tüm kanallar aynı stok) · `02-siparis` ("Yeni sipariş", ışık paketi merkeze iner) ·
`03-rezerve` (merkezde 6→5 + "Rezerve edildi") · `04-dalga` (merkezden diğer kanallara geri dalga) · `05-esszamanli`
(tüm rozetler aynı anda 5; "Tüm kanallarda eşzamanlı · aşırı satış yok" parlar).
Anahtar: `1-acik` · `2-uzerinde` · `3-kapali-odak` (klavye odağı) · `4-kapali` · `5/6-koyu-zemin-*` (ÖNİZLEME: anahtar
koyu hero yüzeyine DOM'da taşındı; canlı yerleşim üst bardır) · `7-sistem-hareket-azaltma` (kapalı + devre dışı).
Önceki hâl için: `site/docs/s25-review/` ve `site/docs/s24-review/` (anasayfa görüntüleri).

## Kararlar

**12 — Operasyon merkezi (Sorun → çözüm "Entegrasyonik ile" kartı, `ProblemSolution.astro`)**
- Sabit "6 — Kullanılabilir stok — tek merkezden tüm kanallara" kartı kalktı. Yerine dört perdelik hikâye: bir kanaldan
  sipariş → ışık paketi merkeze → merkezde stok bir adet düşer + kısa "Rezerve edildi" vurgusu (sipariş gelen kanal da
  güncellenir) → geri dalga → diğer TÜM kanal rozetleri aynı anda yeni değere geçer → "Tüm kanallarda eşzamanlı · aşırı
  satış yok".
- Döngü 30 sn = 4 perde × 7,5 sn (sakin tempo; hero vitriniyle aynı süre jetonu). Her perde farklı ürün ve farklı
  kanal (Keten gömlek 6→5, Deri cüzdan 3→2, Seramik kupa 12→11, Spor çanta 9→8). Saf CSS: perdeye özgü öğeler tam döngüde,
  negatif gecikmeyle kaydırılır; ortak öğeler (hat, merkez, sonuç) perde başına bir tur. Yalnız opacity/translate/scale;
  görünmezken ve sekme arka plandayken durur.
- Kanal rozetleri sitenin standart bileşeni `ChannelMono` (S23 biçimi; yalnız ilk harf, kanal adı yazılmaz).
- Reduced-motion / anahtar kapalı / JS'siz: tek anlamlı SON kare — 1. perdenin sonu (sipariş etiketi, merkezde 5 +
  "Rezerve edildi", dört kanalda 5, sonuç etiketi).

**13 — Animasyon anahtarı (`MotionToggle.astro`, `scripts/scenes.ts`)**
- Simge düğmesi → `role="switch"` + `aria-checked` anahtar: dalga simgesi + kayan topuzlu ray; açıkta ray marka
  rengiyle dolar, topuz yumuşakça (200 ms, yalnız transform) kayar. Ad görünür olmayan "Animasyon" etiketinden
  (`aria-labelledby`), açıklama `aria-describedby` ("Tercihiniz bu cihazda hatırlanır."), `title` durumu söyler.
- Yer: S25 NAV_DECISION'daki üst bar düzeni (CTA'dan sonra, "simge hareket kontrolü"); S24 sadelik kararı gereği görünür
  metin etiketi yok. < 24rem'de simge gizlenir, yalnız ray kalır (320 px'te header taşmaz).
- Odak halkası rayın çevresinde; renkler yerel `--mt-*` değişkenleri, koyu yüzeyde (`[data-surface='dark']`,
  `.section--stage`) açık tonlara döner.
- Tercih kalıcı (localStorage, çerez yok). Sistem `prefers-reduced-motion: reduce` → anahtar KAPALI + `aria-disabled`,
  açıklama "Cihazınızda hareket azaltma açık; animasyonlar kapalı kalır." (sistem ayarı geçersiz kılınmaz; önceden gizleniyordu).

## İterasyonlar

1. İlk sürüm: kare dizisi doğru akıyordu; eleştiri: sonuç etiketi "aşırı satış / yok" diye bölünüyordu, 390'da kenardaki
   kanalda "Yeni sipariş" etiketi kart dışına taşıyordu. → Etiket iki parçalı ve kırılmaz (ayraçtan kırılır); etiket
   konumu mutlak, kenar kanallarda içe hizalı.
2. Anahtar: ilk sürüm görünür "Animasyon" etiketi taşıyordu; S25 birleşmesinde S24/S25 üst bar sadeliği (yalnız simge)
   ile çelişti → etiket görsel olarak gizlendi (ad kaynağı olarak kaldı). e2e 320 px'te 24 px taşma yakaladı → en dar
   ekranda simge gizlendi. Reduced-motion'da tıklama tercihi değiştirmez (e2e ile doğrulandı).

## Testler

- `vitest run`: 789 geçti, 2 başarısız — ikisi de `claims.test.ts` içinde, bulut kopyasında olmayan kök
  `INTEGRATIONS_REGISTRY.md` dosyası yüzünden (ortam; bu işle ilgisiz).
- `astro build`: 49 sayfa, hatasız.
- Playwright (`--update-snapshots=missing`, 3 viewport): home-premium, home, inner-pages, nav, site, a11y (axe) →
  340 geçti, 44 atlandı. `*-linux.png` tabanları commit'lenmedi.
- Güncellenen/yeni testler: `tests/home.test.ts` (hikâye son karesi, perdeler, anahtar), `tests/home-demos.test.ts`
  (perde zamanlaması), `tests/scenes.test.ts` (switch sözleşmesi, görünüm), `e2e/specs/home-premium.spec.ts`,
  `e2e/specs/inner-pages.spec.ts`.

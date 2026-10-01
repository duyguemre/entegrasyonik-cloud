# fe-r3c — Çıktılar / şablon tasarımcısı (FR3 madde 15)

Dal `cloud/fe-r3c` (taban `origin/main` @ f2b08ec8). Karar: K49 (FR3 maddeleri onaylı; madde 15 "pazar araştırması +
üst düzey yeniden tasarım"). Yalnız `frontend/` değişti; backend sözleşmesi aynı.

Görüntüler: `before/` (eski ekran) ve `after/` — `<durum>-<light|dark>-<1440|390>.png`, makine bulguları `*/axe/*.json`.
Üretici: `e2e/specs/fe-r3c-review.spec.ts` (`R3C_REVIEW=1 R3C_WIDTH=1440|390 R3C_OUT=docs/fe-r3c-review/after`).

| Durum | Ne gösterir |
|---|---|
| `ciktilar` | Galeri: tür süzgeci, "Şablonlarım" (boş şablon kutusu), 6 hazır şablon (gerçek render küçük resim) |
| `editor` | Kargo etiketi 100×150 kopyası, bir alan seçili: sol alanlar, orta tuval (mm, ızgara, kenar kılavuzu, seçim), sağ özellikler |
| `editor-fatura` | Sipariş fişi A4, seçim yok: sağda belge ayarları, katmanlar, denetim, kısayollar |
| `onizleme` | Önizleme ve yazdırma: örnek / uzun içerik / eksik bilgi ya da "Siparişlerim", denetim, kopya |

## 1. Araştırma özeti

Tam belge: `frontend/docs/research/TEMPLATE_DESIGNER_2026-10-01.md` (iç belge; ürün adları uygulamada geçmez).
Sektör iki kampa ayrılıyor: kod tabanlı (HTML + şablon dili) ve görsel sürükle-bırak. Hedef kitle teknik olmayan
satıcı → görsel editör birincil. Uygulanan bulgular:

- Belge türüne göre galeri; sistem şablonu salt-okunur, "kopyasını düzenle"; tür başına varsayılan (1.1–1.3, 13).
- Üç panelli editör: sol alanlar/bileşenler, orta tuval, sağ özellikler (12.1).
- Gruplu, aranabilir alan paleti ve her alanda örnek değer (3.1–3.3).
- Gerçek siparişle önizleme + stres verisi (uzun ad, çok kalem, boş alan) + taşma uyarısı; önizleme ve yazdırma tek
  render motoru (4.1–4.3, 4.6–4.7).
- Kâğıt ön ayarları mm: A4, A5, 100×150 termal, 100×100, 80 mm rulo; yön; kenar boşluğu kılavuzu (5.1–5.4).
- Barkod (Code128, EAN-13 kontrol hanesi) ve QR, bir alana bağlı, okunur metin aç/kapa, küçük boyut uyarısı (7.1–7.5).
- Kalem tablosu: sütun seçimi, zebra, sığmayan kalemler "+N kalem daha" + denetim uyarısı (8.1, 8.5).
- Izgaraya yapışma, ok tuşuyla 1 mm / Shift ile 5 mm, kâğıda hizala, yakınlaştır/sığdır, geri al/yinele (6.1–6.4, 9.1).
- Toplu yazdırma: çoklu sipariş → sayfa başına bir sipariş, `@page` boyutu gömülü, PDF tarayıcıdan (10.1–10.3).

Kapsam dışı (bilinçli): e-Fatura/e-Arşiv/e-İrsaliye üretimi (entegratör PDF'i; "İrsaliye taslağı" e-İrsaliye yerine
geçmediğini kendi üzerinde yazar), ZPL, çok sayfalı otomatik bölme, sürüm geçmişi → `PROPOSALS_PENDING.md` C01–C09.

## 2. Tasarım kararları

| Karar | Gerekçe |
|---|---|
| Bilgi mimarisi: **Galeri → Düzenleyici → Önizleme → Yazdır**, tek sekmede görünüm geçişi | Araştırma 12; sekme sayısı artmaz. Düzenleyiciden önizlemeye geçince düzenleyici açık kalır (geçmiş ve kaydedilmemiş durum korunur) |
| Hazır şablonlar salt-okunur | Güncellemede kaybolma/geri dönüşsüz bozma riski (anti-pattern) |
| **Tek render motoru**: `TemplatePage` (Vue render fonksiyonu) + `geometryCss` | Tuval, küçük resim, önizleme, yazdırma aynı DOM ve CSS. `v-html`/`innerHTML`/`document.write` YOK (R7 G-01/G-02); barkod/QR modül dizisinden SVG `rect`. Eski taslağın ham HTML kaydı güvenlik envanterinden düştü |
| Konum yalnız üretilen CSS kuralında | Satır içi stil yok (style-ratchet); sürüklerken içerik yeniden çizilmez, odak korunur |
| Kâğıt her temada beyaz (`color-scheme: light` + `Canvas/CanvasText`) | Belge önizlemesi kâğıdın gerçek görünümü; literal renk yok. Uygulamanın genel tablo kuralı kâğıt tablosuna sızıyordu → kâğıt kapsamlı kural |
| Birim mm / pt; kullanıcı piksel görmez | Araştırma 5.2 |
| Saklama: bu tarayıcı, kullanıcı + mağaza kapsamlı (`useSavedViews` emsali) ve ekranda söylenir | Backend şablon sözleşmesi yok (C01). Depolama kapalıysa uyarı + bellek içi çalışma |
| Gerçek veri: mevcut `OrderService/getOrders` (son 20, yalnız istenince) | Yeni backend alanı gerekmez; galeri açılışı istek atmaz |
| Sipariş ekranındaki "Kargo etiketi yazdır" değişmedi | "Mevcut çıktı üretimi bozulmamalı"; varsayılan şablona bağlama C06 (onay bekler) |
| Dar düzen kabın genişliğine göre (≥1120 tam, 880–1120 sıkı, <880 sekmeli: Ekle · Tuval · Özellikler) | Kenar menüsü açık/kapalıyken pencere genişliği yanıltıcı; 1280 dizüstünde üç panel korunur |
| Hareket yalnız `--ek-transition-colors` (fe-r3a `FR3_PATTERNS` §1 "feedback" rolü) | Tek kaynak; ham `--ek-duration-*`/`--ek-easing-*` yok; azaltılmış harekette kapalı |
| Ortak bileşenler değişmedi | `EkPageHeader`, `EkPageTabs`, `EkButton`, `EkFormSection`, `EkRowActions`, `EkConfirmDialog`, `EkFormDialog`, `EkErrorState`… yalnız kullanıldı (kabuk/ui paketi fe-r3a'nın) |

Durumlar: boş (Şablonlarım boş → "Boş şablon" kutusu; tuval boş → katmanlarda ilk kullanım), yükleniyor (siparişler
iskelet), hata ("Siparişler yüklenemedi — …" + Tekrar dene; örnek veriyle devam), denetim (hata/uyarı, öğeye git).

Klavye: Tab ile tuvaldeki öğeler (erişilebilir ad: "Alan: Alıcı adı soyadı"), oklar 1 mm, Shift+ok 5 mm, Del, Ctrl+D,
Ctrl+Z / Ctrl+Shift+Z (Ctrl+Y), Ctrl+S, + / −, Ctrl+0, Esc. Kısayollar sağ panelde listelenir; durum değişiklikleri
`aria-live` ile duyurulur.

## 3. İterasyonlar (uygula → doğrula → eleştir)

1. **İlk sürüm** (galeri + editör + önizleme, HTML dizesi render). Eleştiri: sayfa dolgusu kaybolmuş, depolama notu
   taşıyor, boş durum ana alanı kaplıyor, editör 1440'ta dar düzene düşüyor, araç çubuğundaki geri al/yinele/ızgara
   görünmüyor (ipucu bileşeninin varsayılan yuvası yanlış kullanılmış).
2. **Düzeltme turu**: dolgu, "Boş şablon" kutusu, kap genişliğine göre düzen, ipucu yuvası. Eleştiri: önizleme sayfası
   alanı aşıyor (yüksekliğe sığdırma yok), önizlemeden dönünce düzenleyici sıfırlanıyor (kaydedilmemiş değişiklik
   uyarısız kaybolabilirdi), sol panel sekmeleri esnek kutuda 11 px'e eziliyordu.
3. **Testlerin bulduğu gerçek hatalar**: odaklı öğe geri alınınca kısayollar çalışmıyordu (odak `<body>`'ye düşüyor) →
   belge düzeyinde kısayol dinleyici; dar önizlemede ayar paneli eziliyordu; güvenlik envanteri `v-html`'i reddetti →
   render motoru Vue render fonksiyonuna taşındı (HTML dizesi yok, SSR ile test edilir); axe karanlık temada kâğıt
   tablosunda 1,21 kontrast buldu (genel tablo kuralı sızıyordu) → düzeltildi; 1280 masaüstünde üç panel için sıkı düzen.
4. **Son rötuş**: fe-r3a hareket rolleri, dar ekranda önizlemede önce sayfa, işaretçiyle sürükleme testi.

## 4. Testler (bulut, 2026-10-01)

| Kontrol | Sonuç |
|---|---|
| `npx vitest run` | 76 dosya, 1554/1554 geçti (yeni: `tests/r3c-printout-templates.test.ts` 25 test — model, veri eşleme, doğrulama, geçmiş, saklama, SSR render/XSS, `BarcodePrintComponent` korunur) |
| `vue-tsc --noEmit` | 0 hata |
| `npm run build` | bkz. rapor (başarılı) |
| ratchet'ler (style, pattern, no-console, typecheck) | OK; `PrintoutListView` satır içi stil 1→0, console 3→0 (taban düşürüldü) |
| `e2e/specs/printouts.spec.ts` | 10/10 × chromium-mobile, -tablet, -desktop (galeri, kopyala-kaydet-yenile, sil, ekle/geri al/yinele/ok/Del, işaretçi sürükleme, paletten bırakma, yön + kaydedilmemiş uyarısı, stres denetimi + yazdırma belgesi, Siparişlerim toplu yazdırma, hata durumu) |
| axe (wcag2a/aa, 21aa) light + dark × 1440 + 390 × 4 durum | 0 ihlal, yatay taşma yok (`after/axe/*.json`) |

Not: Chromium sürüm farkı nedeniyle Playwright `playwright.cloud.config.ts` (önceden kurulu Chromium) ile koşuldu;
görsel taban (`*-win32.png`) bu ekran için yok, görsel onay yerelde.

## 5. Backend istekleri

`frontend/docs/PROPOSALS_PENDING.md` → "Çıktılar / şablon tasarımcısı": C01 şablon kaydı API'si, C02 sürüm/taslak-yayın,
C03 yazdırıldı damgası, C04 pazaryeri etiket PDF'i (`labelUrl`) önizlemede, C05 mağaza bilgisi alanları; akış önerileri
C06 sipariş listesinden varsayılan şablonla yazdırma, C07 çok sayfalı bölme, C08 menü yeri, C09 ZPL/dpi.

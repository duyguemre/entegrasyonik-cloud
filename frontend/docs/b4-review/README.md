# B4 — sol menü + breadcrumb inceleme (`cloud/fe-b4`)

Araç: `B4_REVIEW=1 B4_REVIEW_WIDTH=1440|800|390 B4_REVIEW_OUT=docs/b4-review/after npx playwright test e2e/specs/b4-review.spec.ts --project=chromium-desktop`
(2x cihaz ölçeği; kapanış/açılış kareleri tüm CSS geçişleri duraklatılıp aynı ana sarılarak alınır → deterministik).
`before/` = taban (`ds-v2-a6b` + A7/A9/A10/A11 birleşimi), `after/` = son kod. Görsel onay yerelde (Windows).

## Eleştiri → karar

| # | Gözlem (önce) | Karar (sonra) | Kanıt |
|---|---|---|---|
| 1 | Grup başlığı (Ürün Kataloğu) etkin sayfanın üstü olduğunda ikonu mavi + kalın; bölüm başlıkları öğe renginde → "gruplar renkli/açık" | Bölüm başlığı `content-muted`; grup nötr (yalnız metin bir kademe koyu, ikon `content-default`); **vurgu yalnız etkin öğede** | `menu-acik-yakin`, `menu-acik` |
| 2 | Etkin göstergesi için 2 alternatif | **A — hafif ton zemin + 3px sol çizgi (seçildi)**: sakin, metin AA, hover ile karışmıyor. B — dolgulu hap (`alt-aktif-b-hap`): güçlü ama menüde en ağır öğe oluyor, üst bar degradesiyle yarışıyor → elendi | `menu-acik-yakin` vs `alt-aktif-b-hap` |
| 3 | Daralt = ray bileşenine anlık takas (içerik kaybolur, ikonlar dikeyde ~32px zıplar, genişlet düğmesi üste taşınır) | Tam ↔ ray **aynı çekmece**: içerik önce opaklıkla solar (fast), genişlik yarım solma kadar gecikip `slow`/ease-out ile daralır; içerik kabuğu aynı eğriyle kayar. Etiketler DOM'da kalır ve sabit genişlikte → yeniden sarılmaz/kırpılmaz. İkon x ekseni iki durumda aynı (ray merkezi 32px). Düğme aynı yerde, ok genişlikle birlikte 180° döner. Açılış tersi: önce genişlik, içerik yarıda belirir | `menu-kapanis-1/2/3/4-son`, `menu-acilis-1/2/3` |
| 4 | İlk koreografi turunda: rayda grup ikonu hemen etkinleşiyor, alt öğe hâlâ görünürken **iki vurgulu hap** | Ray'da grup vurgusu alt liste solduktan sonra belirir (gecikmeli zemin + gösterge) | `menu-kapanis-1` |
| 5 | Kapalı alt listenin dolgusu 0fr'de ~6px boşluk bırakıyordu (grup altı aralık farklı) | Kırpıcı ayrı katman (`ek-side__subclip`) → kapalı grup 0px | `menu-acik`, `crumb-derin-tam-1440` |
| 6 | Hover/etkin yarı kalın ağırlık, zemin düğmede → olası yeniden sarılma | Ağırlık sabit; zemin + odak halkası `::after` sahte öğede → **layout shift 0** (e2e kutu karşılaştırması) | `menu-odak` |
| 7 | Breadcrumb: kök = ayrı ikon karosu (lacivert), ara öğeler düz metin, `/` ayraç | **A — nötr çip (seçildi)**: kök + ara öğeler 28px ince kenarlı, çok hafif zeminli çip; hover'da zemin `surface` + kenarlık koyulaşır; ayraç ince chevron (`content-subtle`); son öğe H1. B — karma (`alt-crumb-b-karma`): yalnız kök çip, ara öğeler düz metin → hafif ama ara bağlantılar dinlenirken tıklanabilir görünmüyor → elendi | `crumb-a-cip(-hover)` vs `alt-crumb-b-karma(-hover)` |
| 8 | (i) ikonu 18px dolgu hissi, açıkken mavi zemin + mavi kenarlık → "amatör" | 24px yuvarlak nötr düğme, ince `?` (14px), `border-default`; hover/açık: kenarlık + metin koyulaşır (renk yok); `EkTooltip` + token odak halkası. Davranış/API aynı | `crumb-*-yakin`, `crumb-derin-yardim-odak-yakin`, `crumb-hakkinda-yakin` |
| 9 | 800px: arama alanı H1'in üzerine biniyordu (önceden de vardı) | Kök çip de kısalabilir; yol en kısa hâlinde sığmıyorsa eylemler alt satıra iner (`is-stacked`, ölçümle) | `before/` vs `after/menu-ray-800` |

Dark mode: yalnız semantik token (ham renk 0). Reduced-motion ve `data-motion="reduced"`: tüm `--ek-app-nav-*` 0 → anında.

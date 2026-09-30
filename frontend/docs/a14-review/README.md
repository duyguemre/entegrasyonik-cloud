# fe-a14 — Klavye kısayolları diyaloğu (premium)

Dal `cloud/fe-a14` (taban `cloud/ds-v2-a6b` @ 23e7098). Araç:
`A14_REVIEW=1 A14_REVIEW_WIDTH=1440|390 A14_REVIEW_OUT=docs/a14-review/<before|after> npx playwright test e2e/specs/a14-review.spec.ts --project=chromium-desktop`
(platform `navigator.platform`/`userAgentData` taklidiyle; diyalog kendisi algılar).

## Önce — eleştiri

| # | Sorun | Etki |
|---|---|---|
| 1 | Yalnız 10 kabuk kısayolu; bileşen kısayolları (sekme şeridi, menü, arama, varyant tablosu Ctrl+Z/D, destek Ctrl+Enter, filtre Enter) ya hiç yok ya da altta **elle yazılmış** bir not paragrafında | Tek kaynak ilkesi delinmiş; yeni tuş eklenince liste eskir |
| 2 | Arama yok, 4 düz grup, uzun kaydırma | Aranan kısayol bulunmuyor |
| 3 | Satır = yalnız ad; "ne işe yarar", "nerede çalışır" yok; "yazarken çalışan" bilgisi başlıkta tek yoğun cümle | Öğretmiyor |
| 4 | Tuş kapakları 20px, 11px yazı, ok glifleri okunmuyor (`…` gibi); ayırıcı "+" tuşla aynı ağırlıkta | Ucuz görünüm |
| 5 | macOS'ta da "Ctrl" (eşleyici ⌘'yi kabul ettiği hâlde) | Mac kullanıcısı yanlış tuşu arar |
| 6 | 390px'te tuşlar metnin yanına sıkışıyor, "Üst bölümü daralt / göster" 4 satıra kırılıyor | Mobilde bozuk |

## Alternatifler

- **A — İki bölme (seçilen):** üstte arama + platform anahtarı; solda kategori listesi (dikey sekme listesi, sayaçlı), sağda satırlar.
  Kayıt büyüdükçe ölçeklenir, ok tuşlarıyla kategori gezinmesi doğal (tablist), 390'da çip şeridine dönüşür.
- **B — Bölümlü ızgara:** tüm kategoriler iki sütunlu kartlarda, yalnız arama süzer. 1440'ta bir bakışta genel görünüm iyi,
  ama 34 kısayolla uzun, 390'da çok uzun; kategoriye atlama yok.
- **C — Komut paleti:** tek arama + düz liste. Hızlı ama "öğretici" değil (kategori/ipucu yok).

## Kararlar

- **Tek kaynak:** `navigation/shortcutCatalog.ts` → `SHORTCUTS` (kabuk) + yeni `CONTEXT_SHORTCUTS` (bileşen içi, başvuru kaydı).
  Diyalogda elle yazılmış tuş yok (test). Kayda eklenen kısayol kategorisiyle kendiliğinden görünür.
- **Kategoriler:** Gezinme · Sekmeler ve çalışma alanı · Liste ve tablo · Formlar · Görünüm · Yardım (+ "Tümü").
- **Satır:** ad + bağlam rozeti ("Her yerde", "Aramada", "Varyant tablosunda", "Dialogda"…) + "Yazarken de" rozeti + tek satır açıklama + tuş kapakları.
- **Tuş kapakları** (`ShortcutKeycaps.vue`): 24px eşit yükseklik (ipucunda 32px), ince kenar + alt iç gölge, sistem yazı tipi (Inter, monospace değil),
  oklar MDI ikonu (net), sakin ayırıcılar: Windows "+", macOS boşluk (⌘K geleneği), tek tuş seçenekleri "/", birleşiklerde "veya", sıralıda "sonra".
  Ekran okuyucu sembol değil ad okur ("Command K", "Ctrl artı K").
- **Platform:** `userAgentData.platform` → `navigator.platform` ile algılama; elle anahtar (radyo grubu, ←/→), tercih yerel depoda (erişilemezse yalnız oturum).
  ⌘ gösterimi doğru: kabuk eşleyicisi ve bileşenler Ctrl'ü `ctrlKey || metaKey` okur (test Ctrl'lü her kabuk kısayolunu metaKey ile eşler).
- **Öğretici:** "İpucu" kuşağı (en çok kullanılan üç: Ctrl+K, Alt+1…9, Alt+R — kayıtta `featured`), kategori seçilince tek cümle tanıtım,
  başlıkta açan kısayol (`shortcutHelp` kaydından, `?`), "Yazarken de" lejantı, "Yardım merkezinde oku" (fe-help `HelpCenterView`
  kayıtlıysa görünür → `/help?article=app-shortcuts`; bu tabanda ekran yok, düğme gizli).
- **Arama:** ad/açıklama/bağlam/kategori + tuş; Türkçe katlama (ş→s, İ/I→i, harf başına 1:1 → vurgu dizinleri korunur); tuş adları
  ("alt", "ctrl", "enter") ve tek karakter yalnız tuşta aranır ("alt" → "alt sonuca" metnini getirmez); eşleşme `<mark>`, eşleşen tuş kapağı
  aksiyon tonunda; sonuç sayısı `role=status`. Esc: doluysa önce aramayı temizler, boşsa diyaloğu kapatır.
- **Etkileşim:** içerik girişi `--ek-duration-slow` + `--ek-easing-enter` + `--ek-motion-distance-md` (reduced-motion'da yok); arama kutusu açılışta
  odakta (dokunmatikte — `pointer: coarse` — klavye listeyi örtmesin diye verilmez); kategori listesinde ↑↓ ←→ Home End (otomatik seçim, dolaşan tabindex).
- **A6b §17.1:** diyalog uygulama genelidir — SecureLayout'ta sekme kabının dışında, `attach` yok; tam ekran örtü listesinde (test).
- **390px:** tek sütun, kategori seçici yatay kayan çipler (`aria-orientation` yataya döner), ipucu kuşağı sıkı satırlar, tuşlar metnin altında.
- **Renk:** yalnız semantik token (ham renk 0 — stil mandalı korundu); uygulamada karanlık tema anahtarı henüz bağlı değil, bileşen hazır.

## Kayıt defteri eklemeleri (geriye uyumlu)

`ShortcutDefinition`'a isteğe bağlı `description`, `category`, `context`, `featured`, `shortLabel` alanları; mevcut 10 kısayolun
`id/keys/label/group/allowInEditable/aliases` alanları **değişmedi** (test sabitler), `SHORTCUT_GROUPS` (yardım merkezi tablosu) aynı.
Yeni dışa aktarımlar: `SHORTCUT_CATEGORIES`, `GROUP_CATEGORY`, `ShortcutReference`, `CONTEXT_SHORTCUTS` (24 bileşen kısayolu, her biri kaynak
dosya yorumlu). `matchShortcut` başvuru kaydını okumaz → davranış değişmedi.

## Testler

- `tests/shortcut-help-dialog.test.ts` (17): türetme bütünlüğü, yeni kısayol otomatik görünür, elle tuş yok, geriye uyum, ipucu üçlüsü,
  platform algılama/sembol/konuşma metni, ⌘ ↔ metaKey tutarlılığı, arama (TR katlama, tuşla arama, tuş adı metinde aranmaz), vurgu, uygulama geneli örtü.
- `e2e/specs/shortcut-help.spec.ts` (3 viewport): tüm katalog satırları, arama + `<mark>` + kapak vurgusu, Esc sırası, ok tuşlarıyla kategori,
  macOS algılama + elle geçiş hatırlanır, 390 çip şeridi + yatay taşma yok, axe WCAG 2.1 AA = 0 (liste + arama), görsel taban
  (`shortcut-help-dialog-*-win32.png` yerelde üretilecek; `*-linux.png` commit'lenmedi).
- Mevcut `shell-dsv2` ("? kısayol listesini açar…", axe) ve `page-about` ("Tüm kısayollar") değiştirilmeden yeşil.

## Görseller

`before/` (Windows; macOS modu aynıydı) · `after/`: `dialog-{win,mac}-{1440,390}`, `closeup-*` (diyalog kartı), `search-win-*` (metin vurgusu),
`search-keys-win-*` ("alt" → kapak vurgusu), `category-mac-*` (Liste ve tablo), `keycaps-*-{win,mac}-*` (2x yakın çekim: ipucu kuşağı,
Ctrl+Shift+H veya Alt+U, ⌘Y veya ⌘⇧Z, ← / →).

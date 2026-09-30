# fe-r2a — FR2-SHELL (1–9) + FR2-HELP (16–17) inceleme

Kaynak: `docs/cloud-contracts/FE_FEEDBACK_R2_2026-09-30.md`. Standartlar: `frontend/docs/FR2_PATTERNS.md`.
Görüntüler: `once/` (taban `origin/main` 6a4954e) ve `sonra/` (bu dal), 1440 ve 390 genişlik. Üretim:

```
R2A_REVIEW=1 R2A_WIDTH=1440 R2A_OUT=docs/fe-r2a-review/sonra \
  npx playwright test -c playwright.cloud.config.ts e2e/specs/fe-r2a-review.spec.ts --project=chromium-desktop
```

Menü fikstürü üretim ağacının biçimindedir (Ayarlar grubu altında "Uygulama Ayarları", destek altında "Eğitim Merkezi").
"SUPPORTS" bölüm etiketi fikstürün uydurma grup adıdır (gerçek grup adı bulut kopyasında yok) — kabuk hatası değil.

## Ölçülen kök nedenler

| Madde | Belirti | Ölçüm / kök neden | Düzeltme |
|---|---|---|---|
| 3 | Ürün/yardım sayfasında kaydırınca ana sekmeler yukarı kayıyor | `.workplace-area` `overflow: visible` → iç kaydırıcısı olmayan sayfa BELGEYİ kaydırıyor (`/help`: belge 1793px / pencere 800px); sekme şeridi mutlak konumlu olduğu için onunla kayıyor | Çalışma alanı kaydırma kabı (`overflow-y:auto`, `overscroll-behavior:contain`). `once/yardim-merkezi-kaydirilmis` ↔ `sonra/…` |
| 4 | Tıklayınca etiket yukarı kayıyor, yer tutucu bir an görünüp kayboluyor | rAF kare kaydı: Vuetify FLIP bitince dinlenen etiket satır içi `visibility`'yi kaybediyor; erişilebilirlik kuralı onu `opacity:0` yapıyor ama Vuetify'ın `.v-field-label { transition: opacity 150ms }` geçişi yüzünden etiket dinlenme yerinde TAM OPAK belirip 150ms'de sönüyordu (kare 12–13: `rest o=1 → 0.967` ve aynı anda yüzen etiket görünür) | `.v-field-label` yalnız `transform` geçişi. Sonra: her karede TEK etiket görünür (kare 14+ `rest o=0`, `float VIS`). Kalan tek şey Vuetify'ın kendi 1 karelik devir anı (kare 4) — varsayılan Vuetify davranışı |
| 8 | Ayarlar → Uygulama Ayarları çalışmıyor | Üretim menüsünde ekran `settings/SettingListView`; bileşen haritası yalnız kök anahtar (`SettingListView`) tutuyor → `component: undefined` → hesap menüsünden açınca TÜM uygulama beyaz (`once/uygulama-ayarlari-1440.png`) | `menuStore.resolveView` (`parent/Code` yoksa `Code`); ekran bölümün üst seviyesine (`navigation/menuShape.ts`); hesap menüsü kodla açar, erişim yoksa girişi göstermez |
| 7 | Eğitim Merkezi | `user/EducationView` abonelik ekranına bağlıydı (GAP analizi #34) | Menü, akıllı arama, destek kısayolu, bileşen haritası ve sayfa yardımından kaldırıldı |

## Kararlar (eleştiri → alternatifler → seçim)

1. **Breadcrumb (madde 1).** Önce: kenarlıklı/zeminli çipler + chevron → etiket/düğme karışık, "amatör". Alternatifler: (a) başlık üstünde
   küçük gri yol satırı, (b) tek satırda sakin metin izi. **Seçim (b)**: dikey alan harcamaz, H1 tek güçlü nokta kalır; kök =
   modül ikonu + bölüm (muted), ara halkalar sessiz bağlantı (hover'da koyulaşır, alt çizgi soldan dolar), ayraç ince `border-strong`
   chevron. Kök ikonu için tonlu karo denendi; ton sayfa zeminiyle aynı olduğu için görünmedi → 2. iterasyonda kaldırıldı.
2. **Sol menü (madde 2).** Grup ve yaprak aynı mürekkep (`content-default`) ve ağırlık (orta); hiyerarşi yalnız girinti + kılavuz
   çizgisi. Alt öğe metni üst öğenin METNİYLE aynı x'te başlar; etkin alt öğenin 2px göstergesi kılavuz çizgisinin üstünde. Etiketli
   bölümler arasında çizgi yok (etiket + boşluk yeter; rayda çizgi geri gelir). Etkin öğede kalınlaştırma DENENDİ, geri alındı:
   metin genişliği değişip satır sarması oynuyordu (B4 "durumlar geometri değiştirmez" bekçisi).
3. **Alan yüksekliği (madde 5).** 40 → **36** (`--ek-control-h-field`) = düğme `md`; filtre satırında alan ve Sorgula aynı hizada.
   32 denenmedi: yüzen etiket çerçeve üstünde, 13px gövde metniyle 32'de dikey nefes kalmıyor.
4. **Bağlantı (madde 6).** `.ek-link`: aksiyon rengi, orta ağırlık, çizgisiz; hover'da 1px alt çizgi soldan dolar + renk koyulaşır,
   ok ikonu 2px kayar; odakta DS halkası. `--quiet` liste içi, `--sm` caption. Sınıfsız `<a>` otomatik aynı dili alır.
5. **Kaydet/sil (madde 9).** `EkButton intent="save|delete"` — ton + ikon + metin tek yerden. Sayfa içi sil = `danger-quiet`
   (kırmızı metin, yüzey zemin); dolgu kırmızı yalnız onay diyaloğunun son adımı. Ham `v-btn icon color="error"` (dolgu kırmızı
   kare dahil) CSS ile satır eylemi görünümüne çekildi — ekran kodu değişmeden tutarlı.
6. **Yenile (madde 9).** Çıplak ikon başlık satırında "yarım" duruyordu → ikincil düğme dilinde kare kontrol (yüzey + ince kenarlık
   + kart gölgesi), yanındaki "Yeni …" düğmesiyle aynı yükseklik/yarıçap; başarıda yeşil tonlu kare.
7. **Filtre paneli (madde 9).** Üç katman: beyaz başlık çubuğu (52px, ikon karosu, sayı hapı, çip özeti), hafif tonlu gövde,
   ince ayraçlı beyaz eylem çubuğu (solda "Enter ile sorgula", sağda Temizle ghost · Sorgula primary).
8. **Sekme taşması (madde 9).** Kenar okları + kaydırma yerine sağda **"+N ⌄"** listesi (şeritte tam görünmeyen sekmeler).
   2. iterasyon bulgusu: düğme belirince şerit daralıp etkin sekme kırpılıyor ve listeye düşüyordu → etkin sekme listeden
   hariç, düğme belirince etkin sekme yeniden görünür alana alınır.
9. **Sayfa hakkında (madde 16).** Tonlu kutudaki üç sütun → rehber kartı: başlık bandı (ikon, "Sayfa rehberi", "<Sayfa> hakkında",
   × / Esc), amaç okunur gövde metninde + "Yardım merkezinde oku →", ipuçları numaralı, kısayollar noktalı kılavuzlu tuş satırları;
   dar ekranda tek sütun.
10. **Yardım merkezi (madde 17).** Konu kartlarında mavi bağlantı listesi → sessiz satırlar (belge glifi, hover'da zemin + ok),
    >3 makalede "Tümünü gör (N) →", kart hover'da yükselir; SSS/iç bağlantı/yol `.ek-link` dili; konu ağacı çalışma alanı
    kaydırmasında yapışkan (madde 3 düzeltmesinin doğal sonucu).

## İterasyonlar

- **1. iterasyon:** standartlar (alan/etiket/bağlantı/düğme/yenile/filtre) + kabuk (kaydırma kabı, menü, breadcrumb, ayarlar,
  eğitim merkezi, sekme taşması) + sayfa hakkında + yardım merkezi. Görüntü + kare ölçümü.
- **2. iterasyon (eleştiri):** breadcrumb kök karosu görünmüyordu → kaldırıldı; etkin menü öğesinde kalınlık geometri oynatıyordu →
  geri alındı; bölüm etiketi `content-subtle` AA sınırında → `content-muted`; "+N" listesi etkin sekmeyi kırpıyordu → düzeltildi;
  etiket geçişi kare kare yeniden ölçüldü (tek etiket/kare).

## Diğer görevlere etki

- Ekranlar kaydırmayı `.workplace-area`'da yapar (`window.scrollTo` değil); `100vh` hesabı gerekmez.
- Alan yüksekliği her ekranda 36'ya iner (yerel `--ek-control-h-lg` kullanan alan benzeri öğeler `--ek-control-h-field`'a geçmeli).
- Kaydet/sil için `EkButton intent`; filtre paneline stil verilmez; kendi yenile düğmesi çizilmez.
- `SettingListView` sayfa başlığı hâlâ "Mağaza Ayarları" (menü: "Uygulama Ayarları") ve "Ayarları Kaydet" ham `v-btn` —
  ekran FR2-SCREENS madde 36'nın alanında, bu işte dokunulmadı.
- Görsel tabanlar (`*-win32.png`) alan yüksekliği / filtre / breadcrumb değişikliği nedeniyle yerelde yenilenmeli.

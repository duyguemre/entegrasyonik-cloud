# fe-r3a — FR3 madde 1–10 (kabuk, menü, favoriler, breadcrumb, sekmeler, filtre, hareket, tablolar) inceleme

Kaynak: `docs/cloud-contracts/FE_FEEDBACK_R3_2026-10-01.md` madde 1–10, K49. Standartlar: `frontend/docs/FR3_PATTERNS.md`
(paralel görevler `cloud/fe-r3b`, `cloud/fe-r3c` için). Görüntüler `once/` (taban `origin/main` f2b08ec; 390 kareleri yalnız
hareket token'ı değişmişken alındı — statik kare aynı) ve `sonra/` (bu dal), 1440 + 390, light + dark. Makine bulgusu:
`sonra/axe/*.json` (WCAG 2.1 AA). Üretim:

```
R3A_REVIEW=1 R3A_WIDTH=1440 R3A_OUT=docs/fe-r3a-review/sonra \
  npx playwright test -c playwright.cloud.config.ts e2e/specs/fe-r3a-review.spec.ts --project=chromium-desktop
```

Kareler: `kabuk`, `menu-acik` (tüm gruplar açık + hover), `favoriler` (3 favori) / `favori-hover` / `favoriler-bos`,
`menu-ray` (yalnız 1440), `sekmeler` (11 sekme) / `sekmeler-liste`, `siparisler` / `siparisler-filtre`, `liste-*`
(iadeler, faturalar, müşteriler, mesajlar, finans, işlem kayıtları, ürünler, denetim günlüğü, bildirimler).

## Ölçülen kök nedenler

| Madde | Belirti | Ölçüm / kök neden | Düzeltme |
|---|---|---|---|
| 1 | Menü dağınık, zemin seçkin değil | Menü zemini `ink-50`, çalışma alanı `ink-100` — sınır seçilmiyor; etiketsiz tek bölüm (Entegrasyonlar) önünde kalan tek ayraç çizgisi ritmi bozuyordu; grup/yaprak/alt öğe aynı ağırlık ve ton | Beyaz menü yüzeyi (kart dili), ayraç yalnız rayda, alt öğe 400/`content-muted` |
| 1 | (yeni bulgu) Rayda ikonlar kayboluyor | Rayda öğe hover/odak alınca `.v-navigation-drawer__content` yatayda **163px** kayıyordu (içerik 248px, ray 64px; `overflow: hidden` programatik kaydırmaya izin verir) → Tab/ipucu ile tüm ikonlar ekrandan çıkıyordu (`once/menu-ray-*` boş ray) | Kaydırma olayında yatay kayma 0'a sabitlenir (boyamadan önce; titreme yok). `overflow: clip` denendi: kaymayı önlüyor ama rayda tıklama hedefini kesiyordu (e2e `rail-logo-btn` zaman aşımı) → geri alındı |
| 2 | Favoriler nerede belli değil | Menü deposunda favori listesi (`getFavorites`, `sortFavorites`) vardı ama hiçbir yüzey çizmiyordu; alt öğeler yıldızlanamıyordu | Favoriler bölümü (en üstte), alt öğelerde yıldız, Ctrl+K boş durumunda grup, sıralama |
| 4 | Pasif sekmeler okunaksız; iki ayrı düğme | 11 sekmede pasifler 120px'e iniyor, kapatma için 20px+8px boş yer ayrılıyor → "Müşt…", "Fatur…"; metin `content-muted` şerit tonunda soluk. "+4 ⌄" ve "≡ 12" ayrı düğmeler, ikincisi üstteki tutamakla çakışıyordu | Pasif ≥132px, solan başlık, kapatma yer ayırmaz, metin `content-default`; etkin sekme kısalmaz; tek "Tüm sekmeler" |
| 7 | Kategori seviyesi filtre panelinden farklı hızda | Panel `base + ease-in-out`, kategori seviyesi `base + ease-out` + kademe gecikmesi; Vuetify geçişleri ayrı (0.3s / 225ms / 125ms cubic-bezier); 23 literal süre/eğri, 6 dosyada döngü literal'i | Hareket rolleri; ikisi de `reveal`; Vuetify geçişleri rollere bağlı; statik bekçi |
| 9 | "Veriler farklı fontlarda" | Hepsi Inter ölçüldü ama: `tabular-nums` yalnız bazı hücrelerde (kod/tarih) → aynı tabloda orantılı + sabit rakam; denetim günlüğü olay kodu, uyum anahtarı, varyant kodu **mono**; ad hücresi ekrana göre 400/500/600 | Tablo geneli tabular rakam, hücrede tek aile (mono zorla kalkar), ağırlık rolleri |
| 10 | Tarih sütunu var, filtre yok | Siparişler/İadeler/Faturalar: backend `startDate/endDate` destekliyor, modelde alan var, panelde giriş YOK; diğer 4 liste iki ayrı alanla | `EkDateRange` (7 liste); backend'i olmayanlar PROPOSALS P-R3A-1…4 |

## Kararlar (eleştiri → alternatifler → seçim)

1. **Menü zemini (1).** (a) Menü = çalışma alanı grisi + kenarlık (önceki), (b) koyu lacivert menü (krom ile bütün),
   (c) beyaz menü yüzeyi. **Seçim (c):** kartlar beyaz, alan gri — menü de bir "yüzey"; site kart diliyle aynı, vurgu
   ekonomisi korunur (koyu menü üst krom ile birleşip ağırlaşıyordu, (b) elendi). Koyu tema: canvas üstü yüzey.
2. **Hiyerarşi (1).** FR2 kararı (grup ile yaprak arasında renk farkı yok) korunur; ayrım **alt öğede**: 400 ağırlık +
   `content-muted` (hover/etkin koyulaşır, geometri sabit). Bölümler yalnız boşluk + etiket (ayraç çizgisi rayda).
3. **Favoriler (2).** Erişim noktası: menünün en üstü (her ekranda görünür) + Ctrl+K boş durumu. Belirleme: yaprak ve alt
   öğe hover/odakta yıldız; işaretli öğede küçük nötr dolu yıldız sürekli (vurgu rengi yok — tek vurgu etkin sayfa).
   Sıralama: sürükle-bırak yerine **"Düzenle" → ↑/↓** (klavye/ekran okuyucu eşit; FR2-28 sürükleme sapması riski yok) +
   her zaman Alt+↑/↓. Boş durum: kesik çizgili tek satır ipucu, × ile kalıcı kapanır. Favori satırında etkin sayfa yalnız
   metin tonuyla (iki mavi hap görünmesin — 1. iterasyon bulgusu). İyimser güncelleme, red → geri al.
4. **Breadcrumb (3).** K49: nötr çip geri geldi (22px, hap, `border-subtle`, `surface-muted`); bulunulan sayfa çip DEĞİL,
   tek güçlü nokta H1 — "yol" küçük ve sakin, "buradasınız" büyük. Yardım (?) düğmesi B4'te kullanıcıyla netleşmiş
   tasarımında bırakıldı.
5. **Sekmeler (4).** "Tüm sekmeler" tek düğme: toplam her zaman + şeritte görünmeyen için nötr "+N" hapı; liste iki grup
   (görünmeyenler önce) + Alt+n + "Tümünü kapat". Pasif sekme başlığı "…" yerine solar (tarayıcı sekmesi dili).
6. **İçerik sekmeleri (5).** Sitenin entegrasyon süzgecindeki **segment tepsisi** birebir dil (alt çizgili sekme sitede
   yok); Vuetify JS kaydırıcısı kapandı (hareket tek kaynak).
7. **Filtre başlığı (6).** 52 → 44px (kontrol `sm` + 6px), karo 32 → 24; gövde/eylem çubuğu dolgusu bir kademe az.
   Açık panelde ~20px, kapalıda 8px kazanç.
8. **Hareket (7).** Ham süre yerine **rol**: feedback · reveal · dismiss · overlay · layout (+ stagger, döngüler).
   Bileşen türü seçer, süre seçmez. Paralel görevlerin 4 dosyası çakışma olmasın diye ratchet'te (artamaz).
9. **Kanal kenarı (8).** Yapışık 3px şerit → satır içi, kenardan ayrık, yuvarlak uçlu çizgi (hover'da boya uzar);
   seçili satır kanal kimliğini korur. Alternatif (kanal noktası hücre içinde) elendi: kanal rozeti zaten kolonda var.
10. **Tarih aralığı (10).** Ortak `EkDateRange` (iki alan + hazır aralıklar); backend'i olmayan listelerde istemci süzmesi
    YAPILMADI (sayfalı/imleçli listede yalnız yüklü sayfayı süzer → yanıltıcı) → PROPOSALS.

## İterasyonlar

- **1. iterasyon (hareket + menü + favoriler):** rol token'ları, Vuetify geçiş katmanı, bekçi; beyaz menü, favoriler.
  Eleştiri: favori satırı ve ağaçtaki satır **aynı anda iki mavi hap**; işaretli yıldız iri/koyu; rayda ikonlar yok →
  kök neden ölçüldü (163px yatay kayma, `once`'ta da var).
- **2. iterasyon (breadcrumb, sekmeler, içerik sekmeleri, filtre, tablo):** Eleştiri: etkin sekme de 132px'e inip
  "Bildirim…" kesiliyordu → etkin sekme kısalmaz; "Tüm sekmeler" üst tutamakla çakışıyordu → şeridin altına yaslı;
  B4 bekçisi "Bitti" düğmesindeki vurgu rengini yakaladı → nötr; boş favori ipucu 3 satırdı → kısaltıldı.
- **3. iterasyon (tarih aralığı, cila, e2e):** Eleştiri: hazır-aralık düğmesi ikonu 27px (Vuetify 1,5em) → 18px; rayda
  favori satırı yine çift vurgu → her modda tek; `overflow: clip` rayda tıklamayı kesiyordu (e2e) → kaydırma sabitleme.
  Son durum: axe 58/58 durumda 0 ihlal.

## Testler

| Kontrol | Sonuç |
|---|---|
| `npx vitest run` (frontend) | 78 dosya / 1543 test geçti (yeni: `motion-single-source`, `date-range-filter`; güncellenen: a8, a12, b4, cascade-motion, r2a, tema tabanı) |
| `npm run test -w @entegrasyonik/ui` | 25/25 |
| `npm run test:backoffice` | 101/102 — düşen `p2-states` (REAUTH_OPS ↔ backend) **`origin/main`'de de düşüyor** (taban, bu dal değil; worktree'de doğrulandı) |
| `vue-tsc` + typecheck/style/pattern ratchet | 0 hata, tabanlar korundu |
| `npm run build` · `npm run build:backoffice` | ikisi de başarılı |
| Playwright `--update-snapshots=missing` (masaüstü: kabuk ×3, gezinme, siparişler, iadeler, faturalar, mesajlar, finans, kayıtlar, destek, liste standardı, DS vitrini, kategori, müşteriler, bildirimler, koyu mod, DS katmanları, ürünler; mobil+tablet: kabuk ×3, gezinme, siparişler, liste standardı; koyu proje: tamamı) | Tüm işlevsel iddialar geçti. Kırmızılar yalnız "Linux tabanı yok → yazıldı" (`*-linux.png` git-ignored; görsel onay yerelde Windows tabanıyla) |
| axe WCAG 2.1 AA (inceleme spec'i, light + dark, 1440 + 390) | 58/58 durumda 0 ihlal (`sonra/axe/`) |

## Kapsam dışı / öneriler

- `PROPOSALS_PENDING.md` P-R3A-1…5: çekim kayıtları, bildirimler, yönetim destek talepleri tarih aralığı (backend
  parametresi), denetim günlüğü alanlarının `EkDateRange`'e geçişi, tek alt öğeli menü grubu / katalog bölümü (IA).
- Backoffice kendi `ShellLayout`'unda `EkSidebarNav` kullanır; beyaz menü zemini ve hareket rolleri oraya da akar
  (derleme + testler yeşil). Backoffice CSS'indeki literal geçişler bu dalın bekçi kapsamı dışında.

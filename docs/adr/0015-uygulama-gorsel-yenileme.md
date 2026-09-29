# 0015 — Web Uygulaması Görsel Yenileme: Kurumsal-Premium Tasarım Dili, Uygulama Kabuğu, Tasarım Sistemi Bileşenleri ve Aşamalı Uygulama

## Durum
Kabul edildi (2026-09-28). Faz 3 (branch `faz3-arayuz`). Protokol 12 kapsamında insan onayı gerektiren adım YOKTUR (yalnızca frontend, geri alınabilir). Açık Sorular'daki 3 madde insan kararıdır ama fabrikayı durdurmaz; varsayılanlar belirtilmiştir ve **insan itiraz etmezse geçerlidir**.

**Önceki ADR'lerle ilişki (açıkça):**
- **ADR-0011'i DEĞİŞTİRİR (amends):**
  - Karar 1 "`defaults` omurgada BOŞ kalır; her girdi ayrı commit": bu ADR'nin A1 adımında Vuetify `defaults` **bileşen ailesi başına bir commit** olarak topluca girer; tam takım bilinçli olarak yeniden tabanlanır (Karar 3.1).
  - Karar 1 "canlı Vuetify temasına yalnızca bugün var olan anahtar kümesi kablolanır" (T2 kısıtı): A1'de **tüm semantik anahtarlar** (light + dark) canlı temaya kablolanır. T1a tema karakterizasyon anlık görüntüsü (57/26 anahtar) **kasıtlı olarak ters çevrilir**, yani bilinçli olarak yeniden yazılır (Karar 5.2).
  - **Açık Soru 4 (legacy semantik değerler + "canlı iş-durumu paleti") burada KARARLANIR** (Karar 3.3).
- **ADR-0011 Karar 3 (dark mode kapısı) DEĞİŞMEZ.** Bu ADR dark mode'u açmaz (Karar 5.5).
- **ADR-0012'yi DEĞİŞTİRİR (amends), modeli KORUR:**
  - Sekmeli çalışma alanı, tek kabuk rotası, `screens.ts`, `workspace` store'u, `sessionStorage` persist'i, geri/ileri politikası ve `eventBus 'openTab'` API'si **aynen kalır**.
  - Değişen yalnızca **sunumdur** (Karar 5 masaüstü/tablet düzeni → Karar 2.2).
  - Ayrıca Karar 2 "Çözümleme" kuralına dar bir istisna eklenir: kayıt defterinin sahip olduğu yeni ekranlar (Karar 2.4).
- **Kapsam ekleri (orkestratör aracılığıyla kullanıcı yönergeleri, 2026-09-28):**
  - eksik ekranlar (B4, gap analizi ile uzlaştırıldı)
  - görsel yenilemeden önce yapısal refaktör (Aşama 0, `docs/FRONTEND_CODE_AUDIT.md`)
  - "tek iş = tek desen" (Karar 6)
- **ADR-0014 ile uyumludur:** marka rengi, logo işareti ve Inter ortaktır. Site kaynak kodu bu ADR'nin kapsamı dışındadır. Ancak ortak `--ek-*` token değer değişiklikleri siteye de akar (Karar 1.3).

## Bağlam
Proje sahibi (2026-09-28): "Frontend uygulamasının tasarımını da elden geçir; daha profesyonel ve kurumsal olmalı, sadece login değil uygulama içi ekranlar da; SaaS'a uygun, hoplama-zıplama olmadan ama son derece profesyonel ve premium görünmeli." Kapsam eki (aynı gün): "Eksik bölümler olabilir, eklemekten çekinme; uygulamayı tam uygun hale getirmek senin işin."

Faz 3 T0–T6 yalnızca **sıfır-fark token + a11y göçüydü** (ADR-0011, Protokol 13). Görsel yenileme hiç yapılmadı. Bugünkü durumun kanıtı, `frontend/e2e/specs/*-snapshots/*-chromium-{desktop,tablet,mobile}-win32.png` altındaki 82 taban PNG'dir. Bu ADR için 13 tanesi görüntülenerek incelendi:
- dashboard, shell (mobil), orders-list, orders-detail, products-list, claims-detail
- login, login-register, integration-MarketplaceView, subscription
- admin-system-top, admin-clients-list

Kaynak kodda doğrulanan bulgular:

| # | Bulgu | Kanıt |
|---|---|---|
| 1 | **Krom/retro ürün logosu.** Açık mavi, bevel efektli, köşeli "E" içeren raster PNG kullanılıyor (`#0093FB` ailesi, marka lacivertiyle uyumsuz). Tanıtım sitesinde ise işaret+kelime markası var (`site/src/components/Logo.astro`: lacivert kare üzerinde teal merkez + 3 düğüm, Inter 800 kelime markası). `logo.svg` Vuetify varsayılan logosudur (ADR-0014 Karar 4). | `ApplicationBar.vue:9` `v-img src="/assets/images/logo6.png"`; `public/assets/images/logo{,2..6}.{png,svg}` |
| 2 | **Klasör-sekmeli kabuk.** Lacivert/gri, üst köşesi yuvarlak "dosya klasörü" sekmeleri var. Çalışma alanı 2px lacivert çerçeveli bir `v-sheet` içinde duruyor. Sağ üstte anlamı belirsiz bir "□" (genişlet) düğmesi bulunuyor. Sol menü yalnızca logoya tıklanınca açılan `temporary` bir çekmece; masaüstünde kalıcı gezinme yok. | `SecureLayout.vue:1-120` (`bg-workplaceColor`/`bg-passiveColor` sekmeler, `workplace-area elevation=2`), `NavigationMenu.vue:2` |
| 3 | **Pembe/turuncu düz ikon kutuları.** Dashboard'da Pazaryeri, E-Ticaret, E-Fatura ve Kargo için gül rengi, Sipariş ve İade için turuncu dolgu kutulu dev gezinme kartları var. Bu kartlar sol menüyü tekrarlıyor ve sayfanın yarısını kaplıyor. | dashboard/shell PNG; `components/dashboard/NavigationLinksComponent*.vue` |
| 4 | **Karışık renk paleti.** KPI kartlarında teal/pembe/lila pastel zeminler ve teal/kırmızı/mor "etiket" biçimli tutar rozetleri var. Bekleyen aksiyonlar grafiğinde yeşil/turuncu **degrade, hap biçimli** çubuklar kullanılıyor. Sipariş satırlarında turuncu/camgöbeği/yeşil/kırmızı dolgu ikon butonları, iade detayında camgöbeği zeminli kart ve kırmızı dev "0,00" toplamı var. Global `success #4CAF50` beyazda 2,78:1, `warning #FB8C00` 2,37:1, `info #00ACC1` 2,74:1: metin ve rozet için AA-altı (T4h axe bulgusu da bunu gösteriyor). | PNG'ler; `semantic.ts`; kontrast hesabı (WCAG formülü, bu ADR sırasında) |
| 5 | **Tutarsız kart, tablo ve rozet dili.** Durum rozetleri ekrandan ekrana farklı: dolgu turuncu hap "SATICI ONAYI BEKLİYOR", yeşil "AKTİF", lacivert "PASİF". Tablo başlıkları farklı stillerde, aralarında "│" ayraçlar var (ürünler). Platform yükleme durumu gri kutu artı kırmızı "×" rozetiyle gösteriliyor. Kartlar gölge, kenarlık ve radius'ta birbirinden farklı. | orders/products/admin PNG'leri; T4d `--status-chip-color` deseni |
| 6 | **Sönük giriş ekranı.** Beyaz zeminde retro logo ve tek kart var. Sekme etiketleri büyük harf. Birincil düğme soluk lacivert (`#5B6690` civarı). İngilizce "SSL SECURED" rozeti var. Ekranın %60'ı boş. | login/login-register PNG; `LoginComponent.vue:109` |
| 7 | **Düşük kaliteli platform logosu yerleşimi.** `PlatformImageComponent` gerçek logo değil, monogram çiziyor. Entegrasyon store'da yoksa renk `'#eee'`'ye düşüyor, sonuç neredeyse görünmez beyaz-gri bir kutu (sipariş listesi, sipariş/iade detayı, dashboard, pazaryeri rayı). `public/assets/images/integrations/**` karışık formatlarda (`.ico/.jpeg/.avif/.webp`, `New folder/`) ve kullanılmıyor. | `components/platforms/PlatformImageComponent.vue:40-65`; PNG'ler |
| 8 | **Global legacy CSS sızıntısı.** `public/assets/css/site.css` 1.462 satır, 83 hex ve 264 `!important` içeriyor ve `main.ts:7` ile global yükleniyor. Literal-stil mandalı yalnızca `src/**`'i taradığı için bu dosya **mandal dışındadır**. Somut sızıntı: `.page-title { background-color:#1976D2 !important }` → T6'nın sıfırdan yazdığı `SubscriptionView`'da başlık parlak mavi bir şerit olarak görünüyor. | `site.css:369`; subscription PNG |
| 9 | **Çevrilmemiş i18n anahtarı** sekme başlığında görünüyor: `MENU.USER.SUBSCRIPTION`. | subscription PNG |
| 10 | **Sahte/sabit içerik.** Her kullanıcıya "Entegrasyonik Notu: Bugün Trendyol entegrasyonunda %15 daha fazla sipariş aldınız" gösteriliyor. Bu metin sabit kodlu ve veriye dayanmıyor. | `MarketplaceLinksComponent.vue:30` |
| 11 | **Hareket ihlali kalıntıları** P1/P2 göçlerinde çoğunlukla temizlendi. Ancak dashboard'da degrade çubuklar ve hover'da yükselen kartlar var; `v-dialog` varsayılanı ölçekli geçiş, düğmelerde ripple kullanılıyor. | PNG + Vuetify varsayılanları |
| 12 | **İkon kullanımı.** `@mdi/font` webfont'u tam set olarak yükleniyor. `src/` genelinde 1.567 `mdi-*` referansı / 341 benzersiz ikon var. **Playwright spec'leri ikon sınıflarına bağlı:** `button:has(.mdi-eye)`, `.mdi-eye-outline`, `.mdi-plus`, `.mdi-delete-sweep-outline`, `.mdi-chart-box-outline`. | grep |

**Protokol 13 açısından kritik gözlem.** Spec'ler davranışı, **sunuma bağlı kancalarla** doğruluyor:
- CSS sınıfları: `.workplace-tabs`, `.workplace-tab`, `.selected-workplace-tab .close-tab-icon`, `.v-navigation-drawer.soft-nav`, `.v-layout`, `.large-stat-card`, ekran kök sınıfları (`.orderListView` …)
- Logo seçicisi: `img[src="/assets/images/logo6.png"]`
- Rol ve adlar: `getByRole('dialog')` (sipariş detayı), `getByRole('tab',{name:'KAYIT'})`
- Etiket metinleri: `getByLabel('EPosta')`, `'Sipariş No, Müşteri Adı veya Telefon Ara'`
- Metin çapaları: `getByText('İŞLETME PERFORMANSI')` (`nav.ts`), `'Sipariş Bulunamadı'`

Görsel yenileme bu kancaları korumak zorundadır (Karar 5.1). Ayrıca **Türkçe büyük/küçük harf tuzağı** var: Playwright'ın büyük/küçük harfe duyarsız eşleşmesi JS `toLowerCase()` kullanır. `"PERFORMANSI"` → `"performansi"` olur, oysa `"performansı"` ≠ `"performansi"`. Yani çapa metinleri DOM'da cümle düzenine çevrilirse eşleşme **kırılır**.

## Değerlendirilen Alternatifler

### A. Tasarım yönü
1. **Mevcut dili cilala** (renkleri token'a bağla, gölgeleri azalt). Artı: en az fark. Eksi: sorun renk değerlerinde değil **dilde**: klasör sekmeler, dev ikon kutuları, çok renkli rozetler. Kullanıcının istediği "kurumsal-premium" algı cilayla gelmez. Reddedildi.
2. **Hazır bir admin şablonu/tema satın al** (Vuetify premium temaları vb.). Eksi: jenerik görünür, ikinci bir stil dili getirir, token disiplinini böler ve lisans maliyeti yaratır. Reddedildi.
3. **Nötr ağırlıklı, sakin, yoğun-ama-ferah "Linear/Stripe/Vercel" dili (SEÇİLEN).** Marka rengi yalnızca vurgu noktalarında kullanılır; renk **anlam** taşır, süs değildir; hareket yalnızca geri bildirim içindir.

### B. Kabuk
1. **Klasör sekmelerini koruyup yeniden boya.** Eksi: masaüstünde kalıcı gezinme yok, logo=menü düğmesi keşfedilemez. Premium SaaS kabuklarının ortak dili (sol kenar menü + üst çubuk) sağlanmaz. Reddedildi.
2. **Sekmeleri kaldır; yalnızca kenar menü + "açık sayfalar" açılır listesi.** Artı: en sade görünüm. Eksi: kullanıcının açık yönlendirmesiyle (ADR-0011 AS3: "sekmeler arası geçişte iş kaybolmamalı") ve görünür çoklu-iş modeliyle çelişir. Açık sekmelerin görünürlüğü düşer. `navigation.spec` `.workplace-tab` sayar. Reddedildi.
3. **Sol daraltılabilir kenar menü + ince üst çubuk + ince sekme şeridi (VS Code/tarayıcı sekmesi sadeliğinde) (SEÇİLEN).**

### C. İkon seti
1. **Lucide'a geç.** Eksi: yeni bağımlılık ve 1.567 referansın değişmesi gerekir. Spec'lerin `.mdi-*` kancaları kırılır (Protokol 13 ihlali). Reddedildi.
2. **`@mdi/js` (SVG, tree-shake).** Artı: webfont yükü kalkar. Eksi: Vuetify SVG ikonları `.mdi-*` sınıfını DOM'a yazmaz, 5 spec seçicisi kırılır. 341 ikonun string→import dönüşümü gerekir. Ölçüm (A0) olmadan getirisi bilinmiyor. Eşiğe bağlandı (Maliyet notu).
3. **MDI webfont'ta kal, kullanım kuralı koy (SEÇİLEN).** Tek aile, outline varyant tercihi, 3 boyut, tek renk kuralı. Spec kancası olan ikon adları dondurulur.

### D. Detay görünümü (sipariş/iade detayı gibi)
1. **Sağ çekmece (`v-navigation-drawer location=right`).** Eksi: `getByRole('dialog')` spec'leri kırılır, `useBackDismiss` (ADR-0012) yeniden kurulur. Reddedildi.
2. **`v-dialog` KORUNUR, "yan sayfa" (side-sheet) sunumuyla stillenir (SEÇİLEN).** Sağa yaslı, tam yükseklik, 720 px; mobilde tam ekran. Rol, odak tuzağı ve davranış aynıdır.

### E. Yapısal refaktörün sırası (kapsam eki)
1. **Önce görsel yenileme, refaktör sonra.** Eksi: yinelenen bileşenler ve ölü ekranlar önce stillenir, sonra birleştirilir ya da silinir; iş iki kez yapılır. Reddedildi.
2. **İkisini aynı commit'lerde birlikte yap.** Eksi: bir ekran görüntüsü farkının refaktörden mi tasarımdan mı geldiği ayırt edilemez; Protokol 13'ün "sıfır-fark kanıtı" kaybolur. Reddedildi.
3. **Önce sıfır-fark yapısal refaktör (Aşama 0), sonra bilinçli görsel fark (A/B) (SEÇİLEN).**

### F. Yeni ekranların menüde görünmesi (kapsam eki)
1. **ApplicationDB `menus` belgesine yeni kayıt ekle.** Eksi: veritabanı yazımı (CLAUDE.md kural 3 yedek şartı) ve üretimde veri göçü gerekir. Menü içeriği kod dışında yaşar, test fixture'ı ile gerçek menü ayrışır. Reddedildi.
2. **Kayıt defterinin sahip olduğu ekranlar (`menuSource:'registry'`) + rol ipucu (SEÇİLEN).** Yetki sınırı yine backend RBAC'tir (ADR-0001).

## Karar
Web uygulaması, **nötr ağırlıklı, sakin, kurumsal-premium bir tasarım diline** geçirilir. Hedef seviye Linear/Stripe Dashboard/Vercel'dir. Bileşenler şunlardır:
- **tek token kaynağı** (`frontend/src/design/tokens/**`, ADR-0011) üzerine kurulu anlamsal tek durum paleti
- **sol daraltılabilir kenar menü + üst çubuk + ince sekme şeridi** kabuğu (ADR-0012 modeli korunarak)
- `Ek*` önekli küçük bir **tasarım sistemi bileşen katmanı** ve 4 yeni-ekran şablonu
- iki sütunlu **premium giriş ekranı**
- sitenin işaret+kelime markası

Bütün benzer işler **tek desen** ile yapılır (Karar 6; şablon dışı kullanım gerekçe gerektirir ve mandalla sayılır). Uygulama **0 (yapısal refaktör, sıfır-fark) → A (seri temel) → B (paralel ekran grupları + eksik ekranlar) → C (QA)** sırasıyla yapılır. Davranış spec'leri değişmeden yeşil kalır; yalnızca ekran görüntüsü tabanları ve tema anlık görüntüsü **bilinçli** yeniden tabanlanır.

### Karar 1 — Tasarım yönü ve marka tutarlılığı

**1.1 İlkeler (bağlayıcı, `premium-ui-standards` skill'inin uygulama yorumu)**
- **Nötr ağırlık.** Yüzeylerin ≥%90'ı beyaz/slate tonlarındadır. Marka laciverti (`primary #13255B`, beyazda 14,55:1) yalnızca şu yerlerde kullanılır:
  - birincil düğme
  - etkin gezinme göstergesi
  - odak halkası
  - bağlantılar
  - logo
  - grafik 1. serisi

  Teal (`secondary #48A9A6`, beyazda 2,80:1) **yalnızca dekoratif** kullanılır: logo merkezi, illüstrasyon. **Metin, ikon anlamı ve grafik öğesi için kullanılmaz.** `secondary-darken-1 #018786` beyazda 4,36:1 ile AA metin eşiğinin (4,5) altındadır, bu yüzden uygulamada gövde metninde kullanılmaz. Grafik öğesi olarak ≥3:1 koşulunu sağladığı için kullanılabilir.
- **Renk anlam taşır.** Renkli yüzey yalnızca durumu anlatır (Karar 3.3). Kategori, menü bölümü ya da "canlılık" için renk kullanılmaz. Renkli ikon kutuları, pastel kart zeminleri ve degradeler (giriş ekranı marka paneli hariç) **yasaktır**.
- **Derinlik kenarlıkla verilir, gölgeyle değil.** Kartlar `1px border-default` ve gölge `none` kullanır. Gölge (`--ek-shadow-md/lg`) yalnızca gerçekten yükselen katmanlar içindir: menü, açılır liste, diyalog, komut paleti, toast.
- **Hareket yalnızca geri bildirimdir.** 150–250 ms (`--ek-duration-fast|base`; `slow`=300 yalnızca diyalog/çekmece giriş-çıkışı); `ease-out`/`ease-in-out`. Yalnızca şunlar animasyonlanır:
  - `opacity`
  - `translate` (≤ 2 px; yalnızca açılan katmanın giriş anında, hover'da DEĞİL)
  - `color` / `background-color` / `border-color` / `box-shadow`

  Aşağıdakiler **yasaktır**:
  - bounce/overshoot/elastic
  - hover'da yükselme (`translateY`) veya ölçek
  - ripple (global kapatılır)
  - dönen/zıplayan yükleme ikonları (yerine skeleton ya da ince ilerleme çubuğu)
  - otomatik kaydırma (marquee)
  - sayı sayma animasyonları

  `prefers-reduced-motion: reduce` altında tüm süreler 0'a iner, yalnızca ≤150 ms opaklık kalır.
- **Yoğunluk ayarlanabilir; varsayılan "rahat-kompakt".** Tablo satırı ≈44 px, kontrol yüksekliği 36–40 px. Kullanıcı menüsünden "Kompakt" seçilebilir (satır ≈36 px). Tercih `localStorage` `ek.ui.v1.density` anahtarında tutulur (PII yok, `plugins/i18n.ts`'in `lang` deseni). `<html data-density>` üzerinden yalnızca CSS değişkenleri değişir (bkz. 3.4).

**1.2 Tipografi**
- **Aile:** Inter (T5, self-hosted, değişmez). Kök `html { font-size:14px }` ve `px` token'ları korunur (ADR-0011 gerekçesi).
- **Ölçek:** `scale.ts` ölçeği yeterlidir, yeni boyut eklenmez.

  | Rol | Değer |
  |---|---|
  | Sayfa başlığı (H1) | `2xl` 22 / 600 / −0,01em |
  | Bölüm/kart başlığı | `lg` 16 / 600 |
  | Gövde ve tablo hücresi | `md` 14 / 400 |
  | İkincil metin, tablo başlığı, etiket | `sm` 13 / 500 |
  | Yardımcı metin, rozet | `xs` 12 / 500 |
  | KPI değeri | `3xl` 28 / 600 |

- **Sayısal değerler:** para, adet, tarih ve kimlik değerlerinde `font-variant-numeric: tabular-nums` kullanılır (yardımcı sınıf `.ek-num`). Tablo sayı sütunları sağa hizalanır.
- **Büyük harf kullanımı:**
  - Yeni ve değişen metinlerde **cümle düzeni** kullanılır. Düğmelerde de Vuetify'ın `text-transform: uppercase` davranışı kapatılır.
  - İstisna: spec çapası olan mevcut büyük harfli metinler (ör. `İŞLETME PERFORMANSI`) DOM'da **aynen** kalır. Bunlar "üst etiket" (overline) stiliyle sunulur: `xs` 12 / 600, `letter-spacing .04em`, `content-muted`. Gerekçe: Bağlam'daki Türkçe büyük/küçük harf tuzağı.
  - `<html lang="tr">` zaten var; CSS `text-transform` Türkçe İ/ı'yı doğru üretir.

**1.3 Marka tutarlılığı ve tek token kaynağı**
- **Tek kaynak `frontend/src/design/tokens/**`'tir.** Uygulama ve site yeni değerleri buraya ekler. Site kendine özgü `--site-*` katmanını korur (ADR-0014). Uygulamaya özgü, yalnızca CSS'te yaşayan türev değerler `src/design/app.css` içinde **`--ek-app-*`** önekiyle tanımlanır:
  - kabuk ölçüleri (kenar menü 248/64 px, üst çubuk 56 px, sekme şeridi 36 px)
  - yoğunluk değişkenleri
  - giriş paneli degradesi

  Kural sitedeki ile aynıdır: `--ek-app-*` yalnızca `--ek-*` üzerine kurulur ve hiçbir `--ek-*`'i yeniden tanımlamaz. Giriş paneli degradesi sitenin `--site-gradient-stage` tarifiyle **aynı formüldür** (`primary` → `color-mix(primary 62%, primary-darken-1)`).
- **Değer değişikliği kuralı:** sitenin kullandığı anahtarların değeri **değiştirilmez**. Bu anahtarlar grep ile doğrulandı (2026-09-28):
  - `primary`, `primary-darken-1`
  - `secondary`, `secondary-darken-1`
  - `background`, `surface`, `surface-muted`, `surface-sunken`
  - `content-*`, `border-*`

  Yeni ihtiyaçlar **yeni anahtarla** karşılanır (ör. `primary-hover`). Yalnızca durum renkleri (`success/warning/error/info`, Karar 3.3) değişir. Site bu anahtarları 1'er yerde kullanıyor; değişiklik siteye bilinçli olarak akar. Bu nedenle A1'in çıkış kapısında **site testleri de koşulur** (`site/` vitest + Playwright). Site ekran görüntüsü farkı yalnızca token yayılımından kaynaklanıyorsa yeniden tabanlanır; site kaynak kodu değişmez.

**1.4 Ürün logosu ve favicon**
- Uygulama, sitenin işaretini kullanır: lacivert kare, teal merkez, 3 düğüm ve Inter 800 "Entegrasyonik" kelime markası.
  - Geometri `src/design/brand/logo-mark.svg` dosyasında tutulur.
  - `EkBrandLogo.vue` inline SVG olarak render eder: `role="img"`, `aria-label="Entegrasyonik"`, `tone: default|inverse`, `variant: full|mark`.
- **Drift testi (Vitest, statik):** `logo-mark.svg` içindeki `rect/circle` geometrisi `site/src/components/Logo.astro` ile birebir eşit olmalıdır. Test site dosyasını yalnızca okur. Böylece iki yüzey aynı işareti kullanır; nihai logo geldiğinde iki dosya birlikte değişir (Açık Soru 1).
- **Favicon:**
  - `public/favicon.svg` (işaret) eklenir.
  - `favicon.ico` ve `public/icons/*` PWA ikonları, aynı SVG'den **tek seferlik** üretilip commit'lenir. Mevcut Playwright Chromium'u ile rasterleştirilir, yeni bağımlılık eklenmez.
  - `index.html` `<link rel="icon" type="image/svg+xml">` + ico yedeği ile güncellenir.
- Eski `logo*.png/svg` varlıkları, spec kancası değişikliği (Karar 5.1) girdikten ve grep 0 referans gösterdikten sonra A6'da silinir. Electron/installer ikonları kapsam dışıdır (Faz 4 Tauri).

### Karar 2 — Uygulama kabuğu (ADR-0012 sunum değişikliği)

**2.1 Yerleşim (≥1024 px, masaüstü)**
```
┌────────────┬───────────────────────────────────────────────────────────────┐
│ [■] Entegr.│  Üst çubuk 56px: [Ara veya komut…  Ctrl K]   (?) (🔔) [Avatar▾]│
│ Mağaza adı ├───────────────────────────────────────────────────────────────┤
│────────────│  Sekme şeridi 36px: [⌂][Siparişler ×][Ürünler ×] …    [≡ n][⤢]│
│ ★ Favoriler├───────────────────────────────────────────────────────────────┤
│ GENEL      │  Katalog / Ürünler                         (breadcrumb, xs)   │
│ KATALOG    │  Ürünler                        [İkincil] [+ Yeni ürün]       │
│ SİPARİŞLER │  Açıklama (isteğe bağlı)                                      │
│ ENTEGRAS.  │  [Filtre çubuğu …………………………………………]                          │
│ FİNANS     │  ┌ İçerik (tablo/kartlar) ───────────────────────────────┐   │
│ ─────────  │  │                                                        │   │
│ Ayarlar    │  └────────────────────────────────────────────────────────┘   │
│ Yardım  [«]│                                                               │
└────────────┴───────────────────────────────────────────────────────────────┘
```
- **Kenar menü (`NavigationMenu.vue`):**
  - Kalıcı `v-navigation-drawer`, 248 px. `«` ile 64 px'lik "ray" moduna daralır; rayda ipuçları gösterilir. Tercih `localStorage` `ek.ui.v1.sidebar` anahtarında tutulur (PII yok).
  - Zemin `surface-muted`, sağ kenarlık `border-default`.
  - Etkin öğe: `surface` zemin, sol 2 px `primary` çizgi, `content-strong` metin. Diğer öğeler `content-default`, ikonlar `content-muted`.
  - Bölüm başlıkları overline stilindedir.
  - En üstte işaret + kelime markası ve mağaza adı yer alır. Birden çok mağaza değiştirme özelliği varsa (bugün **doğrulanamadı**; `ApplicationBar`'daki mağaza/kullanıcı menüsü) buraya "mağaza seçici" olarak taşınır. Yoksa yalnızca ad gösterilir.
  - Favoriler (sunucu persist'li, `menu.ts`) en üstte kalır.
  - "Ayarlar" ve "Yardım" alt bölgeye sabitlenir.
  - `mouseover`/kenar-hover ile açma **kaldırılır** (ADR-0012 Karar 5'in "isteğe bağlı kısayol" maddesi; kalıcı menüde gereksiz).
- **Üst çubuk (`ApplicationBar.vue`), 56 px, `surface` + alt kenarlık:**
  - **Komut paleti tetikleyicisi:** "Ara veya komut… Ctrl K" görünümlü alan (Karar 2.5).
  - Yardım ve bildirim düğmesi. Bildirim düğmesi mevcut `NotificationDrawerComponent`'i sağ çekmece olarak açar ve yeniden stillenir.
  - Kullanıcı menüsü: ad, e-posta, mağaza, "Yoğunluk", "Profil ve güvenlik", "Çıkış".
  - **Tema anahtarı gizlenir.** İşlevsizdir (ADR-0011 Karar 3); dark kapısı açılınca geri gelir.
- **Sekme şeridi (`SecureLayout.vue`, ADR-0012 modeli aynen):**
  - 36 px, `surface-muted` zemin, alt kenarlık.
  - Her sekme: 16 px ikon + başlık (maksimum 200 px, kırpma + ipucu) + kapatma "×". Kapatma düğmesi etkin sekmede ve hover/odakta görünür; dokunmatikte her zaman görünür.
  - **Etkin sekme:** `surface` zemin, üst 2 px `primary` çizgi, `content-strong` metin. Klasör şekli ve köşe yuvarlaması **yok**.
  - Dashboard sekmesi yalnızca ev ikonu olarak gösterilir, kapatılamaz (ADR-0012 Karar 3).
  - Sağ uçta "Açık sayfalar (n)" taşma menüsü (mevcut `WorkplaceTabSwitcher`) ve "Odak modu ⤢" (mevcut `expanded` davranışı: üst çubuğu gizler) yer alır. Bugünkü sağ üstteki başıboş "□" düğmesi buraya taşınır.
  - Çok örnekli sekme grupları (`element.list`, açılır alt menü) aynı görsel dilde korunur.
- **Çalışma alanı:** `background` zemin; çerçeve ve gölge yok. İçerik azami genişliği yoktur (veri ekranları tam genişlik). Ayar ve sihirbaz şablonları 960 px ile sınırlanır. Sayfa iç boşluğu 24 px (tablette 16, mobilde 12).

**2.2 Tablet ve mobil (ADR-0012 Karar 5'i DEĞİŞTİRİR)**

| Kırılım | Kenar menü | Üst çubuk | Sekmeler |
|---|---|---|---|
| ≥1024 | Kalıcı 248 px, rayla daralır | Tam | Tam şerit + "Açık sayfalar" |
| 768–1023 | **Kalıcı ray (64 px)**, simgeye veya `≡`'ye basınca 248 px'lik **üst katman** (temporary) olarak açılır | Tam; arama ikona iner | Sıkı şerit (ADR-0012 Karar 5 tablet kuralları aynen: 44×44 hedef, kapatma her zaman görünür) |
| <768 | Gizli; üst çubukta `≡` ile tam yükseklikte `temporary` çekmece | `≡`, işaret, arama ikonu (paleti tam ekran açar), bildirim, avatar | ADR-0012 Karar 5 mobil kuralı **aynen**: şerit gizli, etkin sekme başlığı + değiştirici (`v-bottom-sheet`) |

Kırılım kararı `useDisplay().width` ile `breakpoint` token'larına bağlıdır. Global `display.thresholds`'a **dokunulmaz** (ADR-0011 T4e kararı sürer).

**2.3 Sayfa başlığı düzeni (`EkPageHeader`)**
- Her ekranın ilk öğesi şu sırayı izler: breadcrumb (`Bölüm / Ekran`; bölüm adı kayıt defterinden gelir, tıklanabilir değil), H1, isteğe bağlı açıklama (1 satır, `content-muted`), sağda **en fazla 1 birincil eylem** + ≤2 ikincil eylem + `⋯` taşma menüsü.
- Filtre çubuğu başlığın altında, içerikten önce gelir (`EkFilterBar`: arama, tarih aralığı, filtre çipleri, "Filtreleri temizle", yenile).
- **Başlığın sekme başlığıyla aynı olması zorunludur.** Tek kaynak `screens.ts` + i18n'dir. Bu kural `MENU.USER.SUBSCRIPTION` türü çevrilmemiş anahtarları yakalar: A2'de kurulan yeni statik test, kabuk ve yeni ekranlardaki `$t('…')` literal anahtarlarının `tr.json`'da var olduğunu doğrular.

**2.4 Bilgi mimarisi ve yeni ekranlar için yer ayırma (ADR-0012 Karar 2'yi DEĞİŞTİRİR)**
- `screens.ts` kayıtlarına yalnızca **sunum** alanları eklenir: `section` (bölüm), `order`, `icon` ve `titleKey` (i18n anahtarı).
- **Erişilebilirliğin kaynağı değişmez:**
  - Mevcut ekranlar yalnızca `MenuService` menüsünde varsa görünür ve URL'den çözülür (ADR-0012).
  - Menüde olup kayıt defterinde bölümü olmayan kodlar "Diğer" bölümüne düşer, **asla gizlenmez** (menü backend'de genişlerse ekran kaybolmaz).
- **Yeni istisna:** kayıt defterinde `menuSource: 'registry'` olarak işaretlenen **yeni** ekranlar `MenuService`'e bağlı değildir. Kullanıcının `userContext` rolü kayıttaki `minRole` ipucunu karşılıyorsa görünür ve çözülür (ör. Ayarlar alt sayfaları). Bu yalnızca **görünürlük ipucudur**; veri erişiminin yetki sınırı backend RBAC'tir (ADR-0001), dolayısıyla yeni bir güvenlik yüzeyi açılmaz. Bu ekranlar için `menus` DB belgesine yazılmaz (Alternatif F).
- **Bölüm iskeleti.** Bölümler kilitlidir; içerikler kilitlenmez. İçerik, `docs/FRONTEND_GAP_ANALYSIS.md` (2026-09-28) ekran envanterinden (§a, 41 ekran) ve N1–N20 önerilerinden, ayrıca `docs/research/2026-09-28-saas-capability-benchmark.md` Y-01..Y-33 kataloğundan uzlaştırılmıştır. N/Y kimlikleri o belgelere referanstır. Ölü veya prototip ekranlar (gap §d) menü içeriğine **alınmaz** (Aşama 0).

| Bölüm (`section`) | Bugün çalışan ekranlar (MenuService) | Tamamlanacak / yeni (N = gap analizi, Y = benchmark) | Sonraki dalgalar için yer (şimdi eklenmez) |
|---|---|---|---|
| Genel | Ana sayfa | Kurulum rehberi / onboarding sihirbazı (N12, Y-22) | — |
| Katalog | Ürünler, Ürün tanımla/güncelle, Kategoriler, Markalar, Seçenek grupları, Etiketler | Stok politikası (N5, Y-09) | İçe aktarma (Excel/XML, Y-07), kanal fiyat kuralları (Y-16) |
| Siparişler | Siparişler, İadeler, Müşteriler, Mesajlar, Faturalar | Aşırı satış / rezervasyon görünümü (N6, Y-09 b/c), Sevkiyatlar ve etiket yazdırma (N15, ölü `PrintoutListView` yerine) | Otomasyon kuralları (Y-15) |
| Entegrasyonlar | Pazaryeri, E-ticaret, ERP, Kargo, E-fatura, İşlemler (log) | Entegrasyon sağlığı (N7, Y-06); kullanılamayan sağlayıcıların "Yakında" durumu (N13; ekran değil, B2 içinde) | Mutabakat raporu (N8) |
| Finans ve raporlar | Finansal işlemler, Abonelik ve planlar | Finans özet/kargo faturası/ödeme dökümü sekmeleri (N14), abonelik yönetimi: iptal/plan değiştir/kart/fatura geçmişi/kullanım (N3, Y-04) | Raporlar ve kâr analizi (Y-11), hakediş mutabakatı (Y-12) |
| Ayarlar (alt bölge; tek "Ayarlar" sekmesi + sol alt-gezinme, 3.9) | Mağaza ayarları (`SettingListView`), Kullanıcılar ve yetkiler (`AuthorizationListView`) | Hesabım ve güvenlik (N1; `ChangePasswordView` yerine), Ekip daveti ve rol açıklamaları (N11), Bildirim tercihleri (N9), Veri ve gizlilik / KVKK (N4, Y-21), Denetim günlüğü (N10, Y-20) | 2FA (Y-20), API anahtarları ve giden webhook (Y-14) |
| Yardım (alt bölge) | Destek talepleri | Yardım merkezi (N16; yanlış bağlı "Eğitim merkezi" kısayolunun doğru hedefi), bildirim merkezi tam sayfası (N9) | Durum sayfası bağlantısı (N17, Y-28) |
| Yönetim | Mağazalar, Destek yönetimi, Sistem | Silme bekleyen mağazalar / geri al (gap b-1 `cancelDeletion`, N4 ile) | — |

- **Yönetim bölümünün görünürlüğü:** bugünkü gibi `MenuService` içeriğine bağlıdır. Menü belgesi kademeye göre süzülmüyor (gap §6-2); sunum katmanında ek gizleme **yapılmaz**, çünkü admin spec fixture'ları buna dayanıyor ve yetki sınırı backend'dedir. Kademe süzmesi N18'in backend kısmıyla (`MenuService` süzmesi) gelir. Gelene dek yetkisiz erişim ortak 403 ekranına düşer (N18 FE, A2/A3).
- **Giriş ekranındaki "Şifremi unuttum" sekmesi** bugün ölüdür (gap a-30). A4 onu stiller ama işlevsiz bırakmaz: `docs/API_ACCOUNT_LIFECYCLE.md` sözleşmesi hazırsa N2 akışı bağlanır; hazır değilse sekme "Parola sıfırlama için destek ile iletişime geçin" bilgisini ve bağlantısını gösterir. Bu **yalnız metin**dir, sahte form gösterilmez. Sekmenin rolü ve adı (spec çapası) korunur.

- **İlke (bağlayıcı):** yeni ekranlar **aynı tasarım sistemi, kabuk ve şablonlarla** eklenir (Karar 3.9). Kendi özel düzenini icat eden ekran kabul edilmez.
- **Backend'i olmayan ekran menüye "yer tutucu" olarak konmaz.** Bugünkü Kargo/E-fatura gibi yalnız-UI formlarının tekrarlanmaması için, API sözleşmesi hazır olmayan kayıt `enabled:false` ile gizli kalır.

**2.5 Komut paleti ve arama**
- `Ctrl/⌘ K` veya üst çubuk alanı ile açılır; `v-dialog` + `v-list` ile yazılır, **yeni bağımlılık yok**.
- **Kaynaklar:**
  - ekranlar (kayıt defteri ∩ erişilebilir menü)
  - açık sekmeler
  - son açılanlar (yalnız bellek)
  - eylemler (ör. "Yeni ürün", kayıtta `actions` alanıyla)
  - mevcut "Akıllı Arama" (ürün/sipariş/müşteri): bugünkü `ApplicationBar` arama davranışı ve servisi **aynen** paletin "Kayıtlar" bölümüne taşınır.
- ADR-0012 PII kuralı sürer: müşteri adı/telefon araması URL'ye yazılmaz.
- Klavye: ↑/↓/Enter/Esc; `role="combobox"` + `listbox`.
- Mobilde tam ekran açılır.

### Karar 3 — Tasarım sistemi bileşen kararları

**3.1 Vuetify global `defaults` (A1, bileşen ailesi başına bir commit)**

| Bileşen | Varsayılan |
|---|---|
| `global` | `ripple: false` |
| `VBtn` | `variant:'flat'`, `elevation:0`. Birincil düğme her zaman açıkça `color="primary"` ile verilir. Renksiz düğmelerin görünümü override CSS ile nötr "ikincil" düğmedir: `surface` + `border-strong` + `content-strong`. |
| `VTextField` `VSelect` `VAutocomplete` `VCombobox` `VTextarea` | `variant:'outlined'`, `density:'compact'`, `color:'primary'`, `hideDetails:'auto'`. `label` prop'u **korunur**: erişilebilir ad, spec'lerin `getByLabel` çapasıdır. |
| `VCheckbox` `VSwitch` `VRadioGroup` | `color:'primary'`, `density:'compact'`, `hideDetails:'auto'` |
| `VCard` | `variant:'flat'`, `border:true`, `elevation:0` |
| `VDataTable` `VDataTableServer` | `hover:true`, `fixedHeader:true`, `density:'compact'`. Satır yüksekliği yoğunluk değişkeninden gelir. |
| `VChip` | `size:'small'`, `variant:'tonal'`. Durum için `EkStatusChip` kullanılır, çıplak `v-chip` kullanılmaz. |
| `VTabs` | `density:'compact'`, `color:'primary'` |
| `VDialog` | `transition:'fade-transition'`, `scrollable:true` |
| `VMenu` | `transition:'fade-transition'` |
| `VTooltip` | `openDelay:400`, `location:'bottom'` |
| `VList` | `density:'compact'` |
| `VAlert` | `variant:'tonal'`, `density:'compact'` |
| `VProgressLinear` | `color:'primary'`, `height:2` |
| `VSkeletonLoader` | tema yüzey renkleri (token) |

- **Radius, düğme harf dönüşümü, odak halkası, kontrol yükseklikleri, tablo başlık stili ve yoğunluk** Vuetify `rounded` değerleriyle ayarlanmaz. Vuetify'ın SASS'a bağlı ölçeği bizim `--ek-radius-*` ölçeğimizle birebir değildir ve SASS `configFile` ADR-0011 gereği kapalıdır. Bunlar T5 emsaliyle (`vuetify-font-overrides.css`) yeni **`src/design/vuetify-overrides.css`** katmanında `--ek-*` token'larıyla uygulanır:
  - kontrol/düğme `radius-md` (6)
  - kart/diyalog `radius-lg` (8)
  - komut paleti/menü `radius-lg`
  - rozet `radius-full`

  Her `!important` gerekçesiyle yorumlanır.
- **Odak göstergesi:** `:focus-visible` üzerinde 2 px `primary` halka + 2 px ofset (`--ek-app-focus-ring`), tüm etkileşimli öğelerde.

**3.2 Tablo dili (`v-data-table(-server)` + `EkTable*` yardımcıları)**
- **Başlık:** `surface-muted` zemin, `sm` 13/500 `content-muted`, sticky. Sütun ayırıcı "│" **yok**. Sıralanabilir sütunda `aria-sort` + ok ikonu.
- **Satırlar:** yalnızca alt kenarlık `border-default`; zebra yok. Hover `surface-muted`, seçili satır `primary` %6 `color-mix`. Satır yüksekliği `--ek-app-row-h` = 44 (rahat) / 36 (kompakt).
- **Hücreler:**
  - Birincil tanımlayıcı `content-strong` 500; ikincil bilgi (müşteri, SKU) altında `xs` `content-muted`.
  - Sayı/para sağa hizalı, `.ek-num`. Tarih `dd.MM.yyyy HH:mm`, `.ek-num`.
- **Satır eylemleri:**
  - En fazla 1 görünür birincil satır eylemi (ör. "Detay", göz ikonu).
  - Diğer eylemler `⋯` menüsünde toplanır.
  - İkon düğmeleri **nötr hayalet** (32 px, `content-muted`, hover `surface-sunken`). Satırda renkli dolgu düğme **yok**.
  - Yıkıcı eylem menüde `danger` metinle durur ve onay diyaloğu açar.
  - **Spec kancası olan ikon adları korunur** (Ek A): `mdi-eye`, `mdi-eye-outline`, `mdi-plus`, `mdi-delete-sweep-outline`, `mdi-chart-box-outline` ve spec'lerde `button:has(...)` ile seçilen düğmeler görünür kalır, `⋯` içine gizlenmez.
- **Toplu eylem:** seçim yapılınca tablo üstünde "n seçildi · [eylemler] · Seçimi kaldır" çubuğu (mevcut `BatchProcessMenu`) gösterilir.
- **Sayfalama (`PaginationComponent`):** "Toplam 128 · 1–25", sayfa başına seçici, önceki/sonraki. Devre dışı düğmelerde `aria-label` bulunur; T4h'nin kapsam dışı bıraktığı axe ihlali A2'de kapanır.
- **Durumlar (ZORUNLU, premium-ui-standards):**
  - **Yükleniyor:** tablo iskeleti (`v-skeleton-loader type="table-row@8"`, başlık korunur). **Spinner yok**; yalnızca yeniden yüklemede üstte 2 px `v-progress-linear`.
  - **Boş (ilk kullanım):** `EkEmptyState` + birincil eylem.
  - **Boş (filtre sonucu):** "Sonuç yok" + "Filtreleri temizle".
  - **Hata:** `EkErrorState` ("<ne oldu> — <ne yapılmalı>" + "Tekrar dene").
  - **Hata ile boş ayrı gösterilir.** T1b gizli davranışı (3), yani hata ile "veri yok"un aynı karta düşmesi, bu ekranlar B'de taşınırken düzeltilir. Mevcut spec bunu **sabitlemişse** o spec'in davranış iddiası değişecektir; bu durumda Karar 5.1 değişiklik listesine girer ve ayrı commit'lenir. Aksi halde düzeltilmez, BACKLOG'da kalır.

**3.3 Durum rozeti sistemi ve renk kararları (ADR-0011 Açık Soru 4 KARARI)**
- **Tek anlamsal palet, 5 ton.** Değerler bu ADR sırasında WCAG göreli parlaklık formülüyle hesaplandı. Yeni primitifler (`green/amber/red/sky` 700, `slate` 600) `palette.ts`'e eklenir.

| Ton | Çekirdek anahtar (canlı tema) | Dolgu / metin (tek değer) | Zemin (`*-subtle`, mevcut) | Metin/zemin kontrastı | Beyaz metin/dolgu kontrastı |
|---|---|---|---|---|---|
| success | `success` | `#15803D` (green-700) | `#DCFCE7` | 4,57:1 | 5,02:1 |
| warning | `warning` | `#B45309` (amber-700) | `#FEF3C7` | 4,51:1 | 5,02:1 |
| danger | `error` (+ legacy `danger` eşlemesi) | `#B91C1C` (red-700) | `#FEE2E2` | 5,30:1 | 6,47:1 |
| info | `info` | `#0369A1` (sky-700) | `#E0F2FE` | 5,17:1 | 5,93:1 |
| neutral | **yeni** `neutral` | `#475569` (slate-600) | **yeni** `neutral-subtle` = `#F1F5F9` | 6,92:1 | 7,58:1 |

- Bugünkü `success #4CAF50` (2,78:1), `warning #FB8C00` (2,37:1), `info #00ACC1` (2,74:1) ve `error #B00020` bu değerlerle **değiştirilir** (Açık Soru 4'ün "legacy semantik değer iyileştirmesi" maddesi, A1).
- **warning 4,51:1 sınırdadır.** Token birim testi her ton için "metin/subtle ≥4,5" ve "beyaz/dolgu ≥4,5" koşulunu zorlar. Dark değerleri de tanımlanır (TS tipi zorlar), dark kontrast testi kapı değerlendirmesinde çalışır.
- **`EkStatusChip`:** `tone` + `label` + isteğe bağlı nokta. Görünüm: `subtle` zemin + ton metni, 20 px yükseklik, `xs` 12/500, `radius-full`, 6 px nokta. **Dolgu (solid) rozet yalnızca "yeni/okunmamış" sayaçlarında** kullanılır. Renk tek başına anlam taşımaz; metin her zaman vardır (WCAG 1.4.1).
- **Alan eşlemesi tek dosyadadır: `src/design/status-map.ts` (saf TS).** Sipariş iç durumları, iade/talep, mesaj, entegrasyon bağlantısı, abonelik (ADR-0008 durumları), mağaza aktif/pasif, iş/log durumları → ton + i18n etiket anahtarı. Ekranlar renk seçmez, durum kodunu verir. T4d'nin satır-bazlı `--status-chip-color` + `color-mix()` deseni bu bileşenle değiştirilir.
- **"Canlı iş-durumu paleti" KARARI (T4g/T4h'nin bıraktığı emerald/red/amber/indigo literal'ları, `CHART_STATUS`):** iş durumları anlamsal tonlara eşlenir, özel renk kullanılmaz:

  | İş durumu | Ton |
  |---|---|
  | kuyrukta / bekliyor | neutral |
  | işleniyor | info |
  | tamamlandı | success |
  | kısmi / uyarılı | warning |
  | hatalı | danger |

  Grafik serileri aynı tonların dolgu değerlerini `tokens`'tan JS değeri olarak alır (ECharts CSS değişkeni okuyamaz, ADR-0011 Karar 2 istisnası). `CHART_STATUS` sabiti bu eşlemeyle yeniden bağlanır; indigo ve bespoke tonlar kalkar.

**3.4 İkon seti**
- **Kural (1):** Tek aile olarak MDI kullanılır (Alternatif C3). Yeni veya değişen kullanımda **outline** varyant tercih edilir (`mdi-*-outline` varsa).
- **Kural (2):** Boyutlar 16 (satır içi/sekme), 18 (düğme), 20 (gezinme) px'tir. Rozet ve boş durum illüstrasyonu dışında 24 px üstü kullanılmaz.
- **Kural (3):** Renk varsayılan `content-muted`, etkin ya da vurgulu durumda `content-strong`/`primary`; durum ikonu ton rengini alır. **Renkli ikon kutusu yok.**
- **Kural (4):** Ek A'daki spec kancası ikon adları **dondurulur**; Aşama 0 adım 0.0 tam listeyi çıkarır.
- **Kural (5):** İkon-only düğmeler `aria-label` taşımak zorundadır. Mevcut Vitest mandal ailesine eklenecek basit bir statik test `v-btn icon` + `aria-label` yokluğunu sayar ve bu sayı artamaz.

**3.5 KPI/istatistik kartı (`EkKpiCard`)**
- Etiket `sm` 13/500 `content-muted`, değer `3xl` 28/600 `content-strong` `.ek-num`, isteğe bağlı ikincil değer (ör. tutar) `sm` `content-default`.
- İsteğe bağlı değişim göstergesi: ▲/▼ + yüzde, `success`/`danger` **metin** rengi, zemin yok. Değişim 0 ise ya da veri yoksa gösterilmez.
- İsteğe bağlı mini çizgi grafik (sparkline, ECharts, eksensiz).
- Kart: kenarlık, gölge yok, iç boşluk 20 px. Tıklanabilirse tam kart bağlantıdır; hover'da kenarlık `border-strong` olur, **yükselme yok**.
- Dashboard spec'inin tıkladığı `.large-stat-card` sınıfı tıklanabilir KPI kartında **korunur** (Ek A).
- Pastel zemin ve "etiket biçimli" tutar rozetleri kaldırılır.

**3.6 Grafik stili (ECharts teması)**
- `src/design/echarts-theme.ts` saf TS adaptördür: `buildEchartsTheme(tokens)` → `echarts.registerTheme('entegrasyonik', …)`, tek noktadan `main.ts`'te kayıt. Bunu kullanan 4 dosya (`StatisticsComponent`, `DetailedExport/ImportLogReport`, `AdminSystemManagementView`) `theme="entegrasyonik"` ile yeniden bağlanır.
- **Stil:**
  - Eksen çizgileri `border-default`, etiketler `xs` `content-muted` Inter; ızgara yalnızca yatay, kesikli değil düz ve `border-default`.
  - Çubuk üst radius 4; **degrade ve gölge yok**.
  - Tooltip `surface` + `shadow-md` + `radius-md`.
  - Lejant altta. `animationDuration ≤ 250`, `animationEasing 'cubicOut'` yerine `'linear'`/`'quadraticOut'` (overshoot yok). Güncellemede animasyon yok.
- **Kategorik palet (yeni `chart-1..5` token'ları, her biri `surface` üzerinde ≥3:1 — WCAG 1.4.11, birim testle):** `#13255B` (primary, 14,55), `#018786` (4,36), `#0369A1` (5,93), `#B45309` (5,02), `#64748B` (4,76). 5'ten fazla seri gerekiyorsa "Diğer" altında toplanır.
- **Durum grafiği serileri** Karar 3.3 tonlarını kullanır.
- **Dashboard'daki "Bekleyen aksiyonlar" çubuk grafiği** eylem listesine dönüştürülür: "Fatura bekleyen 1 →", "Kargo bekleyen 2 →". Tıklanınca ilgili filtreli sekme açılır (mevcut `StatisticsComponent` `openTab` parametreleriyle). 4 kategorili bir sayım için çubuk grafik, eyleme dönüştürülebilir listeden daha az kullanışlıdır.

**3.7 Form dili**
- **Etiket:** Vuetify `label` (outlined, yüzen etiket) korunur, çünkü erişilebilir ad ve spec çapasıdır. Zorunlu alanlar etiket sonunda "*" + `aria-required` taşır.
- **Yardım metni:** alan altında `xs` `content-muted`.
- **Hata metni:** `error` tonu, "<ne oldu> — <ne yapılmalı>". Metin backend eşlemesinden gelir, frontend metin uydurmaz (skill).
- **Kenarlık kontrastı:** giriş alanı kenarlığı için **yeni `border-input` token'ı** tanımlanır ve `surface` üzerinde ≥3:1 olmalıdır (WCAG 1.4.11). Mevcut `border-strong #CBD5E1` 1,48:1'dir ve yetersizdir. Değer A1'de birim testle seçilir (aday: slate-500).
- **Düzen:** ≥1024 px'te ilişkili alanlar 2 sütun, altında 1 sütun. Uzun formlar başlıklı bölümlere ayrılır.
- **Ayar formlarında:** alttaki yapışkan eylem çubuğunda "Kaydet" (birincil, sağda) + "Vazgeç". Kaydedilmemiş değişiklik varsa çubuk görünür olur.
- **Düğme hiyerarşisi:** ekran başına 1 birincil; ikincil nötr kenarlıklı; üçüncül metin düğmesi. Yıkıcı düğme `error` dolgu yalnızca onay diyaloğunun son adımındadır.
- **Mikro-kopya çapaları.** `EPosta` gibi yazım kusurları spec çapasıdır (`getByLabel('EPosta')`). Bu ADR'de **düzeltilmez**, "metin/mikro-kopya" ayrı görevine bırakılır (BACKLOG önerisi). O görev spec literal'lerini açıkça günceller.

**3.8 Diyalog ve çekmece kuralları**
- **Onay diyaloğu (`ConfirmationDialogComponent`/`ActionDialogComponent` yeniden stillenir, API aynı):** 400 px, başlık + 1–2 cümle + eylemler sağda. Yıkıcı eylemde nesne adı açıkça yazılır ("'E2E Örnek Mağaza' silinsin mi?").
- **Kısa form diyaloğu:** ≤5 alan, 560 px.
- **Kayıt detayı: "yan sayfa" (side-sheet) sunumlu `v-dialog`** (Alternatif D2).
  - Görünüm: sağa yaslı, tam yükseklik, 720 px (≥1024), tablette %90, mobilde tam ekran (ADR-0012 `useBackDismiss`).
  - Yapı: başlıkta kimlik + durum rozeti + kapat; gövdede bölümler; eylemler üst sağda.
  - `role="dialog"` ve odak tuzağı korunur.
  - Sipariş/iade detayındaki 5 renkli dev eylem düğmesi 1 birincil + ikincil + `⋯` hiyerarşisine iner.
- **Çekmece (`v-navigation-drawer location=right`)** yalnızca eşzamanlı çalışma gerektiren yan paneller içindir: bildirimler, filtre paneli (mobil).
- **Diyalog geçişi** `fade` + 2 px translate, 200 ms. Scrim `content-strong` %40 (`color-mix`).

**3.9 Yeni ekran şablonları (kapsam eki — `src/components/ds/templates/`)**
Yeni ekranlar (B4) ve fırsat oldukça mevcut ekranlar bu 4 şablondan birini kullanır. Şablon bir **düzen bileşenidir** (slot'lu); iş mantığı içermez.
1. **`EkListDetailTemplate` (liste + detay yan sayfası):** `EkPageHeader` + `EkFilterBar` + sunucu tablosu + yan sayfa detay. Boş/filtre-boş/hata/yükleniyor durumları yerleşiktir. URL parametresi sözleşmesi `screens.ts` `urlParams` üzerinden (ADR-0012) verilir.
2. **`EkSettingsTemplate` (ayar sayfası):** 960 px içerik. Bölümler "sol: başlık + açıklama (1/3) · sağ: alanlar (2/3)" (mobilde üst üste) biçimindedir. Yapışkan kaydet çubuğu ve kaydedilmemiş değişiklik uyarısı vardır (ekran başına `beforeClose`, ADR-0012 Karar 4 notu). Ayarlar bölümündeki alt sayfalar ayrı sekme değil, **tek "Ayarlar" sekmesi içinde sol alt-gezinme**dir (sekme şişmesini önler).
3. **`EkWizardTemplate` (sihirbaz/onboarding):** adımlayıcı; ≥1024 px'te yatay, altında dikey ve "Adım 2/4" gösterir. Her adımın doğrulaması, "Geri / İleri / Daha sonra" düğmeleri vardır. İlerleme yalnızca adım indeksi olarak kullanıcı+tenant kapsamlı `sessionStorage`'da tutulur (form verisi/PII yazılmaz, ADR-0012 persist ilkesi). Dashboard'da ilerleme gösteren "Kurulum rehberi" kartı sihirbaza bağlanır.
4. **`EkReadonlyPanelTemplate` (salt-okunur panel — sağlık/denetim):** KPI satırı + durum listesi (`EkStatusChip`) + zaman çizelgesi/log tablosu. "Son güncelleme: 14:05 · Yenile" göstergesi bulunur. Otomatik yenileme varsa yalnızca metin değişir, **nabız/yanıp sönme animasyonu yok**.

**3.10 Boş durum illüstrasyonları**
- `EkEmptyState` (mevcut `components/layout/EmptyState.vue` API'si korunarak genişletilir): 96 px **inline SVG**, tek renk (`currentColor` = `content-subtle` + 1 `primary` %12 vurgu), maskot/karakter yok.
- **5 varyant:** `no-data`, `no-results`, `error`, `not-connected` (entegrasyon bağlı değil), `first-run`.
- **Metin yapısı:** başlık (`lg` 16/600) + 1 cümle açıklama + en fazla 1 birincil eylem.
- Mevcut spec'lerdeki boş durum metinleri (`'Sipariş Bulunamadı'` vb.) **aynen** kalır.

**3.11 Platform (pazaryeri) logo yerleşimi (`EkPlatformMark`, `PlatformImageComponent`'in yerine)**
- **Varsayılan: monogram rozeti.** 24/32 px yuvarlak kare, `surface-sunken` zemin, `content-strong` baş harf, yanında `sm` 500 platform adı.
- **Marka rengi:** yalnızca 6 canlı entegrasyon için 3 px sol şerit ya da nokta olarak kullanılır. Değerler `palette.ts` `integrationAccent` haritasında tutulur (literal ekranlarda yok).
- **Veri eksikliği:** entegrasyon verisi yoksa (bugünkü `'#eee'` düşüşü) nötr monogram gösterilir, **asla soluk/boş kutu gösterilmez**.
- **Resmî logo görselleri kullanılmaz.** Ticari marka kullanım izni ADR-0014 Açık Soru 3 ile aynı insan kararıdır (Açık Soru 2). İzin gelirse `EkPlatformMark` tek noktadan SVG logoya geçer. `public/assets/images/integrations/**` bu karar netleşince ayıklanır.
- **Seçilebilir ray** (pazaryeri/e-ticaret/ERP ekranlarının üstündeki platform seçici): WAI-ARIA tablist deseni (T4c) korunur. Görünüm: 40 px yükseklikte "segment" kartları; seçili olan `primary` kenarlık + `surface`, diğerleri `surface-muted`.

**3.12 Katmanlama ve adlandırma**
- Yeni bileşenler `src/components/ds/` altında **`Ek` önekli** olarak tutulur. CSS sınıfları `ek-` önekli BEM biçimindedir (`ek-page-header__title`). Böylece global `site.css`'teki `.page-title` türü çakışmalar (Bağlam 8) bir daha yaşanmaz.
- **Global legacy CSS (A1b):**
  - `public/assets/css/site.css` ve `integrations.css` literal-stil mandalının kapsamına **eklenir** (sayı artamaz).
  - Seçicisi `src/**`'te 0 eşleşen kurallar grep kanıtıyla silinir.
  - Çakışan kurallar (`.page-title` vb.) kaldırılır ve etkiledikleri ekran görüntüsü bilinçli yeniden tabanlanır.
  - `html { font-size:14px }` kalır.
  - Dosyanın `src/styles/legacy/` altına taşınması A1b'nin kararıdır; import sırası korunur.

### Karar 4 — Giriş / Kayıt ekranı
- **Düzen (≥1024 px): iki sütun.**
  - **Sol, 5/12 genişlikte marka paneli:**
    - Zemin: lacivert, degrade formülü sitenin `--site-gradient-stage`'i ile aynı (Karar 1.3), düşük opaklıklı teal ışıma. Görsel olarak siteyle aynı markaya aittir.
    - İçerik: ters (inverse) logo, başlık "Tüm pazaryerleriniz, tek panelde" (site hero çizgisi), 3 güven maddesi. Maddeler **yalnızca kanıtlı iddialardır** (ADR-0014 Karar 5 izin listesi):
      - "Pazaryeri API anahtarlarınız AES-256-GCM ile şifrelenir"
      - "Her mağazanın verisi ayrı veritabanında tutulur"
      - "Kart bilgileriniz sistemimizden geçmez"
    - Altta ürünün soyut **inline SVG** önizlemesi (raster ekran görüntüsü değil → LCP metin/SVG, hareket yok).
    - İngilizce "SSL SECURED" rozeti ve doğrulanamayan "Veri güvenliği" rozeti kaldırılır.
  - **Sağ, 7/12 genişlikte form alanı:** beyaz zemin, kart yok, 400 px form sütunu dikey ortalı.
    - Üstte H1 "Hesabınıza giriş yapın" / "Hesap oluşturun".
    - **Sekme denetimi:** GİRİŞ / KAYIT / ŞİFREMİ UNUTTUM, `role="tab"`. Erişilebilir adlar spec çapası olduğu için **aynen korunur**; görünüm segment kontrolüdür.
    - Birincil düğme tam genişlik, `primary`.
    - Altta yasal bağlantılar (`xs`) ve "← entegrasyonik.com" bağlantısı.
- **768–1023 px:** marka paneli 160 px'lik üst şeride iner (logo + başlık), form altında ortalanır.
- **<768 px:** tek sütun; üstte işaret + kelime markası, form tam genişlik (16 px kenar boşluğu); güven maddeleri formun altında tek satırlık liste olarak gösterilir.
- **Kayıt devri (ADR-0014 S4b) korunur:** `mode=register&plan=&interval=` → KAYIT sekmesi seçili. Plan izin listesi davranışı değişmez. Yeni görsel öğe: formun üstünde "Seçilen plan: Büyüme · Yıllık — değiştir" satırı; bilinmeyen plan sessizce yok sayılır ve satır görünmez. `register-handoff.spec.ts` ve `login*.spec.ts` davranış iddiaları değişmez.
- CAPTCHA'nın açık metin gösterimi (T1b gizli davranış 1) bir **güvenlik/davranış** konusudur; bu ADR'de düzeltilmez (BACKLOG'da kalır), yalnızca stillenir.

### Karar 5 — Uygulama sırası, Protokol 13 uyarlaması ve risk

**5.1 Spec sözleşmesi (bağlayıcı)**
- **`e2e/specs/*.spec.ts` davranış iddiaları DEĞİŞTİRİLMEZ.** Görsel yenileme Ek A'daki kancaları DOM'da korur: sınıf adları, ikon sınıfları, rol ve erişilebilir adlar, etiket ve çapa metinleri.
- **İzinli değişiklik 1 — yardımcılar.** `e2e/fixtures/**` (`nav.ts` `openDrawer`/`openScreen`/`waitForShellReady`) kabuk değişince güncellenir. ADR-0011 Karar 4 ve ADR-0012 Karar 6 emsalidir: "gezinme değişirse yalnızca `openScreen()` güncellenir." Kalıcı kenar menüde "çekmece kapanmasını bekle" adımı masaüstünde atlanır. Mobilde logo yerine `getByRole('button',{name:'Menüyü aç'})` kullanılır.
- **İzinli değişiklik 2 — sunuma bağlı iddialar, kapalı liste.** Aşağıdakiler **ayrı, tek bir commit'te** ("spec-sözleşme değişikliği") ve gerekçeyle değişir:
  1. `shell.spec.ts:17` `img[src="/assets/images/logo6.png"]` → `getByRole('img',{name:'Entegrasyonik'})`. Niyet ("logo render oluyor") korunur.
  2. `shell.spec.ts:47` test başlığındaki "logoya tıklayınca" ifadesi (yalnız başlık metni; iddia yardımcıya taşınır).
- **Bu liste dışında bir spec değişikliği gerekiyorsa** iş durur ve orkestratör inceler: bu, davranış değişikliği şüphesidir. Eşik: A'da **3'ten fazla** iddia değişikliği gerekirse ADR yeniden değerlendirilir (Maliyet notu).
- **Yeni iddialar yeni spec dosyalarına yazılır** (ör. `e2e/specs/a11y-gate.spec.ts`, `e2e/specs/shell-v2.spec.ts`); mevcutlar değiştirilmez.

**5.2 Bilinçli yeniden tabanlama süreci (T4h "Süreç notu" genelleştirilir)**
1. Değişiklik yapılır. Davranış spec'leri **ekran görüntüsü iddiaları hariç** yeşil olmalıdır: `--grep-invert "ekran görüntüsü"` veya ayrı proje koşusu ile.
2. `npx playwright test <kapsam> --update-snapshots=all`. `changed` modu `maxDiffPixelRatio` altındaki gerçek farkları yazmadığı için **yasaktır**.
3. **Her** yeni PNG gözle incelenir (Read ile açılır). İnceleme listesi:
   - boş kare yok
   - kırpılmış Türkçe metin yok (375 px dahil)
   - sıçrama/yarım yüklenmiş durum yok
   - durum renkleri doğru tonda
   - odak halkası görünür
   - "lunapark" öğesi yok
4. Tam takım **2 ardışık koşuda** yeşil olur.
5. Commit mesajında yeniden tabanlanan PNG sayısı ve inceleme notu yer alır.

- **T1a tema anlık görüntüsü** (`tests/theme/theme-snapshot.baseline.json`, 57/26 anahtar) A1'de **kasıtlı ters çevrilir.** Yeni anahtar sayıları ve değişen değerler commit mesajında listelenir. Karakterizasyon testinin kendisi (yapı iddiaları) kalır, taban veri güncellenir. Token birim testleri (kontrast, anahtar eşitliği, yasak adlar, motion) **genişletilir, gevşetilmez**.

**5.3 Aşamalar**

**Aşama 0 — Yapısal refaktör (görsel yenilemeden ÖNCE; ayrıntı `docs/FRONTEND_CODE_AUDIT.md` R1..Rn adımlarındadır, bu ADR kilitlemez).**
Kullanıcı frontend'de yapısal refaktör yetkisi verdi (2026-09-28). Gerekçe: yeni tasarım dili doğru yapı üzerine kurulursa aynı dosyalara iki kez dokunulmaz. Aksi halde Aşama A'da stillenen yinelenen bileşenler sonra birleştirilirken yeniden stillenmek zorunda kalır.
- **Kapsam (denetimin R adımlarına referansla):**
  - ölü kod ve dosya silme (ör. `TEST.vue`, kullanılmayan `getPlatformColor`, grep ile 0 referansı olan bileşen/görseller)
  - klasör hiyerarşisinin düzenlenmesi
  - yinelenen bileşenlerin birleştirilmesi (ör. liste ekranlarındaki tekrar eden filtre/tablo/diyalog kalıpları; `AdminView.vue` ↔ `MessageListView` kopyası için karar insan/ürün kararına bağlı kalır)
  - composable çıkarma
  - sabit kodlanmış adres/değer temizliği
  - performans (kod bölme, tembel yükleme)
  - `public/assets/css/*.css`'teki **seçicisi 0 eşleşen** ölü kuralların silinmesi (A1b'nin sıfır-fark kısmı buraya alınabilir)
- **Kural (Protokol 13, sıfır-fark):** Aşama 0 **görsel veya davranışsal fark üretmez.** Tüm Playwright spec'leri **ve ekran görüntüsü tabanları** değişmeden yeşil kalır; yeniden tabanlama yapılmaz. Tek istisna, denetimin açıkça "bilinçli davranış düzeltmesi" olarak işaretlediği ve ayrı commit'lenen adımlardır. Karakterizasyonu olmayan (P3) dosyalarda yapılacak birleştirme/taşıma için önce spec yazılır. Salt dosya taşıma ve silme işlemlerinde (import yolu değişikliği) `vite build` + tam takım + typecheck/style mandalları yeterli kanıttır.
- **Bu ADR ile ilişki:**
  - Denetimin klasör hiyerarşisi kararı bu ADR'deki yolları (`src/components/ds/**`, `src/design/**`) **uyarlayabilir**. ADR'deki yollar mantıksaldır; nihai yol denetim kararına uyar ve Etki Alanı buna göre okunur.
  - Denetim, Karar 6'daki şablon ve bileşen adlarıyla çakışan bir ortak bileşen çıkarıyorsa (ör. ortak liste iskeleti), bu bileşen **aynı sözleşmeyle ve aynı adla** çıkarılır. Aşama A onu yeniden yazmaz, yalnızca stiller.
- **Adım 0.0 — Ölçüm + sözleşme envanteri (~0,5, Aşama 0'ın ilk adımı):**
  - `vite build` çıktısı: ilk JS/CSS gz, font ve MDI webfont boyutu.
  - Yerel Lighthouse (`vite preview`, masaüstü + mobil profil): `/login` ve `/dashboard`.
  - Ek A'nın tamamlanması: tüm spec'lerdeki `locator/getByRole/getByText/getByLabel` kancalarının ekran bazında listesi, `e2e/fixtures/contract-hooks.ts` sabiti olarak. Refaktör (Aşama 0) ve yenileme (Aşama A/B) bu kancaları korur.
  - Aynı ölçüm Aşama 0 çıkışında tekrarlanır. Bu **"Aşama 0 çıkış ölçümü"** performans bütçesinin (5.4) referansıdır.
- **Aşama 0 Çıkış Kapısı:**
  - tam Playwright takımı 2× ardışık yeşil, **0 yeniden tabanlama**
  - Vitest, typecheck ve style mandalları regresyonsuz (sayılar yalnızca düşebilir)
  - `vite build` hatasız
  - Aşama 0 çıkış ölçümü BACKLOG'a yazılmış
  - denetimdeki R adımlarının durumu (yapıldı/ertelendi + gerekçe) işaretlenmiş
- **Boyut:** denetime göre belirlenir. Paralellik ve sıcak dosya sahipliği de denetimin R-adım planındadır. Aşama A, Aşama 0'ın kabuk, tasarım, `layout`, `login` ve `dashboard` dosyalarına dokunan adımları bitmeden başlamaz; diğer R adımları A ile paralel sürebilir, çakışmayı orkestratör yönetir.

**Aşama A — Temel (SERİ, tek worktree, Aşama 0'ın kabuk/tasarım/layout/login/dashboard adımlarından sonra; tahmini ~6–7 ajan-günü).** Sıcak dosyaların **tamamı** A'ya aittir:
- `src/design/**`, `src/plugins/vuetify.ts`, `src/main.ts`
- `src/components/ds/**`, `src/components/layout/**`, `src/layouts/**`
- `src/navigation/screens.ts`, `src/stores/workspace.ts`, `src/stores/site/menu.ts`
- `src/components/login/**`, `src/components/dashboard/**`, `src/views/secure/DashboardView.vue`
- `src/components/platforms/PlatformImageComponent.vue`
- `src/components/utility/PaginationComponent*` (paylaşılan)
- `public/assets/css/**`, `public/favicon*`, `public/icons/**`, `index.html`
- `e2e/fixtures/**`, `tests/theme/**`, `style-baseline.json`

| Adım | İçerik | Çıkış kanıtı |
|---|---|---|
| **A1** Tema + token + defaults (~1) | Yeni primitifler, durum tonları, `neutral(-subtle)`, `border-input`, `primary-hover`, `chart-1..5`, `integrationAccent`. Tüm semantik anahtarlar canlı temaya kablolanır. Vuetify `defaults` (bileşen ailesi başına commit). `vuetify-overrides.css`, `app.css` (`--ek-app-*`, yoğunluk). ECharts tema adaptörü. T1a tabanının ters çevrilmesi. **A1b:** legacy CSS mandal kapsamı + ölü kural temizliği + `.page-title` çakışması. | Vitest yeşil (yeni kontrast testleri dahil); site testleri yeşil (Karar 1.3); tam Playwright takımı bilinçli yeniden tabanlanmış |
| **A2** DS bileşenleri (~1,5) | `EkBrandLogo`, `EkPageHeader`, `EkFilterBar`, `EkStatusChip` + `status-map.ts`, `EkKpiCard`, `EkEmptyState` (genişletme), `EkErrorState`, tablo iskeleti, `EkPlatformMark`, side-sheet diyalog stili, onay diyaloğu, `PaginationComponent` a11y, Karar 6 kataloğundaki tüm şablonlar ve bileşenler (3.9 dahil), tek biçimlendirici `src/composables/format.ts` (Karar 6.3). Logo drift testi, i18n anahtar testi, ikon `aria-label` mandalı, **desen mandalı** (Karar 6.4). | Birim testler; şablonlar için bir "örnek" Playwright spec'i (yalnız test fixture rotası, menüde yok) |
| **A3** Kabuk (~2) | Kenar menü (bölümler, ray, favoriler), üst çubuk, sekme şeridi, komut paleti, tablet/mobil, tema anahtarını gizleme, logo, `screens.ts` sunum alanları + `menuSource:'registry'` altyapısı. **Ek A kancaları korunur.** Spec-sözleşme değişikliği commit'i (5.1) burada. | `shell`, `navigation` ve tüm spec'ler yeşil. Yeni `shell-v2.spec.ts`: Ctrl K, ray daraltma persist'i, klavye ile menü gezinimi, 3 viewport. |
| **A4** Giriş/kayıt (~0,5–1) | Karar 4. | `login`, `login-register`, `register-handoff` yeşil; axe 0 |
| **A5** Dashboard (~1) | KPI satırı, eylem listesi, entegrasyon durumu (`EkPlatformMark` + `EkStatusChip` + son senkron), hızlı erişim (dev kutular yerine kompakt bağlantı listesi), katalog özeti, kurulum rehberi kartı yeri. **Sabit "%15 daha fazla sipariş" notu kaldırılır** (Bağlam 10; veriye dayanmayan iddia). | `dashboard`, `shell` yeşil; axe 0 |
| **A6** Temizlik + ölçüm (~0,5) | Kullanılmayan logo varlıkları (grep 0), bundle/Lighthouse "sonra" ölçümü | Bütçe (5.4) sağlanıyor |

**Aşama A Çıkış Kapısı:**
- tam Playwright takımı 2× ardışık yeşil
- tüm yeniden tabanlanan PNG'ler incelenmiş
- Vitest, typecheck ve style mandalları regresyonsuz
- `vite build` hatasız
- kabuk, giriş ve dashboard için **tam sayfa** axe AA = 0 (yeni `a11y-gate.spec.ts`, masaüstü + mobil)
- bundle bütçesi sağlanıyor
- site testleri yeşil
- karakterizasyonsuz P3 ekranları için **tek seferlik görsel tur**: her P3 ekranı yerel bir Playwright betiğiyle açılıp 1280 px ekran görüntüsü alınır (commit'lenmez) ve incelenir; global `defaults`/override kaynaklı kırık düzenler B5'e kalem olarak yazılır.

**Aşama B — Ekran grupları (A birleştikten sonra PARALEL worktree'ler).** Kural: her grup **yalnızca kendi dosyalarını** değiştirir. A'nın sahip olduğu dosyalara (yukarıdaki liste) dokunmak gerekiyorsa değişiklik orkestratöre bildirilir ve ayrı bir A-yaması olarak birleştirilir. Ortak ve sık çakışan dosyalar için kurallar:
- `tr.json`: yalnızca kendi ad alanına **ekleme** yapılır; birleştirmede orkestratör çözer.
- `style-baseline.json` / `typecheck-baseline.json`: birleştirmeden sonra orkestratör `--write` ile yeniden üretir.
- Her grubun ekran görüntüsü PNG'leri yalnızca kendi spec'lerine aittir.

| Grup | Dosyalar | Spec'ler | Tahmin |
|---|---|---|---|
| **B1** Siparişler + ürünler + iade/müşteri/fatura/mesaj | `views/secure/{Order,Claim,Customer,Invoice,Message}ListView.vue`, `components/{order,claim,customer,customers,invoice,message}/**`, `views/secure/productDefinitions/ProductListView.vue` | `orders`, `products`, `claims`, `customers`, `invoices`, `messages` | ~2 |
| **B2** Entegrasyonlar | `views/secure/integrations/**`, `components/integrations/**` | `integrations-common`, `integrations-einvoice` | ~1,5 |
| **B3** Abonelik + admin + loglar | `views/secure/user/SubscriptionView.vue`, `views/secure/adminPanel/**` (`AdminView.vue` hariç — Aşama 0'da kaldırılır, gap §d), `components/adminPanel/**`, `views/secure/LogListView.vue`, `components/logListView/**` | `subscription`, `admin-*`, `logs` | ~1,5 |
| **B4** Eksik ekranların tamamlanması | `docs/FRONTEND_GAP_ANALYSIS.md` N-listesi (aşağıdaki eşleme tablosu). Her yeni ekran: yeni view dosyası + `screens.ts`'e **yalnızca ekleme** (orkestratör birleştirir) + i18n ekleme + yeni spec. Yalnızca API sözleşmesi hazır olan ekranlar menüde görünür: sözleşme `docs/API_ACCOUNT_LIFECYCLE.md` / `docs/API_TENANT_SURFACE.md` ya da ADR-0008 Aşama B'de olmalı veya aynı partide backend görevince teslim edilmelidir. Bir N-ekranı B1–B3'ün sahip olduğu bir dosyaya dokunuyorsa (ör. N6 → `OrderListView`), o grubun birleşmesinden **sonra** yapılır. | yeni spec'ler (5.6) | ekran başına ~0,5–1 (gap boyutu S/M), L olanlar (N3, N7) ~2–3 |
| **B5** P3 ekranlar | `views/secure/definitions/**` (özellikle `ProductUpdateView`, günlük akış), `productDefinitions/**` (liste dışı), `components/productDefinitions/**`, `user/*` (`Subscription` hariç), `supports/*`, `Financial/Printout/Setting` | **ÖNCE** değişmemiş kodda yeni karakterizasyon spec'i (Protokol 13), sonra yenileme | ~3 (en büyük: `ProductVariantsComponent` 131 literal) |

**Boşluk analizi → ADR aşama eşlemesi.** Gap analizinin kendi "A/B/C grupları" (A = mevcudu düzelt/ölü, B = yeni ekran + hazır backend, C = yeni ekran + yeni backend), bu ADR'nin aşamalarıyla **aynı şey değildir**. Çelişkide ADR kazanır. Eşleme:

| Gap öğesi | Gap grubu | ADR aşaması | Not / ön koşul |
|---|---|---|---|
| §d ölü/prototip ekranlar (`TEST.vue`, `AdminView.vue`*, `ExitView`, `InvoiceInfoView`, `*DefinitionView` prototipleri, `NewProductView`, `ProductDefinitionsView`, `IntegrationsView`, `AmazonComponent`, `EducationView` yanlış bağı) | A | **Aşama 0** (ölü kod) | Menü DB belgesinde kaydı olabilir (gap §6-1, doğrulanamadı). Aşama 0, `views` kaydını silmek yerine kaldırılan kodları ortak bir "Bu ekran kaldırıldı" `EkEmptyState`'ine yönlendirir; böylece menüde kalan kayıt kırılmaz. DB menü temizliği ayrı iştir (yedek şartı, kural 3). *`AdminView` için ürün kararı T4h'den beri bekliyor; gap "sil" öneriyor, varsayılan öneri kabul edilir. |
| Dashboard sahte metni (`MarketplaceLinksComponent.vue:30`) | A | **A5** | — |
| N18 FE (ortak 403/404, hata sınırı) | A/B | **A2** (bileşen) + **A3** (kabuk) | Backend `MenuService` süzmesi ayrı |
| N19 komut paleti | B | **A3** (2.5) | `SmartService.unifiedSearch` hazır |
| N13 "Yakında" durumu | A | **B2** | İddia kaydıyla aynı canlı küme (ADR-0014) |
| N20 test borcu | A | **B5** (karakterizasyon önce) | — |
| N1 Hesabım/güvenlik, N2 parola sıfırlama, N11 davet | C | **B4-P0** (N1, N2), **B4-P1** (N11) | `docs/API_ACCOUNT_LIFECYCLE.md`. N2'nin giriş ekranı kısmı A4'teki sekmeye bağlanır. |
| N4 KVKK, N5 stok politikası, N10 denetim günlüğü, N7 entegrasyon sağlığı | B/C | **B4-P0** (N4, N5), **B4-P1** (N10, N7) | `docs/API_TENANT_SURFACE.md` (KVKK indirme, stok politikası yazma, denetim/sağlık okuma) |
| N3 abonelik yönetimi | C | **B4-P0**, B3'ten (SubscriptionView) sonra | ADR-0008 Aşama B backend'i |
| N12 onboarding | B | **A5** (dashboard kartı yeri) + **B4-P0** (sihirbaz, `EkWizardTemplate`) | N3, N5, N13'e bağlı adımlar backend hazır oldukça açılır |
| N6 aşırı satış görünümü | B | **B4-P1**, B1'den sonra | Küçük backend (filtre) |
| N9 bildirim merkezi, N14 finans sekmeleri, N15 sevkiyat/yazdırma | B | **B4-P1** (N14 ve N15, B5'in `FinancialListView`/`PrintoutListView` karakterizasyonundan sonra) | Politika kayıtları (gap b-2) |
| N8, N16, N17 | C/A/B | **B4-P2** | — |
| Y-07, Y-11, Y-12, Y-14, Y-15, Y-16, Y-20 (2FA) vb. | — | **Bu ADR'nin kapsamı dışı** (IA'da yalnızca yer ayrıldı) | Her biri kendi backend kararıyla gelir; geldiğinde Karar 6 şablonlarıyla eklenir |

B4 kendi içinde **P0 → P1 → P2** sırasıyla, gap §e sıra önerisine uygun ilerler.

**Aşama B Çıkış Kapısı (grup başına):**
- grubun spec'leri değişmeden yeşil
- PNG'ler `=all` + inceleme ile yeniden tabanlanmış
- grubun ekranlarında tam sayfa axe AA = 0 (`a11y-gate.spec.ts`'e ekleme)
- mandal: grubun dosyalarında literal renk 0 (ECharts istisnası JS token'dan)
- 3 durum (boş/hata/yükleniyor) ekranda gözle doğrulanmış
- birleştirme sonrası tam takım 2× yeşil

**Aşama C — QA (SERİ, son; ~1 ajan-günü; bağımsız `qa-verifier`).**
- Chromium + Firefox + WebKit, masaüstünde tüm yenilenmiş spec'ler; mobil/tablet Chromium.
- axe AA = 0 (tam sayfa, tüm yenilenmiş ekranlar).
- **Görsel regresyon incelemesi:** tüm PNG'lerin iletişim tablosu (contact sheet) tek oturumda gözden geçirilir; tutarlılık listesi: aynı rozet, aynı başlık düzeni, aynı tablo dili.
- Yalnızca klavye ile tur: kenar menü → sekme → palet → form → diyalog.
- `prefers-reduced-motion` turu.
- Lighthouse (Karar 5.4).
- Bundle karşılaştırması.
- `REVIEW.md` anlamlı kullanım noktaları: yeni kabuk, giriş, dashboard.
- **Dark mode kapısı ölçümü** (5.5).

**5.4 Performans bütçesi**
Referans, **Aşama 0 çıkış ölçümüdür** (refaktör sonrası). Adım 0.0'daki refaktör öncesi değer yalnızca refaktörün kazancını raporlamak içindir.
- İlk yük JS (gz), Aşama 0 çıkış ölçümüne göre **en fazla +%5**. Yeni çalışma zamanı bağımlılığı **eklenmez**: palet, şablonlar ve illüstrasyonlar yerel kod ve inline SVG'dir.
- Global CSS (gz), A1'de en fazla +%10; A6 sonunda Aşama 0 çıkış ölçümünün **altında** olmalıdır (legacy CSS temizliği bunu karşılar).
- Lighthouse (yerel, `vite preview`): `/login` ve `/dashboard` için Performans ≥80, LCP <2,5 sn, CLS <0,1 (skill eşikleri); Erişilebilirlik ≥95.
- Giriş ekranı LCP öğesi metin ya da SVG'dir.
- Font: Inter 400/500/600/700 (T5) aynen kalır, yeni ağırlık eklenmez. Logo kelime markası 800 yerine **700** ile render edilir; yeni font dosyası yüklenmemesi için sitenin 800'ünden görsel olarak ayırt edilemeyecek fark bilinçli kabul edilir.

**5.5 Dark mode**
- **Bu ADR dark mode'u AÇMAZ.** ADR-0011 Karar 3 kapısı aynen geçerlidir: P1+P2 literal renk 0 + dark axe 0.
- Ancak A1'de tüm semantik anahtarların dark değerleri canlı temaya kablolanır ve yeni bileşenler yalnızca token kullanır. B sonunda kapı büyük olasılıkla ölçülebilir hale gelir.
- **C'de kapı ölçülür.** Sağlanırsa açılış, ayrı ve küçük bir görev olarak yapılır (kullanıcı anahtarı + dark görsel tur + dark ekran görüntüsü tabanları); yeni ADR gerekmez. Sağlanmazsa eksikler BACKLOG'a yazılır.
- Zamanlama tercihi insan sorusudur (Açık Soru 3).

**5.6 Yeni ekranlar için Protokol 13 uyarlaması (kapsam eki)**
- Yeni ekranların karakterizasyonu **yoktur**, çünkü sabitlenecek eski davranış yoktur. Bunun yerine **spec ekranla birlikte yazılır ve aynı commit'te gelir**, sentetik fixture ile (Protokol 7, PII yok):
  - smoke
  - boş durum
  - hata durumu (ham hata sızmıyor)
  - ≥1 birincil etkileşim (istek gövdesi doğrulaması dahil)
  - 3 viewport ekran görüntüsü
  - axe AA **iddia edilir (= 0)**; yalnızca kaydedilmez
- Menü görünürlüğü (`menuSource:'registry'` + `minRole`) için olumlu ve olumsuz rol testi yazılır.
- Mevcut ama karakterizasyonsuz ekranlar (B5) için Protokol 13 aynen uygulanır: önce değişmemiş kodda spec yazılıp yeşil yapılır, sonra ekran yenilenir.

**5.7 Erişilebilirlik ve i18n**
- **Hedef WCAG 2.1 AA:**
  - kontrast (token testleri + axe)
  - klavye (kenar menü `role=navigation` + liste, sekme şeridi `tablist`, palet `combobox`)
  - görünür odak
  - `aria-live` (toast, durum bandı)
  - 44×44 dokunma hedefi (tablet/mobil)
  - renk tek başına bilgi taşımaz
- **i18n:** TR birinciltir. Yeni metinler `tr.json`'a i18n anahtarı olarak girer. EN tamamlama kapsam dışıdır; `en.json`'a anahtar eklemek zorunlu değildir (`fallback` davranışı değişmez).
- **Türkçe metin uzunluğu:** kenar menü 248 px, en uzun öneri "Entegrasyon sağlığı" ve "KVKK veri talepleri" için yeterlidir; sekme başlığı kırpılır ve ipucu gösterilir. Büyük/küçük harf kuralı Karar 1.2'dedir.

### Karar 6 — "Tek iş = tek desen" (BAĞLAYICI; kullanıcı yönergesi 2026-09-28)
Kullanıcı yönergesi: "Genel standart görünümleri oturtmak önemli; benzer işleri yapan yerlerde yapılar mümkün olduğunca AYNI olsun, görsel bütünlük önemli."

**Kural:**
- Aynı türden iş yapan her ekran, aşağıdaki katalogdaki **tek kaynak bileşeni/şablonu** kullanır. Yeni ekranlar (B4) **yalnızca** bu şablonlardan üretilir.
- Bir ekran ilgili şablonu kullanmıyorsa, dosyanın başında `// ek-pattern-exception: <şablon> — <gerekçe>` yorumu **zorunludur**. Gerekçe "daha kolaydı" olamaz. Kabul edilen gerekçeler: gerçekten farklı bir etkileşim modeli, ölçülmüş bir performans nedeni, ya da spec kancası nedeniyle geçici olma durumu (hedef aşamayla birlikte).
- İstisnalar Karar 6.4'teki mandal tarafından sayılır ve C'de gözden geçirilir.
- Bileşen adları sözleşmedir. Konum Aşama 0 klasör kararına uyar, ad değişmez.

**6.1 Standart şablonlar ve paylaşılan bileşen sözleşmeleri**

| İş | Tek kaynak | Sözleşme (özet) |
|---|---|---|
| Liste sayfası | `EkListPage` (= 3.9 `EkListDetailTemplate`'in liste kısmı) | Sıra **sabittir**: `EkPageHeader` (breadcrumb, H1, açıklama, birincil eylem) → `EkFilterBar` → toplu eylem çubuğu (seçim varsa) → `EkDataTable` → `EkPagination`. Durum slot'ları: `loading` (tablo iskeleti), `empty` (ilk kullanım), `empty-filtered`, `error`. Hepsi zorunlu ve varsayılanlıdır. |
| Tablo | `EkDataTable` (`v-data-table-server` sarmalayıcısı; istemci-taraflı küçük listeler için aynı bileşen `server=false`) | Sütun tanımında `type: 'text' | 'id' | 'money' | 'number' | 'date' | 'datetime' | 'status' | 'platform' | 'actions'`. Hizalama, biçim (6.3), `.ek-num` ve render **tipten gelir**; ekran hücre stili yazmaz. Satır eylemleri 3.2 kuralına uyar. Yoğunluk `--ek-app-row-h`'den alınır. |
| Detay | `EkDetailSheet` (side-sheet `v-dialog`, 3.8) | Başlık: kimlik + `EkStatusChip` + kapat. Eylemler başlık sağında, **birincil → ikincil → `⋯` (yıkıcı en sonda, menü içinde)**. Gövde `EkSection` blokları (başlık `lg` 16/600 + içerik), tanım listeleri `EkDescriptionList` (etiket `sm` `content-muted` / değer `md` `content-strong`, 2 sütun ≥1024). |
| Form sayfası / ayar | `EkFormPage` / `EkSettingsTemplate` (3.9) | Bölüm = başlık + açıklama + alanlar. Yapışkan eylem çubuğu **sağda: Vazgeç (ikincil) · Kaydet (birincil)**. Doğrulama hataları alan altında ve çubukta "n alan düzeltilmeli" özetiyle gösterilir. |
| Diyalog: onay | `EkConfirmDialog` | 400 px. Başlık bir soru cümlesidir ("… silinsin mi?"). Gövde sonucu açıklar. Eylemler **sağda: Vazgeç · [Onayla]**. Yıkıcı ise onay düğmesi `error` dolgu, etiketinde fiil bulunur ("Sil", "İptal et"), varsayılan odak **Vazgeç** üzerindedir. |
| Diyalog: form | `EkFormDialog` | 560 px, ≤5 alan. Eylemler **Vazgeç · Kaydet**, Enter gönderir, Esc kapatır. |
| Durum rozeti | `EkStatusChip` + `status-map.ts` (3.3) | Ekran renk seçmez, durum kodu verir; çıplak `v-chip` + renk **yasaktır**. |
| KPI kartı | `EkKpiCard` (3.5) | Etiket → değer → değişim/ikincil değer; kartlar bir satırda eşit genişliktedir (`EkKpiRow`, 4/2/1 sütun). |
| Boş durum | `EkEmptyState` (3.10) | 5 varyant; başlık + 1 cümle + ≤1 eylem. |
| Hata durumu | `EkErrorState` | "<ne oldu> — <ne yapılmalı>" + "Tekrar dene". Ham hata, HTTP kodu ve stack gösterilmez. Satır içi (tablo gövdesi) ve sayfa düzeyi olmak üzere 2 boyutu vardır. |
| Yükleniyor | `EkSkeleton` (tip: `table`, `cards`, `form`, `detail`) | İlk yüklemede iskelet, yeniden yüklemede 2 px üst ilerleme çubuğu. **Spinner yalnızca düğme içinde** ("Kaydediliyor…") kullanılır. |
| Toast / bildirim | `useToast()` + tek `EkToastHost` (kabukta) | Konum: sağ alt (mobilde alt orta). Ton `success/info/warning/error` (3.3 paleti). Süre 4 sn; hatalar kullanıcı kapatana dek kalır. Eylem bağlantısı ≤1 ("Geri al", "Görüntüle"). `aria-live="polite"` (hata `assertive`). Aynı anda ≤3 toast. Kalıcı bildirimler üst çubuktaki bildirim çekmecesindedir; toast'lar oraya yazılmaz. |
| Sekmeli sayfa (sayfa içi) | `EkPageTabs` | `v-tabs` + `role=tablist`, alt çizgi göstergesi (`primary` 2 px). Sayfa başlığının **altında**, filtre çubuğunun **üstünde** yer alır. Sayfa içi sekme URL parametresi olarak `screens.ts` `urlParams`'a yazılır (ADR-0012 `replace`). Entegrasyon ekranlarının platform rayı (3.11) bunun **seçilebilir kart** varyantıdır, ayrı bir desen değildir. |
| Sihirbaz | `EkWizardTemplate` (3.9) | Adımlayıcı + adım içeriği + alt çubuk: **sol "Daha sonra" · sağ "Geri · İleri/Tamamla"**. |
| Salt-okunur panel | `EkReadonlyPanelTemplate` (3.9) | KPI satırı → durum listesi → zaman çizelgesi/tablo; "Son güncelleme" göstergesi. |

**6.2 Yerleşim ve sıra kuralları (her şablonda aynı)**
- **Eylem düğmeleri sırası:**
  - Sayfa başlığı ve diyalog/çekmece/form çubuğu: **sağa yaslı; soldan sağa `⋯` → ikincil → birincil** (birincil en sağda, tek).
  - Yıkıcı eylem hiçbir zaman birincil düğmenin yerinde değildir: menüdedir ya da onay diyaloğunun son adımıdır.
  - Sihirbaz istisnası 6.1'dedir.
- **İkon + etiket:** metinli düğmelerde ikon **solda**, 18 px, etiket cümle düzeninde fiil ile başlar ("Sipariş oluştur"). Yalnız-ikon düğme yalnızca tablo satırında, araç çubuğunda ve kabukta kullanılır; `aria-label` + ipucu zorunludur.
- **Tablo satır eylemleri:** en sağ sütunda, sağa yaslı; sıra **[birincil görünür eylem] [⋯]**; ikon düğme 32 px nötr hayalet (3.2).
- **Başlık hiyerarşisi:** sayfada **tek H1** (`EkPageHeader`), bölüm başlıkları H2 (`lg` 16/600), kart/alt bölüm başlıkları H3 (`md` 14/600), overline etiketleri başlık değildir (`<p>`). Başlık seviyeleri atlanmaz (axe `heading-order`).
- **Boşluk ölçeği:** yalnızca `--ek-space-*`:
  - sayfa iç boşluğu `6` (24; tablet `4`, mobil `3`)
  - bölümler arası `8` (32)
  - kart iç boşluğu `5` (20)
  - form alanları arası `4` (16)
  - satır içi öğeler arası `2` (8)
  - ikon–metin arası `2` (8)
- **Yoğunluk:** yalnızca iki mod vardır, `--ek-app-*` değişkenleriyle (1.1); ekran kendi satır yüksekliğini yazmaz.
- **Kart:** tek görünüm (1.1: kenarlık, gölge yok, `radius-lg`); "vurgulu kart" gerekiyorsa yalnızca `border-strong` kullanılır, renkli zemin kullanılmaz.

**6.3 Tek biçimlendirici (tarih, para, sayı)**
- Bugün 44 dosyada dağınık biçimlendirme var: 13 `Intl.NumberFormat`, 29 `toLocaleString`, 29 `toLocaleDateString`, `toFixed(2)`. Ekranlarda farklı çıktılar oluşuyor: "4.590,25 TRY", "₺199,90", "0,00 ₺", "%0.0" (grep, 2026-09-28).
- **Tek kaynak:** `src/composables/format.ts` (saf TS, `tr-TR` sabit):

  | Fonksiyon | Çıktı |
  |---|---|
  | `formatMoney(minor|major, currency='TRY')` | `Intl.NumberFormat('tr-TR',{style:'currency'})` → **"₺4.590,25"** |
  | `formatNumber` | "12.345" |
  | `formatPercent` | **"%5,0"**, Türkçe yazımda yüzde işareti önde |
  | `formatDate` | "20.09.2026" |
  | `formatDateTime` | "20.09.2026 13:15" |
  | `formatRelative` | "3 dk önce" (yalnızca "son senkron" gibi yerlerde) |

  Geçersiz, boş ya da null değer için tek gösterim **"—"** kullanılır.
- `EkDataTable` sütun tipleri ve `EkKpiCard` bu modülü kullanır. Ekranlarda doğrudan `toLocale*`/`Intl.*`/`toFixed` çağrısı **mandalla yasaklanır** (6.4).
- **Spec'lerin çapaladığı biçimli metinler** ("349,90 TRY", "20.09.2026 13:15" gibi) Aşama 0 adım 0.0 envanterinde işaretlenir. Bir biçim değişikliği spec çapasını kırıyorsa o ekranın geçişi, **o spec literal'inin açıkça güncellendiği** ayrı bir commit'le yapılır (Karar 5.1 kapalı listesine eklenir, gerekçe: "tek biçimlendirici"). Böyle bir çapa yoksa biçim doğrudan birleşir.

**6.4 Otomatik uyumluluk kontrolü — "desen mandalı"**
Mevcut literal-stil mandalı (`scripts/style-literal-counts.js` + `style-baseline.json`) ile **aynı desende**, dosya başına sayılan ve **artamayan** yeni sayaçlar kurulur: `scripts/pattern-counts.js` + `pattern-baseline.json`, `npm run test:pattern-ratchet`. Kapsam `src/**/*.vue`. `src/components/ds/**` şablonların kendisi olduğu için hariçtir.

| Sayaç | Neyi sayar |
|---|---|
| `rawDataTable` | `<v-data-table`, `<v-data-table-server`, `<v-table` (bugün 10 + 18 + 6) |
| `rawDialog` | `<v-dialog` (bugün 19) |
| `rawChip` | `<v-chip` (durum için) |
| `rawFormat` | `toLocaleString`, `toLocaleDateString`, `Intl.NumberFormat`, `toFixed(` |
| `rawSpinner` | `v-progress-circular` (düğme içi hariç tutulamazsa sayılır; istisna yorumu gerekir) |
| `iconBtnNoLabel` | `aria-label`'sız ikon düğmesi (3.4) |
| `pageHeaderMissing` | `views/secure/**` altında `EkPageHeader` içermeyen ekran kökü |
| `patternExceptions` | `ek-pattern-exception` yorumları (bilgi amaçlı, C'de raporlanır) |

- **Kurallar:**
  - Her sayaç dosya başına **artamaz**; yeni dosyalar 0 ile başlar. Yeni ekranlar (B4) bu nedenle otomatik olarak şablon kullanmak zorundadır.
  - Taşınan (B grubu) dosyalar 0'a kilitlenir.
  - `ek-pattern-exception` yorumu olan satır sayılmaz ama `patternExceptions`'a yazılır.
- Mandal, var olan ratchet'lar gibi çalışır: `--write` ile taban güncellenir, düşüş kabul edilir, artış test hatasıdır.
- Kurulum **A2**'dedir. **B çıkış kapısı:** grubun dosyalarında `rawDataTable`, `rawDialog`, `rawChip`, `rawFormat` = 0 (ya da gerekçeli istisna).
- **Maliyet:** ~100 satırlık Node betiği + JSON taban, bağımlılık yok. AST ayrıştırma yoktur, regex sayımıdır; yanlış-pozitifler istisna yorumuyla yönetilir.
- **Eşik:** yanlış-pozitif istisna sayısı **>20** olursa → `vue/compiler-sfc` ile şablon AST'si üzerinden sayım değerlendirilir. `@vue/compiler-sfc` zaten Vue'nun parçasıdır, yeni bağımlılık gerektirmez.

## Gerekçe
- **Kullanıcı isteği birebir karşılanır:** giriş ve tüm uygulama içi ekranlar, kurumsal-premium dil, "hoplama-zıplama yok" (bağlayıcı hareket listesi, ripple kapalı, hover yükselmesi yasak), SaaS'a uygun kabuk ve eksik ekranlar için hazır iskelet + şablonlar.
- **Yeniden yazım değil, yeniden stilleme ve refactor.** Ekranların iş mantığı, API çağrıları, store'lar ve ADR-0012 çalışma alanı mekanizması değişmez. Değişen sunum katmanıdır: tema, defaults, override CSS, kabuk şablonu, ortak bileşenler. `adr-writing` "yeniden yazım" kuralı tetiklenmez. Kabuk bileşenleri (`NavigationMenu`/`ApplicationBar`/`SecureLayout` şablonları) büyük ölçüde yeniden yazılan **şablonlardır**, ama `<script setup>` davranışları (workspace store bağlantısı, `openTab`, persist, geri/ileri) T4a'daki haliyle korunur ve `navigation.spec` bunu doğrular.
- **Protokol 13 ile uyum.** Davranış güvenliğini spec'ler, görsel değişikliği bilinçli yeniden tabanlama ve inceleme sağlar. Sunuma bağlı spec kancalarının bilinçli olarak korunması (Ek A) ve spec değişikliklerinin kapalı listeye bağlanması, "görsel yenileme bahanesiyle davranış kayması"nı yakalar.
- **Maliyet bilinci.** Yeni çalışma zamanı bağımlılığı, yeni servis, backend değişikliği, Storybook, Figma senkronu veya görsel regresyon SaaS'ı yoktur. Premium algı tipografi, boşluk, tek palet ve disiplinli bileşen dilinden gelir; bunlar mevcut Vuetify + token yığınıyla ucuza elde edilir. Tek haneli abone ölçeğinde "tasarım sistemi platformu" kurmak getirisini karşılamaz.
- **Tek kaynak.** Token (uygulama+site), logo geometrisi (drift testi), durum eşlemesi (`status-map.ts`), biçimlendirme (`format.ts`), ekran adları (`screens.ts` + i18n) ve ekran desenleri (Karar 6 şablonları) tek yerdedir. Bugünkü tutarsızlığın kökü (her ekranın kendi rengi, rozeti, başlığı, tarih/para biçimi) budur. Görsel bütünlük insan dikkatine değil, **mandala** bağlanır. Mandal deseni projede zaten işe yarayan literal-stil ve typecheck mandallarının aynısıdır, yeni araç değildir.
- **Önce yapı, sonra görünüm (Aşama 0).** Yinelenen bileşenler birleştirildikten ve ölü ekranlar kaldırıldıktan sonra stillemek, aynı dosyaya iki kez dokunmayı ve ölü ekranların boşuna yeniden stillenmesini önler. Gap analizinin 41 satırlık envanterinde 12 satır (bir kısmı birden çok dosya) ölü, prototip ya da yanlış bağlı. İşlevsiz ekranların (`ChangePasswordView`, `PrintoutListView`) yerine gerçek ekran yazılması `adr-writing` "yeniden yazım" kuralına girmez, çünkü korunacak davranış yoktur (T6 `SubscriptionView` emsali).

## Maliyet/Ölçek Notu
- **Maliyet:**
  - Yaklaşık **13–16 ajan-günü**: A 6–7 + B1–B3 5 + B5 3 + C 1. Buna ek olarak:
    - Aşama 0: `FRONTEND_CODE_AUDIT.md`'ye göre.
    - B4 kaba toplamı: P0 ≈ 6–8, P1 ≈ 6–8, P2 ≈ 2. Gap boyutlarından (S/M/L) türetilmiştir, backend işleri hariç.
  - Desen mandalı ve tek biçimlendirici yaklaşık 0,5 gündür (A2 içinde).
  - Ek bağımlılık ve servis: yok.
  - Repo'da yeniden tabanlanan PNG'ler: ~82 mevcut + yeni spec'ler (birkaç MB).
  - Operasyon yükü: token değişiminde `npm run tokens` (drift testi yakalar); yeniden tabanlama inceleme süresi.
- **Risk ve azaltım:**
  - (1) Global `defaults`/override karakterizasyonsuz P3 ekranları sessizce bozabilir → A çıkışındaki P3 görsel turu + B5.
  - (2) Paralel B gruplarında sıcak dosya çakışması → sahiplik tablosu + yalnızca-ekleme kuralı.
  - (3) Spec kancası kaybı → `contract-hooks.ts` + kapalı değişiklik listesi.
  - (4) Durum rengi değişikliği siteyi etkiler → A1 kapısında site testleri.
- **Yeniden değerlendirme eşikleri:**
  - A'da **3'ten fazla** spec davranış iddiası değişikliği gerekirse → iş durur, ADR yeniden değerlendirilir (davranış kayması şüphesi).
  - C'de ilk yük JS **> Aşama 0 çıkış ölçümü +%5** veya global CSS **> Aşama 0 çıkış ölçümü** → en maliyetli öğe sadeleştirilir (palet tembel yükleme, illüstrasyon azaltma).
  - Adım 0.0 veya Aşama 0 çıkış ölçümünde MDI webfont'u `/login` ilk aktarımının **>%25**'ini oluşturuyorsa **veya** Lighthouse Performans <80'in birincil nedeni olarak raporlanırsa → `@mdi/js` (SVG) göçü ya da webfont alt kümeleme ADR'si. Spec kancaları `data-icon` özniteliğine taşınır.
  - Yeniden tabanlanan ekran görüntüleri ardışık **20 koşuda >%5** kararsızsa → ADR-0011 eşiği (piksel karşılaştırması kabuk+giriş ile sınırlanır).
  - Ortalama açık sekme sayısı ürün analitiğinde **<1,5** çıkarsa → sekme şeridi varsayılan olarak gizlenip "Açık sayfalar" menüsüne iner. **>12** ise → ADR-0012 eşiği (sekme grupları).
  - `src/components/ds/` **25 bileşeni** aşarsa veya bir tasarımcı Figma'da yönetmeye başlarsa → bileşen belgeleme aracı (Histoire/Storybook) ve DTCG (ADR-0011 eşiği) değerlendirilir.
  - En az **2 ödeyen müşteri** yoğunluk veya dark mode talep ederse → ilgili tercih öne çekilir (dark: ADR-0011 eşiği).
  - Yeni ekran (B4) sayısı **>10** olursa → B4 kendi alt-planına (ayrı BACKLOG bölümü) bölünür.

## Etki Alanı
- **Yeni:**
  - `src/design/{app.css,vuetify-overrides.css,echarts-theme.ts,status-map.ts,brand/logo-mark.svg}`
  - `src/components/ds/**` (bileşenler + `templates/`)
  - `public/favicon.svg` + yeniden üretilen ikonlar
  - `e2e/fixtures/contract-hooks.ts`, `e2e/specs/{a11y-gate,shell-v2}.spec.ts`
  - `src/composables/format.ts`, `scripts/pattern-counts.js` + `pattern-baseline.json` (`npm run test:pattern-ratchet`)
  - token/logo-drift/i18n-anahtar/ikon-etiket Vitest testleri
- **Değişen:**
  - token kaynağı (`palette.ts`, `semantic.ts`) + `dist/*.css`, `vuetify-theme.ts`, `plugins/vuetify.ts` (`defaults`)
  - `main.ts`, `index.html`
  - kabuk (`SecureLayout`, `NavigationMenu`, `ApplicationBar`, `WorkplaceTabSwitcher`), `screens.ts` (sunum alanları + `menuSource`)
  - `LoginComponent`, dashboard bileşenleri, `PlatformImageComponent` (→ `EkPlatformMark`), paylaşılan diyalog ve sayfalama bileşenleri
  - `public/assets/css/*.css` (mandal + temizlik)
  - B gruplarının ekranları
  - `tests/theme/theme-snapshot.baseline.json` (kasıtlı), tüm ekran görüntüsü tabanları (bilinçli), `e2e/fixtures/nav.ts`
  - `shell.spec.ts` (kapalı liste, 2 madde)
- **Değişmeyen:**
  - backend ve `MenuService` sözleşmesi
  - ADR-0012 çalışma alanı mekanizması (URL şeması, persist, geri/ileri, `eventBus 'openTab'`)
  - ekranların `initialize/activate/destroy` sözleşmesi
  - iş mantığı ve API çağrıları
  - site kaynağı (yalnızca token yayılımı)
  - Electron `main.js`
- **Kapsam dışı:** backend; tanıtım sitesi kaynağı; yeni iş mantığı/özellik (B4'ün ekranları yalnızca mevcut ya da ayrıca teslim edilen API'lerin arayüzüdür); i18n EN tamamlama; CAPTCHA açık metin sorunu; `AdminView.vue` ürün kararı; mikro-kopya/etiket yazım düzeltmeleri (ayrı görev).

## Açık Sorular (yalnızca insan kararı — fabrikayı durdurmaz; varsayılanlar insan itiraz etmezse geçerlidir)
1. **Nihai ürün logosu ve marka kılavuzu** (ADR-0014 Açık Soru 3 ile aynı karar). Varsayılan: sitenin yer tutucu işaret+kelime markası uygulamada da kullanılır. Nihai logo geldiğinde yalnızca `src/design/brand/*` + `site/src/components/Logo.astro` birlikte değişir (drift testi zorlar).
2. **Pazaryeri logolarının uygulama içinde kullanımı** (ticari marka izni). Varsayılan: monogram + platform adı + küçük marka rengi vurgusu; resmî logo görseli yok.
3. **Dark mode zamanlaması.** Varsayılan: ADR-0011 sayısal kapısı C'de ölçülür; sağlanırsa hemen ardından küçük bir görevle açılır, sağlanmazsa B sonrası eksikler kapatılınca açılır. Daha erken isteniyorsa P1+P2 dark turu B ile paralel yürütülür.

Diğer tüm konular (palet değerleri, kabuk düzeni, yoğunluk, ikon seti, grafik stili, giriş düzeni, aşama sırası) bu ADR'de kararlaştırılmıştır.

---

## Ek A — Spec sözleşme kancaları (2026-09-28 grep; Aşama 0 adım 0.0'da tamamlanır, `e2e/fixtures/contract-hooks.ts`'e taşınır)
DOM'da **korunması zorunlu** (yeniden stillenebilir, silinemez veya yeniden adlandırılamaz):
- **Kabuk:**
  - `.v-layout`, `.workplace-tabs`, `.workplace-tab`, `.selected-workplace-tab`, `.close-tab-icon`
  - `.v-navigation-drawer.soft-nav`, `.soft-item`, `.sub-item-soft`, `.v-list-group__header` (grup ikonu sınıfıyla)
  - dashboard hazır metni `İŞLETME PERFORMANSI` (`nav.ts`)
  - `.platform-node` + `data-id` (`waitForPlatformListStable`)
- **Ekran kökleri:** `.dashboard`, `.orderListView`, `.productListView`, `.claimListView`, `.customerListView`, `.invoiceListView`, `.messageListView`, `.importLogList`, `.exportLogList`, `.einvoiceView`, `.shippingView`, `.subscriptionView`, `.adminClientListView`, `.adminSystemManagementView`, `.ticket-list-view`.
- **Bileşen kancaları:** `.large-stat-card`, `.nav-item-wrapper` (einvoice), `.timeframe-select-inline`, `.status-select-premium`, `.status-banner-title`, `.captcha-box`, `.scroll-area` (admin system), `button[title="Detaylı Analiz"]`, `.v-checkbox-btn`, `tbody tr` / `thead button` yapıları.
- **İkon sınıfları:** `mdi-eye`, `mdi-eye-outline`, `mdi-plus`, `mdi-delete-sweep-outline`, `mdi-chart-box-outline` + `openScreen()`'in kullandığı menü ikon sınıfları (`MENU_SCREENS`). Menü ikonları `MenuService` verisinden gelir, bu yüzden görsel yenileme bunları değiştirmez.
- **Roller, adlar ve metinler:**
  - `getByRole('dialog')` (sipariş detayı)
  - `tab` GİRİŞ / KAYIT / ŞİFREMİ UNUTTUM
  - `button` Giriş / Kayıt Ol
  - `checkbox` /okudum, kabul ediyorum/
  - etiketler: `İsim`, `Soyisim`, `EPosta`, `Şifre`, `Şifre (Tekrar)`, `Sipariş No, Müşteri Adı veya Telefon Ara`
  - boş durum metinleri: `Sipariş Bulunamadı` vb.
  - ~105 benzersiz `getByText` literal'i. Adım 0.0 tam listeyi çıkarır.
- **Kapalı değişiklik listesi (5.1):** `img[src="/assets/images/logo6.png"]` (`shell.spec.ts:17`, `nav.ts:207`).

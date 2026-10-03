/**
 * frontend/src/design/tokens/scale.ts
 *
 * ADR-0011 Karar 1 — renk dışı ölçekler (spacing/radius/font/elevation/
 * motion/breakpoint). SAF TS (vue/vuetify/`@/` import'u YASAK). Tümü `px`
 * (gerekçe: kök `html` 14px'e sabit ve standart dışı, `rem` bu mirasa
 * bağlanırdı; tarayıcı yakınlaştırması `px` ile WCAG 1.4.4'ü karşılar).
 */

/** Spacing — 4px taban (Vuetify `ma-1` birimi; `pa-4` ≡ `--ek-space-4`). */
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const

export const radius = {
  none: 0,
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  '2xl': 16, // DS-v2 — diyalog
  full: 9999,
} as const

/**
 * DS-v2 radius ROLLERİ — bileşenler ölçek adını değil ROLÜ tüketir
 * (`--ek-radius-control` …); ölçek değişirse tek yerden akar.
 */
export const radiusRole = {
  control: 'lg', // düğme, input, select, sayfalama düğmesi — 8
  tile: 'lg', // ikon kapsülü, küçük karo — 8
  tab: 'lg', // workspace sekmesinin üst köşeleri — 8
  card: 'xl', // kart, panel, tablo kabı — 12
  popover: 'xl', // menü, açılır liste, arama sonuçları — 12
  dialog: '2xl', // diyalog — 16
  chip: 'full', // durum çipi, filtre çipi, sayaç — hap
} as const satisfies Record<string, keyof typeof radius>

/**
 * Font ailesi — Inter (kendi barındırılan, `@fontsource/inter`, CDN YOK).
 * ADR-0011 Açık Soru 1 KARARLANDI (kullanıcı, 2026-09-27): Roboto → Inter.
 * Ağırlıklar `--ek-font-weight-*` ile eşleşir (400/500/600/700), bkz.
 * `src/main.ts` (`@fontsource/inter/{400,500,600,700}.css` import'u).
 */
export const fontFamily = {
  sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
} as const

/** `md` = bugünkü 14px gövde boyutu. */
export const fontSize = {
  '2xs': 11, // DS-v2 — mikro etiket (BÜYÜK HARF anahtar-değer etiketi)
  xs: 12,
  sm: 13,
  md: 14,
  lg: 16,
  xl: 18,
  '2xl': 22,
  '3xl': 28,
  '4xl': 32, // DS-v2 — display
} as const

export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const

export const lineHeight = {
  tight: 1.25,
  normal: 1.5,
} as const

/**
 * DS-v2 tipografi ROLLERİ. Her rol boyut/satır yüksekliği (px)/ağırlık/
 * harf aralığı taşır ve `--ek-type-<rol>-{size,line,weight,tracking}` olarak
 * yayılır. `icon` = aynı satırda kullanılacak ikon boyutu (`iconSize` adı) —
 * yazı/ikon orantısının TEK kaynağı (≈ 1,15–1,3 × yazı boyutu).
 * `transform: 'uppercase'` yalnızca `micro` rolündedir (Türkçe İ/ı için
 * `<html lang="tr">` + CSS `text-transform` doğru sonuç verir).
 */
export const typeRole = {
  display: { size: 32, line: 40, weight: 700, tracking: '-0.02em', icon: '2xl', use: 'Vitrin/karşılama başlığı, çok büyük sayı' },
  metric: { size: 28, line: 34, weight: 700, tracking: '-0.01em', icon: 'xl', use: 'KPI değeri (tabular-nums)' },
  title: { size: 22, line: 30, weight: 600, tracking: '-0.01em', icon: 'xl', use: 'Sayfa başlığı (tek H1)' },
  heading: { size: 16, line: 24, weight: 600, tracking: '0', icon: 'lg', use: 'Kart/bölüm başlığı (H2/H3)' },
  subheading: { size: 14, line: 20, weight: 600, tracking: '0', icon: 'md', use: 'Alt bölüm, liste öğesi başlığı' },
  body: { size: 14, line: 22, weight: 400, tracking: '0', icon: 'md', use: 'Gövde metni' },
  label: { size: 13, line: 18, weight: 500, tracking: '0', icon: 'sm', use: 'Form etiketi, düğme, menü öğesi' },
  table: { size: 13, line: 20, weight: 400, tracking: '0', icon: 'sm', use: 'Tablo hücresi' },
  tab: { size: 13, line: 18, weight: 500, tracking: '0', icon: 'sm', use: 'Workspace/sayfa sekmesi' },
  caption: { size: 12, line: 16, weight: 400, tracking: '0', icon: 'xs', use: 'Yardım metni, zaman, meta' },
  micro: { size: 11, line: 16, weight: 600, tracking: '0.06em', icon: 'xs', use: 'BÜYÜK HARF mikro etiket, tablo başlığı' },
} as const

/**
 * İkon boyutları (px). Tek ikon ailesi: MDI (outline varyant tercih edilir).
 * Eşleme için `typeRole[*].icon` alanına bakın.
 */
export const iconSize = {
  xs: 14,
  sm: 16,
  md: 18,
  lg: 20,
  xl: 24,
  '2xl': 32,
} as const

/** İkon kapsülü (renkli-zemin yuvarlatılmış kare) ölçüleri: kutu → ikon. */
export const iconTile = {
  sm: { box: 28, icon: 'sm' },
  md: { box: 36, icon: 'md' },
  lg: { box: 44, icon: 'xl' },
} as const

/** Kontrol yükseklikleri (düğme/input/sayfalama). */
export const controlHeight = {
  sm: 32,
  md: 36,
  lg: 40,
  /** Metin/seçim/tarih alanı (FR2-SHELL madde 5: 40 → 36, düğme `md` ile aynı hiza). */
  field: 36,
  /** MOB-00: dokunmatik (pointer: coarse) asgari hedef — WCAG 2.5.5 (44×44). Masaüstü yoğunluğu değişmez. */
  touch: 44,
} as const

/**
 * Elevation — tema-bağımlı (light/dark ayrı değer). Stripe/Linear stili:
 * kartta gölge yerine `border-default` tercih edilir; `shadow` yalnızca
 * gerçekten yükselen yüzeyler (menü/dialog) için kullanılır.
 */
export const shadow = {
  light: {
    none: 'none',
    sm: '0 1px 2px rgba(15, 23, 42, 0.06)',
    md: '0 2px 8px rgba(15, 23, 42, 0.10)',
    lg: '0 8px 24px rgba(15, 23, 42, 0.14)',
    // DS-v2 rolleri (lacivert-mürekkep tonlu, yumuşak)
    card: '0 1px 2px rgba(18, 26, 43, 0.05), 0 1px 3px rgba(18, 26, 43, 0.04)',
    raised: '0 4px 12px rgba(18, 26, 43, 0.08), 0 1px 3px rgba(18, 26, 43, 0.06)',
    popover: '0 12px 28px rgba(18, 26, 43, 0.14), 0 2px 6px rgba(18, 26, 43, 0.08)',
    dialog: '0 24px 48px rgba(18, 26, 43, 0.20), 0 4px 12px rgba(18, 26, 43, 0.10)',
    chrome: '0 1px 0 rgba(10, 15, 26, 0.16), 0 2px 8px rgba(10, 15, 26, 0.10)',
    // Aşama 3: yatay kaydırılan tabloda sabit kolonun kenar gölgesi (altında içerik olduğunu söyler)
    'scroll-start': '10px 0 12px -6px rgba(18, 26, 43, 0.18)',
    'scroll-end': '-10px 0 12px -6px rgba(18, 26, 43, 0.18)',
    // Aşama 5: etkin workspace sekmesi — yalnız YUKARI/yanlara yumuşak gölge (alt kenar içerikle birleşik kalır)
    'tab-active': '0 -3px 8px -4px rgba(18, 26, 43, 0.22)',
  },
  dark: {
    none: 'none',
    sm: '0 1px 2px rgba(0, 0, 0, 0.40)',
    md: '0 2px 8px rgba(0, 0, 0, 0.48)',
    lg: '0 8px 24px rgba(0, 0, 0, 0.56)',
    card: '0 1px 2px rgba(0, 0, 0, 0.40)',
    raised: '0 4px 12px rgba(0, 0, 0, 0.44)',
    popover: '0 12px 28px rgba(0, 0, 0, 0.56)',
    dialog: '0 24px 48px rgba(0, 0, 0, 0.64)',
    chrome: '0 1px 0 rgba(0, 0, 0, 0.50)',
    'scroll-start': '10px 0 12px -6px rgba(0, 0, 0, 0.5)',
    'scroll-end': '-10px 0 12px -6px rgba(0, 0, 0, 0.5)',
    'tab-active': '0 -3px 8px -4px rgba(0, 0, 0, 0.5)',
  },
} as const

/**
 * Motion — 150/200/300ms; `ease-in-out`/`ease-out`. Başka süre/eğri token'ı
 * TANIMLANMAZ (premium-ui-standards skill + ADR-0011 Karar 1).
 */
export const duration = {
  fast: 150,
  base: 200,
  slow: 300,
} as const

export const easing = {
  standard: 'ease-in-out',
  enter: 'ease-out',
} as const

/**
 * FR3 madde 7 (fe-r3a) — HAREKET ROLLERİ: uygulamadaki HER geçiş bu rollerden birini kullanır (tek kaynak).
 * Bileşen süre/eğri SEÇMEZ, etkileşimin TÜRÜNÜ seçer; aynı tür her yerde aynı hızda akar (ör. filtre paneli
 * açılışı = kategori seçicide seviye açılışı = menü grubu açılışı → hepsi `reveal`).
 * CSS: `--ek-motion-<rol>` (kısaltma: "<süre> <eğri>", `transition: opacity var(--ek-motion-reveal)`),
 * `--ek-motion-<rol>-duration`, `--ek-motion-<rol>-easing`. JS: `@entegrasyonik/ui/motion` (`motionMs`, `motionEasing`).
 * Süreler `duration`'a, eğriler `easing`'e BAĞLIDIR (reduced-motion'da kök süreler 0'a iner → roller de).
 * Statik bekçi: `frontend/tests/motion-single-source.test.ts` (literal süre/eğri yasak).
 */
export const motionRole = {
  // FE-LOCAL-1058 (kullanıcı kararı): uygulamanın HER yerinde geçiş hızı AYNI — tüm roller tek süreye (`base`, 200ms)
  // bağlıdır. Roller (etkileşim türü) korunur; yalnız süre tekleşti (eğri türe göre: giriş `enter`, aç/kapa `standard`).
  /** Hover/basma/odak geri bildirimi — renk, zemin, kenarlık, gölge, opaklık. */
  feedback: { duration: 'base', easing: 'enter', use: 'Hover, odak, seçili durum renk geçişleri' },
  /** Aç/kapa — yükseklik + opaklık: filtre paneli, sayfa hakkında, menü grubu, kategori seviyesi, akordeon, ok dönüşü. */
  reveal: { duration: 'base', easing: 'standard', use: 'Genişleyen/daralan içerik, kademeli seviye açılışı' },
  /** Kaybolan geçici öğe (kapanan menü/diyalog/kolon, silinen satır). */
  dismiss: { duration: 'base', easing: 'standard', use: 'Kapanan menü/diyalog/kolon, silinen satır' },
  /** Yükselen katman girişi — menü, açılır liste, diyalog, bildirim, sekme içeriği (opaklık + kısa kayma). */
  overlay: { duration: 'base', easing: 'enter', use: 'Popover, menü, diyalog, toast, sekme geçişi' },
  /** Kabuk/yerleşim — sol menü, bildirim paneli, Otopilot paneli, büyük alan kayması. */
  layout: { duration: 'base', easing: 'enter', use: 'Sol menü ray ↔ tam, yan paneller, kabuk bölgeleri' },
} as const satisfies Record<string, { duration: keyof typeof duration; easing: keyof typeof easing; use: string }>

/**
 * Sıralı (kademeli) hareket adımı: ardışık öğeler arası gecikme = `fast / 3` (en fazla 2 adım; toplam ≤ slow).
 * CSS: `--ek-motion-stagger`.
 */
export const motionStaggerDivisor = 3

/**
 * Döngüsel (ambient) hareket — YALNIZ bekleme göstergeleri (iskelet nabzı, marka yükleyicisi, akış çizgisi).
 * 150–300ms ölçeğinin bilinçli istisnasıdır (döngü bir etkileşim geri bildirimi değildir); reduced-motion'da
 * bileşen döngüyü durdurur. CSS: `--ek-motion-loop-<ad>` (süre) + eğri her zaman `--ek-easing-standard`
 * (sabit hızlı akış çizgisi `linear` — `--ek-easing-linear`).
 */
export const motionLoop = {
  /** İskelet/yükleniyor nabzı. */
  pulse: 1400,
  /** Marka yükleyicisi (logo çizgisi + hale). */
  brand: 1800,
  /** Akış/aktarma çizgisi (sabit hız), yazıyor göstergesi. */
  flow: 1000,
  /** Yenile düğmesi dönüşü (yükleniyor). */
  spin: 900,
  /** Aktarım gösterimi — simgenin kaynaktan hedefe yolculuğu (ürün aktarma paneli). */
  transfer: 8000,
} as const

/** Sabit hızlı döngü eğrisi (yalnız `motionLoop.flow`; etkileşim geçişlerinde YASAK). */
export const easingLinear = 'linear'

/**
 * DS-v2 — hareket MESAFESİ (px). Açılan katman giriş anında en fazla bu
 * kadar kayar (fade + kısa slide); hover'da kayma/ölçek YOK.
 */
export const motionDistance = {
  sm: 4,
  md: 8,
} as const

/**
 * DS-v2 — z-index katmanları. Vuetify overlay'leri (dialog/menu/tooltip)
 * kendi yığınını 2000'den başlatır; kendi yüzen katmanlarımız (akıllı arama
 * açılırı, yapışkan başlıklar) bu ölçeği kullanır.
 */
export const zIndex = {
  base: 0,
  raised: 1,
  sticky: 10,
  sidebar: 900,
  header: 1000,
  dropdown: 1100,
  overlay: 2000,
  toast: 2400,
  tooltip: 2500,
} as const

/** Kırılım — yalnızca JS sabiti + belge (Vuetify `display.thresholds` AYRI, omurgada değişmez). */
export const breakpoint = {
  tablet: 768,
  desktop: 1024,
} as const

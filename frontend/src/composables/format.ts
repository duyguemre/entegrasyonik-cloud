/**
 * frontend/src/composables/format.ts
 *
 * ADR-0015 Karar 6.3 — tek biçimlendirici (tarih/para/sayı). Saf TS, `tr-TR`
 * sabit (PLATFORM_BASELINE.md C5: TRY, tr-TR, Europe/Istanbul).
 *
 * Bugün 44 dosyada dağınık biçimlendirme var (13 `Intl.NumberFormat`, 29
 * `toLocaleString`, 29 `toLocaleDateString`, `toFixed(2)` — grep, 2026-09-28).
 * Bu modül TEK KAYNAKTIR; yeni/değişen kod bu fonksiyonları kullanır. Tam
 * yayılım (44 dosya) bu görevin kapsamı DIŞINDADIR (A2 yalnızca modülü
 * kurar + 1-2 örnek dosyada, GÖRÜNÜR ÇIKTIYI DEĞİŞTİRMEYEN — "sıfır-fark" —
 * noktalarda kullanır); kalan dosyalar TODO (bkz. BACKLOG önerisi).
 *
 * **Neden sıfır-fark?** ADR Karar 6.3: "Spec'lerin çapaladığı biçimli
 * metinler... bir biçim değişikliği spec çapasını kırıyorsa o ekranın geçişi
 * ayrı, bilinçli bir commit'le yapılır." Bu dosyanın kendisi hiçbir ekranı
 * DEĞİŞTİRMEZ; yalnızca gelecekteki göçler için TEK kaynağı hazırlar.
 *
 * Geçersiz, boş ya da null değer için TEK gösterim: **"—"** (em dash).
 */

const LOCALE = 'tr-TR' as const
const CURRENCY_DEFAULT = 'TRY' as const
const EMPTY = '—' as const

function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function toFiniteNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : null
}

/** `formatMoney(4590.25)` → `"₺4.590,25"`. Değer MAJOR birimdir (ör. TRY, kuruş değil). */
export function formatMoney(amount: number | string | null | undefined, currency: string = CURRENCY_DEFAULT): string {
  const num = toFiniteNumber(amount)
  if (num === null) return EMPTY
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency }).format(num)
}

/** `formatNumber(12345)` → `"12.345"`. */
export function formatNumber(value: number | string | null | undefined): string {
  const num = toFiniteNumber(value)
  if (num === null) return EMPTY
  return new Intl.NumberFormat(LOCALE).format(num)
}

/** `formatPercent(0.05)` → `"%5,0"` (Türkçe yazımda yüzde işareti önde). `ratio` 0..1 aralığındadır (ör. 0.05 = %5). */
export function formatPercent(ratio: number | string | null | undefined): string {
  const num = toFiniteNumber(ratio)
  if (num === null) return EMPTY
  return new Intl.NumberFormat(LOCALE, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(num)
}

/** `formatDate(...)` → `"20.09.2026"`. */
export function formatDate(value: Date | string | number | null | undefined): string {
  const date = toDate(value)
  if (!date) return EMPTY
  return new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
}

/** `formatDateTime(...)` → `"20.09.2026 13:15"`. */
export function formatDateTime(value: Date | string | number | null | undefined): string {
  const date = toDate(value)
  if (!date) return EMPTY
  const datePart = formatDate(date)
  const timePart = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' }).format(date)
  return `${datePart} ${timePart}`
}

/**
 * ADR-0020 Karar 4.2 — "Süreler insan biçiminde girilir ve gösterilir (‘30 sn’, ‘15 dk’)".
 * `unit` katalog `SettingDef.unit`'idir (`ms|s|min|h|day|count|perMin|percent`). `ms` değerleri en
 * uygun büyük birime (gün→saat→dakika→saniye) YALNIZCA tam bölünüyorsa otomatik ölçeklenir (ör.
 * `300000` → `"5 dk"`); tam bölünmüyorsa ham `ms` gösterilir (veri kaybı/yanıltıcı yuvarlama YOK).
 * Diğer birimler zaten kataloğun kendi insan-ölçekli biriminde saklanır (ör. `unit:'day'` → değer
 * zaten gün sayısıdır), yalnızca uygun son ek eklenir. Geçersiz/null → `formatNumber` ile AYNI "—".
 */
const MS_SCALE: ReadonlyArray<{ ms: number; suffix: string }> = [
  { ms: 86400000, suffix: 'gün' },
  { ms: 3600000, suffix: 'sa' },
  { ms: 60000, suffix: 'dk' },
  { ms: 1000, suffix: 'sn' },
]

export function formatDuration(value: number | string | null | undefined, unit?: string): string {
  const num = toFiniteNumber(value)
  if (num === null) return EMPTY
  if (unit === 'ms') {
    for (const scale of MS_SCALE) {
      if (Math.abs(num) >= scale.ms && num % scale.ms === 0) return `${formatNumber(num / scale.ms)} ${scale.suffix}`
    }
    return `${formatNumber(num)} ms`
  }
  switch (unit) {
    case 's':
      return `${formatNumber(num)} sn`
    case 'min':
      return `${formatNumber(num)} dk`
    case 'h':
      return `${formatNumber(num)} sa`
    case 'day':
      return `${formatNumber(num)} gün`
    case 'perMin':
      return `${formatNumber(num)}/dk`
    case 'percent':
      return `%${formatNumber(num)}`
    default:
      return formatNumber(num)
  }
}

/**
 * `formatRelative(...)` → `"3 dk önce"`. Yalnızca "son senkron" gibi kısa
 * bağlamlarda kullanılır (Karar 6.3); gelecek zaman `"az önce"`'ye yuvarlanır.
 */
export function formatRelative(value: Date | string | number | null | undefined, now: Date = new Date()): string {
  const date = toDate(value)
  if (!date) return EMPTY
  const diffMs = now.getTime() - date.getTime()
  if (diffMs < 60_000) return 'az önce'
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 60) return `${diffMin} dk önce`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour} sa önce`
  const diffDay = Math.floor(diffHour / 24)
  return `${diffDay} gün önce`
}

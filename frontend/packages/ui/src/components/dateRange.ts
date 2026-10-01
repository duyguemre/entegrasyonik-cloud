/**
 * FR3 madde 10 (fe-r3a) — `EkDateRange` saf mantığı (Vue/DOM yok → vitest `node` ortamında test edilir).
 * Hazır aralıklar YEREL takvim gününe göre hesaplanır (ISO "YYYY-AA-GG"); bitiş dahil (backend gün sınırlarını kendi
 * saat diliminde uygular — ör. sipariş servisi İstanbul gün başı/sonu).
 */
export type DateRangePresetKey = 'today' | 'last7' | 'last30' | 'thisMonth' | 'lastMonth'

export interface DateRangePreset {
  key: DateRangePresetKey
  label: string
  start: string
  end: string
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Yerel takvim günü → "YYYY-AA-GG" (UTC'ye çevirmeden; gece yarısı kaymaz). */
export function toIsoDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() + days)
  return x
}

export function dateRangePresets(today: Date = new Date()): DateRangePreset[] {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const monthStart = new Date(t.getFullYear(), t.getMonth(), 1)
  const lastMonthStart = new Date(t.getFullYear(), t.getMonth() - 1, 1)
  const lastMonthEnd = new Date(t.getFullYear(), t.getMonth(), 0)
  return [
    { key: 'today', label: 'Bugün', start: toIsoDay(t), end: toIsoDay(t) },
    { key: 'last7', label: 'Son 7 gün', start: toIsoDay(addDays(t, -6)), end: toIsoDay(t) },
    { key: 'last30', label: 'Son 30 gün', start: toIsoDay(addDays(t, -29)), end: toIsoDay(t) },
    { key: 'thisMonth', label: 'Bu ay', start: toIsoDay(monthStart), end: toIsoDay(t) },
    { key: 'lastMonth', label: 'Geçen ay', start: toIsoDay(lastMonthStart), end: toIsoDay(lastMonthEnd) },
  ]
}

/** Seçili aralık bir hazır aralıkla birebir aynıysa onun anahtarı (menüde işaretlenir). */
export function matchPreset(start: string | null | undefined, end: string | null | undefined, today: Date = new Date()): DateRangePresetKey | undefined {
  if (!start || !end) return undefined
  return dateRangePresets(today).find((p) => p.start === start && p.end === end)?.key
}

/** Model değeri (Date | ISO metni) → "YYYY-AA-GG" ya da boş. */
export function normalizeDay(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : toIsoDay(value)
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : undefined
}

/** Etkin filtre çipi metni: "01.09.2026 – 30.09.2026", yalnız başlangıç "01.09.2026 sonrası", yalnız bitiş "30.09.2026 öncesi". */
export function formatDateRange(start: Date | string | null | undefined, end: Date | string | null | undefined): string {
  const s = normalizeDay(start)
  const e = normalizeDay(end)
  const tr = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`
  if (s && e) return s === e ? tr(s) : `${tr(s)} – ${tr(e)}`
  if (s) return `${tr(s)} sonrası`
  if (e) return `${tr(e)} öncesi`
  return ''
}

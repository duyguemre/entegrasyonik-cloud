/** Birim biçimleyicileri (tr-TR). Null/NaN → "—" (sözleşme: payda 0 / ölçüm yok = null). */
const nf = (opts: Intl.NumberFormatOptions = {}) => new Intl.NumberFormat('tr-TR', opts)

export function dash(v: unknown): v is null | undefined {
  return v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v))
}

export function formatPercent(ratio: number | null | undefined, digits = 1): string {
  if (dash(ratio)) return '—'
  return nf({ style: 'percent', minimumFractionDigits: ratio > 0 && ratio < 0.01 ? 2 : 0, maximumFractionDigits: ratio > 0 && ratio < 0.01 ? 2 : digits }).format(ratio)
}

/** Kuruş → para (ör. 599000 TRY → "₺5.990"). */
export function formatMinor(minor: number | null | undefined, currency = 'TRY'): string {
  if (dash(minor)) return '—'
  return nf({ style: 'currency', currency, maximumFractionDigits: minor % 100 ? 2 : 0 }).format(minor / 100)
}

export function formatBytes(bytes: number | null | undefined): string {
  if (dash(bytes)) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = bytes / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${nf({ maximumFractionDigits: v < 10 ? 1 : 0 }).format(v)} ${units[i]}`
}

/** Süre (ms) → "850 ms", "12 sn", "45 dk", "3 sa 20 dk", "2 gün". */
export function formatDuration(ms: number | null | undefined): string {
  if (dash(ms)) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  const s = ms / 1000
  if (s < 60) return `${nf({ maximumFractionDigits: s < 10 ? 1 : 0 }).format(s)} sn`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} dk`
  const h = Math.floor(m / 60)
  if (h < 48) return m % 60 ? `${h} sa ${m % 60} dk` : `${h} sa`
  return `${Math.floor(h / 24)} gün`
}

/** Çalışma süresi (sn). */
export function formatUptime(seconds: number | null | undefined): string {
  return dash(seconds) ? '—' : formatDuration(seconds * 1000)
}

export function formatCount(n: number | null | undefined): string {
  return dash(n) ? '—' : nf().format(n)
}

/** Yaklaşık gecikme etiketi: kova üst sınırı ("≤ 1 sn"); null → üst kova aşıldı. */
export function formatApproxMs(ms: number | null | undefined, overflowLabel = '> 30 sn'): string {
  if (dash(ms)) return overflowLabel
  return `≤ ${formatDuration(ms)}`
}

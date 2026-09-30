export { formatDate, formatDateTime, formatNumber } from '@entegrasyonik/ui/format'

const rtf = new Intl.RelativeTimeFormat('tr', { numeric: 'auto' })

/** "3 dk önce", "dün" — göreli zaman (ISO ya da ms). */
export function formatRelative(value: string | number | undefined, now = Date.now()): string {
  if (value === undefined) return '—'
  const ms = typeof value === 'number' ? value : Date.parse(value)
  if (Number.isNaN(ms)) return '—'
  const diff = (ms - now) / 1000
  const abs = Math.abs(diff)
  if (abs < 45) return 'az önce'
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
  return rtf.format(Math.round(diff / 86400), 'day')
}

export function formatClock(value: string | number): string {
  return new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value))
}

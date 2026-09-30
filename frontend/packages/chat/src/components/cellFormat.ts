/**
 * Tablo/KPI/kayıt kartı hücre biçimlendirme — SAF (birim testli). Sayı/para/tarih YALNIZ `@entegrasyonik/ui/format`.
 * Değerler sunucudan gelir (ADR-0034 Karar E2: tablo/KPI sayıları modelden gelmez); burada yalnız gösterim.
 */
import { formatDate, formatDateTime, formatMoney, formatNumber, formatPercent } from '@entegrasyonik/ui/format'
import type { CellValue, ColumnType, EntityRef, KpiItem, TableColumn } from '../protocol/v1'

export const EMPTY = '—'
const NUMERIC: ReadonlySet<ColumnType> = new Set(['number', 'money', 'percent'])

export function isEntityRef(value: CellValue): value is EntityRef {
  return !!value && typeof value === 'object' && 'type' in value && 'id' in value && 'label' in value
}

export function columnAlign(col: TableColumn): 'start' | 'end' {
  return col.align ?? (NUMERIC.has(col.type) ? 'end' : 'start')
}

/** Düz metin gösterimi (status/channel/entity için de yedek metin; bileşen zengin çizer). */
export function formatCell(value: CellValue, col: TableColumn, defaults: { currency: string }, labels: { yes: string; no: string }): string {
  if (value === null || value === undefined || value === '') return EMPTY
  if (isEntityRef(value)) return value.label
  switch (col.type) {
    case 'number':
      return formatNumber(value as number)
    case 'money':
      return formatMoney(value as number, col.currency ?? defaults.currency)
    case 'percent':
      return formatPercent(value as number)
    case 'date':
      return formatDate(value as string)
    case 'datetime':
      return formatDateTime(value as string)
    case 'boolean':
      return value === true ? labels.yes : value === false ? labels.no : String(value)
    default:
      return String(value)
  }
}

export function formatKpiValue(item: KpiItem, defaults: { currency: string }): string {
  if (item.value === null) return EMPTY
  if (item.format === 'money') return formatMoney(item.value, item.currency ?? defaults.currency)
  if (item.format === 'percent') return formatPercent(item.value)
  return formatNumber(item.value)
}

/** KPI farkı: yüzde oranı (0.082 → "%8,2"); yön metinle de verilir (renk tek başına anlam taşımaz). */
export function formatDelta(delta: NonNullable<KpiItem['delta']>): string {
  return formatPercent(Math.abs(delta.value))
}

/** Kayıt kartı alanı (değer sunucuda dizgedir). */
export function formatField(value: string, type: 'text' | 'money' | 'date' | 'status' | undefined, defaults: { currency: string }): string {
  if (!value) return EMPTY
  if (type === 'money') {
    const n = Number(value)
    return Number.isFinite(n) ? formatMoney(n, defaults.currency) : value
  }
  if (type === 'date') return formatDate(value)
  return value
}

/** Kalan süre "4:59" (negatif → "0:00"). */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

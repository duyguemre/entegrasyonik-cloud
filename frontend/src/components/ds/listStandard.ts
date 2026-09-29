/**
 * frontend/src/components/ds/listStandard.ts
 *
 * DS-v2 liste standardı yardımcıları (EkListScreen kullanan ekranlar için).
 *  - `sortRows`: İSTEMCİ tarafı sıralama (backend sıralama desteklemeyen listeler;
 *    o ekranlarda sıralama yalnız YÜKLENEN SAYFAYI sıralar). Türkçe harf sırası,
 *    sayı/tarih doğal karşılaştırma, boş değerler her iki yönde sonda.
 *  - `isRequestError`: `restApi.post` hatada REDDETMEZ, axios hata nesnesiyle
 *    ÇÖZÜLÜR — liste bunu "boş" değil "hata" durumu olarak göstermek için ayırt eder.
 */
import type { EkGridSort } from './EkDataGrid.vue'

type Accessor<T> = (row: T) => unknown

function comparable(v: unknown): number | string | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v instanceof Date) return v.getTime()
  const s = String(v)
  // ISO tarih ("2026-09-29T…") → zaman damgası
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const t = Date.parse(s)
    if (!Number.isNaN(t)) return t
  }
  return s
}

export function sortRows<T extends Record<string, any>>(
  rows: readonly T[],
  sort: EkGridSort,
  accessors: Record<string, Accessor<T>> = {},
): T[] {
  if (!sort) return [...rows]
  const get: Accessor<T> = accessors[sort.key] ?? ((r) => r[sort.key])
  const dir = sort.dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const va = comparable(get(a))
    const vb = comparable(get(b))
    if (va === null && vb === null) return 0
    if (va === null) return 1
    if (vb === null) return -1
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
    return String(va).localeCompare(String(vb), 'tr', { numeric: true }) * dir
  })
}

/** `restApi` yanıtı bir istek hatası mı (axios hata nesnesi / Error)? */
export function isRequestError(res: unknown): boolean {
  if (!res || typeof res !== 'object') return false
  return res instanceof Error || (res as { isAxiosError?: boolean }).isAxiosError === true
}

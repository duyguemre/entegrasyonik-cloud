/**
 * BO2-P6 — başarısız iş yardımcıları (saf TS): iş türü adı, durum rozeti, hata koduna göre gruplama.
 * Backend alanı yoksa (jobType, state, groups: opsiyonel) mevcut alandan türetir; uydurma metin yok — katalogda olmayan kod
 * olduğu gibi gösterilir.
 */
import type { DlqRecord, FailedBullJob, FailedJobGroup, ListFailedJobsResponse } from '@bo/api/contract'

/** İş türü kodu → insan okur ad (kuyruk iş adları; sipariş hattı). */
export const JOB_TYPE_LABEL: Record<string, string> = {
  'fetch-orders': 'Sipariş çekme',
  'push-status': 'Sipariş durumu gönderme',
  'push-cargo': 'Kargo bilgisi gönderme',
  'fetch-claims': 'İade talebi çekme',
}

type JobLike = Pick<FailedBullJob, 'id' | 'jobType' | 'integrationCode'> & { operation?: string; originalJobId?: string }

/** Backend `jobType` verirse o; yoksa `operation` (`fetch-orders-trendyol`) ya da iş kimliğinden (`fetch-orders-1200`) türetilir. */
export function jobTypeCode(j: JobLike): string | null {
  if (j.jobType) return j.jobType
  let code = (j.operation ?? j.originalJobId ?? j.id).replace(/-\d+$/, '')
  if (j.integrationCode) code = code.replace(new RegExp(`-${j.integrationCode}$`), '')
  return /^[a-z][a-z-]*[a-z]$/.test(code) ? code : null
}
export const jobTypeLabel = (code: string | null | undefined): string => (code ? (JOB_TYPE_LABEL[code] ?? code) : 'İş türü bildirilmedi')

export type JobState = { label: string; tone: 'danger' | 'info' | 'warning' | 'neutral' }
export function bullState(j: Pick<FailedBullJob, 'state'>): JobState {
  return j.state === 'retrying' ? { label: 'Yeniden deneniyor', tone: 'info' } : { label: 'Başarısız', tone: 'danger' }
}
export function dlqState(d: Pick<DlqRecord, 'status'>): JobState {
  return { label: 'Ölü mektup', tone: d.status === 'PENDING_MANUAL_REVIEW' ? 'warning' : 'neutral' }
}

/** Hata koduna göre özet satırı: iş türü dağılımı + en eski hata. */
export interface FailedGroupRow {
  errorCode: string
  count: number
  oldestFailedAt: string | null
  jobTypes: Array<{ code: string | null; count: number }>
}
export interface FailedSummary {
  rows: FailedGroupRow[]
  count: number
  oldestFailedAt: string | null
  /** true → sayılar süzgeçe uyan TÜM kayıtlar (backend `groups`); false → yalnız yüklenen örneklem. */
  exact: boolean
}

function toRows(groups: FailedJobGroup[]): FailedGroupRow[] {
  const map = new Map<string, FailedGroupRow>()
  for (const g of groups) {
    const row = map.get(g.errorCode) ?? { errorCode: g.errorCode, count: 0, oldestFailedAt: null, jobTypes: [] }
    row.count += g.count
    if (!row.oldestFailedAt || g.oldestFailedAt < row.oldestFailedAt) row.oldestFailedAt = g.oldestFailedAt
    const jt = row.jobTypes.find((x) => x.code === g.jobType)
    if (jt) jt.count += g.count
    else row.jobTypes.push({ code: g.jobType, count: g.count })
    map.set(g.errorCode, row)
  }
  return [...map.values()]
    .map((r) => ({ ...r, jobTypes: r.jobTypes.sort((a, b) => b.count - a.count) }))
    .sort((a, b) => b.count - a.count || a.errorCode.localeCompare(b.errorCode))
}

export function summarize(res: Pick<ListFailedJobsResponse, 'items' | 'groups' | 'nextCursor'>): FailedSummary {
  const exact = Array.isArray(res.groups)
  const groups: FailedJobGroup[] = exact
    ? res.groups!
    : (res.items as Array<FailedBullJob | DlqRecord>).map((j) => ({ errorCode: j.errorCode, jobType: jobTypeCode(j), count: 1, oldestFailedAt: j.failedAt }))
  const rows = toRows(groups)
  const oldest = rows.reduce<string | null>((o, r) => (r.oldestFailedAt && (!o || r.oldestFailedAt < o) ? r.oldestFailedAt : o), null)
  return { rows, count: rows.reduce((n, r) => n + r.count, 0), oldestFailedAt: oldest, exact: exact || !res.nextCursor }
}

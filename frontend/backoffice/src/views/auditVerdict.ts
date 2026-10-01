/** Denetim kayıtları — sayfa hükmü (K51). Saf: girdi son 7 günün kayıtları (süzgeçsiz), çıktı `PageVerdict`. Yazma eylemi yoktur: denetim değiştirilemez. */
import type { AuditRecord } from '@bo/api/contract'
import { buildVerdict, unreadable, type AttentionItem, type PageVerdict, type SuggestedAction } from '@bo/utils/verdict'
import { formatCount } from '@bo/utils/units'

const DAY_MS = 86_400_000
/** Son 24 saatteki yönetim yazması, önceki 6 günün günlük ortalamasının bu katını aşarsa "alışılmadık hacim" (sözleşmede eşik yok). */
export const VOLUME_FACTOR = 3
/** …ve en az bu kadar yazma varsa (az sayıdaki dalgalanma gürültüdür). */
export const VOLUME_MIN = 20

/** Sayfa süzgeci (göreli konum, `{ query }`): sayfa bu parametreleri okur ve uygular. URL'deki `?event=&surface=&result=&range=` karşılığı. */
export interface AuditShow {
  event?: string
  result?: AuditRecord['result']
  surface?: AuditRecord['surface']
  range?: '24h' | '7d'
}

export interface AuditVerdictInput {
  /** Son 7 günün kayıtları (yeniden eskiye); null = okunamadı. */
  records: AuditRecord[] | null
  /** Sunucu daha fazla kayıt olduğunu söylüyor → sayılar "en az". */
  truncated?: boolean
  failed: boolean
  now?: number
  retry: () => void
}

export interface AuditCounts {
  writes: number
  reads: number
  sessions: number
  denied: number
  errored: number
  failedLogins: number
  total: number
}

const isWrite = (a: AuditRecord) => a.event === 'backoffice.write'

export function countLast24h(records: AuditRecord[], now: number): AuditCounts {
  const day = records.filter((a) => now - Date.parse(a.at) <= DAY_MS)
  return {
    writes: day.filter(isWrite).length,
    reads: day.filter((a) => a.event === 'backoffice.sensitive_read').length,
    sessions: day.filter((a) => a.event === 'impersonation.start' || a.event === 'impersonation').length,
    denied: day.filter((a) => a.result === 'fail').length,
    errored: day.filter((a) => a.result === 'error').length,
    failedLogins: day.filter((a) => a.event === 'login' && a.result === 'fail').length,
    total: day.length,
  }
}

/** Önceki 6 günün günlük ortalama yönetim yazması (son 24 saat hariç). */
export function baselineWrites(records: AuditRecord[], now: number): number {
  const prev = records.filter((a) => isWrite(a) && now - Date.parse(a.at) > DAY_MS && now - Date.parse(a.at) <= 7 * DAY_MS)
  return prev.length / 6
}

const go = (f: AuditShow) => ({ query: { ...(f.event ? { event: f.event } : {}), ...(f.result ? { result: f.result } : {}), ...(f.surface ? { surface: f.surface } : {}), ...(f.range && f.range !== '7d' ? { range: f.range } : {}) } })

const n = (v: number, one: string, many = one) => `${formatCount(v)} ${v === 1 ? one : many}`

export function auditVerdict(i: AuditVerdictInput): PageVerdict {
  const now = i.now ?? Date.now()
  const attention: Array<AttentionItem | null> = []
  const actions: SuggestedAction[] = []
  const c = i.records ? countLast24h(i.records, now) : null

  if (c && c.denied > 0)
    attention.push({
      id: 'denied',
      tone: 'warning',
      title: `${n(c.denied, 'işlem')} reddedildi ya da engellendi`,
      impact: c.failedLogins ? `${n(c.failedLogins, 'tanesi')} başarısız giriş denemesi; yetki ya da doğrulama adımında durdu.` : 'Yetki ya da doğrulama adımında durdu.',
      advice: 'Aktörü ve kaynak IP adresini kontrol edin; tanımadığınız bir kaynaksa yöneticileri uyarın.',
      cta: 'Reddedilenleri aç',
      to: go({ result: 'fail', range: '24h' }),
    })
  if (c && c.errored > 0)
    attention.push({
      id: 'errored',
      tone: 'warning',
      title: `${n(c.errored, 'işlem')} hatayla sonuçlandı`,
      impact: 'İşlem tamamlanmadı; değişiklik uygulanmamış olabilir.',
      advice: 'Aynı istek kimliğiyle log merkezinde nedenini kontrol edin.',
      cta: 'Hatalıları aç',
      to: go({ result: 'error', range: '24h' }),
    })
  if (c && i.records) {
    const base = baselineWrites(i.records, now)
    if (c.writes >= VOLUME_MIN && c.writes > base * VOLUME_FACTOR)
      attention.push({
        id: 'volume',
        tone: 'warning',
        title: `Alışılmadık yazma hacmi: son 24 saatte ${formatCount(c.writes)} yönetim yazması`,
        impact: `Önceki günlerin ortalaması günde ${formatCount(Math.round(base))}; toplu bir değişiklik ya da otomasyon olabilir.`,
        advice: 'Aktörleri ve gerekçeleri kontrol edin.',
        cta: 'Yazmaları aç',
        to: go({ event: 'backoffice.write', range: '24h' }),
      })
  }
  if (i.failed) attention.push(unreadable('audit', 'Denetim özeti', i.retry))

  if (c) {
    if (c.denied) actions.push({ id: 'denied', label: 'Reddedilen işlemleri inceleyin', detail: 'Aktör, hedef ve istek zinciriyle.', icon: 'mdi-shield-alert-outline', to: go({ result: 'fail', range: '24h' }) })
    if (c.writes) actions.push({ id: 'writes', label: 'Yönetim yazmalarını gözden geçirin', detail: 'Önce/sonra değerleri ve gerekçeyle birlikte.', icon: 'mdi-pencil-outline', to: go({ event: 'backoffice.write', range: '24h' }) })
    if (c.sessions) actions.push({ id: 'sessions', label: 'Destek oturumlarını gözden geçirin', detail: 'Kim hangi müşteriye, hangi gerekçeyle girdi.', icon: 'mdi-account-switch-outline', to: go({ event: 'impersonation', range: '24h' }) })
    if (c.reads) actions.push({ id: 'reads', label: 'Hassas okumaları gözden geçirin', detail: 'Kimlik bilgisi ve sır görüntülemeleri.', icon: 'mdi-eye-outline', to: go({ event: 'backoffice.sensitive_read', range: '24h' }) })
  }

  const approx = i.truncated ? 'en az ' : ''
  const describe = (): string => {
    if (!c || c.total === 0) return 'Son 24 saatte denetim kaydı yok'
    const parts = [c.writes && n(c.writes, 'yönetim yazması', 'yönetim yazması'), c.reads && n(c.reads, 'hassas okuma'), c.sessions && n(c.sessions, 'destek oturumu')].filter(Boolean)
    return parts.length ? `Son 24 saatte ${approx}${parts.join(', ')} kaydedildi` : `Son 24 saatte ${approx}${n(c.total, 'kayıt')} var; yönetim yazması, hassas okuma ya da destek oturumu yok`
  }

  return buildVerdict({
    attention,
    actions,
    note: 'Son 24 saat; süzgeçsiz son 7 günlük kayıt üzerinden değerlendirildi.',
    checks: ['Reddedilen işlemler', 'Hatalı işlemler', 'Yazma hacmi'],
    calm: { summary: c && c.total === 0 ? 'Son 24 saatte denetim kaydı yok.' : `${describe()}; reddedilen, engellenen ya da hatalı işlem yok.`, tone: 'info' },
    busy: ({ total, top }) =>
      i.failed && !i.records
        ? 'Denetim özeti okunamadı — hüküm verilemiyor; tekrar deneyin.'
        : `${describe()}; ${total === 1 ? 'bir konu' : `${total} konu`} dikkat istiyor: ${top.title}.`,
  })
}

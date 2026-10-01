/**
 * Sahte `getAttention` / `getPulse` — docs/cloud-contracts/API_BACKOFFICE_ATTENTION.md'ye BİREBİR (alan adları, eşikler,
 * sıra, rota/sorgu adları sözleşmedeki gibi; önyüz çevirisi adaptörde). Veri diğer sahte alanlarla TUTARLI: müşteri
 * numaraları/adları ctx.clients'tan, abonelik durumları ops/billing.ts tohumlarından (105 past_due, 109 suspended,
 * 108 PROVISIONING_FAILED, 111 DELETION_PENDING; denemeler > 3 gün → öğe yok), uyarılar ops/notifications.ts'ten
 * (R1 trendyol:107 kritik; susturulmuş R2 n11:103 ve gölge R4 YOK; circuit:* R2 sistem devre öğesine katlanır).
 * Kollar: `calm` → "her şey yolunda"; `degraded` (Redis düşük) → kuyruk/altyapı kritik; `sections` → okunamayan kontroller.
 */
import type { AttentionItemDto, AttentionSection, GetAttentionResponse, GetPulseResponse } from '../../contract'
import { rng } from '../data'
import { DAY, HOUR, MIN, iso, tenantName, validation, type MockCtx } from './context'

export interface AttentionFlags {
  calm: boolean
  sections: AttentionSection[]
}

const SECTION_OF: Record<string, AttentionSection> = {
  'sys.queue': 'queues',
  'sys.circuit': 'circuits',
  'sys.api': 'apiHealth',
  'sys.lease': 'leases',
  'sys.infra': 'infra',
  'sys.http': 'infra',
  'sys.alert': 'alerts',
  'sys.slowquery': 'slowQueries',
  'cus.integration': 'alerts',
  'cus.sync': 'orderSync',
  'cus.trial': 'subscriptions',
  'cus.sub': 'subscriptions',
  'cus.payment': 'subscriptions',
  'cus.deletion': 'lifecycle',
  'cus.lifecycle': 'lifecycle',
  'cus.ticket': 'tickets',
}
const sectionOf = (id: string) => SECTION_OF[id.split('.').slice(0, 2).join('.')]

export function buildAttention(ctx: MockCtx, body: Record<string, unknown>, flags: AttentionFlags): GetAttentionResponse {
  for (const k of Object.keys(body)) if (k !== 'limit') throw validation(k, 'bilinmeyen alan')
  const limit = body.limit === undefined ? 20 : Number(body.limit)
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw validation('limit', '1..50 arası tam sayı olmalı')

  const { now, t0 } = ctx
  const subject = (tid: number) => ({ tid, name: tenantName(ctx, tid) })
  const all: Array<AttentionItemDto & { weight: number }> = []
  if (ctx.degraded) {
    all.push(
      { id: 'sys.infra.degraded', group: 'system', severity: 'critical', title: 'Altyapı bağımlılığı hazır değil', why: 'Redis bağlantısı yok; hazırlık denetimi başarısız.', count: null, countUnit: null, impact: 'Sipariş kuyruğu ve dağıtık kilitler durdu.', since: iso(now - 3 * MIN), actions: [{ label: 'Altyapıya git', kind: 'navigate', target: { route: '/altyapi' } }], weight: 100 },
      { id: 'sys.queue.unavailable', group: 'system', severity: 'critical', title: 'Kuyruk okunamıyor', why: 'Redis hazır değil; bekleyen ve başarısız işler okunamıyor.', count: null, countUnit: null, impact: 'Yeni siparişler işlenmiyor.', since: iso(now - 3 * MIN), actions: [{ label: 'Altyapıya git', kind: 'navigate', target: { route: '/altyapi' } }], weight: 90 },
    )
  }
  if (!flags.calm) {
    all.push(
      { id: 'sys.circuit.open:n11', group: 'system', severity: 'critical', title: 'N11 devre kesicisi açık', why: '3 devre kesici açık; N11 istekleri bekletiliyor.', count: 3, countUnit: null, impact: 'N11 sipariş ve ürün eşitlemesi duraklıyor.', since: iso(t0 - 18 * MIN), actions: [{ label: 'Dayanıklılığa git', kind: 'navigate', target: { route: '/entegrasyonlar', query: { tab: 'resilience', integrationCode: 'n11' } } }], weight: 3 },
      { id: 'sys.api.errorrate:trendyol', group: 'system', severity: 'warning', title: 'Trendyol API hata oranı %23', why: 'Son 1 saatte 1.790 çağrının 412\'si hata döndü; çoğu hız sınırı (429).', count: 412, countUnit: 'çağrı', impact: 'Ürün güncellemeleri gecikmeli gidiyor.', since: iso(t0 - 2 * HOUR), actions: [{ label: 'API sağlığına git', kind: 'navigate', target: { route: '/entegrasyonlar', query: { tab: 'api-health', integrationCode: 'trendyol', range: '1h' } } }], weight: 412 },
      { id: 'sys.queue.failed:order-sync-queue', group: 'system', severity: 'warning', title: 'Başarısız işler', why: 'Sipariş eşitleme kuyruğunda 3 iş başarısız oldu.', count: 3, countUnit: 'iş', impact: 'Etkilenen siparişlerin durumu kanala gitmedi.', since: iso(t0 - 4 * HOUR), actions: [{ label: 'Başarısız işlere git', kind: 'navigate', target: { route: '/motor', query: { tab: 'failed' } } }, { label: 'Hepsini yeniden dene', kind: 'action', capabilityId: 'platform.engine.retry_jobs' }], weight: 3 },
      { id: 'sys.queue.dlq:order-sync-queue', group: 'system', severity: 'warning', title: 'Elle inceleme bekleyen işler', why: 'Ölü mektup kuyruğunda inceleme bekleyen 1 iş var.', count: 1, countUnit: 'iş', impact: 'Bu iş kendiliğinden yeniden denenmez.', since: iso(t0 - 5 * HOUR), actions: [{ label: 'Ölü mektuplara git', kind: 'navigate', target: { route: '/motor', query: { tab: 'failed', source: 'dlq' } } }], weight: 1 },
      { id: 'cus.integration.error:trendyol', group: 'customers', severity: 'critical', title: 'Trendyol işlemleri başarısız', why: 'Son 1 saatte müşterinin Trendyol çağrılarının %55\'i hata döndü.', count: 1, countUnit: 'müşteri', impact: 'Siparişler ve ürünler kanala ulaşmıyor.', since: iso(t0 - 52 * MIN), subjects: [subject(107)], actions: [{ label: 'Müşteriye git', kind: 'navigate', target: { route: '/musteriler/107' } }], weight: 1 },
      { id: 'cus.lifecycle.failed', group: 'customers', severity: 'critical', title: 'Hesap kurulumu yarıda kaldı', why: 'Kurulum "tenant kullanıcısı" adımında başarısız oldu.', count: 1, countUnit: 'müşteri', impact: 'Müşteri henüz giriş yapamıyor.', since: iso(t0 - 2 * DAY), subjects: [subject(108)], actions: [{ label: 'Yaşam döngüsüne git', kind: 'navigate', target: { route: '/musteriler/yasam-dongusu', query: { status: 'failed' } } }], weight: 1 },
      { id: 'cus.payment.problem', group: 'customers', severity: 'warning', title: 'Ödeme alınamadı', why: 'Abonelik ödemesi gecikmiş; ek süre 4 gün sonra bitiyor.', count: 1, countUnit: 'müşteri', impact: 'Ek süre bitince hesap askıya alınır.', since: iso(t0 - 3 * DAY), subjects: [subject(105)], actions: [{ label: 'Ödeme sorunlu aboneliklere git', kind: 'navigate', target: { route: '/abonelikler', query: { status: 'past_due' } } }], weight: 1 },
      { id: 'cus.sub.suspended', group: 'customers', severity: 'warning', title: 'Askıdaki abonelik', why: 'Deneme süresi 6 gün önce bitti; abonelik askıda.', count: 1, countUnit: 'müşteri', impact: 'Müşteri ürünü kullanamıyor.', since: iso(t0 - 6 * DAY), subjects: [subject(109)], actions: [{ label: 'Askıdaki aboneliklere git', kind: 'navigate', target: { route: '/abonelikler', query: { status: 'suspended' } } }], weight: 1 },
      { id: 'cus.deletion.pending', group: 'customers', severity: 'info', title: 'Silme talebi bekliyor', why: 'Kalıcı silmeye 21 gün var.', count: 1, countUnit: 'müşteri', impact: null, since: iso(t0 - 9 * DAY), subjects: [subject(111)], actions: [{ label: 'Silme taleplerine git', kind: 'navigate', target: { route: '/musteriler/yasam-dongusu', query: { status: 'DELETION_PENDING' } } }], weight: 1 },
    )
  }
  // Okunamayan kontrolün öğeleri gelmez (ve "sorun yok" anlamına gelmez).
  const off = new Set(flags.sections)
  const live = all.filter((i) => !off.has(sectionOf(i.id)))
  const SEV = { critical: 0, warning: 1, info: 2 }
  live.sort((a, b) => SEV[a.severity] - SEV[b.severity] || b.weight - a.weight || Date.parse(a.since ?? '') - Date.parse(b.since ?? '') || a.id.localeCompare(b.id))
  const group = (g: 'system' | 'customers') => {
    const items = live.filter((i) => i.group === g)
    return { total: items.length, truncated: items.length > limit, items: items.slice(0, limit).map(({ weight: _w, ...rest }) => rest) }
  }
  const summary = { critical: 0, warning: 0, info: 0 }
  for (const i of live) summary[i.severity]++
  return {
    generatedAt: iso(now),
    status: off.size ? 'degraded' : live.length ? 'attention' : 'ok',
    summary,
    degradedSections: [...off].map((section) => ({ section, error: 'timeout' as const })),
    groups: { system: group('system'), customers: group('customers') },
  }
}

export function buildPulse(ctx: MockCtx, body: Record<string, unknown>, flags: { calm: boolean }): GetPulseResponse {
  for (const k of Object.keys(body)) throw validation(k, 'bilinmeyen alan')
  const { now } = ctx
  const end = Math.floor(now / HOUR) * HOUR
  const r = rng(31)
  const hours = Array.from({ length: 24 }, (_, i) => end - (23 - i) * HOUR)
  // Gün içi biçim: gece düşük, öğleden sonra yüksek.
  const shape = (t: number) => 0.45 + 0.55 * Math.sin(((new Date(t).getUTCHours() - 5) / 24) * Math.PI * 2) ** 2
  const httpHourly = hours.map((t) => ({ t: iso(t), count: Math.round(3800 * shape(t) * (0.9 + r() * 0.2)) }))
  const http24 = httpHourly.reduce((s, p) => s + p.count, 0)
  const errHourly = httpHourly.map((p) => {
    const errors5xx = Math.round(p.count * (flags.calm ? 0.002 : 0.006) * (0.5 + r()))
    return { t: p.t, requests: p.count, errors5xx, rate: p.count ? Number((errors5xx / p.count).toFixed(4)) : null }
  })
  const byStatus: Record<string, number> = { ACTIVE: 10, PROVISIONING_FAILED: 1, DELETION_PENDING: 1 }
  return {
    generatedAt: iso(now),
    tenants: { status: 'ok', active: byStatus.ACTIVE, total: ctx.clients.length, byStatus },
    // Sözleşme: platform sipariş sayacı yok → DAİMA hesaplanamadı.
    orders: { status: 'ok', computable: false, last24h: null, last7d: null, previous24h: null, hourly: [], note: 'hesaplanamadı' },
    calls: {
      status: 'ok',
      http: { computable: true, last24h: http24, last7d: Math.round(http24 * 6.6), hourly: httpHourly },
      integration: { computable: true, last24h: 40_010, last7d: 268_400 },
    },
    errorRate: {
      status: 'ok',
      http: { computable: true, hourly: errHourly },
      integration: { computable: true, last24h: flags.calm ? 0.006 : 0.021, last7d: 0.018 },
    },
    mrr: { status: 'ok', computable: true, unit: 'minor', currency: { TRY: 2_894_000 }, activeSubscriptions: 7, trialing: 2, lostLast30d: 1 },
  }
}

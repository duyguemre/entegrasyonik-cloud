/**
 * Genel bakış triyajı için İNCE ADAPTÖR (K51). Sözleşme: docs/cloud-contracts/API_BACKOFFICE_ATTENTION.md.
 * Ekranlar yalnız buradaki görünüm modelini kullanır; tel biçimi (`contracts/attention.ts`) değişirse yalnız bu dosya değişir.
 *
 * - `loadAttention()` → `getAttention`. Metin (title/why/impact/eylem etiketi) SUNUCUDAN gelir, olduğu gibi gösterilir;
 *   sıra sunucunundur (FE yeniden sıralamaz). Önyüz yalnız kontrol kimliğine göre kısa bir "ne yapmalı" ipucu ekler
 *   (`ADVICE`; sözleşmede alan yok — öneri: sunucu `advice` döndürsün).
 * - Gezinme hedefleri (`target.route` + `query`) ekranların okuduğu sorgu adlarına çevrilir (`tab`→`sekme`, `source`→`kaynak`,
 *   değerler Türkçe sekme adlarına). Çevrilmeyen anahtarlar olduğu gibi geçer (hedef ekran okumuyorsa zararsız).
 * - Uç yoksa (404 NOT_FOUND, eski backend) `getHealth`'ten sistem maddeleri türetilir; müşteri bölümü "henüz bağlı değil".
 * - `loadPulse()` → `getPulse`; uç yoksa `null` (ekran sakin bir "henüz bağlı değil" notu çizer).
 */
import type { LocationQueryRaw, RouteLocationRaw } from 'vue-router'
import { api } from '.'
import { AdminApiError } from './client'
import type {
  AttentionGroup,
  AttentionItemDto,
  AttentionSection,
  AttentionSeverity,
  GetAttentionResponse,
  GetPulseResponse,
  OverviewHealthResponse,
} from './contract'
import { formatPercent } from '@bo/utils/units'

export type Severity = AttentionSeverity
export type Scope = 'system' | 'tenant'

export interface AttentionItem {
  id: string
  scope: Scope
  severity: Severity
  /** Ne oldu (sunucu). */
  title: string
  /** Neden / ayrıntı cümlesi (sunucu). */
  why: string
  /** Etki (sunucu) ya da null. */
  impact: string | null
  /** "1.240 iş" — sayı + birim (sunucu). */
  count: string | null
  /** Ne yapmalı — önyüz ipucu (kontrol kimliğine göre); bilinmeyen kontrolde yok. */
  advice?: string
  /** Birincil gezinme eylemi (ilgili ekran + süzgeç). */
  action?: { label: string; to: RouteLocationRaw }
  /** İkinci gezinme eylemi (varsa). */
  secondary?: { label: string; to: RouteLocationRaw }
  /** Yerinde güvenli eylem önerileri (yetenek kimliği); akış ilgili ekranda step-up + gerekçeyle yapılır. */
  capabilities: Array<{ label: string; capabilityId: string }>
  since?: string
  subjects: Array<{ tid: number; name: string | null }>
}

export interface AttentionModel {
  generatedAt: string
  status: 'ok' | 'attention' | 'degraded'
  /** Grup başına öğeler (sunucu sırası). */
  items: Record<Scope, AttentionItem[]>
  /** Kesmeden önceki toplam (grup başına). */
  total: Record<Scope, number>
  /** "Her şey yolunda" durumunda neyin denetlendiği (sözleşme kataloğu). */
  checks: Record<Scope, string[]>
  /** Okunamayan kontroller (Türkçe ad) — boşluk "sorun yok" DEĞİLDİR. */
  degraded: Record<Scope, string[]>
  /** `fallback` = getAttention yok, sistem maddeleri getHealth'ten türetildi; müşteri kapsamı desteklenmiyor. */
  source: 'attention' | 'fallback'
}

const SECTION_LABEL: Record<AttentionSection, string> = {
  queues: 'Kuyruklar',
  circuits: 'Devre kesiciler',
  apiHealth: 'Kanal API hata oranları',
  leases: 'Takılı kiralar',
  infra: 'Altyapı ve sunucu hataları',
  alerts: 'Uyarı kuralları',
  slowQueries: 'Yavaş sorgular',
  orderSync: 'Sipariş eşitleme',
  subscriptions: 'Abonelik ve ödeme',
  lifecycle: 'Kurulum ve silme',
  tickets: 'Destek talepleri',
}
const SECTION_SCOPE: Record<AttentionSection, Scope[]> = {
  queues: ['system'],
  circuits: ['system'],
  apiHealth: ['system'],
  leases: ['system'],
  infra: ['system'],
  alerts: ['system', 'tenant'],
  slowQueries: ['system'],
  orderSync: ['tenant'],
  subscriptions: ['tenant'],
  lifecycle: ['tenant'],
  tickets: ['tenant'],
}
const CHECKS: Record<Scope, AttentionSection[]> = {
  system: ['infra', 'queues', 'circuits', 'apiHealth', 'leases', 'alerts', 'slowQueries'],
  tenant: ['alerts', 'orderSync', 'subscriptions', 'lifecycle', 'tickets'],
}

/** Kontrol (id öneki) → "ne yapmalı" ipucu. Kısa, siz dili; sunucu `why`'ını tekrar etmez. */
const ADVICE: Record<string, string> = {
  'sys.queue.backlog': 'İşçi podlarının çalıştığını ve hız sınırına takılan bir kanal olup olmadığını kontrol edin.',
  'sys.queue.failed': 'Hata koduna göre gruplayın; geçici nedenliyse kaynağı düzelttikten sonra yeniden deneyin.',
  'sys.queue.dlq': 'Kalıcı hata ya da deneme sınırı aşıldı; kayıtları inceleyin, gerekiyorsa müşteriyi bilgilendirin.',
  'sys.queue.unavailable': 'Önce Redis bağlantısını doğrulayın; geri gelince kuyruk kendiliğinden devam eder.',
  'sys.circuit.open': 'Kanalın durum sayfasına bakın; sorun karşı taraftaysa beklemek yeterli, devre kendiliğinden yarı açığa geçer.',
  'sys.api.errorrate': 'Hata kodlarına bakın: kimlik hatasıysa müşteriyi bilgilendirin, hız sınırıysa gönderim hızını düşürün.',
  'sys.lease.stuck': 'Takılı kiraları inceleyin; sahibi pod artık yoksa gerekçeyle bırakın.',
  'sys.infra.degraded': 'Altyapı ekranında bağlantı durumunu kontrol edin; sürerse barındırma sağlayıcısının durum sayfasına bakın.',
  'sys.http.5xx': 'Log merkezinde açık sorunlara bakın; yeni bir sürümle başladıysa geri almayı değerlendirin.',
  'sys.alert.firing': 'Uyarının ayrıntısına bakın; beklenen bir durumsa gerekçeyle susturun.',
  'sys.slowquery.burst': 'Yavaş sorguları koleksiyona göre inceleyin; yeni bir sorgu deseni varsa indeksi gözden geçirin.',
  'cus.integration.error': 'Müşterinin loglarında hata kodunu inceleyin; müşteri tarafında bir ayar sorunuysa müşteriyle iletişime geçin.',
  'cus.integration.auth': 'Müşteriye mağaza anahtarını yenilemesini bildirin; o zamana dek bu kanalda eşitleme durur.',
  'cus.sync.lag': 'Müşterinin kanal bağlantılarını ve kuyruktaki işlerini kontrol edin.',
  'cus.trial.ending': 'Kurulum tamamlanmadıysa denemeyi uzatmayı ya da bir satış görüşmesini değerlendirin.',
  'cus.sub.suspended': 'Müşteri devam etmek istiyorsa planı değiştirin ya da denemeyi uzatın.',
  'cus.payment.problem': 'Müşteriyle iletişime geçip kart bilgisini güncellemesini isteyin.',
  'cus.deletion.pending': 'Talep müşterinin onayıyla yapıldıysa işlem gerekmez; yanlışlıkla yapıldıysa silmeyi iptal edin.',
  'cus.lifecycle.failed': 'Yaşam döngüsünde başarısız adımı inceleyin; tekrarlıyorsa geliştirici ekibine iletin.',
  'cus.ticket.aging': 'Talebi yanıtlayın ya da ilgili ekibe atayın.',
}
export const checkKey = (id: string) => id.split(':')[0]

/** Sözleşme sorgu adları → ekranların okuduğu adlar (BO_UI_PATTERNS §11.6 tablosu). */
const TAB_VALUE: Record<string, Record<string, string>> = {
  '/motor': { queues: 'kuyruklar', failed: 'basarisiz', 'state-machine': 'durum', scheduled: 'zamanlanmis' },
  '/entegrasyonlar': { 'api-health': 'saglik', resilience: 'dayaniklilik', catalog: 'katalog' },
  '/altyapi': { redis: 'redis', mongodb: 'mongodb', 'slow-queries': 'yavas' },
}

export function routeOf(target: { route: string; query?: Record<string, string> }): RouteLocationRaw {
  const path = target.route.startsWith('/') ? target.route : `/${target.route}`
  const query: LocationQueryRaw = {}
  for (const [k, v] of Object.entries(target.query ?? {})) {
    if (k === 'tab') {
      // Log merkezinde "issues" varsayılan sekmedir; sorgu taşınmaz.
      if (path === '/loglar' && v === 'issues') continue
      query.sekme = TAB_VALUE[path]?.[v] ?? v
    } else if (k === 'source') query.kaynak = v
    else query[k] = v
  }
  return Object.keys(query).length ? { path, query } : { path }
}

const nf = new Intl.NumberFormat('tr-TR')

/**
 * Tek müşterili öğede liste hedefi yerine o müşterinin kaydı: abonelik listesi süzgeci (`status`) ve `/musteriler/yasam-dongusu`,
 * `/musteriler/destek` (önyüzde henüz "yakında") bugün süzgeci uygulamıyor → tek tıkla doğru kayda gitmek için detay açılır.
 * Birden çok müşteride sözleşme hedefi korunur (bo-r1b liste süzgeçlerini okuyunca doğrudan çalışır).
 */
function preferDetail(target: { route: string; query?: Record<string, string> }, subjects: Array<{ tid: number }>) {
  if (subjects.length !== 1) return target
  const tid = subjects[0].tid
  if (target.route === '/abonelikler') return { route: `/abonelikler/${tid}` }
  if (target.route === '/musteriler/yasam-dongusu') return { route: `/musteriler/${tid}`, query: { sekme: 'yasam-dongusu' } }
  if (target.route === '/musteriler' || target.route === '/musteriler/destek') return { route: `/musteriler/${tid}` }
  return target
}

export function toItem(d: AttentionItemDto): AttentionItem {
  const navs = d.actions.filter((a): a is Extract<typeof a, { kind: 'navigate' }> => a.kind === 'navigate')
  const caps = d.actions.filter((a): a is Extract<typeof a, { kind: 'action' }> => a.kind === 'action')
  return {
    id: d.id,
    scope: d.group === 'customers' ? 'tenant' : 'system',
    severity: d.severity,
    title: d.title,
    why: d.why,
    impact: d.impact,
    // Birimsiz sayı ("3") tek başına belirsiz — yalnız birimle gösterilir (başlık/why zaten sayıyı söyler).
    count: d.count === null || !d.countUnit ? null : `${nf.format(d.count)} ${d.countUnit}`,
    advice: ADVICE[checkKey(d.id)],
    action: navs[0] ? { label: navs[0].label, to: routeOf(preferDetail(navs[0].target, d.subjects ?? [])) } : undefined,
    secondary: navs[1] ? { label: navs[1].label, to: routeOf(navs[1].target) } : undefined,
    capabilities: caps.map((c) => ({ label: c.label, capabilityId: c.capabilityId })),
    since: d.since ?? undefined,
    subjects: d.subjects ?? [],
  }
}

export function fromAttention(r: GetAttentionResponse): AttentionModel {
  const degraded: AttentionModel['degraded'] = { system: [], tenant: [] }
  for (const s of r.degradedSections) for (const scope of SECTION_SCOPE[s.section] ?? ['system']) degraded[scope].push(SECTION_LABEL[s.section] ?? s.section)
  const g = (k: AttentionGroup) => r.groups[k] ?? { total: 0, truncated: false, items: [] }
  return {
    generatedAt: r.generatedAt,
    status: r.status,
    items: { system: g('system').items.map(toItem), tenant: g('customers').items.map(toItem) },
    total: { system: g('system').total, tenant: g('customers').total },
    checks: { system: CHECKS.system.map((s) => SECTION_LABEL[s]), tenant: CHECKS.tenant.map((s) => SECTION_LABEL[s]) },
    degraded,
    source: 'attention',
  }
}

/** getAttention yokken: getHealth'ten sistem maddeleri (BO-ELEV karar şeridi eşikleri). Metin önyüzde kurulur. */
export function fromHealth(h: OverviewHealthResponse): AttentionModel {
  const at = h.generatedAt
  const out: AttentionItemDto[] = []
  const degraded: string[] = []
  const item = (id: string, severity: Severity, title: string, why: string, label: string, route: string, query?: Record<string, string>, count: number | null = null, countUnit: AttentionItemDto['countUnit'] = null): AttentionItemDto => ({
    id, group: 'system', severity, title, why, count, countUnit, impact: null, since: null, actions: [{ label, kind: 'navigate', target: { route, query } }],
  })
  const d = h.dependencies
  if (d.status === 'ok') {
    if (d.mongo === 'fail') out.push(item('sys.infra.degraded:mongo', 'critical', 'MongoDB erişilemiyor', 'Uygulama veritabanına okuma/yazma yapılamıyor.', 'Altyapıya git', '/altyapi', { tab: 'mongodb' }))
    if (d.redis === 'fail') out.push(item('sys.infra.degraded:redis', 'critical', 'Redis erişilemiyor', 'Sipariş kuyruğu ve dağıtık kilitler durdu.', 'Altyapıya git', '/altyapi', { tab: 'redis' }))
  } else degraded.push(SECTION_LABEL.infra)
  const r = h.red
  if (r.status === 'ok') {
    if (r.errorRate !== null && r.errorRate >= 0.01)
      out.push(item('sys.http.5xx', r.errorRate >= 0.05 ? 'critical' : 'warning', `Sunucu hata oranı ${formatPercent(r.errorRate)}`, `Son ${r.windowMinutes} dakikada isteklerin bir kısmı 5xx ile döndü.`, 'Hata loglarına git', '/loglar', { level: 'fatal,error' }))
  } else degraded.push('İstek sağlığı')
  const q = h.queues
  if (q.status === 'ok') {
    if (q.items.some((x) => !x.available) && !(d.status === 'ok' && d.redis === 'fail'))
      out.push(item('sys.queue.unavailable', 'critical', 'Kuyruk sayaçları okunamıyor', 'Redis hazır değil; bekleyen ve başarısız işler görünmüyor.', 'Altyapıya git', '/altyapi'))
    const dlq = q.items.reduce((s, x) => s + (x.dlqPending ?? 0), 0)
    if (dlq > 0) out.push(item('sys.queue.dlq', dlq >= 10 ? 'critical' : 'warning', 'Elle inceleme bekleyen işler', 'Kalıcı hata ya da deneme sınırı aşımı nedeniyle ölü mektup kuyruğunda bekliyor.', 'Ölü mektuplara git', '/motor', { tab: 'failed', source: 'dlq' }, dlq, 'iş'))
    const backlog = q.items.reduce((s, x) => s + (x.backlog ?? 0), 0)
    if (backlog >= 200) out.push(item('sys.queue.backlog', backlog >= 1000 ? 'critical' : 'warning', 'Sipariş kuyruğunda birikim', 'Bekleyen iş sayısı eşiğin üstünde.', 'Kuyruklara git', '/motor', { tab: 'queues' }, backlog, 'iş'))
  } else degraded.push(SECTION_LABEL.queues)
  if (h.issues.status === 'ok') {
    if (h.issues.newLast24h > 0) out.push(item('sys.issues.new', 'warning', 'Yeni hata grupları', 'Son 24 saatte ilk kez görülen açık hata grupları var.', 'Sorunlara git', '/loglar', undefined, h.issues.newLast24h, 'kayıt'))
  } else degraded.push('Hata grupları')
  const SEV = { critical: 0, warning: 1, info: 2 }
  const items = out.sort((a, b) => SEV[a.severity] - SEV[b.severity]).map(toItem)
  return {
    generatedAt: at,
    status: degraded.length ? 'degraded' : items.length ? 'attention' : 'ok',
    items: { system: items, tenant: [] },
    total: { system: items.length, tenant: 0 },
    checks: { system: [SECTION_LABEL.infra, 'İstek sağlığı', SECTION_LABEL.queues, 'Hata grupları'], tenant: [] },
    degraded: { system: degraded, tenant: [] },
    source: 'fallback',
  }
}

const missingOp = (e: unknown) => e instanceof AdminApiError && e.status === 404 && e.code === 'NOT_FOUND'

export async function loadAttention(limit = 20): Promise<AttentionModel> {
  try {
    return fromAttention(await api.call('BackofficeOverviewService/getAttention', { limit }))
  } catch (e) {
    if (!missingOp(e)) throw e
    return fromHealth(await api.call('BackofficeOverviewService/getHealth', {}))
  }
}

// ---------------------------------------------------------------- nabız (büyük resim + kullanım)
export interface PulseRow {
  key: string
  label: string
  /** Biçimli değer; hesaplanamazsa "—". */
  value: string
  /** İkincil bilgi: karşılaştırma ya da neden hesaplanamadığı. */
  note: string
  /** Önceki döneme göre yön (renksiz ok); yoksa undefined. */
  trend?: 'up' | 'down' | 'flat'
  series: number[] | null
  /** Eşik aşıldı (getAttention eşikleriyle aynı) → yalnız değer rengi. */
  over: boolean
  state: 'ok' | 'na' | 'degraded'
}

export interface UsageModel {
  tenants: { state: 'ok'; active: number; total: number; byStatus: Record<string, number> } | { state: 'degraded' }
  mrr: { state: 'ok'; currency: string; minor: number; activeSubscriptions: number; trialing: number; lostLast30d: number } | { state: 'na'; note: string } | { state: 'degraded' }
}

export interface PulseModel {
  generatedAt: string
  rows: PulseRow[]
  usage: UsageModel
  /** Okunamayan bloklar (Türkçe ad). */
  degraded: string[]
}

const NA_NOTE = 'Henüz ölçülmüyor'
const pct1 = (r: number) => formatPercent(r)

function versus(now: number | null, base: number | null, word: string): { note: string; trend?: PulseRow['trend'] } {
  if (now === null || base === null || base === 0) return { note: `${word}: karşılaştırma yok` }
  const ch = (now - base) / base
  if (Math.abs(ch) < 0.02) return { note: `${word} göre değişmedi`, trend: 'flat' }
  return { note: `${word} göre %${nf.format(Math.round(Math.abs(ch) * 100))} ${ch > 0 ? 'fazla' : 'az'}`, trend: ch > 0 ? 'up' : 'down' }
}

export function fromPulse(r: GetPulseResponse): PulseModel {
  const rows: PulseRow[] = []
  const degraded: string[] = []
  const deg = (key: string, label: string): PulseRow => ({ key, label, value: '—', note: 'Okunamadı — birazdan yeniden denenir', series: null, over: false, state: 'degraded' })

  // Siparişler
  if (r.orders.status === 'ok') {
    const o = r.orders
    rows.push(
      o.computable && o.last24h !== null
        ? { key: 'orders', label: 'İşlenen sipariş', value: nf.format(o.last24h), ...versus(o.last24h, o.previous24h, 'Önceki 24 saate'), series: o.hourly.length ? o.hourly.map((p) => p.count) : null, over: false, state: 'ok' }
        : { key: 'orders', label: 'İşlenen sipariş', value: '—', note: `${NA_NOTE} (platform sipariş sayacı yok)`, series: null, over: false, state: 'na' },
    )
  } else {
    rows.push(deg('orders', 'İşlenen sipariş'))
    degraded.push('Siparişler')
  }

  // Çağrılar
  if (r.calls.status === 'ok') {
    const h = r.calls.http
    rows.push(
      h.computable && h.last24h !== null
        ? { key: 'http', label: 'API isteği', value: nf.format(h.last24h), ...versus(h.last24h, h.last7d === null ? null : h.last7d / 7, '7 gün ortalamasına'), series: h.hourly.map((p) => p.count), over: false, state: 'ok' }
        : { key: 'http', label: 'API isteği', value: '—', note: NA_NOTE, series: null, over: false, state: 'na' },
    )
    const i = r.calls.integration
    rows.push(
      i.computable && i.last24h !== null
        ? { key: 'integration', label: 'Kanal çağrısı', value: nf.format(i.last24h), ...versus(i.last24h, i.last7d === null ? null : i.last7d / 7, '7 gün ortalamasına'), series: null, over: false, state: 'ok' }
        : { key: 'integration', label: 'Kanal çağrısı', value: '—', note: NA_NOTE, series: null, over: false, state: 'na' },
    )
  } else {
    rows.push(deg('http', 'API isteği'), deg('integration', 'Kanal çağrısı'))
    degraded.push('Çağrı sayıları')
  }

  // Hata oranları (eşikler getAttention ile aynı: 5xx ≥ %5, kanal ≥ %20)
  if (r.errorRate.status === 'ok') {
    const h = r.errorRate.http
    const req = h.hourly.reduce((s, p) => s + p.requests, 0)
    const err = h.hourly.reduce((s, p) => s + p.errors5xx, 0)
    const rate = req ? err / req : null
    rows.push(
      h.computable && rate !== null
        ? { key: 'http5xx', label: 'Sunucu hata oranı (5xx)', value: pct1(rate), note: `${nf.format(err)} hata · eşik %5`, series: h.hourly.map((p) => p.rate ?? 0), over: rate >= 0.05, state: 'ok' }
        : { key: 'http5xx', label: 'Sunucu hata oranı (5xx)', value: '—', note: NA_NOTE, series: null, over: false, state: 'na' },
    )
    const i = r.errorRate.integration
    rows.push(
      i.computable && i.last24h !== null
        ? { key: 'intErr', label: 'Kanal hata oranı', value: pct1(i.last24h), note: `7 gün ${i.last7d === null ? '—' : pct1(i.last7d)} · eşik %20`, series: null, over: i.last24h >= 0.2, state: 'ok' }
        : { key: 'intErr', label: 'Kanal hata oranı', value: '—', note: NA_NOTE, series: null, over: false, state: 'na' },
    )
  } else {
    rows.push(deg('http5xx', 'Sunucu hata oranı (5xx)'), deg('intErr', 'Kanal hata oranı'))
    degraded.push('Hata oranları')
  }

  const t = r.tenants
  const tenants: UsageModel['tenants'] = t.status === 'ok' ? { state: 'ok', active: t.active, total: t.total, byStatus: t.byStatus } : { state: 'degraded' }
  if (t.status !== 'ok') degraded.push('Müşteri sayıları')
  const m = r.mrr
  let mrr: UsageModel['mrr']
  if (m.status !== 'ok') {
    mrr = { state: 'degraded' }
    degraded.push('Gelir')
  } else if (!m.computable) mrr = { state: 'na', note: m.note ?? 'hesaplanamadı' }
  else {
    const currency = Object.keys(m.currency)[0] ?? 'TRY'
    mrr = { state: 'ok', currency, minor: m.currency[currency] ?? 0, activeSubscriptions: m.activeSubscriptions, trialing: m.trialing, lostLast30d: m.lostLast30d }
  }
  return { generatedAt: r.generatedAt, rows, usage: { tenants, mrr }, degraded }
}

export async function loadPulse(): Promise<PulseModel | null> {
  try {
    return fromPulse(await api.call('BackofficeOverviewService/getPulse', {}))
  } catch (e) {
    if (missingOp(e)) return null
    throw e
  }
}

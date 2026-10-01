/**
 * Genel bakış triyajı için İNCE ADAPTÖR (K51). Ekranlar yalnız buradaki görünüm modelini kullanır; tel biçimi
 * (`contracts/attention.ts`) değişirse yalnız bu dosya değişir.
 *
 * - `loadAttention()` → `BackofficeOverviewService/getAttention`. Uç henüz yoksa (404 NOT_FOUND) `getHealth`'ten sistem
 *   maddeleri türetilir; müşteri bölümü "henüz desteklenmiyor" der (uydurma veri yok).
 * - `loadPulse()` → `BackofficeOverviewService/getPulse`. Uç yoksa `null` (ekran sakin bir "yakında" notu çizer).
 * - Metin (ne oldu / ne kadar ciddi / ne yapmalı / eylem) `kind`'e göre BURADA kurulur; sunucu yalnız olgu (sayı, kod) verir.
 */
import type { RouteLocationRaw } from 'vue-router'
import { api } from '.'
import { AdminApiError } from './client'
import type {
  AttentionItemDto,
  AttentionScope,
  AttentionSeverity,
  AttentionTarget,
  GetAttentionResponse,
  GetPulseResponse,
  OverviewHealthResponse,
  PulseMetric,
  PulseRange,
} from './contract'
import { CHANNEL, PROVISIONING_STEP } from '@bo/utils/labels'
import { formatDuration, formatPercent } from '@bo/utils/units'

export type Severity = AttentionSeverity
export type Scope = AttentionScope

export interface AttentionItem {
  id: string
  scope: Scope
  severity: Severity
  kind: string
  /** Ne oldu — tek cümle, özne + durum. */
  title: string
  /** Ne kadar ciddi — kim/ne etkileniyor, sınır nedir. */
  impact: string
  /** Ne yapmalıyım — tek cümle öneri. */
  advice: string
  /** Tek tıkla eylem: ilgili ekran + süzgeç önceden uygulanmış. */
  action: { label: string; to: RouteLocationRaw }
  /** İkincil bağlantı (iz: log/denetim ya da müşteri). */
  secondary?: { label: string; to: RouteLocationRaw }
  since?: string
  tenant?: { tid: number; name: string | null }
}

export interface AttentionModel {
  generatedAt: string
  status: 'ok' | 'warning' | 'critical'
  items: AttentionItem[]
  /** "Her şey yolunda" metni için: hangi denetimler yapıldı (Türkçe ad). */
  checks: Record<Scope, string[]>
  /** Kapsamda okunamayan kaynak var (liste eksik olabilir). */
  degraded: Record<Scope, string[]>
  /** `fallback` = getAttention yok, sistem maddeleri getHealth'ten türetildi; müşteri kapsamı desteklenmiyor. */
  source: 'attention' | 'fallback'
}

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2 }

const CHECK_LABEL: Record<string, string> = {
  dependencies: 'Bağımlılıklar',
  queues: 'Kuyruklar',
  dlq: 'Ölü mektuplar',
  breakers: 'Devre kesiciler',
  apiHealth: 'Kanal API hata oranları',
  red: 'Hata oranı ve yanıt süresi',
  issues: 'Yeni hata grupları',
  alerts: 'Uyarı kuralları',
  intake: 'Veri alımı',
  integrations: 'Müşteri entegrasyonları',
  sync: 'Sipariş eşitleme gecikmesi',
  billing: 'Ödeme ve abonelik',
  trials: 'Biten denemeler',
  lifecycle: 'Kurulum ve silme talepleri',
  support: 'Destek talepleri',
}

const ch = (code?: string) => (code ? (CHANNEL[code] ?? code) : 'Kanal')
const n = (v?: number) => new Intl.NumberFormat('tr-TR').format(v ?? 0)
const tenantsText = (c?: number) => (c ? `${n(c)} müşteri etkileniyor` : 'Müşteri etkisi bilinmiyor')

/** Hedef → rota. Ekran anahtarları ve detay rota adları router'da `name` olarak kayıtlıdır. */
export function routeOf(t: AttentionTarget): RouteLocationRaw {
  return { name: t.screen, params: t.params ? Object.fromEntries(Object.entries(t.params).map(([k, v]) => [k, String(v)])) : undefined, query: t.query }
}

type Copy = Pick<AttentionItem, 'title' | 'impact' | 'advice'> & { actionLabel: string; secondary?: AttentionItem['secondary'] }

/** Tür → metin. Bilinmeyen tür önem derecesine göre genel metin alır (ekran yine hedefe bağlanır). */
function copyOf(d: AttentionItemDto): Copy {
  const f = d.facts
  const tenantLink = d.tid ? { label: 'Müşteriyi aç', to: { name: 'tenant', params: { tid: String(d.tid) } } } : undefined
  const tenantLogs = d.tid ? { label: 'Müşteri logları', to: { name: 'logs', query: { tid: String(d.tid) } } } : undefined
  switch (d.kind) {
    case 'dependency.down':
      return f.dependency === 'mongo'
        ? { title: 'MongoDB erişilemiyor', impact: 'Uygulama veritabanına okuma/yazma yapılamıyor; tüm müşteriler etkilenir.', advice: 'Altyapı ekranında bağlantı durumunu ve yavaş sorguları kontrol edin; sorun sürerse barındırma sağlayıcısının durum sayfasına bakın.', actionLabel: 'Altyapıyı aç' }
        : { title: 'Redis erişilemiyor', impact: 'Sipariş kuyruğu ve dağıtık kilitler durdu; yeni sipariş işlenmiyor.', advice: 'Altyapı ekranında Redis bağlantısını kontrol edin; geri gelince kuyruk kendiliğinden devam eder.', actionLabel: 'Altyapıyı aç' }
    case 'queue.unavailable':
      return { title: 'Kuyruk sayaçları okunamıyor', impact: 'Bekleyen ve başarısız işler görünmüyor; birikme fark edilmeyebilir.', advice: 'Önce Redis bağlantısını doğrulayın; ardından motor ekranında kuyruğu kontrol edin.', actionLabel: 'Motoru aç' }
    case 'queue.dlq':
      return {
        title: `${n(f.count)} iş elle inceleme bekliyor`,
        impact: `Kalıcı hata ya da deneme sınırı aşıldı; bu işler kendiliğinden yeniden denenmez.${f.tenantCount ? ` ${tenantsText(f.tenantCount)}.` : ''}`,
        advice: 'Hata koduna göre bakın: geçici nedenliyse kaynağı düzelttikten sonra yeniden kuyruğa alın, kalıcıysa müşteriyi bilgilendirin.',
        actionLabel: 'Ölü mektupları incele',
      }
    case 'queue.backlog':
      return { title: `Kuyrukta ${n(f.count)} iş birikti`, impact: `Siparişler gecikmeli işleniyor${f.valueMs ? `; en eski iş ${formatDuration(f.valueMs)} bekliyor` : ''}.`, advice: 'İşçi podlarının çalıştığını ve hız sınırına takılan bir kanal olup olmadığını kontrol edin.', actionLabel: 'Kuyrukları aç' }
    case 'breaker.open':
      return {
        title: `${ch(f.integrationCode)} bağlantısında ${n(f.count)} devre kesici açık`,
        impact: `${f.tenantCount ? `${n(f.tenantCount)} müşterinin ` : ''}${ch(f.integrationCode)} istekleri bekletiliyor${f.valueMs ? `; ${formatDuration(f.valueMs)}dır açık` : ''}.`,
        advice: 'Kanalın durum sayfasını kontrol edin; sorun karşı taraftaysa beklemek yeterli, devre kendiliğinden yarı açığa geçer.',
        actionLabel: 'Dayanıklılığı aç',
      }
    case 'integration.error_rate':
      return f.integrationCode
        ? { title: `${ch(f.integrationCode)} API hata oranı ${formatPercent(f.rate)}`, impact: `Olağan eşik ${formatPercent(f.thresholdRate ?? 0.05)}; ${tenantsText(f.tenantCount).toLocaleLowerCase('tr')}.`, advice: 'Hata kodlarına bakın: kimlik hatasıysa müşteriyi bilgilendirin, hız sınırıysa gönderim hızını düşürün.', actionLabel: 'API sağlığını aç' }
        : { title: `Sunucu hata oranı ${formatPercent(f.rate)}`, impact: `Olağan eşik ${formatPercent(f.thresholdRate ?? 0.01)}; isteklerin bir kısmı 5xx ile dönüyor.`, advice: 'Loglarda son hata gruplarına bakın; yeni bir sürümle başladıysa geri almayı değerlendirin.', actionLabel: 'Hata loglarını aç' }
    case 'integration.latency':
      return { title: `Yanıt süresi yükseldi (p95 ${formatDuration(f.valueMs)})`, impact: 'İsteklerin %5\'i bu süreden uzun sürüyor; kullanıcılar yavaşlık hissedebilir.', advice: 'Entegrasyon API sağlığında yavaş kanalı bulun; altyapıda yavaş sorgu olup olmadığına bakın.', actionLabel: 'API sağlığını aç' }
    case 'issue.spike':
      return { title: `${f.integrationCode ? `${ch(f.integrationCode)}: ` : ''}hata grubu hızla artıyor`, impact: `Son saatte ${n(f.count)} olay; ${tenantsText(f.tenantCount).toLocaleLowerCase('tr')}.`, advice: 'Sorun grubunu açıp örnek olaylara bakın; bilinen bir durumsa onaylayın, değilse sorumlu ekibe iletin.', actionLabel: 'Sorunu aç' }
    case 'alert.firing':
      return { title: 'Uyarı kuralı tetiklendi', impact: tenantsText(f.tenantCount), advice: 'Uyarının ayrıntısına bakın; beklenen bir durumsa gerekçeyle susturun.', actionLabel: 'Uyarıyı aç' }
    case 'intake.restricted':
      return { title: `${ch(f.integrationCode)} yeni iş almıyor`, impact: 'Bu kanala yeni ürün/sipariş işi kabul edilmiyor; kuyruktakiler bitiriliyor.', advice: 'Kısıt bilinçli bir bakım için konduysa bitiş zamanını kontrol edin; değilse dayanıklılık ekranından açın.', actionLabel: 'Dayanıklılığı aç' }
    case 'tenant.integration_failing':
      return { title: `${ch(f.integrationCode)} işlemleri başarısız (hata oranı ${formatPercent(f.rate)})`, impact: `Bu müşterinin ${ch(f.integrationCode)} siparişleri ve ürünleri kanala ulaşmıyor.`, advice: 'Loglarda hata kodunu inceleyin; müşteri tarafında bir ayar sorunuysa müşteriyle iletişime geçin.', actionLabel: 'Müşteri loglarını aç', secondary: tenantLink }
    case 'tenant.auth_failed':
      return { title: `${ch(f.integrationCode)} mağaza anahtarı reddediliyor`, impact: 'Müşteri anahtarı yenileyene kadar bu kanalda eşitleme durur.', advice: 'Müşteriye anahtarı yenilemesini bildirin; bildirim geçmişinden daha önce uyarılıp uyarılmadığına bakın.', actionLabel: 'Müşteri loglarını aç', secondary: tenantLink }
    case 'tenant.sync_lag':
      return { title: `Sipariş eşitlemesi ${formatDuration(f.valueMs)}dır yapılmadı`, impact: 'Yeni siparişler müşterinin paneline ve stoklarına yansımıyor olabilir.', advice: 'Müşterinin kanal bağlantılarını ve kuyruktaki işlerini kontrol edin.', actionLabel: 'Müşteriyi aç', secondary: tenantLogs }
    case 'tenant.payment_failed':
      return { title: 'Ödeme alınamadı', impact: f.daysLeft !== undefined ? `Ek süre ${n(f.daysLeft)} gün sonra bitiyor; ardından hesap askıya alınır.` : 'Ek süre bitince hesap askıya alınır.', advice: 'Müşteriyle iletişime geçip kart bilgisini güncellemesini isteyin.', actionLabel: 'Aboneliği aç', secondary: tenantLink }
    case 'tenant.trial_ending':
      return { title: `Deneme süresi ${n(f.daysLeft)} gün içinde bitiyor`, impact: 'Kart tanımlı değil; süre bitince hesap askıya alınır.', advice: 'Kurulum tamamlanmadıysa denemeyi uzatmayı ya da bir satış görüşmesini değerlendirin.', actionLabel: 'Aboneliği aç', secondary: tenantLink }
    case 'tenant.suspended':
      return { title: 'Hesap askıda', impact: f.daysLeft !== undefined ? `Deneme ${n(Math.abs(f.daysLeft))} gün önce bitti; müşteri ürünü kullanamıyor.` : 'Müşteri ürünü kullanamıyor.', advice: 'Müşteri devam etmek istiyorsa planı değiştirin ya da denemeyi uzatın.', actionLabel: 'Aboneliği aç', secondary: tenantLink }
    case 'tenant.provisioning_failed':
      return { title: 'Hesap kurulumu yarıda kaldı', impact: `“${PROVISIONING_STEP[f.step ?? ''] ?? f.step ?? 'Bilinmeyen'}” adımında hata; müşteri henüz giriş yapamıyor.`, advice: 'Yaşam döngüsü sekmesinde başarısız adımı inceleyin; tekrarlıyorsa geliştirici ekibine iletin.', actionLabel: 'Yaşam döngüsünü aç', secondary: tenantLogs }
    case 'tenant.deletion_pending':
      return { title: 'Silme talebi bekliyor', impact: f.daysLeft !== undefined ? `${n(f.daysLeft)} gün sonra müşterinin verileri kalıcı olarak silinir.` : 'Süre dolunca veriler kalıcı olarak silinir.', advice: 'Talep müşterinin onayıyla yapıldıysa işlem gerekmez; yanlışlıkla yapıldıysa silmeyi iptal edin.', actionLabel: 'Yaşam döngüsünü aç' }
    case 'tenant.support_waiting':
      return { title: `${n(f.count || 1)} destek talebi yanıt bekliyor`, impact: f.valueMs ? `En eskisi ${formatDuration(f.valueMs)}dır bekliyor.` : 'Müşteri yanıt bekliyor.', advice: 'Talebi açıp yanıtlayın ya da ilgili ekibe atayın.', actionLabel: 'Talepleri aç', secondary: tenantLink }
  }
  const generic: Record<Severity, string> = { critical: 'Kritik bir durum bildirildi', warning: 'İzlenmesi gereken bir durum bildirildi', info: 'Bilgi' }
  return { title: generic[d.severity], impact: d.tid ? 'Bu müşteri etkileniyor.' : tenantsText(f.tenantCount), advice: 'Ayrıntıyı açıp inceleyin.', actionLabel: 'Ayrıntıyı aç', secondary: tenantLink }
}

export function toItem(d: AttentionItemDto): AttentionItem {
  const c = copyOf(d)
  return {
    id: d.id,
    scope: d.scope,
    severity: d.severity,
    kind: d.kind,
    title: c.title,
    impact: c.impact,
    advice: c.advice,
    action: { label: c.actionLabel, to: routeOf(d.target) },
    secondary: c.secondary,
    since: d.since,
    tenant: d.tid ? { tid: d.tid, name: d.tenantName ?? null } : undefined,
  }
}

export function sortItems<T extends { severity: Severity; since?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || Date.parse(a.since ?? '') - Date.parse(b.since ?? '') || 0)
}

export function fromAttention(r: GetAttentionResponse): AttentionModel {
  const checks: AttentionModel['checks'] = { system: [], tenant: [] }
  const degraded: AttentionModel['degraded'] = { system: [], tenant: [] }
  for (const c of r.checks) {
    const label = CHECK_LABEL[c.key] ?? c.key
    checks[c.scope].push(label)
    if (c.status === 'degraded') degraded[c.scope].push(label)
  }
  return { generatedAt: r.generatedAt, status: r.status, items: sortItems(r.items.map(toItem)), checks, degraded, source: 'attention' }
}

/** getAttention yokken: getHealth'ten sistem maddeleri (BO-ELEV karar şeridi kuralları; eşikler aynı). */
export function fromHealth(h: OverviewHealthResponse): AttentionModel {
  const at = h.generatedAt
  const items: AttentionItemDto[] = []
  const degraded: string[] = []
  const d = h.dependencies
  if (d.status === 'ok') {
    if (d.mongo === 'fail') items.push({ id: 'dependency.down:mongo', scope: 'system', severity: 'critical', kind: 'dependency.down', since: at, facts: { dependency: 'mongo' }, target: { screen: 'infra', query: { sekme: 'mongodb' } } })
    if (d.redis === 'fail') items.push({ id: 'dependency.down:redis', scope: 'system', severity: 'critical', kind: 'dependency.down', since: at, facts: { dependency: 'redis' }, target: { screen: 'infra', query: { sekme: 'redis' } } })
  } else degraded.push(CHECK_LABEL.dependencies)
  const r = h.red
  if (r.status === 'ok') {
    if (r.errorRate !== null && r.errorRate >= 0.01)
      items.push({ id: 'integration.error_rate:platform', scope: 'system', severity: r.errorRate >= 0.05 ? 'critical' : 'warning', kind: 'integration.error_rate', since: r.from, facts: { rate: r.errorRate, thresholdRate: 0.01 }, target: { screen: 'logs', query: { level: 'fatal,error' } } })
    const p95 = r.durationP95Overflow ? 60_000 : r.durationP95Ms
    if (p95 !== null && p95 >= 1000)
      items.push({ id: 'integration.latency:platform', scope: 'system', severity: p95 >= 3000 ? 'critical' : 'warning', kind: 'integration.latency', since: r.from, facts: { valueMs: p95 }, target: { screen: 'integrations' } })
  } else degraded.push(CHECK_LABEL.red)
  const q = h.queues
  if (q.status === 'ok') {
    if (q.items.some((x) => !x.available) && d.status === 'ok' && d.redis !== 'fail')
      items.push({ id: 'queue.unavailable', scope: 'system', severity: 'warning', kind: 'queue.unavailable', since: at, facts: {}, target: { screen: 'engine' } })
    const dlq = q.items.reduce((s, x) => s + (x.dlqPending ?? 0), 0)
    if (dlq > 0) items.push({ id: 'queue.dlq', scope: 'system', severity: 'warning', kind: 'queue.dlq', since: at, facts: { count: dlq }, target: { screen: 'engine', query: { sekme: 'basarisiz', kaynak: 'dlq' } } })
    const backlog = q.items.reduce((s, x) => s + (x.backlog ?? 0), 0)
    if (backlog > 100) items.push({ id: 'queue.backlog', scope: 'system', severity: 'warning', kind: 'queue.backlog', since: at, facts: { count: backlog }, target: { screen: 'engine' } })
  } else degraded.push(CHECK_LABEL.queues)
  if (h.intake.status === 'ok') {
    for (const x of h.intake.restricted) {
      const [kind, code] = x.target.split(':')
      items.push({ id: `intake.restricted:${x.target}`, scope: 'system', severity: x.intake === 'drain' ? 'warning' : 'critical', kind: 'intake.restricted', since: at, facts: { integrationCode: kind === 'platform' ? code : x.target }, target: { screen: 'integrations', query: { sekme: 'dayaniklilik' } } })
    }
  } else degraded.push(CHECK_LABEL.intake)
  if (h.issues.status === 'ok') {
    if (h.issues.newLast24h > 0) items.push({ id: 'issue.new', scope: 'system', severity: 'warning', kind: 'issue.new', since: at, facts: { count: h.issues.newLast24h }, target: { screen: 'logs' } })
  } else degraded.push(CHECK_LABEL.issues)

  const model = items.map((x) =>
    x.kind === 'issue.new'
      ? { ...toItem(x), title: `${n(x.facts.count)} yeni hata grubu (son 24 sa)`, impact: 'Daha önce görülmemiş hatalar; etkisi henüz sınıflanmadı.', advice: 'Log merkezinde yeni grupları açıp ciddiyetine göre onaylayın ya da sorumlu ekibe iletin.', action: { label: 'Sorunları aç', to: { name: 'logs' } } }
      : toItem(x),
  )
  const status = items.some((x) => x.severity === 'critical') ? 'critical' : items.length ? 'warning' : 'ok'
  return {
    generatedAt: at,
    status,
    items: sortItems(model),
    checks: { system: [CHECK_LABEL.dependencies, CHECK_LABEL.red, CHECK_LABEL.queues, CHECK_LABEL.dlq, CHECK_LABEL.intake, CHECK_LABEL.issues], tenant: [] },
    degraded: { system: degraded, tenant: [] },
    source: 'fallback',
  }
}

const missingOp = (e: unknown) => e instanceof AdminApiError && e.status === 404 && e.code === 'NOT_FOUND'

export async function loadAttention(): Promise<AttentionModel> {
  try {
    return fromAttention(await api.call('BackofficeOverviewService/getAttention', {}))
  } catch (e) {
    if (!missingOp(e)) throw e
    return fromHealth(await api.call('BackofficeOverviewService/getHealth', {}))
  }
}

// ---------------------------------------------------------------- nabız (büyük resim + kullanım)
export interface PulseTrend {
  key: string
  label: string
  value: number | null
  previous: number | null
  series: number[]
  /** Değer biçimi. */
  format: 'number' | 'percent' | 'ms' | 'perMinute'
  /** Artış iyi mi kötü mü (renksiz ok + metin; yalnız eşik aşımında ton). */
  goodWhen: 'up' | 'down' | 'neutral'
  help?: string
}
export interface PulseModel {
  generatedAt: string
  range: PulseRange
  trends: PulseTrend[]
  customers: GetPulseResponse['customers']
  usage: GetPulseResponse['usage']
  degraded: string[]
}

const series = (m: PulseMetric) => m.series.map((p) => p.v ?? 0)

export function fromPulse(r: GetPulseResponse): PulseModel {
  const s = r.system
  const t = (key: string, label: string, m: PulseMetric, format: PulseTrend['format'], goodWhen: PulseTrend['goodWhen'], help?: string): PulseTrend => ({ key, label, value: m.value, previous: m.previous, series: series(m), format, goodWhen, help })
  return {
    generatedAt: r.generatedAt,
    range: r.range,
    trends: [
      t('orders', 'İşlenen sipariş', s.ordersProcessed, 'number', 'up'),
      t('catalog', 'Yayınlanan ürün güncellemesi', s.catalogPublished, 'number', 'up'),
      t('rpm', 'İstek hızı', s.requestsPerMinute, 'perMinute', 'neutral', 'Dakikada ortalama API isteği.'),
      t('errors', 'Hata oranı (5xx)', s.errorRate, 'percent', 'down', 'Sunucu hatası dönen isteklerin oranı. %1 altı olağan.'),
      t('p95', 'Yanıt süresi (p95)', s.p95Ms, 'ms', 'down', 'İsteklerin %95\'i bu sürenin altında tamamlandı.'),
    ],
    customers: r.customers,
    usage: r.usage,
    degraded: r.degradedSources,
  }
}

export async function loadPulse(range: PulseRange = '24h'): Promise<PulseModel | null> {
  try {
    return fromPulse(await api.call('BackofficeOverviewService/getPulse', { range }))
  } catch (e) {
    if (missingOp(e)) return null
    throw e
  }
}

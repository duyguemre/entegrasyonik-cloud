/** Entegrasyonlar — sayfa hükmü (K51). Saf: girdi okunan özetler, çıktı `PageVerdict`. */
import type { RouteLocationRaw } from 'vue-router'
import type { ApiHealthItem, ApiHealthResponse, ResilienceResponse } from '@bo/api/contract'
import { buildVerdict, unreadable, type AttentionItem, type PageVerdict, type SuggestedAction } from '@bo/utils/verdict'
import { CHANNEL } from '@bo/utils/labels'
import { formatCount, formatPercent } from '@bo/utils/units'

/** Hata oranı bu değerde ya da üstündeyse kırmızı (API sağlığı tablosundaki "tehlike" eşiğiyle aynı). */
export const ERROR_RATE_ERROR = 0.05
/** Bu değerde ya da üstündeyse sarı (tablodaki "uyarı" eşiğiyle aynı). */
export const ERROR_RATE_WARN = 0.01
/** Oran yorumu için asgari çağrı sayısı; altındaki örneklem gürültüdür, uyarı üretmez. */
export const MIN_CALLS = 20
/** p95 gecikme (kova üst sınırı) bu değeri aşarsa sarı. */
export const P95_WARN_MS = 5000

export type IntegrationsTab = 'saglik' | 'dayaniklilik'
/** Aynı sayfada sekme — göreli konum. */
export const integrationsTab = (tab: IntegrationsTab): RouteLocationRaw => ({ query: tab === 'saglik' ? {} : { sekme: tab } })
const LOGS: RouteLocationRaw = { path: '/loglar', query: { category: 'integration', level: 'fatal,error' } }

export interface IntegrationsVerdictInput {
  health: ApiHealthResponse | null
  resilience: ResilienceResponse | null
  failed: { health: boolean; resilience: boolean }
  retry: () => void
}

const name = (code: string) => CHANNEL[code] ?? code
const list = (codes: string[]) => codes.map(name).join(', ')
/** "N11 %9,8, Trendyol %2,7 +2 kanal" — en kötüden başlar, en çok 2 kanal sayar (başlık tek satıra yakın kalsın). */
const rates = (xs: ApiHealthItem[]) => {
  const s = [...xs].sort((a, b) => (b.errorRate ?? 0) - (a.errorRate ?? 0))
  return s.slice(0, 2).map((x) => `${name(x.integrationCode)} ${formatPercent(x.errorRate)}`).join(', ') + (s.length > 2 ? ` +${s.length - 2} kanal` : '')
}

export function integrationsVerdict(i: IntegrationsVerdictInput): PageVerdict {
  const attention: Array<AttentionItem | null> = []
  const actions: SuggestedAction[] = []

  const items = (i.health?.items ?? []).filter((x) => x.total >= MIN_CALLS)
  const high = items.filter((x) => (x.errorRate ?? 0) >= ERROR_RATE_ERROR)
  const elevated = items.filter((x) => (x.errorRate ?? 0) >= ERROR_RATE_WARN && (x.errorRate ?? 0) < ERROR_RATE_ERROR)
  const slow = items.filter((x) => x.p95Ms === null || x.p95Ms > P95_WARN_MS)

  const rows = i.resilience?.items ?? []
  const worst = (pick: (c: ResilienceResponse['items'][number]['pods'][number]) => number) =>
    rows.map((r) => ({ code: r.integrationCode, n: Math.max(0, ...r.pods.map(pick)) })).filter((x) => x.n > 0)
  const open = worst((c) => c.circuits.open)
  const limited = worst((c) => c.rate.limited)
  const intakeOff = rows.filter((r) => r.pods.some((c) => c.intake === 'off')).map((r) => r.integrationCode)
  const engineOff = (i.resilience?.pods ?? []).some((p) => p.engineIntake === 'off')
  const draining = rows.filter((r) => r.pods.some((c) => c.intake === 'drain')).map((r) => r.integrationCode)
  const drift = rows.filter((r) => new Set(r.pods.map((c) => c.intake)).size > 1).map((r) => r.integrationCode)

  if (high.length)
    attention.push({
      id: 'error-rate-high',
      tone: 'error',
      title: `API hata oranı %${Math.round(ERROR_RATE_ERROR * 100)} üzerinde: ${rates(high)}`,
      impact: 'Dış servis çağrıları başarısız oluyor; bu kanallarda sipariş ve katalog eşitlemesi aksıyor.',
      advice: 'Hata kodlarına bakın: RATE_LIMITED geçici, AUTH ise müşteri anahtarının yenilenmesi gerekir.',
      to: integrationsTab('saglik'),
      cta: 'Hata kodlarını aç',
    })
  if (open.length)
    attention.push({
      id: 'circuit-open',
      tone: 'error',
      title: `${list(open.map((x) => x.code))} için devre kesici açık — çağrılar durduruldu`,
      impact: `En çok ${formatCount(Math.max(...open.map((x) => x.n)))} devre açık; bu kanala giden çağrılar durduruldu.`,
      advice: 'Kesici kendiliğinden yarı açığa geçer; nedeni entegrasyon loglarından kontrol edin.',
      to: integrationsTab('dayaniklilik'),
      cta: 'Devre kesicileri aç',
    })
  if (intakeOff.length || engineOff)
    attention.push({
      id: 'intake-off',
      tone: 'error',
      title: intakeOff.length ? `${list(intakeOff)} için alım kapalı — yeni iş alınmıyor` : 'Motor alımı kapalı — yeni iş alınmıyor',
      impact: 'Yeni iş alınmıyor; kanaldan gelen siparişler ve katalog işleri birikir.',
      advice: 'Alım bilinçli kapatılmadıysa ayarı ve podların durumunu kontrol edin.',
      to: integrationsTab('dayaniklilik'),
      cta: 'Alım kipini aç',
    })
  if (elevated.length)
    attention.push({
      id: 'error-rate-warn',
      tone: 'warning',
      title: `API hata oranı yükseldi: ${rates(elevated)}`,
      impact: 'Eşik (%1) aşıldı ama henüz kritik değil.',
      advice: 'Artıyorsa hata kodlarını ve etkilenen müşteri sayısını kontrol edin.',
      to: integrationsTab('saglik'),
      cta: 'Hata kodlarını aç',
    })
  if (slow.length)
    attention.push({
      id: 'latency',
      tone: 'warning',
      title: `${list(slow.map((x) => x.integrationCode))} için yanıt süresi uzadı (p95 ${slow.some((x) => x.p95Ms === null) ? '30 sn üzerinde' : `${P95_WARN_MS / 1000} sn üzerinde`})`,
      impact: 'Dış servis yavaş yanıtlıyor; zaman aşımı riski var.',
      advice: 'Zaman aşımı hatalarının artıp artmadığını kontrol edin.',
      to: integrationsTab('saglik'),
      cta: 'Gecikmeleri aç',
    })
  if (limited.length)
    attention.push({
      id: 'rate-limited',
      tone: 'warning',
      title: `${list(limited.map((x) => x.code))} için hız bütçesi tükendi; en çok ${formatCount(Math.max(...limited.map((x) => x.n)))} müşteri yavaşlatıldı`,
      impact: 'Yavaşlatma bir korumadır, işlem kaybı olmaz; sürerse eşitleme gecikir.',
      advice: 'Hız bütçesinin müşteri başına dağılımını kontrol edin.',
      to: integrationsTab('dayaniklilik'),
      cta: 'Hız bütçesini aç',
    })
  if (drift.length || draining.length)
    attention.push({
      id: 'intake-drift',
      tone: 'warning',
      title: drift.length ? `${list(drift)} için podların alım kipleri birbirinden farklı` : `${list(draining)} için alım boşaltılıyor`,
      impact: drift.length ? 'Pod\'lar farklı davranıyor; bazı işler alınmıyor olabilir.' : 'Yeni iş alınmıyor; boşaltma bitince kip değişir.',
      advice: drift.length ? 'Bir pod boşaltılıyor ya da kapatılmış olabilir; ayarın tüm podlara yayıldığını kontrol edin.' : 'Boşaltmanın bitmesini bekleyin; uzarsa pod durumunu kontrol edin.',
      to: integrationsTab('dayaniklilik'),
      cta: 'Alım kipini aç',
    })

  if (i.failed.health) attention.push(unreadable('health', 'API sağlığı', i.retry))
  if (i.failed.resilience) attention.push(unreadable('resilience', 'Dayanıklılık durumu', i.retry))

  // Önem sırası: kırmızı kaynaklar önce; ilki "Önerilen ilk adım" kartı olur.
  if (open.length) actions.push({ id: 'resilience', label: 'Devre kesicileri pod bazında inceleyin', detail: 'Hangi podda, ne zaman açıldı.', cta: 'Devre kesicileri aç', icon: 'mdi-shield-half-full', to: integrationsTab('dayaniklilik') })
  if (high.length || elevated.length || slow.length) actions.push({ id: 'health', label: 'Hata kodu dağılımını inceleyin', detail: 'Kanal bazında hata kodu, yanıt süresi ve etkilenen müşteri sayısı.', cta: 'API sağlığını aç', icon: 'mdi-heart-pulse', to: integrationsTab('saglik') })
  if ((intakeOff.length || engineOff || drift.length || draining.length || limited.length) && !open.length) actions.push({ id: 'resilience', label: 'Pod bazında dayanıklılığı karşılaştırın', detail: 'Hız bütçesi ve alım kipi pod başına.', cta: 'Dayanıklılığı aç', icon: 'mdi-shield-half-full', to: integrationsTab('dayaniklilik') })
  if (high.length || elevated.length || slow.length || open.length) actions.push({ id: 'logs', label: 'Entegrasyon hatalarını loglarda açın', icon: 'mdi-pulse', to: LOGS })

  const unknown = i.failed.health && i.failed.resilience
  return buildVerdict({
    attention,
    actions,
    checks: ['API hata oranı', 'Yanıt süresi', 'Devre kesiciler', 'Hız bütçesi', 'Alım kipi'],
    okTitle: 'Entegrasyonlarda müdahale gereken bir şey yok',
    calm: { summary: 'Tüm entegrasyonlarda hata oranı eşiğin altında; devre kesiciler kapalı, hız bütçesi yeterli ve alım açık.' },
    busy: ({ errors, total, top }) =>
      unknown
        ? 'Entegrasyon durumu okunamadı — hüküm verilemiyor; bağlantıyı denetleyip tekrar deneyin.'
        : errors
        ? `Entegrasyonlarda şimdi müdahale gereken ${errors === 1 ? 'bir konu' : `${errors} konu`} var: ${top.title}.`
        : `Entegrasyonlar çalışıyor ama ${total === 1 ? 'bir konu' : `${total} konu`} izlenmeli; en önemlisi: ${top.title}.`,
  })
}

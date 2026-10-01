/**
 * Müşteri listesi — sayfa hükmü (K51). Saf: girdi `getClients` satırları, çıktı `PageVerdict`.
 * Liste ucu yalnız ACTIVE/PASSIVE, son sipariş eşitleme ve kanalları taşır; kurulum/silme başarısızlığı ve abonelik
 * durumu satırda YOK (BE-01 `ops` gelince eklenir) — bu yüzden bu hüküm yalnız eşitleme, kanal ve pasif hesaplara bakar.
 */
import type { RouteLocationRaw } from 'vue-router'
import type { ClientDto } from '@bo/api/contract'
import { buildVerdict, unreadable, type AttentionItem, type PageVerdict, type SuggestedAction } from '@bo/utils/verdict'
import { formatCount } from '@bo/utils/units'

/** Aktif ve kanallı hesapta bu süreyi aşan eşitleme boşluğu "eski" sayılır (satırdaki uyarıyla aynı eşik). */
export const STALE_SYNC_MS = 24 * 3_600_000
/** Eşitlemesi eski hesapların kanallı aktif hesaplara oranı bunu aşarsa sorun müşteriye değil platforma yakındır → kırmızı. */
export const STALE_SHARE_ERROR = 0.5

export type TenantSegment = 'all' | 'ACTIVE' | 'PASSIVE' | 'stale' | 'nochannel'
/** URL (`?durum=`) ↔ segment. */
export const SEGMENT_SLUG: Record<TenantSegment, string | undefined> = { all: undefined, ACTIVE: 'aktif', PASSIVE: 'pasif', stale: 'eski', nochannel: 'kanalsiz' }
export const SLUG_SEGMENT: Record<string, TenantSegment> = { aktif: 'ACTIVE', pasif: 'PASSIVE', eski: 'stale', kanalsiz: 'nochannel' }

export const hasChannels = (c: ClientDto) => !!c.integrations?.length
/** Aktif + kanallı hesapta son başarılı sipariş eşitlemesi yok ya da 24 saatten eski. */
export const isStaleSync = (c: ClientDto, now = Date.now()) =>
  c.status === 'ACTIVE' && hasChannels(c) && (!c.lastSuccessfulOrderSync || now - Date.parse(c.lastSuccessfulOrderSync) > STALE_SYNC_MS)
export const isNoChannel = (c: ClientDto) => c.status === 'ACTIVE' && !hasChannels(c)

export function inSegment(c: ClientDto, seg: TenantSegment, now = Date.now()): boolean {
  if (seg === 'all') return true
  if (seg === 'stale') return isStaleSync(c, now)
  if (seg === 'nochannel') return isNoChannel(c)
  return c.status === seg
}

export interface TenantsVerdictInput {
  /** Süzgeçsiz tam liste; okunamadıysa null. */
  clients: ClientDto[] | null
  total: number
  failed: boolean
  stale?: boolean
  retry: () => void
  /** Listeyi bir segmente süzen konum (`?durum=`; arama ve sıra korunur) — maddeler aynı sayfada süzgece bağlanır. */
  segmentTo: (seg: TenantSegment) => RouteLocationRaw
  now?: number
}

export function tenantsVerdict(i: TenantsVerdictInput): PageVerdict {
  const now = i.now ?? Date.now()
  const list = i.clients ?? []
  const attention: Array<AttentionItem | null> = []
  const actions: SuggestedAction[] = []

  const stale = list.filter((c) => isStaleSync(c, now))
  const syncing = list.filter((c) => c.status === 'ACTIVE' && hasChannels(c))
  const widespread = syncing.length > 0 && stale.length / syncing.length > STALE_SHARE_ERROR
  if (stale.length) {
    const oldest = stale.map((c) => c.lastSuccessfulOrderSync).filter((t): t is string => !!t).sort()[0]
    attention.push({
      id: 'stale-sync',
      tone: widespread ? 'error' : 'warning',
      title: `${formatCount(stale.length)} aktif hesapta sipariş eşitlemesi 24 saatten eski`,
      impact: widespread
        ? `Kanallı aktif hesapların %${Math.round((stale.length / syncing.length) * 100)}'inde eşitleme durmuş; müşterilerin siparişleri uygulamaya düşmüyor.`
        : `Kanallı ${formatCount(syncing.length)} aktif hesabın ${formatCount(stale.length)}'inde yeni sipariş görünmüyor olabilir.`,
      advice: widespread ? 'Bu yaygınlık motora ya da pazaryeri bağlantısına işaret eder; önce motoru kontrol edin.' : 'Hesabı açıp kanal durumunu ve sipariş hatalarını kontrol edin.',
      to: i.segmentTo('stale'),
      cta: 'Eşitlemesi eski hesapları aç',
      since: oldest,
    })
  }

  const noChannel = list.filter(isNoChannel)
  if (noChannel.length)
    attention.push({
      id: 'no-channel',
      tone: 'info',
      title: `${formatCount(noChannel.length)} aktif hesapta bağlı kanal yok`,
      impact: 'Bu hesaplarda eşitleme çalışmaz; kurulum tamamlanmamış olabilir.',
      advice: 'Müşterinin kurulumu bırakıp bırakmadığını kontrol edin.',
      to: i.segmentTo('nochannel'),
      cta: 'Kanalsız hesapları aç',
    })

  const passive = list.filter((c) => c.status === 'PASSIVE')
  if (passive.length)
    attention.push({
      id: 'passive',
      tone: 'info',
      title: `${formatCount(passive.length)} hesap pasif`,
      impact: 'Pasif hesaplarda eşitleme ve müşteri girişi kapalıdır; askıda ya da silme bekliyor olabilir.',
      advice: 'Nedenini müşteri detayındaki yaşam döngüsünden kontrol edin.',
      to: i.segmentTo('PASSIVE'),
      cta: 'Pasif hesapları aç',
    })

  if (i.failed) attention.push(unreadable('clients', 'Müşteri listesi', i.retry))
  else if (i.stale) attention.push(unreadable('clients', 'Müşteri listesi', i.retry, true))

  // İlk eylem en önemlisi: yaygın sorunda motor, aksi halde eski eşitlemeli hesaplar.
  if (widespread) actions.push({ id: 'engine', label: 'Motor ve kuyrukları aç', detail: 'Kuyruk, takılı kira ve zamanlanmış görev durumu.', icon: 'mdi-engine-outline', to: '/motor' })
  if (stale.length) {
    actions.push({ id: 'stale-list', label: 'Eşitlemesi eski hesapları listele', detail: 'Her hesabın kanal durumunu müşteri detayından kontrol edin.', icon: 'mdi-sync-alert', to: i.segmentTo('stale') })
    actions.push({ id: 'order-logs', label: 'Sipariş hatalarını loglarda aç', detail: 'Aynı süzgeçle: sipariş kategorisi, hata ve kritik.', icon: 'mdi-pulse', to: { path: '/loglar', query: { category: 'order', level: 'fatal,error' } } })
  }

  const active = list.filter((c) => c.status === 'ACTIVE').length
  const unknown = i.failed && !i.clients
  return buildVerdict({
    attention,
    actions,
    calm: unknown
      ? { summary: 'Müşteri listesi okunamadı — hüküm verilemiyor; bağlantıyı denetleyip tekrar deneyin.', tone: 'neutral' }
      : { summary: `${formatCount(active)} aktif hesabın hepsinde sipariş eşitlemesi güncel${i.total > list.length ? ` (ilk ${formatCount(list.length)} hesap)` : ''}.` },
    note: `${formatCount(list.length)} hesaba bakıldı (eşik 24 saat); kurulum, silme ve abonelik durumu müşteri detayında.`,
    checks: ['Son sipariş eşitleme (24 sa)', 'Bağlı kanallar', 'Aktif / pasif durumu'],
    okTitle: 'Müşteri hesaplarında dikkat isteyen bir şey yok',
    busy: ({ errors, top }) =>
      unknown
        ? 'Müşteri listesi okunamadı — hüküm verilemiyor; bağlantıyı denetleyip tekrar deneyin.'
        : errors
          ? `Şimdi müdahale gerekiyor: ${top.title}.`
          : `İzlenmesi gereken bir durum var: ${top.title}.`,
  })
}

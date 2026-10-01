/** Bildirimler ve duyurular — sayfa hükümleri (K51). Saf: girdi okunan veriler, çıktı `PageVerdict`. */
import type { AlertRow, Announcement, DeliveryRow, DeliveryStats, NotificationCatalogItem } from '@bo/api/contract'
import { buildVerdict, unreadable, type AttentionItem, type PageVerdict, type SuggestedAction } from '@bo/utils/verdict'
import { formatCount } from '@bo/utils/units'
import { ALERT_RULE } from '@bo/utils/labels'

/** Susturma bu süre içinde biterse uyarı yeniden bildirim üretecek demektir (sözleşmede eşik yok; 1 saat önceden haber). */
export const MUTE_EXPIRY_SOON_MS = 60 * 60_000
/** Kalıcı hatalı teslim sayısı bu eşikte kırmızı (R7 kuralıyla aynı: son saatte >=10). */
export const DEAD_ERROR = 10
/** En eski bekleyen teslim bu süreyi (sn) aşarsa gönderici yetişmiyor demektir (panelin mevcut eşiği). */
export const PENDING_WARN_SEC = 600
/** Yayına alınan duyurunun dağıtımı bu süre sonra hâlâ bitmediyse takılmış sayılır. */
export const FANOUT_STALL_MS = 15 * 60_000
/** E-posta sağlayıcı sınıf kodları: ayar kapalı/hatalı ya da SMTP erişim hatası (ham SMTP metni değil). */
export const EMAIL_PROVIDER_CODES = /^(disabled|misconfigured|SMTP_.*)$/

/**
 * Susturma bitişi: aynı gün "bitiş 05:42", değilse "bitiş 3 Eki 05:42". Ek almayan kalıp: saate ses uyumlu ek
 * ("'ye/'a/'e dek") okunuşa göre değişir ve sabit ek yanlış düşer ("14:30'ye").
 */
export function muteUntilText(iso: string, now = Date.now()): string {
  const d = new Date(iso)
  const clock = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(d)
  if (d.toDateString() === new Date(now).toDateString()) return `bitiş ${clock}`
  const day = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' }).format(d)
  return `bitiş ${day} ${clock}`
}

const isMuted = (a: AlertRow, now: number) => !!a.mutedUntil && Date.parse(a.mutedUntil) > now
const plural = (n: number, noun: string) => `${formatCount(n)} ${noun}`

// ------------------------------------------------------------------ uyarılar
/** Uyarı kuralına göre ilgili ekran (müdahale yeri). */
export const ALERT_RULE_TARGET: Record<string, { label: string; to: { path: string; query?: Record<string, string> } }> = {
  R1: { label: 'Entegrasyonları aç', to: { path: '/entegrasyonlar' } },
  R2: { label: 'Entegrasyonları aç', to: { path: '/entegrasyonlar' } },
  R4: { label: 'Motoru aç', to: { path: '/motor' } },
  R7: { label: 'Kalıcı hatalı teslimleri aç', to: { path: '/bildirimler/teslimler', query: { durum: 'dead' } } },
}

export interface AlertsVerdictInput {
  /** Etkin (firing) uyarılar; süzgeçten bağımsız okunur. */
  firing: AlertRow[] | null
  failed: boolean
  stale: boolean
  now: number
  retry: () => void
  /** Susturma diyaloğunu aç (guarded). */
  mute: (a: AlertRow) => void
}

export function alertsVerdict(i: AlertsVerdictInput): PageVerdict {
  const attention: Array<AttentionItem | null> = []
  const actions: SuggestedAction[] = []
  const firing = i.firing ?? []
  // Gölge kurallar bildirim göndermez → müdahale konusu değil, bilgi.
  const live = firing.filter((a) => !a.shadow)
  const shadow = firing.filter((a) => a.shadow)
  const loud = live.filter((a) => !isMuted(a, i.now))
  const critical = loud.filter((a) => a.level === 'critical')
  const warn = loud.filter((a) => a.level === 'warning')
  const expiring = live.filter((a) => isMuted(a, i.now) && Date.parse(a.mutedUntil!) - i.now <= MUTE_EXPIRY_SOON_MS)

  if (critical.length)
    attention.push({
      id: 'critical',
      tone: 'error',
      title: `${plural(critical.length, 'kritik uyarı')} etkin`,
      impact: `${[...new Set(critical.map((a) => ALERT_RULE[a.ruleId]?.label ?? a.ruleId))].slice(0, 2).join(', ')} eşiği aştı; e-posta ve müşteri bildirimi gidiyor.`,
      advice: 'Nedeni ilgili ekranda kontrol edin; çözülmeyecekse geçici olarak susturun.',
      since: critical.map((a) => a.firstFiredAt).sort()[0],
      to: { query: { durum: 'firing', onem: 'critical' } },
      cta: 'Kritik uyarıları göster',
    })
  if (warn.length)
    attention.push({
      id: 'warning',
      tone: 'warning',
      title: `${plural(warn.length, 'uyarı')} etkin`,
      impact: 'Henüz kritik düzeyde değil; bildirim gidiyor.',
      advice: 'Eşiğe yaklaşan kuralları izleyin; kötüleşirse ilgili ekranı kontrol edin.',
      since: warn.map((a) => a.firstFiredAt).sort()[0],
      to: { query: { durum: 'firing', onem: 'warning' } },
      cta: 'Uyarıları göster',
    })
  if (expiring.length) {
    const first = expiring.map((a) => Date.parse(a.mutedUntil!)).sort((a, b) => a - b)[0]
    attention.push({
      id: 'mute-expiring',
      tone: 'warning',
      title: `${plural(expiring.length, 'susturma')} yakında bitiyor (${muteUntilText(new Date(first).toISOString(), i.now)})`,
      impact: 'Sorun sürüyorsa süre bitince yeniden bildirim gider.',
      advice: 'Nedeni giderin ya da susturmayı yenilemeyi değerlendirin.',
      to: { query: { durum: 'firing' } },
      cta: 'Etkin uyarıları aç',
    })
  }
  if (shadow.length)
    attention.push({
      id: 'shadow',
      tone: 'info',
      title: `${plural(shadow.length, 'gölge kural')} kayıt tutuyor`,
      impact: 'Gölge modda e-posta ve müşteri bildirimi gitmez; yalnız kayıt tutulur.',
      advice: 'Eşikler doğrulandıktan sonra kuralı bildirimli moda alın.',
      to: { query: { durum: 'firing' } },
      cta: 'Etkin uyarıları aç',
    })
  if (i.failed) attention.push(unreadable('alerts', 'Uyarı listesi', i.retry))
  else if (i.stale) attention.push(unreadable('alerts', 'Uyarı listesi', i.retry, true))

  // Eylem: önce nedeni gideceği ekran (en çok iki hedef), sonra güvenli geçici çözüm = susturma.
  const seen = new Set<string>()
  for (const a of [...critical, ...warn]) {
    const t = ALERT_RULE_TARGET[a.ruleId]
    if (!t || seen.has(t.label) || seen.size >= 2) continue
    seen.add(t.label)
    actions.push({ id: `goto-${a.ruleId}`, label: t.label, detail: `${a.ruleId} · ${ALERT_RULE[a.ruleId]?.label ?? 'ilgili kural'} için kaynağa bakın.`, icon: 'mdi-arrow-right', to: t.to })
  }
  const top = critical[0] ?? warn[0]
  if (top)
    actions.push({
      id: 'mute-top',
      label: 'En acil uyarıyı sustur',
      detail: `${ALERT_RULE[top.ruleId]?.label ?? top.ruleId} · ${top.scopeKey} — süre sonunda yeniden bildirim gider; kayıt sürer.`,
      icon: 'mdi-bell-off-outline',
      guarded: true,
      onSelect: () => i.mute(top),
    })

  return buildVerdict({
    attention,
    actions,
    calm: i.failed
      ? { summary: 'Uyarı durumu okunamadı — hüküm verilemiyor; tekrar deneyin.', tone: 'neutral' }
      : { summary: live.length ? 'Etkin uyarılar susturulmuş; bildirim gitmiyor ama kayıt sürüyor.' : 'Etkin uyarı yok: tüm kurallar eşiklerin altında.' },
    checks: ['Etkin uyarılar', 'Susturmalar', 'Gölge kurallar'],
    busy: ({ errors, total, top: t }) =>
      errors ? `${t.title} — şimdi müdahale gerekiyor.` : `${total === 1 ? 'Bir konu' : `${total} konu`} izlenmeli; en önemlisi: ${t.title}.`,
  })
}

// ------------------------------------------------------------------ teslim günlüğü
export interface DeliveriesVerdictInput {
  stats: DeliveryStats | null
  failed: boolean
  stale: boolean
  /** Yüklü liste satırları (e-posta sağlayıcı sınıf kodları ve örnek teslim için). */
  rows: DeliveryRow[]
  retry: () => void
  retryDelivery: (d: DeliveryRow) => void
}

export function deliveriesVerdict(i: DeliveriesVerdictInput): PageVerdict {
  const attention: Array<AttentionItem | null> = []
  const actions: SuggestedAction[] = []
  const s = i.stats?.windows['24h']?.byStatus
  const dead = s?.dead ?? 0
  const bad = s?.failed ?? 0
  const oldest = i.stats?.oldestPendingAgeSec ?? null

  const providerRows = i.rows.filter((r) => (r.status === 'dead' || r.status === 'failed') && r.lastErrorCode && EMAIL_PROVIDER_CODES.test(r.lastErrorCode))
  if (providerRows.length)
    attention.push({
      id: 'provider',
      tone: 'warning',
      title: 'E-posta sağlayıcıya ulaşılamıyor',
      impact: `${plural(providerRows.length, 'hatalı teslim')} gönderim ayarı ya da sunucu erişimi sınıfında; e-postalar müşteriye ulaşmıyor.`,
      advice: 'E-posta ayarını test e-postasıyla kontrol edin, sonra teslimleri yeniden deneyin.',
      since: providerRows.map((r) => r.createdAt).sort()[0],
      to: { path: '/bildirimler/katalog' },
      cta: 'Test e-postasına git',
    })
  if (dead > 0)
    attention.push({
      id: 'dead',
      tone: dead >= DEAD_ERROR ? 'error' : 'warning',
      title: `${plural(dead, 'teslim')} kalıcı hatalı (son 24 saat)`,
      impact: 'Otomatik deneme bitti; müşteri bu e-postaları almadı ve sistem kendiliğinden denemeyecek.',
      advice: 'Hata sınıf koduna bakın; neden çözüldüyse yeniden deneyin, gereksizse atın.',
      to: { query: { durum: 'dead' } },
      cta: 'Kalıcı hataları aç',
    })
  if (bad > 0)
    attention.push({
      id: 'failed',
      tone: 'warning',
      title: `${plural(bad, 'teslim')} başarısız, yeniden deneniyor`,
      impact: 'Sistem kendiliğinden yeniden dener; tekrarlarsa kalıcı hataya dönüşür.',
      advice: 'Aynı hata sınıfı tekrarlıyorsa kaynağı kontrol edin.',
      to: { query: { durum: 'failed' } },
      cta: 'Başarısızları aç',
    })
  if (oldest !== null && oldest > PENDING_WARN_SEC)
    attention.push({
      id: 'pending-old',
      tone: 'warning',
      title: `En eski bekleyen teslimin vadesi ${Math.round(oldest / 60)} dk önce geldi`,
      impact: 'Bildirimler gecikiyor; gönderici yetişmiyor olabilir.',
      advice: 'Motor ve kuyruk durumunu kontrol edin.',
      to: { path: '/motor' },
      cta: 'Motoru aç',
    })
  if (i.failed) attention.push(unreadable('stats', 'Teslim istatistikleri', i.retry))
  else if (i.stale) attention.push(unreadable('stats', 'Teslim istatistikleri', i.retry, true))

  const sample = i.rows.find((r) => r.status === 'dead') ?? i.rows.find((r) => r.status === 'failed') ?? null
  const badStatus = dead > 0 ? 'dead' : 'failed'
  if (providerRows.length) actions.push({ id: 'test-mail', label: 'E-posta ayarını test edin', detail: 'Kendi adresinize tek bir [TEST] iletisi gider.', icon: 'mdi-email-check-outline', to: '/bildirimler/katalog' })
  if (dead > 0 || bad > 0) actions.push({ id: 'list-bad', label: dead > 0 ? 'Kalıcı hatalıları listele' : 'Başarısız teslimleri listele', detail: 'Hata sınıf koduna göre nedeni bulun.', icon: 'mdi-filter-outline', to: { query: { durum: badStatus } } })
  if (sample) actions.push({ id: 'retry', label: 'Listedeki ilk hatayı yeniden dene', detail: `${sample.code}${sample.tid ? ` · müşteri #${sample.tid}` : ''} — hemen kuyruğa girer, e-posta gerçekten gidebilir.`, icon: 'mdi-replay', guarded: true, onSelect: () => i.retryDelivery(sample) })
  // Yıkıcı "at" eylemi önerilmez: yalnız listeye götürür, orada DangerActionDialog ile yapılır.
  if (dead > 0) actions.push({ id: 'discard', label: 'Gereksiz teslimleri atmak için listeyi açın', detail: 'Atılan teslim bir daha denenmez; geri alınamaz.', icon: 'mdi-delete-outline', danger: true, to: { query: { durum: 'dead' } } })

  return buildVerdict({
    attention,
    actions,
    calm: i.failed ? { summary: 'Teslim durumu okunamadı — hüküm verilemiyor; tekrar deneyin.', tone: 'neutral' } : { summary: `Son 24 saatte ${formatCount(s?.sent ?? 0)} e-posta gönderildi; kalıcı hata ve geciken teslim yok.` },
    checks: ['E-posta teslimleri (24 saat)', 'Bekleyen teslim yaşı', 'Sağlayıcı hata sınıfları'],
    busy: ({ errors, total, top }) =>
      errors ? `Teslimlerde şimdi müdahale gereken ${errors === 1 ? 'bir konu' : `${errors} konu`} var: ${top.title}.` : `Teslimler akıyor ama ${total === 1 ? 'bir konu' : `${total} konu`} izlenmeli; en önemlisi: ${top.title}.`,
  })
}

// ------------------------------------------------------------------ duyurular
export interface AnnouncementsVerdictInput {
  items: Announcement[] | null
  failed: boolean
  stale: boolean
  now: number
  retry: () => void
}

export function announcementsVerdict(i: AnnouncementsVerdictInput): PageVerdict {
  const attention: Array<AttentionItem | null> = []
  const items = i.items ?? []
  const active = items.filter((a) => a.status === 'active')
  const scheduled = items.filter((a) => a.status === 'scheduled')
  const late = scheduled.filter((a) => Date.parse(a.startsAt) < i.now)
  const stalled = active.filter((a) => a.channels.inApp && a.fanout && !a.fanout.done && i.now - Date.parse(a.startsAt) > FANOUT_STALL_MS)

  if (late.length)
    attention.push({
      id: 'late',
      tone: 'warning',
      title: `${plural(late.length, late.length === 1 ? 'planlı duyurunun' : 'planlı duyurunun')} başlangıç zamanı geçti`,
      impact: 'Duyuru yayına geçmedi; müşteriler bakım ya da yenilik bilgisini göremiyor.',
      advice: 'Başlangıç tarihini kontrol edip düzeltin ya da duyuruyu iptal edin.',
      since: late.map((a) => a.startsAt).sort()[0],
      to: `/sistem/duyurular/${late[0].id}`,
      cta: 'Duyuruyu aç',
    })
  if (stalled.length)
    attention.push({
      id: 'stalled',
      tone: 'warning',
      title: `${plural(stalled.length, 'duyurunun')} dağıtımı tamamlanmadı`,
      impact: 'Uygulama içi bildirimler tüm hedef müşterilere ulaşmamış olabilir.',
      advice: 'Duyuru ayrıntısında dağıtım durumunu kontrol edin.',
      since: stalled.map((a) => a.startsAt).sort()[0],
      to: `/sistem/duyurular/${stalled[0].id}`,
      cta: 'Duyuruyu aç',
    })
  if (active.length)
    attention.push({ id: 'live', tone: 'info', title: `${plural(active.length, 'duyuru')} yayında`, impact: active.slice(0, 2).map((a) => a.title.tr).join(' · '), advice: 'Bitiş zamanında kendiliğinden kapanır; erken kapatmak için duyuruyu iptal edin.', to: { query: { durum: 'active' } }, cta: 'Yayındakileri aç' })
  if (scheduled.length)
    attention.push({ id: 'scheduled', tone: 'info', title: `${plural(scheduled.length, 'duyuru')} planlı`, impact: 'Başlangıç zamanında yayına geçer.', advice: 'Metin ve hedefi yayından önce kontrol edin.', to: { query: { durum: 'scheduled' } }, cta: 'Planlıları aç' })
  if (i.failed) attention.push(unreadable('announcements', 'Duyuru listesi', i.retry))
  else if (i.stale) attention.push(unreadable('announcements', 'Duyuru listesi', i.retry, true))

  const actions: SuggestedAction[] = [{ id: 'new', label: 'Yeni duyuru', detail: 'Bakım, olay ya da yenilik duyurusu oluşturun; yayınlamadan önce önizlenir.', icon: 'mdi-plus', to: '/sistem/duyurular/yeni' }]

  return buildVerdict({
    attention,
    actions,
    calm: i.failed
      ? { summary: 'Duyuru durumu okunamadı — hüküm verilemiyor; tekrar deneyin.', tone: 'neutral' }
      : {
          summary:
            active.length || scheduled.length
              ? `${active.length ? `Şu an ${plural(active.length, 'duyuru')} yayında` : 'Şu an yayında duyuru yok'}${scheduled.length ? `; ${plural(scheduled.length, 'duyuru')} planlı` : ''}.`
              : 'Yayında ya da planlı duyuru yok.',
        },
    checks: ['Yayındaki duyurular', 'Planlı duyurular', 'Dağıtım durumu'],
    busy: ({ total, top }) => `Duyurularda ${total === 1 ? 'bir konu' : `${total} konu`} izlenmeli: ${top.title}.`,
  })
}

/** Duyuru detayı için hafif durum notu (null = not gerekmez). */
export function announcementNote(a: Announcement, now: number): { tone: 'warning' | 'info'; title: string; text: string } | null {
  if (a.status === 'scheduled' && Date.parse(a.startsAt) < now) return { tone: 'warning', title: 'Başlangıç zamanı geçti', text: 'Planlı duyuru yayına geçmedi; tarihi düzeltin ya da duyuruyu iptal edin.' }
  if (a.status === 'active' && a.fanout && !a.fanout.done && now - Date.parse(a.startsAt) > FANOUT_STALL_MS) return { tone: 'warning', title: 'Dağıtım tamamlanmadı', text: 'Bildirimler tüm hedef müşterilere ulaşmamış olabilir; birkaç dakika sonra yenileyin.' }
  if (a.status === 'active') return { tone: 'info', title: 'Yayında', text: 'Duyuru müşterilere görünüyor; bitiş zamanında kendiliğinden kapanır.' }
  return null
}

// ------------------------------------------------------------------ olay kataloğu
export interface CatalogVerdictInput {
  items: NotificationCatalogItem[] | null
  failed: boolean
  stale: boolean
  /** Test e-postası son denemede NOTIFY_EMAIL_UNAVAILABLE ile reddedildi. */
  emailUnavailable: boolean
  retry: () => void
  testMail: () => void
}

export function catalogVerdict(i: CatalogVerdictInput): PageVerdict {
  const attention: Array<AttentionItem | null> = []
  const items = i.items ?? []
  const mandatoryOff = items.filter((c) => c.mandatory && c.defaultChannels.email === 'off')

  if (i.emailUnavailable)
    attention.push({
      id: 'email-unavailable',
      tone: 'warning',
      title: 'E-posta gönderimi kapalı ya da doğrulanmadı',
      impact: 'Test e-postası reddedildi; kanal açılana kadar hiçbir e-posta gitmez.',
      advice: 'Sunucu ayarını kontrol edip test e-postasını yeniden deneyin; bekleyen teslimleri günlükte izleyin.',
      to: { path: '/bildirimler/teslimler', query: { durum: 'failed' } },
      cta: 'Teslimleri aç',
    })
  if (mandatoryOff.length)
    attention.push({
      id: 'mandatory-off',
      tone: 'warning',
      title: `${plural(mandatoryOff.length, 'zorunlu bildirimin')} e-posta kanalı kapalı`,
      impact: `${mandatoryOff.slice(0, 2).map((c) => c.code).join(', ')} yalnızca uygulama içinde görünür; müşteri girmezse haberi olmaz.`,
      advice: 'Varsayılan e-posta kanalının kapalı olması bilinçliyse bir işlem gerekmez; değilse kataloğu kontrol edin.',
      to: { query: { ara: mandatoryOff[0].code } },
      cta: 'Kodu listede aç',
    })
  if (i.failed) attention.push(unreadable('catalog', 'Olay kataloğu', i.retry))
  else if (i.stale) attention.push(unreadable('catalog', 'Olay kataloğu', i.retry, true))

  const actions: SuggestedAction[] = [
    { id: 'test-mail', label: 'Test e-postası gönder', detail: 'Yalnız kendi adresinize tek bir [TEST] iletisi gider; e-posta ayarını doğrular.', icon: 'mdi-email-check-outline', guarded: true, onSelect: i.testMail },
    { id: 'deliveries', label: 'Teslim günlüğünü aç', detail: 'Gönderilen ve hatalı e-postaları görün.', icon: 'mdi-email-fast-outline', to: '/bildirimler/teslimler' },
  ]

  return buildVerdict({
    attention,
    actions,
    checks: ['Bildirim kodları', 'E-posta kanalı varsayılanları', 'Son test e-postası'],
    calm: i.failed ? { summary: 'Olay kataloğu okunamadı — hüküm verilemiyor; tekrar deneyin.', tone: 'neutral' } : { summary: `Katalogda ${plural(items.length, 'bildirim kodu')} tanımlı; e-posta kanalı için bilinen bir sorun yok.` },
    busy: ({ total, top }) => `Katalogda ${total === 1 ? 'bir konu' : `${total} konu`} izlenmeli: ${top.title}.`,
  })
}

// ------------------------------------------------------------------ müşteri bildirim geçmişi
export interface TenantHistoryVerdictInput {
  tid: number | null
  rows: Array<{ id: string; emailStatus: Partial<Record<string, number>> }> | null
  failed: boolean
  retry: () => void
}

export function tenantHistoryVerdict(i: TenantHistoryVerdictInput): PageVerdict {
  if (!i.tid)
    return buildVerdict({
      attention: [{ id: 'pick', tone: 'info', title: 'Müşteri seçilmedi', impact: 'Bildirim geçmişi müşteri başına gösterilir.', advice: 'Müşteri numarasını girin ya da listeden bir müşteri seçin.', to: '/musteriler', cta: 'Müşteri listesini aç' }],
      calm: { summary: 'Müşteri seçin — bildirim geçmişi seçilen müşteri için gösterilir.', tone: 'info' },
    })
  const attention: Array<AttentionItem | null> = []
  const rows = i.rows ?? []
  const withBad = rows.filter((r) => (r.emailStatus.failed ?? 0) + (r.emailStatus.dead ?? 0) > 0)
  const bad = withBad.reduce((n, r) => n + (r.emailStatus.failed ?? 0) + (r.emailStatus.dead ?? 0), 0)
  if (bad > 0)
    attention.push({
      id: 'delivery-failures',
      tone: 'warning',
      title: `${plural(bad, 'e-posta teslimi')} başarısız (${plural(withBad.length, 'olayda')})`,
      impact: 'Müşteri bu bildirimleri e-postayla almamış olabilir; uygulama içi kopyaları ulaşmıştır.',
      advice: 'Teslim günlüğünde hata sınıfını kontrol edip gerekirse yeniden deneyin.',
      to: { path: '/bildirimler/teslimler', query: { tid: String(i.tid), durum: 'failed' } },
      cta: 'Teslimleri aç',
    })
  if (i.failed) attention.push(unreadable('history', 'Bildirim geçmişi', i.retry))
  return buildVerdict({
    attention,
    checks: ['Son 30 günün bildirim olayları', 'E-posta teslim durumları'],
    actions: [{ id: 'tenant', label: `Müşteri #${i.tid} detayını aç`, icon: 'mdi-account-details-outline', to: `/musteriler/${i.tid}` }],
    calm: i.failed ? { summary: 'Bildirim geçmişi okunamadı — hüküm verilemiyor; tekrar deneyin.', tone: 'neutral' } : { summary: `Müşteri #${i.tid} için son kayıtlarda başarısız e-posta teslimi yok.` },
    busy: ({ top }) => `Müşteri #${i.tid}: ${top.title}.`,
  })
}

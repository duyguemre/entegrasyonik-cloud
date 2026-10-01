/** Platform ayarları — sayfa hükmü (K51). Saf: girdi `usePlatformConfig` özeti, çıktı `PageVerdict`. */
import type { RouteLocationRaw } from 'vue-router'
import type { ConfigRevision } from '@bo/api/contract'
import { buildVerdict, unreadable, type AttentionItem, type PageVerdict, type SuggestedAction } from '@bo/utils/verdict'
import { formatCount, formatDuration } from '@bo/utils/units'

/** Bakım modu bu süreyi aşarsa kırmızı (planlı bakım penceresi ~2 saat; öncesi sarı). */
export const MAINTENANCE_LONG_MS = 2 * 3_600_000
const iso = (ms: number) => new Date(ms).toISOString()
const MAINT_KEY = 'maintenance.enabled'

export interface SettingsVerdictInput {
  /** null: okunamadı. */
  data: { published: number; values: Record<string, { value: unknown }>; history: ConfigRevision[] } | null
  stale?: boolean
  hasDraft: boolean
  /** Önizlemedeki değişen ayar sayısı; önizleme yoksa null. */
  draftCount: number | null
  /** Yayınlanmamış yerel (kaydedilmemiş) değişiklik sayısı. */
  unsavedCount: number
  now: number
  retry: () => void
  /** Aynı sayfadaki bölüm konumları (`#bakim`, `#taslak`, `#gecmis`; sayfa hash'i izleyip odaklar). */
  to: { maintenance: RouteLocationRaw; draft: RouteLocationRaw; history: RouteLocationRaw; settings: RouteLocationRaw }
  /** Bakımı kapatan taslağı kaydet ve yayın diyaloğunu aç (guarded). */
  closeMaintenance: () => void
  publish: () => void
}

/** Bakım modunu en son açan yayının zamanı (ms) ya da bilinmiyor. */
export function maintenanceSince(history: ConfigRevision[]): number | null {
  const times = history
    .filter((r) => r.status === 'published' || r.publishedAt)
    .filter((r) => r.diff?.some((d) => d.key === MAINT_KEY && d.to === true))
    .map((r) => Date.parse(r.publishedAt ?? r.createdAt))
    .filter((t) => Number.isFinite(t))
  return times.length ? Math.max(...times) : null
}

export function settingsVerdict(i: SettingsVerdictInput): PageVerdict {
  const attention: Array<AttentionItem | null> = []
  const actions: SuggestedAction[] = []
  const on = i.data?.values[MAINT_KEY]?.value === true

  if (on) {
    const since = maintenanceSince(i.data!.history)
    const long = since !== null && i.now - since >= MAINTENANCE_LONG_MS
    attention.push({
      id: 'maintenance-on',
      tone: long ? 'error' : 'warning',
      title: since === null ? 'Bakım modu açık — müşteriler veri yazamıyor' : `Bakım modu açık (${formatDuration(i.now - since)}) — müşteriler veri yazamıyor`,
      since: since === null ? undefined : iso(since),
      impact: long ? 'Planlı bakım penceresini aştı; tüm müşteriler yazamıyor.' : 'Tüm müşteriler veri yazamıyor; okuma ve giriş çalışıyor.',
      advice: long ? 'Bakım bittiyse kapatın.' : 'Bakım bitince modu kapatın.',
      cta: 'Bakım modunu aç',
      to: i.to.maintenance,
    })
    actions.push({ id: 'close-maintenance', label: 'Bakım modunu kapat', detail: 'Taslak oluşturur, farkı gösterir; yayın step-up ve gerekçe ister.', icon: 'mdi-wrench-clock', guarded: true, onSelect: i.closeMaintenance })
  }
  if (i.hasDraft) {
    attention.push({
      id: 'draft',
      tone: 'warning',
      title: i.draftCount ? `${formatCount(i.draftCount)} ayar değişikliği yayınlanmadı` : 'Yayınlanmamış taslak var',
      impact: 'Yayınlanana kadar müşteri uygulaması etkilenmez.',
      advice: 'Farkı önizleyip yayınlayın ya da taslağı atın.',
      cta: 'Taslağı aç',
      to: i.to.draft,
    })
    if (i.draftCount !== null) actions.push({ id: 'publish', label: 'Taslağı önizle ve yayınla', detail: 'Fark ve etkilenecek müşteri sayısı gösterilir; step-up ve gerekçe ister.', icon: 'mdi-publish', guarded: true, onSelect: i.publish })
    // Yıkıcı: kartla önerilmez; taslak çubuğundaki "Vazgeç"e götürür.
    actions.push({ id: 'discard', label: 'Taslağı at', detail: 'Yayındaki değerler geçerli kalır.', icon: 'mdi-delete-outline', danger: true, to: i.to.draft })
  } else if (i.unsavedCount > 0) {
    attention.push({
      id: 'unsaved',
      tone: 'info',
      title: `${formatCount(i.unsavedCount)} değişiklik kaydedilmedi`,
      impact: 'Değerler yalnız bu formda; henüz taslak değil.',
      advice: 'Taslak olarak kaydedip önizleyin ya da sayfayı yenileyin.',
      cta: 'Ayarlara git',
      to: i.to.settings,
    })
  }
  if (i.data && i.data.history.length > 1)
    actions.push({ id: 'history', label: 'Yayın geçmişini aç', detail: 'Önceki sürüme geri alma buradan, gerekçe ve step-up ile yapılır.', icon: 'mdi-history', to: i.to.history })

  if (!i.data) attention.push(unreadable('settings', 'Platform ayarları', i.retry))
  else if (i.stale) attention.push(unreadable('settings', 'Platform ayarları', i.retry, true))

  return buildVerdict({
    attention,
    actions,
    checks: ['Bakım modu', 'Taslak değişiklik', 'Yayın sürümü'],
    calm: {
      summary: i.data?.published
        ? `Bakım modu kapalı; sürüm ${i.data.published} yayında, bekleyen taslak yok.`
        : 'Bakım modu kapalı; varsayılan değerler geçerli, bekleyen taslak yok.',
    },
    busy: ({ errors, total, top }) =>
      !i.data
        ? 'Ayarlar okunamadı — hüküm verilemiyor; tekrar deneyin.'
        : errors
          ? `Platform ayarlarında şimdi müdahale gereken ${errors === 1 ? 'bir konu' : `${errors} konu`} var: ${lc(top.title)}.`
          : `Platform ayarlarında ${total === 1 ? 'bir konu' : `${total} konu`} izlenmeli; en önemlisi: ${lc(top.title)}.`,
  })
}

/** Özet cümlesinde başlığın ilk harfi küçülür ("var: bir etkin yönetici…"). */
const lc = (s: string) => s.charAt(0).toLocaleLowerCase('tr-TR') + s.slice(1)

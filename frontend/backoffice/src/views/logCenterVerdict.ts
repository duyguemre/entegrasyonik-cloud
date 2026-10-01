/** Log kontrol merkezi — sayfa hükmü (K51). Saf: girdi sorun grupları (son 24 saat; `?tid=` varsa BE-06 ile müşteri kapsamlı, yaklaşık), çıktı `PageVerdict`. */
import type { IssueGroup, LogCategory, LogLevel } from '@bo/api/contract'
import { buildVerdict, unreadable, type AttentionItem, type PageVerdict, type SuggestedAction } from '@bo/utils/verdict'
import { formatCount } from '@bo/utils/units'
import { CATEGORY } from '@bo/utils/labels'

const DAY_MS = 86_400_000
/** Grup "yükseliyor": bugünkü olay sayısı dünkünün bu katını aşarsa (bugün kısmi gün olduğundan kasıtlı olarak yüksek). */
export const RISING_FACTOR = 2
/** …ve bugün en az bu kadar olay varsa (birkaç olaylık dalgalanma gürültüdür). */
export const RISING_MIN_TODAY = 10

/** Sorun grubunun ilgili operasyon ekranı (kategori → ekran). Kimlik kategorisi için platform yöneticisi ekranı yoktur. */
export const CATEGORY_SCREEN: Partial<Record<LogCategory, { path: string; label: string }>> = {
  order: { path: '/motor', label: 'Motor ve kuyruklar' },
  catalog: { path: '/motor', label: 'Motor ve kuyruklar' },
  integration: { path: '/entegrasyonlar', label: 'Entegrasyonlar' },
  platform: { path: '/altyapi', label: 'Altyapı' },
  billing: { path: '/abonelikler', label: 'Abonelikler' },
}

/**
 * Sayfa içi süzgeç bağlantısı (göreli konum): sayfa `?level=&category=&fp=&sekme=akis|sorunlar&sirala=` okur ve uygular
 * (BO_UI_PATTERNS §11.6 tablosuna eklenecek). `?tid=` korunur.
 */
export interface LogShow {
  level?: LogLevel[]
  category?: LogCategory[]
  fp?: string
  sort?: 'lastSeen' | 'count' | 'tenantCount' | 'new'
  tab?: 'issues' | 'stream'
}

export interface TidScope {
  tid: number
  /** Son 24 saatte bu müşterinin hata + kritik / uyarı olay sayısı (olay akışı yüz sayımlarından). */
  errors: number
  warns: number
}

export interface LogVerdictInput {
  issues: IssueGroup[] | null
  failed: boolean
  /** `?tid=` kapsamı; null = kapsam yok. `unreadable` = müşteri sayımı okunamadı. */
  tid: TidScope | null
  tidFailed?: boolean
  now?: number
  retry: () => void
}

const link = (tid: number | undefined, f: LogShow) => ({
  query: {
    ...(tid ? { tid: String(tid) } : {}),
    ...(f.level ? { level: f.level.join(',') } : {}),
    ...(f.category ? { category: f.category.join(',') } : {}),
    ...(f.fp ? { fp: f.fp } : {}),
    ...(f.sort && f.sort !== 'lastSeen' ? { sirala: f.sort } : {}),
    sekme: f.tab === 'stream' ? 'akis' : 'sorunlar',
  },
})

const isOpen = (i: IssueGroup) => i.status === 'open' || i.status === 'acknowledged'
const isCritical = (i: IssueGroup) => (i.level === 'fatal' || i.level === 'error') && isOpen(i)

function dayCounts(i: IssueGroup): { today: number; yesterday: number } {
  const keys = Object.keys(i.daily).sort()
  const last = keys.length
  return { today: last ? i.daily[keys[last - 1]] : 0, yesterday: last > 1 ? i.daily[keys[last - 2]] : 0 }
}

export function logCenterVerdict(i: LogVerdictInput): PageVerdict {
  const now = i.now ?? Date.now()
  const attention: Array<AttentionItem | null> = []
  const actions: SuggestedAction[] = []
  const groups = i.issues ?? []
  const byCount = (a: IssueGroup, b: IssueGroup) => b.count - a.count

  const critical = groups.filter(isCritical)
  const fatalOpen = groups.filter((g) => g.level === 'fatal' && g.status === 'open').sort(byCount)
  const fatalOwned = groups.filter((g) => g.level === 'fatal' && g.status === 'acknowledged').sort(byCount)
  const fresh = critical.filter((g) => !fatalOpen.includes(g) && now - Date.parse(g.firstSeen) < DAY_MS).sort(byCount)
  const rising = critical
    .filter((g) => {
      if (fatalOpen.includes(g) || fresh.includes(g)) return false
      const d = dayCounts(g)
      return d.today >= RISING_MIN_TODAY && d.today > d.yesterday * RISING_FACTOR
    })
    .sort(byCount)

  const t = i.tid?.tid
  const go = (f: LogShow) => link(t, f)
  if (fatalOpen.length)
    attention.push({
      id: 'fatal-open',
      tone: 'error',
      title: fatalOpen.length === 1 ? `Kritik sorun açık: ${fatalOpen[0].title}` : `${formatCount(fatalOpen.length)} kritik sorun grubu henüz üstlenilmedi`,
      impact: `${formatCount(fatalOpen.reduce((n, g) => n + g.count, 0))} olay, ${formatCount(Math.max(...fatalOpen.map((g) => g.tenantCount)))} müşteriye kadar etkileniyor; süreci düşüren hata sınıfı.`,
      advice: 'En çok olayı olan grupla başlayıp hata sınıfını ve son istekleri kontrol edin.',
      since: fatalOpen.length === 1 ? fatalOpen[0].firstSeen : undefined,
      cta: fatalOpen.length === 1 ? 'Sorun grubunu aç' : 'Kritik grupları aç',
      to: go(fatalOpen.length === 1 ? { level: ['fatal'], fp: fatalOpen[0].fp } : { level: ['fatal'], sort: 'count' }),
    })
  if (fatalOwned.length)
    attention.push({
      id: 'fatal-owned',
      tone: 'warning',
      title: `${formatCount(fatalOwned.length)} kritik sorun incelemede ama çözülmedi`,
      impact: 'Üstlenilmiş olsa da hâlâ açık; olaylar sürüyor olabilir.',
      advice: 'Grubun son görülme zamanını ve olay eğilimini kontrol edin.',
      cta: 'Kritik grupları aç',
      to: go({ level: ['fatal'], sort: 'count' }),
    })
  if (fresh.length)
    attention.push({
      id: 'new-24h',
      tone: 'warning',
      title: `${formatCount(fresh.length)} yeni hata grubu son 24 saatte ortaya çıktı`,
      impact: `En çok olay: ${fresh[0].title}`,
      advice: 'Yeni bir yayın ya da pazaryeri değişikliğiyle ilişkili olup olmadığını kontrol edin.',
      since: fresh[0].firstSeen,
      cta: 'Yeni grupları aç',
      to: go({ level: ['error', 'fatal'], sort: 'new' }),
    })
  if (rising.length)
    attention.push({
      id: 'rising',
      tone: 'warning',
      title: rising.length === 1 ? `Hata grubu dünden hızlı artıyor: ${rising[0].title}` : `${formatCount(rising.length)} hata grubu dünden hızlı artıyor`,
      impact: 'Bugünkü olay sayısı dünün iki katını aştı.',
      advice: 'Yayılmadan önce etkilenen müşterileri ve hata sınıfını kontrol edin.',
      cta: rising.length === 1 ? 'Sorun grubunu aç' : 'Yükselenleri aç',
      to: go(rising.length === 1 ? { level: ['error', 'fatal'], fp: rising[0].fp } : { level: ['error', 'fatal'], sort: 'count' }),
    })

  // En çok etkilenen kategori: açık hata/kritik grupların olay toplamına göre.
  const perCat = new Map<LogCategory, { events: number; groups: number }>()
  for (const g of critical) {
    const c = perCat.get(g.category) ?? { events: 0, groups: 0 }
    perCat.set(g.category, { events: c.events + g.count, groups: c.groups + 1 })
  }
  const topCat = [...perCat.entries()].sort((a, b) => b[1].events - a[1].events)[0]
  if (topCat)
    attention.push({
      id: 'top-category',
      tone: 'info',
      title: `En çok etkilenen kategori: ${CATEGORY[topCat[0]].label}`,
      impact: `${formatCount(topCat[1].groups)} açık grup, ${formatCount(topCat[1].events)} olay.`,
      advice: 'Kategoriyi süzüp gruplarını kontrol edin.',
      cta: 'Kategoriyi süz',
      to: go({ category: [topCat[0]], level: ['error', 'fatal'], sort: 'count' }),
    })

  if (i.tid && i.tid.errors > 0)
    attention.push({
      id: 'tenant-errors',
      tone: 'warning',
      title: `Müşteri #${i.tid.tid} için son 24 saatte ${formatCount(i.tid.errors)} hata ve kritik olay var`,
      impact: 'Sayım bu müşterinin kendi olaylarıdır (kesin); sorun grupları kova eşleşmesiyle süzüldüğü için yaklaşıktır.',
      advice: 'Olay akışında istek kimliklerini kontrol edin.',
      tenant: { tid: i.tid.tid, name: null },
      cta: 'Olay akışını aç',
      to: go({ tab: 'stream', level: ['error', 'fatal'] }),
    })
  if (i.failed) attention.push(unreadable('issues', 'Sorun grupları', i.retry))
  if (i.tidFailed) attention.push(unreadable('tenant', `Müşteri #${i.tid?.tid ?? ''} olay sayısı`, i.retry))

  // Eylemler (yazma eylemi yok: sözleşmede üstlen/çöz/sustur uçları bulunmuyor).
  const top = [...critical].sort(byCount)[0]
  // İlk eylem en önemlisi: en büyük açık sorun grubu.
  if (top)
    actions.push({ id: 'triage', label: 'En büyük sorun grubunu incele', detail: top.title, icon: 'mdi-magnify-scan', to: go({ level: ['error', 'fatal'], fp: top.fp }) })
  if (critical.length)
    actions.push({ id: 'stream', label: 'Olay akışını hata ve kritikle aç', detail: 'Son olayları istek kimliğiyle izleyin.', icon: 'mdi-text-box-search-outline', to: go({ tab: 'stream', level: ['error', 'fatal'] }) })
  const screen = top ? CATEGORY_SCREEN[top.category] : undefined
  if (screen) actions.push({ id: 'screen', label: `${screen.label} ekranına geç`, detail: `${CATEGORY[top!.category].label} kategorisindeki sorunun kaynağını denetleyin.`, icon: 'mdi-arrow-top-right', to: screen.path })
  if (i.tid) actions.push({ id: 'tenant', label: `Müşteri #${i.tid.tid} sayfasını aç`, icon: 'mdi-storefront-outline', to: `/musteriler/${i.tid.tid}` })

  const tidPrefix = i.tid
    ? `Müşteri #${i.tid.tid} için son 24 saatte ${i.tid.errors ? `${formatCount(i.tid.errors)} hata ve kritik olay var` : 'hata ya da kritik olay yok'}. Müşterinin sorun gruplarında (yaklaşık): `
    : ''
  const lower = (s: string) => (tidPrefix ? s.charAt(0).toLocaleLowerCase('tr-TR') + s.slice(1) : s)
  const unknown = i.failed

  return buildVerdict({
    attention,
    actions,
    note: i.tid
      ? `Müşteri #${i.tid.tid} kapsamındaki son 24 saatin sorun grupları değerlendirildi; başka müşterinin grubu da görünebilir.`
      : 'Son 24 saatin sorun grupları süzgeçsiz değerlendirildi.',
    checks: ['Kritik ve hata grupları', 'Yeni gruplar (24 sa)', 'Yükselen gruplar'],
    calm: {
      summary:
        tidPrefix +
        lower(
          critical.length
            ? `Kritik sorun yok; ${formatCount(critical.length)} açık hata grubu sürüyor ama son 24 saatte yeni ya da yükselen yok.`
            : 'Açık kritik ya da hata grubu yok; son 24 saatte yeni sorun görülmedi.',
        ),
    },
    busy: ({ errors, total, top: t }) =>
      tidPrefix +
      lower(
        unknown
          ? 'Sorun grupları okunamadı — hüküm verilemiyor; tekrar deneyin.'
          : errors
            ? `Şimdi müdahale gereken ${errors === 1 ? 'bir konu' : `${errors} konu`} var: ${t.title}.`
            : `${total === 1 ? 'Bir konu' : `${total} konu`} izlenmeli; en önemlisi: ${t.title}.`,
      ),
  })
}

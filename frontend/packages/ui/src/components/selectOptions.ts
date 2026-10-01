// DS-v2 Aşama 6b — Standart 12: açılır liste seçenek mantığı (SAF TS; EkSelect ve testler kullanır).
//   normalizeOptions → tek biçim {value,title,subtitle,icon,channel,tone,group}
//   buildMenu       → "Son kullanılanlar" + gruplar (başlık satırları seçilemez)
//   splitMatch      → eşleşme vurgusu (<mark>) için metin parçaları (Türkçe büyük/küçük harf duyarsız)
//   recent*         → son seçilenler (yerel depo, ekran anahtarı başına ≤5; erişilemezse sessizce yok)

export type EkOptionTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'action'

export interface EkSelectOption {
  value: string | number
  title: string
  subtitle?: string
  icon?: string
  /** Kanal kodu → kısa kanal rozeti (K13). */
  channel?: string
  /** Kargo firması (kod ya da ad) → kısa kargo rozeti (K13, FR2 madde 13). */
  carrier?: string
  /** Durum tonu → ton renginde nokta. */
  tone?: EkOptionTone
  group?: string
  disabled?: boolean
}

export interface EkMenuRow extends EkSelectOption {
  __header?: boolean
}

export function normalizeOptions(items: any[], itemTitle = 'title', itemValue = 'value', kind: 'default' | 'channel' | 'carrier' | 'status' = 'default'): EkSelectOption[] {
  return (items ?? []).map((it: any) => {
    if (it === null || typeof it !== 'object') return { value: it, title: String(it) }
    const value = it[itemValue] ?? it.value ?? it.id ?? it.code
    const opt: EkSelectOption = {
      value,
      title: String(it[itemTitle] ?? it.title ?? it.name ?? value),
      subtitle: it.subtitle ?? it.description,
      icon: it.icon,
      tone: it.tone,
      group: it.group,
      disabled: it.disabled,
      channel: it.channel ?? (kind === 'channel' ? String(it.code ?? value ?? '') : undefined),
    }
    if (kind === 'carrier' || it.carrier !== undefined) {
      // Kayıtta olmayan seçenek ("Diğer"): rozet yerine nötr ikon (uydurma kısaltma gösterilmez).
      const carrier = String(it.carrier ?? it.code ?? '')
      if (carrier) opt.carrier = carrier
      else opt.icon ??= 'mdi-truck-outline'
    }
    return opt
  })
}

export function buildMenu(options: EkSelectOption[], recentValues: Array<string | number> = [], recentLabel = 'Son kullanılanlar'): EkMenuRow[] {
  const recent = recentValues.map((v) => options.find((o) => o.value === v)).filter(Boolean) as EkSelectOption[]
  const hasGroups = options.some((o) => o.group)
  if (!recent.length && !hasGroups) return options
  const rows: EkMenuRow[] = []
  if (recent.length) {
    rows.push({ value: '__h_recent', title: recentLabel, __header: true, disabled: true })
    // Aynı değer iki kez listelenmez: son kullanılanlar ayrı anahtarla (seçim değeri aynı kalır).
    for (const r of recent) rows.push({ ...r, group: recentLabel })
  }
  const groups = new Map<string, EkSelectOption[]>()
  for (const o of options) {
    if (recent.some((r) => r.value === o.value)) continue
    const g = o.group ?? (recent.length ? 'Tümü' : '')
    if (!groups.has(g)) groups.set(g, [])
    groups.get(g)!.push(o)
  }
  for (const [g, list] of groups) {
    if (g) rows.push({ value: `__h_${g}`, title: g, __header: true, disabled: true })
    rows.push(...list)
  }
  return rows
}

const fold = (s: string) => s.toLocaleLowerCase('tr-TR')

/** Metni eşleşen/eşleşmeyen parçalara böler (vurgulu gösterim için). */
export function splitMatch(text: string, query?: string | null): Array<{ text: string; match: boolean }> {
  const q = (query ?? '').trim()
  if (!q) return [{ text, match: false }]
  const i = fold(text).indexOf(fold(q))
  if (i < 0) return [{ text, match: false }]
  return [
    { text: text.slice(0, i), match: false },
    { text: text.slice(i, i + q.length), match: true },
    { text: text.slice(i + q.length), match: false },
  ].filter((p) => p.text)
}

const RECENT_MAX = 5
const recentKeyOf = (key: string) => `ek.select.recent.v1.${key}`

export function readRecent(key?: string): Array<string | number> {
  if (!key) return []
  try {
    const raw = localStorage.getItem(recentKeyOf(key))
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list.slice(0, RECENT_MAX) : []
  } catch {
    return []
  }
}

export function pushRecent(key: string | undefined, values: Array<string | number>): Array<string | number> {
  if (!key) return []
  const next = [...values, ...readRecent(key).filter((v) => !values.includes(v))].slice(0, RECENT_MAX)
  try {
    localStorage.setItem(recentKeyOf(key), JSON.stringify(next))
  } catch {
    // Depolama yoksa (gizli pencere) son kullanılanlar gösterilmez — işlev etkilenmez.
  }
  return next
}

const CHANNEL_TYPE_LABEL: Record<string, string> = { marketplace: 'Pazaryeri', ecommerce: 'E-ticaret', erp: 'ERP', shipping: 'Kargo', einvoice: 'E-fatura' }

/** Entegrasyon listesi (integrationStore) → kanal seçenekleri: kanal rengi + tür alt satırı. */
export function channelOptionsFrom(list: any[]): EkSelectOption[] {
  return (list ?? []).map((p: any) => ({
    value: p.code,
    title: String(p.title ?? p.name ?? p.code),
    channel: String(p.code ?? ''),
    subtitle: CHANNEL_TYPE_LABEL[p?.type?.code ?? p?.category ?? ''] ?? undefined,
  }))
}

/** Durum seçenekleri → ton noktası (tek kaynak: design/status-map tonları). */
export function toneOptionsFrom<T extends { id: any; title: string }>(list: T[], toneOf: (id: any) => EkOptionTone | undefined): EkSelectOption[] {
  return (list ?? []).map((s) => ({ value: s.id, title: s.title, tone: toneOf(s.id) }))
}

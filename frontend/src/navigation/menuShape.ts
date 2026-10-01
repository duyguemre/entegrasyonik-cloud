/**
 * frontend/src/navigation/menuShape.ts
 *
 * FR2-SHELL madde 7/8 (fe-r2a) — `MenuService` ağacının KABUKTA sunum biçimi (SAF TS, test edilebilir).
 * Menü kaydı ApplicationDB `menus` belgesindedir (bulut kapsamı dışı); erişim kaynağı değişmez (ADR-0015 Karar 2.4):
 * burada ekran EKLENMEZ, yalnız sunum düzeltilir.
 *  - Emekli öğeler (Eğitim Merkezi — Yardım merkezi yerine geçti) gösterilmez.
 *  - Üst seviyeye çıkarılan yapraklar (Uygulama Ayarları) grubundan çıkıp grubun hemen önüne yerleşir; boşalan grup düşer.
 *  - P06 (K49): tek yapraklı destek grubu düşer, yaprak üst seviyede ("Destek talepleri").
 *  - P11 (K49): Mağaza ayarları + Çıktılar + Yetkilendirme hangi menü grubunda gelirse gelsin "Ayarlar" bölümünde
 *    toplanır; Finans bölümü yalnız finans. Menü verisinin kendisi backend'de (`menus`) — kalıcı düzen backend isteği.
 */

/** Kullanıcı kararıyla menüden kaldırılan öğeler (kod ya da başlık anahtarı). */
const RETIRED_CODES = new Set(['EducationView'])
const RETIRED_TITLES = new Set(['educationCenter', 'support_school'])

/** Grubundan çıkarılıp bölümün üst seviyesinde gösterilen ekranlar. */
export const HOISTED_CODES: ReadonlySet<string> = new Set(['SettingListView'])

/** Tek alt öğesi kaldığında grup yerine doğrudan yaprak olarak gösterilen ekranlar (P06). */
export const FLATTEN_SINGLE_CODES: ReadonlySet<string> = new Set(['TicketListView'])

/** P11: "Ayarlar" bölümünde toplanan ekranlar (gösterim sırası). */
export const SETTINGS_GROUP_CODES: readonly string[] = ['SettingListView', 'PrintoutListView', 'AuthorizationListView']
export const SETTINGS_GROUP_ID = 'settings'

/** Düzleştirilen yaprağın ikonu yoksa grubun ikonu (bağlantı nesnesi DEĞİŞTİRİLMEZ). */
const inheritedIcons = new WeakMap<object, string>()
export function inheritedIcon(link: object | null | undefined): string | undefined {
  return link ? inheritedIcons.get(link) : undefined
}

export function isRetiredLink(link: { code?: string; title?: string } | null | undefined): boolean {
  if (!link) return false
  return RETIRED_CODES.has(String(link.code ?? '')) || RETIRED_TITLES.has(String(link.title ?? ''))
}

/**
 * Bir menü grubunun `links` dizisini kabuk düzenine çevirir (girdi DEĞİŞTİRİLMEZ; düğüm nesneleri aynı kalır —
 * sekme/favori/başlık çözümü aynı bağlantı nesnesiyle çalışır).
 */
export function shapeGroupLinks<T extends { code?: string; title?: string; children?: T[] }>(links: T[] | undefined): T[] {
  const out: T[] = []
  for (const link of links ?? []) {
    if (!link || isRetiredLink(link)) continue
    if (!Array.isArray(link.children) || link.children.length === 0) {
      out.push(link)
      continue
    }
    const kept: T[] = []
    const hoisted: T[] = []
    for (const child of link.children) {
      if (!child || isRetiredLink(child)) continue
      if (HOISTED_CODES.has(String(child.code ?? ''))) hoisted.push(child)
      else kept.push(child)
    }
    // Yukarı alınan yaprak grubun ÖNÜNE gelir (bölümün ilk, en sık kullanılan girişi); grup kendi çocuklarını
    // kaybettiyse (tamamı emekli/yukarı alındı) grup düğümü gösterilmez.
    out.push(...hoisted)
    if (kept.length === 1 && link.children.length === 1 && FLATTEN_SINGLE_CODES.has(String(kept[0].code ?? ''))) {
      const icon = (link as { icon?: string }).icon
      if (icon && !(kept[0] as { icon?: string }).icon) inheritedIcons.set(kept[0] as object, icon)
      out.push(kept[0])
      continue
    }
    if (kept.length > 0) out.push(kept.length === link.children.length ? link : ({ ...link, children: kept } as T))
  }
  return out
}

type MenuGroup<T> = { group?: string; links?: T[] } & Record<string, unknown>

/**
 * P11: `SETTINGS_GROUP_CODES` ekranlarını (üst seviye ya da bir grubun çocuğu) bulundukları gruptan alıp tek "Ayarlar"
 * grubunda toplar. Mevcut bir `settings` grubu varsa ona eklenir; yoksa ilk alınan ekranın grubunun hemen ARDINA
 * yeni grup yerleşir. Boşalan grup/üst öğe düşer. Girdi DEĞİŞTİRİLMEZ; bağlantı nesneleri aynı kalır.
 */
export function regroupMenu<T extends { code?: string; children?: T[] }>(groups: Array<MenuGroup<T>>): Array<MenuGroup<T>> {
  const moved = new Map<string, T>()
  let anchor = -1
  const out: Array<MenuGroup<T>> = []
  groups.forEach((group) => {
    const before = moved.size
    const links: T[] = []
    for (const link of group.links ?? []) {
      if (!link) continue
      const code = String(link.code ?? '')
      if (SETTINGS_GROUP_CODES.includes(code) && group.group !== SETTINGS_GROUP_ID) {
        if (!moved.has(code)) moved.set(code, link)
        continue
      }
      if (Array.isArray(link.children) && link.children.length) {
        const kids = link.children.filter((c) => {
          const cc = String(c?.code ?? '')
          if (SETTINGS_GROUP_CODES.includes(cc) && group.group !== SETTINGS_GROUP_ID) {
            if (!moved.has(cc)) moved.set(cc, c)
            return false
          }
          return true
        })
        if (kids.length) links.push(kids.length === link.children.length ? link : ({ ...link, children: kids } as T))
        continue
      }
      links.push(link)
    }
    const original = group.links ?? []
    if (links.length || !original.length) out.push(links.length === original.length ? group : { ...group, links })
    // Yeni "Ayarlar" grubu, ekranın ilk alındığı grubun yerine/ardına gelir.
    if (before === 0 && moved.size > 0) anchor = out.length
  })
  if (!moved.size) return groups
  const ordered = SETTINGS_GROUP_CODES.map((c) => moved.get(c)).filter(Boolean) as T[]
  const existing = out.findIndex((g) => g.group === SETTINGS_GROUP_ID)
  if (existing >= 0) {
    out[existing] = { ...out[existing], links: [...ordered, ...(out[existing].links ?? [])] }
    return out
  }
  out.splice(anchor < 0 ? out.length : anchor, 0, { group: SETTINGS_GROUP_ID, links: ordered })
  return out
}

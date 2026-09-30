/**
 * frontend/src/components/catalogPages/catalogModel.ts
 *
 * B7 — Kategoriler / Markalar sayfalarının SAF modeli (vitest: tests/b7-catalog-pages.test.ts). Bileşenler yalnız bunu çizer.
 * Veri şekilleri backend'in GERÇEK yanıtlarıdır (sözleşme değişmedi):
 *   • `CategoryService` GET → `[ana, ...seviye0]` (ana: `isMain`/`parentId: 0`; diğerleri iç içe `children`). Eski fixture'lardaki
 *     "seviye 0 ana kaydın `children`'ında" biçimi de okunur.
 *   • `AttributeMappingService` GET → kategori düzeyi eşleme = `platformAttributeId` boş kayıt (saveCategoryMapping).
 *   • `BrandService` GET → düz dizi; `platforms.<kod>.id` doluysa marka o platformda eşli (saveIntegrationBrand).
 * Ürün sayısı / logo alanı bu yanıtlarda YOK → model bunları üretmez (uydurma sayı yok).
 */

export interface PlatformRef {
  code: string
  name: string
}

export interface CatNode {
  id: string
  title: string
  parentId: string | null
  depth: number
  /** Kökten bu düğüme başlıklar. */
  path: string[]
  children: CatNode[]
  /** Backend kaydı (CategorySyncComponent'e aynen verilir). */
  raw: any
}

export interface CatTree {
  roots: CatNode[]
  byId: Map<string, CatNode>
  mainId: string | null
  total: number
  leafCount: number
}

export const idOf = (v: any): string => (v == null ? '' : String(v?.$oid ?? v))

export function buildCategoryTree(raw: any[] | null | undefined): CatTree {
  const byId = new Map<string, CatNode>()
  let mainId: string | null = null
  let leafCount = 0
  const top: any[] = []
  for (const item of Array.isArray(raw) ? raw : []) {
    if (!item) continue
    if (item.isMain === true || item.parentId === 0 || item.parentId === '0') {
      mainId = idOf(item._id)
      if (Array.isArray(item.children)) top.push(...item.children)
    } else top.push(item)
  }
  const walk = (items: any[], parentId: string | null, depth: number, path: string[]): CatNode[] =>
    items.filter(Boolean).map((item) => {
      const title = String(item.title ?? '')
      const node: CatNode = { id: idOf(item._id), title, parentId, depth, path: [...path, title], children: [], raw: item }
      byId.set(node.id, node)
      node.children = walk(Array.isArray(item.children) ? item.children : [], node.id, depth + 1, node.path)
      if (!node.children.length) leafCount++
      return node
    })
  const roots = walk(top, null, 0, [])
  return { roots, byId, mainId, total: byId.size, leafCount }
}

/** Türkçe duyarlı, aksan-katlamalı küçük harf. Her karakter TEK karaktere eşlenir → vurgu indeksleri korunur. */
export function fold(s: string): string {
  const map: Record<string, string> = { ı: 'i', ş: 's', ğ: 'g', ü: 'u', ö: 'o', ç: 'c', â: 'a', î: 'i', û: 'u' }
  let out = ''
  for (const ch of s) {
    const lower = ch.toLocaleLowerCase('tr')
    const one = lower.length === 1 ? lower : ch.toLowerCase().slice(0, 1)
    out += map[one] ?? one
  }
  return out
}

const TR_SPECIAL = /[çğıöşüâîû]/

/**
 * Sorguya göre karşılaştırma dönüşümü: sorgu Türkçe özel harf İÇERMİYORSA aksan katlanır (tisort → Tişört);
 * içeriyorsa kullanıcı harfi bilerek yazmıştır → yalnız Türkçe küçük harf (ça → Çanta, Olcay DEĞİL).
 */
export function normalizerFor(query: string): (s: string) => string {
  const lowered = query.trim().toLocaleLowerCase('tr')
  if (!TR_SPECIAL.test(lowered)) return fold
  return (s: string) => {
    let out = ''
    for (const ch of s) {
      const l = ch.toLocaleLowerCase('tr')
      out += l.length === 1 ? l : ch.toLowerCase().slice(0, 1)
    }
    return out
  }
}

export interface TextPart {
  text: string
  match: boolean
}

/** Başlığı sorgu eşleşmelerine böler (`<mark>` için). Sorgu < 1 karakter → tek parça. */
export function highlightParts(title: string, query: string): TextPart[] {
  const norm = normalizerFor(query)
  const q = norm(query.trim())
  if (!q) return [{ text: title, match: false }]
  const chars = Array.from(title)
  const hay = norm(title)
  const hayChars = Array.from(hay)
  if (hayChars.length !== chars.length) return [{ text: title, match: false }]
  const parts: TextPart[] = []
  let i = 0
  let from = 0
  const hayStr = hayChars.join('')
  while (i <= hayChars.length - Array.from(q).length) {
    const at = hayStr.indexOf(q, i)
    if (at < 0) break
    if (at > from) parts.push({ text: chars.slice(from, at).join(''), match: false })
    const len = Array.from(q).length
    parts.push({ text: chars.slice(at, at + len).join(''), match: true })
    from = i = at + len
  }
  if (from < chars.length) parts.push({ text: chars.slice(from).join(''), match: false })
  return parts.length ? parts : [{ text: title, match: false }]
}

export const matches = (title: string, query: string) => {
  const norm = normalizerFor(query)
  const q = norm(query.trim())
  return !q || norm(title).includes(q)
}

/** Kategori kimliği → eşli platform kodları (yalnız kategori düzeyi kayıtlar). */
export function categoryMappingIndex(mappings: any[] | null | undefined): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>()
  for (const m of Array.isArray(mappings) ? mappings : []) {
    if (!m || m.platformAttributeId != null || !m.integrationCode || m.platformCategoryId == null || m.platformCategoryId === '') continue
    const id = idOf(m.localCategoryId)
    if (!id) continue
    if (!index.has(id)) index.set(id, new Set())
    index.get(id)!.add(String(m.integrationCode))
  }
  return index
}

export interface MappingState {
  code: string
  name: string
  mapped: boolean
}

export function leafMapping(nodeId: string, index: Map<string, Set<string>>, platforms: PlatformRef[]): MappingState[] {
  const set = index.get(nodeId)
  return platforms.map((p) => ({ code: p.code, name: p.name, mapped: !!set?.has(p.code) }))
}

export function isLeafMissing(nodeId: string, index: Map<string, Set<string>>, platforms: PlatformRef[]): boolean {
  if (!platforms.length) return false
  const set = index.get(nodeId)
  return platforms.some((p) => !set?.has(p.code))
}

export interface GroupStats {
  leaves: number
  missing: number
}

/** Her düğüm için alt yaprak sayısı + eşlemesi eksik yaprak sayısı (yaprak kendini sayar). */
export function groupStats(tree: CatTree, index: Map<string, Set<string>>, platforms: PlatformRef[]): Map<string, GroupStats> {
  const out = new Map<string, GroupStats>()
  const visit = (n: CatNode): GroupStats => {
    if (!n.children.length) {
      const s = { leaves: 1, missing: isLeafMissing(n.id, index, platforms) ? 1 : 0 }
      out.set(n.id, s)
      return s
    }
    const s = { leaves: 0, missing: 0 }
    for (const c of n.children) {
      const cs = visit(c)
      s.leaves += cs.leaves
      s.missing += cs.missing
    }
    out.set(n.id, s)
    return s
  }
  tree.roots.forEach(visit)
  return out
}

/** Platform başına yaprak kapsaması (genel bakış çubukları). */
export function platformCoverage(tree: CatTree, index: Map<string, Set<string>>, platforms: PlatformRef[]) {
  const leaves = [...tree.byId.values()].filter((n) => !n.children.length)
  return platforms.map((p) => ({ ...p, mapped: leaves.filter((l) => index.get(l.id)?.has(p.code)).length, total: leaves.length }))
}

export interface VisibleSpec {
  /** null = hepsi görünür. */
  visible: Set<string> | null
  /** Görünürlüğü sağlamak için açılması gereken düğümler. */
  expand: Set<string>
  /** Sorguyla doğrudan eşleşenler (vurgu + sayı). */
  hits: Set<string>
}

export function ancestorsOf(tree: CatTree, id: string): string[] {
  const out: string[] = []
  let cur = tree.byId.get(id)?.parentId ?? null
  while (cur) {
    out.push(cur)
    cur = tree.byId.get(cur)?.parentId ?? null
  }
  return out
}

/**
 * Arama + "eşlemesi eksik" süzgeci. Arama: eşleşen düğüm + ataları görünür, atalar açılır (eşleşen grubun
 * çocukları kapalı kalır ama açılabilir → alt ağacı da görünür sayılır). Eksik süzgeci: eksik yapraklar + ataları.
 */
export function visibleSpec(tree: CatTree, query: string, onlyMissing: boolean, index: Map<string, Set<string>>, platforms: PlatformRef[]): VisibleSpec {
  const q = query.trim()
  const hits = new Set<string>()
  if (!q && !onlyMissing) return { visible: null, expand: new Set(), hits }
  const visible = new Set<string>()
  const expand = new Set<string>()
  const addWithAncestors = (id: string) => {
    visible.add(id)
    for (const a of ancestorsOf(tree, id)) {
      visible.add(a)
      expand.add(a)
    }
  }
  const addSubtree = (n: CatNode) => {
    for (const c of n.children) {
      if (!onlyMissing || subtreeHasMissing(c)) {
        visible.add(c.id)
        addSubtree(c)
      }
    }
  }
  const missingCache = new Map<string, boolean>()
  const subtreeHasMissing = (n: CatNode): boolean => {
    if (missingCache.has(n.id)) return missingCache.get(n.id)!
    const v = n.children.length ? n.children.some(subtreeHasMissing) : isLeafMissing(n.id, index, platforms)
    missingCache.set(n.id, v)
    return v
  }
  for (const n of tree.byId.values()) {
    const textOk = !q || matches(n.title, q)
    if (!textOk) continue
    if (onlyMissing && !subtreeHasMissing(n)) continue
    if (q) hits.add(n.id)
    if (!q && n.children.length) continue // yalnız eksik süzgeci: yapraklardan yukarı çıkılır
    addWithAncestors(n.id)
    if (q) addSubtree(n)
  }
  return { visible, expand, hits }
}

export interface TreeRow {
  node: CatNode
  depth: number
  expanded: boolean
  hasChildren: boolean
  posinset: number
  setsize: number
}

/** Görünür satırlar (düzleştirilmiş; sanallaştırma ve klavye gezintisi bunu kullanır). */
export function flattenRows(tree: CatTree, expanded: Set<string>, visible: Set<string> | null): TreeRow[] {
  const rows: TreeRow[] = []
  const walk = (nodes: CatNode[]) => {
    const shown = visible ? nodes.filter((n) => visible.has(n.id)) : nodes
    shown.forEach((node, i) => {
      const kids = visible ? node.children.filter((c) => visible.has(c.id)) : node.children
      const isOpen = expanded.has(node.id) && kids.length > 0
      rows.push({ node, depth: node.depth, expanded: isOpen, hasChildren: node.children.length > 0, posinset: i + 1, setsize: shown.length })
      if (isOpen) walk(node.children)
    })
  }
  walk(tree.roots)
  return rows
}

/** Kardeşler (sıra değiştirme / girinti azaltma için). */
export function siblingsOf(tree: CatTree, id: string): CatNode[] {
  const n = tree.byId.get(id)
  if (!n) return []
  return n.parentId ? tree.byId.get(n.parentId)?.children ?? [] : tree.roots
}

/** `dragged`, `target`ın içine taşınabilir mi (kendisi/alt ağacı/zaten ebeveyni değil). Eski ağaçla AYNI kural. */
export function canMoveInto(tree: CatTree, draggedId: string, targetId: string): boolean {
  if (!draggedId || !targetId || draggedId === targetId) return false
  const dragged = tree.byId.get(draggedId)
  if (!dragged || dragged.parentId === targetId) return false
  return !ancestorsOf(tree, targetId).includes(draggedId)
}

export const TITLE_MIN = 2
export const TITLE_MAX = 160

/** Eski formlarla AYNI kural: zorunlu, 2–160 karakter. Hata metni ya da null. */
export function titleError(v: string | null | undefined): string | null {
  const t = (v ?? '').trim()
  if (!t) return 'Ad zorunludur.'
  if (t.length < TITLE_MIN || t.length > TITLE_MAX) return `Ad ${TITLE_MIN}–${TITLE_MAX} karakter olmalıdır.`
  return null
}

// ---------------------------------------------------------------- Markalar

export interface BrandItem {
  id: string
  title: string
  initials: string
  mapping: MappingState[]
  mappedCount: number
  raw: any
}

/** Baş harf avatarı: ilk iki kelimenin baş harfleri (Türkçe büyük harf); tek kelimede ilk iki harf. */
export function initialsOf(title: string): string {
  const words = String(title ?? '').trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w))
  if (!words.length) return '?'
  const first = (w: string) => Array.from(w.replace(/^[^\p{L}\p{N}]+/u, ''))[0] ?? ''
  const letters = words.length > 1 ? first(words[0]) + first(words[1]) : Array.from(words[0]).filter((c) => /[\p{L}\p{N}]/u.test(c)).slice(0, 2).join('')
  return letters.toLocaleUpperCase('tr')
}

export function brandItems(raw: any[] | null | undefined, platforms: PlatformRef[]): BrandItem[] {
  return (Array.isArray(raw) ? raw : [])
    .filter((b) => b && !b.isMain)
    .map((b) => {
      const mapping = platforms.map((p) => ({ code: p.code, name: p.name, mapped: !!(b.platforms?.[p.code]?.id != null && b.platforms?.[p.code]?.id !== '') }))
      return { id: idOf(b._id), title: String(b.title ?? ''), initials: initialsOf(b.title), mapping, mappedCount: mapping.filter((m) => m.mapped).length, raw: b }
    })
}

export function filterBrands(items: BrandItem[], query: string, onlyMissing: boolean): BrandItem[] {
  return items.filter((b) => matches(b.title, query) && (!onlyMissing || (b.mapping.length > 0 && b.mappedCount < b.mapping.length)))
}

export function brandCoverage(items: BrandItem[], platforms: PlatformRef[]) {
  return platforms.map((p) => ({ ...p, mapped: items.filter((b) => b.mapping.find((m) => m.code === p.code)?.mapped).length, total: items.length }))
}

/** Özet metni: "2/3 platformda eşli" / "Eşleme yok" / "Tüm platformlarda eşli". */
export function mappingSummary(states: MappingState[]): string {
  if (!states.length) return 'Bağlı platform yok'
  const n = states.filter((s) => s.mapped).length
  if (n === 0) return 'Eşleme yok'
  if (n === states.length) return 'Tüm platformlarda eşli'
  return `${n}/${states.length} platformda eşli`
}

/** Kısa özet (dar kart): "Tamamı eşli" / "Eşleme yok" / "2/4 eşli". */
export function mappingShort(states: MappingState[]): string {
  if (!states.length) return 'Platform yok'
  const n = states.filter((s) => s.mapped).length
  if (n === 0) return 'Eşleme yok'
  if (n === states.length) return 'Tamamı eşli'
  return `${n}/${states.length} eşli`
}

/** Ekran okuyucu için tam döküm: "Trendyol: eşli, Hepsiburada: eşli değil". */
export function mappingSpoken(states: MappingState[]): string {
  return states.map((s) => `${s.name}: ${s.mapped ? 'eşli' : 'eşli değil'}`).join(', ')
}

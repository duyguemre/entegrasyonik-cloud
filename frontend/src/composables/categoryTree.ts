/**
 * frontend/src/composables/categoryTree.ts
 *
 * Kategoriler ekranının SAF veri yardımcıları (ağaç kurma, arama, eşleme kapsamı, taşıma kuralları).
 * Bileşen/API bilgisi içermez → birim testlenebilir. Sözleşme: `CategoryService` GET yanıtı
 * `[anaKategori(isMain), ...üstDüzeyKategoriler]`; her kategori `children` ile iç içedir. Ana kategori
 * (isMain) kullanıcıya gösterilmez; eski fixture'lardaki gibi altında `children` taşıyorsa onlar da üst düzeydir.
 */

export interface CatNode {
  id: string
  title: string
  /** Üst kategorinin kimliği; üst düzeyde `null` (gerçek ana kategori kimliği `mainId`). */
  parentId: string | null
  level: number
  children: CatNode[]
  /** Kök → bu kategori başlıkları. */
  path: string[]
  /** Kök → bu kategori kimlikleri (kendisi dahil). */
  pathIds: string[]
  raw: any
}

export interface CatTree {
  nodes: CatNode[]
  byId: Map<string, CatNode>
  /** Gerçek ana (isMain) kategori kimliği — "üst düzeye taşı" için. */
  mainId: string | null
}

export function buildCategoryTree(raw: any[] | undefined | null): CatTree {
  const byId = new Map<string, CatNode>()
  let mainId: string | null = null
  const build = (items: any[], parent: CatNode | null, level: number): CatNode[] =>
    (items ?? []).filter(Boolean).map((r: any) => {
      const id = String(r._id)
      const node: CatNode = {
        id,
        title: String(r.title ?? ''),
        parentId: parent ? parent.id : null,
        level,
        children: [],
        path: [...(parent?.path ?? []), String(r.title ?? '')],
        pathIds: [...(parent?.pathIds ?? []), id],
        raw: r,
      }
      byId.set(id, node)
      node.children = build(Array.isArray(r.children) ? r.children : [], node, level + 1)
      return node
    })

  const top: any[] = []
  for (const item of Array.isArray(raw) ? raw : []) {
    if (!item) continue
    if (item.isMain === true) {
      mainId = String(item._id)
      if (Array.isArray(item.children)) top.push(...item.children)
    } else top.push(item)
  }
  const nodes = build(top, null, 0)
  return { nodes, byId, mainId }
}

export function descendantIds(node: CatNode): string[] {
  const out: string[] = []
  const walk = (n: CatNode) => { for (const c of n.children) { out.push(c.id); walk(c) } }
  walk(node)
  return out
}

export function countDescendants(node: CatNode): number {
  return descendantIds(node).length
}

export function leavesOf(node: CatNode): CatNode[] {
  if (!node.children.length) return [node]
  return node.children.flatMap(leavesOf)
}

// ---------------------------------------------------------------------------------------------------------------------
// Arama (Türkçe harf katlama: "cicek" → "çiçek", "ısı" → "isi")

const foldChar = (ch: string): string => {
  const lower = ch.toLocaleLowerCase('tr-TR')
  const base = lower.normalize('NFD').replace(/[̀-ͯ]/g, '')
  return (base === 'ı' ? 'i' : base).charAt(0) || lower.charAt(0)
}

/** Karakter karakter katlar: çıktı uzunluğu girdiyle AYNI (vurgu dizinleri hizalı kalır). */
export function fold(text: string): string {
  let out = ''
  for (const ch of text) out += foldChar(ch)
  return out
}

export interface CatSearchResult {
  /** Metni eşleşenler. */
  matchIds: Set<string>
  /** Eşleşenler + üst dalları (görünür olması gerekenler). */
  visibleIds: Set<string>
  /** Açılması gereken (eşleşenlerin ataları) dallar. */
  openIds: Set<string>
}

export function searchCategories(tree: CatTree, query: string): CatSearchResult {
  const q = fold(query.trim())
  const matchIds = new Set<string>()
  const visibleIds = new Set<string>()
  const openIds = new Set<string>()
  if (!q) return { matchIds, visibleIds, openIds }
  for (const node of tree.byId.values()) {
    if (!fold(node.title).includes(q)) continue
    matchIds.add(node.id)
    visibleIds.add(node.id)
    for (const a of node.pathIds.slice(0, -1)) { visibleIds.add(a); openIds.add(a) }
  }
  return { matchIds, visibleIds, openIds }
}

export interface HighlightPart { text: string; hit: boolean }

/** Metni arama ifadesine göre parçalar (eşleşen parça `hit`). Katlama uzunluğu koruduğu için dizinler hizalıdır. */
export function highlightParts(text: string, query: string): HighlightPart[] {
  const q = fold(query.trim())
  if (!q) return [{ text, hit: false }]
  const hay = fold(text)
  const parts: HighlightPart[] = []
  let from = 0
  for (;;) {
    const at = hay.indexOf(q, from)
    if (at < 0) break
    if (at > from) parts.push({ text: text.slice(from, at), hit: false })
    parts.push({ text: text.slice(at, at + q.length), hit: true })
    from = at + q.length
  }
  if (from < text.length) parts.push({ text: text.slice(from), hit: false })
  return parts.length ? parts : [{ text, hit: false }]
}

// ---------------------------------------------------------------------------------------------------------------------
// Eşleme kapsamı

/** Yerel kategori kimliği → (kanal kodu → kanaldaki kategori kimliği). */
export type CategoryMappingIndex = Map<string, Map<string, string>>

/** `AttributeMappingService` belgelerinden YALNIZ kategori eşlemelerini ayıklar (özellik eşlemeleri değil). */
export function indexCategoryMappings(docs: any[] | undefined | null): CategoryMappingIndex {
  const index: CategoryMappingIndex = new Map()
  for (const m of Array.isArray(docs) ? docs : []) {
    if (!m || m.localCategoryId == null || !m.integrationCode || m.platformCategoryId == null || m.platformCategoryId === '') continue
    if (!(m.isCategoryMapping === true || m.platformAttributeId == null)) continue
    const key = String(m.localCategoryId)
    if (!index.has(key)) index.set(key, new Map())
    index.get(key)!.set(String(m.integrationCode), String(m.platformCategoryId))
  }
  return index
}

/**
 * [eslesme-fiyat WP2, Ek C P1-9] Özellik/değer düzeyi sorun dizini: yerel kategori → kanal → sorun sayısı. Sorun = kayıt `stale`
 * (platform kataloğunda kategori/özellik/değer kalktı; backend `catalog.platformRefresh`) ya da ZORUNLU özellik eşlemesinde değer yok
 * (serbest değerli değilse). Platformun tüm zorunlu özellik listesi burada bilinmez (eşlenmemiş zorunlu özellik formda/preflight'ta görünür).
 */
export type AttributeIssueIndex = Map<string, Map<string, number>>
export function indexAttributeIssues(docs: any[] | undefined | null): AttributeIssueIndex {
  const index: AttributeIssueIndex = new Map()
  for (const m of Array.isArray(docs) ? docs : []) {
    if (!m || m.localCategoryId == null || !m.integrationCode) continue
    const isCategory = m.isCategoryMapping === true || m.platformAttributeId == null
    const emptyRequired = !isCategory && m.isRequired === true && m.allowCustom !== true && !(Array.isArray(m.values) && m.values.length)
    if (!m.stale && !emptyRequired) continue
    const key = String(m.localCategoryId)
    if (!index.has(key)) index.set(key, new Map())
    const byCode = index.get(key)!
    byCode.set(String(m.integrationCode), (byCode.get(String(m.integrationCode)) ?? 0) + 1)
  }
  return index
}

export interface CatCoverage {
  leaf: boolean
  /** Yaprak için: eşli / eksik kanal kodları. Üst kategoride boş. */
  mapped: string[]
  missing: string[]
  /** [P1-9] Kategori eşli ama özellik/değer sorunu olan kanallar (bkz. `indexAttributeIssues`); `mapped`'in alt kümesi. */
  partial: string[]
  /** Altındaki yaprak sayısı (yaprakta 1) ve eksik eşlemesi olan yaprak sayısı. */
  leafCount: number
  incompleteLeafCount: number
}

export function computeCoverage(tree: CatTree, channelCodes: string[], mappings: CategoryMappingIndex, attrIssues: AttributeIssueIndex = new Map()): Map<string, CatCoverage> {
  const out = new Map<string, CatCoverage>()
  const visit = (node: CatNode): CatCoverage => {
    if (!node.children.length) {
      const own = mappings.get(node.id)
      const mapped = channelCodes.filter((c) => own?.has(c))
      const missing = channelCodes.filter((c) => !own?.has(c))
      const issues = attrIssues.get(node.id)
      const partial = mapped.filter((c) => (issues?.get(c) ?? 0) > 0)
      const cov: CatCoverage = { leaf: true, mapped, missing, partial, leafCount: 1, incompleteLeafCount: missing.length ? 1 : 0 }
      out.set(node.id, cov)
      return cov
    }
    let leafCount = 0
    let incomplete = 0
    for (const c of node.children) { const cc = visit(c); leafCount += cc.leafCount; incomplete += cc.incompleteLeafCount }
    const cov: CatCoverage = { leaf: false, mapped: [], missing: [], partial: [], leafCount, incompleteLeafCount: incomplete }
    out.set(node.id, cov)
    return cov
  }
  tree.nodes.forEach(visit)
  return out
}

/** "Eksik eşlemeli" süzgeci: eksiği olan yapraklar + üst dalları. */
export function incompleteVisibleIds(tree: CatTree, coverage: Map<string, CatCoverage>): Set<string> {
  const ids = new Set<string>()
  for (const node of tree.byId.values()) {
    const cov = coverage.get(node.id)
    if (cov?.leaf && cov.missing.length) for (const id of node.pathIds) ids.add(id)
  }
  return ids
}

// ---------------------------------------------------------------------------------------------------------------------
// Görünür satırlar (düzleştirilmiş ağaç; ARIA tree için)

export interface CatRow {
  node: CatNode
  level: number
  hasChildren: boolean
  expanded: boolean
  posInSet: number
  setSize: number
}

export function flattenVisible(
  nodes: CatNode[],
  opts: { expanded: Set<string>; visibleIds?: Set<string> | null },
): CatRow[] {
  const rows: CatRow[] = []
  const walk = (list: CatNode[], level: number) => {
    const shown = opts.visibleIds ? list.filter((n) => opts.visibleIds!.has(n.id)) : list
    shown.forEach((node, i) => {
      const visibleKids = opts.visibleIds ? node.children.filter((c) => opts.visibleIds!.has(c.id)) : node.children
      const expanded = visibleKids.length > 0 && opts.expanded.has(node.id)
      rows.push({ node, level, hasChildren: node.children.length > 0, expanded, posInSet: i + 1, setSize: shown.length })
      if (expanded) walk(node.children, level + 1)
    })
  }
  walk(nodes, 0)
  return rows
}

// ---------------------------------------------------------------------------------------------------------------------
// Taşıma kuralları (eski ağaç ile AYNI): kendine ve kendi altına, zaten üstü olan kategoriye taşınamaz.

export function canMoveInto(dragged: CatNode, target: CatNode | null): boolean {
  if (!target) return dragged.parentId !== null // üst düzeye
  if (dragged.id === target.id) return false
  if (dragged.parentId === target.id) return false
  return !descendantIds(dragged).includes(target.id)
}

/** Aynı üst kategoriye bağlı (kardeş) ve farklı mı — sıra değişimi koşulu. */
export function canSwapOrder(dragged: CatNode, target: CatNode): boolean {
  return dragged.id !== target.id && dragged.parentId === target.parentId
}

/** Kardeşler arasında bir önceki / sonraki (sıra değiştirmek için). */
export function siblingOf(tree: CatTree, node: CatNode, dir: -1 | 1): CatNode | undefined {
  const list = node.parentId ? tree.byId.get(node.parentId)?.children : tree.nodes
  if (!list) return undefined
  return list[list.findIndex((n) => n.id === node.id) + dir]
}

/**
 * [eslesme-fiyat WP2, PLAN §3.1 "kalıtım yok, kopyala var"] Bir kategoriye kanal eşlemesi KOPYALANABİLECEK kaynaklar: bu kanalda eşli
 * kategoriler; sıra = üst kategoriler (yakından uzağa) → kardeşler → diğerleri (başlığa göre). Kendisi hariç; en çok `limit`.
 */
export interface CopySource { id: string; title: string; pathText: string; relation: 'parent' | 'sibling' | 'other' }
export function copySourcesFor(tree: CatTree, node: CatNode, code: string, mappings: CategoryMappingIndex, limit = 8): CopySource[] {
  const has = (id: string) => id !== node.id && !!mappings.get(id)?.has(code)
  const out: CopySource[] = []
  const seen = new Set<string>()
  const push = (n: CatNode | undefined, relation: CopySource['relation']) => {
    if (!n || seen.has(n.id) || !has(n.id)) return
    seen.add(n.id)
    out.push({ id: n.id, title: n.title, pathText: n.path.join(' › '), relation })
  }
  for (const id of [...node.pathIds].reverse()) push(tree.byId.get(id), 'parent')
  const parent = node.parentId ? tree.byId.get(node.parentId) : undefined
  for (const s of parent ? parent.children : tree.nodes) push(s, 'sibling')
  const rest = [...tree.byId.values()].filter((n) => !seen.has(n.id) && has(n.id)).sort((a, b) => a.title.localeCompare(b.title, 'tr'))
  for (const n of rest) push(n, 'other')
  return out.slice(0, limit)
}

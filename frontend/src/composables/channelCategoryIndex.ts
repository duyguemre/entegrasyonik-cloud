/**
 * frontend/src/composables/channelCategoryIndex.ts
 *
 * Pazaryeri/e-ticaret kategori listesi (IntegrationService/retrieveCategoriesFromIntegration; mağaza onu düzleştirir)
 * üzerinde SAF yardımcılar: ebeveyn ilişkisi, tam yol, yaprak arama ve yerel kategori adına göre öneri. Arama
 * tamamen istemcidedir (liste zaten bir kerede yüklenir; sunucuda arama ucu yoktur).
 */
import { fold } from '@/composables/categoryTree'

export interface ChannelCategory {
  _id: string | number
  title: string
  parentId?: string | number | null
  children?: any[]
}

export interface ChannelCategoryIndex {
  byId: Map<string, ChannelCategory>
  parentOf: Map<string, string>
  isLeaf: (id: string) => boolean
  pathIds: (id: string) => string[]
  /** "Giyim › Kadın › Elbise" */
  pathText: (id: string) => string
  leaves: ChannelCategory[]
  /** Kök → dallar ağacı (EkCascadeDialog için). */
  tree: Array<{ id: string; label: string; children: any[]; count?: number }>
}

export function buildChannelIndex(list: ChannelCategory[]): ChannelCategoryIndex {
  const byId = new Map<string, ChannelCategory>(list.map((c) => [String(c._id), c]))
  const kidsOf = (c: ChannelCategory): ChannelCategory[] =>
    (c.children ?? [])
      .map((ch: any) => (ch && typeof ch === 'object' ? byId.get(String(ch._id)) ?? ch : byId.get(String(ch))))
      .filter(Boolean)
  const parentOf = new Map<string, string>()
  for (const c of list) for (const ch of kidsOf(c)) parentOf.set(String(ch._id), String(c._id))
  for (const c of list)
    if (!parentOf.has(String(c._id)) && c.parentId != null && byId.has(String(c.parentId))) parentOf.set(String(c._id), String(c.parentId))

  const hasKids = new Set<string>()
  for (const [, p] of parentOf) hasKids.add(p)
  for (const c of list) if ((c.children?.length ?? 0) > 0) hasKids.add(String(c._id))
  const isLeaf = (id: string) => !hasKids.has(id)

  const pathIds = (id: string): string[] => {
    const out: string[] = []
    let cur: string | undefined = id
    while (cur != undefined && !out.includes(cur)) { out.unshift(cur); cur = parentOf.get(cur) }
    return out
  }
  const pathText = (id: string) => pathIds(id).map((p) => byId.get(p)?.title).filter(Boolean).join(' › ')

  const kids = new Map<string, ChannelCategory[]>()
  const roots: ChannelCategory[] = []
  for (const c of list) {
    const p = parentOf.get(String(c._id))
    if (p == undefined) roots.push(c)
    else { if (!kids.has(p)) kids.set(p, []); kids.get(p)!.push(c) }
  }
  const build = (items: ChannelCategory[]): any[] =>
    items.map((c) => {
      const children = build(kids.get(String(c._id)) ?? [])
      return { id: String(c._id), label: c.title, children, count: children.length ? children.length : undefined }
    })

  return { byId, parentOf, isLeaf, pathIds, pathText, leaves: list.filter((c) => isLeaf(String(c._id))), tree: build(roots) }
}

export interface ChannelHit { id: string; title: string; path: string; score: number }

const tokens = (s: string) => fold(s).split(/[^a-z0-9]+/).filter((t) => t.length > 1)

/** Yerel kategori adına benzerlik: tam ad 3 · biri diğerini içerir 2 · ortak sözcük 1 · yok 0. */
export function similarity(localTitle: string, channelTitle: string): number {
  const a = fold(localTitle.trim())
  const b = fold(channelTitle.trim())
  if (!a || !b) return 0
  if (a === b) return 3
  if (a.includes(b) || b.includes(a)) return 2
  const ta = new Set(tokens(localTitle))
  return tokens(channelTitle).some((t) => ta.has(t)) ? 1 : 0
}

/**
 * Yaprak kanal kategorilerinde tam yol üzerinden arama (en az 2 harf). Sonuç: önce yerel adıyla benzerlik,
 * sonra yol kısalığı. `limit` kadar döner.
 */
export function searchLeaves(index: ChannelCategoryIndex, query: string, localTitle = '', limit = 40): ChannelHit[] {
  const q = fold(query.trim())
  if (q.length < 2) return []
  const hits: ChannelHit[] = []
  for (const c of index.leaves) {
    const id = String(c._id)
    const path = index.pathText(id)
    if (!fold(path).includes(q)) continue
    hits.push({ id, title: c.title, path, score: similarity(localTitle, c.title) })
  }
  hits.sort((x, y) => y.score - x.score || x.path.length - y.path.length || x.path.localeCompare(y.path, 'tr'))
  return hits.slice(0, limit)
}

/** "Önerilen": yerel adla gerçekten benzeyen en iyi (skor ≥ 2) ilk 3 yaprak. */
export function suggestLeaves(index: ChannelCategoryIndex, localTitle: string, limit = 3): ChannelHit[] {
  if (fold(localTitle.trim()).length < 2) return []
  const hits: ChannelHit[] = []
  for (const c of index.leaves) {
    const score = similarity(localTitle, c.title)
    if (score >= 2) hits.push({ id: String(c._id), title: c.title, path: index.pathText(String(c._id)), score })
  }
  hits.sort((x, y) => y.score - x.score || x.path.length - y.path.length)
  return hits.slice(0, limit)
}

const memo = new WeakMap<object, ChannelCategoryIndex>()
/** Aynı liste örneği için indeksi bir kez kurar (mağaza listeyi önbellekler → kanal satırları paylaşır). */
export function channelIndexFor(list: ChannelCategory[]): ChannelCategoryIndex {
  let idx = memo.get(list)
  if (!idx) { idx = buildChannelIndex(list); memo.set(list, idx) }
  return idx
}

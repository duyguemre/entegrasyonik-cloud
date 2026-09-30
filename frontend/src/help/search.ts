/**
 * frontend/src/help/search.ts — yardım merkezi araması (SAF TS; bileşen ve kabuk araması aynı işlevi kullanır).
 *
 *  - Türkçe duyarlı katlama: büyük/küçük harf ve diakritik farkı yok sayılır ("siparis" → "sipariş", "IADE" → "iade").
 *    Katlama karakter başına 1:1'dir → eşleşme konumları özgün metinde aynen kullanılabilir (vurgu kayması yok).
 *  - Tüm sorgu terimleri makalenin BİR yerinde geçmelidir (VE); puan: başlık > anahtar sözcük > özet > gövde.
 *  - Sonuç: makale + başlık/özet vurgu parçaları + gövdeden kısa, vurgulu alıntı.
 */
import type { HelpArticle, HelpBlock } from './types'

const FOLD: Record<string, string> = { ı: 'i', i̇: 'i', ş: 's', ğ: 'g', ü: 'u', ö: 'o', ç: 'c', â: 'a', î: 'i', û: 'u' }

/** Karakter başına katlama (uzunluk korunur). */
export function foldText(text: string): string {
  let out = ''
  for (const ch of String(text ?? '')) {
    let lower = ch.toLocaleLowerCase('tr-TR')
    if (lower.length !== 1) lower = ch.toLowerCase().charAt(0) || ch
    const folded = FOLD[lower] ?? lower
    // Birleşik (surrogate) karakterler: uzunluğu korumak için özgün uzunlukta dolgu.
    out += ch.length === 1 ? folded.charAt(0) : folded.padEnd(ch.length, ' ').slice(0, ch.length)
  }
  return out
}

export function queryTerms(query: string): string[] {
  const terms = foldText(query)
    .split(/[\s,.;:!?()"'“”/\\-]+/)
    .map((t) => t.trim())
    .filter(Boolean)
  const long = terms.filter((t) => t.length >= 2)
  return Array.from(new Set(long.length ? long : terms))
}

export interface HighlightPart {
  text: string
  match: boolean
}

/** Metni eşleşen / eşleşmeyen parçalara böler (bileşen `<mark>` ile çizer; v-html YOK). */
export function highlight(text: string, terms: readonly string[]): HighlightPart[] {
  const source = String(text ?? '')
  if (!terms.length || !source) return [{ text: source, match: false }]
  const folded = foldText(source)
  const hits: Array<[number, number]> = []
  for (const term of terms) {
    if (!term) continue
    let from = 0
    while (from <= folded.length) {
      const at = folded.indexOf(term, from)
      if (at < 0) break
      hits.push([at, at + term.length])
      from = at + term.length
    }
  }
  if (!hits.length) return [{ text: source, match: false }]
  hits.sort((a, b) => a[0] - b[0] || b[1] - a[1])
  const merged: Array<[number, number]> = []
  for (const h of hits) {
    const last = merged[merged.length - 1]
    if (last && h[0] <= last[1]) last[1] = Math.max(last[1], h[1])
    else merged.push([h[0], h[1]])
  }
  const parts: HighlightPart[] = []
  let cursor = 0
  for (const [s, e] of merged) {
    if (s > cursor) parts.push({ text: source.slice(cursor, s), match: false })
    parts.push({ text: source.slice(s, e), match: true })
    cursor = e
  }
  if (cursor < source.length) parts.push({ text: source.slice(cursor), match: false })
  return parts
}

/** `**kalın**` işaretini arama/alıntı için düz metne indirger. */
export function plain(text: string): string {
  return String(text ?? '').replace(/\*\*(.+?)\*\*/g, '$1')
}

/** Gövde bloklarının aranabilir düz metni. Otomatik bloklar (`extra`) çağıran tarafından üretilen metinle beslenir. */
export function blockTexts(blocks: readonly HelpBlock[], extra: Partial<Record<'shortcuts' | 'integrationErrors' | 'channelGuides', string[]>> = {}): string[] {
  const out: string[] = []
  for (const b of blocks) {
    switch (b.type) {
      case 'p':
      case 'h':
      case 'note':
        out.push(plain(b.text))
        break
      case 'steps':
      case 'list':
        out.push(...b.items.map(plain))
        break
      case 'table':
        out.push(b.head.join(' '), ...b.rows.map((r) => r.map(plain).join(' — ')))
        break
      case 'faq':
        for (const item of b.items) out.push(plain(item.q), plain(item.a))
        break
      case 'shortcuts':
      case 'integrationErrors':
      case 'channelGuides':
        out.push(...(extra[b.type] ?? []))
        break
    }
  }
  return out.filter(Boolean)
}

export interface HelpSearchDoc {
  article: HelpArticle
  /** Gövdenin düz metin cümleleri/satırları. */
  lines: string[]
  categoryTitle?: string
}

export interface HelpSearchResult {
  article: HelpArticle
  score: number
  title: HighlightPart[]
  summary: HighlightPart[]
  /** Gövdeden eşleşme çevresi (yoksa boş). */
  excerpt: HighlightPart[]
}

const EXCERPT_RADIUS = 70

function excerptFor(lines: string[], terms: string[]): HighlightPart[] {
  for (const line of lines) {
    const folded = foldText(line)
    const at = terms.map((t) => folded.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0]
    if (at === undefined) continue
    const start = Math.max(0, at - EXCERPT_RADIUS)
    const end = Math.min(line.length, at + EXCERPT_RADIUS * 1.6)
    // Sözcük sınırına yasla.
    const s = start === 0 ? 0 : line.indexOf(' ', start) + 1 || start
    const eCut = line.lastIndexOf(' ', end)
    const e = end >= line.length ? line.length : eCut > at ? eCut : end
    const text = `${s > 0 ? '… ' : ''}${line.slice(s, e).trim()}${e < line.length ? ' …' : ''}`
    return highlight(text, terms)
  }
  return []
}

function countIn(folded: string, term: string, cap: number): number {
  let n = 0
  let from = 0
  while (n < cap) {
    const at = folded.indexOf(term, from)
    if (at < 0) break
    n++
    from = at + term.length
  }
  return n
}

function wordStart(folded: string, term: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(folded)
}

/** Makale listesinde arar; en iyi eşleşme önce. Boş sorgu → boş liste. */
export function searchHelp(docs: readonly HelpSearchDoc[], query: string, limit = 50): HelpSearchResult[] {
  const terms = queryTerms(query)
  if (!terms.length) return []
  const results: HelpSearchResult[] = []
  for (const doc of docs) {
    const a = doc.article
    const fTitle = foldText(a.title)
    const fSummary = foldText(a.summary)
    const fKeywords = foldText((a.keywords ?? []).join(' '))
    const fCategory = foldText(doc.categoryTitle ?? '')
    const fBody = doc.lines.map(foldText).join('\n')
    let score = 0
    let all = true
    for (const term of terms) {
      let s = 0
      if (fTitle.includes(term)) s += wordStart(fTitle, term) ? 14 : 9
      if (fKeywords.includes(term)) s += 6
      if (fSummary.includes(term)) s += 4
      if (fCategory.includes(term)) s += 2
      s += countIn(fBody, term, 4)
      if (s === 0) {
        all = false
        break
      }
      score += s
    }
    if (!all) continue
    if (terms.length > 1 && fTitle.includes(terms.join(' '))) score += 10
    results.push({
      article: a,
      score,
      title: highlight(a.title, terms),
      summary: highlight(a.summary, terms),
      excerpt: excerptFor(doc.lines, terms),
    })
  }
  return results.sort((x, y) => y.score - x.score || x.article.title.localeCompare(y.article.title, 'tr')).slice(0, limit)
}

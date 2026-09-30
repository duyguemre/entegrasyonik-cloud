/**
 * frontend/src/help/index.ts — yardım içerik KAYDI (tek giriş). SAF TS (vue yok).
 *
 *  - Makaleler: TR tam (`content/tr/articles.ts`); EN başlık + özet (+ varsa gövde) (`content/en/articles.ts`).
 *    EN gövdesi olmayan makalede TR gövdesi gösterilir ve `bodyLocale: 'tr'` ile işaretlenir (ekran not düşer).
 *  - Sayfa yardımı: `pageHelp.ts` — ekran anahtarı (`stores/site/menu.ts` views) → amaç/ipuçları/kısayollar/makale.
 *  - İpuçları: `hints.ts` — kritik alanların (?) metinleri.
 */
import { ARTICLES_TR } from './content/tr/articles'
import { ARTICLES_EN } from './content/en/articles'
import { PAGE_HELP } from './pageHelp'
import { HELP_CATEGORIES, helpCategory } from './categories'
import { autoBlockSearchText } from './autoBlocks'
import { blockTexts, searchHelp, type HelpSearchDoc, type HelpSearchResult } from './search'
import type { HelpArticle, HelpLocale, PageHelp } from './types'

export { HELP_CATEGORIES, helpCategory }
export type { HelpArticle, HelpLocale, PageHelp }

export { HELP_SCREEN_KEY, HELP_SCREEN_SLUG } from './helpLink'

export interface LocalizedHelpArticle extends HelpArticle {
  /** Gövdenin hangi dilde olduğu (EN çevirisi yoksa 'tr'). */
  bodyLocale: HelpLocale
}

export function normalizeLocale(locale: string | undefined): HelpLocale {
  return String(locale ?? '').toLowerCase().startsWith('en') ? 'en' : 'tr'
}

const cache = new Map<HelpLocale, LocalizedHelpArticle[]>()

export function getHelpArticles(locale: string = 'tr'): LocalizedHelpArticle[] {
  const loc = normalizeLocale(locale)
  const hit = cache.get(loc)
  if (hit) return hit
  const list = ARTICLES_TR.map<LocalizedHelpArticle>((a) => {
    if (loc === 'tr') return { ...a, bodyLocale: 'tr' }
    const t = ARTICLES_EN[a.id]
    if (!t) return { ...a, bodyLocale: 'tr' }
    return {
      ...a,
      title: t.title,
      summary: t.summary,
      body: t.body ?? a.body,
      goTo: a.goTo?.map((g, i) => ({ ...g, label: t.goToLabels?.[i] ?? g.label })),
      bodyLocale: t.body ? 'en' : 'tr',
    }
  }).sort((x, y) => {
    const cx = helpCategory(x.category)?.order ?? 99
    const cy = helpCategory(y.category)?.order ?? 99
    return cx - cy || (x.order ?? 99) - (y.order ?? 99)
  })
  cache.set(loc, list)
  return list
}

export function getHelpArticle(id: string | undefined | null, locale = 'tr'): LocalizedHelpArticle | undefined {
  if (!id) return undefined
  return getHelpArticles(locale).find((a) => a.id === id)
}

export function articlesInCategory(categoryId: string, locale = 'tr'): LocalizedHelpArticle[] {
  return getHelpArticles(locale).filter((a) => a.category === categoryId)
}

const docCache = new Map<HelpLocale, HelpSearchDoc[]>()

function searchDocs(locale: string): HelpSearchDoc[] {
  const loc = normalizeLocale(locale)
  const hit = docCache.get(loc)
  if (hit) return hit
  const extra = autoBlockSearchText()
  const docs = getHelpArticles(loc).map((article) => ({
    article,
    lines: blockTexts(article.body, extra),
    categoryTitle: helpCategory(article.category)?.title[loc],
  }))
  docCache.set(loc, docs)
  return docs
}

export function searchHelpArticles(query: string, locale = 'tr', limit = 50): HelpSearchResult[] {
  return searchHelp(searchDocs(locale), query, limit)
}

export { PAGE_HELP }
export { pageHelpFor } from './pageHelpLookup'

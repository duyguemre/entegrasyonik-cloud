/**
 * Ana sayfa bağlantı yardımcıları. Henüz yayımlanmamış sayfalara (S2b/S4/S5) kırık bağlantı üretilmez:
 * `navigation.ts` içindeki `published` bayrağı çevrilince bağlantılar kendiliğinden görünür.
 */
import { primaryNav, published } from '../../data/navigation'

/** Yol yayımlanmışsa href, değilse `undefined` (çağıran bağlantıyı hiç render etmez). */
export const pageHref = (path: string): string | undefined => published(primaryNav).find((i) => i.href === path)?.href

/** ["A","B","C"] -> "A, B ve C". */
export const joinTr = (items: string[]): string =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} ve ${items[items.length - 1]}`

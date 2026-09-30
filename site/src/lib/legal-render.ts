/**
 * Yasal içerik görüntüleyici yardımcıları (ADR-0014 S5). Bağımlılık yok; girdi YALNIZCA repodaki
 * `src/data/legal/*.ts` dosyalarıdır (kullanıcı girdisi değil). Yine de önce HTML'e kaçırılır, sonra yalnızca
 * üç işaretleme dönüştürülür: **kalın**, [etiket](iç-yol), {{YER_TUTUCU}}.
 */
import type { LegalDoc } from '../data/legal/types'
import { placeholderValues } from '../data/legal/placeholders'

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c])
}

/** Yer tutucu deseni: büyük harf (Türkçe dahil), rakam, alt çizgi. */
export const PLACEHOLDER_PATTERN = /\{\{([A-ZÇĞİÖŞÜ0-9_]+)\}\}/g
/** Yalnızca site içi mutlak yol veya sayfa içi bağlantı — dış bağlantı yasal metinde yok. */
const LINK_PATTERN = /\[([^\]]+)\]\((\/[a-z0-9\-/]*(?:#[a-z0-9-]+)?)\)/g

/**
 * S16: değeri verilmiş yer tutucular (`placeholderValues`) değerle değiştirilir (`data-ph-value`, HTML'e kaçırılmış);
 * diğerleri vurgulu `<mark>` olarak kalır.
 */
export function renderInline(text: string, values: Partial<Record<string, string>> = placeholderValues): string {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(LINK_PATTERN, '<a href="$2">$1</a>')
    .replace(PLACEHOLDER_PATTERN, (_m, key: string) => {
      const value = values[key]
      return value ? `<span class="ph-value" data-ph-value="${key}">${escapeHtml(value)}</span>` : `<mark class="ph" data-ph="${key}">{{${key}}}</mark>`
    })
}

/** Belgenin tüm metin alanları (notlar dahil) — yer tutucu/bağlantı taraması için. */
export function collectTexts(doc: LegalDoc): string[] {
  const out: string[] = [doc.title, doc.summary, doc.description]
  for (const section of doc.sections) {
    out.push(section.title)
    for (const block of section.blocks) {
      switch (block.type) {
        case 'p':
        case 'h3':
        case 'note':
          out.push(block.text)
          break
        case 'ul':
        case 'ol':
          out.push(...block.items)
          break
        case 'table':
          out.push(block.caption, ...block.head, ...block.rows.flat())
          break
      }
    }
  }
  return out
}

/** Belgede geçen benzersiz yer tutucu anahtarları (ilk geçiş sırasıyla). */
export function usedPlaceholderKeys(doc: LegalDoc): string[] {
  const keys = new Set<string>()
  for (const text of collectTexts(doc)) {
    for (const m of text.matchAll(PLACEHOLDER_PATTERN)) keys.add(m[1])
  }
  return [...keys]
}

/** Hâlâ değer bekleyen yer tutucular (çözülmüşler hariç) — sayfa sonundaki alan listesi bunları gösterir. */
export function pendingPlaceholderKeys(doc: LegalDoc, values: Partial<Record<string, string>> = placeholderValues): string[] {
  return usedPlaceholderKeys(doc).filter((k) => !values[k])
}

/** Belgedeki iç bağlantı hedefleri (`/yasal/...`) — bağlantı bütünlüğü testi için. */
export function internalLinks(doc: LegalDoc): string[] {
  const links: string[] = []
  for (const text of collectTexts(doc)) {
    for (const m of text.matchAll(LINK_PATTERN)) links.push(m[2])
  }
  return links
}

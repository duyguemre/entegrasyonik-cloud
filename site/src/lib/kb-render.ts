/**
 * Rehber satır içi işaretleme (S20). Girdi YALNIZCA `src/data/kb/**` kayıtlarıdır; önce HTML'e kaçırılır, sonra
 * yalnızca iki biçim dönüştürülür: **kalın** ve [etiket](/site-ici-yol#capa). Dış bağlantı metin içinde yoktur
 * (kaynaklar ayrı listede, `rel="noopener"` ile verilir).
 */
import { escapeHtml } from './legal-render'

/** Yalnızca site içi mutlak yol ve/veya çapa. */
export const KB_LINK_PATTERN = /\[([^\]]+)\]\(((?:\/[a-z0-9\-/]*)?(?:#[a-z0-9-]+)?)\)/g

export function renderKbInline(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(KB_LINK_PATTERN, '<a href="$2">$1</a>')
}

/** JSON-LD ve meta için düz metin: işaretleme atılır, bağlantı etiketi kalır. */
export function plainKb(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(KB_LINK_PATTERN, '$1')
}

/** Kayıttaki iç bağlantı hedefleri (bağlantı bütünlüğü testi için). */
export function kbLinks(text: string): string[] {
  return [...text.matchAll(KB_LINK_PATTERN)].map((m) => m[2])
}

/** ISO tarih (YYYY-AA-GG) → "30 Eylül 2026". */
export function formatTrDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('tr-TR', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })
}

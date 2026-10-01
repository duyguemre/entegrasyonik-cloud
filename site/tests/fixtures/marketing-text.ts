/** Derlenmiş HTML'den ziyaretçiye görünen metin + başlık + meta açıklamalar (JSON-LD ve gizli dev notları hariç). */
const decode = (s: string) =>
  s.replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')

export function marketingText(html: string): string {
  const metas = [...html.matchAll(/<meta (?:name|property)="(?:description|og:description|og:title)" content="([^"]*)"/g)].map((m) => m[1])
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? ''
  const body = html
    .replace(/<head[\s\S]*?<\/head>/g, '')
    .replace(/<(script|style|template)[\s\S]*?<\/\1>/g, '')
    .replace(/<[^>]+>/g, ' ')
  return decode([title, ...metas, body].join('\n')).replace(/\s+/g, ' ')
}

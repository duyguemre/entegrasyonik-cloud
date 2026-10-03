/**
 * frontend/src/components/legal/LegalInline.ts
 *
 * Yasal metin satır içi işaretlemesini (site/src/data/legal/types.ts: **kalın**, [etiket](/yol), {{YER_TUTUCU}})
 * `v-html` KULLANMADAN Vue düğümlerine çevirir — metin her zaman metin düğümü olarak basılır (kaçırma gerekmez).
 * Söz dizimi ve yer tutucu değerleri sitenin kanonik kaynağından (`legal-render.ts` ile aynı desenler).
 *
 *   /yasal/<slug>  → uygulama içi /legal/<slug> (RouterLink)
 *   diğer iç yol   → sitenin aynı sayfası (yeni sekme)
 */
import { defineComponent, h, type VNodeChild } from 'vue'
import { RouterLink } from 'vue-router'
import { placeholderValues } from '@site/data/legal/placeholders'
import { siteUrl } from '@/config/siteLinks'

const TOKEN = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((\/[a-z0-9\-/]*(?:#[a-z0-9-]+)?)\)|\{\{([A-ZÇĞİÖŞÜ0-9_]+)\}\}/g

function link(label: string, path: string): VNodeChild {
  if (path.startsWith('/yasal/')) return h(RouterLink, { to: path.replace('/yasal/', '/legal/') }, () => label)
  return h('a', { href: siteUrl(path), target: '_blank', rel: 'noopener' }, label)
}

export function renderLegalInline(text: string): VNodeChild[] {
  const out: VNodeChild[] = []
  let last = 0
  for (const m of text.matchAll(TOKEN)) {
    if (m.index! > last) out.push(text.slice(last, m.index))
    if (m[1] !== undefined) out.push(h('strong', renderLegalInline(m[1])))
    else if (m[2] !== undefined) out.push(link(m[2], m[3]))
    else {
      const key = m[4]
      const value = (placeholderValues as Partial<Record<string, string>>)[key]
      out.push(value ? h('span', { class: 'ph-value', 'data-ph-value': key }, value) : h('mark', { class: 'ph', 'data-ph': key }, `{{${key}}}`))
    }
    last = m.index! + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export default defineComponent({
  name: 'LegalInline',
  props: { text: { type: String, required: true } },
  setup(props) {
    return () => renderLegalInline(props.text)
  },
})

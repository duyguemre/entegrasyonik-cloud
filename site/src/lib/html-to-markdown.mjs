// Sayfa başına markdown alternatifi (S19, llmstxt.org önerisi: `/sayfa.md`). Derleme sonunda (astro.config.mjs →
// `astro:build:done`) derlenmiş HTML'in YALNIZCA <main> içeriği temiz markdown'a çevrilir; yeni metin üretilmez →
// markdown, görünür sayfayla birebir aynı iddiaları taşır (claims/llms testleri aynı denetimi .md'ye de uygular).
//
// Atlananlar: görünmez içerik (`hidden`, `aria-hidden="true"`, `.sr-only`), betik/stil/SVG/form denetimleri, ekmek
// kırıntısı gezinmesi (`nav`), `data-md-skip` işaretli dekoratif bloklar.
import { parse, ELEMENT_NODE, TEXT_NODE } from 'ultrahtml'

const SKIP_TAGS = new Set([
  'script', 'style', 'svg', 'noscript', 'template', 'button', 'input', 'select', 'textarea', 'label', 'form',
  'canvas', 'iframe', 'video', 'audio', 'picture', 'img', 'nav', 'dialog', 'head',
])
const BLOCK_TAGS = new Set([
  'p', 'div', 'section', 'article', 'aside', 'header', 'footer', 'main', 'figure', 'figcaption', 'blockquote',
  'details', 'fieldset', 'address', 'hgroup', 'ul', 'ol', 'dl', 'table', 'hr',
])

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', shy: '' }
export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

const isHidden = (node) => {
  const a = node.attributes ?? {}
  if ('hidden' in a || a['aria-hidden'] === 'true' || 'data-md-skip' in a) return true
  const cls = ` ${a.class ?? ''} `
  return cls.includes(' sr-only ') || cls.includes(' visually-hidden ')
}

const inlineText = (s) => s.replace(/\s+/g, ' ')
const escapeMd = (s) => s.replace(/([\\`*_[\]])/g, '\\$1')

/**
 * @param {string} html  Tam sayfa HTML'i ya da bir parça.
 * @param {{ resolveHref?: (href: string) => string }} [opts]
 * @returns {string}
 */
export function htmlToMarkdown(html, opts = {}) {
  const resolveHref = opts.resolveHref ?? ((h) => h)
  const main = html.match(/<main\b[^>]*>([\s\S]*)<\/main>/i)
  const doc = parse(main ? main[1] : html)

  /** Satır içi (tek satır) metin: blok ayraçları boşluğa iner. */
  const flat = (node) => inlineText(render(node)).trim()

  let lastHeading = 1

  /**
   * Çocukları birleştirir. Tarayıcıda blok görünen ama satır içi etiketle yazılmış kardeşler (ör. <strong>Başlık</strong>
   * <span>Açıklama</span>, boşluksuz) yapışmasın diye iki ELEMAN kardeş arasına gerekirse boşluk konur.
   */
  function children(node) {
    let out = ''
    let prevWasElement = false
    for (const c of node.children ?? []) {
      const piece = render(c)
      if (!piece) continue
      const isEl = c.type === ELEMENT_NODE
      if (isEl && prevWasElement && /\S$/.test(out) && /^[^\s.,;:!?)\]]/.test(piece)) out += ' '
      out += piece
      prevWasElement = isEl
    }
    return out
  }

  function render(node) {
    if (node.type === TEXT_NODE) return escapeMd(inlineText(decodeEntities(node.value)))
    if (node.type !== ELEMENT_NODE && node.children) return children(node)
    if (node.type !== ELEMENT_NODE) return ''
    const tag = node.name.toLowerCase()
    if (SKIP_TAGS.has(tag) || isHidden(node)) return ''

    const h = /^h([1-6])$/.exec(tag)
    if (h) {
      const text = flat({ ...node, name: 'span' })
      if (!text) return ''
      lastHeading = Number(h[1])
      return `\n\n${'#'.repeat(lastHeading)} ${text}\n\n`
    }
    switch (tag) {
      case 'br':
        return '\n'
      case 'hr':
        return '\n\n---\n\n'
      case 'strong':
      case 'b': {
        const t = children(node).trim()
        return t ? `**${t}**` : ''
      }
      case 'em':
      case 'i': {
        const t = children(node).trim()
        return t ? `*${t}*` : ''
      }
      case 'code': {
        const t = inlineText(decodeEntities(textOf(node))).trim()
        return t ? `\`${t}\`` : ''
      }
      case 'a': {
        const text = children(node).replace(/\s+/g, ' ').trim()
        const href = node.attributes?.href
        if (!text) return ''
        if (!href || href.startsWith('#') || href.startsWith('javascript:')) return text
        return `[${text}](${resolveHref(decodeEntities(href))})`
      }
      case 'summary': {
        // Akordeon sorusu: son başlığın bir alt düzeyinde başlık (SSS soru-cevap yapısı markdown'da korunur).
        const t = flat({ ...node, name: 'span' })
        return t ? `\n\n${'#'.repeat(Math.min(lastHeading + 1, 6))} ${t}\n\n` : ''
      }
      case 'ul':
      case 'ol': {
        let n = 0
        const items = (node.children ?? [])
          .filter((c) => c.type === ELEMENT_NODE && c.name.toLowerCase() === 'li' && !isHidden(c))
          .map((li) => {
            const body = children(li)
              .replace(/\n{2,}/g, '\n')
              .split('\n')
              .map((l) => l.trim())
              .filter(Boolean)
            if (body.length === 0) return ''
            n += 1
            const bullet = tag === 'ol' ? `${n}. ` : '- '
            return [bullet + body[0], ...body.slice(1).map((l) => `  ${l}`)].join('\n')
          })
          .filter(Boolean)
        return items.length ? `\n\n${items.join('\n')}\n\n` : ''
      }
      case 'dl': {
        const out = []
        for (const c of node.children ?? []) {
          if (c.type !== ELEMENT_NODE || isHidden(c)) continue
          const t = flat(c)
          if (!t) continue
          if (c.name.toLowerCase() === 'dt') out.push(`- **${t}**`)
          else if (c.name.toLowerCase() === 'dd') out.push(out.length ? `  ${t}` : `- ${t}`)
          else out.push(`- ${t}`)
        }
        return out.length ? `\n\n${out.join('\n')}\n\n` : ''
      }
      case 'table': {
        const rows = []
        const walkRows = (n) => {
          for (const c of n.children ?? []) {
            if (c.type !== ELEMENT_NODE || isHidden(c)) continue
            if (c.name.toLowerCase() === 'tr') {
              const cells = (c.children ?? [])
                .filter((x) => x.type === ELEMENT_NODE && /^t[hd]$/i.test(x.name) && !isHidden(x))
                .map((x) => flat(x).replace(/\|/g, '\\|'))
              if (cells.length) rows.push(cells)
            } else walkRows(c)
          }
        }
        walkRows(node)
        if (rows.length === 0) return ''
        const width = Math.max(...rows.map((r) => r.length))
        const pad = (r) => [...r, ...Array(width - r.length).fill('')]
        const lines = [`| ${pad(rows[0]).join(' | ')} |`, `| ${Array(width).fill('---').join(' | ')} |`]
        for (const r of rows.slice(1)) lines.push(`| ${pad(r).join(' | ')} |`)
        return `\n\n${lines.join('\n')}\n\n`
      }
      case 'blockquote': {
        const t = children(node).trim()
        return t ? `\n\n${t.split('\n').map((l) => `> ${l}`).join('\n')}\n\n` : ''
      }
      default: {
        const inner = children(node)
        return BLOCK_TAGS.has(tag) || tag === 'li' || tag === 'dt' || tag === 'dd' ? `\n\n${inner}\n\n` : inner
      }
    }
  }

  const out = children(doc)
  return (
    out
      .split('\n')
      .map((l) => l.replace(/[ \t]+$/g, '').replace(/^[ \t]+(?![-\d])/, ''))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n'
  )
}

function textOf(node) {
  if (node.type === TEXT_NODE) return node.value
  return (node.children ?? []).map(textOf).join('')
}

/**
 * Güvenli markdown alt kümesi (CHAT_UI_CONTRACT.md §4.3, ADR-0034 Karar 2). `markdown-it` YALNIZ ayrıştırma için
 * (`html:false`, `linkify:false`); token'lar izinli listeden Vue VNode'a çevrilir — `v-html`/`innerHTML` YOK.
 *
 * İzinli: paragraf, satır sonu, kalın, italik, satır içi kod, kod bloğu (dil etiketi yok sayılır), sırasız/sıralı liste
 * (derinlik ≤ 2; daha derini düz metin satırı olur), başlık (hangi seviye olursa olsun paket stilinde KÜÇÜK başlık;
 * h1–h6 öğesi DEĞİL), alıntı.
 * Yasak → düz metin: ham HTML, görsel, bağlantı (`[a](b)` ve çıplak URL tıklanamaz metin), tablo sözdizimi, dipnot,
 * üstü çizili, yatay çizgi. Bilinmeyen token → içerik metni.
 */
import MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'
import { h, type VNode, type VNodeChild } from 'vue'

const md = new MarkdownIt('commonmark', { html: false, linkify: false, breaks: true, typographer: false })
// Kural düzeyinde kapatma: bu sözdizimleri hiç token üretmez, kaynak metin olduğu gibi kalır.
md.disable(['link', 'image', 'autolink', 'html_inline', 'html_block', 'hr', 'reference', 'lheading'])

export const MAX_LIST_DEPTH = 2

export function parseMarkdown(source: string): Token[] {
  return md.parse(source ?? '', {})
}

const CLS = {
  p: 'ek-chat-md__p',
  heading: 'ek-chat-md__heading',
  code: 'ek-chat-md__code',
  pre: 'ek-chat-md__pre',
  quote: 'ek-chat-md__quote',
  list: 'ek-chat-md__list',
  item: 'ek-chat-md__item',
  flat: 'ek-chat-md__flat',
}

/** Satır içi çocuk token'ları → VNode'lar. İzinli olmayan her şey metindir. */
function renderInline(tokens: Token[] | null): VNodeChild[] {
  if (!tokens) return []
  const root: VNodeChild[] = []
  const stack: Array<{ tag: 'strong' | 'em'; children: VNodeChild[] }> = []
  const push = (node: VNodeChild) => (stack.length ? stack[stack.length - 1].children : root).push(node)

  for (const tok of tokens) {
    switch (tok.type) {
      case 'text':
        push(tok.content)
        break
      case 'softbreak':
      case 'hardbreak':
        push(h('br'))
        break
      case 'code_inline':
        push(h('code', { class: CLS.code }, tok.content))
        break
      case 'strong_open':
        stack.push({ tag: 'strong', children: [] })
        break
      case 'em_open':
        stack.push({ tag: 'em', children: [] })
        break
      case 'strong_close':
      case 'em_close': {
        const frame = stack.pop()
        if (frame) push(h(frame.tag, frame.children))
        break
      }
      default:
        // Beklenmeyen satır içi token (ör. ileride açılan bir kural): yalnız metni.
        if (tok.content) push(tok.content)
        else if (tok.markup && !tok.type.endsWith('_close') && !tok.type.endsWith('_open')) push(tok.markup)
    }
  }
  // Kapanmamış çerçeve (bozuk girdi) → çocuklarını düz ekle.
  while (stack.length) {
    const frame = stack.pop()!
    push(h(frame.tag, frame.children))
  }
  return root
}

function inlineText(tokens: Token[] | null): string {
  if (!tokens) return ''
  return tokens.map((t) => (t.type === 'softbreak' || t.type === 'hardbreak' ? ' ' : t.content)).join('')
}

interface Cursor {
  i: number
}

/** `open` token'ından başlayıp eşleşen `close`'a kadar bloğu çizer. */
function renderBlocks(tokens: Token[], cur: Cursor, closeType: string | null, depth: number): VNode[] {
  const out: VNode[] = []
  while (cur.i < tokens.length) {
    const tok = tokens[cur.i]
    if (closeType && tok.type === closeType) {
      cur.i++
      return out
    }
    cur.i++
    switch (tok.type) {
      case 'paragraph_open': {
        const inline = tokens[cur.i]?.type === 'inline' ? tokens[cur.i++] : null
        if (tokens[cur.i]?.type === 'paragraph_close') cur.i++
        // Sıkı listelerde paragraf gizlidir (`hidden`): metin doğrudan öğe içeriği.
        if (tok.hidden) out.push(h('span', renderInline(inline?.children ?? null)))
        else out.push(h('p', { class: CLS.p }, renderInline(inline?.children ?? null)))
        break
      }
      case 'heading_open': {
        const inline = tokens[cur.i]?.type === 'inline' ? tokens[cur.i++] : null
        if (tokens[cur.i]?.type === 'heading_close') cur.i++
        out.push(h('p', { class: CLS.heading }, renderInline(inline?.children ?? null)))
        break
      }
      case 'blockquote_open':
        out.push(h('blockquote', { class: CLS.quote }, renderBlocks(tokens, cur, 'blockquote_close', depth)))
        break
      case 'bullet_list_open':
      case 'ordered_list_open': {
        const ordered = tok.type === 'ordered_list_open'
        const close = ordered ? 'ordered_list_close' : 'bullet_list_close'
        if (depth >= MAX_LIST_DEPTH) {
          // Derinlik sınırı: iç liste düz metin satırlarına iner (markup korunur, girinti yok).
          out.push(...flattenList(tokens, cur, close))
          break
        }
        const items = renderBlocks(tokens, cur, close, depth + 1)
        const start = ordered ? Number(tok.attrGet('start') ?? 1) : undefined
        out.push(h(ordered ? 'ol' : 'ul', { class: CLS.list, ...(ordered && start && start !== 1 ? { start } : {}) }, items))
        break
      }
      case 'list_item_open':
        out.push(h('li', { class: CLS.item }, renderBlocks(tokens, cur, 'list_item_close', depth)))
        break
      case 'fence':
      case 'code_block':
        // Dil etiketi (`tok.info`) YOK SAYILIR; sözdizimi renklendirme yok.
        out.push(h('pre', { class: CLS.pre }, [h('code', tok.content.replace(/\n$/, ''))]))
        break
      case 'inline':
        out.push(h('span', renderInline(tok.children)))
        break
      default:
        // Bilinmeyen blok token: içerik metni (boşsa atlanır).
        if (tok.content) out.push(h('p', { class: CLS.p }, tok.content))
    }
  }
  return out
}

/** Derin liste → her öğe bir düz metin satırı ("- metin" / "1. metin"). */
function flattenList(tokens: Token[], cur: Cursor, close: string): VNode[] {
  const lines: VNode[] = []
  let level = 1
  while (cur.i < tokens.length && level > 0) {
    const tok = tokens[cur.i++]
    if (tok.type === 'bullet_list_open' || tok.type === 'ordered_list_open') level++
    else if (tok.type === 'bullet_list_close' || tok.type === 'ordered_list_close') {
      level--
      if (level === 0 && tok.type === close) break
    } else if (tok.type === 'inline') lines.push(h('span', { class: CLS.flat }, `${'– '}${inlineText(tok.children)}`))
  }
  return lines
}

/** Markdown kaynağı → VNode listesi (render fonksiyonunda doğrudan kullanılır). */
export function renderMarkdown(source: string): VNode[] {
  const tokens = parseMarkdown(source)
  return renderBlocks(tokens, { i: 0 }, null, 0)
}

/** Düz metin → paragraflar (boş satır ayırır, tek satır sonu `<br>`). */
export function renderPlain(source: string): VNode[] {
  return (source ?? '')
    .split(/\n{2,}/)
    .filter((block) => block.length > 0)
    .map((block) => {
      const lines = block.split('\n')
      const children: VNodeChild[] = []
      lines.forEach((line, i) => {
        if (i > 0) children.push(h('br'))
        children.push(line)
      })
      return h('p', { class: CLS.p }, children)
    })
}

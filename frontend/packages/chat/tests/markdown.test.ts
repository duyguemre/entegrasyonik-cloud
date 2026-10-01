// §9 renderMarkdown: XSS vektörleri düz metin; izinli öğeler doğru VNode. v-html YOK (statik test ayrı).
import { describe, expect, it } from 'vitest'
import { renderToString } from '@vue/server-renderer'
import { createSSRApp, h } from 'vue'
import { renderMarkdown, renderPlain } from '../src/markdown/renderMarkdown'

async function html(source: string, plain = false) {
  const app = createSSRApp({ render: () => h('div', plain ? renderPlain(source) : renderMarkdown(source)) })
  return renderToString(app)
}

describe('güvenli alt küme — yasaklar düz metin', () => {
  it('<img src=x onerror=…> → kaçışlı metin, img öğesi yok', async () => {
    const out = await html('<img src=x onerror=alert(1)>')
    expect(out).not.toMatch(/<img/i)
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })
  it('<script> → metin', async () => {
    const out = await html('<script>alert(1)</script>\n\nmerhaba')
    expect(out).not.toMatch(/<script/i)
    expect(out).toContain('&lt;script&gt;')
  })
  it('[x](javascript:…) ve çıplak URL → tıklanamaz metin (a öğesi yok)', async () => {
    const out = await html('[tıkla](javascript:alert(1)) ve https://ornek.invalid/yol')
    expect(out).not.toMatch(/<a[\s>]/i)
    expect(out).not.toMatch(/href=/i)
    expect(out).toContain('[tıkla](javascript:alert(1))')
    expect(out).toContain('https://ornek.invalid/yol')
  })
  it('görsel sözdizimi, tablo sözdizimi, yatay çizgi, üstü çizili metin olarak kalır', async () => {
    const out = await html('![g](x.png)\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n---\n\n~~s~~')
    expect(out).not.toMatch(/<(img|table|hr|s|del)[\s>]/i)
    expect(out).toContain('![g](x.png)')
    expect(out).toContain('| a | b |')
    expect(out).toContain('~~s~~')
  })
  it('HTML öznitelik/olay enjeksiyonu kod bloğunda da metin', async () => {
    const out = await html('```html\n<div onclick="x()">a</div>\n```')
    expect(out).toContain('<pre class="ek-chat-md__pre"><code>&lt;div onclick=&quot;x()&quot;&gt;a&lt;/div&gt;</code></pre>')
  })
})

describe('izinli öğeler', () => {
  it('paragraf, kalın, italik, satır içi kod, satır sonu', async () => {
    const out = await html('**kalın** ve *italik* `kod`\nyeni satır')
    expect(out).toContain('<strong>kalın</strong>')
    expect(out).toContain('<em>italik</em>')
    expect(out).toContain('<code class="ek-chat-md__code">kod</code>')
    expect(out).toContain('<br>')
  })
  it('başlık h1–h6 öğesi DEĞİL, paket stilinde küçük başlık', async () => {
    const out = await html('### Özet\n\n#### Alt')
    expect(out).not.toMatch(/<h[1-6]/)
    expect(out).toContain('<p class="ek-chat-md__heading">Özet</p>')
  })
  it('sırasız/sıralı liste; derinlik > 2 düz metin satırı', async () => {
    const out = await html('- a\n  - b\n    - c\n\n3. üç\n4. dört')
    expect(out).toContain('<ul class="ek-chat-md__list">')
    expect((out.match(/<ul/g) ?? []).length).toBe(2)
    expect(out).toContain('ek-chat-md__flat')
    expect(out).toContain('<ol class="ek-chat-md__list" start="3">')
  })
  it('alıntı ve kod bloğu (dil etiketi yok sayılır)', async () => {
    const out = await html('> alıntı\n\n```ts\nconst a = 1\n```')
    expect(out).toContain('<blockquote class="ek-chat-md__quote">')
    expect(out).toContain('<code>const a = 1</code>')
    expect(out).not.toContain('language-')
  })
  it('düz metin kipi: paragraflar + br, markdown işlenmez', async () => {
    const out = await html('**x**\nsatır\n\nikinci', true)
    expect(out).toContain('**x**<br>satır')
    expect((out.match(/<p /g) ?? []).length).toBe(2)
  })
})

/**
 * HTML metin/öznitelik bağlamı için kaçış (R7 / G-01 ailesi).
 *
 * KULLANIM: yalnızca bir kütüphane HTML DİZESİ istediğinde (ör. ECharts `tooltip.formatter`,
 * içeriği `innerHTML` ile basar). Vue şablonlarında `{{ }}` zaten kaçışlıdır — orada gerekmez;
 * `v-html` ise kullanılmaz (bkz. tests/security/no-unsafe-html.test.ts).
 */
const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch])
}

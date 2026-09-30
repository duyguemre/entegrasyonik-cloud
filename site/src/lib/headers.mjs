/**
 * Güvenlik başlıkları (ADR-0014 Karar 1). Tek kaynak: bu modül.
 * `astro build` sonunda `dist/_headers` olarak yazılır (astro.config.mjs → entegrasyon);
 * statik sunucu/CDN (Cloudflare Pages, Render Static, ...) bu dosyayı uygular.
 * Üçüncü taraf origin YOK: font dahil her şey aynı origin'den.
 */

/** @param {string} appUrl */
export function buildCsp(appUrl) {
  const appOrigin = new URL(appUrl).origin
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    `form-action 'self' ${appOrigin}`,
  ].join('; ')
}

/**
 * @typedef {{ path: string, headers: Record<string, string> }} HeaderBlock
 */

/**
 * @param {string} appUrl
 * @returns {HeaderBlock[]}
 */
export function buildHeaderBlocks(appUrl) {
  return [
    {
      path: '/*',
      headers: {
        'Content-Security-Policy': buildCsp(appUrl),
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
        'X-Content-Type-Options': 'nosniff',
      },
    },
    {
      // S19 markdown alternatifleri (/sayfa.md): doğru tür + arama dizininde HTML'in kopyası olarak görünmesin
      // (canonical HTML sayfasıdır; LLM/araç erişimi etkilenmez, robots.txt izinlidir).
      path: '/*.md',
      headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'X-Robots-Tag': 'noindex' },
    },
    {
      // Vite içerik-hash'li çıktılar: değişmez.
      path: '/_astro/*',
      headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
    },
  ]
}

/** @param {string} appUrl */
export function buildHeadersFile(appUrl) {
  return (
    buildHeaderBlocks(appUrl)
      .map((b) => `${b.path}\n${Object.entries(b.headers).map(([k, v]) => `  ${k}: ${v}`).join('\n')}`)
      .join('\n\n') + '\n'
  )
}

/**
 * `_headers` metnini ayrıştırır (yerel statik sunucu ve testler için).
 * @param {string} text
 * @returns {HeaderBlock[]}
 */
export function parseHeadersFile(text) {
  /** @type {HeaderBlock[]} */
  const blocks = []
  /** @type {HeaderBlock | undefined} */
  let current
  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trim().startsWith('#')) continue
    if (!/^\s/.test(rawLine)) {
      current = { path: rawLine.trim(), headers: {} }
      blocks.push(current)
    } else if (current) {
      const idx = rawLine.indexOf(':')
      if (idx > 0) current.headers[rawLine.slice(0, idx).trim()] = rawLine.slice(idx + 1).trim()
    }
  }
  return blocks
}

/**
 * @param {string} pattern
 * @param {string} pathname
 */
export function pathMatches(pattern, pathname) {
  const re = new RegExp('^' + pattern.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$')
  return re.test(pathname)
}

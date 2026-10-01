/**
 * Kalıcı yönlendirmeler (S22) — `astro build` sonunda `dist/_redirects` olarak yazılır (astro.config.mjs → entegrasyon),
 * `_headers` ile aynı desen: hosting'den bağımsız statik dosya (Cloudflare Pages / Netlify biçimi: `kaynak hedef durum`).
 * Yerel statik sunucu (scripts/serve-dist.mjs → E2E + Lighthouse) aynı dosyayı uygular → 301 gerçekten test edilir.
 * Kurallar kayıttan gelir (src/data/agent-brand.ts `AGENT_LEGACY_PATHS` → `AGENT_PATH`); burada ad/yol sabiti YOK.
 */

/**
 * @typedef {{ from: string, to: string, status: 301 }} RedirectRule
 */

/**
 * Eski bir sayfa yolu için kurallar: çıplak yol, sondaki eğik çizgili yol ve S19 markdown alternatifi (`/yol.md`).
 * @param {readonly string[]} legacyPaths
 * @param {string} target
 * @returns {RedirectRule[]}
 */
export function buildRedirectRules(legacyPaths, target) {
  for (const p of [...legacyPaths, target]) {
    if (!/^\/[a-z0-9-]+$/.test(p)) throw new Error(`Geçersiz yönlendirme yolu: ${p}`)
  }
  return legacyPaths.flatMap((from) => [
    { from, to: target, status: /** @type {const} */ (301) },
    { from: `${from}/`, to: target, status: /** @type {const} */ (301) },
    { from: `${from}.md`, to: `${target}.md`, status: /** @type {const} */ (301) },
  ])
}

/** @param {RedirectRule[]} rules */
export function buildRedirectsFile(rules) {
  return rules.map((r) => `${r.from} ${r.to} ${r.status}`).join('\n') + '\n'
}

/**
 * `_redirects` metnini ayrıştırır (yerel statik sunucu ve testler için). Yalnızca tam yol eşleşmesi (joker yok).
 * @param {string} text
 * @returns {RedirectRule[]}
 */
export function parseRedirectsFile(text) {
  /** @type {RedirectRule[]} */
  const rules = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const [from, to, status] = line.split(/\s+/)
    if (from && to) rules.push({ from, to, status: /** @type {301} */ (Number(status ?? 301)) })
  }
  return rules
}

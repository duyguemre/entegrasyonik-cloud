/**
 * robots.txt (S19). TASLAK: her şey kapalı. Yayın (SITE_DRAFT=false, insan onayı) + PUBLIC_SITE_URL: açık + sitemap.
 *
 * Yapay zeka tarayıcıları kararı (2026-09-30, S19 görevi — varsayılan İZİN): hedef, Entegrasyonik'in yapay zeka
 * yanıtlarında doğru ve kaynaklı biçimde görünmesidir (GEO/AEO). Kamuya açık içerik yalnızca kanıtlı iddialardan
 * oluşur (tests/claims.test.ts, tests/llms.test.ts). Karar dosyada yorum olarak da yazılır; geri almak için ilgili
 * ajanın bloğu `Disallow: /` yapılır (insan kararı).
 *
 * Belirli bir User-agent grubu `*` grubunu YOK SAYAR → önizleme yolu yasakları her grupta tekrarlanır.
 * Yasal (noindex) sayfalar Disallow EDİLMEZ: tarayıcı `noindex` etiketini görebilmelidir.
 */
export const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'Google-Extended',
  'PerplexityBot',
  'Perplexity-User',
  'CCBot',
  'Applebot-Extended',
] as const

export function buildRobots(opts: { draft: boolean; siteUrl?: string; disallow: string[] }): string {
  if (opts.draft || !opts.siteUrl) {
    return '# TASLAK derleme (SITE_DRAFT=true): tüm tarayıcılara kapalı.\nUser-agent: *\nDisallow: /\n'
  }
  const rules = ['Allow: /', ...opts.disallow.map((p) => `Disallow: ${p}`)]
  const lines = [
    '# Entegrasyonik — robots.txt (üretim: src/pages/robots.txt.ts, kayıt: src/data/seo.ts)',
    '#',
    '# Yapay zeka tarayıcıları: BİLİNÇLİ OLARAK İZİN VERİLİR (karar 2026-09-30). Amaç, ürünün yapay zeka',
    '# yanıtlarında doğru ve kaynaklı görünmesidir. Kısa özet: /llms.txt, kapsamlı özet: /llms-full.txt,',
    '# her sayfanın markdown sürümü: /<sayfa>.md. Engellemek için ilgili bloğu "Disallow: /" yapın.',
    '',
    ...AI_CRAWLERS.map((ua) => `User-agent: ${ua}`),
    ...rules,
    '',
    '# Arama motorları ve diğer tüm tarayıcılar',
    'User-agent: *',
    ...rules,
    '',
    `Sitemap: ${new URL('/sitemap-index.xml', opts.siteUrl).href}`,
    '',
  ]
  return lines.join('\n')
}


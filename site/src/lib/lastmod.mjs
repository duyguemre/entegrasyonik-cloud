// Sitemap `lastmod` (S19): sayfanın kaynak dosyalarındaki SON git commit tarihi (gerçek değişiklik tarihi).
// Git yoksa ya da dosyalar henüz commit'lenmemişse derleme zamanına düşer. Öncelik/changefreq YAZILMAZ
// (arama motorları yok sayar; uydurma sinyal üretmeyiz).
import { execFileSync } from 'node:child_process'

const cache = new Map()

/**
 * @param {string[]} sources site/ köküne göreli dosya/dizin yolları
 * @param {string} cwd site kökü
 * @param {Date} [fallback]
 * @returns {Date}
 */
export function lastModified(sources, cwd, fallback = new Date()) {
  const key = sources.join('|')
  if (cache.has(key)) return cache.get(key)
  let date = fallback
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cI', '--', ...sources], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (out) date = new Date(out)
  } catch {
    // git yok (ör. arşivden derleme) → derleme zamanı
  }
  cache.set(key, date)
  return date
}

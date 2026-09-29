// Token kaynağı (ADR-0011): kopyalanmaz, repo içinden `?raw` ile okunur (derleme zamanı; bundle'a yol bağımsız).
import tokensCss from '../../../frontend/src/design/tokens/dist/tokens.static.css?raw'

let cache: Map<string, string> | undefined

/** `:root` (light) bloğundaki `--ek-*` değerleri. Yalnızca derleme zamanı (meta/favicon gibi CSS dışı çıktılar için). */
export function lightTokens(): Map<string, string> {
  if (cache) return cache
  const root = tokensCss.match(/:root\s*\{([\s\S]*?)\n\}/)
  if (!root) throw new Error('tokens.static.css içinde :root bloğu bulunamadı')
  cache = new Map()
  for (const m of root[1].matchAll(/(--[\w-]+):\s*([^;]+);/g)) cache.set(m[1], m[2].trim())
  return cache
}

export function lightToken(name: string): string {
  const value = lightTokens().get(name)
  if (!value) throw new Error(`Token bulunamadı: ${name}`)
  return value
}

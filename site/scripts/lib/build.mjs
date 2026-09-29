// Betikler (E2E, Lighthouse, dist testi) için ortak: belirli ortam değişkenleriyle `astro build`.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const astroBin = path.join(siteRoot, 'node_modules', 'astro', 'bin', 'astro.mjs')

/**
 * @param {{ outDir: string, env?: Record<string, string>, silent?: boolean }} options
 */
export function buildSite({ outDir, env = {}, silent = false }) {
  const result = spawnSync(process.execPath, [astroBin, 'build'], {
    cwd: siteRoot,
    stdio: silent ? 'pipe' : 'inherit',
    env: {
      ...process.env,
      ASTRO_TELEMETRY_DISABLED: '1',
      SITE_OUT_DIR: outDir,
      ...env,
    },
  })
  if (result.status !== 0) {
    throw new Error(`astro build başarısız (çıkış kodu ${result.status})
${result.stdout ?? ''}${result.stderr ?? ''}`)
  }
  return path.join(siteRoot, outDir)
}

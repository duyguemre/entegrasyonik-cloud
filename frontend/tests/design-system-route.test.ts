import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * DS-v2 Aşama 1 — tasarım sistemi vitrini YALNIZCA geliştirmede erişilir.
 * Rota `import.meta.env.DEV` bloğunun içinde tanımlı olmalı (Vite bu dalı
 * üretimde eler) ve vitrin menü/komut paleti kaynaklarında geçmemeli.
 */
const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8')

describe('/design-system rotası (yalnız geliştirme)', () => {
  const router = read('src/router/index.ts')

  it('rota import.meta.env.DEV koşulu içinde eklenir', () => {
    const block = router.match(/if \(import\.meta\.env\.DEV\) \{([\s\S]*?)\n\}/)
    expect(block).not.toBeNull()
    expect(block![1]).toContain("path: '/design-system'")
    expect(block![1]).toContain("import('@/views/dev/DesignSystemView.vue')")
  })

  it('DEV bloğu dışında vitrin bileşeni import edilmez', () => {
    const outside = router.replace(/if \(import\.meta\.env\.DEV\) \{[\s\S]*?\n\}/, '').replace(/\/\/.*$/gm, '')
    expect(outside).not.toContain('DesignSystemView')
  })

  it('menü / komut paleti kaynaklarında vitrin yok', () => {
    for (const p of ['src/components/layout/NavigationMenu.vue', 'src/components/layout/EkCommandPalette.vue']) {
      expect(read(p)).not.toMatch(/design-system|DesignSystem/)
    }
  })
})

// FR2-DARK (madde 10) — müşteri uygulamasında karanlık mod kapısı açık: ilk kare betiği, kalıcı tercih ve seçici
// ortak paketten gelir (K11/K12). Statik sözleşme testleri (DOM gerektirmez).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..', '..')
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8')

describe('karanlık mod — uygulama kablolaması', () => {
  it('public/theme-boot.js = packages/ui/src/theme/theme-boot.js (bayt bayt)', () => {
    expect(read('public', 'theme-boot.js')).toBe(read('packages', 'ui', 'src', 'theme', 'theme-boot.js'))
  })

  it('index.html: boot betiği <head> içinde, eşzamanlı (modül/async/defer değil), ek-theme anahtarıyla ve uygulama betiğinden önce', () => {
    const html = read('index.html')
    const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'))
    const tag = head.match(/<script[^>]*theme-boot\.js[^>]*><\/script>/)?.[0]
    expect(tag).toBeTruthy()
    expect(tag).toContain('data-storage-key="ek-theme"')
    expect(tag).not.toMatch(/type="module"|\basync\b|\bdefer\b/)
    expect(html.indexOf('theme-boot.js')).toBeLessThan(html.indexOf('/src/main.ts'))
  })

  it('Vuetify başlangıç teması boot ile aynı çözümden; denetleyici ortak paketten ve ek-theme anahtarıyla', () => {
    expect(read('src', 'plugins', 'vuetify.ts')).toMatch(/createEkVuetify\(\{.*mode: appTheme\.initialMode\(\)/)
    const store = read('src', 'stores', 'theme.ts')
    expect(store).toMatch(/createThemeController\(THEME_STORAGE_KEYS\.app\)/)
    expect(read('src', 'App.vue')).toMatch(/appTheme\.bind\(useTheme\(\)\)/)
  })

  it('tema seçici kullanıcı (hesap) menüsünde ve paket bileşeni (EkThemeSwitch)', () => {
    const bar = read('src', 'components', 'layout', 'ApplicationBar.vue')
    expect(bar).toMatch(/<EkThemeSwitch[^>]*@update:model-value="appTheme\.setPreference"/)
    expect(bar).toMatch(/from '@entegrasyonik\/ui\/components'/)
    const sw = read('packages', 'ui', 'src', 'components', 'EkThemeSwitch.vue')
    for (const v of ['light', 'dark', 'system']) expect(sw).toContain(`value: '${v}'`)
    expect(sw).toContain('role="radiogroup"')
  })

  it('grafikler etkin moda göre tema alır (sabit "entegrasyonik" tema adı kalmadı)', () => {
    for (const f of [
      ['src', 'components', 'logListView', 'DetailedExportLogReport.vue'],
      ['src', 'components', 'logListView', 'DetailedImportLogReport.vue'],
      ['src', 'views', 'secure', 'adminPanel', 'AdminSystemManagementView.vue'],
      ['src', 'components', 'dashboard', 'OrderTrendCard.vue'],
      // OrderStatusCard artık grafik motoru kullanmıyor (FE-LOCAL-1025: CSS dağılım çubuğu, token renkleri).
    ]) {
      const src = read(...f)
      expect(src, f.join('/')).not.toMatch(/\btheme="entegrasyonik/)
      expect(src, f.join('/')).toMatch(/:theme="chartTheme"/)
      expect(src, f.join('/')).not.toMatch(/semanticColorsLight/)
    }
  })
})

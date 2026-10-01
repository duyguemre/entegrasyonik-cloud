// A8 — kullanıcı geri bildirimi: filtre paneli başlığı, yenile düğmesi durumları, ikon stili standardı.
// Ortam `node` (DOM yok): saf mantık doğrudan, bileşen sözleşmeleri kaynak metninden doğrulanır.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { filterCountText, fitChipCount, overflowLabel } from '@entegrasyonik/ui/components/filterHeader'
import { formatRelativeTime, resolveRefreshView } from '@entegrasyonik/ui/components/refreshState'
import { FILLED_TO_OUTLINE, SHELL_ICONS, SHELL_ICON_SIZE, STATE_FILLED, outlineIcon } from '@entegrasyonik/ui/icons'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { inventory } = require('../scripts/icon-inventory.js')

const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (f.endsWith('.vue')) out.push(p)
  }
  return out
}

describe('A8 filtre başlığı — sayı, özet, aria', () => {
  it('sayı metni ekran okuyucu için', () => {
    expect(filterCountText(0)).toBe('aktif filtre yok')
    expect(filterCountText(1)).toBe('1 aktif filtre')
    expect(filterCountText(3)).toBe('3 aktif filtre')
  })

  it('+n taşma düğmesi metni ve adı', () => {
    expect(overflowLabel(2, false)).toEqual({ text: '+2', aria: '2 filtre daha göster' })
    expect(overflowLabel(2, true)).toEqual({ text: 'Daha az', aria: 'Filtre özetini daralt' })
  })

  it('sığma hesabı: hepsi sığarsa tümü, sığmazsa +n için yer bırakır, en az 1', () => {
    expect(fitChipCount([100, 100], 206, 6, 44)).toBe(2)
    expect(fitChipCount([100, 100, 100], 300, 6, 44)).toBe(2) // 100+6+100 +6+44 = 256 ≤ 300; üçüncü sığmaz
    expect(fitChipCount([100, 100, 100], 200, 6, 44)).toBe(1) // 100 + 6 + 44 ≤ 200
    expect(fitChipCount([400, 100], 200, 6, 44)).toBe(1) // ilk çip bile sığmıyor → yine 1 (üç nokta)
    expect(fitChipCount([100, 100], 0, 6, 44)).toBe(2) // ölçüm yok → hepsi
    expect(fitChipCount([], 300, 6, 44)).toBe(0)
  })

  it('başlık düğmesi: aria-expanded + aria-controls, Enter/Space yerel düğme; chevron dekoratif', () => {
    const src = read('packages/ui/src/components/EkFilterPanel.vue')
    expect(src).toMatch(/<button[\s\S]*?class="ek-filter__toggle"[\s\S]*?:aria-expanded="!collapsed"[\s\S]*?:aria-controls="bodyId"/)
    expect(src).toMatch(/class="ek-filter__chevron" aria-hidden="true"/)
    // Çip özeti başlıkta, kapalıyken de (EkCollapse DIŞINDA) çizilir.
    const head = src.slice(src.indexOf('<header'), src.indexOf('</header>'))
    expect(head).toMatch(/<EkActiveFilters v-if="chips.length" variant="compact"/)
    expect(head).toMatch(/#?slot name="head-actions"/)
    // Yumuşak dönüş + reduced-motion.
    expect(src).toMatch(/transform var\(--ek-motion-reveal\)/)
    expect(src).toMatch(/prefers-reduced-motion: reduce[\s\S]*?\.ek-filter__chevron[\s\S]*?transition: none/)
  })

  it('compact özet e2e sözleşmesini korur: grup "Aktif filtreler", "<Etiket> filtresini kaldır", "Tümünü temizle"', () => {
    const src = read('packages/ui/src/components/EkActiveFilters.vue')
    expect(src).toMatch(/role="group"\s+aria-label="Aktif filtreler"/)
    expect(src).toMatch(/:aria-label="`\$\{f\.label\} filtresini kaldır`"/)
    expect(src).toMatch(/'Tümünü temizle'/)
    expect(src).toMatch(/'Temizle' : 'Tümünü temizle'/)
    // Adı "Filtreler" içeren başka düğme yok (e2e `/Filtreler/` başlık düğmesini arar).
    expect(src).not.toMatch(/aria-label="[^"]*Filtreler/)
  })

  it('TEK bileşen: EkFilterPanel kullanan ekranlar çipleri panele verir, altında ayrı çip satırı yok', () => {
    const offenders: string[] = []
    for (const f of [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'packages/ui/src'))]) {
      const s = readFileSync(f, 'utf8')
      if (!s.includes('<EkFilterPanel') || f.endsWith('EkFilterPanel.vue')) continue
      const rel = f.slice(ROOT.length + 1)
      if (!/<EkFilterPanel[\s\S]*?:chips=/.test(s)) offenders.push(`${rel}: :chips yok`)
      // Panelden sonra koşulsuz <EkActiveFilters> (v-else olmayan) — çift gösterim.
      const after = s.slice(s.indexOf('</EkFilterPanel>'))
      if (/<EkActiveFilters(?![^>]*v-else)/.test(after.slice(0, 400))) offenders.push(`${rel}: panel altında ayrı çip satırı`)
    }
    expect(offenders).toEqual([])
  })
})

describe('A8 yenile düğmesi — 4 durum', () => {
  const base = { loading: false, error: false, flash: false, label: 'Yenile', keys: ['Alt', 'R'], updatedText: '2 dk önce' }

  it('boşta: ipucunda göreli son güncelleme + kısayol adı', () => {
    const v = resolveRefreshView(base)
    expect(v.state).toBe('idle')
    expect(v.tipTitle).toBe('Yenile')
    expect(v.tipMeta).toBe('Son güncelleme 2 dk önce')
    expect(v.ariaLabel).toBe('Yenile (Alt+R), son güncelleme 2 dk önce')
  })

  it('yükleniyor: hata/başarıdan önceliklidir', () => {
    const v = resolveRefreshView({ ...base, loading: true, error: true, flash: true })
    expect(v.state).toBe('loading')
    expect(v.tipTitle).toBe('Yenileniyor…')
    expect(v.ariaLabel).toBe('Yenile (Alt+R), yenileniyor')
  })

  it('başarı: kısa onay (tik)', () => {
    expect(resolveRefreshView({ ...base, flash: true }).state).toBe('success')
  })

  it('hata: kırmızı nokta durumu + açıklayıcı ipucu, son BAŞARILI güncelleme', () => {
    const v = resolveRefreshView({ ...base, error: true, flash: true })
    expect(v.state).toBe('error')
    expect(v.tipTitle).toMatch(/^Yenilenemedi/)
    expect(v.tipMeta).toBe('Son başarılı güncelleme 2 dk önce')
    expect(v.ariaLabel).toBe('Yenile (Alt+R), son yenileme başarısız; son başarılı güncelleme 2 dk önce')
  })

  it('göreli zaman (tr)', () => {
    const now = new Date('2026-09-29T11:00:00').getTime()
    expect(formatRelativeTime(new Date(now - 20_000), now)).toBe('az önce')
    expect(formatRelativeTime(new Date(now - 2 * 60_000), now)).toBe('2 dk önce')
    expect(formatRelativeTime(new Date(now - 59 * 60_000), now)).toBe('59 dk önce')
    expect(formatRelativeTime(new Date(now - 3 * 3_600_000), now)).toBe('3 sa önce')
    expect(formatRelativeTime(new Date('2026-09-28T14:02:00'), now)).toBe('dün 14:02')
    expect(formatRelativeTime(new Date('2026-09-25T09:05:00'), now)).toBe('25.09 09:05')
    expect(formatRelativeTime(new Date(now + 60_000), now)).toBe('az önce') // saat kayması → negatif fark yok
  })

  it('bileşen: ghost 36px, reduced-motion statik + metin, aria-live, [data-page-refresh], ham renk yok', () => {
    const src = read('packages/ui/src/components/EkRefreshButton.vue')
    expect(src).toMatch(/data-page-refresh/)
    expect(src).toMatch(/:data-state="state"/)
    expect(src).toMatch(/aria-live="polite"/)
    expect(src).toMatch(/min-width: var\(--ek-control-h-md\)/)
    expect(src).toMatch(/border-radius: var\(--ek-radius-control\)/)
    expect(src).toMatch(/v-if="state === 'loading' && reducedMotion"[^>]*>Yenileniyor…/)
    expect(src).toMatch(/prefers-reduced-motion: reduce[\s\S]*?animation: none/)
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/)
  })
})

describe('A8 ikon stili standardı', () => {
  it('kaynakta dolgu+çizgi karışımı 0, başka ikon seti yok, bilinmeyen glif yok', () => {
    const inv = inventory()
    expect(inv.mixed.map((m: { icon: string }) => m.icon)).toEqual([])
    expect(inv.otherSets).toEqual([])
    expect(inv.unknown.map((m: { icon: string }) => m.icon)).toEqual([])
  })

  it('eşleme hedefleri @mdi/font içinde mevcut; kaynak dolgu, hedef çizgi', () => {
    const css = read('node_modules/@mdi/font/css/materialdesignicons.css')
    const all = new Set([...css.matchAll(/\.(mdi-[a-z0-9-]+)::before/g)].map((m) => m[1]))
    for (const [from, to] of Object.entries(FILLED_TO_OUTLINE)) {
      expect(all.has(from), from).toBe(true)
      expect(all.has(to), to).toBe(true)
      expect(from, from).not.toBe(to)
    }
    for (const s of STATE_FILLED) expect(all.has(s), s).toBe(true)
  })

  it('outlineIcon: menü kaydından gelen dolgu glif normalize edilir, bilinmeyen/boş aynen', () => {
    expect(outlineIcon('mdi-home')).toBe('mdi-home-outline')
    expect(outlineIcon('mdi-connection')).toBe('mdi-connection')
    expect(outlineIcon(undefined)).toBeUndefined()
  })

  it('üst bar: tek standart (SHELL_ICONS, 20px / 36px, chrome-text-muted → chrome-text), küçük sayaç', () => {
    expect(SHELL_ICON_SIZE).toEqual({ glyph: 20, hit: 36 })
    const src = read('packages/ui/src/components/EkAppHeader.vue')
    for (const k of Object.keys(SHELL_ICONS).filter((k) => k !== 'search')) expect(src, k).toMatch(new RegExp(`SHELL_ICONS\\.${k}\\b`))
    expect(read('packages/ui/src/components/EkSmartSearch.vue')).toMatch(/SHELL_ICONS\.search\b/)
    expect(src).not.toMatch(/icon="mdi-/) // sabit glif yok — kayıttan
    const btn = src.slice(src.indexOf('.ek-header__icon-btn {'), src.indexOf('}', src.indexOf('.ek-header__icon-btn {')))
    expect(btn).toMatch(/width: var\(--ek-control-h-md\)/)
    expect(btn).toMatch(/font-size: var\(--ek-icon-lg\)/)
    expect(btn).toMatch(/color: var\(--ek-color-chrome-text-muted\)/)
    expect(btn).toMatch(/border: 0/)
    expect(src).toMatch(/min-width: 16px;\s*height: 16px/)
    expect(src).toMatch(/'99\+'/)
  })

  it('menü ikonları görüntülemede normalize edilir (sol menü, sekme, arama)', () => {
    expect(read('packages/ui/src/components/EkSidebarNav.vue')).toMatch(/outlineIcon\(item\.icon\)/)
    expect(read('packages/ui/src/components/EkWorkspaceTabs.vue')).toMatch(/outlineIcon\(tab\.icon\)/)
    expect(read('packages/ui/src/components/EkSmartSearch.vue')).toMatch(/outlineIcon\(item\.icon\)/)
  })
})

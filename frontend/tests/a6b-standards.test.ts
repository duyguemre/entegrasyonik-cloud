// DS-v2 Aşama 6b — uygulama geneli tutarlılık standartlarının statik bekçileri (mandal: sayı ARTAMAZ, çoğu 0'da kilitli).
// Her blok DESIGN_SYSTEM.md §17'deki bir standarda karşılık gelir; ihlal eden dosya adı hata iletisinde görünür.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { ACTION_ICONS, ICON_ALIAS_MAP, actionLabel, icons } from '../src/design/icons'

const ROOT = join(__dirname, '..')
const SRC = join(ROOT, 'src')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : /\.(vue|ts)$/.test(name) ? [p] : []
  })
}
const rel = (p: string) => relative(ROOT, p).split(sep).join('/')
const files = walk(SRC).map((path) => ({ path: rel(path), text: readFileSync(path, 'utf8') }))

describe('Standart 10 — eylem ikonu kayıt defteri', () => {
  it('her eylemin tek glifi var; iki eylem aynı glifi paylaşmaz', () => {
    const seen = new Map<string, string>()
    for (const [key, def] of Object.entries(ACTION_ICONS)) {
      expect(seen.has(def.icon), `${key} ↔ ${seen.get(def.icon)}: ${def.icon}`).toBe(false)
      seen.set(def.icon, key)
    }
  })

  it('takma adlar kanonik glif değildir ve tek eyleme bağlıdır', () => {
    const canon = new Set(Object.values(icons))
    for (const alias of Object.keys(ICON_ALIAS_MAP)) expect(canon.has(alias as any), alias).toBe(false)
  })

  it('kaynakta eski (takma ad) eylem glifi kalmadı — aynı iş = aynı ikon', () => {
    const offenders: string[] = []
    const aliases = Object.keys(ICON_ALIAS_MAP)
    for (const f of files) {
      if (f.path === 'src/design/icons.ts') continue
      for (const a of aliases) {
        const re = new RegExp(`(?<![\\w-])${a}(?![\\w-])`)
        if (re.test(f.text)) offenders.push(`${f.path}: ${a} → ${ICON_ALIAS_MAP[a]}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('tehlikeli eylemler işaretli; ipucu dili "<nesne> <fiil>"', () => {
    expect(ACTION_ICONS.delete.danger).toBe(true)
    expect(ACTION_ICONS.cancel.danger).toBe(true)
    expect(actionLabel('delete')).toBe('Sil')
    expect(actionLabel('view', 'Siparişi')).toBe('Siparişi görüntüle')
  })
})

describe('Standart 3 — satır / kart eylemleri tek desen', () => {
  it('ekranlardaki liste eylem hücreleri EkRowActions kullanır (ham ikon düğme dizisi yok)', () => {
    const offenders = files
      .filter((f) => f.path.startsWith('src/views/secure/') || f.path.startsWith('src/components/logListView/'))
      .flatMap((f) =>
        [...f.text.matchAll(/<template #cell-actions="[^"]*">([\s\S]*?)<\/template>/g)]
          .filter((m) => !/<EkRowActions\b/.test(m[1]))
          .map(() => f.path),
      )
    expect(offenders).toEqual([])
  })
})

describe('Standart 7 — sekme sınırında kalan örtüler', () => {
  const read = (p: string) => files.find((f) => f.path === p)?.text ?? ''

  it('her çalışma alanı sekmesi kendi kabında çizilir (WorkspaceTabHost)', () => {
    expect(read('src/components/WrapperComponent.vue')).toMatch(/<WorkspaceTabHost\b/)
    expect(read('src/components/layout/WorkspaceTabHost.vue')).toMatch(/provideTabScope\(/)
    // Ham v-dialog / v-bottom-sheet de kaba bağlanır (Vuetify varsayılanları).
    expect(read('src/components/layout/WorkspaceTabHost.vue')).toMatch(/VDialog:[\s\S]*VBottomSheet:/)
  })

  it('ds örtüleri sekme kapsamını kullanır', () => {
    for (const p of ['EkDialog', 'EkDialogHost', 'EkCascadeDialog', 'EkDetailSheet']) {
      expect(read(`src/components/ds/${p}.vue`), p).toMatch(/useTabOverlay\(/)
    }
    expect(read('src/components/ds/EkLoadingOverlay.vue')).toMatch(/resolveOverlayAttach\(/)
  })

  it('hiçbir örtü kendini gövdeye zorlamaz (attach="body" / :attach="true|false") — uygulama geneli liste hariç', () => {
    // Uygulama geneli (tam ekran) kalanlar: kısayol listesi (SecureLayout), bildirim çekmecesi, toast (App.vue),
    // üst çubuğun uygulama yükleme örtüsü (ApplicationBar → `.AppView`). Bunlar sekme ağacının DIŞINDA bağlanır.
    const offenders = files
      .filter((f) => f.path.endsWith('.vue') && !f.path.startsWith('src/views/dev/'))
      .flatMap((f) => [...f.text.matchAll(/<(v-dialog|v-bottom-sheet|v-overlay|EkDialog|EkDialogHost|EkDetailSheet|EkConfirmDialog|EkFormDialog)\b[^>]*?\s(attach="body"|:attach="(true|false)")/g)].map((m) => `${f.path}: ${m[0].slice(0, 80)}`))
    expect(offenders).toEqual([])
  })

  it('kabuk kısayol bekçisi yalnız uygulama geneli örtülerde durur', () => {
    expect(read('src/layouts/SecureLayout.vue')).toMatch(/closest\('\.ek-tab-host'\)/)
  })
})

describe('Standart 9 — tek sayfa yenileme düğmesi', async () => {
  const { matchShortcut, SHORTCUTS } = await import('../src/navigation/shortcuts')
  const read = (p: string) => files.find((f) => f.path === p)?.text ?? ''

  it('Alt+R etkin sekmeyi yeniler; Ctrl+R/F5 (tarayıcı) ezilmez; metin alanında çalışmaz', () => {
    const ev = (o: Partial<KeyboardEvent>) => ({ key: 'r', code: 'KeyR', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...o }) as any
    expect(matchShortcut(ev({ altKey: true }))?.id).toBe('pageRefresh')
    expect(matchShortcut(ev({ ctrlKey: true }))).toBeUndefined()
    expect(matchShortcut(ev({ ctrlKey: true, altKey: true }))).toBeUndefined() // AltGr
    expect(matchShortcut(ev({ altKey: true }), { tagName: 'INPUT', type: 'text' } as any)).toBeUndefined()
    expect(SHORTCUTS.find((s) => s.id === 'pageRefresh')?.keys).toEqual(['Alt', 'R'])
  })

  it('düğme başlık satırında (EkPageBar) ve kabuk kısayolu onu tetikler', () => {
    expect(read('src/components/ds/EkPageBar.vue')).toMatch(/<EkRefreshButton\b/)
    expect(read('src/components/ds/EkRefreshButton.vue')).toMatch(/data-page-refresh/)
    expect(read('src/layouts/SecureLayout.vue')).toMatch(/case 'pageRefresh'/)
  })

  it('sayfa başlığında ayrı "Yenile" ikincil eylemi ya da serbest yenile ikon düğmesi yok', () => {
    const offenders = files
      .filter((f) => f.path.startsWith('src/views/secure/'))
      .flatMap((f) => [
        ...[...f.text.matchAll(/secondary-actions="[^"]*mdi-refresh/g)].map(() => `${f.path}: secondary-actions Yenile`),
        ...[...f.text.matchAll(/<EkButton[^>]*icon="mdi-refresh"[^>]*icon-only/g)].map(() => `${f.path}: serbest yenile ikonu`),
      ])
    expect(offenders).toEqual([])
  })
})

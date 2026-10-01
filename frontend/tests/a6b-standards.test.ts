// DS-v2 Aşama 6b — uygulama geneli tutarlılık standartlarının statik bekçileri (mandal: sayı ARTAMAZ, çoğu 0'da kilitli).
// Her blok DESIGN_SYSTEM.md §17'deki bir standarda karşılık gelir; ihlal eden dosya adı hata iletisinde görünür.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { ACTION_ICONS, ICON_ALIAS_MAP, actionLabel, icons } from '@entegrasyonik/ui/icons'

const ROOT = join(__dirname, '..')
const SRC = join(ROOT, 'src')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : /\.(vue|ts)$/.test(name) ? [p] : []
  })
}
const rel = (p: string) => relative(ROOT, p).split(sep).join('/')
const files = [...walk(SRC), ...walk(join(ROOT, 'packages/ui/src'))].map((path) => ({ path: rel(path), text: readFileSync(path, 'utf8') }))

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
      if (f.path === 'packages/ui/src/icons.ts') continue
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
      expect(read(`packages/ui/src/components/${p}.vue`), p).toMatch(/useTabOverlay\(/)
    }
    expect(read('packages/ui/src/components/EkLoadingOverlay.vue')).toMatch(/resolveOverlayAttach\(/)
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
  const { matchShortcut, SHORTCUTS } = await import('@entegrasyonik/ui/shortcuts')
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
    expect(read('src/components/page/EkPageBar.vue')).toMatch(/<EkRefreshButton\b/)
    expect(read('packages/ui/src/components/EkRefreshButton.vue')).toMatch(/data-page-refresh/)
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

describe('Standart 2 / 3 / 5 — kart, toplu işlem çubuğu, sayfa içi sekme', () => {
  const read = (p: string) => files.find((f) => f.path === p)?.text ?? ''

  it('liste tabloları dar kapta karta döner (EkDataGrid + EkDataTable kap sorgusu)', () => {
    expect(read('packages/ui/src/components/EkDataGrid.vue')).toMatch(/@container \(max-width: 599\.98px\)/)
    expect(read('packages/ui/src/components/EkDataTable.vue')).toMatch(/@container \(max-width: 599\.98px\)/)
  })

  it('"n … seçildi" toplu işlem çubuğu yalnız EkBulkBar\'da (ekran kopyası yok)', () => {
    const offenders = files
      .filter((f) => f.path.endsWith('.vue') && f.path !== 'packages/ui/src/components/EkBulkBar.vue' && !f.path.startsWith('src/views/dev/'))
      .filter((f) => /<\/strong>\s*[\p{L} ]+ seçildi<\/span>/u.test(f.text))
      .map((f) => f.path)
    expect(offenders).toEqual([])
  })

  it('sayfa içi sekmeler EkPageTabs (ham v-tabs yalnız giriş ekranının segment anahtarında)', () => {
    const offenders = files
      .filter((f) => f.path.endsWith('.vue') && /<v-tabs\b/.test(f.text))
      .map((f) => f.path)
      .filter((p) => !['packages/ui/src/components/EkPageTabs.vue', 'src/components/login/LoginComponent.vue'].includes(p))
    expect(offenders).toEqual([])
  })
})

describe('Standart 11 — form elemanları tek ızgara', () => {
  it('alanlarda yoğunluk/varyant sapması yok (comfortable, plain/underlined/filled/solo) ve anahtar tek görünüm', () => {
    const offenders: string[] = []
    for (const f of files.filter((x) => x.path.endsWith('.vue') && !x.path.startsWith('src/views/dev/'))) {
      for (const m of f.text.matchAll(/<(v-text-field|v-select|v-autocomplete|v-combobox|v-textarea|EkDateField)\b[^>]*>/g)) {
        if (/density="comfortable"|variant="(plain|underlined|filled|solo[\w-]*)"/.test(m[0])) offenders.push(`${f.path}: ${m[1]}`)
      }
      for (const m of f.text.matchAll(/<v-switch\b[^>]*>/g)) {
        if (/\scolor="(?!primary")/.test(m[0])) offenders.push(`${f.path}: v-switch rengi`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('tek yükseklik ve ızgara hizası kuralları vuetify-overrides.css içinde', () => {
    const css = readFileSync(join(ROOT, 'packages/ui/src/styles/vuetify-overrides.css'), 'utf8')
    // FR2-SHELL madde 5 (fe-r2a): alan yüksekliği 40 → 36 (`--ek-control-h-field`, düğme `md` ile aynı hiza).
    expect(css).toMatch(/--v-field-input-min-height: var\(--ek-control-h-field\)/)
    expect(css).not.toMatch(/--v-field-input-min-height: var\(--ek-control-h-lg\)/)
    // FR2-SHELL madde 4: dinlenen etiket opaklığı geçişsiz (yer tutucu gibi görünüp sönme yok).
    expect(css).toMatch(/\.v-field \.v-label\.v-field-label \{\s*transition-property: transform;/)
    expect(css).toMatch(/grid-template-rows: auto auto;/)
  })
})

describe('Standart 12 — açılır liste seçenekleri', () => {
  it('özel öğe şablonları (#item) seçenek rolünü korur (role="option")', () => {
    const offenders: string[] = []
    for (const f of files.filter((x) => x.path.endsWith('.vue'))) {
      for (const sel of f.text.matchAll(/<(v-select|v-autocomplete|v-combobox)\b[\s\S]*?<\/\1>/g)) {
        for (const slot of sel[0].matchAll(/<template (?:#item|v-slot:item)=[\s\S]*?<\/template>/g)) {
          for (const li of slot[0].matchAll(/<v-list-item\b[^>]*>/g)) {
            if (/v-bind=/.test(li[0]) && !/role="option"/.test(li[0])) offenders.push(f.path)
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('liste filtrelerinde kanal seçimi kanal renkli EkSelect (kind="channel")', () => {
    const offenders = files
      .filter((f) => f.path.endsWith('.vue') && /<v-select\b[^>]*getClientPlatforms\(\)/.test(f.text))
      .map((f) => f.path)
    expect(offenders).toEqual([])
  })
})

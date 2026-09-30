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

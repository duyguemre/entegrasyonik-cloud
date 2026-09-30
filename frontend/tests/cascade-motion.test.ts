// Faz 3 A9 — kademeli kategori seçici (EkCascadePicker) seviye geçişleri:
//  - seviye açma/kapama SIRASI ve yönü (cascadeMotion.planLevels / closingStep / openingStep)
//  - reduced-motion + uygulama "Hareket" tercihi (motionEnabled / readMotionPreference)
//  - klavye eşlemesi (cascadeKeyAction) + aria-live duyuruları
//  - statik bekçi: bileşen yalnız transform/opacity animasyonu yapar, süre/eğri/mesafe token'larını kullanır
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  cascadeKeyAction,
  closingStep,
  columnKeys,
  isBranch,
  levelAnnouncement,
  MAX_STAGGER_STEPS,
  motionEnabled,
  openingStep,
  panelDirection,
  planLevels,
  readMotionPreference,
  ROOT_COLUMN,
  type CascadeTreeNode,
} from '@/components/ds/cascadeMotion'
import { duration } from '@/design/tokens/scale'

const leaf = (id: string): CascadeTreeNode => ({ id, label: id })
const tree: CascadeTreeNode[] = [
  {
    id: 'moda',
    label: 'Moda',
    children: [
      { id: 'kadin', label: 'Kadın', children: [{ id: 'giyim', label: 'Giyim', children: [leaf('tisort'), leaf('elbise')] }, leaf('aksesuar')] },
      { id: 'erkek', label: 'Erkek', children: [leaf('e-tisort')] },
    ],
  },
  { id: 'elektronik', label: 'Elektronik', children: [leaf('kulaklik')] },
  { id: 'kitap', label: 'Kitap' },
  { id: 'bahce', label: 'Bahçe', lazy: true },
]

describe('columnKeys — yolun gösterdiği seviyeler', () => {
  it('kök + yol üzerindeki her klasör; yaprak yeni seviye açmaz', () => {
    expect(columnKeys(tree, [])).toEqual([ROOT_COLUMN])
    expect(columnKeys(tree, ['moda'])).toEqual([ROOT_COLUMN, 'moda'])
    expect(columnKeys(tree, ['moda', 'kadin', 'giyim', 'tisort'])).toEqual([ROOT_COLUMN, 'moda', 'kadin', 'giyim'])
    expect(columnKeys(tree, ['kitap'])).toEqual([ROOT_COLUMN])
  })

  it('lazy klasör yüklenmeden de seviye açar (iskelet gösterilir); yüklenen çocuklar izlenir', () => {
    expect(columnKeys(tree, ['bahce'])).toEqual([ROOT_COLUMN, 'bahce'])
    const loaded = new Map([['bahce', [{ id: 'saksi', label: 'Saksı', children: [leaf('plastik')] }]]])
    expect(columnKeys(tree, ['bahce', 'saksi'], loaded)).toEqual([ROOT_COLUMN, 'bahce', 'saksi'])
    expect(isBranch(tree[3])).toBe(true)
    expect(isBranch(tree[2])).toBe(false)
  })
})

describe('planLevels — açma/kapama sırası ve yönü', () => {
  it('ileri: klasör seçilince yalnız yeni seviye açılır', () => {
    const p = planLevels([ROOT_COLUMN], [ROOT_COLUMN, 'moda'])
    expect(p).toEqual({ direction: 'forward', kept: [ROOT_COLUMN], closing: [], opening: ['moda'] })
    expect(openingStep(p)).toBe(0)
  })

  it('geri: sığ bir seviyede yaprak seçilince alt seviyeler DERİNDEN SIĞA kapanır', () => {
    const p = planLevels([ROOT_COLUMN, 'moda', 'kadin', 'giyim'], [ROOT_COLUMN, 'moda'])
    expect(p.direction).toBe('back')
    expect(p.closing).toEqual(['giyim', 'kadin'])
    expect(closingStep(p, 'giyim')).toBe(0)
    expect(closingStep(p, 'kadin')).toBe(1)
  })

  it('yenile: üst seviye değişince eski alt seviyeler sırayla kapanır, yeni seviye kapanışlardan SONRA açılır', () => {
    const p = planLevels([ROOT_COLUMN, 'moda', 'kadin'], [ROOT_COLUMN, 'elektronik'])
    expect(p.direction).toBe('replace')
    expect(p.kept).toEqual([ROOT_COLUMN])
    expect(p.closing).toEqual(['kadin', 'moda'])
    expect(p.opening).toEqual(['elektronik'])
    expect([closingStep(p, 'kadin'), closingStep(p, 'moda')]).toEqual([0, 1])
    expect(openingStep(p)).toBe(2)
  })

  it('aynı seviyeler → hareket yok', () => {
    expect(planLevels([ROOT_COLUMN, 'moda'], [ROOT_COLUMN, 'moda']).direction).toBe('none')
  })

  it('derin ağaçta adım sayısı sınırlı → toplam hareket ≤ 300ms (fast + 2·fast/3 + base)', () => {
    const p = planLevels([ROOT_COLUMN, 'a', 'b', 'c', 'd', 'e'], [ROOT_COLUMN, 'x'])
    expect(Math.max(...p.closing.map((k) => closingStep(p, k)))).toBe(MAX_STAGGER_STEPS)
    expect(openingStep(p)).toBe(MAX_STAGGER_STEPS)
    const step = duration.fast / 3
    // en geç açılan seviye: kapanış adımları bekler + base süresi
    expect(openingStep(p) * step + duration.base).toBeLessThanOrEqual(300)
    // en geç kapanan seviye: son adım + fast süresi
    expect(MAX_STAGGER_STEPS * step + duration.fast).toBeLessThanOrEqual(300)
  })

  it('tek panel (dar ekran): görünen seviye büyürse ileri, küçülürse geri (ters yön)', () => {
    expect(panelDirection(0, 1)).toBe('forward')
    expect(panelDirection(2, 1)).toBe('back')
    expect(panelDirection(1, 1)).toBe('none')
  })
})

describe('reduced-motion ve "Hareket" tercihi', () => {
  it('işletim sistemi reduced-motion → hareket yok', () => {
    expect(motionEnabled(true, undefined)).toBe(false)
    expect(motionEnabled(false, undefined)).toBe(true)
  })

  it('uygulama tercihi "reduced" sistem ayarından bağımsız olarak hareketi kapatır; "full" sistemi ezmez', () => {
    expect(motionEnabled(false, 'reduced')).toBe(false)
    expect(motionEnabled(true, 'full')).toBe(false)
    expect(motionEnabled(false, 'full')).toBe(true)
  })

  it('<html data-motion> okunur; bilinmeyen değer yok sayılır', () => {
    expect(readMotionPreference({ dataset: { motion: 'reduced' } })).toBe('reduced')
    expect(readMotionPreference({ dataset: { motion: 'full' } })).toBe('full')
    expect(readMotionPreference({ dataset: { motion: 'yavas' } })).toBeUndefined()
    expect(readMotionPreference(undefined)).toBeUndefined()
  })
})

describe('klavye — seviyeler arası geçiş', () => {
  const ctx = { col: 1, index: 0, count: 3, branch: true }

  it('↑/↓ kolon içinde döner, Home/End uçlara gider', () => {
    expect(cascadeKeyAction('ArrowDown', ctx)).toEqual({ type: 'move', index: 1 })
    expect(cascadeKeyAction('ArrowUp', ctx)).toEqual({ type: 'move', index: 2 })
    expect(cascadeKeyAction('Home', { ...ctx, index: 2 })).toEqual({ type: 'move', index: 0 })
    expect(cascadeKeyAction('End', ctx)).toEqual({ type: 'move', index: 2 })
  })

  it('→ ve Enter klasörü açar (odak yeni seviyenin ilk öğesine); yaprakta → yok, Enter seçer', () => {
    expect(cascadeKeyAction('ArrowRight', ctx)).toEqual({ type: 'open' })
    expect(cascadeKeyAction('Enter', ctx)).toEqual({ type: 'open' })
    expect(cascadeKeyAction(' ', ctx)).toEqual({ type: 'open' })
    expect(cascadeKeyAction('ArrowRight', { ...ctx, branch: false })).toBeNull()
    expect(cascadeKeyAction('Enter', { ...ctx, branch: false })).toEqual({ type: 'pick' })
  })

  it('← / Backspace üst seviyeye; kök seviyede olay yutulmaz', () => {
    expect(cascadeKeyAction('ArrowLeft', ctx)).toEqual({ type: 'up' })
    expect(cascadeKeyAction('Backspace', ctx)).toEqual({ type: 'up' })
    expect(cascadeKeyAction('ArrowLeft', { ...ctx, col: 0 })).toBeNull()
    expect(cascadeKeyAction('Tab', ctx)).toBeNull()
    expect(cascadeKeyAction('ArrowDown', { ...ctx, count: 0 })).toBeNull()
  })
})

describe('aria-live duyuruları', () => {
  it('seviye açıldı / yükleniyor / seçildi', () => {
    expect(levelAnnouncement({ depth: 2, label: 'Moda', count: 2 })).toBe('2. seviye: Moda, 2 öğe')
    expect(levelAnnouncement({ depth: 2, label: 'Bahçe', loading: true })).toBe('Bahçe alt kategorileri yükleniyor…')
    expect(levelAnnouncement({ depth: 4, label: 'Tişört', chosenPath: ['Moda', 'Kadın', 'Giyim', 'Tişört'] })).toBe(
      'Seçildi: Moda › Kadın › Giyim › Tişört',
    )
  })
})

describe('statik bekçi — EkCascadePicker hareket sözleşmesi', () => {
  const src = readFileSync(fileURLToPath(new URL('../src/components/ds/EkCascadePicker.vue', import.meta.url)), 'utf8')
  const css = src.slice(src.indexOf('<style scoped>'))

  it('transition/animation yalnız transform · opacity · renk (layout özelliği animasyonu yok)', () => {
    const decls = [...css.matchAll(/transition:\s*([^;]+);/g)].map((m) => m[1])
    expect(decls.length).toBeGreaterThan(0)
    for (const d of decls) {
      if (d.trim() === 'none !important' || d.includes('--ek-transition-colors')) continue
      const props = d.split(',').map((part) => part.trim().split(/\s+/)[0])
      for (const p of props) expect(['opacity', 'transform']).toContain(p)
    }
    const frames = [...css.matchAll(/@keyframes[^{]+\{([\s\S]*?)\n\}/g)].map((m) => m[1])
    for (const f of frames) expect(f).not.toMatch(/\b(width|height|left|top|margin|padding|flex)\s*:/)
  })

  it('süre/eğri/mesafe yalnız token; ham ms/px kayma ya da cubic-bezier yok', () => {
    expect(css).toMatch(/var\(--ek-duration-base\)/)
    expect(css).toMatch(/var\(--ek-duration-fast\)/)
    expect(css).toMatch(/var\(--ek-easing-enter\)/)
    expect(css).toMatch(/var\(--ek-motion-distance-md\)/)
    expect(css).not.toMatch(/\d+ms/)
    expect(css).not.toMatch(/cubic-bezier/)
    expect(css).not.toMatch(/translate[XY]?\(\s*-?\d/)
  })

  it('FLIP (move) + sıralı adım + reduced-motion kapısı + aria-live + tek panel breadcrumb mevcut', () => {
    expect(css).toMatch(/\.ek-cascade-col-move\s*\{\s*transition: transform/)
    expect(css).toMatch(/data-close-step='2'/)
    expect(css).toMatch(/\.is-static/)
    expect(src).toMatch(/aria-live="polite"/)
    expect(src).toMatch(/aria-label="Seviye yolu"/)
    expect(src).toMatch(/motionEnabled\(/)
  })
})

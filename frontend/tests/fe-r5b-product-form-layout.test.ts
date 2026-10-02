// @vitest-environment happy-dom
/**
 * FE R5 B — ürün formu yeniden tasarımının YENİ sunum davranışı (karakterizasyon `fe-r4b-product-form-characterization` ayrıca
 * değişmeden yeşil kalır): ray önizleme kartı, satır içi kayıt geri bildirimi, ray daraltma olayı ve kategori yolu çözümü.
 * Form modeli/istek gövdeleri bu testin konusu değildir (yalnız görüntü).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as vuetifyComponents from 'vuetify/components'
import ProductFormWizardBar from '../src/components/productDefinitions/crud/ProductFormWizardBar.vue'
import { categoryRoots, findCategoryTitlePath } from '../src/composables/useProductFormPreview'

const vuetify = () => createVuetify({ components: vuetifyComponents })
let wrappers: VueWrapper[] = []
const mountBar = (props: Record<string, any>) => {
  const w = mount(ProductFormWizardBar, { props: { current: 0, saveLabel: 'Kaydet', ...props }, attachTo: document.body, global: { plugins: [vuetify()] } })
  wrappers.push(w)
  return w
}
afterEach(() => {
  wrappers.forEach((w) => w.unmount())
  wrappers = []
  document.body.innerHTML = ''
})

const variant = (stock: number, sale: number, extra: Record<string, any> = {}) => ({ stockcode: 'S', barcode: 'B', stock, prices: { salePrice: sale, marketPrice: sale + 10, isPlatformBasedPrice: false }, ...extra })

describe('ray önizleme kartı', () => {
  it('boş form: adsız ürün, seçilmemiş marka/kategori, fiyat yok, tekil', () => {
    const w = mountBar({ form: { hasVariant: false, variants: [] } })
    const p = w.find('.pfw-preview')
    expect(p.find('.pfw-preview__type').text()).toBe('Tekil ürün')
    expect(p.find('.pfw-preview__title').text()).toBe('Adsız ürün')
    expect(p.text()).toContain('Marka seçilmedi')
    expect(p.text()).toContain('Kategori seçilmedi')
    expect(p.findAll('.pfw-stat__value').map((s) => s.text())).toEqual(['—', '0', 'Tekil'])
    expect(p.find('img').exists()).toBe(false)
  })

  it('varyantlı form: kapak, marka, kategori yolu, fiyat aralığı, toplam stok, varyant sayısı', () => {
    const w = mountBar({
      form: { hasVariant: true, title: 'Tişört', variants: [variant(3, 100), variant(5, 150), variant(0, 0, { prices: { isPlatformBasedPrice: true } })] },
      brandTitle: 'Marka A', categoryPath: ['Giyim', 'Üst', 'Tişört'], coverSrc: 'https://cdn.example/k.jpg',
    })
    const p = w.find('.pfw-preview')
    expect(p.find('.pfw-preview__type').text()).toBe('Varyantlı ürün')
    expect(p.find('.pfw-preview__title').text()).toBe('Tişört')
    expect(p.find('.pfw-preview__path').text()).toBe('Giyim › Üst › Tişört')
    expect(p.find('img').attributes('src')).toBe('https://cdn.example/k.jpg')
    const [price, stock, count] = p.findAll('.pfw-stat__value').map((s) => s.text().replace(/\s/g, ' '))
    expect(price).toMatch(/100,00.*–.*150,00/)
    expect(stock).toBe('8')
    expect(count).toBe('3')
  })

  it('yalnız kanal fiyatlı tekil ürün: fiyat "Kanal fiyatı"', () => {
    const w = mountBar({ form: { hasVariant: false, variants: [variant(1, 0, { prices: { isPlatformBasedPrice: true } })] } })
    expect(w.findAll('.pfw-stat__value')[0].text()).toBe('Kanal fiyatı')
  })

  it('önizleme `dt/dd` kullanmaz (kayıt özeti tek açıklama listesi kalır)', () => {
    const w = mountBar({ form: { hasVariant: false, variants: [] } })
    expect(w.find('.pfw-preview').findAll('dt, dd')).toHaveLength(0)
  })
})

describe('tamamlanma halkası', () => {
  it('yüzde metni zorunlu bilgi oranından; tamamlanınca onay', async () => {
    const w = mountBar({ form: { hasVariant: false, category: 'c', variants: [] } })
    expect(w.find('.pfw-ring__text').text()).toBe('%20')
    await w.setProps({ form: { hasVariant: false, category: 'c', brand: 'b', title: 'Ürün', variants: [variant(1, 10)] } })
    expect(w.find('.pfw-ring').classes()).toContain('is-done')
    expect(w.find('.pfw-ring').attributes('aria-hidden')).toBe('true')
  })
})

describe('satır içi kayıt geri bildirimi', () => {
  it('canlı bölge her zaman var; geri bildirim gelince tonuyla gösterilir', async () => {
    const w = mountBar({ form: { hasVariant: false, variants: [] } })
    const live = w.find('.pfw-feedback-slot')
    expect(live.attributes('role')).toBe('status')
    expect(live.find('.pfw-feedback').exists()).toBe(false)
    await w.setProps({ feedback: { tone: 'error', title: 'Ürün kaydedilemedi', message: 'Bilgileriniz korunuyor.' } })
    expect(w.find('.pfw-feedback--error').text()).toContain('Ürün kaydedilemedi')
    await w.setProps({ feedback: { tone: 'success', title: 'Ürün eklendi' } })
    expect(w.find('.pfw-feedback--success').text()).toBe('Ürün eklendi')
  })
})

describe('ray daraltma', () => {
  it('yalnız `collapsible` iken düğme var; tıklama olay yayar; daraltılmışta adım düğmesi ipucu taşır, ad aynı', async () => {
    const plain = mountBar({ form: { hasVariant: false, variants: [] } })
    expect(plain.find('.pfw-collapse').exists()).toBe(false)

    const w = mountBar({ form: { hasVariant: false, variants: [] }, collapsible: true })
    const btn = w.find('button[aria-label="Ürün panelini daralt"]')
    expect(btn.attributes('aria-expanded')).toBe('true')
    await btn.trigger('click')
    expect(w.emitted('toggle-collapse')).toHaveLength(1)

    await w.setProps({ collapsed: true })
    expect(w.find('button[aria-label="Ürün panelini genişlet"]').exists()).toBe(true)
    const first = w.find('nav').findAll('button')[0]
    expect(first.attributes('title')).toBe('Kategori Seçimi · 1 eksik')
    expect(first.find('.pfw-step__title').text()).toBe('Kategori Seçimi')
    expect(w.find('nav').findAll('button')).toHaveLength(4)
  })
})

describe('kategori yolu', () => {
  const tree = [{ _id: 'root', title: 'Ana', isMain: true, children: [
    { _id: 'g', title: 'Giyim', children: [{ _id: 'u', title: 'Üst', children: [{ _id: 't', title: 'Tişört' }] }] },
    { _id: 'e', title: 'Elektronik', children: [] },
  ] }]
  it('tek ana kök gizlenir; kökten yaprağa adlar', () => {
    expect(findCategoryTitlePath(tree, 't').map((n) => n.title)).toEqual(['Giyim', 'Üst', 'Tişört'])
    expect(findCategoryTitlePath(tree, 'e').map((n) => n.title)).toEqual(['Elektronik'])
  })
  it('bulunamayan / boş kimlik → boş yol; ref benzeri kaynak açılır', () => {
    expect(findCategoryTitlePath(tree, 'yok')).toEqual([])
    expect(findCategoryTitlePath(tree, undefined)).toEqual([])
    expect(categoryRoots({ value: tree })).toBe(tree)
    expect(categoryRoots(undefined)).toEqual([])
  })
})

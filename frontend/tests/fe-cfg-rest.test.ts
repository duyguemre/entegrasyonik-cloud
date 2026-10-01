// FE-CFG-1 / FE-CFG-3 kalanı (cloud/fe-cfg2) — fe-b2 (galeri) ve fe-c3b (listeler) ile değişen dosyalara taşınmayan
// açılış yapılandırması bağları ve tanım görünümlerindeki demo satırları. Bu dosya kalmadıklarını kilitler (mandal).
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { checkFiles } from '@/components/productDefinitions/images/galleryModel'
import { supportContactLinks } from '@/components/layout/supportContact'
import { PHOTO_PREP, preparePhoto, type PhotoPrepDeps } from '@/components/productDefinitions/images/photoPrep'

const SRC = join(__dirname, '..', 'src')
const read = (p: string) => readFileSync(join(SRC, p), 'utf8')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : /\.(vue|ts|js|json)$/.test(name) ? [p] : []
  })
}
const files = walk(SRC).map((p) => ({ rel: relative(SRC, p).replace(/\\/g, '/'), text: readFileSync(p, 'utf8') }))

const LEGACY_DEFINITION_VIEWS = ['Brand', 'Hashtag', 'Option', 'Customer', 'Invoice', 'Order', 'Return'].map(
  (n) => `views/secure/definitions/${n}DefinitionView.vue`,
)

describe('FE-CFG-3 — demo verisi (kişisel veri benzeri) kalmadı', () => {
  it('src/ içinde envanter F21 telefon deseni (05xxxxxxxxx) ve demo e-postası geçmez', () => {
    // İstisna: yazdırma şablonu önizlemesinin açıkça kurgusal örnek veri kümesi (SAMPLE_ORDER; şablon tasarımcısında gösterilir).
    const EXEMPT = ['components/printouts/templateModel.ts']
    expect(files.filter((f) => !EXEMPT.includes(f.rel) && /(?<![\d])05\d{9}(?![\d])/.test(f.text)).map((f) => f.rel)).toEqual([])
    expect(files.filter((f) => /emre@emre\.com|EMRE YALÇINKAYA|Emre Yalçınkaya/.test(f.text)).map((f) => f.rel)).toEqual([])
  })

  it('7 eski tanım görünümü ortak boş durum gövdesini kullanır; tablo/sabit satır yok', () => {
    for (const p of LEGACY_DEFINITION_VIEWS) {
      const s = read(p)
      expect(s).toContain('<LegacyDefinitionEmpty')
      expect(s).not.toMatch(/v-data-table|const items\s*=/)
    }
    const body = read('views/secure/definitions/LegacyDefinitionEmpty.vue')
    expect(body).toContain('EkEmptyState')
    expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/)
  })
})

describe('FE-CFG-1 kalanı — liste sayfa boyutu tek kaynaktan', () => {
  // Eski FE yönetim paneli backoffice'e taşınıyor (ADR-0026; envanter F11 ile aynı gerekçe) ve DS vitrin rotası hariç.
  const EXEMPT = ['views/secure/adminPanel/', 'views/dev/']

  it('müşteri uygulamasında sayfa boyutu 25 sabiti kalmadı (limit: 25 / pageSize ref(25))', () => {
    const offenders = files
      .filter((f) => !EXEMPT.some((e) => f.rel.startsWith(e)))
      .filter((f) => /\blimit:\s*25\b|(?:pageSize|perPage|itemsPerPage)\s*=\s*ref\(25\)/.test(f.text))
      .map((f) => f.rel)
    expect(offenders).toEqual([])
  })

  it('c3b sonrası listeler defaultListPageSize() okur', () => {
    for (const p of [
      'components/financial/FinancialPayoutsTab.vue',
      'components/financial/FinancialCargoInvoicesTab.vue',
      'views/secure/productDefinitions/ProductListView.vue',
      'views/secure/productDefinitions/ChoiceListView.vue',
      'views/secure/productDefinitions/HashtagListView.vue',
      'views/secure/FinancialListView.vue',
      'views/secure/InvoiceListView.vue',
      'views/secure/MessageListView.vue',
    ]) expect(read(p)).toContain('defaultListPageSize()')
  })
})

describe('FE-CFG-1 kalanı — B2 galeri: görsel adresi ve yükleme tavanı', () => {
  it('galeri bileşenleri görsel adresini doğrudan `.url`den değil tek kuraldan (gallerySrc → config/imageUrl) alır', () => {
    const gallery = [
      'components/productDefinitions/crud/ProductImagesComponent.vue',
      'components/productDefinitions/variants/ProductVariantImagesComponent.vue',
      'components/productDefinitions/images/ImageLightbox.vue',
      'components/productDefinitions/images/ImagePicker.vue',
      'components/productDefinitions/images/VariantImageAssign.vue',
    ]
    for (const p of gallery) {
      const s = read(p)
      expect(s, p).not.toMatch(/:src="(?:img|current)\.url"|\)\?\.url\b/)
      expect(s, p).toMatch(/provideGallerySrc|useGallerySrc/)
    }
    expect(read('components/productDefinitions/images/gallerySrc.ts')).toContain('useProductImageUrl')
  })

  it('yükleme kuyruğu ve kamera hazırlığı tavanı public-config\'ten alır', () => {
    expect(read('components/productDefinitions/images/useImageUploads.ts')).toContain('checkFiles(files, publicConfig.uploadMaxBytes)')
    expect(read('components/productDefinitions/crud/ProductImagesComponent.vue')).toContain('publicConfig.uploadMaxBytes)')
    expect(read('components/productDefinitions/images/photoPrep.ts')).not.toMatch(/10 MB sınırını/)
  })

  it('checkFiles: tavanı aşan dosya gerekçesiyle reddedilir; tavan verilmezse boyut denetlenmez', () => {
    const f = (name: string, size: number) => ({ name, type: 'image/jpeg', size })
    const r = checkFiles([f('a.jpg', 1_000), f('b.jpg', 3_000_000)], 2_000_000)
    expect(r.accepted.map((x) => x.name)).toEqual(['a.jpg'])
    expect(r.rejected[0]).toMatchObject({ file: { name: 'b.jpg' } })
    expect(r.rejected[0].reason).toMatch(/çok büyük.*2 MB/)
    expect(checkFiles([f('b.jpg', 3_000_000)]).accepted).toHaveLength(1)
  })

  it('preparePhoto verilen tavanı kullanır (varsayılan sözleşmedeki 10 MB)', async () => {
    const jpeg = (n: number) => { const b = new Uint8Array(n); b.set([0xff, 0xd8]); b.set([0xff, 0xd9], n - 2); return b }
    const deps = (out: number): PhotoPrepDeps => ({
      decode: async () => ({ width: 1000, height: 800, source: {}, close() {} }) as never,
      encode: async () => new Blob([jpeg(out)], { type: 'image/jpeg' }),
    })
    const file = new File([jpeg(10)], 'p.jpg', { type: 'image/jpeg' })
    await expect(preparePhoto(file, deps(1_500_000), 'x.jpg', 1_000_000)).rejects.toMatchObject({ code: 'too-large-output' })
    await expect(preparePhoto(file, deps(1_500_000), 'x.jpg')).resolves.toBeTruthy()
    expect(PHOTO_PREP.maxBytes).toBe(10 * 1024 * 1024)
  })
})

describe('FE-CFG-2 — giriş ekranında destek iletişimi', () => {
  it('supportContactLinks: boş öğe yok, ikisi boşsa boş; mailto/tel ve erişilebilir ad', () => {
    expect(supportContactLinks('', '')).toEqual([])
    expect(supportContactLinks('a@b.co', '').map((l) => l.key)).toEqual(['support-email'])
    expect(supportContactLinks('', '+90 (212) 000-00-00')).toEqual([
      expect.objectContaining({ key: 'support-phone', href: 'tel:+902120000000', label: 'Destek telefonu: +90 (212) 000-00-00' }),
    ])
    expect(supportContactLinks('a@b.co', '0212 000 00 00')[0]).toMatchObject({ href: 'mailto:a@b.co', text: 'a@b.co' })
  })

  it('LoginView: değerler public-config deposundan; düz metin (v-html yok), gezinme bölgesi etiketli', () => {
    const v = read('views/unsecure/LoginView.vue')
    expect(v).toContain('supportContactLinks(publicConfig.supportEmail, publicConfig.supportPhone)')
    expect(v).toContain('aria-label="Destek iletişimi"')
    expect(v).not.toMatch(/v-html=|mailto:|tel:/)
  })
})

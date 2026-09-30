// B7 — Kategoriler / Markalar sayfaları için sentetik katalog verisi (Protokol 7: PII yok).
// Şekiller backend'in GERÇEK yanıtlarıyla aynıdır (alan uydurulmaz):
//  • `CategoryService` GET → `[anaKategori, ...seviye0Ağaçları]` (category-service.ts `get`: ana kayıt `parentId: 0`,
//    diğerleri `buildCategory` ile `level` + iç içe `children`).
//  • `AttributeMappingService` GET → AttributeMapping kayıtları; kategori düzeyi eşleme = `platformAttributeId: null`
//    (attributeMapping-service.ts `saveCategoryMapping`).
//  • `BrandService` GET → düz dizi; `platforms.<kod> = { id, title }` (brand-service.ts `saveIntegrationBrand`).
// Ürün sayısı ve logo alanı backend yanıtlarında YOK → fixture'da da yok.

type Node = { title: string; children?: Node[] }

const TREE: Node[] = [
  {
    title: 'Giyim',
    children: [
      {
        title: 'Kadın',
        children: [
          { title: 'Üst Giyim', children: [{ title: 'Tişört' }, { title: 'Bluz' }, { title: 'Gömlek' }, { title: 'Kazak' }] },
          { title: 'Alt Giyim', children: [{ title: 'Pantolon' }, { title: 'Etek' }, { title: 'Şort' }] },
          { title: 'Elbise' },
        ],
      },
      {
        title: 'Erkek',
        children: [
          { title: 'Üst Giyim', children: [{ title: 'Tişört' }, { title: 'Gömlek' }, { title: 'Sweatshirt' }] },
          { title: 'Alt Giyim', children: [{ title: 'Pantolon' }, { title: 'Jean' }] },
        ],
      },
      { title: 'Çocuk', children: [{ title: 'Bebek' }, { title: 'Kız Çocuk' }, { title: 'Erkek Çocuk' }] },
    ],
  },
  { title: 'Ayakkabı', children: [{ title: 'Spor Ayakkabı' }, { title: 'Bot' }, { title: 'Sandalet' }, { title: 'Topuklu' }] },
  {
    title: 'Aksesuar',
    children: [{ title: 'Çanta' }, { title: 'Saat' }, { title: 'Gözlük' }, { title: 'Kemer' }, { title: 'Takı', children: [{ title: 'Kolye' }, { title: 'Küpe' }] }],
  },
  {
    title: 'Ev & Yaşam',
    children: [
      { title: 'Mutfak', children: [{ title: 'Tencere' }, { title: 'Bardak' }] },
      { title: 'Ev Tekstili', children: [{ title: 'Nevresim' }, { title: 'Havlu' }] },
      { title: 'Dekorasyon' },
    ],
  },
  { title: 'Kozmetik' },
]

const slug = (s: string) =>
  s.toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/[^a-z0-9]+/g, '-')

export const B7_ROOT_ID = 'b7-cat-root'

function build(nodes: Node[], parentId: string, level: number, path: string): any[] {
  return nodes.map((n, i) => {
    const _id = `b7-cat-${path}${slug(n.title)}`
    return {
      _id,
      parentId,
      title: n.title,
      icon: 'mdi-shape',
      order: i + 1,
      level,
      menu: false,
      newTitle: '',
      updateTitle: String(level),
      isOpen: false,
      isOrderDropPossible: false,
      isDropPossible: false,
      children: build(n.children ?? [], _id, level + 1, `${path}${slug(n.title)}--`),
    }
  })
}

export function b7Categories() {
  return [{ _id: B7_ROOT_ID, parentId: 0, title: 'Kategoriler', icon: 'mdi-shape', order: 0, isMain: true }, ...build(TREE, B7_ROOT_ID, 0, '')]
}

/** Yaprak kategori kimliği (yol: 'Giyim/Kadın/Üst Giyim/Tişört'). */
export function b7CatId(path: string) {
  const parts = path.split('/')
  return `b7-cat-${parts.map(slug).join('--')}`
}

const MAPPED: Array<[string, string[]]> = [
  ['Giyim/Kadın/Üst Giyim/Tişört', ['trendyol', 'hepsiburada', 'ideasoft']],
  ['Giyim/Kadın/Üst Giyim/Bluz', ['trendyol', 'hepsiburada']],
  ['Giyim/Kadın/Üst Giyim/Gömlek', ['trendyol']],
  ['Giyim/Kadın/Alt Giyim/Pantolon', ['trendyol', 'hepsiburada', 'ideasoft']],
  ['Giyim/Kadın/Elbise', ['trendyol', 'hepsiburada', 'ideasoft']],
  ['Giyim/Erkek/Üst Giyim/Tişört', ['trendyol', 'hepsiburada', 'ideasoft']],
  ['Giyim/Erkek/Alt Giyim/Jean', ['hepsiburada']],
  ['Ayakkabı/Spor Ayakkabı', ['trendyol', 'hepsiburada', 'ideasoft']],
  ['Ayakkabı/Bot', ['trendyol']],
  ['Aksesuar/Çanta', ['trendyol', 'hepsiburada']],
  ['Kozmetik', ['trendyol', 'hepsiburada', 'ideasoft']],
]

export function b7CategoryMappings() {
  const out: any[] = []
  let n = 1000
  for (const [path, codes] of MAPPED) {
    for (const code of codes) {
      out.push({ _id: `b7-map-${n}`, integrationCode: code, localCategoryId: b7CatId(path), platformCategoryId: String(n++), platformAttributeId: null, isCategoryMapping: true })
    }
  }
  // Nitelik düzeyi bir kayıt (kategori eşlemesi SAYILMAMALI).
  out.push({ _id: 'b7-map-attr', integrationCode: 'trendyol', localCategoryId: b7CatId('Giyim/Kadın/Üst Giyim/Tişört'), platformCategoryId: '1000', platformAttributeId: '47', platformAttributeName: 'Renk' })
  return out
}

const BRAND_NAMES = [
  'Açelya Tekstil', 'Bade Home', 'Beyaz Kuğu', 'Cemre Deri', 'Çınar Outdoor', 'Defne Kids', 'Ege Pamuk', 'Fidan Denim', 'Gökçe Takı',
  'Hira Kozmetik', 'Işıl Aydınlatma', 'İpek Yolu', 'Kuzey Sport', 'Lavin', 'Mavi Nokta', 'Nar Çiçeği', 'Olcay Saat', 'Öykü Ayakkabı',
  'Pera Studio', 'Rüzgar Gözlük', 'Selvi Örme', 'Şahin Çanta', 'Toprak Seramik', 'Umay Bebe',
]

export function b7Brands() {
  const platformsFor = (i: number) => {
    const p: Record<string, any> = {}
    if (i % 3 !== 2) p.trendyol = { id: 5000 + i, title: BRAND_NAMES[i] }
    if (i % 4 === 0 || i % 4 === 1) p.hepsiburada = { id: `hb-${i}`, title: BRAND_NAMES[i] }
    if (i % 5 === 0 || i % 7 === 1) p.ideasoft = { id: 700 + i, title: BRAND_NAMES[i] }
    if (i % 2 === 0 || i === 1) p.bizimhesap = { id: `bh-${i}`, title: BRAND_NAMES[i] }
    return p
  }
  return [
    { _id: 'b7-brand-main', title: 'Markalar', isMain: true, parentId: 0 },
    ...BRAND_NAMES.map((title, i) => ({ _id: `b7-brand-${i}`, title, parentId: 0, platforms: platformsFor(i) })),
  ]
}

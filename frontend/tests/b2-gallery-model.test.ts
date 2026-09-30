// Faz 3 B2 — galeri + varyanta resim atama saf mantığı (src/components/productDefinitions/images/galleryModel.ts).
import { describe, expect, it } from 'vitest'
import {
  addImagesToVariants, applyGroupImages, buildOptionGroups, checkFiles, formatBytes, groupImageState, imageQuality,
  imageUsage, keyboardTarget, makeCover, matchingVariants, moveItem, preferredGroup, pruneVariantRefs,
  removeImageFromVariants, sameOrder, sortByGallery, unassignedVariants, uploadErrorText, uploadSummary,
  variantImageIds, variantLabel, worstLevel, type GalleryImage, type VariantLike,
} from '@/components/productDefinitions/images/galleryModel'

const img = (id: string, extra: Partial<GalleryImage> = {}): GalleryImage => ({ _id: id, url: `https://cdn/${id}.jpg`, width: 1500, height: 1500, ...extra })
const gallery = [img('a'), img('b'), img('c'), img('d')]

const TITLES: Record<string, string> = { renk: 'Renk', beden: 'Beden', kir: 'Kırmızı', lac: 'Lacivert', s: 'S', m: 'M' }
const t = (id: string) => TITLES[id]

function variants(): VariantLike[] {
  const out: VariantLike[] = []
  for (const c of ['kir', 'lac']) for (const s of ['s', 'm']) {
    out.push({ tempId: `${c}-${s}`, choices: [{ choiceId: 'renk', choiceValueId: c }, { choiceId: 'beden', choiceValueId: s }], images: [] })
  }
  return out
}

describe('sıra ve kapak', () => {
  it('moveItem kopya döner, sınırları kırpar', () => {
    const src = ['a', 'b', 'c']
    expect(moveItem(src, 0, 2)).toEqual(['b', 'c', 'a'])
    expect(moveItem(src, 2, -5)).toEqual(['c', 'a', 'b'])
    expect(moveItem(src, 9, 0)).toEqual(src)
    expect(src).toEqual(['a', 'b', 'c'])
  })

  it('makeCover görseli başa alır; kapak/yok ise aynı sıra', () => {
    expect(makeCover(gallery, 'c').map((x) => x._id)).toEqual(['c', 'a', 'b', 'd'])
    expect(makeCover(gallery, 'a').map((x) => x._id)).toEqual(['a', 'b', 'c', 'd'])
    expect(makeCover(gallery, 'zz').map((x) => x._id)).toEqual(['a', 'b', 'c', 'd'])
    expect(sameOrder(gallery, makeCover(gallery, 'a'))).toBe(true)
    expect(sameOrder(gallery, makeCover(gallery, 'b'))).toBe(false)
  })

  it('klavye hedefi: ←→ adım, ↑↓ satır, Home/End, bilinmeyen tuş null', () => {
    expect(keyboardTarget(2, 'ArrowLeft', 4, 10)).toBe(1)
    expect(keyboardTarget(2, 'ArrowRight', 4, 10)).toBe(3)
    expect(keyboardTarget(2, 'ArrowDown', 4, 10)).toBe(6)
    expect(keyboardTarget(8, 'ArrowDown', 4, 10)).toBe(9)
    expect(keyboardTarget(1, 'ArrowUp', 4, 10)).toBe(0)
    expect(keyboardTarget(5, 'Home', 4, 10)).toBe(0)
    expect(keyboardTarget(5, 'End', 4, 10)).toBe(9)
    expect(keyboardTarget(0, 'ArrowLeft', 4, 10)).toBe(0)
    expect(keyboardTarget(0, 'x', 4, 10)).toBeNull()
  })
})

describe('referanslar', () => {
  it('kimlik ya da URL referansı çözülür; tekrarlar tekilleşir', () => {
    const v: VariantLike = { images: ['b', 'https://cdn/a.jpg', 'b', 'https://dis/x.jpg'] }
    expect(variantImageIds(v, gallery)).toEqual(['b', 'a'])
  })

  it('pruneVariantRefs galeride olmayanları siler, URL referansını KORUR (eski davranış düşürüyordu)', () => {
    const vs: VariantLike[] = [{ images: ['a', 'https://cdn/b.jpg', 'silinen'] }]
    pruneVariantRefs(vs, gallery)
    expect(vs[0].images).toEqual(['a', 'https://cdn/b.jpg'])
  })

  it('sortByGallery galeri sırasına dizer, bilinmeyenler sonda', () => {
    expect(sortByGallery(['d', 'x', 'a', 'https://cdn/c.jpg'], gallery)).toEqual(['a', 'https://cdn/c.jpg', 'd', 'x'])
  })
})

describe('seçenek grupları', () => {
  it('gruplar ilk görünme sırasıyla, değer başına varyant anahtarları', () => {
    const groups = buildOptionGroups(variants(), t, t)
    expect(groups.map((g) => g.title)).toEqual(['Renk', 'Beden'])
    expect(groups[0].values.map((v) => [v.title, v.variantKeys])).toEqual([
      ['Kırmızı', ['kir-s', 'kir-m']],
      ['Lacivert', ['lac-s', 'lac-m']],
    ])
  })

  it('başlık yoksa kimlik değil genel ad gösterilir', () => {
    const groups = buildOptionGroups([{ choices: [{ choiceId: '?', choiceValueId: '??' }] }], () => undefined, () => undefined)
    expect(groups[0].title).toBe('Seçenek')
    expect(groups[0].values[0].title).toBe('Değer')
  })

  it('tercih edilen grup: renk benzeri ad önce, yoksa en az değerli çoklu grup', () => {
    const groups = buildOptionGroups(variants(), t, t)
    expect(preferredGroup(groups)?.title).toBe('Renk')
    const g2 = [
      { choiceId: '1', title: 'Beden', values: [1, 2, 3].map((n) => ({ valueId: `${n}`, title: `${n}`, variantKeys: [] })) },
      { choiceId: '2', title: 'Kumaş', values: [1, 2].map((n) => ({ valueId: `${n}`, title: `${n}`, variantKeys: [] })) },
    ]
    expect(preferredGroup(g2)?.title).toBe('Kumaş')
    expect(preferredGroup([])).toBeUndefined()
  })

  it('seçim eşleşmesi: boş liste sınırlamaz; hiç seçim yoksa eşleşme yok', () => {
    const vs = variants()
    expect(matchingVariants(vs, { renk: ['kir'] }).map((v) => v.tempId)).toEqual(['kir-s', 'kir-m'])
    expect(matchingVariants(vs, { renk: ['kir'], beden: ['m'] }).map((v) => v.tempId)).toEqual(['kir-m'])
    expect(matchingVariants(vs, { renk: [], beden: ['s'] }).map((v) => v.tempId)).toEqual(['kir-s', 'lac-s'])
    expect(matchingVariants(vs, { renk: [] })).toEqual([])
  })
})

describe('grup seviyesinde atama', () => {
  it('Renk=Kırmızı → tüm bedenlere eklenir, galeri sırasıyla', () => {
    const vs = variants()
    const red = matchingVariants(vs, { renk: ['kir'] })
    expect(applyGroupImages(red, ['c', 'a'], [], gallery)).toBe(2)
    expect(vs[0].images).toEqual(['a', 'c'])
    expect(vs[1].images).toEqual(['a', 'c'])
    expect(vs[2].images).toEqual([])
  })

  it('ortak kümeden çıkarılan kaldırılır; varyanta özel görsel korunur', () => {
    const vs = variants()
    vs[0].images = ['a', 'b', 'd'] // d: yalnız kir-s'ye özel
    vs[1].images = ['a', 'b']
    const red = vs.slice(0, 2)
    const state = groupImageState(red, gallery)
    expect(state).toEqual({ common: ['a', 'b'], partial: ['d'] })
    expect(applyGroupImages(red, ['b'], state.common, gallery)).toBe(2)
    expect(vs[0].images).toEqual(['b', 'd'])
    expect(vs[1].images).toEqual(['b'])
  })

  it('değişiklik yoksa 0 döner, diziye dokunmaz', () => {
    const vs = variants()
    vs[0].images = ['a']
    const ref = vs[0].images
    expect(applyGroupImages([vs[0]], ['a'], ['a'], gallery)).toBe(0)
    expect(vs[0].images).toBe(ref)
  })

  it('URL referanslı görsel kimlikle eşleşir (çift eklenmez, kaldırılabilir)', () => {
    const v: VariantLike = { images: ['https://cdn/a.jpg'] }
    expect(addImagesToVariants([v], ['a', 'b'], gallery)).toBe(1)
    expect(v.images).toEqual(['https://cdn/a.jpg', 'b'])
    expect(removeImageFromVariants([v], 'a', gallery)).toBe(1)
    expect(v.images).toEqual(['b'])
  })
})

describe('kullanım ve eksikler', () => {
  it('görsel → kullanan varyantlar; görselsiz varyantlar', () => {
    const vs = variants()
    vs[0].images = ['a']
    vs[1].images = ['a', 'b']
    const usage = imageUsage(gallery, vs)
    expect(usage.get('a')).toEqual(['kir-s', 'kir-m'])
    expect(usage.get('b')).toEqual(['kir-m'])
    expect(usage.get('c')).toEqual([])
    expect(unassignedVariants(vs, gallery).map((v) => v.tempId)).toEqual(['lac-s', 'lac-m'])
  })

  it('varyant adı seçenek değerlerinden', () => {
    expect(variantLabel(variants()[0], t)).toBe('Kırmızı · S')
    expect(variantLabel({ stockcode: 'SK-1' }, t)).toBe('SK-1')
  })
})

describe('kalite ipuçları ve dosyalar', () => {
  it('düşük çözünürlük uyarı, önerilen altı bilgi, sıra dışı oran bilgi', () => {
    expect(worstLevel(imageQuality({ width: 1500, height: 1500 }))).toBe('ok')
    expect(worstLevel(imageQuality({ width: 1000, height: 1200 }))).toBe('info')
    expect(imageQuality({ width: 480, height: 480 })[0]).toMatchObject({ level: 'warning', short: 'Düşük çözünürlük' })
    expect(imageQuality({ width: 3000, height: 1200 }).map((h) => h.short)).toEqual(['Sıra dışı oran'])
    expect(imageQuality({})).toEqual([])
  })

  it('tür ve adet sınırı', () => {
    const files = [
      ...Array.from({ length: 21 }, (_, i) => ({ name: `f${i}.jpg`, type: 'image/jpeg' })),
      { name: 'x.gif', type: 'image/gif' },
    ]
    const r = checkFiles(files)
    expect(r.accepted).toHaveLength(20)
    expect(r.rejected.map((x) => x.reason)).toEqual(['Tek seferde en çok 20 görsel', 'Desteklenmeyen tür (JPG, PNG ya da WebP yükleyin)'])
  })

  it('boyut biçimi ve yükleme özeti/hata dili', () => {
    expect(formatBytes(412_000)).toBe('412 KB')
    expect(formatBytes(1_240_000)).toBe('1,2 MB')
    expect(formatBytes(undefined)).toBe('—')
    expect(uploadErrorText(413)).toBe('Dosya çok büyük')
    expect(uploadErrorText(undefined)).toBe('Bağlantı kurulamadı')
    expect(uploadErrorText(500)).toBe('Sunucu görseli kaydedemedi')
    expect(uploadSummary([
      { id: '1', name: 'a', status: 'uploading', progress: 40 },
      { id: '2', name: 'b', status: 'queued', progress: 0 },
      { id: '3', name: 'c', status: 'error', progress: 0 },
    ])).toEqual({ active: 2, failed: 1, progress: 20 })
  })
})

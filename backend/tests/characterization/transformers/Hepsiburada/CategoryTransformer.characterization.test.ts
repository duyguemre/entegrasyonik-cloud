// Protokol 13 karakterizasyon: Hepsiburada `CategoryMapper` (kategori ağacı, öznitelikler, öznitelik değerleri).
// ADR-0016 §8.2 B-R-T4 dilimi.
import { describe, it, expect } from '@jest/globals';
import { CategoryMapper } from '@integration/modules/marketplace/hepsiburada/transformers/CategoryTransformer';

describe('Hepsiburada CategoryMapper.toInternalCategories — karakterizasyon', () => {
    const m = new CategoryMapper();

    it('düz listeyi ağaca çevirir; alt kategoriler recursive bulunur; başlığa göre (tr) alfabetik sıralanır', () => {
        const raw = [
            { categoryId: 1, parentCategoryId: 0, name: 'Elektronik' },
            { categoryId: 2, parentCategoryId: 0, name: 'Bebek' },
            { categoryId: 3, parentCategoryId: 1, name: 'Telefon' },
            { categoryId: 4, parentCategoryId: 1, name: 'Çamaşır Makinesi' },
        ];
        const tree = m.toInternalCategories(raw);
        expect(tree.map(c => c.title)).toEqual(['Bebek', 'Elektronik']); // tr locale
        const electronik = tree.find(c => c.title === 'Elektronik')!;
        expect(electronik.children!.map((c: any) => c.title)).toEqual(['Çamaşır Makinesi', 'Telefon']);
        expect(electronik.children![0].level).toBe(1);
    });

    it('boş/dizi-olmayan girdi -> boş dizi', () => {
        expect(m.toInternalCategories(undefined as any)).toEqual([]);
        expect(m.toInternalCategories({} as any)).toEqual([]);
        expect(m.toInternalCategories([])).toEqual([]);
    });

    it('çocuğu olmayan kategoride children değeri undefined olur (ANCAK anahtar hâlâ mevcuttur — ilk aşamada `delete` edilse de sortByTitleRecursive spread\'i anahtarı `undefined` değeriyle geri kazandırır)', () => {
        const raw = [{ categoryId: 1, parentCategoryId: 0, name: 'Tek' }];
        const tree = m.toInternalCategories(raw);
        expect(tree[0].children).toBeUndefined();
        expect('children' in tree[0]).toBe(true);
    });

    it('name/title yoksa "Adsız Kategori"; id alanı categoryId veya id kabul eder', () => {
        const raw = [{ id: 5, parentId: '0' }];
        const tree = m.toInternalCategories(raw);
        expect(tree[0].title).toBe('Adsız Kategori');
        expect(tree[0]._id).toBe('5');
    });
});

describe('Hepsiburada CategoryMapper.toInternalAttributes — karakterizasyon', () => {
    const m = new CategoryMapper();

    it('baseAttributes + attributes + variantAttributes birleştirilir; variantAttributes varianter=true olarak işaretlenir', () => {
        const raw = {
            data: {
                baseAttributes: [{ id: 1, name: 'Renk', mandatory: true, type: 'enum' }],
                attributes: [{ id: 2, name: 'Malzeme', type: 'text' }],
                variantAttributes: [{ id: 3, name: 'Beden', slicer: true, multiValue: true }],
            },
        };
        const attrs = m.toInternalAttributes(raw);
        expect(attrs).toHaveLength(3);
        const beden = attrs.find(a => a._id === '3')!;
        expect(beden).toMatchObject({ title: 'Beden', varianter: true, slicer: true, multiple: true });
        const renk = attrs.find(a => a._id === '1')!;
        expect(renk).toMatchObject({ required: true, allowCustom: false }); // type 'enum' -> allowCustom false
        const malzeme = attrs.find(a => a._id === '2')!;
        expect(malzeme).toMatchObject({ allowCustom: true, required: false, varianter: false }); // type text -> allowCustom true
    });

    it('rawResponse.data yoksa boş dizilerle çalışır (kırılmaz)', () => {
        expect(m.toInternalAttributes({})).toEqual([]);
        expect(m.toInternalAttributes(undefined)).toEqual([]);
    });

    it('title\'a göre (tr) alfabetik sıralanır', () => {
        const raw = { data: { baseAttributes: [{ id: 1, name: 'Z' }, { id: 2, name: 'A' }] } };
        expect(m.toInternalAttributes(raw).map(a => a.title)).toEqual(['A', 'Z']);
    });
});

describe('Hepsiburada CategoryMapper.toInternalAttributeValues — karakterizasyon', () => {
    const m = new CategoryMapper();

    // ŞÜPHELİ DAVRANIŞ (BACKLOG'a eklendi): `title` trim edilir ama `id` EDİLMEZ (id = String(item.value) ham).
    // Baştaki/sondaki boşluklu bir platform değeri geldiğinde id ile title farklı normalize seviyesinde kalır;
    // bu id başka yerde anahtar/eşleme için kullanılıyorsa görünmeyen boşluk yüzünden eşleşme kaçabilir.
    it('[BACKLOG-adayı] title trim edilir ama id EDİLMEZ; tekrarları eler (id bazlı), "undefined" id\'lileri filtreler, title\'a göre sıralar', () => {
        const raw = [{ value: 'Kırmızı' }, { value: ' Mavi ' }, { value: 'Kırmızı' }, { value: undefined }];
        const vals = m.toInternalAttributeValues(raw);
        expect(vals).toEqual([{ id: 'Kırmızı', title: 'Kırmızı' }, { id: ' Mavi ', title: 'Mavi' }]);
    });

    it('dizi olmayan/boş girdi -> boş dizi', () => {
        expect(m.toInternalAttributeValues(undefined as any)).toEqual([]);
        expect(m.toInternalAttributeValues({} as any)).toEqual([]);
    });
});

// Protokol 13 karakterizasyon: Pazarama `CategoryMapper` (kategori ağacı — düz/ağaç algılama, öznitelikler).
// ADR-0016 §8.2 B-R-T4 dilimi.
import { describe, it, expect } from '@jest/globals';
import { CategoryMapper } from '@integration/modules/marketplace/pazarama/transformers/CategoryTransformer';

describe('Pazarama CategoryMapper.toInternalCategories — düz liste algılama ve ağaç kurma (karakterizasyon)', () => {
    const m = new CategoryMapper();

    it('düz liste (ParentId var, Children yok) algılanır ve ağaca çevrilir', () => {
        const raw = [
            { CategoryId: 1, ParentId: 0, Name: 'Elektronik' },
            { CategoryId: 2, ParentId: 1, Name: 'Telefon' },
        ];
        const tree = m.toInternalCategories(raw);
        expect(tree).toHaveLength(1);
        expect(tree[0]).toMatchObject({ _id: '1', title: 'Elektronik', level: 0 });
        expect(tree[0].children).toHaveLength(1);
        expect(tree[0].children![0]).toMatchObject({ _id: '2', title: 'Telefon', level: 1 });
    });

    it('düz liste algılamada root parentId null/undefined/"" normalize edilip "0" kabul edilir', () => {
        const raw = [{ CategoryId: 1, ParentId: null, Name: 'Kök' }];
        const tree = m.toInternalCategories(raw);
        expect(tree).toHaveLength(1);
        expect(tree[0].title).toBe('Kök');
    });

    it('ağaç yapısında veri (Children dolu) geldiğinde flat algılama devre dışı kalır, doğrudan işlenir', () => {
        const raw = [{ CategoryId: 1, Name: 'Kök', Children: [{ CategoryId: 2, Name: 'Alt' }] }];
        const tree = m.toInternalCategories(raw);
        expect(tree).toHaveLength(1);
        expect(tree[0].children![0]).toMatchObject({ _id: '2', title: 'Alt', level: 1 });
    });

    it('kök seviyede parentId her zaman "0" sabitlenir (level===0); alt seviyede gelen parentId kullanılır', () => {
        const raw = [{ categoryId: 1, name: 'Kök', children: [{ categoryId: 2, name: 'Alt' }] }];
        const tree = m.toInternalCategories(raw);
        expect(tree[0].parentId).toBe('0');
        expect(tree[0].children![0].parentId).toBe('1');
    });

    it('çocuğu olmayan düğümde children undefined olur (uzunluk 0 ise atlanır)', () => {
        const raw = [{ categoryId: 1, name: 'Tek' }];
        expect(m.toInternalCategories(raw)[0].children).toBeUndefined();
    });

    it('boş/dizi-olmayan girdi -> boş dizi', () => {
        expect(m.toInternalCategories(undefined as any)).toEqual([]);
        expect(m.toInternalCategories([])).toEqual([]);
    });

    it('alan adı varyasyonları (PascalCase/camelCase/categoryName/title) kabul edilir', () => {
        const raw = [{ id: 1, categoryName: 'İsimA' }, { id: 2, title: 'İsimB' }];
        // Not: bu liste ParentId/parentId taşımadığı için isFlat=false -> ağaç yolu (map) kullanılır.
        const tree = m.toInternalCategories(raw);
        expect(tree.map(c => c.title)).toEqual(['İsimA', 'İsimB']);
    });
});

describe('Pazarama CategoryMapper.toInternalAttributes — karakterizasyon', () => {
    const m = new CategoryMapper();

    it('PascalCase alan adlarını okur; değerler title\'a göre sıralanır', () => {
        const raw = [{
            AttributeId: 10, Name: 'Renk', AllowCustom: true, Required: true, IsVariantable: true, IsSlicer: false,
            AttributeValues: [{ Id: 2, Name: 'Mavi' }, { Id: 1, Name: 'Kırmızı' }],
        }];
        const attrs = m.toInternalAttributes(raw);
        expect(attrs[0]).toMatchObject({ _id: '10', title: 'Renk', allowCustom: true, required: true, varianter: true, slicer: false });
        expect(attrs[0].values!.map(v => v.title)).toEqual(['Kırmızı', 'Mavi']);
    });

    it('camelCase alan adlarını okur (PascalCase yoksa)', () => {
        const raw = [{ attributeId: 20, attributeName: 'Beden', isVariant: true, isSlicer: true, allowMultipleSelection: true, values: [{ valueId: 1, valueName: 'M' }] }];
        const attrs = m.toInternalAttributes(raw);
        expect(attrs[0]).toMatchObject({ _id: '20', title: 'Beden', varianter: true, slicer: true, multiple: true });
        expect(attrs[0].values![0]).toEqual({ id: '1', title: 'M' });
    });

    it('title yoksa "Adsız Özellik"; değer title yoksa "Adsız Değer"', () => {
        const raw = [{ AttributeId: 1, AttributeValues: [{ Id: 1 }] }];
        const attrs = m.toInternalAttributes(raw);
        expect(attrs[0].title).toBe('Adsız Özellik');
        expect(attrs[0].values![0].title).toBe('Adsız Değer');
    });

    it('dizi olmayan/boş girdi -> boş dizi', () => {
        expect(m.toInternalAttributes(undefined as any)).toEqual([]);
        expect(m.toInternalAttributes({} as any)).toEqual([]);
    });

    it('öznitelikler title\'a göre sıralanır (attribute seviyesinde de)', () => {
        const raw = [{ AttributeId: 1, Name: 'Z' }, { AttributeId: 2, Name: 'A' }];
        expect(m.toInternalAttributes(raw).map(a => a.title)).toEqual(['A', 'Z']);
    });
});

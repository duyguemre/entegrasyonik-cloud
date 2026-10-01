// Protokol 13 karakterizasyon: Ideasoft `CategoryTransformer` (toInternalCategories / toInternalAttributes).
// ADR-0016 §8.2 B-R-T4 dilimi (Ideasoft + Bizimhesap transformer'ları — SON dilim).
import { describe, it, expect } from '@jest/globals';
import { CategoryTransformer } from '@integration/modules/ecommerce/ideasoft/transformers/CategoryTransformer';

describe('Ideasoft CategoryTransformer.toInternalCategories — karakterizasyon', () => {
    const t = new CategoryTransformer();

    it('dizi değilse veya boşsa boş dizi döner', () => {
        expect(t.toInternalCategories(undefined as any)).toEqual([]);
        expect(t.toInternalCategories(null as any)).toEqual([]);
        expect(t.toInternalCategories([])).toEqual([]);
    });

    it('parent.id yoksa kök (root) düğüm olur, parentId "0", level 0; çocuğu yoksa children alanı SİLİNİR', () => {
        const [root] = t.toInternalCategories([{ id: 1, name: 'Elektronik' }]);
        expect(root).toEqual({ _id: '1', parentId: '0', title: 'Elektronik', level: 0 });
        expect(root).not.toHaveProperty('children');
    });

    it('2 seviyeli hiyerarşi: parent.id eşleşirse child olarak eklenir, level +1 artar', () => {
        const flat = [
            { id: 1, name: 'Elektronik' },
            { id: 2, name: 'Telefon', parent: { id: 1 } },
        ];
        const [root] = t.toInternalCategories(flat);
        expect(root.level).toBe(0);
        expect(root.children).toHaveLength(1);
        expect(root.children![0]).toMatchObject({ _id: '2', parentId: '1', title: 'Telefon', level: 1 });
        expect(root.children![0]).not.toHaveProperty('children');
    });

    it('3 seviyeli hiyerarşide level doğru şekilde 0/1/2 olarak zincirlenir', () => {
        const flat = [
            { id: 1, name: 'A' },
            { id: 2, name: 'B', parent: { id: 1 } },
            { id: 3, name: 'C', parent: { id: 2 } },
        ];
        const [root] = t.toInternalCategories(flat);
        expect(root.level).toBe(0);
        expect(root.children![0].level).toBe(1);
        expect((root.children![0] as any).children[0].level).toBe(2);
    });

    // ŞÜPHELİ DAVRANIŞ (gizli iş kuralı adayı, BACKLOG.md'ye eklendi — DÜZELTİLMEDİ):
    // parent.id belirtilmiş AMA flatList'te o id karşılığı YOKSA ("yetim" kayıt), düğüm köke (roots) düşer;
    // FAKAT map'e ilk geçişte atanan parentId alanı (gerçek/yetim parent id'si) SİLİNMEZ — yani dönen
    // ağaçta "root" olarak görünen bir düğümün parentId'si "0" DEĞİL, var olmayan bir kimliğe işaret edebilir.
    it('parent id\'si listede olmayan "yetim" kayıt köke düşer, ANCAK parentId alanı "0" değil orijinal (var olmayan) id olarak kalır', () => {
        const flat = [{ id: 5, name: 'Yetim', parent: { id: 999 } }];
        const [orphan] = t.toInternalCategories(flat);
        expect(orphan._id).toBe('5');
        expect(orphan.parentId).toBe('999'); // "0" DEĞİL — kayıt fiilen köktedir ama alan öyle demiyor
        expect(orphan.level).toBe(0);
    });

    it('title: name yoksa title alanına, o da yoksa boş string\'e düşer', () => {
        const [a] = t.toInternalCategories([{ id: 1, title: 'Sadece Title' }]);
        expect(a.title).toBe('Sadece Title');
        const [b] = t.toInternalCategories([{ id: 2 }]);
        expect(b.title).toBe('');
    });

    it('birden fazla kök ve birden fazla dal aynı ebeveyne bağlanabilir', () => {
        const flat = [
            { id: 1, name: 'Kök1' },
            { id: 2, name: 'Kök2' },
            { id: 3, name: 'Çocuk1', parent: { id: 1 } },
            { id: 4, name: 'Çocuk2', parent: { id: 1 } },
        ];
        const roots = t.toInternalCategories(flat);
        expect(roots).toHaveLength(2);
        expect(roots[0].children).toHaveLength(2);
    });
});

describe('Ideasoft CategoryTransformer.toInternalAttributes — karakterizasyon', () => {
    const t = new CategoryTransformer();

    it('dizi değilse veya boşsa boş dizi döner', () => {
        expect(t.toInternalAttributes(undefined as any)).toEqual([]);
        expect(t.toInternalAttributes([])).toEqual([]);
    });

    it('optionGroup.id ile gruplanır; groupTitle optionGroup.title\'dan gelir; değerler title\'a göre alfabetik sıralanır', () => {
        const raw = [
            { id: 10, title: 'Kırmızı', optionGroup: { id: 1, title: 'Renk' } },
            { id: 11, title: 'Mavi', optionGroup: { id: 1, title: 'Renk' } },
        ];
        const [group] = t.toInternalAttributes(raw);
        expect(group).toMatchObject({
            _id: '1', title: 'Renk', allowCustom: false, required: false,
            varianter: true, slicer: false, multiple: false,
        });
        expect(group.values).toEqual([
            { id: '10', title: 'Kırmızı' },
            { id: '11', title: 'Mavi' },
        ]);
    });

    it('optionGroup yoksa her kalem kendi id\'sine göre AYRI bir grup olur (groupId = item.id)', () => {
        const raw = [{ id: 20, title: 'Tek Değer' }];
        const [group] = t.toInternalAttributes(raw);
        expect(group._id).toBe('20');
    });

    it('groupTitle önceliği: optionGroup.title > item.title > "Özellik" (optionGroup yoksa item.title kullanılır, "Özellik" DEĞİL)', () => {
        const withItemTitle = t.toInternalAttributes([{ id: 21, title: 'Kalem Başlığı' }]);
        expect(withItemTitle[0].title).toBe('Kalem Başlığı');
        const withNothing = t.toInternalAttributes([{ id: 22 }]);
        expect(withNothing[0].title).toBe('Özellik');
    });

    it('değer title\'ı: item.title yoksa item.name kullanılır', () => {
        const raw = [{ id: 30, name: 'İsimden Gelen', optionGroup: { id: 2, title: 'Grup' } }];
        const [group] = t.toInternalAttributes(raw);
        expect(group.values![0]).toEqual({ id: '30', title: 'İsimden Gelen' });
    });
});

// `codeToCategory.ts` DEVDEN AYRI tutulan (dependency-cruiser döngüsünü önlemek için sıfır-içe-aktarımlı)
// bir eşlemedir; bu test onu GERÇEK `IntegrationDescriptorRegistry` kategorileriyle karşılaştırarak
// kaymayı yakalar. Bu test dosyası çalışma-zamanı modül grafiğinin parçası DEĞİLDİR (yalnız test-zamanında
// yüklenir), bu yüzden döngüye girmeden her iki tarafı da içe aktarabilir.
import { describe, it, expect } from '@jest/globals';
import { INTEGRATION_CODE_CATEGORY, categoryOfIntegrationCode } from '@integration/catalog/codeToCategory';
import { INTEGRATION_DESCRIPTORS } from '@integration/catalog/IntegrationDescriptorRegistry';

describe('codeToCategory.ts — IntegrationDescriptorRegistry ile TUTARLI (kayma yakalayıcı)', () => {
    it('her descriptor kodu için statik harita GERÇEK kategoriyle eşleşir', () => {
        for (const d of INTEGRATION_DESCRIPTORS) {
            expect(INTEGRATION_CODE_CATEGORY[d.code]).toBe(d.category);
            expect(categoryOfIntegrationCode(d.code)).toBe(d.category);
        }
    });

    it('haritadaki kod sayısı descriptor sayısıyla eşit (unutulan yeni adaptör olursa test kırmızıya döner)', () => {
        expect(Object.keys(INTEGRATION_CODE_CATEGORY)).toHaveLength(INTEGRATION_DESCRIPTORS.length);
    });

    it('bilinmeyen kod için marketplace varsayılanına düşer (fırlatmaz)', () => {
        expect(categoryOfIntegrationCode('does-not-exist')).toBe('marketplace');
    });
});

// ADR-0018 Aşama A — kategori kümesi + `shipping<->shipment` eşleyici testleri. Saf birim testi, DB/ağ yok.
import { describe, it, expect } from '@jest/globals';
import {
    INTEGRATION_CATEGORIES, categoryToStorageKey, storageKeyToCategory, type IntegrationCategory,
} from '@integration/catalog/types';

describe('IntegrationCategory — kanonik küme (ADR-0018 Karar 1.1)', () => {
    it('tam olarak 5 kanonik kategori içerir', () => {
        expect(INTEGRATION_CATEGORIES).toEqual(['marketplace', 'ecommerce', 'erp', 'einvoice', 'shipping']);
    });

    it('shipping -> shipment (DB göç edilmez, yalnız eşleyici)', () => {
        expect(categoryToStorageKey('shipping')).toBe('shipment');
    });

    it('diğer 4 kategori DB anahtarıyla birebir aynı ada sahiptir', () => {
        expect(categoryToStorageKey('marketplace')).toBe('marketplace');
        expect(categoryToStorageKey('ecommerce')).toBe('ecommerce');
        expect(categoryToStorageKey('erp')).toBe('erp');
        expect(categoryToStorageKey('einvoice')).toBe('einvoice');
    });

    it('storageKeyToCategory tersine çevirir (shipment -> shipping dahil)', () => {
        expect(storageKeyToCategory('shipment')).toBe('shipping');
        expect(storageKeyToCategory('marketplace')).toBe('marketplace');
        expect(storageKeyToCategory('erp')).toBe('erp');
    });

    it('bilinmeyen depolama anahtarı için undefined döner (fırlatmaz)', () => {
        expect(storageKeyToCategory('payment')).toBeUndefined();
        expect(storageKeyToCategory('')).toBeUndefined();
    });

    it('round-trip: her kanonik kategori storageKey üzerinden kendine döner', () => {
        for (const cat of INTEGRATION_CATEGORIES) {
            const storageKey = categoryToStorageKey(cat);
            expect(storageKeyToCategory(storageKey)).toBe(cat);
        }
    });

    it('tip düzeyinde: IntegrationCategory yalnızca 5 değer kabul eder (derleme-zamanı kontrolü, çalışma-zamanı no-op)', () => {
        const sample: IntegrationCategory = 'shipping';
        expect(INTEGRATION_CATEGORIES).toContain(sample);
    });
});

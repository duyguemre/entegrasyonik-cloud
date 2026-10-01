/**
 * WP9 (faz4-int): Stager.validateMapping — özellik eşlemesi YEREL KATEGORİYE göre aranmalı (import çevirisi de öyle süzer).
 * Saf mantık; DB/ağ YOK.
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('@integration/modules/IntegrationFactory', () => ({ __esModule: true, default: jest.fn() }));

import Stager from '@integration/engine/catalog/import/Stager';

const stager: any = new Stager({} as any);
const req = [{ attributeId: '338', attributeName: 'Beden', attributeValue: 'M', attributeValueId: '7001', varianter: true, slicer: true }];
const catMapping = (local: string) => ({ isCategoryMapping: true, localCategoryId: local, platformCategoryId: '411' });
const attrMapping = (local: string) => ({ localCategoryId: local, platformCategoryId: '411', platformAttributeId: '338', values: [{ platformValueId: '7001', platformValueName: 'M' }] });

describe('Stager.validateMapping — yerel kategori bazlı özellik eşlemesi (WP9)', () => {
    it('özellik eşlemesi BAŞKA yerel kategoride ise bu kategori için geçerli DEĞİL (eksik listelenir)', () => {
        const categoryMap = new Map([['411', [catMapping('L1')]]]);
        const attributeMap = new Map([['411_338', [attrMapping('L2')]]]);
        const r = stager.validateMapping('411', req, categoryMap, attributeMap);
        expect(r.isValid).toBe(false);
        expect(r.localCategoryId).toBe('L1');
        expect(r.missingAttributes).toEqual([expect.objectContaining({ attributeId: '338', localCategoryId: 'L1' })]);
    });

    it('aynı platform kategorisine bağlı iki yerel kategoriden yalnız eşlemesi olan yol geçerli sayılır', () => {
        const categoryMap = new Map([['411', [catMapping('L1'), catMapping('L2')]]]);
        const attributeMap = new Map([['411_338', [attrMapping('L2')]]]);
        const r = stager.validateMapping('411', req, categoryMap, attributeMap);
        expect(r.isValid).toBe(true);
        expect(r.localCategoryId).toBe('L2');
    });

    it('eşleme kendi yerel kategorisindeyse geçerli', () => {
        const r = stager.validateMapping('411', req, new Map([['411', [catMapping('L1')]]]), new Map([['411_338', [attrMapping('L1')]]]));
        expect(r).toMatchObject({ isValid: true, localCategoryId: 'L1', missingAttributes: [] });
    });
});

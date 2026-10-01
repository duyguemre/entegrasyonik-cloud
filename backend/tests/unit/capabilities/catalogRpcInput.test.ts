import { describe, it, expect } from '@jest/globals';
import { RPC_INPUT_SCHEMAS } from '../../../src/capabilities/rpc-input';

// [ADR-0023 WP11] Katalog/eşleme yazma şemaları: FE'nin bugün gönderdiği gövdeler GEÇER, tenant/bilinmeyen alan REDDEDİLİR.
const oid = 'a'.repeat(24);
const ok = (rpc: string, body: unknown) => expect(RPC_INPUT_SCHEMAS[rpc as keyof typeof RPC_INPUT_SCHEMAS]!.safeParse(body).success).toBe(true);
const bad = (rpc: string, body: unknown) => expect(RPC_INPUT_SCHEMAS[rpc as keyof typeof RPC_INPUT_SCHEMAS]!.safeParse(body).success).toBe(false);

describe('katalog/eşleme RPC girdi şemaları (WP11)', () => {
    it('FE gövdeleri geçer', () => {
        ok('AttributeMappingService/autoMatchAllCategories', {});
        ok('AttributeMappingService/autoMatchAllCategories', { integrationCode: 'trendyol' });
        ok('AttributeMappingService/saveCategoryMapping', { localCategoryId: oid, integrationCode: 'trendyol', platformCategoryId: 411, isCategoryMapping: true });
        ok('AttributeMappingService/saveAttributeMapping', { integrationCode: 'trendyol', localCategoryId: oid, platformCategoryId: '411', platformAttributeId: 338, platformAttributeName: 'Beden', localChoiceId: oid, isVarianter: true, isSlicer: false, isRequired: true, isCategoryMapping: false, values: [{ localValueId: oid, platformValueId: null, platformValueName: 'Özel' }, { localValueId: oid, platformValueId: 5, platformValueName: 'M' }] });
        ok('AttributeMappingService/saveAttributeValueMapping', { integrationCode: 'trendyol', platformCategoryId: '411', platformAttributeId: '338', localChoiceId: oid, localValueId: oid, platformValueId: '1', platformValueName: 'M', isAllowCustom: false, isMultiple: null, isCategoryMapping: false });
        ok('AttributeMappingService/deleteFullMapping', { localCategoryId: oid, integrationCode: -1 });
        ok('BrandService/updateBrand', { _id: oid, title: 'X' });
        ok('BrandService/deleteBrand', { _id: oid, parentId: undefined });
        ok('CategoryService/addCategory', { parentCategoryId: oid, title: 'K' });
        ok('ChoiceService/updateChoice', { _id: oid, title: 'Renk', isVarianter: false, isSlicer: false });
        ok('ChoiceService/addPreparedChoice', { choice: { title: 'Renk', values: [{ title: 'Siyah' }] } });
        ok('ChoiceService/get', {});
    });
    it('tenant/bilinmeyen alan ve enjeksiyon reddedilir', () => {
        bad('AttributeMappingService/saveCategoryMapping', { localCategoryId: oid, integrationCode: 'trendyol', platformCategoryId: '1', clientId: 5 });
        bad('AttributeMappingService/saveCategoryMapping', { localCategoryId: { $ne: null }, integrationCode: 'trendyol', platformCategoryId: '1' });
        bad('AttributeMappingService/saveCategoryMapping', { localCategoryId: 'x', integrationCode: 'trendyol', platformCategoryId: '1' });
        bad('AttributeMappingService/saveAttributeMapping', { integrationCode: 'trendyol', localCategoryId: oid, platformCategoryId: '1', platformAttributeId: '2', localChoiceId: oid, values: [{ localValueId: oid }] });
        bad('AttributeMappingService/saveAttributeValueMapping', { integrationCode: 'trendyol', platformCategoryId: '1', platformAttributeId: '2', localChoiceId: oid, localValueId: oid, owner: 1 });
        bad('AttributeMappingService/autoMatchAllCategories', { integrationCode: 'a b' });
        bad('BrandService/addBrand', { title: '' });
        bad('ChoiceService/removeChoice', { _id: { $gt: '' } });
        bad('CategoryService/deleteCategory', { _id: oid, tenant: 1 });
    });
});

import { describe, it, expect } from '@jest/globals';
import { RPC_INPUT_SCHEMAS } from '../../../src/capabilities/rpc-input';

// [ADR-0030 X5] Ürün/varyant/fatura/kargo/müşteri/entegrasyon yazma şemaları: FE gövdeleri geçer, enjeksiyon/bilinmeyen üst alan reddedilir.
const oid = 'a'.repeat(24);
const parse = (rpc: string, body: unknown) => RPC_INPUT_SCHEMAS[rpc as keyof typeof RPC_INPUT_SCHEMAS]!.safeParse(body);
const ok = (rpc: string, body: unknown) => expect(parse(rpc, body).success).toBe(true);
const bad = (rpc: string, body: unknown) => expect(parse(rpc, body).success).toBe(false);

describe('X5 yazma şemaları', () => {
    it('FE gövdeleri geçer', () => {
        const variant = { _id: oid, stockcode: 'S1', barcode: '123', stock: 5, prices: { price: 1 }, choices: [], platforms: {}, reserved: 2 };
        ok('ProductService/saveProduct', { productInfo: { tempId: oid, title: 'T', hasVariant: false, maincode: 'm', prices: {}, platformUploads: {}, variants: [{ stockcode: 'S', stock: '3' }] } });
        ok('ProductService/updateProduct', { productInfo: { _id: oid, title: 'T', hasVariant: true, extra: 1, variants: [variant] } });
        ok('VariantService/addVariant', { productId: oid, variant: { stockcode: 'S' } });
        ok('VariantService/addVariants', { productId: oid, singleVariant: { prices: { price: 1 }, choices: [] }, variantChoices: [[{ choiceId: oid, choiceValueId: oid }]] });
        ok('VariantService/updateVariants', { productId: oid, variants: [variant] });
        ok('VariantService/deleteVariant', { variantId: oid });
        ok('VariantService/batchProcessUpdate', { productId: oid, scope: 1, selectedVariants: [oid], batchProcessForm: { stock: 3, prices: { salePrice: 1 } } });
        ok('VariantService/batchProcessDelete', { productId: oid, scope: 2 });
        ok('InvoiceService/createInvoice', { orderId: oid });
        ok('InvoiceService/createInvoice', { orderId: oid, invoiceData: { invoiceNumber: 'A1', ettn: 'x', issueDate: '2026-01-01', unknown: 1 } });
        ok('InvoiceService/bulkCreateInvoice', { orderIds: [oid] });
        ok('InvoiceService/resolveAndReissueInvoice', { orderId: oid });
        ok('InvoiceService/createManualInvoice', { data: { invoiceNumber: '', ettn: '', type: 'SALES', documentType: 'E_ARSIV', externalOrderId: '', totalAmount: 0, pdfUrl: '' } });
        ok('ShipmentService/bulkCreateShipment', { orderIds: [oid] });
        ok('CustomerService/updateCustomer', { customerId: oid, updateData: { firstName: 'A', lastName: '', phone: '', email: '', status: 'ACTIVE' } });
        ok('IntegrationService/saveOrUpdateIntegrationBrand', { integrationBrand: { brandId: oid, integrationCode: 'trendyol', integrationBrandId: 1 } });
        ok('IntegrationService/savePlatformUploadIsReadyForProduct', { productId: oid, integrationCode: 'trendyol', isReady: true });
        ok('IntegrationService/sortClientMarketplaces', { sortedCodes: ['trendyol', 'n11'] });
    });
    it('enjeksiyon, tip ve bilinmeyen üst alan reddedilir', () => {
        bad('ProductService/saveProduct', { productInfo: { variants: [] }, clientId: 1 });
        bad('ProductService/saveProduct', { productInfo: { title: 'T' } });
        bad('ProductService/saveProduct', { productInfo: { $where: '1', variants: [] } });
        bad('ProductService/updateProduct', { productInfo: { variants: [] } });
        bad('ProductService/updateProduct', { productInfo: { _id: { $ne: null }, variants: [] } });
        bad('VariantService/updateVariants', { productId: oid, variants: [{ stockcode: 'x' }] });
        bad('VariantService/addVariant', { productId: oid, variant: { 'a.b': 1 } });
        bad('VariantService/deleteVariant', { variantId: { $ne: 1 } });
        bad('VariantService/batchProcessUpdate', { productId: oid, scope: 9, batchProcessForm: { prices: {} } });
        bad('InvoiceService/bulkCreateInvoice', { orderIds: [] });
        bad('ShipmentService/bulkCreateShipment', { orderIds: { $ne: 1 } });
        bad('CustomerService/updateCustomer', { customerId: oid, updateData: { status: 'X' } });
        bad('IntegrationService/savePlatformUploadIsReadyForProduct', { productId: oid, integrationCode: 'a.b', isReady: true });
        bad('IntegrationService/sortClientMarketplaces', { sortedCodes: ['a b'] });
    });
    it('müşteri güncellemesinde operatör/bilinmeyen alan servise ulaşmaz (strip)', () => {
        const r = parse('CustomerService/updateCustomer', { customerId: oid, updateData: { firstName: 'A', $set: { status: 'BLOCKED' }, metrics: { totalSpent: 9 } } });
        expect(r.success && (r.data as any).updateData).toEqual({ firstName: 'A' });
    });
});

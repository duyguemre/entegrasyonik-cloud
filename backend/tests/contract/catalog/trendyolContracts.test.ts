// ADR-0018 Karar 4 Aşama A DoD: "Trendyol orders.list + claims.list" zod sözleşmeleri. Bu test yalnız
// şemaların KENDİ İÇ TUTARLILIĞINI doğrular (saf birim testi, DB/ağ yok); ContractGuard davranışı
// ContractGuard.test.ts'te ayrıca doğrulanmıştır.
import { describe, it, expect } from '@jest/globals';
import { TRENDYOL_ORDERS_LIST_CONTRACT } from '@integration/modules/marketplace/trendyol/contracts/orders.list';
import { TRENDYOL_CLAIMS_LIST_CONTRACT } from '@integration/modules/marketplace/trendyol/contracts/claims.list';
import { getIntegrationDescriptor } from '@integration/catalog/IntegrationDescriptorRegistry';

describe('Trendyol contract kimlikleri — descriptor.contracts[] ile tutarlı', () => {
    it('trendyol.orders.list@v2 ve trendyol.claims.list@v1, descriptor.contracts dizisinde listeli', () => {
        const d = getIntegrationDescriptor('trendyol')!;
        expect(d.contracts).toContain(TRENDYOL_ORDERS_LIST_CONTRACT.id);
        expect(d.contracts).toContain(TRENDYOL_CLAIMS_LIST_CONTRACT.id);
    });
});

describe('trendyol.orders.list@v2 şeması — C22 V2 mock örneğiyle uyum', () => {
    it('V2 alan adlarıyla (yeniden adlandırma SONRASI) gerçekçi bir zarf başarıyla ayrıştırılır', () => {
        const sample = {
            content: [{
                shipmentPackageId: 123456, orderNumber: 'TY123456', status: 'Created',
                customerFirstName: 'Ahmet', customerLastName: 'Yılmaz', customerEmail: 'a@mock.com',
                customerId: 123456, currencyCode: 'TRY', packageGrossAmount: 150, packageTotalPrice: 150,
                cargoProviderName: 'Trendyol Express', orderDate: 1234567890000,
                shipmentAddress: { fullName: 'Ahmet Yılmaz', city: 'İstanbul', extraFieldTrendyolMayAdd: 'x' },
                lines: [{ lineId: 1, barcode: 'B1', productName: 'Ürün', quantity: 1, lineUnitPrice: 150, vatRate: 20, stockCode: 'SK1' }],
            }],
            totalPages: 1, totalElements: 1,
        };
        const result = TRENDYOL_ORDERS_LIST_CONTRACT.schema.safeParse(sample);
        expect(result.success).toBe(true);
    });

    it('eski V1 alan adları (line.id, line.price) da PARSE EDİLİR (OrderTransformer.ts fallback\'iyle tutarlı, .strict() ihlali OLUŞTURMAZ)', () => {
        const sample = { content: [{ id: 1, orderNumber: 'X', lines: [{ id: 1, price: 100 }] }] };
        expect(TRENDYOL_ORDERS_LIST_CONTRACT.schema.safeParse(sample).success).toBe(true);
    });

    it('gerçekten YENİ (bilinmeyen) bir satır alanı .strict() ihlali üretir (unrecognized_keys)', () => {
        const sample = { content: [{ id: 1, lines: [{ id: 1, brandNewTrendyolField: 'x' }] }] };
        const result = TRENDYOL_ORDERS_LIST_CONTRACT.schema.safeParse(sample);
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.some((i) => i.code === 'unrecognized_keys')).toBe(true);
        }
    });

    it('içerik boş/tanımsız zarf da ayrıştırılır (passthrough zarf, strict yalnız item düzeyinde)', () => {
        expect(TRENDYOL_ORDERS_LIST_CONTRACT.schema.safeParse({}).success).toBe(true);
        expect(TRENDYOL_ORDERS_LIST_CONTRACT.schema.safeParse({ content: [] }).success).toBe(true);
    });
});

describe('trendyol.claims.list@v1 şeması', () => {
    it('gerçekçi bir iade zarfı başarıyla ayrıştırılır', () => {
        const sample = {
            content: [{
                claimId: 'C1', orderNumber: 'TY1', status: 'Created', currencyCode: 'TRY',
                totalRefundAmount: 50, items: [{ orderLine: { id: 1 }, claimItems: [{ id: 2 }] }],
                cargoProviderName: 'Aras',
            }],
            totalPages: 1,
        };
        expect(TRENDYOL_CLAIMS_LIST_CONTRACT.schema.safeParse(sample).success).toBe(true);
    });
});

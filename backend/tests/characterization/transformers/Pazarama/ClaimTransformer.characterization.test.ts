// Protokol 13 karakterizasyon: Pazarama `ClaimMapper` (iade talebi dönüşümü — PascalCase/camelCase toleransı,
// sayısal statü kodları). ADR-0016 §8.2 B-R-T4 dilimi.
import { describe, it, expect } from '@jest/globals';
import { ClaimMapper } from '@integration/modules/marketplace/pazarama/transformers/ClaimTransformer';
import { ClaimInternalStatusEnum, ClaimTypeEnum } from '@interfaces/index';

describe('Pazarama ClaimMapper.toInternalClaimPackages — sarmalayıcı ve alan adı varyasyonları (karakterizasyon)', () => {
    const m = new ClaimMapper();

    it('{ data: { refundList: [...] } } sarmalayıcısını okur (PascalCase alanlar)', () => {
        const raw = {
            data: {
                refundList: [{
                    refundId: 'R1', CustomerName: 'Ayşe Kara', CustomerId: 'C1', OrderNumber: 'O1',
                    RefundStatus: 1, RefundAmount: { Value: 120, Currency: 'TRY' }, RefundDate: '2026-01-10T00:00:00.000Z',
                    orderItem: [{ orderItemId: 'OI1', productCode: 'P1', productName: 'Ürün', productStockCode: 'SKU1', quantity: 1, unitPrice: { Value: 120 } }],
                    RefundType: 'İade', RefundNumber: 'RN1',
                }],
            },
        };
        const [pkg] = m.toInternalClaimPackages(raw);
        expect(pkg.customer).toMatchObject({ firstName: 'Ayşe', lastName: 'Kara', externalIdentities: [{ integrationCode: 'pazarama', externalCustomerId: 'C1' }] });
        expect(pkg.claim.externalClaimId).toBe('R1');
        expect(pkg.claim.externalOrderId).toBe('O1');
        expect(pkg.claim.type).toBe(ClaimTypeEnum.REFUND);
        expect(pkg.claim.totalRefundAmount).toBe(120);
        expect(pkg.claim.currencyCode).toBe('TRY');
        expect(pkg.claim.claimedAt).toEqual(new Date('2026-01-10T00:00:00.000Z'));
        expect(pkg.claim.items).toEqual([{
            externalLineItemId: 'OI1', externalItemId: 'P1', productName: 'Ürün', sku: 'SKU1', barcode: 'P1', quantity: 1, unitPrice: 120, reason: 'İade',
        }]);
    });

    it('{ refundList: [...] } (data sarmalayıcısı olmadan) ve doğrudan dizi de kabul edilir', () => {
        const flat = m.toInternalClaimPackages({ refundList: [{ refundId: 'R2', RefundStatus: 10 }] } as any);
        expect(flat).toHaveLength(1);
        const arr = m.toInternalClaimPackages([{ refundId: 'R3', RefundStatus: 10 }] as any);
        expect(arr).toHaveLength(1);
    });

    it('camelCase alan adları da (PascalCase yoksa) kabul edilir', () => {
        const raw = { refundList: [{ refundId: 'R4', customerName: 'Ali Veli', customerId: 'C2', orderNumber: 'O2', refundStatus: 8, refundAmount: { value: 50, currency: 'USD' } }] };
        const [pkg] = m.toInternalClaimPackages(raw);
        expect(pkg.customer.firstName).toBe('Ali');
        expect(pkg.claim.totalRefundAmount).toBe(50);
        expect(pkg.claim.currencyCode).toBe('USD');
    });

    it('orderItem dizisi yoksa ama ProductCode varsa TEK kalemli claimItems üretilir; unitPrice RefundAmount\'tan gelir', () => {
        const raw = { refundList: [{ refundId: 'R5', ProductCode: 'PC1', ProductName: 'Tekli Ürün', ProductStockCode: 'SK1', RefundAmount: { Value: 30 }, RefundStatus: 8, quantity: 3 }] };
        const [pkg] = m.toInternalClaimPackages(raw);
        expect(pkg.claim.items).toEqual([{ externalLineItemId: '', externalItemId: 'PC1', productName: 'Tekli Ürün', sku: 'SK1', barcode: 'PC1', quantity: 3, unitPrice: 30, reason: 'Belirtilmedi' }]);
    });

    it('ne orderItem ne ProductCode varsa claimItems boş dizi kalır', () => {
        const raw = { refundList: [{ refundId: 'R6', RefundStatus: 8 }] };
        const [pkg] = m.toInternalClaimPackages(raw);
        expect(pkg.claim.items).toEqual([]);
    });

    it('shipmentCode: ShipmentCode > shipmentCode > CargoTrackingNumber > TrackingCode sırasıyla; RefundStatus===1 + kod varsa statusDescription "Müşteri İade Kodu Aldı"', () => {
        const raw = { refundList: [{ refundId: 'R7', RefundStatus: 1, TrackingCode: 'TRK-9' }] };
        const [pkg] = m.toInternalClaimPackages(raw);
        expect(pkg.claim.fulfillment).toMatchObject({ trackingCode: 'TRK-9' });
        expect(pkg.claim.externalStatus).toBe('Müşteri İade Kodu Aldı');
    });

    it('fulfillment.carrierName yoksa "Pazarama Lojistik" varsayılır', () => {
        const raw = { refundList: [{ refundId: 'R8', RefundStatus: 8 }] };
        const [pkg] = m.toInternalClaimPackages(raw);
        expect(pkg.claim.fulfillment!.carrierName).toBe('Pazarama Lojistik');
    });

    it.each([
        [1, ClaimInternalStatusEnum.UNDER_REVIEW],
        [2, ClaimInternalStatusEnum.APPROVED],
        [4, ClaimInternalStatusEnum.APPROVED],
        [6, ClaimInternalStatusEnum.APPROVED],
        [8, ClaimInternalStatusEnum.APPROVED],
        [10, ClaimInternalStatusEnum.COMPLETED],
        [3, ClaimInternalStatusEnum.REJECTED],
        [5, ClaimInternalStatusEnum.REJECTED],
        [7, ClaimInternalStatusEnum.CANCELLED],
        [999, ClaimInternalStatusEnum.UNDER_REVIEW], // bilinmeyen kod -> sessizce UNDER_REVIEW
        [undefined, ClaimInternalStatusEnum.UNDER_REVIEW],
    ])('mapNumericClaimStatus(%s) -> %s', (status, expected) => {
        const raw = { refundList: [{ refundId: 'X', RefundStatus: status }] };
        const [pkg] = m.toInternalClaimPackages(raw);
        expect(pkg.claim.internalStatus).toBe(expected);
    });

    it('meta ham veriyi olduğu gibi saklar; history açıklaması RefundNumber ve statusDescription içerir', () => {
        const raw = { refundList: [{ refundId: 'R9', RefundStatus: 8, RefundNumber: 'RN9', RefundStatusName: 'Onaylandı' }] };
        const [pkg] = m.toInternalClaimPackages(raw);
        expect(pkg.claim.meta).toMatchObject({ refundId: 'R9' });
        expect(pkg.claim.history[0].description).toContain('RN9');
        expect(pkg.claim.history[0].description).toContain('Onaylandı');
    });
});

describe('Pazarama ClaimMapper.toInternalClaimRejectionReasons — karakterizasyon', () => {
    const m = new ClaimMapper();
    it('id/title eşler; title yoksa name, o da yoksa "Sebep belirtilmemiş"', () => {
        expect(m.toInternalClaimRejectionReasons([{ id: 1, title: 'A' }, { id: 2, name: 'B' }, { id: 3 }]))
            .toEqual([{ id: '1', title: 'A' }, { id: '2', title: 'B' }, { id: '3', title: 'Sebep belirtilmemiş' }]);
    });
});

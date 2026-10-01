// Protokol 13 karakterizasyon: Hepsiburada `ClaimMapper` (iade/talep dönüşümü). ADR-0016 §8.2 B-R-T4 dilimi.
import { describe, it, expect } from '@jest/globals';
import { ClaimMapper } from '@integration/modules/marketplace/hepsiburada/transformers/ClaimTransformer';
import { ClaimInternalStatusEnum, ClaimTypeEnum } from '@interfaces/index';

function baseClaim(overrides: any = {}) {
    return {
        id: 'CLM-1', number: 'CLM-NUM-1', orderNumber: 'HB-1001', customerName: 'Ayşe Demir', customerId: 'CUST-9',
        lineItemId: 'LI-1', sku: 'PLAT-SKU-1', merchantSku: 'SKU-1', productName: 'Ürün X', quantity: 2, price: 50,
        claimType: 'DamagedProduct', status: 'newrequest', totalPriceAmount: 100, priceCurrency: 'TRY',
        claimDate: '2026-01-05T00:00:00.000Z', trackingCode: 'TRK-1', carrierName: 'Sürat Kargo',
        ...overrides,
    };
}

describe('Hepsiburada ClaimMapper.toInternalClaimPackages — karakterizasyon', () => {
    const m = new ClaimMapper();

    it('mutlu yol: müşteri/kalem/talep alanları doğru eşlenir', () => {
        const [pkg] = m.toInternalClaimPackages([baseClaim()]);
        expect(pkg.customer).toMatchObject({ firstName: 'Ayşe', lastName: 'Demir', externalIdentities: [{ integrationCode: 'hepsiburada', externalCustomerId: 'CUST-9' }] });
        expect(pkg.claim.externalClaimId).toBe('CLM-1');
        expect(pkg.claim.externalOrderId).toBe('HB-1001');
        expect(pkg.claim.type).toBe(ClaimTypeEnum.REFUND);
        expect(pkg.claim.totalRefundAmount).toBe(100);
        expect(pkg.claim.currencyCode).toBe('TRY');
        expect(pkg.claim.claimedAt).toEqual(new Date('2026-01-05T00:00:00.000Z'));
        expect(pkg.claim.items).toEqual([{
            externalLineItemId: 'LI-1', externalItemId: 'PLAT-SKU-1', productName: 'Ürün X', sku: 'SKU-1',
            barcode: 'PLAT-SKU-1', quantity: 2, unitPrice: 50, reason: 'DamagedProduct',
        }]);
        expect(pkg.claim.fulfillment).toEqual({ trackingCode: 'TRK-1', carrierName: 'Sürat Kargo' });
        expect(pkg.claim.internalStatus).toBe(ClaimInternalStatusEnum.WAITING);
        expect(pkg.claim.history).toHaveLength(1);
        expect(pkg.claim.history[0]).toMatchObject({ status: ClaimInternalStatusEnum.WAITING, actionBy: 'SYSTEM' });
        expect(pkg.claim.history[0].description).toContain('CLM-NUM-1');
    });

    it('claim.id yoksa claim.number externalClaimId olarak kullanılır', () => {
        const [pkg] = m.toInternalClaimPackages([baseClaim({ id: undefined, number: 'ONLY-NUM' })]);
        expect(pkg.claim.externalClaimId).toBe('ONLY-NUM');
    });

    it('customerName yoksa firstName "Müşteri", lastName ""', () => {
        const [pkg] = m.toInternalClaimPackages([baseClaim({ customerName: undefined })]);
        expect(pkg.customer.firstName).toBe('Müşteri');
        expect(pkg.customer.lastName).toBe('');
    });

    it('trackingCode yoksa fulfillment undefined olur', () => {
        const [pkg] = m.toInternalClaimPackages([baseClaim({ trackingCode: undefined })]);
        expect(pkg.claim.fulfillment).toBeUndefined();
    });

    it('carrierName yoksa "Hepsiburada Lojistik" varsayılır (trackingCode varken)', () => {
        const [pkg] = m.toInternalClaimPackages([baseClaim({ carrierName: undefined })]);
        expect(pkg.claim.fulfillment).toEqual({ trackingCode: 'TRK-1', carrierName: 'Hepsiburada Lojistik' });
    });

    it('totalPriceAmount yoksa refundAmount kullanılır, o da yoksa 0; priceCurrency yoksa refundCurrency, o da yoksa TRY', () => {
        const [pkg] = m.toInternalClaimPackages([baseClaim({ totalPriceAmount: undefined, refundAmount: 75, priceCurrency: undefined, refundCurrency: 'USD' })]);
        expect(pkg.claim.totalRefundAmount).toBe(75);
        expect(pkg.claim.currencyCode).toBe('USD');
        const [pkgNone] = m.toInternalClaimPackages([baseClaim({ totalPriceAmount: undefined, priceCurrency: undefined })]);
        expect(pkgNone.claim.totalRefundAmount).toBe(0);
        expect(pkgNone.claim.currencyCode).toBe('TRY');
    });

    it('claimType yoksa reason "Belirtilmedi"', () => {
        const [pkg] = m.toInternalClaimPackages([baseClaim({ claimType: undefined })]);
        expect(pkg.claim.items[0].reason).toBe('Belirtilmedi');
    });

    it.each([
        ['newrequest', ClaimInternalStatusEnum.WAITING],
        ['intransit', ClaimInternalStatusEnum.UNDER_REVIEW],
        ['awaitingaction', ClaimInternalStatusEnum.UNDER_REVIEW],
        ['accepted', ClaimInternalStatusEnum.COMPLETED],
        ['refunded', ClaimInternalStatusEnum.COMPLETED],
        ['rejected', ClaimInternalStatusEnum.REJECTED],
        ['cancelled', ClaimInternalStatusEnum.CANCELLED],
        ['indispute', ClaimInternalStatusEnum.DISPUTED],
        ['NewRequest', ClaimInternalStatusEnum.WAITING], // büyük/küçük harf duyarsız
        ['BilinmeyenStatu', ClaimInternalStatusEnum.WAITING], // bilinmeyen -> WAITING (sessizce)
        [undefined, ClaimInternalStatusEnum.WAITING],
    ])('mapStringClaimStatus("%s") -> %s', (status, expected) => {
        const [pkg] = m.toInternalClaimPackages([baseClaim({ status: status as any })]);
        expect(pkg.claim.internalStatus).toBe(expected);
    });

    it('boş dizi/dizi-olmayan girdi -> boş dizi (kırılmaz)', () => {
        expect(m.toInternalClaimPackages([])).toEqual([]);
        expect(m.toInternalClaimPackages(null as any)).toEqual([]);
    });
});

describe('Hepsiburada ClaimMapper.toInternalClaimRejectionReasons — karakterizasyon', () => {
    const m = new ClaimMapper();

    it('id/title eşler; title yoksa name, o da yoksa "Sebep belirtilmemiş"', () => {
        const res = m.toInternalClaimRejectionReasons([{ id: 1, title: 'Yanlış Ürün' }, { id: 2, name: 'Hasarlı' }, { id: 3 }]);
        expect(res).toEqual([
            { id: '1', title: 'Yanlış Ürün' },
            { id: '2', title: 'Hasarlı' },
            { id: '3', title: 'Sebep belirtilmemiş' },
        ]);
    });
});

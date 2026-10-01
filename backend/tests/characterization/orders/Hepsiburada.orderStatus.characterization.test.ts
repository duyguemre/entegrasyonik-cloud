// Protokol 13 karakterizasyon: Hepsiburada `OrderMapper.mapStringStatus` (dış statü -> dahili statü) — ADR-0018
// Karar 2a(iii) `reportUnknownEnum` eklenmeden ÖNCE BUGÜNKÜ davranışı sabitler. Bilinmeyen statü SESSİZCE
// `AWAITING_APPROVAL`'a düşüyor (B7 bulgusu benzeri) — bu test önce bu davranışı KİLİTLER, sonra
// `reportUnknownEnum` eklenince (kod değişikliği ayrı commit) AYNI kalmalı.
import { describe, it, expect } from '@jest/globals';
import { OrderInternalStatusEnum } from '@interfaces/index';
import { OrderMapper } from '@integration/modules/marketplace/hepsiburada/transformers/OrderTransformer';

function sampleOrder(status: string | undefined) {
    return {
        orderNumber: 'HB-1', customerName: 'Ahmet Yılmaz', customerEmail: 'a@mock.com',
        status, shippingAddress: {}, billingAddress: {}, totalPrice: { amount: 100, currency: 'TRY' }, lineItems: [],
    };
}

describe('Hepsiburada OrderMapper.mapStringStatus — mevcut davranış (karakterizasyon)', () => {
    const mapper = new OrderMapper();

    it.each([
        ['open', OrderInternalStatusEnum.AWAITING_APPROVAL],
        ['awaitingapproval', OrderInternalStatusEnum.AWAITING_APPROVAL],
        ['packaged', OrderInternalStatusEnum.APPROVED],
        ['unpacked', OrderInternalStatusEnum.APPROVED],
        ['shipped', OrderInternalStatusEnum.SHIPPED],
        ['delivered', OrderInternalStatusEnum.DELIVERED],
        ['cancelledbymerchant', OrderInternalStatusEnum.CANCELLED],
        ['cancelledbycustomer', OrderInternalStatusEnum.CANCELLED],
        ['cancelled', OrderInternalStatusEnum.CANCELLED],
        ['returned', OrderInternalStatusEnum.RETURNED],
        // Büyük/küçük harf duyarsız (toLowerCase() kullanılıyor)
        ['OPEN', OrderInternalStatusEnum.AWAITING_APPROVAL],
        ['Shipped', OrderInternalStatusEnum.SHIPPED],
    ])('bilinen statü "%s" -> %s', (status, expected) => {
        const [pkg] = mapper.toInternalOrderPackages([sampleOrder(status)]);
        expect(pkg.order.internalStatus).toBe(expected);
    });

    it.each([
        ['BrandNewStatus', OrderInternalStatusEnum.AWAITING_APPROVAL],
        ['', OrderInternalStatusEnum.AWAITING_APPROVAL],
        [undefined, OrderInternalStatusEnum.AWAITING_APPROVAL],
    ])('BİLİNMEYEN statü "%s" -> SESSİZCE AWAITING_APPROVAL\'a düşer (bugünkü davranış)', (status, expected) => {
        const [pkg] = mapper.toInternalOrderPackages([sampleOrder(status as any)]);
        expect(pkg.order.internalStatus).toBe(expected);
    });
});

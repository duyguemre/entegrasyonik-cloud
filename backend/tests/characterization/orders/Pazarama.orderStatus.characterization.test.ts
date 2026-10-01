// Protokol 13 karakterizasyon: Pazarama `OrderMapper.mapNumericStatus` (dış statü kodu -> dahili statü) —
// ADR-0018 Karar 2a(iii) `reportUnknownEnum` eklenmeden ÖNCE BUGÜNKÜ davranışı sabitler (ADR-0018 B7
// bulgusu: "Pazarama mapStatus, bilinmeyen sipariş durumunu UNAPPROVED'a düşürüyor").
import { describe, it, expect } from '@jest/globals';
import { OrderInternalStatusEnum } from '@interfaces/index';
import { OrderMapper } from '@integration/modules/marketplace/pazarama/transformers/OrderTransformer';

function sampleOrder(status: number | string | undefined) {
    return {
        OrderNumber: 'PZ-1', CustomerName: 'Ahmet Yılmaz', OrderStatus: status,
        Lines: [{ Status: status, Quantity: 1, Price: 10 }],
    };
}

describe('Pazarama OrderMapper.mapNumericStatus — mevcut davranış (karakterizasyon)', () => {
    const mapper = new OrderMapper();

    it.each([
        [3, OrderInternalStatusEnum.AWAITING_APPROVAL],
        [12, OrderInternalStatusEnum.APPROVED],
        [5, OrderInternalStatusEnum.SHIPPED],
        [16, OrderInternalStatusEnum.SHIPPED],
        [19, OrderInternalStatusEnum.SHIPPED],
        [11, OrderInternalStatusEnum.DELIVERED],
        [9, OrderInternalStatusEnum.DELIVERED],
        [6, OrderInternalStatusEnum.CANCELLED],
        [18, OrderInternalStatusEnum.CANCELLED],
        [13, OrderInternalStatusEnum.CANCELLED],
        [14, OrderInternalStatusEnum.CANCELLED],
        [7, OrderInternalStatusEnum.RETURNED],
        [8, OrderInternalStatusEnum.RETURNED],
        [10, OrderInternalStatusEnum.RETURNED],
    ])('bilinen statü kodu %i -> %s', (status, expected) => {
        const [pkg] = mapper.toInternalOrderPackages([sampleOrder(status)]);
        expect(pkg.order.internalStatus).toBe(expected);
    });

    it.each([
        [999, OrderInternalStatusEnum.UNAPPROVED],
        [-1, OrderInternalStatusEnum.UNAPPROVED],
        [undefined, OrderInternalStatusEnum.UNAPPROVED],
    ])('BİLİNMEYEN statü kodu %s -> SESSİZCE UNAPPROVED\'a düşer (bugünkü davranış)', (status, expected) => {
        const [pkg] = mapper.toInternalOrderPackages([sampleOrder(status as any)]);
        expect(pkg.order.internalStatus).toBe(expected);
    });
});

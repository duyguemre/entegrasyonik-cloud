// Protokol 13 karakterizasyon: N11 `OrderMapper.toInternalOrderPackages` (SOAP ham `orderList.order[].status` ->
// dahili statü) — ADR-0018 Karar 2a(iii) düzeltmesi.
//
// [N11 internalStatus düzeltmesi, 2026-09-29] TERS ÇEVRİLDİ: ÖNCEKİ davranış (bkz. git geçmişi, commit ca6f6b5)
// `internalStatus`'u HAM DURUMDAN BAĞIMSIZ HER ZAMAN `APPROVED`'a sabitliyordu (MASTER_STATE.md madde 9
// bulgusu). YENİ davranış: bilinen ham statüler (kaynak: `n11APISoapREFERANSDOKUMANTASYONU_v9_0.docx` §3.7
// GetShipmentPackages — bkz. `OrderMapper.ts` STATUS_RULES JSDoc'u) doğru kovaya düşer; bilinmeyen bir statü
// SESSİZCE düşmez, `reportUnknownEnum` çağrılır ve DAVRANIŞ güvenli tarafta kalır (APPROVED — zero-oversell).
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { OrderInternalStatusEnum } from '@interfaces/index';
import { OrderMapper, N11_ORDERS_CONTRACT_ID } from '@integration/modules/marketplace/n11/transformers/OrderMapper';
import { setUnknownEnumSink, resetUnknownEnumState, type UnknownEnumEvent } from '@integration/modules/common/contract/reportUnknownEnum';

function soapResponse(status: string | undefined) {
    return {
        orderList: {
            order: [{
                orderNumber: 'N11-1',
                status,
                createDate: '01/01/2026 10:00',
                buyer: { fullName: 'Ahmet Yılmaz', email: 'a@mock.com' },
                shippingAddress: { address: 'Adres', city: 'İstanbul', district: 'Kadıköy' },
                totalAmount: '100',
                orderItemList: {
                    orderItem: [{
                        id: '1', productId: 'P1', productName: 'Ürün', sellerStockCode: 'SKU1',
                        quantity: '1', price: '100',
                    }],
                },
            }],
        },
    };
}

describe('N11 OrderMapper.toInternalOrderPackages — bilinen ham statüler doğru kovaya düşer', () => {
    const mapper = new OrderMapper();

    it.each([
        ['Created', OrderInternalStatusEnum.UNAPPROVED],
        ['Picking', OrderInternalStatusEnum.APPROVED],
        ['Shipped', OrderInternalStatusEnum.SHIPPED],
        ['Delivered', OrderInternalStatusEnum.DELIVERED],
        ['Cancelled', OrderInternalStatusEnum.CANCELLED],
        ['UnSupplied', OrderInternalStatusEnum.CANCELLED],
        // Büyük/küçük harf duyarsız (toLowerCase() kullanılıyor)
        ['created', OrderInternalStatusEnum.UNAPPROVED],
        ['SHIPPED', OrderInternalStatusEnum.SHIPPED],
    ])('bilinen ham statü "%s" -> %s', (status, expected) => {
        const [pkg] = mapper.toInternalOrderPackages(soapResponse(status));
        expect(pkg.order.internalStatus).toBe(expected);
        // Kayıp yok: ham değer externalStatus'a aynen yazılmaya devam ediyor.
        expect(pkg.order.externalStatus).toBe(status);
    });
});

describe('N11 OrderMapper.toInternalOrderPackages — bilinmeyen statü reportUnknownEnum çağırır, davranış güvenli tarafta (APPROVED)', () => {
    let events: UnknownEnumEvent[];
    beforeEach(() => {
        events = [];
        setUnknownEnumSink((e) => events.push(e));
    });
    afterEach(() => resetUnknownEnumState());

    it.each([
        ['TotallyNewN11Status', 'TotallyNewN11Status'],
        ['', 'MISSING'],
        [undefined, 'MISSING'],
    ])('bilinmeyen ham statü "%s" -> reportUnknownEnum çağrılır + APPROVED\'a düşer (güvenli varsayılan)', (status, expectedValue) => {
        const mapper = new OrderMapper();
        const [pkg] = mapper.toInternalOrderPackages(soapResponse(status as any));
        expect(pkg.order.internalStatus).toBe(OrderInternalStatusEnum.APPROVED);
        expect(events).toHaveLength(1);
        expect(events[0].contractId).toBe(N11_ORDERS_CONTRACT_ID);
        expect(events[0].field).toBe('status');
        expect(events[0].value).toBe(expectedValue);
    });

    it('[BİLİNÇLİ DÜZELTME - eslesme-fiyat WP4 C-8] UnPacked -> UNAPPROVED + meta.statusFlag=unpacked, bilinmeyen raporu YOK (eskiden APPROVED)', () => {
        const [pkg] = new OrderMapper().toInternalOrderPackages(soapResponse('UnPacked'));
        expect(pkg.order.internalStatus).toBe(OrderInternalStatusEnum.UNAPPROVED);
        expect((pkg.order.meta as any).statusFlag).toBe('unpacked');
        expect(events).toHaveLength(0);
    });

    it('bilinen ham statü -> reportUnknownEnum ÇAĞRILMAZ', () => {
        const mapper = new OrderMapper();
        mapper.toInternalOrderPackages(soapResponse('Delivered'));
        expect(events).toHaveLength(0);
    });
});

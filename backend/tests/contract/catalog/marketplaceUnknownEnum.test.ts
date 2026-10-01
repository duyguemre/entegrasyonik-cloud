// ADR-0018 Karar 2a(iii) — Hepsiburada/Pazarama/N11 sipariş durum eşleyicilerinin `reportUnknownEnum`
// çağırdığını (davranış AYNI kalarak) doğrular. Trendyol için eşdeğeri zaten C22'de yazıldı (OrderTransformer.ts).
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { OrderInternalStatusEnum } from '@interfaces/index';
import { OrderMapper as HepsiburadaOrderMapper } from '@integration/modules/marketplace/hepsiburada/transformers/OrderTransformer';
import { OrderMapper as PazaramaOrderMapper } from '@integration/modules/marketplace/pazarama/transformers/OrderTransformer';
import { OrderMapper as N11OrderMapper, N11_ORDERS_CONTRACT_ID } from '@integration/modules/marketplace/n11/transformers/OrderMapper';
import { setUnknownEnumSink, resetUnknownEnumState, type UnknownEnumEvent } from '@integration/modules/common/contract/reportUnknownEnum';

describe('Hepsiburada/Pazarama/N11 — bilinmeyen statü reportUnknownEnum çağırır, davranış AYNI kalır', () => {
    let events: UnknownEnumEvent[];
    beforeEach(() => {
        events = [];
        setUnknownEnumSink((e) => events.push(e));
    });
    afterEach(() => resetUnknownEnumState());

    it('Hepsiburada bilinmeyen statü -> reportUnknownEnum çağrılır + AWAITING_APPROVAL döner', () => {
        const mapper = new HepsiburadaOrderMapper();
        const [pkg] = mapper.toInternalOrderPackages([{
            orderNumber: 'HB-1', status: 'TotallyNewHepsiburadaStatus', shippingAddress: {}, lineItems: [],
        }]);
        expect(pkg.order.internalStatus).toBe(OrderInternalStatusEnum.AWAITING_APPROVAL);
        expect(events).toHaveLength(1);
        expect(events[0].contractId).toBe('hepsiburada.orders.list');
        expect(events[0].field).toBe('status');
        expect(events[0].value).toBe('TotallyNewHepsiburadaStatus');
    });

    it('Hepsiburada bilinen statü -> reportUnknownEnum ÇAĞRILMAZ', () => {
        const mapper = new HepsiburadaOrderMapper();
        mapper.toInternalOrderPackages([{ orderNumber: 'HB-2', status: 'shipped', shippingAddress: {}, lineItems: [] }]);
        expect(events).toHaveLength(0);
    });

    it('Pazarama bilinmeyen statü kodu -> reportUnknownEnum çağrılır + UNAPPROVED döner', () => {
        const mapper = new PazaramaOrderMapper();
        const [pkg] = mapper.toInternalOrderPackages([{ OrderNumber: 'PZ-1', OrderStatus: 777 }]);
        expect(pkg.order.internalStatus).toBe(OrderInternalStatusEnum.UNAPPROVED);
        expect(events).toHaveLength(1);
        expect(events[0].contractId).toBe('pazarama.orders.list');
        expect(events[0].value).toBe('777');
    });

    it('Pazarama bilinen statü kodu -> reportUnknownEnum ÇAĞRILMAZ', () => {
        const mapper = new PazaramaOrderMapper();
        mapper.toInternalOrderPackages([{ OrderNumber: 'PZ-2', OrderStatus: 12 }]);
        expect(events).toHaveLength(0);
    });

    function n11Response(status: string | undefined) {
        return {
            orderList: {
                order: [{
                    orderNumber: 'N11-1', status,
                    orderItemList: { orderItem: [] },
                }],
            },
        };
    }

    it('N11 bilinmeyen statü -> reportUnknownEnum çağrılır + APPROVED döner (güvenli varsayılan)', () => {
        const mapper = new N11OrderMapper();
        const [pkg] = mapper.toInternalOrderPackages(n11Response('TotallyNewN11Status'));
        expect(pkg.order.internalStatus).toBe(OrderInternalStatusEnum.APPROVED);
        expect(events).toHaveLength(1);
        expect(events[0].contractId).toBe(N11_ORDERS_CONTRACT_ID);
        expect(events[0].field).toBe('status');
        expect(events[0].value).toBe('TotallyNewN11Status');
    });

    it('N11 bilinen statü -> reportUnknownEnum ÇAĞRILMAZ', () => {
        const mapper = new N11OrderMapper();
        mapper.toInternalOrderPackages(n11Response('Delivered'));
        expect(events).toHaveLength(0);
    });
});

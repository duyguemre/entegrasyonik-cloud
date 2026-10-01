// ADR-0033 INT-07 goruntu-kilidi: OrderMapper ciktisinin TAM anlik goruntusu (buildInternalOrder gocunun birebir ayniligini kanitlar).
import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { OrderMapper } from '@integration/modules/marketplace/pazarama/transformers/OrderTransformer';

const full = {
    OrderNumber: 'PZ-1', CustomerId: 'C5', OrderStatus: 13, customerEmail: 'm@mock.com',
    ShipmentAddress: { NameSurname: 'Mehmet Can', PhoneNumber: '555', CustomerEmail: 'x@y.z', AddressDetail: 'Adr', NeighborhoodName: 'Merkez', CityName: 'Ankara', DistrictName: 'Cankaya', PostalCode: '06000' },
    BillingAddress: { NameSurname: 'Mehmet Can', CompanyName: 'XYZ', TaxNumber: '98', TaxOffice: 'VD', AddressDetail: 'F', CityName: 'Ankara' },
    OrderDate: '2026-01-10T08:00:00.000Z', ShipmentDate: '2026-01-11T08:00:00.000Z', DeliveryDate: '2026-01-12T08:00:00.000Z',
    Currency: 'TL', OrderAmount: 300, DiscountAmount: 10, TaxAmount: 20, ShipmentAmount: 15,
    Items: [{ OrderItemId: 'OI1', Product: { ProductId: 'P1', Name: 'U1', Code: 'C1', VatRate: 18 }, Quantity: 2, SalePrice: 100, TotalPrice: 200, OrderItemStatus: 13, ShipmentCode: 'SC', Cargo: { CompanyName: 'Yurtici', TrackingNumber: 'T1' } }],
};
const camel = { orderNumber: 'PZ-2', shipmentAddress: { nameSurname: 'Ayse Su' }, customerId: 'C2', orderStatus: 12, currency: 'USD', orderAmount: 100, items: [{ orderItemId: 'oi1', product: { productId: 'p1' }, quantity: 1, cargo: { trackingNumber: 'tn' } }] };

describe('Pazarama internal order snapshot', () => {
    beforeAll(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-05-05T05:05:05.000Z')); jest.spyOn(console, 'warn').mockImplementation(() => undefined); });
    afterAll(() => { jest.useRealTimers(); jest.restoreAllMocks(); });
    it.each([['full-cancelled', full], ['camel', camel], ['minimal', {}], ['returned-no-items', { OrderNumber: 'Z', OrderStatus: 7 }]])('%s', (_n, o) => {
        expect(new OrderMapper().toInternalOrderPackages([o])).toMatchSnapshot();
    });
});

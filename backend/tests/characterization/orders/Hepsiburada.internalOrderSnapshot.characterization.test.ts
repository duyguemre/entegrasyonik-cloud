// ADR-0033 INT-07 goruntu-kilidi: OrderMapper ciktisinin TAM anlik goruntusu (buildInternalOrder gocunun birebir ayniligini kanitlar).
import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { OrderMapper } from '@integration/modules/marketplace/hepsiburada/transformers/OrderTransformer';

const full = {
    orderNumber: 'HB-1001', customerName: 'Ahmet Yilmaz', customerEmail: 'a@mock.com', customerId: 'C1', status: 'shipped',
    shippingAddress: { name: 'Ahmet', surname: 'Yilmaz', phoneNumber: '555', address: 'Adr 1', district: 'Kadikoy', city: 'Istanbul', town: 'Kadikoy', postalCode: '34000' },
    billingAddress: { name: 'Ahmet', companyName: 'ACME', taxNumber: '123', taxOffice: 'VD', address: 'Fatura', city: 'Istanbul' },
    totalPrice: { amount: 250.5, currency: 'USD' }, orderDate: '2026-01-10T08:00:00.000Z', shippedDate: '2026-01-11T08:00:00.000Z', deliveredDate: '2026-01-12T08:00:00.000Z',
    barcode: 'BC1', cargoCompany: 'Aras',
    lineItems: [{ id: 'L1', merchantSku: 'S1', sku: 'P1', productName: 'Urun', barcode: 'B1', quantity: 2, price: { amount: 100 }, vatRate: 18, totalPrice: { amount: 200 }, status: 'CancelledByMerchant' }, { sku: 'X' }],
};

describe('Hepsiburada internal order snapshot', () => {
    beforeAll(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-05-05T05:05:05.000Z')); jest.spyOn(console, 'warn').mockImplementation(() => undefined); });
    afterAll(() => { jest.useRealTimers(); jest.restoreAllMocks(); });
    it.each([['full', full], ['minimal', {}], ['orderId-no-billing', { orderId: 9, status: 'weird', shippingAddress: { city: 'C' } }]])('%s', (_n, o) => {
        expect(new OrderMapper().toInternalOrderPackages([o])).toMatchSnapshot();
    });
});

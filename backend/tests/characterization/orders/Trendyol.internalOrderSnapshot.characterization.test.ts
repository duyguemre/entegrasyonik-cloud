// ADR-0033 INT-07 goruntu-kilidi: OrderMapper ciktisinin TAM anlik goruntusu (buildInternalOrder gocunun birebir ayniligini kanitlar).
import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { OrderMapper } from '@integration/modules/marketplace/trendyol/transformers/OrderTransformer';

const addr = { firstName: 'Ayse', lastName: 'Su', company: 'Co', taxNumber: '11', taxOffice: 'VD', address1: 'A1', address2: 'A2', city: 'Ist', district: 'Kad', zipCode: '34', phone: '555', email: 'x@y.z' };
const full = {
    shipmentPackageId: 123, orderNumber: 'TY-1', status: 'Invoiced', customerFirstName: 'Ayse', customerLastName: 'Su', customerId: 7, customerEmail: 'a@trendyol.com', customerPhone: '555', identityNumber: '111',
    shipmentAddress: addr, invoiceAddress: { ...addr, phone: '666' }, orderDate: 1768032000000, estimatedDeliveryEndDate: 1768118400000, shippedDate: 1768035600000, deliveredDate: 1768039200000, lastModifiedDate: 1768042800000,
    currencyCode: 'USD', packageGrossAmount: 200, packageTotalDiscount: 10, packageTotalPrice: 190, taxAmount: 5, cargoAmount: 8, cargoProviderName: 'Yurtici', cargoTrackingNumber: 99, cargoTrackingLink: 'http://t', cargoDeci: 2,
    invoiceLink: 'http://inv', giftBox: true, commercial: true, micro: true, paymentMethod: 'CC', etgbNo: 'E', etgbDate: 1,
    lines: [{ lineId: 1, productName: 'P', stockCode: 'SC', barcode: 'BC', quantity: 2, lineUnitPrice: 100, lineTotalDiscount: 5, vatRate: 18, orderLineItemStatusName: 'Cancelled' }, { id: 2, quantity: 1, price: 10, lineItemPrice: 10, status: 'Returned' }],
};
const cancelled = { id: 5, orderNumber: 'TY-2', status: 'Cancelled', statusReason: 'Musteri vazgecti', createdDate: 1768032000000, shipmentAddress: { fullName: 'Ali Veli Can' }, lines: [{ id: 1, quantity: 1, reason: 'r' }] };
const unsupplied = { packageId: 'pk', status: 'UnSupplied', lines: [] };
const awaiting = { id: 9, status: 'Awaiting', customerEmail: 'q@w.e', lines: [{ id: 1 }] };
const unknown = { id: 10, status: 'Brandnew', orderDate: '', creationDate: 1768032000000, lines: [] };

describe('Trendyol internal order snapshot', () => {
    beforeAll(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-05-05T05:05:05.000Z')); jest.spyOn(console, 'warn').mockImplementation(() => undefined); });
    afterAll(() => { jest.useRealTimers(); jest.restoreAllMocks(); });
    it.each([['full-invoiced', full], ['cancelled', cancelled], ['unsupplied', unsupplied], ['awaiting', awaiting], ['unknown', unknown]])('%s', (_n, o) => {
        expect(new OrderMapper().toInternalOrderPackages([o])).toMatchSnapshot();
    });
});

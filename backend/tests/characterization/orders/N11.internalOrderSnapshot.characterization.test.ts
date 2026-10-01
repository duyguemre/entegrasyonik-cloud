// ADR-0033 INT-07 goruntu-kilidi: N11 OrderMapper ciktisinin TAM anlik goruntusu. N11 buildInternalOrder'a GECIRILMEDI
// (cikti iskelet varsayilanlari icermiyor: flags/bos adres alanlari/kargo yok; gecis cikti degistirirdi) — bu test o karari kilitler.
import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { OrderMapper } from '@integration/modules/marketplace/n11/transformers/OrderMapper';

const soap = { orderList: { order: [{ orderNumber: 'N1', status: 'Created', createDate: '10/01/2026 08:30', buyer: { fullName: 'Ali Veli', email: 'a@b.c' }, shippingAddress: { address: 'A', city: 'C', district: 'D' }, totalAmount: '150.5',
    orderItemList: { orderItem: { id: 'I1', productId: 'P1', productName: 'U', sellerStockCode: 'S', quantity: '2', price: '50' } } }, { orderNumber: 'N2' }] } };
const rest = { content: [{ id: 77, orderNumber: 'N3', shipmentPackageStatus: 'Shipped', lastModifiedDate: 1768032000000, agreedDeliveryDate: 1768035600000, customerEmail: 'e@f.g', customerfullName: 'Ay Se',
    billingAddress: { fullName: 'Ay Se', address: 'B', city: 'C', district: 'D', postalCode: '1', gsm: '5', taxId: 'T', taxHouse: 'H', invoiceType: 2 }, shippingAddress: { fullName: 'Ay Se', address: 'S', city: 'C', district: 'D', postalCode: '2', gsm: '6' },
    totalAmount: '99', totalDiscountAmount: '4', packageHistories: [{ status: 'Created', createdDate: 1768028400000 }],
    lines: [{ quantity: 3, productId: 9, productName: 'P', stockCode: 'SC', price: '10', orderLineId: 5, totalSellerDiscountPrice: '2' }] }, { orderNumber: 'N4' }] };

describe('N11 internal order snapshot', () => {
    beforeAll(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-05-05T05:05:05.000Z')); jest.spyOn(console, 'warn').mockImplementation(() => undefined); });
    afterAll(() => { jest.useRealTimers(); jest.restoreAllMocks(); });
    it('soap', () => { expect(new OrderMapper().toInternalOrderPackages(soap)).toMatchSnapshot(); });
    it('rest', () => { expect(new OrderMapper().toInternalOrderPackagesFromRest(rest)).toMatchSnapshot(); });
});

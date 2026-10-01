// Protokol 13 karakterizasyon: Pazarama `OrderMapper.toInternalOrderPackages` — alan eşlemeleri (PascalCase/
// camelCase toleransı, finans, kalemler, kargo, cancelSource/cancelledDate). STATÜ eşlemesi (mapNumericStatus)
// BURADA TEKRAR EDİLMEZ — bkz. tests/characterization/orders/Pazarama.orderStatus.characterization.test.ts
// (dokunulmadı). ADR-0016 §8.2 B-R-T4 dilimi.
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { OrderMapper } from '@integration/modules/marketplace/pazarama/transformers/OrderTransformer';

function baseOrder(overrides: any = {}) {
    return {
        OrderNumber: 'PZ-1001',
        ShipmentAddress: {
            NameSurname: 'Mehmet Can', PhoneNumber: '5551234567', CustomerEmail: 'mehmet@mock.com',
            AddressDetail: 'Test Mah. No:5', NeighborhoodName: 'Merkez', CityName: 'Ankara', DistrictName: 'Çankaya', PostalCode: '06000',
        },
        BillingAddress: {
            NameSurname: 'Mehmet Can', CompanyName: 'XYZ Ltd.', TaxNumber: '9876543210', TaxOffice: 'Çankaya VD',
            AddressDetail: 'Fatura Mah. No:6', CityName: 'Ankara',
        },
        CustomerId: 'CUST-5',
        OrderStatus: 12,
        OrderDate: '2026-01-10T08:00:00.000Z',
        ShipmentDate: '2026-01-11T08:00:00.000Z',
        DeliveryDate: '2026-01-12T08:00:00.000Z',
        Currency: 'TL',
        OrderAmount: 300, DiscountAmount: 10, TaxAmount: 20, ShipmentAmount: 15,
        Items: [
            { OrderItemId: 'OI-1', Product: { ProductId: 'P1', Name: 'Ürün 1', Code: 'CODE-1', VatRate: 18 }, Quantity: 2, SalePrice: 100, TotalPrice: 200, OrderItemStatus: 12 },
        ],
        ...overrides,
    };
}

describe('Pazarama OrderMapper.toInternalOrderPackages — alan eşlemeleri (karakterizasyon)', () => {
    const mapper = new OrderMapper();

    beforeEach(() => { jest.spyOn(console, 'warn').mockImplementation(() => undefined); });
    afterEach(() => { jest.restoreAllMocks(); });

    it('mutlu yol: PascalCase alanlar okunur, TL -> TRY dönüştürülür, kalemler/adresler doğru eşlenir', () => {
        const [pkg] = mapper.toInternalOrderPackages([baseOrder()]);
        expect(pkg.customer).toMatchObject({ firstName: 'Mehmet', lastName: 'Can', externalIdentities: [{ integrationCode: 'pazarama', externalCustomerId: 'CUST-5' }] });
        expect(pkg.order.financials).toEqual({ currencyCode: 'TRY', subTotal: 300, totalDiscount: 10, totalTax: 20, shippingFee: 15, grandTotal: 300 });
        expect(pkg.order.dates.orderDate).toEqual(new Date('2026-01-10T08:00:00.000Z'));
        expect(pkg.order.dates.shippedDate).toEqual(new Date('2026-01-11T08:00:00.000Z'));
        expect(pkg.order.dates.deliveredDate).toEqual(new Date('2026-01-12T08:00:00.000Z'));
        expect(pkg.order.dates.cancelledDate).toBeUndefined(); // 12 iptal listesinde değil
        expect(pkg.order.items[0]).toMatchObject({
            externalLineItemId: 'OI-1', externalItemId: 'P1', productName: 'Ürün 1', sku: 'CODE-1', barcode: 'CODE-1',
            quantity: 2, unitPrice: 100, taxRate: 18, totalPrice: 200, itemStatus: 'ACTIVE',
        });
        expect(pkg.order.billingAddress).toMatchObject({ companyName: 'XYZ Ltd.', isCorporate: true, taxNumber: '9876543210' });
        expect(pkg.order.shippingAddress).toMatchObject({ addressLine2: 'Merkez Mah.', city: 'Ankara', state: 'Çankaya' });
    });

    it('camelCase alanlar da (PascalCase yoksa) kabul edilir', () => {
        const order = {
            orderNumber: 'PZ-2', shipmentAddress: { nameSurname: 'Ayşe Su' }, customerId: 'C2', orderStatus: 12,
            currency: 'USD', orderAmount: 100, items: [{ orderItemId: 'oi1', product: { productId: 'p1' }, quantity: 1 }],
        };
        const [pkg] = mapper.toInternalOrderPackages([order]);
        expect(pkg.order.customerFirstName).toBe('Ayşe');
        expect(pkg.order.financials.currencyCode).toBe('USD'); // TL değilse dönüştürülmez
    });

    it('ShipmentAddress yoksa customerName/CustomerName fallback kullanılır, sonunda "MUSTERI"', () => {
        const [pkg] = mapper.toInternalOrderPackages([baseOrder({ ShipmentAddress: undefined, CustomerName: 'Deniz Ak' })]);
        expect(pkg.order.customerFirstName).toBe('Deniz');
        expect(pkg.order.customerLastName).toBe('Ak');
        const [pkgNone] = mapper.toInternalOrderPackages([baseOrder({ ShipmentAddress: undefined })]);
        expect(pkgNone.order.customerFirstName).toBe('MUSTERI');
    });

    it('CustomerId yoksa safeExternalCustomerId "PAZ-GUEST-<orderNumber>" olur', () => {
        const [pkg] = mapper.toInternalOrderPackages([baseOrder({ CustomerId: undefined })]);
        expect(pkg.customer.externalIdentities![0].externalCustomerId).toBe('PAZ-GUEST-PZ-1001');
    });

    it('BillingAddress yoksa ShipmentAddress\'e düşer', () => {
        const [pkg] = mapper.toInternalOrderPackages([baseOrder({ BillingAddress: undefined })]);
        expect(pkg.order.billingAddress).toEqual(pkg.order.shippingAddress);
    });

    it('Currency "TL" ise "TRY"ye dönüştürülür; başka bir para birimi olduğu gibi kalır; yoksa TRY varsayılır', () => {
        expect(mapper.toInternalOrderPackages([baseOrder({ Currency: 'TL' })])[0].order.financials.currencyCode).toBe('TRY');
        expect(mapper.toInternalOrderPackages([baseOrder({ Currency: 'EUR' })])[0].order.financials.currencyCode).toBe('EUR');
        expect(mapper.toInternalOrderPackages([baseOrder({ Currency: undefined })])[0].order.financials.currencyCode).toBe('TRY');
    });

    it.each([13, 18, 6, 14, 7, 8, 10])('iptal/iade listesindeki statü kodu (%s) cancelledDate\'i "şimdi" olarak doldurur', (status) => {
        const [pkg] = mapper.toInternalOrderPackages([baseOrder({ OrderStatus: status })]);
        expect(pkg.order.dates.cancelledDate).toBeInstanceOf(Date);
    });

    it('cancelSource: 13->SELLER, 18->CUSTOMER, 6/14->PLATFORM, diğerleri undefined', () => {
        expect(mapper.toInternalOrderPackages([baseOrder({ OrderStatus: 13 })])[0].order.cancelSource).toBe('SELLER');
        expect(mapper.toInternalOrderPackages([baseOrder({ OrderStatus: 18 })])[0].order.cancelSource).toBe('CUSTOMER');
        expect(mapper.toInternalOrderPackages([baseOrder({ OrderStatus: 6 })])[0].order.cancelSource).toBe('PLATFORM');
        expect(mapper.toInternalOrderPackages([baseOrder({ OrderStatus: 14 })])[0].order.cancelSource).toBe('PLATFORM');
        expect(mapper.toInternalOrderPackages([baseOrder({ OrderStatus: 12 })])[0].order.cancelSource).toBeUndefined();
    });

    it('fulfillment: Items içinde Cargo.TrackingNumber olan İLK kalem alınır; yoksa ShipmentCode olan ilk kalem; hiçbiri yoksa []', () => {
        const withCargo = baseOrder({ Items: [{ OrderItemId: '1', Cargo: { TrackingNumber: 'TRK-1', CompanyName: 'Aras' } }] });
        const [pkg1] = mapper.toInternalOrderPackages([withCargo]);
        expect(pkg1.order.fulfillment).toEqual([{ shipmentMethod: 'MANUAL', status: 'SUCCESS', carrierName: 'Aras', trackingCode: 'TRK-1' }]);

        const withShipmentCode = baseOrder({ Items: [{ OrderItemId: '1', ShipmentCode: 'SC-1' }] });
        const [pkg2] = mapper.toInternalOrderPackages([withShipmentCode]);
        expect(pkg2.order.fulfillment).toEqual([{ shipmentMethod: 'MARKETPLACE', status: 'SUCCESS', carrierName: '', trackingCode: 'SC-1' }]);

        const withNone = baseOrder({ Items: [{ OrderItemId: '1' }] });
        const [pkg3] = mapper.toInternalOrderPackages([withNone]);
        expect(pkg3.order.fulfillment).toEqual([]);
    });

    it('mapItemStatus: 6/13/14 -> CANCELLED; 7/8/9/10 -> RETURNED; diğerleri ACTIVE', () => {
        const order = baseOrder({
            Items: [
                { OrderItemId: '1', OrderItemStatus: 6 }, { OrderItemId: '2', OrderItemStatus: 8 },
                { OrderItemId: '3', OrderItemStatus: 12 }, { OrderItemId: '4', OrderItemStatus: undefined },
            ],
        });
        const [pkg] = mapper.toInternalOrderPackages([order]);
        expect(pkg.order.items.map((i: any) => i.itemStatus)).toEqual(['CANCELLED', 'RETURNED', 'ACTIVE', 'ACTIVE']);
    });

    it('safeNumber: nesne { Value } biçimindeki alanları da çözer (OrderAmount vb. senaryosuyla tutarlı)', () => {
        const order = baseOrder({ Items: [{ OrderItemId: '1', Product: {}, SalePrice: { Value: 42 } }] });
        const [pkg] = mapper.toInternalOrderPackages([order]);
        expect(pkg.order.items[0].unitPrice).toBe(42);
    });

    it('Product.Name yoksa Product.productName, o da yoksa line.ProductName/productName, hiçbiri yoksa "İsimsiz Ürün"', () => {
        const order = baseOrder({ Items: [{ OrderItemId: '1', Product: {}, ProductName: 'Satır Adı' }] });
        expect(mapper.toInternalOrderPackages([order])[0].order.items[0].productName).toBe('Satır Adı');
        const orderNone = baseOrder({ Items: [{ OrderItemId: '1', Product: {} }] });
        expect(mapper.toInternalOrderPackages([orderNone])[0].order.items[0].productName).toBe('İsimsiz Ürün');
    });

    it('boş dizi girdi -> boş dizi çıktı; Items eksikse items boş dizi', () => {
        expect(mapper.toInternalOrderPackages([])).toEqual([]);
        const [pkg] = mapper.toInternalOrderPackages([baseOrder({ Items: undefined })]);
        expect(pkg.order.items).toEqual([]);
    });

    it('invoice ve flags her zaman sabit/varsayılan değerlerle döner', () => {
        const [pkg] = mapper.toInternalOrderPackages([baseOrder()]);
        expect(pkg.order.invoice).toEqual({ invoiceMethod: 'MARKETPLACE', invoiceProvider: 'pazarama', status: 'PENDING' });
        expect(pkg.order.flags).toEqual({ isAllocated: false, isInvoiceGenerated: false, isMetricsProcessed: false });
        expect(pkg.claims).toEqual([]);
    });
});

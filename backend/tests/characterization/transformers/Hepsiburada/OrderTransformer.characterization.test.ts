// Protokol 13 karakterizasyon: Hepsiburada `OrderMapper.toInternalOrderPackages` — alan eşlemeleri (fiyat,
// müşteri/adres, kalemler, teslimat, fatura, meta). STATÜ eşlemesi (mapStringStatus) BURADA TEKRAR EDİLMEZ —
// bkz. tests/characterization/orders/Hepsiburada.orderStatus.characterization.test.ts (dokunulmadı).
// ADR-0016 §8.2 B-R-T4 dilimi (Hepsiburada + Pazarama transformer'ları).
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { OrderMapper } from '@integration/modules/marketplace/hepsiburada/transformers/OrderTransformer';

function baseOrder(overrides: any = {}) {
    return {
        orderNumber: 'HB-1001',
        customerName: 'Ahmet Yılmaz',
        customerEmail: 'ahmet@mock.com',
        customerId: 'CUST-1',
        status: 'shipped',
        shippingAddress: {
            name: 'Ahmet', surname: 'Yılmaz', phoneNumber: '5551112233',
            address: 'Örnek Mah. Test Sok. No:1', district: 'Kadıköy', city: 'İstanbul',
            town: 'Kadıköy', postalCode: '34000',
        },
        billingAddress: {
            name: 'Ahmet', surname: 'Yılmaz', companyName: 'ACME A.Ş.', taxNumber: '1234567890', taxOffice: 'Kadıköy VD',
            address: 'Fatura Mah. No:2', city: 'İstanbul',
        },
        totalPrice: { amount: 250.5, currency: 'TRY' },
        orderDate: '2026-01-10T08:00:00.000Z',
        shippedDate: '2026-01-11T08:00:00.000Z',
        deliveredDate: '2026-01-12T08:00:00.000Z',
        barcode: 'CARGO-BARCODE-1',
        cargoCompany: 'Aras Kargo',
        lineItems: [
            { id: 'LI-1', merchantSku: 'SKU-1', sku: 'PLAT-SKU-1', productName: 'Test Ürün', barcode: 'BAR-1', quantity: 2, price: { amount: 100 }, vatRate: 18, totalPrice: { amount: 200 }, status: 'Open' },
        ],
        ...overrides,
    };
}

describe('Hepsiburada OrderMapper.toInternalOrderPackages — alan eşlemeleri (karakterizasyon)', () => {
    const mapper = new OrderMapper();

    beforeEach(() => { jest.spyOn(console, 'warn').mockImplementation(() => undefined); });
    afterEach(() => { jest.restoreAllMocks(); });

    it('mutlu yol: müşteri/adres/finans/kalem/teslimat/fatura alanları doğru eşlenir', () => {
        const [pkg] = mapper.toInternalOrderPackages([baseOrder()]);
        expect(pkg.customer).toMatchObject({
            firstName: 'Ahmet', lastName: 'Yılmaz', email: 'ahmet@mock.com', phone: '5551112233',
            isEmailMasked: false, isPhoneMasked: false,
            externalIdentities: [{ integrationCode: 'hepsiburada', externalCustomerId: 'CUST-1' }],
        });
        expect(pkg.customer.addresses).toHaveLength(2);
        expect(pkg.customer.addresses![0]).toMatchObject({ title: 'Teslimat Adresi', isDefaultShipping: true, city: 'İstanbul', addressLine1: 'Örnek Mah. Test Sok. No:1' });
        expect(pkg.customer.addresses![1]).toMatchObject({ title: 'Fatura Adresi', isDefaultBilling: true, companyName: 'ACME A.Ş.', isCorporate: true, taxNumber: '1234567890' });

        expect(pkg.order.externalOrderId).toBe('HB-1001');
        expect(pkg.order.orderNumber).toBe('HB-1001');
        expect(pkg.order.customerFirstName).toBe('Ahmet');
        expect(pkg.order.customerLastName).toBe('Yılmaz');
        expect(pkg.order.dates.orderDate).toEqual(new Date('2026-01-10T08:00:00.000Z'));
        expect(pkg.order.dates.shippedDate).toEqual(new Date('2026-01-11T08:00:00.000Z'));
        expect(pkg.order.dates.deliveredDate).toEqual(new Date('2026-01-12T08:00:00.000Z'));

        expect(pkg.order.financials).toEqual({
            currencyCode: 'TRY', subTotal: 250.5, totalDiscount: 0, totalTax: 0, shippingFee: 0, grandTotal: 250.5,
        });

        expect(pkg.order.fulfillment).toEqual([{ shipmentMethod: 'MARKETPLACE', status: 'SUCCESS', carrierName: 'Aras Kargo', trackingCode: 'CARGO-BARCODE-1' }]);
        expect(pkg.order.invoice).toEqual({ invoiceMethod: 'MARKETPLACE', invoiceProvider: 'hepsiburada', status: 'PENDING' });
        expect(pkg.order.flags).toEqual({ isAllocated: false, isInvoiceGenerated: false, isMetricsProcessed: false });

        expect(pkg.order.items).toHaveLength(1);
        expect(pkg.order.items[0]).toMatchObject({
            externalLineItemId: 'LI-1', externalItemId: 'PLAT-SKU-1', productName: 'Test Ürün', sku: 'SKU-1',
            barcode: 'BAR-1', quantity: 2, unitPrice: 100, taxRate: 18, totalPrice: 200, itemStatus: 'ACTIVE',
        });
        expect(pkg.order.meta).toMatchObject({ orderNumber: 'HB-1001' });
        expect(pkg.claims).toEqual([]);
    });

    it('customerName eksik: cFirstName "MUSTERI", cLastName "" varsayılır', () => {
        const [pkg] = mapper.toInternalOrderPackages([baseOrder({ customerName: undefined })]);
        expect(pkg.order.customerFirstName).toBe('MUSTERI');
        expect(pkg.order.customerLastName).toBe('');
    });

    it('customerId yoksa safeExternalCustomerId "HB-GUEST-<orderNumber>" olur', () => {
        const [pkg] = mapper.toInternalOrderPackages([baseOrder({ customerId: undefined })]);
        expect(pkg.customer.externalIdentities![0].externalCustomerId).toBe('HB-GUEST-HB-1001');
    });

    it('orderNumber yoksa orderId kullanılır; ikisi de yoksa boş string', () => {
        const [pkgWithId] = mapper.toInternalOrderPackages([baseOrder({ orderNumber: undefined, orderId: 'OID-9' })]);
        expect(pkgWithId.order.orderNumber).toBe('OID-9');
        const [pkgNone] = mapper.toInternalOrderPackages([baseOrder({ orderNumber: undefined })]);
        expect(pkgNone.order.orderNumber).toBe('');
    });

    it('billingAddress eksikse shippingAddress\'e (shipAddr) düşer', () => {
        const [pkg] = mapper.toInternalOrderPackages([baseOrder({ billingAddress: undefined })]);
        expect(pkg.order.billingAddress).toEqual(pkg.order.shippingAddress);
    });

    it('order.barcode yoksa fulfillment boş dizi olur (kargo bilgisi yok sayılır)', () => {
        const [pkg] = mapper.toInternalOrderPackages([baseOrder({ barcode: undefined })]);
        expect(pkg.order.fulfillment).toEqual([]);
    });

    it('totalPrice yoksa financials.subTotal/grandTotal 0, currencyCode "TRY" varsayılır', () => {
        const [pkg] = mapper.toInternalOrderPackages([baseOrder({ totalPrice: undefined })]);
        expect(pkg.order.financials).toEqual({ currencyCode: 'TRY', subTotal: 0, totalDiscount: 0, totalTax: 0, shippingFee: 0, grandTotal: 0 });
    });

    it('externalStatus: statü yoksa "Open" metnine düşer (BUGÜNKÜ davranış — internalStatus AYRI test edilir)', () => {
        const [pkg] = mapper.toInternalOrderPackages([baseOrder({ status: undefined })]);
        expect(pkg.order.externalStatus).toBe('Open');
    });

    it('lineItems: merchantSku yoksa sku, o da yoksa "UNKNOWN_SKU" kullanılır; productName varsayılanı "İsimsiz Ürün"', () => {
        const order = baseOrder({ lineItems: [{ id: 'LI-2', quantity: 1, price: { amount: 50 } }] });
        const [pkg] = mapper.toInternalOrderPackages([order]);
        expect(pkg.order.items[0]).toMatchObject({ sku: 'UNKNOWN_SKU', barcode: 'UNKNOWN_SKU', productName: 'İsimsiz Ürün', externalItemId: 'UNKNOWN_SKU' });
    });

    // ŞÜPHELİ DAVRANIŞ (BACKLOG'a eklendi): quantity 0 (mesela iptal edilen bir kalem miktarı) sessizce 1'e
    // yükseltilir çünkü kod `this.safeNumber(line.quantity || 1)` kullanıyor — 0 falsy olduğu için `|| 1` devreye
    // giriyor. NEDEN böyle yazıldığı belirsiz (muhtemelen "miktar hiç gelmezse 1 varsay" niyetiyle yazılmış ama
    // "miktar açıkça 0" durumunu da yanlışlıkla kapsıyor). Davranış BUGÜNKÜ haliyle sabitlendi, düzeltilmedi.
    it('[BACKLOG-adayı] lineItems.quantity açıkça 0 ise bile sessizce 1\'e yükseltilir (|| 1 kısayolu)', () => {
        const order = baseOrder({ lineItems: [{ id: 'LI-3', merchantSku: 'S', quantity: 0, price: { amount: 10 } }] });
        const [pkg] = mapper.toInternalOrderPackages([order]);
        expect(pkg.order.items[0].quantity).toBe(1);
    });

    it('mapItemStatus: "Cancelled"/"Returned" alt string içeriyorsa CANCELLED/RETURNED; büyük/küçük harf DUYARLI (küçük harf eşleşmez)', () => {
        const order = baseOrder({
            lineItems: [
                { id: 'A', merchantSku: 'A', quantity: 1, price: { amount: 1 }, status: 'CancelledByMerchant' },
                { id: 'B', merchantSku: 'B', quantity: 1, price: { amount: 1 }, status: 'Returned' },
                { id: 'C', merchantSku: 'C', quantity: 1, price: { amount: 1 }, status: 'cancelled' }, // küçük harf -> eşleşmez
                { id: 'D', merchantSku: 'D', quantity: 1, price: { amount: 1 } }, // status yok -> ACTIVE
            ],
        });
        const [pkg] = mapper.toInternalOrderPackages([order]);
        expect(pkg.order.items.map((i: any) => i.itemStatus)).toEqual(['CANCELLED', 'RETURNED', 'ACTIVE', 'ACTIVE']);
    });

    it('mapToIAddress: state alanı town > district > city > "Belirtilmedi" sırasıyla düşer', () => {
        const withTown = mapper.toInternalOrderPackages([baseOrder({ shippingAddress: { town: 'T', district: 'D', city: 'C' } })])[0];
        expect(withTown.order.shippingAddress.state).toBe('T');
        const withDistrict = mapper.toInternalOrderPackages([baseOrder({ shippingAddress: { district: 'D', city: 'C' } })])[0];
        expect(withDistrict.order.shippingAddress.state).toBe('D');
        const withCity = mapper.toInternalOrderPackages([baseOrder({ shippingAddress: { city: 'C' } })])[0];
        expect(withCity.order.shippingAddress.state).toBe('C');
        const withNone = mapper.toInternalOrderPackages([baseOrder({ shippingAddress: {} })])[0];
        expect(withNone.order.shippingAddress.state).toBe('Belirtilmedi');
        expect(withNone.order.shippingAddress.city).toBe('Belirtilmedi');
        expect(withNone.order.shippingAddress.addressLine1).toBe('Adres Bilgisi Yok');
    });

    it('mapToIAddress: addr.name/surname yoksa sipariş sahibinin ad/soyadına (fallback) düşer, "Müşteri" son çare', () => {
        const order = baseOrder({ customerName: undefined, shippingAddress: {} });
        const [pkg] = mapper.toInternalOrderPackages([order]);
        expect(pkg.order.shippingAddress.firstName).toBe('MUSTERI');
        expect(pkg.order.shippingAddress.lastName).toBe('');
    });

    it('countryCode her zaman TR sabittir', () => {
        const [pkg] = mapper.toInternalOrderPackages([baseOrder()]);
        expect(pkg.order.shippingAddress.countryCode).toBe('TR');
        expect(pkg.order.billingAddress.countryCode).toBe('TR');
    });

    it('boş dizi girdi -> boş dizi çıktı (kırılmaz)', () => {
        expect(mapper.toInternalOrderPackages([])).toEqual([]);
    });

    it('lineItems eksikse items boş dizi olur', () => {
        const [pkg] = mapper.toInternalOrderPackages([baseOrder({ lineItems: undefined })]);
        expect(pkg.order.items).toEqual([]);
    });
});

// Protokol 13 karakterizasyon: Ideasoft `OrderTransformer` (toInternalOrderPackages / mapOrderStatus / mapLineStatus).
// ADR-0016 §8.2 B-R-T4 dilimi (Ideasoft + Bizimhesap transformer'ları — SON dilim).
// [faz4-conf-fix C9b/C7b] ÇIKTI ŞEKLİ DEĞİŞTİ: artık IOrderPackage ({order, customer}); önceden düz nesne dönüyordu ve motor
// (`pkg.order.*`) bozuluyordu (kanıt: tests/characterization/orders/IdeasoftBizimhesap.orderIntake...). Alan eşlemeleri korunur, şekil yeni.
import { describe, it, expect, jest as jestNs } from '@jest/globals';
import { OrderTransformer } from '@integration/modules/ecommerce/ideasoft/transformers/OrderTransformer';

function baseOrder(overrides: any = {}) {
    return {
        id: 1001,
        orderNumber: 'ORD-1001',
        createdAt: '2026-01-10T08:00:00.000Z',
        status: 'preparing',
        customer: { name: 'Ayşe Yıldız', email: 'ayse@mock.com', phone: '5551112233' },
        shippingAddress: {
            firstName: 'Ayşe', lastName: 'Yıldız', address: 'Test Mah. No:1',
            city: 'İstanbul', district: 'Kadıköy', postalCode: '34000', phone: '5551112233',
        },
        totalPrice: 250,
        shippingPrice: 20,
        orderLines: [
            { id: 1, product: { name: 'Ürün 1', barcode: 'B1', sku: 'SKU-1' }, quantity: 2, price: 100 },
        ],
        cargo: { company: 'Aras', trackingNumber: 'TRK-1' },
        ...overrides,
    };
}

describe('Ideasoft OrderTransformer.toInternalOrderPackages — karakterizasyon', () => {
    const t = new OrderTransformer();

    it('dizi değilse boş dizi döner', () => {
        expect(t.toInternalOrderPackages(undefined as any)).toEqual([]);
        expect(t.toInternalOrderPackages(null as any)).toEqual([]);
    });

    it('boş dizi girdi -> boş dizi çıktı', () => {
        expect(t.toInternalOrderPackages([])).toEqual([]);
    });

    it('mutlu yol: IOrderPackage ({order, customer}) — kimlik, tarih, müşteri, adres, kalemler, finans, kargo', () => {
        const raw = baseOrder();
        const [pkg] = t.toInternalOrderPackages([raw]) as any[];
        const o = pkg.order;
        expect(o.integrationCode).toBe('ideasoft');
        expect(o.externalOrderId).toBe('1001');
        expect(o.orderNumber).toBe('ORD-1001');
        expect(o.dates.orderDate).toEqual(new Date('2026-01-10T08:00:00.000Z'));
        expect(o.internalStatus).toBe('APPROVED'); // 'preparing' -> APPROVED
        expect(o.externalStatus).toBe('preparing');
        expect(pkg.customer).toMatchObject({ firstName: 'Ayşe', lastName: 'Yıldız', email: 'ayse@mock.com', phone: '5551112233' });
        expect(o.shippingAddress).toMatchObject({ firstName: 'Ayşe', lastName: 'Yıldız', addressLine1: 'Test Mah. No:1', city: 'İstanbul', state: 'Kadıköy', postalCode: '34000', countryCode: 'TR', phone: '5551112233' });
        expect(o.items).toHaveLength(1);
        expect(o.items[0]).toMatchObject({ externalLineItemId: '1', productName: 'Ürün 1', barcode: 'B1', sku: 'SKU-1', quantity: 2, unitPrice: 100, totalPrice: 200, itemStatus: 'ACTIVE' });
        expect(o.financials).toMatchObject({ grandTotal: 250, shippingFee: 20, subTotal: 230 });
        expect(o.fulfillment).toEqual([expect.objectContaining({ carrierName: 'Aras', trackingCode: 'TRK-1' })]);
        expect(o.meta.id).toBe(1001); // ham sipariş meta'da korunur
        expect(o.flags).toEqual({ isAllocated: false, isInvoiceGenerated: false, isMetricsProcessed: false });
    });

    it('customer.name önceliği: shippingAddress.firstName+lastName varsa ONA öncelik verilir, order.customer.name ARKA PLANA düşer', () => {
        const order = baseOrder({ customer: { name: 'Farklı İsim', email: 'x@mock.com' } });
        const [pkg] = t.toInternalOrderPackages([order]) as any[];
        expect(pkg.customer).toMatchObject({ firstName: 'Ayşe', lastName: 'Yıldız' }); // shippingAddress'ten, customer.name'den DEĞİL
    });

    it('shippingAddress hem firstName hem lastName yoksa customer.name kullanılır', () => {
        const order = baseOrder({ shippingAddress: {}, customer: { name: 'Sadece Müşteri Adı' } });
        const [pkg] = t.toInternalOrderPackages([order]) as any[];
        expect(pkg.customer).toMatchObject({ firstName: 'Sadece', lastName: 'Müşteri Adı' });
    });

    it('billingAddress yoksa shippingAddress\'e (deliveryAddress\'e) düşer', () => {
        const order = baseOrder({ billingAddress: undefined });
        const [pkg] = t.toInternalOrderPackages([order]) as any[];
        expect(pkg.order.billingAddress).toEqual(pkg.order.shippingAddress);
    });

    it('billingAddress belirtilmişse KENDİ alanları kullanılır (shipping\'ten bağımsız)', () => {
        const order = baseOrder({
            billingAddress: { firstName: 'Fatura', lastName: 'Adresi', address: 'Fatura Mah.', city: 'Ankara', district: 'Çankaya', postalCode: '06000', phone: '5559998877' },
        });
        const [pkg] = t.toInternalOrderPackages([order]) as any[];
        expect(pkg.order.billingAddress).toMatchObject({ firstName: 'Fatura', lastName: 'Adresi', city: 'Ankara' });
        expect(pkg.order.shippingAddress).toMatchObject({ city: 'İstanbul' });
    });

    it('lines: orderLines yoksa "lines" alanına, o da yoksa "items" alanına düşer', () => {
        const withLines = baseOrder({ orderLines: undefined, lines: [{ id: 2, quantity: 1, price: 10 }] });
        expect((t.toInternalOrderPackages([withLines]) as any[])[0].order.items).toHaveLength(1);
        const withItems = baseOrder({ orderLines: undefined, items: [{ id: 3, quantity: 5, price: 20 }] });
        expect((t.toInternalOrderPackages([withItems]) as any[])[0].order.items[0].quantity).toBe(5);
    });

    it('[satır kimliği] id yok satır atlanır (sentetik/"undefined" kimlik üretilmez); tüm satırlar kimliksizse sipariş atlanır', () => {
        const mixed = baseOrder({ orderLines: [{ quantity: 1, price: 10 }, { id: 7, quantity: 2, price: 20 }] });
        const [pkg] = t.toInternalOrderPackages([mixed]) as any[];
        expect(pkg.order.items.map((i: any) => i.externalLineItemId)).toEqual(['7']);
        const allBad = baseOrder({ orderLines: [{ quantity: 1, price: 10 }, { quantity: 2, price: 20 }] });
        expect(t.toInternalOrderPackages([allBad, baseOrder({ id: 2, orderNumber: 'O-2' })])).toHaveLength(1);
    });

    it('[C7b] kimliksiz sipariş (id ve orderNumber yok) atlanır; >=3 kayıt ve tümü kimliksizse VALIDATION ORDER_SCHEMA_DRIFT', () => {
        expect(t.toInternalOrderPackages([baseOrder({ id: undefined, orderNumber: undefined }), baseOrder({ id: 5 })])).toHaveLength(1);
        const bad = () => baseOrder({ id: undefined, orderNumber: undefined });
        expect(() => t.toInternalOrderPackages([bad(), bad(), bad()])).toThrow(expect.objectContaining({ code: 'VALIDATION', platformCode: 'ORDER_SCHEMA_DRIFT' }));
        expect(t.toInternalOrderPackages([bad(), bad()])).toEqual([]); // 3'ten az: yalnız atla
    });

    it('kalem productName/barcode/stockcode: line.product.* öncelikli, yoksa düz line.* alanına düşer', () => {
        const order = baseOrder({
            orderLines: [{ id: 9, productName: 'Düz Ürün Adı', barcode: 'DUZ-B', sku: 'DUZ-S', quantity: 1, price: 5 }],
        });
        const [pkg] = t.toInternalOrderPackages([order]) as any[];
        expect(pkg.order.items[0]).toMatchObject({ productName: 'Düz Ürün Adı', barcode: 'DUZ-B', sku: 'DUZ-S' });
    });

    it('kalem price: price yoksa salePrice kullanılır, o da yoksa 0; quantity yoksa 1 varsayılır', () => {
        const order = baseOrder({ orderLines: [{ id: 5, salePrice: 33 }] });
        const [pkg] = t.toInternalOrderPackages([order]) as any[];
        expect(pkg.order.items[0].unitPrice).toBe(33);
        expect(pkg.order.items[0].quantity).toBe(1);
    });

    it('orderDate: createdAt yoksa orderDate alanına, o da yoksa "şimdi"ye düşer', () => {
        const order = baseOrder({ createdAt: undefined, orderDate: '2026-02-01T00:00:00.000Z' });
        const [pkg] = t.toInternalOrderPackages([order]) as any[];
        expect(pkg.order.dates.orderDate).toEqual(new Date('2026-02-01T00:00:00.000Z'));

        const nowSpy = jestNs.spyOn(Date, 'now').mockReturnValue(new Date('2026-03-01T00:00:00.000Z').getTime());
        const orderNoDate = baseOrder({ createdAt: undefined, orderDate: undefined });
        const [pkgNoDate] = t.toInternalOrderPackages([orderNoDate]) as any[];
        expect(pkgNoDate.order.dates.orderDate).toEqual(new Date('2026-03-01T00:00:00.000Z'));
        nowSpy.mockRestore();
    });

    it('cargo: order.cargo.* öncelikli, yoksa order.cargoCompany/trackingNumber düz alanlarına düşer', () => {
        const order = baseOrder({ cargo: undefined, cargoCompany: 'MNG', trackingNumber: 'TRK-9' });
        const [pkg] = t.toInternalOrderPackages([order]) as any[];
        expect(pkg.order.fulfillment).toEqual([expect.objectContaining({ carrierName: 'MNG', trackingCode: 'TRK-9' })]);
    });

    it('bir sipariş dönüşümü sırasında istisna fırlarsa (örn. externalOrderId üretilemezse) o kayıt SESSİZCE atlanır (null -> filter)', () => {
        // Gerçek çökme senaryosu: orderLines bir map edilemeyen tip olursa (örn. sayı) TypeError fırlatılır.
        const brokenOrder = baseOrder({ orderLines: 42 }); // .map yok -> TypeError -> catch -> null
        const result = t.toInternalOrderPackages([brokenOrder, baseOrder({ id: 2002, orderNumber: 'ORD-2002' })]) as any[];
        expect(result).toHaveLength(1);
        expect(result[0].order.externalOrderId).toBe('2002');
    });
});

describe('Ideasoft OrderTransformer statü eşlemesi (mapOrderStatus / mapLineStatus) — karakterizasyon', () => {
    const t = new OrderTransformer();

    it.each([
        ['new', 'AWAITING_APPROVAL'], ['preparing', 'APPROVED'], ['shipped', 'SHIPPED'], ['delivered', 'DELIVERED'],
        ['cancelled', 'CANCELLED'], ['returned', 'RETURNED'],
        ['1', 'AWAITING_APPROVAL'], ['2', 'APPROVED'], ['3', 'SHIPPED'], ['4', 'DELIVERED'], ['5', 'CANCELLED'],
    ])('durum "%s" -> "%s"', (raw, expected) => {
        const [pkg] = t.toInternalOrderPackages([baseOrder({ status: raw })]) as any[];
        expect(pkg.order.internalStatus).toBe(expected);
    });

    it('bilinmeyen/eksik statü AWAITING_APPROVAL varsayılanına düşer', () => {
        const [pkg] = t.toInternalOrderPackages([baseOrder({ status: 'garip-statu' })]) as any[];
        expect(pkg.order.internalStatus).toBe('AWAITING_APPROVAL');
        const [pkgUndef] = t.toInternalOrderPackages([baseOrder({ status: undefined })]) as any[];
        expect(pkgUndef.order.internalStatus).toBe('AWAITING_APPROVAL');
    });

    it('sayısal statü kodu 2 (number, string DEĞİL) de eşlenir (String() dönüşümüyle)', () => {
        const [pkg] = t.toInternalOrderPackages([baseOrder({ status: 2 })]) as any[];
        expect(pkg.order.internalStatus).toBe('APPROVED');
    });

    it('kalem durumu: iptal/iade siparişte CANCELLED/RETURNED, diğerlerinde ACTIVE (kaleme özgü statü YOKTUR)', () => {
        const line = [{ id: 1, quantity: 1, price: 1 }];
        const st = (status: string) => (t.toInternalOrderPackages([baseOrder({ status, orderLines: line })]) as any[])[0].order.items[0].itemStatus;
        expect(st('shipped')).toBe('ACTIVE');
        expect(st('cancelled')).toBe('CANCELLED');
        expect(st('returned')).toBe('RETURNED');
    });
});

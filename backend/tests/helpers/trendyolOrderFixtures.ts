/**
 * Trendyol sipariş paketi FİKSTÜRLERİ (sentetik değerler; PII/sır YOK). Şema kaynağı:
 * docs/research/2026-09-28-trendyol-v2-migration-spec.md §2.3 (V2 guide örneği alan adları + yeniden adlandırma tablosu).
 * Gerçek Trendyol yanıtı DEĞİLDİR; canlı doğrulama yapılmadı (spec §8 madde 3: OpenAPI referansı ile guide çelişkili).
 */

/** V1 (ESKİ ad) biçimi — yeniden adlandırma tablosunun "Eski" sütunu. */
export function v1Package(over: Record<string, any> = {}): any {
    return {
        id: 900001,
        shipmentPackageId: 900001,
        orderNumber: 'ORD-100',
        grossAmount: 120,
        totalDiscount: 20,
        totalTyDiscount: 0,
        totalPrice: 100,
        currencyCode: 'TRY',
        customerId: 555,
        customerFirstName: 'Test',
        customerLastName: 'Musteri',
        customerEmail: 'test@example.invalid',
        cargoProviderName: 'Test Kargo',
        cargoTrackingNumber: '',
        status: 'Created',
        orderDate: 1780000000000,
        lastModifiedDate: 1780000100000,
        shipmentAddress: {
            firstName: 'Test', lastName: 'Musteri', address1: 'Test Mah. 1', address2: 'No 2',
            city: 'Istanbul', district: 'Kadikoy', zipCode: '34000', phone: '',
        },
        invoiceAddress: {
            firstName: 'Test', lastName: 'Musteri', address1: 'Fatura Mah. 3', city: 'Istanbul', district: 'Kadikoy',
            zipCode: '34001', companyName: 'Test A.S.', taxNumber: '1111111111', taxOffice: 'Test VD',
        },
        lines: [
            {
                id: 7001, quantity: 2, merchantSku: 'SKU-A', productName: 'Urun A', barcode: 'BC-A',
                amount: 60, discount: 10, tyDiscount: 0, price: 50, vatBaseAmount: 20,
                orderLineItemStatusName: 'Created', productCode: 111,
            },
        ],
        ...over,
    };
}

/** V2 (YENİ ad) biçimi — spec §2.3 güncel örnek: eski adlar YOK. */
export function v2Package(over: Record<string, any> = {}): any {
    return {
        shipmentPackageId: 900002,
        orderNumber: 'ORD-200',
        paymentMethod: 'CREDIT_CARD',
        orderCountryCode: 'TR',
        packageGrossAmount: 120,
        packageSellerDiscount: 20,
        packageTyDiscount: 0,
        packageTotalDiscount: 20,
        packageTotalPrice: 100,
        supplierId: 1234,
        channelId: 1,
        customerId: 556,
        customerFirstName: 'Yeni',
        customerLastName: 'Musteri',
        customerEmail: 'yeni@example.invalid',
        cargoProviderName: 'Test Kargo',
        cargoTrackingNumber: '',
        currencyCode: 'TRY',
        status: 'Created',
        shipmentPackageStatus: 'Created',
        orderDate: 1780000000000,
        lastModifiedDate: 1780000100000,
        shipmentAddress: {
            firstName: 'Yeni', lastName: 'Musteri', address1: 'Yeni Mah. 1', address2: 'No 2',
            city: 'Ankara', district: 'Cankaya', postalCode: '06000', phone: '', company: 'Yeni Ltd.',
        },
        invoiceAddress: {
            firstName: 'Yeni', lastName: 'Musteri', address1: 'Fatura Mah. 3', city: 'Ankara', district: 'Cankaya',
            postalCode: '06001', company: 'Yeni Ltd.', taxNumber: '2222222222', taxOffice: 'Test VD',
        },
        lines: [
            {
                lineId: 8001, quantity: 2, stockCode: 'SKU-B', contentId: 222, productName: 'Urun B', barcode: 'BC-B',
                lineGrossAmount: 60, lineTotalDiscount: 10, lineSellerDiscount: 10, lineTyDiscount: 0, lineUnitPrice: 50,
                discountDetails: [{ lineItemId: 1, lineItemPrice: 50, lineItemSellerDiscount: 5, lineItemTyDiscount: 0 }],
                vatRate: 20, orderLineItemStatusName: 'Created', sellerId: 1234, currencyCode: 'TRY',
            },
        ],
        ...over,
    };
}

/** Sayfalı yanıt gövdesi (V2 örneği: totalElements/totalPages/page/size). */
export function page(content: any[], meta: { page?: number; totalPages?: number; totalElements?: number; size?: number } = {}): any {
    return {
        data: {
            content,
            page: meta.page ?? 0,
            size: meta.size ?? 200,
            totalPages: meta.totalPages ?? 1,
            totalElements: meta.totalElements ?? content.length,
        },
    };
}

import { IOrderPackage, OrderInternalStatusEnum } from '@interfaces/index';
import { reportUnknownEnum } from '@integration/modules/common/contract/reportUnknownEnum';

/** ADR-0018 sözleşme kimliği (Trendyol/Hepsiburada/Pazarama OrderTransformer.ts'teki *_ORDERS_CONTRACT_ID deseniyle aynı). */
export const N11_ORDERS_CONTRACT_ID = 'n11.orders.list';

/**
 * Ham statü -> dahili statü (SOAP `orderList.order[].status`).
 *
 * KAYNAK: `n11APISoapREFERANSDOKUMANTASYONU_v9_0.docx` §3.7 (GetShipmentPackages, REST — N11'in 2024-04'ten
 * beri "sipariş servisleri REST tabanlıdır" dediği GÜNCEL/kanonik yüzey), sorgu parametresi `status` ve örnek
 * yanıt `shipmentPackageStatus`: yalnızca **Created, Picking, Shipped, Cancelled, Delivered, UnPacked,
 * UnSupplied** değerleri dokümante edilmiş — "Returned" YOK (N11'de iade `ClaimReturn` servisiyle AYRI
 * yönetiliyor, bu adaptörün `services/ClaimService.ts`'i zaten var). Bu doküman, kodun okuduğu ESKİ SOAP
 * `OrderListRequest`'in kendi order-seviyesi `status` alanı için AYRI bir enum tablosu İÇERMİYOR (yalnızca
 * `orderItemList.orderItem.status` için sayısal 1-17/51-53 bir tablo var — bu KALEM seviyesinde, farklı bir
 * alan; order seviyesine uygulanabilirliği doğrulanamadı, bu yüzden KULLANILMADI — uydurma değer yazılmadı).
 * REST ve SOAP'ın aynı sözleşmeyi (yaşam döngüsü) paylaştığı varsayımıyla bu tablo HER İKİ taşıma için de
 * kullanılıyor; yanlışsa `reportUnknownEnum` bunu görünür kılar (davranış bozulmaz, yalnız gözlem).
 * `UnPacked`, Trendyol'daki eşdeğeri gibi (`OrderTransformer.ts` `unpacked`) anlamı doğrulanamadığı için
 * KASITLI OLARAK tabloya eklenmedi: bilinmeyen dalına düşer (APPROVED + reportUnknownEnum).
 */
const STATUS_RULES: Record<string, OrderInternalStatusEnum> = {
    created: OrderInternalStatusEnum.UNAPPROVED,
    picking: OrderInternalStatusEnum.APPROVED,
    shipped: OrderInternalStatusEnum.SHIPPED,
    delivered: OrderInternalStatusEnum.DELIVERED,
    cancelled: OrderInternalStatusEnum.CANCELLED,
    unsupplied: OrderInternalStatusEnum.CANCELLED,
};

export class OrderMapper {
    public toInternalOrderPackages(rawResponse: any): IOrderPackage[] {
        const orders = rawResponse.orderList?.order || [];
        const ordersArray = Array.isArray(orders) ? orders : [orders];

        const parseDate = (dateStr: string) => {
            if (!dateStr) return new Date();
            // N11 Format: dd/MM/yyyy HH:mm
            const [datePart, timePart] = dateStr.split(' ');
            const [day, month, year] = datePart.split('/').map(Number);
            if (timePart) {
                const [hour, minute] = timePart.split(':').map(Number);
                return new Date(year, month - 1, day, hour, minute);
            }
            return new Date(year, month - 1, day);
        };

        return ordersArray.filter((o: any) => o && o.orderNumber).map((o: any) => {
            const rawItems = o.orderItemList?.orderItem || [];
            const itemsArray = Array.isArray(rawItems) ? rawItems : [rawItems];

            const internalItems = itemsArray.map((item: any) => ({
                externalLineItemId: item.id,
                externalItemId: item.productId,
                productName: item.productName,
                sku: item.sellerStockCode,
                quantity: parseInt(item.quantity || '1'),
                unitPrice: parseFloat(item.price || '0'),
                taxRate: 20, // Default N11 tax rate if not provided
                taxAmount: 0,
                totalPrice: parseFloat(item.price || '0') * parseInt(item.quantity || '1')
            }));

            return {
                order: {
                    integrationCode: 'n11',
                    externalOrderId: o.orderNumber,
                    orderNumber: o.orderNumber,
                    externalStatus: o.status,
                    internalStatus: this.resolveStatus(o.status),
                    dates: {
                        orderDate: parseDate(o.createDate),
                    },
                    billingAddress: {
                        firstName: o.buyer?.fullName || 'Bilinmeyen',
                        addressLine1: o.shippingAddress?.address || '',
                        city: o.shippingAddress?.city || '',
                        state: o.shippingAddress?.district || ''
                    },
                    shippingAddress: {
                        firstName: o.buyer?.fullName || 'Bilinmeyen',
                        addressLine1: o.shippingAddress?.address || '',
                        city: o.shippingAddress?.city || '',
                        state: o.shippingAddress?.district || ''
                    },
                    financials: {
                        subTotal: parseFloat(o.totalAmount || '0'),
                        grandTotal: parseFloat(o.totalAmount || '0'),
                    },
                    items: internalItems,
                    fulfillment: [],
                    meta: o
                },
                customer: {
                    email: o.buyer?.email || '',
                    firstName: o.buyer?.fullName || 'Bilinmeyen Kullanıcı',
                    lastName: '',
                    phone: ''
                }
            };
        });
    }

    /**
     * [N11 REST şekil düzeltmesi, 2026-09-29] ADDITIVE — SOAP metodu (`toInternalOrderPackages`) DEĞİŞMEDİ.
     *
     * KAYNAK: `n11APISoapREFERANSDOKUMANTASYONU_v9_0.docx` §3.7 (`GetShipmentPackages`, REST — N11'in
     * kanonik/güncel sipariş listeleme yüzeyi). Gerçek REST 200 yanıtı `{totalElements, totalPages, page,
     * size, content: [...]}` şeklindedir — `shipmentPackages` alanı hiçbir örnekte YOK (bkz.
     * `OrderService.fetchOrders`'ta düzeltilen kontrol). Bu metot `content[]` içindeki her paketi
     * doğrudan doküman örneğindeki alan adlarıyla ayrıştırır (uydurma alan YOK):
     *
     * - Paket/sipariş kimliği: `id` (paket no) → `externalOrderId` (Trendyol'un `shipmentPackageId`'i
     *   `externalOrderId` yapmasıyla AYNI desen — bu adaptörde işlemsel anahtar paket seviyesindedir),
     *   `orderNumber` → `orderNumber`.
     * - Durum: `shipmentPackageStatus` → `resolveStatus()` (SOAP ile AYNI STATUS_RULES tablosu; doküman
     *   REST'i "kanonik yüzey" saydığı ve tablo zaten bu alanın örnek değerlerinden çıkarıldığı için ortak).
     * - Adresler: `billingAddress`/`shippingAddress` → `{address,city,district,fullName,gsm,postalCode}`
     *   (+ yalnızca billingAddress'te `taxId`/`taxHouse`/`invoiceType` [1:Bireysel/2:Kurumsal] — doküman
     *   REST şekli, shippingAddress'te bu 3 alan YOK).
     * - Kalemler: `lines[]` → `{quantity,productId,productName,stockCode,price,orderLineId,
     *   totalSellerDiscountPrice}`; toplam tutar doküman formülüyle ("line bazlı (price*quantity) -
     *   totalSellerDiscountPrice") hesaplanır — TAHMİN DEĞİL, dokümanın kendi kuralı.
     * - Sipariş tarihi: REST şeklinde SOAP'taki gibi doğrudan bir "oluşturulma tarihi" alanı YOK; doküman
     *   `packageHistories[].status==='Created'` girdisini paketin ilk oluşum anı olarak örnekliyor — bu
     *   girdi varsa kullanılır, yoksa `lastModifiedDate`'e (paketin son güncelleme epoch'u) düşülür.
     * - `agreedDeliveryDate` doküman tablosunda AÇIKÇA "Sipariş onaylanma tarihi" diye tanımlı (alan adı
     *   yanıltıcı olsa da — "teslimat" değil "onay" tarihi) → `dates.approvedDate`.
     * - `taxRate` REST örneğinde de YOK (SOAP koluyla AYNI doğrulanamamış varsayılan: 20 — uydurma yeni
     *   bir değer değil, mevcut sınırlamanın REST'e de uygulanması).
     * - Kalem/adres dışındaki ham alanlar (paket no, kargo takip, `packageHistories`, `sellerId` vb.)
     *   veri kaybı olmadan `meta`'da saklanır (SOAP metoduyla AYNI desen).
     */
    public toInternalOrderPackagesFromRest(rawResponse: any): IOrderPackage[] {
        const content = Array.isArray(rawResponse?.content) ? rawResponse.content : [];

        const toDate = (epochMs: unknown): Date | undefined => {
            const n = Number(epochMs);
            return Number.isFinite(n) && n > 0 ? new Date(n) : undefined;
        };

        return content.filter((o: any) => o && o.orderNumber).map((o: any) => {
            const rawLines = Array.isArray(o.lines) ? o.lines : [];

            const internalItems = rawLines.map((line: any) => {
                const quantity = parseInt(line.quantity ?? '1', 10) || 1;
                const unitPrice = parseFloat(line.price ?? '0') || 0;
                const discount = parseFloat(line.totalSellerDiscountPrice ?? '0') || 0;
                return {
                    externalLineItemId: String(line.orderLineId ?? ''),
                    externalItemId: String(line.productId ?? ''),
                    productName: line.productName,
                    sku: line.stockCode,
                    quantity,
                    unitPrice,
                    discountAmount: discount || undefined,
                    taxRate: 20, // REST §3.7 örneğinde de yok — SOAP koluyla AYNI doğrulanamamış varsayılan.
                    taxAmount: 0,
                    // [§3.7] "line bazlı (price*quantity) - totalSellerDiscountPrice" — dokümanın kendi formülü.
                    totalPrice: (unitPrice * quantity) - discount,
                };
            });

            const createdHistoryEntry = Array.isArray(o.packageHistories)
                ? o.packageHistories.find((h: any) => String(h?.status ?? '').toLowerCase() === 'created')
                : undefined;
            const orderDate = toDate(createdHistoryEntry?.createdDate) || toDate(o.lastModifiedDate) || new Date();

            return {
                order: {
                    integrationCode: 'n11',
                    externalOrderId: String(o.id ?? o.orderNumber),
                    orderNumber: String(o.orderNumber),
                    externalStatus: o.shipmentPackageStatus,
                    internalStatus: this.resolveStatus(o.shipmentPackageStatus),
                    dates: {
                        orderDate,
                        externalUpdatedAt: toDate(o.lastModifiedDate),
                        // [§3.7 alan tablosu] agreedDeliveryDate = "Sipariş onaylanma tarihi" (isme rağmen
                        // teslimat değil onay tarihi — dokümanın kendi tanımı, tahmin edilmedi).
                        approvedDate: toDate(o.agreedDeliveryDate),
                    },
                    billingAddress: {
                        firstName: o.billingAddress?.fullName || 'Bilinmeyen',
                        addressLine1: o.billingAddress?.address || '',
                        city: o.billingAddress?.city || '',
                        state: o.billingAddress?.district || '',
                        postalCode: o.billingAddress?.postalCode,
                        phone: o.billingAddress?.gsm,
                        taxNumber: o.billingAddress?.taxId || undefined,
                        taxOffice: o.billingAddress?.taxHouse || undefined,
                        isCorporate: o.billingAddress?.invoiceType === 2,
                    },
                    shippingAddress: {
                        firstName: o.shippingAddress?.fullName || 'Bilinmeyen',
                        addressLine1: o.shippingAddress?.address || '',
                        city: o.shippingAddress?.city || '',
                        state: o.shippingAddress?.district || '',
                        postalCode: o.shippingAddress?.postalCode,
                        phone: o.shippingAddress?.gsm,
                    },
                    financials: {
                        subTotal: parseFloat(o.totalAmount || '0'),
                        grandTotal: parseFloat(o.totalAmount || '0'),
                        totalDiscount: o.totalDiscountAmount != null ? parseFloat(o.totalDiscountAmount) : undefined,
                    },
                    items: internalItems,
                    fulfillment: [],
                    meta: o,
                },
                customer: {
                    email: o.customerEmail || '',
                    firstName: o.customerfullName || 'Bilinmeyen Kullanıcı',
                    lastName: '',
                    phone: o.shippingAddress?.gsm || o.billingAddress?.gsm || '',
                },
            };
        });
    }

    /**
     * [ADR-0018 Karar 2a(iii)] Bilinmeyen (tabloda olmayan) durum SESSİZCE düşmez: `reportUnknownEnum` çağrılır.
     * Davranış, önceki sabit `APPROVED` ile TUTARLI kalır (zero-oversell açısından güvenli varsayılan; bkz.
     * karakterizasyon: tests/characterization/orders/N11.orderStatus.characterization.test.ts).
     */
    private resolveStatus(status: unknown): OrderInternalStatusEnum {
        const key = String(status ?? '').toLowerCase();
        const rule = STATUS_RULES[key];
        if (rule) return rule;
        reportUnknownEnum(N11_ORDERS_CONTRACT_ID, 'status', key === '' ? 'MISSING' : status);
        return OrderInternalStatusEnum.APPROVED;
    }
}

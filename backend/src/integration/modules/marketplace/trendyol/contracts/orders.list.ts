// ADR-0018 Karar 2a — Trendyol sipariş V2 sözleşmesi. Yalnızca `OrderTransformer.ts`'in GERÇEKTEN okuduğu
// alanlar (C22 spec §2.3 yeniden adlandırma tablosu) tanımlanır ("usedFor" yaklaşımı); büyük çoğunluğu
// transformer'da FALLBACK'li olduğu için `.optional()`'dır — bu şema ADAPTÖRÜN gerçek davranışını DEĞİL,
// yalnız BİZİM GÖZLEMİMİZİ tanımlar (ContractGuard ASLA adaptörün akışına karışmaz, bkz. ContractGuard.ts).
// Nested adres nesneleri (`shipmentAddress`/`invoiceAddress`) BİLİNÇLİ olarak `.passthrough()` bırakıldı
// (kapsamı geniş, Aşama A'da yalnız kök + `lines[]` seviyesi `.strict()` ile izlenir).
import { z } from 'zod';
import type { ContractRef } from '@integration/compliance/ContractGuard';

const addressSchema = z.object({}).passthrough();

const orderLineSchema = z.object({
    lineId: z.number().optional(),
    id: z.union([z.number(), z.string()]).optional(),
    _id: z.union([z.number(), z.string()]).optional(),
    productName: z.string().optional(),
    stockCode: z.string().optional(),
    merchantSku: z.string().optional(),
    barcode: z.string().optional(),
    quantity: z.number().optional(),
    lineUnitPrice: z.number().optional(),
    price: z.number().optional(),
    lineTotalDiscount: z.number().optional(),
    lineSellerDiscount: z.number().optional(),
    discount: z.number().optional(),
    vatRate: z.number().optional(),
    vatBaseAmount: z.number().optional(),
    lineItemPrice: z.number().optional(),
    orderLineItemStatusName: z.string().optional(),
    status: z.string().optional(),
    cancelReason: z.string().optional(),
    reason: z.string().optional(),
}).strict();

const trendyolOrdersListItemSchema = z.object({
    shipmentPackageId: z.union([z.number(), z.string()]).optional(),
    id: z.union([z.number(), z.string()]).optional(),
    _id: z.union([z.number(), z.string()]).optional(),
    packageId: z.union([z.number(), z.string()]).optional(),
    orderNumber: z.union([z.number(), z.string()]).optional(),
    status: z.string().optional(),
    statusReason: z.string().optional(),
    customerFirstName: z.string().optional(),
    customerLastName: z.string().optional(),
    customerEmail: z.string().optional(),
    customerPhone: z.string().optional(),
    customerId: z.union([z.number(), z.string()]).optional(),
    identityNumber: z.string().optional(),
    currencyCode: z.string().optional(),
    packageGrossAmount: z.number().optional(),
    grossAmount: z.number().optional(),
    packageTotalDiscount: z.number().optional(),
    packageSellerDiscount: z.number().optional(),
    totalDiscount: z.number().optional(),
    packageTotalPrice: z.number().optional(),
    totalPrice: z.number().optional(),
    taxAmount: z.number().optional(),
    cargoAmount: z.number().optional(),
    cargoTrackingNumber: z.union([z.number(), z.string()]).optional(),
    trackingCode: z.union([z.number(), z.string()]).optional(),
    cargoTrackingLink: z.string().optional(),
    cargoProviderName: z.string().optional(),
    cargoDeci: z.number().optional(),
    invoiceLink: z.string().optional(),
    orderDate: z.number().optional(),
    createdDate: z.number().optional(),
    paymentMethod: z.string().optional(),
    creationDate: z.number().optional(),
    estimatedDeliveryEndDate: z.number().optional(),
    shippedDate: z.number().optional(),
    deliveredDate: z.number().optional(),
    lastModifiedDate: z.number().optional(),
    shipmentAddress: addressSchema.optional(),
    invoiceAddress: addressSchema.optional(),
    lines: z.array(orderLineSchema).optional(),
    giftBox: z.boolean().optional(),
    giftBoxRequested: z.boolean().optional(),
    commercial: z.boolean().optional(),
    micro: z.boolean().optional(),
    etgbNo: z.union([z.number(), z.string()]).optional(),
    etgbDate: z.union([z.number(), z.string()]).optional(),
}).strict();

/**
 * `OrderConnector.fetchWindow`'un GERÇEKTEN gördüğü zarf: `GET .../v2/orders` yanıtı `{content, totalPages,
 * totalElements, size, page}` şeklindedir (OrderConnector.ts:134-136,155-159). Zarf seviyesi `.passthrough()`
 * (sayfalama alanlarının adı/varlığı bu sözleşmenin odağı DEĞİL); yalnız `content[]` öğe düzeyinde `.strict()`.
 */
const trendyolOrdersListEnvelopeSchema = z.object({
    content: z.array(trendyolOrdersListItemSchema).optional(),
    totalPages: z.number().optional(),
    totalElements: z.number().optional(),
}).passthrough();

/** İzlenen sözleşme kimliği: `trendyol.orders.list@v2` (kategori belgesi §4 kayıt kimliği kuralı). */
export const TRENDYOL_ORDERS_LIST_CONTRACT: ContractRef = {
    id: 'trendyol.orders.list@v2',
    category: 'marketplace',
    schema: trendyolOrdersListEnvelopeSchema,
};

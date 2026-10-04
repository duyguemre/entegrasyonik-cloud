// [ADR-0023] Entegrasyon ayarı / stok / sipariş / iade / fatura / müşteri / ürün / mesaj / destek yazma operasyonlarının
// gövde şemaları (ilk dalga). Para/stok/kimlik bilgisi etkili olanlar önceliklidir.
import { z } from 'zod';
import { allowList, idList, idStr, integrationCode, reqText, safeSettings, strictBody, text } from './common';
import type { RpcRef } from '../types';
import { looseEntity } from './catalog';

const looseObject = z.record(z.string(), z.unknown());

/** Entegrasyon ayar kaydı: FE tüm öğeyi geri gönderir; yalnız `code` + `settings` okunur (kalanı atılır). */
const integrationItem = allowList({ code: integrationCode, settings: safeSettings });

/** İptal/ret gerekçesi (`cancelData`/`rejectData`): yalnız gerekçe alanları. */
const reasonData = allowList({ reason: text(500).optional(), reasonId: z.union([z.string().max(64), z.number()]).optional() });

/** Manuel fatura verisi (`createInvoice`): servis yalnız bu alanları okur; kalanı atılır. */
const invoiceData = allowList({
    issueDate: z.union([z.string().max(64), z.number()]).nullish(), ettn: text(64).nullish(), invoiceMethod: text(32).nullish(), invoiceNumber: text(64).nullish(),
    documentType: text(32).nullish(), status: text(32).nullish(), pdfUrl: text(2000).nullish(), invoiceLink: text(2000).nullish(),
});

export const COMMERCE_RPC_INPUT: Partial<Record<RpcRef, z.ZodType<any>>> = {
    // --- COM-04: tenant komisyon override (FinancialService) ---
    'FinancialService/listCommissionOverrides': strictBody({ integrationCode: integrationCode.optional() }),
    'FinancialService/setCommissionOverride': strictBody({
        integrationCode, scope: z.enum(['category', 'default']), platformCategoryId: z.string().min(1).max(100).optional(),
        rate: z.number().min(0).max(100), note: text(500).optional(),
    }).superRefine((b, ctx) => {
        if (b.scope === 'category' && !b.platformCategoryId) ctx.addIssue({ code: 'custom', path: ['platformCategoryId'], message: "scope 'category' için zorunlu" });
        if (b.scope === 'default' && b.platformCategoryId) ctx.addIssue({ code: 'custom', path: ['platformCategoryId'], message: "scope 'default' için verilmez" });
        if (Math.abs(b.rate * 100 - Math.round(b.rate * 100)) > 1e-7) ctx.addIssue({ code: 'custom', path: ['rate'], message: 'en çok 2 ondalık' });
    }),
    'FinancialService/deleteCommissionOverride': strictBody({ id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'geçersiz kimlik') }),
    // --- Entegrasyon ayarları (kimlik bilgisi/sır yazar) ---
    'IntegrationService/saveClientMarketplaceSettings': strictBody({ clientMarketplace: integrationItem }),
    'IntegrationService/saveClientECommerceSettings': strictBody({ clientECommerce: integrationItem }),
    'IntegrationService/saveClientErpSettings': strictBody({ clientErp: integrationItem }),
    'IntegrationService/saveClientShipmentSettings': strictBody({ clientShipment: integrationItem }),
    'IntegrationService/retrieveAndSetExternalToken': strictBody({ integrationCode, data: looseObject.optional() }),
    'IntegrationService/generateWebhookToken': strictBody({ integrationCode }),

    // --- Stok politikası (stok/para etkisi); anlamsal doğrulama servisin `stockPolicyValidation`ında ---
    'IntegrationService/saveTenantStockPolicy': strictBody({ lowStockThreshold: z.union([z.number().int().min(0).max(1_000_000), z.null()]).optional(), primaryChannel: z.union([integrationCode, z.literal(''), z.null()]).optional() }),
    'IntegrationService/saveChannelStockPolicy': strictBody({ integrationCode, stockPolicy: looseObject }),
    // [INT-01] Bağlantıyı test et (okuma, dış çağrı): yalnız entegrasyon kodu
    'IntegrationService/testConnection': strictBody({ integrationCode }),

    // --- Entegrasyon iş başlatma ---
    'IntegrationService/requestFetchFromPlatform': strictBody({ integrationCode, query: looseObject.optional() }),
    // [eslesme-fiyat WP7b, F-10] Şimdi senkronize et: tek tür; tenant gövdeden SEÇİLEMEZ.
    'IntegrationService/syncNow': strictBody({ integrationCode, kind: z.enum(['orders', 'claims', 'messages', 'finance']).optional() }),
    'IntegrationService/batchCreator': strictBody({
        mode: reqText(50),
        scope: z.number().int().min(0).max(2).optional(),
        selectedIntegrations: z.array(integrationCode).max(50).optional(),
        barcodeList: z.array(z.string().max(128)).max(50000).optional(),
        selectedProducts: z.array(z.unknown()).max(50000).optional(),
        selectedVariants: looseObject.optional(),
        searchProductForm: looseObject.optional(),
        batchProcessForm: looseObject.optional(),
    }),

    // --- Sipariş / kargo / fatura / iade ---
    'OrderService/approveOrder': strictBody({ orderId: idStr, approveData: looseObject.optional() }),
    'OrderService/cancelOrder': strictBody({ orderId: idStr, cancelData: reasonData.optional(), reason: text(500).optional(), reasonId: z.union([z.string().max(64), z.number()]).optional() }),
    'OrderService/bulkApproveOrder': strictBody({ orderIds: idList() }),
    'OrderService/bulkCancelOrder': strictBody({ orderIds: idList(), cancelData: reasonData.optional() }),
    'ClaimService/approveClaim': strictBody({ claimId: idStr }),
    'ClaimService/rejectClaim': strictBody({ claimId: idStr, rejectData: reasonData.optional(), reason: text(500).optional(), reasonId: z.union([z.string().max(64), z.number()]).optional() }),
    'ClaimService/bulkApproveClaim': strictBody({ claimIds: idList() }),
    'ShipmentService/createShipment': strictBody({ orderId: idStr, fulfillmentData: looseObject.optional() }),
    'InvoiceService/deleteInvoice': strictBody({ invoiceId: idStr }),
    'CustomerService/anonymizeCustomer': strictBody({ customerId: idStr }),

    // --- Ürün (yayın/silme) ---
    'ProductService/updateOnsale': strictBody({ _id: idStr, onsale: z.boolean() }),
    'ProductService/deleteProduct': strictBody({ _id: idStr }),
    // Salt-okunur ama bellek-yoğun: girdi tavanları (F-12). FE `useBatchActions.prepareRequest` gövdesi.
    'ProductService/exportExcel': strictBody({
        scope: z.number().int().min(0).max(2), mode: text(50).optional(),
        selectedProducts: z.array(idStr).max(50000).optional(), selectedVariants: looseObject.optional(), barcodeList: z.array(z.string().max(128)).max(50000).optional(),
        searchProductForm: looseObject.optional(), selectedIntegrations: z.array(integrationCode).max(50).optional(), batchProcessForm: looseObject.optional(),
    }),

    // --- Mesaj ---
    'MessageService/replyMessage': strictBody({ messageId: idStr, answerText: reqText(5000) }),
    'MessageService/markAsRead': strictBody({ messageId: idStr }),
    'MessageService/deleteMessage': strictBody({ messageId: idStr }),
    'MessageService/bulkDeleteMessages': strictBody({ messageIds: idList() }),

    // --- Destek: `senderType/senderId/senderName` gövdeden ALINAMAZ (destek ekibi kimliği taklidi); yalnız CLIENT kabul ---
    'TicketService/openTicket': strictBody({ ticket: allowList({ subject: reqText(200), type: text(50).optional(), priority: text(30).optional(), message: reqText(5000), metadata: looseObject.optional() }) }),
    'TicketService/sendTicketMessage': strictBody({ ticketId: idStr, content: reqText(5000), senderType: z.literal('CLIENT').optional() }),
    'TicketService/closeTicket': strictBody({ ticketId: idStr }),

    // --- Fatura / kargo / müşteri / entegrasyon yazma (X5) ---
    'InvoiceService/createInvoice': strictBody({ orderId: idStr, invoiceData: invoiceData.optional() }),
    'InvoiceService/bulkCreateInvoice': strictBody({ orderIds: idList() }),
    'InvoiceService/resolveAndReissueInvoice': strictBody({ orderId: idStr }),
    'InvoiceService/createManualInvoice': strictBody({ data: allowList({
        invoiceNumber: text(64).nullish(), ettn: text(64).nullish(), type: text(32).nullish(), documentType: text(32).nullish(),
        externalOrderId: text(128).nullish(), totalAmount: z.union([z.number(), z.string().max(32)]).nullish(), pdfUrl: text(2000).nullish(), issueDate: z.union([z.string().max(64), z.number()]).nullish(),
    }) }),
    'ShipmentService/bulkCreateShipment': strictBody({ orderIds: idList() }),
    'CustomerService/updateCustomer': strictBody({ customerId: idStr, updateData: allowList({
        firstName: text(200).optional(), lastName: text(200).optional(), companyName: text(300).nullish(), phone: text(64).optional(), email: text(254).optional(),
        status: z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED']).optional(),
    }) }),
    'IntegrationService/saveOrUpdateIntegrationBrand': strictBody({ integrationBrand: looseEntity({ brandId: idStr, integrationCode }) }),
    'IntegrationService/savePlatformUploadIsReadyForProduct': strictBody({ productId: idStr, integrationCode, isReady: z.boolean() }),
    'IntegrationService/sortClientMarketplaces': strictBody({ sortedCodes: z.array(integrationCode).min(1).max(100) }),
};

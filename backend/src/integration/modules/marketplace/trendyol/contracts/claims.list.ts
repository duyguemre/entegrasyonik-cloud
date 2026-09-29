// ADR-0018 Karar 2a — Trendyol iade (claims) sözleşmesi. Yalnızca `ClaimTransformer.ts`'in GERÇEKTEN
// okuduğu KÖK alanlar `.strict()` ile tanımlanır ("usedFor" yaklaşımı); derin iç içe yapılar
// (`items[].orderLine`, `items[].claimItems[]`, `shipmentAddress`) BİLİNÇLİ olarak `.passthrough()`
// bırakıldı (Aşama A kapsamı: kök seviyesi drift — ör. `claimId` yeniden adlandırılması — en kritik sinyal).
import { z } from 'zod';
import type { ContractRef } from '@integration/compliance/ContractGuard';

const passthroughObject = z.object({}).passthrough();

const trendyolClaimItemSchema = z.object({
    claimId: z.union([z.number(), z.string()]).optional(),
    id: z.union([z.number(), z.string()]).optional(),
    _id: z.union([z.number(), z.string()]).optional(),
    orderNumber: z.union([z.number(), z.string()]).optional(),
    orderId: z.union([z.number(), z.string()]).optional(),
    externalOrderId: z.union([z.number(), z.string()]).optional(),
    status: z.string().optional(),
    currencyCode: z.string().optional(),
    claimDate: z.number().optional(),
    creationDate: z.number().optional(),
    totalRefundAmount: z.number().optional(),
    customerFirstName: z.string().optional(),
    customerLastName: z.string().optional(),
    customerEmail: z.string().optional(),
    customerPhone: z.string().optional(),
    customerId: z.union([z.number(), z.string()]).optional(),
    shipmentAddress: passthroughObject.optional(),
    items: z.array(passthroughObject).optional(),
    cargoProviderName: z.string().optional(),
    cargoProvider: z.string().optional(),
    cargoTrackingNumber: z.union([z.number(), z.string()]).optional(),
    cargoTrackingCode: z.union([z.number(), z.string()]).optional(),
    cargoTrackingLink: z.string().optional(),
    cargoTrackingUrl: z.string().optional(),
    isDisputed: z.boolean().optional(),
    disputeStatus: z.string().optional(),
    replacementOutboundpackageinfo: passthroughObject.optional(),
    rejectedpackageinfo: passthroughObject.optional(),
    orderOutboundPackageId: z.union([z.number(), z.string()]).optional(),
}).strict();

/** Zarf: `GET .../claims` yanıtı `{content, totalPages, ...}` (ClaimConnector.ts:50-51). */
const trendyolClaimsListEnvelopeSchema = z.object({
    content: z.array(trendyolClaimItemSchema).optional(),
    totalPages: z.number().optional(),
}).passthrough();

export const TRENDYOL_CLAIMS_LIST_CONTRACT: ContractRef = {
    id: 'trendyol.claims.list@v1',
    category: 'marketplace',
    schema: trendyolClaimsListEnvelopeSchema,
};

// F-09 / ADR-0018 — Trendyol settlements/otherfinancials YANIT sozlesmesi (yalniz GOZLEM; `.passthrough()`).
// Zorunlu = yalniz FinancialMapper + komisyon eslemesinin okudugu alanlar. Sayisal alanlar yeniden adlandirilir/tip degistirirse
// `API_SCHEMA_DRIFT` uretir; istek basarisiz SAYILMAZ.
import { z } from 'zod';
import type { ResponseContract } from '@integration/modules/common/contract/observeResponseSchema';

const strOrNum = z.union([z.string(), z.number()]);

const financeRow = z.object({
    id: strOrNum,
    transactionType: z.string(),
    orderNumber: strOrNum.optional(),
    barcode: z.string().optional(),
    commissionRate: z.number().optional(),
    commissionAmount: z.number().optional(),
    sellerRevenue: z.number().optional(),
    debt: z.number().optional(),
    credit: z.number().optional(),
    paymentPeriod: z.number().optional(),
    paymentDate: z.number().optional(),
    paymentOrderId: strOrNum.optional(),
    transactionDate: z.number().optional(),
}).passthrough();

const envelope = z.object({
    content: z.array(financeRow),
    totalPages: z.number().optional(),
}).passthrough();

export const TRENDYOL_SETTLEMENTS_LIST: ResponseContract = { integration: 'trendyol', endpoint: 'finance.settlements', schema: envelope };
export const TRENDYOL_OTHERFINANCIALS_LIST: ResponseContract = { integration: 'trendyol', endpoint: 'finance.otherfinancials', schema: envelope };

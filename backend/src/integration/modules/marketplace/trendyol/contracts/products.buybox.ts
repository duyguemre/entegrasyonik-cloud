// PRC-R1 — Trendyol "Product Buybox Check" yanıt sözleşmesi (ADR-0018 Karar 2a, gözlem: uyuşmazlık `API_SCHEMA_DRIFT` yazar, isteği düşürmez).
// ALAN ADLARI RESMİ DOKÜMANDAN DOĞRUDAN TEYİT EDİLEMEDİ (bulut oturumunda developers.trendyol.com erişimi engelli; yalnız arama
// dizini özeti: https://developers.trendyol.com/v3.0/docs/12-product-buybox-check). Tek eşleme noktası `api/BuyboxConnector.ts`
// `mapBuyboxResponse`; yerelde (LIVE_READONLY, K57-S8) gerçek yanıtla doğrulanınca descriptor `lastVerifiedAt` doldurulur.
import { z } from 'zod';
import type { ContractRef } from '@integration/compliance/ContractGuard';

const buyboxItemSchema = z.object({
    barcode: z.string(),
    buyboxOrder: z.number().optional(),
    buyboxPrice: z.number().optional(),
    hasMultipleSeller: z.boolean().optional(),
}).passthrough();

const buyboxEnvelopeSchema = z.object({
    buyboxInfo: z.array(buyboxItemSchema),
}).passthrough();

export const TRENDYOL_BUYBOX_CONTRACT: ContractRef = {
    id: 'trendyol.products.buybox@v1',
    category: 'marketplace',
    schema: buyboxEnvelopeSchema,
};

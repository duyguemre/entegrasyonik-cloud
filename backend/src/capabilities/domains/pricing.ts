// PRC-R0 (maliyet) + PRC-R1 (buybox görünürlüğü, SALT OKUMA; yalnız Trendyol, K57-S1). Ekran ve Otopilot/MCP aynı kayıttan
// (ADR-0019, K20): okuma `read` + MCP exposed (can() filtreli); maliyet yazımı `write` + onay kartı (confirm). Fiyat eşitleme /
// pazaryerine otomatik yazma YOK (R2/R3 ayrı). Rakip/buybox verisi yalnız tenant'ın kendi ClientDB'sindedir.
import { z } from 'zod';
import { defineCapability as c, NO_AGENT, onScreens } from '../define';

const PRODUCTS = 'productDefinitions/ProductListView';
const PRODUCT_EDIT = ['definitions/ProductDefinitionView', 'definitions/ProductUpdateView'];
const OID = z.string().regex(/^[0-9a-fA-F]{24}$/);
const BARCODE = z.string().min(1).max(128);
const money = z.number().nullable();

const costItem = z.object({
    variantId: z.string(), productId: z.string().nullable(), sku: z.string().nullable(), barcode: z.string().nullable(),
    costPrice: money, costUpdatedAt: z.string().nullable(), stale: z.boolean(),
});
const coverage = z.object({ total: z.number().int(), withCost: z.number().int(), percent: z.number(), stale: z.number().int() });

const profitAt = z.object({
    price: z.number(), net: money, salesVat: money, profit: money, marginPercent: money,
    confidence: z.enum(['estimated', 'partial', 'unknown']), missing: z.array(z.string()),
}).nullable();

export const PRICING_CAPABILITIES = [
    c({
        id: 'pricing.cost.list', domain: 'catalog', summary: { tr: 'Varyant maliyetleri + maliyet kapsamı (yüzde)', en: 'Variant unit costs + cost coverage (percent)' },
        effect: 'read', minTier: 'member', permission: 'catalog:read', pii: 'none', untrustedPaths: ['items[].sku', 'items[].barcode'],
        input: z.object({
            barcodes: z.array(BARCODE).max(200).optional(),
            variantIds: z.array(OID).max(200).optional(),
            productId: OID.optional(),
            missingOnly: z.boolean().optional(),
            limit: z.number().int().min(1).max(50).optional(),
            cursor: OID.optional(),
        }).strict(),
        output: z.object({ items: z.array(costItem), nextCursor: z.string().nullable(), coverage, staleAfterDays: z.number().int() }),
        bindings: [{ rpc: 'PricingService/listCosts', map: (i: any) => ({ ...i, limit: i.limit ?? 25 }) }],
        ui: onScreens(...PRODUCT_EDIT, PRODUCTS),
        mcp: { exposed: { toolset: 'catalog', confirm: 'none', present: 'table', deepLink: { screen: PRODUCTS } } },
        llm: {
            description: 'Lists product variants with their unit cost (purchase cost in TRY, excluding VAT) and when it was last updated, plus the tenant-wide cost coverage '
                + '(how many variants have a cost). Use missingOnly to find variants without a cost: profit cannot be calculated for them and pricing rules/suggestions stay off. '
                + 'Read-only; to change a cost use the cost update tool. Costs older than 90 days are flagged as stale.',
            examples: ['Maliyeti girilmemiş ürünler hangileri?', 'Maliyet kapsamım yüzde kaç?', 'Barkodu 8690001 olan ürünün maliyeti ne?'],
        },
        agent: NO_AGENT,
    }),
    c({
        id: 'pricing.cost.set', domain: 'catalog', summary: { tr: 'Varyant maliyetini yaz/sil (tekli/toplu, ≤500)', en: 'Set/clear variant unit cost (single/bulk, ≤500)' },
        effect: 'write', minTier: 'member', permission: 'catalog:write', idempotency: 'natural', pii: 'none',
        input: z.object({
            items: z.array(z.object({
                variantId: OID.optional(), barcode: BARCODE.optional(),
                costPrice: z.number().min(0).max(10_000_000).nullable(),
            }).strict()).min(1).max(100),
        }).strict(),
        output: z.object({
            updated: z.number().int(), unchanged: z.number().int(), notFound: z.array(z.string()),
            changes: z.array(z.object({ variantId: z.string(), before: money, after: money })), coverage,
        }),
        bindings: [{ rpc: 'PricingService/setVariantCosts', map: (i: any) => i }],
        undo: { kind: 'none' },
        ui: onScreens(...PRODUCT_EDIT.map((s) => [s, 'saveCost'] as [string, string])),
        mcp: { exposed: { toolset: 'catalog', confirm: 'confirm', present: 'text', deepLink: { screen: PRODUCTS } } },
        llm: {
            description: 'Sets or clears the unit cost (TRY, excluding VAT) of one or more product variants, identified by variant id or barcode (up to 100 per call). '
                + 'The user always sees a confirmation card first. Use null to clear a cost. This only changes internal cost data used for profit calculations; '
                + 'it never changes marketplace prices. Unknown variants are reported back, not created.',
            examples: ['8690001 barkodlu ürünün maliyetini 120 TL yap', 'Bu üç ürünün maliyetlerini güncelle', 'Şu ürünün maliyetini sil'],
        },
        agent: NO_AGENT,
    }),
    c({
        id: 'pricing.buybox.list', domain: 'catalog', summary: { tr: 'Trendyol buybox durumu (rozet/filtre) + 30 gün geçmiş; diğer kanallar desteklenmiyor', en: 'Trendyol buybox status (badge/filter) + 30-day history; other channels unsupported' },
        effect: 'read', minTier: 'member', permission: 'catalog:read', external: false, pii: 'none', untrustedPaths: ['items[].sku', 'items[].barcode'],
        input: z.object({
            status: z.enum(['winning', 'losing', 'not_found', 'unchecked']).optional(),
            barcodes: z.array(BARCODE).max(100).optional(),
            productIds: z.array(OID).max(100).optional(),
            limit: z.number().int().min(1).max(50).optional(),
            cursor: OID.optional(),
        }).strict(),
        output: z.object({
            channel: z.string(),
            channels: z.array(z.object({ code: z.string(), displayName: z.string(), level: z.string(), verified: z.boolean() })),
            settings: z.object({
                enabled: z.boolean(), plan: z.string(), skuCap: z.number().int(), refreshMin: z.number().int(), freshnessMin: z.number().int(),
                priority: z.string(), eligible: z.number().int(), tracked: z.number().int(),
            }),
            summary: z.object({ winning: z.number().int(), losing: z.number().int(), not_found: z.number().int(), unchecked: z.number().int() }),
            items: z.array(z.object({
                variantId: z.string(), productId: z.string().nullable(), barcode: z.string().nullable(), sku: z.string().nullable(),
                status: z.enum(['winning', 'losing', 'not_found', 'unchecked']), buyboxOrder: z.number().nullable(), buyboxPrice: money,
                hasMultipleSeller: z.boolean().nullable(), ownPrice: money, gapAmount: money, gapPercent: money,
                checkedAt: z.string().nullable(), nextRefreshAt: z.string().nullable(), overdue: z.boolean(), fresh: z.boolean(), lostAt: z.string().nullable(),
            })),
            nextCursor: z.string().nullable(),
        }),
        bindings: [
            { rpc: 'PricingService/listBuybox', map: (i: any) => ({ ...i, limit: i.limit ?? 25 }) },
            { rpc: 'PricingService/getBuyboxHistory' },
        ],
        ui: onScreens(PRODUCTS, ...PRODUCT_EDIT),
        mcp: { exposed: { toolset: 'catalog', confirm: 'none', present: 'table', deepLink: { screen: PRODUCTS } } },
        llm: {
            description: 'Shows the Trendyol buybox status of the tenant\'s listed variants: whether the buybox is ours (winning), held by another seller (losing, with rank and buybox price) '
                + 'or not returned (not_found), the gap between our price and the buybox price, when it was last read and when the next refresh is due. '
                + 'Only Trendyol is supported; other marketplaces are reported as unsupported. Data may be minutes or hours old (refresh interval depends on the plan); '
                + 'stale rows are flagged. Read-only: it never changes prices and does not show competitor seller names.',
            examples: ['Buybox\'ı kaybettiğim ürünler hangileri?', 'Trendyol\'da buybox bende olan ürün sayısı', 'Buybox\'a en uzak ürünlerim'],
        },
        agent: NO_AGENT,
    }),
    c({
        id: 'pricing.margin.preview', domain: 'catalog', summary: { tr: 'Kâr önizlemesi: mevcut ve buybox fiyatında net kâr, başa baş fiyat, buybox\'a fark', en: 'Profit preview: net profit at current and buybox price, break-even price, gap to buybox' },
        effect: 'read', minTier: 'member', permission: 'finance:read', pii: 'none', untrustedPaths: ['items[].sku', 'items[].barcode'],
        input: z.object({
            items: z.array(z.object({
                variantId: OID.optional(), barcode: BARCODE.optional(),
                price: z.number().min(0).max(10_000_000).optional(),
            }).strict()).min(1).max(20),
        }).strict(),
        output: z.object({
            channel: z.string(), freshnessMin: z.number().int(),
            items: z.array(z.object({
                variantId: z.string().nullable(), barcode: z.string().nullable(), found: z.boolean(),
                sku: z.string().nullable().optional(), ownPrice: money.optional(), priceSource: z.string().optional(),
                buybox: z.object({ status: z.string(), order: z.number().nullable(), price: money, observedAt: z.string().nullable(), ageMinutes: z.number().nullable(), fresh: z.boolean() }).partial().optional(),
                gap: z.object({ amount: money, percent: money }).optional(),
                current: profitAt.optional(), atBuybox: profitAt.optional(), breakEvenPrice: money.optional(), buyboxBelowFloor: z.boolean().optional(),
                commission: z.object({ rate: money, source: z.string() }).optional(),
                cost: z.object({ price: money, updatedAt: z.string().nullable() }).optional(), vatRate: money.optional(),
                rulesEligible: z.boolean().optional(), ineligibleReasons: z.array(z.string()).optional(),
            })),
        }),
        bindings: [{ rpc: 'PricingService/previewMargin', map: (i: any) => i }],
        ui: onScreens(...PRODUCT_EDIT),
        mcp: { exposed: { toolset: 'catalog', confirm: 'none', present: 'table', deepLink: { screen: PRODUCTS } } },
        llm: {
            description: 'Estimates the net profit of a variant on Trendyol at its current price and at the current buybox price: commission (with its source: override, actual, '
                + 'estimated or unknown), commission VAT, service fee, shipping contribution, sales VAT and unit cost. Also returns the break-even price and whether reaching the buybox '
                + 'would mean selling below it. Unknown components are never treated as zero; if cost, VAT rate or commission is missing, profit is not calculated and pricing rules stay off. '
                + 'You may pass a hypothetical price. Read-only; it does not change any price.',
            examples: ['Bu ürünü buybox fiyatına satarsam ne kadar kazanırım?', '8690001 için başa baş fiyat kaç?', '199 TL\'ye satsam kârım ne olur?'],
        },
        agent: NO_AGENT,
    }),
];

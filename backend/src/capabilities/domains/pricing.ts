// PRC-R0 (maliyet) + PRC-R1 (buybox görünürlüğü, SALT OKUMA; yalnız Trendyol, K57-S1). Ekran ve Otopilot/MCP aynı kayıttan
// (ADR-0019, K20): okuma `read` + MCP exposed (can() filtreli); maliyet yazımı `write` + onay kartı (confirm). Fiyat eşitleme /
// pazaryerine otomatik yazma YOK (R2/R3 ayrı). Rakip/buybox verisi yalnız tenant'ın kendi ClientDB'sindedir.
import { z } from 'zod';
import { defineCapability as c, deferred, nx, NO_AGENT, onScreens } from '../define';

const PRODUCTS = 'productDefinitions/ProductListView';
/** PRC-R2 ekranı: kural listesi/formu, öneri listesi + onay kartı, denetim geçmişi (frontend `views/secure/pricing/PricingRulesView.vue`). */
const PRICING = 'pricing/PricingRulesView';
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

// ---- PRC-R2: rekabet fiyat kuralı (B-10 `competition` tipi) + KURU öneri + İNSAN ONAYLI uygulama ----------------------------------
// Hukuk (AUTO_PRICING_LEGAL K1-K20, K58): eşitleme yok (fark > 0, sunucuda), rakip/mağaza alanı yok, öneriyi KOD hesaplar (yapay zekâ
// yalnız açıklar, K15), uygulama yalnız onayla (PendingAction kartı; ekranda onay penceresi). OTOMATİK UYGULAMA YOLU YOKTUR (PRC-R3).
const compParams = z.object({
    mode: z.enum(['below', 'above']), deltaAmount: money, deltaPercent: money, floorMarginPercent: z.number(), ceiling: z.number(), step: z.number(),
    maxChangesPerDay: z.number().int(), cooldownMin: z.number().int(), maxIncreasePercentPerDay: z.number(), excludeIfOutOfStock: z.boolean(),
});
const ruleOut = z.object({
    id: z.string(), type: z.string(), name: z.string(), enabled: z.boolean(), version: z.number().int(), integrationCode: z.string(),
    // [eslesme-fiyat WP5] `type:'channel'` kuralında competition null, parametreler `channel`'da.
    scope: z.object({ productIds: z.array(z.string()), barcodes: z.array(z.string()) }), competition: compParams.nullable(),
    channel: z.record(z.string(), z.unknown()).nullable(),
    pausedReason: z.string().nullable(), pausedAt: z.string().nullable(), updatedAt: z.string().nullable(),
    suggestions: z.object({ open: z.number().int(), blocked: z.number().int() }),
});
const suggestionOut = z.object({
    id: z.string(), ruleId: z.string(), ruleVersion: z.number().int(), integrationCode: z.string(), variantId: z.string(), productId: z.string().nullable(),
    barcode: z.string(), sku: z.string().nullable(), status: z.string(), beforePrice: z.number(), afterPrice: money, listPrice: money, floor: money, ceiling: money,
    profitBefore: money, profitAfter: money, buyboxPrice: money, buyboxOrder: money, buyboxObservedAt: z.string().nullable(),
    reasons: z.array(z.string()), warnings: z.array(z.string()), blockedReason: z.string().nullable(), closedReason: z.string().nullable(),
    createdAt: z.string().nullable(), updatedAt: z.string().nullable(), appliedAt: z.string().nullable(), lowestPrice10d: money,
});
const RULE_WRITE_NOTE = 'K4 (AUTO_PRICING_LEGAL): fark/taban/tavan/sıklık değerlerini satıcı ekranda kendisi girer; sohbetle kural yazımı (değer önerme riski) PRC-R3 avukat yanıtından sonra değerlendirilir.';

export const PRICING_R2_CAPABILITIES = [
    c({
        id: 'pricing.rules.list', domain: 'catalog', summary: { tr: 'Rekabet fiyat kuralları + açık/kapalı durumu (platform/tenant/kural)', en: 'Competition pricing rules + on/off state (platform/tenant/rule)' },
        effect: 'read', minTier: 'member', permission: 'catalog:read', pii: 'none', untrustedPaths: ['rules[].name'],
        input: z.object({}).strict(),
        output: z.object({
            channel: z.string(), platformEnabled: z.boolean(), competitionEnabled: z.boolean(), active: z.boolean(), inactiveReason: z.string().nullable(),
            settings: z.object({
                enabled: z.boolean(), consent: z.object({ acceptedVersion: z.string().nullable(), acceptedAt: z.string().nullable() }), dualEngineAcknowledgedAt: z.string().nullable(),
                channelAutoApply: z.boolean(), channelAutoApplyAcknowledgedAt: z.string().nullable(),
            }),
            channelAutoApplyNotice: z.object({ tr: z.string(), en: z.string() }),
            channelRuleChannels: z.array(z.string()),
            consent: z.object({ version: z.string(), draft: z.boolean(), text: z.object({ tr: z.string(), en: z.string() }) }),
            dualEngineWarning: z.object({ tr: z.string(), en: z.string() }),
            limits: z.object({ maxIncreasePercentPerDay: z.number(), maxIncreasePercent30d: z.number(), maxChangesPerDay: z.number(), minCooldownMin: z.number(), maxDropPercent: z.number() }),
            rules: z.array(ruleOut),
        }),
        bindings: [{ rpc: 'PricingService/getRules' }],
        ui: onScreens(PRICING),
        mcp: { exposed: { toolset: 'catalog', confirm: 'none', present: 'table', deepLink: { screen: PRICING } } },
        llm: {
            description: 'Lists the tenant\'s competition pricing rules (Trendyol only): stay below or above the buybox price by a seller-chosen positive gap, '
                + 'between a floor (break-even plus target margin) and a ceiling, with change frequency and cooldown limits. Also shows whether rules are active '
                + '(platform switch, tenant switch and accepted responsibility text) and why a rule is paused. Read-only. Rules never match (equalize) the buybox price '
                + 'and never target a specific seller. Do not invent or recommend gap/floor/ceiling values; the seller enters them on the pricing screen.',
            examples: ['Fiyat kurallarım neler?', 'Hangi fiyat kuralı duraklatıldı?', 'Fiyat kuralları açık mı?'],
        },
        agent: NO_AGENT,
    }),
    c({
        id: 'pricing.rules.save', domain: 'catalog', summary: { tr: 'Rekabet fiyat kuralı oluştur/güncelle/sil (eşitleme yok, fark > 0)', en: 'Create/update/delete a competition pricing rule (no equalize, gap > 0)' },
        effect: 'write', minTier: 'admin', permission: 'pricing:manage', idempotency: 'natural', audit: 'always', pii: 'none',
        bindings: [{ rpc: 'PricingService/saveRule' }, { rpc: 'PricingService/deleteRule' }],
        ui: onScreens([PRICING, 'saveRule'], [PRICING, 'deleteRule']),
        mcp: deferred('later', RULE_WRITE_NOTE),
        agent: NO_AGENT,
    }),
    c({
        id: 'pricing.rules.settings', domain: 'catalog', summary: { tr: 'Fiyat kurallarını tenant için aç/kapat (sorumluluk metni kabulü, kill-switch)', en: 'Turn pricing rules on/off for the tenant (responsibility text acceptance, kill-switch)' },
        effect: 'write', minTier: 'admin', permission: 'pricing:manage', idempotency: 'natural', audit: 'always', pii: 'none',
        bindings: [{ rpc: 'PricingService/setPricingSettings' }],
        ui: onScreens([PRICING, 'setPricingSettings']),
        mcp: nx('irreversible', 'K3: açarken satıcı sürümlü sorumluluk metnini EKRANDA kendisi onaylar (hukuki kabul); sohbet/MCP kanalından yapılmaz. Kapatma da ekrandan (anında).'),
        agent: NO_AGENT,
    }),
    c({
        id: 'pricing.suggestions.list', domain: 'catalog', summary: { tr: 'Fiyat önerileri (önce/sonra, kâr, gerekçe, kural sürümü) + fiyat değişiklik geçmişi', en: 'Price suggestions (before/after, profit, reasons, rule version) + price change history' },
        effect: 'read', minTier: 'member', permission: 'catalog:read', pii: 'none', untrustedPaths: ['items[].sku', 'items[].barcode'],
        input: z.object({
            status: z.enum(['open', 'blocked', 'applied', 'dismissed', 'expired']).optional(),
            ruleId: OID.optional(),
            barcodes: z.array(BARCODE).max(100).optional(),
            buyboxLostOnly: z.boolean().optional(),
            limit: z.number().int().min(1).max(50).optional(),
            cursor: OID.optional(),
        }).strict(),
        output: z.object({
            channel: z.string(), active: z.boolean(), inactiveReason: z.string().nullable(), summary: z.object({ open: z.number().int(), blocked: z.number().int() }),
            applyMax: z.number().int(), items: z.array(suggestionOut), nextCursor: z.string().nullable(),
        }),
        bindings: [{ rpc: 'PricingService/listSuggestions', map: (i: any) => ({ ...i, limit: i.limit ?? 25 }) }, { rpc: 'PricingService/getPriceHistory' }],
        ui: onScreens(PRICING),
        mcp: { exposed: { toolset: 'catalog', confirm: 'none', present: 'table', deepLink: { screen: PRICING } } },
        llm: {
            description: 'Lists price suggestions produced by the seller\'s own competition pricing rules for Trendyol products where another seller holds the buybox: '
                + 'current price, suggested price, estimated profit before/after, floor and ceiling, the observed buybox price and time, rule version, reason codes and warnings, '
                + 'and the lowest sale price of the last 10 days. Status "blocked" rows explain why no price can be suggested (e.g. below floor, cost missing). '
                + 'Prices are computed by code; never recalculate or change them, only explain them. Use buyboxLostOnly for "products where I lost the buybox". '
                + 'Read-only; to apply suggestions use the apply tool, which always asks the user for approval.',
            examples: ['Buybox\'ı kaybettiğim ürünler ve öneriler', 'Açık fiyat önerilerim neler?', 'Hangi öneriler tabana takıldı?'],
        },
        agent: NO_AGENT,
    }),
    c({
        id: 'pricing.suggestions.apply', domain: 'catalog', summary: { tr: 'Fiyat önerilerini ONAYLA ve uygula (tek/toplu ≤50; sigorta yeniden çalışır) ya da reddet', en: 'APPROVE and apply price suggestions (single/bulk ≤50; price fuse re-runs) or dismiss' },
        effect: 'write', minTier: 'admin', permission: 'pricing:manage', idempotency: 'key', external: true, audit: 'always', pii: 'none',
        input: z.object({ suggestionIds: z.array(OID).min(1).max(50) }).strict(),
        output: z.object({
            applied: z.array(z.object({ suggestionId: z.string(), barcode: z.string(), before: z.number(), after: z.number() })),
            rejected: z.array(z.object({ suggestionId: z.string(), barcode: z.string().nullable(), reason: z.string() })),
            published: z.number().int(),
        }),
        bindings: [{ rpc: 'PricingService/applySuggestions', map: (i: any) => i }, { rpc: 'PricingService/dismissSuggestions' }],
        undo: { kind: 'none' },
        ui: onScreens([PRICING, 'applySuggestions'], [PRICING, 'dismissSuggestions']),
        mcp: { exposed: { toolset: 'catalog', confirm: 'confirm', present: 'text', deepLink: { screen: PRICING }, risk: 'high' } },
        llm: {
            description: 'Applies open price suggestions (by suggestion id, up to 50) to the Trendyol sale price after the user approves a confirmation card that previews '
                + 'every before/after price. Before writing, the server re-runs the price fuse with fresh data (floor, ceiling, no equalizing, increase and frequency limits, '
                + 'data freshness, unchanged rule version); any suggestion that no longer passes is rejected and reported, not applied. Only the sale price changes; the list '
                + '(strikethrough) price is never raised. Use ids from the suggestion list tool; never invent prices or ids. Describe the result as "price updated", not as a discount.',
            examples: ['Bu önerileri uygula', 'Açık önerilerin hepsini onayla', '8690001 için öneriyi uygula'],
        },
        agent: NO_AGENT,
    }),
    // ---- eslesme-fiyat WP5 (K-A/K-A2): kanal fiyat kuralı — rakibe bakmaz; maliyet/komisyon/kargo/KDV/marj → kanal fiyatı ------------
    c({
        id: 'pricing.channel_rules.preview', domain: 'catalog', summary: { tr: 'Kanal fiyat kuralı önizlemesi (hesaplanan fiyat + gerekçe; fiyat değişmez)', en: 'Channel price rule preview (computed price + reasons; no price change)' },
        effect: 'read', minTier: 'member', permission: 'catalog:read', pii: 'none',
        bindings: [{ rpc: 'PricingService/previewChannelRule' }],
        ui: onScreens([PRICING, 'previewChannelRule']),
        mcp: deferred('later', 'Kanal kuralı önizlemesi önce ekranda; sohbet aracı WP8 sonrası.'),
        agent: NO_AGENT,
    }),
    c({
        id: 'pricing.channel_rules.apply', domain: 'catalog', summary: { tr: 'Kanal fiyat kuralını ONAYLA ve uygula (kural fiyatı yazılır, kanala otomatik yayın)', en: 'APPROVE and apply a channel price rule (rule price written, auto-published to the channel)' },
        effect: 'write', minTier: 'admin', permission: 'pricing:manage', idempotency: 'natural', external: true, audit: 'always', pii: 'none',
        bindings: [{ rpc: 'PricingService/applyChannelRule' }],
        undo: { kind: 'none' },
        ui: onScreens([PRICING, 'applyChannelRule']),
        mcp: deferred('later', 'K4: kural değerlerini satıcı ekranda girer ve önizlemeyi görerek onaylar; sohbetten uygulama sonra değerlendirilir.'),
        agent: NO_AGENT,
    }),
];

// PRC-R2: `PricingEnv` üretim bağlantısı (PricingService ve buybox işi kullanır). Tenant verisi yalnız verilen ClientDB'den okunur (K2);
// kâr bağlamı COM-07 net gelir önizlemesiyle aynı kaynaktan. Yayın (mevcut fiyat hattı, UPDATE_PRICE) DIŞARIDAN enjekte edilir:
// yalnız onaylı RPC kabuğu (api katmanı) gerçek yayıncıyı verir; zamanlanmış iş YAYINLAYAMAZ (`NO_PUBLISH`, otomatik uygulama yolu yok).
import { isFeatureEnabled } from '@integration/config/featureFlags';
import { resolveDeductionRules } from '@integration/config/financeDeductionRules';
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import { getNetRevenuePreview, MAX_NET_PREVIEW_ITEMS } from '@operations/finance/commissionQueries';
import { createNotifier } from '@operations/notifications/createNotifier';
import { AuditLogger } from '@services/audit/AuditLogger';
import { loadCompetitionSettings } from './competitionSettings';
import { BUYBOX_CHANNEL } from './BuyboxRefreshJob';
import type { MarginContext } from './margin';
import type { PricingEnv } from './priceRules';

/** K19 platform anahtarı: `features.pricingRules` (varsayılan KAPALI; backoffice'ten anlık kapatılır). */
export const PRICING_RULES_FLAG = 'pricingRules';

export async function marginContextsFor(clientDB: any, tid: number, variants: any[]): Promise<Map<string, MarginContext>> {
    const out = new Map<string, MarginContext>();
    const deductions = resolveDeductionRules(BUYBOX_CHANNEL);
    for (let i = 0; i < variants.length; i += MAX_NET_PREVIEW_ITEMS) {
        const chunk = variants.slice(i, i + MAX_NET_PREVIEW_ITEMS);
        const net = await getNetRevenuePreview(clientDB, tid, { items: chunk.map((v) => ({ variantId: String(v._id), integrationCode: BUYBOX_CHANNEL })) });
        chunk.forEach((v, idx) => {
            const n: any = net.items[idx];
            out.set(String(v._id), {
                costPrice: typeof v.costPrice === 'number' ? v.costPrice : null,
                vatRate: n?.vatRate ?? null,
                commission: { rate: n?.commission?.rate ?? null, source: n?.commission?.source ?? 'unknown' },
                deductions,
            });
        });
    }
    return out;
}

export type PricePublisher = PricingEnv['publish'];

/** Zamanlanmış iş/arka plan için yayıncı: HER ZAMAN reddeder (PRC-R3 yok; fiyat yalnız insan onayıyla yayınlanır). */
export const NO_PUBLISH: PricePublisher = async () => { throw new Error('price publish is only allowed from the approved apply RPC'); };

export function createPricingEnv(applicationDB?: any, request?: any, publish: PricePublisher = NO_PUBLISH): PricingEnv {
    const notifier = createNotifier();
    return {
        now: () => new Date(),
        platformEnabled: () => isFeatureEnabled(PRICING_RULES_FLAG),
        competitionEnabled: (tid) => isFeatureEnabled('competition', { tenantId: tid }),
        async freshnessMin(tid) {
            const app = applicationDB ?? await DatabaseManagerInstance.getApplicationDB();
            return (await loadCompetitionSettings(app, tid)).freshnessMin;
        },
        marginContexts: marginContextsFor,
        publish,
        async notifyPaused(tid, params) {
            await notifier.notify('PRICE_RULE_PAUSED', tid, params, { idempotencyKey: `price-rule-paused:${tid}:${params.ruleId}:${params.day}`, module: 'pricing.rules' });
        },
        audit(event, tid, actor, meta) {
            if (request) void AuditLogger.fromRequest(request, event, 'ok', meta, { tid });
            else void AuditLogger.log({ event, result: 'ok', tid, ...(actor ? { sub: actor } : {}), actorType: 'system', meta });
        },
    };
}

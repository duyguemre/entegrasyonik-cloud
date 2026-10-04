// [eslesme-fiyat WP5, K-A2] Kanal fiyat kuralı OTOMATİK uygulama işi (15 dk). Yalnız `type:'channel'`, kural `autoApply` ve tenant
// `PricingSettings.channelAutoApply` açıkken yazar (`runChannelRules` her tenant'ta yeniden denetler); platform anahtarı `features.pricingRules`
// (K19) kapalıysa hiçbir tenant'ta yazmaz. Kanala yayın bu işte DEĞİL: `rulePrice` değişince `pricePending` → `pricing.publish`.
// Rekabet kuralı otomatik uygulanmaz (PRC-R3). Kendi DB'mize yazdığı için LIVE_READONLY'de BAŞLAMAZ.
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import { createPricingEnv } from './createPricingEnv';
import { runChannelRules, type PricingEnv } from './channelRules';

export const CHANNEL_RULE_JOB_NAME = 'pricing.channelRules';

export interface ChannelRuleJobDeps {
    activeClients(): Promise<number[]>;
    clientDB(order: number): Promise<any | null>;
    env(): PricingEnv;
}

export function createChannelRuleJobDeps(): ChannelRuleJobDeps {
    return {
        async activeClients() {
            const app = await DatabaseManagerInstance.getApplicationDB();
            const rows: any[] = await app.getClientModel().find({ status: 'ACTIVE' }, { order: 1 }).lean();
            return (rows || []).map((c) => Number(c.order)).filter((n) => Number.isFinite(n));
        },
        clientDB: async (order) => (await DatabaseManagerInstance.getClientDB(order)) ?? null,
        env: () => createPricingEnv(),
    };
}

export async function runChannelRuleJob(deps: ChannelRuleJobDeps, signal?: AbortSignal) {
    const env = deps.env();
    const out = { tenants: 0, rules: 0, applied: 0, blocked: 0, throttled: 0, failed: 0, skipped: false as boolean | string };
    if (!env.platformEnabled()) return { ...out, skipped: 'platform_disabled' };
    for (const order of await deps.activeClients()) {
        if (signal?.aborted) break;
        try {
            const db = await deps.clientDB(order);
            if (!db) continue;
            out.tenants++;
            const r = await runChannelRules(db, order, env);
            out.rules += r.rules; out.applied += r.applied; out.blocked += r.blocked; out.throttled += r.throttled;
        } catch (err) {
            out.failed++;
            console.error(`[channelRuleJob] tenant ${order}:`, (err as Error)?.message);
        }
    }
    return out;
}

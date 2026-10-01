// ADR-0035 Karar 4 / MCP-3: oran siniri + gunluk kota. Redis sabit pencere (ZORUNLU bagimlilik: Redis yoksa `/mcp` 503; sohbetin surec-ici yedegi
// KULLANILMAZ -- adaptor kv'yi null verirse 503). Baglanti (aile) 60/dk, tenant 300/dk, ikisi de `rateCost` ile carpilir; plan `mcpCallsPerDay`
// (tenant, tum baglantilar; yalniz `tools/call`) -- ENTITLEMENT_GUARD_ENABLED kapaliyken uygulanmaz (RunOperation ile ayni ilke).
import { config } from '@config';
import { EntitlementService } from '@services/billing/EntitlementService';
import { dayKeyInZone, endOfDayInZone } from '@utils/timeZone';
import type { AgentKv } from '@operations/agent/kv';

export const FAMILY_PER_MINUTE = 60;
export const TENANT_PER_MINUTE = 300;
const WINDOW_MS = 60_000;

export type LimitDecision = { ok: true } | { ok: false; code: 'RATE_LIMITED' | 'QUOTA_EXCEEDED'; retryAfterSec: number };

export interface McpLimitDeps {
    kv: AgentKv;
    now?: () => number;
    /** Plan gunluk kota sorgusu (test sahtesi). Varsayilan: EntitlementService; guard kapaliysa sinirsiz. */
    dailyAllowed?: (tid: number, usedBefore: number) => Promise<boolean>;
}

const defaultDailyAllowed = async (tid: number, usedBefore: number): Promise<boolean> => {
    if (!config.flags.entitlementGuardEnabled) return true;
    return (await EntitlementService.checkQuota(tid, 'mcpCallsPerDay', usedBefore)).allowed;
};

export class McpLimits {
    private readonly now: () => number;
    constructor(private readonly deps: McpLimitDeps) { this.now = deps.now ?? Date.now; }

    /** Dakikalik kovalar: once baglanti, sonra tenant. Reddedilen cagri diger kovaya yazilmaz. */
    async hit(fam: string, tid: number, cost: number): Promise<LimitDecision> {
        const t = this.now();
        const w = Math.floor(t / WINDOW_MS);
        const retryAfterSec = Math.max(1, Math.ceil(((w + 1) * WINDOW_MS - t) / 1000));
        const c = Math.max(1, Math.trunc(cost));
        const f = await this.deps.kv.incrBy(`mcp:rl:f:${fam}:${w}`, c, 120);
        if (f > FAMILY_PER_MINUTE) return { ok: false, code: 'RATE_LIMITED', retryAfterSec };
        const tn = await this.deps.kv.incrBy(`mcp:rl:t:${tid}:${w}`, c, 120);
        if (tn > TENANT_PER_MINUTE) return { ok: false, code: 'RATE_LIMITED', retryAfterSec };
        return { ok: true };
    }

    /** Gunluk plan kotasi (Europe/Istanbul gunu). Sayac asildiktan sonra da artar (kotayi asan istemci kendi kendini yavaslatir). */
    async daily(tid: number): Promise<LimitDecision> {
        const d = new Date(this.now());
        const used = await this.deps.kv.incr(`mcp:day:${tid}:${dayKeyInZone(d)}`, 48 * 3600);
        const ok = await (this.deps.dailyAllowed ?? defaultDailyAllowed)(tid, used - 1);
        if (ok) return { ok: true };
        return { ok: false, code: 'QUOTA_EXCEEDED', retryAfterSec: Math.max(1, Math.ceil((endOfDayInZone(d).getTime() - d.getTime()) / 1000)) };
    }
}

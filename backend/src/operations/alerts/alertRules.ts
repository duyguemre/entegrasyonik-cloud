// ADR-0017 Karar 4 (Asama C, NB8): ALARM KURALLARI -- SAF hesap (DB/Redis yok; olcum kaynaklari `RuleSources` portuyla ENJEKTE edilir).
// Uygulanan kural seti (kucuk, eyleme donuk): R1 entegrasyon hata orani (tenant x entegrasyon), R2 kimlik hatasi + devre acik > 10 dk,
// R4 kuyruk birikmesi, R7 bildirim outbox olu mektup. R3/R5/R6/R8-R12 ADR'de durur ("sonra": kaynaklari ayri is).
// Bulgu (`Finding`) yalniz kural kimligi + kapsam anahtari + sayisal/kodlu ayrinti tasir (PII/ham hata metni YOK).

export type AlertLevel = 'warning' | 'critical';

export interface Thresholds {
    /** R1 pencere (ms), en az cagri, uyari/kritik hata orani. */
    r1WindowMs: number; r1MinCalls: number; r1Warn: number; r1Critical: number;
    /** R2 pencere + AUTH hata esigi; devre acik kalma suresi (ms). */
    r2WindowMs: number; r2AuthErrors: number; r2CircuitOpenMs: number;
    /** R4: bekleyen is sayisi ya da en eski bekleyenin yasi (sn). */
    r4Wait: number; r4OldestSec: number;
    /** R7: pencere (ms) ve olu teslim esigi. */
    r7WindowMs: number; r7Dead: number;
}

const MIN = 60_000;
export const DEFAULT_THRESHOLDS: Thresholds = {
    r1WindowMs: 15 * MIN, r1MinCalls: 20, r1Warn: 0.2, r1Critical: 0.5,
    r2WindowMs: 15 * MIN, r2AuthErrors: 3, r2CircuitOpenMs: 10 * MIN,
    r4Wait: 200, r4OldestSec: 10 * 60,
    r7WindowMs: 60 * MIN, r7Dead: 10,
};

export interface CallAggregate { clientId: string; integrationCode: string; total: number; errors: number; authErrors: number; dataErrors: number }
export interface CircuitRow { integrationCode: string; open: number; lastOpenedAt: number | null }

export interface RuleSources {
    /** Pencere icinde tenant x entegrasyon cagri/hata toplami (`dataErrors` = VALIDATION/NOT_SUPPORTED: oran disi). */
    integrationCalls(sinceMs: number): Promise<CallAggregate[]>;
    /** Tum podlarin birlesik devre durumu (entegrasyon basina). Redis yoksa []. */
    openCircuits(): Promise<CircuitRow[]>;
    /** order-sync kuyrugu; Redis yoksa null (kural atlanir). */
    queueBacklog(): Promise<{ wait: number; oldestWaitSec: number | null } | null>;
    /** Pencere icinde olu (`dead`) teslim sayisi. */
    deadDeliveries(sinceMs: number): Promise<number>;
}

/** Tenant bildirimi (yalniz tenant-kapsamli eyleme donuk kurallar: R1, R2). */
export interface TenantNotice { tid: number; code: 'INTEGRATION_ERROR_RATE_HIGH' | 'INTEGRATION_AUTH_FAILED'; params: Record<string, unknown> }

export interface Finding {
    ruleId: string;
    scopeKey: string;
    level: AlertLevel;
    detail: Record<string, string | number>;
    /** Platform bildirim kodu (varsayilan PLATFORM_ALERT_FIRING; R7 kendi kodunu kullanir). */
    platformCode?: 'PLATFORM_ALERT_FIRING' | 'PLATFORM_DELIVERY_DEAD_LETTERS';
    platformParams?: Record<string, unknown>;
    tenant?: TenantNotice;
}

const round = (n: number) => Math.round(n * 1000) / 1000;
const SAFE = /^[A-Za-z0-9_-]{1,60}$/;

export async function evaluateRules(src: RuleSources, t: Thresholds = DEFAULT_THRESHOLDS, now: number = Date.now()): Promise<Finding[]> {
    const out: Finding[] = [];

    // R1 + R2 (AUTH): tenant x entegrasyon
    const calls = await src.integrationCalls(now - Math.max(t.r1WindowMs, t.r2WindowMs));
    for (const c of calls) {
        const tid = Number(c.clientId);
        if (!Number.isInteger(tid) || tid <= 0 || !SAFE.test(c.integrationCode)) continue;
        const rated = c.total - c.dataErrors;            // VALIDATION/NOT_SUPPORTED veri sorunudur: orana girmez
        const errors = Math.max(0, c.errors - c.dataErrors);
        if (rated >= t.r1MinCalls) {
            const rate = errors / rated;
            if (rate >= t.r1Warn) {
                const level: AlertLevel = rate >= t.r1Critical ? 'critical' : 'warning';
                out.push({
                    ruleId: 'R1', scopeKey: `${c.integrationCode}:${tid}`, level, detail: { integ: c.integrationCode, tid, total: rated, errors, rate: round(rate) },
                    tenant: { tid, code: 'INTEGRATION_ERROR_RATE_HIGH', params: { integ: c.integrationCode, ratePercent: Math.round(rate * 100), level } },
                });
            }
        }
        if (c.authErrors >= t.r2AuthErrors) {
            out.push({
                ruleId: 'R2', scopeKey: `auth:${c.integrationCode}:${tid}`, level: 'critical', detail: { integ: c.integrationCode, tid, authErrors: c.authErrors },
                tenant: { tid, code: 'INTEGRATION_AUTH_FAILED', params: { integ: c.integrationCode } },
            });
        }
    }

    // R2 (devre): entegrasyon basina (pod anlik goruntusunde tenant kimligi yok -> yalniz platform)
    for (const c of await src.openCircuits()) {
        if (c.open > 0 && c.lastOpenedAt !== null && now - c.lastOpenedAt > t.r2CircuitOpenMs && SAFE.test(c.integrationCode)) {
            out.push({ ruleId: 'R2', scopeKey: `circuit:${c.integrationCode}`, level: 'warning', detail: { integ: c.integrationCode, openCircuits: c.open, openForSec: Math.floor((now - c.lastOpenedAt) / 1000) } });
        }
    }

    // R4 kuyruk birikmesi
    const q = await src.queueBacklog();
    if (q && (q.wait > t.r4Wait || (q.oldestWaitSec !== null && q.oldestWaitSec > t.r4OldestSec))) {
        out.push({ ruleId: 'R4', scopeKey: 'order-sync-queue', level: 'warning', detail: { wait: q.wait, oldestWaitSec: q.oldestWaitSec ?? 0 } });
    }

    // R7 bildirim olu mektup (kendi kodu: PLATFORM_DELIVERY_DEAD_LETTERS)
    const dead = await src.deadDeliveries(now - t.r7WindowMs);
    if (dead >= t.r7Dead) {
        out.push({ ruleId: 'R7', scopeKey: 'notification-outbox', level: 'warning', detail: { dead }, platformCode: 'PLATFORM_DELIVERY_DEAD_LETTERS', platformParams: { deadCount: dead } });
    }
    return out;
}

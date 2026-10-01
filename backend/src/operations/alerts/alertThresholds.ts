// ADR-0029 NB8 / ADR-0031: alarm esiklerini `_platform` ayarlarindan (katalog `integration/config/catalog/alerts.ts`) okur.
// Her turda cagrilir (bellek-ici yayin deposu; DB okumaz). Pencereler kodda kalir (DEFAULT_THRESHOLDS). Tutarsiz cift
// (kritik < uyari) kurallarda `max(uyari, kritik)` ile zaten guvenli; burada ayrica duzeltilmez.
import { DEFAULT_THRESHOLDS, type Thresholds } from './alertRules';

const MIN = 60_000;
export type SettingReader = (key: string) => unknown;

export function readAlertThresholds(get: SettingReader): Thresholds {
    const n = (key: string, fallback: number): number => {
        const v = get(key);
        return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
    };
    const d = DEFAULT_THRESHOLDS;
    return {
        ...d,
        r1MinCalls: n('alerts.r1.minCalls', d.r1MinCalls),
        r1Warn: n('alerts.r1.warnPercent', d.r1Warn * 100) / 100,
        r1Critical: n('alerts.r1.criticalPercent', d.r1Critical * 100) / 100,
        r2AuthErrors: n('alerts.r2.authErrors', d.r2AuthErrors),
        r2CircuitOpenMs: n('alerts.r2.circuitOpenMin', d.r2CircuitOpenMs / MIN) * MIN,
        r3LagWarnMs: n('alerts.r3.lagWarnMin', d.r3LagWarnMs / MIN) * MIN,
        r3LagCriticalMs: n('alerts.r3.lagCriticalMin', d.r3LagCriticalMs / MIN) * MIN,
        r4Wait: n('alerts.r4.queueWait', d.r4Wait),
        r4OldestSec: n('alerts.r4.oldestWaitMin', d.r4OldestSec / 60) * 60,
        r7Dead: n('alerts.r7.deadPerHour', d.r7Dead),
        r8UnresolvedMs: n('alerts.r8.unresolvedMin', d.r8UnresolvedMs / MIN) * MIN,
        r5PendingMs: n('alerts.r5.pendingMin', d.r5PendingMs / MIN) * MIN,
        r10P95Ms: n('alerts.r10.p95Min', d.r10P95Ms / MIN) * MIN,
        r11MinCount: n('alerts.r11.minCount', d.r11MinCount),
    };
}

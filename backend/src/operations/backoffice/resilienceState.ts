// [BO B6] Tüm podların `resilience:<pod>` anlık görüntülerini (60 sn TTL) okuyup entegrasyon x pod tablosuna çevirir. Salt okuma; yalnız bu önek taranır.
import { RESILIENCE_KEY_PREFIX, type ResilienceSnapshot } from '@integration/modules/common/http/resilienceSnapshot';

export interface RedisReader {
    scan(cursor: string, ...args: (string | number)[]): Promise<[string, string[]]>;
    mget(...keys: string[]): Promise<Array<string | null>>;
}
const MAX_PODS = 100;

export async function readResilienceState(redis: RedisReader) {
    const keys: string[] = [];
    let cursor = '0';
    do {
        const [next, batch] = await redis.scan(cursor, 'MATCH', `${RESILIENCE_KEY_PREFIX}*`, 'COUNT', 100);
        cursor = next;
        for (const k of batch) if (keys.length < MAX_PODS && !keys.includes(k)) keys.push(k);
    } while (cursor !== '0' && keys.length < MAX_PODS);

    const raws = keys.length ? await redis.mget(...keys) : [];
    const snaps: ResilienceSnapshot[] = [];
    for (const raw of raws) {
        if (!raw) continue;
        try { const s = JSON.parse(raw); if (s && typeof s.pod === 'string' && Array.isArray(s.integrations)) snaps.push(s); } catch { /* bozuk kayıt atlanır */ }
    }
    snaps.sort((a, b) => a.pod.localeCompare(b.pod));

    const codes = new Set<string>();
    for (const s of snaps) for (const i of s.integrations) codes.add(i.integrationCode);
    const items = [...codes].sort().map((integrationCode) => ({
        integrationCode,
        pods: snaps.map((s) => {
            const i = s.integrations.find((x) => x.integrationCode === integrationCode);
            return {
                pod: s.pod, observedAt: s.at,
                circuits: i?.circuits ?? { closed: 0, open: 0, half_open: 0 },
                rate: i?.rate ?? { limited: 0, tenants: 0, minRatio: null },
                lastOpenedAt: i?.lastOpenedAt ? new Date(i.lastOpenedAt).toISOString() : null,
                intake: (s.intake?.[integrationCode] ?? 'on') as 'on' | 'drain' | 'off',
            };
        }),
    }));
    return { pods: snaps.map((s) => ({ pod: s.pod, observedAt: s.at, engineIntake: (s.intake?.['_engine'] ?? 'on') as 'on' | 'drain' | 'off' })), items };
}

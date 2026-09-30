// [BO B6] Pod başına dayanıklılık durumu anlık görüntüsü: `resilience:<pod>` Redis anahtarı, 60 sn TTL (metrik flush'ında yenilenir;
// pod ölürse anahtar kendiliğinden düşer). Yalnız entegrasyon kodu + SAYILAR; tenant kimliği/istek verisi yok. Best-effort: asla fırlatmaz.
import { ResilientHttpClient } from './ResilientHttpClient';
import { listNonOpenIntakeTargets } from '../../../config/platformOverrideStore';
import { getPodIdentity } from '../../../../utils/podIdentity';

export const RESILIENCE_KEY_PREFIX = 'resilience:';
export const RESILIENCE_TTL_SECONDS = 60;

export interface ResilienceSnapshot {
    pod: string;
    at: string;
    integrations: ReturnType<typeof ResilientHttpClient.snapshotState>;
    /** Yalnız `on` OLMAYAN hedefler (yoksa 'on'). */
    intake: Record<string, 'drain' | 'off'>;
}

export function buildResilienceSnapshot(now: Date = new Date(), pod: string = getPodIdentity()): ResilienceSnapshot {
    const intake: Record<string, 'drain' | 'off'> = {};
    for (const t of listNonOpenIntakeTargets()) if (t.intake !== 'on') intake[t.target] = t.intake;
    return { pod, at: now.toISOString(), integrations: ResilientHttpClient.snapshotState(), intake };
}

export interface RedisSetEx { set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown> }

/** Anlık görüntüyü yazar. Redis yoksa/hata olursa sessizce `false`. */
export async function writeResilienceSnapshot(redis: RedisSetEx | undefined, now: Date = new Date(), pod?: string): Promise<boolean> {
    if (!redis) return false;
    try {
        const snap = buildResilienceSnapshot(now, pod);
        await redis.set(`${RESILIENCE_KEY_PREFIX}${snap.pod}`, JSON.stringify(snap), 'EX', RESILIENCE_TTL_SECONDS);
        return true;
    } catch { return false; }
}

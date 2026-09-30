// ADR-0029 NB6: RealtimeBus tek dis yuzey + surec-genel ornek. `REALTIME_BUS=redis` iken Redis pub/sub; baglanti uretilemezse
// (Redis yok) yerel + uyari. Ornek bilesim kokunde (`bootstrap/app.ts`) `initRealtimeBus` ile kurulur; kurulmadiysa yerel.
import { logger } from '@platform/core/logger';
import { LocalRealtimeBus } from './localBus';
import { RedisRealtimeBus, type RedisPubLike, type RedisSubLike } from './redisBus';
import type { RealtimeBus } from './RealtimeBus';

export type { RealtimeBus, RealtimeEvent, RealtimeHandler } from './RealtimeBus';
export { LocalRealtimeBus } from './localBus';
export { RedisRealtimeBus, channelOf } from './redisBus';
export { StreamHub } from './streamHub';
export type { StreamSink, StreamHubOptions, StreamHubStats, AcceptResult, StreamConnection } from './streamHub';

const log = logger.child({ module: 'realtime.bus' });
let current: RealtimeBus | undefined;

export interface RedisPair { pub: RedisPubLike; sub: RedisSubLike }

/** `mode`: REALTIME_BUS degeri; `makeRedis`: yalniz redis modunda cagrilir, Redis yoksa firlatabilir/undefined donebilir. */
export function createRealtimeBus(mode: string | undefined, makeRedis?: () => RedisPair | undefined): RealtimeBus {
    if ((mode ?? '').trim().toLowerCase() === 'redis') {
        try {
            const pair = makeRedis?.();
            if (pair) return new RedisRealtimeBus(pair.pub, pair.sub, log);
            log.warn({}, 'REALTIME_BUS=redis ama Redis baglantisi yok: yerel bus kullaniliyor');
        } catch (e) {
            log.warn({ err: { message: (e as Error)?.message } }, 'REALTIME_BUS=redis kurulamadi: yerel bus kullaniliyor');
        }
    }
    return new LocalRealtimeBus();
}

export function initRealtimeBus(mode: string | undefined, makeRedis?: () => RedisPair | undefined): RealtimeBus {
    current = createRealtimeBus(mode, makeRedis);
    return current;
}

export function getRealtimeBus(): RealtimeBus {
    if (!current) current = new LocalRealtimeBus();
    return current;
}

export async function closeRealtimeBus(): Promise<void> {
    const b = current; current = undefined;
    await b?.close();
}

export function setRealtimeBusForTests(b: RealtimeBus | undefined): void { current = b; }

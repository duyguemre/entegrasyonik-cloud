/**
 * ADR-0006 Karar 5: `/health` ve `/ready` için paylaşımlı mantık (Webserver.ts VE worker-rolü minimal sunucusu
 * aynı mantığı kullanır — kod tekrarı yok). DB/Redis'e YENİ bağlantı AÇMAZ; MEVCUT singleton'ları kullanır.
 */
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import { isShuttingDown } from './readinessState';

export type AppRole = 'web' | 'worker' | 'all';

export interface ReadinessStatus {
    ready: boolean;
    mongo: 'ok' | 'fail';
    redis: 'ok' | 'fail' | 'n/a';
}

const PING_TIMEOUT_MS = 1000;

/** Bir promise'i verilen sürede sonuçlanmazsa `false` ile "zaman aşımı" sayar (reddetmez). */
async function withTimeout(promise: Promise<boolean>, ms: number): Promise<boolean> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), ms);
    });
    try {
        return await Promise.race([promise.catch(() => false), timeout]);
    } finally {
        clearTimeout(timer!);
    }
}

async function pingMongo(): Promise<boolean> {
    try {
        const applicationDB = await DatabaseManagerInstance.getApplicationDB();
        return await withTimeout(applicationDB.ping(), PING_TIMEOUT_MS);
    } catch {
        return false;
    }
}

/**
 * Redis PING; `getRedisClient` enjekte edilebilir (test edilebilirlik + `web` rolünde RedisService hiç
 * import edilmeden/başlatılmadan Redis kontrolünün TAMAMEN atlanabilmesi için).
 */
async function pingRedis(getRedisClient: () => { ping: () => Promise<string> }): Promise<boolean> {
    try {
        const client = getRedisClient();
        const result = await withTimeout(client.ping().then((r) => r === 'PONG'), PING_TIMEOUT_MS);
        return result;
    } catch {
        return false;
    }
}

/**
 * `/ready`: kapanış başladıysa hemen `false` (DB/Redis'e sorulmaz). Aksi halde ApplicationDB ping ≤1sn;
 * rol `worker`/`all` ise Redis PING ≤1sn (rol `web` ise `redis: 'n/a'`, hiç sorulmaz).
 */
export async function checkReadiness(
    role: AppRole,
    getRedisClient?: () => { ping: () => Promise<string> },
): Promise<ReadinessStatus> {
    if (isShuttingDown()) {
        return { ready: false, mongo: 'fail', redis: role === 'web' ? 'n/a' : 'fail' };
    }

    const mongoOk = await pingMongo();

    let redis: 'ok' | 'fail' | 'n/a' = 'n/a';
    if (role !== 'web') {
        const redisOk = getRedisClient ? await pingRedis(getRedisClient) : false;
        redis = redisOk ? 'ok' : 'fail';
    }

    const ready = mongoOk && redis !== 'fail';
    return { ready, mongo: mongoOk ? 'ok' : 'fail', redis };
}

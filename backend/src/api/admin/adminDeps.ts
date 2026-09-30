// `/admin-api` bagimliliklari (enjekte edilebilir: testler DB/Redis'e baglanmadan calisir).
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import { RedisService } from '@services/redis';
import type { AdminMfaStore } from './adminMfaStore';
import { createMongoAdminMfaStore } from './adminMfaStore';
import { defaultTicketRedis, type RedisProvider } from './impersonationTicket';

export interface AdminAppDb {
    getUserModel(): any;
    getClientModel(): any;
    /** B12 davet kabulu (opsiyonel: gercek ApplicationDB sunar; sahte DB'ler vermeyebilir). */
    getAccountTokenModel?(): any;
}

/** Oturum iptali (cikis): jti kara listesi. En iyi cababa; Redis yoksa cerez silinir ama token suresine kadar gecerli kalir (bkz. ADR-0026 uygulama notu). */
export interface SessionRevocation {
    revoke(jti: string, ttlSeconds: number): Promise<void>;
    isRevoked(jti: string): Promise<boolean>;
}

export interface AdminDeps {
    getApplicationDB(): Promise<AdminAppDb>;
    mfaStore: AdminMfaStore;
    redis: RedisProvider;
    revocation: SessionRevocation;
    now(): number;
}

const REV_PREFIX = 'admin:rev:';

export function createRedisRevocation(): SessionRevocation {
    return {
        async revoke(jti, ttl) {
            if (!RedisService.isReady() || ttl <= 0) return;
            try { await RedisService.getInstance().set(REV_PREFIX + jti, '1', 'EX', Math.ceil(ttl)); } catch { /* en iyi cababa */ }
        },
        async isRevoked(jti) {
            if (!RedisService.isReady()) return false;
            try { return (await RedisService.getInstance().exists(REV_PREFIX + jti)) === 1; } catch { return false; }
        },
    };
}

export function defaultAdminDeps(): AdminDeps {
    const getApplicationDB = () => DatabaseManagerInstance.getApplicationDB() as Promise<AdminAppDb>;
    return {
        getApplicationDB,
        mfaStore: createMongoAdminMfaStore(async () => (await DatabaseManagerInstance.getApplicationDB()).getAdminMfaModel()),
        redis: defaultTicketRedis,
        revocation: createRedisRevocation(),
        now: () => Date.now(),
    };
}

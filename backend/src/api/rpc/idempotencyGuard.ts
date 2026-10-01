// [ADR-0030 X3] RunOperation'ın tek kancası: dış etkili yazma RPC'lerinde `Idempotency-Key` koruması.
// Kapsam = yetenek kaydı `external === true && effect !== 'read'` (capabilities/domains/*; ayrı liste tutulmaz).
// Yalnız `/api` (app) yüzeyi; backoffice ve tenant kimliği çözülemeyen çağrılar dışarıda.
import { CAPABILITY_BY_RPC } from '../../capabilities';
import { config } from '@config';
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import { ApplicationError } from '@platform/core/errors/ApplicationError';
import { metricsRegistry } from '@platform/runtime/metrics/MetricsRegistry';
import { isValidIdempotencyKey, runIdempotent, type IdempotencyStore } from '@platform/core/idempotency/idempotency';
import type { TenantEntry } from '@database/TenantRegistry';

/** RunOperation.RequestMeta'nın bu kancanın okuduğu alt kümesi (döngüsel içe aktarmayı önler). */
interface RequestMeta { tenant?: TenantEntry; surface?: 'app' | 'backoffice'; idempotencyKey?: string }

export function requiresIdempotency(service: string, operation: string): boolean {
    const cap = CAPABILITY_BY_RPC.get(service + '/' + operation);
    return !!cap && cap.external === true && cap.effect !== 'read';
}

async function storeFor(tenantId: number, meta?: RequestMeta): Promise<IdempotencyStore> {
    const db = meta?.tenant && meta.tenant.order === tenantId
        ? await DatabaseManagerInstance.getClientDBForTenant(meta.tenant)
        : await DatabaseManagerInstance.getClientDB(tenantId);
    if (!db) throw new Error('tenant DB yok');
    return db.getIdempotencyKeyModel() as unknown as IdempotencyStore;
}

/** Korumalı yürütme; kapsam dışıysa `run` doğrudan çağrılır. `body` = doğrulanmış/temizlenmiş istek gövdesi. */
export async function withIdempotency<T>(
    service: string, operation: string, userContext: any, principal: any, request: any, meta: RequestMeta | undefined, run: () => Promise<T>,
): Promise<T> {
    if (meta?.surface === 'backoffice' || !requiresIdempotency(service, operation)) return run();
    const mode = config.flags.idempotencyEnforce;
    const op = service + '/' + operation;
    const rawKey = meta?.idempotencyKey;
    if (rawKey === undefined) {
        try { metricsRegistry.incCounter('idempotency_key_missing', { op, mode }); } catch { /* */ }
        return run();
    }
    if (!isValidIdempotencyKey(rawKey)) {
        // observe: davranış değişmez (yok sayılır); enforce: 400.
        if (mode === 'enforce') throw new ApplicationError('Idempotency-Key geçersiz (8-128 karakter, harf/rakam/._:-).', 400, 'VALIDATION');
        try { metricsRegistry.incCounter('idempotency_key_invalid', { op }); } catch { /* */ }
        return run();
    }
    const tenantId = userContext?.order;
    const userId = principal?.sub;
    if (typeof tenantId !== 'number' || !userId) return run();
    let store: IdempotencyStore;
    try { store = await storeFor(tenantId, meta); } catch { return run(); }
    // Gövde özeti: sunucu alanları atılmış istek (RunOperation `execute` ile aynı ayıklama).
    const { userContext: _uc, principal: _pr, requestMeta: _rm, ctx: _c, order: _o, clientId: _cid, ...body } = (request ?? {}) as any;
    return runIdempotent({ store, mode, userId: String(userId), operation: op, key: rawKey, body, run });
}

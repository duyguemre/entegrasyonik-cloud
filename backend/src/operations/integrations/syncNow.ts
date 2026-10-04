import { ApplicationError } from '@platform/core/errors/ApplicationError';
import { ORDER_SYNC_KINDS, readSyncState, type SyncKind } from '@platform/core/sync/syncState';

/**
 * [eslesme-fiyat WP7b, F-10, PLAN §3.5] "Şimdi senkronize et" — kullanıcı tetiklemeli tek tür (orders|claims|messages|finance)
 * senkron işi. Kapılar (sırayla):
 *  1. Kill-switch (`allowNewWork`) ve LIVE_READONLY → merkezî RPC kancaları zaten reddeder (yetenek `external` + `write`);
 *     burada da savunma olarak denetlenir (RPC dışı çağıran için).
 *  2. Entegrasyon tenant'ta kayıtlı ve etkin olmalı; `needsAttention` (art arda AUTH) iken iş eklenmez (kimlik güncellenmeli).
 *  3. Soğuma: tenant × entegrasyon × tür başına 5 dk (`sync.manual.cooldownMs`). Mongo'da koşullu `$set` (atomik, çok pod güvenli): ilk yazan kazanır,
 *     diğerleri 429 RATE_LIMITED + `retryAfterSec`.
 *  4. Kuyruk: jobId `manual_<client>_<kod>_<kind>_<5 dk pencere>` (aynı pencerede ikinci ekleme yeni iş açmaz).
 * Tenant = doğrulanmış principal (`clientId`); gövde tenant SEÇEMEZ.
 */

export const SYNC_NOW_COOLDOWN_MS = 5 * 60 * 1000;
export type ManualSyncKind = typeof ORDER_SYNC_KINDS[number];

export interface SyncNowDeps {
    clientModel: any;
    clientId: number;
    allowNewWork: (integrationCode: string) => boolean;
    liveReadonly: boolean;
    /** Kuyruğa ekler; Redis hazır değilse `{ skipped: true }` döner (hata fırlatmaz). */
    enqueue: (args: { clientId: number; integrationCode: string; kind: ManualSyncKind; jobId: string; integration: any; now: Date }) => Promise<{ jobId: string; skipped: boolean }>;
    now?: () => Date;
    /** [WP7b, §3.6] `sync.manual.cooldownMs` (yoksa 5 dk). */
    cooldownMs?: number;
}

export interface SyncNowResult {
    accepted: true;
    jobId: string;
    kind: ManualSyncKind;
    integrationCode: string;
    requestedAt: Date;
    /** Bir sonraki manuel tetiğin açılacağı an. */
    nextAllowedAt: Date;
    lastSuccessAt: Date | null;
}

export function manualSyncJobId(clientId: number, integrationCode: string, kind: string, nowMs: number, windowMs: number = SYNC_NOW_COOLDOWN_MS): string {
    return `manual_${clientId}_${integrationCode}_${kind}_${Math.floor(nowMs / windowMs)}`;
}

export async function syncNow(input: { integrationCode: string; kind?: ManualSyncKind }, deps: SyncNowDeps): Promise<SyncNowResult> {
    const now = (deps.now ?? (() => new Date()))();
    const clientId = Number(deps.clientId);
    const integrationCode = String(input?.integrationCode ?? '');
    const kind: ManualSyncKind = input?.kind ?? 'orders';
    const cooldownMs = Number.isInteger(deps.cooldownMs) && (deps.cooldownMs as number) >= 60000 ? (deps.cooldownMs as number) : SYNC_NOW_COOLDOWN_MS;
    if (!Number.isInteger(clientId)) throw new ApplicationError('Tenant bulunamadı.', 400, 'VALIDATION');
    if (!(ORDER_SYNC_KINDS as readonly string[]).includes(kind)) throw new ApplicationError('Geçersiz senkron türü.', 400, 'VALIDATION');

    if (deps.liveReadonly) throw new ApplicationError('Canlı salt-okuma kipinde manuel senkron kapalıdır.', 423, 'LIVE_READONLY');
    if (!deps.allowNewWork(integrationCode)) throw new ApplicationError('Bu entegrasyon geçici olarak durduruldu.', 503, 'INTEGRATION_PAUSED');

    const client: any = await deps.clientModel.findOne(
        { clientId, status: 'ACTIVE', 'integrations.integrationCode': integrationCode },
        { clientId: 1, integrations: { $elemMatch: { integrationCode } } },
    ).lean();
    const integration = client?.integrations?.[0];
    if (!integration || integration.status !== true || !['marketplace', 'ecommerce'].includes(integration.type)) {
        throw new ApplicationError('Bu entegrasyon için senkron yapılamaz (kayıtlı ve etkin değil).', 404, 'NOT_FOUND');
    }
    if (integration.needsAttention) {
        throw new ApplicationError('Entegrasyon kimlik bilgileri reddedildi; ayarları güncelleyin.', 502, 'AUTH');
    }

    // Atomik soğuma: yalnız son manuel istek 5 dk'dan eskiyse (ya da hiç yoksa) yazılır.
    const field = `sync.${kind}.manualRequestedAt`;
    const threshold = new Date(now.getTime() - cooldownMs);
    const res: any = await deps.clientModel.updateOne(
        {
            clientId,
            integrations: { $elemMatch: { integrationCode, $or: [{ [field]: { $exists: false } }, { [field]: { $lte: threshold } }] } },
        },
        { $set: { [`integrations.$.${field}`]: now } },
    );
    if (!res?.modifiedCount) {
        const last = integration?.sync?.[kind]?.manualRequestedAt ? new Date(integration.sync[kind].manualRequestedAt).getTime() : now.getTime();
        const retryAfterSec = Math.max(1, Math.ceil((last + cooldownMs - now.getTime()) / 1000));
        throw new ApplicationError(`Bu tür için manuel senkron ${Math.round(cooldownMs / 60000)} dakikada bir yapılabilir; ${Math.ceil(retryAfterSec / 60)} dk sonra tekrar deneyin.`, 429, 'RATE_LIMITED', { retryAfterSec });
    }

    const jobId = manualSyncJobId(clientId, integrationCode, kind, now.getTime(), cooldownMs);
    const queued = await deps.enqueue({ clientId, integrationCode, kind, jobId, integration, now });
    if (queued.skipped) {
        // Kuyruk yok (Redis) → soğuma geri alınır ki kullanıcı Redis dönünce hemen deneyebilsin.
        await deps.clientModel.updateOne(
            { clientId, 'integrations.integrationCode': integrationCode },
            { $unset: { [`integrations.$.${field}`]: '' } },
        ).catch(() => undefined);
        throw new ApplicationError('Kuyruk şu an kullanılamıyor.', 503, 'QUEUE_UNAVAILABLE');
    }

    const state = readSyncState(integration)[kind as SyncKind];
    return {
        accepted: true,
        jobId: queued.jobId || jobId,
        kind,
        integrationCode,
        requestedAt: now,
        nextAllowedAt: new Date(now.getTime() + cooldownMs),
        lastSuccessAt: state.lastSuccessAt,
    };
}

import { maskIntegrationItem, SENSITIVE_MASK } from '../../api/integrationSecrets';
import { redactMessage } from '../../integration/modules/common/IntegrationError';

/**
 * TENANT entegrasyon sağlığı (FRONTEND_GAP_ANALYSIS N7 / API_TENANT_SURFACE §3) — YALNIZCA OKUMA.
 *
 * Kaynaklar (hiçbiri bu modülde yazılmaz):
 *  - ApplicationDB `Clients.integrations[]`      : `lastSuccessfulOrderSync`, `webhookHealthy`, `webhookLastReceivedAt`, `status`
 *                                                  (motorun GERÇEK imleci; tenant DB'deki `syncMetadata.lastOrderSync` HİÇBİR yerde
 *                                                  yazılmıyor ve varsayılanı epoch 0'dır -> bilerek KULLANILMAZ)
 *  - ApplicationDB `IntegrationCallMetrics`      : son 24 sa çağrı sayıları, son hata (`IntegrationError.code`), devre kesici durumu
 *  - Tenant DB `ClientIntegrations`              : yalnızca "kimlik bilgisi girilmiş mi" (boolean; değer ASLA dönmez)
 *
 * Tenant izolasyonu: her sorgu `clientId` (sunucuda doğrulanmış principal'dan gelen `currentClientId`) ile süzülür;
 * gövdedeki hiçbir alan tenant seçmez. Sızıntı önlemi: DTO BEYAZ LİSTEDİR — webhookToken, ham hata mesajı, URL sorgu dizesi,
 * kimlik bilgisi ve ayar değeri çıkmaz; `operation` alanı sorgu dizesinden ve uzun token benzeri parçalardan arındırılır.
 */

export const HEALTH_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Devre kesici gözlemi bu süreden eskiyse ("open"/"half_open") durum bayat sayılır (ResilientHttpClient açık süre üst sınırı 5 dk). */
export const CIRCUIT_STALE_MS = 10 * 60 * 1000;
/** `lastError`/`circuit` için metrik geriye bakış sınırı (koleksiyon TTL'i zaten 30 gün). */
const LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

const KNOWN_ERROR_CODES: ReadonlySet<string> = new Set([
    'AUTH', 'RATE_LIMITED', 'UNAVAILABLE', 'VALIDATION', 'NOT_FOUND', 'NOT_SUPPORTED', 'UNKNOWN_OUTCOME', 'INTERNAL',
]);
const CIRCUIT_STATES: ReadonlySet<string> = new Set(['closed', 'open', 'half_open']);
const INTEGRATION_TYPES = ['marketplace', 'shipment', 'ecommerce', 'erp', 'einvoice'] as const;

export type IntegrationHealthStatus = 'not_configured' | 'no_data' | 'healthy' | 'degraded' | 'down';

export interface IntegrationHealthDto {
    integrationCode: string;
    type: string | null;
    enabled: boolean;
    credentialsConfigured: boolean | null;
    lastSuccessfulSyncAt: Date | null;
    webhook: { healthy: boolean | null; lastReceivedAt: Date | null } | null;
    lastError: { at: Date; code: string; httpStatus: number | null; operation: string } | null;
    circuit: { state: 'closed' | 'open' | 'half_open'; observedAt: Date; stale: boolean } | null;
    last24h: { total: number; success: number; error: number; errorsByCode: Record<string, number> };
    health: IntegrationHealthStatus;
}

export interface IntegrationHealthResult {
    generatedAt: Date;
    windowHours: number;
    integrations: IntegrationHealthDto[];
}

/** `operation` alanını sızıntıya karşı temizler: sorgu dizesini at, kimlik bilgisi kalıplarını maskele, uzun token benzeri parçaları maskele. */
export function sanitizeOperation(op: unknown): string {
    const base = String(op ?? '').split('?')[0].split('#')[0];
    return redactMessage(base).replace(/[A-Za-z0-9_\-+=]{32,}/g, '***').slice(0, 120);
}

const toDate = (v: any): Date | null => {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
};

const hasSensitive = (node: any, depth = 0): boolean => {
    if (node === SENSITIVE_MASK) return true;
    if (!node || typeof node !== 'object' || depth > 6) return false;
    return Object.values(node).some((v) => hasSensitive(v, depth + 1));
};

export interface IntegrationHealthDeps {
    applicationDB: any;
    clientDB: any;
    /** Sunucuda doğrulanmış principal'dan gelen tenant kimliği (asla istek gövdesinden değil). */
    clientId: number;
    now?: () => Date;
}

export async function buildIntegrationHealth(deps: IntegrationHealthDeps): Promise<IntegrationHealthResult> {
    const now = (deps.now ?? (() => new Date()))();
    const clientId = Number(deps.clientId);
    if (!Number.isInteger(clientId)) throw Object.assign(new Error('Tenant bulunamadı.'), { statusCode: 400 });
    const clientKey = String(clientId); // IntegrationCallMetrics.clientId String olarak saklanır
    const since24h = new Date(now.getTime() - HEALTH_WINDOW_MS);
    const sinceLookback = new Date(now.getTime() - LOOKBACK_MS);
    const metricModel = deps.applicationDB.getIntegrationCallMetricModel();

    const [clientDoc, ciDoc, countRows, errorCodeRows, latestRows, lastErrorRows] = await Promise.all([
        deps.applicationDB.getClientModel().findOne({ clientId }, { integrations: 1, _id: 0 }).lean(),
        deps.clientDB?.getClientIntegrationModel ? deps.clientDB.getClientIntegrationModel().findOne({}).lean() : Promise.resolve(null),
        metricModel.aggregate([
            { $match: { clientId: clientKey, at: { $gte: since24h } } },
            { $group: { _id: { integrationCode: '$integrationCode', status: '$status' }, count: { $sum: 1 } } },
        ]),
        metricModel.aggregate([
            { $match: { clientId: clientKey, at: { $gte: since24h }, status: 'error' } },
            { $group: { _id: { integrationCode: '$integrationCode', code: '$code' }, count: { $sum: 1 } } },
        ]),
        metricModel.aggregate([
            { $match: { clientId: clientKey, at: { $gte: sinceLookback } } },
            { $sort: { at: -1 } },
            { $group: { _id: '$integrationCode', at: { $first: '$at' }, circuitState: { $first: '$circuitState' }, status: { $first: '$status' } } },
        ]),
        metricModel.aggregate([
            { $match: { clientId: clientKey, at: { $gte: sinceLookback }, status: 'error' } },
            { $sort: { at: -1 } },
            { $group: { _id: '$integrationCode', at: { $first: '$at' }, code: { $first: '$code' }, httpStatus: { $first: '$httpStatus' }, operation: { $first: '$operation' } } },
        ]),
    ]);

    // Kayıtlı entegrasyonlar: Clients.integrations (kanonik liste) ∪ metrik görülen kodlar ∪ tenant DB'de tanımlı kodlar
    const registered = new Map<string, any>();
    const list: any[] = Array.isArray(clientDoc?.integrations) ? clientDoc.integrations : [];
    for (const it of list) if (it && typeof it.integrationCode === 'string') registered.set(it.integrationCode, it);

    const credentials = new Map<string, boolean>();
    const typeByCode = new Map<string, string>();
    for (const t of INTEGRATION_TYPES) {
        for (const item of Array.isArray(ciDoc?.[t]) ? ciDoc[t] : []) {
            if (!item || typeof item.code !== 'string') continue;
            typeByCode.set(item.code, t);
            const masked = maskIntegrationItem(item);
            credentials.set(item.code, hasSensitive(masked?.settings));
        }
    }

    const codes = new Set<string>([...registered.keys(), ...typeByCode.keys()]);
    for (const r of [...countRows, ...latestRows]) {
        const code = r?._id?.integrationCode ?? (typeof r?._id === 'string' ? r._id : undefined);
        if (typeof code === 'string' && code) codes.add(code);
    }

    const counts = new Map<string, { success: number; error: number }>();
    for (const r of countRows) {
        const code = r?._id?.integrationCode; if (typeof code !== 'string') continue;
        const c = counts.get(code) ?? { success: 0, error: 0 };
        if (r._id.status === 'ok') c.success += Number(r.count) || 0; else if (r._id.status === 'error') c.error += Number(r.count) || 0;
        counts.set(code, c);
    }
    const errorsByCode = new Map<string, Record<string, number>>();
    for (const r of errorCodeRows) {
        const code = r?._id?.integrationCode; if (typeof code !== 'string') continue;
        const bucket = errorsByCode.get(code) ?? {};
        const ec = KNOWN_ERROR_CODES.has(r._id.code) ? r._id.code : 'UNKNOWN';
        bucket[ec] = (bucket[ec] ?? 0) + (Number(r.count) || 0);
        errorsByCode.set(code, bucket);
    }
    const latest = new Map<string, any>(latestRows.filter((r: any) => typeof r?._id === 'string').map((r: any) => [r._id, r]));
    const lastErr = new Map<string, any>(lastErrorRows.filter((r: any) => typeof r?._id === 'string').map((r: any) => [r._id, r]));

    const integrations: IntegrationHealthDto[] = [...codes].sort().map((code) => {
        const reg = registered.get(code);
        const c = counts.get(code) ?? { success: 0, error: 0 };
        const lt = latest.get(code);
        const le = lastErr.get(code);

        const circuitObservedAt = toDate(lt?.at);
        const circuit = lt && circuitObservedAt && CIRCUIT_STATES.has(lt.circuitState)
            ? {
                state: lt.circuitState as 'closed' | 'open' | 'half_open',
                observedAt: circuitObservedAt,
                stale: lt.circuitState !== 'closed' && now.getTime() - circuitObservedAt.getTime() > CIRCUIT_STALE_MS,
            }
            : null;

        const lastErrorAt = toDate(le?.at);
        const lastError = le && lastErrorAt
            ? {
                at: lastErrorAt,
                code: KNOWN_ERROR_CODES.has(le.code) ? le.code : 'UNKNOWN',
                httpStatus: typeof le.httpStatus === 'number' ? le.httpStatus : null,
                operation: sanitizeOperation(le.operation),
            }
            : null;

        const credentialsConfigured = credentials.has(code) ? credentials.get(code)! : null;
        const enabled = reg ? reg.status !== false : true;
        const total = c.success + c.error;

        let health: IntegrationHealthStatus;
        if (credentialsConfigured === false && total === 0) health = 'not_configured';
        else if (circuit && circuit.state === 'open' && !circuit.stale) health = 'down';
        else if (total === 0) health = 'no_data';
        else if (c.error > 0 && lt?.status === 'error') health = 'degraded';
        else health = 'healthy';

        const webhookKnown = reg && (reg.webhookHealthy !== undefined || reg.webhookLastReceivedAt);
        return {
            integrationCode: code,
            type: (typeof reg?.type === 'string' ? reg.type : typeByCode.get(code)) ?? null,
            enabled,
            credentialsConfigured,
            lastSuccessfulSyncAt: toDate(reg?.lastSuccessfulOrderSync),
            webhook: webhookKnown ? { healthy: typeof reg.webhookHealthy === 'boolean' ? reg.webhookHealthy : null, lastReceivedAt: toDate(reg.webhookLastReceivedAt) } : null,
            lastError,
            circuit,
            last24h: { total, success: c.success, error: c.error, errorsByCode: errorsByCode.get(code) ?? {} },
            health,
        };
    });

    return { generatedAt: now, windowHours: HEALTH_WINDOW_MS / 3600000, integrations };
}

// COM-08: gunluk komisyon sapma taramasi. Aktif tenant x gerceklesen orani olan kanal (DRIFT_CHANNELS) icin `getCommissionDrift`
// calistirir, `drift` durumundaki kategoriler icin COMMISSION_RATE_DRIFT bildirimi uretir (ADR-0029 `notify` tek giris).
// Tekrar bastirma katalogdadir: dedupeKey = kanal:kategori:ay (defter) -> ayni pencerede ikinci tur yeni kayit uretmez.
// Bildirim altyapisi kapaliyken (NOTIFY_V2_ENABLED=false) hicbir DB okumasi yapmadan doner. Yalniz OKUR (+ bildirim defteri).
import { config } from '@config';
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import { CLIENT_INTEGRATION_HOT_PROJECTION } from '@database/projections';
import { NotificationService } from '@services/notification/NotificationService';
import { logger } from '@platform/core/logger';
import { DRIFT_CHANNELS, driftWindow, getCommissionDrift, type CommissionDriftReport } from './commissionDrift';

export const COMMISSION_DRIFT_JOB_NAME = 'finance.commissionDrift';
/** Tenant x kanal basina tur ustu bildirim siniri (bayat tablo cok kategoriyi birden etkiler; zil grubu ayrica toplar). */
export const DRIFT_NOTIFY_PER_CHANNEL_MAX = 20;

const log = logger.child({ module: 'finance.commissionDrift' });

export interface CommissionDriftJobDeps {
    now(): Date;
    notifyEnabled(): boolean;
    listTenants(): Promise<Array<{ tid: number; channels: string[] }>>;
    drift(tid: number, channel: string): Promise<CommissionDriftReport>;
    notify(tid: number, params: Record<string, unknown>): Promise<{ status: string }>;
}

export interface CommissionDriftRunResult {
    skipped?: string;
    tenants: number;
    evaluated: number;
    drifted: number;
    notified: number;
    failedTenants: number;
}

export async function runCommissionDrift(deps: CommissionDriftJobDeps, ctx: { signal?: AbortSignal } = {}): Promise<CommissionDriftRunResult> {
    const out: CommissionDriftRunResult = { tenants: 0, evaluated: 0, drifted: 0, notified: 0, failedTenants: 0 };
    if (!deps.notifyEnabled()) return { ...out, skipped: 'notify_disabled' };
    const window = driftWindow(deps.now());
    for (const t of await deps.listTenants()) {
        if (ctx.signal?.aborted) break;
        out.tenants++;
        try {
            for (const channel of t.channels) {
                const report = await deps.drift(t.tid, channel);
                out.evaluated += report.items.length;
                const drifted = report.items.filter((i) => i.status === 'drift' && i.referenceRate !== null && i.referenceSource !== null && i.deltaPoints !== null);
                out.drifted += drifted.length;
                for (const i of drifted.slice(0, DRIFT_NOTIFY_PER_CHANNEL_MAX)) {
                    const r = await deps.notify(t.tid, {
                        integ: channel, categoryId: i.categoryId, realizedRate: i.realizedRate, referenceRate: i.referenceRate,
                        referenceSource: i.referenceSource, deltaPoints: i.deltaPoints, thresholdPoints: report.thresholdPoints,
                        sampleCount: i.sampleCount, window,
                    });
                    if (r.status === 'created' || r.status === 'grouped') out.notified++;
                }
            }
        } catch (err) {
            out.failedTenants++;
            log.warn({ err: { message: (err as Error)?.message }, tid: t.tid }, 'tenant komisyon sapmasi hesaplanamadi; bu tur atlandi');
        }
    }
    return out;
}

/** Uretim baglantisi (bootstrap/schedules.ts). */
export function createCommissionDriftDeps(): CommissionDriftJobDeps {
    const clientDB = async (tid: number) => {
        const db = await DatabaseManagerInstance.getClientDB(tid);
        if (!db) throw new Error('tenant_db_unavailable');
        return db as any;
    };
    return {
        now: () => new Date(),
        notifyEnabled: () => config.notify.v2Enabled,
        async listTenants() {
            const app = await DatabaseManagerInstance.getApplicationDB();
            const clients: any[] = await app.getClientModel().find({ status: 'ACTIVE' }, { order: 1 }).lean();
            const out: Array<{ tid: number; channels: string[] }> = [];
            for (const tid of clients.map((c) => Number(c.order)).filter((n) => Number.isInteger(n) && n > 0)) {
                try {
                    const integ: any = await (await clientDB(tid)).getClientIntegrationModel().findOne({}, CLIENT_INTEGRATION_HOT_PROJECTION).lean();
                    const active = new Set((integ?.marketplace || []).filter((m: any) => m?.status !== false).map((m: any) => String(m?.code).toLowerCase()));
                    const channels = DRIFT_CHANNELS.filter((c) => active.has(c));
                    if (channels.length) out.push({ tid, channels });
                } catch (err) {
                    log.warn({ err: { message: (err as Error)?.message }, tid }, 'tenant kanal listesi okunamadi; bu tur atlandi');
                }
            }
            return out;
        },
        drift: async (tid, channel) => getCommissionDrift(await clientDB(tid), tid, { integrationCode: channel }),
        notify: (tid, params) => NotificationService.notify('COMMISSION_RATE_DRIFT', tid, params, { module: 'finance.commissionDrift' }),
    };
}

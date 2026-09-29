// ADR-0020 Karar 3.6 (Aşama B) — "her süreç 15 sn'de bir `IntegrationConfigHeads`'i tek sorguyla okur (tüm hedefler)".
// ADR-0016 §2 / ADR-0017 Karar 3 zamanlayıcı altyapısına (`platform/runtime/scheduler`) KAYDEDİLİR — yeni bir
// zamanlayıcı mekanizması İCAT EDİLMEDİ (görev talimatı). `criticality:'normal'` (yapılandırma yoklaması sipariş/stok
// hattı kadar kritik değildir; okunamazsa Karar 3.6 son madde: son bilinen yapılandırma kullanılır, fail-closed DEĞİL).
import { startJob, defineJob } from '@platform/runtime/scheduler';
import type { JobController, RunJobDeps } from '@platform/runtime/scheduler';
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import { listHeads, getRevisionByVersion, type RevisionModels } from './revisionRepository';
import {
    setTargetOverride, recordPollSuccess, recordPollFailure, getKnownVersion, setTargetIntake, checkIntakeDurationWarning,
} from './platformOverrideStore';

export const CONFIG_HEAD_POLL_JOB_NAME = 'config-head-poll';
const INTERVAL_MS = 15 * 1000;
const MAX_DURATION_MS = 10 * 1000;

/** Tek turun iş mantığı (DB'siz test edilebilir: sahte `RevisionModels` verilir). */
export async function pollOnce(models: RevisionModels): Promise<{ processed: number; changed: string[] }> {
    const heads = await listHeads(models);
    const changed: string[] = [];
    for (const head of heads) {
        // ADR-0020 Karar 3.8 (Aşama D) — `intake`/`maintenance` YAYIN AKIŞININ DIŞINDADIR (`setIntake` publishedVersion'ı
        // ARTIRMAZ); bu yüzden HER turda, sürüm değişmese bile senkronlanır (ucuz: yalnız bellek-içi Map güncellemesi,
        // `changed` listesine (yalnız `overrides` yayınına ait) YAZILMAZ -- aşağıdaki mevcut test sözleşmesini KORUR).
        setTargetIntake(head._id, head.intake ?? 'on', head.maintenance);
        checkIntakeDurationWarning(head._id, head.intake ?? 'on', head.updatedAt);

        if (head.publishedVersion === 0) continue; // hiç yayın yok -- store'a dokunma (default katman geçerli kalır)
        if (getKnownVersion(head._id) === head.publishedVersion) continue; // değişmedi -- ağır okuma yapma
        const revision = await getRevisionByVersion(models, head._id, head.publishedVersion);
        if (!revision) continue; // tutarsızlık (revizyon silinmiş olamaz ama savunma amaçlı) -- bu turda atla
        setTargetOverride(head._id, head.publishedVersion, revision.overrides ?? {});
        changed.push(head._id);
    }
    return { processed: heads.length, changed };
}

export class ConfigHeadPollScheduler {
    private static controller: JobController | undefined;

    /** Aynı süreçte iki kez çağrılırsa ikinci çağrı no-op'tur (idempotent; `StockPublishScheduler` ile aynı desen). */
    public static start(deps?: RunJobDeps): void {
        if (this.controller) return;
        this.controller = startJob(defineJob({
            name: CONFIG_HEAD_POLL_JOB_NAME,
            everyMs: INTERVAL_MS,
            maxDurationMs: MAX_DURATION_MS,
            criticality: 'normal',
            runOnStart: 'always',
            run: async () => {
                try {
                    const applicationDB: any = await DatabaseManagerInstance.getApplicationDB();
                    const models: RevisionModels = {
                        revisionModel: applicationDB.getIntegrationConfigRevisionModel(),
                        headModel: applicationDB.getIntegrationConfigHeadModel(),
                    };
                    const result = await pollOnce(models);
                    recordPollSuccess();
                    return { processed: result.processed, failed: 0, note: result.changed.length ? `değişen: ${result.changed.join(',')}` : undefined };
                } catch (err: any) {
                    recordPollFailure();
                    return { processed: 0, failed: 1, skipped: 'db_unavailable', note: err?.message?.slice(0, 200) };
                }
            },
        }), deps);
    }

    public static stop(): void {
        this.controller?.stop();
        this.controller = undefined;
    }
}

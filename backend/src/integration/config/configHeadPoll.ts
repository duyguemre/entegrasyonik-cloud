// [ADR-0024 P0-LIFE] Zamanlama kaydı `bootstrap/schedules.ts`'e taşındı (15 sn / 10 sn / normal / always); bu dosya yalnız iş mantığıdır.
// ADR-0020 Karar 3.6 (Aşama B) — "her süreç 15 sn'de bir `IntegrationConfigHeads`'i tek sorguyla okur (tüm hedefler)".
// ADR-0016 §2 / ADR-0017 Karar 3 zamanlayıcı altyapısına (`platform/runtime/scheduler`) KAYDEDİLİR — yeni bir
// zamanlayıcı mekanizması İCAT EDİLMEDİ (görev talimatı). `criticality:'normal'` (yapılandırma yoklaması sipariş/stok
// hattı kadar kritik değildir; okunamazsa Karar 3.6 son madde: son bilinen yapılandırma kullanılır, fail-closed DEĞİL).
import type { JobOutcome } from '@platform/runtime/scheduler';
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import { listHeads, getRevisionByVersion, type RevisionModels } from './revisionRepository';
import {
    setTargetOverride, recordPollSuccess, recordPollFailure, getKnownVersion, setTargetIntake, checkIntakeDurationWarning,
} from './platformOverrideStore';

export const CONFIG_HEAD_POLL_JOB_NAME = 'config-head-poll';

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

/** Tek zamanlayıcı turu (bootstrap/schedules.ts'in `config-head-poll` işi): DB okunamazsa son bilinen yapılandırma korunur. */
export async function runConfigHeadPoll(): Promise<JobOutcome> {
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
}

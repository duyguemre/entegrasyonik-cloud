import { ObjectId } from 'mongodb';
import { normalizePagination, pickSortField } from '@utils/search';
import { EVENTS, integrationEventBus } from '@platform/runtime/events/IntegrationEventBus';
import type { ImportJobRepository } from '@database/repositories/app/ImportJobRepository';
import type { ImportStagingRepository } from '@database/repositories/tenant/ImportStagingRepository';

/** [DB-02] ImportJobs sıralama alanı izin listesi (Import.ts şeması; FE: startedAt/completedAt/processedCount). */
export const IMPORT_JOB_SORT_FIELDS: readonly string[] = [
    '_id', 'jobId', 'integrationCode', 'status', 'startedAt', 'completedAt', 'updatedAt',
    'totalCount', 'validCount', 'invalidCount', 'duplicateCount', 'processedCount', 'failedCount',
];

/**
 * Kullanıcı tetiklemeli katalog içe aktarma isteği (ADR-0024 P3-INT). Devam eden iş varsa yeni iş açılmaz; tenant DB'deki eski
 * ara kayıtlar temizlenir (hata kritik değil, `onCleanupError`'a bildirilir), ApplicationDB'de yeni iş açılır ve orkestratör
 * beklemeden uyandırılır.
 */
export async function requestImportFetch(
    deps: { jobs: ImportJobRepository; staging: ImportStagingRepository | null },
    integrationCode: any,
    onCleanupError: (err: any) => void,
): Promise<any> {
    // 1. HALA ÇALIŞAN bir iş var mı? (merkezi ApplicationDB)
    const activeJob = await deps.jobs.findActive(integrationCode);
    if (activeJob) {
        return {
            success: false,
            message: `Bu platform için devam eden bir işlem var. (JobId: ${activeJob.jobId})`,
            jobId: activeJob.jobId
        };
    }

    // 2. TEMİZLİK: staging modelleri ClientDB'de
    try {
        if (deps.staging) await deps.staging.clearForIntegration(integrationCode);
    } catch (cleanupErr: any) {
        onCleanupError(cleanupErr); // kritik değil; devam edilir ama loglanır
    }

    // 3. TAMAMEN YENİ KAYIT (ApplicationDB)
    const newJobId = new ObjectId();
    await deps.jobs.create({
        _id: newJobId,
        jobId: newJobId.toString(),
        integrationCode: integrationCode,
        status: 'WAITING_FOR_FETCH',
        totalCount: 0,
        processedCount: 0,
        failedCount: 0,
        createdAt: new Date(),
        updatedAt: new Date()
    });

    // 4. Orkestratör 5 sn beklemeden işi hemen kapsın
    integrationEventBus.emit(EVENTS.PROCESS_NEXT_IMPORT_JOB);

    return {
        success: true,
        message: "Yeni ürün çekme isteği başarıyla oluşturuldu ve sıraya alındı.",
        jobId: newJobId.toString()
    };
}

/** Arşivlenmemiş içe aktarma işleri; sıralama izin listeli (bilinmeyen alan => `jobId` azalan). */
export async function listImportJobs(jobs: ImportJobRepository, body: any): Promise<any> {
    const { integrationCode, sortBy, sortOrder } = body;
    // [DÜZELTME 2026-09-29, BACKLOG C22/GV-01] page/limit @utils/search.normalizePagination ile sınırlanır.
    const { page, limit } = normalizePagination(body, 10);
    const skip = (page - 1) * limit;

    const sortQuery: any = {};
    const pickedSort = pickSortField(sortBy, IMPORT_JOB_SORT_FIELDS, 'jobId');
    if (!pickedSort.usedFallback) {
        sortQuery[pickedSort.field] = sortOrder === 'desc' ? -1 : 1;
    } else {
        sortQuery.jobId = -1;
    }

    const { items, total } = await jobs.listPage(integrationCode, sortQuery, skip, Number(limit));
    return {
        success: true,
        data: items,
        total,
        pagination: {
            page: Number(page),
            limit: Number(limit),
            totalNumberOfRecords: total,
            totalNumberOfPages: Math.ceil(total / Number(limit))
        }
    };
}

/** jobId'ye göre iş (yalnız kendi tenant'ı). Hata durumunu çağıran (RPC cephesi) yanıta çevirir. */
export async function getImportJob(jobs: ImportJobRepository, jobId: any): Promise<any> {
    if (!jobId) return { success: false, message: "jobId parametresi eksik." };
    const job = await jobs.findByJobId(jobId);
    if (!job) return { success: false, message: "Belirtilen ID ile eşleşen bir işlem bulunamadı." };
    return { success: true, data: job };
}

/** Yalnız COMPLETED/FAILED işler arşivlenir. */
export async function archiveImportJobs(jobs: ImportJobRepository, ids: any): Promise<any> {
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return { success: false, message: "Geçerli ID listesi gerekli." };
    }
    const result = await jobs.archive(ids);
    if (result.matchedCount === 0) {
        return { success: false, message: "Arşivlenebilir (tamamlanmış) kayıt bulunamadı." };
    }
    return {
        success: true,
        message: `${result.modifiedCount} kayıt başarıyla arşivlendi.`,
        modifiedCount: result.modifiedCount
    };
}

export async function getImportJobReport(staging: ImportStagingRepository, jobId: any): Promise<any> {
    if (!jobId) return { success: false, message: "JobId required" };
    const report = await staging.findReport(jobId);
    return { success: report ? true : false, data: report || null };
}

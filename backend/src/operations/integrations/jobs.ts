import { ObjectId } from 'mongodb';
import { IApplicationDB, IClientDB } from '@interfaces/index';
import { containsRegex, normalizePagination, pickSortField } from '@utils/search';
import { eventLog } from '@platform/core/logger';
import { ExportJobRepository } from '@database/repositories/tenant/ExportJobRepository';
import { ImportStagingRepository } from '@database/repositories/tenant/ImportStagingRepository';
import { ExportSignalRepository } from '@database/repositories/app/ExportSignalRepository';
import { ImportJobRepository } from '@database/repositories/app/ImportJobRepository';

/**
 * ADR-0024 P3-INT: içe/dışa aktarım iş listeleri, detayları ve yeni çekme isteği (eski `IntegrationService` gövdesi).
 * Yanıt biçimleri (`{ success, data, pagination }` / `{ success:false, message }`) BİREBİR korunur.
 */
const log = eventLog('api', 'IntegrationJobs');

/** [DB-02] ImportJobs sıralama alanı izin listesi (Import.ts şeması; FE: startedAt/completedAt/processedCount). */
export const IMPORT_JOB_SORT_FIELDS: readonly string[] = [
    '_id', 'jobId', 'integrationCode', 'status', 'startedAt', 'completedAt', 'updatedAt',
    'totalCount', 'validCount', 'invalidCount', 'duplicateCount', 'processedCount', 'failedCount',
];

export interface JobDeps { clientDB: IClientDB; applicationDB: IApplicationDB; clientId: unknown }

const isTerminal = (status: unknown) => ['COMPLETED', 'FAILED'].includes(status as string);

function pagination(page: number, limit: number, total: number) {
    return { page: Number(page), limit: Number(limit), totalNumberOfRecords: total, totalNumberOfPages: Math.ceil(total / Number(limit)) };
}

/** Gün sınırlı `createdAt` aralığı (yerel gün başı/sonu). */
function applyCreatedAtRange(query: any, startDate: any, endDate: any): void {
    if (!startDate && !endDate) return;
    query.createdAt = {};
    if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        query.createdAt.$gte = start;
    }
    if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
    }
}

const globalSearchOr = (term: any) => [
    { barcode: containsRegex(term) }, // [GV-01]
    { batchId: containsRegex(term) },
    { 'payload.stockcode': containsRegex(term) },
];

async function searchExportJobs(deps: JobDeps, op: string, query: any, sortBy: string, sortOrder: string, page: number, limit: number, mapItem: (job: any) => any) {
    const skip = (page - 1) * limit;
    try {
        const { items, total } = await new ExportJobRepository(deps.clientDB).search(query, { [sortBy]: sortOrder === 'desc' ? -1 : 1 }, Number(skip), Number(limit));
        return { success: true, data: items.map(mapItem), pagination: pagination(page, limit, total) };
    } catch (err: any) {
        log.error('EXPORT_JOB_LIST_FAILED', `[${op}] Error:`, { err });
        return { success: false, message: err.message };
    }
}

/** Dışa aktarım işi detayı: loglar zamana göre sıralı, bağlı paket sinyalinin `nextRunAt`'ı, son hata mesajı. */
export async function getExportJobDetail(deps: JobDeps, body: any) {
    const { id } = body; // Frontend'den gelen döküman _id'si (ObjectId)
    if (!id) return { success: false, message: "Geçerli bir işlem ID'si gerekli." };
    try {
        const job = await new ExportJobRepository(deps.clientDB).findById(id);
        if (!job) return { success: false, message: 'İşlem detayları bulunamadı.' };
        if (job.logs && Array.isArray(job.logs)) {
            job.logs.sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        }
        let nextRunAt = null;
        if (job.batchId) nextRunAt = await new ExportSignalRepository(deps.applicationDB).nextRunAt(job.batchId);
        const detail = {
            ...job,
            nextRunAt,
            lastErrorMessage: job.status === 'FAILED'
                ? (job.errorMessage || job.logs?.filter((l: any) => l.status === 'FAILED').pop()?.message)
                : null,
            batchId: job.batchId || null,
        };
        return { success: true, data: detail };
    } catch (err: any) {
        log.error('EXPORT_JOB_DETAIL_FAILED', '[getExportJobDetail] Error:', { err });
        return { success: false, message: 'Sunucu hatası: ' + err.message };
    }
}

/** Gelişmiş dışa aktarım iş araması (çoklu kanal/durum, kategori/marka, varyant seçimi, paket). */
export async function advancedSearchExportJobs(deps: JobDeps, body: any) {
    const {
        sortBy = 'createdAt', sortOrder = 'desc', globalSearch, title, barcode, stockcode, category, brand,
        integrationCode, mode, statuses, selectedChoices, startDate, endDate, batchId,
    } = body;
    // [DÜZELTME 2026-09-29, BACKLOG C22/GV-01] page/limit @utils/search.normalizePagination ile sınırlanır (limit üst sınırı 200 --
    // FE bu listede sabit 13 kullanıyor, frontend/src/components/logListView/ExportLogList.vue; page<1 -> 1).
    const { page, limit } = normalizePagination(body, 13);

    const query: any = { status: { $ne: 'ARCHIVED' } };
    applyCreatedAtRange(query, startDate, endDate);
    if (globalSearch) query.$or = globalSearchOr(globalSearch);
    if (title) query['payload.title'] = containsRegex(title); // [GV-01]
    if (barcode) query.barcode = containsRegex(barcode); // [GV-01]
    if (stockcode) query['payload.stockcode'] = containsRegex(stockcode); // [GV-01]
    if (batchId) query.batchId = batchId;
    if (category && category !== -1) query['payload.product.category'] = new ObjectId(category);
    if (brand && brand !== -1) query['payload.product.brand'] = new ObjectId(brand);
    if (Array.isArray(integrationCode) && integrationCode.length > 0) query.integrationCode = { $in: integrationCode };
    if (Array.isArray(statuses) && statuses.length > 0) query.status = { $in: statuses };
    if (mode) query.mode = mode;
    if (selectedChoices && Object.keys(selectedChoices).length > 0) {
        const choiceConditions: any[] = [];
        Object.entries(selectedChoices).forEach(([choiceId, choiceValueId]) => {
            if (choiceValueId) {
                choiceConditions.push({
                    'payload.choices': { $elemMatch: { choiceId: isNaN(Number(choiceId)) ? choiceId : Number(choiceId), choiceValueId } },
                });
            }
        });
        if (choiceConditions.length > 0) query.$and = query.$and ? [...query.$and, ...choiceConditions] : choiceConditions;
    }

    return searchExportJobs(deps, 'advancedSearchExportJobs', query, sortBy, sortOrder, page, limit, (job: any) => ({
        ...job,
        totalCount: 1,
        processedCount: isTerminal(job.status) ? 1 : 0,
        isProcessing: !isTerminal(job.status),
    }));
}

/** Dışa aktarım iş listesi (tek kanal, barkod, paket/grup kimliği). */
export async function getExportJobs(deps: JobDeps, body: any) {
    const { integrationCode, barcode, correlationId, sortBy = 'createdAt', sortOrder = 'desc', globalSearch, startDate, endDate } = body;
    const { page, limit } = normalizePagination(body, 13); // [C22/GV-01] bkz. advancedSearchExportJobs

    const query: any = { status: { $ne: 'ARCHIVED' } };
    if (integrationCode) query.integrationCode = integrationCode;
    if (barcode) query.barcode = barcode;
    // correlationId: Signal tablosundaki batchId veya groupId
    if (correlationId) query.$or = [{ batchId: correlationId }, { groupId: correlationId }];
    applyCreatedAtRange(query, startDate, endDate);
    if (globalSearch) query.$or = globalSearchOr(globalSearch);

    return searchExportJobs(deps, 'getExportJobs', query, sortBy, sortOrder, page, limit, (job: any) => ({
        ...job,
        isProcessing: !isTerminal(job.status),
    }));
}

/** İçe aktarım iş listesi (tenant kapsamlı; arşivlenmiş hariç). */
export async function getImportJobs(deps: JobDeps, body: any) {
    const { integrationCode, sortBy, sortOrder } = body;
    const { page, limit } = normalizePagination(body, 10); // [C22/GV-01]
    const skip = (page - 1) * limit;

    const query: any = { clientId: deps.clientId, status: { $ne: 'ARCHIVED' } };
    if (integrationCode) query.integrationCode = integrationCode;

    // [DB-02] sıralama alanı izin listesi; bilinmeyen alan => varsayılan (jobId azalan)
    const sortQuery: any = {};
    const pickedSort = pickSortField(sortBy, IMPORT_JOB_SORT_FIELDS, 'jobId');
    if (!pickedSort.usedFallback) sortQuery[pickedSort.field] = sortOrder === 'desc' ? -1 : 1;
    else sortQuery.jobId = -1;

    const { items, total } = await new ImportJobRepository(deps.applicationDB).list(query, sortQuery, skip, Number(limit));
    return { success: true, data: items, total, pagination: pagination(page, limit, total) };
}

/** jobId ile içe aktarım işi (QA-FAZ2 kritik-1 / BACKLOG C4 L-04 IDOR: clientId filtresi). */
export async function getImportJobByJobId(deps: JobDeps, request: any) {
    try {
        const { jobId } = request;
        if (!jobId) return { success: false, message: 'jobId parametresi eksik.' };
        const job = await new ImportJobRepository(deps.applicationDB).findByJobId(jobId, deps.clientId);
        if (!job) return { success: false, message: 'Belirtilen ID ile eşleşen bir işlem bulunamadı.' };
        return { success: true, data: job };
    } catch (error: any) {
        log.error('IMPORT_JOB_GET_FAILED', 'getJobByJobId Error:', { err: error });
        return { success: false, message: 'İşlem detayları getirilirken teknik bir hata oluştu.', error: error?.message };
    }
}

/** Yalnız COMPLETED/FAILED içe aktarım işleri arşivlenir (L-04 IDOR: clientId filtresi). */
export async function archiveImportJobs(deps: JobDeps, request: any) {
    try {
        const { ids } = request;
        if (!ids || !Array.isArray(ids) || ids.length === 0) return { success: false, message: 'Geçerli ID listesi gerekli.' };
        const result = await new ImportJobRepository(deps.applicationDB).archiveFinished(ids, deps.clientId);
        if (result.matchedCount === 0) return { success: false, message: 'Arşivlenebilir (tamamlanmış) kayıt bulunamadı.' };
        return { success: true, message: `${result.modifiedCount} kayıt başarıyla arşivlendi.`, modifiedCount: result.modifiedCount };
    } catch (error) {
        log.error('IMPORT_JOB_ARCHIVE_FAILED', 'archiveImportJobs Error:', { err: error });
        return { success: false, message: 'Arşivleme işlemi sırasında hata oluştu.' };
    }
}

export async function getJobReport(deps: JobDeps, jobId: any) {
    if (!jobId) return { success: false, message: 'JobId required' };
    const report = await new ImportStagingRepository(deps.clientDB).findReport(new ObjectId(jobId), deps.clientId);
    return { success: report ? true : false, data: report || null };
}

/**
 * Yeni ürün çekme isteği: devam eden iş varsa reddedilir; önceki staging verisi temizlenir (hata kritik değil, loglanır);
 * ApplicationDB'de WAITING_FOR_FETCH işi açılır. `created: true` ise çağıran orkestratörü uyandırır (motor olay yolu api katmanında).
 */
export async function requestFetchFromPlatform(deps: JobDeps, integrationCode: unknown): Promise<{ created: boolean; response: any }> {
    const jobs = new ImportJobRepository(deps.applicationDB);
    const activeJob = await jobs.findActive(deps.clientId, integrationCode);
    if (activeJob) {
        return {
            created: false,
            response: { success: false, message: `Bu platform için devam eden bir işlem var. (JobId: ${activeJob.jobId})`, jobId: activeJob.jobId },
        };
    }
    // Staging modelleri ClientDB'de: önceki işin ara verisi temizlenir
    try {
        if (deps.clientDB) await new ImportStagingRepository(deps.clientDB).clearForIntegration(integrationCode);
    } catch (cleanupErr: any) {
        log.error('IMPORT_STAGING_CLEANUP_FAILED', `[API] Cleanup Error for Client ${deps.clientId}:`, { err: cleanupErr, tenantId: Number(deps.clientId) });
    }
    const newJobId = new ObjectId();
    await jobs.create({
        _id: newJobId,
        jobId: newJobId.toString(),
        clientId: deps.clientId,
        integrationCode,
        status: 'WAITING_FOR_FETCH',
        totalCount: 0,
        processedCount: 0,
        failedCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    return {
        created: true,
        response: { success: true, message: 'Yeni ürün çekme isteği başarıyla oluşturuldu ve sıraya alındı.', jobId: newJobId.toString() },
    };
}

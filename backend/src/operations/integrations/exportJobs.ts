import { ObjectId } from 'mongodb';
import { containsRegex, normalizePagination } from '@utils/search';
import type { ExportJobRepository } from '@database/repositories/tenant/ExportJobRepository';
import type { IntegrationCatalogRepository } from '@database/repositories/app/IntegrationCatalogRepository';

/**
 * ADR-0024 D6 / MM-02 (P3-INT): dışa aktarma iş listesi. `advancedSearchExportJobs` ve `getExportJobs` aynı
 * `ExportJobRepository.search`'ü kullanır; yalnız filtre kurucuları ve yanıt zenginleştirmesi farklıdır.
 *
 * [DÜZELTME 2026-09-29, BACKLOG C22/GV-01] page/limit @utils/search.normalizePagination ile sınırlanır (limit üst sınırı 200 --
 * FE bu listede sabit 13 kullanıyor, frontend/src/components/logListView/ExportLogList.vue; page<1 -> 1). Eskiden ham istek
 * değeri doğrudan $skip/$limit'e gidiyordu -- aşırı büyük `limit` tam koleksiyon taraması/DoS riskiydi.
 */

/** DB/eşleme hatası: RPC yanıtına `{ success:false }` olarak döner; günlük kaydı çağıranın (RPC cephesi) `onError`'ında. */
export type ExportJobErrorSink = (err: any) => void;

const isProcessing = (status: any): boolean => !['COMPLETED', 'FAILED'].includes(status);

/** Gün sınırlı `createdAt` aralığı (sunucu yerel günü; eski davranış). */
function applyCreatedRange(query: any, startDate: any, endDate: any): void {
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

/** Hızlı/genel arama: barkod, paket, stok kodu (kaçışlı regex). */
const globalSearchOr = (globalSearch: any) => [
    { "barcode": containsRegex(globalSearch) }, // [GV-01]
    { "batchId": containsRegex(globalSearch) },
    { "payload.stockcode": containsRegex(globalSearch) }
];

function paginationOf(page: number, limit: number, total: number) {
    return {
        page: Number(page),
        limit: Number(limit),
        totalNumberOfRecords: total,
        totalNumberOfPages: Math.ceil(total / Number(limit))
    };
}

/** Gelişmiş arama (ürün alanları, kategori/marka, çoklu seçim, varyant seçenekleri). */
export async function advancedSearchExportJobs(repo: ExportJobRepository, body: any, onError: ExportJobErrorSink): Promise<any> {
    const {
        sortBy = 'createdAt', sortOrder = 'desc', globalSearch, title, barcode, stockcode, category, brand,
        integrationCode, mode, statuses, selectedChoices, startDate, endDate,
        batchId // Paket bazlı arama desteği
    } = body;
    const { page, limit } = normalizePagination(body, 13);
    const skip = (page - 1) * limit;

    const query: any = { status: { $ne: 'ARCHIVED' } };
    applyCreatedRange(query, startDate, endDate);
    if (globalSearch) query.$or = globalSearchOr(globalSearch);

    // --- Spesifik Filtreler ---
    if (title) query["payload.title"] = containsRegex(title); // [GV-01]
    if (barcode) query.barcode = containsRegex(barcode); // [GV-01]
    if (stockcode) query["payload.stockcode"] = containsRegex(stockcode); // [GV-01]
    if (batchId) query.batchId = batchId;

    // --- Kategori ve Marka (ObjectId Check) ---
    if (category && category !== -1) query["payload.product.category"] = new ObjectId(category);
    if (brand && brand !== -1) query["payload.product.brand"] = new ObjectId(brand);

    // --- Çoklu Seçim Filtreleri ---
    if (Array.isArray(integrationCode) && integrationCode.length > 0) query.integrationCode = { $in: integrationCode };
    if (Array.isArray(statuses) && statuses.length > 0) query.status = { $in: statuses };
    if (mode) query.mode = mode;

    // --- Varyant (Choices) Filtreleri ---
    if (selectedChoices && Object.keys(selectedChoices).length > 0) {
        const choiceConditions: any[] = [];
        Object.entries(selectedChoices).forEach(([choiceId, choiceValueId]) => {
            if (choiceValueId) {
                choiceConditions.push({
                    "payload.choices": {
                        $elemMatch: {
                            choiceId: isNaN(Number(choiceId)) ? choiceId : Number(choiceId),
                            choiceValueId: choiceValueId
                        }
                    }
                });
            }
        });
        if (choiceConditions.length > 0) {
            query.$and = query.$and ? [...query.$and, ...choiceConditions] : choiceConditions;
        }
    }

    try {
        const { items, total } = await repo.search(query, { [sortBy]: sortOrder === 'desc' ? -1 : 1 }, Number(skip), Number(limit));
        return {
            success: true,
            // UI'ın beklediği eşlemeler (kalem başına tek ürün)
            data: items.map((job: any) => ({
                ...job,
                totalCount: 1,
                processedCount: ['COMPLETED', 'FAILED'].includes(job.status) ? 1 : 0,
                isProcessing: isProcessing(job.status)
            })),
            pagination: paginationOf(page, limit, total)
        };
    } catch (err: any) {
        onError(err);
        return { success: false, message: err.message };
    }
}

/** Basit liste: entegrasyon/barkod tam eşleşme, `correlationId` = paket (batchId) veya grup (groupId). */
export async function listExportJobs(repo: ExportJobRepository, body: any, onError: ExportJobErrorSink): Promise<any> {
    const { integrationCode, barcode, correlationId, sortBy = 'createdAt', sortOrder = 'desc', globalSearch, startDate, endDate } = body;
    const { page, limit } = normalizePagination(body, 13);
    const skip = (page - 1) * limit;

    const query: any = { status: { $ne: 'ARCHIVED' } };
    if (integrationCode) query.integrationCode = integrationCode;
    if (barcode) query.barcode = barcode;
    if (correlationId) {
        query.$or = [
            { batchId: correlationId },
            { groupId: correlationId }
        ];
    }
    applyCreatedRange(query, startDate, endDate);
    // Performans uyarısı: regex büyük veride yavaştır (globalSearch correlationId $or'unu ezer — eski davranış)
    if (globalSearch) query.$or = globalSearchOr(globalSearch);

    try {
        const { items, total } = await repo.search(query, { [sortBy]: sortOrder === 'desc' ? -1 : 1 }, skip, Number(limit));
        return {
            success: true,
            // Loglar listede çekilmez (detayda); ilerleme çubuğu için ipucu
            data: items.map((job: any) => ({ ...job, isProcessing: isProcessing(job.status) })),
            pagination: paginationOf(page, limit, total)
        };
    } catch (err: any) {
        onError(err);
        return { success: false, message: err.message };
    }
}

/** Tekil dışa aktarma kalemi + zaman çizelgesi (loglar tarih sıralı) + bağlı sinyalin sonraki çalışma zamanı. */
export async function getExportJobDetail(repo: ExportJobRepository, catalog: IntegrationCatalogRepository, id: any, onError: ExportJobErrorSink): Promise<any> {
    if (!id) {
        return { success: false, message: "Geçerli bir işlem ID'si gerekli." };
    }
    try {
        const job: any = await repo.findById(id);
        if (!job) {
            return { success: false, message: "İşlem detayları bulunamadı." };
        }

        if (job.logs && Array.isArray(job.logs)) {
            job.logs.sort((a: any, b: any) =>
                new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            );
        }

        let nextRunAt = null;
        if (job.batchId) {
            const signal = await catalog.findSignalNextRun(job.batchId);
            nextRunAt = signal?.nextRunAt;
        }

        return {
            success: true,
            data: {
                ...job,
                nextRunAt,
                // UI'da hata mesajını belirginleştirmek için
                lastErrorMessage: job.status === 'FAILED'
                    ? (job.errorMessage || job.logs?.filter((l: any) => l.status === 'FAILED').pop()?.message)
                    : null,
                batchId: job.batchId || null
            }
        };
    } catch (err: any) {
        onError(err);
        return { success: false, message: "Sunucu hatası: " + err.message };
    }
}

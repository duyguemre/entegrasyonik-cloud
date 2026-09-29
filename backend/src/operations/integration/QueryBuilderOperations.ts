/**
 * QueryBuilderOperations: Veritabanı toplu güncelleme (Bulk Update) işlemlerinde 
 * kullanılan standart sorgu objelerini hazırlayan yardımcı sınıf.
 */
export class QueryBuilderOperations {

    /**
     * Variant tablosu için standart platform statü güncelleme objesi hazırlar.
     * @param barcode Varyant barkodu
     * @param integrationCode Entegrasyon kodu (trendyol, hb vb.)
     * @param mode İşlem modu (TRANSFER, UPDATE_PRICE vb.)
     * @param status Yeni statü (PENDING, SENT, COMPLETED, FAILED, WAITING)
     * @param options Ek seçenekler (mesaj, batchId, tarih)
     */
    public static prepareVariantPlatformUpdateOp(
        barcode: string,
        mapping: Record<string, any> | undefined,
        integrationCode: string,
        mode: string,
        status: string,
        options: {
            messages?: string | string[],
            batchProcessId?: string | null,
            updatedAt?: Date,
            matchKey?: string
        } = {}
    ) {
        const now = options.updatedAt || new Date();
        const path = `platforms.${integrationCode}.upload.${mode}`;
        const pathMapping = `platforms.${integrationCode}.mapping`;
        const matchKey = options.matchKey || 'barcode';

        // Mesajları her zaman string dizisi olarak saklayalım (Standartlaştırma)
        let finalMessages: string[] = [];
        if (options.messages) {
            finalMessages = Array.isArray(options.messages) ? options.messages : [options.messages];
        }

        const updateFields: any = {
            [`${path}.status`]: status,
            [`${path}.updatedAt`]: now,
            [`${path}.messages`]: finalMessages,
        };

        if (mapping) {
            updateFields[`${pathMapping}`] = mapping;
        }

        // Eğer bir takip numarası (batchId) varsa ekle (Publisher tarafında gerekebilir)
        if (options.batchProcessId !== undefined) {
            updateFields[`${path}.batchProcessId`] = options.batchProcessId;
        }

        return {
            updateOne: {
                filter: { [matchKey]: String(barcode) },
                update: { $set: updateFields }
            }
        };
    }

    /**
     * ADR-0004 Karar 6 (Aşama C) — `Variant.platforms.<code>.stockSync` onay alanlarını (`lastPublishedQty`/
     * `lastPublishedAt`/`lastBatchId`) yazar. YALNIZCA asenkron batch sonucu BAŞARILI dönünce (mevcut
     * Sentinel akışı, `finalizeTracking` COMPLETED) çağrılır -- ADR: "lastPublishedQty yalnızca ... başarılı
     * dönünce güncellenir". Yeni/ADDITIVE bir yardımcı; `prepareVariantPlatformUpdateOp` DEĞİŞTİRİLMEDİ.
     */
    public static prepareStockSyncConfirmationOp(
        matchValue: string,
        integrationCode: string,
        qty: number,
        options: { batchId?: string | null, updatedAt?: Date, matchKey?: string } = {}
    ) {
        const now = options.updatedAt || new Date();
        const matchKey = options.matchKey || 'barcode';
        const path = `platforms.${integrationCode}.stockSync`;

        return {
            updateOne: {
                filter: { [matchKey]: String(matchValue) },
                update: {
                    $set: {
                        [`${path}.lastPublishedQty`]: qty,
                        [`${path}.lastPublishedAt`]: now,
                        [`${path}.lastBatchId`]: options.batchId ?? null,
                    }
                }
            }
        };
    }

    /**
     * Staging (ExportStagedProduct) tablosu için standart güncelleme objesi hazırlar.
     * @param entryId Staging kaydı ID'si
     * @param workerName İşlemi yapan worker (Validator, Publisher vb.)
     * @param status Yeni statü
     * @param options Güncellenecek opsiyonel alanlar ve log mesajı
     */
    public static prepareStagingUpdateOp(
        entryId: any,
        workerName: string,
        status: string,
        options: {
            priorityScore?: number,
            errorMessage?: string | null,
            message?: string, // Loglara yazılacak açıklama
            payload?: any,    // Validator/Transform aşamasında kullanılır
            title?: string,
            price?: number,
            stock?: number,
            image?: string,
            trackingId?: string | null,
            nextRunAt?: Date | null,
            completedAt?: Date | null,
            updatedAt?: Date,
            errorType?: string, // Loglar için: TECHNICAL, BUSINESS vb.
            productId?: any,
            category?: string,
            brand?: string,
            choices?: any[],
            stockcode?: string,
        } = {}
    ) {
        const now = options.updatedAt || new Date();

        // 1. Temel $set alanları
        const setFields: any = {
            status: status,
            lockedBy: null, // İşlem gören her kaydın kilidi mutlaka açılır
            updatedAt: now
        };

        // Gönderilen tüm opsiyonel alanları setFields'a ekle
        const optionalFields = [
            'priorityScore', 'errorMessage', 'payload', 'productId',
            'trackingId', 'nextRunAt', 'completedAt', 'title',
            'price', 'stock', 'image', 'category', 'brand',
            'choices', 'stockcode'
        ];

        optionalFields.forEach(field => {
            if ((options as any)[field] !== undefined) {
                setFields[field] = (options as any)[field];
            }
        });

        // 2. Log objesi hazırlığı
        const logEntry: any = {
            status: status,
            worker: workerName,
            message: options.message || (status === 'FAILED' ? options.errorMessage : "İşlem güncellendi."),
            timestamp: now
        };

        if (options.errorType) logEntry.errorType = options.errorType;

        return {
            updateOne: {
                filter: { _id: entryId },
                update: {
                    $set: setFields,
                    $push: { logs: logEntry }
                }
            }
        };
    }
}
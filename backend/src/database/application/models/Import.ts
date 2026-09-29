import mongoose, { Document, Schema } from "mongoose";

export interface IImportJob extends Document {
    jobId: string;
    clientId: number;
    integrationCode: string;
    status: 'WAITING_FOR_FETCH' | 'FETCHING' | 'READY_TO_SYNC' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'ARCHIVED';
    matchKey: 'barcode' | 'stockcode';
    lastProcessedId?: mongoose.Types.ObjectId;

    lockedBy?: string | null;      // Eklenen: İşlenen pod adı
    lastCheckedAt?: Date;          // Eklenen: Son kontrol zamanı
    errorCount?: number;           // Eklenen: Hata sayacı

    // SAYAÇLAR: İlerleme takibi için
    totalCount: number;      // Ham çekilen ürün sayısı
    validCount: number;      // Aktarılabilir olanlar
    invalidCount: number;    // Eşleşme hatası olanlar
    duplicateCount: number;  // Sistemde zaten var olanlar
    processedCount: number;  // Importer tarafından bitirilenler (SUCCESS)
    failedCount: number;     // Importer sırasında hata alanlar

    error?: {
        message: string;
        stack?: string;
    };
    startedAt?: Date;
    completedAt?: Date;
    updatedAt: Date;
    archivedAt?: Date;
}

export const ImportJobSchema = new Schema<IImportJob>({
    jobId: { type: String, required: true, unique: true, index: true },
    clientId: { type: Number, required: true, index: true },
    integrationCode: { type: String, required: true, index: true },
    status: {
        type: String,
        // [ADR-0021 D4] ARCHIVED: archiveImportJobs yazıyordu ama enum'da yoktu (getImportJobs `$ne: 'ARCHIVED'` filtresi bu değere dayanır)
        enum: ['WAITING_FOR_FETCH', 'FETCHING', 'READY_TO_SYNC', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'ARCHIVED'],
        default: 'WAITING_FOR_FETCH',
        index: true
    },
    matchKey: { type: String, enum: ['barcode', 'stockcode'], default: 'barcode', index: true },
    lastProcessedId: { type: Schema.Types.ObjectId, required: false },

    // ORKESTRASYON ZIRHLARI
    lockedBy: { type: String, default: null, index: true },
    lastCheckedAt: { type: Date, default: Date.now, index: true },
    errorCount: { type: Number, default: 0 },


    // Sayaçlar
    totalCount: { type: Number, default: 0 },
    validCount: { type: Number, default: 0 },
    invalidCount: { type: Number, default: 0 },
    duplicateCount: { type: Number, default: 0 },
    processedCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },

    error: { message: String, stack: String },
    startedAt: Date,
    completedAt: Date,
    updatedAt: { type: Date, default: Date.now },
    // [ADR-0021 D4] Varsayılan YOK: yalnız arşivleme anında (archiveImportJobs $set) dolar. Eskiden `default: Date.now`
    // her işe oluşturulurken "arşiv tarihi" veriyordu. Mevcut belgelerdeki yanlış değerlerin temizliği DB göçüdür (D4b), kod işi değil.
    archivedAt: { type: Date }
}, {
    collection: 'ImportJobs',
    versionKey: false
});

ImportJobSchema.index({ status: 1, lockedBy: 1, updatedAt: 1 });

ImportJobSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});

import mongoose from "mongoose";

export interface IImportStagedProduct extends Document {
    clientId: number;
    jobId: mongoose.Types.ObjectId;
    integrationCode: string;
    maincode: string;
    barcode: string;
    stockcode: string;
    localCategoryId: string,
    rawData: any;
    importStatus: 'VALID' | 'INVALID' | 'DUPLICATE' | 'COMPLETED' | 'FAILED';
    skipReason?: string;
    createdAt: Date;
    updatedAt: Date;
}

export const ImportStagedProductSchema = new mongoose.Schema<IImportStagedProduct>({
    clientId: { type: Number, required: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    integrationCode: { type: String, required: true, index: true },
    maincode: { type: String, index: true },
    barcode: { type: String, index: true },
    stockcode: { type: String, index: true },
    localCategoryId: { type: String, index: true },
    rawData: { type: mongoose.Schema.Types.Mixed, required: true },
    importStatus: {
        type: String,
        enum: ['VALID', 'INVALID', 'DUPLICATE', 'COMPLETED', 'FAILED'],
        default: 'VALID',
        index: true
    },
    skipReason: { type: String, required: false }
}, {
    collection: 'ImportStagedProducts',
    versionKey: false,
    timestamps: true // createdAt ve updatedAt otomatik yönetilir
});

// Importer'ın kaldığı yerden devam etmesi ve toplu okuma için bileşik index
ImportStagedProductSchema.index({ jobId: 1, importStatus: 1, _id: 1 });
// 7 gün sonra otomatik temizlik (Opsiyonel: İşlem bitince manuel silmiyorsan kalsın)
ImportStagedProductSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });



export interface IImportStagedProductSummary extends Document {
    jobId: mongoose.Types.ObjectId;
    clientId: number;
    maincode: string;
    integrationCode: string;
    minSalePrice: number;
    maxSalePrice: number;
    minMarketPrice: number;
    totalStock: number;
    allImages: string[];
    updatedAt: Date;
}

export const ImportStagedProductSummarySchema = new mongoose.Schema<IImportStagedProductSummary>({
    jobId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    clientId: { type: Number, required: true },
    integrationCode: { type: String, required: true },
    maincode: { type: String, required: true },
    minSalePrice: { type: Number, default: 0 },
    maxSalePrice: { type: Number, default: 0 },
    minMarketPrice: { type: Number, default: 0 },
    totalStock: { type: Number, default: 0 },
    allImages: [{ type: String }]
}, {
    collection: 'ImportStagedProductSummaries',
    versionKey: false,
    timestamps: { createdAt: false, updatedAt: true }
});

ImportStagedProductSummarySchema.index({ jobId: 1, maincode: 1 }, { unique: true });
ImportStagedProductSummarySchema.index({ updatedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });



export interface IImportJobReport extends Document {
    jobId: mongoose.Types.ObjectId;
    clientId: number;
    integrationCode: string;
    missingCategories: string[];
    missingCategoryProductCounts: Array<{
        platformCategoryId: string;
        productCount: number;
    }>;
    missingAttributes: Array<{
        category: string;
        localCategoryId: string;
        attributeId: string;
        attributeName: string;
        attributeValue: string;
        attributeValueId: string;
    }>;
    duplicateBarcodes: string[];
}

export const ImportJobReportSchema = new mongoose.Schema<IImportJobReport>({
    jobId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true, index: true },
    clientId: { type: Number, required: true },
    integrationCode: { type: String, required: true },
    missingCategories: [{ type: String }],
    missingAttributes: [{
        _id: false,
        category: String,
        localCategoryId: String,
        attributeId: String,
        attributeName: String,
        attributeValue: String,
        attributeValueId: String
    }],
    missingCategoryProductCounts: [{
        _id: false,
        platformCategoryId: String,
        productCount: Number
    }],
    duplicateBarcodes: [{ type: String }]
}, {
    collection: 'ImportJobReports',
    versionKey: false,
    timestamps: { createdAt: false, updatedAt: true }
});

ImportJobReportSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });

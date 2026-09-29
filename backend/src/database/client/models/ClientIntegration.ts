import mongoose from "mongoose";

export const ClientIntegrationInfoSchema = new mongoose.Schema({
    code: { type: String, required: true }, // 'trendyol', 'hepsiburada' vb.
    order: { type: Number, required: true },
    settings: { type: Object, default: {} },
    status: { type: Boolean, default: true },

    // Map yerine düz obje: Çünkü her obje zaten tek bir pazaryerini temsil ediyor.
    syncMetadata: {
        lastStatusCheck: { type: Date, default: new Date(0) },
        lastOrderSync: { type: Date, default: new Date(0) }
    }
}, { _id: false });


export const ClientIntegrationSchema = new mongoose.Schema({
    marketplace: { type: [ClientIntegrationInfoSchema], required: true },
    shipment: { type: [ClientIntegrationInfoSchema], required: true },
    ecommerce: { type: [ClientIntegrationInfoSchema], required: true },
    erp: { type: [ClientIntegrationInfoSchema], required: true },
    einvoice: { type: [ClientIntegrationInfoSchema], required: true },
    // ADR-0004 Karar 1/5 (zero-oversell) — TENANT düzeyi (kanal başına DEĞİL, bu koleksiyon tenant başına
    // tek doküman — bkz. getClientIntegrationModel().findOne({})). SKU ≥2 satış kanalında listeliyse
    // birincil olmayan kanallara varsayılan bufferUnits=1 uygulanır (son adet birincil kanalda satılır).
    // Kanal BAŞINA tampon/telafi ayarı ise `marketplace[].settings.stockPolicy: { bufferUnits, bufferPercent,
    // autoCancelOversold, graceMinutes }` altında durur (mevcut `settings: Object` alanı — Mixed/strict:false
    // olduğundan yeni bir yapı icat edilmedi, migration GEREKMEZ).
    stockPolicy: {
        type: {
            primaryChannel: { type: String, required: false }
        },
        required: false,
        default: {}
    },
}, {
    collection: 'ClientIntegrations',
    strict: false
});

// Wildcard ($**) yerine Multikey Index kullanımı
ClientIntegrationSchema.index({ "marketplace.code": 1, "marketplace.syncMetadata.lastStatusCheck": 1 });
ClientIntegrationSchema.index({ "marketplace.code": 1, "marketplace.syncMetadata.lastOrderSync": 1 });

ClientIntegrationSchema.index({ "ecommerce.code": 1, "ecommerce.syncMetadata.lastStatusCheck": 1 });
ClientIntegrationSchema.index({ "ecommerce.code": 1, "ecommerce.syncMetadata.lastOrderSync": 1 });

ClientIntegrationSchema.index({ "erp.code": 1, "erp.syncMetadata.lastStatusCheck": 1 });
ClientIntegrationSchema.index({ "erp.code": 1, "erp.syncMetadata.lastOrderSync": 1 });

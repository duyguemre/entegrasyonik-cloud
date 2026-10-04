import mongoose from "mongoose";

// ADR-0003 B.8 (adım 5): erişim anahtarları (accessKeyId/secretAccessKey) ARTIK tenant kaydında tutulmaz; getStorageConfig env'den okur.
// Alanlar şemada yalnızca GÖÇ ÖNCESİ kayıtlar okunabilsin diye (isteğe bağlı) duruyor; yeni kod onları YOK SAYAR.
// Silme göçü: backend/dev-tools/migrate-tenant-infra-to-env.js
const StorageConfigSchema = new mongoose.Schema({
    code: { type: String, required: false },
    accessKeyId: { type: String, required: false },
    // Güvenlik: select: false ile default find() sorgularında gelmez
    secretAccessKey: { type: String, required: false, select: false },
    bucketName: { type: String, required: false },
    endpoint: { type: String, required: false },
    publicUrl: { type: String },
    region: { type: String, default: 'auto' },
    isActive: { type: Boolean, default: true },
    updatedAt: { type: Date, default: Date.now }
}, { _id: false }); // Alt dokümanlar için ekstra ID oluşturmasın


export const ClientSchema = new mongoose.Schema({
    name: { type: String, required: false },
    // ADR-0003 B.6 (adım 5): YALNIZCA dbname + poolsize. Bağlantı bilgisi (url/user/password) env'den (DB_URL/DB_USER/DB_PASSWORD);
    // göç öncesi kayıtlarda kalan url/user/password alanları yok sayılır ve migrate-tenant-infra-to-env.js ile silinir.
    dbConfig: {
        type: {
            dbname: { type: String, required: true },
            poolsize: { type: Number, required: true }
        }, required: true
    },
    order: { type: Number, required: true },
    title: { type: String, required: true },
    status: { type: String, required: true },
    lastSuccessfulOrderSync: { type: Date, required: false },
    clientId: { type: Number, required: true },
    mainCategory: {
        parentId: { type: Number, required: false },
        title: { type: String, required: false },
        isMain: { type: Boolean, required: false },
        icon: { type: String, required: false },
        order: { type: Number, required: false }
    },
    mainBrand: {
        title: { type: String, required: false },
        isMain: { type: Boolean, required: false }
    },
    integrations: { type: Object, required: false },

    // Storage Alanları (eski kayıtlar; yeni tenant'a yazılmaz — depolama yapılandırması env'den: ClientOperations.getStorageConfig)
    archive: { type: StorageConfigSchema, required: false },
    image: { type: StorageConfigSchema, required: false }

}, {
    collection: 'Clients',
    strict: false
});

// ADR-0003 A.2: tenant kimliği/veritabanı benzersizliği — eşzamanlı iki kaydın aynı tenant DB'sine düşmesinin İKİNCİ savunma hattı
// (birincil: TenantProvisioningService'in Counters ile atomik numarası). Ön kontrol (backend/dev-tools/precheck-tenant-duplicates.js)
// TEMİZ olmadan hedef DB'de çalıştırılmamalıdır: mükerrer varken bu indekslerin autoIndex ile kurulması başarısız olur.
// Canlıda indeks oluşumu insan onayı gerektirir (ADR-0003 Durum, Protokol 12): deploy öncesi ön kontrol çalıştırılır.
ClientSchema.index({ order: 1 }, { unique: true, name: 'uniq_order' });
ClientSchema.index({ clientId: 1 }, { unique: true, name: 'uniq_clientId' });
// PURGED mezar taşı kayıtlarında dbConfig olmayabilir: kısmi indeks yalnızca dbname'i string olan kayıtları kapsar
ClientSchema.index({ 'dbConfig.dbname': 1 }, { unique: true, name: 'uniq_dbConfig_dbname', partialFilterExpression: { 'dbConfig.dbname': { $type: 'string' } } });
// [eslesme-fiyat WP7b, F-11] Webhook alıcısı belirteçle tenant arar (`Clients.findOne({'integrations.webhookToken': …})`): çok-anahtarlı (dizi),
// seyrek (belirteci olmayan entegrasyon/tenant girmez). Kuruluş: göç 0032 (yalnız yazıldı; Protokol 12 insan onayı).
ClientSchema.index({ 'integrations.webhookToken': 1 }, { name: 'integrations_webhookToken', sparse: true });

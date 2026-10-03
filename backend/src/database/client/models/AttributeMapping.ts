import mongoose from "mongoose";


export const AttributeMappingSchema = new mongoose.Schema({
    integrationCode: { type: String, required: true },
    localCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Categories', required: true, index: true },
    platformCategoryId: { type: String, required: true },

    // Nitelik bazlı kayıtlar için bu alanlar dolu olacak, 
    // Kategori bazlı "ana kayıt" için null kalacak.
    platformAttributeId: { type: String, default: null },
    platformAttributeName: { type: String },

    // Senin sistemindeki karşılığı (Kategori kaydı için gerek yok)
    localChoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Choices', default: null },

    isVarianter: { type: Boolean, default: false },
    isSlicer: { type: Boolean, default: false },
    isRequired: { type: Boolean, default: false },

    // Bu kaydın bir "Kategori Eşlemesi" mi yoksa "Nitelik Eşlemesi" mi olduğunu ayırmak için
    isCategoryMapping: { type: Boolean, default: false },

    values: [{
        localValueId: { type: mongoose.Schema.Types.ObjectId, required: true },
        platformValueId: { type: String },
        platformValueName: { type: String, required: true }
    }],
    updatedAt: { type: Date, default: Date.now },

    // [eslesme-fiyat WP2, Ek A (B)/P2-15] Eskiden zod kabul edip servis atıyordu; artık saklanır. Göç gerekmez (eski kayıtta yok = varsayılan).
    allowCustom: { type: Boolean },
    isMultiple: { type: Boolean },
    /** Son yazan kullanıcı (Users._id) ya da 'autoMatch'; eski kayıtlarda yok. */
    updatedBy: { type: String, default: null },
    /** 'manual' (ekran) | 'auto' (autoMatch). */
    source: { type: String },
    /** Platform kataloğu yenilemesinde eşlenen kategori/özellik/değer platformda bulunamadıysa true (catalog.mappingStaleness). */
    stale: { type: Boolean, default: false }
}, {
    collection: 'AttributeMappings',
    strict: false
});

// Aynı kategori ve aynı entegrasyon içinde aynı nitelikten iki tane olamaz
AttributeMappingSchema.index({ localCategoryId: 1, integrationCode: 1, platformAttributeId: 1 }, { unique: true });
// [eslesme-fiyat WP2, Ek A P2-13] (entegrasyon, platform kategorisi) sorguları (resolveLocalCategoryId, Stager kategori haritası, bayatlık işi)
// için; uygulama: migrations/0026-attribute-mappings-indexes-tenant.js (yalnız yazıldı, ÇALIŞTIRILMADI).
AttributeMappingSchema.index({ integrationCode: 1, platformCategoryId: 1 }, { name: 'integration_platformCategory' });


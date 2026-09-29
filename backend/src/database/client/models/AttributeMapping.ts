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
    updatedAt: { type: Date, default: Date.now }
}, {
    collection: 'AttributeMappings',
    strict: false
});

// Aynı kategori ve aynı entegrasyon içinde aynı nitelikten iki tane olamaz
AttributeMappingSchema.index({ localCategoryId: 1, integrationCode: 1, platformAttributeId: 1 }, { unique: true });


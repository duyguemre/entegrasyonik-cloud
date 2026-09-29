import mongoose from "mongoose";

export const CategorySchema = new mongoose.Schema({
    parentId: { type: mongoose.Schema.Types.Mixed, required: false, ref: 'Categories' },
    title: { type: String, required: true },
    icon: { type: String, required: true },
    order: { type: Number, required: true },
    isMain: { type: Boolean, required: false },
}, {
    collection: 'Categories',
    strict: false
});

// [ADR-0021 D6] Kaldırıldı: `pre('deleteOne', {document:true, query:false})` kancası (a) yalnız `doc.deleteOne()` için
// tetiklenirdi — servis `Model.deleteOne(sorgu)` kullandığından HİÇ çalışmadı; (b) çalışsaydı `mongoose.model('category')`
// varsayılan bağlantıda model bulamayıp MissingSchemaError verirdi (modeller tenant bağlantısına kayıtlı).
// Alt kategori kaskadı gerekiyorsa servis katmanında açıkça yapılır (DATA_MODEL_CONVENTIONS §6; BACKLOG adayı).


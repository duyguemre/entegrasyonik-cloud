import mongoose from "mongoose";

export const ImageSchema = new mongoose.Schema({
    _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
    order: { type: Number, required: true, default: 0 },
    originalname: { type: String, required: true },
    isTempImage: { type: Boolean, required: true, default: false },
    width: { type: Number, required: true, default: 0 },
    height: { type: Number, required: true, default: 0 },
    size: { type: Number, required: false, default: 0 },
    extension: { type: String, required: true },
    url: { type: String, required: false }
}, {
    collection: 'Images',
    strict: false
});

// [ADR-0021 D6] Kaldırıldı: `pre('deleteMany')` kancası varsayılan bağlantıdan `mongoose.model('product'|'variant')`
// çağırıyordu (modeller tenant bağlantısında → MissingSchemaError) ve `filter._id.$in` yoksa TypeError verirdi;
// kod tabanında Image modeline `deleteMany` çağıran de yoktu (ölü kod). Görsel referans temizliği gerekirse servis katmanında yapılır.


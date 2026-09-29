import mongoose from "mongoose";
import { ImageSchema } from "./Image";

export const ProductSchema = new mongoose.Schema({
    tempId: { type: String, required: false },
    code: { type: String, required: false },
    maincode: { type: String, required: true, unique: true },
    platforms: { type: Object, required: false, default: {} },
    title: { type: String, required: true, index: true },
    category: { type: mongoose.Schema.Types.ObjectId, required: false, ref: 'Categories', index: true },
    brand: { type: mongoose.Schema.Types.ObjectId, required: false, ref: 'Brands', index: true },
    desi: { type: Number, required: false, default: 0 },
    stock: { type: Number, required: true, default: 0, index: true },
    stockcode: { type: String, required: false, index: true },
    barcode: { type: String, required: false, index: true },
    prepDuration: { type: Number, required: false, default: 0 },
    shelf: { type: String, required: false, default: '-' },
    warrantyDuration: { type: Number, required: false, default: 0 },
    description: { type: String, required: false },
    taxPercentage: { type: Number, required: false, default: 0 },
    prices: {
        type: {
            minSalePrice: { type: Number, required: true, default: 0 },
            maxSalePrice: { type: Number, required: true, default: 0 }
        }, required: true
    },
    images: [ImageSchema],
    /*     variants: [variantSchema], */
    transferFromPlatformId: { type: mongoose.Schema.Types.ObjectId, required: false },

}, {
    collection: 'Products',
    strict: false
});


// [ADR-0021 D6] Kaldırıldı: `pre('deleteOne', {document:true, query:false})` görsel kaskadı — `deleteProduct` `Model.deleteOne`
// kullandığından hiç çalışmadı ve varsayılan bağlantıda `mongoose.model('image')` MissingSchemaError verirdi.
// Not (bulgu): ürün silinince `Images` belgeleri/nesne depolaması dosyaları bugün de temizlenmiyor; gerekirse servis katmanında açıkça yapılır.


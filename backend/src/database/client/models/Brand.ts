import mongoose from "mongoose";

export const BrandSchema = new mongoose.Schema({
    parentId: { type: Number, required: false },
    title: { type: String, required: true },
    isMain: { type: Boolean, required: false },
    platforms: { type: Object, required: false },
}, {
    collection: 'Brands',
    strict: false
});


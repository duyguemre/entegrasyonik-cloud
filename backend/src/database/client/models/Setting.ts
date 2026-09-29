import mongoose from "mongoose";

export const SettingSchema = new mongoose.Schema({
    _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
    desi: { type: Number, required: false },
    maxPurchaseQuantity: { type: Number, required: false },
    shipingDuration: { type: Number, required: false },
    storeName: { type: String, required: false },
    taxPercentage: { type: Number, required: false },
    shipmentAddressId: { type: String, required: false },
    returningAddressId: { type: String, required: false },
    warranty: { type: Number, required: false },
    logo: { type: String, required: false },
    brandColor: { type: String, required: false },
    alertEmail: { type: String, required: false },
    supportPhone: { type: String, required: false },
    timezone: { type: String, required: false },
    workingDays: [{ type: Number, required: false }],
    mersisNo: { type: String, required: false },
    ticaretSicilNo: { type: String, required: false }
}, {
    collection: 'Settings',
    strict: false
});
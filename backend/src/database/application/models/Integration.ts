import mongoose from "mongoose";

export const IntegrationSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    type: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'integration_type' },
    color: { type: String, required: true },
    urls: { type: Object, required: true },
    logo: { type: String, required: true },
    width: { type: Number, required: true, default: 0 },
    settings: { type: Object, required: true, default: 0 },
    profitRate: { type: Number, required: false, default: 0 },
    commissin: { type: Number, required: false, default: 0 },
}, {
    collection: 'Integrations',
    strict: false
});


export const IntegrationTypeSchema = new mongoose.Schema({
    code: { type: String, required: true },
}, {
    collection: 'IntegrationTypes',
    strict: false
});


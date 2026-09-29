import mongoose from "mongoose";

// ADR-0016 §2.1 (Alternatif B3): "JobLeases koleksiyonunda iş adı başına tek doküman tutulur. owner = podId:runId,
// expiresAt = now + maxDurationMs. Başka pod tutuyorsa tur skipped:leased_elsewhere olur." Desen `@utils/mongoLease`
// ile AYNIDIR (ExportFlag.leaseOwner/leaseUntil emsali, C23 düzeltmesi dahil -- bkz. o dosyanın JSDoc'u);
// yalnız iş adı anahtarlıdır. Doküman `platform/runtime/scheduler/leaseGate.ts` tarafından ilk kullanımda
// (`upsert`) yaratılır -- burada statik seed YOK.
export const JobLeaseSchema = new mongoose.Schema({
    name:       { type: String, required: true, unique: true },
    leaseOwner: { type: String, default: null },
    leaseUntil: { type: Date, default: null },
}, {
    collection: 'JobLeases',
    versionKey: false,
    timestamps: true,
});

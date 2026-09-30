import { Schema } from "mongoose";

/**
 * [ADR-0030 X3] Dış etkili yazma RPC'leri için `Idempotency-Key` kaydı (tenant DB; tenant kapsamı DB'nin kendisidir).
 * Kısa ömürlü: `expAt` TTL (expireAfterSeconds:0), kayıt 24 sa sonra silinir. Yanıt önbelleği ≤64 KB (üstü kaydedilmez).
 * `autoIndex:false` — indeksler YALNIZ göçle (`migrations/0006-idempotency-keys-tenant.js`, çalıştırılmadı) kurulur.
 */
export const IdempotencyKeySchema = new Schema({
    userId: { type: String, required: true },
    operation: { type: String, required: true },   // "Service/operation"
    key: { type: String, required: true },
    bodyHash: { type: String, required: true },    // sha256(kararlı JSON)
    state: { type: String, enum: ['in_progress', 'done'], required: true },
    startedAt: { type: Date, required: true },
    statusCode: { type: Number },
    response: { type: Schema.Types.Mixed },
    expAt: { type: Date, required: true },
}, { collection: 'IdempotencyKeys', versionKey: false, autoIndex: false });

IdempotencyKeySchema.index({ userId: 1, operation: 1, key: 1 }, { unique: true, name: 'userId_1_operation_1_key_1' });
IdempotencyKeySchema.index({ expAt: 1 }, { expireAfterSeconds: 0, name: 'expAt_1' });

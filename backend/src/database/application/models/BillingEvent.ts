import mongoose from "mongoose";

// ADR-0008 §2/§4: sağlayıcı webhook olaylarının idempotent kaydı. `providerEventId` unique indeksi TEK
// idempotency mekanizmasıdır -- aynı olay iki kez işlenmeye çalışılırsa ikinci yazma bu indekste çakışır
// (BillingWebhookApiManager bunu 'ignored' 200 olarak ele alır). Fatura dışa aktarımının (ADR §5 Aşama 1) da kaynağıdır.

export const BILLING_EVENT_STATUSES = ['processed', 'ignored', 'failed'] as const;
export type BillingEventStatus = typeof BILLING_EVENT_STATUSES[number];

export const BillingEventSchema = new mongoose.Schema({
    provider: { type: String, required: true },          // 'mock' | 'iyzico' | ...
    providerEventId: { type: String, required: true },    // sağlayıcının olay kimliği
    type: { type: String, required: true },                // ör. 'payment.succeeded', 'payment.failed'
    clientId: { type: Number, required: false },           // çözülebiliyorsa (providerSubscriptionRef -> Subscriptions.clientId)
    receivedAt: { type: Date, required: true, default: Date.now },
    processedAt: { type: Date, required: false },
    status: { type: String, enum: BILLING_EVENT_STATUSES, required: true, default: 'processed' },
    // PII/kart alanları ÇIKARILMIŞ küçük bir alt küme (AuditLogger.sanitizeMeta ile aynı ilke) -- ham sağlayıcı
    // gövdesi ASLA olduğu gibi saklanmaz.
    payloadRedacted: { type: mongoose.Schema.Types.Mixed, required: false },
    failureReason: { type: String, required: false },
}, {
    collection: 'BillingEvents',
    versionKey: false,
});

// ADR §2: "providerEventId (unique indeks -> idempotency)". Aynı sağlayıcı içinde olay kimliği zaten tekildir;
// provider'ı da anahtara katmak farklı sağlayıcıların (mock/iyzico) olay kimlik uzaylarının çakışma ihtimaline karşı savunmacıdır.
BillingEventSchema.index({ provider: 1, providerEventId: 1 }, { unique: true, name: 'uniq_provider_eventId' });
BillingEventSchema.index({ clientId: 1, receivedAt: -1 }, { name: 'clientId_receivedAt' });
BillingEventSchema.index({ status: 1 }, { name: 'status' });

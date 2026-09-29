import mongoose from "mongoose";

// ADR-0008 §2/§3: abonelik durumu ve tenant erişimini tanımlayan kayıt. ApplicationDB'de (tenant DB'de DEĞİL) --
// askı kararı tenant DB'si açılmadan verilebilsin diye. Bir tenant = bir abonelik (clientId unique).

export const SUBSCRIPTION_STATUSES = ['trialing', 'active', 'past_due', 'suspended', 'canceled', 'expired'] as const;
export type SubscriptionStatus = typeof SUBSCRIPTION_STATUSES[number];

const LimitOverridesSchema = new mongoose.Schema({
    channels: { type: Number, required: false },
    skus: { type: Number, required: false },
    users: { type: Number, required: false },
    mcpCallsPerDay: { type: Number, required: false },
    features: { type: [String], required: false }, // Kurumsal: plan feature listesinin üzerine ek/yerine geçen liste
}, { _id: false });

export const SubscriptionSchema = new mongoose.Schema({
    // ApplicationDB.Clients.clientId (ADR-0008 kapsamında tenant kimliği bu alandan türetilir; Clients.order DEĞİL --
    // clientId, Client.ts modelindeki tenant iş kimliğidir; webhook/entitlement sorguları hep bununla eşleşir).
    clientId: { type: Number, required: true },
    planCode: { type: String, required: true },
    planVersion: { type: Number, required: true, default: 1 },
    status: { type: String, enum: SUBSCRIPTION_STATUSES, required: true, default: 'trialing' },
    trialEndsAt: { type: Date, required: false },
    currentPeriodStart: { type: Date, required: false },
    currentPeriodEnd: { type: Date, required: false },
    cancelAtPeriodEnd: { type: Boolean, required: true, default: false },
    // past_due -> suspended geçişi için üst sınır (ADR §3: "grace 7 gün"); bu tarihten sonra suspended'a geçmemiş
    // kayıtlar EntitlementService tarafından savunmacı biçimde suspended MUAMELESİ görür (arka plan job'u henüz
    // çalışmamış olsa bile) -- ayrıntı: EntitlementService.ts.
    graceUntil: { type: Date, required: false },
    provider: { type: String, required: true },              // 'mock' | 'iyzico' | ...
    providerCustomerRef: { type: String, required: false },
    providerSubscriptionRef: { type: String, required: false },
    limitOverrides: { type: LimitOverridesSchema, required: false },
    // Mevcut/legacy tenant'lar (migration ile atanır -- BU GÖREVİN KAPSAMINDA DEĞİL): billing state machine'i
    // tarafından KISITLANMAZ; EntitlementService billingExempt:true'yu her zaman tam erişim olarak değerlendirir.
    billingExempt: { type: Boolean, required: true, default: false },
    termsVersion: { type: String, required: false },
    termsAcceptedAt: { type: Date, required: false },
    // Kart verisi TUTULMAZ -- sağlayıcının döndürdüğü maskeli görüntüleme alanları
    cardLast4: { type: String, required: false },
    cardBrand: { type: String, required: false },
}, {
    collection: 'Subscriptions',
    timestamps: true, // updatedAt (ADR §2) + createdAt
});

// ADR §2: "bir tenant = bir abonelik"
SubscriptionSchema.index({ clientId: 1 }, { unique: true, name: 'uniq_clientId' });
// Günlük mutabakat işi (ADR §4) ve webhook işleme: sağlayıcı + sağlayıcı referansıyla arama
SubscriptionSchema.index({ provider: 1, providerSubscriptionRef: 1 }, { name: 'provider_ref' });
SubscriptionSchema.index({ status: 1 }, { name: 'status' });

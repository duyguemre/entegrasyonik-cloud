// ADR-0008 §1: sağlayıcıdan bağımsız ödeme portu. İsimler builder'a bırakılmıştı; burada seçilen isimlendirme
// tutarlı biçimde kullanılır (MockPaymentProvider ve gelecekteki IyzicoAdapter AYNI arayüzü uygular).
//
// Kapsam notu (Aşama A): yalnızca port + MockPaymentProvider. `iyzico` adaptörü AYRI bir görevdir (ADR §1,
// "Etki Alanı"); `PaymentProviderFactory.ts` bu tip için şimdilik fail-fast bir hata fırlatır.

import type { SubscriptionStatus } from '@database/application/models/Subscription';

export type BillingInterval = 'month' | 'year';

export interface CreateCheckoutResult {
    /** Sağlayıcının hosted checkout sayfası (tarayıcıda açılır). İkisinden en az biri dolu olmalıdır. */
    checkoutUrl?: string;
    /** Bazı sağlayıcılar (iyzico dahil) yönlendirme yerine bir form/oturum belirteci döner; FE bunu gömer. */
    formToken?: string;
    /** Sağlayıcı tarafındaki abonelik/oturum referansı -- sonraki getSubscription/cancel/changePlan çağrılarının anahtarı. */
    providerRef: string;
}

/**
 * Sağlayıcıdaki GERÇEK/güncel abonelik durumu (ADR §4: "doğruluk kaynağı sağlayıcıdır" -- webhook payload'ına
 * tek başına güvenilmez, bu tip webhook sonrası yeniden çekilerek Subscriptions'a yazılır).
 */
export interface NormalizedSubscription {
    providerSubscriptionRef: string;
    providerCustomerRef?: string;
    planCode: string;
    status: SubscriptionStatus;
    currentPeriodStart?: Date;
    currentPeriodEnd?: Date;
    cancelAtPeriodEnd?: boolean;
    /** Kart verisi TAŞINMAZ -- sağlayıcının döndürdüğü maskeli görüntüleme alanları. */
    cardLast4?: string;
    cardBrand?: string;
}

/** Ham webhook gövdesinden ayrıştırılmış, normalize edilmiş olay. İmza geçersizse üretici fonksiyon HATA fırlatır. */
export interface NormalizedBillingEvent {
    /** Sağlayıcının olay kimliği -- BillingEvents.providerEventId idempotency anahtarı budur. */
    providerEventId: string;
    /** Sağlayıcıya özgü olay türü (ör. 'payment.succeeded', 'payment.failed', 'subscription.canceled'). */
    type: string;
    providerSubscriptionRef?: string;
    providerCustomerRef?: string;
    occurredAt: Date;
    /** PII/kart alanları çıkarılmış küçük bir alt küme -- BillingEvents.payloadRedacted için. Ham gövde DEĞİL. */
    raw?: Record<string, unknown>;
}

/** Header adları büyük/küçük harf duyarsız gelebilir (Express `req.headers` zaten küçük harfe normalize eder). */
export type WebhookHeaders = Record<string, string | string[] | undefined>;

export interface PaymentProvider {
    readonly name: string;

    createCheckout(tenantId: number, planCode: string, billingInterval: BillingInterval): Promise<CreateCheckoutResult>;

    getSubscription(providerSubscriptionRef: string): Promise<NormalizedSubscription>;

    cancel(providerSubscriptionRef: string, atPeriodEnd: boolean): Promise<NormalizedSubscription>;

    changePlan(providerSubscriptionRef: string, planCode: string): Promise<NormalizedSubscription>;

    /** İmza geçersizse HATA fırlatır (ADR §1). Çağıran (BillingWebhookApiManager) bunu 401'e çevirir. */
    verifyAndParseWebhook(rawBody: Buffer, headers: WebhookHeaders): Promise<NormalizedBillingEvent>;
}

export class PaymentProviderError extends Error {
    constructor(message: string, public readonly code: 'invalid_signature' | 'not_found' | 'not_implemented') {
        super(message);
        this.name = this.constructor.name;
    }
}

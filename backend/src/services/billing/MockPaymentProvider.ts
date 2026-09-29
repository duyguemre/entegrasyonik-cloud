import crypto from 'crypto';
import type {
    BillingInterval,
    CreateCheckoutResult,
    NormalizedBillingEvent,
    NormalizedSubscription,
    PaymentProvider,
    WebhookHeaders,
} from './PaymentProvider';
import { PaymentProviderError } from './PaymentProvider';
import type { SubscriptionStatus } from '@database/application/models/Subscription';
import { getMockHmacSecret } from './mockSecret';
import { isMockCheckoutEnabled, mintCheckoutToken } from './mockCheckoutToken';

// ADR-0008 §1: "MockPaymentProvider: backend içinde basit bir 'hosted checkout' sayfası + deterministik test
// kartları: başarılı, reddedildi, 3DS başarısız, ilk ödeme başarılı/yenileme başarısız (dunning), kurtarma
// (sonraki denemede başarı). [...] gerçek webhook yoluyla aynı imza doğrulama kodundan geçer (mock HMAC sırrı
// .env'de)."
//
// Tasarım kararı: gerçek bir HTML "hosted checkout" sayfası BU AŞAMADA yazılmadı (görev talimatı: "gerçek HTML
// sayfası GEREKMİYOR, API seviyesinde mock yeterli"). `createCheckout` API seviyesinde bir oturum/form token'ı
// döner; ödeme SONUCU (başarılı/reddedildi/3DS/dunning/kurtarma) gerçek sağlayıcılarla TUTARLI biçimde checkout
// anında DEĞİL, ASENKRON bir webhook olayıyla bildirilir -- bu yüzden deterministik senaryolar `simulateEvent`
// ile tetiklenir (görev talimatındaki "dev tetikleyicisi"; NODE_ENV!==production kontrolü BillingWebhookApiManager/
// çağıran admin ucunda uygulanmalıdır -- bu sınıf kendisi NODE_ENV kontrolü yapmaz, saf bir simülatördür).
//
// `simulateEvent` HEM sağlayıcının kendi (mock) iç durumunu günceller HEM DE gerçek webhook gövdesi/imzasıyla
// AYNI ŞEMADA bir rawBody+headers üretir -- böylece BillingWebhookApiManager, mock senaryosunu GERÇEK webhook
// akışıyla (verifyAndParseWebhook -> idempotency -> getSubscription ile kanonik durumu yeniden çekme) BİREBİR
// aynı kod yolundan işler (ADR'nin "aynı imza doğrulama kodundan geçer" ilkesi).

export const MOCK_TEST_CARDS = {
    SUCCESS: 'card_success',
    DECLINED: 'card_declined',
    THREE_DS_FAILED: 'card_3ds_fail',
    RENEWAL_FAILS: 'card_renewal_fails',
    RECOVERY: 'card_recovery',
} as const;
export type MockTestCard = typeof MOCK_TEST_CARDS[keyof typeof MOCK_TEST_CARDS];

const MOCK_SIGNATURE_HEADER = 'x-mock-signature';

function signPayload(rawBody: Buffer): string {
    return crypto.createHmac('sha256', getMockHmacSecret()).update(rawBody).digest('hex');
}

function genRef(prefix: string, seed: string | number): string {
    return `${prefix}_${seed}_${crypto.randomBytes(6).toString('hex')}`;
}

function addInterval(date: Date, interval: BillingInterval): Date {
    const d = new Date(date.getTime());
    if (interval === 'year') d.setUTCFullYear(d.getUTCFullYear() + 1);
    else d.setUTCMonth(d.getUTCMonth() + 1);
    return d;
}

/**
 * ADR-0014 S4a: mock hosted checkout sayfası (`MockCheckoutApiManager`) etkinse, URL backend'in KENDİ sayfasına işaret eder
 * ve İMZALI + TEK KULLANIMLIK + süreli bir token taşır (`mockCheckoutToken.ts`). Sayfa kapalıysa (production / PAYMENT_ENV=live /
 * PAYMENT_PROVIDER!=mock) eski, çözümlenemeyen `.local` yer tutucu URL döner ve sır GEREKMEZ.
 * Taban adres `MOCK_CHECKOUT_BASE_URL` (varsayılan: http://localhost:<SERVER_PORT|5001>); yalnızca http(s) kabul edilir.
 */
function buildMockCheckoutUrl(providerSubscriptionRef: string): string {
    if (!isMockCheckoutEnabled()) return `https://mock-payments.entegrasyonik.local/checkout/${providerSubscriptionRef}`;
    const raw = (process.env.MOCK_CHECKOUT_BASE_URL || `http://localhost:${Number(process.env.SERVER_PORT) || 5001}`).replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(raw)) throw new Error('[MockPaymentProvider] MOCK_CHECKOUT_BASE_URL http(s) olmalı.');
    let token: string;
    try {
        token = mintCheckoutToken(providerSubscriptionRef);
    } catch (e: any) {
        // Sır yoksa (yanlış yapılandırma) createCheckout ESKİ davranışıyla (sırsız) çalışmaya devam eder; sayfa açılamaz ve
        // simulateEvent/webhook zaten açık BILLING_MOCK_HMAC_SECRET hatasıyla fail-fast olur.
        console.warn('[MockPaymentProvider] mock checkout token üretilemedi (BILLING_MOCK_HMAC_SECRET?); yer tutucu URL döndürülüyor.');
        return `https://mock-payments.entegrasyonik.local/checkout/${providerSubscriptionRef}`;
    }
    return `${raw}/api/billing/mock-checkout/${encodeURIComponent(providerSubscriptionRef)}?t=${token}`;
}

interface MockSubscriptionState {
    providerSubscriptionRef: string;
    providerCustomerRef: string;
    planCode: string;
    status: SubscriptionStatus;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
    cardLast4?: string;
    cardBrand?: string;
}

export class MockPaymentProvider implements PaymentProvider {
    public readonly name = 'mock';

    // Süreç-içi durum: gerçek sağlayıcının kendi DB'sinin yerine geçer (yalnızca mock/dev/test). Kalıcı DEĞİL --
    // süreç yeniden başlarsa sıfırlanır (mock kapsamında kabul edilebilir; gerçek durum kaynağı Subscriptions'tır).
    private subscriptions = new Map<string, MockSubscriptionState>();

    private requireSub(providerSubscriptionRef: string): MockSubscriptionState {
        const s = this.subscriptions.get(providerSubscriptionRef);
        if (!s) throw new PaymentProviderError(`[MockPaymentProvider] bilinmeyen providerSubscriptionRef: ${providerSubscriptionRef}`, 'not_found');
        return s;
    }

    private toNormalized(s: MockSubscriptionState): NormalizedSubscription {
        return {
            providerSubscriptionRef: s.providerSubscriptionRef,
            providerCustomerRef: s.providerCustomerRef,
            planCode: s.planCode,
            status: s.status,
            currentPeriodStart: s.currentPeriodStart,
            currentPeriodEnd: s.currentPeriodEnd,
            cancelAtPeriodEnd: s.cancelAtPeriodEnd,
            cardLast4: s.cardLast4,
            cardBrand: s.cardBrand,
        };
    }

    public async createCheckout(tenantId: number, planCode: string, billingInterval: BillingInterval): Promise<CreateCheckoutResult> {
        const providerSubscriptionRef = genRef('mock_sub', tenantId);
        const providerCustomerRef = genRef('mock_cus', tenantId);
        const now = new Date();
        this.subscriptions.set(providerSubscriptionRef, {
            providerSubscriptionRef,
            providerCustomerRef,
            planCode,
            // Checkout tamamlanana kadar (ödeme sonucu webhook ile bildirilene kadar) durum netleşmez; gerçek
            // sağlayıcılarla tutarlı olsun diye burada nihai bir durum VARSAYILMAZ. Çağıran taraf (registration/
            // upgrade akışı) tenant'ı zaten 'trialing' olarak tutuyor olmalı -- bu Aşama A'nın kapsamı dışında.
            status: 'trialing',
            currentPeriodStart: now,
            currentPeriodEnd: addInterval(now, billingInterval),
            cancelAtPeriodEnd: false,
        });
        return {
            formToken: `mock_form_${providerSubscriptionRef}`,
            checkoutUrl: buildMockCheckoutUrl(providerSubscriptionRef),
            providerRef: providerSubscriptionRef,
        };
    }

    public async getSubscription(providerSubscriptionRef: string): Promise<NormalizedSubscription> {
        return this.toNormalized(this.requireSub(providerSubscriptionRef));
    }

    public async cancel(providerSubscriptionRef: string, atPeriodEnd: boolean): Promise<NormalizedSubscription> {
        const s = this.requireSub(providerSubscriptionRef);
        s.cancelAtPeriodEnd = atPeriodEnd;
        if (!atPeriodEnd) s.status = 'canceled';
        return this.toNormalized(s);
    }

    public async changePlan(providerSubscriptionRef: string, planCode: string): Promise<NormalizedSubscription> {
        const s = this.requireSub(providerSubscriptionRef);
        s.planCode = planCode;
        return this.toNormalized(s);
    }

    /**
     * Dev/test yardımcısı (ADR §1 "dev tetikleyicisi"): deterministik bir senaryo tetikler, mock'un İÇ durumunu
     * (gerçek sağlayıcının kendi kaydı gibi) günceller VE gerçek webhook ile AYNI şemada imzalı gövde/başlık üretir.
     *
     * Senaryo -> durum geçişi (ADR §3 durum makinesiyle tutarlı):
     *  - SUCCESS: ilk ödeme başarılı -> 'active'.
     *  - DECLINED / THREE_DS_FAILED: ilk ödeme denemesi başarısız -> durum DEĞİŞMEZ (tenant 'trialing' kalır; ADR
     *    tablosunda "active" durumuna yalnızca "ilk BAŞARILI ödeme" ile girilir, başarısız deneme geri adım DEĞİLDİR).
     *  - RENEWAL_FAILS: var olan 'active' abonelik için yenileme başarısız -> 'past_due'.
     *  - RECOVERY: 'past_due'/'suspended' abonelik için başarılı yeniden deneme -> anında 'active' (ADR §3 "Kurtarma").
     */
    public simulateEvent(scenario: MockTestCard, providerSubscriptionRef: string): { rawBody: Buffer; headers: WebhookHeaders; eventId: string } {
        const s = this.requireSub(providerSubscriptionRef);
        const eventId = genRef('evt', providerSubscriptionRef);
        let type: string;
        switch (scenario) {
            case MOCK_TEST_CARDS.SUCCESS:
                type = 'payment.succeeded';
                s.status = 'active';
                s.cardLast4 = '4242';
                s.cardBrand = 'visa';
                break;
            case MOCK_TEST_CARDS.DECLINED:
                type = 'payment.failed';
                break;
            case MOCK_TEST_CARDS.THREE_DS_FAILED:
                type = 'payment.threeds_failed';
                break;
            case MOCK_TEST_CARDS.RENEWAL_FAILS:
                type = 'payment.failed';
                s.status = 'past_due';
                break;
            case MOCK_TEST_CARDS.RECOVERY:
                type = 'payment.succeeded';
                s.status = 'active';
                break;
            default:
                throw new Error(`[MockPaymentProvider] bilinmeyen test kartı senaryosu: ${scenario}`);
        }
        const payload = {
            id: eventId,
            type,
            data: { providerSubscriptionRef, providerCustomerRef: s.providerCustomerRef },
        };
        const rawBody = Buffer.from(JSON.stringify(payload), 'utf8');
        const headers: WebhookHeaders = { [MOCK_SIGNATURE_HEADER]: signPayload(rawBody) };
        return { rawBody, headers, eventId };
    }

    public async verifyAndParseWebhook(rawBody: Buffer, headers: WebhookHeaders): Promise<NormalizedBillingEvent> {
        const providedRaw = headers[MOCK_SIGNATURE_HEADER];
        const provided = Array.isArray(providedRaw) ? providedRaw[0] : providedRaw;
        if (!provided) throw new PaymentProviderError('[MockPaymentProvider] imza başlığı eksik', 'invalid_signature');

        const expected = signPayload(rawBody);
        const a = Buffer.from(String(provided), 'utf8');
        const b = Buffer.from(expected, 'utf8');
        // Sabit zamanlı karşılaştırma (ADR §4). Buffer boyu farklıysa timingSafeEqual fırlatır -- önce eşitlenir.
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
            throw new PaymentProviderError('[MockPaymentProvider] imza doğrulanamadı', 'invalid_signature');
        }

        let payload: any;
        try {
            payload = JSON.parse(rawBody.toString('utf8'));
        } catch {
            throw new PaymentProviderError('[MockPaymentProvider] gövde JSON değil', 'invalid_signature');
        }
        if (!payload || typeof payload.id !== 'string' || typeof payload.type !== 'string') {
            throw new PaymentProviderError('[MockPaymentProvider] gövde şeması geçersiz', 'invalid_signature');
        }

        return {
            providerEventId: payload.id,
            type: payload.type,
            providerSubscriptionRef: payload?.data?.providerSubscriptionRef,
            providerCustomerRef: payload?.data?.providerCustomerRef,
            occurredAt: new Date(),
            raw: { type: payload.type },
        };
    }
}

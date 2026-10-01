/**
 * MockPaymentProvider (ADR-0008 §1): deterministik test kartı senaryoları + gerçek webhook ile AYNI imza
 * doğrulama kodundan (verifyAndParseWebhook) geçiş. DB/ağ YOK (saf süreç-içi durum).
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import { MockPaymentProvider, MOCK_TEST_CARDS } from '@services/billing/MockPaymentProvider';
import { PaymentProviderError } from '@services/billing/PaymentProvider';

describe('MockPaymentProvider.createCheckout', () => {
  it('providerRef ve formToken/checkoutUrl döner, iç durumu "trialing" ile başlatır', async () => {
    const provider = new MockPaymentProvider();
    const result = await provider.createCheckout(5, 'growth', 'month');

    expect(result.providerRef).toMatch(/^mock_sub_5_/);
    expect(result.formToken).toContain(result.providerRef);
    expect(result.checkoutUrl).toContain(result.providerRef);

    const sub = await provider.getSubscription(result.providerRef);
    expect(sub.status).toBe('trialing');
    expect(sub.planCode).toBe('growth');
  });

  it('yıllık interval currentPeriodEnd\'i 1 yıl ileri taşır, aylık 1 ay', async () => {
    const provider = new MockPaymentProvider();
    const monthly = await provider.createCheckout(1, 'growth', 'month');
    const yearly = await provider.createCheckout(1, 'growth', 'year');

    const m = await provider.getSubscription(monthly.providerRef);
    const y = await provider.getSubscription(yearly.providerRef);
    const diffMonths = (m.currentPeriodEnd!.getTime() - m.currentPeriodStart!.getTime()) / (1000 * 60 * 60 * 24);
    const diffYears = (y.currentPeriodEnd!.getTime() - y.currentPeriodStart!.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffMonths).toBeGreaterThan(25);
    expect(diffMonths).toBeLessThan(32);
    expect(diffYears).toBeGreaterThan(360);
  });

  it('bilinmeyen providerSubscriptionRef ile getSubscription PaymentProviderError(not_found) fırlatır', async () => {
    const provider = new MockPaymentProvider();
    await expect(provider.getSubscription('yok-boyle-bir-ref')).rejects.toThrow(PaymentProviderError);
  });
});

describe('MockPaymentProvider.simulateEvent - deterministik test kartı senaryoları (ADR-0008 §1)', () => {
  let provider: MockPaymentProvider;
  let ref: string;

  beforeEach(async () => {
    provider = new MockPaymentProvider();
    const checkout = await provider.createCheckout(7, 'starter', 'month');
    ref = checkout.providerRef;
  });

  it('SUCCESS: ilk ödeme başarılı -> durum active olur, event type payment.succeeded', async () => {
    const { rawBody, headers, eventId } = provider.simulateEvent(MOCK_TEST_CARDS.SUCCESS, ref);
    const event = await provider.verifyAndParseWebhook(rawBody, headers);

    expect(event.providerEventId).toBe(eventId);
    expect(event.type).toBe('payment.succeeded');
    expect(event.providerSubscriptionRef).toBe(ref);

    const sub = await provider.getSubscription(ref);
    expect(sub.status).toBe('active');
    expect(sub.cardLast4).toBe('4242');
  });

  it('DECLINED: reddedildi -> durum DEĞİŞMEZ (trialing kalır), event type payment.failed', async () => {
    const { rawBody, headers } = provider.simulateEvent(MOCK_TEST_CARDS.DECLINED, ref);
    const event = await provider.verifyAndParseWebhook(rawBody, headers);

    expect(event.type).toBe('payment.failed');
    const sub = await provider.getSubscription(ref);
    expect(sub.status).toBe('trialing');
  });

  it('THREE_DS_FAILED: 3DS başarısız -> durum DEĞİŞMEZ, event type payment.threeds_failed', async () => {
    const { rawBody, headers } = provider.simulateEvent(MOCK_TEST_CARDS.THREE_DS_FAILED, ref);
    const event = await provider.verifyAndParseWebhook(rawBody, headers);

    expect(event.type).toBe('payment.threeds_failed');
    const sub = await provider.getSubscription(ref);
    expect(sub.status).toBe('trialing');
  });

  it('RENEWAL_FAILS: önce SUCCESS ile active yapılır, sonra yenileme başarısız -> past_due', async () => {
    provider.simulateEvent(MOCK_TEST_CARDS.SUCCESS, ref);
    let sub = await provider.getSubscription(ref);
    expect(sub.status).toBe('active');

    const { rawBody, headers } = provider.simulateEvent(MOCK_TEST_CARDS.RENEWAL_FAILS, ref);
    const event = await provider.verifyAndParseWebhook(rawBody, headers);
    expect(event.type).toBe('payment.failed');

    sub = await provider.getSubscription(ref);
    expect(sub.status).toBe('past_due');
  });

  it('RECOVERY: past_due iken başarılı yeniden deneme -> anında active', async () => {
    provider.simulateEvent(MOCK_TEST_CARDS.SUCCESS, ref);
    provider.simulateEvent(MOCK_TEST_CARDS.RENEWAL_FAILS, ref);
    let sub = await provider.getSubscription(ref);
    expect(sub.status).toBe('past_due');

    const { rawBody, headers } = provider.simulateEvent(MOCK_TEST_CARDS.RECOVERY, ref);
    const event = await provider.verifyAndParseWebhook(rawBody, headers);
    expect(event.type).toBe('payment.succeeded');

    sub = await provider.getSubscription(ref);
    expect(sub.status).toBe('active');
  });
});

describe('MockPaymentProvider.verifyAndParseWebhook - imza doğrulama', () => {
  it('geçerli imza ile event ayrıştırır', async () => {
    const provider = new MockPaymentProvider();
    const { providerRef } = await provider.createCheckout(9, 'starter', 'month');
    const { rawBody, headers } = provider.simulateEvent(MOCK_TEST_CARDS.SUCCESS, providerRef);

    const event = await provider.verifyAndParseWebhook(rawBody, headers);
    expect(event.type).toBe('payment.succeeded');
  });

  it('geçersiz imza ile PaymentProviderError(invalid_signature) fırlatır', async () => {
    const provider = new MockPaymentProvider();
    const { providerRef } = await provider.createCheckout(9, 'starter', 'month');
    const { rawBody } = provider.simulateEvent(MOCK_TEST_CARDS.SUCCESS, providerRef);

    await expect(provider.verifyAndParseWebhook(rawBody, { 'x-mock-signature': 'yanlis-imza-'.padEnd(64, '0') }))
      .rejects.toMatchObject({ code: 'invalid_signature' });
  });

  it('imza başlığı eksikse invalid_signature fırlatır', async () => {
    const provider = new MockPaymentProvider();
    const { providerRef } = await provider.createCheckout(9, 'starter', 'month');
    const { rawBody } = provider.simulateEvent(MOCK_TEST_CARDS.SUCCESS, providerRef);

    await expect(provider.verifyAndParseWebhook(rawBody, {})).rejects.toMatchObject({ code: 'invalid_signature' });
  });

  it('gövde değiştirilirse (imza aynı kalsa da) doğrulama başarısız olur', async () => {
    const provider = new MockPaymentProvider();
    const { providerRef } = await provider.createCheckout(9, 'starter', 'month');
    const { rawBody, headers } = provider.simulateEvent(MOCK_TEST_CARDS.SUCCESS, providerRef);
    const tampered = Buffer.from(rawBody.toString('utf8').replace('payment.succeeded', 'payment.failed'), 'utf8');

    await expect(provider.verifyAndParseWebhook(tampered, headers)).rejects.toMatchObject({ code: 'invalid_signature' });
  });

  it('BILLING_MOCK_HMAC_SECRET tanımsızsa imzalama fail-fast hata fırlatır', async () => {
    const previous = process.env.BILLING_MOCK_HMAC_SECRET;
    delete process.env.BILLING_MOCK_HMAC_SECRET;
    try {
      const provider = new MockPaymentProvider();
      const { providerRef } = await provider.createCheckout(9, 'starter', 'month');
      expect(() => provider.simulateEvent(MOCK_TEST_CARDS.SUCCESS, providerRef)).toThrow(/BILLING_MOCK_HMAC_SECRET/);
    } finally {
      process.env.BILLING_MOCK_HMAC_SECRET = previous;
    }
  });
});

describe('MockPaymentProvider.cancel / changePlan', () => {
  it('atPeriodEnd=false ile hemen canceled yapar', async () => {
    const provider = new MockPaymentProvider();
    const { providerRef } = await provider.createCheckout(3, 'starter', 'month');
    const result = await provider.cancel(providerRef, false);
    expect(result.status).toBe('canceled');
    expect(result.cancelAtPeriodEnd).toBe(false);
  });

  it('atPeriodEnd=true ile durumu DEĞİŞTİRMEZ, yalnızca bayrağı işaretler', async () => {
    const provider = new MockPaymentProvider();
    const { providerRef } = await provider.createCheckout(3, 'starter', 'month');
    provider.simulateEvent(MOCK_TEST_CARDS.SUCCESS, providerRef);
    const result = await provider.cancel(providerRef, true);
    expect(result.status).toBe('active');
    expect(result.cancelAtPeriodEnd).toBe(true);
  });

  it('changePlan planCode\'u günceller', async () => {
    const provider = new MockPaymentProvider();
    const { providerRef } = await provider.createCheckout(3, 'starter', 'month');
    const result = await provider.changePlan(providerRef, 'growth');
    expect(result.planCode).toBe('growth');
  });
});

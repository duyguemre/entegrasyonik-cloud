/**
 * BillingWebhookApiManager (ADR-0008 §4, YENİ özellik). Trendyol.webhook.test.ts ile AYNI desen: DB mock'lanır,
 * gerçek HTTP/supertest YOK -- `handleBillingWebhook(provider, rawBody, headers)` fonksiyon seviyesinde test edilir.
 * Ödeme sağlayıcısı GERÇEK `MockPaymentProvider` (PaymentProviderFactory üzerinden) -- imza doğrulama/deterministik
 * senaryo üretimi ayrıca `MockPaymentProvider.test.ts`'te test edildiği için burada yalnızca webhook ROTASININ
 * davranışı (idempotency, imza reddi, kanonik durum yeniden çekme, hata sınıflandırması) doğrulanır.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: { getApplicationDB: jest.fn() } }));
jest.mock('@services/billing/EntitlementService', () => ({ EntitlementService: { invalidate: jest.fn() } }));

import { DatabaseManagerInstance } from '@database/DatabaseManager';
import { EntitlementService } from '@services/billing/EntitlementService';
import { handleBillingWebhook, configureBillingWebhookRoutes } from '@api/webhooks/BillingWebhookApiManager';
import { getPaymentProvider, resetPaymentProviderForTests } from '@services/billing/PaymentProviderFactory';
import { MOCK_TEST_CARDS, MockPaymentProvider } from '@services/billing/MockPaymentProvider';

let billingEventFindOne: jest.Mock;
let billingEventCreate: jest.Mock;
let subscriptionFindOne: jest.Mock;
let subscriptionUpdateOne: jest.Mock;

function mockDb(opts: { billingEvent?: any; subscription?: any } = {}) {
  billingEventFindOne = jest.fn(() => ({ lean: jest.fn(async () => opts.billingEvent ?? null) }));
  billingEventCreate = jest.fn(async (doc: any) => doc);
  subscriptionFindOne = jest.fn(() => ({ lean: jest.fn(async () => opts.subscription ?? null) }));
  subscriptionUpdateOne = jest.fn(async () => ({}));
  (DatabaseManagerInstance.getApplicationDB as any).mockResolvedValue({
    getBillingEventModel: () => ({ findOne: billingEventFindOne, create: billingEventCreate }),
    getSubscriptionModel: () => ({ findOne: subscriptionFindOne, updateOne: subscriptionUpdateOne }),
  });
}

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  resetPaymentProviderForTests();
  (EntitlementService.invalidate as jest.Mock).mockClear();
});

describe('handleBillingWebhook - geçerli imza + eşleşen abonelik', () => {
  it('[YENİ DAVRANIŞ] 200 döner, Subscriptions kanonik durumla güncellenir, BillingEvent processed yazılır, EntitlementService.invalidate çağrılır', async () => {
    const provider = getPaymentProvider() as MockPaymentProvider;
    const checkout = await provider.createCheckout(5, 'growth', 'month');
    const envelope = provider.simulateEvent(MOCK_TEST_CARDS.SUCCESS, checkout.providerRef);
    mockDb({ subscription: { clientId: 5, provider: 'mock', providerSubscriptionRef: checkout.providerRef } });

    const result = await handleBillingWebhook('mock', envelope.rawBody, envelope.headers);

    expect(result).toEqual({ statusCode: 200, outcome: 'processed' });
    expect(subscriptionUpdateOne).toHaveBeenCalledWith(
      { clientId: 5 },
      { $set: expect.objectContaining({ status: 'active' }) },
    );
    expect(billingEventCreate).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'mock', providerEventId: envelope.eventId, type: 'payment.succeeded', clientId: 5, status: 'processed',
    }));
    expect(EntitlementService.invalidate).toHaveBeenCalledWith(5);
  });

  it('[YENİ DAVRANIŞ] eşleşen Subscriptions kaydı yoksa BillingEvent status=failed yazılır ama yine 200 döner (hızlı 2xx)', async () => {
    const provider = getPaymentProvider() as MockPaymentProvider;
    const checkout = await provider.createCheckout(5, 'growth', 'month');
    const envelope = provider.simulateEvent(MOCK_TEST_CARDS.SUCCESS, checkout.providerRef);
    mockDb({ subscription: null });

    const result = await handleBillingWebhook('mock', envelope.rawBody, envelope.headers);

    expect(result).toEqual({ statusCode: 200, outcome: 'failed' });
    expect(billingEventCreate).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', failureReason: 'subscription_not_found' }));
    expect(EntitlementService.invalidate).not.toHaveBeenCalled();
  });
});

describe('handleBillingWebhook - geçersiz imza', () => {
  it('[YENİ DAVRANIŞ] 401 döner, idempotency/Subscriptions sorgularına hiç gidilmez', async () => {
    const provider = getPaymentProvider() as MockPaymentProvider;
    const checkout = await provider.createCheckout(5, 'growth', 'month');
    const envelope = provider.simulateEvent(MOCK_TEST_CARDS.SUCCESS, checkout.providerRef);
    mockDb();

    const result = await handleBillingWebhook('mock', envelope.rawBody, { 'x-mock-signature': '0'.repeat(64) });

    expect(result).toEqual({ statusCode: 401, outcome: 'invalid_signature' });
    expect(billingEventFindOne).not.toHaveBeenCalled();
  });

  it('[YENİ DAVRANIŞ] imza başlığı hiç yoksa da 401 döner', async () => {
    mockDb();
    const result = await handleBillingWebhook('mock', Buffer.from('{"id":"x","type":"payment.succeeded"}'), {});
    expect(result).toEqual({ statusCode: 401, outcome: 'invalid_signature' });
  });
});

describe('handleBillingWebhook - bilinmeyen/yapılandırılmamış sağlayıcı', () => {
  it('[YENİ DAVRANIŞ] provider parametresi PAYMENT_PROVIDER ile eşleşmezse 404 döner (varlık sızdırmaz), DB\'ye hiç sorulmaz', async () => {
    mockDb();
    const result = await handleBillingWebhook('iyzico', Buffer.from('{}'), {});
    expect(result).toEqual({ statusCode: 404, outcome: 'unknown_provider' });
    expect(billingEventFindOne).not.toHaveBeenCalled();
  });

  it('[YENİ DAVRANIŞ] provider boş string ise 404 döner', async () => {
    mockDb();
    const result = await handleBillingWebhook('', Buffer.from('{}'), {});
    expect(result).toEqual({ statusCode: 404, outcome: 'unknown_provider' });
  });
});

describe('handleBillingWebhook - idempotency (ADR-0008 §4)', () => {
  it('[YENİ DAVRANIŞ] aynı providerEventId iki kez gelirse ikincisi ignored olarak 200 döner ve YENİDEN İŞLENMEZ', async () => {
    const provider = getPaymentProvider() as MockPaymentProvider;
    const checkout = await provider.createCheckout(5, 'growth', 'month');
    const envelope = provider.simulateEvent(MOCK_TEST_CARDS.SUCCESS, checkout.providerRef);
    mockDb({ subscription: { clientId: 5, provider: 'mock', providerSubscriptionRef: checkout.providerRef } });

    const first = await handleBillingWebhook('mock', envelope.rawBody, envelope.headers);
    expect(first).toEqual({ statusCode: 200, outcome: 'processed' });
    expect(billingEventCreate).toHaveBeenCalledTimes(1);

    // İkinci istekte idempotency sorgusu artık MEVCUT kaydı döner (aynı DB durumu simüle edilir)
    billingEventFindOne.mockImplementation(() => ({ lean: jest.fn(async () => ({ provider: 'mock', providerEventId: envelope.eventId })) }));
    subscriptionUpdateOne.mockClear();
    (EntitlementService.invalidate as jest.Mock).mockClear();

    const second = await handleBillingWebhook('mock', envelope.rawBody, envelope.headers);

    expect(second).toEqual({ statusCode: 200, outcome: 'ignored' });
    expect(subscriptionUpdateOne).not.toHaveBeenCalled();
    expect(EntitlementService.invalidate).not.toHaveBeenCalled();
    expect(billingEventCreate).toHaveBeenCalledTimes(1); // ikinci kez YAZILMADI
  });

  it('[YENİ DAVRANIŞ] BillingEvent.create idempotency yarışında (unique indeks çakışması) reddederse yine ignored/200 döner', async () => {
    const provider = getPaymentProvider() as MockPaymentProvider;
    const checkout = await provider.createCheckout(5, 'growth', 'month');
    const envelope = provider.simulateEvent(MOCK_TEST_CARDS.SUCCESS, checkout.providerRef);
    mockDb({ subscription: { clientId: 5, provider: 'mock', providerSubscriptionRef: checkout.providerRef } });
    billingEventCreate.mockRejectedValueOnce(Object.assign(new Error('E11000 duplicate key'), { code: 11000 }) as never);

    const result = await handleBillingWebhook('mock', envelope.rawBody, envelope.headers);

    expect(result).toEqual({ statusCode: 200, outcome: 'ignored' });
  });
});

describe('handleBillingWebhook - beklenmeyen hata', () => {
  it('[YENİ DAVRANIŞ] idempotency kontrolü (DB) sırasında hata -> 500 (sağlayıcı retry etsin)', async () => {
    const provider = getPaymentProvider() as MockPaymentProvider;
    const checkout = await provider.createCheckout(5, 'growth', 'month');
    const envelope = provider.simulateEvent(MOCK_TEST_CARDS.SUCCESS, checkout.providerRef);
    (DatabaseManagerInstance.getApplicationDB as any).mockRejectedValue(new Error('mongo down'));

    const result = await handleBillingWebhook('mock', envelope.rawBody, envelope.headers);

    expect(result).toEqual({ statusCode: 500 });
  });

  it('[YENİ DAVRANIŞ] Subscriptions güncellemesi sırasında hata -> BillingEvent failed yazılır, yine 200 döner', async () => {
    const provider = getPaymentProvider() as MockPaymentProvider;
    const checkout = await provider.createCheckout(5, 'growth', 'month');
    const envelope = provider.simulateEvent(MOCK_TEST_CARDS.SUCCESS, checkout.providerRef);
    mockDb({ subscription: { clientId: 5, provider: 'mock', providerSubscriptionRef: checkout.providerRef } });
    subscriptionUpdateOne.mockRejectedValueOnce(new Error('update failed') as never);

    const result = await handleBillingWebhook('mock', envelope.rawBody, envelope.headers);

    expect(result).toEqual({ statusCode: 200, outcome: 'failed' });
    expect(billingEventCreate).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', failureReason: 'update failed' }));
  });
});

describe('configureBillingWebhookRoutes - Express\'e bağlanma (ADR-0008 §4)', () => {
  it('[YENİ DAVRANIŞ] "/api/billing/webhooks/:provider" için POST rotası kaydeder', () => {
    const routes: Array<{ method: string; path: string }> = [];
    const fakeApp: any = { post: (routePath: string, ..._handlers: any[]) => routes.push({ method: 'POST', path: routePath }) };

    configureBillingWebhookRoutes(fakeApp);

    expect(routes).toEqual([{ method: 'POST', path: '/api/billing/webhooks/:provider' }]);
  });
});

/**
 * BillingService (ADR-0008 frontend SONUÇ): jenerik RPC katmanının PaymentProvider/EntitlementService'i
 * TÜKETEN ince servisi. DB/ağ YOK -- `applicationDB` ve `@services/billing/*` tamamen mock'lanır
 * (`tests/characterization/tenant/customer-service-anonymize.test.ts` ile AYNI desen: servis doğrudan
 * `new BillingService(clientId, request)` ile örneklenir, `init()` ÇAĞRILMAZ, `applicationDB` elle atanır).
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// jest.fn() ARGÜMANSIZ bırakılırsa ts-jest `mockResolvedValueOnce` çağrılarını `never` parametreli
// çıkarır (jest.Mock<UnknownFunction>) -- bir başlangıç uygulaması vererek dönüş tipini sabitliyoruz
// (EntitlementService.test.ts'teki `jest.fn(() => ({...}))` deseniyle AYNI gerekçe).
interface AccessDecision { allowed: boolean; status: string; reason?: string }
const checkAccess = jest.fn(async (_tenantId: number, _dimension: string): Promise<AccessDecision> => ({ allowed: true, status: 'active' }));
const invalidate = jest.fn((_tenantId: number) => undefined);
jest.mock('@services/billing/EntitlementService', () => ({
  EntitlementService: {
    checkAccess: (...args: any[]) => checkAccess(...args as [number, string]),
    invalidate: (...args: any[]) => invalidate(...args as [number]),
  },
}));

interface CheckoutResult { checkoutUrl?: string; formToken?: string; providerRef: string }
const createCheckout = jest.fn(async (_tenantId: number, _planCode: string, _interval: string): Promise<CheckoutResult> => ({ providerRef: 'ref' }));
const getPaymentProvider = jest.fn(() => ({ name: 'mock', createCheckout }));
jest.mock('@services/billing/PaymentProviderFactory', () => ({
  getPaymentProvider: () => getPaymentProvider(),
}));

import BillingService from '../../../src/api/services/billing-service';

function makeApplicationDB(opts: {
  plans?: any[];
  planFindOne?: any;
  subscription?: any;
  updateOne?: jest.Mock;
}) {
  const planModel = {
    find: jest.fn(() => ({ sort: jest.fn(() => ({ lean: jest.fn(async () => opts.plans ?? []) })) })),
    findOne: jest.fn(() => ({ lean: jest.fn(async () => opts.planFindOne ?? null) })),
  };
  const subscriptionModel = {
    findOne: jest.fn(() => ({ lean: jest.fn(async () => opts.subscription ?? null) })),
    updateOne: opts.updateOne ?? jest.fn(async () => ({ matchedCount: 1 })),
  };
  return {
    getPlanModel: () => planModel,
    getSubscriptionModel: () => subscriptionModel,
    planModel,
    subscriptionModel,
  };
}

function make(applicationDB: any, request: any, clientId = 7) {
  const svc: any = new (BillingService as any)(clientId, request);
  svc.applicationDB = applicationDB;
  return svc;
}

beforeEach(() => {
  checkAccess.mockReset();
  invalidate.mockReset();
  createCheckout.mockReset();
  getPaymentProvider.mockClear();
  checkAccess.mockResolvedValue({ allowed: true, status: 'active' });
});

describe('BillingService.getPlans', () => {
  it('yalnızca active+public planları, fiyata göre artan sırada ister ve olduğu gibi döner', async () => {
    const plans = [{ code: 'starter', priceMinor: 249000 }, { code: 'growth', priceMinor: 599000 }];
    const appDB = makeApplicationDB({ plans });
    const svc = make(appDB, {});

    const res = await svc.getPlans();

    expect(res).toEqual({ result: true, plans });
    expect(appDB.planModel.find).toHaveBeenCalledWith({ active: true, public: true });
  });

  it('koleksiyon boşsa (henüz seed edilmemiş) boş dizi döner -- HATA fırlatmaz', async () => {
    const appDB = makeApplicationDB({ plans: [] });
    const svc = make(appDB, {});
    await expect(svc.getPlans()).resolves.toEqual({ result: true, plans: [] });
  });
});

describe('BillingService.getMySubscription', () => {
  it('abonelik kaydı yoksa no_subscription + salt-okunur erişim döner (EntitlementService ÇAĞRILMAZ)', async () => {
    const appDB = makeApplicationDB({ subscription: null });
    const svc = make(appDB, {});

    const res = await svc.getMySubscription();

    expect(res).toEqual({
      result: true,
      subscription: null,
      plan: null,
      status: 'no_subscription',
      access: { read: true, write: false, engine: false },
    });
    expect(checkAccess).not.toHaveBeenCalled();
  });

  it('abonelik + plan varsa üçü de EntitlementService.checkAccess ile (read/write/engine) hesaplanır', async () => {
    const sub = { clientId: 7, planCode: 'growth', planVersion: 1, status: 'past_due', graceUntil: null };
    const plan = { code: 'growth', name: 'Büyüme', priceMinor: 599000, currency: 'TRY', interval: 'month', vatIncluded: false, limits: { channels: 5 }, features: ['erp'] };
    const appDB = makeApplicationDB({ subscription: sub, planFindOne: plan });
    checkAccess
      .mockResolvedValueOnce({ allowed: true, status: 'past_due' }) // read
      .mockResolvedValueOnce({ allowed: true, status: 'past_due' }) // write
      .mockResolvedValueOnce({ allowed: true, status: 'past_due' }); // engine
    const svc = make(appDB, {});

    const res = await svc.getMySubscription();

    expect(checkAccess).toHaveBeenCalledTimes(3);
    expect(checkAccess).toHaveBeenNthCalledWith(1, 7, 'read');
    expect(checkAccess).toHaveBeenNthCalledWith(2, 7, 'write');
    expect(checkAccess).toHaveBeenNthCalledWith(3, 7, 'engine');
    expect(res.status).toBe('past_due');
    expect(res.access).toEqual({ read: true, write: true, engine: true });
    expect(res.plan).toEqual(plan);
  });

  it('reddedilen boyut varsa en kısıtlı (read > write > engine sırasıyla) gerekçe döner', async () => {
    const sub = { clientId: 7, planCode: 'growth', status: 'suspended' };
    const appDB = makeApplicationDB({ subscription: sub, planFindOne: null });
    checkAccess
      .mockResolvedValueOnce({ allowed: true, status: 'suspended' }) // read
      .mockResolvedValueOnce({ allowed: false, status: 'suspended', reason: 'yazma kapalı' }) // write
      .mockResolvedValueOnce({ allowed: false, status: 'suspended', reason: 'motor durdu' }); // engine
    const svc = make(appDB, {});

    const res = await svc.getMySubscription();

    expect(res.access).toEqual({ read: true, write: false, engine: false });
    expect(res.reason).toBe('yazma kapalı');
  });
});

describe('BillingService.startCheckout', () => {
  it('planCode eksikse sağlayıcı ÇAĞRILMADAN aksiyon alınabilir mesaj döner', async () => {
    const appDB = makeApplicationDB({});
    const svc = make(appDB, {});

    const res = await svc.startCheckout();

    expect(res).toEqual({ result: false, message: 'Lütfen bir plan seçin.' });
    expect(createCheckout).not.toHaveBeenCalled();
  });

  it('plan aktif değilse/yoksa sağlayıcı ÇAĞRILMADAN mesaj döner', async () => {
    const appDB = makeApplicationDB({ planFindOne: null });
    const svc = make(appDB, { planCode: 'ghost' });

    const res = await svc.startCheckout();

    expect(res.result).toBe(false);
    expect(createCheckout).not.toHaveBeenCalled();
  });

  it('[ADR-0014 S4a] priceMinor 0 ("Özel teklif", Kurumsal) veya eksik fiyatlı plan için self-servis checkout BAŞLATILMAZ: sağlayıcı/Subscriptions ÇAĞRILMAZ', async () => {
    for (const plan of [{ code: 'enterprise', version: 1, active: true, priceMinor: 0 }, { code: 'weird', version: 1, active: true }]) {
      const updateOne = jest.fn(async () => ({ matchedCount: 0, upsertedCount: 1 }));
      const appDB = makeApplicationDB({ planFindOne: plan, updateOne });
      const res = await make(appDB, { planCode: plan.code }, 7).startCheckout();
      expect(res.result).toBe(false);
      expect(res.message).toMatch(/özel teklif/i);
      expect(createCheckout).not.toHaveBeenCalled();
      expect(updateOne).not.toHaveBeenCalled();
    }
  });

  it('başarılı akış: provider.createCheckout çağrılır, Subscriptions upsert edilir (status yalnızca $setOnInsert), önbellek invalidate edilir', async () => {
    const updateOne = jest.fn(async () => ({ matchedCount: 0, upsertedCount: 1 }));
    const appDB = makeApplicationDB({ planFindOne: { code: 'growth', version: 2, active: true, priceMinor: 599000 }, updateOne });
    createCheckout.mockResolvedValue({ checkoutUrl: 'https://mock-payments.entegrasyonik.local/checkout/mock_sub_7_abc', formToken: 'mock_form_abc', providerRef: 'mock_sub_7_abc' });
    const svc = make(appDB, { planCode: 'growth', billingInterval: 'month' }, 7);

    const res = await svc.startCheckout();

    expect(createCheckout).toHaveBeenCalledWith(7, 'growth', 'month');
    expect(updateOne).toHaveBeenCalledWith(
      { clientId: 7 },
      {
        $set: { planCode: 'growth', planVersion: 2, provider: 'mock', providerSubscriptionRef: 'mock_sub_7_abc' },
        $setOnInsert: { status: 'trialing' },
      },
      { upsert: true },
    );
    expect(invalidate).toHaveBeenCalledWith(7);
    expect(res).toEqual({
      result: true,
      checkoutUrl: 'https://mock-payments.entegrasyonik.local/checkout/mock_sub_7_abc',
      formToken: 'mock_form_abc',
      providerRef: 'mock_sub_7_abc',
    });
  });

  it('billingInterval "year" DEĞİLSE (eksik/bilinmeyen) "month" varsayılanına düşer', async () => {
    const appDB = makeApplicationDB({ planFindOne: { code: 'starter', version: 1, active: true, priceMinor: 249000 } });
    createCheckout.mockResolvedValue({ providerRef: 'ref1' });
    const svc = make(appDB, { planCode: 'starter' }, 3);

    await svc.startCheckout();

    expect(createCheckout).toHaveBeenCalledWith(3, 'starter', 'month');
  });
});

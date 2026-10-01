/**
 * EntitlementService (ADR-0008 §3): durum makinesi x izin-boyutu (read/write/engine) TAM matris + kota kontrolü
 * + 60 sn TTL tenant-anahtarlı önbellek. DatabaseManagerInstance mock'lanır: DB YOK.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

let subscriptionFindOne: jest.Mock;
let planFindOne: jest.Mock;

jest.mock('@database/DatabaseManager', () => ({
  DatabaseManagerInstance: { getApplicationDB: jest.fn() },
}));

import { DatabaseManagerInstance } from '@database/DatabaseManager';
import { EntitlementService, computeAccess, AccessDimension } from '@services/billing/EntitlementService';
import type { SubscriptionStatus } from '@database/application/models/Subscription';

function mockApplicationDB(subscription: any, plan: any = { limits: { channels: 2, skus: 5000, users: 3, mcpCallsPerDay: 500 } }) {
  subscriptionFindOne = jest.fn(() => ({ lean: jest.fn(async () => subscription) }));
  planFindOne = jest.fn(() => ({ lean: jest.fn(async () => plan) }));
  (DatabaseManagerInstance.getApplicationDB as any).mockResolvedValue({
    getSubscriptionModel: () => ({ findOne: subscriptionFindOne }),
    getPlanModel: () => ({ findOne: planFindOne }),
  });
}

function baseSub(overrides: any = {}) {
  return { clientId: 1, status: 'active', planCode: 'growth', billingExempt: false, ...overrides };
}

beforeEach(() => {
  EntitlementService.clearCacheForTests();
});

const DIMENSIONS: AccessDimension[] = ['read', 'write', 'engine'];

describe('computeAccess - ADR-0008 §3 durum makinesi tablosu (saf fonksiyon)', () => {
  const now = new Date('2026-06-15T12:00:00.000Z');

  const fullAccessStates: Array<[string, { read: boolean; write: boolean; engine: boolean }]> = [
    ['trialing', { read: true, write: true, engine: true }],
    ['active', { read: true, write: true, engine: true }],
  ];
  it.each(fullAccessStates)('%s -> %j', (status, expected) => {
    const access = computeAccess(baseSub({ status }) as any, now);
    expect(access).toEqual(expected);
  });

  it('past_due: graceUntil YOKSA veya henüz gelmediyse tam erişim', () => {
    expect(computeAccess(baseSub({ status: 'past_due' }) as any, now)).toEqual({ read: true, write: true, engine: true });
    const graceFuture = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    expect(computeAccess(baseSub({ status: 'past_due', graceUntil: graceFuture }) as any, now)).toEqual({ read: true, write: true, engine: true });
  });

  it('past_due: graceUntil GEÇMİŞSE suspended muamelesi (read-only) -- savunmacı', () => {
    const gracePast = new Date(now.getTime() - 1000);
    expect(computeAccess(baseSub({ status: 'past_due', graceUntil: gracePast }) as any, now)).toEqual({ read: true, write: false, engine: false });
  });

  it('suspended: yalnızca read (görüntüleme + dışa aktarma)', () => {
    expect(computeAccess(baseSub({ status: 'suspended' }) as any, now)).toEqual({ read: true, write: false, engine: false });
  });

  it('canceled: dönem sonuna kadar tam erişim', () => {
    const periodEnd = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
    expect(computeAccess(baseSub({ status: 'canceled', currentPeriodEnd: periodEnd }) as any, now)).toEqual({ read: true, write: true, engine: true });
  });

  it('canceled: dönem sonu geçtiyse ve 30 gün dolmadıysa read-only', () => {
    const periodEnd = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    expect(computeAccess(baseSub({ status: 'canceled', currentPeriodEnd: periodEnd }) as any, now)).toEqual({ read: true, write: false, engine: false });
  });

  it('canceled: dönem sonundan 30 günden fazla geçtiyse tüm erişim kapanır (expired muamelesi)', () => {
    const periodEnd = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000);
    expect(computeAccess(baseSub({ status: 'canceled', currentPeriodEnd: periodEnd }) as any, now)).toEqual({ read: false, write: false, engine: false });
  });

  it('canceled: currentPeriodEnd hiç yoksa tam erişim (savunmacı -- eksik veriyle erişimi KAPATMAZ)', () => {
    expect(computeAccess(baseSub({ status: 'canceled' }) as any, now)).toEqual({ read: true, write: true, engine: true });
  });

  it('expired: hiçbir erişim yok', () => {
    expect(computeAccess(baseSub({ status: 'expired' }) as any, now)).toEqual({ read: false, write: false, engine: false });
  });

  it('billingExempt:true -- durum ne olursa olsun (suspended/expired dahil) tam erişim (ADR §2 Legacy)', () => {
    for (const status of ['trialing', 'active', 'past_due', 'suspended', 'canceled', 'expired'] as SubscriptionStatus[]) {
      expect(computeAccess(baseSub({ status, billingExempt: true }) as any, now)).toEqual({ read: true, write: true, engine: true });
    }
  });
});

describe('EntitlementService.checkAccess - TAM matris (6 durum x 3 boyut = 18 kombinasyon)', () => {
  const now = new Date('2026-06-15T12:00:00.000Z');

  const EXPECTED: Record<SubscriptionStatus, Record<AccessDimension, boolean>> = {
    trialing: { read: true, write: true, engine: true },
    active: { read: true, write: true, engine: true },
    past_due: { read: true, write: true, engine: true },
    suspended: { read: true, write: false, engine: false },
    canceled: { read: true, write: true, engine: true }, // varsayılan: currentPeriodEnd yok -> tam
    expired: { read: false, write: false, engine: false },
  };

  for (const status of Object.keys(EXPECTED) as SubscriptionStatus[]) {
    for (const dimension of DIMENSIONS) {
      const expected = EXPECTED[status][dimension];
      it(`${status} x ${dimension} -> allowed=${expected}`, async () => {
        mockApplicationDB(baseSub({ status }));
        const decision = await EntitlementService.checkAccess(1, dimension, now);
        expect(decision.allowed).toBe(expected);
        expect(decision.status).toBe(status);
        if (!expected) expect(decision.reason).toEqual(expect.any(String));
      });
    }
  }

  it('abonelik kaydı yoksa (no_subscription) tüm boyutlarda reddedilir', async () => {
    mockApplicationDB(null);
    for (const dimension of DIMENSIONS) {
      const decision = await EntitlementService.checkAccess(99, dimension, now);
      expect(decision.allowed).toBe(false);
      expect(decision.status).toBe('no_subscription');
    }
  });
});

describe('EntitlementService - 60 sn TTL tenant-anahtarlı önbellek', () => {
  it('60 sn içinde tekrar çağrı DB\'ye tekrar sormaz (cache hit)', async () => {
    mockApplicationDB(baseSub({ status: 'active' }));
    const t0 = new Date('2026-06-15T12:00:00.000Z');

    await EntitlementService.checkAccess(1, 'read', t0);
    await EntitlementService.checkAccess(1, 'write', new Date(t0.getTime() + 30_000));
    expect(subscriptionFindOne).toHaveBeenCalledTimes(1);
  });

  it('60 sn sonra tekrar DB\'ye sorar (cache miss, TTL doldu)', async () => {
    mockApplicationDB(baseSub({ status: 'active' }));
    const t0 = new Date('2026-06-15T12:00:00.000Z');

    await EntitlementService.checkAccess(1, 'read', t0);
    await EntitlementService.checkAccess(1, 'read', new Date(t0.getTime() + 61_000));
    expect(subscriptionFindOne).toHaveBeenCalledTimes(2);
  });

  it('farklı tenant\'lar ayrı önbellek anahtarındadır (tenant A cache hit tenant B\'yi etkilemez)', async () => {
    mockApplicationDB(baseSub({ status: 'active', clientId: 1 }));
    const t0 = new Date('2026-06-15T12:00:00.000Z');
    await EntitlementService.checkAccess(1, 'read', t0);
    await EntitlementService.checkAccess(2, 'read', t0);
    expect(subscriptionFindOne).toHaveBeenCalledTimes(2);
  });

  it('invalidate(tenantId) çağrılınca önbellek anında geçersiz olur (webhook sonrası davranış)', async () => {
    mockApplicationDB(baseSub({ status: 'suspended' }));
    const t0 = new Date('2026-06-15T12:00:00.000Z');

    const before = await EntitlementService.checkAccess(1, 'write', t0);
    expect(before.allowed).toBe(false);

    mockApplicationDB(baseSub({ status: 'active' }));
    EntitlementService.invalidate(1);
    const after = await EntitlementService.checkAccess(1, 'write', t0);
    expect(after.allowed).toBe(true);
  });
});

describe('EntitlementService.checkQuota (ADR §3 son paragraf)', () => {
  const now = new Date('2026-06-15T12:00:00.000Z');

  it('kullanım limitin altındaysa izin verir', async () => {
    mockApplicationDB(baseSub({ status: 'active' }), { limits: { channels: 2, skus: 5000, users: 3, mcpCallsPerDay: 500 } });
    const decision = await EntitlementService.checkQuota(1, 'channels', 1, now);
    expect(decision).toMatchObject({ allowed: true, limit: 2, used: 1 });
  });

  it('kullanım limite ulaştıysa/aştıysa reddeder ve aksiyon alınabilir mesaj döner', async () => {
    mockApplicationDB(baseSub({ status: 'active' }), { limits: { channels: 2, skus: 5000, users: 3, mcpCallsPerDay: 500 } });
    const decision = await EntitlementService.checkQuota(1, 'channels', 2, now);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/2 kanala/);
  });

  it('limitOverrides plan limitinin ÜZERİNE geçer (Kurumsal)', async () => {
    mockApplicationDB(baseSub({ status: 'active', limitOverrides: { channels: 50 } }), { limits: { channels: 2, skus: 5000, users: 3, mcpCallsPerDay: 500 } });
    const decision = await EntitlementService.checkQuota(1, 'channels', 10, now);
    expect(decision).toMatchObject({ allowed: true, limit: 50 });
  });

  it('billingExempt:true -- sınırsız (Infinity)', async () => {
    mockApplicationDB(baseSub({ status: 'active', billingExempt: true }));
    const decision = await EntitlementService.checkQuota(1, 'channels', 999999, now);
    expect(decision.allowed).toBe(true);
    expect(decision.limit).toBe(Number.POSITIVE_INFINITY);
  });

  it('abonelik kaydı yoksa reddeder', async () => {
    mockApplicationDB(null);
    const decision = await EntitlementService.checkQuota(1, 'channels', 0, now);
    expect(decision.allowed).toBe(false);
  });
});

describe('getPlanInfo (CHAT-ENT-1): plan kodu + muafiyet, 60 sn önbellek, invalidate ile anında güncelleme', () => {
  it('plan kodu, durum ve billingExempt döner; kayıt yoksa no_subscription', async () => {
    mockApplicationDB(baseSub({ status: 'active', planCode: 'starter' }));
    expect(await EntitlementService.getPlanInfo(1)).toEqual({ status: 'active', planCode: 'starter', billingExempt: false });
    EntitlementService.clearCacheForTests();
    mockApplicationDB(baseSub({ status: 'active', billingExempt: true }));
    expect(await EntitlementService.getPlanInfo(1)).toMatchObject({ billingExempt: true });
    EntitlementService.clearCacheForTests();
    mockApplicationDB(null);
    expect(await EntitlementService.getPlanInfo(1)).toMatchObject({ status: 'no_subscription', billingExempt: false });
  });

  it('plan değişince invalidate sonrası yeni plan okunur; öncesinde önbellek', async () => {
    mockApplicationDB(baseSub({ planCode: 'starter' }));
    expect((await EntitlementService.getPlanInfo(1)).planCode).toBe('starter');
    mockApplicationDB(baseSub({ planCode: 'growth' }));
    expect((await EntitlementService.getPlanInfo(1)).planCode).toBe('starter'); // önbellek
    EntitlementService.invalidate(1);
    expect((await EntitlementService.getPlanInfo(1)).planCode).toBe('growth');
  });
});

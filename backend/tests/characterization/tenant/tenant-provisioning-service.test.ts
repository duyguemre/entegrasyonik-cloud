import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// TenantProvisioningService (ADR-0003 Karar A) — birim testleri: doğrulama, durum makinesi, yeniden deneme/idempotency.
// DB katmanı sahte (in-memory); gerçek DB/Redis/ağ YOK. Yeni tenant DB adı yalnızca sahte kayıtta görülür (gerçek bağlantı yok).

jest.mock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: { getClientDB: async () => undefined } }));

import { TenantProvisioningService, EMAIL_TAKEN_MESSAGE, TENANT_DB_ROLE_MAX_ENV } from '../../../src/operations/tenant/TenantProvisioningService';
import { validateProvisionInput, normalizeEmail } from '../../../src/operations/tenant/provisionInput';
import { makeCentralDb, makeTenantDb } from './_fakes';

let central: ReturnType<typeof makeCentralDb>;
let tenant: ReturnType<typeof makeTenantDb>;
let getClientDB: jest.Mock<(order: number) => Promise<any>>;
const svc = () => new TenantProvisioningService({ applicationDB: central.appDb, getClientDB });
const input = (over: any = {}) => ({ name: 'Ad', surname: 'Soyad', email: 'u@x.y', password: 'plain-pw-1', ...over });

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  central = makeCentralDb({ clients: [{ order: 3, clientId: 3, status: 'ACTIVE', dbConfig: { dbname: 'x3' } }], plans: [{ code: 'starter', version: 1 }] });
  tenant = makeTenantDb();
  getClientDB = jest.fn(async (_o: number) => tenant.db);
});
afterEach(() => { jest.restoreAllMocks(); delete process.env[TENANT_DB_ROLE_MAX_ENV]; });

describe('validateProvisionInput (açık alan listesi + doğrulama)', () => {
  it('geçerli girdi: e-posta kırpılır ve küçük harfe normalize edilir; yalnızca izinli alanlar döner (spread yok)', () => {
    const out = validateProvisionInput({ name: ' Ad ', surname: 'Soyad', email: '  Ali@Example.COM ', password: '12345678', storeName: ' Mağaza ',
      isGlobalAdmin: true, roleCode: 'X', order: 1, dbConfig: {}, __proto__: { x: 1 } });
    expect(out).toEqual({ name: 'Ad', surname: 'Soyad', email: 'ali@example.com', password: '12345678', storeName: 'Mağaza' });
  });

  it.each([
    ['null gövde', null, 'Geçersiz istek'],
    ['dizi gövde', [], 'Geçersiz istek'],
    ['ad sayı', { name: 5, surname: 's', email: 'a@b.c', password: '12345678' }, 'Ad zorunludur'],
    ['ad çok uzun', { name: 'a'.repeat(101), surname: 's', email: 'a@b.c', password: '12345678' }, 'en fazla 100'],
    ['e-posta @ yok', { name: 'a', surname: 's', email: 'abc', password: '12345678' }, 'Geçerli bir e-posta'],
    ['e-posta boşluklu', { name: 'a', surname: 's', email: 'a b@c.d', password: '12345678' }, 'Geçerli bir e-posta'],
    ['e-posta 255 karakter', { name: 'a', surname: 's', email: 'a'.repeat(250) + '@b.cd', password: '12345678' }, 'Geçerli bir e-posta'],
    ['e-posta nesne (NoSQL)', { name: 'a', surname: 's', email: { $gt: '' }, password: '12345678' }, 'E-posta zorunludur'],
    ['parola 7 karakter', { name: 'a', surname: 's', email: 'a@b.c', password: '1234567' }, 'en az 8'],
    ['parola nesne', { name: 'a', surname: 's', email: 'a@b.c', password: { $ne: 1 } }, 'Parola zorunludur'],
    ['parola > 72 bayt', { name: 'a', surname: 's', email: 'a@b.c', password: 'ü'.repeat(37) }, 'en fazla 72'],
    ['password2 uyuşmuyor', { name: 'a', surname: 's', email: 'a@b.c', password: '12345678', password2: '87654321' }, 'eşleşmiyor'],
    ['mağaza adı nesne', { name: 'a', surname: 's', email: 'a@b.c', password: '12345678', storeName: {} }, 'Mağaza adı geçersiz'],
    ['mağaza adı çok uzun', { name: 'a', surname: 's', email: 'a@b.c', password: '12345678', storeName: 'x'.repeat(101) }, 'en fazla 100'],
  ] as Array<[string, any, string]>)('%s -> ApplicationError 400', (_l, raw, msg) => {
    try { validateProvisionInput(raw); throw new Error('fırlatılmadı'); } catch (e: any) {
      expect(e.statusCode).toBe(400);
      expect(e.message).toContain(msg);
    }
  });

  it('password2 boş/verilmemişse aranmaz; boş mağaza adı yok sayılır; normalizeEmail string olmayana undefined', () => {
    expect(validateProvisionInput({ name: 'a', surname: 's', email: 'a@b.c', password: '12345678', password2: '', storeName: '' }).storeName).toBeUndefined();
    expect(normalizeEmail(5)).toBeUndefined();
  });
});

describe('durum makinesi ve adımlar', () => {
  it('başarılı akış sırası: Clients(PROVISIONING) -> merkezi Users -> tenant tohumları -> tenant Users -> ACTIVE', async () => {
    const order: string[] = [];
    central.clientModel.create.mockImplementationOnce(async (p: any) => { order.push('client:' + p.status); return { ...p, _id: 'c', toObject: () => p }; });
    central.userModel.create.mockImplementationOnce(async (p: any) => { order.push('user'); return { ...p, _id: 'u1' }; });
    tenant.catModel.findOneAndUpdate.mockImplementationOnce(async () => { order.push('seed'); return {}; });
    tenant.tenantUserModel.findOneAndUpdate.mockImplementationOnce(async () => { order.push('tenantUser'); return {}; });
    central.clientModel.updateOne.mockImplementationOnce(async (_f: any, u: any) => { order.push('status:' + u.$set.status); return {}; });
    const r = await svc().provision(input());
    expect(order).toEqual(['client:PROVISIONING', 'user', 'seed', 'tenantUser', 'status:ACTIVE']);
    expect(r.order).toBe(4);
    expect(r.resumed).toBe(false);
    expect(r.client.status).toBe('ACTIVE');
    expect(r.client.provisioning).toBeUndefined();
  });

  it('[DB-08] tenant tohumlarından ÖNCE yeni tenant indeksleri kurulur (ensureIndexes; DB_AUTO_INDEX kapalıyken de)', async () => {
    const order: string[] = [];
    tenant.db.ensureIndexes = jest.fn(async () => { order.push('ensureIndexes'); });
    tenant.catModel.findOneAndUpdate.mockImplementationOnce(async () => { order.push('seed'); return {}; });
    await svc().provision(input());
    expect(order).toEqual(['ensureIndexes', 'seed']);
  });

  it('tenant DB bağlantısı kurulamazsa (getClientDB undefined) kayıt PROVISIONING_FAILED (adım tenant-seed), merkezi kullanıcı KALIR, hata 500', async () => {
    getClientDB.mockResolvedValueOnce(undefined);
    const err: any = await svc().provision(input()).catch(e => e);
    expect(err.statusCode).toBe(500);
    const c = central.state.clients.find((x: any) => x.order === 4);
    expect(c.status).toBe('PROVISIONING_FAILED');
    expect(c.provisioning).toMatchObject({ failedStep: 'tenant-seed', ownerEmail: 'u@x.y' });
    expect(central.state.users).toHaveLength(1);
  });

  it('aynı e-posta + aynı parola ile yeniden deneme: PROVISIONING_FAILED tenant KALDIĞI YERDEN tamamlanır (yeni numara/kullanıcı YOK)', async () => {
    getClientDB.mockResolvedValueOnce(undefined);
    await svc().provision(input()).catch(() => undefined);
    const before = { clients: central.state.clients.length, users: central.state.users.length, counter: central.state.counters.tenant_order };
    const r = await svc().provision(input());
    expect(r.resumed).toBe(true);
    expect(r.order).toBe(4);
    expect(central.state.clients.length).toBe(before.clients);
    expect(central.state.users.length).toBe(before.users);
    expect(central.state.counters.tenant_order).toBe(before.counter); // yeni numara alınmadı
    expect(central.state.clients.find((x: any) => x.order === 4).status).toBe('ACTIVE');
    expect(tenant.tenantUsers).toHaveLength(1);
  });

  it('kullanıcı adımına gelmeden düşen tenant (Clients.provisioning.ownerEmail ile) yeniden denemede bulunur ve kullanıcı oluşturularak tamamlanır', async () => {
    central.userModel.create.mockImplementationOnce(async () => { throw new Error('geçici'); });
    await svc().provision(input()).catch(() => undefined);
    expect(central.state.users).toHaveLength(0);
    const r = await svc().provision(input());
    expect(r.resumed).toBe(true);
    expect(r.order).toBe(4);
    expect(central.state.users).toHaveLength(1);
    expect(central.state.users[0]).toMatchObject({ clientId: 4, order: 4 });
  });

  it('GÜVENLİK: başarısız kalmış tenant, e-postayı bilen ama YANLIŞ parola girene devredilmez (409; oturum verilmez)', async () => {
    getClientDB.mockResolvedValueOnce(undefined);
    await svc().provision(input()).catch(() => undefined);
    const err: any = await svc().provision(input({ password: 'baska-parola-9' })).catch(e => e);
    expect(err.statusCode).toBe(409);
    expect(err.message).toBe(EMAIL_TAKEN_MESSAGE);
    expect(central.state.clients.find((x: any) => x.order === 4).status).toBe('PROVISIONING_FAILED');
  });

  it('ACTIVE tenant sahibinin e-postasıyla kayıt: 409 (doğru parola olsa bile devam edilmez)', async () => {
    await svc().provision(input());
    const err: any = await svc().provision(input()).catch(e => e);
    expect(err.statusCode).toBe(409);
  });

  it('numara ASLA yeniden kullanılmaz: başarısız tenant sonrası başka kullanıcı yeni numara alır', async () => {
    getClientDB.mockResolvedValueOnce(undefined);
    await svc().provision(input()).catch(() => undefined); // order 4 FAILED
    const other = await svc().provision(input({ email: 'baska@x.y' }));
    expect(other.order).toBe(5);
  });

  it('iç hata ayrıntısı istemci mesajına sızmaz; sunucu logunda adım adı vardır', async () => {
    central.userModel.create.mockImplementationOnce(async () => { throw new Error('mongodb://kullanici' + ':parola@host/db baglanti hatasi'); });
    const err: any = await svc().provision(input()).catch(e => e);
    expect(String(err.message)).not.toMatch(/mongodb|parola|host/);
    expect((console.error as any).mock.calls.some((c: any[]) => String(c[0]).includes('central-user'))).toBe(true);
  });

  it('doğrulama hatasında HİÇBİR DB çağrısı yapılmaz (ne sayaç ne kayıt)', async () => {
    await expect(svc().provision(input({ email: 'gecersiz' }))).rejects.toMatchObject({ statusCode: 400 });
    expect(central.counterModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(central.clientModel.create).not.toHaveBeenCalled();
    expect(central.userModel.findOne).not.toHaveBeenCalled();
  });

  it('sayaç geçersiz değer dönerse (ör. 0/NaN) tenant kaydı YAZILMAZ ve hata 500', async () => {
    central.counterModel.findOneAndUpdate.mockImplementationOnce(async () => ({ sequence_value: 0 }));
    const err: any = await svc().provision(input()).catch(e => e);
    expect(err.statusCode).toBe(500);
    expect(central.clientModel.create).not.toHaveBeenCalled();
  });
});

describe('ADR-0013 B2: TENANT_DB_ROLE_MAX (Atlas uygulama rolünün kapsadığı üst tenant numarası)', () => {
  it('env TANIMSIZ: sınırsız (eski davranış) — order sınır olmadan ACTIVE olur', async () => {
    delete process.env[TENANT_DB_ROLE_MAX_ENV];
    const r = await svc().provision(input());
    expect(r.order).toBe(4);
    expect(r.client.status).toBe('ACTIVE');
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('env TANIMLI ve order AŞIYOR: provisioning DURUR (500), Clients kaydı PROVISIONING_FAILED (adım "order-limit"), merkezi kullanıcı KALIR', async () => {
    process.env[TENANT_DB_ROLE_MAX_ENV] = '3'; // mevcut max(order)=3 -> yeni order=4 > 3
    const err: any = await svc().provision(input()).catch(e => e);
    expect(err.statusCode).toBe(500);
    expect(err.message).not.toMatch(/Atlas|TENANT_DB_ROLE_MAX/); // iç ayrıntı istemciye sızmaz
    const c = central.state.clients.find((x: any) => x.order === 4);
    expect(c.status).toBe('PROVISIONING_FAILED');
    expect(c.provisioning.failedStep).toBe('order-limit');
    // order-limit kontrolü merkezi Users adımından ÖNCE çalışır: hiçbir kullanıcı oluşturulmaz.
    expect(central.state.users).toHaveLength(0);
  });

  it('env TANIMLI ve order sınıra yaklaşıyor (order >= max-10): UYARI loglanır, provisioning yine de ACTIVE ile TAMAMLANIR', async () => {
    process.env[TENANT_DB_ROLE_MAX_ENV] = '14'; // order=4 >= 14-10=4 -> uyarı sınırında
    const r = await svc().provision(input());
    expect(r.order).toBe(4);
    expect(r.client.status).toBe('ACTIVE');
    expect((console.warn as any).mock.calls.some((c: any[]) => String(c[0]).includes('TENANT_DB_ROLE_MAX') && String(c[0]).includes('4'))).toBe(true);
  });

  it('env TANIMLI ama order sınırdan UZAK (max-10\'dan küçük): uyarı YOK, ACTIVE', async () => {
    process.env[TENANT_DB_ROLE_MAX_ENV] = '100';
    const r = await svc().provision(input());
    expect(r.client.status).toBe('ACTIVE');
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('env GEÇERSİZ (sayısal değil): sınır UYGULANMAZ (geriye uyumlu), yalnızca uyarı loglanır, provisioning ACTIVE ile tamamlanır', async () => {
    process.env[TENANT_DB_ROLE_MAX_ENV] = 'not-a-number';
    const r = await svc().provision(input());
    expect(r.client.status).toBe('ACTIVE');
    expect((console.warn as any).mock.calls.some((c: any[]) => String(c[0]).includes(TENANT_DB_ROLE_MAX_ENV))).toBe(true);
  });

  it('env == order (sınıra tam eşit): İZİN VERİLİR (yalnızca AŞARSA durur)', async () => {
    process.env[TENANT_DB_ROLE_MAX_ENV] = '4';
    const r = await svc().provision(input());
    expect(r.order).toBe(4);
    expect(r.client.status).toBe('ACTIVE');
  });
});

// ADR-0008 §3 / ADR-0014 S4a (C16 kalanı): kayıtta `trialing` abonelik. Karakterizasyon (yukarıdaki bloklar) yeşilken eklendi.
describe('trialing abonelik adımı (ADR-0008 §3: 14 gün, kartsız, Başlangıç planı)', () => {
  const DAY = 24 * 60 * 60 * 1000;

  it('başarılı kayıt: clientId = yeni tenant, status trialing, planCode starter, trialEndsAt ≈ +14 gün, kart/sağlayıcı referansı YOK, billingExempt false', async () => {
    const t0 = Date.now();
    const r = await svc().provision(input());
    const subs = central.state.subscriptions;
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ clientId: r.order, planCode: 'starter', planVersion: 1, status: 'trialing', cancelAtPeriodEnd: false, billingExempt: false, provider: 'mock' });
    const ends = new Date(subs[0].trialEndsAt).getTime();
    expect(ends - t0).toBeGreaterThanOrEqual(14 * DAY - 5000);
    expect(ends - t0).toBeLessThanOrEqual(14 * DAY + 5000);
    expect(subs[0].currentPeriodEnd).toEqual(subs[0].trialEndsAt);
    for (const k of ['providerSubscriptionRef', 'providerCustomerRef', 'cardLast4', 'cardBrand']) expect(subs[0][k]).toBeUndefined();
  });

  it('sıra: abonelik adımı ACTIVE\'den ÖNCE (abonelikSİZ ACTIVE tenant oluşamaz)', async () => {
    const order: string[] = [];
    const origSub = central.subscriptionModel.updateOne.getMockImplementation() as any;
    central.subscriptionModel.updateOne.mockImplementation(async (...a: any[]) => { order.push('subscription'); return origSub(...a); });
    central.clientModel.updateOne.mockImplementationOnce(async (_f: any, u: any) => { order.push('status:' + u.$set.status); return {}; });
    await svc().provision(input());
    expect(order).toEqual(['subscription', 'status:ACTIVE']);
  });

  it('Plans belgesi varsa sürüm oradan alınır (seed sürümünden bağımsız; uyarı yok)', async () => {
    central.state.plans[0].version = 3;
    await svc().provision(input());
    expect(central.state.subscriptions[0].planVersion).toBe(3);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('Plans henüz seed edilmemişse kayıt KIRILMAZ: seed dosyası sürümüyle açılır ve uyarı loglanır', async () => {
    central.state.plans.length = 0;
    const r = await svc().provision(input());
    expect(r.client.status).toBe('ACTIVE');
    expect(central.state.subscriptions[0]).toMatchObject({ planCode: 'starter', planVersion: 1, status: 'trialing' });
    expect((console.warn as any).mock.calls.some((c: any[]) => String(c[0]).includes('seed:plans'))).toBe(true);
  });

  it('abonelik yazımı başarısızsa tenant PROVISIONING_FAILED (adım "subscription"), 500; aynı e-posta+parola ile yeniden denemede TAMAMLANIR ve TEK abonelik olur', async () => {
    central.subscriptionModel.updateOne.mockImplementationOnce(async () => { throw new Error('geçici yazma hatası'); });
    const err: any = await svc().provision(input()).catch(e => e);
    expect(err.statusCode).toBe(500);
    const c = central.state.clients.find((x: any) => x.order === 4);
    expect(c.status).toBe('PROVISIONING_FAILED');
    expect(c.provisioning).toMatchObject({ failedStep: 'subscription' });
    expect(central.state.subscriptions).toHaveLength(0);

    const r = await svc().provision(input());
    expect(r.resumed).toBe(true);
    expect(central.state.clients.find((x: any) => x.order === 4).status).toBe('ACTIVE');
    expect(central.state.subscriptions).toHaveLength(1);
    expect(central.state.subscriptions[0]).toMatchObject({ clientId: 4, status: 'trialing' });
  });

  it('İDEMPOTENT: abonelik yazıldı ama ACTIVE yazılamadıysa yeniden denemede deneme süresi UZAMAZ / mevcut kayıt ezilmez', async () => {
    const origClient = central.clientModel.updateOne.getMockImplementation() as any;
    let thrown = false;
    central.clientModel.updateOne.mockImplementation(async (f: any, u: any) => {
      if (!thrown && u.$set?.status === 'ACTIVE') { thrown = true; throw new Error('activate yazılamadı'); }
      return origClient(f, u);
    });
    await svc().provision(input()).catch(() => undefined);
    expect(central.state.subscriptions).toHaveLength(1);
    const marker = new Date(Date.now() - 3 * DAY);
    central.state.subscriptions[0].trialEndsAt = marker;
    const r = await svc().provision(input());
    expect(r.resumed).toBe(true);
    expect(central.state.subscriptions).toHaveLength(1);
    expect(central.state.subscriptions[0].trialEndsAt).toBe(marker);
  });

  it('e-posta zaten kayıtlıysa (409) ikinci abonelik OLUŞMAZ', async () => {
    await svc().provision(input());
    await svc().provision(input()).catch(() => undefined);
    expect(central.state.subscriptions).toHaveLength(1);
  });

  it('doğrulama hatası (400): abonelik OLUŞMAZ', async () => {
    await svc().provision(input({ password: 'kisa' })).catch(() => undefined);
    expect(central.state.subscriptions).toHaveLength(0);
  });
});

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { TenantRegistry, TENANT_REGISTRY_TTL_MS } from '@database/TenantRegistry';
import { isAllowedTenantDbName } from '@database/tenantConnection';

const rec = (order: number, over: any = {}) => ({ _id: 'id' + order, order, status: 'active', dbConfig: { dbname: 'entegrasyonikClient_' + order }, ...over });

describe('TenantRegistry (ADR-0024 D1)', () => {
  let loader: jest.Mock<any>;
  beforeEach(() => { loader = jest.fn(async (o: number) => rec(o)); });
  afterEach(() => { jest.useRealTimers(); });

  it('order -> {order,_id,status,dbname}; ikinci okuma önbellekten', async () => {
    const r = new TenantRegistry(loader);
    expect(await r.get(1)).toEqual({ order: 1, _id: 'id1', status: 'active', dbname: 'entegrasyonikClient_1' });
    await r.get(1);
    expect(loader).toHaveBeenCalledTimes(1);
  });
  it('eşzamanlı okumalar tek yükleme yapar', async () => {
    const r = new TenantRegistry(loader);
    await Promise.all([r.get(1), r.get(1), r.get(1)]);
    expect(loader).toHaveBeenCalledTimes(1);
  });
  it('bulunamayan tenant önbelleğe alınmaz', async () => {
    loader.mockResolvedValueOnce(null);
    const r = new TenantRegistry(loader);
    expect(await r.get(1)).toBeUndefined();
    expect(await r.get(1)).toBeDefined();
    expect(loader).toHaveBeenCalledTimes(2);
  });
  it('TTL dolunca yeniden yükler (varsayılan 30 sn; testte kısa TTL)', async () => {
    expect(TENANT_REGISTRY_TTL_MS).toBe(30_000);
    const r = new TenantRegistry(loader, 20);
    await r.get(1);
    await new Promise(res => setTimeout(res, 60));
    await r.get(1);
    expect(loader).toHaveBeenCalledTimes(2);
  });
  it('invalidate(order) ve invalidateById(_id) girdiyi düşürür; invalidateById dbname döner', async () => {
    const r = new TenantRegistry(loader);
    await r.get(1);
    r.invalidate(1);
    await r.get(1);
    expect(loader).toHaveBeenCalledTimes(2);
    expect(r.invalidateById('id1')).toBe('entegrasyonikClient_1');
    await r.get(1);
    expect(loader).toHaveBeenCalledTimes(3);
  });
  it('invalidate sırasında uçuştaki eski yükleme sonucu önbelleğe YAZILMAZ', async () => {
    let release!: (v: any) => void;
    loader.mockImplementationOnce(() => new Promise(res => { release = res; }));
    const r = new TenantRegistry(loader);
    const p = r.get(1);
    r.invalidate(1);
    release(rec(1, { status: 'old' }));
    await p;
    const fresh = await r.get(1);
    expect(fresh?.status).toBe('active');
    expect(loader).toHaveBeenCalledTimes(2);
  });
  it('izinsiz/geçersiz dbname hata verir', async () => {
    loader.mockResolvedValueOnce(rec(1, { dbConfig: { dbname: 'admin' } }));
    await expect(new TenantRegistry(loader).get(1)).rejects.toThrow('izinli tenant DB adları');
  });
});

describe('isAllowedTenantDbName', () => {
  it.each([['entegrasyonik', true], ['entegrasyonik_client_24', true], ['entegrasyonikClient_5', true], ['entegrasyonikDB', false], ['admin', false], ['x/entegrasyonik', false], [5, false]])('%p -> %p', (n, ok) => {
    expect(isAllowedTenantDbName(n as any, 'entegrasyonikDB')).toBe(ok);
  });
  it('env DB_NAME (uygulama DB) tenant olamaz', () => { expect(isAllowedTenantDbName('entegrasyonik_app', 'entegrasyonik_app')).toBe(false); });
});

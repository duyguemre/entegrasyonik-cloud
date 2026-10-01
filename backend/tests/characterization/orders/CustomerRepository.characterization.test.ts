// faz4-db01: CustomerRepository.saveCustomer karakterizasyonu (DBR-01). Mongo yok: ClientDB model sahte.
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Types } from 'mongoose';

jest.mock('@database/index', () => ({ DatabaseManagerInstance: { getClientDB: jest.fn() } }));

import { DatabaseManagerInstance } from '@database/index';
import { CustomerRepository } from '@database/repositories/tenant/CustomerRepository';

const anyFn = () => jest.fn<(...a: any[]) => any>();
let model: any;

beforeEach(() => {
  model = {
    findOne: anyFn().mockResolvedValue(null),
    create: anyFn().mockImplementation(async (d: any) => ({ _id: new Types.ObjectId(), ...d })),
    findOneAndUpdate: anyFn().mockImplementation(async (_q: any, u: any) => ({ _id: new Types.ObjectId(), ...(u.$setOnInsert || {}) })),
  };
  (DatabaseManagerInstance.getClientDB as any).mockReset().mockResolvedValue({ getCustomerModel: () => model });
});

const addr = { addressLine: 'Atatürk Mah. 5. Sok No:3', city: 'Ankara', state: 'Çankaya' };

describe('CustomerRepository.saveCustomer (karakterizasyon)', () => {
  it('eşleşen mevcut müşteri varsa yeni kayıt açmaz; kimlik ve adresi birleştirir, aynı _id döner', async () => {
    const existing: any = {
      _id: new Types.ObjectId(), firstName: 'Ayse', lastName: 'Test', addresses: [], externalIdentities: [],
      save: anyFn().mockResolvedValue(undefined),
    };
    model.findOne.mockResolvedValue(existing);
    const id = await new CustomerRepository().saveCustomer(7, {
      firstName: 'Ayse', lastName: 'Test', email: 'A@B.com', addresses: [{ ...addr }],
      externalIdentities: [{ integrationCode: 'trendyol', externalCustomerId: 'C1' }],
    }, 'trendyol');
    expect(id).toBe(existing._id);
    expect(existing.save).toHaveBeenCalledTimes(1);
    expect(existing.externalIdentities).toEqual([{ integrationCode: 'trendyol', externalCustomerId: 'C1' }]);
    expect(existing.addresses).toHaveLength(1);
    expect(existing.email).toBe('a@b.com');
  });

  it('e-posta normalize edilir; maskeli (*) e-posta eşleşme anahtarı olmaz', async () => {
    await new CustomerRepository().saveCustomer(7, { firstName: 'Ali', email: 'x***@m.com', addresses: [{ ...addr }] }, 'n11');
    const q = model.findOne.mock.calls[0][0];
    expect(JSON.stringify(q)).not.toContain('x***@m.com');
  });

  it('telefon son 10 haneden regex ile aranır', async () => {
    await new CustomerRepository().saveCustomer(7, { firstName: 'Ali', phone: '+90 (532) 111-22-33' }, 'n11');
    const q = model.findOne.mock.calls[0][0];
    expect(q.$or.some((c: any) => c.phone?.$regex === '5321112233$')).toBe(true);
  });
});

// [DB-01 / DBR-01] KASITLI DAVRANIŞ DEĞİŞİKLİĞİ: kimliksiz çağrı artık müşteri oluşturmaz; sahte dış kimlik yok.
describe('CustomerRepository.saveCustomer DB-01', () => {
  it('hiçbir eşleme anahtarı yoksa müşteri oluşturmaz ve null döner (tekrarlı çağrı mükerrer üretmez)', async () => {
    const repo = new CustomerRepository();
    expect(await repo.saveCustomer(7, { firstName: 'Ayse', lastName: 'Test' }, 'trendyol')).toBeNull();
    expect(await repo.saveCustomer(7, { firstName: 'Ayse', lastName: 'Test' }, 'trendyol')).toBeNull();
    expect(model.findOne).not.toHaveBeenCalled();
    expect(model.create).not.toHaveBeenCalled();
    expect(model.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('boş dış müşteri kimliği elenir: AUTO_FIX_ üretilmez, anahtar kalmazsa null', async () => {
    const customer: any = { firstName: 'Ali', externalIdentities: [{ integrationCode: 'n11', externalCustomerId: '  ' }] };
    expect(await new CustomerRepository().saveCustomer(7, customer, 'n11')).toBeNull();
    expect(JSON.stringify(customer)).not.toContain('AUTO_FIX');
    expect(customer.externalIdentities).toEqual([]);
  });

  it('dış kimlik anahtarı $elemMatch ile aranır ve eşleşme yoksa koşullu upsert ile tek belge açılır', async () => {
    const id = await new CustomerRepository().saveCustomer(7, {
      firstName: 'Ali', externalIdentities: [{ integrationCode: 'n11', externalCustomerId: 'X9' }],
    }, 'n11');
    expect(id).toBeTruthy();
    expect(model.create).not.toHaveBeenCalled();
    const [q, upd, opts] = model.findOneAndUpdate.mock.calls[0];
    expect(q.$or[0]).toEqual({ externalIdentities: { $elemMatch: { integrationCode: 'n11', externalCustomerId: 'X9' } } });
    expect(upd.$setOnInsert.externalIdentities).toEqual([{ integrationCode: 'n11', externalCustomerId: 'X9' }]);
    expect(opts.upsert).toBe(true);
  });
});

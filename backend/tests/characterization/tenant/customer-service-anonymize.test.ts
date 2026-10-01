/**
 * CustomerService.anonymizeCustomer (ADR-0003 adım 8, Karar F.23) — yeni metot, DB/ağ YOK, tamamen mock.
 * Kaynak: backend/src/api/rpc/handlers/customer-service.ts. Mevcut metotlar (getCustomers/getCustomerDetail/
 * updateCustomer) DEĞİŞTİRİLMEDİ; bu dosya yalnızca YENİ metodu test eder.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ObjectId } from 'mongodb';

import CustomerService from '../../../src/api/rpc/handlers/customer-service';
import { captureLogs } from '../../helpers/logCapture';

const CUSTOMER_ID = new ObjectId().toString();

function makeClientDb(customer: any) {
  const customerModel = {
    findById: jest.fn(() => ({ lean: jest.fn(async () => customer) })),
    updateOne: jest.fn(async (_filter: any, _update: any) => ({ matchedCount: 1 })),
  };
  const orderModel = { updateMany: jest.fn(async (_filter: any, _update: any) => ({ modifiedCount: 0 })) };
  const messageModel = { updateMany: jest.fn(async (_filter: any, _update: any) => ({ modifiedCount: 0 })) };
  return {
    getCustomerModel: () => customerModel,
    getOrderModel: () => orderModel,
    getMessageModel: () => messageModel,
    customerModel, orderModel, messageModel,
  };
}

async function make(clientDb: any, request: any) {
  const svc: any = new (CustomerService as any)(1, request);
  svc.clientDB = clientDb;
  svc.applicationDB = {};
  return svc;
}

beforeEach(() => { jest.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => { jest.restoreAllMocks(); });

describe('CustomerService.anonymizeCustomer', () => {
  it('customerId yoksa hata fırlatır, hiçbir model çağrılmaz', async () => {
    const clientDb = makeClientDb(null);
    const svc = await make(clientDb, {});
    await expect(svc.anonymizeCustomer()).rejects.toThrow('customerId gerekli.');
    expect(clientDb.customerModel.updateOne).not.toHaveBeenCalled();
  });

  it('müşteri bulunamazsa hata fırlatır', async () => {
    const clientDb = makeClientDb(null);
    const svc = await make(clientDb, { customerId: CUSTOMER_ID });
    await expect(svc.anonymizeCustomer()).rejects.toThrow('Müşteri bulunamadı.');
  });

  it('Customers: ad/soyad/şirket/TCKN-VKN/e-posta/telefon [anonymized] olur, isEmailMasked/isPhoneMasked true olur, adresler maskelenir (title/varsayılan bayrakları KORUNUR)', async () => {
    const customer = {
      _id: CUSTOMER_ID, firstName: 'Ayşe', lastName: 'Yılmaz', companyName: 'ABC A.Ş.', taxNumber: '12345678901',
      email: 'ayse@x.com', phone: '05551234567',
      addresses: [{ _id: 'a1', title: 'Ev', addressLine: 'Sk. No:1', city: 'İstanbul', state: 'Kadıköy', postalCode: '34000', isDefaultShipping: true }],
    };
    const clientDb = makeClientDb(customer);
    const svc = await make(clientDb, { customerId: CUSTOMER_ID });
    const r = await svc.anonymizeCustomer();

    expect(r.success).toBe(true);
    const [filter, update] = clientDb.customerModel.updateOne.mock.calls[0];
    expect(filter).toEqual({ _id: expect.anything() });
    expect(update.$set).toMatchObject({
      firstName: '[anonymized]', lastName: '[anonymized]', companyName: '[anonymized]', taxNumber: '[anonymized]',
      email: '[anonymized]', phone: '[anonymized]', isEmailMasked: true, isPhoneMasked: true,
    });
    expect(update.$set.addresses).toEqual([{
      _id: 'a1', title: 'Ev', addressLine: '[anonymized]', city: '[anonymized]', state: '[anonymized]', postalCode: '[anonymized]', isDefaultShipping: true,
    }]);
  });

  it('addresses yoksa/boşsa hata vermez, addresses alanı olduğu gibi (undefined/boş) $set edilir', async () => {
    const clientDb = makeClientDb({ _id: CUSTOMER_ID, firstName: 'X' });
    const svc = await make(clientDb, { customerId: CUSTOMER_ID });
    await svc.anonymizeCustomer();
    const update = clientDb.customerModel.updateOne.mock.calls[0][1];
    expect(update.$set.addresses).toBeUndefined();
  });

  it('bu müşteriye ait Orders: customerFirstName/customerLastName + billingAddress/shippingAddress PII alt alanları maskelenir; financials/items dokunulmaz (filtre içermez)', async () => {
    const clientDb = makeClientDb({ _id: CUSTOMER_ID });
    const svc = await make(clientDb, { customerId: CUSTOMER_ID });
    await svc.anonymizeCustomer();

    const [filter, update] = clientDb.orderModel.updateMany.mock.calls[0];
    expect(filter).toEqual({ customerId: expect.anything() });
    expect(update.$set).toMatchObject({
      customerFirstName: '[anonymized]', customerLastName: '[anonymized]',
      'billingAddress.firstName': '[anonymized]', 'billingAddress.email': '[anonymized]', 'billingAddress.taxNumber': '[anonymized]',
      'billingAddress.addressLine1': '[anonymized]', 'billingAddress.city': '[anonymized]',
      'shippingAddress.firstName': '[anonymized]', 'shippingAddress.postalCode': '[anonymized]',
    });
    // financials/items/invoice/fulfillment alanları $set'te YOK (dokunulmadı)
    expect(Object.keys(update.$set).some((k) => k.startsWith('financials') || k.startsWith('items') || k.startsWith('invoice') || k.startsWith('fulfillment'))).toBe(false);
  });

  it('bu müşteriye ait Messages: externalUserName maskelenir; text/answer alanlarına dokunulmaz (belirsiz, listeye eklenmedi)', async () => {
    const clientDb = makeClientDb({ _id: CUSTOMER_ID });
    const svc = await make(clientDb, { customerId: CUSTOMER_ID });
    await svc.anonymizeCustomer();
    expect(clientDb.messageModel.updateMany).toHaveBeenCalledWith({ customerId: expect.anything() }, { $set: { externalUserName: '[anonymized]' } });
  });

  it('hata yapılandırılmış log (F-06 eventLog) ile loglanır ve yeniden fırlatılır', async () => {
    const clientDb = makeClientDb({ _id: CUSTOMER_ID });
    clientDb.customerModel.updateOne.mockRejectedValueOnce(new Error('db down'));
    const svc = await make(clientDb, { customerId: CUSTOMER_ID });
    const cap = captureLogs();
    try {
      await expect(svc.anonymizeCustomer()).rejects.toThrow('db down');
      expect(cap.lines).toContainEqual(expect.objectContaining({ level: 'error', code: 'CUSTOMER_ANONYMIZE_CUSTOMER_FAILED' }));
    } finally { cap.restore(); }
  });
});

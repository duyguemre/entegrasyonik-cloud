// [eslesme-fiyat WP6, K-F / D-ORD-1/2/3, Ek E F-P1-2/F-P1-3] Sipariş denetim izi + normalize alanlar + fatura bütünlüğü + göç 0027.
// DB/Redis/ağ YOK: şema doğrulaması bellek-içi (Mongoose validateSync), repo/IntegrationFactory sahte, göç sahte sürücüyle.
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import mongoose from 'mongoose';

jest.mock('@integration/modules/IntegrationFactory', () => ({ __esModule: true, default: jest.fn() }));

import IntegrationFactory from '@integration/modules/IntegrationFactory';
import { OrderSchema } from '../../../src/database/client/models/Order';
import { InvoiceSchema } from '../../../src/database/client/models/Invoice';
import { syncHistoryEntry } from '../../../src/database/repositories/tenant/OrderRepository';
import { createInvoice, invoiceShipmentMeta } from '../../../src/operations/orders/invoices';
import { trendyolPlatformFields } from '@integration/modules/marketplace/trendyol/transformers/OrderTransformer';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const migrate = require('../../../dev-tools/migrate');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const manifest = require('../../../migrations/index-manifest.json');

const OrderModel = mongoose.models.WP6Order || mongoose.model('WP6Order', OrderSchema);

describe('Order şeması (K-F)', () => {
  it('history[], platformFields ve fulfillment.shippedAt artık strict şemada KALIR (eskiden sessizce düşüyordu)', () => {
    const doc: any = new OrderModel({
      history: [{ status: 'CANCELLED', description: 'x', actionBy: 'USER', action: 'CANCEL', userId: 'u1' }],
      platformFields: { paymentMethod: 'CC', commercial: true, splitFrom: ['1', '2'], packageId: '9' },
      fulfillment: [{ trackingCode: 'T', shippedAt: new Date('2026-10-04T00:00:00Z') }],
    });
    expect(doc.history[0]).toMatchObject({ status: 'CANCELLED', actionBy: 'USER', action: 'CANCEL', userId: 'u1' });
    expect(doc.history[0].changedAt).toBeInstanceOf(Date);
    expect(doc.platformFields.toObject()).toMatchObject({ paymentMethod: 'CC', commercial: true, splitFrom: ['1', '2'], packageId: '9' });
    expect(doc.fulfillment[0].shippedAt).toEqual(new Date('2026-10-04T00:00:00Z'));
    expect(new OrderModel({ history: [{ actionBy: 'HACKER' }] }).validateSync()?.errors['history.0.actionBy']).toBeDefined();
  });
});

describe('syncHistoryEntry (D-ORD-2)', () => {
  const now = new Date('2026-10-04T10:00:00Z');
  it('ilk kayıt SYNC_CREATE; durum değişimi SYNC_STATUS (PLATFORM); aynı durum / silinmiş durum → satır yok', () => {
    expect(syncHistoryEntry(undefined, { internalStatus: 'UNAPPROVED', externalStatus: 'Created' }, now)).toMatchObject({ status: 'UNAPPROVED', actionBy: 'PLATFORM', action: 'SYNC_CREATE', changedAt: now });
    const ext = new Date('2026-10-04T09:00:00Z');
    expect(syncHistoryEntry({ internalStatus: 'APPROVED' }, { internalStatus: 'SHIPPED', externalStatus: 'Shipped', dates: { externalUpdatedAt: ext } }, now))
      .toMatchObject({ status: 'SHIPPED', action: 'SYNC_STATUS', changedAt: ext, description: expect.stringContaining('APPROVED → SHIPPED') });
    expect(syncHistoryEntry({ internalStatus: 'SHIPPED' }, { internalStatus: 'SHIPPED' }, now)).toBeNull();
    expect(syncHistoryEntry({ internalStatus: 'CANCELLED' }, {}, now)).toBeNull();
  });
});

describe('trendyolPlatformFields (D-ORD-3, F-P1-13)', () => {
  it('bölünmüş paket köken kimlikleri splitFrom; yalnız yanıtta olan alanlar', () => {
    expect(trendyolPlatformFields({ shipmentPackageId: 77, createdBy: 'split', originPackageIds: [11, 12], paymentMethod: 'CC', commercial: true }))
      .toEqual({ commercial: true, micro: false, paymentMethod: 'CC', packageId: '77', splitFrom: ['11', '12'] });
  });
});

describe('createInvoice — pazaryeri reddi (F-P1-2(d)(e))', () => {
  beforeEach(() => { (IntegrationFactory as any).mockReset(); });
  it('fatura FAILED, sipariş özeti FAILED + denetim izi; para birimi financials.currencyCode, kargo bilgisi meta\'da', async () => {
    const sendOrderInvoice = jest.fn(async (_p: any) => ({ success: false, message: 'reddedildi' }));
    (IntegrationFactory as any).mockImplementation(() => ({ getInstance: jest.fn(async () => ({ sendOrderInvoice })) }));
    const order = { _id: 'o1', integrationCode: 'pazarama', externalOrderId: 'PZ1', internalStatus: 'APPROVED', financials: { grandTotal: 10, currencyCode: 'EUR' },
      fulfillment: [{ trackingCode: '' }, { trackingCode: 'TRK9', carrierCode: 'GUID-C' }], meta: { OrderId: 'g' } };
    const repo: any = {
      findOrderById: jest.fn(async () => order),
      upsertSalesInvoice: jest.fn(async (_id: any, set: any) => ({ _id: 'inv1', ...set })),
      updateInvoices: jest.fn(async () => ({})),
      updateOrderById: jest.fn(async () => ({})),
    };
    const res = await createInvoice({ repo, clientId: 1, logError: () => undefined }, 'o1', { invoiceNumber: 'F1', pdfUrl: 'u' });
    expect(res.success).toBe(false);
    expect(res.data.invoice.status).toBe('FAILED');
    const sent: any = sendOrderInvoice.mock.calls[0][0];
    expect(sent.currency).toBe('EUR');
    expect(sent.meta).toMatchObject({ trackingNumber: 'TRK9', deliveryCompanyId: 'GUID-C', platformOrder: { OrderId: 'g' } });
    expect(repo.updateInvoices).toHaveBeenCalledWith({ _id: 'inv1' }, { $set: expect.objectContaining({ status: 'FAILED', errorCode: 'PLATFORM_SYNC_FAILED' }) });
    const orderUpd = repo.updateOrderById.mock.calls.map((c: any) => c[1]).find((u: any) => u.$set?.['invoice.status']);
    expect(orderUpd.$set['invoice.status']).toBe('FAILED');
    expect(orderUpd.$push.history.action).toBe('INVOICE_FAILED');
  });
  it('invoiceShipmentMeta: takip kodu yoksa yalnız platformOrder', () => {
    expect(invoiceShipmentMeta({ meta: { a: 1 }, fulfillment: [] })).toEqual({ platformOrder: { a: 1 } });
  });
});

describe('Invoice tekilliği + göç 0027 (D-ORD-1)', () => {
  const m27 = migrate.findMigration(migrate.discoverMigrations(), '0027-invoices-unique-tenant');
  function fakeCtx(indexes: any[], dupGroups: number) {
    const createIndex = jest.fn(async () => 'ok');
    const dropIndex = jest.fn(async () => undefined);
    const aggregate = jest.fn(() => ({ toArray: async () => (dupGroups ? [{ groups: dupGroups }] : []) }));
    const coll = { collectionName: 'Invoices', indexes: async () => indexes, createIndex, dropIndex, aggregate };
    return { ctx: { dbname: 'entegrasyonik_client', connection: { db: { collection: () => coll } } }, createIndex, dropIndex, aggregate };
  }
  it('şema beyanı = göç = manifest (kısmi tekil, yalnız SALES)', () => {
    const decl = (InvoiceSchema as any).indexes().find(([, o]: any) => o?.name === 'uniq_integration_externalOrder_sales');
    expect(decl[0]).toEqual({ integrationCode: 1, externalOrderId: 1, type: 1 });
    const i = m27.TARGETS[0].indexes[0];
    const { name, ...rest } = i.options;
    expect(manifest.tenant.Invoices.find((e: any) => e.name === name)).toEqual({ name, fields: i.fields, options: rest });
    expect(rest.partialFilterExpression).toEqual({ type: 'SALES', externalOrderId: { $gt: '' } });
  });
  it('plan mükerrer grup sayısını raporlar (yazmaz); up mükerrer varsa REDDEDER; yoksa kurar; down düşürür; izinsiz DB reddedilir', async () => {
    const a = fakeCtx([], 2);
    expect((await m27.plan(a.ctx)).collections[0].duplicateSalesInvoiceGroups).toBe(2);
    expect(a.createIndex).not.toHaveBeenCalled();
    await expect(m27.up(a.ctx)).rejects.toThrow(/mukerrer/);
    expect(a.createIndex).not.toHaveBeenCalled();
    const b = fakeCtx([], 0);
    expect((await m27.up(b.ctx)).collections[0].indexes[0]).toMatchObject({ name: 'uniq_integration_externalOrder_sales', action: 'created' });
    await m27.down(b.ctx);
    await expect(m27.plan({ dbname: 'baska_db', connection: { db: {} } })).rejects.toThrow(/izinli/);
  });
});

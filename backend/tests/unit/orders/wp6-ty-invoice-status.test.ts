// [eslesme-fiyat WP6-kalan, D-ORD-3 / Ek E F-P2-6] Trendyol fatura durumu platformdan; faturalanma anı platform zamanı.
import { describe, it, expect } from '@jest/globals';
import { trendyolInvoice, trendyolInvoicedAt } from '@integration/modules/marketplace/trendyol/transformers/OrderTransformer';

describe('trendyolInvoice / trendyolInvoicedAt', () => {
  const hist = [{ status: 'Created', createdDate: 1759300000000 }, { status: 'Invoiced', createdDate: 1759400000000 }];

  it('faturalanma anı packageHistories Invoiced girdisinden; yoksa uydurulmaz (eskiden her senkronda new Date())', () => {
    expect(trendyolInvoicedAt({ status: 'Invoiced', packageHistories: hist })).toEqual(new Date(1759400000000));
    expect(trendyolInvoicedAt({ status: 'Invoiced' })).toBeUndefined();
    expect(trendyolInvoicedAt({ packageHistories: [{ status: 'Invoiced', createdDate: 'bozuk' }] })).toBeUndefined();
  });

  it('bağlantı varsa SUCCESS + numara; yoksa PENDING', () => {
    expect(trendyolInvoice({ invoiceLink: 'https://x/f.pdf', invoiceNumber: 'TYF2026', packageHistories: hist })).toEqual({
      invoiceMethod: 'MARKETPLACE', invoiceProvider: 'TRENDYOL', status: 'SUCCESS', invoiceLink: 'https://x/f.pdf',
      invoiceNumber: 'TYF2026', invoicedAt: new Date(1759400000000),
    });
    expect(trendyolInvoice({})).toMatchObject({ status: 'PENDING', invoiceLink: undefined, invoiceNumber: undefined, invoicedAt: undefined });
  });
});

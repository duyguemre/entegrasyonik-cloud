import { describe, it, expect } from '@jest/globals';
import { guardOrderRequiredFields } from '@integration/engine/order/orderRequiredGuard';

const addr = (over: any = {}) => ({ firstName: 'A', addressLine1: 'x', city: 'c', state: 's', ...over });
const item = (over: any = {}) => ({ externalLineItemId: 'L1', externalItemId: 'P1', productName: 'n', sku: 'S', ...over });
const order = (over: any = {}): any => ({
  externalOrderId: 'E1', orderNumber: 'N1', externalStatus: 'X',
  billingAddress: addr(), shippingAddress: addr(), items: [item()], ...over,
});

describe('guardOrderRequiredFields', () => {
  it('tam siparişte boşluk raporlamaz ve değiştirmez', () => {
    const o = order();
    expect(guardOrderRequiredFields([o])).toEqual({ gaps: {}, lineIdsFilled: 0 });
    expect(o.items[0].externalLineItemId).toBe('L1');
  });

  it('boş/undefined kalem kimliğini deterministik doldurur (sipariş reddedilmez)', () => {
    const o = order({ items: [item({ externalLineItemId: '' }), item(), item({ externalLineItemId: undefined })] });
    const r = guardOrderRequiredFields([o]);
    expect(o.items.map((i: any) => i.externalLineItemId)).toEqual(['E1:0', 'L1', 'E1:2']);
    expect(r.lineIdsFilled).toBe(2);
    expect(r.gaps['items.externalLineItemId']).toBe(2);
    // tekrar çalıştırma aynı değeri üretir (deterministik/idempotent)
    expect(guardOrderRequiredFields([o]).lineIdsFilled).toBe(0);
  });

  it("String(undefined) artığı 'undefined' metnini boş sayar (Pazarama)", () => {
    const o = order({ items: [item({ externalLineItemId: 'undefined' })] });
    expect(guardOrderRequiredFields([o]).lineIdsFilled).toBe(1);
    expect(o.items[0].externalLineItemId).toBe('E1:0');
  });

  it('eksik adres/kalem required alanlarını alan yoluna göre sayar, değer taşımaz', () => {
    const o = order({ shippingAddress: addr({ city: '', state: '  ' }), billingAddress: undefined, items: [item({ sku: '' })] });
    const { gaps } = guardOrderRequiredFields([o, order({ shippingAddress: addr({ city: '' }) })]);
    expect(gaps).toEqual({ 'shippingAddress.city': 2, 'shippingAddress.state': 1, billingAddress: 1, 'items.sku': 1 });
    expect(JSON.stringify(gaps)).not.toMatch(/Ali|x/);
  });
});

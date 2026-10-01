/**
 * ADR-0030 X1: servis grubu kovaları. Gerçek ağ YOK (127.0.0.1 yerel sunucu).
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ResilientHttpClient } from '@integration/modules/common/http/ResilientHttpClient';
import { metricsRegistry } from '@platform/runtime/metrics';
import { startLocalServer, LocalServerHandle, jsonResponder } from '../../helpers/localHttpServer';

let srv: LocalServerHandle | undefined;
afterEach(async () => { if (srv) { await srv.close(); srv = undefined; } ResilientHttpClient.resetAllState(); });
beforeEach(() => { ResilientHttpClient.resetAllState(); });

const stateOf = (): any => (ResilientHttpClient as any).adapterStates.get('1::trendyol');

describe('ResilientHttpClient - servis grubu kovaları', () => {
    it('okuma seli kendi kovasında bekler; stok/fiyat yazması aç kalmaz (ayrı kova)', async () => {
        srv = await startLocalServer(jsonResponder(200, { ok: true }));
        const client = new ResilientHttpClient('trendyol', 1, {
            ratePerMin: 60, timeoutMs: 5000,
            groupRatePerMin: { product_read: 30, inventory_price_write: 6000 },
        });
        // 4 okuma: 2 sn aralıkla ilk hemen, diğerleri 2/4/6 sn sonra (kova rezervasyonu senkron alınır)
        const reads = [0, 1, 2, 3].map(() => client.get(`${srv!.baseUrl}/r`, undefined, { group: 'product_read' }).catch(() => undefined));
        await new Promise(r => setTimeout(r, 20));
        const t0 = Date.now();
        await client.post(`${srv.baseUrl}/w`, { items: [] }, { group: 'inventory_price_write' });
        expect(Date.now() - t0).toBeLessThan(1000);
        void reads;
    });

    it('etiketsiz çağrı bugünkü tek genel kovadan geçer (geriye uyum); grup kovası oluşmaz', async () => {
        srv = await startLocalServer(jsonResponder(200, {}));
        const client = new ResilientHttpClient('trendyol', 1, { ratePerMin: 6000, groupRatePerMin: { product_read: 30 } });
        await client.get(`${srv.baseUrl}/x`);
        expect(stateOf().groupLimiters.size).toBe(0);
        // tablosu olmayan grup da genel kovaya düşer
        await client.get(`${srv.baseUrl}/x`, undefined, { group: 'bilinmeyen' });
        expect(stateOf().groupLimiters.size).toBe(0);
    });

    it('bir gruptaki 429 yalnız o grubun hızını düşürür (genel ve diğer grup değişmez)', async () => {
        srv = await startLocalServer(jsonResponder(429, { message: 'limit' }));
        const client = new ResilientHttpClient('trendyol', 1, {
            ratePerMin: 600, timeoutMs: 2000,
            groupRatePerMin: { product_read: 600, inventory_price_write: 600 },
        });
        await expect(client.get(`${srv.baseUrl}/r`, undefined, { group: 'product_read' })).rejects.toMatchObject({ code: 'RATE_LIMITED' });
        const s = stateOf();
        expect(s.groupLimiters.get('product_read').getEffectiveRatePerMin()).toBe(300);
        expect(s.limiter.getEffectiveRatePerMin()).toBe(600);
    });

    it('kova bekleme ve ret sayaçları metricsRegistry\'ye yazılır', async () => {
        srv = await startLocalServer(jsonResponder(429, {}));
        const client = new ResilientHttpClient('trendyol', 1, { ratePerMin: 600, groupRatePerMin: { product_write: 600 } });
        await expect(client.post(`${srv.baseUrl}/p`, {}, { group: 'product_write' })).rejects.toMatchObject({ code: 'RATE_LIMITED' });
        const snap = JSON.stringify(metricsRegistry.drain());
        expect(snap).toContain('integration_rate_bucket_rejects_total');
        expect(snap).toContain('product_write');
    });
});

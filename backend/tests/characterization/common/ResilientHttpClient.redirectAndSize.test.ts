/**
 * ADR-0022 (F-03): ResilientHttpClient yönlendirme takip ETMEZ + gövde boyut tavanı.
 * Önceki davranış (axios varsayılanı: 5 yönlendirme takip, başlıklar cross-host taşınırdı, boyut tavanı yok) bu testlerle
 * bilinçli olarak DEĞİŞTİRİLDİ. Gerçek ağ YOK: yalnız 127.0.0.1 yerel sunucular.
 */
import { describe, it, expect, afterEach, beforeEach } from '@jest/globals';
import http from 'http';
import net from 'net';
import { ResilientHttpClient } from '@integration/modules/common/http/ResilientHttpClient';

const servers: http.Server[] = [];
async function listen(handler: http.RequestListener): Promise<{ port: number; hits: () => number }> {
    let hits = 0;
    const s = http.createServer((q, r) => { hits++; handler(q, r); });
    servers.push(s);
    await new Promise<void>(res => s.listen(0, '127.0.0.1', res));
    return { port: (s.address() as net.AddressInfo).port, hits: () => hits };
}
beforeEach(() => ResilientHttpClient.resetAllState());
afterEach(async () => {
    await Promise.all(servers.splice(0).map(s => new Promise<void>(r => { s.closeAllConnections?.(); s.close(() => r()); })));
    ResilientHttpClient.resetAllState();
});

describe('yönlendirme politikası (ADR-0022)', () => {
    it('302 takip edilmez: hedef sunucuya (kimlik başlıklarıyla) HİÇ istek gitmez, VALIDATION fırlatılır, retry yok', async () => {
        const target = await listen((_q, r) => { r.writeHead(200); r.end('{}'); });
        const origin = await listen((_q, r) => { r.writeHead(302, { Location: `http://127.0.0.1:${target.port}/steal?token=abc` }); r.end(); });
        const client = new ResilientHttpClient('trendyol', 1, { retry: { baseDelayMs: 1, maxDelayMs: 2 }, timeoutMs: 1000 });
        const err: any = await client.get(`http://127.0.0.1:${origin.port}/x`, {}, { headers: { Authorization: 'Bearer s3cret', appkey: 'k' } }).catch(e => e);
        expect(err).toMatchObject({ code: 'VALIDATION', httpStatus: 302 });
        expect(err.message).not.toContain('abc'); // Location sorgusu (sır) mesaja sızmaz
        expect(target.hits()).toBe(0);
        expect(origin.hits()).toBe(1); // retry edilmedi
    });

    it('POST 307 de takip edilmez (gövde/başlık taşınmaz)', async () => {
        const target = await listen((_q, r) => { r.writeHead(200); r.end('{}'); });
        const origin = await listen((_q, r) => { r.writeHead(307, { Location: `http://127.0.0.1:${target.port}/p` }); r.end(); });
        const client = new ResilientHttpClient('trendyol', 1, { timeoutMs: 1000 });
        await expect(client.post(`http://127.0.0.1:${origin.port}/x`, { a: 1 }, { headers: { Authorization: 'x' } })).rejects.toMatchObject({ code: 'VALIDATION', httpStatus: 307 });
        expect(target.hits()).toBe(0);
    });
});

describe('gövde boyut tavanı (ADR-0022)', () => {
    it('tavandan büyük yanıt reddedilir (VALIDATION), retry edilmez, breaker sayılmaz', async () => {
        const big = Buffer.alloc(200_000, 'a');
        const srv = await listen((_q, r) => { r.writeHead(200, { 'Content-Type': 'text/plain' }); r.end(big); });
        const client = new ResilientHttpClient('trendyol', 1, { maxContentBytes: 10_000, retry: { baseDelayMs: 1, maxDelayMs: 2 }, timeoutMs: 2000 });
        for (let i = 0; i < 6; i++) {
            await expect(client.get(`http://127.0.0.1:${srv.port}/big`)).rejects.toMatchObject({ code: 'VALIDATION' });
        }
        expect(srv.hits()).toBe(6); // her çağrı 1 istek: retry yok; 6. çağrıda breaker (eşik 5) açılmadı
    });

    it('tavan altındaki yanıt normal döner; varsayılan tavan 20MB', async () => {
        const srv = await listen((_q, r) => { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify({ ok: true })); });
        const res = await new ResilientHttpClient('trendyol', 1, {}).get(`http://127.0.0.1:${srv.port}/ok`);
        expect(res.data).toEqual({ ok: true });
        const { DEFAULT_MAX_CONTENT_BYTES } = (require('@integration/modules/common/http/ResilientHttpClient') as typeof import('@integration/modules/common/http/ResilientHttpClient'));
        expect(DEFAULT_MAX_CONTENT_BYTES).toBe(20 * 1024 * 1024);
    });
});

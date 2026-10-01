/**
 * ADR-0006 Karar 1: ResilientHttpClient (paylaşımlı HTTP dayanıklılık katmanı).
 * Gerçek ağ YOK: 127.0.0.1 üzerinde geçici bir yerel HTTP sunucusu (tests/helpers/localHttpServer.ts)
 * "mockserver" rolü görür; dış/gerçek hosta hiçbir istek atılmaz.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import http from 'http';
import net from 'net';
import { ExponentialBackoff, fullJitterGenerator } from 'cockatiel';
import { ResilientHttpClient } from '@integration/modules/common/http/ResilientHttpClient';
import { IntegrationError } from '@integration/modules/common/IntegrationError';
import { startLocalServer, LocalServerHandle, jsonResponder, sequencedHandler } from '../../helpers/localHttpServer';

let srv: LocalServerHandle | undefined;

afterEach(async () => {
    if (srv) { await srv.close(); srv = undefined; }
    ResilientHttpClient.resetAllState();
});
beforeEach(() => { ResilientHttpClient.resetAllState(); });

describe('ExponentialBackoff + fullJitterGenerator (ADR-0006: 1/2/4/8sn tam jitter, üst sınır 30sn)', () => {
    it('ardışık deneme süreleri [0, 1000*2^(n-1)] aralığında ve 30sn üst sınırla sınırlıdır', () => {
        const backoff = new ExponentialBackoff({ generator: fullJitterGenerator, initialDelay: 1000, maxDelay: 30000, exponent: 2 });
        const expectedCaps = [1000, 2000, 4000, 8000, 16000, 30000, 30000]; // 6. denemeden itibaren 30000 ile sınırlı
        let current = backoff.next();
        for (const cap of expectedCaps) {
            expect(current.duration).toBeGreaterThanOrEqual(0);
            expect(current.duration).toBeLessThanOrEqual(cap);
            current = current.next(undefined as any);
        }
    });
});

describe('ResilientHttpClient - okuma (idempotent) retry', () => {
    it('500 hatasında retry eder, son denemede başarılıya döner (retries alanı doğru sayılır)', async () => {
        srv = await startLocalServer(sequencedHandler([
            jsonResponder(500, { message: 'sunucu hatası' }),
            jsonResponder(500, { message: 'sunucu hatası' }),
            jsonResponder(200, { content: [{ id: 1 }], totalPages: 1 }),
        ]));
        const client = new ResilientHttpClient('trendyol', 1, { retry: { baseDelayMs: 5, maxDelayMs: 20 }, timeoutMs: 1000 });
        const res = await client.get(`${srv.baseUrl}/orders`);
        expect(res.data.content).toEqual([{ id: 1 }]);
        expect(srv.requestCount()).toBe(3);
    });

    it('sürekli 500 -> retry bütçesi tükenir, IntegrationError(UNAVAILABLE) fırlatılır, [] DÖNMEZ', async () => {
        srv = await startLocalServer(jsonResponder(500, { message: 'kalıcı hata' }));
        const client = new ResilientHttpClient('trendyol', 1, { retry: { maxAttempts: 2, baseDelayMs: 5, maxDelayMs: 20 }, timeoutMs: 1000 });
        await expect(client.get(`${srv.baseUrl}/orders`)).rejects.toMatchObject({
            name: 'IntegrationError', code: 'UNAVAILABLE', httpStatus: 500, retryable: true,
        });
        expect(srv.requestCount()).toBe(3); // ilk deneme + 2 retry
    });

    it('401 -> AUTH, retry edilmez (tek istek)', async () => {
        srv = await startLocalServer(jsonResponder(401, { message: 'yetkisiz' }));
        const client = new ResilientHttpClient('trendyol', 1, { retry: { baseDelayMs: 5 }, timeoutMs: 1000 });
        await expect(client.get(`${srv.baseUrl}/orders`)).rejects.toMatchObject({ code: 'AUTH', retryable: false });
        expect(srv.requestCount()).toBe(1);
    });
});

describe('ResilientHttpClient - yazma (write) retry farkı', () => {
    it('500 hatasında YAZMA retry ETMEZ, tek denemede UNKNOWN_OUTCOME fırlatır', async () => {
        srv = await startLocalServer(jsonResponder(500, { message: 'sunucu hatası' }));
        const client = new ResilientHttpClient('trendyol', 1, { retry: { baseDelayMs: 5, maxAttempts: 4 }, timeoutMs: 1000 });
        await expect(client.post(`${srv.baseUrl}/orders/reject`, { foo: 1 })).rejects.toMatchObject({
            code: 'UNKNOWN_OUTCOME', httpStatus: 500, retryable: true,
        });
        expect(srv.requestCount()).toBe(1); // [ADR-0006 adım 1] artık yazmada ağ/5xx retry YOK
    });

    it('ECONNREFUSED (kesin gönderilmedi) YAZMADA retry edilir', async () => {
        // Dinleyen olmayan bir port: sunucu açıp hemen kapatıyoruz.
        const tmp = await startLocalServer(jsonResponder(200, {}));
        const deadUrl = tmp.baseUrl;
        await tmp.close();

        const client = new ResilientHttpClient('trendyol', 1, { retry: { maxAttempts: 2, baseDelayMs: 5, maxDelayMs: 20 }, timeoutMs: 1000 });
        await expect(client.post(`${deadUrl}/orders/reject`, {})).rejects.toMatchObject({ code: 'UNAVAILABLE', retryable: true });
    });

    it('400 (VALIDATION) yazmada da retry edilmez', async () => {
        srv = await startLocalServer(jsonResponder(400, { message: 'geçersiz' }));
        const client = new ResilientHttpClient('trendyol', 1, { timeoutMs: 1000 });
        await expect(client.post(`${srv.baseUrl}/x`, {})).rejects.toMatchObject({ code: 'VALIDATION', retryable: false });
        expect(srv.requestCount()).toBe(1);
    });
});

describe('ResilientHttpClient - 429 / Retry-After', () => {
    it('Retry-After <=60sn ise ona uyulur ve sonunda başarılı olur; breaker sayılmaz', async () => {
        srv = await startLocalServer(sequencedHandler([
            jsonResponder(429, { message: 'rate limited' }, { 'Retry-After': '0' }),
            jsonResponder(200, { content: [], totalPages: 1 }),
        ]));
        const client = new ResilientHttpClient('trendyol', 1, { timeoutMs: 1000 });
        const res = await client.get(`${srv.baseUrl}/orders`);
        expect(res.status).toBe(200);
        expect(srv.requestCount()).toBe(2);
    });

    it('Retry-After > 60sn ise RATE_LIMITED fırlatılır (bekleme yapılmaz)', async () => {
        srv = await startLocalServer(jsonResponder(429, { message: 'rate limited' }, { 'Retry-After': '3600' }));
        const client = new ResilientHttpClient('trendyol', 1, { timeoutMs: 1000 });
        const start = Date.now();
        await expect(client.get(`${srv.baseUrl}/orders`)).rejects.toMatchObject({ code: 'RATE_LIMITED', httpStatus: 429 });
        expect(Date.now() - start).toBeLessThan(2000);
        expect(srv.requestCount()).toBe(1);
    });

    it('Retry-After header yoksa RATE_LIMITED fırlatılır (bekleme yapılmaz)', async () => {
        srv = await startLocalServer(jsonResponder(429, { message: 'rate limited' }));
        const client = new ResilientHttpClient('trendyol', 1, { timeoutMs: 1000 });
        await expect(client.get(`${srv.baseUrl}/orders`)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
        expect(srv.requestCount()).toBe(1);
    });
});

describe('ResilientHttpClient - circuit breaker', () => {
    it('5 ardışık sayılabilir hatadan sonra açılır; açıkken gerçek istek atmaz (UNAVAILABLE circuitOpen:true)', async () => {
        srv = await startLocalServer(jsonResponder(500, { message: 'kalıcı hata' }));
        const client = new ResilientHttpClient('trendyol', 2, {
            retry: { maxAttempts: 0 },
            breaker: { consecutiveFailures: 3, openMs: 30, maxOpenMs: 200 },
            timeoutMs: 500,
        });

        for (let i = 0; i < 3; i++) {
            await expect(client.get(`${srv.baseUrl}/x`)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
        }
        expect(srv.requestCount()).toBe(3);

        // Devre açık: 4. çağrı sunucuya HİÇ gitmemeli.
        await expect(client.get(`${srv.baseUrl}/x`)).rejects.toMatchObject({ code: 'UNAVAILABLE', circuitOpen: true });
        expect(srv.requestCount()).toBe(3);
    });

    it('yarı-açıkta başarısız olursa açık süre 2 katına çıkar (üst sınıra kadar)', async () => {
        srv = await startLocalServer(jsonResponder(500, { message: 'kalıcı hata' }));
        const client = new ResilientHttpClient('trendyol', 3, {
            retry: { maxAttempts: 0 },
            breaker: { consecutiveFailures: 2, openMs: 60, maxOpenMs: 5000 },
            timeoutMs: 500,
        });

        await expect(client.get(`${srv.baseUrl}/x`)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
        await expect(client.get(`${srv.baseUrl}/x`)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
        expect(srv.requestCount()).toBe(2); // devre şimdi açık (openMs=60)

        await new Promise(r => setTimeout(r, 120)); // > 60ms: yarı-açık deneme izinli (bolluklu marj)
        await expect(client.get(`${srv.baseUrl}/x`)).rejects.toMatchObject({ code: 'UNAVAILABLE' }); // yarı-açık deneme de başarısız
        expect(srv.requestCount()).toBe(3); // yarı-açık deneme SUNUCUYA gitti

        // Şimdi açık süre 2x (~120ms) olmalı: 70ms sonra hâlâ açık olmalı (60+70=130 > 120 riskli olmasın diye kısa tutuldu).
        await new Promise(r => setTimeout(r, 70));
        await expect(client.get(`${srv.baseUrl}/x`)).rejects.toMatchObject({ code: 'UNAVAILABLE', circuitOpen: true });
        expect(srv.requestCount()).toBe(3); // sunucuya gitmedi

        // Toplam bekleme 120ms'yi (2x açık süre) geçince tekrar yarı-açık deneme izinli olmalı.
        await new Promise(r => setTimeout(r, 100));
        await expect(client.get(`${srv.baseUrl}/x`)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
        expect(srv.requestCount()).toBe(4); // ikinci yarı-açık deneme sunucuya gitti
    });

    it('yarı-açık deneme başarılı olursa devre kapanır, sonraki çağrılar sunucuya gider', async () => {
        srv = await startLocalServer(sequencedHandler([
            jsonResponder(500, {}),
            jsonResponder(500, {}),
            jsonResponder(200, { ok: true }),
            jsonResponder(200, { ok: true }),
        ]));
        const client = new ResilientHttpClient('trendyol', 4, {
            retry: { maxAttempts: 0 },
            breaker: { consecutiveFailures: 2, openMs: 30, maxOpenMs: 5000 },
            timeoutMs: 500,
        });

        await expect(client.get(`${srv.baseUrl}/x`)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
        await expect(client.get(`${srv.baseUrl}/x`)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
        await new Promise(r => setTimeout(r, 45));

        const res = await client.get(`${srv.baseUrl}/x`); // yarı-açık deneme -> 200 -> kapanır
        expect(res.data.ok).toBe(true);

        const res2 = await client.get(`${srv.baseUrl}/x`); // devre kapalı, normal istek
        expect(res2.data.ok).toBe(true);
        expect(srv.requestCount()).toBe(4);
    });

    it('breaker anahtarı read/write ayrı sayar: yazma hataları okuma breaker sayacını etkilemez', async () => {
        srv = await startLocalServer(jsonResponder(500, {}));
        const client = new ResilientHttpClient('trendyol', 5, {
            retry: { maxAttempts: 0 },
            breaker: { consecutiveFailures: 2, openMs: 30, maxOpenMs: 200 },
            timeoutMs: 500,
        });
        await expect(client.post(`${srv.baseUrl}/x`, {})).rejects.toMatchObject({ code: 'UNKNOWN_OUTCOME' });
        await expect(client.post(`${srv.baseUrl}/x`, {})).rejects.toMatchObject({ code: 'UNKNOWN_OUTCOME' });
        // Yazma breaker'ı açık olmalı; ama OKUMA breaker'ı hâlâ kapalı (ayrı anahtar) -> sunucuya gider.
        await expect(client.get(`${srv.baseUrl}/x`)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
        expect(srv.requestCount()).toBe(3);
    });

    it('429 breaker sayacını ARTIRMAZ', async () => {
        srv = await startLocalServer(jsonResponder(429, {}, { 'Retry-After': '3600' }));
        const client = new ResilientHttpClient('trendyol', 6, {
            retry: { maxAttempts: 0 },
            breaker: { consecutiveFailures: 2, openMs: 30, maxOpenMs: 200 },
            timeoutMs: 500,
        });
        for (let i = 0; i < 5; i++) {
            await expect(client.get(`${srv.baseUrl}/x`)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
        }
        expect(srv.requestCount()).toBe(5); // breaker hiç açılmadı, her çağrı sunucuya gitti
    });
});

describe('ResilientHttpClient - timeout (gerçek AbortController)', () => {
    it('okuma: sunucu yanıtı geciktirir, istemci timeout ile gerçekten iptal eder (UNAVAILABLE, sunucu isteği gecikmeden önce döner)', async () => {
        let aborted = false;
        const server = http.createServer((req, res) => {
            req.on('aborted', () => { aborted = true; });
            setTimeout(() => { try { res.writeHead(200); res.end('{}'); } catch { /* iptal edilmiş olabilir */ } }, 300);
        });
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
        const port = (server.address() as net.AddressInfo).port;

        const client = new ResilientHttpClient('trendyol', 1, { retry: { maxAttempts: 0 }, timeoutMs: 50 });
        const start = Date.now();
        await expect(client.get(`http://127.0.0.1:${port}/slow`)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
        expect(Date.now() - start).toBeLessThan(250); // 300ms'lik gecikmeyi beklemedi
        await new Promise(r => setTimeout(r, 20));
        expect(aborted).toBe(true); // gerçek AbortController iptali sunucuya ulaştı
        await new Promise<void>(resolve => server.close(() => resolve()));
    });

    it('yazma: timeout UNKNOWN_OUTCOME döner (sonuç belirsiz, retry YOK)', async () => {
        const server = http.createServer((_req, res) => {
            setTimeout(() => { try { res.writeHead(200); res.end('{}'); } catch { /* ignore */ } }, 300);
        });
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
        const port = (server.address() as net.AddressInfo).port;

        const client = new ResilientHttpClient('trendyol', 1, { retry: { maxAttempts: 4 }, timeoutMs: 50 });
        await expect(client.post(`http://127.0.0.1:${port}/slow`, {})).rejects.toMatchObject({ code: 'UNKNOWN_OUTCOME' });
        await new Promise<void>(resolve => server.close(() => resolve()));
    });
});

describe('ResilientHttpClient.executeCustom - SOAP/özel protokol varyantı (ADR-0006 arayüz tasarımı, N11 B2\'de bağlanacak)', () => {
    it('axios olmayan keyfi bir fn(signal) çağırır, aynı retry/breaker/timeout zincirinden geçer', async () => {
        let calls = 0;
        const client = new ResilientHttpClient('n11', 1, { retry: { baseDelayMs: 5, maxDelayMs: 20 }, timeoutMs: 500 });
        const fakeSoapCall = async (signal: AbortSignal) => {
            calls++;
            if (calls < 3) {
                const err: any = new Error('SOAP fault: sunucu hatası');
                err.response = { status: 500 }; // SOAP fault -> axios-benzeri şekle çevrilmiş
                throw err;
            }
            return { orderList: [{ id: 1 }] };
        };
        const result = await client.executeCustom({ operation: 'GetOrderList', idempotent: true }, fakeSoapCall);
        expect(result).toEqual({ orderList: [{ id: 1 }] });
        expect(calls).toBe(3);
    });

    it('fn sürekli hata verirse IntegrationError fırlatır (SOAP da [] dönmez)', async () => {
        const client = new ResilientHttpClient('n11', 1, { retry: { maxAttempts: 1, baseDelayMs: 5 }, timeoutMs: 500 });
        const fakeSoapCall = async () => {
            const err: any = new Error('SOAP fault: kalıcı hata');
            err.response = { status: 500 };
            throw err;
        };
        await expect(client.executeCustom({ operation: 'GetOrderList', idempotent: true }, fakeSoapCall))
            .rejects.toMatchObject({ name: 'IntegrationError', code: 'UNAVAILABLE' });
    });

    it('gerçek AbortSignal iletir (fn zaman aşımında iptal sinyalini görebilir)', async () => {
        const client = new ResilientHttpClient('n11', 1, { retry: { maxAttempts: 0 }, timeoutMs: 30 });
        let sawAbort = false;
        const slowSoapCall = (signal: AbortSignal) => new Promise((resolve) => {
            signal.addEventListener('abort', () => { sawAbort = true; });
            setTimeout(() => resolve('too-late'), 200);
        });
        await expect(client.executeCustom({ operation: 'SlowOp', idempotent: false }, slowSoapCall as any))
            .rejects.toMatchObject({ code: 'UNKNOWN_OUTCOME' });
        expect(sawAbort).toBe(true);
    });
});

describe('ResilientHttpClient - IntegrationError kullanır, [] / null / true dönmez', () => {
    it('rejects Promise ile IntegrationError instance', async () => {
        srv = await startLocalServer(jsonResponder(500, {}));
        const client = new ResilientHttpClient('hepsiburada', 9, { retry: { maxAttempts: 0 }, timeoutMs: 500 });
        try {
            await client.get(`${srv.baseUrl}/x`);
            throw new Error('beklenenden farklı: hata fırlatmadı');
        } catch (e) {
            expect(e).toBeInstanceOf(IntegrationError);
        }
    });
});

/**
 * ADR-0026 WP-LOG L1: LogWriter (toplu yazim, kuyruk tavani, tasma, flush, ornekleme, ikinci maske kontrolu) + logger kancasi
 * + bayrak kapali sifir yazim + yuk olcumu. DB YOK (sahte insertMany).
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { LogWriter } from '@platform/runtime/logs/LogWriter';
import { toLogEventDoc } from '@platform/runtime/logs/logRecord';
import { installLogPersistence, closeLogPersistence, getLogWriter } from '@platform/runtime/logs/install';
import { logger, resetLoggerForTests, setLogSink, LogSinkRecord } from '@platform/core/logger';
import { runWithContext } from '@platform/core/context';

const rec = (level: LogSinkRecord['level'], msg = 'm', fields: Record<string, unknown> = {}, bindings: Record<string, unknown> = {}): LogSinkRecord => ({ level, msg, fields, bindings });

function fakeModel(delayMs = 0) {
    const calls: any[][] = [];
    const model = { insertMany: jest.fn(async (docs: any[]) => { calls.push(docs); if (delayMs) await new Promise((r) => setTimeout(r, delayMs)); return docs; }) };
    return { model, calls, total: () => calls.reduce((n, c) => n + c.length, 0) };
}

let stdout: any;
beforeEach(() => { resetLoggerForTests(); stdout = jest.spyOn(process.stdout, 'write').mockImplementation((() => true) as any); });
afterEach(async () => { setLogSink(undefined); await closeLogPersistence(50); stdout.mockRestore(); jest.useRealTimers(); resetLoggerForTests(); });

describe('bayrak kapali: sifir yazim / sifir maliyet', () => {
    it('installLogPersistence (enabled=false) kanca KURMAZ, writer URETMEZ, logger.error hicbir insert yapmaz', async () => {
        const f = fakeModel();
        expect(installLogPersistence({ enabled: false, model: f.model })).toBeUndefined();
        expect(getLogWriter()).toBeUndefined();
        logger.error(new Error('boom'), 'hata');
        logger.warn({ a: 1 }, 'uyari');
        await new Promise((r) => setTimeout(r, 30));
        expect(f.model.insertMany).not.toHaveBeenCalled();
    });

    it('varsayilan config (LOG_PERSIST_ENABLED verilmemis) kapali', () => {
        expect(installLogPersistence({ model: fakeModel().model })).toBeUndefined();
    });
});

describe('toplu yazim', () => {
    it('batchSize dolunca setImmediate ile arka planda, <=batchSize parcalarla yazar (istek yolunu beklemez)', async () => {
        const f = fakeModel();
        const w = new LogWriter({ model: f.model, batchSize: 200 });
        for (let i = 0; i < 450; i++) w.offer(rec('error', `e${i}`));
        expect(f.model.insertMany).not.toHaveBeenCalled(); // offer senkron yazmaz
        await w.flush();
        expect(f.total()).toBe(450);
        expect(Math.max(...f.calls.map((c) => c.length))).toBeLessThanOrEqual(200);
        expect(f.model.insertMany).toHaveBeenCalledWith(expect.any(Array), { ordered: false });
        expect(w.stats()).toMatchObject({ written: 450, dropped: 0, failed: 0 });
    });

    it('esik altinda kalan kayitlar flushIntervalMs sonra yazilir', async () => {
        jest.useFakeTimers();
        const f = fakeModel();
        const w = new LogWriter({ model: f.model, flushIntervalMs: 1000 });
        w.offer(rec('warn', 'w1')); w.offer(rec('error', 'e1'));
        await jest.advanceTimersByTimeAsync(999);
        expect(f.model.insertMany).not.toHaveBeenCalled();
        await jest.advanceTimersByTimeAsync(2);
        expect(f.total()).toBe(2);
    });

    it('insert hatasi: parti dusurulur, sayac artar, yeniden deneme firtinasi yok, surec etkilenmez', async () => {
        const model = { insertMany: jest.fn(async () => { throw new Error('mongo down'); }) };
        const w = new LogWriter({ model: model as any, batchSize: 10 });
        for (let i = 0; i < 25; i++) w.offer(rec('error'));
        await w.flush();
        expect(w.stats().failed).toBe(25);
        expect(model.insertMany).toHaveBeenCalledTimes(3);
    });

    it('model cozumu (lazy) basarisizsa kayit kaybolur ama sonraki partide yeniden denenir', async () => {
        let n = 0; const f = fakeModel();
        const w = new LogWriter({ model: async () => { if (n++ === 0) throw new Error('db yok'); return f.model; }, batchSize: 1 });
        w.offer(rec('error', 'a')); await w.flush();
        w.offer(rec('error', 'b')); await w.flush();
        expect(f.total()).toBe(1);
        expect(w.stats()).toMatchObject({ failed: 1, written: 1 });
    });
});

describe('seviye ve ornekleme', () => {
    it('varsayilan seviye warn: warn/error kalici, info/debug orneklenir', async () => {
        const f = fakeModel();
        let r = 0; const seq = [0.01, 0.99, 0.01]; // ilk info yazilir (%5 ornek), ikincisi elenir, debug yazilir
        const w = new LogWriter({ model: f.model, sampleInfoPct: 5, random: () => seq[r++ % 3] });
        w.offer(rec('warn')); w.offer(rec('error')); w.offer(rec('fatal'));
        w.offer(rec('info', 'i1')); w.offer(rec('info', 'i2')); w.offer(rec('debug', 'd1'));
        w.offer(rec('trace', 't'));
        await w.flush();
        const docs = f.calls.flat();
        expect(docs.filter((d) => ['warn', 'error', 'fatal'].includes(d.level))).toHaveLength(3);
        expect(docs.filter((d) => d.level === 'info' || d.level === 'debug')).toHaveLength(2); // i1 + d1
        expect(docs.find((d) => d.msg === 'i2')).toBeUndefined();
    });

    it('LOG_PERSIST_LEVEL=info: info tam kalici; sampleInfo=0 iken alt seviye hic yazilmaz', async () => {
        const f = fakeModel();
        const w = new LogWriter({ model: f.model, level: 'info', sampleInfoPct: 0 });
        w.offer(rec('info')); w.offer(rec('debug'));
        await w.flush();
        expect(f.total()).toBe(1);
    });

    it('TTL: warn+ 14 gun, info/debug 3 gun (expAt)', () => {
        const now = new Date('2026-09-30T00:00:00Z');
        expect(toLogEventDoc(rec('error', 'x', { ts: now.toISOString() })).expAt.toISOString()).toBe('2026-10-14T00:00:00.000Z');
        expect(toLogEventDoc(rec('info', 'x', { ts: now.toISOString() })).expAt.toISOString()).toBe('2026-10-03T00:00:00.000Z');
    });

    it('platform:logs* modulunun kendi kayitlari kalici DEGIL (ozyineleme korumasi)', async () => {
        const f = fakeModel(); const w = new LogWriter({ model: f.model });
        w.offer(rec('error', 'x', {}, { module: 'platform:logs:writer' }));
        await w.flush();
        expect(f.total()).toBe(0);
    });
});

describe('kuyruk tavani ve tasma', () => {
    it('maxQueue asilinca yeni kayitlar dusurulur (sayac); warn+ icin %10 rezerv vardir', async () => {
        const f = fakeModel(50);
        const w = new LogWriter({ model: f.model, maxQueue: 100, batchSize: 100, flushIntervalMs: 10_000 });
        for (let i = 0; i < 100; i++) w.offer(rec('warn', 'ok'));   // tam dolu (setImmediate henuz calismadi)
        for (let i = 0; i < 30; i++) w.offer(rec('error', 'e'));    // 10 rezerv, kalan 20 dusurulur
        expect(w.stats().queued).toBe(110);
        expect(w.stats().dropped).toBe(20);
        await w.flush();
        expect(f.total()).toBe(110);
    });

    it('patlama: kuyruk ASLA maxQueue+rezervi asmaz', () => {
        const f = fakeModel(1000);
        const w = new LogWriter({ model: f.model, maxQueue: 1000, batchSize: 200 });
        for (let i = 0; i < 50_000; i++) w.offer(rec('error'));
        expect(w.stats().queued).toBeLessThanOrEqual(1100);
        expect(w.stats().dropped).toBeGreaterThan(48_000);
    });
});

describe('flush / kapanis', () => {
    it('close(): kalan kuyruk yazilir, sonra offer kabul edilmez', async () => {
        const f = fakeModel();
        const w = new LogWriter({ model: f.model, flushIntervalMs: 60_000 });
        for (let i = 0; i < 7; i++) w.offer(rec('error'));
        await w.close(1000);
        expect(f.total()).toBe(7);
        w.offer(rec('error'));
        expect(w.stats()).toMatchObject({ queued: 0, closed: true });
    });

    it('close() zaman asiminda takilmaz; kalan dusurulur ve sayilir', async () => {
        const model = { insertMany: jest.fn(() => new Promise(() => undefined)) }; // hic donmez
        const w = new LogWriter({ model: model as any, batchSize: 5 });
        for (let i = 0; i < 12; i++) w.offer(rec('error'));
        const t0 = Date.now();
        await w.close(60);
        expect(Date.now() - t0).toBeLessThan(500);
        expect(w.stats().dropped).toBeGreaterThan(0);
    });

    it('closeLogPersistence: kanca sokulur + kuyruk bosalir (bootstrap shutdown adimi)', async () => {
        const f = fakeModel();
        installLogPersistence({ enabled: true, model: f.model });
        logger.error({ code: 'X' }, 'kapanis oncesi');
        await closeLogPersistence(1000);
        expect(f.total()).toBe(1);
        expect(getLogWriter()).toBeUndefined();
        logger.error({ code: 'X' }, 'kapanis sonrasi');
        await new Promise((r) => setTimeout(r, 20));
        expect(f.total()).toBe(1);
    });
});

describe('maske: yazicida IKINCI kontrol', () => {
    it('sink e maskesiz ulasan e-posta/telefon/token/PII anahtar/err.message kalici belgeye SIZMAZ', async () => {
        const f = fakeModel(); const w = new LogWriter({ model: f.model });
        w.offer(rec('error', 'musteri ali@example.com 0532 123 45 67 Bearer abcdef123456789 aradi', {
            email: 'ali@example.com', customerPhone: '05321234567', password: 'pw123', note: 'token=SUPERSECRETVALUE1',
            err: { type: 'Error', message: 'kimlik TCKN: 12345678901 hatali', stack: 'Error: x\n at f (a.ts:1)' },
        }));
        await w.flush();
        const json = JSON.stringify(f.calls.flat());
        for (const leak of ['ali@example.com', '05321234567', '0532 123 45 67', 'abcdef123456789', 'pw123', 'SUPERSECRETVALUE1', '12345678901']) {
            expect(json).not.toContain(leak);
        }
        expect(f.calls.flat()[0].msg).toContain('[REDACTED');
    });

    it('ctx en fazla 2 KB; msg <=1000 karakter', () => {
        const big: Record<string, unknown> = {};
        for (let i = 0; i < 100; i++) big['k' + i] = 'x'.repeat(100);
        const d = toLogEventDoc(rec('error', 'm'.repeat(5000), big));
        expect(Buffer.byteLength(JSON.stringify(d.ctx))).toBeLessThanOrEqual(2048);
        expect((d.ctx as any)._truncated.length).toBeGreaterThan(0);
        expect(d.msg!.length).toBeLessThanOrEqual(1000);
    });
});

describe('logger kancasi: alan esleme', () => {
    it('logger.error -> belge: source/code/errorClass/tenantId/correlationId/fingerprint/module + child bagi (integ) ctx', () => {
        const seen: LogSinkRecord[] = [];
        setLogSink((r) => seen.push(r));
        runWithContext({ requestId: 'req-12345678', tenantId: 42, source: 'engine', integrationCode: 'trendyol', operation: 'order.sync' }, () => {
            logger.child({ module: 'OrderWorker', integ: 'trendyol' }).error({ code: 'ORDER_FAIL', err: new TypeError('kotu') }, 'siparis alinamadi 77');
        });
        expect(seen).toHaveLength(1);
        const d = toLogEventDoc(seen[0]);
        expect(d).toMatchObject({ level: 'error', source: 'engine', module: 'OrderWorker', code: 'ORDER_FAIL', errorClass: 'TypeError', tenantId: 42, correlationId: 'req-12345678', integrationCode: 'trendyol', operation: 'order.sync' });
        expect(d.fingerprint).toBeTruthy();
        expect((d.ctx as any).err.message).toBe('kotu');
        expect((d.ctx as any).integ).toBe('trendyol');
    });

    it('seviye kapali (LOG_LEVEL altinda) kayitlar sink e GITMEZ', () => {
        const seen: LogSinkRecord[] = [];
        setLogSink((r) => seen.push(r));
        logger.trace('cok ayrintili');
        expect(seen).toHaveLength(0);
    });
});

describe('yuk: 5.000 log/sn', () => {
    it('logger cagrisi gecikmesi: kalici yazim acikken artis ihmal edilebilir; insert olay dongusunu bloklamaz', async () => {
        const N = 5000;
        const measure = () => {
            const d: number[] = [];
            for (let i = 0; i < N; i++) { const t = process.hrtime.bigint(); logger.warn({ code: 'LOAD', i }, 'yuk testi ' + i); d.push(Number(process.hrtime.bigint() - t) / 1e6); }
            d.sort((a, b) => a - b);
            return { p95: d[Math.floor(N * 0.95)], p50: d[Math.floor(N * 0.5)], total: d.reduce((s, x) => s + x, 0) };
        };
        measure(); // isinma
        const off = measure();
        const f = fakeModel(25); // insert basina 25 ms gecikme
        const w = new LogWriter({ model: f.model, level: 'warn', maxQueue: 10_000 });
        setLogSink(w.offer);
        const t0 = Date.now();
        const on = measure();
        const loopMs = Date.now() - t0;
        // eslint-disable-next-line no-console
        process.stderr.write(`[yuk] p95 kapali=${off.p95.toFixed(4)}ms acik=${on.p95.toFixed(4)}ms; p50 kapali=${off.p50.toFixed(4)}ms acik=${on.p50.toFixed(4)}ms; 5000 cagri=${loopMs}ms
`);
        expect(on.p95).toBeLessThan(off.p95 + 0.25);
        expect(on.total).toBeLessThan(off.total * 3 + 250);
        expect(f.model.insertMany).not.toHaveBeenCalled(); // senkron dongu boyunca tek insert bile beklenmedi
        await w.flush();
        expect(f.total()).toBe(N);
        expect(w.stats().dropped).toBe(0);
        expect(Math.max(...f.calls.map((c) => c.length))).toBeLessThanOrEqual(200);
    });
});

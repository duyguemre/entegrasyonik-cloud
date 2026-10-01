/**
 * `platform/core/logger`: gerçek pino kullanılır (mock YOK, DB/Redis/ağ bağımlılığı yok -- yalnızca stdout'a yazar).
 * `JEST_WORKER_ID` altında hedef SENKRONdur (bkz. logger.ts createDestination) -- flush beklemeye gerek yok.
 * Çıktıyı yakalamak için `process.stdout.write` spy'lanır (pino.destination fd 1'e YAZAR; bu en güvenilir yakalama yolu).
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

function captureStdout() {
    const lines: string[] = [];
    const spy = jest.spyOn(process.stdout, 'write').mockImplementation(((chunk: any) => {
        lines.push(String(chunk));
        return true;
    }) as any);
    return { lines, restore: () => spy.mockRestore() };
}

function freshLogger() {
    let mod: typeof import('@platform/core/logger');
    let ctx: typeof import('@platform/core/context');
    // `jest.isolateModules` yeni bir modül kayıt defteri açar; `@platform/core/context` da İÇİNDE gerekir
    // (transitive bağımlılık) -- ayrı bir `require('@platform/core/context')` FARKLI bir AsyncLocalStorage
    // kopyasına düşer (bkz. api-manager.test.ts'teki AYNI desen).
    jest.isolateModules(() => {
        mod = require('@platform/core/logger');
        ctx = require('@platform/core/context');
    });
    return { ...mod!, ctx: ctx! };
}

describe('logger (pino cephesi)', () => {
    let cap: ReturnType<typeof captureStdout>;
    beforeEach(() => { cap = captureStdout(); });
    afterEach(() => { cap.restore(); });

    it('alan sözleşmesi: time, level, msg, svc, role, pod, env, ver satırda bulunur', () => {
        const { logger } = freshLogger();
        logger.info('merhaba');
        const line = JSON.parse(cap.lines[cap.lines.length - 1]);
        expect(line.msg).toBe('merhaba');
        expect(line.svc).toBe('entegrasyonik-api');
        expect(line.level).toBe('info');
        expect(['local', 'staging', 'production']).toContain(line.env);
        expect(typeof line.time).toBe('string');
        expect(typeof line.ver).toBe('string');
    });

    it('mergingObject + msg imzası: alanlar satıra eklenir', () => {
        const { logger } = freshLogger();
        logger.info({ op: 'test-op', durationMs: 12 }, 'işlem bitti');
        const line = JSON.parse(cap.lines[cap.lines.length - 1]);
        expect(line.op).toBe('test-op');
        expect(line.durationMs).toBe(12);
        expect(line.msg).toBe('işlem bitti');
    });

    it('sır alanları REDAKTE edilir (girdideki gerçek değer log satırında YOK)', () => {
        const { logger } = freshLogger();
        logger.info({ password: 'cok-gizli-deger-123' }, 'giriş denemesi');
        const raw = cap.lines[cap.lines.length - 1];
        expect(raw).not.toContain('cok-gizli-deger-123');
        expect(JSON.parse(raw).password).toBe('[REDACTED]');
    });

    it('child({module}): satıra "module" alanı eklenir', () => {
        const { logger } = freshLogger();
        const child = logger.child({ module: 'ApiManager' });
        child.info('çocuk logger');
        const line = JSON.parse(cap.lines[cap.lines.length - 1]);
        expect(line.module).toBe('ApiManager');
    });

    it('AsyncLocalStorage bağlamı aktifken reqId/tenantId/userSub satıra otomatik eklenir (mixin)', async () => {
        const { logger, ctx } = freshLogger();
        ctx.runWithContext({ requestId: 'req-xyz', tenantId: 9, userSub: 'u9' }, () => {
            logger.info('bağlamlı log');
        });
        const line = JSON.parse(cap.lines[cap.lines.length - 1]);
        expect(line).toMatchObject({ reqId: 'req-xyz', tenantId: 9, userSub: 'u9' });
    });

    it('bağlam YOKKEN reqId alanı satırda bulunmaz', () => {
        const { logger } = freshLogger();
        logger.info('bağlamsız log');
        const line = JSON.parse(cap.lines[cap.lines.length - 1]);
        expect(line.reqId).toBeUndefined();
    });

    it('taşkın denetimi (Karar 1.5): aynı fp 60 sn içinde YALNIZ İLKİ tam yazılır, sonrakiler YAZILMAZ (sayılır)', () => {
        jest.useFakeTimers();
        try {
            const { logger } = freshLogger();
            const child = logger.child({ module: 'FloodTest' });
            for (let i = 0; i < 5; i++) child.error(new Error('tekrarlayan hata ' + i));
            const errorLines = cap.lines.filter((l) => { try { return JSON.parse(l).level === 'error'; } catch { return false; } });
            expect(errorLines.length).toBe(1); // yalnız ilk tam yazım (pencere henüz kapanmadı)
        } finally {
            jest.useRealTimers();
        }
    });

    it('Error nesnesi doğrudan verilirse err{type,message,stack} olarak serileşir', () => {
        const { logger } = freshLogger();
        logger.warn(new Error('bir hata oldu'));
        const line = JSON.parse(cap.lines[cap.lines.length - 1]);
        expect(line.err).toMatchObject({ type: 'Error', message: 'bir hata oldu' });
        expect(typeof line.err.stack).toBe('string');
    });

    it('mergingObject İÇİNDE (ör. { service, err: e }) verilen Error de err{type,message,stack} olarak DOĞRU serileşir (pino\'nun kendi `err` davranışı ATLATILIR, genel redaksiyon Error\'u {}\'e İNDİRGEMEZ)', () => {
        const { logger } = freshLogger();
        logger.error({ service: 'X', err: new Error('iç içe hata') }, 'bir şeyler ters gitti');
        const line = JSON.parse(cap.lines[cap.lines.length - 1]);
        expect(line.service).toBe('X');
        expect(line.err).toMatchObject({ type: 'Error', message: 'iç içe hata' });
        expect(typeof line.err.stack).toBe('string');
    });

    it('IntegrationError benzeri özel alanlar (ör. code) err nesnesinde KORUNUR', () => {
        const { logger } = freshLogger();
        class FakeIntegrationError extends Error {
            code = 'RATE_LIMITED';
            retryable = true;
            constructor(msg: string) { super(msg); this.name = 'FakeIntegrationError'; } // gerçek IntegrationError/AppError deseniyle AYNI (bkz. IntegrationError.ts:64)
        }
        logger.error({ err: new FakeIntegrationError('sınır aşıldı') });
        const line = JSON.parse(cap.lines[cap.lines.length - 1]);
        expect(line.err).toMatchObject({ type: 'FakeIntegrationError', message: 'sınır aşıldı', code: 'RATE_LIMITED', retryable: true });
    });
});

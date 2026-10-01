import { describe, it, expect, jest, afterEach } from '@jest/globals';

const ENV_KEYS = ['LOG_FORMAT'];
let saved: Record<string, string | undefined> = {};
function saveEnv() { ENV_KEYS.forEach((k) => { saved[k] = process.env[k]; }); }
function restoreEnv() { ENV_KEYS.forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }); }

function loadFresh() {
    let mod: typeof import('@platform/core/logger/consoleBridge');
    jest.isolateModules(() => { mod = require('@platform/core/logger/consoleBridge'); });
    return mod!;
}

describe('installConsoleBridge', () => {
    afterEach(() => { restoreEnv(); });

    it('LOG_FORMAT=legacy: console.* DEĞİŞMEZ (geri alma anahtarı, no-op)', () => {
        saveEnv();
        process.env.LOG_FORMAT = 'legacy';
        const { installConsoleBridge } = loadFresh();
        const originalLog = console.log;
        const handle = installConsoleBridge();
        expect(console.log).toBe(originalLog);
        handle.restore();
    });

    it('LOG_FORMAT=json (varsayılan): console.log/info/warn/error/debug DEĞİŞTİRİLİR', () => {
        saveEnv();
        delete process.env.LOG_FORMAT;
        const { installConsoleBridge } = loadFresh();
        const originalLog = console.log;
        const handle = installConsoleBridge();
        try {
            expect(console.log).not.toBe(originalLog);
        } finally {
            handle.restore();
        }
        expect(console.log).toBe(originalLog);
    });

    it('köprü kurulduktan sonra console.log çağrısı gerçek stdout yazımını TETİKLER (pino üzerinden) ve fırlatmaz', () => {
        saveEnv();
        delete process.env.LOG_FORMAT;
        const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation((() => true) as any);
        const { installConsoleBridge } = loadFresh();
        const handle = installConsoleBridge();
        try {
            expect(() => console.log('\x1b[32mMerhaba\x1b[0m Dünya', { a: 1 })).not.toThrow();
            expect(writeSpy).toHaveBeenCalled();
            const lastCall = writeSpy.mock.calls[writeSpy.mock.calls.length - 1][0] as string;
            const line = JSON.parse(lastCall);
            expect(line.legacy).toBe(true);
            expect(line.msg).not.toMatch(/\x1b\[/); // ANSI temizlenmiş
            expect(line.msg).toContain('Merhaba');
        } finally {
            handle.restore();
            writeSpy.mockRestore();
        }
    });

    it('ikinci installConsoleBridge() çağrısı önceki köprüyü ÖNCE kaldırır (çift-sarma yok)', () => {
        saveEnv();
        delete process.env.LOG_FORMAT;
        const { installConsoleBridge } = loadFresh();
        const original = console.log;
        const h1 = installConsoleBridge();
        const afterFirst = console.log;
        const h2 = installConsoleBridge();
        expect(console.log).not.toBe(afterFirst);
        h2.restore();
        expect(console.log).toBe(original);
        h1; // ilk handle artık restore() çağrıldığında no-op olabilir; ikinci restore yeterli
    });

    it('restore(): orijinal console.* metotları geri yüklenir', () => {
        saveEnv();
        delete process.env.LOG_FORMAT;
        const { installConsoleBridge } = loadFresh();
        const original = { log: console.log, warn: console.warn, error: console.error };
        const handle = installConsoleBridge();
        handle.restore();
        expect(console.log).toBe(original.log);
        expect(console.warn).toBe(original.warn);
        expect(console.error).toBe(original.error);
    });
});

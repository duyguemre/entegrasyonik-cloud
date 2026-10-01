// [F-06] Yapılandırılmış log çıktısını (pino -> process.stdout, JSON satırları) test içinde yakalar.
// Eski `console.*` casus (spy) doğrulamalarının yerine geçer: motor/adaptör artık `eventLog` (platform/core/logger) kullanır.
// `jest.restoreAllMocks()` (çoğu test dosyasının afterEach'i) casusu otomatik geri alır; yine de `restore()` vardır.
import { jest } from '@jest/globals';
import { resetLoggerForTests } from '@platform/core/logger';

export interface CapturedLog {
    level: string;
    msg?: string;
    code?: string;
    source?: string;
    module?: string;
    errorClass?: string;
    fingerprint?: string;
    correlationId?: string;
    tenantId?: number | string;
    integrationCode?: string;
    operation?: string;
    err?: { type?: string; message?: string; code?: string; stack?: string } | string;
    [k: string]: unknown;
}

export interface LogCapture {
    lines: CapturedLog[];
    /** Koşula uyan ilk satır (yoksa undefined). */
    find(pred: (l: CapturedLog) => boolean): CapturedLog | undefined;
    filter(pred: (l: CapturedLog) => boolean): CapturedLog[];
    clear(): void;
    restore(): void;
}

/** stdout'a yazılan JSON log satırlarını toplar (yazımı bastırır). Taşkın denetimi durumu sıfırlanır. */
export function captureLogs(): LogCapture {
    resetLoggerForTests();
    const lines: CapturedLog[] = [];
    const spy = jest.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
        for (const raw of String(chunk).split('\n')) {
            const t = raw.trim();
            if (!t.startsWith('{')) continue;
            try { lines.push(JSON.parse(t) as CapturedLog); } catch { /* JSON olmayan satır: yoksay */ }
        }
        return true;
    }) as never);
    return {
        lines,
        find: (pred) => lines.find(pred),
        filter: (pred) => lines.filter(pred),
        clear: () => { lines.length = 0; },
        restore: () => spy.mockRestore(),
    };
}

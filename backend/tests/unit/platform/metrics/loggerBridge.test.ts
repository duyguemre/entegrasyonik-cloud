/**
 * YENİ DAVRANIŞ (ADR-0017 Karar 2.4): `installErrorEventLoggerBridge()` -- `logger.error(...)` çağrılan HER
 * yerde (60 sn taşkın denetiminden BAĞIMSIZ) bir `ErrorEvent` üretir. Bağımlılık YÖNÜ tersine çevrilmiştir
 * (`platform/core/logger` Sv2 hiçbir zaman `platform/runtime/metrics` Sv5'i BİLMEZ -- ADR-0016 §1.2).
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

describe('installErrorEventLoggerBridge', () => {
    beforeEach(() => { jest.useFakeTimers(); });
    afterEach(() => { jest.useRealTimers(); jest.resetModules(); });

    it('kurulduktan sonra logger.error(...) recordErrorEvent\'i doğru alanlarla tetikler', () => {
        let logMod: typeof import('@platform/core/logger');
        let bridgeMod: typeof import('@platform/runtime/metrics/loggerBridge');
        let errorEventsMod: typeof import('@platform/runtime/metrics/errorEvents');
        jest.isolateModules(() => {
            logMod = require('@platform/core/logger');
            errorEventsMod = require('@platform/runtime/metrics/errorEvents');
            bridgeMod = require('@platform/runtime/metrics/loggerBridge');
        });
        const spy = jest.spyOn(errorEventsMod!, 'recordErrorEvent').mockImplementation(() => {});
        bridgeMod!.installErrorEventLoggerBridge();

        const child = logMod!.logger.child({ module: 'TestMod' });
        child.error(new Error('bir hata'));

        expect(spy).toHaveBeenCalledWith(expect.objectContaining({ source: 'server', module: 'TestMod', message: 'bir hata' }));
        bridgeMod!.uninstallErrorEventLoggerBridgeForTests();
    });

    it('kanca kurulu DEĞİLKEN logger.error hiçbir şeyi ETKİLEMEZ (mevcut davranış korunur, fırlatmaz)', () => {
        let logMod: typeof import('@platform/core/logger');
        jest.isolateModules(() => { logMod = require('@platform/core/logger'); });
        expect(() => logMod!.logger.error('bağlamsız hata')).not.toThrow();
    });

    it('kanca fırlatırsa (beklenmedik) logger.error YİNE DE tamamlanır (try/catch)', () => {
        let logMod: typeof import('@platform/core/logger');
        jest.isolateModules(() => { logMod = require('@platform/core/logger'); });
        logMod!.setErrorHook(() => { throw new Error('hook patladı'); });
        expect(() => logMod!.logger.error('hata')).not.toThrow();
        logMod!.setErrorHook(undefined);
    });
});

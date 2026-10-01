import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { FloodControl, fingerprintOf } from '@platform/core/logger/floodControl';

describe('fingerprintOf', () => {
    it('mesajdaki rakamlar # ile normalize edilir (aynı şablon -> aynı fp)', () => {
        expect(fingerprintOf('mod', 'CODE', 'sipariş 123 bulunamadı')).toBe(fingerprintOf('mod', 'CODE', 'sipariş 456 bulunamadı'));
    });
    it('modül veya kod farklıysa fp farklıdır', () => {
        expect(fingerprintOf('a', 'C1', 'x')).not.toBe(fingerprintOf('b', 'C1', 'x'));
        expect(fingerprintOf('a', 'C1', 'x')).not.toBe(fingerprintOf('a', 'C2', 'x'));
    });
});

describe('FloodControl', () => {
    beforeEach(() => { jest.useFakeTimers(); });
    afterEach(() => { jest.useRealTimers(); });

    it('ilk oluş TAM yazılmalı (admit true); 60 sn penceresi kapanana dek sonrakiler bastırılır (admit false)', () => {
        const onClose = jest.fn();
        const fc = new FloodControl(onClose, 60_000);
        expect(fc.admit('fp1')).toBe(true);
        expect(fc.admit('fp1')).toBe(false);
        expect(fc.admit('fp1')).toBe(false);
        expect(onClose).not.toHaveBeenCalled();
    });

    it('pencere kapanınca bastırılan sayı ile TEK warn tetiklenir', () => {
        const onClose = jest.fn();
        const fc = new FloodControl(onClose, 60_000);
        fc.admit('fp1'); fc.admit('fp1'); fc.admit('fp1');
        jest.advanceTimersByTime(60_000);
        expect(onClose).toHaveBeenCalledWith('fp1', 2); // ilk hariç 2 bastırılmış
    });

    it('pencere kapandıktan sonra AYNI fp yeniden "ilk oluş" gibi davranır', () => {
        const onClose = jest.fn();
        const fc = new FloodControl(onClose, 1000);
        fc.admit('fp1');
        jest.advanceTimersByTime(1000);
        expect(fc.admit('fp1')).toBe(true);
    });

    it('hiç tekrar yoksa (yalnız 1 admit) pencere kapanınca onClose ÇAĞRILMAZ (suppressed=0)', () => {
        const onClose = jest.fn();
        const fc = new FloodControl(onClose, 1000);
        fc.admit('fp1');
        jest.advanceTimersByTime(1000);
        expect(onClose).not.toHaveBeenCalled();
    });

    it('farklı fp\'ler BAĞIMSIZ pencerelerde izlenir', () => {
        const onClose = jest.fn();
        const fc = new FloodControl(onClose, 1000);
        fc.admit('a'); fc.admit('a');
        fc.admit('b');
        jest.advanceTimersByTime(1000);
        expect(onClose).toHaveBeenCalledWith('a', 1);
        expect(onClose).not.toHaveBeenCalledWith('b', expect.anything());
    });

    it('flushAll: bekleyen pencereleri hemen kapatır (test yardımcısı)', () => {
        const onClose = jest.fn();
        const fc = new FloodControl(onClose, 60_000);
        fc.admit('fp1'); fc.admit('fp1');
        fc.flushAll();
        expect(onClose).toHaveBeenCalledWith('fp1', 1);
    });

    it('dispose: bekleyen zamanlayıcıları temizler (kapanışta çağrılmalı)', () => {
        const onClose = jest.fn();
        const fc = new FloodControl(onClose, 60_000);
        fc.admit('fp1'); fc.admit('fp1');
        fc.dispose();
        jest.advanceTimersByTime(60_000);
        expect(onClose).not.toHaveBeenCalled();
    });
});

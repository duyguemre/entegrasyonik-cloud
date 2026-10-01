// ADR-0020 Karar 2.2 "çapraz doğrulama" — saf fonksiyon testleri, DB/ağ YOK.
import { describe, it, expect } from '@jest/globals';
import { runCrossChecks, CROSS_CHECK_RULES } from '@integration/config/crossChecks';

function getValueFrom(map: Record<string, unknown>) {
    return (key: string) => map[key];
}

describe('ADR-0020 Karar 2.2 — runCrossChecks', () => {
    it('bugünkü katalog varsayılanları (cursorOverlapMs=3600000, intervalMs=900000, chunkSize=30) HİÇBİR kuralı ihlal etmez', () => {
        const issues = runCrossChecks(getValueFrom({
            'order.claimSync.cursorOverlapMs': 3600000,
            'order.claimSync.intervalMs': 900000,
            'export.publisher.chunkSize': 30,
        }));
        expect(issues).toEqual([]);
    });

    it('cursorOverlapMs, intervalMs×4\'ü AŞARSA ihlal raporlanır', () => {
        const issues = runCrossChecks(getValueFrom({
            'order.claimSync.cursorOverlapMs': 4000001,
            'order.claimSync.intervalMs': 1000000,
        }));
        expect(issues).toEqual([expect.stringContaining('order.claimSync.cursorOverlapMs')]);
    });

    it('export.publisher.chunkSize Trendyol sınırını (1000) aşarsa ihlal raporlanır', () => {
        const issues = runCrossChecks(getValueFrom({ 'export.publisher.chunkSize': 1001 }));
        expect(issues).toEqual([expect.stringContaining('export.publisher.chunkSize')]);
    });

    it('ilgili anahtarlar hiç verilmemişse (undefined) kural sessizce geçer (null döner)', () => {
        expect(runCrossChecks(getValueFrom({}))).toEqual([]);
    });

    it('birden fazla ihlal aynı anda raporlanabilir', () => {
        const issues = runCrossChecks(getValueFrom({
            'order.claimSync.cursorOverlapMs': 9999999,
            'order.claimSync.intervalMs': 1,
            'export.publisher.chunkSize': 5000,
        }));
        expect(issues.length).toBe(2);
    });

    it('kural kayıt tablosu boş değildir ve her kuralın TR/EN açıklaması vardır', () => {
        expect(CROSS_CHECK_RULES.length).toBeGreaterThan(0);
        for (const r of CROSS_CHECK_RULES) {
            expect(r.description.tr.length).toBeGreaterThan(0);
            expect(r.description.en.length).toBeGreaterThan(0);
        }
    });
});

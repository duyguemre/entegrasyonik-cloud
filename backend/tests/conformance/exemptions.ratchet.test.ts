// INT-03 ratchet: conformance KNOWN_OPEN (bugün başarısız senaryolar) sayısı ARTAMAZ; yalnız INT-05 adaptörleri düzelttikçe azalır.
// Tabanı aşağı çekmek için ilgili adaptör senaryosunu düzelt, KNOWN_OPEN'dan sil ve aşağıdaki sayıyı düşür. Yukarı çekmek YASAK.
import { describe, it, expect } from '@jest/globals';
import { KNOWN_OPEN, NOT_APPLICABLE, SCENARIO_IDS } from './exemptions';

const BASELINE_MAX_TOTAL = 0; // 2026-09-30 (faz4-conf-close): 8 -> 5 (C10c HB/Ideasoft/Bizimhesap) -> 2 (Bizimhesap C6b/C7a/C12)-> 0 (Ideasoft C7a/C12); KNOWN_OPEN boş
const BASELINE_MAX: Record<string, number> = { trendyol: 0, bizimhesap: 0, hepsiburada: 0, ideasoft: 0 };

const count = (t: typeof KNOWN_OPEN) => Object.values(t).reduce((n, row) => n + Object.keys(row ?? {}).length, 0);

describe('conformance istisna mandalı (exemptions.ts)', () => {
    it('KNOWN_OPEN toplamı ve adaptör başına sayısı tabanı aşmaz', () => {
        expect(count(KNOWN_OPEN)).toBeLessThanOrEqual(BASELINE_MAX_TOTAL);
        for (const [code, row] of Object.entries(KNOWN_OPEN)) {
            expect(Object.keys(row ?? {}).length).toBeLessThanOrEqual(BASELINE_MAX[code] ?? 0);
        }
    });

    it('her istisna geçerli bir senaryo kimliği + dolu gerekçe taşır', () => {
        for (const table of [KNOWN_OPEN, NOT_APPLICABLE]) {
            for (const row of Object.values(table)) {
                for (const [id, reason] of Object.entries(row ?? {})) {
                    expect((SCENARIO_IDS as readonly string[]).includes(id)).toBe(true);
                    expect(String(reason).trim().length).toBeGreaterThan(10);
                }
            }
        }
    });
});

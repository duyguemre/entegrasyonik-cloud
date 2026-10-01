/**
 * ADR-0017 Karar 1.7 adım 3 ("Fırsatçı göç + mandal"): `src/**` (+`entegrasyonik.ts`) içindeki literal
 * `console.(log|info|warn|error|debug)` çağrı SAYISI ARTAMAZ. Bu sayı, bu görevin BAŞLADIĞI (2026-09-28,
 * `platform/core/logger` öncesi) andaki ham sayımdır -- `docs/BACKEND_CODE_AUDIT.md`'deki "314" ile aynı yöntemle
 * hesaplanmamış olabilir (o rakam dosya bazlı farklı bir tarama olabilir); buradaki taban KENDİ ÖLÇÜM YÖNTEMİYLE
 * tutarlıdır ve yalnız KÜÇÜLEBİLİR (dokunulan her dosya `logger.child({module})`'a göç ettirildikçe).
 * `tests/**`, `dev-tools/**` KAPSAM DIŞI (üretim kodu değil).
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const SRC_ROOT = path.resolve(__dirname, '../../src');
const ENTRY_FILE = path.resolve(__dirname, '../../entegrasyonik.ts');
const BASELINE_MAX = 162; // 2026-09-30: 330 -> 162 (gercek sayim; eslint ratchet dosya basina no-console sayar ve tests/ dahildir: 169)
const PATTERN = /console\.(log|info|warn|error|debug)\s*\(/g;

function listTsFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...listTsFiles(full));
        else if (entry.isFile() && /\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) out.push(full);
    }
    return out;
}

describe('static: console.* çağrısı mandalı (üretim kodu)', () => {
    it(`src/** + entegrasyonik.ts toplamda en fazla ${BASELINE_MAX} console.(log|info|warn|error|debug)( çağrısı içerir`, () => {
        const files = [...listTsFiles(SRC_ROOT), ENTRY_FILE];
        let total = 0;
        const perFile: Record<string, number> = {};
        for (const f of files) {
            const content = fs.readFileSync(f, 'utf8');
            const matches = content.match(PATTERN);
            if (matches && matches.length > 0) {
                perFile[path.relative(path.resolve(__dirname, '../..'), f)] = matches.length;
                total += matches.length;
            }
        }
        if (total > BASELINE_MAX) {
            throw new Error(`console.* çağrı sayısı ${total} (taban ${BASELINE_MAX}) — yeni çağrılar logger.child({module}) kullanmalı.\n` + JSON.stringify(perFile, null, 2));
        }
        expect(total).toBeLessThanOrEqual(BASELINE_MAX);
    });
});

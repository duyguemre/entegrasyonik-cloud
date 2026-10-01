/**
 * ADR-0017 §10 / ADR-0016 B-R5: mandal — `src/config/**` (ve `entegrasyonik.ts` bootstrap katmanı, henüz ayrı bir
 * `bootstrap/` yok) DIŞINDA literal `process.env.X` / `process.env[...]` okuma SAYISI ARTAMAZ (taban: bu görevde
 * 74 -> 47'ye düşürüldü; kalanlar TODO(B-R5) — Faz 1'de servis servis göçürülür). Bu test kaynağı DEĞİL SAYIYI kilitler;
 * azaltma HER ZAMAN serbesttir (taban indirilir).
 *
 * Kapsam dışı (bilinçli): `dev-tools/**` (derleme dışı operasyonel betikler; egress-guard, seed, migration script'leri),
 * `tests/**` (test ortamı kendi env'ini kurar), `src/config/**` (şemanın kendisi).
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const SRC_ROOT = path.resolve(__dirname, '../../src');
const ENTRY_FILE = path.resolve(__dirname, '../../entegrasyonik.ts');
// Mevcut taban (bu görev öncesi 74 idi; ADR-0016 B-R5 ile 47'ye, faz4-env ile 43'e indirildi). Yeni process.env okuması bu sayıyı AŞAMAZ.
const BASELINE_MAX = 43;
const PATTERN = /process\.env(?:\.[A-Za-z_$][A-Za-z0-9_$]*|\[)/g;

function listTsFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (full === path.resolve(SRC_ROOT, 'config')) continue; // şemanın kendisi hariç
            out.push(...listTsFiles(full));
        } else if (entry.isFile() && /\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) {
            out.push(full);
        }
    }
    return out;
}

describe('static: process.env okuması mandalı (config/ dışında)', () => {
    it(`src/** (config/ hariç) + entegrasyonik.ts toplamda en fazla ${BASELINE_MAX} literal process.env okuması içerir`, () => {
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
            throw new Error(`process.env okuma sayısı ${total} (taban ${BASELINE_MAX}) — yeni okumalar @config şemasına eklenmeli.\n` + JSON.stringify(perFile, null, 2));
        }
        expect(total).toBeLessThanOrEqual(BASELINE_MAX);
    });

    it('src/config/** DIŞINDaki hiçbir dosya process.env değerini DOĞRUDAN throw/hata mesajına yazmaz (sırsız hata metni)', () => {
        // Bilinen güvenli örüntüler dışında `process.env.X` bir template literal/concat içinde `throw`/`Error(` argümanına
        // GEÇMEMELİ (değer sızıntısı). Kaba ama etkili bir imza taraması.
        const files = listTsFiles(SRC_ROOT);
        const suspicious: string[] = [];
        for (const f of files) {
            const content = fs.readFileSync(f, 'utf8');
            const lines = content.split('\n');
            lines.forEach((line, idx) => {
                if (/process\.env/.test(line) && /(throw|new Error\()/.test(line) && /\$\{[^}]*process\.env/.test(line)) {
                    suspicious.push(`${path.relative(SRC_ROOT, f)}:${idx + 1}`);
                }
            });
        }
        expect(suspicious).toEqual([]);
    });
});

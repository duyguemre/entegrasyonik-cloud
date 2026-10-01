// Koruma: backend/tests ve backend/src altinda sir desenine uyan DUZ METIN olmamali.
// Desen scripts/cloud-sync.sh SECRET_RE ile AYNIDIR (R2 hesap kimligi dahil); bulut disa aktarimi buna takilirsa kirilir.
// Sahte sabitler calisma aninda birlestirilmeli: 'mongodb://user' + ':secret123@host', 'AKIA' + 'IOSFODNN7EXAMPLE'.
// tests/characterization/secrets disa aktarilmadigi icin taranmaz.
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const SECRET_RE = new RegExp(String.raw`mongodb(\+srv)?://[^\s"'{}]+:[^\s"'@{}]{6,}@|ee14b` + String.raw`267|-----BEGIN [A-Z ]*PRIVATE KEY|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9]{20,}`);
const ROOT = path.resolve(__dirname, '..', '..');
const SKIP = new Set(['node_modules', 'secrets', 'dist', '.git']);

function walk(dir: string, out: string[]): string[] {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(path.join(dir, e.name), out); }
        else if (/\.(ts|js|json|cjs|mjs|md|yml|yaml)$/.test(e.name)) out.push(path.join(dir, e.name));
    }
    return out;
}

describe('sir deseni: duz metin yok (cloud-sync SECRET_RE)', () => {
    it('backend/tests ve backend/src sir desenine uymaz', () => {
        const files = [...walk(path.join(ROOT, 'tests'), []), ...walk(path.join(ROOT, 'src'), [])]
            .filter(f => f !== __filename);
        const hits = files.filter(f => SECRET_RE.test(fs.readFileSync(f, 'utf8')) ).map(f => path.relative(ROOT, f));
        expect(hits).toEqual([]);
    });
});

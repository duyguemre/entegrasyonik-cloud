// ADR-0024 BA-13 / P2-MOVE: `jest.mock` hedefi YALNIZCA yeniden-dışa-aktarma içeren bir dosya (taşıma shim'i) olamaz.
// Shim'i taklit etmek gerçek modülü taklit etmez (gerçek yolu içe aktaranlar taklidi görmez); taşıma sonrası testler sessizce
// boşa düşer. Hedef her zaman gerçek uygulama dosyası olmalı (dönüştürücü: dev-tools/codemods/move-module.js).
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

const root = path.resolve(__dirname, '../..');
const JEST_FNS = new Set(['mock', 'doMock', 'setMock', 'requireActual', 'requireMock']);
const EXT = ['', '.ts', '.js', '/index.ts', '/index.js'];

function walk(dir: string, acc: string[] = []): string[] {
    for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        if (fs.statSync(p).isDirectory()) walk(p, acc);
        else if (p.endsWith('.ts')) acc.push(p);
    }
    return acc;
}

function resolveRelative(from: string, spec: string): string | null {
    for (const ext of EXT) {
        const cand = path.resolve(path.dirname(from), spec) + ext;
        if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
    }
    return null;
}

/**
 * Dosyadaki tüm deyimler `export … from '…'` ise (yorumlar hariç) shim'dir. `index.ts` barrel'ları (modülün kamu yüzü:
 * api/admin, api/oauth, mcp) shim DEĞİLDİR: tüketiciler barrel'ı içe aktarır, taklit edilmesi doğrudur.
 */
function isReexportOnly(file: string): boolean {
    if (/[\\/]index\.ts$/.test(file)) return false;
    const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    return sf.statements.length > 0 && sf.statements.every((s) => ts.isExportDeclaration(s) && !!s.moduleSpecifier);
}

function mockTargets(file: string): string[] {
    const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const out: string[] = [];
    const visit = (n: ts.Node) => {
        if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && ts.isIdentifier(n.expression.expression)
            && n.expression.expression.text === 'jest' && JEST_FNS.has(n.expression.name.text)
            && n.arguments.length && ts.isStringLiteralLike(n.arguments[0])) out.push(n.arguments[0].text);
        ts.forEachChild(n, visit);
    };
    visit(sf);
    return out;
}

describe('jest.mock hedefi shim olamaz (ADR-0024 BA-13)', () => {
    it('tests/** içindeki göreli jest.mock/doMock hedeflerinin hiçbiri yalnız yeniden-dışa-aktarma dosyası değil', () => {
        const offenders: string[] = [];
        let checked = 0;
        for (const file of walk(path.join(root, 'tests'))) {
            for (const spec of mockTargets(file)) {
                if (!spec.startsWith('.')) continue;
                const target = resolveRelative(file, spec);
                if (!target || !target.startsWith(path.join(root, 'src'))) continue;
                checked++;
                if (isReexportOnly(target)) offenders.push(`${path.relative(root, file)} -> ${spec}`);
            }
        }
        expect(checked).toBeGreaterThan(0);
        expect(offenders).toEqual([]);
    });
});

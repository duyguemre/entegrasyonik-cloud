#!/usr/bin/env node
/**
 * ADR-0024 BA-13 / P2-MOVE: dosya taşıma kod dönüştürücüsü (codemod). Davranış DEĞİŞTİRMEZ; yalnızca dosya yerini ve
 * modül yollarını günceller.
 *
 * Ne yapar:
 *   1. Harita dosyasındaki her `{ from, to }` için `git mv from to` (geçmiş izlenebilir kalır).
 *   2. `{ from, retarget, delete: true }` (yeniden-dışa-aktarma shim'i): içe aktaranlar `retarget`'e yönlendirilir, shim silinir.
 *   3. Taranan TÜM dosyalarda (entegrasyonik.ts, src, tests, scripts, migrations) şu modül yollarını yeniden yazar:
 *      `import … from`, `export … from`, `import x = require()`, `require()`, `require.resolve()`, dinamik `import()`,
 *      `import('…')` tip düğümleri ve `jest.mock|doMock|unmock|dontMock|setMock|requireActual|requireMock|createMockFromModule`.
 *      Yol biçimi korunur: göreli yol göreli kalır (yeni konuma göre), alias (`@api/…`) alias kalır, çıplak `src/…` çıplak kalır,
 *      `…/index` / dizin biçimi ve uzantı korunur. Tırnak türü değişmez.
 *
 * Kullanım (backend/ içinden):
 *   node dev-tools/codemods/move-module.js <harita.json>            # kuru çalıştırma: yalnız planı yazdırır
 *   node dev-tools/codemods/move-module.js <harita.json> --write    # uygular
 * Harita: `{ "moves": [{ "from": "src/a/X.ts", "to": "src/b/X.ts" }], "retargets": [{ "from": "src/a/Shim.ts", "retarget": "src/c/Real.ts" }] }`
 * Dizin girdisi (`"from": "src/api/services/"`, `"to": "src/api/rpc/handlers/"`) içindeki tüm dosyaları taşır.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..', '..');
const SCAN_ROOTS = ['entegrasyonik.ts', 'src', 'tests', 'scripts', 'migrations'];
const SCAN_EXT = /\.(ts|js|cjs|mjs)$/;
const JEST_FNS = new Set(['mock', 'doMock', 'unmock', 'dontMock', 'setMock', 'requireActual', 'requireMock', 'createMockFromModule']);
const RESOLVE_EXT = ['', '.ts', '.js', '.json', '/index.ts', '/index.js'];

const posix = (p) => p.split(path.sep).join('/');
const topDir = (f) => f.split('/').slice(0, 2).join('/');

function loadAliases() {
    const raw = fs.readFileSync(path.join(ROOT, 'tsconfig.json'), 'utf8');
    const json = ts.parseConfigFileTextToJson('tsconfig.json', raw).config;
    const out = [];
    for (const [key, targets] of Object.entries(json.compilerOptions.paths || {})) {
        const target = posix(path.normalize(targets[0])).replace(/^\.\//, '');
        if (key.endsWith('/*')) out.push({ prefix: key.slice(0, -1), dir: target.slice(0, -1), wildcard: true });
        else out.push({ prefix: key, dir: target, wildcard: false });
    }
    return out.sort((a, b) => b.dir.length - a.dir.length);
}
const ALIASES = loadAliases();

function walk(p, acc) {
    const abs = path.join(ROOT, p);
    if (!fs.existsSync(abs)) return acc;
    const st = fs.statSync(abs);
    if (st.isFile()) { if (SCAN_EXT.test(p)) acc.push(posix(p)); return acc; }
    for (const name of fs.readdirSync(abs)) {
        if (name === 'node_modules' || name === 'dist') continue;
        walk(path.join(p, name), acc);
    }
    return acc;
}

/** Yolu dosyaya çözer; `{ file, suffix }` (suffix: yazılı yola eklenen kısım: '', '.ts', '/index.ts' ...). */
function resolveFile(baseNoExt) {
    for (const ext of RESOLVE_EXT) {
        const cand = baseNoExt + ext;
        const abs = path.join(ROOT, cand);
        if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return { file: posix(path.normalize(cand)), suffix: ext };
    }
    return null;
}

/** Bir modül belirtecini (importer'a göre) depo-göreli dosyaya çözer. */
function resolveSpecifier(importer, spec) {
    if (spec.startsWith('.')) {
        const base = posix(path.normalize(path.join(path.dirname(importer), spec)));
        const r = resolveFile(base);
        return r && { ...r, kind: 'relative' };
    }
    if (spec.startsWith('src/')) {
        const r = resolveFile(spec);
        return r && { ...r, kind: 'bare' };
    }
    for (const a of ALIASES) {
        if (a.wildcard && spec.startsWith(a.prefix)) {
            const r = resolveFile(a.dir + spec.slice(a.prefix.length));
            return r && { ...r, kind: 'alias', alias: a };
        }
        if (!a.wildcard && spec === a.prefix) {
            const r = resolveFile(a.dir);
            return r && { ...r, kind: 'alias', alias: a };
        }
    }
    return null; // paket ya da çözülemeyen (sanal mock vb.)
}

/** Yazılı biçimi koruyarak hedef dosya için yeni belirteç üretir. */
function formatSpecifier(kind, alias, newImporter, newTarget, oldSpec, oldSuffix) {
    // Yazılan kısım: hedeften suffix çıkarılmış hâli. '/index.ts' ile çözülmüşse dizin biçimi korunur.
    let written;
    if (oldSuffix === '/index.ts' || oldSuffix === '/index.js') {
        if (!/\/index\.(ts|js)$/.test(newTarget)) throw new Error(`dizin biçimli içe aktarma index olmayan dosyaya taşınıyor: ${oldSpec} -> ${newTarget}`);
        written = newTarget.replace(/\/index\.(ts|js)$/, '');
    } else if (oldSuffix === '') {
        written = newTarget; // uzantı yazılıydı
    } else {
        written = newTarget.slice(0, -oldSuffix.length);
    }
    if (kind === 'relative') {
        let r = posix(path.relative(path.dirname(newImporter), written));
        if (!r.startsWith('.')) r = './' + r;
        if (r === './') r = '.';
        return r;
    }
    if (kind === 'bare') return written;
    // alias: aynı alias hâlâ kapsıyorsa onu, değilse en özel alias'ı kullan
    const pick = [alias, ...ALIASES].find((a) => a.wildcard ? written.startsWith(a.dir) : written === a.dir);
    if (!pick) throw new Error(`alias bulunamadı: ${written}`);
    return pick.wildcard ? pick.prefix + written.slice(pick.dir.length) : pick.prefix;
}

function collectSpecifiers(file, text) {
    const kind = /\.(js|cjs|mjs)$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
    const out = [];
    const push = (lit) => { if (lit && (ts.isStringLiteral(lit) || ts.isNoSubstitutionTemplateLiteral(lit))) out.push({ start: lit.getStart(sf) + 1, end: lit.getEnd() - 1, spec: lit.text }); };
    const visit = (node) => {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) push(node.moduleSpecifier);
        else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) push(node.moduleReference.expression);
        else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) push(node.argument.literal);
        else if (ts.isCallExpression(node) && node.arguments.length) {
            const e = node.expression;
            const isRequire = ts.isIdentifier(e) && e.text === 'require';
            const isImport = e.kind === ts.SyntaxKind.ImportKeyword;
            const isReqResolve = ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === 'require' && e.name.text === 'resolve';
            const isJest = ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === 'jest' && JEST_FNS.has(e.name.text);
            if (isRequire || isImport || isReqResolve || isJest) push(node.arguments[0]);
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return out;
}

function expandMap(map) {
    const moves = new Map(); // eski dosya -> yeni dosya
    for (const m of map.moves || []) {
        if (m.from.endsWith('/')) {
            for (const f of walk(m.from.slice(0, -1), [])) moves.set(f, m.to + f.slice(m.from.length));
        } else moves.set(m.from, m.to);
    }
    const retargets = new Map();
    for (const r of map.retargets || []) retargets.set(r.from, r.retarget);
    for (const [from, to] of moves) {
        if (!fs.existsSync(path.join(ROOT, from))) throw new Error(`kaynak yok: ${from}`);
        if (fs.existsSync(path.join(ROOT, to))) throw new Error(`hedef zaten var: ${to}`);
    }
    return { moves, retargets };
}

function main() {
    const [mapPath, ...flags] = process.argv.slice(2);
    if (!mapPath) { console.error('kullanım: move-module.js <harita.json> [--write]'); process.exit(2); }
    const WRITE = flags.includes('--write');
    const { moves, retargets } = expandMap(JSON.parse(fs.readFileSync(path.resolve(mapPath), 'utf8')));
    const moved = (f) => moves.get(f) || f;

    const files = SCAN_ROOTS.flatMap((r) => walk(r, []));
    const edits = new Map(); // eski dosya -> yeni içerik
    let changedSpecs = 0;
    const unresolvedApi = [];
    for (const file of files) {
        if (retargets.has(file)) continue; // silinecek shim
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        const specs = collectSpecifiers(file, text);
        const repl = [];
        for (const s of specs) {
            const res = resolveSpecifier(file, s.spec);
            if (!res) { if (/(^|\/)api\/|Webserver/.test(s.spec)) unresolvedApi.push(`${file}: ${s.spec}`); continue; }
            let target = res.file;
            let suffix = res.suffix;
            let kind = res.kind;
            let alias = res.alias;
            if (retargets.has(target)) {
                target = retargets.get(target);
                suffix = '.ts';
                // src içinde shim yönlendirmesi katman (src/<üst klasör>) aşıyorsa uzun göreli yol yerine alias kullanılır
                if (kind === 'relative' && file.startsWith('src/') && topDir(target) !== topDir(moved(file))) {
                    kind = 'alias';
                    alias = ALIASES.find((a) => a.wildcard && target.startsWith(a.dir));
                }
            }
            const newTarget = moved(target);
            const newImporter = moved(file);
            if (newTarget === res.file && newImporter === file) continue;
            if (kind !== 'relative' && newTarget === res.file) continue; // alias/bare ve hedef yerinde: yazım aynı
            const next = formatSpecifier(kind, alias, newImporter, newTarget, s.spec, suffix);
            if (next !== s.spec) repl.push({ ...s, next });
        }
        if (!repl.length) continue;
        let out = text;
        for (const r of repl.sort((a, b) => b.start - a.start)) out = out.slice(0, r.start) + r.next + out.slice(r.end);
        edits.set(file, out);
        changedSpecs += repl.length;
        if (!WRITE) for (const r of repl) console.log(`  ${file}: '${r.spec}' -> '${r.next}'`);
    }

    console.log(`\nTaşıma: ${moves.size} dosya, shim yönlendirme/silme: ${retargets.size}, yol değişikliği: ${changedSpecs} (${edits.size} dosya)`);
    for (const [from, to] of moves) console.log(`  mv ${from} -> ${to}`);
    for (const [from, to] of retargets) console.log(`  rm ${from} (içe aktaranlar -> ${to})`);
    if (unresolvedApi.length) console.log(`\nUYARI çözülemeyen api/Webserver belirteçleri (elle kontrol):\n  ${unresolvedApi.join('\n  ')}`);
    if (!WRITE) { console.log('\n(kuru çalıştırma; uygulamak için --write)'); return; }

    for (const [file, content] of edits) fs.writeFileSync(path.join(ROOT, file), content);
    for (const [from, to] of moves) {
        fs.mkdirSync(path.dirname(path.join(ROOT, to)), { recursive: true });
        execFileSync('git', ['mv', from, to], { cwd: ROOT, stdio: 'inherit' });
    }
    for (const from of retargets.keys()) execFileSync('git', ['rm', '-q', from], { cwd: ROOT, stdio: 'inherit' });
    console.log('uygulandı');
}

main();

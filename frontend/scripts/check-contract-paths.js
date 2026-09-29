#!/usr/bin/env node
/**
 * Aşama 0 / R0 — dosya YOLUNA bağlı sözleşme kancalarının varlık denetimi (yalnız okur).
 *
 * Silme/taşıma adımları (R1/R2/R3/R8) şu kancaları kırmamalı; kırıldığında bu betik
 * hangisinin kırıldığını adıyla söyler (bkz. docs/FRONTEND_CODE_AUDIT.md §8.2):
 *  1. backend `operation-policy.test.ts` `DYNAMIC_CALL_FILES_RESOLVED` (frontend/src'e göreli 7 dosya yolu)
 *  2. `site/src/data/pricing.ts` kanıt yolları (`evidence('frontend/...')`)
 *  3. `tests/**` (Vitest) içindeki `../src/...` içe aktarmaları
 *  4. e2e spec kancası olan statik varlıklar (`img[src="/assets/images/logo6.png"]`)
 *  5. `design/tokens/dist/tokens.static.css` (site + Vitest tüketir)
 *  6. `navigation/screens.ts` ↔ `stores/site/menu.ts` `views` anahtarları (Vitest register-intent testi
 *     zaten korur; burada yalnız dosya varlığı)
 */
const fs = require('node:fs');
const path = require('node:path');

const feRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(feRoot, '..');
const problems = [];
const ok = [];

function must(cond, msg) {
  if (cond) ok.push(msg);
  else problems.push(msg);
}
const exists = (p) => fs.existsSync(p);
function walk(d) {
  if (!exists(d)) return [];
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(d, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

// 1. backend operation-policy DYNAMIC_CALL_FILES_RESOLVED
const opTest = path.join(repoRoot, 'backend/tests/characterization/auth/operation-policy.test.ts');
if (exists(opTest)) {
  const text = fs.readFileSync(opTest, 'utf8');
  const m = /const DYNAMIC_CALL_FILES_RESOLVED = \[([\s\S]*?)\];/.exec(text);
  must(!!m, 'operation-policy.test.ts: DYNAMIC_CALL_FILES_RESOLVED bulundu');
  if (m) {
    for (const f of [...m[1].matchAll(/^\s*'([^']+\.(?:ts|vue))'/gm)].map((x) => x[1])) {
      must(exists(path.join(feRoot, 'src', f)), `op-policy DYNAMIC_CALL_FILES_RESOLVED -> frontend/src/${f}`);
    }
  }
} else {
  ok.push('backend op-policy testi yok (atlandı)');
}

// 2. site kanıt yolları
const pricing = path.join(repoRoot, 'site/src/data/pricing.ts');
if (exists(pricing)) {
  for (const m of fs.readFileSync(pricing, 'utf8').matchAll(/evidence\('(frontend\/[^']+)'/g)) {
    must(exists(path.join(repoRoot, m[1])), `site pricing kanıt yolu -> ${m[1]}`);
  }
}

// 3. Vitest içe aktarmaları
for (const f of walk(path.join(feRoot, 'tests')).filter((x) => /\.ts$/.test(x))) {
  const text = fs.readFileSync(f, 'utf8');
  for (const m of text.matchAll(/from\s+['"](\.{1,2}\/[^'"]*src\/[^'"]+)['"]/g)) {
    const base = path.resolve(path.dirname(f), m[1]);
    const hit = ['', '.ts', '.vue', '/index.ts'].some((ext) => exists(base + ext));
    must(hit, `${path.relative(feRoot, f)} içe aktarır -> ${m[1]}`);
  }
}

// 4. e2e statik varlık kancaları
for (const f of walk(path.join(feRoot, 'e2e')).filter((x) => /\.ts$/.test(x))) {
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/src="(\/assets\/[^"]+)"/g)) {
    must(exists(path.join(feRoot, 'public', m[1])), `${path.relative(feRoot, f)} varlık kancası -> public${m[1]}`);
  }
}

// 5. token dist
must(exists(path.join(feRoot, 'src/design/tokens/dist/tokens.static.css')), 'design/tokens/dist/tokens.static.css');

// 6. views haritası dosya varlığı (statik/dinamik import yolları)
const menu = path.join(feRoot, 'src/stores/site/menu.ts');
if (exists(menu)) {
  const text = fs
    .readFileSync(menu, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  for (const m of text.matchAll(/import\('@\/([^']+)'\)/g)) {
    must(exists(path.join(feRoot, 'src', m[1])), `menu.ts views haritası -> src/${m[1]}`);
  }
}

if (process.argv.includes('--verbose')) ok.forEach((o) => console.log('  ok   ' + o));
if (problems.length) {
  console.error(`[contract-paths] BAŞARISIZ: ${problems.length} yol kancası kırık:`);
  problems.forEach((p) => console.error('  KIRIK ' + p));
  process.exit(1);
}
console.log(`[contract-paths] OK: ${ok.length} yol kancası doğrulandı.`);

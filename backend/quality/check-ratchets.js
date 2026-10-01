#!/usr/bin/env node
/**
 * Kalite MANDALLARI (ratchet) — Faz 0 / B-R4 (ADR-0017 §10; docs/BACKEND_CODE_AUDIT.md B-R4).
 *
 * Mevcut teknik borç sayıları `quality/baseline.json`'da dondurulmuştur; bu betik güncel sayıları ölçer ve
 * HERHANGİ BİRİ baseline'ı AŞARSA çıkış kodu 1 verir (borç artamaz). Sayı azalırsa iyileşme bildirilir ve
 * `npm run ratchet:update` ile baseline aşağı çekilir (yalnızca AŞAĞI; artırmak için elle düzenleme + gerekçe gerekir).
 *
 * Ölçümler:
 *   eslint     — dosya başına `no-console` sayısı (src + entegrasyonik.ts) ve kural başına diğer uyarı sayıları; ERROR = 0 olmalı
 *   depcruise  — katman sözleşmesi ihlalleri (kural başına; .dependency-cruiser.cjs, uyarı modu)
 *   unusedLocals — `tsc --noEmit --noUnusedLocals` hata sayısı (src + entegrasyonik.ts; testler hariç)
 *   knip       — kullanılmayan dosya/export/tip/bağımlılık sayıları (knip.json)
 *   handlers   — ADR-0024 P4-GATE: `src/api/rpc/handlers/**` dosya başına satır sayısı (yalnız HANDLER_MAX_LINES üstü; yeni
 *                dosya bu sınırı aşamaz, aşan mevcut dosya büyüyemez) ve dosya başına `getXModel()` çağrısı (depo katmanına
 *                taşındıkça azalır, artamaz)
 *
 * Kullanım: node quality/check-ratchets.js [--update] [--only=eslint,depcruise,unusedLocals,knip,handlers]
 * Gerçek DB/Redis/ağ kullanmaz.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BASELINE_PATH = path.join(__dirname, 'baseline.json');
const args = process.argv.slice(2);
const UPDATE = args.includes('--update');
const onlyArg = args.find((a) => a.startsWith('--only='));
const ONLY = onlyArg ? onlyArg.slice(7).split(',') : ['eslint', 'depcruise', 'unusedLocals', 'knip', 'handlers'];
const HANDLERS_DIR = path.join(ROOT, 'src', 'api', 'rpc', 'handlers');
const HANDLER_MAX_LINES = 400;

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

function runNode(script, scriptArgs, { allowFail = true } = {}) {
  try {
    return execFileSync(process.execPath, [script, ...scriptArgs], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    if (allowFail && e.stdout !== undefined) return e.stdout; // araçlar bulguda 0 dışı çıkar; çıktıyı yine de işle
    throw e;
  }
}

async function measureEslint() {
  const { ESLint } = require('eslint');
  const eslint = new ESLint({ cwd: ROOT });
  const results = await eslint.lintFiles(['entegrasyonik.ts', 'src', 'tests']);
  const consoleByFile = {};
  const otherByRule = {};
  let errors = 0;
  let fatal = 0;
  for (const r of results) {
    const file = rel(r.filePath);
    for (const m of r.messages) {
      if (m.fatal) fatal++;
      if (m.severity === 2) errors++;
      if (m.ruleId === 'no-console') consoleByFile[file] = (consoleByFile[file] || 0) + 1;
      else if (m.severity === 1) otherByRule[m.ruleId || '(none)'] = (otherByRule[m.ruleId || '(none)'] || 0) + 1;
    }
  }
  return { errors: errors + fatal, consoleByFile, otherByRule };
}

function measureDepcruise() {
  const bin = path.join(ROOT, 'node_modules', 'dependency-cruiser', 'bin', 'dependency-cruiser.mjs');
  const out = runNode(bin, ['--config', '.dependency-cruiser.cjs', '--output-type', 'json', 'entegrasyonik.ts', 'src']);
  const json = JSON.parse(out);
  const byRule = {};
  for (const v of json.summary.violations) byRule[v.rule.name] = (byRule[v.rule.name] || 0) + 1;
  return byRule;
}

function measureUnusedLocals() {
  const tsc = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
  const out = runNode(tsc, ['--noEmit', '--noUnusedLocals', '-p', 'tsconfig.json']);
  return out.split(/\r?\n/).filter((l) => /error TS\d+/.test(l) && !/^tests[\\/]/.test(l)).length;
}

function measureKnip() {
  const bin = path.join(ROOT, 'node_modules', 'knip', 'bin', 'knip.js');
  const out = runNode(bin, ['--no-progress', '--reporter', 'json']);
  const json = JSON.parse(out.slice(out.indexOf('{')));
  const counts = {};
  for (const issue of json.issues) {
    for (const [k, v] of Object.entries(issue)) {
      if (Array.isArray(v) && v.length && k !== 'files') counts[k] = (counts[k] || 0) + v.length;
      if (k === 'files' && Array.isArray(v) && v.length) counts.files = (counts.files || 0) + v.length;
    }
  }
  return counts;
}

function listTs(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listTs(p));
    else if (e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

function measureHandlers() {
  const linesOverMax = {};
  const getModelCalls = {};
  for (const f of listTs(HANDLERS_DIR)) {
    const src = fs.readFileSync(f, 'utf8');
    const lines = src.split(/\r?\n/).length;
    if (lines > HANDLER_MAX_LINES) linesOverMax[rel(f)] = lines;
    const n = (src.match(/\bget[A-Z][A-Za-z0-9]*Model\(/g) || []).length;
    if (n) getModelCalls[rel(f)] = n;
  }
  return { linesOverMax, getModelCalls };
}

/** current <= baseline (kalem kalem). Döner: { violations: string[], improvements: string[] } */
function compareMap(label, current, base) {
  const violations = [];
  const improvements = [];
  const keys = new Set([...Object.keys(current), ...Object.keys(base || {})]);
  for (const k of keys) {
    const c = current[k] || 0;
    const b = (base || {})[k] || 0;
    if (c > b) violations.push(`${label}: ${k} ${b} -> ${c}`);
    else if (c < b) improvements.push(`${label}: ${k} ${b} -> ${c}`);
  }
  return { violations, improvements };
}

async function main() {
  const baseline = fs.existsSync(BASELINE_PATH) ? JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) : {};
  const current = {};
  if (ONLY.includes('eslint')) current.eslint = await measureEslint();
  if (ONLY.includes('depcruise')) current.depcruise = measureDepcruise();
  if (ONLY.includes('unusedLocals')) current.unusedLocals = measureUnusedLocals();
  if (ONLY.includes('knip')) current.knip = measureKnip();
  if (ONLY.includes('handlers')) current.handlers = measureHandlers();

  const violations = [];
  const improvements = [];
  const push = (r) => { violations.push(...r.violations); improvements.push(...r.improvements); };

  if (current.eslint) {
    if (current.eslint.errors > 0) violations.push(`eslint: ${current.eslint.errors} HATA (error seviyesi 0 olmalı)`);
    push(compareMap('no-console (dosya)', current.eslint.consoleByFile, baseline.eslint && baseline.eslint.consoleByFile));
    push(compareMap('eslint kuralı', current.eslint.otherByRule, baseline.eslint && baseline.eslint.otherByRule));
  }
  if (current.depcruise) push(compareMap('dependency-cruiser', current.depcruise, baseline.depcruise));
  if (current.unusedLocals !== undefined) push(compareMap('noUnusedLocals', { total: current.unusedLocals }, { total: baseline.unusedLocals || 0 }));
  if (current.knip) push(compareMap('knip', current.knip, baseline.knip));
  if (current.handlers) {
    push(compareMap(`handler satır (>${HANDLER_MAX_LINES})`, current.handlers.linesOverMax, baseline.handlers && baseline.handlers.linesOverMax));
    push(compareMap('handler getXModel()', current.handlers.getModelCalls, baseline.handlers && baseline.handlers.getModelCalls));
  }

  const totalConsole = current.eslint ? Object.values(current.eslint.consoleByFile).reduce((a, b) => a + b, 0) : undefined;
  console.log('[ratchet] ölçülen:', JSON.stringify({
    consoleToplam: totalConsole,
    eslintDiger: current.eslint && Object.values(current.eslint.otherByRule).reduce((a, b) => a + b, 0),
    depcruise: current.depcruise,
    unusedLocals: current.unusedLocals,
    knip: current.knip,
    handlerSatirAsan: current.handlers && Object.keys(current.handlers.linesOverMax).length,
    handlerGetModel: current.handlers && Object.values(current.handlers.getModelCalls).reduce((a, b) => a + b, 0),
  }));

  if (UPDATE) {
    const next = { ...baseline, ...current };
    // yalnızca AŞAĞI çekmeye izin ver: artış varsa güncellemeyi reddet
    if (violations.length && fs.existsSync(BASELINE_PATH)) {
      console.error('[ratchet] --update reddedildi: baseline artırılamaz.\n  ' + violations.join('\n  '));
      process.exit(1);
    }
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(next, null, 2) + '\n');
    console.log('[ratchet] baseline güncellendi: ' + rel(BASELINE_PATH));
    return;
  }
  if (improvements.length) console.log('[ratchet] İYİLEŞME (baseline aşağı çekilebilir: npm run ratchet:update):\n  ' + improvements.join('\n  '));
  if (violations.length) {
    console.error('[ratchet] MANDAL İHLALİ (teknik borç arttı):\n  ' + violations.join('\n  '));
    process.exit(1);
  }
  console.log('[ratchet] OK');
}

main().catch((e) => {
  console.error('[ratchet] beklenmeyen hata:', e);
  process.exit(2);
});

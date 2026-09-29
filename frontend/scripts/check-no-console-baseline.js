#!/usr/bin/env node
/**
 * ADR-0017 Karar 1.8 (frontend log/hata mimarisi) — `no-console` mandalı (ratchet).
 *
 * `check-typecheck-baseline.js` / `check-style-baseline.js` ile AYNI desen: commit'li bir
 * taban dosyasına (`no-console-baseline.json`) karşı bugünkü, dosya başına `no-console`
 * ESLint uyarı sayısını doğrular. Hiçbir dosyada sayı ARTAMAZ; taban dosyasında olmayan
 * (yeni) bir dosyada `no-console` ihlali varsa da başarısız olur — yeni yazılan kod baştan
 * `logger.ts`'yi kullanmalı, `console.*` ile başlayamaz.
 *
 * `console.*` çağrılarının tek meşru kaynağı `src/composables/logger.ts`'dir (kendi dosya
 * başına ESLint override'ı ile `no-console` kapalıdır — bkz. `eslint.config.mjs`); bu betik
 * o dosyayı ELE ALMAZ (ESLint zaten orada uyarı üretmez).
 *
 * Kullanım:
 *   node scripts/check-no-console-baseline.js           -> doğrula (`npm run test:no-console-ratchet`)
 *   node scripts/check-no-console-baseline.js --write    -> tabanı bugünkü sayılarla YENİDEN YAZ
 *                                                            (yalnızca bilinçli bir azalma/ilk kurulum sonrası)
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const baselinePath = path.join(repoRoot, 'no-console-baseline.json');
const shouldWrite = process.argv.includes('--write');

async function measure() {
  const { ESLint } = require('eslint');
  const eslint = new ESLint({ cwd: repoRoot });
  const results = await eslint.lintFiles(['src']);
  const byFile = {};
  let errors = 0;
  for (const r of results) {
    const file = path.relative(repoRoot, r.filePath).split(path.sep).join('/');
    for (const m of r.messages) {
      if (m.severity === 2) errors++;
      if (m.ruleId === 'no-console') byFile[file] = (byFile[file] || 0) + 1;
    }
  }
  return { byFile, errors };
}

async function main() {
  const { byFile: current, errors } = await measure();
  const total = Object.values(current).reduce((a, b) => a + b, 0);

  if (errors > 0) {
    console.error(`[no-console-ratchet] ESLint ${errors} HATA üretti (error seviyesi 0 olmalı) — önce bunları düzelt.`);
    process.exit(1);
  }

  if (shouldWrite) {
    const baseline = {
      _meta:
        'ADR-0017 Karar 1.8 no-console mandalı tabanı. node scripts/check-no-console-baseline.js ' +
        '--write ile üretildi. Hiçbir dosyada sayı ARTAMAZ; yeni dosyalar 0 ile başlamalı; azalma ' +
        'serbest ama bu dosyanın güncellenmesi gerekir (check-no-console-baseline.js OK dönene kadar).',
      date: new Date().toISOString().slice(0, 10),
      total,
      files: current,
    };
    fs.writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
    console.log(`[no-console-ratchet] Taban yeniden yazıldı: ${path.relative(repoRoot, baselinePath)} (${Object.keys(current).length} dosya, toplam ${total} \`console.*\`).`);
    return;
  }

  if (!fs.existsSync(baselinePath)) {
    console.error(`[no-console-ratchet] Taban dosyası yok: ${path.relative(repoRoot, baselinePath)}. Önce --write ile oluştur.`);
    process.exit(1);
  }
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  const baseFiles = baseline.files || {};

  const violations = [];
  const improvements = [];
  const allFiles = new Set([...Object.keys(current), ...Object.keys(baseFiles)]);
  for (const file of allFiles) {
    const c = current[file] || 0;
    const b = baseFiles[file] || 0;
    if (c > b) violations.push(`${file}: ${b} -> ${c}`);
    else if (c < b) improvements.push(`${file}: ${b} -> ${c}`);
  }

  console.log(`[no-console-ratchet] ölçülen: ${total} \`console.*\` uyarısı / ${Object.keys(current).length} dosya (taban: ${baseline.total} / ${Object.keys(baseFiles).length}).`);
  if (improvements.length) {
    console.log('[no-console-ratchet] İYİLEŞME (taban aşağı çekilebilir: node scripts/check-no-console-baseline.js --write):\n  ' + improvements.join('\n  '));
  }
  if (violations.length) {
    console.error('[no-console-ratchet] MANDAL İHLALİ (console.* sayısı arttı):\n  ' + violations.join('\n  '));
    process.exit(1);
  }
  console.log('[no-console-ratchet] OK');
}

main().catch((e) => {
  console.error('[no-console-ratchet] beklenmeyen hata:', e);
  process.exit(2);
});

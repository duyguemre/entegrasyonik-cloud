#!/usr/bin/env node
/**
 * ADR-0015 Karar 6.4 — "desen mandalı" (ratchet). `check-style-baseline.js`
 * (ADR-0011 Karar 2) İLE AYNI desen: commit'li bir taban dosyasına
 * (`pattern-baseline.json`) karşı bugünkü sayıyı doğrular, hiçbir dosyada/
 * kategoride sayı ARTAMAZ; taban dosyasında olmayan (yeni) bir dosya, sayısı
 * 0'dan BÜYÜKSE de başarısız olur ("yeni dosyalar 0 ile başlar").
 *
 * `pageHeaderMissing` AYRI bir alt-taban (`pageHeaderMissing`) olarak
 * tutulur (farklı dizin kökü — `src/views/secure/**`).
 *
 * Kullanım:
 *   node scripts/check-pattern-baseline.js           -> doğrula (npm run test:pattern-ratchet)
 *   node scripts/check-pattern-baseline.js --write    -> tabanı YENİDEN YAZ
 */
const fs = require('node:fs');
const path = require('node:path');
const { buildCounts, buildPageHeaderMissing } = require('./pattern-counts');

const repoRoot = path.resolve(__dirname, '..');
const baselinePath = path.join(repoRoot, 'pattern-baseline.json');
const shouldWrite = process.argv.includes('--write');

const currentFiles = buildCounts(repoRoot);
const currentPageHeaderMissing = buildPageHeaderMissing(repoRoot);

const PATTERN_CATEGORIES = ['rawDataTable', 'rawDialog', 'rawChip', 'rawFormat', 'rawSpinner', 'iconBtnNoLabel', 'total'];

if (shouldWrite) {
  const files = {};
  for (const key of Object.keys(currentFiles).sort()) files[key] = currentFiles[key];
  const pageHeaderMissing = {};
  for (const key of Object.keys(currentPageHeaderMissing).sort()) pageHeaderMissing[key] = currentPageHeaderMissing[key];

  const totals = { total: 0 };
  for (const category of PATTERN_CATEGORIES) if (category !== 'total') totals[category] = 0;
  let patternExceptionsTotal = 0;
  for (const counts of Object.values(currentFiles)) {
    totals.total += counts.total;
    patternExceptionsTotal += counts.patternExceptions ?? 0;
    for (const category of PATTERN_CATEGORIES) {
      if (category === 'total') continue;
      totals[category] += counts[category] ?? 0;
    }
  }
  const pageHeaderMissingTotal = Object.values(pageHeaderMissing).reduce((a, b) => a + b, 0);

  const baseline = {
    _meta:
      "ADR-0015 Karar 6.4 desen mandalı tabanı. node scripts/check-pattern-baseline.js --write ile üretildi " +
      '(bkz. scripts/pattern-counts.js). Hiçbir dosyada/kategoride sayı ARTAMAZ; yeni dosyalar 0 ile başlamalı; ' +
      'düşüş serbest ama bu dosyanın güncellenmesi gerekir. patternExceptions BİLGİ AMAÇLIDIR (C\'de raporlanır, mandal tarafından zorlanmaz).',
    date: new Date().toISOString().slice(0, 10),
    totals: { ...totals, patternExceptions: patternExceptionsTotal, pageHeaderMissing: pageHeaderMissingTotal },
    files,
    pageHeaderMissing,
  };
  fs.writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
  console.log(
    `[pattern-ratchet] Taban yeniden yazıldı: ${path.relative(repoRoot, baselinePath)} (${Object.keys(files).length} dosya, toplam ${totals.total} desen dışı kullanım, ${pageHeaderMissingTotal} EkPageHeader eksik ekran).`,
  );
  process.exit(0);
}

if (!fs.existsSync(baselinePath)) {
  console.error(`[pattern-ratchet] BAŞARISIZ: ${path.relative(repoRoot, baselinePath)} yok. Önce "node scripts/check-pattern-baseline.js --write" ile taban oluşturun.`);
  process.exit(1);
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const baselineFiles = baseline.files ?? {};
const baselinePageHeaderMissing = baseline.pageHeaderMissing ?? {};

const regressions = [];
const improvements = [];

function compare(current, baselineMap, categories, label) {
  for (const [file, counts] of Object.entries(current)) {
    const baseCounts = baselineMap[file];
    if (baseCounts === undefined) {
      const total = typeof counts === 'number' ? counts : counts.total;
      if (total > 0) regressions.push({ file: `${label}:${file}`, category: '(yeni dosya)', before: 0, after: total });
      continue;
    }
    if (typeof counts === 'number') {
      if (counts > baseCounts) regressions.push({ file: `${label}:${file}`, category: label, before: baseCounts, after: counts });
      else if (counts < baseCounts) improvements.push({ file: `${label}:${file}`, category: label, before: baseCounts, after: counts });
      continue;
    }
    for (const category of categories) {
      const before = baseCounts[category] ?? 0;
      const after = counts[category] ?? 0;
      if (after > before) regressions.push({ file: `${label}:${file}`, category, before, after });
      else if (after < before) improvements.push({ file: `${label}:${file}`, category, before, after });
    }
  }
}

compare(currentFiles, baselineFiles, PATTERN_CATEGORIES, 'pattern');
compare(currentPageHeaderMissing, baselinePageHeaderMissing, [], 'pageHeaderMissing');

if (regressions.length > 0) {
  console.error(`[pattern-ratchet] BAŞARISIZ: ${regressions.length} dosya/kategoride desen-dışı kullanım ARTMIŞ.`);
  for (const r of regressions) console.error(`  - ${r.file} [${r.category}]: ${r.before} -> ${r.after}`);
  console.error(
    '[pattern-ratchet] Yeni desen-dışı kullanım eklenemez (ADR-0015 Karar 6.4). Karar 6.1 kataloğundaki Ek* şablon/bileşenini kullanın; ' +
      'gerçekten farklı bir etkileşim modeli/ölçülmüş performans nedeni varsa "// ek-pattern-exception: <şablon> — <gerekçe>" yorumu ekleyin.',
  );
  process.exit(1);
}

if (improvements.length > 0) {
  console.log(
    `[pattern-ratchet] ${improvements.length} dosya/kategoride desen-dışı kullanım DÜŞTÜ. Lütfen "node scripts/check-pattern-baseline.js --write" ile ${path.relative(repoRoot, baselinePath)} dosyasını güncelleyip commit'leyin.`,
  );
  for (const r of improvements) console.log(`  - ${r.file} [${r.category}]: ${r.before} -> ${r.after}`);
  process.exit(1);
}

console.log(
  `[pattern-ratchet] OK: ${Object.keys(currentFiles).length} dosya, taban korundu (regresyon yok, güncellenmemiş azalma yok).`,
);

#!/usr/bin/env node
/**
 * ADR-0011 Karar 2 / Aşama 1 — literal-stil mandalı (ratchet).
 *
 * `check-typecheck-baseline.js` (Faz 3 T0) ile AYNI desen: commit'li bir
 * taban dosyasına (`style-baseline.json`) karşı bugünkü sayıyı doğrular,
 * hiçbir dosyada/kategoride sayı ARTAMAZ. Taban dosyasında olmayan (yeni)
 * bir dosya, literal sayısı 0'dan BÜYÜKSE de başarısız olur — "yeni
 * dosyalar 0 ile başlar" kuralı böylece zorlanır (yeni yazılan kod baştan
 * token kullanmalı, literal ile başlayamaz).
 *
 * Göç tamamlanan bir dosyanın tüm kategorileri 0'a indiğinde, taban
 * dosyasındaki kaydı silmek YERİNE 0 değerleriyle bırakmak tercih edilir
 * (silinirse dosya "yeni" sayılır ve rejenerasyon gerekmez, ama 0'da
 * bırakmak dosyanın "kilitlendiğini" repo geçmişinde görünür kılar).
 *
 * Kullanım:
 *   node scripts/check-style-baseline.js           -> doğrula (CI/`npm run test:style-ratchet`)
 *   node scripts/check-style-baseline.js --write    -> tabanı bugünkü sayılarla YENİDEN YAZ
 *                                                       (yalnızca bilinçli bir azalma/ilk kurulum sonrası kullanılır)
 */
const fs = require('node:fs');
const path = require('node:path');
const { buildCounts, CATEGORIES } = require('./style-literal-counts');

const repoRoot = path.resolve(__dirname, '..');
const baselinePath = path.join(repoRoot, 'style-baseline.json');
const shouldWrite = process.argv.includes('--write');

const current = buildCounts(repoRoot);

if (shouldWrite) {
  const files = {};
  for (const key of Object.keys(current).sort()) {
    files[key] = current[key];
  }
  const totals = { total: 0 };
  for (const category of CATEGORIES) totals[category] = 0;
  for (const counts of Object.values(current)) {
    totals.total += counts.total;
    for (const category of CATEGORIES) totals[category] += counts[category];
  }
  const baseline = {
    _meta:
      "ADR-0011 Karar 2 / Aşama 1 literal-stil mandalı tabanı. " +
      "node scripts/check-style-baseline.js --write ile üretildi (bkz. " +
      "scripts/style-literal-counts.js). Hiçbir dosyada/kategoride sayı " +
      "ARTAMAZ; yeni dosyalar 0 ile başlamalı; düşüş serbest ama bu dosyanın " +
      "güncellenmesi gerekir (check-style-baseline.js OK dönene kadar).",
    date: new Date().toISOString().slice(0, 10),
    totals,
    files,
  };
  fs.writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
  console.log(
    `[style-ratchet] Taban yeniden yazıldı: ${path.relative(repoRoot, baselinePath)} ` +
      `(${Object.keys(files).length} dosya, toplam ${totals.total} literal).`
  );
  process.exit(0);
}

if (!fs.existsSync(baselinePath)) {
  console.error(
    `[style-ratchet] BAŞARISIZ: ${path.relative(repoRoot, baselinePath)} yok. ` +
      `Önce "node scripts/check-style-baseline.js --write" ile taban oluşturun.`
  );
  process.exit(1);
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const baselineFiles = baseline.files ?? {};

const regressions = [];
const improvements = [];

for (const [file, counts] of Object.entries(current)) {
  const baseCounts = baselineFiles[file];
  if (!baseCounts) {
    // Taban dosyasında olmayan (yeni) dosya: 0 ile başlamalı.
    if (counts.total > 0) {
      regressions.push({ file, category: '(yeni dosya)', before: 0, after: counts.total });
    }
    continue;
  }
  for (const category of [...CATEGORIES, 'total']) {
    const before = baseCounts[category] ?? 0;
    const after = counts[category];
    if (after > before) {
      regressions.push({ file, category, before, after });
    } else if (after < before) {
      improvements.push({ file, category, before, after });
    }
  }
}

// Taban dosyasında kayıtlı ama artık `src/**` içinde bulunmayan (silinmiş/
// taşınmış) dosyalar bir regresyon değildir; sessizce yok sayılır.

if (regressions.length > 0) {
  console.error(
    `[style-ratchet] BAŞARISIZ: ${regressions.length} dosya/kategoride literal sayısı ARTMIŞ.`
  );
  for (const r of regressions) {
    console.error(`  - ${r.file} [${r.category}]: ${r.before} -> ${r.after}`);
  }
  console.error(
    '[style-ratchet] Yeni literal-stil borcu eklenemez (ADR-0011 Karar 2, Aşama 1). ' +
      'Semantik token kullanın; kasıtlı bir istisna varsa (ör. ECharts canvas rengi) ' +
      'tokens modülünden JS değeri import edin, literal yazmayın.'
  );
  process.exit(1);
}

if (improvements.length > 0) {
  console.log(
    `[style-ratchet] ${improvements.length} dosya/kategoride literal sayısı DÜŞTÜ. ` +
      `Lütfen "node scripts/check-style-baseline.js --write" ile ${path.relative(repoRoot, baselinePath)} ` +
      'dosyasını güncelleyip commit\'leyin (mandal yalnızca aşağı iner).'
  );
  for (const r of improvements) {
    console.log(`  - ${r.file} [${r.category}]: ${r.before} -> ${r.after}`);
  }
  process.exit(1);
}

console.log(
  `[style-ratchet] OK: ${Object.keys(current).length} dosya, taban korundu (regresyon yok, güncellenmemiş azalma yok).`
);

#!/usr/bin/env node
/**
 * ADR-0011 Karar 4 (Faz 3 T0) — vue-tsc hata sayısı mandalı (ratchet).
 *
 * `npm run build` artık type-check YAPMIYOR (yalnızca `vite build`) çünkü
 * `vue-tsc` bugün 15 gerçek (yüzeysel olmayan) tip hatasıyla kırık ve bunları
 * tek tek düzeltmek bu görevin kapsamı dışında. Bu script `vue-tsc --noEmit`
 * hata sayısının `typecheck-baseline.json`'daki sayıyı AŞMADIĞINI doğrular —
 * yeni tip borcu eklenmesini engeller, mevcut borcu dondurur.
 *
 * P1/P2 ekranları taşınırken (ADR-0011 Karar 2) ilgili dosyalardaki hatalar
 * giderildikçe bu taban dosyasındaki sayı DÜŞÜRÜLMELİDİR (asla artırılmaz).
 */
const { execSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const repoRoot = path.resolve(__dirname, '..');
const baselinePath = path.join(repoRoot, 'typecheck-baseline.json');
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

let output = '';
try {
  output = execSync('npx vue-tsc --noEmit', {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
} catch (err) {
  // vue-tsc, hata bulunduğunda sıfırdan farklı exit code döner; stdout/stderr
  // yine de hata mesajlarını taşır.
  output = `${err.stdout || ''}${err.stderr || ''}`;
}

const errorLines = output
  .split(/\r?\n/)
  .filter((line) => /: error TS\d+:/.test(line));
const errorCount = errorLines.length;

if (errorCount > baseline.errorCount) {
  console.error(
    `[typecheck-ratchet] BAŞARISIZ: vue-tsc ${errorCount} hata buldu, taban ${baseline.errorCount} idi.`
  );
  console.error('[typecheck-ratchet] Yeni tip hataları eklenemez. Bulunan hatalar:');
  console.error(errorLines.join('\n'));
  console.error(
    `[typecheck-ratchet] Yeni borç kasıtlıysa (P1/P2 göçü sırasında hata sayısı DÜŞÜRÜLÜR, hiçbir zaman artırılmaz) ${baselinePath} dosyasını güncelleyin.`
  );
  process.exit(1);
}

if (errorCount < baseline.errorCount) {
  console.log(
    `[typecheck-ratchet] vue-tsc hata sayısı düştü (${baseline.errorCount} -> ${errorCount}). ` +
      `Lütfen ${path.relative(repoRoot, baselinePath)} dosyasını yeni sayıyla güncelleyin (mandal yalnızca aşağı iner).`
  );
  process.exit(1);
}

console.log(
  `[typecheck-ratchet] OK: vue-tsc ${errorCount} hata (taban: ${baseline.errorCount}). Mandal korundu.`
);

#!/usr/bin/env node
/**
 * ADR-0015 Karar 6.4 — "desen mandalı" paylaşılan sayım mantığı. Mevcut
 * literal-stil mandalının (`scripts/style-literal-counts.js`) AYNI
 * deseninde: dosya başına sayılan, dosya TAMAMI taranan (yalnızca
 * `<template>` değil) bir ratchet.
 *
 * Kapsam: `src/**\/*.vue` (Karar 6.4: "Kapsam src/**\/*.vue"). `EkStatusChip`
 * gibi şablonların KENDİSİ olduğu için `src/components/page/**` (uygulamaya özgü sayfa şablonları) HARİÇ; ortak DS bileşenleri zaten `packages/ui`'dadır ve taranmaz.
 *
 * Sayaçlar (dosya başına):
 *  - rawDataTable:     `<v-data-table`, `<v-data-table-server`, `<v-table`
 *  - rawDialog:        `<v-dialog`
 *  - rawChip:          `<v-chip` (Karar 6.4 notu: "durum için" — regex bunu
 *                       AYIRT EDEMEZ, tüm çıplak `v-chip` kullanımı sayılır;
 *                       meşru-olmayan kullanım `ek-pattern-exception`
 *                       yorumuyla ayrı işaretlenir, false-positive'ler
 *                       istisna yorumuyla yönetilir — Karar 6.4 "Maliyet" notu)
 *  - rawFormat:        `toLocaleString`, `toLocaleDateString`,
 *                       `Intl.NumberFormat`, `toFixed(`
 *  - rawSpinner:        `v-progress-circular`
 *  - iconBtnNoLabel:    `<v-btn ... icon ...>` (prepend-icon/append-icon HARİÇ)
 *                       AYNI açılış etiketinde `aria-label` YOKSA sayılır
 *                       (basit heuristik — çok satırlı etiketler desteklenir,
 *                       ancak %100 doğru değildir; AST eşiği Karar 6.4'te)
 *
 * `pageHeaderMissing` AYRI bir tarama alanı kullanır (`src/views/secure/**`) —
 * bu fonksiyonlar tarafından DEĞİL, `check-pattern-baseline.js` tarafından
 * hesaplanır (farklı dizin köküne ihtiyaç duyduğu için).
 *
 * `ek-pattern-exception: <şablon> — <gerekçe>` yorumu içeren SATIRDAKİ
 * eşleşme sayılmaz (bu satır `patternExceptions`'a ayrıca sayılır).
 */
const fs = require('node:fs');
const path = require('node:path');

const RAW_PATTERNS = {
  rawDataTable: /<v-data-table-server\b|<v-data-table\b|<v-table\b/g,
  rawDialog: /<v-dialog\b/g,
  rawChip: /<v-chip\b/g,
  rawFormat: /toLocaleString\(|toLocaleDateString\(|Intl\.NumberFormat\(|toFixed\(/g,
  rawSpinner: /<v-progress-circular\b/g,
};

const EXCEPTION_COMMENT = /ek-pattern-exception/g;

const EXCLUDED_DIRS = ['src/components/page'];

function isExcluded(relPosixPath) {
  return EXCLUDED_DIRS.some((dir) => relPosixPath === dir || relPosixPath.startsWith(dir + '/'));
}

/** `<v-btn ...icon...>` (prepend-icon/append-icon HARİÇ) + AYNI etikette `aria-label` yokluğu. */
function countIconBtnNoLabel(content) {
  const btnTagRegex = /<v-btn\b[^>]*>/g;
  let count = 0;
  let match;
  while ((match = btnTagRegex.exec(content)) !== null) {
    const tag = match[0];
    const hasBareIcon = /(?<!prepend-)(?<!append-)\bicon(\s|=|>)/.test(tag);
    if (!hasBareIcon) continue;
    const hasAriaLabel = /aria-label\s*=/.test(tag);
    if (!hasAriaLabel) count += 1;
  }
  return count;
}

/** Bir satırda `ek-pattern-exception` varsa o satırdaki eşleşmeleri SAYMAZ. */
function countExcludingExceptionLines(content, pattern) {
  const lines = content.split('\n');
  let total = 0;
  for (const line of lines) {
    if (EXCEPTION_COMMENT.test(line)) {
      EXCEPTION_COMMENT.lastIndex = 0;
      continue;
    }
    const lineMatches = line.match(pattern);
    total += lineMatches ? lineMatches.length : 0;
  }
  return total;
}

function countFileContent(content) {
  const counts = {};
  for (const [key, pattern] of Object.entries(RAW_PATTERNS)) {
    counts[key] = countExcludingExceptionLines(content, pattern);
  }
  counts.iconBtnNoLabel = countIconBtnNoLabel(content);
  const exceptionMatches = content.match(EXCEPTION_COMMENT);
  counts.patternExceptions = exceptionMatches ? exceptionMatches.length : 0;
  counts.total = Object.entries(counts)
    .filter(([key]) => key !== 'total' && key !== 'patternExceptions')
    .reduce((sum, [, value]) => sum + value, 0);
  return counts;
}

function listVueFiles(srcDir) {
  const results = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (path.extname(entry.name) === '.vue') {
        results.push(full);
      }
    }
  }
  walk(srcDir);
  return results;
}

function buildCounts(repoRoot) {
  const srcDir = path.join(repoRoot, 'src');
  // ADR-0034 / CHAT_UI_CONTRACT §9: sohbet paketi (packages/chat/src) de taranır; taban 0.
  const chatDir = path.join(repoRoot, 'packages', 'chat', 'src');
  const files = [...listVueFiles(srcDir), ...(fs.existsSync(chatDir) ? listVueFiles(chatDir) : [])];
  const map = {};
  for (const absPath of files) {
    const relPath = path.relative(repoRoot, absPath).split(path.sep).join('/');
    if (isExcluded(relPath)) continue;
    const content = fs.readFileSync(absPath, 'utf8');
    map[relPath] = countFileContent(content);
  }
  return map;
}

/**
 * Ekran sayfa başlığını standart bileşenle mi çiziyor? `EkPageHeader` ya da DS-v2 liste
 * standardı şablonu `EkListScreen` (başlık verilmişse kendi H1 başlık bloğunu çizer).
 */
function hasPageHeader(content) {
  if (content.includes('EkPageHeader')) return true;
  const at = content.search(/<EkListScreen\b/);
  if (at < 0) return false;
  // Açılış etiketinin öznitelikleri (öznitelik değerlerinde `=>` olabildiği için `>`e göre kesilmez).
  return /\s:?title=/.test(content.slice(at, at + 2000).split(/\n\s*>\s*\n/)[0]);
}

/** `views/secure/**\/*.vue` altında sayfa başlığı (EkPageHeader / başlıklı EkListScreen) İÇERMEYEN ekran kökleri. */
function buildPageHeaderMissing(repoRoot) {
  const viewsDir = path.join(repoRoot, 'src', 'views', 'secure');
  if (!fs.existsSync(viewsDir)) return {};
  const files = listVueFiles(viewsDir);
  const map = {};
  for (const absPath of files) {
    const relPath = path.relative(repoRoot, absPath).split(path.sep).join('/');
    const content = fs.readFileSync(absPath, 'utf8');
    map[relPath] = hasPageHeader(content) ? 0 : 1;
  }
  return map;
}

module.exports = {
  hasPageHeader,
  RAW_PATTERNS,
  countFileContent,
  listVueFiles,
  buildCounts,
  buildPageHeaderMissing,
};

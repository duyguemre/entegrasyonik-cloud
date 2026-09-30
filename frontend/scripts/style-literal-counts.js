#!/usr/bin/env node
/**
 * ADR-0011 Karar 2 / Aşama 1 — literal-stil mandalının (ratchet) paylaşılan
 * sayım mantığı. `check-style-baseline.js` bu modülü kullanır.
 *
 * Her `src/**\/*.{vue,ts,css,scss}` dosyası için beş kategoride literal
 * "stil borcu" sayısı çıkarır (dosyanın TAMAMI taranır — yalnızca <style>
 * blokları değil; ADR Bağlam'daki 1.717 hex / 608 rgb(a) / 2.210 inline
 * style sayıları da PRODUCT_SURFACES.md'de aynı şekilde tüm dosya taranarak
 * bulunmuştu):
 *
 *  - hex:         `#RGB`/`#RGBA`/`#RRGGBB`/`#RRGGBBAA` (3/4/6/8 hex hane;
 *                  önünde/ardında başka hex hane YOKSA eşleşir — `#app`,
 *                  `#formRef` gibi CSS seçici olmayan `#id` kullanımları
 *                  zaten hex hane setine uymadığı için elenir)
 *  - rgb:          `rgb(`/`rgba(`
 *  - inlineStyle:  `style="` (Vue `:style="` bağlaması da bu alt dizeyi
 *                  içerdiği için otomatik sayılır)
 *  - cubicBezier:  `cubic-bezier(`
 *  - namedColor:   FR2-DARK — CSS adlı renk (white/black/red/…) bir renk özelliğinde, Vuetify sabit palet
 *                  sınıfı (`text-white`, `bg-grey-lighten-3`) veya renk prop'u (`color="red"`). Bunlar temadan
 *                  bağımsızdır → koyu zeminde kırılır. Taban kaydı yoksa 0 sayılır (kategori 0'dan kilitli doğar).
 *  - motion:       şüpheli-uzun geçiş süresi — `300ms`-`999ms` arası VEYA
 *                  `0.4s`-`0.9xs` arası (>300ms sınırının kaba işaretleri;
 *                  ADR premium-ui-standards skill'i motion'ı 150-300ms ile
 *                  sınırlıyor)
 */
const fs = require('node:fs');
const path = require('node:path');

const NAMED_COLORS =
  'white|black|red|green|blue|gray|grey|orange|yellow|purple|pink|silver|navy|maroon|olive|lime|aqua|teal|fuchsia|' +
  'brown|gold|violet|indigo|cyan|magenta|beige|crimson|coral|salmon|tomato|khaki|whitesmoke|gainsboro';
const VUETIFY_PALETTE = `(?:${NAMED_COLORS}|blue-grey|deep-[a-z]+|light-[a-z]+)(?:-(?:lighten|darken|accent)-\\d)?`;

const PATTERNS = {
  hex: /(?<![0-9a-fA-F])#[0-9a-fA-F]{3,8}(?![0-9a-fA-F])/g,
  rgb: /rgba?\(/g,
  inlineStyle: /style="/g,
  cubicBezier: /cubic-bezier\(/g,
  motion: /[3-9]\d\dms|0\.[4-9]\d*s/g,
  namedColor: new RegExp(
    `(?:(?<![\\w-])(?:color|background(?:-color)?|border(?:-(?:top|right|bottom|left))?(?:-color)?|outline(?:-color)?|fill|stroke|box-shadow|text-shadow|caret-color)\\s*:[^;{}\\n]*?(?<![\\w-])(?:${NAMED_COLORS})(?![\\w-]))` +
      `|(?:\\b(?:bg|text|border)-${VUETIFY_PALETTE}\\b(?!-))` +
      `|(?:\\b(?:color|bg-color|base-color|icon-color)="${VUETIFY_PALETTE}")` +
      // JS ile atanan adlı renk: `el.style.color = "black"`, `style.backgroundColor = 'red'`
      `|(?:\\.style\\.(?:color|background(?:Color)?|border(?:Color)?|outlineColor|fill|stroke)\\s*=\\s*['"\`](?:${NAMED_COLORS})['"\`])`,
    'gi',
  ),
};

const CATEGORIES = Object.keys(PATTERNS);
const EXTENSIONS = new Set(['.vue', '.ts', '.css', '.scss']);

/**
 * ADR-0011 Karar 1/2 (Faz 3 T2) — `packages/ui/src/tokens/**` mandalın DIŞINDA
 * tutulur: bu dizin token'ların TANIM KAYNAĞI (`palette.ts`/`semantic.ts`/
 * `legacy.ts`'teki hex string'ler primitif/anlamsal renk TANIMLARIdır, bir
 * ekranın/bileşenin literal-stil BORCU değil) + `dist/tokens.{app,static}.css`
 * (bu tanımlardan `npm run tokens` ile ÜRETİLEN, ayrı bir drift testiyle
 * kaynakla senkron tutulan çıktı — mandal ile İKİNCİ kez saymak yanlış
 * pozitif üretir). Mandal, bileşenlerin/ekranların literal renk/motion
 * kullanımını 0'a doğru zorlamayı hedefler; token modülünün kendisi bu
 * kapsamın dışındadır.
 */
// `src/design/tokens/dist`: site sözleşmesi için kalan üretilmiş tokens.static.css (bkz. scripts/build-tokens.ts).
const EXCLUDED_DIRS = ['packages/ui/src/tokens', 'src/design/tokens/dist'];

/**
 * ADR-0015 Karar 3.12/A1b — global legacy CSS (`public/assets/css/site.css`,
 * `integrations.css`) mandal KAPSAMINA EKLENİR (önceden yalnızca `src/**`
 * taranıyordu, bu dosyalar mandal DIŞINDAYDI — Bulgu 8'in kök nedeni). Sayı
 * yalnızca AŞAĞI inebilir (ratchet); bu iki dosyanın BUGÜNKÜ (2026-09-28)
 * sayıları taban olarak kaydedilir, tam sıfırlama Aşama 0/B'nin kapsamıdır
 * (`legal.css` bilinçli olarak DIŞARIDA — grep ile 0 kullanılan seçici
 * temizliği henüz yapılmadı, ayrı bir R-adımı).
 */
const EXTRA_LEGACY_CSS_FILES = [
  'public/assets/css/site.css',
  'public/assets/css/integrations.css',
];

/** `relPosixPath` repo-köküne göre, `/` ayraçlı, `src/...` ile başlayan yol. */
function isExcluded(relPosixPath) {
  return EXCLUDED_DIRS.some(
    (dir) => relPosixPath === dir || relPosixPath.startsWith(dir + '/'),
  );
}

function countFileContent(content) {
  const counts = {};
  let total = 0;
  for (const category of CATEGORIES) {
    const matches = content.match(PATTERNS[category]);
    const n = matches ? matches.length : 0;
    counts[category] = n;
    total += n;
  }
  counts.total = total;
  return counts;
}

/** `srcDir` altındaki tüm .vue/.ts/.css/.scss dosyalarının repo-köküne göre
 * göreli yollarını (posix `/` ayraçlı) döndürür. */
function listStyleFiles(srcDir) {
  const results = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (EXTENSIONS.has(path.extname(entry.name))) {
        results.push(full);
      }
    }
  }
  walk(srcDir);
  return results;
}

/** `repoRoot`'a göre `src/**` (+ ADR-0015 A1b: seçili `public/assets/css/*`) içindeki her dosya için sayım map'i üretir. */
function buildCounts(repoRoot) {
  // ADR-0026: ortak DS kaynağı (packages/ui/src) artık src/ dışında — mandal kapsamı AYNI kalır.
  const files = [...listStyleFiles(path.join(repoRoot, 'src')), ...listStyleFiles(path.join(repoRoot, 'packages/ui/src'))];
  const map = {};
  for (const absPath of files) {
    const relPath = path.relative(repoRoot, absPath).split(path.sep).join('/');
    if (isExcluded(relPath)) continue;
    const content = fs.readFileSync(absPath, 'utf8');
    map[relPath] = countFileContent(content);
  }
  for (const relPath of EXTRA_LEGACY_CSS_FILES) {
    const absPath = path.join(repoRoot, relPath);
    if (!fs.existsSync(absPath)) continue;
    const content = fs.readFileSync(absPath, 'utf8');
    map[relPath] = countFileContent(content);
  }
  return map;
}

module.exports = { PATTERNS, CATEGORIES, countFileContent, listStyleFiles, buildCounts };

#!/usr/bin/env node
/**
 * Aşama 0 / R0 — derleme ölçümü (kod değiştirmez, yalnız `dist/` okur).
 *
 * Kullanım:  npx vite build && node scripts/measure-bundle.js [--json]
 *
 * Ölçtükleri:
 *  - toplam JS/CSS (min ve gzip -9), chunk sayısı, `dist/` toplam boyutu
 *  - AÇILIŞ (login) JS kapanışı: index.html'in <script type=module>, modulepreload
 *    ve stylesheet bağlantıları + bunların STATİK import zinciri (dinamik import
 *    hariç). Bu, "ilk yük" bütçesinin (ADR-0015 5.4) referans ölçüsüdür.
 *  - index.html'deki modulepreload sayısı
 *
 * gzip: zlib seviye 9 (sunucu sıkıştırması yaklaşık değeri; Vite'ın konsol
 * raporu varsayılan seviyeyi kullandığı için birkaç yüz bayt farklı olabilir).
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const dist = path.resolve(__dirname, '..', 'dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('dist/index.html yok — önce `npx vite build` çalıştırın.');
  process.exit(2);
}

const gz = (buf) => zlib.gzipSync(buf, { level: 9 }).length;
const kb = (n) => (n / 1024).toFixed(1);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

const files = walk(dist);
const distBytes = files.reduce((s, f) => s + fs.statSync(f).size, 0);
const js = files.filter((f) => f.endsWith('.js'));
const css = files.filter((f) => f.endsWith('.css'));

const sum = (list) =>
  list.reduce(
    (a, f) => {
      const b = fs.readFileSync(f);
      return { min: a.min + b.length, gz: a.gz + gz(b) };
    },
    { min: 0, gz: 0 }
  );

const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const refs = [];
for (const m of html.matchAll(/<(script|link)\b[^>]*>/g)) {
  const tag = m[0];
  const href = /(?:src|href)="([^"]+)"/.exec(tag);
  if (!href || !/\.(js|css)$/.test(href[1])) continue;
  const isModulePreload = /rel="modulepreload"/.test(tag);
  const isStyle = /rel="stylesheet"/.test(tag);
  const isScript = m[1] === 'script';
  if (isModulePreload || isStyle || isScript) {
    refs.push({ file: href[1].replace(/^\.?\//, ''), modulepreload: isModulePreload });
  }
}
const modulepreloadCount = refs.filter((r) => r.modulepreload).length;

const seen = new Set();
const queue = refs.map((r) => path.join(dist, r.file));
while (queue.length) {
  const f = queue.pop();
  if (seen.has(f) || !fs.existsSync(f)) continue;
  seen.add(f);
  if (!f.endsWith('.js')) continue;
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/(?:from|import)\s*["'](\.\/[^"']+\.js)["']/g)) {
    queue.push(path.join(path.dirname(f), m[1]));
  }
}
const entryJs = [...seen].filter((f) => f.endsWith('.js'));
const entryCss = [...seen].filter((f) => f.endsWith('.css'));

const result = {
  distMB: +(distBytes / 1024 / 1024).toFixed(2),
  jsChunks: js.length,
  jsTotal: sum(js),
  cssTotal: sum(css),
  entryJsFiles: entryJs.length,
  entryJs: sum(entryJs),
  entryCss: sum(entryCss),
  modulepreload: modulepreloadCount,
  entryJsList: entryJs
    .map((f) => path.basename(f))
    .sort(),
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`dist toplam          : ${result.distMB} MB`);
  console.log(`JS chunk sayısı      : ${result.jsChunks}`);
  console.log(`JS toplam            : ${kb(result.jsTotal.min)} kB min / ${kb(result.jsTotal.gz)} kB gz`);
  console.log(`CSS toplam           : ${kb(result.cssTotal.min)} kB min / ${kb(result.cssTotal.gz)} kB gz`);
  console.log(`Açılış JS (${result.entryJsFiles} dosya)   : ${kb(result.entryJs.min)} kB min / ${kb(result.entryJs.gz)} kB gz`);
  console.log(`Açılış CSS           : ${kb(result.entryCss.min)} kB min / ${kb(result.entryCss.gz)} kB gz`);
  console.log(`modulepreload sayısı : ${result.modulepreload}`);
  console.log('Açılış JS dosyaları  : ' + result.entryJsList.join(', '));
}

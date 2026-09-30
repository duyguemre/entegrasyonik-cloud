#!/usr/bin/env node
// A8 — uygulama geneli İKON ENVANTERİ (salt okuma). Kullanım: `node scripts/icon-inventory.js [--json]`
// Çıktı: set dağılımı (MDI / diğer), ayırt edici glif sayısı, dolgu+çizgi karışımı (aynı şeklin `-outline`
// sürümü varken dolgu kullanan glifler; `STATE_FILLED` ve çizgi ilkelleri hariç), bilinmeyen glifler.
// `tests/icon-style.test.ts` aynı hesabı kullanır (karışım = 0 bekçisi).
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const PRIMITIVES = new Set(['check', 'close', 'plus', 'minus', 'menu', 'menu-down', 'menu-up', 'percent', 'circle', 'star', 'checkbox-marked', 'radiobox-marked', 'checkbox-blank-circle'])

function mdiNames() {
  const css = fs.readFileSync(path.join(ROOT, 'node_modules/@mdi/font/css/materialdesignicons.css'), 'utf8')
  return new Set([...css.matchAll(/\.mdi-([a-z0-9-]+)::before/g)].map((m) => m[1]))
}

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f)
    if (fs.statSync(p).isDirectory()) walk(p, out)
    else if (/\.(vue|ts|js)$/.test(f)) out.push(p)
  }
  return out
}

function inventory() {
  const all = mdiNames()
  const files = walk(path.join(ROOT, 'src')).filter((f) => !f.endsWith(path.join('design', 'icons.ts')))
  const use = new Map()
  const unknown = new Map()
  const otherSets = new Map()
  for (const f of files) {
    const rel = path.relative(ROOT, f)
    const s = fs.readFileSync(f, 'utf8')
    for (const m of s.matchAll(/\bmdi-([a-z0-9]+(?:-[a-z0-9]+)*)/g)) {
      const n = m[1]
      const bucket = all.has(n) ? use : unknown
      if (!bucket.has(n)) bucket.set(n, new Set())
      bucket.get(n).add(rel)
    }
    for (const m of s.matchAll(/\b(fa[srlbd]? fa-[a-z-]+|material-icons|bi-[a-z-]+)\b/g)) {
      if (!otherSets.has(m[1])) otherSets.set(m[1], new Set())
      otherSets.get(m[1]).add(rel)
    }
  }
  const mixed = [...use.keys()].filter((n) => !n.endsWith('-outline') && !PRIMITIVES.has(n) && all.has(`${n}-outline`)).sort()
  const outline = [...use.keys()].filter((n) => n.endsWith('-outline')).length
  return {
    files: files.length,
    distinct: use.size,
    outline,
    mixed: mixed.map((n) => ({ icon: `mdi-${n}`, files: [...use.get(n)] })),
    unknown: [...unknown.keys()].filter((n) => !['buffer', 'queue'].includes(n)).map((n) => ({ icon: `mdi-${n}`, files: [...unknown.get(n)] })),
    otherSets: [...otherSets.keys()],
  }
}

module.exports = { inventory, PRIMITIVES }

if (require.main === module) {
  const inv = inventory()
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(inv, null, 2))
  } else {
    console.log(`Dosya: ${inv.files} · ayırt edici MDI glifi: ${inv.distinct} (çizgi: ${inv.outline}) · başka set: ${inv.otherSets.length ? inv.otherSets.join(', ') : 'yok'}`)
    console.log(`Dolgu+çizgi karışımı (çizgi sürümü varken dolgu): ${inv.mixed.length}`)
    for (const m of inv.mixed) console.log(`  ${m.icon}  ← ${m.files.join(', ')}`)
    if (inv.unknown.length) console.log(`Bilinmeyen glif: ${inv.unknown.map((u) => u.icon).join(', ')}`)
  }
}

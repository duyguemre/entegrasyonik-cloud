#!/usr/bin/env node
// ADR-0034 Karar 3 (D.3): kanonik chat/v1 protokolunu (frontend/packages/chat/src/protocol/v1.ts) backend'e KOPYALAR.
// Yalniz YEREL calisir (bulut backend'e yazmaz). Kullanim (backend/ icinden): node scripts/sync-chat-protocol.cjs
// Ilk yorum blogu (/** ... */) her iki dosyada ayri kalir: backend basligi korunur, govde frontend'den alinir.
const fs = require('fs');
const path = require('path');

const FE = path.resolve(__dirname, '../../frontend/packages/chat/src/protocol/v1.ts');
const BE = path.resolve(__dirname, '../src/operations/agent/protocol/v1.ts');

const stripHeader = (s) => s.replace(/^﻿/, '').replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '');
const header = (s) => { const m = s.replace(/^﻿/, '').match(/^\s*(\/\*[\s\S]*?\*\/)\s*/); return m ? m[1] : ''; };

if (!fs.existsSync(FE)) {
  console.error('Frontend protokol dosyasi yok: ' + FE + ' (CHAT-FE-1 once). Hicbir sey yazilmadi.');
  process.exit(1);
}
const fe = fs.readFileSync(FE, 'utf8');
const be = fs.existsSync(BE) ? fs.readFileSync(BE, 'utf8') : '';
const hdr = header(be) || '/** chat/v1 -- frontend/packages/chat/src/protocol/v1.ts kopyasi; elle degistirme. */';
fs.writeFileSync(BE, hdr + '\n' + stripHeader(fe), 'utf8');
console.log('Kopyalandi: ' + path.relative(process.cwd(), BE));

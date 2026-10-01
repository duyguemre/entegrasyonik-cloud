'use strict';
/** Tek seferlik TS betik calistirici: `node dev-tools/run-ts.js scripts/<dosya>.ts [bayraklar]`. Derleme/ts-node gerekmez (DB-05 TS kancasi). Betigin `main()` export'u cagrilir. */
const path = require('path');
const { installTsHook } = require('./_indexManifestSource');

const target = process.argv[2];
if (!target || !/^scripts[\/][\w.-]+\.ts$/.test(target)) { console.error('Kullanım: node dev-tools/run-ts.js scripts/<dosya>.ts [bayraklar]'); process.exit(1); }
installTsHook();
const mod = require(path.join(__dirname, '..', target));
process.argv.splice(2, 1); // hedef yolu argv'den cikar (betik kendi bayraklarini gorur)
Promise.resolve(typeof mod.main === 'function' ? mod.main(process.argv.slice(2)) : undefined).catch((e) => { console.error('[run-ts] hata:', e && e.message); process.exitCode = 1; });

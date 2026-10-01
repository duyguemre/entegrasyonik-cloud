'use strict';
/**
 * ADR-0021 Karar 5.3(a) — `backend/migrations/index-manifest.json` üretici.
 *
 * SALT-OKUMA, DB bağlantısı YOK. DB-05: `dist/` GEREKMEZ — `_indexManifestSource.js` kaynak TS'i doğrudan derler
 * (bayat `dist/`'ten bayat manifest üretme sorunu kalktı) ve şemalara bağlı olmayan `*_INDEXES` sabitlerini de katar.
 * AYNI hesaplama `tests/static/indexManifest.static.test.ts` tarafından (jest üzerinden) tekrar üretilir ve
 * committed dosyayla karşılaştırılır — drift'i o statik test yakalar.
 *
 * Kullanım: cd backend && node dev-tools/generate-index-manifest.js [--check]
 *   --check: dosyaya YAZMAZ; mevcut `index-manifest.json` ile hesaplanan farklıysa çıkış kodu 1.
 */
const fs = require('fs');
const path = require('path');
const { computeManifest } = require('./_indexManifestSource');

const MANIFEST_PATH = path.join(__dirname, '..', 'migrations', 'index-manifest.json');

function generate() {
    return computeManifest();
}

function main() {
    const check = process.argv.includes('--check');
    const manifest = generate();
    const json = JSON.stringify(manifest, null, 2) + '\n';
    if (check) {
        const existing = fs.existsSync(MANIFEST_PATH) ? fs.readFileSync(MANIFEST_PATH, 'utf8') : '';
        if (existing !== json) {
            console.error('[generate-index-manifest] DRIFT: index-manifest.json güncel değil. `node dev-tools/generate-index-manifest.js` ile yeniden üretip commit edin.');
            process.exitCode = 1;
            return;
        }
        console.log('[generate-index-manifest] OK: drift yok.');
        return;
    }
    fs.writeFileSync(MANIFEST_PATH, json);
    console.log('[generate-index-manifest] yazıldı: ' + path.relative(path.join(__dirname, '..', '..'), MANIFEST_PATH));
}

if (require.main === module) main();

module.exports = { generate };

'use strict';
/**
 * DB-05: indeks manifestini KAYNAK TS'ten (derleme/`dist/` GEREKMEDEN) hesaplar. Eski üretici `dist/`'i okuyordu ve
 * derleme bayatsa bayat manifest üretiyordu (L1 notu). Burada:
 *  - düz `node` altında `.ts` dosyaları `typescript.transpileModule` ile anında derlenir (tsconfig `paths` takma adlarıyla);
 *  - jest altında (`JEST_WORKER_ID`) jest'in kendi TS dönüştürücüsü/`moduleNameMapper`'ı kullanılır (kanca kurulmaz);
 *  - şemalara BAĞLANMAMIŞ `*_INDEXES` sabitleri (ör. NotificationEvent/Delivery/Preferences) da manifeste katılır.
 * SALT-OKUMA: DB bağlantısı YOK (`mongoose.createConnection()` hiçbir URI'ye açılmaz).
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

const BACKEND_ROOT = path.join(__dirname, '..');
const MODEL_DIRS = {
    app: path.join(BACKEND_ROOT, 'src', 'database', 'application', 'models'),
    tenant: path.join(BACKEND_ROOT, 'src', 'database', 'client', 'models'),
};

/**
 * Şemaya bağlı OLMAYAN ve BİLEREK manifest dışı tutulan sabitler (gerekçe zorunlu). Yeni bir `*_INDEXES` sabiti buraya
 * yazılmadıkça manifeste GİRER; böylece "sabit var, göç/manifest yok" durumu (DBR-03) statik testte kırmızı olur.
 */
const EXCLUDED_INDEX_CONSTANTS = {};

let hookInstalled = false;
function installTsHook() {
    if (hookInstalled || process.env.JEST_WORKER_ID) return;
    hookInstalled = true;
    const ts = require('typescript');
    const cfgPath = path.join(BACKEND_ROOT, 'tsconfig.json');
    const raw = ts.readConfigFile(cfgPath, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(raw.config, ts.sys, BACKEND_ROOT);
    const options = { ...parsed.options, module: ts.ModuleKind.CommonJS, sourceMap: false, declaration: false, declarationMap: false, composite: false, inlineSourceMap: false };
    const paths = parsed.options.paths || {};
    const baseUrl = parsed.options.baseUrl || BACKEND_ROOT;
    const aliases = Object.entries(paths).map(([k, v]) => ({ prefix: k.replace(/\*$/, ''), exact: !k.endsWith('*'), target: path.resolve(baseUrl, v[0].replace(/\*$/, '')) }));
    const origResolve = Module._resolveFilename;
    Module._resolveFilename = function (request, ...rest) {
        for (const a of aliases) {
            if (a.exact ? request === a.prefix : request.startsWith(a.prefix)) {
                const mapped = a.exact ? a.target : path.join(a.target, request.slice(a.prefix.length));
                return origResolve.call(this, mapped, ...rest);
            }
        }
        return origResolve.call(this, request, ...rest);
    };
    require.extensions['.ts'] = function (module, filename) {
        const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: options, fileName: filename });
        module._compile(out.outputText, filename);
    };
}

const isSchema = (v) => v && typeof v === 'object' && typeof v.indexes === 'function' && typeof v.get === 'function';

/** Model dosyalarındaki `*_INDEXES` sabitlerini bulur: [{section, collection, constName, indexes}]. */
function discoverIndexConstants() {
    installTsHook();
    const found = [];
    for (const [section, dir] of Object.entries(MODEL_DIRS)) {
        for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.ts')).sort()) {
            const full = path.join(dir, file);
            if (!/_INDEXES\b/.test(fs.readFileSync(full, 'utf8'))) continue;
            const mod = require(full);
            const schemas = Object.values(mod).filter(isSchema);
            for (const [constName, value] of Object.entries(mod)) {
                if (!/_INDEXES$/.test(constName) || !Array.isArray(value)) continue;
                if (schemas.length !== 1) throw new Error(`${file}: ${constName} için tek bir Schema export'u bekleniyordu (bulunan: ${schemas.length}).`);
                const collection = schemas[0].get('collection');
                if (!collection) throw new Error(`${file}: şemada açık 'collection' yok.`);
                found.push({ section, collection, constName, file, indexes: value });
            }
        }
    }
    return found;
}

/** Manifest = şema `schema.indexes()` beyanları + (dışlananlar hariç) `*_INDEXES` sabitleri. */
function computeManifest() {
    installTsHook();
    const { buildIndexManifest } = require('../src/database/indexManifest');
    const appFactory = require('../src/database/application/ApplicationMongooseSchemas').default;
    const tenantFactory = require('../src/database/client/ClientMongooseSchemas').default;
    const constants = discoverIndexConstants().filter((c) => !EXCLUDED_INDEX_CONSTANTS[c.constName]);
    return buildIndexManifest(appFactory, tenantFactory, undefined, constants);
}

module.exports = { computeManifest, discoverIndexConstants, EXCLUDED_INDEX_CONSTANTS, installTsHook };

#!/usr/bin/env node
/**
 * Katman / modül bazlı jest çalıştırıcı (WP6, F-20). Mevcut test dosyaları taşınmaz; katman ve modül
 * yol desenleriyle (jest --testPathPattern) seçilir. Kullanım (backend/ içinden):
 *   node tests/tools/run-tests.js layer <unit|characterization|contract|integration|all> [jest argları]
 *   node tests/tools/run-tests.js module <ad|yol-regex> [jest argları]
 *   node tests/tools/run-tests.js list            # katman + modül tablosu
 * Gerçek-Mongo testleri (tests/integration) ASLA burada çalışmaz: `npm run test:integration:real`.
 */
const { spawnSync } = require('child_process');
const path = require('path');

// testPathPattern'da '/' jest tarafından platform ayracına çevrilir ('[\/]' Windows'ta BOZULUR); düz '/' kullan.
const p = (s) => s;

// Katmanlar: include desenleri (OR).
const LAYERS = {
  unit: [p('tests/unit/'), p('tests/static/'), p('tests/dev/'), p('tests/smoke.test')],
  characterization: [p('tests/characterization/')],
  contract: [p('tests/contract/'), '\.contract\.test\.ts$'],
  // mock'lu / bellek-içi (mongodb-memory-server) entegrasyon; gerçek Mongo DEĞİL
  integration: [p('tests/mongo-semantics/')],
  // ADR-0033 INT-03: adaptör conformance kiti (yerel HTTP sunucusu; ağ/DB yok)
  conformance: [p('tests/conformance/')],
  all: [],
};

// Modül → yol desenleri (OR). Dosya adı bazlı eşleşmeler (ör. Trendyol.*) dizin dağınıklığını kapatır.
const MODULES = {
  trendyol: ['[Tt]rendyol'],
  hepsiburada: ['[Hh]epsiburada'],
  n11: ['[Nn]11'],
  pazarama: ['[Pp]azarama'],
  ideasoft: ['[Ii]deasoft'],
  bizimhesap: ['[Bb]izimhesap'],
  common: [p('characterization/common/'), p('characterization/transformers/'), p('characterization/stubs/')],
  cache: [p('characterization/cache/'), '[Cc]ache'],
  api: [p('tests/unit/api/'), p('characterization/[a-z-]+-service/'), p('characterization/(idor|auth|webhooks|menu|setting|configuration)/'), p('tests/unit/(security|tenant-surface)/')],
  auth: [p('characterization/auth/'), p('unit/security/')],
  'integration-engine': [
    p('characterization/(engine|catalog|queue|order-queue|orders|trendyol-orders|trendyol-product|stock|transformers|stubs|common)/'),
    p('unit/(engine|integration|config|compliance)/'), p('tests/contract/'), p('tests/mongo-semantics/'),
  ],
  engine: [p('characterization/engine/'), p('unit/engine/')],
  catalog: [p('characterization/catalog/'), p('tests/contract/catalog/')],
  orders: [p('characterization/(orders|order-queue|order-service|trendyol-orders)/')],
  stock: [p('characterization/stock/')],
  config: [p('unit/config/'), p('characterization/(config|configuration)/'), p('mongo-semantics/')],
  secrets: [p('characterization/secrets/')],
  tenant: [p('characterization/tenant/'), p('unit/tenant-surface/'), p('unit/database/TenantRegistry')],
  billing: [p('unit/billing/'), p('unit/account/')],
  platform: [p('unit/platform/')],
  database: [p('characterization/database/'), p('unit/database/'), p('mongo-semantics/tenantUseDb'), p('characterization/schema/'), p('tests/unit/(migrate|mongoLease|migration)')],
  compliance: [p('unit/compliance/')],
  // ADR-0029 bildirim sistemi (katalog, notify cekirdegi, defter; mevcut bildirim characterization testleri dahil)
  notification: [p('unit/notifications/'), p('unit/alerts/'), p('mongo-semantics/notifications/'), p('characterization/notification/')],
  notifications: [p('unit/notifications/'), p('unit/alerts/'), p('mongo-semantics/notifications/'), p('characterization/notification/')],
  // ADR-0017 Asama C / NB8: alarm kurallari + degerlendirici
  alerts: [p('unit/alerts/')],
  // ADR-0034 BR-1: sohbet araci (protokol, sahte LLM, calisma bellegi, SSE uclari)
  agent: [p('unit/agent/'), p('static/chatProtocol'), p('static/agentApproval')],
  // ADR-0035 MCP-5: OAuth + /mcp + onay + esitlik/guvenlik regresyon paketi (+ ortak onay mandallari)
  mcp: [p('unit/mcp/'), p('unit/oauth/'), p('static/mcp5'), p('static/agentApproval')],
};

const jestBin = path.join(path.dirname(require.resolve('jest/package.json')), 'bin', 'jest.js');
const root = path.resolve(__dirname, '..', '..');
// testPathIgnorePatterns normalize EDİLMEZ: ayraç yerine '.' joker (Windows/POSIX)
const BASE_IGNORE = ['.node_modules.', 'tests.integration.'];

function runJest(includes, extra) {
  const args = [jestBin];
  if (includes.length) args.push('--testPathPattern', ...includes);
  args.push('--testPathIgnorePatterns', ...BASE_IGNORE, ...extra.ignore);
  args.push(...extra.rest);
  const r = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  process.exit(r.status === null ? 1 : r.status);
}
function split(argv) {
  // "--" sonrası doğrudan jest'e gider; ekstra ignore yok.
  return { ignore: [], rest: argv };
}

const [, , cmd, name, ...rest] = process.argv;
if (cmd === 'list') {
  console.log('Katmanlar:\n  ' + Object.keys(LAYERS).join(', '));
  console.log('Moduller:\n  ' + Object.keys(MODULES).join(', '));
  process.exit(0);
}
if (cmd === 'layer') {
  if (!LAYERS[name]) { console.error(`Bilinmeyen katman: ${name}. Gecerli: ${Object.keys(LAYERS).join(', ')}`); process.exit(2); }
  const e = split(rest);
  if (name === 'characterization') e.ignore.push('\.contract\.test\.ts$');
  runJest(LAYERS[name], e);
} else if (cmd === 'module') {
  if (!name) { console.error('Modul adi gerekli. `npm run test:modules` ile listele.'); process.exit(2); }
  const key = name.replace(/^integration[\/]/, '').replace(/^src[\/]/, '').toLowerCase();
  let inc = MODULES[key];
  if (!inc) {
    console.error(`[uyari] "${name}" tanimli modul degil; ham yol regex'i olarak kullaniliyor.`);
    inc = [name];
  }
  runJest(inc, split(rest));
} else {
  console.error('Kullanim: run-tests.js layer|module|list ...');
  process.exit(2);
}

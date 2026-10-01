#!/usr/bin/env node
// ADR-0019 §2 türetim (d): docs/CAPABILITIES.md + docs/CAPABILITIES_CHANGELOG.md + backend/generated/capabilities.manifest.json
// KAYNAK: backend/src/capabilities/** (derlenmiş: dist/src/capabilities). ELLE DÜZENLENMEZ — `npm run capabilities:docs`
// (= `npm run build && node dev-tools/capabilities-docs.js`) her çalıştığında baştan üretir.
// DB/Redis/ağ YOK; salt dosya sistemi (bu betiğin proje kökü dışına YAZDIĞI hiçbir şey yoktur).
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..'); // ENTEGRASYONIK_FACTORY
const BACKEND = path.resolve(__dirname, '..');
const { CAPABILITIES, findRegistryInvariantViolations } = require(path.join(BACKEND, 'dist/src/capabilities'));

const violations = findRegistryInvariantViolations();
if (violations.length) {
  console.error('[capabilities:docs] Kayıt bütünlüğü ihlalleri var, üretim DURDURULDU:');
  console.error(JSON.stringify(violations, null, 2));
  process.exit(1);
}

const byDomain = new Map();
for (const cap of CAPABILITIES) {
  if (!byDomain.has(cap.domain)) byDomain.set(cap.domain, []);
  byDomain.get(cap.domain).push(cap);
}
const domains = [...byDomain.keys()].sort();

const mcpLabel = (cap) => {
  if (cap.mcp.exposed) return `exposed (${cap.mcp.exposed.toolset})`;
  const n = cap.mcp.notExposed;
  return n.reason === 'deferred' ? `notExposed:deferred→${n.until}` : `notExposed:${n.reason}`;
};
const uiLabel = (cap) => (cap.ui.screens ? cap.ui.screens.map((s) => s.screen + (s.action ? '#' + s.action : '')).join(', ') : `none (${cap.ui.none.reason})`);
const agentLabel = (cap) => (cap.agent.allowed ? `allowed:${cap.agent.maxEffect}` : 'allowed:false');
// HTTP bağları (RPC'siz uçlar, ADR-0034 BR-2) `GET /yol` biçiminde; RPC bağları 'Servis/operasyon'.
const rpcLabel = (cap) => cap.bindings.map((b) => b.rpc ?? b.http).join(', ');

const totals = {
  total: CAPABILITIES.length,
  byEffect: {},
  byMinTier: {},
  exposed: CAPABILITIES.filter((c) => c.mcp.exposed).length,
  notExposed: CAPABILITIES.filter((c) => c.mcp.notExposed).length,
  deferred: CAPABILITIES.filter((c) => c.mcp.notExposed?.reason === 'deferred').length,
  orphan: CAPABILITIES.filter((c) => !!c.ui.none && !!c.mcp.notExposed && !c.agent.allowed).length,
  totalBindings: CAPABILITIES.reduce((n, c) => n + c.bindings.length, 0),
};
for (const c of CAPABILITIES) {
  totals.byEffect[c.effect] = (totals.byEffect[c.effect] || 0) + 1;
  totals.byMinTier[c.minTier] = (totals.byMinTier[c.minTier] || 0) + 1;
}

const lines = [];
lines.push('# CAPABILITIES.md — Yetenek Kaydı (ADR-0019)');
lines.push('');
lines.push('**ÜRETİLMİŞ BELGE — ELLE DÜZENLENMEZ.** Kaynak: `backend/src/capabilities/**` (zod-şemalı TypeScript kaydı).');
lines.push('Yeniden üretmek için: `cd backend && npm run capabilities:docs`. Bu belge `docs/OPERATION_POLICY.md`\'nin yerine geçer (ADR-0019 §2).');
lines.push('');
lines.push(`Üretim zamanı: ${new Date().toISOString()} · Kaynak commit bilgisi bu betiğin dışında (git) tutulur.`);
lines.push('');
lines.push('## Özet');
lines.push('');
lines.push(`- Toplam yetenek: **${totals.total}** (toplam RPC bağı: ${totals.totalBindings})`);
lines.push(`- \`effect\`: ${Object.entries(totals.byEffect).map(([k, v]) => `${k}=${v}`).join(', ')}`);
lines.push(`- \`minTier\`: ${Object.entries(totals.byMinTier).map(([k, v]) => `${k}=${v}`).join(', ')}`);
lines.push(`- MCP: \`exposed\`=${totals.exposed}, \`notExposed\`=${totals.notExposed} (bunun \`deferred\`=${totals.deferred})`);
lines.push(`- Yetim (ui.none + mcp.notExposed + agent.allowed:false): ${totals.orphan} (bkz. \`capability-baseline.json\`, artamaz mandalı)`);
lines.push('');
lines.push('**Operasyon/yetenek sayısı tutarsızlığı çözümü (ADR-0019 Bağlam):** `operationPolicy.ts`nin bugünkü mekanik sayımı ');
lines.push('(ImageApi sözde-servisi DAHİL, `OPEN_OPERATIONS` HARİÇ) **174** `(servis, operasyon)` çiftidir (member 137, admin 19, owner 2, ');
lines.push('platformAdmin 16). Önceki belgelerdeki "156/158/159" sayıları bu tablonun daha önceki, KVKK/webhook/tenant-yüzlü ');
lines.push('operasyonlar eklenmeden ÖNCEKİ anlık görüntüleridir (bkz. git geçmişi: `1b40095`=151, `100c600`=155, `962930f`=156, ');
lines.push('`34488dd`=159, ...). `docs/OPERATION_POLICY.md`\'nin "172" sayısı ise **BillingService\'in (3 operasyon: getPlans, ');
lines.push('getMySubscription, startCheckout) o belgenin "Tam tablo" bölümünde hiç listelenmemiş olmasından** kaynaklanan bir belge ');
lines.push('hatasıydı (171 [tablo] + 13 [tenant-yüzlü] = ~aritmetik olarak 172 iddia edildi ama gerçek tablo toplamı 158+13=171\'di; ');
lines.push('Billing (3) hiç sayılmamıştı). Bu ADR-0019 içe aktarımı Billing dahil TÜM 174 kaydı `capabilities/domains/billing.ts` ');
lines.push('dahil 14 alan dosyasına taşıdı; **174 RPC operasyonu → 149 iş-odaklı yetenek** (tekli+toplu birleşimi ve CRUD ailelerinin ');
lines.push('iş odaklı gruplanması nedeniyle azaldı — ADR-0019 §4.3 tahmini "156\'nın ~100-110 yeteneğe ineceği" tahmininden YÜKSEK ');
lines.push('kaldı; bu Aşama A ölçümüdür, bulgu olarak işaretlendi: bazı domain\'ler (integrations, catalog) daha fazla ');
lines.push('birleştirilebilir, Aşama B/C\'de gözden geçirilebilir).');
lines.push('');
lines.push('3 FE çağrısı (`IntegrationService/checkProductStatus`, `IntegrationService/processPlatformProduct`, ');
lines.push('`IntegrationService/retrieveProductsFromClientMarketplace`) bilinçli olarak yetenek kaydına GİRMEDİ: gerçek bir servis ');
lines.push('metodu yok (bugün de 403/çalışmıyor; `operation-policy.test.ts` `FE_CALLS_WITHOUT_BACKEND` listesi bunu doğrular).');
lines.push('');
lines.push('## Alan (domain) başına yetenekler');
lines.push('');
for (const d of domains) {
  const caps = byDomain.get(d).slice().sort((a, b) => a.id.localeCompare(b.id));
  lines.push(`### ${d} (${caps.length})`);
  lines.push('');
  lines.push('| id | effect | minTier | RPC bağları | mcp | ui | agent | review |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const c of caps) {
    const review = c.review ? c.review.replace(/\|/g, '\\|').slice(0, 160) : '';
    lines.push(`| \`${c.id}\` | ${c.effect} | ${c.minTier} | ${rpcLabel(c)} | ${mcpLabel(c)} | ${uiLabel(c)} | ${agentLabel(c)} | ${review} |`);
  }
  lines.push('');
}

const CAPABILITIES_MD = path.join(ROOT, 'docs', 'CAPABILITIES.md');
fs.writeFileSync(CAPABILITIES_MD, lines.join('\n') + '\n');
console.log(`[capabilities:docs] yazıldı: ${path.relative(ROOT, CAPABILITIES_MD)} (${totals.total} yetenek)`);

// --- Manifest (özet, SHA-256; ADR-0019 §2 (c) — Aşama C'de tam MCP manifestine genişler) -------------------------
const manifestBody = {
  generatedAt: new Date().toISOString(),
  stage: 'A',
  totalCapabilities: totals.total,
  totalBindings: totals.totalBindings,
  capabilities: CAPABILITIES.slice().sort((a, b) => a.id.localeCompare(b.id)).map((c) => ({
    id: c.id,
    version: c.version,
    domain: c.domain,
    effect: c.effect,
    minTier: c.minTier,
    scope: c.scope,
    rpc: c.bindings.filter((b) => b.rpc).map((b) => b.rpc),
    ...(c.bindings.some((b) => b.http) ? { http: c.bindings.filter((b) => b.http).map((b) => b.http) } : {}),
    mcp: c.mcp.exposed ? { exposed: true, toolset: c.mcp.exposed.toolset } : { exposed: false, reason: c.mcp.notExposed.reason, until: c.mcp.notExposed.until },
    agent: c.agent.allowed ? { allowed: true, maxEffect: c.agent.maxEffect } : { allowed: false },
  })),
};
const bodyJson = JSON.stringify(manifestBody, null, 2);
const digest = crypto.createHash('sha256').update(bodyJson).digest('hex');
const manifest = { schemaVersion: 1, sha256: digest, ...manifestBody };

const GENERATED_DIR = path.join(BACKEND, 'generated');
fs.mkdirSync(GENERATED_DIR, { recursive: true });
const MANIFEST_PATH = path.join(GENERATED_DIR, 'capabilities.manifest.json');

let previous = null;
try { previous = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')); } catch { /* ilk üretim */ }

fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
console.log(`[capabilities:docs] yazıldı: ${path.relative(ROOT, MANIFEST_PATH)} (sha256=${digest.slice(0, 12)}…)`);

// --- Değişiklik günlüğü (yalnız özet değiştiyse ekler) -------------------------------------------------------------
const CHANGELOG_PATH = path.join(ROOT, 'docs', 'CAPABILITIES_CHANGELOG.md');
if (!previous || previous.sha256 !== digest) {
  const prevIds = new Set((previous?.capabilities || []).map((c) => c.id));
  const curIds = new Set(manifestBody.capabilities.map((c) => c.id));
  const added = [...curIds].filter((id) => !prevIds.has(id));
  const removed = [...prevIds].filter((id) => !curIds.has(id));
  const header = fs.existsSync(CHANGELOG_PATH)
    ? fs.readFileSync(CHANGELOG_PATH, 'utf8')
    : '# CAPABILITIES_CHANGELOG.md\n\n**ÜRETİLMİŞ BELGE — ELLE DÜZENLENMEZ.** `npm run capabilities:docs` her manifest özeti değiştiğinde\nburaya tarihli bir blok ekler (ADR-0019 §4.1). Kademe değişiklikleri HER ZAMAN buraya yazılır.\n';
  const block = [
    '',
    `## ${new Date().toISOString().slice(0, 10)} — sha256 ${digest.slice(0, 12)}…`,
    previous ? '' : '- İLK ÜRETİM (Aşama A): 174 RPC operasyonu → 149 yetenek içe aktarıldı; tamamı `mcp.notExposed`.',
    added.length ? `- Eklenen: ${added.map((i) => '`' + i + '`').join(', ')}` : '',
    removed.length ? `- Kaldırılan: ${removed.map((i) => '`' + i + '`').join(', ')}` : '',
    '',
  ].filter((l) => l !== '' || true).join('\n');
  fs.writeFileSync(CHANGELOG_PATH, header.trimEnd() + '\n' + block);
  console.log(`[capabilities:docs] güncellendi: ${path.relative(ROOT, CHANGELOG_PATH)}`);
} else {
  console.log('[capabilities:docs] manifest özeti değişmedi, değişiklik günlüğü güncellenmedi.');
}

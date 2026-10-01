/**
 * dependency-cruiser — katman sözleşmesi (docs/BACKEND_CODE_AUDIT.md §d.1). ADR-0024 P4-GATE (2026-10-01): ihlali
 * sıfıra inen TÜM kurallar 'error'. Yalnız `no-circular` 'warn' kalır (interfaces/ barrel + metrics prodDeps döngüleri);
 * sayısı `quality/baseline.json`'da mandallıdır (`npm run ratchet`): ARTAMAZ, sıfırlanınca 'error'a çevrilir.
 *
 * Çalıştırma: npm run depcruise  (yalnızca src + entegrasyonik.ts taranır; testler ve dev-tools kapsam dışı)
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment: 'Döngüsel bağımlılık. Bilinen 2 döngü yalnızca interfaces/ barrel dosyalarındadır (tip); mandallıdır.',
      severity: 'warn',
      from: {},
      to: { circular: true },
    },
    {
      name: 'lower-layers-not-to-api',
      comment: 'database|services|operations|integration → api YASAK (api katmanı hiçbir alt katmandan içe aktarılmaz; ters bağımlılık, MM-04).',
      severity: 'error',
      from: { path: '^src/(database|services|operations|integration)/' },
      to: { path: '^src/api/' },
    },
    {
      name: 'adapters-not-to-operations',
      comment: 'integration/modules (adaptörler) → operations|api YASAK: adaptör iş kuralı katmanını bilmez.',
      severity: 'error',
      from: { path: '^src/integration/modules/' },
      to: { path: '^src/(operations|api)/' },
    },
    {
      name: 'database-not-to-upper-layers',
      comment: 'database → operations|integration|api YASAK: veri katmanı üst katmanları bilmez.',
      severity: 'error',
      from: { path: '^src/database/' },
      to: { path: '^src/(operations|integration|api)/' },
    },
    {
      name: 'leaf-layers-not-to-upper',
      comment: 'interfaces ve utils yaprak katmandır: database|services|operations|integration|api içe aktarmaz.',
      severity: 'error',
      from: { path: '^src/(interfaces|utils)/' },
      to: { path: '^src/(database|services|operations|integration|api)/' },
    },
    {
      name: 'platform-not-to-api',
      comment: 'ADR-0024 P0-LAYER: platform → api YASAK (platform en alt yatay katmandır; ters bağımlılık). Rate limit/güvenlik yardımcıları platform altındadır; api yalnızca shim tutar.',
      severity: 'error',
      from: { path: '^src/platform/' },
      to: { path: '^src/api/' },
    },
    {
      name: 'services-not-to-operations',
      comment: 'ADR-0024 P0-LAYER: services (S3/Mail/Redis...) → operations YASAK; paylaşılan saf yardımcılar utils/ veya platform/ altındadır.',
      severity: 'error',
      from: { path: '^src/services/' },
      to: { path: '^src/operations/' },
    },
    {
      name: 'operations-not-to-engine',
      comment: 'ADR-0024 P0-LAYER: operations → integration/engine YASAK (ters kenar). Olay yolu platform/runtime/events altındadır; kuyruk üreticisi gibi engine bağımlılıkları üst katmanda (api/bootstrap) enjekte edilir.',
      severity: 'error',
      from: { path: '^src/operations/' },
      to: { path: '^src/integration/engine/' },
    },
    {
      name: 'bootstrap-only-from-entrypoint',
      comment: 'ADR-0024 P0-LIFE: src/bootstrap (bileşim kökü) yalnızca entegrasyonik.ts ve kendi içinden içe aktarılır; hiçbir alt katman bootstrap kodunu bilmez.',
      severity: 'error',
      from: { pathNot: '^(entegrasyonik[.]ts|src/bootstrap/)' },
      to: { path: '^src/bootstrap/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '^(dist|coverage|tests|dev-tools)/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'node', 'default'] },
    reporterOptions: { text: { highlightFocused: true } },
  },
};

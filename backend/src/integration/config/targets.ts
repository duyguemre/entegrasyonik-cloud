// ADR-0020 Karar 1.1 — "motor-genel ayarlar için `_engine`" hedef adı. Bu sabit BİLEREK hem burada (integration/
// katmanı) hem `database/application/models/IntegrationConfig.ts`'te (database katmanı) AYRI AYRI tanımlıdır:
// dependency-cruiser `database-not-to-upper-layers` kuralı database'in integration'ı içe aktarmasını yasaklar
// (bkz. `.dependency-cruiser.cjs`); iki karakterlik bir sabit için katman ihlali açmak yerine TEK DEĞER iki yerde
// durur (test: `configTargets.consistency.test.ts` iki sabitin birbiriyle aynı olduğunu doğrular).
export const ENGINE_TARGET = '_engine' as const;

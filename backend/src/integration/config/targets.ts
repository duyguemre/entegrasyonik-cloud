// ADR-0020 Karar 1.1 — "motor-genel ayarlar için `_engine`" hedef adı. Bu sabit BİLEREK hem burada (integration/
// katmanı) hem `database/application/models/IntegrationConfig.ts`'te (database katmanı) AYRI AYRI tanımlıdır:
// dependency-cruiser `database-not-to-upper-layers` kuralı database'in integration'ı içe aktarmasını yasaklar
// (bkz. `.dependency-cruiser.cjs`); iki karakterlik bir sabit için katman ihlali açmak yerine TEK DEĞER iki yerde
// durur (test: `configTargets.consistency.test.ts` iki sabitin birbiriyle aynı olduğunu doğrular).
export const ENGINE_TARGET = '_engine' as const;

// ADR-0031 Karar 2 / BE-CFG-2 — çalışma zamanı platform ayarları (destek iletişimi, duyuru, bakım, UI varsayılanları)
// AYNI motorda `_platform` hedefi olarak tutulur. `ENGINE_TARGET` gibi bu sabit de iki yerde durur (burada + `database/
// application/models/IntegrationConfig.ts` başlık yorumu — database katmanı integration'ı içe aktaramaz); tutarlılık testi:
// tests/unit/config/platformTarget.test.ts.
export const PLATFORM_TARGET = '_platform' as const;

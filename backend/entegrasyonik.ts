import 'dotenv/config';
import { installConsoleBridge } from "@platform/core/logger";
import { installErrorEventLoggerBridge, installCacheMetricsBridge, recordUnhandledRejection } from "@platform/runtime/metrics";
import { installLogPersistence } from "@platform/runtime/logs";
import { installIntegrationCallMetricsBridge } from "./src/integration/modules/common/http/IntegrationCallMetricsBridge";
import { bootApplication, shutdown } from "@bootstrap/app";

// ADR-0024 P0-LIFE: bu dosya yalnız BİLEŞİM KÖKÜNÜ ateşler; rol/HTTP/zamanlayıcı/kapanış mantığı `src/bootstrap/**` içindedir.

// ADR-0017 Karar 1.7 adım 1 ("Köprü", Aşama A): YALNIZCA burada, ana akışta -- modül import zincirinde DEĞİL --
// `console.log/info/warn/error/debug` pino'ya yönlendirilir (geri alma: LOG_FORMAT=legacy).
installConsoleBridge();
// ADR-0017 Aşama B Karar 2.4: `logger.error(...)` -> `ErrorEvents` köprüsü.
installErrorEventLoggerBridge();
// ADR-0026 WP-LOG L1: kalici log deposu (LOG_PERSIST_ENABLED=false iken HICBIR sey kurulmaz -- sifir maliyet).
installLogPersistence();
// ADR-0017 Aşama B Karar 2.2 (K4): `IntegrationCallMetrics` çağrı-başı Mongo yazımı DURUR, MetricsRegistry'e yönlendirilir.
installIntegrationCallMetricsBridge();
// ADR-0002 (faz4-int-wp3): @Cache hit/miss/set/error/evict sayaçları -> MetricsRegistry `cache_events{family,event}`.
installCacheMetricsBridge();

// Unhandled Rejection: ADR-0006 Karar 6 -- SAYILIR, süreç KAPATILMAZ (henüz; 24 saatlik gözlem sonrası "logla + kapan").
process.on("unhandledRejection", (reason) => {
  console.error(`\n--------------------------------------------------`);
  console.error(`[Global Error] Unhandled Rejection:`, reason);
  console.error(`--------------------------------------------------`);
  try { recordUnhandledRejection(); } catch { /* metrik kaydı ASLA süreci etkilemez */ }
});

// Uncaught Exception: ADR-0006 Karar 6 -- logla + graceful shutdown + exit(1) (platform yeniden başlatır).
process.on("uncaughtException", (error) => {
  console.error(`\n--------------------------------------------------`);
  console.error(`[Global Error] Uncaught Exception:`, error.message);
  console.error(error.stack);
  console.error(`--------------------------------------------------`);
  return shutdown("Uncaught Exception", error);
});

// Sistem sinyalleri: ilk sinyal düzgün kapanış, kapanış sürerken ikinci sinyal HEMEN çıkış (bkz. bootstrap/shutdown.ts).
process.on('SIGINT', () => shutdown('SIGINT (Ctrl+C)'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ATEŞLE!
void bootApplication();

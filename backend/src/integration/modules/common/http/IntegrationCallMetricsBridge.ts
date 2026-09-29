// ADR-0017 Karar 2.2 (K4 kapanışı): "IntegrationCallMetrics çağrı-başı dokümanı durdurulur (mevcut `setSink`
// üzerinden kayıt defterine yönlendirilir)". Bu dosya `IntegrationCallMetrics.ts`'i YENİDEN YAZMAZ -- yalnızca
// `setSink` genişleme noktasını kullanan bir KÖPRÜ/sarmalayıcıdır (katman: bu dizin Sv6 `integration/modules`,
// `platform/runtime/metrics` Sv5'e bağımlı olabilir; TERSİ yasaktır -- bu yüzden köprü BURADA, metrics içinde DEĞİL).
//
// BULGU (rapor edilir, ResilientHttpClient DEĞİŞTİRİLMEDİĞİ için düzeltilmedi): `IntegrationCallMetricEntry`
// girdisinde `kind` (read|write) alanı YOK -- `ResilientHttpClient.ts` bunu `IntegrationCallMetrics.record()`a
// hiç GEÇİRMİYOR (yalnızca kendi iç `Kind` değişkenini breaker seçimi için kullanıyor). Bu yüzden ADR'nin
// istediği `integration_calls{kind}` etiketi bu köprüde ÜRETİLEMEZ; seri yalnızca {tenantId, integrationCode,
// outcome} ile kurulur.
import { IntegrationCallMetrics, IntegrationCallMetricSink } from './IntegrationCallMetrics';
import { recordIntegrationCallMetric } from '@platform/runtime/metrics';

const bridgeSink: IntegrationCallMetricSink = async (record: Record<string, any>): Promise<void> => {
    recordIntegrationCallMetric({
        integrationCode: record.integrationCode,
        tenantId: record.clientId,
        status: record.status,
        code: record.code,
        durationMs: record.durationMs,
        retries: record.retries ?? 0,
    });
};

/**
 * ADR-0017 Karar 2.2: eski davranış (çağrı başına `IntegrationCallMetrics` koleksiyonuna `create`) DURUR;
 * bunun yerine her çağrı `MetricsRegistry`e (bellek-içi, 60 sn'de bir `MetricRollups`e flush) yönlendirilir.
 * Geri alma: `uninstallIntegrationCallMetricsBridgeForTests()` (ya da hiç kurulmazsa eski `defaultSink`
 * davranışı AYNEN çalışmaya devam eder -- `setSink(undefined)` ile eşdeğer).
 */
export function installIntegrationCallMetricsBridge(): void {
    IntegrationCallMetrics.setSink(bridgeSink);
}

/** Yalnız testler için: köprüyü kaldırır (varsayılan `defaultSink`e döner). */
export function uninstallIntegrationCallMetricsBridgeForTests(): void {
    IntegrationCallMetrics.setSink(undefined);
}

// frontend/src/components/adminPanel/integrations/settingsCatalogMirror.ts
//
// ADR-0020 Aşama C — GEÇİCİ, AÇIKÇA İŞARETLİ köprü. SAF TS (Vue import'u yok).
//
// **NEDEN BU DOSYA VAR (backend sözleşmesi açığı, rapora yazıldı):** `IntegrationConfigService`
// (Aşama B) hiçbir uçta katalog METAVERİSİNİ (label/help/impact/unit/danger/applies/advanced/
// overridable/envLock/safeRange/default/type) döndürmüyor — yalnızca `getEffectiveConfig` çözümlenmiş
// `{key,value,source,envVar?,revision?}` listesini veriyor (bkz. `backend/src/api/services/
// integration-config-service.ts` `getEffectiveConfig()` + `backend/src/integration/config/
// diffAndImpact.ts` `DiffEntry` — ikisi de yalnızca `key` taşıyor, tanım değil). ADR-0020 Karar 4.2
// ("Etiket sade TR, `?` etki notu, birim, tehlike rozeti...") bu metaveri OLMADAN kurulamaz. Backend'e
// dokunmak bu görevin kapsamı DIŞI olduğundan, bu dosya `backend/src/integration/config/catalog/*.ts`
// (2026-09-29 sürümü, `CATALOG_VERSION = '2026-09-29.b1'`) içindeki GÖRÜNTÜLEME alanlarının elle
// senkronlanan bir KOPYASIdır — kod/şema/doğrulama YOKTUR, yalnızca sunum verisi. `catalogVersion`
// uyuşmazlığında (bkz. `EffectiveConfigView.vue`) bir uyarı bandı gösterilir.
//
// **Kalıcı çözüm (BACKLOG'a yazıldı):** `IntegrationConfigService`'e salt-okunur bir
// `platform.integrationConfig.getCatalog` ucu (ya da `getEffectiveConfig` yanıtına metaveri) eklenip
// bu dosya SİLİNMELİDİR. Anahtar kümesi/etiket değişirse bu dosya BAYATLAR (drift riski) — bilinçli,
// geçici bir borçtur.
export type SettingDanger = 'safe' | 'caution' | 'dangerous'
export type SettingApplies = 'immediate' | 'next_cycle' | 'restart'
export type SettingScope = 'engine' | 'integration' | 'engine+integration'
export type SettingUnit = 'ms' | 's' | 'min' | 'h' | 'day' | 'count' | 'perMin' | 'percent'
export type SettingType = 'int' | 'duration' | 'bool' | 'text' | 'stringList'
export type SettingGroup =
  | 'export.product' | 'import.product' | 'order.sync' | 'order.support'
  | 'stock' | 'resilience' | 'endpoints' | 'mock' | 'status' | 'cache'

export interface SettingLocalized { tr: string; en: string }

/** Backend `PerIntegrationDefault<T>` ile AYNI şekil: `_` = tanımsız entegrasyon için yedek. */
export type PerIntegrationDefault = { _: number } & Record<string, number>
export function isPerIntegrationDefault(v: unknown): v is PerIntegrationDefault {
  return !!v && typeof v === 'object' && !Array.isArray(v) && '_' in (v as any)
}

export interface SettingMeta {
  key: string
  group: SettingGroup
  scope: SettingScope
  type: SettingType
  unit?: SettingUnit
  default: number | boolean | string | readonly string[] | PerIntegrationDefault
  danger: SettingDanger
  applies: SettingApplies
  advanced?: boolean
  overridable: boolean
  envLock?: string
  safeRange?: { min: number; max: number }
  label: SettingLocalized
  help: SettingLocalized
  impact?: SettingLocalized
}

/** Kaynak dosyayla (backend) aynı `CATALOG_VERSION` — uyuşmazlık `EffectiveConfigView`'da bilgi bandı üretir. */
export const MIRRORED_CATALOG_VERSION = '2026-09-29.b1'

/** `unit`den `type` türetir (`durationSetting`/`countSetting` helper'larıyla BİREBİR AYNI eşleme). */
function durationOrInt(unit: Exclude<SettingUnit, 'percent'>): SettingType {
  return unit === 'count' || unit === 'perMin' ? 'int' : 'duration'
}

const EXPORT_SETTINGS: SettingMeta[] = [
  { key: 'export.orchestrator.exportLoopDelay', group: 'export.product', scope: 'engine', type: durationOrInt('ms'), unit: 'ms', default: 300000, danger: 'caution', applies: 'restart', overridable: false, safeRange: { min: 0, max: 30000000 },
    label: { tr: 'Gönderim döngüsü gecikmesi', en: 'Export loop delay' }, help: { tr: 'Orkestratörün bekleyen iş yokken ne sıklıkla yeniden kontrol ettiği süre.', en: 'How often the orchestrator re-checks when there is no pending work.' } },
  { key: 'export.orchestrator.lockTimeout', group: 'export.product', scope: 'engine', type: durationOrInt('ms'), unit: 'ms', default: 1800000, danger: 'dangerous', applies: 'restart', overridable: false, safeRange: { min: 0, max: 180000000 },
    label: { tr: 'Orkestratör kilit süresi', en: 'Orchestrator lock timeout' }, help: { tr: 'Bir mağaza/entegrasyon kilidinin en fazla ne kadar süre tutulabileceği.', en: 'Maximum time a tenant/integration lock may be held.' },
    impact: { tr: 'Çok kısaltmak yarım kalan işlerin erken serbest bırakılmasına (çift işlem riski), çok uzatmak takılı işlerin uzun süre bloke kalmasına yol açar.', en: 'Too short risks releasing in-flight work early (double-processing); too long lets stuck work block for a long time.' } },
  { key: 'export.validator.chunkSize', group: 'export.product', scope: 'engine', type: durationOrInt('count'), unit: 'count', default: 50, danger: 'caution', applies: 'next_cycle', overridable: true, safeRange: { min: 0, max: 5000 },
    label: { tr: 'Doğrulayıcı işlem parçası boyutu', en: 'Validator chunk size' }, help: { tr: 'Bir işlem parçasında doğrulanacak kayıt sayısı.', en: 'Records validated per internal chunk.' } },
  { key: 'export.publisher.chunkSize', group: 'export.product', scope: 'engine', type: durationOrInt('count'), unit: 'count', default: 30, danger: 'caution', applies: 'next_cycle', overridable: true, safeRange: { min: 0, max: 3000 },
    label: { tr: 'Yayıncı işlem parçası boyutu', en: 'Publisher chunk size' }, help: { tr: 'Pazaryerine tek seferde gönderilecek ürün sayısı.', en: 'Products sent to the marketplace per batch.' },
    impact: { tr: 'Artırmak pazaryeri oran sınırına takılma riskini artırır (Trendyol ≤1000/istek).', en: 'Increasing raises the risk of hitting marketplace rate limits.' } },
  { key: 'export.publisher.syncCooldownSeconds', group: 'export.product', scope: 'engine', type: durationOrInt('s'), unit: 's', default: 15, danger: 'caution', applies: 'next_cycle', overridable: false, safeRange: { min: 0, max: 1500 },
    label: { tr: 'Yayın sonrası Sentinel bekleme süresi', en: 'Post-publish Sentinel cooldown' }, help: { tr: 'Yayından sonra Sentinel kontrolünün ne kadar geciktirileceği.', en: 'Delay before Sentinel checks after publish.' } },
  { key: 'export.publisher.signalRetryDelay', group: 'export.product', scope: 'engine', type: durationOrInt('ms'), unit: 'ms', default: 300000, danger: 'caution', applies: 'restart', overridable: false, safeRange: { min: 0, max: 30000000 },
    label: { tr: 'Sinyal varsayılan yeniden deneme gecikmesi', en: 'Signal default retry delay' }, help: { tr: 'retryAfterMs bilgisi olmayan retryable hatalarda sinyalin ertelendiği varsayılan süre.', en: 'Default delay for retryable errors without retryAfterMs.' } },
  { key: 'export.dispatcher.leaseTtl', group: 'export.product', scope: 'engine', type: durationOrInt('ms'), unit: 'ms', default: 300000, danger: 'dangerous', applies: 'restart', overridable: true, safeRange: { min: 0, max: 30000000 },
    label: { tr: 'Dispatcher kira (lease) süresi', en: 'Dispatcher lease TTL' }, help: { tr: 'Bir dispatcher kilidinin süreç çökmesi durumunda kendiliğinden düşeceği süre.', en: 'Time after which a crashed dispatcher lock self-expires.' } },
  { key: 'export.sentinel.syncCooldownSeconds', group: 'export.product', scope: 'engine', type: durationOrInt('s'), unit: 's', default: 15, danger: 'caution', applies: 'next_cycle', overridable: false, safeRange: { min: 0, max: 1500 },
    label: { tr: 'Sentinel senkron bekleme süresi', en: 'Sentinel sync cooldown' }, help: { tr: 'Sentinel taramasından sonra Sync\'in ne kadar geciktirileceği.', en: 'Delay before Sync after a Sentinel scan.' } },
  { key: 'export.sentinel.trackingMaxAge', group: 'export.product', scope: 'engine', type: durationOrInt('ms'), unit: 'ms', default: 86400000, danger: 'caution', applies: 'next_cycle', overridable: false, safeRange: { min: 0, max: 8640000000 },
    label: { tr: 'Sentinel izleme ömrü', en: 'Sentinel tracking max age' }, help: { tr: 'Bir ürünün ne kadar süre pazaryeri durumu için izleneceği.', en: 'How long a product is tracked for marketplace status.' } },
  { key: 'export.sentinel.cooldownMinutes', group: 'export.product', scope: 'engine', type: durationOrInt('min'), unit: 'min', default: 1, danger: 'caution', applies: 'next_cycle', overridable: true, safeRange: { min: 0, max: 100 },
    label: { tr: 'Sentinel yeniden deneme bekleme süresi', en: 'Sentinel retry cooldown' }, help: { tr: 'Sentinel bir kaydı tekrar kontrol etmeden önce bekleyeceği süre.', en: 'Wait before Sentinel re-checks a record.' } },
  { key: 'export.synchronizer.batchSize', group: 'export.product', scope: 'engine', type: durationOrInt('count'), unit: 'count', default: 50, danger: 'caution', applies: 'next_cycle', overridable: false, safeRange: { min: 0, max: 5000 },
    label: { tr: 'Sync toplu işlem boyutu', en: 'Synchronizer batch size' }, help: { tr: 'Bir turda senkronize edilecek kayıt sayısı.', en: 'Records synchronized per round.' } },
  { key: 'export.synchronizer.waitingTimeoutDays', group: 'export.product', scope: 'engine', type: durationOrInt('day'), unit: 'day', default: 14, danger: 'caution', applies: 'next_cycle', overridable: false, safeRange: { min: 0, max: 1400 },
    label: { tr: 'Bekleme zaman aşımı', en: 'Waiting timeout' }, help: { tr: 'Bir kaydın pazaryeri onayını beklerken en fazla kalacağı gün sayısı.', en: 'Max days a record waits for marketplace approval.' } },
  { key: 'export.synchronizer.cooldownMinutes', group: 'export.product', scope: 'engine', type: durationOrInt('min'), unit: 'min', default: 1, danger: 'caution', applies: 'next_cycle', overridable: false, safeRange: { min: 0, max: 100 },
    label: { tr: 'Sync yeniden deneme bekleme süresi', en: 'Synchronizer retry cooldown' }, help: { tr: 'Sync bir kaydı tekrar kontrol etmeden önce bekleyeceği süre.', en: 'Wait before Sync re-checks a record.' } },
  { key: 'orchestrator.zombieCheckInterval', group: 'export.product', scope: 'engine', type: durationOrInt('ms'), unit: 'ms', default: 900000, danger: 'caution', applies: 'restart', overridable: false, safeRange: { min: 0, max: 90000000 },
    label: { tr: 'Genel zombi tarama aralığı', en: 'Generic zombie scan interval' }, help: { tr: 'Motor genelinde kilitlenmiş (zombi) işlerin ne sıklıkla arandığı.', en: 'How often stuck (zombie) jobs are scanned for, engine-wide.' } },
]

const IMPORT_SETTINGS: SettingMeta[] = [
  { key: 'import.orchestrator.importLoopDelay', group: 'import.product', scope: 'engine', type: durationOrInt('ms'), unit: 'ms', default: 30000, danger: 'caution', applies: 'restart', overridable: false, safeRange: { min: 0, max: 3000000 },
    label: { tr: 'İçe aktarma döngü gecikmesi', en: 'Import loop delay' }, help: { tr: 'Orkestratörün bekleyen iş yokken ne sıklıkla yeniden kontrol ettiği süre.', en: 'How often the orchestrator re-checks when there is no pending work.' } },
  { key: 'import.orchestrator.lockTimeout', group: 'import.product', scope: 'engine', type: durationOrInt('ms'), unit: 'ms', default: 1800000, danger: 'dangerous', applies: 'restart', overridable: false, safeRange: { min: 0, max: 180000000 },
    label: { tr: 'Orkestratör kilit süresi', en: 'Orchestrator lock timeout' }, help: { tr: 'Bir mağaza/entegrasyon kilidinin en fazla ne kadar süre tutulabileceği.', en: 'Maximum time a tenant/integration lock may be held.' } },
  { key: 'import.importer.fetchLimit', group: 'import.product', scope: 'engine', type: durationOrInt('count'), unit: 'count', default: 50, danger: 'caution', applies: 'next_cycle', overridable: false, safeRange: { min: 0, max: 5000 },
    label: { tr: 'Importer çekme sınırı', en: 'Importer fetch limit' }, help: { tr: 'Bir turda çekilecek en fazla kayıt sayısı.', en: 'Max records fetched per round.' } },
  { key: 'import.importer.retryCount', group: 'import.product', scope: 'engine', type: durationOrInt('count'), unit: 'count', default: 3, danger: 'caution', applies: 'next_cycle', overridable: false, safeRange: { min: 0, max: 20 },
    label: { tr: 'Importer yeniden deneme sayısı', en: 'Importer retry count' }, help: { tr: 'Başarısız bir çekimin en fazla kaç kez yeniden deneneceği.', en: 'Maximum fetch retry attempts.' } },
  { key: 'import.importer.retryDelay', group: 'import.product', scope: 'engine', type: durationOrInt('ms'), unit: 'ms', default: 3000, danger: 'caution', applies: 'next_cycle', overridable: false, safeRange: { min: 0, max: 300000 },
    label: { tr: 'Importer yeniden deneme gecikmesi', en: 'Importer retry delay' }, help: { tr: 'Başarısız bir çekimin yeniden denenmeden önce beklediği süre.', en: 'Wait before a failed fetch is retried.' } },
]

const ORDER_SYNC_SETTINGS: SettingMeta[] = [
  { key: 'order.syncIntervalMs', group: 'order.sync', scope: 'engine', type: durationOrInt('ms'), unit: 'ms', default: 60000, danger: 'caution', applies: 'restart', overridable: false, safeRange: { min: 0, max: 6000000 },
    label: { tr: 'Sipariş senkron aralığı', en: 'Order sync interval' }, help: { tr: 'Siparişlerin ne sıklıkla pazaryerinden çekileceği.', en: 'How often orders are pulled from the marketplace.' } },
  { key: 'order.defaultSyncFallbackDays', group: 'order.sync', scope: 'engine', type: durationOrInt('day'), unit: 'day', default: 1, danger: 'dangerous', applies: 'next_cycle', overridable: false, safeRange: { min: 0, max: 100 },
    label: { tr: 'İlk senkron geriye dönük pencere', en: 'Initial sync lookback window' }, help: { tr: 'İlk senkronda geriye dönük kaç gün taranacağı.', en: 'How many days back the first sync scans.' },
    impact: { tr: 'Trendyol sağlayıcı penceresi ≤14 gündür; bu değeri büyütmek sağlayıcı sınırına takılma riski doğurur.', en: 'Trendyol provider window is ≤14 days; increasing this risks hitting the provider limit.' } },
  { key: 'order.workerConcurrency', group: 'order.sync', scope: 'engine', type: durationOrInt('count'), unit: 'count', default: 5, danger: 'caution', applies: 'restart', overridable: false, safeRange: { min: 0, max: 50 },
    label: { tr: 'İşçi eşzamanlılığı', en: 'Worker concurrency' }, help: { tr: 'BullMQ sipariş işçisinin aynı anda işleyeceği iş sayısı.', en: 'Concurrent jobs processed by the BullMQ order worker.' } },
  { key: 'order.retryLimits.maxAttempts', group: 'order.sync', scope: 'engine', type: durationOrInt('count'), unit: 'count', default: 5, danger: 'caution', applies: 'restart', overridable: false, safeRange: { min: 0, max: 20 },
    label: { tr: 'İş yeniden deneme sayısı', en: 'Job retry attempts' }, help: { tr: 'Bir sipariş işinin en fazla kaç kez yeniden deneneceği.', en: 'Maximum retry attempts for an order job.' } },
  { key: 'order.retryLimits.backoffDelayMs', group: 'order.sync', scope: 'engine', type: durationOrInt('ms'), unit: 'ms', default: 2000, danger: 'caution', applies: 'restart', overridable: false, safeRange: { min: 0, max: 200000 },
    label: { tr: 'İş yeniden deneme gecikmesi', en: 'Job retry backoff' }, help: { tr: 'Yeniden denemeler arasındaki temel bekleme süresi.', en: 'Base wait between retries.' } },
  { key: 'order.memoryManagement.removeOnCompleteAge', group: 'order.sync', scope: 'engine', type: durationOrInt('s'), unit: 's', default: 86400, danger: 'safe', applies: 'restart', overridable: false, advanced: true, safeRange: { min: 0, max: 8640000 },
    label: { tr: 'Tamamlanan iş saklama süresi', en: 'Completed job retention age' }, help: { tr: 'Tamamlanmış kuyruk kayıtlarının ne kadar süre saklanacağı.', en: 'How long completed queue records are kept.' } },
  { key: 'order.memoryManagement.removeOnCompleteCount', group: 'order.sync', scope: 'engine', type: durationOrInt('count'), unit: 'count', default: 1000, danger: 'safe', applies: 'restart', overridable: false, advanced: true, safeRange: { min: 0, max: 100000 },
    label: { tr: 'Tamamlanan iş saklama adedi', en: 'Completed job retention count' }, help: { tr: 'Tamamlanmış kuyruk kayıtlarından en fazla kaçının saklanacağı.', en: 'Max number of completed queue records kept.' } },
  { key: 'order.memoryManagement.removeOnFailCount', group: 'order.sync', scope: 'engine', type: durationOrInt('count'), unit: 'count', default: 500, danger: 'safe', applies: 'restart', overridable: false, advanced: true, safeRange: { min: 0, max: 100000 },
    label: { tr: 'Başarısız iş saklama adedi', en: 'Failed job retention count' }, help: { tr: 'Başarısız kuyruk kayıtlarından en fazla kaçının saklanacağı.', en: 'Max number of failed queue records kept.' } },
  { key: 'order.orderSync.cursorOverlapMs', group: 'order.sync', scope: 'engine', type: durationOrInt('ms'), unit: 'ms', default: 300000, danger: 'safe', applies: 'next_cycle', overridable: false, advanced: true, safeRange: { min: 0, max: 30000000 },
    label: { tr: 'Sipariş imleç örtüşmesi', en: 'Order cursor overlap' }, help: { tr: 'İmleç kaybını tolere etmek için taranan ek geriye dönük süre.', en: 'Extra lookback to tolerate cursor loss.' } },
  { key: 'order.webhookHealthy.reconciliationIntervalMs', group: 'order.sync', scope: 'engine', type: durationOrInt('ms'), unit: 'ms', default: 300000, danger: 'safe', applies: 'restart', overridable: false, safeRange: { min: 0, max: 30000000 },
    label: { tr: 'Webhook sağlıklıyken mutabakat aralığı', en: 'Reconciliation interval while webhook healthy' }, help: { tr: 'Webhook sağlıklı çalışırken yine de kontrol amaçlı mutabakat sıklığı.', en: 'Reconciliation cadence even while webhooks are healthy.' } },
  { key: 'order.webhookHealthCheck.detectionWithoutWebhookWindowMs', group: 'order.sync', scope: 'engine', type: durationOrInt('ms'), unit: 'ms', default: 1800000, danger: 'caution', applies: 'restart', overridable: false, safeRange: { min: 0, max: 180000000 },
    label: { tr: 'Webhook yokluk tespit penceresi', en: 'Webhook absence detection window' }, help: { tr: 'Webhook alınmadığında bunun ne kadar sürede fark edileceği.', en: 'How quickly a webhook outage is detected.' } },
]

const ORDER_SUPPORT_SETTINGS: SettingMeta[] = [
  { key: 'order.claimSync.intervalMs', group: 'order.support', scope: 'engine', type: durationOrInt('ms'), unit: 'ms', default: 900000, danger: 'caution', applies: 'restart', overridable: false, safeRange: { min: 0, max: 90000000 },
    label: { tr: 'İade senkron aralığı', en: 'Claim sync interval' }, help: { tr: 'İade taleplerinin ne sıklıkla senkronize edileceği.', en: 'How often claims/returns are synced.' } },
  { key: 'order.claimSync.cursorOverlapMs', group: 'order.support', scope: 'engine', type: durationOrInt('ms'), unit: 'ms', default: 3600000, danger: 'safe', applies: 'next_cycle', overridable: false, advanced: true, safeRange: { min: 0, max: 360000000 },
    label: { tr: 'İade imleç örtüşmesi', en: 'Claim cursor overlap' }, help: { tr: 'İmleç kaybını tolere etmek için taranan ek geriye dönük süre.', en: 'Extra lookback to tolerate cursor loss.' } },
  { key: 'order.claimSync.fullSweepIntervalMs', group: 'order.support', scope: 'engine', type: durationOrInt('ms'), unit: 'ms', default: 86400000, danger: 'caution', applies: 'restart', overridable: false, advanced: true, safeRange: { min: 0, max: 8640000000 },
    label: { tr: 'İade tam tarama aralığı', en: 'Claim full sweep interval' }, help: { tr: 'Tam (geniş pencereli) iade taramasının ne sıklıkla yapılacağı.', en: 'How often a full-window claim sweep runs.' } },
  { key: 'order.claimSync.fullSweepWindowDays', group: 'order.support', scope: 'engine', type: durationOrInt('day'), unit: 'day', default: 32, danger: 'caution', applies: 'next_cycle', overridable: false, advanced: true, safeRange: { min: 0, max: 3200 },
    label: { tr: 'İade tam tarama penceresi', en: 'Claim full sweep window' }, help: { tr: 'Tam taramanın kaç gün geriye gideceği.', en: 'How many days the full sweep looks back.' } },
  { key: 'order.financeSync.intervalMs', group: 'order.support', scope: 'engine', type: durationOrInt('ms'), unit: 'ms', default: 21600000, danger: 'caution', applies: 'restart', overridable: false, safeRange: { min: 0, max: 2160000000 },
    label: { tr: 'Finans senkron aralığı', en: 'Finance sync interval' }, help: { tr: 'Hakediş/finans verisinin ne sıklıkla senkronize edileceği.', en: 'How often settlement/finance data is synced.' } },
  { key: 'order.financeSync.cursorOverlapMs', group: 'order.support', scope: 'engine', type: durationOrInt('ms'), unit: 'ms', default: 86400000, danger: 'safe', applies: 'next_cycle', overridable: false, advanced: true, safeRange: { min: 0, max: 8640000000 },
    label: { tr: 'Finans imleç örtüşmesi', en: 'Finance cursor overlap' }, help: { tr: 'İmleç kaybını tolere etmek için taranan ek geriye dönük süre.', en: 'Extra lookback to tolerate cursor loss.' } },
  { key: 'order.financeSync.fullSweepIntervalMs', group: 'order.support', scope: 'engine', type: durationOrInt('ms'), unit: 'ms', default: 86400000, danger: 'caution', applies: 'restart', overridable: false, advanced: true, safeRange: { min: 0, max: 8640000000 },
    label: { tr: 'Finans tam tarama aralığı', en: 'Finance full sweep interval' }, help: { tr: 'Tam finans taramasının ne sıklıkla yapılacağı.', en: 'How often a full finance sweep runs.' } },
  { key: 'order.financeSync.fullSweepWindowDays', group: 'order.support', scope: 'engine', type: durationOrInt('day'), unit: 'day', default: 30, danger: 'caution', applies: 'next_cycle', overridable: false, advanced: true, safeRange: { min: 0, max: 3000 },
    label: { tr: 'Finans tam tarama penceresi', en: 'Finance full sweep window' }, help: { tr: 'Tam taramanın kaç gün geriye gideceği.', en: 'How many days the full sweep looks back.' } },
  { key: 'order.messageSync.intervalMs', group: 'order.support', scope: 'engine', type: durationOrInt('ms'), unit: 'ms', default: 300000, danger: 'safe', applies: 'restart', overridable: false, safeRange: { min: 0, max: 30000000 },
    label: { tr: 'Soru senkron aralığı', en: 'Question sync interval' }, help: { tr: 'Müşteri sorularının ne sıklıkla senkronize edileceği.', en: 'How often customer questions are synced.' } },
  { key: 'order.messageSync.cursorOverlapMs', group: 'order.support', scope: 'engine', type: durationOrInt('ms'), unit: 'ms', default: 900000, danger: 'safe', applies: 'next_cycle', overridable: false, advanced: true, safeRange: { min: 0, max: 90000000 },
    label: { tr: 'Soru imleç örtüşmesi', en: 'Question cursor overlap' }, help: { tr: 'İmleç kaybını tolere etmek için taranan ek geriye dönük süre.', en: 'Extra lookback to tolerate cursor loss.' } },
]

const RESILIENCE_SETTINGS: SettingMeta[] = [
  { key: 'resilience.timeoutMs', group: 'resilience', scope: 'engine+integration', type: durationOrInt('ms'), unit: 'ms', default: { _: 30000, hepsiburada: 60000 }, danger: 'caution', applies: 'restart', overridable: false, safeRange: { min: 5000, max: 120000 },
    label: { tr: 'HTTP zaman aşımı', en: 'HTTP timeout' }, help: { tr: 'Bir dış API isteğinin en fazla ne kadar süreceği; aşılırsa istek başarısız sayılır.', en: 'Max duration of an outbound API call before it is treated as failed.' } },
  { key: 'resilience.maxConcurrent', group: 'resilience', scope: 'engine+integration', type: durationOrInt('count'), unit: 'count', default: { _: 10, hepsiburada: 5, pazarama: 11 }, danger: 'caution', applies: 'restart', overridable: false, safeRange: { min: 1, max: 100 },
    label: { tr: 'Eşzamanlı istek sınırı', en: 'Max concurrent requests' }, help: { tr: 'Aynı anda gönderilebilecek en fazla dış API isteği sayısı (bulkhead).', en: 'Maximum in-flight outbound requests (bulkhead).' } },
  { key: 'resilience.ratePerMin', group: 'resilience', scope: 'engine+integration', type: durationOrInt('perMin'), unit: 'perMin', default: { _: 0, trendyol: 200, n11: 1000, ideasoft: 300, bizimhesap: 300 }, danger: 'dangerous', applies: 'restart', overridable: false, envLock: 'TY_RATE_PER_MIN', safeRange: { min: 0, max: 20000 },
    label: { tr: 'Dakikada istek sınırı', en: 'Requests per minute' }, help: { tr: 'Bir dakikada gönderilebilecek en fazla istek sayısı. 0 = adaptörde tanımlı değil (sınırsız, Hepsiburada/Pazarama).', en: 'Max requests per minute. 0 = not configured (unbounded, Hepsiburada/Pazarama).' },
    impact: { tr: 'Artırmak pazaryeri tarafından geçici/kalıcı banlanma (429 fırtınası) riskini artırır.', en: 'Increasing raises the risk of provider throttling/bans (429 storms).' } },
  { key: 'resilience.trendyol.orderListRatePerMin', group: 'resilience', scope: 'integration', type: durationOrInt('s'), unit: 's', default: 30, danger: 'dangerous', applies: 'immediate', overridable: false, envLock: 'TY_ORDER_LIST_RATE_PER_MIN', safeRange: { min: 0, max: 3000 },
    label: { tr: 'Trendyol sipariş listesi oran sınırı (dk)', en: 'Trendyol order-list rate (per min)' }, help: { tr: 'Trendyol sipariş listesi uç noktasına dakikada en fazla kaç istek atılacağı (genel oran sınırından bağımsız, ayrı sayaç).', en: 'Max requests/min to the Trendyol order-list endpoint (separate counter from the global rate).' },
    impact: { tr: 'Resmi kaynaklar çelişiyor (30-100/dk tablo vs 1000/dk servis sayfası); muhafazakâr taban 30 seçildi.', en: 'Official sources conflict (30-100/min table vs 1000/min service page); conservative baseline 30 was chosen.' } },
  { key: 'resilience.retry.maxAttempts', group: 'resilience', scope: 'engine+integration', type: durationOrInt('count'), unit: 'count', default: 4, danger: 'caution', applies: 'restart', overridable: false, safeRange: { min: 0, max: 20 },
    label: { tr: 'Yeniden deneme sayısı', en: 'Retry attempts' }, help: { tr: 'Başarısız bir isteğin en fazla kaç kez yeniden deneneceği (toplam deneme = bu + 1).', en: 'Maximum retries for a failed request (total attempts = this + 1).' } },
  { key: 'resilience.retry.baseDelayMs', group: 'resilience', scope: 'engine+integration', type: durationOrInt('ms'), unit: 'ms', default: 1000, danger: 'caution', applies: 'restart', overridable: false, safeRange: { min: 0, max: 100000 },
    label: { tr: 'Yeniden deneme taban gecikmesi', en: 'Retry base delay' }, help: { tr: 'Üstel geri çekilmenin (exponential backoff) taban süresi.', en: 'Base duration for exponential backoff.' } },
  { key: 'resilience.retry.maxDelayMs', group: 'resilience', scope: 'engine+integration', type: durationOrInt('ms'), unit: 'ms', default: 30000, danger: 'caution', applies: 'restart', overridable: false, safeRange: { min: 0, max: 3000000 },
    label: { tr: 'Yeniden deneme üst gecikme sınırı', en: 'Retry max delay' }, help: { tr: 'Üstel geri çekilmenin ulaşabileceği en yüksek bekleme süresi.', en: 'Upper bound for exponential backoff.' } },
  { key: 'resilience.breaker.consecutiveFailures', group: 'resilience', scope: 'engine+integration', type: durationOrInt('count'), unit: 'count', default: 5, danger: 'caution', applies: 'restart', overridable: false, safeRange: { min: 0, max: 50 },
    label: { tr: 'Devre kesici eşik değeri', en: 'Circuit breaker threshold' }, help: { tr: 'Devre kesicinin açılması için gereken ardışık hata sayısı.', en: 'Consecutive failures required to open the circuit breaker.' } },
  { key: 'resilience.breaker.openMs', group: 'resilience', scope: 'engine+integration', type: durationOrInt('ms'), unit: 'ms', default: 30000, danger: 'caution', applies: 'restart', overridable: false, safeRange: { min: 0, max: 3000000 },
    label: { tr: 'Devre kesici açık kalma süresi', en: 'Circuit breaker open duration' }, help: { tr: 'Devre açıldıktan sonra ilk yarı-açık denemeye kadar geçen süre.', en: 'Time the circuit stays open before the first half-open probe.' } },
  { key: 'resilience.breaker.maxOpenMs', group: 'resilience', scope: 'engine+integration', type: durationOrInt('ms'), unit: 'ms', default: 300000, danger: 'caution', applies: 'restart', overridable: false, safeRange: { min: 0, max: 30000000 },
    label: { tr: 'Devre kesici üst açık kalma süresi', en: 'Circuit breaker max open duration' }, help: { tr: 'Ardışık yarı-açık başarısızlıklarında devrenin en fazla açık kalabileceği süre.', en: 'Max time the circuit can stay open across repeated half-open failures.' } },
  { key: 'resilience.factoryCallTimeoutMs', group: 'resilience', scope: 'engine', type: durationOrInt('ms'), unit: 'ms', default: 120000, danger: 'dangerous', applies: 'restart', overridable: false, safeRange: { min: 0, max: 12000000 },
    label: { tr: 'Fabrika çağrı zaman aşımı', en: 'Factory call timeout' }, help: { tr: 'Bir adaptör metodunun `IntegrationFactory` Proxy\'si tarafından en fazla ne kadar bekletileceği.', en: 'Max time an adapter method call is allowed by the IntegrationFactory proxy.' } },
]

const MOCK_CODES = ['trendyol', 'pazarama', 'n11', 'hepsiburada', 'ideasoft', 'bizimhesap'] as const
const MOCK_ENV_PREFIX: Record<typeof MOCK_CODES[number], string> = {
  trendyol: 'TY', pazarama: 'PAZARAMA', n11: 'N11', hepsiburada: 'HEPSIBURADA', ideasoft: 'IDEASOFT', bizimhesap: 'BIZIMHESAP',
}
const MOCK_SETTINGS: SettingMeta[] = MOCK_CODES.flatMap((code) => {
  const prefix = MOCK_ENV_PREFIX[code]
  const impact: SettingLocalized = { tr: 'Üretimde mock açmak "sahte başarı" gösterir (E3 ihlali); yalnızca env ile değiştirilebilir.', en: 'Enabling mock in production shows fake success (E3 violation); env-only.' }
  const base = { group: 'mock' as const, scope: 'integration' as const, danger: 'dangerous' as const, applies: 'restart' as const, overridable: false, impact }
  return [
    { ...base, key: `mock.${code}.enabled`, type: 'bool' as const, default: false, envLock: `${prefix}_MOCK_MODE`,
      label: { tr: `${code}: mock modu`, en: `${code}: mock mode` }, help: { tr: 'Açıksa gerçek API yerine yerel mock sunucusuna istek atılır.', en: 'When on, requests go to the local mock server instead of the real API.' } },
    { ...base, key: `mock.${code}.baseUrl`, type: 'text' as const, default: '', envLock: `${prefix}_MOCK_BASE_URL`,
      label: { tr: `${code}: mock taban adresi`, en: `${code}: mock base URL` }, help: { tr: 'Mock modunda isteklerin yönlendirileceği taban adres.', en: 'Base URL requests are routed to in mock mode.' } },
    { ...base, key: `mock.${code}.mockableEndpoints`, type: 'stringList' as const, default: [] as readonly string[], envLock: `${prefix}_MOCKABLE_ENDPOINTS`,
      label: { tr: `${code}: mocklanabilir uçlar`, en: `${code}: mockable endpoints` }, help: { tr: 'Yalnızca bu listedeki uçlar mock moduna yönlendirilir (adaptöre göre uygulanır/uygulanmaz).', en: 'Only listed endpoints are routed to mock (adapter-dependent).' } },
  ]
})

export const SETTINGS_CATALOG_MIRROR: readonly SettingMeta[] = [
  ...EXPORT_SETTINGS, ...IMPORT_SETTINGS, ...ORDER_SYNC_SETTINGS, ...ORDER_SUPPORT_SETTINGS, ...RESILIENCE_SETTINGS, ...MOCK_SETTINGS,
]

const BY_KEY = new Map(SETTINGS_CATALOG_MIRROR.map((s) => [s.key, s]))

export function getSettingMeta(key: string): SettingMeta | undefined {
  return BY_KEY.get(key)
}

export function listSettingsByGroup(group: SettingGroup): SettingMeta[] {
  return SETTINGS_CATALOG_MIRROR.filter((s) => s.group === group)
}

export const ENGINE_TARGET = '_engine'

/** `IntegrationConfigService` `applicableSettingKeys(target)` (backend) ile BİREBİR AYNI kural. */
export function applicableSettings(target: string): SettingMeta[] {
  return SETTINGS_CATALOG_MIRROR.filter((s) => (target === ENGINE_TARGET ? s.scope !== 'integration' : s.scope !== 'engine'))
}

export function groupedApplicableSettings(target: string, groups: readonly SettingGroup[]): Array<{ group: SettingGroup; settings: SettingMeta[] }> {
  const applicable = applicableSettings(target)
  return groups.map((group) => ({ group, settings: applicable.filter((s) => s.group === group) }))
}

/** `SettingMeta.default`'ı verilen entegrasyon bağlamında (ya da motor için) TEK bir değere çözer. */
export function resolveDefault(meta: SettingMeta, integrationCode?: string): number | boolean | string | readonly string[] {
  const d = meta.default
  if (isPerIntegrationDefault(d)) {
    if (integrationCode && Object.prototype.hasOwnProperty.call(d, integrationCode)) return d[integrationCode]
    return d._
  }
  return d
}

/** `EkSettingsTemplate` sol alt-gezinme bölüm sırası + görünen ad (ADR-0020 Karar 4.1). */
export const GROUP_LABELS: Record<SettingGroup, string> = {
  'export.product': 'Ürün gönderimi',
  'import.product': 'Ürün içe aktarma',
  'order.sync': 'Sipariş çekme',
  'order.support': 'İade, soru ve finans',
  stock: 'Stok ve fiyat',
  resilience: 'Oran sınırları ve dayanıklılık',
  endpoints: 'Uç noktalar',
  mock: 'Mock / gerçek mod',
  status: 'Durum ve kapsam',
  cache: 'Önbellek',
}

export const GROUP_DESCRIPTIONS: Record<SettingGroup, string> = {
  'export.product': 'Ürünlerin pazaryerlerine ne sıklıkla ve ne büyüklükte parçalar hâlinde gönderileceğini belirler.',
  'import.product': 'Pazaryerlerinden ürün verisinin ne sıklıkla içe aktarılacağını belirler.',
  'order.sync': 'Siparişlerin ne sıklıkla çekileceğini, kuyruk işçilerinin nasıl çalışacağını belirler.',
  'order.support': 'İade, soru ve finans (hakediş) verilerinin senkronizasyon zamanlamasını belirler.',
  stock: 'Stok ve fiyat yayınının turlarını ve mutabakat sıklığını belirler.',
  resilience: 'Dış pazaryeri API çağrılarının zaman aşımı, oran sınırı ve yeniden deneme davranışını belirler.',
  endpoints: 'Bu entegrasyonun uç nokta host seçimini ve emekliye ayrılan yolları gösterir (yol şablonları koddadır, salt-okunur).',
  mock: 'Bu entegrasyonun mock (test) modu durumu — yalnızca ortam değişkeniyle değiştirilir, salt-okunur.',
  status: 'Entegrasyonun kabul durumu ve kapsam beyanı.',
  cache: 'Yapılandırma önbelleğinin ve sürüm yoklamasının ömrünü belirler.',
}

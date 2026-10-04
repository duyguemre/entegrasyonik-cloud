// ADR-0020 Karar 2.3 — Motor (engine) ayarları: BUGÜN ETKİN olan değerler (JSON dosyalarındaki değerler — K10'daki
// ölü `||` yedekleri KATALOĞA GİRMEZ, yalnız `knownDriftNote` ile İNSAN OKUNUR bilgi olarak işaretlenir).
// Kaynak: src/integration/engine/catalog/export/export.config.json, .../import/import.config.json,
// src/integration/engine/order/order.config.json, src/integration/engine/orchestrator.config.json (ADR K9).
//
// DOĞRULAMA YÖNTEMİ (2026-09-29, bu görev): her JSON anahtarı için `grep` ile GERÇEK tüketici arandı (yalnız ADR
// metnine güvenilmedi). ADR-0020 §2.3 açıkça şunu ister: "Tüketicisi grep ile bulunamayan JSON anahtarı ... kataloğa
// alınmaz, rapora yazılır." Bu taramada ADR'nin K10 listesinde YER ALMAYAN, ama gerçekten OKUNMAYAN (orphan) 13 JSON
// anahtarı bulundu — bunlar `ORPHANED_JSON_KEYS`'te listelenir, katalogda YER ALMAZ (rapor: config-drift-scan bulguları).
import { durationSetting, countSetting } from './helpers';
import type { SettingDef } from '../types';

/**
 * JSON'da TANIMLI ama HİÇBİR `.ts` dosyası tarafından OKUNMAYAN anahtarlar (2026-09-29 grep taraması, bu görev).
 * ADR-0020 §2.3 kuralı: bu anahtarlar kataloğa GİRMEZ. Silinmeleri (JSON temizliği) bu görevin kapsamı DIŞI (D7,
 * Aşama A sonu) — burada yalnız İNSAN OKUNUR envanter olarak durur.
 */
export const ORPHANED_JSON_KEYS: readonly string[] = [
    'export.config.json: exportOrchestrator.rateLimitRetryDelay',
    'export.config.json: exportOrchestrator.zombieCheckInterval (orchestrator.config.json\'daki AYNI ADLI anahtardan FARKLI; bu iç içe alan hiç okunmuyor)',
    'export.config.json: validator.fetchLimit',
    'export.config.json: validator.errorTimeout',
    'export.config.json: publisher.maxVariantBatchSize',
    'export.config.json: publisher.retryInterval',
    'export.config.json: publisher.maxRetryCount',
    'export.config.json: publisher.errorTimeout',
    'export.config.json: sentinel.fetchLimit',
    'export.config.json: sentinel.errorTimeout',
    'export.config.json: synchronizer.errorTimeout',
    'import.config.json: importOrchestrator.rateLimitRetryDelay',
    'import.config.json: importOrchestrator.zombieCheckInterval',
    'import.config.json: stager.globalLoopDelay',
    'import.config.json: stager.errorTimeout',
    'import.config.json: importer.globalLoopDelay',
    'import.config.json: importer.errorTimeout',
    'order.config.json: retryLimits.timeoutMs',
];

// ---------------------------------------------------------------------------------------------------------------------
// export.config.json — YALNIZ gerçekten okunan anahtarlar (grep doğrulamalı, 2026-09-29).
// ---------------------------------------------------------------------------------------------------------------------
export const EXPORT_ENGINE_SETTINGS: SettingDef<number>[] = [
    durationSetting({
        key: 'export.orchestrator.exportLoopDelay', group: 'export.product', scope: 'engine', unit: 'ms', default: 300000,
        danger: 'caution', applies: 'restart', consumers: ['engine/catalog/export/ExportOrchestrator.ts:19,113'],
        label: { tr: 'İhracat döngü gecikmesi', en: 'Export loop delay' },
        help: { tr: 'Orkestratörün bekleyen iş yokken ne sıklıkla yeniden kontrol ettiği süre.', en: 'How often the orchestrator re-checks when there is no pending work.' },
        since: '2026-09-29',
        knownDriftNote: '2026-09-29 taraması: kod içi ölü yedek 60000 (`config.exportOrchestrator?.exportLoopDelay || 60000`, ADR K10 listesinde YOK ama gerçek); JSON değeri 300000 her zaman kazanır (ExportSignalPollScheduler yorumunda "varsayılan 5 dk" yazan da bu ölü yedeği yansıtıyor).',
    }),
    durationSetting({
        key: 'export.orchestrator.lockTimeout', group: 'export.product', scope: 'engine', unit: 'ms', default: 1800000,
        danger: 'dangerous', applies: 'restart', consumers: ['engine/catalog/export/ExportOrchestrator.ts:16'],
        label: { tr: 'Orkestratör kilit süresi', en: 'Orchestrator lock timeout' },
        help: { tr: 'Bir tenant/entegrasyon kilidinin en fazla ne kadar süre tutulabileceği.', en: 'Maximum time a tenant/integration lock may be held.' },
        impact: { tr: 'Çok kısaltmak yarım kalan işlerin erken serbest bırakılmasına (çift işlem riski), çok uzatmak takılı işlerin uzun süre bloke kalmasına yol açar.', en: 'Too short risks releasing in-flight work early (double-processing); too long lets stuck work block for a long time.' },
        since: '2026-09-29',
    }),
    countSetting({
        key: 'export.validator.chunkSize', group: 'export.product', scope: 'engine', default: 50,
        danger: 'caution', applies: 'next_cycle', consumers: ['engine/catalog/export/Validator.ts:11'],
        label: { tr: 'Doğrulayıcı işlem parçası boyutu', en: 'Validator chunk size' },
        help: { tr: 'Bir işlem parçasında (chunk) doğrulanacak kayıt sayısı.', en: 'Records validated per internal chunk.' },
        since: '2026-09-29',
        knownDriftNote: 'ADR-0020 K10: kod içi ölü yedek 100 (`config.validator?.chunkSize || 100`); JSON değeri 50 her zaman kazanır.',
        // [ADR-0020 Aşama B] Aşama A'da TÜM ayarlar overridable:false idi ("yazma ucu yok"). Bu görev yazma yolunu
        // getirdiğinden BU anahtar (ve aşağıdaki 2 kardeşi) BİLİNÇLİ olarak platformdan geçersiz kılınabilir yapıldı
        // (yalnız bu 3'ü — kalan ~90 anahtarın Karar 1.3 sınıflandırma geçişi bu görevin KAPSAMI DIŞI, bkz. rapor).
        overridable: true,
    }),
    countSetting({
        key: 'export.publisher.chunkSize', group: 'export.product', scope: 'engine', default: 30,
        danger: 'caution', applies: 'next_cycle', consumers: ['engine/catalog/export/Publisher.ts:18'],
        label: { tr: 'Yayıncı işlem parçası boyutu', en: 'Publisher chunk size' },
        help: { tr: 'Pazaryerine tek seferde gönderilecek ürün sayısı.', en: 'Products sent to the marketplace per batch.' },
        impact: { tr: 'Artırmak pazaryeri oran sınırına takılma riskini artırır (Trendyol ≤1000/istek).', en: 'Increasing raises the risk of hitting marketplace rate limits.' },
        since: '2026-09-29',
        knownDriftNote: 'ADR-0020 K10: kod içi ölü yedek 50 (`config.publisher?.chunkSize || 50`); JSON değeri 30 her zaman kazanır.',
        overridable: true, // [ADR-0020 Aşama B] bkz. yukarıdaki not
    }),
    durationSetting({
        key: 'export.publisher.syncCooldownSeconds', group: 'export.product', scope: 'engine', unit: 's', default: 15,
        danger: 'caution', applies: 'next_cycle', consumers: ['engine/catalog/export/Publisher.ts:20'],
        label: { tr: 'Yayın sonrası Sentinel bekleme süresi', en: 'Post-publish Sentinel cooldown' },
        help: { tr: 'Yayından sonra Sentinel kontrolünün ne kadar geciktirileceği.', en: 'Delay before Sentinel checks after publish.' },
        since: '2026-09-29',
    }),
    durationSetting({
        key: 'export.publisher.signalRetryDelay', group: 'export.product', scope: 'engine', unit: 'ms', default: 300000,
        danger: 'caution', applies: 'restart', consumers: ['engine/catalog/export/Publisher.ts:23 (SIGNAL_DEFAULT_RETRY_DELAY_MS)'],
        label: { tr: 'Sinyal varsayılan yeniden deneme gecikmesi', en: 'Signal default retry delay' },
        help: { tr: 'retryAfterMs bilgisi olmayan retryable hatalarda sinyalin ertelendiği varsayılan süre.', en: 'Default delay for retryable errors without retryAfterMs.' },
        since: '2026-09-29',
        knownDriftNote: 'K11: JSON\'da YOK, yalnız kod sabiti `Publisher.SIGNAL_DEFAULT_RETRY_DELAY_MS`. Katalog bu değeri İZLER (envanter); tüketici migrasyonu bu turda yapılmadı (kod hâlâ sabiti doğrudan kullanıyor).',
    }),
    durationSetting({
        key: 'export.dispatcher.leaseTtl', group: 'export.product', scope: 'engine', unit: 'ms', default: 300000,
        danger: 'dangerous', applies: 'restart', consumers: ['engine/catalog/export/Dispatcher.ts:17 (LEASE_TTL_MS)'],
        label: { tr: 'Dispatcher kira (lease) süresi', en: 'Dispatcher lease TTL' },
        help: { tr: 'Bir dispatcher kilidinin süreç çökmesi durumunda kendiliğinden düşeceği süre.', en: 'Time after which a crashed dispatcher lock self-expires.' },
        since: '2026-09-29',
        knownDriftNote: 'K11: JSON\'da YOK, yalnız kod sabiti `Dispatcher.LEASE_TTL_MS`. Katalog bu değeri İZLER (envanter); tüketici migrasyonu bu turda yapılmadı.',
        // [ADR-0020 Aşama B] 4. örnek: 'dangerous' seviyeli, gerçek katalogla yazılı-onay/iki-kişi-kuralı akışını
        // uçtan uca kanıtlamak için overridable yapıldı (bkz. export.validator.chunkSize'daki not).
        overridable: true,
    }),
    durationSetting({
        key: 'export.sentinel.syncCooldownSeconds', group: 'export.product', scope: 'engine', unit: 's', default: 15,
        danger: 'caution', applies: 'next_cycle', consumers: ['engine/catalog/export/Sentinel.ts:15'],
        label: { tr: 'Sentinel senkron bekleme süresi', en: 'Sentinel sync cooldown' },
        help: { tr: 'Sentinel taramasından sonra Sync\'in ne kadar geciktirileceği.', en: 'Delay before Sync after a Sentinel scan.' },
        since: '2026-09-29',
    }),
    durationSetting({
        key: 'export.sentinel.trackingMaxAge', group: 'export.product', scope: 'engine', unit: 'ms', default: 86400000,
        danger: 'caution', applies: 'next_cycle', consumers: ['engine/catalog/export/Sentinel.ts:12'],
        label: { tr: 'Sentinel izleme ömrü', en: 'Sentinel tracking max age' },
        help: { tr: 'Bir ürünün ne kadar süre pazaryeri durumu için izleneceği.', en: 'How long a product is tracked for marketplace status.' },
        since: '2026-09-29',
    }),
    durationSetting({
        key: 'export.sentinel.cooldownMinutes', group: 'export.product', scope: 'engine', unit: 'min', default: 1,
        danger: 'caution', applies: 'next_cycle', consumers: ['engine/catalog/export/Sentinel.ts:75,91,229'],
        label: { tr: 'Sentinel yeniden deneme bekleme süresi', en: 'Sentinel retry cooldown' },
        help: { tr: 'Sentinel bir kaydı tekrar kontrol etmeden önce bekleyeceği süre.', en: 'Wait before Sentinel re-checks a record.' },
        since: '2026-09-29',
        knownDriftNote: 'ADR-0020 K10: kod içi ölü yedek 10 (`config.sentinel?.cooldownMinutes || 10`, 3 çağrı noktası); JSON değeri 1 her zaman kazanır.',
        overridable: true, // [ADR-0020 Aşama B] bkz. export.validator.chunkSize'daki not
    }),
    countSetting({
        key: 'export.synchronizer.batchSize', group: 'export.product', scope: 'engine', default: 50,
        danger: 'caution', applies: 'next_cycle', consumers: ['engine/catalog/export/Sync.ts:11'],
        label: { tr: 'Sync toplu işlem boyutu', en: 'Synchronizer batch size' },
        help: { tr: 'Bir turda senkronize edilecek kayıt sayısı.', en: 'Records synchronized per round.' },
        since: '2026-09-29',
    }),
    durationSetting({
        key: 'export.synchronizer.waitingTimeoutDays', group: 'export.product', scope: 'engine', unit: 'day', default: 14,
        danger: 'caution', applies: 'next_cycle', consumers: ['engine/catalog/export/Sync.ts:12'],
        label: { tr: 'Bekleme zaman aşımı', en: 'Waiting timeout' },
        help: { tr: 'Bir kaydın pazaryeri onayını beklerken en fazla kalacağı gün sayısı.', en: 'Max days a record waits for marketplace approval.' },
        since: '2026-09-29',
    }),
    durationSetting({
        key: 'export.synchronizer.cooldownMinutes', group: 'export.product', scope: 'engine', unit: 'min', default: 1,
        danger: 'caution', applies: 'next_cycle', consumers: ['engine/catalog/export/Sync.ts:13'],
        label: { tr: 'Sync yeniden deneme bekleme süresi', en: 'Synchronizer retry cooldown' },
        help: { tr: 'Sync bir kaydı tekrar kontrol etmeden önce bekleyeceği süre.', en: 'Wait before Sync re-checks a record.' },
        since: '2026-09-29',
        knownDriftNote: 'ADR-0020 K10: kod içi ölü yedek 30 (`config.synchronizer.cooldownMinutes || 30`); JSON değeri 1 her zaman kazanır.',
    }),
];

// ---------------------------------------------------------------------------------------------------------------------
// import.config.json — YALNIZ gerçekten okunan anahtarlar.
// ---------------------------------------------------------------------------------------------------------------------
export const IMPORT_ENGINE_SETTINGS: SettingDef<number>[] = [
    durationSetting({
        key: 'import.orchestrator.importLoopDelay', group: 'import.product', scope: 'engine', unit: 'ms', default: 30000,
        danger: 'caution', applies: 'restart', consumers: ['engine/catalog/import/ImportOrchestrator.ts:48'],
        label: { tr: 'İçe aktarma döngü gecikmesi', en: 'Import loop delay' },
        help: { tr: 'Orkestratörün bekleyen iş yokken ne sıklıkla yeniden kontrol ettiği süre.', en: 'How often the orchestrator re-checks when there is no pending work.' },
        since: '2026-09-29',
        knownDriftNote: 'ADR-0020 K10: kod içi ölü yedek 5000 (`config.importOrchestrator?.importLoopDelay || 5000`); JSON değeri 30000 her zaman kazanır.',
    }),
    durationSetting({
        key: 'import.orchestrator.lockTimeout', group: 'import.product', scope: 'engine', unit: 'ms', default: 1800000,
        danger: 'dangerous', applies: 'restart', consumers: ['engine/catalog/import/ImportOrchestrator.ts:15'],
        label: { tr: 'Orkestratör kilit süresi', en: 'Orchestrator lock timeout' },
        help: { tr: 'Bir tenant/entegrasyon kilidinin en fazla ne kadar süre tutulabileceği.', en: 'Maximum time a tenant/integration lock may be held.' },
        since: '2026-09-29',
    }),
    countSetting({
        key: 'import.importer.fetchLimit', group: 'import.product', scope: 'engine', default: 50,
        danger: 'caution', applies: 'next_cycle', consumers: ['engine/catalog/import/Importer.ts:11'],
        label: { tr: 'Importer çekme sınırı', en: 'Importer fetch limit' },
        help: { tr: 'Bir turda çekilecek en fazla kayıt sayısı.', en: 'Max records fetched per round.' },
        since: '2026-09-29',
        knownDriftNote: '2026-09-29 taraması: kod içi ölü yedek 100 (`config.importer.fetchLimit || 100`, ADR K10 listesinde YOK ama gerçek); JSON değeri 50 her zaman kazanır.',
    }),
    countSetting({
        key: 'import.importer.retryCount', group: 'import.product', scope: 'engine', default: 3, max: 20,
        danger: 'caution', applies: 'next_cycle', consumers: ['engine/catalog/import/Importer.ts:12'],
        label: { tr: 'Importer yeniden deneme sayısı', en: 'Importer retry count' },
        help: { tr: 'Başarısız bir çekimin en fazla kaç kez yeniden deneneceği.', en: 'Maximum fetch retry attempts.' },
        since: '2026-09-29',
    }),
    durationSetting({
        key: 'import.importer.retryDelay', group: 'import.product', scope: 'engine', unit: 'ms', default: 3000,
        danger: 'caution', applies: 'next_cycle', consumers: ['engine/catalog/import/Importer.ts:13'],
        label: { tr: 'Importer yeniden deneme gecikmesi', en: 'Importer retry delay' },
        help: { tr: 'Başarısız bir çekimin yeniden denenmeden önce beklediği süre.', en: 'Wait before a failed fetch is retried.' },
        since: '2026-09-29',
        knownDriftNote: 'ADR-0020 K10: kod içi ölü yedek 2000 (`config.importer?.retryDelay || 2000`); JSON değeri 3000 her zaman kazanır.',
    }),
];

// ---------------------------------------------------------------------------------------------------------------------
// orchestrator.config.json — TEK gerçek tüketici: IntegrationEngine.ts (export.config.json'daki AYNI ADLI
// `exportOrchestrator.zombieCheckInterval` ile KARIŞTIRILMAMALI — o alan hiç okunmuyor, bkz. ORPHANED_JSON_KEYS).
// ---------------------------------------------------------------------------------------------------------------------
export const ORCHESTRATOR_ENGINE_SETTINGS: SettingDef<number>[] = [
    durationSetting({
        key: 'orchestrator.zombieCheckInterval', group: 'export.product', scope: 'engine', unit: 'ms', default: 900000,
        danger: 'caution', applies: 'restart', consumers: ['engine/IntegrationEngine.ts:18 (ZOMBIE_CHECK_INTERVAL)'],
        label: { tr: 'Genel zombi tarama aralığı', en: 'Generic zombie scan interval' },
        help: { tr: 'Motor genelinde kilitlenmiş (zombi) işlerin ne sıklıkla arandığı.', en: 'How often stuck (zombie) jobs are scanned for, engine-wide.' },
        since: '2026-09-29',
    }),
];

// ---------------------------------------------------------------------------------------------------------------------
// order.config.json — YALNIZ gerçekten okunan anahtarlar (grep doğrulamalı: `orderConfig\.` — dikkat, `config\.`
// deseninden FARKLI bir import adı kullanılıyor, 2026-09-29 taramasında bu yüzden ayrı doğrulandı).
// ---------------------------------------------------------------------------------------------------------------------
export const ORDER_ENGINE_SETTINGS: SettingDef<number>[] = [
    durationSetting({
        key: 'order.syncIntervalMs', group: 'order.sync', scope: 'engine', unit: 'ms', default: 60000,
        danger: 'caution', applies: 'restart', consumers: ['engine/order/OrderQueueProducer.ts:283', 'engine/order/OrderOrchestrator.ts:61'],
        label: { tr: 'Sipariş üretici tur aralığı', en: 'Order producer tick interval' },
        help: { tr: 'Sipariş üreticisinin sırası gelen işleri kontrol etme sıklığı (çekim aralıkları tür başına ayrı: order.orderSync.intervalMs vb.).', en: 'How often the order producer checks for due jobs (pull intervals are per kind: order.orderSync.intervalMs etc.).' },
        since: '2026-09-29',
        knownDriftNote: 'ADR-0020 K10: `OrderOrchestrator.ts:61` ölü yedek 600000 (10 dk); `OrderQueueProducer.ts:283` ölü yedek 60000 (JSON ile aynı). AYNI anahtar için İKİ FARKLI kod yedeği olması kendi başına bir tutarsızlıktır. JSON değeri 60000 her iki tüketicide de kazanır.',
    }),
    durationSetting({
        key: 'order.defaultSyncFallbackDays', group: 'order.sync', scope: 'engine', unit: 'day', default: 1,
        danger: 'dangerous', applies: 'next_cycle', consumers: ['engine/order/OrderQueueProducer.ts:273'],
        label: { tr: 'İlk senkron geriye dönük pencere', en: 'Initial sync lookback window' },
        help: { tr: 'İlk senkronda geriye dönük kaç gün taranacağı.', en: 'How many days back the first sync scans.' },
        impact: { tr: 'Trendyol sağlayıcı penceresi ≤14 gündür; bu değeri büyütmek sağlayıcı sınırına takılma riski doğurur.', en: 'Trendyol provider window is ≤14 days; increasing this risks hitting the provider limit.' },
        since: '2026-09-29',
    }),
    countSetting({
        key: 'order.workerConcurrency', group: 'order.sync', scope: 'engine', default: 5, max: 50,
        danger: 'caution', applies: 'restart', consumers: ['engine/order/worker-runner.ts:43'],
        label: { tr: 'İşçi eşzamanlılığı', en: 'Worker concurrency' },
        help: { tr: 'BullMQ sipariş işçisinin aynı anda işleyeceği iş sayısı.', en: 'Concurrent jobs processed by the BullMQ order worker.' },
        since: '2026-09-29',
        knownDriftNote: '2026-09-29 taraması: kod içi ölü yedek 2 (`orderConfig.workerConcurrency || 2`, ADR K10 listesinde YOK ama gerçek); JSON değeri 5 her zaman kazanır.',
    }),
    countSetting({
        key: 'order.retryLimits.maxAttempts', group: 'order.sync', scope: 'engine', default: 5, max: 20,
        danger: 'caution', applies: 'restart', consumers: ['engine/order/OrderQueueProducer.ts:17'],
        label: { tr: 'İş yeniden deneme sayısı', en: 'Job retry attempts' },
        help: { tr: 'Bir sipariş işinin en fazla kaç kez yeniden deneneceği.', en: 'Maximum retry attempts for an order job.' },
        since: '2026-09-29',
    }),
    durationSetting({
        key: 'order.retryLimits.backoffDelayMs', group: 'order.sync', scope: 'engine', unit: 'ms', default: 2000,
        danger: 'caution', applies: 'restart', consumers: ['engine/order/OrderQueueProducer.ts:20'],
        label: { tr: 'İş yeniden deneme gecikmesi', en: 'Job retry backoff' },
        help: { tr: 'Yeniden denemeler arasındaki temel bekleme süresi.', en: 'Base wait between retries.' },
        since: '2026-09-29',
    }),
    durationSetting({
        key: 'order.memoryManagement.removeOnCompleteAge', group: 'order.sync', scope: 'engine', unit: 's', default: 86400,
        danger: 'safe', applies: 'restart', consumers: ['engine/order/worker-runner.ts:47', 'engine/order/OrderQueueProducer.ts:25'], advanced: true,
        label: { tr: 'Tamamlanan iş saklama süresi', en: 'Completed job retention age' },
        help: { tr: 'Tamamlanmış kuyruk kayıtlarının ne kadar süre saklanacağı.', en: 'How long completed queue records are kept.' },
        since: '2026-09-29',
    }),
    countSetting({
        key: 'order.memoryManagement.removeOnCompleteCount', group: 'order.sync', scope: 'engine', default: 1000, max: 100000,
        danger: 'safe', applies: 'restart', consumers: ['engine/order/worker-runner.ts:47', 'engine/order/OrderQueueProducer.ts:25'], advanced: true,
        label: { tr: 'Tamamlanan iş saklama adedi', en: 'Completed job retention count' },
        help: { tr: 'Tamamlanmış kuyruk kayıtlarından en fazla kaçının saklanacağı.', en: 'Max number of completed queue records kept.' },
        since: '2026-09-29',
    }),
    countSetting({
        key: 'order.memoryManagement.removeOnFailCount', group: 'order.sync', scope: 'engine', default: 500, max: 100000,
        danger: 'safe', applies: 'restart', consumers: ['engine/order/worker-runner.ts:48', 'engine/order/OrderQueueProducer.ts:26'], advanced: true,
        label: { tr: 'Başarısız iş saklama adedi', en: 'Failed job retention count' },
        help: { tr: 'Başarısız kuyruk kayıtlarından en fazla kaçının saklanacağı.', en: 'Max number of failed queue records kept.' },
        since: '2026-09-29',
    }),
    durationSetting({
        key: 'order.claimSync.intervalMs', group: 'order.support', scope: 'engine', unit: 'ms', default: 900000,
        danger: 'caution', applies: 'restart', consumers: ['engine/order/OrderQueueProducer.ts:100 (computeSourceWindow)'],
        label: { tr: 'İade senkron aralığı', en: 'Claim sync interval' },
        help: { tr: 'İade taleplerinin ne sıklıkla senkronize edileceği.', en: 'How often claims/returns are synced.' },
        since: '2026-09-29',
    }),
    durationSetting({
        key: 'order.claimSync.cursorOverlapMs', group: 'order.support', scope: 'engine', unit: 'ms', default: 3600000,
        danger: 'safe', applies: 'next_cycle', consumers: ['engine/order/OrderQueueProducer.ts:100 (computeSourceWindow)'], advanced: true,
        label: { tr: 'İade imleç örtüşmesi', en: 'Claim cursor overlap' },
        help: { tr: 'İmleç kaybını tolere etmek için taranan ek geriye dönük süre.', en: 'Extra lookback to tolerate cursor loss.' },
        since: '2026-09-29',
    }),
    durationSetting({
        key: 'order.claimSync.fullSweepIntervalMs', group: 'order.support', scope: 'engine', unit: 'ms', default: 86400000,
        danger: 'caution', applies: 'restart', consumers: ['engine/order/OrderQueueProducer.ts:100,215 (computeSourceWindow)'], advanced: true,
        label: { tr: 'İade tam tarama aralığı', en: 'Claim full sweep interval' },
        help: { tr: 'Tam (geniş pencereli) iade taramasının ne sıklıkla yapılacağı.', en: 'How often a full-window claim sweep runs.' },
        since: '2026-09-29',
    }),
    durationSetting({
        key: 'order.claimSync.fullSweepWindowDays', group: 'order.support', scope: 'engine', unit: 'day', default: 32,
        danger: 'caution', applies: 'next_cycle', consumers: ['engine/order/OrderQueueProducer.ts:100,215 (computeSourceWindow)'], advanced: true,
        label: { tr: 'İade tam tarama penceresi', en: 'Claim full sweep window' },
        help: { tr: 'Tam taramanın kaç gün geriye gideceği.', en: 'How many days the full sweep looks back.' },
        since: '2026-09-29',
    }),
    durationSetting({
        key: 'order.financeSync.intervalMs', group: 'order.support', scope: 'engine', unit: 'ms', default: 21600000,
        danger: 'caution', applies: 'restart', consumers: ['engine/order/OrderQueueProducer.ts:101 (computeSourceWindow)'],
        label: { tr: 'Finans senkron aralığı', en: 'Finance sync interval' },
        help: { tr: 'Hakediş/finans verisinin ne sıklıkla senkronize edileceği.', en: 'How often settlement/finance data is synced.' },
        since: '2026-09-29',
    }),
    durationSetting({
        key: 'order.financeSync.cursorOverlapMs', group: 'order.support', scope: 'engine', unit: 'ms', default: 86400000,
        danger: 'safe', applies: 'next_cycle', consumers: ['engine/order/OrderQueueProducer.ts:101 (computeSourceWindow)'], advanced: true,
        label: { tr: 'Finans imleç örtüşmesi', en: 'Finance cursor overlap' },
        help: { tr: 'İmleç kaybını tolere etmek için taranan ek geriye dönük süre.', en: 'Extra lookback to tolerate cursor loss.' },
        since: '2026-09-29',
    }),
    durationSetting({
        key: 'order.financeSync.fullSweepIntervalMs', group: 'order.support', scope: 'engine', unit: 'ms', default: 604800000, // [WP7a, PLAN §3.6] günlük → haftalık
        danger: 'caution', applies: 'restart', consumers: ['engine/order/OrderQueueProducer.ts:101,215 (computeSourceWindow)'], advanced: true,
        label: { tr: 'Finans tam tarama aralığı', en: 'Finance full sweep interval' },
        help: { tr: 'Tam finans taramasının ne sıklıkla yapılacağı.', en: 'How often a full finance sweep runs.' },
        since: '2026-09-29',
    }),
    durationSetting({
        key: 'order.financeSync.fullSweepWindowDays', group: 'order.support', scope: 'engine', unit: 'day', default: 30,
        danger: 'caution', applies: 'next_cycle', consumers: ['engine/order/OrderQueueProducer.ts:101,215 (computeSourceWindow)'], advanced: true,
        label: { tr: 'Finans tam tarama penceresi', en: 'Finance full sweep window' },
        help: { tr: 'Tam taramanın kaç gün geriye gideceği.', en: 'How many days the full sweep looks back.' },
        since: '2026-09-29',
    }),
    durationSetting({
        key: 'order.messageSync.intervalMs', group: 'order.support', scope: 'engine', unit: 'ms', default: 600000, // [WP7a, PLAN §3.6] 5 → 10 dk
        danger: 'safe', applies: 'restart', consumers: ['engine/order/OrderQueueProducer.ts:102 (computeSourceWindow)'],
        label: { tr: 'Soru senkron aralığı', en: 'Question sync interval' },
        help: { tr: 'Müşteri sorularının ne sıklıkla senkronize edileceği.', en: 'How often customer questions are synced.' },
        since: '2026-09-29',
    }),
    durationSetting({
        key: 'order.messageSync.cursorOverlapMs', group: 'order.support', scope: 'engine', unit: 'ms', default: 900000,
        danger: 'safe', applies: 'next_cycle', consumers: ['engine/order/OrderQueueProducer.ts:102 (computeSourceWindow)'], advanced: true,
        label: { tr: 'Soru imleç örtüşmesi', en: 'Question cursor overlap' },
        help: { tr: 'İmleç kaybını tolere etmek için taranan ek geriye dönük süre.', en: 'Extra lookback to tolerate cursor loss.' },
        since: '2026-09-29',
    }),
    durationSetting({
        key: 'order.orderSync.intervalMs', group: 'order.sync', scope: 'engine', unit: 'ms', default: 300000,
        danger: 'caution', applies: 'next_cycle', consumers: ['engine/order/OrderQueueProducer.ts (jobsForClient)'],
        label: { tr: 'Sipariş çekim aralığı (webhook\'suz)', en: 'Order pull interval (no webhook)' },
        help: { tr: 'Webhook\'u olmayan ya da sağlıksız kanalda siparişlerin ne sıklıkla çekileceği (PLAN §3.6: 5 dk; üretici turu 60 sn).', en: 'How often orders are pulled on channels without a healthy webhook (PLAN §3.6: 5 min; producer tick 60 s).' },
        since: '2026-10-04',
    }),
    durationSetting({
        key: 'order.orderSync.cursorOverlapMs', group: 'order.sync', scope: 'engine', unit: 'ms', default: 300000,
        danger: 'safe', applies: 'next_cycle', consumers: ['engine/order/OrderWorker.ts:264'], advanced: true,
        label: { tr: 'Sipariş imleç örtüşmesi', en: 'Order cursor overlap' },
        help: { tr: 'İmleç kaybını tolere etmek için taranan ek geriye dönük süre.', en: 'Extra lookback to tolerate cursor loss.' },
        since: '2026-09-29',
    }),
    durationSetting({
        key: 'order.webhookHealthy.reconciliationIntervalMs', group: 'order.sync', scope: 'engine', unit: 'ms', default: 600000, // [WP7a, PLAN §3.6] 5 → 10 dk
        danger: 'safe', applies: 'restart', consumers: ['engine/order/OrderQueueProducer.ts:86'],
        label: { tr: 'Webhook sağlıklıyken mutabakat aralığı', en: 'Reconciliation interval while webhook healthy' },
        help: { tr: 'Webhook sağlıklı çalışırken yine de kontrol amaçlı mutabakat sıklığı.', en: 'Reconciliation cadence even while webhooks are healthy.' },
        since: '2026-09-29',
    }),
    durationSetting({
        key: 'order.webhookHealthCheck.detectionWithoutWebhookWindowMs', group: 'order.sync', scope: 'engine', unit: 'ms', default: 1800000,
        danger: 'caution', applies: 'restart', consumers: ['engine/order/OrderQueueProducer.ts:157'],
        label: { tr: 'Webhook yokluk tespit penceresi', en: 'Webhook absence detection window' },
        help: { tr: 'Webhook alınmadığında bunun ne kadar sürede fark edileceği.', en: 'How quickly a webhook outage is detected.' },
        since: '2026-09-29',
    }),
];

export const ALL_ENGINE_SETTINGS: SettingDef<number>[] = [
    ...EXPORT_ENGINE_SETTINGS,
    ...IMPORT_ENGINE_SETTINGS,
    ...ORDER_ENGINE_SETTINGS,
    ...ORCHESTRATOR_ENGINE_SETTINGS,
];

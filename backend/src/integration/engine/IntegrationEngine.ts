import { DatabaseManagerInstance } from "@database/DatabaseManager";

/* import OrderFetcher from "./order/OrderFetcher"; */
import { ExportOrchestrator } from "./catalog/export/ExportOrchestrator";
import { ImportOrchestrator } from "./catalog/import/ImportOrchestrator";
import config from './orchestrator.config.json';
import os from 'os';
import { OrderOrchestrator } from "./order/OrderOrchestrator";
import { eventLog } from '@platform/core/logger';
import { config as appConfig } from '@config';

const log = eventLog('engine', 'IntegrationEngine');

/**
 * IntegrationEngine - Merkezi Yönetim Birimi
 * Görevi: Sistemi başlatmak, periyodik temizlikleri koordine etmek 
 * ve Import/Export loop'larını tetiklemektir.
 */
export default class IntegrationEngine {
    private static isRunning = false;
    private static readonly POD_NAME = process.env.POD_NAME || os.hostname();
    private static readonly ZOMBIE_CHECK_INTERVAL = config.orchestrator?.zombieCheckInterval || 900000;

    static async start() {
        if (this.isRunning) return;
        this.isRunning = true;

        // [DÜZELTME 2026-09-28] Başlatma DB erişimi reddederse bayrak true kalıyor ve ikinci start() sessizce no-op oluyordu.
        // Bayrak yalnızca setInterval/alt-orkestratörler kurulmadan ÖNCE geri alınır (bu noktadan sonraki adımlar reddetmez:
        // clearAllZombieLocks kendi hatasını yutar, safeStartSubsystem izoledir) -> yeniden start() çift zamanlayıcı yaratmaz.
        let applicationDB: any;
        try {
            applicationDB = await DatabaseManagerInstance.getApplicationDB();
        } catch (err) {
            this.isRunning = false;
            throw err;
        }

        // 1. ADIM: İLK AÇILIŞ TEMİZLİĞİ
        // Hem Import hem Export için kalmış zombi kilitleri temizliyoruz.
        await this.clearAllZombieLocks(applicationDB, true);

        // 2. ADIM: PERİYODİK TEMİZLİK
        // Belirlenen aralıklarla sistemi kontrol etmeye devam et.
        setInterval(() => {
            this.clearAllZombieLocks(applicationDB, false).catch(err =>
                log.error('INTEGRATIONENGINE_GLOBAL_CLEANUP_ERROR', "Global Cleanup Error:", { err })
            );
        }, this.ZOMBIE_CHECK_INTERVAL);

        // 3. ADIM: BAĞIMSIZ SERVİSLER
        // Sipariş çekme gibi arka plan görevlerini başlat.
        //new OrderFetcher('trendyol').start().catch(err => console.error("OrderFetcher Error", err));

        log.info('INTEGRATIONENGINE_ENGINE_STARTED', `Engine started on ${this.POD_NAME}.`);

        // 4. ADIM: ALT ORKESTRATÖRLERİ BAŞLAT
        // [BACKLOG "%0-kapsamlı orkestrasyon sınıfları" madde 1, 2026-09-27 — başlatma-zamanı izolasyon
        // düzeltmesi] Export/Import/Order süreçleri artık BAĞIMSIZ başlatılır: biri SENKRON throw etse
        // (ör. bir config/programlama hatası) bile diğer ikisi YİNE DE başlatılmaya çalışılır. Öncesinde
        // bu üç çağrı sıralı ve try/catch'SİZ olduğundan biri throw ederse sonrakiler hiç çağrılmıyor VE
        // `IntegrationEngine.start()` reddediyordu — bu da `entegrasyonik.ts`'teki `await IntegrationEngine
        // .start()` çağrısını yakalayan try/catch üzerinden `gracefulShutdown()`'ı (dolayısıyla TÜM
        // worker/all sürecini) tetikliyordu.
        //
        // KARAR (üçü de başarısız olursa süreç YİNE DE kapanmaz — insan onayı gerekmeyen, mevcut kod
        // tabanındaki desenle tutarlı bir seçim; bkz. RedisService.init() ADR-0005 Karar 2, AYNI şekilde
        // "fail-open, logla, süreci durdurma"): Gerekçe (a) bu üç `start()` çağrısı senkron ve kendi
        // içinde bir yeniden-deneme mekanizması taşımaz; süreci kapatıp yeniden başlatmak (restart) AYNI
        // yapısal hatayla tekrar karşılaşır ve bir crash-loop yaratır — bu, `all` rolünde AYNI süreçte
        // çalışan web/health sunucusunu da gereksiz yere kesintiye uğratır. (b) arka plan orkestrasyonunun
        // devre dışı kalması ciddi ama KURTARILABİLİR bir durumdur (web API'si, health/ready uçları ve
        // mevcut veriler etkilenmez); bunu loglayıp izlemeye/insan müdahalesine bırakmak, TÜM süreci
        // kapatmaktan daha güvenlidir. Üçü de başarısız olursa ayrıca toplu bir "tamamen devre dışı"
        // uyarısı loglanır (aşağıya bakınız).
        // [LIVE-RO] Canlı salt-okuma kipi (LIVE_READONLY=1): pazaryerine YAZAN Export hattı (Dispatcher/Validator/Publisher/Sentinel/Sync) ve zamanlanmış
        // sipariş çekimi/BullMQ işçisi BAŞLATILMAZ; yalnız kullanıcı tetiklemeli İÇE ALMA (Stager/Importer) çalışır. Kip kapalıyken davranış AYNI.
        if (appConfig.liveReadonly.enabled) {
            log.warn('INTEGRATIONENGINE_LIVE_READONLY', 'LIVE_READONLY: Export ve Order orkestratörleri BAŞLATILMADI; yalnız ImportOrchestrator çalışıyor.');
            this.safeStartSubsystem('ImportOrchestrator', () => ImportOrchestrator.start(applicationDB));
            return;
        }
        const started = [
            this.safeStartSubsystem('ExportOrchestrator', () => ExportOrchestrator.start(applicationDB)),
            this.safeStartSubsystem('ImportOrchestrator', () => ImportOrchestrator.start(applicationDB)),
            this.safeStartSubsystem('OrderOrchestrator', () => OrderOrchestrator.start()),
        ];
        if (started.every((ok) => !ok)) {
            log.error('INTEGRATIONENGINE_KRITIK_EXPORT_IMPORT_ORDER', "KRİTİK: Export/Import/Order orkestratörlerinin ÜÇÜ DE başlatılamadı; " +
                "arka plan orkestrasyonu tamamen devre dışı (web/health sunucusu etkilenmedi, süreç kapanmadı).");
        }
    }

    /**
     * Bir alt-orkestratörü İZOLE şekilde başlatır: SENKRON throw (ör. bir config/programlama hatası)
     * diğer alt-sistemlerin başlatılmasını ENGELLEMEZ (BACKLOG "%0-kapsamlı orkestrasyon sınıfları"
     * madde 1, 2026-09-27). Hata konsola loglanır; `IntegrationEngine.start()` bu nedenle REDDETMEZ.
     */
    private static safeStartSubsystem(name: string, starter: () => void): boolean {
        try {
            starter();
            return true;
        } catch (err: any) {
            log.error('INTEGRATIONENGINE_START_BASLATMA_HATASI_IZOLE', `${name}.start() başlatma hatası (izole edildi, diğer alt-sistemler etkilenmedi):`, { detail: err?.message ?? err });
            return false;
        }
    }

    /**
     * Tüm sistemdeki zombi kilitleri temizleyen merkezi metod.
     * Sorumluluğu alt sınıflara delege eder.
     */
    private static async clearAllZombieLocks(applicationDB: any, isInitial: boolean) {
        try {
            await Promise.all([
                ExportOrchestrator.clearZombies(applicationDB, isInitial),
                ImportOrchestrator.clearZombies(applicationDB, isInitial)
            ]);
        } catch (err: any) {
            log.error('INTEGRATIONENGINE_CLEARALLZOMBIELOCKS_ERROR', "clearAllZombieLocks Error:", { err });
        }
    }
}
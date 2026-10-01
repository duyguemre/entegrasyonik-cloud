import { DBConfig, IApplicationDB } from "@interfaces/index";
import getModels from './ApplicationMongooseSchemas';
import { IDatabase } from "../Database";
import Database from "../Database";

export default class ApplicationDB implements IApplicationDB {
    private static instance: ApplicationDB | null = null;
    private static initPromise: Promise<ApplicationDB> | null = null;
    private database!: IDatabase;

    private constructor() { }

    /** ADR-0024 D2: kapanışta YENİ bağlantı açmadan mevcut örneği/başlatma sözünü döner (yoksa undefined). */
    public static peek(): ApplicationDB | Promise<ApplicationDB> | undefined {
        return ApplicationDB.instance ?? ApplicationDB.initPromise ?? undefined;
    }

    /** ADR-0024 D2: süreçteki TEK kök bağlantı (uygulama DB'si); ClientDB tenant tutamaklarını `useDb` ile bundan türetir. */
    public getRootDatabase(): Database { return this.database as Database; }

    public static async getInstance(config: DBConfig): Promise<ApplicationDB> {
        if (ApplicationDB.instance) {
            return ApplicationDB.instance;
        }

        if (ApplicationDB.initPromise) {
            return ApplicationDB.initPromise;
        }

        ApplicationDB.initPromise = (async () => {
            try {
                const temp = new ApplicationDB();
                await temp.init(config);

                ApplicationDB.instance = temp;
                return temp;
            } catch (error) {
                ApplicationDB.initPromise = null;
                throw error;
            } finally {
                ApplicationDB.initPromise = null;
            }
        })();

        return ApplicationDB.initPromise;
    }

    private async init(config: DBConfig) {
        if (!this.database) {
            this.database = await Database.getInstance(config, getModels);
        }
    }

    /**
     * Uygulama kapanırken ana veritabanı bağlantısını düzgünce kapatır.
     */
    public async close(): Promise<void> {
        if (this.database) {
            // Database.ts içindeki close() metodunu çağırır
            ApplicationDB.instance = null;
            await (this.database as any).close();
            console.log("[ApplicationDB] >>> Ana veritabanı bağlantısı kapatıldı.");
        }
    }

    /** ADR-0006 Karar 5 (/ready): MEVCUT bağlantı üzerinden ping (yeni bağlantı AÇMAZ); ≤1sn üst sınır çağıran tarafta uygulanır. */
    public async ping(): Promise<boolean> {
        if (!this.database) return false;
        return this.database.ping();
    }

    // Modeller (Aynı kalıyor)
    public getUserModel() { return this.database.getModel('user'); }
    public getResourceModel() { return this.database.getModel('resource'); }
    public getMenuModel() { return this.database.getModel('menu'); }
    public getIntegrationModel() { return this.database.getModel('integration'); }
    public getIntegrationTypeModel() { return this.database.getModel('integration_type'); }
    public getCachedIntegrationDataModel() { return this.database.getModel('cached_integration_data'); }
    public getClientModel() { return this.database.getModel('client'); }
    public getTicketModel() { return this.database.getModel('ticket'); }
    public getCounterModel() { return this.database.getModel('counter'); }
    public getExportStagedProductModel() { return this.database.getModel('export_staged_product'); }
    public getExportSignalModel() { return this.database.getModel('export_signal'); }
    public getExportFlagModel() { return this.database.getModel('export_flag'); }
    public getImportJobModel() { return this.database.getModel('import_job'); }
    public getDeadLetterQueueModel() { return this.database.getModel('dead_letter_queue'); }
    public getGlobalRoleModel() { return this.database.getModel('global_role'); }
    public getOperationLogModel() { return this.database.getModel('operation_log'); }
    public getAuditLogModel() { return this.database.getModel('audit_log'); }
    public getIntegrationCallMetricModel() { return this.database.getModel('integration_call_metric'); }
    // [ADR-0005 Karar 4] Kuyruk/iş seviyesi dakikalık ölçüm (BullMQ + katalog hattı + Redis örneklemesi).
    public getQueueMetricsModel() { return this.database.getModel('queue_metrics'); }
    // [ADR-0008 Aşama A] billing veri modeli (Plans/Subscriptions/BillingEvents) -- ApplicationDB'de, tenant DB'de DEĞİL.
    public getPlanModel() { return this.database.getModel('plan'); }
    public getSubscriptionModel() { return this.database.getModel('subscription'); }
    public getBillingEventModel() { return this.database.getModel('billing_event'); }
    // Hesap yaşam döngüsü token'ları (parola sıfırlama / e-posta doğrulama) -- ApplicationDB'de.
    public getAccountTokenModel() { return this.database.getModel('account_token'); }
    // [ADR-0028] üyelik + davet.
    public getMembershipModel() { return this.database.getModel('membership'); }
    public getAdminMfaModel() { return this.database.getModel('admin_mfa'); }
    public getInvitationModel() { return this.database.getModel('invitation'); }
    // [ADR-0029] bildirim olay defteri + e-posta outbox.
    public getNotificationEventModel() { return this.database.getModel('notification_event'); }
    public getNotificationDeliveryModel() { return this.database.getModel('notification_delivery'); }
    public getNotificationPreferencesModel() { return this.database.getModel('notification_preferences'); }
    public getAnnouncementModel() { return this.database.getModel('announcement'); }
    public getAlertModel() { return this.database.getModel('alert'); }
    // [ADR-0035 / MCP-1] OAuth yetkilendirme sunucusu.
    // [BE-05 / K51] backoffice kayitli gorunumler.
    public getBackofficeViewModel() { return this.database.getModel('backoffice_view'); }
    public getPushSubscriptionModel() { return this.database.getModel('push_subscription'); }
    public getOAuthClientModel() { return this.database.getModel('oauth_client'); }
    public getOAuthAuthCodeModel() { return this.database.getModel('oauth_auth_code'); }
    public getOAuthRefreshTokenModel() { return this.database.getModel('oauth_refresh_token'); }
    // [ADR-0016 §2 / ADR-0017 Karar 3] `platform/runtime/scheduler`: iş başına Mongo lease + JobRunRegistry.
    public getJobLeaseModel() { return this.database.getModel('job_lease'); }
    public getJobStateModel() { return this.database.getModel('job_state'); }
    public getJobRunModel() { return this.database.getModel('job_run'); }
    // ADR-0018 Karar 2: entegrasyon uyum bulgusu (FindingService bu model üzerinden okur/yazar).
    public getIntegrationFindingModel() { return this.database.getModel('integration_finding'); }
    // ADR-0017 Aşama B (Karar 2.1): metrik kovası (5dk/1sa, $inc upsert; bkz. platform/runtime/metrics/metricsFlush.ts).
    public getMetricRollupModel() { return this.database.getModel('metric_rollup'); }
    // ADR-0017 Aşama B (Karar 2.4): hata olayı ("mini-Sentry", parmak izi başına tek doküman).
    public getErrorEventModel() { return this.database.getModel('error_event'); }
    public getLogEventModel() { return this.database.getModel('log_event'); }
    // ADR-0018 Karar 2c (Aşama B): kaynak izleyici (SourceMonitor) bu model üzerinden okur/yazar.
    public getSourceSnapshotModel() { return this.database.getModel('source_snapshot'); }
    // ADR-0020 Karar 3.1 (Aşama B): sürümlü platform geçersiz kılmaları + yayın başlığı.
    public getIntegrationConfigRevisionModel() { return this.database.getModel('integration_config_revision'); }
    public getIntegrationConfigHeadModel() { return this.database.getModel('integration_config_head'); }
    // ADR-0021 Karar 4 (Aşama A/D7): göç kaydı (`dev-tools/migrate.js` status/plan/up/down burayı okur/yazar).
    public getSchemaMigrationModel() { return this.database.getModel('schema_migration'); }
}
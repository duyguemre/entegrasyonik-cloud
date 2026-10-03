import { Connection, Model } from 'mongoose'
import { ClientSchema } from './models/Client';
import { CounterSchema, CachedIntegrationDataSchema, DeadLetterQueueSchema } from './models/Common';
import { ExportFlagSchema, ExportSignalSchema } from './models/Export';
import { ImportJobSchema } from './models/Import';
import { IntegrationSchema, IntegrationTypeSchema } from './models/Integration';
import { MenuSchema } from './models/Menu';
import { TicketSchema } from './models/Ticket';
import { ResourceSchema, UserSchema } from './models/User';
import { GlobalRoleSchema } from './models/GlobalRole';
import { OperationLogSchema } from './models/OperationLog';
import { AuditLogSchema } from './models/AuditLog';
import { IntegrationCallMetricSchema } from './models/IntegrationCallMetric';
import { QueueMetricsSchema } from './models/QueueMetrics';
import { PlanSchema } from './models/Plan';
import { SubscriptionSchema } from './models/Subscription';
import { BillingEventSchema } from './models/BillingEvent';
import { AccountTokenSchema } from './models/AccountToken';
import { MembershipSchema } from './models/Membership';
import { InvitationSchema } from './models/Invitation';
import { AdminMfaSchema } from './models/AdminMfa';
import { NotificationEventSchema } from './models/NotificationEvent';
import { AnnouncementSchema } from './models/Announcement';
import { AlertSchema } from './models/Alert';
import { NotificationDeliverySchema } from './models/NotificationDelivery';
import { NotificationPreferencesSchema } from './models/NotificationPreferences';
import { JobLeaseSchema } from './models/JobLease';
import { JobStateSchema, JobRunSchema } from './models/JobRunRegistry';
import { IntegrationFindingSchema } from './models/IntegrationFinding';
import { MetricRollupSchema } from './models/MetricRollup';
import { ErrorEventSchema } from './models/ErrorEvent';
import { LogEventSchema } from './models/LogEvent';
import { SourceSnapshotSchema } from './models/SourceSnapshot';
import { IntegrationConfigRevisionSchema, IntegrationConfigHeadSchema } from './models/IntegrationConfig';
import { SchemaMigrationSchema } from './models/SchemaMigration';
import { OAuthClientSchema } from './models/OAuthClient';
import { OAuthAuthCodeSchema } from './models/OAuthAuthCode';
import { OAuthRefreshTokenSchema } from './models/OAuthRefreshToken';
import { BackofficeViewSchema } from './models/BackofficeView';

export default (mongooseConnection: Connection): Record<string, Model<any>> => {
    return {
        integration: mongooseConnection.model('integration', IntegrationSchema),
        integration_type: mongooseConnection.model('integration_type', IntegrationTypeSchema),
        menu: mongooseConnection.model('menu', MenuSchema),
        user: mongooseConnection.model('user', UserSchema),
        global_role: mongooseConnection.model('global_role', GlobalRoleSchema),
        resource: mongooseConnection.model('resource', ResourceSchema),
        client: mongooseConnection.model('client', ClientSchema),
        ticket: mongooseConnection.model('ticket', TicketSchema),
        counter: mongooseConnection.model('counter', CounterSchema),
        cached_integration_data: mongooseConnection.model('cached_integration_data', CachedIntegrationDataSchema),
        export_signal: mongooseConnection.model('export_signal', ExportSignalSchema),
        export_flag: mongooseConnection.model('export_flag', ExportFlagSchema),
        import_job: mongooseConnection.model('import_job', ImportJobSchema),
        dead_letter_queue: mongooseConnection.model('dead_letter_queue', DeadLetterQueueSchema),
        operation_log: mongooseConnection.model('operation_log', OperationLogSchema),
        audit_log: mongooseConnection.model('audit_log', AuditLogSchema),
        integration_call_metric: mongooseConnection.model('integration_call_metric', IntegrationCallMetricSchema),
        queue_metrics: mongooseConnection.model('queue_metrics', QueueMetricsSchema),
        // ADR-0008 Aşama A: billing veri modeli
        plan: mongooseConnection.model('plan', PlanSchema),
        subscription: mongooseConnection.model('subscription', SubscriptionSchema),
        billing_event: mongooseConnection.model('billing_event', BillingEventSchema),
        // Hesap yaşam döngüsü: parola sıfırlama / e-posta doğrulama token'ları (yalnızca HASH; TTL)
        account_token: mongooseConnection.model('account_token', AccountTokenSchema),
        // ADR-0028 Karar 1/5: üyelik + davet (autoIndex kapalı; indeksler yalnız onaylı göçle: migrations/0003)
        membership: mongooseConnection.model('membership', MembershipSchema),
        invitation: mongooseConnection.model('invitation', InvitationSchema),
        // ADR-0026 Karar 4.5: backoffice TOTP 2FA kaydi (autoIndex kapali; koleksiyon/indeks yalniz onayli goc)
        admin_mfa: mongooseConnection.model('admin_mfa', AdminMfaSchema),
        // ADR-0029 Karar 3: bildirim olay defteri + e-posta outbox (autoIndex kapalı; indeksler yalnız onaylı göçle, S1)
        notification_event: mongooseConnection.model('notification_event', NotificationEventSchema),
        notification_delivery: mongooseConnection.model('notification_delivery', NotificationDeliverySchema),
        notification_preferences: mongooseConnection.model('notification_preferences', NotificationPreferencesSchema),
        // ADR-0029 NB7/NB8: platform duyurulari + uyari yasam dongusu (autoIndex kapali; indeksler yalniz onayli gocle: migrations/0017)
        announcement: mongooseConnection.model('announcement', AnnouncementSchema),
        alert: mongooseConnection.model('alert', AlertSchema),
        // ADR-0016 §2 / ADR-0017 Karar 3: zamanlayıcı lease + JobRunRegistry (JobState/JobRuns)
        job_lease: mongooseConnection.model('job_lease', JobLeaseSchema),
        job_state: mongooseConnection.model('job_state', JobStateSchema),
        job_run: mongooseConnection.model('job_run', JobRunSchema),
        // ADR-0018 Karar 2: entegrasyon uyum bulgusu (pasif bekçi/probe/kaynak izleme/mock senkronu tek modeli).
        integration_finding: mongooseConnection.model('integration_finding', IntegrationFindingSchema),
        // ADR-0017 Aşama B (Karar 2.1/2.4): metrik kovaları + hata olayları ("mini-Sentry").
        metric_rollup: mongooseConnection.model('metric_rollup', MetricRollupSchema),
        error_event: mongooseConnection.model('error_event', ErrorEventSchema),
        // ADR-0026 WP-LOG L1: kalici log deposu (autoIndex kapali; TTL + sorgu indeksleri yalniz onayli goc: migrations/0005)
        log_event: mongooseConnection.model('log_event', LogEventSchema),
        // ADR-0018 Karar 2c (Aşama B): haftalık kaynak izleyici -- URL başına tek doküman (hash/diff, içerik YOK).
        source_snapshot: mongooseConnection.model('source_snapshot', SourceSnapshotSchema),
        // ADR-0020 Karar 3.1 (Aşama B): sürümlü platform geçersiz kılmaları + yayın başlığı (poll edilen küçük belge).
        integration_config_revision: mongooseConnection.model('integration_config_revision', IntegrationConfigRevisionSchema),
        integration_config_head: mongooseConnection.model('integration_config_head', IntegrationConfigHeadSchema),
        // ADR-0021 Karar 4 (Aşama A/D7): kalıcı göç altyapısı kaydı (`dev-tools/migrate.js`).
        schema_migration: mongooseConnection.model('schema_migration', SchemaMigrationSchema),
        // ADR-0035 / MCP-1: OAuth yetkilendirme sunucusu (DCR istemcileri, kod ozetleri, refresh aileleri). autoIndex kapali; indeksler yalniz onayli gocle: migrations/0018.
        oauth_client: mongooseConnection.model('oauth_client', OAuthClientSchema),
        oauth_auth_code: mongooseConnection.model('oauth_auth_code', OAuthAuthCodeSchema),
        oauth_refresh_token: mongooseConnection.model('oauth_refresh_token', OAuthRefreshTokenSchema),
        // BE-05 / K51: backoffice kayitli gorunumler (yonetici basina, <=20). autoIndex kapali; indeksler yalniz onayli gocle: migrations/0019.
        backoffice_view: mongooseConnection.model('backoffice_view', BackofficeViewSchema),
    }
}
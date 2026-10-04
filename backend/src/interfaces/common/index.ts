


export interface IClientOperations {
    getStorageConfig(clientId: string, type: 'image' | 'archive'): Promise<S3Config>;
    saveNotification(clientId: string, notificationData: any): Promise<void>;
}

export type S3Config = {
    accessKeyId: string;
    secretAccessKey: string;
    bucketName: string;
    endpoint: string;
    region?: string;
}

// Olay İsimleri (Read-only)
export const NOTIFICATION_EVENTS = {
    SEND_CLIENT_NOTIFICATION: 'SEND_CLIENT_NOTIFICATION',
    UI_NOTIFY: 'UI_NOTIFY'
} as const;


/**
 * Bildirimin içeriğini tanımlayan veri yapısı
 */
export interface NotificationPayload {
    userId?: string; // İşlemi yapan kullanıcı ID
    type: 'BATCH_PROCESS' | 'ORDER' | 'STOCK_ALERT' | 'INFO' | 'SYSTEM' | 'EXPORT_READY' | "IMPORT_READY";
    mode?: PLATFORM_PROCESS;
    severity: 'success' | 'info' | 'warning' | 'error' | 'primary';
    title: string;
    message: string;
    actionUrl?: string;
    metaData?: Record<string, any>;
}

/**
 * Event fırlatılırken gönderilmesi gereken paket.
 * Artık clientDB referansı yerine sadece clientId taşıyoruz.
 */
export interface SendNotificationEvent {
    readonly clientId: string;           // Veritabanını bulmak için anahtar
    readonly notificationData: NotificationPayload;
}


export interface ICategoryComission {
    id: string | number;
    name: string;
    commissionRate?: number; // Komisyon oranı vb. alanlar
    /** Trendyol commissions.json: temel oran (%); yoksa `undefined`. */
    commission?: number | null;
    /** Trendyol: olgunluk/vade (gün). */
    maturity?: number | null;
    /** Trendyol KA1/KA2 kademe oranları (yalnız okuyucu; tenant kademesi seçimi COM-01 teyidi bekler). */
    tiers?: { KA1?: number; KA2?: number };
    /** COM-01: tablo kaynağı/bayatlık üst verisi (asOf = repo tarihi, yürürlük tarihi değil; vatIncluded null = bilinmiyor). */
    meta?: { source: string; asOf: string; vatIncluded: boolean | null; sourceConfidence: string };
    childrenCategories?: ICategoryComission[];
}



export enum PLATFORM_PROCESS {
    TRANSFER = "TRANSFER",
    UPDATE_PRICE = "UPDATE_PRICE",
    UPDATE_STOCK = "UPDATE_STOCK",
    UPDATE = "UPDATE",
    UPDATE_VARIANT = "UPDATE_VARIANT",
    UPDATE_DELIVERY = "UPDATE_DELIVERY",
    IMPORT = "IMPORT",
    BILLING = "BILLING", // ADR-0008: abonelik/faturalama bildirimleri (Notification şeması `mode`u zorunlu tutar)
}



export interface IBrand {
    id: string;
    title: string;
}

export interface ICategory {
    _id: string;
    parentId: string | number;
    title: string;
    children: ICategory[];
    level: number;
}


export interface ICategoryAttribute {
    _id: string;
    title: string;
    allowCustom: boolean;
    required: boolean;
    varianter: boolean;
    slicer: boolean;
    multiple: boolean;
    values?: ICategoryAttributeValue[];
    /** [eslesme-fiyat WP2/WP3] Değer listesi ayrı uçtan (menü açılınca) yüklenir (HB enum). */
    lazyValues?: boolean;
    /** [WP3] HB temel kova (ürünün sabit alanlarından dolar; kategori zorunlu özellik denetimine girmez). */
    base?: boolean;
}


export interface ICategoryAttributeValue {
    id: string;
    title: string;
}







export interface IService {
    /*     process():Promise<any> */
    get?(): Promise<any>

}

export interface IBaseMicroservice {
    new(clientId: number, request: any): IService;
}


export enum TICKET_STATUS {
    OPEN = "OPEN",
    IN_PROGRESS = "IN_PROGRESS",
    WAITING_CLIENT = "WAITING_CLIENT",
    RESOLVED = "RESOLVED",
    CLOSED = "CLOSED",
}


export enum TICKET_TYPE {
    GENERAL = "GENERAL",
    TECHNICAL = "TECHNICAL",
    BILLING = "BILLING",
    FEATURE_REQUEST = "FEATURE_REQUEST",
    BUG = "BUG",
    OTHER = "OTHER",
}

export enum TICKET_PRIORITY {
    LOW = "LOW",
    MEDIUM = "MEDIUM",
    HIGH = "HIGH",
    URGENT = "URGENT",
}



export interface DBConfig {
    url: string;
    user: string;
    password: string;
    dbname: string;
    poolsize: number;
}


export interface IApplicationDB {
    /** ADR-0006 Karar 5 (/ready): MEVCUT bağlantı üzerinden ping; yeni bağlantı AÇMAZ. */
    ping(): Promise<boolean>,
    getUserModel(): any,
    getResourceModel(): any,
    getMenuModel(): any,
    getIntegrationModel(): any,
    getIntegrationTypeModel(): any,
    getCachedIntegrationDataModel(): any,
    getClientModel(): any,
    getTicketModel(): any,
    getCounterModel(): any,
    getExportStagedProductModel(): any
    getExportSignalModel(): any
    getExportFlagModel(): any
    getImportJobModel(): any,
    getDeadLetterQueueModel(): any
    getGlobalRoleModel(): any
    getOperationLogModel(): any
    getAuditLogModel(): any
    getIntegrationCallMetricModel(): any
    // ADR-0008 Aşama A: billing veri modeli (Plans/Subscriptions/BillingEvents) — ApplicationDB'de, tenant DB'de DEĞİL.
    getPlanModel(): any
    getSubscriptionModel(): any
    getBillingEventModel(): any
    /** Hesap yaşam döngüsü token'ları (parola sıfırlama / e-posta doğrulama; yalnızca HASH saklanır, TTL). */
    getAccountTokenModel(): any
    getMembershipModel(): any
    getAdminMfaModel(): any
    getInvitationModel(): any
    // [ADR-0029] bildirim olay defteri + e-posta outbox.
    getNotificationEventModel(): any
    getNotificationDeliveryModel(): any
    getNotificationPreferencesModel(): any
    // [ADR-0029 NB7/NB8] platform duyurulari + uyari yasam dongusu.
    getAnnouncementModel(): any
    getAlertModel(): any
    getBackofficeViewModel(): any
    getPushSubscriptionModel(): any
    /** MOB-08 / K55: gunluk aktif kullanim (gun+tenant+platform). */
    getUsageDailyModel(): any
    /** [eslesme-fiyat WP2] platform katalog önbelleği (App, tenant'tan bağımsız). */
    getPlatformCatalogModel(): any
    getOAuthClientModel(): any
    getOAuthAuthCodeModel(): any
    getOAuthRefreshTokenModel(): any
    // [ADR-0016 §2 / ADR-0017 Karar 3] `platform/runtime/scheduler`: iş başına Mongo lease + JobRunRegistry.
    getJobLeaseModel(): any
    getJobStateModel(): any
    getJobRunModel(): any
    // ADR-0018 Karar 2: entegrasyon uyum bulgusu (pasif bekçi/probe/kaynak izleme/mock senkronu tek modeli).
    getIntegrationFindingModel(): any
    // ADR-0017 Aşama B: metrik kovası + hata olayı ("mini-Sentry").
    getMetricRollupModel(): any
    getErrorEventModel(): any
    // ADR-0026 WP-LOG L1: kalici log deposu (LogEvents; autoIndex kapali, indeksler yalniz onayli goc).
    getLogEventModel(): any
    // ADR-0018 Karar 2c (Aşama B): haftalık kaynak izleyici -- URL başına tek doküman (hash/diff, içerik YOK).
    getSourceSnapshotModel(): any
    // ADR-0020 Karar 3.1 (Aşama B): sürümlü platform geçersiz kılmaları + yayın başlığı (poll edilen küçük belge).
    getIntegrationConfigRevisionModel(): any
    getIntegrationConfigHeadModel(): any
    // ADR-0021 Karar 4 (Aşama A/D7): göç kaydı (`dev-tools/migrate.js`).
    getSchemaMigrationModel(): any
}


export interface IClientDB {
    /** ADR-0021 D8 / DB-08: tüm tenant modellerinin indekslerini kurar (provizyon adımı; opsiyonel — sahte uygulamalar bırakabilir). */
    ensureIndexes?(): Promise<void>
    getClientIntegrationModel(): any
    getPlatformProcessModel(): any,
    getPlatformProcessProductModel(): any,
    getIntegrationCategoryModel(): any,
    getIntegrationBrandModel(): any
    getHashtagModel(): any
    getCategoryModel(): any
    getBrandModel(): any
    getChoiceModel(): any
    getProductModel(): any
    getVariantModel(): any
    getPriceHistoryModel(): any
    getStockMovementModel(): any
    getCommissionOverrideModel(): any
    getImageModel(): any
    getOrderModel(): any
    getClaimModel(): any
    getCustomerModel(): any
    getRoleModel(): any
    getSettingModel(): any
    getFavoriteModel(): any
    getInvoiceModel(): any
    getCounterModel(): any
    getStatisticsModel(): any
    getAttributeMappingModel(): any
    getExportStagedProductModel(): any
    getNotificationModel(): any
    getImportStagedProductModel(): any
    getImportStagedProductSummaryModel(): any
    getImportJobReportModel(): any
    getMessageModel(): any
    getUserModel(): any
    getRoleModel(): any
    getFinancialTransactionModel(): any
    getCargoInvoiceModel(): any
    /** ADR-0003 adım 8 (purge): tenant veritabanını KALICI olarak siler (geri dönüşsüz). */
    dropDatabase(): Promise<void>
}

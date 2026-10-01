// ADR-0019 §7 Aşama A geri alma fixture'ı: bu dosya, Yetenek Kaydı'na geçmeden ÖNCEKİ
// `backend/src/api/rpc/operationPolicy.ts`'teki `OPERATION_POLICY` LİTERALİNİN BİREBİR KOPYASIDIR
// (2026-09-28, `faz3-arayuz` @ 0ed7d4c). DÜZENLENMEZ. Yalnızca iki amaçla kullanılır:
//   1. `capability-parity.test.ts` P1: `derivePolicy(CAPABILITIES)` bu tabloyla DERİN EŞİT olmalı
//      ("türetilen politika = Aşama A öncesi politikanın anlık görüntüsü").
//   2. Geri alma: bir regresyon olursa bu literal `operationPolicy.ts`'e geri yapıştırılır (tek commit).
// Yeni operasyon eklemek İÇİN BU DOSYA DEĞİL `backend/src/capabilities/domains/<alan>.ts` değiştirilir.
import type { Tier } from '../../../src/api/rpc/operationPolicy';

export type SnapshotPolicy = Record<string, Record<string, Tier>>;

const M: Tier = 'member';
const A: Tier = 'admin';
const O: Tier = 'owner';
const P: Tier = 'platformAdmin';

export const OPERATION_POLICY_SNAPSHOT: SnapshotPolicy = {
    // --- Oturum ---
    // login/register/getCaptcha/logout OPEN_ROUTES'tadır (authenticate.ts) ve bu kayıtta YOKTUR.
    SecurityService: {
        selectStore: P, // yalnızca süper yönetici (mağaza seçimi / impersonation)
    },

    // --- Hesap yaşam döngüsü (kendi hesabı; hedef kullanıcı DAİMA doğrulanmış principal.sub) ---
    // requestPasswordReset/confirmPasswordReset/verifyEmail kimliksizdir: OPEN_OPERATIONS'tadır, bu kayıtta YOKTUR.
    // Henüz FE'de çağrılmıyor (ekranlar ADR-0015 sonrası) -- operation-policy.test.ts BACKEND_ONLY_NOT_YET_IN_FE.
    AccountService: {
        changePassword: M,           // her tenant kullanıcısı kendi parolasını değiştirebilmeli (eski parola doğrulanır)
        resendVerificationEmail: M,  // kendi e-postası için doğrulama bağlantısını yeniden gönderir
        reauthenticate: M,           // [ADR-0028 WP-A4] adım yükseltme: kendi parolasını yeniden doğrular (5 dk)
    },

    // --- Platform yönetimi (tamamı platformAdmin; ADR Karar 8) ---
    AdminService: {
        get: P, getClients: P, getClientStats: P, getClientIntegrations: P, getGlobalMetrics: P,
        getTickets: P, createTicket: P, deleteTicket: P, replyToTicket: P, getSystemHealth: P,
        getExportDetails: P, createClient: P, updateClient: P, deleteClient: P,
    },

    // --- Tenant KVKK uçları (ADR-0003 adım 8, Karar F.20/F.22) ---
    // requestDeletion/exportTenantData: yalnızca tenant SAHİBİ (owner) — kademe modelinde ilk `owner` kayıtları.
    // cancelDeletion: platformAdmin (ADR F.20: bekleme süresinde geri alma yalnızca süper yönetici).
    TenantDataService: {
        requestDeletion: O,
        exportTenantData: O,
        cancelDeletion: P,
    },

    // --- Kullanıcı / rol yönetimi ---
    UserService: {
        getRoles: M,     // uygulama açılışında ve kullanıcı formlarında rol listesi (hassas değil)
        getResources: M, // initApp: menü/kaynak görünürlüğü
        getUsers: A, createUser: A, updateUser: A, deleteUser: A,
        // [ADR-0028 WP-A4] davet / askıya alma / sahiplik devri
        inviteUser: A, resendInvitation: A, revokeInvitation: A, listInvitations: A, suspendUser: A, reactivateUser: A,
        initiateOwnershipTransfer: O, cancelOwnershipTransfer: O, acceptOwnershipTransfer: M,
    },

    // --- Ayarlar ---
    SettingService: {
        getSettings: M, // initApp'te her kullanıcı için okunur
        updateSettings: A,
    },
    ConfigurationService: { get: M },

    // --- Menü / bildirim / mesaj / destek / arama ---
    MenuService: { get: M, retrieveFavorites: M, addFavorite: M, deleteFavorite: M, sortFavorites: M },
    NotificationService: {
        get: M, markAsRead: M, delete: M, getUnreadCount: M /* §6: hafif rozet sorgusu (salt-okunur sayım) */,
        // ADR-0029 NB4: kişisel (M) + tenant varsayılanı (A, settings:manage)
        archive: M, unarchive: M, getCatalog: M, getPreferences: M, updatePreferences: M, getTenantDefaults: A, updateTenantDefaults: A,
        getPushConfig: M, subscribePush: M, unsubscribePush: M, // MOB-04 web push (self:manage)
    },
    MessageService: { getMessages: M, replyMessage: M, markAsRead: M, deleteMessage: M, bulkDeleteMessages: M },
    TicketService: { getTickets: M, openTicket: M, sendTicketMessage: M, closeTicket: M },
    SmartService: { unifiedSearch: M },

    // --- ADR-0020 Karar 6 (Aşama B): entegrasyon/motor ayar yönetimi (tümü platformAdmin; FE Aşama C'de gelir, BACKEND_ONLY_NOT_YET_IN_FE) ---
    IntegrationConfigService: {
        list: P, get: P, history: P,
        // faz4-fix c97ec68: FE dinamik cagrisinin bagi eksikti (403); get() ile ayni metot
        getEffectiveConfig: P,
        getCatalog: P,
        saveDraft: P, discardDraft: P, previewPublish: P, publish: P, rollback: P, takeOverLock: P, testEndpoint: P,
        // ADR-0020 Karar 3.8/5 (Aşama D)
        proposeFromFinding: P, setIntake: P,
    },

    // --- ADR-0018 Karar 2/4 (Aşama B): entegrasyon uyum bulguları (tümü platformAdmin; FE ayrı görevde, BACKEND_ONLY_NOT_YET_IN_FE) ---
    IntegrationComplianceService: {
        list: P, get: P, summary: P, getDetail: P, transition: P,
    },

    // --- ADR-0026 WP-LOG L2: backoffice log kontrol merkezi + denetim (yalnız /admin-api; tümü platformAdmin) ---
    BackofficeLogService: { list: P, issueGroups: P, issueTrend: P, trace: P, volume: P },
    BackofficeErrorService: { setStatus: P },
    BackofficeAuditService: { list: P },
    // B12: platform yöneticisi yönetimi (invite/disable/enable/resetMfa step-up ister)
    BackofficeAdminUserService: { list: P, invite: P, disable: P, enable: P, resetMfa: P },
    // B2/B4: abonelik + gelir + tenant yaşam döngüsü (yazmalar step-up ister)
    BackofficeBillingService: { listSubscriptions: P, getSubscription: P, extendTrial: P, cancelSubscription: P, changePlan: P, getRevenueMetrics: P },
    BackofficeTenantService: { getLifecycle: P, cancelDeletion: P, listTenants: P, getHealthSummary: P },
    // K51 (BO1) + BE-05: kayıtlı görünümler (yönetici başına)
    BackofficePrefsService: { listViews: P, saveView: P, deleteView: P, getPushConfig: P, subscribePush: P, unsubscribePush: P },
    // B5/B6/B8/B9: entegrasyon sağlığı + altyapı gözlemi + cache (flushCacheFamily step-up ister)
    BackofficeIntegrationService: { getApiHealth: P, getResilienceState: P },
    // ADR-0029 NB7/NB8: tenant duyuru bandi (member) + backoffice bildirim/duyuru/uyari (yazmalar step-up ister)
    AnnouncementService: { getActive: M },
    BackofficeNotificationService: {
        listAnnouncements: P, getAnnouncement: P, createAnnouncement: P, updateAnnouncement: P, scheduleAnnouncement: P, cancelAnnouncement: P, previewAnnouncement: P,
        getDeliveryStats: P, listDeliveries: P, retryDelivery: P, discardDelivery: P, getTenantHistory: P, getCatalog: P, previewTemplate: P, sendTestEmail: P,
        listAlerts: P, muteAlert: P,
    },
    BackofficeInfraService: { getRedisStatus: P, getMongoStatus: P, getMongoCollections: P, getSlowQueries: P, getCacheMetrics: P, flushCacheFamily: P },
    // B1/B7: genel bakış + motor ve kuyruklar (retry/discard/release step-up ister)
    BackofficeOverviewService: { getHealth: P, getAttention: P, getPulse: P },
    BackofficeEngineService: { getQueues: P, listFailedJobs: P, retryJob: P, retryJobs: P, discardJob: P, getStateMachineJobs: P, releaseStuckLease: P, listJobRuns: P },

    // --- Entegrasyonlar ---
    IntegrationService: {
        // okuma
        get: M, getCatalog: M, getClientIntegrations: M, integrationTypes: M, retrievePlatformInfos: M,
        retrieveClientECommerceSettings: M, retrieveClientErpSettings: M, retrieveClientMarketplaceSettings: M,
        retrieveClientShipmentSettings: M,
        retrieveCommisionForCategoryFromIntegration: M, retrieveCategoriesFromIntegration: M,
        retrieveBrandsFromIntegration: M, retrieveCategoryAttributesFromIntegration: M,
        retrieveCategoryAttributeValuesFromIntegration: M,
        getExportJobDetail: M, advancedSearchExportJobs: M, getExportJobs: M, getImportJobs: M,
        getImportJobByJobId: M, getJobReport: M,
        // günlük operasyon
        savePlatformUploadIsReadyForProduct: M, saveOrUpdateIntegrationBrand: M, sortClientMarketplaces: M,
        requestFetchFromPlatform: M, archiveImportJobs: M, batchCreator: M,
        // entegrasyon kimlik bilgisi / yapılandırma yazma
        saveClientErpSettings: A, saveClientMarketplaceSettings: A, saveClientShipmentSettings: A,
        saveClientECommerceSettings: A, retrieveAndSetExternalToken: A,
        // [ADR-0005 Karar 8] webhook token üretme/rotasyon (admin — henüz FE'de çağrılmıyor, BACKEND_ONLY_NOT_YET_IN_FE)
        generateWebhookToken: A,
        // [API_TENANT_SURFACE §1] stok politikası (ADR-0004): okuma + tenant birincil kanal + kanal başına doğrulamalı/birleştirmeli yazma
        // — hepsi admin+ (henüz FE'de çağrılmıyor, BACKEND_ONLY_NOT_YET_IN_FE)
        getStockPolicy: A, saveTenantStockPolicy: A, saveChannelStockPolicy: A,
        // [API_TENANT_SURFACE §3] kendi tenant'ının entegrasyon sağlığı (YALNIZCA okuma; sızdırmaz DTO). Hata ayrıntısı/devre kesici
        // operasyonel bilgi olduğundan admin+ (getSystemHealth'in tenant-kapsamlı karşılığı)
        getIntegrationHealth: A,
        // [INT-01] bağlantı testi (okuma, dış çağrı; integrations:manage => admin+; dakikada 3/tenant+entegrasyon)
        testConnection: A,
    },

    // --- Katalog ---
    ProductService: {
        getProducts: M, getProductStatistics: M, retrieveProduct: M, saveProduct: M, updateProduct: M,
        updateOnsale: M, deleteProduct: M, exportExcel: M,
    },
    VariantService: {
        getVariants: M, getVariantsList: M, addVariant: M, addVariants: M, updateVariants: M, deleteVariant: M,
        batchProcessUpdate: M, batchProcessDelete: M,
    },
    CategoryService: { get: M, addCategory: M, updateCategory: M, moveCategory: M, changeOrderCategory: M, deleteCategory: M },
    BrandService: { get: M, addBrand: M, updateBrand: M, deleteBrand: M, saveIntegrationBrand: M },
    ChoiceService: {
        get: M, addChoice: M, addPreparedChoice: M, updateChoice: M, removeChoice: M,
        addChoiceValue: M, updateChoiceValue: M, removeChoiceValue: M,
    },
    HashtagService: {
        get: M, addHashtag: M, updateHashtag: M, removeHashtag: M,
        addHashtagValue: M, updateHashtagValue: M, removeHashtagValue: M,
    },
    AttributeMappingService: {
        get: M, autoMatchAllCategories: M, getCategoryMapping: M, saveCategoryMapping: M,
        getAttributeMapping: M, saveAttributeMapping: M, saveAttributeValueMapping: M, deleteFullMapping: M,
    },
    ImageService: { assignImages: M, createUploadUrl: M, confirmUpload: M }, // ADR-0027: doğrudan yükleme (bilet+onay) genel RPC; eski görsel işlemleri ImageApi sözde-servisi üzerinden (aşağıda)

    // --- Sipariş / müşteri / iade / kargo / fatura / finans ---
    OrderService: {
        getOrders: M, getOrderDashboardInsights: M, getOrderRejectionReasons: M,
        approveOrder: M, bulkApproveOrder: M, cancelOrder: M, bulkCancelOrder: M,
        // §6: barkod basıldı işareti (yalnızca yerel bayrak + platformActions kaydı; dış yan etkisi yok). `updateOrderStatus` KASITLI
        // KAYITSIZ: doğrulamasız serbest statü yazımı, stok rezervasyon yaşam döngüsünü/pazaryerini atlar (bkz. OPERATION_POLICY.md).
        markAsPrinted: M,
    },
    CustomerService: {
        getCustomers: M, getCustomerDetail: M, updateCustomer: M,
        // ADR-0003 adım 8 (Karar F.23): son kullanıcı (tenant'ın müşterisi) silme talebi -> PII geri döndürülemez
        // maskeleme (fatura/sipariş SİLİNMEZ). Yıkıcı/hukuki nitelik -> admin kademesi.
        anonymizeCustomer: A,
    },
    // §6: getClaimById (tekil detay, salt-okunur). `updateClaimStatus` KASITLI KAYITSIZ (doğrulamasız serbest statü; approve/reject akışlarını atlar).
    ClaimService: { getClaims: M, getClaimById: M, approveClaim: M, bulkApproveClaim: M, rejectClaim: M },
    ShipmentService: { createShipment: M, bulkCreateShipment: M, getShipments: M /* §6: salt-okunur sayfalı liste */ },
    InvoiceService: {
        getInvoices: M, createInvoice: M, bulkCreateInvoice: M, createManualInvoice: M,
        resolveAndReissueInvoice: M, deleteInvoice: M,
    },
    // §6: finans özet/kargo faturası/ödeme emri dökümü — getTransactionData ile AYNI kademe ve aynı tenant DB'si (salt-okunur)
    FinancialService: { getTransactionData: M, getFinancialSummary: M, getCargoInvoices: M, getPayoutDetails: M, getOrderCommissionSummary: M, getCommissionByBarcodes: M, getNetRevenuePreview: M, getRealizedCommissionByCategory: M, listCommissionOverrides: M, setCommissionOverride: A, deleteCommissionOverride: A },

    // --- Abonelik/plan (ADR-0008 Aşama A + frontend SONUÇ) ---
    // getPlans/getMySubscription: her tenant kullanıcısı kendi abonelik durumunu görebilmeli
    // (SettingService.getSettings/MenuService.get ile AYNI kademe). startCheckout (plan
    // seçimi/değişimi -- faturaya yansıyan bir işlem) SettingService.updateSettings/
    // IntegrationService'in kimlik bilgisi YAZMA operasyonlarıyla AYNI gerekçeyle admin+.
    BillingService: { getPlans: M, getMySubscription: M, startCheckout: A },

    // --- Tenant-yüzlü yeni uçlar (docs/API_TENANT_SURFACE.md; FE ekranları ADR-0015 sonrası) ---
    // §2 stok sağlığı özeti (OVERSOLD/UNMAPPED, rezervasyon toplamları): operatörün günlük görünürlüğü -> member (getOrders ile aynı)
    StockService: { getStockOverview: M, listLowStock: M, listMovements: M, getPublishLagSummary: A },
    // §4 denetim günlüğü: kim-ne-zaman kaydı yönetim bilgisidir -> admin+ (owner dahil); yalnızca kendi tenant'ı
    AuditService: { getAuditLogs: A },

    // --- Sözde-servis: ImageApiManager rotaları (ADR Karar 9). Genel RPC ile ÇAĞRILAMAZ; yalnızca runImageApi ile. ---
    ImageApi: {
        upload: M, getImages: M, deleteImage: M, deleteImageSelected: M, sortImages: M,
        // getImage/downloadImage KAYITTA YOK: ImageApiManager rotaları var ama ImageService.getImage metodu HİÇ yok (bugün de 500
        // "Operation not implemented"; ölü kayıt olmaz). Metot yazılırsa buraya + IMAGE_API_TARGETS'a eklenmeli (bkz. IMAGE_API_ROUTES_WITHOUT_BACKEND).
        uploadIdentity: A, // kiracı logosu/kimliği = ayar niteliğinde (SettingService.updateSettings ile aynı kademe)
    },
};

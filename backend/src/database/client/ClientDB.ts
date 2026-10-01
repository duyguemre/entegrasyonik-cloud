import { IClientDB } from "@interfaces/index";
import getModels from './ClientMongooseSchemas';
import { IDatabase } from "../Database";
import { isAllowedTenantDbName, TenantDbRecord } from "../tenantConnection";
import { getRootDatabase } from "../rootConnection";
import { getTenantRegistry } from "../TenantRegistry";

/**
 * ADR-0024 D2 (ADR-0016 §5.2'nin ClientDB kısmının yerine): tenant tutamakları TEK kök bağlantıdan `useDb` ile türetilir.
 * `Map<dbname, ClientDB>`: LRU/dispose/initPromises yok — tahliye edilecek bağlantı yok, uçuştaki sorgu asla kopmaz.
 * `Clients.dbConfig.poolsize` OKUNMAZ (bilgi amaçlı; havuz tek yerde: DB_POOL_SIZE). Anahtar dbname (izinli ad kapısından geçer).
 */
export class TenantDbClosingError extends Error {
    constructor() { super('[ClientDB] Kapanış başladı: yeni tenant bağlantısı açılamaz.'); this.name = 'TenantDbClosingError'; }
}

export default class ClientDB implements IClientDB {
    private static handles = new Map<string, ClientDB>();
    private static idToDbname = new Map<string, string>(); // invalidate(_id) için
    private static pending = new Map<string, Promise<ClientDB>>();
    private static closing = false;

    private database!: IDatabase;

    private constructor() { }

    /** Kapanış bayrağı: true iken `getInstance` reddeder. */
    public static beginShutdown(): void { ClientDB.closing = true; }
    public static isClosing(): boolean { return ClientDB.closing; }

    /** Açık tenant tutamağı sayısı (gözlem/test). */
    public static get size(): number { return ClientDB.handles.size; }

    /** Tutamakları bırakır: uçuş içi açılışları bekler, bağlantıyı KAPATMAZ (kök bağlantıyı DatabaseManager.close kapatır). */
    public static async closeAll(): Promise<void> {
        ClientDB.closing = true;
        await Promise.allSettled([...ClientDB.pending.values()]);
        ClientDB.handles.clear();
        ClientDB.idToDbname.clear();
    }

    /** Yalnız test: kapanış durumunu ve önbelleği sıfırlar. */
    public static resetForTests(): void {
        ClientDB.closing = false;
        ClientDB.handles.clear(); ClientDB.idToDbname.clear(); ClientDB.pending.clear();
    }

    // ADR-0003: `client.dbConfig` yalnızca dbname taşır (poolsize okunmaz); bağlantı bilgisi env'den (kök bağlantı).
    public static async getInstance(client: TenantDbRecord & { _id: string }): Promise<ClientDB> {
        if (ClientDB.closing) throw new TenantDbClosingError();
        const dbname = client?.dbConfig?.dbname;
        if (!isAllowedTenantDbName(dbname)) throw new Error('[TenantDb] Tenant kaydında geçerli ve izinli bir dbConfig.dbname yok.');

        const live = ClientDB.handles.get(dbname);
        if (live) { ClientDB.idToDbname.set(String(client._id), dbname); return live; }
        const inflight = ClientDB.pending.get(dbname);
        if (inflight) return inflight;

        const p = (async () => {
            const root = await getRootDatabase();
            if (ClientDB.closing) throw new TenantDbClosingError();
            const instance = new ClientDB();
            instance.database = root.useDb(dbname, getModels);
            ClientDB.handles.set(dbname, instance);
            ClientDB.idToDbname.set(String(client._id), dbname);
            return instance;
        })();
        ClientDB.pending.set(dbname, p);
        const cleanup = () => { if (ClientDB.pending.get(dbname) === p) ClientDB.pending.delete(dbname); };
        p.then(cleanup, cleanup);
        return p;
    }

    /** ADR-0021 D8 / DB-08: yeni tenant provizyonu adımı — tüm tenant modellerinin şema indeksleri (autoIndex kapalıyken de) kurulur. Idempotent. */
    public async ensureIndexes(): Promise<void> { await this.database.ensureIndexes?.(); }

    // --- Model Erişim Metotları ---

    public getPlatformProcessModel() { return this.database.getModel('platform_process'); }
    public getPlatformProcessProductModel() { return this.database.getModel('platform_process_product'); }
    public getIntegrationCategoryModel() { return this.database.getModel('integration_category'); }
    public getIntegrationBrandModel() { return this.database.getModel('integration_brand'); }
    public getHashtagModel() { return this.database.getModel('hashtag'); }
    public getCategoryModel() { return this.database.getModel('category'); }
    public getClaimModel() { return this.database.getModel('claim'); }
    public getBrandModel() { return this.database.getModel('brand'); }
    public getChoiceModel() { return this.database.getModel('choice'); }
    public getProductModel() { return this.database.getModel('product'); }
    public getVariantModel() { return this.database.getModel('variant'); }
    public getImageModel() { return this.database.getModel('image'); }
    public getOrderModel() { return this.database.getModel('order'); }
    public getCustomerModel() { return this.database.getModel('customer'); }
    public getRoleModel() { return this.database.getModel('role'); }
    public getSettingModel() { return this.database.getModel('setting'); }
    public getFavoriteModel() { return this.database.getModel('favorite'); }
    public getInvoiceModel() { return this.database.getModel('invoice'); }
    public getCounterModel() { return this.database.getModel('counter'); }
    public getClientIntegrationModel() { return this.database.getModel('client_integration'); }
    public getStatisticsModel() { return this.database.getModel('statistics'); }
    public getAttributeMappingModel() { return this.database.getModel('attribute_mapping'); }
    public getNotificationModel() { return this.database.getModel('notification'); }
    public getExportStagedProductModel() { return this.database.getModel('export_staged_product'); }
    public getImportStagedProductModel() { return this.database.getModel('import_staged_product'); }
    public getImportStagedProductSummaryModel() { return this.database.getModel('import_staged_product_summary'); }
    public getImportJobReportModel() { return this.database.getModel('import_job_report'); }
    public getMessageModel() { return this.database.getModel('message'); }
    public getUserModel() { return this.database.getModel('user'); }
    public getFinancialTransactionModel() { return this.database.getModel('financial_transaction'); }
    public getIdempotencyKeyModel() { return this.database.getModel('idempotency_key'); }
    public getStockMovementModel() { return this.database.getModel('stock_movement'); }
    public getCommissionOverrideModel() { return this.database.getModel('commission_override'); }
    public getBuyboxSnapshotModel() { return this.database.getModel('buybox_snapshot'); }
    public getCargoInvoiceModel() { return this.database.getModel('cargo_invoice'); }

    /** ADR-0003 adım 8 (purge): tenant veritabanını KALICI olarak siler (geri dönüşsüz). Yalnızca purge işinden çağrılır. */
    public async dropDatabase(): Promise<void> {
        await this.database.dropDatabase();
    }

    /**
     * ADR-0003 adım 8 (purge) / askı: tenant tutamağını `Map`'ten ve TenantRegistry'den kaldırır (idempotent). Bağlantı KAPANMAZ
     * (paylaşılan istemci); uçuştaki sorgular etkilenmez. `clientId` = `Clients._id`.
     */
    public static async invalidate(clientId: string): Promise<void> {
        const id = String(clientId);
        const dbname = ClientDB.idToDbname.get(id);
        if (dbname) ClientDB.handles.delete(dbname);
        ClientDB.idToDbname.delete(id);
        getTenantRegistry().invalidateById(id);
    }

}

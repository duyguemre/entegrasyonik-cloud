import { LRUCache } from 'lru-cache';
import { DBConfig, IClientDB } from "@interfaces/index";
import getModels from './ClientMongooseSchemas';
import { IDatabase } from "../Database";
import Database from "../Database";
import { buildTenantDbConfig, TenantDbRecord } from "../tenantConnection";

export default class ClientDB implements IClientDB {
    // 1. KURAL: Canlı bağlantıları burada tutmalıyız
    private static instances: Record<string, ClientDB> = {};

    public static cache = new LRUCache<string, ClientDB>({
        max: 100,
        dispose: (value: ClientDB, key: string) => {
            if (value && value.database) {
                // Bellekten atılırken hem DB'yi kapat hem de instances'tan sil
                value.database.close().catch(() => { });
                delete ClientDB.instances[key]; // <--- KRİTİK
                console.log(`[LRU] Evicted: ${key}`);
            }
        }
    });

    private static initPromises: Record<string, Promise<ClientDB> | undefined> = {};
    private database!: IDatabase;

    private constructor() { }

    // ADR-0003 adım 5: `client.dbConfig` yalnızca dbname/poolsize taşır; bağlantı bilgisi env'den kurulur (tenantConnection.ts).
    public static async getInstance(client: TenantDbRecord & { _id: string }): Promise<ClientDB> {
        const clientId = client._id;

        // A. ÖNCE CANLI INSTANCE KONTROLÜ (En hızlı yol)
        if (ClientDB.instances[clientId]) {
            // LRU'da yerini güncelle (en yeniye taşı)
            ClientDB.cache.get(clientId);
            return ClientDB.instances[clientId];
        }

        // B. DEVAM EDEN PROMISE KONTROLÜ (Yarış engelleme)
        if (ClientDB.initPromises[clientId]) {
            return ClientDB.initPromises[clientId]!;
        }

        // C. SIFIRDAN BAĞLANTI
        const initPromise = (async () => {
            try {
                const instance = new ClientDB();
                await instance.init(buildTenantDbConfig(client));

                // Hem cache'e hem de instances'a ekle
                ClientDB.instances[clientId] = instance;
                ClientDB.cache.set(clientId, instance);

                return instance;
            } catch (error) {
                delete ClientDB.initPromises[clientId];
                throw error;
            } finally {
                delete ClientDB.initPromises[clientId];
            }
        })();

        ClientDB.initPromises[clientId] = initPromise;
        // ADR-0003 adım 5: yapılandırma hatası (ör. DB_URL yok) IIFE içinde SENKRON fırlar; IIFE'nin finally'si bu satırdan ÖNCE çalıştığından
        // reddedilmiş söz initPromises'te takılı kalırdı (sonraki tüm çağrılar aynı hatayı alırdı). Temizlik atamadan SONRA da yapılır.
        const cleanup = () => { if (ClientDB.initPromises[clientId] === initPromise) delete ClientDB.initPromises[clientId]; };
        initPromise.then(cleanup, cleanup);
        return initPromise;
    }

    private async init(config: DBConfig) {
        if (!this.database) {
            this.database = await Database.getInstance(config, getModels);
        }
    }

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
    public getCargoInvoiceModel() { return this.database.getModel('cargo_invoice'); }

    /** ADR-0003 adım 8 (purge): tenant veritabanını KALICI olarak siler (geri dönüşsüz). Yalnızca purge işinden çağrılır. */
    public async dropDatabase(): Promise<void> {
        await this.database.dropDatabase();
    }

    /**
     * ADR-0003 adım 8 (purge): LRU önbelleğinden ve canlı-instance haritasından tenant'ı KESİN olarak kaldırır
     * (bağlantıyı da kapatır). `cache.delete` zaten `dispose` tetikler (close + instances temizliği) ama purge
     * sonrası tutarlılık için burada da açıkça kapatılır/silinir (idempotent — instance yoksa no-op).
     */
    public static async invalidate(clientId: string): Promise<void> {
        // cache.delete tetiklediği `dispose` zaten bağlantıyı kapatır (best-effort, hatayı yutar) ve instances'tan siler.
        ClientDB.cache.delete(clientId);
        delete ClientDB.instances[clientId]; // dispose koşulu (value.database) sağlanmazsa (ör. init edilmemiş) da temiz kalsın
    }

}
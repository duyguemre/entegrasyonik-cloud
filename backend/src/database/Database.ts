import mongoose, { Connection, Document } from "mongoose";
import { DBConfig } from "@interfaces/index";
import { config } from "@config";
import { installSlowQueryPlugin, setSlowQueryAppDbName } from "@platform/runtime/metrics/slowQueryPlugin";

// [BO B8d] Yavaş sorgu eklentisi: model derlenmeden önce (modül yüklenince) bir kez; eşik/kapsam slowQueryPlugin.ts.
installSlowQueryPlugin(mongoose);

export interface IDatabase {
    getModel<T extends Document>(modelName: string): mongoose.Model<T>;
    close(): Promise<void>; // Bağlantıyı kapatmak için gerekli
    /** ADR-0003 adım 8 (purge): tenant veritabanını KALICI olarak siler. Geri dönüşsüz — yalnızca purge işinden çağrılır. */
    dropDatabase(): Promise<void>;
    /** ADR-0006 Karar 5 (/ready): MEVCUT bağlantı üzerinden `ping`; YENİ bağlantı AÇMAZ. Bağlantı yoksa/hazır değilse `false`. */
    ping(): Promise<boolean>;
    /** ADR-0021 D8 / DB-08: bu bağlantıdaki TÜM modellerin şema indekslerini kurar (autoIndex kapalıyken yeni tenant provizyonu için). Opsiyonel: sahte uygulamalar bırakabilir. */
    ensureIndexes?(): Promise<void>;
}

type GetModels = (connection: Connection) => Record<string, mongoose.Model<Document>>;

/** ADR-0024 D2: kök bağlantı havuz ayarları (tek yerde). `maxPoolSize` DBConfig.poolsize'dan (DB_POOL_SIZE) gelir. */
export const ROOT_POOL_OPTIONS = { connectTimeoutMS: 10000, maxIdleTimeMS: 60000, waitQueueTimeoutMS: 10000 } as const;

/**
 * ADR-0024 D2: süreç başına TEK kök bağlantı (MongoClient). `Database.getInstance` kökü açar (uygulama DB'si);
 * `root.useDb(dbname, getModels)` aynı istemci/havuz üzerinde tenant DB tutamağı döner (modeller tutamakta BİR kez derlenir).
 * Tenant tutamağının `close()`'u bağlantıyı KAPATMAZ (yalnız kök kapanır) — uçuştaki sorgular tahliyeden etkilenmez.
 */
export default class Database implements IDatabase {
    private models!: Record<string, mongoose.Model<Document>>;
    private connection?: Connection;
    private root?: Database; // tenant tutamağıysa kökün kendisi

    private constructor(
        private config: DBConfig,
        private getModels: GetModels
    ) { }

    /**
     * Aynı kök bağlantıda `dbname` için tutamak (useDb, useCache: true). Model derlemesi tutamak başına bir kez yapılır;
     * çağıran (ClientDB) tutamağı önbelleğe alır. Yeni ağ bağlantısı/havuz AÇMAZ.
     */
    public useDb(dbname: string, getModels: GetModels): Database {
        const rootConn = this.root?.connection ?? this.connection;
        if (!rootConn) throw new Error('[Database] useDb: kök bağlantı kurulmamış.');
        const handle = new Database({ ...this.config, dbname }, getModels);
        handle.root = this.root ?? this;
        handle.connection = rootConn.useDb(dbname, { useCache: true });
        handle.models = getModels(handle.connection);
        return handle;
    }

    /** ADR-0024 D2: havuz/CMAP olay kancası (örn. `connectionCheckOutFailed`). Yalnız kök bağlantıda anlamlıdır; kaldırıcı döner. */
    public onPoolEvent(event: string, listener: (...args: any[]) => void): () => void {
        const client: any = (this.root ?? this).connection?.getClient?.();
        if (!client?.on) return () => undefined;
        client.on(event, listener);
        return () => client.off?.(event, listener);
    }

    public static async getInstance(
        config: DBConfig,
        getModels: GetModels
    ): Promise<Database> {
        const instance = new Database(config, getModels);
        await instance.connect();
        return instance;
    }

    private createConnectionString(): string {
        // Parametreleri güvenli bir şekilde encode ederek URL'i oluşturuyoruz
        const encodedUser = encodeURIComponent(this.config.user);
        const encodedPassword = encodeURIComponent(this.config.password);

        return this.config.url
            .replace("{{USER}}", encodedUser)
            .replace("{{PASSWORD}}", encodedPassword)
            .replace("{{DBNAME}}", this.config.dbname);
    }

    private async connect(): Promise<void> {
        const connectionString = this.createConnectionString();
        // Loglarda dükkan adını görmek için bir etiket oluşturuyoruz
        const dbIdentifier = `[\x1b[32mDB: ${this.config.dbname}\x1b[0m]`;

        if (!this.root) setSlowQueryAppDbName(this.config.dbname);
        this.connection = mongoose.createConnection(connectionString, {
            maxPoolSize: this.config.poolsize || 5,
            ...ROOT_POOL_OPTIONS,
            // ADR-0021 D8 / DB-08: `DB_AUTO_INDEX` (varsayılan: local açık, staging/production kapalı). Açıkken mongoose varsayılanı (true)
            // korunur => seçenek geçilmez; tenant tutamakları (`useDb`) kök bağlantının ayarını devralır. Şema düzeyi `autoIndex:false` her zaman önceliklidir.
            ...(config.db.autoIndex ? {} : { autoIndex: false }),
        });
        const conn = this.connection;
        conn.on('error', (err) => console.error(`${dbIdentifier} Connection error:`, err.message));
        conn.on('disconnected', () => console.log(`${dbIdentifier} Disconnected.`));

        await conn.asPromise();
        this.models = this.getModels(conn);
        console.log(`${dbIdentifier} Connected successfully.`);
    }

    /**
     * Kök bağlantıyı kapatır (gerçek `close()` promise'i). Tenant tutamağında NO-OP: paylaşılan istemciyi kapatmaz.
     */
    public async close(): Promise<void> {
        if (this.root) return;
        if (this.connection) {
            await this.connection.close();
        }
    }

    /** ADR-0003 adım 8 (purge): tenant veritabanını KALICI olarak siler (geri dönüşsüz). Bağlantı yoksa no-op değildir; hata fırlatır. */
    public async ensureIndexes(): Promise<void> {
        await Promise.all(Object.values(this.models ?? {}).map((m) => m.createIndexes()));
    }

    public async dropDatabase(): Promise<void> {
        if (!this.connection) {
            throw new Error(`[DB: ${this.config.dbname}] dropDatabase: bağlantı kurulmamış.`);
        }
        await this.connection.dropDatabase();
    }

    /**
     * ADR-0006 Karar 5: `/ready` için MEVCUT bağlantı üzerinden `ping`. Yeni bağlantı AÇMAZ; bağlantı yoksa
     * veya hazır (readyState 1 = connected) değilse `false` döner. Hata (ör. ağ kesintisi) yakalanır, fırlatılmaz.
     */
    public async ping(): Promise<boolean> {
        const conn = (this.root ?? this).connection; // ADR-0024 D2: ping kök bağlantıda
        if (!conn || conn.readyState !== 1 || !conn.db) return false;
        try {
            await conn.db.admin().ping();
            return true;
        } catch {
            return false;
        }
    }

    /** [BO B8] Salt-okuma gözlem araçları (backoffice altyapı uçları) için ham bağlantı; tenant tutamağında kök bağlantıyı döner. */
    public getConnection(): Connection | undefined { return (this.root ?? this).connection; }

    public getModel(modelName: string): any {
        const model = this.models[modelName];
        if (!model) {
            throw new Error(`[\x1b[31mDB: ${this.config.dbname}\x1b[0m] Model not found: ${modelName}`);
        }
        return model;
    }
}
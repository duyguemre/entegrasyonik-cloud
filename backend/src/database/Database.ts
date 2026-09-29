import mongoose, { Connection, Document } from "mongoose";
import { DBConfig } from "@interfaces/index";

export interface IDatabase {
    getModel<T extends Document>(modelName: string): mongoose.Model<T>;
    close(): Promise<void>; // Bağlantıyı kapatmak için gerekli
    /** ADR-0003 adım 8 (purge): tenant veritabanını KALICI olarak siler. Geri dönüşsüz — yalnızca purge işinden çağrılır. */
    dropDatabase(): Promise<void>;
    /** ADR-0006 Karar 5 (/ready): MEVCUT bağlantı üzerinden `ping`; YENİ bağlantı AÇMAZ. Bağlantı yoksa/hazır değilse `false`. */
    ping(): Promise<boolean>;
}

export default class Database implements IDatabase {
    private models!: Record<string, mongoose.Model<Document>>;
    private connection?: Connection;

    private constructor(
        private config: DBConfig,
        private getModels: (connection: Connection) => Record<string, mongoose.Model<Document>>
    ) { }

    public static async getInstance(
        config: DBConfig,
        getModels: (connection: Connection) => Record<string, mongoose.Model<Document>>
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

        this.connection = mongoose.createConnection(connectionString, {
            maxPoolSize: this.config.poolsize || 5, // Havuz boyutunu kontrol et
            connectTimeoutMS: 10000, // 10 saniye içinde bağlanamazsa hata ver
        });

        return new Promise<void>((resolve, reject) => {
            this.connection?.on('connected', () => {
                this.models = this.getModels(this.connection as Connection);
                console.log(`${dbIdentifier} Connected successfully.`);
                resolve();
            });

            this.connection?.on('error', (err) => {
                console.error(`${dbIdentifier} Connection error:`, err.message);
                reject(err);
            });

            this.connection?.on('disconnected', () => {
                console.log(`${dbIdentifier} Disconnected.`);
            });
        });
    }

    /**
     * LRU Cache tarafından çağrılacak olan kapatma metodu.
     * Atlas ve Railway kaynaklarını serbest bırakmak için kritik.
     */
    public async close(): Promise<void> {
        if (this.connection) {
            await this.connection.close();
        }
    }

    /** ADR-0003 adım 8 (purge): tenant veritabanını KALICI olarak siler (geri dönüşsüz). Bağlantı yoksa no-op değildir; hata fırlatır. */
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
        if (!this.connection || this.connection.readyState !== 1 || !this.connection.db) return false;
        try {
            await this.connection.db.admin().ping();
            return true;
        } catch {
            return false;
        }
    }

    public getModel(modelName: string): any {
        const model = this.models[modelName];
        if (!model) {
            throw new Error(`[\x1b[31mDB: ${this.config.dbname}\x1b[0m] Model not found: ${modelName}`);
        }
        return model;
    }
}
import { IApplicationDB } from "@interfaces/index";
import ClientDB from "./client/ClientDB";
import ApplicationDB from "./application/ApplicationDB";
import { config } from "@config";

export interface IDatabaseManager {
    getApplicationDB(): Promise<IApplicationDB>;
    getClientDB(clientId: number): Promise<ClientDB | undefined>;
}

class DatabaseManager implements IDatabaseManager {
    public async getApplicationDB(): Promise<IApplicationDB> {
        return await ApplicationDB.getInstance(this.getAppDbConfig())
    }


    private getAppDbConfig() {
        // Eğer .env'de bu değerler yoksa boş string atayarak undefined hatasını engelliyoruz
        // veya '!' operatörü ile TS'e "bu değerler kesin var" diyoruz.
        return {
            url: config.db.url ?? "",
            user: config.db.user ?? "",
            password: config.db.password ?? "",
            dbname: config.db.name ?? "",
            poolsize: config.db.poolSize
        };
    }

    public async closeAllConnections(): Promise<void> {
        console.log("[DatabaseManager] Shutdown sequence started...");

        // 1. Client (Dükkan) bağlantılarını kapat
        // cache.clear() tetiklendiğinde her dükkan için dispose -> database.close() çalışır.
        ClientDB.cache.clear();
        console.log("[ClientDB] LRU Cache cleared, client connections closing...");

        // 2. Application (Ana) DB bağlantısını kapat
        try {
            // config parametresine erişimin olduğunu varsayıyorum (veya getInstance içinde config gerekmiyorsa)
            const appDB = await ApplicationDB.getInstance(this.getAppDbConfig());
            await appDB.close();
        } catch (err) {
            console.error("[ApplicationDB] Close error:", err);
        }

        // 3. Bağlantıların Atlas tarafında tamamen düşmesi için kısa bir bekleme
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log("[DatabaseManager] All connections are terminated.");
    }


    public async getClientDB(clientId: number): Promise<ClientDB | undefined> {
        if (!clientId) {
            throw new Error("[DatabaseManager] Client ID is required");
        }
        const applicationDB = await this.getApplicationDB()
        const client: any = await applicationDB.getClientModel().findOne({ order: clientId }).lean()
        if (client) {
            return await ClientDB.getInstance(client)
        }
        return undefined
    }
}

export const DatabaseManagerInstance = new DatabaseManager()


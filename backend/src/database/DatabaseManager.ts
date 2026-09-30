import { IApplicationDB } from "@interfaces/index";
import ClientDB from "./client/ClientDB";
import ApplicationDB from "./application/ApplicationDB";
import { getAppDbConfig } from "./rootConnection";
import { getTenantRegistry, resetTenantRegistryForTests, TenantEntry } from "./TenantRegistry";

export interface IDatabaseManager {
    getApplicationDB(): Promise<IApplicationDB>;
    getClientDB(clientId: number): Promise<ClientDB | undefined>;
}

class DatabaseManager implements IDatabaseManager {
    private closing = false;
    private closePromise?: Promise<void>;

    public async getApplicationDB(): Promise<IApplicationDB> {
        if (this.closing) throw new Error("[DatabaseManager] Kapanış başladı: yeni bağlantı açılamaz.");
        return await ApplicationDB.getInstance(getAppDbConfig())
    }

    /** ADR-0024 D1: tenant kaydı (status dahil) — TenantRegistry (TTL 30 sn önbellek). Kayıt yoksa undefined. */
    public async getTenant(order: number): Promise<TenantEntry | undefined> {
        if (!order) throw new Error("[DatabaseManager] Client ID is required");
        if (this.closing) throw new Error("[DatabaseManager] Kapanış başladı: yeni bağlantı açılamaz.");
        return getTenantRegistry().get(order);
    }

    public async getClientDB(clientId: number): Promise<ClientDB | undefined> {
        if (!clientId) {
            throw new Error("[DatabaseManager] Client ID is required");
        }
        const tenant = await this.getTenant(clientId);
        if (!tenant) return undefined;
        return await this.getClientDBForTenant(tenant);
    }

    /** ADR-0024 P1-CORE: tenant kaydı zaten çözülmüşse (authenticate → ctx.tenant) kayıt defterine tekrar gitmeden bağlantıyı verir. */
    public async getClientDBForTenant(tenant: TenantEntry): Promise<ClientDB> {
        if (this.closing) throw new Error("[DatabaseManager] Kapanış başladı: yeni bağlantı açılamaz.");
        return await ClientDB.getInstance({ _id: tenant._id, dbConfig: { dbname: tenant.dbname } });
    }

    /** Clients.status/kayıt değişimlerinden sonra TenantRegistry girdisini düşürür (aynı pod'da anında). */
    public invalidateTenant(order: number): void { getTenantRegistry().invalidate(order); }

    /**
     * Kapanış başlangıcı (idempotent): bundan sonra getApplicationDB/getTenant/getClientDB REDDEDİLİR (kapanışta yeni bağlantı açılmaz).
     * P0-LIFE `shutdown.ts` HTTP kapanışından önce çağırabilir; `close()` zaten çağırır.
     */
    public beginShutdown(): void {
        this.closing = true;
        ClientDB.beginShutdown();
    }

    public isClosing(): boolean { return this.closing; }

    /**
     * Tek kök bağlantıyı gerçekten kapatır (sabit bekleme YOK; `close()` promise'i beklenir). Idempotent (aynı promise).
     * Tenant tutamakları bırakılır (ClientDB.closeAll), TenantRegistry temizlenir; kapanışta HİÇ yeni bağlantı açılmaz.
     * Kapatma hatası fırlatılmaz (loglanır) — kapanış sırası devam etmeli.
     */
    public close(): Promise<void> {
        if (this.closePromise) return this.closePromise;
        this.beginShutdown();
        this.closePromise = (async () => {
            console.log("[DatabaseManager] Shutdown sequence started...");
            await ClientDB.closeAll();
            getTenantRegistry().clear();
            try {
                const app = await ApplicationDB.peek(); // yoksa AÇMAZ
                if (app) await app.close();
            } catch (err) {
                console.error("[ApplicationDB] Close error:", err);
            }
            console.log("[DatabaseManager] All connections are terminated.");
        })();
        return this.closePromise;
    }

    /** Eski ad (takma ad) — P0-LIFE `close()`'a geçene dek. */
    public closeAllConnections(): Promise<void> { return this.close(); }

    /** Yalnız test: kapanış durumunu ve önbellekleri sıfırlar. */
    public resetForTests(): void {
        this.closing = false; this.closePromise = undefined;
        ClientDB.resetForTests(); resetTenantRegistryForTests();
    }
}

export const DatabaseManagerInstance = new DatabaseManager()

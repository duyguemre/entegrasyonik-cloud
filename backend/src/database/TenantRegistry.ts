import { LRUCache } from 'lru-cache';
import { isAllowedTenantDbName } from './tenantConnection';
import ApplicationDB from './application/ApplicationDB';
import { getAppDbConfig } from './rootConnection';

/**
 * ADR-0024 D1: tenant kimliği (order) -> { status, dbname, _id } eşlemesinin TEK yeri. Kısa TTL'li (30 sn) önbellek;
 * askı/silme/purge işlemleri aynı pod'da `invalidate*` çağırır. Bulunamayan tenant ÖNBELLEĞE ALINMAZ.
 * Tenant kaydı yalnız `dbConfig.dbname` (izinli ad kontrolünden geçmeli) ve `status` taşır; bağlantı bilgisi env'den gelir (ADR-0003).
 */
export interface TenantEntry {
    order: number;
    _id: string;
    status?: string;
    dbname: string;
}

export type TenantLoader = (order: number) => Promise<any | null | undefined>;

export const TENANT_REGISTRY_TTL_MS = 30_000;

export class TenantRegistry {
    private cache: LRUCache<number, TenantEntry>;
    private inflight = new Map<number, Promise<TenantEntry | undefined>>();
    private epoch = 0; // invalidate sırasında uçuştaki yükleme sonucu önbelleğe yazılmasın

    constructor(private loader: TenantLoader, ttlMs: number = TENANT_REGISTRY_TTL_MS) {
        this.cache = new LRUCache<number, TenantEntry>({ max: 1000, ttl: ttlMs });
    }

    /** Kayıt yoksa undefined; kayıt var ama dbname geçersiz/izinsiz ise HATA (izolasyon ihlali sessiz geçilmez). */
    public async get(order: number): Promise<TenantEntry | undefined> {
        const hit = this.cache.get(order);
        if (hit) return hit;
        const pending = this.inflight.get(order);
        if (pending) return pending;

        const epoch = this.epoch;
        const p = (async () => {
            const rec = await this.loader(order);
            if (!rec) return undefined;
            const dbname = rec.dbConfig?.dbname;
            if (!isAllowedTenantDbName(dbname)) throw new Error('[TenantRegistry] Tenant kaydındaki dbname geçersiz veya izinli tenant DB adları dışında.');
            const entry: TenantEntry = { order: rec.order ?? order, _id: String(rec._id), status: rec.status, dbname };
            if (epoch === this.epoch) this.cache.set(order, entry);
            return entry;
        })();
        this.inflight.set(order, p);
        const done = () => { if (this.inflight.get(order) === p) this.inflight.delete(order); };
        p.then(done, done);
        return p;
    }

    public invalidate(order: number): void { this.cache.delete(order); this.inflight.delete(order); this.epoch++; }

    /** `Clients._id` ile geçersiz kıl (TenantLifecycleService/purge `ClientDB.invalidate(_id)` üzerinden). Silinen dbname'i döner. */
    public invalidateById(id: string): string | undefined {
        let dbname: string | undefined;
        for (const [order, e] of this.cache.entries()) {
            if (e._id === String(id)) { dbname = e.dbname; this.cache.delete(order); }
        }
        this.inflight.clear();
        this.epoch++;
        return dbname;
    }

    public clear(): void { this.cache.clear(); this.inflight.clear(); this.epoch++; }
}

let singleton: TenantRegistry | undefined;

/** Süreç-geneli tek kayıt defteri; yükleyici ApplicationDB'deki `Clients` koleksiyonunu `{ order }` ile okur (.lean()). */
export function getTenantRegistry(): TenantRegistry {
    if (!singleton) {
        singleton = new TenantRegistry(async (order) => {
            const applicationDB = await ApplicationDB.getInstance(getAppDbConfig());
            return applicationDB.getClientModel().findOne({ order }).lean();
        });
    }
    return singleton;
}

/** Yalnız test. */
export function resetTenantRegistryForTests(): void { singleton?.clear(); singleton = undefined; }

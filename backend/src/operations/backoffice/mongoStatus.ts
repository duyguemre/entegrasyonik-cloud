// [BO B8b/B8c] Mongo durumu ve koleksiyon istatistikleri (salt okuma). `listDatabases` ASLA çağrılmaz.
// DB adı kaynağı: uygulama DB'si (config.db.name) + `Clients.dbConfig.dbname`; her ikisi de CLAUDE.md kural 2'nin KESİN 7 adlık listesiyle KESİŞTİRİLİR.
// Listede olmayan ad ne listelenir ne okunur (yalnız sayaç: `skippedNotAllowlisted`). Tenant DB'leri "tenant #N" olarak görünür; ad dönmez.
// Belge içeriği dönmez: collStats/indexStats/dbStats sayaçları + indeks anahtar ALAN adları (partialFilterExpression değerleri atılır).
export const ALLOWED_DB_NAMES: ReadonlySet<string> = new Set([
    'entegrasyonik', 'entegrasyonik_client', 'entegrasyonik_client_2', 'entegrasyonik_client_24', 'entegrasyonik_client_25', 'entegrasyonikClient_1', 'entegrasyonikDB',
]);
export const isBackofficeDbAllowed = (name: unknown): name is string => typeof name === 'string' && ALLOWED_DB_NAMES.has(name);

export const MONGO_MAX_TIME_MS = 5000;
export const MAX_TENANT_DBS = 200;
export const MAX_COLLECTIONS = 200;

/** Yalnız gerekli yüzey (mongoose Connection alt kümesi) -- testte sahte verilir. */
export interface MongoConnLike {
    db?: { admin(): { command(c: Record<string, unknown>): Promise<any> } };
    useDb(name: string, opts?: { useCache?: boolean }): { db?: any };
}

export interface MongoStatusDeps {
    conn: MongoConnLike;
    appDbName: string | undefined;
    appPoolSize: number;
    openTenantHandles: number;
    clientModel: { find(f: any, p: any): any };
}

const pick = (o: any, keys: string[]) => Object.fromEntries(keys.map((k) => [k, typeof o?.[k] === 'number' ? o[k] : null]));

/** İzinli tenant hedefleri: `[{ tenantId, dbname }]`; izinli olmayan adlar sayılır, dönmez. */
export async function resolveTenantDbs(clientModel: MongoStatusDeps['clientModel']): Promise<{ tenants: Array<{ tenantId: number; dbname: string }>; skipped: number }> {
    const rows: any[] = await clientModel.find({}, { clientId: 1, 'dbConfig.dbname': 1, _id: 0 }).limit(MAX_TENANT_DBS).maxTimeMS(MONGO_MAX_TIME_MS).lean();
    const tenants: Array<{ tenantId: number; dbname: string }> = [];
    let skipped = 0;
    for (const r of rows) {
        const dbname = r?.dbConfig?.dbname;
        if (isBackofficeDbAllowed(dbname) && Number.isInteger(r.clientId)) tenants.push({ tenantId: r.clientId, dbname });
        else skipped++;
    }
    return { tenants, skipped };
}

async function dbStats(conn: MongoConnLike, dbname: string) {
    try {
        const db: any = conn.useDb(dbname, { useCache: true }).db;
        const s = await db.command({ dbStats: 1, maxTimeMS: MONGO_MAX_TIME_MS });
        return { available: true, ...pick(s, ['collections', 'views', 'objects', 'avgObjSize', 'dataSize', 'storageSize', 'indexes', 'indexSize', 'totalSize']) };
    } catch { return { available: false }; }
}

export async function getMongoStatus(deps: MongoStatusDeps) {
    let server: Record<string, unknown> | null = null;
    try {
        const s = await deps.conn.db!.admin().command({ serverStatus: 1, repl: 0, metrics: 0, locks: 0, asserts: 0, maxTimeMS: MONGO_MAX_TIME_MS });
        const wt = s?.wiredTiger?.cache ?? {};
        const used = wt['bytes currently in the cache'], max = wt['maximum bytes configured'];
        server = {
            version: typeof s?.version === 'string' ? s.version : null,
            uptimeSeconds: typeof s?.uptime === 'number' ? s.uptime : null,
            connections: pick(s?.connections, ['current', 'available', 'totalCreated']),
            opcounters: pick(s?.opcounters, ['insert', 'query', 'update', 'delete', 'getmore', 'command']),
            cache: { usedBytes: typeof used === 'number' ? used : null, maxBytes: typeof max === 'number' ? max : null, dirtyBytes: typeof wt['tracked dirty bytes in the cache'] === 'number' ? wt['tracked dirty bytes in the cache'] : null,
                fillRatio: typeof used === 'number' && typeof max === 'number' && max > 0 ? Math.round((used / max) * 10000) / 10000 : null },
        };
    } catch { server = null; } // serverStatus yetkisi yoksa (clusterMonitor) bölüm boş: FE "yetki yok" gösterir

    const databases: Array<Record<string, unknown>> = [];
    if (isBackofficeDbAllowed(deps.appDbName)) databases.push({ scope: 'app', label: 'app', ...(await dbStats(deps.conn, deps.appDbName)) });
    const { tenants, skipped } = await resolveTenantDbs(deps.clientModel);
    const seen = new Set<string>(isBackofficeDbAllowed(deps.appDbName) ? [deps.appDbName] : []);
    for (const t of tenants) {
        if (seen.has(t.dbname)) continue;
        seen.add(t.dbname);
        databases.push({ scope: 'tenant', tenantId: t.tenantId, label: `tenant #${t.tenantId}`, ...(await dbStats(deps.conn, t.dbname)) });
    }
    return {
        server,
        pools: { appPoolSize: deps.appPoolSize, openTenantHandles: deps.openTenantHandles },
        databases, skippedNotAllowlisted: skipped + (isBackofficeDbAllowed(deps.appDbName) || !deps.appDbName ? 0 : 1),
    };
}

/** `db`: 'app' ya da tenant numarası -> izinli DB adı; çözülemez/izinsizse `null`. */
export async function resolveTargetDbName(target: 'app' | number, deps: Pick<MongoStatusDeps, 'appDbName' | 'clientModel'>): Promise<string | null> {
    if (target === 'app') return isBackofficeDbAllowed(deps.appDbName) ? deps.appDbName : null;
    const row: any = await deps.clientModel.find({ clientId: target }, { 'dbConfig.dbname': 1, _id: 0 }).limit(1).maxTimeMS(MONGO_MAX_TIME_MS).lean();
    const dbname = (Array.isArray(row) ? row[0] : row)?.dbConfig?.dbname;
    return isBackofficeDbAllowed(dbname) ? dbname : null;
}

/** Bir DB'nin koleksiyonları: collStats (`$collStats`) + indeks listesi + `$indexStats`; imleç = son koleksiyon adı. Belge içeriği dönmez. */
export async function getMongoCollections(conn: MongoConnLike, dbname: string, opts: { cursor?: string; limit: number }) {
    if (!isBackofficeDbAllowed(dbname)) throw new Error('db not allowlisted'); // savunma: çağıran zaten çözümledi
    const db: any = conn.useDb(dbname, { useCache: true }).db;
    const limit = Math.min(Math.max(opts.limit, 1), MAX_COLLECTIONS);
    const all: Array<{ name: string }> = await db.listCollections({ type: 'collection' }, { nameOnly: true }).toArray();
    const names = all.map((c) => c.name).filter((n) => !n.startsWith('system.')).sort();
    const after = opts.cursor ? names.filter((n) => n > opts.cursor!) : names;
    const page = after.slice(0, limit);

    const items: Array<Record<string, unknown>> = [];
    for (const name of page) {
        const coll = db.collection(name);
        const item: Record<string, unknown> = { name };
        try {
            const [st] = await coll.aggregate([{ $collStats: { storageStats: {} } }], { maxTimeMS: MONGO_MAX_TIME_MS }).toArray();
            const ss = st?.storageStats ?? {};
            Object.assign(item, { documents: ss.count ?? null, dataSize: ss.size ?? null, storageSize: ss.storageSize ?? null, indexSize: ss.totalIndexSize ?? null, avgObjSize: ss.avgObjSize ?? null });
        } catch { item.statsAvailable = false; }
        let usage = new Map<string, { ops: number; since: string | null }>();
        try {
            const us: any[] = await coll.aggregate([{ $indexStats: {} }], { maxTimeMS: MONGO_MAX_TIME_MS }).toArray();
            usage = new Map(us.map((u) => [u.name, { ops: Number(u.accesses?.ops) || 0, since: u.accesses?.since ? new Date(u.accesses.since).toISOString() : null }]));
        } catch { /* yetki yoksa kullanım sayısı boş */ }
        try {
            const ix: any[] = await coll.listIndexes().toArray();
            item.indexes = ix.slice(0, 50).map((i) => ({
                name: String(i.name), keys: Object.keys(i.key ?? {}).map((k) => `${k}:${i.key[k]}`), unique: !!i.unique, sparse: !!i.sparse, partial: !!i.partialFilterExpression,
                ttlSeconds: typeof i.expireAfterSeconds === 'number' ? i.expireAfterSeconds : null,
                usage: usage.get(i.name)?.ops ?? null, usageSince: usage.get(i.name)?.since ?? null,
            }));
        } catch { item.indexes = []; }
        items.push(item);
    }
    const hasMore = after.length > page.length;
    return { items, nextCursor: hasMore ? page[page.length - 1] : null };
}

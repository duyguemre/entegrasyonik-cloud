// [eslesme-fiyat WP2] `catalog.platformRefresh` üretim bağlantısı (bootstrap/schedules.ts kullanır). Saf iş: `platformCatalog.ts`.
// Katalog okuması kanalı KURULU ilk tenant'ın adaptörüyle yapılır (katalog verisi tenant'tan bağımsızdır; HB/PZ'de tenant'a özel
// liste olup olmadığı yerelde doğrulanacak — PLAN §3.1). Platforma YAZMA YOK; yalnız kendi DB'mize (PlatformCatalog + AttributeMappings.stale).
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import IntegrationFactory from '@integration/modules/IntegrationFactory';
import { logger } from '@platform/core/logger';
import type { CatalogAdapter, PlatformCatalogDeps } from './platformCatalog';

export const PLATFORM_CATALOG_JOB_NAME = 'catalog.platformRefresh';
/** Eşleme ekranı olan kanallar (descriptor `categories` destekli). */
export const CATALOG_CHANNELS = ['trendyol', 'hepsiburada', 'n11', 'pazarama', 'ideasoft'] as const;

const log = logger.child({ module: PLATFORM_CATALOG_JOB_NAME });

export function createPlatformCatalogDeps(): PlatformCatalogDeps {
    const clientDB = async (tid: number) => {
        const db = await DatabaseManagerInstance.getClientDB(tid);
        if (!db) throw new Error('tenant_db_unavailable');
        return db as any;
    };
    let tenantsCache: number[] | undefined;
    const listTenants = async () => {
        if (tenantsCache) return tenantsCache;
        const app = await DatabaseManagerInstance.getApplicationDB();
        const clients: any[] = await app.getClientModel().find({ status: 'ACTIVE' }, { order: 1 }).lean();
        tenantsCache = clients.map((c) => Number(c.order)).filter((n) => Number.isInteger(n) && n > 0);
        return tenantsCache;
    };
    return {
        now: () => new Date(),
        listTenants,
        async listChannels() {
            const tenants = await listTenants();
            return CATALOG_CHANNELS.map((integrationCode) => ({
                integrationCode,
                adapter: async (): Promise<CatalogAdapter> => {
                    for (const tid of tenants) {
                        try { return await new IntegrationFactory(tid).getInstance(integrationCode); } catch { /* bu tenant'ta kurulu değil; sıradaki */ }
                    }
                    throw new Error('kanal hiçbir tenant\'ta kurulu değil');
                },
            }));
        },
        async listMappings(tid, integrationCode) {
            return (await clientDB(tid)).getAttributeMappingModel()
                .find({ integrationCode }, { integrationCode: 1, isCategoryMapping: 1, platformCategoryId: 1, platformAttributeId: 1, 'values.platformValueId': 1, stale: 1 })
                .lean();
        },
        async setStale(tid, updates) {
            await (await clientDB(tid)).getAttributeMappingModel().bulkWrite(
                updates.map((u) => ({ updateOne: { filter: { _id: u.id }, update: { $set: { stale: u.stale } } } })), { ordered: false });
        },
        async saveCatalog(entries) {
            const app = await DatabaseManagerInstance.getApplicationDB();
            await app.getPlatformCatalogModel().bulkWrite(entries.map((e) => ({
                updateOne: {
                    filter: { integrationCode: e.integrationCode, kind: e.kind, platformCategoryId: e.platformCategoryId, platformAttributeId: e.platformAttributeId },
                    update: { $set: { ids: e.ids, payload: e.payload ?? null, fetchedAt: e.fetchedAt } },
                    upsert: true,
                },
            })), { ordered: false });
            log.debug({ count: entries.length }, 'platform katalog yazıldı');
        },
    };
}

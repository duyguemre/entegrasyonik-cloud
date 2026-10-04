// [eslesme-fiyat WP5] `PricePublishTrigger` üretim bağlantısı (bootstrap/schedules.ts kullanır). Desen `StockPublishTrigger` ile aynı
// kaynaklar: Redis hazır kapısı, etkin tenant'lar, kanal kill-switch'i (intakeGate), adaptör eşleşme anahtarı, PROCESS_NEXT_SIGNAL.
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import { RedisService } from '@services/redis/RedisService';
import IntegrationFactory from '@integration/modules/IntegrationFactory';
import { allowNewWork, recordIntakeSkip } from '@integration/config/intakeGate';
import { EVENTS, integrationEventBus } from '@platform/runtime/events/IntegrationEventBus';
import { CLIENT_INTEGRATION_HOT_PROJECTION } from '@database/projections';
import { runPricePublish, type PricePublishDeps, type PricePublishResult } from './PricePublishTrigger';

export function createPricePublishDeps(): PricePublishDeps {
    const factories = new Map<number, IntegrationFactory>();
    return {
        redisReady: () => RedisService.isReady(),
        async activeClients() {
            const app = await DatabaseManagerInstance.getApplicationDB();
            const rows: any[] = await app.getClientModel().find({ status: 'ACTIVE' }, { order: 1 }).lean();
            return (rows || []).map((c) => Number(c.order)).filter((n) => Number.isFinite(n));
        },
        clientDB: async (order) => (await DatabaseManagerInstance.getClientDB(order)) ?? null,
        exportFlagModel: async () => (await DatabaseManagerInstance.getApplicationDB()).getExportFlagModel(),
        async activeChannels(clientDB) {
            const doc: any = await clientDB.getClientIntegrationModel().findOne({}, CLIENT_INTEGRATION_HOT_PROJECTION).lean();
            return [...(doc?.marketplace || []), ...(doc?.ecommerce || [])].filter((m: any) => m?.status !== false && m?.code).map((m: any) => m.code);
        },
        async matchKey(order, code) {
            let f = factories.get(order);
            if (!f) { f = new IntegrationFactory(order); factories.set(order, f); }
            const instance = await f.getInstance(code);
            return instance.getMatchKey() || 'barcode';
        },
        allowNewWork: (code) => {
            const ok = allowNewWork(code);
            if (!ok) recordIntakeSkip('PricePublishTrigger', code, 'new');
            return ok;
        },
        signal: () => integrationEventBus.emit(EVENTS.PROCESS_NEXT_SIGNAL),
    };
}

export function createPricePublishTrigger(deps: PricePublishDeps = createPricePublishDeps()): { run(): Promise<PricePublishResult> } {
    return { run: () => runPricePublish(deps) };
}

import { DatabaseManagerInstance } from "@database/index";
import { RedisService } from "@services/redis/RedisService";
import { PostOrderOperations } from "@operations/orders/postOrder";

/**
 * ADR-0004 — Zero-oversell (Karar 3, çökme/kaçak telafisi): "her 15 dk'da bir, allocationState aynası
 * istenen durumdan FARKLI olan satırları yeniden sürer."
 *
 * Aynası kesin "farklı" olan satırları tek bir Mongo sorgusuyla ayırt etmek (pazaryeri bazlı türetme
 * mantığı JS tarafında olduğundan) mümkün değildir; bu yüzden burada bir ÜST KÜME sorgulanır: aynası
 * TERMİNAL olmayan (`SETTLED_MIRROR_STATES` dışı — eksik/RESERVED/OVERSOLD/UNMAPPED) satırı olan
 * siparişler adaydır. Gerçek "farklı mı" kontrolü `PostOrderOperations.processOrder` içinde StockAllocator'ın
 * idempotent geçişleriyle yapılır (zaten doğru durumdaysa no-op — ucuz ve GÜVENLİ, ADR'nin idempotency
 * garantisine dayanır). Bu, ADR'nin tam istediğinden daha GENİŞ bir aday kümesidir (ör. hâlâ meşru şekilde
 * RESERVED bekleyen bir sipariş de her turda yeniden taranır) ama YANLIŞ NEGATİF üretmez.
 */
export class AllocationSweepJob {
    /** ADR'deki 40 günlük dizi budama penceresine 5 gün pay eklenmiş tarama alt sınırı. */
    private static readonly LOOKBACK_DAYS = 45;

    public async run(): Promise<{ skipped: boolean; scannedClients: number; scannedOrders: number }> {
        // [ADR-0005 Karar 2 ile AYNI dayanıklılık kapısı] Süpürme DB-only olsa da (Redis'e bağımlı değil),
        // arka plan zamanlayıcılarının TEK bir aç/kapa sözleşmesi olması (Redis kapalıyken TÜMÜ atlanır)
        // operasyonel olarak daha öngörülebilir; görev talimatı da bunu açıkça ister.
        if (!RedisService.isReady()) {
            console.warn('[AllocationSweepJob] Redis bağlı değil (isReady()=false); bu tur ATLANIYOR (ADR-0005 Karar 2 ile aynı desen).');
            return { skipped: true, scannedClients: 0, scannedOrders: 0 };
        }

        let scannedClients = 0;
        let scannedOrders = 0;

        try {
            const applicationDB = await DatabaseManagerInstance.getApplicationDB();
            const clientModel = applicationDB.getClientModel();
            const activeClients = await clientModel.find({ status: 'ACTIVE' }).lean();

            const cutoff = new Date(Date.now() - AllocationSweepJob.LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

            for (const client of activeClients || []) {
                scannedClients++;
                try {
                    const clientDb = await DatabaseManagerInstance.getClientDB((client as any).clientId);
                    if (!clientDb) continue;

                    const orderModel = clientDb.getOrderModel();
                    const staleOrders = await orderModel.find({
                        'dates.orderDate': { $gte: cutoff },
                        items: { $elemMatch: { allocationState: { $nin: PostOrderOperations.SETTLED_MIRROR_STATES } } },
                    }).lean();

                    if (!staleOrders || staleOrders.length === 0) continue;

                    const driver = new PostOrderOperations(clientDb);
                    for (const order of staleOrders) {
                        try {
                            await driver.processOrder((client as any).clientId, order);
                            scannedOrders++;
                        } catch (error) {
                            console.error(
                                `[AllocationSweepJob] Sipariş süpürme hatası (client=${(client as any).clientId}, order=${(order as any)?.externalOrderId}):`,
                                error,
                            );
                        }
                    }
                } catch (error) {
                    console.error(`[AllocationSweepJob] Client süpürme hatası (client=${(client as any).clientId}):`, error);
                }
            }
        } catch (error) {
            console.error('[AllocationSweepJob] Süpürme turu genel hata:', error);
        }

        return { skipped: false, scannedClients, scannedOrders };
    }
}

import { DatabaseManagerInstance } from "@database/DatabaseManager";
import { CLIENT_INTEGRATION_HOT_PROJECTION } from "@database/projections";
import { stockDirtyFields } from './markStockDirty';
import { RedisService } from "@services/redis/RedisService";
import IntegrationFactory from "@integration/modules/IntegrationFactory";
import { allowNewWork, recordIntakeSkip } from "@integration/config/intakeGate";

/**
 * ADR-0004 — Zero-oversell (Karar 8b, Aşama C): DIŞ mutabakat, günlük.
 * bkz. docs/adr/0004-zero-oversell-rezervasyon-modeli.md
 *
 * Mevcut import akışının kullandığı GERÇEK, ADAPTÖR bazlı `IPlatform.streamProducts`/`getSummaryFromRaw`
 * metotları (Stager'ın kullandığıyla AYNI, `Stager`'a DOKUNULMADAN bağımsız çağrılır) ile pazaryerinin
 * kanal ürün listesi/stok akışı çekilir; kanalın RAPORLADIĞI adet, bizim `platforms.<code>.stockSync.
 * lastPublishedQty` (Sentinel'in onayladığı SON yayın) ile karşılaştırılır. Fark varsa `stockDirty=true`
 * (ADR birebir: "fark varsa stockDirty=true" -- bir DÜZELTME/pull DEĞİL, bir sonraki debounce turunun
 * bizim İÇ `available`'a göre YENİDEN yayın yapmasını tetikler; doğruluk kaynağı hâlâ kendi DB'mizdir).
 * Araştırmadaki 6-12 saat aralığı yerine GÜNLÜK seçildi (ADR'nin kendi kararı, tek haneli abone/düşük SKU hızı).
 */
export class ExternalReconciliationJob {
    private static readonly SCAN_LIMIT_PER_CHANNEL = 20000;

    public async run(): Promise<{ skipped: boolean; scannedClients: number; scannedChannels: number; markedDirty: number }> {
        if (!RedisService.isReady()) {
            console.warn('[ExternalReconciliationJob] Redis bağlı değil (isReady()=false); bu tur ATLANIYOR.');
            return { skipped: true, scannedClients: 0, scannedChannels: 0, markedDirty: 0 };
        }

        let scannedClients = 0, scannedChannels = 0, markedDirty = 0;

        try {
            const applicationDB = await DatabaseManagerInstance.getApplicationDB();
            const activeClients = await applicationDB.getClientModel().find({ status: 'ACTIVE' }).lean();

            for (const client of activeClients || []) {
                scannedClients++;
                const clientOrder = Number((client as any).order);
                try {
                    const r = await this.runForClient(clientOrder);
                    scannedChannels += r.scannedChannels; markedDirty += r.markedDirty;
                } catch (error) {
                    console.error(`[ExternalReconciliationJob] Client hata (order=${clientOrder}):`, error);
                }
            }
        } catch (error) {
            console.error('[ExternalReconciliationJob] Tur genel hata:', error);
        }

        return { skipped: false, scannedClients, scannedChannels, markedDirty };
    }

    private async runForClient(clientOrder: number): Promise<{ scannedChannels: number; markedDirty: number }> {
        let scannedChannels = 0, markedDirty = 0;

        const clientDB = await DatabaseManagerInstance.getClientDB(clientOrder);
        if (!clientDB) return { scannedChannels, markedDirty };

        const integrationDoc: any = await clientDB.getClientIntegrationModel().findOne({}, CLIENT_INTEGRATION_HOT_PROJECTION).lean(); // [DB-03]
        const marketplaces: any[] = (integrationDoc?.marketplace || []).filter((m: any) => m.status !== false);
        if (marketplaces.length === 0) return { scannedChannels, markedDirty };

        const factory = new IntegrationFactory(clientOrder);
        const variantModel = clientDB.getVariantModel();

        for (const mp of marketplaces) {
            const code = mp.code;
            // [ADR-0030 X6] Kill-switch: kanal kapalıyken pazaryerine dış çekme yapılmaz; günlük iş sonraki turda yeniden dener.
            if (!allowNewWork(code)) { recordIntakeSkip('ExternalReconciliationJob', code, 'new'); continue; }
            scannedChannels++;
            try {
                const instance = await factory.getInstance(code);
                const matchKey = (instance.getMatchKey() || 'barcode').toLowerCase();
                let processed = 0;

                await instance.streamProducts(async (chunk: any[]) => {
                    for (const raw of chunk) {
                        if (processed >= ExternalReconciliationJob.SCAN_LIMIT_PER_CHANNEL) return;
                        processed++;
                        try {
                            const summary = await instance.getSummaryFromRaw(raw);
                            const matchValue = (summary as any)[matchKey];
                            if (!matchValue) continue;

                            const variant: any = await variantModel.findOne({ [matchKey]: matchValue })
                                .select(`_id platforms.${code}.stockSync`)
                                .lean();
                            if (!variant) continue; // pazaryerinde var, bizde yok -- bu job'un kapsamı DEĞİL.

                            const lastPublishedQty = variant.platforms?.[code]?.stockSync?.lastPublishedQty;
                            const reportedQty = Number((summary as any).quantity);
                            if (lastPublishedQty === undefined || Number.isNaN(reportedQty)) continue;

                            if (reportedQty !== lastPublishedQty) {
                                await variantModel.updateOne({ _id: variant._id }, { $set: stockDirtyFields() });
                                markedDirty++;
                            }
                        } catch (itemErr) {
                            console.error(`[ExternalReconciliationJob] Kalem karşılaştırma hatası (channel=${code}):`, itemErr);
                        }
                    }
                });
            } catch (error) {
                console.error(`[ExternalReconciliationJob] Kanal hata (channel=${code}):`, error);
            }
        }

        return { scannedChannels, markedDirty };
    }
}

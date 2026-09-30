import { DatabaseManagerInstance } from '@database/DatabaseManager';
import IntegrationFactory from '../../../modules/IntegrationFactory';
import { BaseWorker } from '../../BaseWorker';
import { ObjectId } from 'mongodb';
import _ from 'lodash';
import { EVENTS, integrationEventBus } from '../../IntegrationEventBus';
import { IntegrationEngineProvider } from '../provider/IntegrationEngineProvider';
import { IApplicationDB } from '@interfaces/common';
import { getPodIdentity } from '@utils/podIdentity';
import { stagedLogPush } from '@operations/integration/stagedLogs';
import { acquireLease, releaseLease } from '@utils/mongoLease';
import { config } from '@config';
import { EntitlementService } from '@services/billing/EntitlementService';
import { eventLog } from '@platform/core/logger';
import { enrichContext } from '@platform/core/context';
import { allowNewWork, recordIntakeSkip } from '@integration/config/intakeGate';

const log = eventLog('worker', 'Dispatcher');

export default class Dispatcher extends BaseWorker {
    protected readonly workerName = 'Catalog Dispatcher';
    private readonly BATCH_SIZE = 300;
    // [ADR-0006 Karar 4] ExportFlag lease süresi: 5 dk (heartbeat yok — Dispatcher bir bayrağı tek run() turunda
    // senkron işler, iş bitince hemen bırakılır; 5 dk yalnızca bırakılamayan/çöken pod için üst sınırdır).
    private readonly LEASE_TTL_MS = 5 * 60 * 1000;

    constructor() {
        super();
    }

    public async run() {
        const podName = getPodIdentity();

        try {
            const applicationDB = await DatabaseManagerInstance.getApplicationDB()
            // 1. ADIM: Sayacı 0'dan büyük olan (iş bekleyen) bayrakları bul
            const pendingFlags = await applicationDB.getExportFlagModel().find({
                queuedCount: { $gt: 0 }
            })
                .sort({ priority: -1, lastUpdatedAt: 1 })
                .limit(20)
                .lean();

            if (!pendingFlags.length) return;

            // [ADR-0003 adım 8 / L-08 düzeltmesi] Silinmiş/askıdaki (DELETION_PENDING vb.) tenant'ları TEK sorguda
            // tespit ederiz: yalnızca ACTIVE olan tenant'lar işlenir. Eskiden bu kontrol yoktu; bulunamayan/askıdaki
            // tenant `return` ile TÜM döngüyü kesiyordu (aşağıdaki döngüde artık `continue`).
            const requestedOrders = Array.from(new Set(pendingFlags.map((f: any) => Number(f.clientId))));
            const activeClients = await applicationDB.getClientModel()
                .find({ order: { $in: requestedOrders }, status: 'ACTIVE' })
                .select('order')
                .lean();
            const activeOrderSet = new Set(activeClients.map((c: any) => Number(c.order)));

            let shouldSendWakeUpEvent = false
            for (const flag of pendingFlags) {
                const { clientId, integrationCode } = flag;
                enrichContext({ tenantId: Number(clientId), integrationCode }); // [F-06] sonraki loglar bu tenant/entegrasyonla etiketlenir

                if (!activeOrderSet.has(Number(clientId))) {
                    // Tenant askıda/silinmiş/bulunamıyor: SADECE bu bayrak atlanır, döngü ve diğer tenant'lar için devam eder.
                    log.error('DISPATCHER_TENANT_NOT_ACTIVE', `Tenant is not ACTIVE or not found (order: ${clientId}); skipping flag.`);
                    continue;
                }

                // [ADR-0008 §3(b), BAYRAK KORUMALI (`ENTITLEMENT_GUARD_ENABLED`, varsayılan `false`)] Bayrak KAPALIYKEN
                // (varsayılan) bu blok HİÇBİR ŞEY yapmaz -- mevcut davranış birebir korunur. Açıkken: aboneliği
                // `engine` boyutunda erişime kapalı (suspended/canceled-sonrası/expired; `billingExempt` HARİÇ --
                // bkz. EntitlementService.computeAccess) bir tenant için YENİ vagon/sinyal OLUŞTURULMAZ (ADR §3
                // risk notu: "motor durdurulur"). Bu, "tenant'ı kuyruğa almadan ÖNCE" kontrolüdür (ADR §3 (b));
                // ZATEN KUYRUKTA olan sinyallerin işlenmesi (ExportOrchestrator.dispatch) BİLEREK etkilenmez --
                // burada durdurmak sinyali kilitsiz/durumu değişmemiş bırakır ve saniyede bir yeniden denenip
                // sıkı bir tekrar döngüsü (retry-storm) yaratabilir; bu, ayrı bir tasarım kararı gerektirir (BACKLOG).
                if (config.flags.entitlementGuardEnabled) {
                    const decision = await EntitlementService.checkAccess(Number(clientId), 'engine');
                    // Sessizce atlanır (no-console mandalı, quality/baseline.json): bu satır bir hata değildir, günlük
                    // izleme gerekiyorsa `@platform/core/logger` köprüsüne göç ayrı bir iş (ADR-0017 sıcak-yol göçü).
                    if (!decision.allowed) {
                        continue;
                    }
                }

                // [ADR-0030 X6] Kill-switch: drain/off iken bu bayraktan YENİ sinyal üretilmez; queuedCount korunur,
                // açılınca sonraki turda işlenir (iş düşmez).
                if (!allowNewWork(integrationCode)) { recordIntakeSkip('Dispatcher', integrationCode, 'new'); continue; }

                const clientDB = await DatabaseManagerInstance.getClientDB(clientId);
                if (!clientDB) {
                    // [ADR-0003 adım 8 / L-08 düzeltmesi] Eskiden buradaki `return` run() metodunu TAMAMEN durdurup
                    // kalan tüm bayrakları (ve PROCESS_NEXT_SIGNAL olayını) atlıyordu. Artık yalnızca bu bayrak atlanır.
                    log.error('DISPATCHER_CLIENT_DB_NOT_FOUND', `Client DB not found for Client ID: ${clientId}`);
                    continue;
                }

                // [ADR-0006 Karar 4] Çok instance güvenliği: bu bayrağı işlemeye başlamadan önce ExportFlag
                // üzerinde lease talep edilir. Başka bir pod zaten işliyorsa (lease aktif ve bize ait değilse)
                // bu bayrak SADECE bu turda atlanır (hata değil, bir sonraki pass'te yeniden denenir).
                const leaseFilter = { clientId: flag.clientId, integrationCode: flag.integrationCode };
                const leasedFlag = await acquireLease(
                    applicationDB.getExportFlagModel() as any,
                    leaseFilter,
                    podName,
                    { ttlMs: this.LEASE_TTL_MS },
                );
                if (!leasedFlag) {
                    log.info('DISPATCHER_FLAG_LEASE_HELD_ANOTHER', 'Flag lease held by another pod; skipping this pass.');
                    continue;
                }

                const engineProvider = new IntegrationEngineProvider(applicationDB, clientDB)


                try {
                    const factory = new IntegrationFactory(Number(clientId));

                    // 2. ADIM: YOLDAKİ BARKODLARI BUL
                    const instance = await factory.getInstance(integrationCode);
                    const matchKey = (instance.getMatchKey() || 'barcode').toLowerCase();

                    const activeSignals = await applicationDB.getExportSignalModel().find({
                        clientId,
                        integrationCode,
                        // PREPARING ve PENDING: Kesin bloklayıcı (Henüz platforma ulaşmadı)
                        // SENT ve WAITING: Sadece aynı modu bloklayıcı (Platformda işlemde)
                        status: { $in: ['PREPARING', 'PENDING', 'SENT', 'WAITING'] }
                    }).select('batchId').lean();

                    const activeBatchIds = activeSignals.map((s: any) => s.batchId);

                    let busyBarcodeModes: string[] = [];
                    if (activeBatchIds.length > 0) {
                        const ongoingItems = await clientDB.getExportStagedProductModel().find({
                            integrationCode,
                            batchId: { $in: activeBatchIds },
                            status: { $nin: ['COMPLETED', 'FAILED'] } // Hala aktif olanlar
                        }).select(`${matchKey} mode`).lean();
                        busyBarcodeModes = ongoingItems.map((i: any) => `${i[matchKey]}_${i.mode}`);
                    }

                    // 3. ADIM: KUYRUKTAN UYGUN KAYITLARI ÇEK
                    const leadItem = await clientDB.getExportStagedProductModel().findOne({
                        integrationCode,
                        status: 'QUEUED',
                        // Eğer dökümanın barkod+mod kombinasyonu yoldakiler arasında yoksa al
                        $expr: {
                            $not: {
                                $in: [
                                    { $concat: [`$${matchKey}`, "_", "$mode"] },
                                    busyBarcodeModes
                                ]
                            }
                        }
                    })
                        .sort({ priorityScore: -1, createdAt: 1 })
                        .select('mode') // Sadece mode alanını çek, tüm dökümanı değil!
                        .lean();

                    log.debug('DISPATCHER_LEADITEM_SEARCH_FINISHED_RESULT', `LeadItem search finished. Result: ${leadItem ? 'Found' : 'Not Found'} (Integration: ${integrationCode}, MatchKey: ${matchKey})`);


                    // EĞER İŞLENECEK ÜRÜN YOKSA (Hepsi yoldaysa)
                    if (!leadItem) {
                        log.info('DISPATCHER_ITEMS_QUEUE_ALREADY_BEING', 'Items in queue are already being processed. Skipping signal creation.');

                        // 1. Veritabanındaki GERÇEK QUEUED sayısını al (Yoldakiler dahil tüm bekleyenler)
                        const realQueuedCount = await clientDB.getExportStagedProductModel().countDocuments({
                            integrationCode,
                            status: 'QUEUED'
                        });

                        // 2. Sayacı reel durumla eşitle (Over-write)
                        // Bu işlem BatchCreator'ın hatalı şişirdiği sayıyı anında tamir eder.
                        await applicationDB.getExportFlagModel().updateOne(
                            { clientId, integrationCode },
                            {
                                $set: {
                                    queuedCount: realQueuedCount,
                                    lastUpdatedAt: new Date()
                                }
                            }
                        );

                        // ÖNEMLİ: Burada sayacı eksiltmiyoruz çünkü ürünler hala QUEUED statüsünde bekliyor.
                        // Sadece vagon oluşturmuyoruz.
                        continue;
                    }


                    const currentMode = (leadItem as any).mode;

                    // 2. ADIM: Belirlenen moda ait paketleri çek
                    const queuedItems = await clientDB.getExportStagedProductModel().find({
                        integrationCode,
                        status: 'QUEUED',
                        mode: currentMode,
                        $expr: {
                            $not: {
                                $in: [
                                    { $concat: [`$${matchKey}`, "_", "$mode"] },
                                    busyBarcodeModes
                                ]
                            }
                        }
                    })
                        .sort({ priorityScore: -1, createdAt: 1 })
                        .limit(this.BATCH_SIZE)
                        .lean();

                    // 4. ADIM: Paketleme ve Sinyal Oluşturma
                    const batchId = new ObjectId().toString();
                    const correlationId = new ObjectId().toString();
                    const now = new Date();
                    const mode = (queuedItems[0] as any).mode;

                    log.info('DISPATCHER_CREATING_NEXT_BATCH', `Dispatcher creating next batch for ${queuedItems.length} items. Batch: ${batchId}`);

                    // StagedProduct Güncelleme
                    await clientDB.getExportStagedProductModel().updateMany(
                        { _id: { $in: queuedItems.map((i: any) => i._id) } },
                        {
                            $set: { status: 'PREPARING', batchId: batchId, updatedAt: now },
                            $push: {
                                logs: stagedLogPush({ // [DB-04] son 20 giriş
                                    status: 'PREPARING',
                                    worker: this.workerName,
                                    message: `Kuyruktan çıkartıldı, yeni vagona (${batchId}) yüklendi.`,
                                    timestamp: now
                                })
                            }
                        }
                    );

                    // ExportSignal Oluşturma
                    await applicationDB.getExportSignalModel().create({
                        clientId,
                        integrationCode,
                        mode,
                        status: 'PREPARING',
                        batchId,
                        groupId: correlationId,
                        sequence: 1,
                        totalBatches: 1,
                        itemCount: queuedItems.length,
                        lockedBy: null,
                        nextRunAt: now,
                        createdAt: now,
                        updatedAt: now,
                        logs: [{
                            status: 'PREPARING',
                            worker: this.workerName,
                            message: `Yeni vagon oluşturuldu.`,
                            timestamp: now
                        }]
                    });
                    shouldSendWakeUpEvent = true;

                    // 5. ADIM: ATOMİK SAYAÇ GÜNCELLEME
                    // İşlenen miktar kadar düşüyoruz. Kalanlar (varsa) sayaçta kalmaya devam eder.
                    await this.decrementQueuedCount(applicationDB, clientId, integrationCode, queuedItems.length);

                } catch (clientErr: any) {
                    log.error('DISPATCHER_CLIENT_ERROR', 'Dispatcher Client Error:', { err: clientErr });
                } finally {
                    // [ADR-0006 Karar 4] İş (başarılı/başarısız) bitince lease hemen bırakılır; bırakılamazsa
                    // (ör. süreç çökerse) `LEASE_TTL_MS` (5 dk) sonunda kendiliğinden düşer.
                    await releaseLease(applicationDB.getExportFlagModel() as any, leaseFilter, podName);
                }
            }

            // İşlemler bitti, Orchestrator'ı tetikle
            if (shouldSendWakeUpEvent) integrationEventBus.emit(EVENTS.PROCESS_NEXT_SIGNAL);

        } catch (err: any) {
            log.error('DISPATCHER_CRITICAL_ERROR', `Critical Error on ${podName}:`, { err });
        }
    }

    /**
     * Sayacı işlenen miktar kadar atomik olarak düşürür.
     * $inc: -X kullanımı yarış durumlarını (race condition) engeller.
     */
    private async decrementQueuedCount(applicationDB: IApplicationDB, clientId: string, integrationCode: string, count: number) {
        // 1. Sayacı düşür ve güncel hali al
        await applicationDB.getExportFlagModel().findOneAndUpdate(
            { clientId, integrationCode },
            {
                $inc: { queuedCount: -count },
                $set: { lastUpdatedAt: new Date() }
            },
            { new: true } // Güncellenmiş halini getir ki sayıyı kontrol edelim
        );
    }
}
import { OrderRepository } from '../../../database/repositories/tenant/OrderRepository';
import { CustomerRepository } from '../../../database/repositories/tenant/CustomerRepository';
import { ClaimRepository } from '../../../database/repositories/tenant/ClaimRepository';
import { InvoiceRepository } from '../../../database/repositories/tenant/InvoiceRepository';
import { MessageRepository } from '../../../database/repositories/tenant/MessageRepository';
import { FinancialRepository } from '../../../database/repositories/tenant/FinancialRepository';
import {
    IOrderJobData,
    IOrchestratorResult,
    IOrder,
    IClaim,
    IOrderPackage
} from '@interfaces/index';
import IntegrationFactory from '@integration/modules/IntegrationFactory';
import { Types } from 'mongoose';
import { StatisticsTracker, IOperationLogInput } from '@services/statistics/StatisticsTracker';
import orderConfig from './order.config.json';
import { DatabaseManagerInstance } from '@database/index';
import { PostOrderOperations } from '@operations/orders/postOrder';
import { getIncomplete, IncompleteInfo, isWindowOverflowError } from '@integration/contracts/IncompleteFetch';
import { NotificationService } from '@services/notification/NotificationService';
import { eventLog } from '@platform/core/logger';
import { getRequestId } from '@platform/core/context/requestContext';

const log = eventLog('worker', 'OrderWorker');

/**
 * [faz4-int-qa1] Kalici pencere tasmasina karsi koruma (surec ici durum):
 * - Bildirim [ADR-0029 NB3]: kisma artik `notify` katalog grubunda (ORDER_SYNC_WINDOW_OVERFLOW, `integ:reason`, 1 sa; defter,
 *   surecler arasi). Yalniz NOTIFY_V2_ENABLED=false iken eski davranis cephe icinde ayni aralikla (OVERFLOW_NOTIFY_INTERVAL_MS) korunur.
 * - Geri cekilme: daraltmayla cozulemeyen art arda OVERFLOW_BACKOFF_AFTER turdan sonra daraltma denemeleri
 *   ustel seyrelir (OVERFLOW_BACKOFF_BASE_MS .. OVERFLOW_BACKOFF_MAX_MS); arada tur basi yalniz temel cagri yapilir.
 *   Tam donen (veya tasmasiz) tur durumu sifirlar. Imlec davranisi degismez (eksikte ilerlemez).
 */
export const OVERFLOW_NOTIFY_INTERVAL_MS = 60 * 60 * 1000;
export const OVERFLOW_BACKOFF_AFTER = 3;
export const OVERFLOW_BACKOFF_BASE_MS = 5 * 60 * 1000;
export const OVERFLOW_BACKOFF_MAX_MS = 60 * 60 * 1000;

const overflowState = new Map<string, { consecutive: number; nextNarrowAt: number }>();

/** Test yardimcisi: surec ici tasma durumunu sifirlar. */
export function resetOrderWindowOverflowState(): void {
    NotificationService.resetLegacyThrottleForTests();
    overflowState.clear();
}

export class OrderWorker {
    public async process(jobData: IOrderJobData): Promise<IOrchestratorResult> {
        const { integrationCode, lastSyncTimestamp } = jobData;
        const clientId = Number(jobData.clientId);

        log.info('ORDERWORKER_SENKRONIZASYON_BASLADI', 'Senkronizasyon başladı...');

        const syncStartAt = new Date();

        // [ADR-0005 Karar 7] Kaynak başına ayrı imleç + gating: `OrderQueueProducer.scheduleJobs()` bu turda
        // "sırası gelen" kaynaklar için pencere hesaplar ve jobData'ya ekler; alan YOKSA o kaynağın sırası bu
        // turda GELMEMİŞTİR -> dış çağrı YAPILMAZ (kota tasarrufu). Sipariş bu gatinge dahil DEĞİLDİR (60 sn
        // zaten en sık kaynak, her turda çekilir).
        const claimAttempted = !!jobData.claimSync;
        const financeAttempted = !!jobData.financeSync;
        const messageAttempted = !!jobData.messageSync;

        try {
            // 1. EXTRACTION
            const factory = new IntegrationFactory(clientId);
            const integration = await factory.getInstance(integrationCode);

            const [ordersResult, claimsResult, messagesResult, financialsResult] = await Promise.allSettled([
                this.fetchOrdersAdaptive(integration, lastSyncTimestamp, clientId, integrationCode),
                claimAttempted
                    ? integration.retrieveClaims({ startDate: jobData.claimSync!.startDate, endDate: jobData.claimSync!.endDate! })
                    : Promise.resolve([]),
                messageAttempted
                    ? integration.retrieveMessages({ startDate: jobData.messageSync!.startDate })
                    : Promise.resolve([]),
                financeAttempted
                    // BullMQ iş verisi JSON'dan gelir: tarihler string olur; adaptörler `Date` bekler (N11 `toISOString` hatası).
                    ? integration.retrieveFinancials({ startDate: new Date(jobData.financeSync!.startDate), endDate: new Date(jobData.financeSync!.endDate!) })
                    : Promise.resolve([])
            ]);

            // [ADR-0005 adım 2 — BACKLOG C7 kapandı] ÖNCEKİ DAVRANIŞ: sipariş çekim hatası yutulur, packages=[]
            // ile devam edilir, `lastSuccessfulOrderSync` YİNE DE ilerletilirdi -> siparişler sessizce
            // kaybolurdu (BullMQ retry/DLQ hiç tetiklenmezdi). YENİ DAVRANIŞ: sipariş çekimi BAŞARISIZSA iş
            // FAIL EDER (dış catch bloğuna düşer -> FAILED izlenir, hata yeniden fırlatılır -> BullMQ retry;
            // tükenirse veya IntegrationError.retryable===false ise DLQ/UnrecoverableError -- bkz. worker-runner.ts).
            if (ordersResult.status === 'rejected') {
                log.error('ORDERWORKER_SIPARIS_CEKME_HATASI_FAIL', 'Sipariş çekme hatası (iş FAIL ETTİRİLİYOR, ADR-0005 adım 2):', { err: ordersResult.reason });
                throw ordersResult.reason instanceof Error ? ordersResult.reason : new Error(String(ordersResult.reason));
            }
            if (claimsResult.status === 'rejected') {
                log.error('ORDERWORKER_IADE_CEKME_HATASI', 'İade çekme hatası:', { err: claimsResult.reason });
            }
            if (messagesResult.status === 'rejected') {
                log.error('ORDERWORKER_MESAJ_CEKME_HATASI', 'Mesaj çekme hatası:', { err: messagesResult.reason });
            }
            if (financialsResult.status === 'rejected') {
                log.error('ORDERWORKER_FINANS_CEKME_HATASI', 'Finans çekme hatası:', { err: financialsResult.reason });
            }

            const { packages, incomplete: orderIncomplete, windowEnd } = ordersResult.value; // yukarıda 'rejected' ise zaten throw edildi -> TS burada 'fulfilled' olarak daraltır
            const rawClaimPackages = claimsResult.status === 'fulfilled' ? claimsResult.value : [];
            const claimIncomplete = claimsResult.status === 'fulfilled' ? getIncomplete(claimsResult.value) : undefined;
            const messages = messagesResult.status === 'fulfilled' ? messagesResult.value : [];
            const financials = financialsResult.status === 'fulfilled' ? financialsResult.value : [];
            const financeIncomplete = financialsResult.status === 'fulfilled' ? getIncomplete(financialsResult.value) : undefined; // [COM-03]

            // [ADR-0005 adım 3] ÖNCEKİ DAVRANIŞ: dört kaynak da boşsa erken dönülür ve `updateLastSyncTimestamp`
            // HİÇ ÇAĞRILMAZDI (gerçekten "bu turda yeni veri yok" durumunda imleç ilerlemezdi -> bir sonraki
            // turda aynı -büyüyen- pencere yeniden taranırdı). Kaynak başına imleçlerin ANLAMLI olması için
            // (bir kaynak "due" olup boş sonuç aldıysa imleci ilerlemeli, aksi halde her turda yeniden denenir
            // ve 15dk/6sa/5dk aralıkları hiç işlemez) bu kısayol KALDIRILDI: aşağıdaki repository çağrıları
            // zaten boş dizilerle güvenli (no-op); akış her koşulda 8. FINALIZE'a kadar devam eder.

            // 2. REPOSITORIES & BUFFERS
            const customerRepo = new CustomerRepository();
            const orderRepo = new OrderRepository();
            const claimRepo = new ClaimRepository();
            const invoiceRepo = new InvoiceRepository();
            const messageRepo = new MessageRepository();
            const financialRepo = new FinancialRepository();

            const ordersToSave: IOrder[] = [];
            const claimsToSave: IClaim[] = [];
            const invoicesToSave: any[] = []; // IInvoice dizisi

            // Metrikleri sadece YENİ siparişler için hesaplayacağız
            const customerMetricBuffer = new Map<string, { spend: number, ordersCount: number, claimCount: number, refund: number }>();

            // 3. PROCESSING: SİPARİŞLER
            if (packages && packages.length > 0) {
                for (const pkg of packages) {
                    const customerId = await customerRepo.saveCustomer(clientId, pkg.customer, integrationCode);
                    // [DB-01] Kimlik anahtarı yoksa müşteri açılmaz (null): sipariş ad/soyad anlık görüntüsünü taşır.
                    if (customerId) pkg.order.customerId = customerId.toString();
                    pkg.order.customerFirstName = pkg.customer.firstName;
                    pkg.order.customerLastName = pkg.customer.lastName;
                    pkg.order.fulfillment = pkg.order.fulfillment || [];

                    // [YENİ] PRE-SAVE DISCREPANCY CHECK (Fiyat Tutarsızlığı Kontrolü)
                    if (pkg.order.financials) {
                        const itemsTotal = pkg.order.items.reduce((acc, item) => acc + (item.totalPrice || 0), 0);
                        const shipping = pkg.order.financials.shippingFee || 0;
                        const calculatedTotal = Number((itemsTotal + shipping).toFixed(2));
                        const platformTotal = Number((pkg.order.financials.grandTotal || 0).toFixed(2));

                        if (Math.abs(calculatedTotal - platformTotal) > 0.1) {
                            pkg.order.platformDiscrepancy = {
                                hasDiscrepancy: true,
                                detectedAt: new Date(),
                                reason: 'PRICE_MISMATCH',
                                differenceAmount: platformTotal - calculatedTotal,
                                message: `Pazar yeri toplamı (${platformTotal}) ile hesaplanan toplam (${calculatedTotal}) uyuşmuyor.`,
                                platformItems: pkg.order.items.map(i => ({ sku: i.sku, price: i.unitPrice, qty: i.quantity }))
                            };
                        }
                    }

                    ordersToSave.push(pkg.order);

                    // Sipariş içindeki iptalleri (Claims) de dahil et
                    if (pkg.claims && pkg.claims.length > 0) {
                        pkg.claims.forEach(claim => {
                            if (customerId) claim.customerId = customerId;
                            claimsToSave.push(claim);
                        });
                    }

                    // Sipariş içindeki faturaları (Invoices) dahil et
                    if (pkg.invoices && pkg.invoices.length > 0) {
                        pkg.invoices.forEach(invoice => {
                            if (customerId) invoice.customerId = customerId;
                            invoicesToSave.push(invoice);
                        });
                    }
                }
            }

            // 4. PERSISTENCE (Siparişi Kaydet ve ID'leri Al)
            // Repository artık hem yeni (inserted) hem güncellenen (updated) ID'leri dönüyor
            const { insertedExternalIds, updatedExternalIds } = await orderRepo.saveOrders(clientId, ordersToSave);

            // [ADR-0004 Aşama B, Karar 3] Seviye tetiklemeli stok tahsis sürücüsü: her kaydedilen (yeni +
            // güncellenen) sipariş için pazaryeri durumundan istenen tahsis durumu türetilip StockAllocator
            // ile idempotent uygulanır. Bu akış İZOLE edilir: sipariş kaydı zaten TAMAMLANMIŞTIR, bir hata
            // burada senkronizasyonu FAIL ETTİRMEZ (15 dk'lık süpürme işi telafi eder, bkz. AllocationSweepJob).
            const allocationTargetIds = [...insertedExternalIds, ...updatedExternalIds];
            if (allocationTargetIds.length > 0) {
                try {
                    const clientDb = await DatabaseManagerInstance.getClientDB(clientId);
                    if (clientDb) {
                        await new PostOrderOperations(clientDb).processOrdersByExternalIds(clientId, integrationCode, allocationTargetIds);
                    }
                } catch (allocationError) {
                    log.error('ORDERWORKER_STOK_TAHSIS_SURUCUSU_HATASI', 'Stok tahsis sürücüsü hatası (ADR-0004 Aşama B, izole edildi):', { err: allocationError });
                }
            }

            // 4.5. PERSISTENCE (Faturalar)
            let insertedInvoiceExternalIds: string[] = [];
            if (invoicesToSave.length > 0) {
                const res = await invoiceRepo.saveInvoices(clientId, invoicesToSave);
                insertedInvoiceExternalIds = res.insertedExternalIds || [];
                log.info('ORDERWORKER_INVOICE_PERSISTENCE_SONUCU_YENI', `Invoice Persistence Sonucu: ${insertedInvoiceExternalIds.length} yeni fatura.`);
            }

            // 5. CRM LTV HESAPLAMA (Sadece Gerçekten Yeni Olan Siparişler İçin)
            // Bu döngü müşterinin ciro (metrics.totalSpent) bilgisini sadece ilk kez ekler
            for (const pkg of packages) {
                if (!pkg.order.customerId) continue; // [DB-01] müşterisiz sipariş: CRM metriği yok
                const custIdStr = pkg.order.customerId.toString();

                // Eğer bu sipariş pazar yerinden ilk kez çekildiyse (inserted) metrik ekle
                if (insertedExternalIds.includes(pkg.order.externalOrderId)) {
                    const current = customerMetricBuffer.get(custIdStr) || { spend: 0, ordersCount: 0, claimCount: 0, refund: 0 };
                    customerMetricBuffer.set(custIdStr, {
                        ...current,
                        ordersCount: current.ordersCount + 1,
                        spend: current.spend + (pkg.order.financials?.grandTotal || 0)
                    });
                }
            }

            // 6. PROCESSING: İADELER (İadeler her zaman metrikleri günceller - totalReturnAmount)
            // Siparişle gelen iadeler + Saf iadeler birleştirilip kaydediliyor
            if (rawClaimPackages && rawClaimPackages.length > 0) {
                for (const claimPkg of rawClaimPackages) {
                    const claimCustomerId = await customerRepo.saveCustomer(clientId, claimPkg.customer, integrationCode);
                    const claim = claimPkg.claim;
                    if (claimCustomerId) claim.customerId = claimCustomerId;
                    claimsToSave.push(claim);
                }
            }

            let insertedClaimExternalIds: string[] = [];
            let updatedClaimExternalIds: string[] = [];
            if (claimsToSave.length > 0) {
                const res = await claimRepo.saveClaims(clientId, claimsToSave);
                insertedClaimExternalIds = res.insertedExternalIds || [];
                updatedClaimExternalIds = res.updatedExternalIds || [];
            }

            // SADECE YENİ EKLENEN İADELER İÇİN METRİK HESAPLA
            for (const claim of claimsToSave) {
                if (insertedClaimExternalIds.includes(claim.externalClaimId) && claim.customerId) {
                    const custIdStr = claim.customerId.toString();
                    const current = customerMetricBuffer.get(custIdStr) || { spend: 0, ordersCount: 0, claimCount: 0, refund: 0 };
                    customerMetricBuffer.set(custIdStr, {
                        ...current,
                        claimCount: current.claimCount + 1,
                        refund: current.refund + (claim.totalRefundAmount || 0)
                    });
                }
            }

            // 7. CRM METRIC SYNCHRONIZATION
            const metricUpdates = Array.from(customerMetricBuffer.entries()).map(async ([custId, data]) => {
                const updates = [];
                // Eğer bu customer için bir metrik değişikliği (harcama veya adet artışı) varsa güncelle
                if (data.spend > 0 || data.ordersCount > 0) {
                    updates.push(customerRepo.updateOrderMetrics(clientId, new Types.ObjectId(custId), data.spend, data.ordersCount));
                }
                if (data.refund > 0 || data.claimCount > 0) {
                    updates.push(customerRepo.updateClaimMetrics(clientId, new Types.ObjectId(custId), data.refund, data.claimCount));
                }
                return Promise.all(updates);
            });

            await Promise.all(metricUpdates);

            // 7.5. MESSAGES PERSISTENCE
            if (messages && messages.length > 0) {
                await messageRepo.saveMessages(clientId, messages);
            }

            // 7.6. FINANCIALS PERSISTENCE
            if (financials && financials.length > 0) {
                await financialRepo.saveFinancials(clientId, financials);
            }

            // 8. FINALIZE (kaynak başına ayrı imleç, ADR-0005 Karar 7)
            // [ADR-0005 adım 2 — BACKLOG C7] Sipariş imleci artık `syncStartAt - 5 dk` (300 sn örtüşme) ile
            // yazılır -- `Date.now()`/`new Date()` DEĞİL. Bu noktaya kadar geldiysek sipariş çekimi zaten
            // BAŞARILIYDI (aksi halde yukarıda throw edilmişti). Upsert idempotent olduğu için örtüşme çift
            // kayıt üretmez.
            // [faz4-int-wp7] EKSIK CEKIM: baglayici tavana/tekrar eden sayfaya takildiysa ve daraltmalarla da
            // tam cekilemediyse imec ILERLETILMEZ (kismi veri upsert edildi -- idempotent; kalan siparisler bir
            // sonraki turda yeniden taranir, sessiz kayip yok) ve kullaniciya uyari gider. Daraltilmis pencere
            // tam cekildiyse imec `windowEnd - ortusme`ye ilerler (kalan kuyruk sonraki turda cekilir; her tur
            // baslangic imleci ileri gittigi icin dongu ilerler, tur basi daraltma tavani config'te).
            const overlap = orderConfig.orderSync.cursorOverlapMs;
            if (orderIncomplete) {
                log.warn('ORDER_SYNC_INCOMPLETE', 'Siparis cekimi eksik kaldi; lastSuccessfulOrderSync ILERLETILMEDI.', { tenantId: clientId, integrationCode, reason: orderIncomplete.reason, collected: orderIncomplete.collected });
                this.notifyWindowOverflow(clientId, integrationCode, orderIncomplete.reason, orderIncomplete.collected, false);
            } else {
                const cursorTime = windowEnd ? windowEnd.getTime() : syncStartAt.getTime();
                await orderRepo.updateLastSyncTimestamp(clientId, integrationCode, new Date(cursorTime - overlap));
            }

            // İade/finans/mesaj imleçleri YALNIZCA bu turda DENENDİYSE ve BAŞARILIYSA ilerletilir (aksi halde
            // dokunulmaz -- bir sonraki turda hâlâ "due" sayılır, tekrar denenir).
            const cursorUpdates: Promise<void>[] = [];
            // [faz4-int-wp7] Iade cekimi eksikse (tavan) lastClaimSync ilerletilmez.
            if (claimIncomplete) {
                log.warn('CLAIM_SYNC_INCOMPLETE', 'Iade cekimi eksik kaldi; lastClaimSync ILERLETILMEDI.', { tenantId: clientId, integrationCode, reason: claimIncomplete.reason, collected: claimIncomplete.collected });
            }
            if (claimAttempted && claimsResult.status === 'fulfilled' && !claimIncomplete) {
                cursorUpdates.push(orderRepo.updateSourceSyncCursor(clientId, integrationCode, 'lastClaimSync', syncStartAt));
                if (jobData.claimSync!.isFullSweep) {
                    cursorUpdates.push(orderRepo.updateSourceSyncCursor(clientId, integrationCode, 'lastClaimFullSweepAt', syncStartAt));
                }
            }
            // [COM-03] Finans sayfalama tavana takildiysa imlec ilerlemez (kalan hakedis satirlari bir sonraki turda/gunluk taramada gelir).
            if (financeIncomplete) {
                log.warn('FINANCE_SYNC_INCOMPLETE', 'Finans cekimi eksik kaldi; lastFinanceSync ILERLETILMEDI.', { tenantId: clientId, integrationCode, reason: financeIncomplete.reason, collected: financeIncomplete.collected });
            }
            if (financeAttempted && financialsResult.status === 'fulfilled' && !financeIncomplete) {
                cursorUpdates.push(orderRepo.updateSourceSyncCursor(clientId, integrationCode, 'lastFinanceSync', syncStartAt));
                if (jobData.financeSync!.isFullSweep) {
                    cursorUpdates.push(orderRepo.updateSourceSyncCursor(clientId, integrationCode, 'lastFinanceFullSweepAt', syncStartAt));
                }
            }
            if (messageAttempted && messagesResult.status === 'fulfilled') {
                cursorUpdates.push(orderRepo.updateSourceSyncCursor(clientId, integrationCode, 'lastMessageSync', syncStartAt));
            }
            // [ADR-0005 Karar 8 — Aşama B] Webhook sağlık izleme sinyali: polling GERÇEKTEN YENİ bir sipariş
            // bulduysa (`insertedExternalIds.length > 0`) `lastOrderDetectedAt` ilerletilir. `OrderQueueProducer`
            // bu alanı, webhook "sağlıklı" işaretliyken son 30 dk'da webhook'suz sipariş algılanıp algılanmadığını
            // (yani webhook'un sessizce pasife düşüp düşmediğini) tespit etmek için okur.
            if (insertedExternalIds.length > 0) {
                cursorUpdates.push(orderRepo.updateSourceSyncCursor(clientId, integrationCode, 'lastOrderDetectedAt', syncStartAt));
            }
            await Promise.all(cursorUpdates);

            log.info('ORDERWORKER_SENKRONIZASYON_TAMAMLANDI_SIPARIS_IADE', `Senkronizasyon tamamlandı. ` +
                `Sipariş (Y/G): ${insertedExternalIds.length}/${updatedExternalIds.length}, ` +
                `İade (Y/G): ${insertedClaimExternalIds.length}/${updatedClaimExternalIds.length}, ` +
                `Mesaj: ${messages.length}`);

            const durationMs = Date.now() - syncStartAt.getTime();
            // [ADR-0005 adım 3] Denenmeyen (gating ile atlanan) kaynaklar için log kaydı OLUŞTURULMAZ
            // (SUCCESS/FAILED ayrımı yalnızca gerçekten çekilmeye çalışılan kaynaklar için anlamlıdır).
            const logs: Array<IOperationLogInput> = [
                { ...this.buildLog('ORDER_SYNC', ordersResult, syncStartAt, durationMs), clientId, integrationCode, inserted: insertedExternalIds.length, updated: updatedExternalIds.length, fetched: packages.length },
            ];
            if (claimAttempted) logs.push({ ...this.buildLog('CLAIM_SYNC', claimsResult, syncStartAt, durationMs), clientId, integrationCode, inserted: insertedClaimExternalIds.length, updated: updatedClaimExternalIds.length, fetched: rawClaimPackages.length });
            if (messageAttempted) logs.push({ ...this.buildLog('MESSAGE_SYNC', messagesResult, syncStartAt, durationMs), clientId, integrationCode, fetched: messages.length });
            if (financeAttempted) logs.push({ ...this.buildLog('FINANCIAL_SYNC', financialsResult, syncStartAt, durationMs), clientId, integrationCode, fetched: financials.length });
            StatisticsTracker.trackMany(logs);

            return this.buildResult(clientId, integrationCode, insertedExternalIds.length + updatedExternalIds.length, insertedExternalIds, updatedExternalIds);

        } catch (error: any) {
            StatisticsTracker.track({
                clientId, integrationCode,
                operationType: 'ORDER_SYNC',
                status: 'FAILED',
                errorMessage: error?.message || String(error),
                durationMs: Date.now() - syncStartAt.getTime(),
                startedAt: syncStartAt,
            });
            log.error('ORDERWORKER_KRITIK_HATA', 'KRİTİK HATA:', { err: error });
            throw error;
        }
    }

    /**
     * [faz4-int-wp7] Siparis cekimi + eksik cekimde pencere daraltma. Ilk deneme pencere sonu `now` (eski
     * davranis, `endDate` verilmez). `incomplete` donerse pencere ikiye bolunur (`start..mid`), en fazla
     * `maxNarrowings` kez ve pencere `minWindowMs` altina inmeden. Tam donen daraltilmis pencerenin sonu
     * `windowEnd` olarak doner (imec buna gore ilerler). Trendyol ORDER_WINDOW_OVERFLOW firlatir: mevcut
     * davranis korunur (hata -> is FAIL, imec ilerlemez); yalnizca kullaniciya bildirim eklenir.
     */
    private async fetchOrdersAdaptive(integration: any, lastSyncTimestamp: any, clientId: number, integrationCode: string):
        Promise<{ packages: IOrderPackage[]; incomplete?: IncompleteInfo; windowEnd?: Date }> {
        const cfg = orderConfig.orderSync;
        let packages: IOrderPackage[];
        try {
            packages = await integration.retrieveOrders({ lastSyncTimestamp });
        } catch (e) {
            if (isWindowOverflowError(e)) this.notifyWindowOverflow(clientId, integrationCode, 'ORDER_WINDOW_OVERFLOW', 0, true);
            throw e;
        }
        let info = getIncomplete(packages);
        const stateKey = `${clientId}:${integrationCode}`;
        if (!info) {
            overflowState.delete(stateKey);
            return { packages };
        }
        const start = lastSyncTimestamp ? new Date(lastSyncTimestamp).getTime() : NaN;
        if (!Number.isFinite(start)) return { packages, incomplete: info };

        // Kalici tasmada geri cekilme: bekleme suresi dolmadiysa daraltma denenmez (tur basi yalniz temel cagri).
        const state = overflowState.get(stateKey);
        if (state && state.consecutive >= OVERFLOW_BACKOFF_AFTER && Date.now() < state.nextNarrowAt) {
            return { packages, incomplete: info };
        }

        let end = Date.now();
        for (let i = 0; i < cfg.maxNarrowings && info; i++) {
            const half = Math.floor((end - start) / 2);
            if (half < cfg.minWindowMs) break;
            end = start + half;
            packages = await integration.retrieveOrders({ lastSyncTimestamp, endDate: new Date(end).toISOString() });
            info = getIncomplete(packages);
        }
        if (info) {
            const consecutive = (state?.consecutive ?? 0) + 1;
            const exponent = Math.max(0, consecutive - OVERFLOW_BACKOFF_AFTER);
            const delay = Math.min(OVERFLOW_BACKOFF_BASE_MS * 2 ** exponent, OVERFLOW_BACKOFF_MAX_MS);
            overflowState.set(stateKey, {
                consecutive,
                nextNarrowAt: consecutive >= OVERFLOW_BACKOFF_AFTER ? Date.now() + delay : 0,
            });
            return { packages, incomplete: info };
        }
        overflowState.delete(stateKey);
        this.notifyWindowOverflow(clientId, integrationCode, 'PAGINATION_WINDOW_NARROWED', packages.length, false, true);
        return { packages, windowEnd: new Date(end) };
    }

    private notifyWindowOverflow(clientId: number, integrationCode: string, reason: string, collected: number, failed: boolean, resolved = false): void {
        const throttleKey = `${clientId}:${integrationCode}:${reason}`;
        // Bayrak KAPALI: bugunku olay birebir + saatte bir kisma (cephe, surec ici). Bayrak ACIK: katalog grubu (defter) kisar.
        void NotificationService.notify('ORDER_SYNC_WINDOW_OVERFLOW', clientId, { integ: integrationCode, reason }, {
            corrId: getRequestId(),
            module: 'OrderWorker',
            legacy: {
                throttle: { key: throttleKey, ms: OVERFLOW_NOTIFY_INTERVAL_MS },
                event: {
                    clientId: String(clientId),
                    notificationData: {
                        type: 'SYSTEM',
                        severity: 'warning',
                        title: 'Sipariş penceresi taştı',
                        message: resolved
                            ? `${integrationCode.toUpperCase()} sipariş penceresi çok büyüktü; daraltılarak parça parça çekiliyor.`
                            : `${integrationCode.toUpperCase()} sipariş çekimi eksik kaldı (${reason}); kalan siparişler sonraki turlarda yeniden denenecek.`,
                        metaData: { integrationCode, reason, collected, failed, code: 'ORDER_WINDOW_OVERFLOW' },
                    },
                } as any,
            },
        }).catch((e) => {
            log.error('ORDERWORKER_PENCERE_TASMA_BILDIRIMI_GONDERILEMEDI', 'Pencere taşma bildirimi gönderilemedi:', { err: e });
        });
    }

    private buildLog(
        operationType: IOperationLogInput['operationType'],
        result: PromiseSettledResult<any>,
        startedAt: Date,
        durationMs: number
    ): Omit<IOperationLogInput, 'clientId' | 'integrationCode'> {
        return {
            operationType,
            status: result.status === 'rejected' ? 'FAILED' : 'SUCCESS',
            errorMessage: result.status === 'rejected'
                ? String((result as PromiseRejectedResult).reason?.message ?? (result as PromiseRejectedResult).reason)
                : undefined,
            startedAt,
            durationMs,
        };
    }

    private buildResult(
        clientId: number,
        integrationCode: string,
        count: number,
        inserted: string[],
        updated: string[]
    ): IOrchestratorResult {
        return {
            clientId,
            integrationCode,
            processedOrderCount: count,
            insertedIds: inserted,
            updatedIds: updated // Artık TypeScript mutlu :)
        };
    }
}
import { DatabaseManagerInstance } from '@database/index';
import { IOrder } from '@interfaces/order';
import { getLogPrefix, LoggerType } from '@utils/Logger';
import { eventLog } from '@platform/core/logger';
import { guardOrderRequiredFields } from './orderRequiredGuard';
import { recordOrdersIngested } from '@platform/runtime/metrics/redMetrics';

const log = eventLog('worker', 'OrderRepository');

/**
 * Worker'ın CRM metriklerini (LTV) doğru yönetmesi için dönen sonuç tipi.
 * Sadece 'inserted' olanlar için harcama tutarı artırılmalıdır.
 */
export interface ISaveOrderResponse {
    insertedExternalIds: string[];
    updatedExternalIds: string[];
}

export class OrderRepository {
    private workerName: LoggerType = "Order Repository"
    private logPrefix!: string;

    /**
     * saveOrders
     * Siparişleri Bulk Upsert mantığıyla kaydederken, fatura, kargo ve statü koruması uygular.
     */
    public async saveOrders(clientId: number, orders: IOrder[]): Promise<ISaveOrderResponse> {
        if (!orders || orders.length === 0) {
            return { insertedExternalIds: [], updatedExternalIds: [] };
        }

        this.logPrefix = getLogPrefix(this.workerName, clientId, "");

        try {
            // [faz4-order-guard] Reddetmez: eksik required alanları sayıp uyarır, boş kalem kimliğini deterministik doldurur.
            const { gaps, lineIdsFilled } = guardOrderRequiredFields(orders);
            if (Object.keys(gaps).length > 0) {
                log.warn('ORDERREPOSITORY_ZORUNLU_ALAN_EKSIK', 'Sipariş(ler)de şemada zorunlu alan boş/eksik (upsert doğrulamaz, yazım sürdü).', {
                    tenantId: clientId, integrationCode: orders[0]?.integrationCode, orderCount: orders.length, gaps, lineIdsFilled,
                });
            }

            const clientDb = await DatabaseManagerInstance.getClientDB(clientId);
            if (!clientDb) throw new Error(`${this.logPrefix} Client DB not found`);

            const OrderModel = clientDb.getOrderModel();
            const incomingExternalIds = orders.map(o => o.externalOrderId);
            const integrationCode = orders[0]?.integrationCode;

            // 1. MEVCUT SİPARİŞLERİ GETİR (Koruma Kontrolü İçin)
            const existingOrders = await OrderModel.find({
                integrationCode: integrationCode,
                externalOrderId: { $in: incomingExternalIds }
            }).select('externalOrderId customerId invoice fulfillment internalStatus dates financials totalPrice items flags platformOperation').lean();

            const existingOrdersMap = new Map(existingOrders.map((o: any) => [o.externalOrderId, o]));

            const now = new Date();
            const bulkOps = orders.map(order => {
                const existingOrder = existingOrdersMap.get(order.externalOrderId);

                // --- YENİ: PLATFORM OPERATION LOCK KONTROLÜ ---
                if (existingOrder && existingOrder.platformOperation?.lockedUntil) {
                    const lockedUntil = new Date(existingOrder.platformOperation.lockedUntil);
                    if (lockedUntil > now) {
                        const statusWeights: Record<string, number> = {
                            'UNAPPROVED': 0,
                            'AWAITING_APPROVAL': 1,
                            'APPROVED': 2,
                            'SHIPPED': 4,
                            'DELIVERED': 5,
                            'CANCELLED': 10,
                            'RETURNED': 10
                        };

                        const incomingWeight = statusWeights[order.internalStatus] ?? 0;
                        const currentWeight = statusWeights[existingOrder.internalStatus] ?? 0;

                        // Eğer statü ileriye gidiyorsa (örn: APPROVED -> SHIPPED), kilidi kır.
                        if (incomingWeight <= currentWeight) {
                            // Kilit henüz dolmamış ve statü ilerlememiş, senkronizasyonu atla.
                            return null;
                        }
                    }
                }

                const updatePayload: any = {
                    ...order,
                    customerFirstName: order.customerFirstName,
                    customerLastName: order.customerLastName
                };

                // Eğer kilit süresi dolduysa veya hiç yoksa, işlemi yaparken platformOperation alanını sıfırla (sync tamamlandı).
                updatePayload.platformOperation = null;

                if (existingOrder) {
                    // A. MÜŞTERİ KORUMASI (CRM Bütünlüğü)
                    // Pazar yerinden gelen veride müşteri ID eksikse, mevcut CRM bağını koru.
                    if (existingOrder.customerId && !updatePayload.customerId) {
                        updatePayload.customerId = existingOrder.customerId;
                    }

                    // B. FATURA VE KARGO KORUMASI
                    if (existingOrder.invoice?.status === 'SUCCESS') delete updatePayload.invoice;

                    // Mevcut kargo bilgisinin geçerliliğini (boş olmama ve SUCCESS statüsü) kontrol et
                    const hasValidExistingTracking = existingOrder.fulfillment?.some((f: any) =>
                        f.trackingCode && f.trackingCode.trim() !== "" && f.status !== 'PENDING'
                    );
                    const incomingHasTracking = order.fulfillment?.some((f: any) => f.trackingCode && f.trackingCode.trim() !== "");

                    // Eğer bizde zaten BAŞARILI bir kargo bilgisi varsa VE gelen veride takip kodu YOKSA, mevcut kalsın (koruma).
                    // Eğer bizdeki kargo PENDING ise veya boşsa, pazaryerinden gelen verinin üzerine yazmasına izin ver.
                    if (hasValidExistingTracking && !incomingHasTracking) {
                        delete updatePayload.fulfillment;
                    }

                    const statusWeights: Record<string, number> = {
                        'UNAPPROVED': 0,
                        'AWAITING_APPROVAL': 1,
                        'APPROVED': 2,
                        'SHIPPED': 4,
                        'DELIVERED': 5,
                        'CANCELLED': 10,
                        'RETURNED': 10
                    };

                    const incomingStatus = updatePayload.internalStatus;
                    const currentStatus = existingOrder.internalStatus;

                    const targetStatusWeight = statusWeights[incomingStatus] ?? 0;
                    const existingStatusWeight = statusWeights[currentStatus] ?? 0;

                    // 1. İptal veya İade her zaman "en ileri" statüdür, üzerine yazmaya izin verilir.
                    if (['CANCELLED', 'RETURNED'].includes(incomingStatus)) {
                        // Korumayı geç.
                    }
                    // 2. Mevcut statü terminal ise (İptal/İade), geri dönüşe izin verme.
                    else if (['CANCELLED', 'RETURNED'].includes(currentStatus)) {
                        delete updatePayload.internalStatus;
                    }
                    // 3. Genel kural: Statü sadece ileriye gidebilir (Ağırlık bazlı kontrol).
                    // SHIPPED (4) -> DELIVERED (5) geçişine bu sayede izin verilir.
                    else if (targetStatusWeight < existingStatusWeight) {
                        delete updatePayload.internalStatus;
                    }

                    // D. FİNANSAL KİLİTLEME VE FARK DEDEKTÖRÜ (Discrepancy)
                    // Fatura kesildikten sonra gelen fiyat değişikliklerini kaydetme, 'fark' olarak işaretle.
                    if (existingOrder.flags?.isInvoiceGenerated || existingOrder.internalStatus === 'SHIPPED') {
                        const currentTotal = existingOrder.financials?.grandTotal || existingOrder.totalPrice || 0;
                        const incomingTotal = updatePayload.totalPrice || updatePayload.financials?.grandTotal || 0;

                        if (Math.abs(currentTotal - incomingTotal) > 0.01) {
                            updatePayload.platformDiscrepancy = {
                                hasDiscrepancy: true,
                                detectedAt: new Date(),
                                reason: 'POST_INVOICE_UPDATE',
                                differenceAmount: Number((incomingTotal - currentTotal).toFixed(2)), // Delta ekle
                                message: `Pazaryeri tutarı ${incomingTotal} olarak güncelledi, ancak fatura ${currentTotal} üzerinden kesilmişti.`,
                                platformItems: updatePayload.items // Güncel (belki eksik) ürün listesi
                            };
                        }

                        // Kritik finansal alanları korumak için payload'dan siliyoruz.
                        delete updatePayload.items;
                        delete updatePayload.financials;
                        delete updatePayload.totalPrice;
                    }

                    // E. TARİH VE LİFECYCLE KORUMASI (MÜHÜRLEME)
                    if (!updatePayload.dates) updatePayload.dates = {};

                    // 1. Mevcut Tarihleri Koru (Pazar yerinden gelen GERÇEK verileri ezme)
                    const dateFields: (keyof IOrder['dates'])[] = ['orderDate', 'shippedDate', 'deliveredDate', 'approvedDate', 'cancelledDate'];
                    dateFields.forEach(field => {
                        // Sipariş tarihi (orderDate) asla güncellenmez, bir kere set edilir.
                        if (field === 'orderDate' && existingOrder.dates?.orderDate) {
                            updatePayload.dates.orderDate = existingOrder.dates.orderDate;
                        }
                        // Diğer tarihleri sadece yeni gelen boşsa koru (Veya istersen onları da mühürle)
                        else if (existingOrder.dates?.[field] && !order.dates?.[field]) {
                            updatePayload.dates[field] = existingOrder.dates[field];
                        }
                    });

                    // 2. Durum Değişimlerini Mühürle (İlk Tespit Anı)
                    // Eğer koruma statüyü sildiyse (delete updatePayload.internalStatus), 
                    // yeniWeight 0 olacaktır ve mühürleme yapılmayacaktır.
                    const finalStatusWeight = statusWeights[updatePayload.internalStatus as string] ?? 0;

                    // Onay Tarihi (APPROVED veya sonrası bir statüye ilk geçişte)
                    if (finalStatusWeight >= 2 && !updatePayload.dates.approvedDate && !existingOrder.dates?.approvedDate) {
                        updatePayload.dates.approvedDate = new Date();
                    }

                    // Sevk Tarihi (SHIPPED veya sonrası)
                    if (finalStatusWeight >= 4 && !updatePayload.dates.shippedDate && !existingOrder.dates?.shippedDate) {
                        updatePayload.dates.shippedDate = new Date();
                    }

                    // Teslim Tarihi (Sadece DELIVERED)
                    if (finalStatusWeight === 5 && !updatePayload.dates.deliveredDate && !existingOrder.dates?.deliveredDate) {
                        updatePayload.dates.deliveredDate = new Date();
                    }

                    // F. SİSTEMSEL ALANLARIN KORUNMASI
                    delete updatePayload.platformActions;
                    delete updatePayload.flags;
                    if (existingOrder.dates?.cancelledDate) {
                        if (!updatePayload.dates) updatePayload.dates = {};
                        updatePayload.dates.cancelledDate = existingOrder.dates.cancelledDate;
                    }
                }

                // F. İPTAL TARİHİ MÜHÜRLEME
                if (updatePayload.internalStatus === 'CANCELLED') {
                    if (!updatePayload.dates) updatePayload.dates = {};
                    if (!updatePayload.dates.cancelledDate) {
                        updatePayload.dates.cancelledDate = updatePayload.dates.externalUpdatedAt || new Date();
                    }
                }

                return {
                    updateOne: {
                        filter: {
                            integrationCode: order.integrationCode,
                            externalOrderId: order.externalOrderId
                        },
                        update: { $set: updatePayload },
                        upsert: true
                    }
                };
            });

            // 2. BULK EXECUTION
            const filteredOps = bulkOps.filter(op => op !== null);
            if (filteredOps.length === 0) {
                return { insertedExternalIds: [], updatedExternalIds: [] };
            }
            await OrderModel.bulkWrite(filteredOps, { ordered: false });

            // 3. CRM METRİKLERİ İÇİN AYRIŞTIRMA (Inserted vs Updated)
            const insertedExternalIds: string[] = [];
            const updatedExternalIds: string[] = [];

            orders.forEach(o => {
                if (existingOrdersMap.has(o.externalOrderId)) {
                    updatedExternalIds.push(o.externalOrderId);
                } else {
                    insertedExternalIds.push(o.externalOrderId);
                }
            });

            // Platform sayacı: yalnız YENİ siparişler, kanal bazlı (tenant etiketi yok); güncelleme sayılmaz.
            const insertedSet = new Set(insertedExternalIds);
            const byChannel = new Map<string, number>();
            for (const o of orders) if (insertedSet.has(o.externalOrderId)) byChannel.set(o.integrationCode, (byChannel.get(o.integrationCode) ?? 0) + 1);
            byChannel.forEach((n, ch) => recordOrdersIngested(ch, n));

            log.info('ORDERREPOSITORY_ISLEM_OZETI_YENI_GUNCELLEME', `İşlem Özeti: ${insertedExternalIds.length} Yeni, ${updatedExternalIds.length} Güncelleme.`);

            return { insertedExternalIds, updatedExternalIds };

        } catch (error) {
            log.error('ORDERREPOSITORY_SIPARIS_DB_YAZMA_HATASI', 'Sipariş DB Yazma Hatası:', { err: error });
            throw error;
        }
    }

    /**
     * updateLastSyncTimestamp
     * Senkronizasyon zamanını merkezi DB'de (ApplicationDB) günceller.
     */
    public async updateLastSyncTimestamp(clientId: number, integrationCode: string, syncDate: Date): Promise<void> {
        try {
            const appDb = await DatabaseManagerInstance.getApplicationDB();
            const ClientModel = appDb.getClientModel();

            await ClientModel.updateOne(
                { clientId: clientId, "integrations.integrationCode": integrationCode },
                { $set: { "integrations.$.lastSuccessfulOrderSync": syncDate } }
            );
            if (!this.logPrefix) {
                this.logPrefix = getLogPrefix(this.workerName, clientId, integrationCode);
            }
            log.info('ORDERREPOSITORY_SON_SENKRONIZASYON_TARIHI_GUNCELLENDI', `Son Senkronizasyon Tarihi Güncellendi: ${syncDate}`);
        } catch (error) {
            log.error('ORDERREPOSITORY_TIMESTAMP_GUNCELLEME_HATASI', 'Timestamp Güncelleme Hatası:', { err: error });
        }
    }

    /**
     * [ADR-0005 Karar 7 — YENİ] İade/finans/mesaj gibi kaynak başına ayrı imleç alanlarını (`lastClaimSync`,
     * `lastFinanceSync`, `lastMessageSync`, `lastClaimFullSweepAt`, `lastFinanceFullSweepAt`) günceller.
     * `Clients.integrations` şemasız (`{type: Object}`) olduğundan yeni alan eklemek için şema göçü GEREKMEZ.
     * `updateLastSyncTimestamp` ile AYNI desen: DB hatası yutulur (fırlatmaz) -- fire-and-forget'e yakın,
     * çağıran zaten `Promise.all` ile toplu bekliyor, tek bir kaynağın imleç yazma hatası diğerlerini bloklamaz.
     */
    public async updateSourceSyncCursor(clientId: number, integrationCode: string, field: string, date: Date): Promise<void> {
        try {
            const appDb = await DatabaseManagerInstance.getApplicationDB();
            const ClientModel = appDb.getClientModel();

            await ClientModel.updateOne(
                { clientId: clientId, "integrations.integrationCode": integrationCode },
                { $set: { [`integrations.$.${field}`]: date } }
            );
            if (!this.logPrefix) {
                this.logPrefix = getLogPrefix(this.workerName, clientId, integrationCode);
            }
            log.info('ORDERREPOSITORY_GUNCELLENDI', `${field} Güncellendi: ${date}`);
        } catch (error) {
            log.error('ORDERREPOSITORY_GUNCELLEME_HATASI', `${field} Güncelleme Hatası:`, { err: error });
        }
    }
}
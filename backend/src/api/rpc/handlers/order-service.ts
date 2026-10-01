import { IOrderRejectParams, IService, OrderInternalStatusEnum } from '@interfaces/index'
import { BaseApi } from '../../BaseApi'
import IntegrationFactory from '@integration/modules/IntegrationFactory';
import { ApplicationError } from '@platform/core/security/Security'
import { ORDER_ITEM_ALLOCATION_STATES } from '@operations/stock/allocationStates'
import { containsRegex, normalizePagination } from '@utils/search'
import { PLATFORM_TIME_ZONE, startOfDayInZone, endOfDayInZone, addDaysInZone, dayKeyInZone } from '@utils/timeZone'

/**
 * [ADR-0021 D1 / GV-02] getOrders sıralama alanı izin listesi. Sipariş tarihi şemada `dates.orderDate`'tir
 * (üst düzey `orderDate` yoktu → varsayılan sıralama/tarih filtresi etkisizdi). Eski istemcilerin `orderDate`
 * göndermesi `dates.orderDate`'e eşlenir. Liste FE sipariş tablosunun sıralanabilir başlıklarını kapsar.
 */
const ORDER_SORT_FIELD_ALIASES: Record<string, string> = { orderDate: 'dates.orderDate' };
const ORDER_SORT_FIELDS: readonly string[] = [
    'dates.orderDate', 'orderNumber', 'externalOrderId', 'internalStatus', 'integrationCode', 'financials.grandTotal',
];
const DEFAULT_ORDER_SORT_FIELD = 'dates.orderDate';

export default class OrderService extends BaseApi implements IService {


    async get(): Promise<any> {
        // İleride tekil sipariş detayı çekmek için
    }

    /**
     * SİPARİŞLERİ LİSTELEME (Arama, Filtreleme, Sıralama, Sayfalama)
     */
    async getOrders(): Promise<any> {
        try {
            const searchOrderForm = this.request.searchOrderForm;
            const sort = searchOrderForm?.sort;
            const pagination = normalizePagination(searchOrderForm?.pagination, 15); // [GV-01/MM-08] limit üst sınırı, page>=1
            const filterData = searchOrderForm?.filter || {};

            // 1. Sıralama (Sort) Hazırlığı
            let direction = 1;
            const sortBy: any = {};

            if (sort && sort.field) {
                direction = sort.direction === 'asc' ? 1 : -1;
                const field = ORDER_SORT_FIELD_ALIASES[sort.field] ?? sort.field;
                if (typeof field !== 'string' || !ORDER_SORT_FIELDS.includes(field)) {
                    throw new ApplicationError('sort.field geçersiz: ' + ORDER_SORT_FIELDS.join(', ') + ' değerlerinden biri olmalıdır.', 400);
                }
                sortBy[field] = direction;
            } else {
                sortBy[DEFAULT_ORDER_SORT_FIELD] = -1; // Varsayılan en yeni siparişler
            }

            // 2. Dinamik Filtre (Match) Oluşturma
            const filterQuery: any = {};

            // 2.A - Global Search (Arama Çubuğu)
            if (filterData.globalSearch) {
                const searchRegex = containsRegex(filterData.globalSearch); // [GV-01] kaçışlı + uzunluk sınırlı
                filterQuery.$or = [
                    { orderNumber: searchRegex },
                    { externalOrderId: searchRegex },
                    { "billingAddress.firstName": searchRegex },
                    { "billingAddress.lastName": searchRegex },
                    { "billingAddress.phone": searchRegex },
                    { "fulfillment.trackingCode": searchRegex }
                ];
            }

            // 2.B - Tarih Filtreleri (Date Range)
            // [ADR-0021 D1 / GV-02] Şema alanı `dates.orderDate`. Gün sınırları sunucu (UTC) günü değil
            // platform saat dilimi (Europe/Istanbul) gününe göre hesaplanır (PLATFORM_BASELINE C5).
            if (filterData.startDate || filterData.endDate) {
                const range: any = {};
                if (filterData.startDate) {
                    const start = new Date(filterData.startDate);
                    if (isNaN(start.getTime())) throw new ApplicationError('startDate geçersiz.', 400);
                    range.$gte = startOfDayInZone(start);
                }
                if (filterData.endDate) {
                    const end = new Date(filterData.endDate);
                    if (isNaN(end.getTime())) throw new ApplicationError('endDate geçersiz.', 400);
                    range.$lte = endOfDayInZone(end); // Günün sonuna kadar
                }
                filterQuery['dates.orderDate'] = range;
            }

            // 2.C - Platform ve Statü Filtreleri (Multi Select)
            if (filterData.integrationCodes && filterData.integrationCodes.length > 0) {
                filterQuery.integrationCode = { $in: filterData.integrationCodes };
            }

            if (filterData.internalStatuses && filterData.internalStatuses.length > 0) {
                filterQuery.internalStatus = { $in: filterData.internalStatuses };
            }

            // 2.D - [N6 / ADR-0004] Kalem düzeyi rezervasyon durumu (ör. ['OVERSOLD']): en az bir kalemi bu durumlardan birinde olan siparişler.
            // Değerler beyaz listeyle doğrulanır (operatör/nesne enjeksiyonu yok); geçersiz değer => 400.
            if (filterData.allocationStates !== undefined && filterData.allocationStates !== null) {
                const states = filterData.allocationStates;
                if (!Array.isArray(states) || states.some((s: any) => typeof s !== 'string' || !ORDER_ITEM_ALLOCATION_STATES.includes(s))) {
                    throw new ApplicationError('allocationStates geçersiz: ' + ORDER_ITEM_ALLOCATION_STATES.join(', ') + ' değerlerinden oluşan bir dizi olmalıdır.', 400);
                }
                if (states.length > 0) filterQuery.items = { $elemMatch: { allocationState: { $in: states } } };
            }

            // 3. Aggregate Süreci
            const skipCount = (pagination.page - 1) * pagination.limit;

            const result = await this.clientDB.getOrderModel().aggregate([
                { $match: filterQuery },
                { $sort: sortBy },
                {
                    $facet: {
                        totalNumberOfRecords: [
                            { $count: 'count' }
                        ],
                        orders: [
                            { $skip: skipCount },
                            { $limit: pagination.limit }
                        ]
                    }
                }
            ]);

            const aggregationResult = result[0] || {};
            const totalRecords = aggregationResult.totalNumberOfRecords?.[0]?.count || 0;
            const orders = aggregationResult.orders || [];

            return {
                totalNumberOfRecords: totalRecords,
                totalNumberOfPages: Math.ceil(totalRecords / pagination.limit) || 1,
                orders: orders
            };

        } catch (error) {
            console.error('[OrderService] getOrders Hatası:', error);
            throw error;
        }
    }

    /**
     * SİPARİŞ İPTALİ (Marketplace Entegrasyonlu)
     */
    /**
         * TEKİL SİPARİŞ İPTALİ (Reject/Unsupplied)
         */
    async cancelOrder(): Promise<any> {
        try {
            const { orderId } = this.request;
            const { reason, reasonId } = this.request.cancelData || this.request;

            // 1. Önce siparişi DB'den çek
            const order = await this.clientDB.getOrderModel().findById(orderId);
            if (!order) throw new Error('Sipariş bulunamadı.');

            // 2. Factory üzerinden ilgili modülün instance'ını al
            const factory = new IntegrationFactory(Number(this.currentClientId));
            const instance = await factory.getInstance(order.integrationCode);

            // --- YENİ: Evrensel Reject Parametrelerini Hazırla ---
            const rejectParams: IOrderRejectParams = {
                reasonId: String(reasonId),
                description: reason,
                source: 'SELLER',
                // Trendyol/Amazon gibi platformlar için satırları hazırla
                lineItems: order.items.map((item: any) => ({
                    externalLineId: item.externalItemId,
                    quantity: item.quantity
                })),
                // Lojistik paket bilgilerini (packageId vb.) içeren meta'yı pasla
                meta: order.meta
            };

            // 3. PAZAR YERİ BİLDİRİMİ
            // Artık tekil parametre yerine nesne gönderiyoruz
            const marketplaceResult = await instance.rejectOrder(order.externalOrderId, rejectParams);

            if (marketplaceResult === false) {
                throw new Error('Pazar yeri iptal işlemini reddetti veya bir sorun oluştu.');
            }

            // 4. VERİTABANI GÜNCELLEME
            const lockTime = new Date();
            lockTime.setMinutes(lockTime.getMinutes() + 5);

            const updatedOrder = await this.clientDB.getOrderModel().findByIdAndUpdate(
                orderId,
                {
                    $set: {
                        internalStatus: OrderInternalStatusEnum.CANCELLED,
                        'items.$[].itemStatus': 'CANCELLED',
                        'dates.externalUpdatedAt': new Date(),
                        'dates.cancelledDate': new Date(),
                        'cancelReason': reason,
                        'cancelSource': 'SELLER',
                        platformOperation: {
                            status: 'PENDING',
                            message: 'Sipariş iptal ediliyor, pazar yeri onayı bekleniyor...',
                            lockedUntil: lockTime
                        }
                    },
                    // History logunu da eklemeyi unutmayalım
                    $push: {
                        history: {
                            status: OrderInternalStatusEnum.CANCELLED,
                            changedAt: new Date(),
                            description: `Sipariş kullanıcı tarafından iptal edildi. Sebep: ${reason}`,
                            actionBy: 'USER'
                        }
                    }
                },
                { new: true }
            );

            return {
                success: true,
                message: 'Sipariş başarıyla iptal edildi.',
                data: updatedOrder
            };
        } catch (error) {
            throw error;
        }
    }

    /**
     * TOPLU SİPARİŞ İPTALİ
     */
    async bulkCancelOrder(): Promise<any> {
        const { orderIds, cancelData } = this.request;
        const reasonId = cancelData?.reasonId;
        const reason = cancelData?.reason;

        if (!Array.isArray(orderIds) || orderIds.length === 0) {
            throw new Error("İptal edilecek sipariş seçilmedi.");
        }

        const results = {
            successCount: 0,
            failedCount: 0,
            successful: [] as any[],
            failed: [] as any[]
        };

        const instanceCache: Map<string, any> = new Map();
        const factory = new IntegrationFactory(Number(this.currentClientId));
        const lockTime = new Date();
        lockTime.setMinutes(lockTime.getMinutes() + 5);

        for (const orderId of orderIds) {
            try {
                const order = await this.clientDB.getOrderModel().findById(orderId);
                if (!order) throw new Error(`${orderId} nolu sipariş sistemde bulunamadı.`);

                let instance = instanceCache.get(order.integrationCode);
                if (!instance) {
                    instance = await factory.getInstance(order.integrationCode);
                    instanceCache.set(order.integrationCode, instance);
                }

                // --- YENİ: Her sipariş için kendi meta ve lineItem verisiyle param oluştur ---
                const rejectParams: IOrderRejectParams = {
                    reasonId: String(reasonId),
                    description: reason,
                    source: 'SELLER',
                    lineItems: order.items.map((item: any) => ({
                        externalLineId: item.externalItemId,
                        quantity: item.quantity
                    })),
                    meta: order.meta
                };

                const marketplaceResult = await instance.rejectOrder(order.externalOrderId, rejectParams);

                if (marketplaceResult === false) {
                    throw new Error('Pazar yeri bu iptal isteğine onay vermedi.');
                }

                await this.clientDB.getOrderModel().findByIdAndUpdate(
                    orderId,
                    {
                        $set: {
                            internalStatus: OrderInternalStatusEnum.CANCELLED,
                            'items.$[].itemStatus': 'CANCELLED',
                            'dates.externalUpdatedAt': new Date(),
                            'dates.cancelledDate': new Date(),
                            'cancelReason': reason,
                            'cancelSource': 'SELLER',
                            platformOperation: {
                                status: 'PENDING',
                                message: 'Sipariş toplu işlem ile iptal ediliyor...',
                                lockedUntil: lockTime
                            }
                        },
                        $push: {
                            history: {
                                status: OrderInternalStatusEnum.CANCELLED,
                                changedAt: new Date(),
                                description: `Toplu iptal işlemiyle reddedildi. Sebep: ${reason}`,
                                actionBy: 'USER'
                            }
                        }
                    }
                );

                results.successful.push({ orderId, orderNumber: order.orderNumber });
                results.successCount++;

            } catch (error: any) {
                results.failed.push({
                    orderId,
                    errorMessage: error.message || "Bilinmeyen hata"
                });
                results.failedCount++;
            }
        }

        return {
            success: results.failedCount === 0,
            message: `${results.successCount} sipariş iptal edildi, ${results.failedCount} hata alındı.`,
            data: results
        };
    }

    /**
     * SİPARİŞ ONAYLAMA (Marketplace Entegrasyonlu)
     */
    async approveOrder(): Promise<any> {
        try {
            const { orderId } = this.request;

            // 1. Siparişi çek
            const order = await this.clientDB.getOrderModel().findById(orderId);
            if (!order) throw new Error('Sipariş bulunamadı.');

            // 2. Sadece AWAITING_APPROVAL olanlar onaylanabilir (Güvenlik)
            if (order.internalStatus !== OrderInternalStatusEnum.AWAITING_APPROVAL) {
                throw new Error('Sadece "Satıcı Onayı Bekliyor" durumundaki siparişler onaylanabilir.');
            }

            // 3. Modülü al ve işlemi başlat
            const factory = new IntegrationFactory(Number(this.currentClientId));
            const instance = await factory.getInstance(order.integrationCode);

            const result = await instance.approveOrder(order.externalOrderId, {
                meta: {
                    externalLineItemId: order.items?.[0]?.externalLineItemId,
                    ...order.meta
                }
            });

            if (!result) throw new Error('Pazar yeri onay işlemini reddetti.');

            // 4. DB Güncelleme Hazırlığı
            const lockTime = new Date();
            lockTime.setMinutes(lockTime.getMinutes() + 2); // 2 dakikalık kilit

            const updateFields: any = {
                internalStatus: OrderInternalStatusEnum.APPROVED,
                'dates.externalUpdatedAt': new Date(),
                'dates.approvedDate': new Date(),
                platformOperation: {
                    status: 'PENDING',
                    message: 'Sipariş paketlendi, pazar yeri onayı ve kargo bilgileri senkronize ediliyor...',
                    lockedUntil: lockTime
                }
            };

            // --- YENİ: Eğer platform detaylı kargo bilgisi (etiket vb.) döndüyse fulfillment'ı güncelle ---
            if (typeof result === 'object' && result.success && result.rawResponse) {
                const raw = result.rawResponse;
                if (raw.barcode || raw.trackingCode || raw.labelUrl) {
                    updateFields.fulfillment = [{
                        shipmentMethod: 'MARKETPLACE',
                        status: 'PENDING',
                        trackingCode: raw.barcode || raw.trackingCode,
                        labelUrl: raw.labelUrl,
                        campaignCode: raw.packageNumber,
                        createdAt: new Date()
                    }];
                }
            }

            const updatedOrder = await this.clientDB.getOrderModel().findByIdAndUpdate(
                orderId,
                {
                    $set: updateFields,
                    $push: {
                        history: {
                            status: OrderInternalStatusEnum.APPROVED,
                            changedAt: new Date(),
                            description: 'Sipariş kullanıcı tarafından onaylandı.',
                            actionBy: 'USER'
                        }
                    }
                },
                { new: true }
            );

            return { success: true, message: 'Sipariş onaylandı.', data: updatedOrder };
        } catch (error: any) {
            throw error;
        }
    }

    /**
     * TOPLU SİPARİŞ ONAYLAMA
     */
    async bulkApproveOrder(): Promise<any> {
        const { orderIds } = this.request;
        if (!Array.isArray(orderIds) || orderIds.length === 0) throw new Error("Onaylanacak sipariş seçilmedi.");

        const results = { successCount: 0, failedCount: 0, successful: [] as any[], failed: [] as any[] };
        const factory = new IntegrationFactory(Number(this.currentClientId));
        const instanceCache = new Map<string, any>();
        const lockTime = new Date();
        lockTime.setMinutes(lockTime.getMinutes() + 5);

        for (const orderId of orderIds) {
            try {
                const order = await this.clientDB.getOrderModel().findById(orderId);
                if (!order) throw new Error('Bulunamadı.');
                if (order.internalStatus !== OrderInternalStatusEnum.AWAITING_APPROVAL) throw new Error('Statü uygun değil.');

                let instance = instanceCache.get(order.integrationCode);
                if (!instance) {
                    instance = await factory.getInstance(order.integrationCode);
                    instanceCache.set(order.integrationCode, instance);
                }

                const res = await instance.approveOrder(order.externalOrderId, {
                    meta: { externalLineItemId: order.items?.[0]?.externalLineItemId, ...order.meta }
                });

                if (!res) throw new Error('Platform reddetti.');

                await this.clientDB.getOrderModel().findByIdAndUpdate(orderId, {
                    $set: {
                        internalStatus: OrderInternalStatusEnum.APPROVED,
                        'dates.approvedDate': new Date(),
                        platformOperation: {
                            status: 'PENDING',
                            message: 'Sipariş toplu işlem ile onaylanıyor...',
                            lockedUntil: lockTime
                        }
                    },
                    $push: {
                        history: {
                            status: OrderInternalStatusEnum.APPROVED,
                            changedAt: new Date(),
                            description: 'Toplu onay işlemiyle onaylandı.',
                            actionBy: 'USER'
                        }
                    }
                });

                results.successful.push({ orderId, orderNumber: order.orderNumber });
                results.successCount++;
            } catch (error: any) {
                results.failed.push({ orderId, errorMessage: error.message });
                results.failedCount++;
            }
        }

        return {
            success: results.failedCount === 0,
            message: `${results.successCount} sipariş onaylandı, ${results.failedCount} hata.`,
            data: results
        };
    }

    /**
     * BARKOD YAZDIRILDI İŞARETLEMESİ
     */
    async markAsPrinted(): Promise<any> {
        try {
            const { orderId } = this.request;

            const updatedOrder = await this.clientDB.getOrderModel().findByIdAndUpdate(
                orderId,
                {
                    $set: { 'flags.isBarcodePrinted': true },
                    $push: {
                        platformActions: {
                            actionType: 'BARCODE_PRINT',
                            platform: 'SYSTEM',
                            status: 'SUCCESS',
                            requestPayload: { printedAt: new Date() },
                            responsePayload: { message: "Barkod başarıyla yazdırıldı." },
                            createdAt: new Date()
                        }
                    }
                },
                { new: true }
            );

            return {
                success: true,
                message: 'Barkod basıldı olarak işaretlendi.',
                data: updatedOrder
            };
        } catch (error) {
            throw error;
        }
    }

    /**
     * SİPARİŞ İPTAL NEDENLERİNİ GETİR (Pazaryerine Özgü)
     */
    async getOrderRejectionReasons(): Promise<any> {
        try {
            const { integrationCode } = this.request;

            // Factory üzerinden ilgili modülün instance'ını al
            const factory = new IntegrationFactory(Number(this.currentClientId));
            const instance = await factory.getInstance(integrationCode);

            // Modülün kendi içindeki retrieveOrderRejectionReasons metodunu çağır
            const reasons = await instance.retrieveOrderRejectionReasons();

            return {
                success: true,
                message: 'İptal nedenleri başarıyla getirildi.',
                data: reasons
            };
        } catch (error: any) {
            throw error;
        }
    }

    /**
     * DASHBOARD: Kapsamlı İş Analitiği
     * Paralel sorgular ile: toplam ciro, sipariş sayısı, iade, bekleyen fatura/kargo,
     * bekleyen claim, bekleyen mesaj, son 7 gün sparkline.
     */
    async getOrderDashboardInsights(): Promise<any> {
        try {
            const orderModel = this.clientDB.getOrderModel();
            const claimModel = this.clientDB.getClaimModel();
            const messageModel = this.clientDB.getMessageModel();

            // [ADR-0021 D1 / GV-03] "Bugün/dün/7 gün" sınırları platform saat dilimi (Europe/Istanbul) gününe göre;
            // sunucu saat dilimi (konteynerde UTC) sınırı 3 saat kaydırıyordu.
            const now = new Date();
            const todayStart = startOfDayInZone(now);
            const yesterdayStart = addDaysInZone(todayStart, -1);
            const sevenDaysAgo = addDaysInZone(todayStart, -6);

            const [
                statusDistResult,
                totalRevenueResult,
                dailyResult,
                todayResult,
                yesterdayResult,
                returnResult,
                pendingInvoiceCount,
                pendingShippingCount,
                pendingClaimCount,
                pendingMessageCount
            ] = await Promise.all([

                // 1. Tüm zamanlar: Durum dağılımı
                orderModel.aggregate([
                    { $group: { _id: '$internalStatus', count: { $sum: 1 } } }
                ]),

                // 2. Tüm zamanlar: Toplam ciro (iptal edilmeyenler)
                orderModel.aggregate([
                    { $match: { internalStatus: { $nin: ['CANCELLED'] } } },
                    {
                        $group: {
                            _id: null,
                            totalRevenue: { $sum: '$financials.grandTotal' },
                            totalCount: { $sum: 1 }
                        }
                    }
                ]),

                // 3. Son 7 gün: Günlük sipariş + ciro (sparkline)
                orderModel.aggregate([
                    { $match: { 'dates.orderDate': { $gte: sevenDaysAgo } } },
                    {
                        $group: {
                            _id: {
                                year: { $year: { date: '$dates.orderDate', timezone: PLATFORM_TIME_ZONE } },
                                month: { $month: { date: '$dates.orderDate', timezone: PLATFORM_TIME_ZONE } },
                                day: { $dayOfMonth: { date: '$dates.orderDate', timezone: PLATFORM_TIME_ZONE } }
                            },
                            count: { $sum: 1 },
                            revenue: { $sum: '$financials.grandTotal' }
                        }
                    },
                    { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
                ]),

                // 4. Bugün
                orderModel.aggregate([
                    { $match: { 'dates.orderDate': { $gte: todayStart } } },
                    {
                        $group: {
                            _id: null,
                            count: { $sum: 1 },
                            revenue: { $sum: '$financials.grandTotal' }
                        }
                    }
                ]),

                // 5. Dün
                orderModel.aggregate([
                    { $match: { 'dates.orderDate': { $gte: yesterdayStart, $lt: todayStart } } },
                    {
                        $group: {
                            _id: null,
                            count: { $sum: 1 },
                            revenue: { $sum: '$financials.grandTotal' }
                        }
                    }
                ]),

                // 6. İade: toplam sayı ve iade tutarı (RETURNED siparişler + tüm claim tutarları)
                claimModel.aggregate([
                    { $match: { internalStatus: { $nin: ['CANCELLED', 'REJECTED'] } } },
                    {
                        $group: {
                            _id: null,
                            totalReturnCount: { $sum: 1 },
                            totalReturnAmount: { $sum: '$totalRefundAmount' }
                        }
                    }
                ]),

                // 7. Fatura bekleyen sipariş sayısı (APPROVED ama fatura henüz kesilmemiş)
                orderModel.countDocuments({
                    internalStatus: 'APPROVED',
                    'flags.isInvoiceGenerated': { $ne: true }
                }),

                // 8. Kargo bekleyen sipariş sayısı (Onaylı ama kargoya verilmemiş)
                orderModel.countDocuments({
                    internalStatus: 'APPROVED'
                }),

                // 9. İşlem bekleyen claim sayısı
                claimModel.countDocuments({
                    internalStatus: { $in: ['WAITING', 'SHIPPED', 'DELIVERED'] }
                }),

                // 10. Bekleyen mesaj sayısı (henüz cevaplanmamış)
                messageModel.countDocuments({
                    status: 'WAITING_SELLER',
                    isRejected: { $ne: true }
                })
            ]);

            // ── Hesaplamalar ──
            const statusMap: Record<string, number> = {};
            for (const s of statusDistResult) statusMap[s._id] = s.count;

            const totalStats = totalRevenueResult[0] ?? { totalRevenue: 0, totalCount: 0 };

            const dailyMap: Record<string, { count: number; revenue: number }> = {};
            for (const d of dailyResult) {
                const key = `${d._id.year}-${String(d._id.month).padStart(2, '0')}-${String(d._id.day).padStart(2, '0')}`;
                dailyMap[key] = { count: d.count, revenue: d.revenue };
            }

            const last7Days = [];
            for (let i = 6; i >= 0; i--) {
                const key = dayKeyInZone(addDaysInZone(todayStart, -i));
                last7Days.push({ date: key, count: dailyMap[key]?.count ?? 0, revenue: dailyMap[key]?.revenue ?? 0 });
            }

            const today = todayResult[0] ?? { count: 0, revenue: 0 };
            const yesterday = yesterdayResult[0] ?? { count: 0, revenue: 0 };
            const returns = returnResult[0] ?? { totalReturnCount: 0, totalReturnAmount: 0 };

            const countTrend = yesterday.count > 0 ? Math.round(((today.count - yesterday.count) / yesterday.count) * 100) : (today.count > 0 ? 100 : 0);
            const revenueTrend = yesterday.revenue > 0 ? Math.round(((today.revenue - yesterday.revenue) / yesterday.revenue) * 100) : (today.revenue > 0 ? 100 : 0);

            return {
                // ── Toplam (tüm zamanlar) ──
                totals: {
                    orderCount: totalStats.totalCount,
                    revenue: totalStats.totalRevenue,
                    returnCount: returns.totalReturnCount,
                    returnAmount: returns.totalReturnAmount
                },
                // ── Bugün ──
                today: { count: today.count, revenue: today.revenue },
                // ── Trend (dünle kıyaslama) ──
                trend: { countChange: countTrend, revenueChange: revenueTrend },
                // ── Durum kırılımı ──
                statusDistribution: {
                    UNAPPROVED: statusMap['UNAPPROVED'] ?? 0,
                    AWAITING_APPROVAL: statusMap['AWAITING_APPROVAL'] ?? 0,
                    APPROVED: statusMap['APPROVED'] ?? 0,
                    SHIPPED: statusMap['SHIPPED'] ?? 0,
                    DELIVERED: statusMap['DELIVERED'] ?? 0,
                    CANCELLED: statusMap['CANCELLED'] ?? 0,
                    RETURNED: statusMap['RETURNED'] ?? 0,
                    total: Object.values(statusMap).reduce((a, b) => a + b, 0)
                },
                // ── Bekleyen aksiyonlar ──
                pending: {
                    invoiceCount: pendingInvoiceCount,   // Fatura kesilmesi gereken
                    shippingCount: pendingShippingCount,  // Kargoya verilmesi gereken
                    claimCount: pendingClaimCount,     // İşlem bekleyen iade
                    messageCount: pendingMessageCount    // Cevaplanmamış soru
                },
                // ── Sparkline ──
                last7Days
            };

        } catch (error) {
            throw error;
        }
    }
}
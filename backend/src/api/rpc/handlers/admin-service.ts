import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { DatabaseManagerInstance } from "@database/DatabaseManager";
import { buildCacheDump } from "../cacheDump";
import { RedisService } from "@services/redis/RedisService";
import { ApplicationError } from '@platform/core/security/Security';
import { TenantProvisioningService } from '@operations/tenant/TenantProvisioningService';
import { createTenantLifecycleService } from '../tenantLifecycleFactory';
import { toClientDto, CLIENT_SAFE_PROJECTION, CLIENT_SORT_FIELDS } from '../dto/clientDto';
import { maskIntegrationItem } from '@platform/core/security/integrationSecrets';
import { nextSequence } from '@utils/sequence';
import { containsRegex, clampPage, clampLimit, pickSortField } from '@utils/search';
import { TICKET_SORT_FIELDS } from '../listSortFields';
import { getTenantRegistry } from '@database/TenantRegistry';
import { getIdentityCache } from '@platform/core/security/identityCache';
import { eventLog } from '@platform/core/logger';

const log = eventLog('api', 'admin-service');

/**
 * AdminService
 * Merkezi yönetim opsiyonları, dükkan (client) analitiği ve teknik destek süreçlerini yönetir.
 */
export default class AdminService extends BaseApi implements IService {

    async get() {

    }

    /**
     * getClients
     * Tüm aktif ve pasif dükkanların listesini merkezi veritabanından döner.
     */
    async getClients(): Promise<any> {
        try {
            const { search, sortOrder = 1 } = this.request;
            const page = clampPage(this.request.page); // [GV-01/MM-08]
            const limit = clampLimit(this.request.limit, 50, 1000); // FE (AdminTicketListView) müşteri seçimi için limit 1000 kullanır
            // ADR-0003 D: sıralama alanı beyaz listeden (dbConfig.* gibi kimlik alanları sıralama oracle'ı olamaz)
            const sortField = (CLIENT_SORT_FIELDS as readonly string[]).includes(this.request.sortField) ? this.request.sortField : 'order';
            const query: any = {};

            if (search) {
                const s = search.toLowerCase();
                query.$or = [
                    { name: containsRegex(s) }, // [GV-01]
                    { title: containsRegex(s) }
                ];
                if (!isNaN(Number(search))) {
                    query.$or.push({ order: Number(search) });
                }
            }

            const skip = (Number(page) - 1) * Number(limit);
            const sort: any = {};
            sort[sortField] = Number(sortOrder);

            const [clients, total] = await Promise.all([
                // ADR-0003 D.15: dbConfig/depolama anahtarları sorguda hiç çekilmez (+ DTO ile ikinci savunma)
                this.applicationDB.getClientModel().find(query).select(CLIENT_SAFE_PROJECTION).sort(sort).skip(skip).limit(Number(limit)).lean(),
                this.applicationDB.getClientModel().countDocuments(query)
            ]);

            return {
                success: true,
                clients: clients.map(toClientDto),
                total,
                page: Number(page),
                limit: Number(limit)
            };
        } catch (error) {
            log.error('ADMIN_GET_CLIENTS_FAILED', '[AdminService] getClients hatası', { err: error });
            throw error;
        }
    }

    /**
     * getClientStats
     * Belirli bir dükkanın veritabanına bağlanarak anlık istatistiklerini (ürün, sipariş, claim) toplar.
     */
    async getClientStats(): Promise<any> {
        try {
            const { targetClientId } = this.request;
            if (!targetClientId) throw new Error('targetClientId gereklidir.');

            // Dinamik olarak hedef client veritabanına bağlanıyoruz
            const targetDB = await DatabaseManagerInstance.getClientDB(Number(targetClientId));
            if (!targetDB) throw new Error('Hedef dükkan veritabanı bulunamadı.');

            // Koşut olarak verileri topluyoruz
            const [productCount, variantCount, orderCount, claimCount, userCount] = await Promise.all([
                targetDB.getProductModel().countDocuments({}),
                targetDB.getVariantModel().countDocuments({}),
                targetDB.getOrderModel().countDocuments({}),
                targetDB.getClaimModel().countDocuments({}),
                targetDB.getUserModel().countDocuments({})
            ]);

            // Toplam Ciro ve İadesi (Statistics modelinden veya Orders üzerinden)
            const stats: any = await targetDB.getStatisticsModel().findOne({}).sort({ createdAt: -1 }).lean();

            return {
                success: true,
                metrics: {
                    productCount,
                    variantCount,
                    orderCount,
                    claimCount,
                    userCount,
                    totalRevenue: stats?.totalOrderAmount || 0,
                    totalReturnAmount: stats?.totalReturnAmount || 0
                }
            };
        } catch (error) {
            log.error('ADMIN_GET_CLIENT_STATS_FAILED', '[AdminService] getClientStats hatası', { err: error });
            throw error;
        }
    }

    /**
     * getClientIntegrations
     * Dükkanın aktif entegrasyonlarını ve durumlarını döner.
     */
    async getClientIntegrations(): Promise<any> {
        try {
            const { targetClientId } = this.request;
            if (!targetClientId) throw new Error('targetClientId gereklidir.');

            const targetDB = await DatabaseManagerInstance.getClientDB(Number(targetClientId));
            if (!targetDB) throw new Error('Hedef dükkan veritabanı bulunamadı.');

            const integrations = await targetDB.getClientIntegrationModel().find({ isActive: true }).lean();

            // ADR-0003 D.15/D.16: entegrasyon sırları yanıtta maskelenir
            return {
                success: true,
                integrations: integrations.map(maskIntegrationItem)
            };
        } catch (error) {
            log.error('ADMIN_GET_CLIENT_INTEGRATIONS_FAILED', '[AdminService] getClientIntegrations hatası', { err: error });
            throw error;
        }
    }

    /**
     * getGlobalMetrics
     * Sistem genelindeki Export ve Import işlemlerinin başarı/hata oranlarını merkezi DB'den toplar.
     */
    async getGlobalMetrics(): Promise<any> {
        try {
            const { targetClientId } = this.request;
            const query: any = {};
            if (targetClientId) query.clientId = Number(targetClientId);

            const exports = await this.applicationDB.getExportSignalModel().aggregate([
                { $match: query },
                { $group: { _id: "$status", count: { $sum: 1 } } }
            ]);

            const imports = await this.applicationDB.getImportJobModel().aggregate([
                { $match: query },
                { $group: { _id: "$status", count: { $sum: 1 } } }
            ]);

            return {
                success: true,
                exports,
                imports
            };
        } catch (error) {
            log.error('ADMIN_GET_GLOBAL_METRICS_FAILED', '[AdminService] getGlobalMetrics hatası', { err: error });
            throw error;
        }
    }

    /**
     * getTickets
     * Destek taleplerini filtreli bir şekilde döner.
     */
    async getTickets(): Promise<any> {
        try {
            const { status, type, search, sortField = 'lastMessageAt', sortOrder = -1 } = this.request;
            const page = clampPage(this.request.page); // [GV-01/MM-08]
            const limit = clampLimit(this.request.limit, 50);
            const query: any = {};
            if (status && status !== 'ALL') query.status = status;
            if (type) query.type = type;

            if (search) {
                const s = search.toLowerCase();
                query.$or = [
                    { subject: containsRegex(s) }, // [GV-01]
                    { ticketNumber: containsRegex(s) },
                    { lastMessageSnippet: containsRegex(s) }
                ];
                if (!isNaN(Number(search))) {
                    query.$or.push({ clientId: Number(search) });
                }
            }

            const skip = (Number(page) - 1) * Number(limit);
            const sort: any = {};
            // [DB-02] sıralama alanı izin listesi; bilinmeyen alan => lastMessageAt
            sort[pickSortField(sortField, TICKET_SORT_FIELDS, 'lastMessageAt').field] = Number(sortOrder) === 1 ? 1 : -1;

            const [tickets, total] = await Promise.all([
                this.applicationDB.getTicketModel().find(query).sort(sort).skip(skip).limit(Number(limit)).lean(),
                this.applicationDB.getTicketModel().countDocuments(query)
            ]);

            return {
                success: true,
                tickets,
                total,
                page: Number(page),
                limit: Number(limit)
            };
        } catch (error) {
            log.error('ADMIN_GET_TICKETS_FAILED', '[AdminService] getTickets hatası', { err: error });
            throw error;
        }
    }

    async createTicket(): Promise<any> {
        try {
            const { targetClientId, subject, content, priority = 'MEDIUM', type = 'GENERAL' } = this.request;
            if (!targetClientId || !subject || !content) throw new Error('Eksik bilgi: targetClientId, subject ve content gereklidir.');

            // [ADR-0021 D5] Math.random 6 hane çakışabilirdi (ticketNumber unique -> E11000). Atomik `Counters` sayacı
            // ('ticket_number', TicketService ile ortak): sıralı, tekrarsız. Biçim değişmez: 6 haneli sayı
            // (admin FE `TKT-${ticketNumber}` gösterir; tenant tarafı `TKT-<1000+seq>` biçimindedir, iki desen çakışmaz).
            const ticketNumber = String(100000 + await nextSequence(this.applicationDB.getCounterModel(), 'ticket_number'));

            const ticketPayload = {
                ticketNumber,
                clientId: Number(targetClientId),
                subject,
                type,
                priority,
                status: 'OPEN',
                createdDate: Date.now(),
                updatedDate: Date.now(),
                lastMessageAt: Date.now(),
                lastMessageSnippet: content.substring(0, 100),
                messages: [{
                    senderType: 'SUPPORT',
                    senderId: 'admin',
                    senderName: 'Sistem Yöneticisi',
                    content,
                    date: Date.now()
                }]
            };

            const res = await this.applicationDB.getTicketModel().create(ticketPayload);

            return { success: true, ticket: res };
        } catch (error) {
            log.error('ADMIN_CREATE_TICKET_FAILED', '[AdminService] createTicket hatası', { err: error });
            throw error;
        }
    }

    async deleteTicket(): Promise<any> {
        try {
            const { ticketId } = this.request;
            if (!ticketId) throw new Error('ticketId gereklidir.');

            await this.applicationDB.getTicketModel().findByIdAndDelete(ticketId);

            return { success: true, message: 'Talep başarıyla silindi.' };
        } catch (error) {
            log.error('ADMIN_DELETE_TICKET_FAILED', '[AdminService] deleteTicket hatası', { err: error });
            throw error;
        }
    }


    /**
     * getSystemHealth
     * Platform genelindeki tüm dükkanlardan bağımsız sistem sağlığı verilerini toplar.
     */
    async getSystemHealth(): Promise<any> {
        try {
            const { timeFrame, targetClientId } = this.request; // DAY, WEEK, MONTH, ALL, targetClientId
            let startDate: Date | null = new Date(Date.now() - 24 * 60 * 60 * 1000); // Default DAY
            if (timeFrame === 'WEEK') startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            else if (timeFrame === 'MONTH') startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            else if (timeFrame === 'ALL') startDate = null;

            const trafficFilter: any = {};
            if (targetClientId) trafficFilter.clientId = Number(targetClientId);

            const trafficQuery: any = { ...trafficFilter };
            if (startDate) {
                trafficQuery.updatedAt = { $gte: startDate };
            }

            // 1. Global İş Trafiği (Filtrelenmiş)
            const [exportStatsRaw, importStatsRaw] = await Promise.all([
                this.applicationDB.getExportSignalModel().aggregate([
                    { $match: trafficQuery },
                    { $group: { _id: "$status", count: { $sum: 1 } } }
                ]),
                this.applicationDB.getImportJobModel().aggregate([
                    { $match: startDate ? { ...trafficFilter, updatedAt: { $gte: startDate } } : trafficFilter },
                    { $group: { _id: "$status", count: { $sum: 1 } } }
                ])
            ]);

            const exportStats = exportStatsRaw || [];
            const importStats = importStatsRaw || [];

            // 1.1 Export Flag (Sinyal Kuyruğu) Verisi - Gerçek Zamanlı Kuyruk
            const flagFilter: any = {};
            if (targetClientId) flagFilter.clientId = String(targetClientId);
            const exportFlags = await this.applicationDB.getExportFlagModel().find(flagFilter).lean();
            const flagQueuedCount = exportFlags.reduce((sum: number, f: any) => sum + (f.queuedCount || 0), 0);
            
            // UI'da "Bekleyen" olarak görünmesi için listeye ekliyoruz (Global trafik için)
            if (flagQueuedCount > 0) {
                const existingQueued = exportStats.find((s: any) => s._id === 'QUEUED');
                if (existingQueued) existingQueued.count += flagQueuedCount;
                else exportStats.push({ _id: 'QUEUED', count: flagQueuedCount });
            }

            // 1.2 Import Kuyruğu (Global trafik için)
            const importQueuedCount = await this.applicationDB.getImportJobModel().countDocuments({ ...trafficFilter, status: 'QUEUED' });

            // 2. Aktif Calışanlar (Podlar) - Son 15 dakikada işlem yapmış olanlar
            const podThreshold = new Date(Date.now() - 15 * 60 * 1000);
            const [activeExportWorkers, activeImportWorkers] = await Promise.all([
                this.applicationDB.getExportSignalModel().distinct('lockedBy', { 
                    lockedBy: { $ne: null },
                    updatedAt: { $gte: podThreshold }
                }),
                this.applicationDB.getImportJobModel().distinct('lockedBy', { 
                    lockedBy: { $ne: null },
                    updatedAt: { $gte: podThreshold }
                })
            ]);

            const uniquePods = Array.from(new Set([...activeExportWorkers, ...activeImportWorkers]))
                .filter(p => p && typeof p === 'string')
                .map(p => p.trim());

            // 3. Redis & Cache Bilgileri
            const redisClient = RedisService.getInstance();
            const redisInfoRaw = await redisClient.info();

            const redisMetrics = {
                usedMemory: redisInfoRaw.match(/used_memory_human:([^\r\n]*)/)?.[1]?.trim() || 'Unknown',
                connectedClients: redisInfoRaw.match(/connected_clients:([^\r\n]*)/)?.[1]?.trim() || '0',
                uptime: redisInfoRaw.match(/uptime_in_seconds:([^\r\n]*)/)?.[1]?.trim() || '0',
                version: redisInfoRaw.match(/redis_version:([^\r\n]*)/)?.[1]?.trim() || 'Unknown'
            };

            const waitCount = await redisClient.llen('bull:order-sync-queue:wait').catch(() => 0);
            let activeCount = 0;
            try {
                activeCount = await redisClient.llen('bull:order-sync-queue:active').catch(() => 0);
                if (activeCount === 0) {
                    activeCount = await redisClient.zcard('bull:order-sync-queue:active').catch(() => 0);
                }
            } catch(e) {}

            // Diğer kuyrukların da bilgisini ekliyoruz
            const exportActiveCount = await this.applicationDB.getExportSignalModel().countDocuments({ ...trafficFilter, lockedBy: { $ne: null } });
            const importActiveCount = await this.applicationDB.getImportJobModel().countDocuments({ ...trafficFilter, lockedBy: { $ne: null } });

            // 4. Bellek Cache (NodeCache) İstatistikleri ve Detayı
            // WP10: aile bazında sayılar; ham anahtar/tenant kimliği yanıta girmez (bkz. cacheDump.ts).
            const cacheDump = buildCacheDump();

            // 5. En Aktif 5 Müşteri (Ayrı Ayrı Export ve Import) - Filtrelenebilir
            const aggregateActivity = async (model: any, dateField: string = 'createdAt') => {
                const pipeline: any[] = [];

                // Match logic
                const matchStage: any = {};
                if (startDate) matchStage[dateField] = { $gte: startDate };
                if (targetClientId) matchStage.clientId = Number(targetClientId);

                if (Object.keys(matchStage).length > 0) {
                    pipeline.push({ $match: matchStage });
                }

                pipeline.push({
                    $group: {
                        _id: {
                            clientId: "$clientId",
                            status: "$status"
                        },
                        count: { $sum: 1 }
                    }
                });

                const raw = await model.aggregate(pipeline);

                // Pivot data by clientId
                const clients: Record<number, any> = {};
                raw.forEach((item: any) => {
                    const cid = Number(item._id.clientId);
                    if (isNaN(cid)) return;

                    if (!clients[cid]) clients[cid] = { total: 0, completed: 0, pending: 0, failed: 0 };
                    clients[cid].total += item.count;

                    const s = item._id.status?.toUpperCase();
                    if (['COMPLETED', 'SUCCESS'].includes(s)) clients[cid].completed += item.count;
                    else if (['FAILED', 'CANCELLED', 'ERROR', 'FAILED_LOG'].includes(s)) clients[cid].failed += item.count;
                    else clients[cid].pending += item.count;
                });

                const sortedIds = Object.entries(clients)
                    .sort((a: any, b: any) => b[1].total - a[1].total)
                    .slice(0, targetClientId ? 1 : 5) // Specific client selected -> only 1 store
                    .map(([id]) => Number(id));

                if (sortedIds.length === 0) return [];

                const clientDetails = await this.applicationDB.getClientModel().find({ clientId: { $in: sortedIds } }).select('clientId title').lean();

                return sortedIds.map(id => {
                    const detail = clientDetails.find((c: any) => Number(c.clientId) === id);
                    return {
                        name: detail?.title || `Store #${id}`,
                        data: clients[id]
                    };
                });
            };

            // 5. Operation Log Insights (New)
            const opLogQuery: any = { ...trafficFilter };
            if (startDate) opLogQuery.startedAt = { $gte: startDate };

            const [opTypeStats, opStatusStats, opTimeline, opOverallMetrics] = await Promise.all([
                // Distribution by type
                this.applicationDB.getOperationLogModel().aggregate([
                    { $match: opLogQuery },
                    { $group: { _id: "$operationType", count: { $sum: 1 }, avgDuration: { $avg: "$durationMs" } } }
                ]),
                // Success vs Failure
                this.applicationDB.getOperationLogModel().aggregate([
                    { $match: opLogQuery },
                    { $group: { _id: "$status", count: { $sum: 1 } } }
                ]),
                // Timeline
                this.applicationDB.getOperationLogModel().aggregate([
                    { $match: opLogQuery },
                    {
                        $group: {
                            _id: { $dateToString: { format: "%Y-%m-%d", date: "$startedAt" } },
                            success: { $sum: { $cond: [{ $eq: ["$status", "SUCCESS"] }, 1, 0] } },
                            failed: { $sum: { $cond: [{ $eq: ["$status", "FAILED"] }, 1, 0] } },
                            partial: { $sum: { $cond: [{ $eq: ["$status", "PARTIAL"] }, 1, 0] } }
                        }
                    },
                    { $sort: { "_id": 1 } }
                ]),
                // Overall record metrics
                this.applicationDB.getOperationLogModel().aggregate([
                    { $match: opLogQuery },
                    {
                        $group: {
                            _id: null,
                            totalFetched: { $sum: "$fetched" },
                            totalInserted: { $sum: "$inserted" },
                            totalUpdated: { $sum: "$updated" },
                            totalFailed: { $sum: "$failed" },
                            totalSkipped: { $sum: "$skipped" },
                            avgDuration: { $avg: "$durationMs" }
                        }
                    }
                ])
            ]);

            const [topExports, topImports, allClientsListRaw] = await Promise.all([
                aggregateActivity(this.applicationDB.getExportSignalModel(), 'updatedAt'),
                aggregateActivity(this.applicationDB.getImportJobModel(), 'updatedAt'),
                this.applicationDB.getClientModel().find({}).select('clientId title').sort({ title: 1 }).lean()
            ]);

            const allClientsList = allClientsListRaw.map((c: any) => ({
                clientId: Number(c.clientId),
                title: c.title
            }));

            return {
                success: true,
                clients: allClientsList,
                traffic: {
                    exports: exportStats,
                    imports: importStats
                },
                infrastructure: {
                    activePods: uniquePods,
                    redis: redisMetrics,
                    queues: {
                        orderSync: { wait: waitCount, active: activeCount },
                        export: { wait: flagQueuedCount, active: exportActiveCount },
                        import: { wait: importQueuedCount, active: importActiveCount }
                    },
                    memoryCache: cacheDump,
                    topExports,
                    topImports
                },
                operationInsights: {
                    types: opTypeStats,
                    statuses: opStatusStats,
                    timeline: opTimeline,
                    metrics: opOverallMetrics[0] || { totalFetched: 0, totalInserted: 0, totalUpdated: 0, totalFailed: 0, totalSkipped: 0, avgDuration: 0 }
                }
            };
        } catch (error) {
            log.error('ADMIN_GET_SYSTEM_HEALTH_FAILED', '[AdminService] getSystemHealth hatası', { err: error });
            throw error;
        }
    }

    /**
     * replyToTicket
     * Bir destek talebine admin tarafından cevap ekler.
     */
    async replyToTicket(): Promise<any> {
        try {
            const { ticketId, content, adminId, adminName } = this.request;
            if (!ticketId || !content) throw new Error('Eksik bilgi: ticketId ve content gereklidir.');

            const newMessage = {
                senderType: 'SUPPORT',
                senderId: adminId || 'admin',
                senderName: adminName || 'Sistem Yöneticisi',
                content,
                date: Date.now()
            };

            await this.applicationDB.getTicketModel().findByIdAndUpdate(ticketId, {
                $push: { messages: newMessage },
                $set: {
                    lastMessageAt: Date.now(),
                    lastMessageSnippet: content.substring(0, 100),
                    status: 'RESOLVED' // Admin cevap verince resolved veya in_progress olabilir
                }
            });

            return { success: true, message: 'Cevap başarıyla iletildi.' };
        } catch (error) {
            log.error('ADMIN_REPLY_TO_TICKET_FAILED', '[AdminService] replyToTicket hatası', { err: error });
            throw error;
        }
    }

    /**
     * getExportDetails
     * Export sinyallerinin detaylı listesini filtreli bir şekilde döner.
     */
    async getExportDetails(): Promise<any> {
        try {
            const { status, mode, integrationCode, targetClientId, sortField = 'createdAt', sortOrder = -1, timeFrame } = this.request;
            const page = clampPage(this.request.page); // [GV-01/MM-08]
            const limit = clampLimit(this.request.limit, 50);
            const query: any = {};

            if (status) query.status = status;
            if (mode) query.mode = mode;
            if (integrationCode) query.integrationCode = integrationCode;
            if (targetClientId) query.clientId = Number(targetClientId);

            // Timeframe filtering
            if (timeFrame && timeFrame !== 'ALL') {
                let startDate = new Date();
                if (timeFrame === 'DAY') startDate.setHours(0, 0, 0, 0);
                else if (timeFrame === 'WEEK') startDate.setDate(startDate.getDate() - 7);
                else if (timeFrame === 'MONTH') startDate.setMonth(startDate.getMonth() - 1);
                query.createdAt = { $gte: startDate };
            }

            const skip = (Number(page) - 1) * Number(limit);
            const sort: any = {};
            sort[sortField] = Number(sortOrder);

            const [exports, total, timeline, modeStats, statusStats] = await Promise.all([
                this.applicationDB.getExportSignalModel()
                    .find(query)
                    .sort(sort)
                    .skip(skip)
                    .limit(Number(limit))
                    .lean(),
                this.applicationDB.getExportSignalModel().countDocuments(query),
                // 1. Timeline Aggregation
                this.applicationDB.getExportSignalModel().aggregate([
                    { $match: query },
                    {
                        $group: {
                            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                            itemCount: { $sum: "$itemCount" }
                        }
                    },
                    { $sort: { "_id": 1 } }
                ]),
                // 2. Mode (Process Type) Distribution
                this.applicationDB.getExportSignalModel().aggregate([
                    { $match: query },
                    {
                        $group: {
                            _id: "$mode",
                            value: { $sum: "$itemCount" }
                        }
                    }
                ]),
                // 3. Status Distribution
                this.applicationDB.getExportSignalModel().aggregate([
                    { $match: query },
                    {
                        $group: {
                            _id: "$status",
                            value: { $sum: "$itemCount" }
                        }
                    }
                ])
            ]);

            // Client isimlerini çekelim
            const clientIds = Array.from(new Set(exports.map((e: any) => e.clientId)));
            const clients = await this.applicationDB.getClientModel()
                .find({ clientId: { $in: clientIds } })
                .select('clientId title')
                .lean();

            const clientMap = new Map(clients.map((c: any) => [c.clientId, c.title]));

            const data = exports.map((e: any) => ({
                ...e,
                clientName: clientMap.get(e.clientId) || `Store #${e.clientId}`
            }));

            return {
                success: true,
                data,
                total,
                page: Number(page),
                limit: Number(limit),
                analytics: {
                    timeline: timeline.map((t: any) => ({ date: t._id, value: t.itemCount })),
                    modes: modeStats.map((m: any) => ({ name: m._id, value: m.value })),
                    statuses: statusStats.map((s: any) => ({ name: s._id, value: s.value }))
                }
            };
        } catch (error) {
            log.error('ADMIN_GET_EXPORT_DETAILS_FAILED', '[AdminService] getExportDetails hatası', { err: error });
            throw error;
        }
    }
    /**
     * ADR-0003 Karar A: tenant oluşturma TenantProvisioningService'e devredilir (register ile aynı tek akış).
     * İstemci `clientData`/`userData` nesneleri modele YAYILMAZ; yalnızca açık alanlar (mağaza adı, ad, soyad, e-posta, parola) iletilir.
     */
    async createClient(): Promise<any> {
        try {
            const { clientData, userData } = this.request;
            if (!clientData || !userData) throw new ApplicationError('Eksik bilgi (clientData veya userData).', 400);

            // FE (AdminClientCreateComponent) ad/soyad yerine `fullName` gönderir: son sözcük soyad, kalanı ad
            let name = userData.name;
            let surname = userData.surname;
            if ((name === undefined || surname === undefined) && typeof userData.fullName === 'string') {
                const parts = userData.fullName.trim().split(/\s+/).filter(Boolean);
                if (parts.length >= 2) {
                    surname = surname ?? parts[parts.length - 1];
                    name = name ?? parts.slice(0, -1).join(' ');
                } else if (parts.length === 1) {
                    name = name ?? parts[0];
                }
            }

            const provisioning = new TenantProvisioningService({ applicationDB: this.applicationDB });
            const result = await provisioning.provision({
                name,
                surname,
                email: userData.email,
                password: userData.password,
                storeName: clientData.title || clientData.name,
            }, { ip: this.request.requestMeta?.ip });

            return { success: true, client: toClientDto(result.client) };
        } catch (error: any) {
            log.error('ADMIN_CREATE_CLIENT_FAILED', '[AdminService] createClient hatası', { err: error });
            throw error;
        }
    }

    /**
     * ADR-0003 A.1: yalnızca `title`, `status`, `integrations` güncellenir. `dbConfig`, `order`, `clientId`, depolama (archive/image)
     * ve diğer tüm alanlar API'den DEĞİŞTİRİLEMEZ (istekte olsalar bile yok sayılır).
     */
    async updateClient(): Promise<any> {
        try {
            const { targetClientId, clientData } = this.request;
            if (!targetClientId) throw new Error('targetClientId gereklidir.');

            const $set: any = {};
            const src = clientData && typeof clientData === 'object' ? clientData : {};
            if (typeof src.title === 'string') $set.title = src.title;
            // Yaşam döngüsü durumları (PROVISIONING*, DELETION_PENDING, PURGED) API'den atanamaz; yalnızca yönetici panelinin ACTIVE/PASSIVE seçimi
            if (src.status === 'ACTIVE' || src.status === 'PASSIVE') $set.status = src.status;
            if (src.integrations !== undefined && src.integrations !== null && typeof src.integrations === 'object') $set.integrations = src.integrations;

            const res = await this.applicationDB.getClientModel().findOneAndUpdate(
                { order: Number(targetClientId) },
                { $set },
                { new: true }
            );
            // ADR-0024 P1-CORE: status ACTIVE<->PASSIVE değişimi TenantRegistry/kimlik önbelleğinde 30 sn bayat kalmasın
            getTenantRegistry().invalidate(Number(targetClientId));
            getIdentityCache().invalidateTenant(Number(targetClientId));

            return { success: true, client: toClientDto(res) };
        } catch (error) {
            log.error('ADMIN_UPDATE_CLIENT_FAILED', '[AdminService] updateClient hatası', { err: error });
            throw error;
        }
    }

    /**
     * ADR-0003 adım 8 (Karar F.20): eskiden burada merkezi Clients+Users kayıtları GERÇEKTEN silinir, tenant DB/R2/
     * ExportSignals/ExportFlag/ImportJobs/Tickets/OperationLogs/DeadLetterQueue kayıtları ve ClientDB önbelleği kalırdı
     * (L-11/C17). Artık `deleteClient` yalnızca YUMUŞAK silmeyi (askı + 30 gün) TenantLifecycleService.requestDeletion
     * üzerinden tetikler — gerçek kalıcı silme (purge) süresi dolunca ayrı işten (TenantLifecycleService.purgeTenant /
     * runPurgeForDueTenants) yapılır. Bekleme süresinde `cancelDeletion` (TenantDataService, platformAdmin) ile geri alınabilir.
     */
    async deleteClient(): Promise<any> {
        try {
            const { targetClientId } = this.request;
            if (!targetClientId) throw new Error('targetClientId gereklidir.');

            const lifecycle = createTenantLifecycleService(this.applicationDB);
            const result = await lifecycle.requestDeletion(Number(targetClientId), {
                actorSub: this.request.principal?.sub,
                actor: 'platformAdmin',
            });

            return { success: true, status: result.status, deletionScheduledAt: result.deletionScheduledAt };
        } catch (error) {
            log.error('ADMIN_DELETE_CLIENT_FAILED', '[AdminService] deleteClient hatası', { err: error });
            throw error;
        }
    }
}
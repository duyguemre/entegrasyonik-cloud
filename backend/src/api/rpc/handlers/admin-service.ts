import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { DatabaseManagerInstance } from "@database/DatabaseManager";
import { buildCacheDump } from "../cacheDump";
import { ApplicationError } from '@platform/core/security/Security';
import { TenantProvisioningService } from '@operations/tenant/TenantProvisioningService';
import { createTenantLifecycleService } from '../tenantLifecycleFactory';
import { toClientDto, CLIENT_SAFE_PROJECTION, CLIENT_SORT_FIELDS } from '../dto/clientDto';
import { maskIntegrationItem } from '@platform/core/security/integrationSecrets';
import { CounterRepository } from '@database/repositories/app/CounterRepository';
import { TicketRepository } from '@database/repositories/app/TicketRepository';
import { containsRegex, clampPage, clampLimit, pickSortField } from '@utils/search';
import { TICKET_SORT_FIELDS } from '../listSortFields';
import { getTenantRegistry } from '@database/TenantRegistry';
import { getIdentityCache } from '@platform/core/security/identityCache';
import { ClientRepository } from '@database/repositories/app/ClientRepository';
import { ExportSignalRepository } from '@database/repositories/app/ExportSignalRepository';
import { PlatformImportJobStatsRepository } from '@database/repositories/app/PlatformImportJobStatsRepository';
import { TenantFootprintRepository } from '@database/repositories/tenant/TenantFootprintRepository';
import { resolveAdminOwnerName } from '@operations/tenant/resolveAdminOwnerName';
import { buildSystemHealth } from '@operations/backoffice/platformSystemHealth';
import { buildExportDetails } from '@operations/backoffice/adminExportDetails';
import { eventLog } from '@platform/core/logger';

const log = eventLog('api', 'admin-service');

/**
 * AdminService
 * Merkezi yönetim opsiyonları, dükkan (client) analitiği ve teknik destek süreçlerini yönetir.
 */
export default class AdminService extends BaseApi implements IService {

    private get clients() { return new ClientRepository(this.applicationDB) }
    private get exportSignals() { return new ExportSignalRepository(this.applicationDB) }
    private get importJobs() { return new PlatformImportJobStatsRepository(this.applicationDB) }
    private get tickets() { return new TicketRepository(this.applicationDB) }

    async get() { }

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

            // ADR-0003 D.15: dbConfig/depolama anahtarları sorguda hiç çekilmez (+ DTO ile ikinci savunma)
            const [clients, total] = await this.clients.listPage(query, CLIENT_SAFE_PROJECTION, sort, skip, Number(limit));

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
            const footprint = new TenantFootprintRepository(targetDB);
            const { productCount, variantCount, orderCount, claimCount, userCount } = await footprint.countEntities();

            // Toplam Ciro ve İadesi (Statistics modelinden veya Orders üzerinden)
            const stats: any = await footprint.latestStatistics();

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

            const integrations = await new TenantFootprintRepository(targetDB).listActiveIntegrations();

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

            const exports = await this.exportSignals.countByStatus(query);
            const imports = await this.importJobs.countByStatus(query);

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
                this.tickets.findPage(query, sort, skip, Number(limit)),
                this.tickets.count(query)
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
            const ticketNumber = String(100000 + await new CounterRepository(this.applicationDB).next('ticket_number'));

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

            const res = await this.tickets.create(ticketPayload);

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

            await this.tickets.deleteById(ticketId);

            return { success: true, message: 'Talep başarıyla silindi.' };
        } catch (error) {
            log.error('ADMIN_DELETE_TICKET_FAILED', '[AdminService] deleteTicket hatası', { err: error });
            throw error;
        }
    }

    /** getSystemHealth: platform genelindeki sistem sağlığı verilerini toplar. */
    async getSystemHealth(): Promise<any> {
        try {
            return await buildSystemHealth(this.applicationDB, this.request, { buildCacheDump });
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

            await this.tickets.updateById(ticketId, {
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

    /** getExportDetails: export sinyallerinin detaylı listesini filtreli döner. */
    async getExportDetails(): Promise<any> {
        try {
            const page = clampPage(this.request.page); // [GV-01/MM-08]
            const limit = clampLimit(this.request.limit, 50);
            return await buildExportDetails(this.applicationDB, this.request, page, limit);
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

            const { name, surname } = resolveAdminOwnerName(userData);
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

            const res = await this.clients.updateByOrder(Number(targetClientId), $set);
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
import type { IApplicationDB, IClientDB } from '@interfaces/index';
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import ClientDB from '@database/client/ClientDB';
import { storageService } from '@services/storage/StorageService';
import { OrderQueueProducer } from '@integration/engine/order/OrderQueueProducer';
import { AuditLogger } from '@services/audit/AuditLogger';
import { ApplicationError } from '../../api/Security';

/**
 * ADR-0003 Karar F (adım 8): tenant silme durum makinesi.
 *   ACTIVE -> DELETION_PENDING (yumuşak silme, 30 gün bekleme; platformAdmin geri alabilir) -> PURGING -> PURGED
 *   Hata: PURGING -> PURGE_FAILED (telafi edilebilir/idempotent; runPurgeForDueTenants tekrar dener).
 *
 * L-08 düzeltmesi (Dispatcher.ts) bu servisten AYRI: burada yalnızca durum geçişleri + kalıcı silme adımları vardır.
 */

export const TENANT_LIFECYCLE_STATUS = {
    DELETION_PENDING: 'DELETION_PENDING',
    PURGING: 'PURGING',
    PURGED: 'PURGED',
    PURGE_FAILED: 'PURGE_FAILED',
} as const;

export const DELETION_GRACE_PERIOD_DAYS = 30;

/** purgeTenant/purge işinin başlayabileceği durumlar (PURGE_FAILED dahil: telafi/yeniden deneme). */
const PURGEABLE_STATUSES: ReadonlyArray<string> = [
    TENANT_LIFECYCLE_STATUS.DELETION_PENDING,
    TENANT_LIFECYCLE_STATUS.PURGING,
    TENANT_LIFECYCLE_STATUS.PURGE_FAILED,
];

/** Mezar taşında KORUNAN alanlar (ADR F.21); diğer TÜM alanlar $unset edilir (strict:false şema -> dinamik hesap). */
const TOMBSTONE_KEEP_FIELDS: ReadonlySet<string> = new Set(['_id', 'order', 'status', 'purgedAt', 'purgedBy', '__v']);

export interface StorageLike {
    deletePrefix(clientId: string): Promise<any>;
}
export interface OrderQueueLike {
    cancelJobsForClient(clientId: string): Promise<number>;
}

export interface TenantLifecycleDeps {
    applicationDB: IApplicationDB;
    getClientDB?: (order: number) => Promise<(IClientDB & { dropDatabase(): Promise<void> }) | undefined>;
    storage?: StorageLike;
    orderQueueProducer?: OrderQueueLike;
    invalidateClientCache?: (clientId: string) => Promise<void>;
    clearIntegrationFactoryCache?: () => void;
    now?: () => Date;
}

export interface RequestDeletionResult {
    order: number;
    status: string;
    deletionScheduledAt: Date;
}

export class TenantLifecycleService {
    private readonly applicationDB: IApplicationDB;
    private readonly getClientDB: (order: number) => Promise<(IClientDB & { dropDatabase(): Promise<void> }) | undefined>;
    private readonly storage: StorageLike;
    private readonly invalidateClientCache: (clientId: string) => Promise<void>;
    private readonly clearIntegrationFactoryCache: () => void;
    private readonly now: () => Date;
    private readonly explicitOrderQueueProducer: OrderQueueLike | undefined;
    /** Lazy singleton: gerçek `new OrderQueueProducer()` (dolayısıyla `new bullmq.Queue(...)`) yalnızca GERÇEKTEN
     * bir iş iptali gerektiğinde (requestDeletion/purgeTenant çağrıldığında) kurulur; constructor'da DEĞİL. Bu,
     * TenantLifecycleService'i kullanan modüllerin (ör. admin-service.ts) yalnızca sınıfı import etmesinin/örneklemesinin
     * BullMQ/Redis bağımlılığı YÜKLEMESİNİ engeller (Redis mock'lanmamış test dosyalarını kırmaz). */
    private lazyOrderQueueProducer: OrderQueueLike | undefined;

    constructor(deps: TenantLifecycleDeps) {
        this.applicationDB = deps.applicationDB;
        this.getClientDB = deps.getClientDB ?? ((order: number) => DatabaseManagerInstance.getClientDB(order) as any);
        this.storage = deps.storage ?? storageService;
        this.explicitOrderQueueProducer = deps.orderQueueProducer;
        this.invalidateClientCache = deps.invalidateClientCache ?? ((id: string) => ClientDB.invalidate(id));
        // Lazy require (statik import DEĞİL): IntegrationFactory pazaryeri adaptörlerini (Trendyol/Hepsiburada/...,
        // @Cache dekoratörlü) transitive olarak yükler. Bunu modül YÜKLENİRKEN değil, yalnızca purgeTenant GERÇEKTEN
        // çağrıldığında yüklemek için — admin-service.ts gibi bu servisi kullanan modüllerin yükünü ağırlaştırmamak amacıyla.
        this.clearIntegrationFactoryCache = deps.clearIntegrationFactoryCache ?? (() => {
            const mod = require('@integration/modules/IntegrationFactory');
            (mod.default ?? mod).clearCache();
        });
        this.now = deps.now ?? (() => new Date());
    }

    private getOrderQueueProducer(): OrderQueueLike {
        if (this.explicitOrderQueueProducer) return this.explicitOrderQueueProducer;
        if (!this.lazyOrderQueueProducer) this.lazyOrderQueueProducer = new OrderQueueProducer();
        return this.lazyOrderQueueProducer;
    }

    /** ADR F.20: ACTIVE -> DELETION_PENDING (+30 gün). İdempotent: zaten DELETION_PENDING ise mevcut zamanlamayı döner. */
    public async requestDeletion(order: number, opts: { actorSub?: string; actor: 'owner' | 'platformAdmin' }): Promise<RequestDeletionResult> {
        const clientModel = this.applicationDB.getClientModel();
        const client: any = await clientModel.findOne({ order }).lean();
        if (!client) throw new ApplicationError('Tenant bulunamadı.', 404);

        if (client.status === TENANT_LIFECYCLE_STATUS.DELETION_PENDING) {
            void AuditLogger.log({ event: 'tenant.deletion.requested', result: 'ok', tid: order, sub: opts.actorSub, meta: { actor: opts.actor, alreadyPending: true } });
            return { order, status: client.status, deletionScheduledAt: client.deletionScheduledAt };
        }
        if (client.status !== 'ACTIVE') {
            throw new ApplicationError(`Tenant '${client.status}' durumunda; silme talebi kabul edilmez.`, 409);
        }

        const deletionScheduledAt = new Date(this.now().getTime() + DELETION_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
        await clientModel.updateOne(
            { order },
            { $set: { status: TENANT_LIFECYCLE_STATUS.DELETION_PENDING, deletionScheduledAt, deletionRequestedAt: this.now(), deletionRequestedBy: opts.actorSub } },
        );

        // Zamanlanmış sync işlerinin iptali (best-effort): OrderQueueProducer.scheduleJobs() zaten YENİ iş eklemez
        // (status:'ACTIVE' filtresi); burada BEKLEYEN (henüz işlenmemiş) işler kaldırılır.
        try {
            const removed = await this.getOrderQueueProducer().cancelJobsForClient(String(order));
            void AuditLogger.log({ event: 'tenant.deletion.jobsCancelled', result: 'ok', tid: order, meta: { removed } });
        } catch (e: any) {
            console.error('[TenantLifecycle] cancelJobsForClient hata (best-effort, talep engellenmez):', e?.message);
        }

        void AuditLogger.log({ event: 'tenant.deletion.requested', result: 'ok', tid: order, sub: opts.actorSub, meta: { actor: opts.actor } });
        return { order, status: TENANT_LIFECYCLE_STATUS.DELETION_PENDING, deletionScheduledAt };
    }

    /** ADR F.20: platformAdmin bekleme süresinde geri alabilir. DELETION_PENDING dışı durumlarda 409. */
    public async cancelDeletion(order: number, opts: { actorSub?: string }): Promise<{ order: number; status: string }> {
        const clientModel = this.applicationDB.getClientModel();
        const client: any = await clientModel.findOne({ order }).lean();
        if (!client) throw new ApplicationError('Tenant bulunamadı.', 404);
        if (client.status !== TENANT_LIFECYCLE_STATUS.DELETION_PENDING) {
            throw new ApplicationError(`Tenant '${client.status}' durumunda; silme talebi yok/iptal edilemez.`, 409);
        }
        await clientModel.updateOne(
            { order },
            { $set: { status: 'ACTIVE' }, $unset: { deletionScheduledAt: 1, deletionRequestedAt: 1, deletionRequestedBy: 1 } },
        );
        void AuditLogger.log({ event: 'tenant.deletion.cancelled', result: 'ok', tid: order, sub: opts.actorSub });
        return { order, status: 'ACTIVE' };
    }

    /**
     * ADR F.21: kalıcı silme. SIRALI adımlar: tenant DB drop -> R2 prefix -> ApplicationDB'deki bağlı koleksiyonlar
     * -> BullMQ tenant işleri -> cache temizliği -> mezar taşı. Hata: PURGE_FAILED (idempotent/telafi edilebilir;
     * her adım kendi başına tekrar çalıştırılabilir tasarlanmıştır — ör. dropDatabase olmayan DB'de no-op'a yakın,
     * deleteMany zaten idempotenttir).
     */
    public async purgeTenant(order: number, opts: { actorSub?: string } = {}): Promise<{ order: number; status: string }> {
        const clientModel = this.applicationDB.getClientModel();
        const client: any = await clientModel.findOne({ order }).lean();
        if (!client) throw new ApplicationError('Tenant bulunamadı.', 404);
        if (client.status === TENANT_LIFECYCLE_STATUS.PURGED) {
            return { order, status: TENANT_LIFECYCLE_STATUS.PURGED }; // idempotent: zaten purge edilmiş
        }
        if (!PURGEABLE_STATUSES.includes(client.status)) {
            throw new ApplicationError(`Tenant '${client.status}' durumunda; purge edilemez (önce yumuşak silme talebi gerekir).`, 409);
        }

        await clientModel.updateOne({ order }, { $set: { status: TENANT_LIFECYCLE_STATUS.PURGING } });

        let step = 'start';
        try {
            // 1. Tenant DB drop (gerçek drop; bu metot GERÇEK bir bağlantıda test/mock olmayan ortamda ÇALIŞTIRILMAMALIDIR)
            step = 'clientDB';
            const clientDB = await this.getClientDB(order);
            if (clientDB) await clientDB.dropDatabase();

            // 2. R2 önekinin silinmesi
            step = 'storage';
            await this.storage.deletePrefix(String(order));

            // 3. ApplicationDB'de clientId'ye bağlı koleksiyonlar + merkezi Users
            step = 'appCollections';
            await Promise.all([
                this.applicationDB.getExportSignalModel().deleteMany({ clientId: order }),
                this.applicationDB.getExportFlagModel().deleteMany({ clientId: String(order) }),
                this.applicationDB.getImportJobModel().deleteMany({ clientId: order }),
                this.applicationDB.getOperationLogModel().deleteMany({ clientId: order }),
                this.applicationDB.getDeadLetterQueueModel().deleteMany({ clientId: order }),
                this.applicationDB.getTicketModel().deleteMany({ clientId: order }),
                this.applicationDB.getUserModel().deleteMany({ order }),
            ]);

            // 4. BullMQ tenant işlerinin kaldırılması
            step = 'queue';
            await this.getOrderQueueProducer().cancelJobsForClient(String(order));

            // 5. ClientDB LRU / IntegrationFactory önbellek temizliği
            step = 'cache';
            await this.invalidateClientCache(String(order));
            this.clearIntegrationFactoryCache();

            // 6. Mezar taşı: PII'siz, numara asla yeniden kullanılmaz (order KORUNUR, provisioning Counters ile ayrık ilerler)
            step = 'tombstone';
            const currentDoc: any = (await clientModel.findOne({ order }).lean()) ?? {};
            const unsetFields: Record<string, 1> = {};
            for (const key of Object.keys(currentDoc)) {
                if (!TOMBSTONE_KEEP_FIELDS.has(key)) unsetFields[key] = 1;
            }
            const purgedBy = opts.actorSub ?? currentDoc.deletionRequestedBy;
            await clientModel.updateOne(
                { order },
                { $set: { status: TENANT_LIFECYCLE_STATUS.PURGED, purgedAt: this.now(), purgedBy }, $unset: unsetFields },
            );

            void AuditLogger.log({ event: 'tenant.purge', result: 'ok', tid: order, sub: purgedBy });
            return { order, status: TENANT_LIFECYCLE_STATUS.PURGED };
        } catch (e: any) {
            await clientModel.updateOne(
                { order },
                { $set: { status: TENANT_LIFECYCLE_STATUS.PURGE_FAILED, purgeFailedAt: this.now(), purgeFailedStep: step } },
            );
            void AuditLogger.log({ event: 'tenant.purge', result: 'error', tid: order, meta: { step } });
            console.error(`[TenantLifecycle] purge adım "${step}" başarısız (tenant ${order}):`, e?.message);
            throw e;
        }
    }

    /**
     * Süresi geçmiş (deletionScheduledAt <= now) DELETION_PENDING/PURGE_FAILED tenant'ları bulup purgeTenant çağırır.
     * Gerçek zamanlama (node-cron vb.) BU FONKSİYONUN KAPSAMI DIŞINDA (BACKLOG'a not düşülür); bu yalnızca
     * "süresi gelenleri bul ve işle" mantığıdır — bir cron/worker tarafından periyodik çağrılması beklenir.
     */
    public async runPurgeForDueTenants(): Promise<Array<{ order: number; status: string; error?: string }>> {
        const clientModel = this.applicationDB.getClientModel();
        const due = await clientModel
            .find({
                status: { $in: [TENANT_LIFECYCLE_STATUS.DELETION_PENDING, TENANT_LIFECYCLE_STATUS.PURGE_FAILED] },
                deletionScheduledAt: { $lte: this.now() },
            })
            .select('order')
            .lean();

        const results: Array<{ order: number; status: string; error?: string }> = [];
        for (const c of due) {
            const order = Number((c as any).order);
            try {
                results.push(await this.purgeTenant(order));
            } catch (e: any) {
                results.push({ order, status: TENANT_LIFECYCLE_STATUS.PURGE_FAILED, error: e?.message });
            }
        }
        return results;
    }
}

import archiver from 'archiver';
import { IService } from '@interfaces/index';
import { BaseApi } from '../BaseApi';
import { ApplicationError } from '@platform/core/security/Security';
import Security from '@platform/core/security/Security';
import { AuditLogger } from '@services/audit/AuditLogger';
import { storageService } from '@services/storage/StorageService';
import { createTenantLifecycleService } from '../tenantLifecycleFactory';
import { EXPORT_COLLECTIONS, sanitizeExportDoc } from '@operations/tenant/exportCollections';
import { signExportDownloadToken } from '@operations/tenant/exportDownloadToken';
import { eventLog } from '@platform/core/logger';

const log = eventLog('api', 'tenant-data-service');

/** ADR-0003 Karar F.22: dışa aktarma indirme token'ı 24 saat geçerli. */
const EXPORT_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * TenantDataService — ADR-0003 adım 8 (Karar F.20/F.22): sahip (owner) kademesindeki KVKK uçları
 * (`requestDeletion`, `exportTenantData`) + platformAdmin `cancelDeletion` (aynı serviste, ADR öyle tanımlıyor).
 */
export default class TenantDataService extends BaseApi implements IService {
    async get(): Promise<any> { /* IService gereksinimi; kullanılmıyor */ }

    /**
     * ADR F.20 (owner): parola yeniden doğrulaması + tenant adının (Clients.title) AYNEN yazılması gerekir.
     * Başarılıysa TenantLifecycleService.requestDeletion çağrılır (ACTIVE -> DELETION_PENDING, +30 gün).
     */
    async requestDeletion(): Promise<any> {
        const order = this.request.userContext?.order;
        if (!order) throw new ApplicationError('Tenant bulunamadı.', 400);

        const { password, confirmTenantName } = this.request;
        if (typeof password !== 'string' || password.length === 0) throw new ApplicationError('Parola gerekli.', 400);

        const security = Security.getInstance();
        const sub = this.request.principal?.sub;
        const userDoc: any = sub ? await this.applicationDB.getUserModel().findById(sub) : undefined;
        const passwordOk = !!userDoc && typeof userDoc.password === 'string' && (await security.comparePassword(password, userDoc.password));
        if (!passwordOk) throw new ApplicationError('Parola doğrulanamadı.', 401);

        const client: any = await this.applicationDB.getClientModel().findOne({ order }).lean();
        if (!client) throw new ApplicationError('Tenant bulunamadı.', 404);
        const expectedName = String(client.title ?? '').trim();
        if (expectedName === '' || typeof confirmTenantName !== 'string' || confirmTenantName.trim() !== expectedName) {
            throw new ApplicationError('Mağaza adı doğrulanamadı.', 400);
        }

        const lifecycle = createTenantLifecycleService(this.applicationDB);
        return await lifecycle.requestDeletion(order, { actorSub: sub, actor: 'owner' });
    }

    /**
     * ADR F.20 (platformAdmin): 30 gün bekleme süresinde yumuşak silmeyi geri alır. Hedef tenant `targetClientId`
     * gövdeden gelir (AdminService deseniyle aynı; platformAdmin'in "kendi" tenant bağlamı bu işlem için anlamsızdır).
     */
    async cancelDeletion(): Promise<any> {
        const { targetClientId } = this.request;
        if (!targetClientId) throw new ApplicationError('targetClientId gereklidir.', 400);
        const lifecycle = createTenantLifecycleService(this.applicationDB);
        return await lifecycle.cancelDeletion(Number(targetClientId), { actorSub: this.request.principal?.sub });
    }

    /**
     * ADR F.22 (owner): tenant DB koleksiyonlarını (sır alanları HARİÇ) NDJSON olarak paketler, zip'ler, R2'ye
     * (`exports/<clientId>/`) yazar ve 24 saat geçerli imzalı indirme token'ı döner.
     *
     * ADR'DEN SAPMA (raporlanmalı): ADR "asenkron iş" öngörür (worker/kuyruk); burada İSTEK İÇİNDE senkron
     * çalıştırılır (basitlik; küçük/orta tenant veri hacminde kabul edilebilir, büyük tenant'larda HTTP zaman
     * aşımı riski — gerçek arka plan işine (BullMQ/benzeri) taşınması insan kararı/Faz 2-3 takip konusu).
     * Dosyanın 7 gün sonra silinmesi de gerçek bir zamanlayıcıya bağlı DEĞİL (BACKLOG'a not).
     */
    async exportTenantData(): Promise<any> {
        const order = this.request.userContext?.order;
        if (!order) throw new ApplicationError('Tenant bulunamadı.', 400);
        if (!this.clientDB) throw new ApplicationError('Tenant veritabanına bağlanılamadı.', 500);

        const sub = this.request.principal?.sub;
        void AuditLogger.log({ event: 'tenant.export.requested', result: 'ok', tid: order, sub });

        try {
            const buffer = await this.buildExportArchive();
            const jobId = `export_${order}_${Date.now()}`;
            const directory = `exports/${order}`;
            const uploadResult: any = await storageService.uploadExportArchive(String(order), buffer, directory, jobId);
            if (!uploadResult || uploadResult.result === false) {
                throw new Error(uploadResult?.error || 'Arşiv R2\'ye yüklenemedi.');
            }
            const key = uploadResult.key ?? `${directory}/${jobId}.zip`;
            const expiresAt = Date.now() + EXPORT_TOKEN_TTL_MS;
            const downloadToken = signExportDownloadToken({ key, expiresAt });

            void AuditLogger.log({ event: 'tenant.export.completed', result: 'ok', tid: order, sub, meta: { jobId } });
            return { success: true, jobId, key, downloadToken, expiresAt: new Date(expiresAt) };
        } catch (e: any) {
            void AuditLogger.log({ event: 'tenant.export.completed', result: 'error', tid: order, sub });
            log.error('TENANT_EXPORT_FAILED', '[TenantDataService] exportTenantData hata', { err: e?.message });
            throw e;
        }
    }

    private async buildExportArchive(): Promise<Buffer> {
        const archive = archiver('zip', { zlib: { level: 9 } });
        const chunks: Buffer[] = [];
        archive.on('data', (chunk: Buffer) => chunks.push(chunk));
        const done = new Promise<void>((resolve, reject) => {
            archive.on('end', resolve);
            archive.on('error', reject);
        });

        for (const spec of EXPORT_COLLECTIONS) {
            let docs: any[] = [];
            try {
                docs = await spec.getModel(this.clientDB).find({}).lean();
            } catch (e: any) {
                log.error('TENANT_EXPORT_FILE_SKIPPED', '[TenantDataService] exportTenantData: dosya okunamadı (atlandı)', { file: spec.file, err: e?.message });
                docs = [];
            }
            const lines = (docs || []).map((d: any) => JSON.stringify(sanitizeExportDoc(d, spec.mask))).join('\n');
            archive.append(Buffer.from(lines, 'utf8'), { name: spec.file });
        }

        await archive.finalize();
        await done;
        return Buffer.concat(chunks);
    }
}

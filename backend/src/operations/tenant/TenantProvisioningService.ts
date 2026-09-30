import type { IApplicationDB, IClientDB } from '@interfaces/index';
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import { AuditLogger } from '@services/audit/AuditLogger';
import Security from '@platform/core/security/Security';
import { ApplicationError } from '@platform/core/errors';
import { getTenantRegistry } from '@database/TenantRegistry';
import { ProvisionInput, validateProvisionInput } from './provisionInput';
import { buildTenantInfraDefaults } from './tenantInfraDefaults';
import { ensureTrialSubscription } from './trialSubscription';

/**
 * ADR-0003 Karar A (uygulama sırası adım 3): TEK tenant oluşturma noktası.
 * `SecurityService.register` ve `AdminService.createClient` YALNIZCA `provision()` çağırır (iki kopya akış birleşti).
 *
 *  1. Girdi açık alan listesiyle doğrulanır (provisionInput.ts) — istemci verisi modele spread edilmez.
 *  2. Tenant numarası: `Counters` (`_id: 'tenant_order'`) üzerinde atomik `$inc`. Sayaç, ilk kullanımda ve her çağrıda
 *     `$max` ile mevcut max(Clients.order)'a yükseltilir (mevcut tenant'larla çakışma olmaz; numara asla geri gitmez/yeniden kullanılmaz).
 *     Clients üzerindeki tekil indeksler (order, clientId, dbConfig.dbname) ikinci savunma hattıdır (Client.ts).
 *  3. Durum makinesi: Clients.status PROVISIONING -> ACTIVE (hata: PROVISIONING_FAILED). Adımlar idempotenttir:
 *     Clients kaydı -> merkezi Users -> tenant DB tohumları -> tenant içi Users -> ACTIVE. Aynı e-posta + aynı parolayla
 *     yeniden denemede PROVISIONING_FAILED tenant kaldığı yerden tamamlanır (yeni numara ALINMAZ).
 *     Çok dokümanlı/çok DB'li transaction kullanılmaz (ADR A.3).
 *  4. Aynı e-postayla ikinci kayıt reddedilir (servis düzeyinde kontrol + merkezi Users.email tekil indeksi).
 *  5. ADR-0008 §3 / ADR-0014 S4a: ACTIVE'den ÖNCE `subscription` adımı — `trialing` (14 gün, kartsız) abonelik (trialSubscription.ts).
 *     Adım başarısızsa tenant PROVISIONING_FAILED olur ve yeniden denemede (idempotent `$setOnInsert`) kaldığı yerden tamamlanır:
 *     abonelikSİZ ACTIVE tenant oluşamaz (EntitlementService 'no_subscription' = erişim yok olduğundan yarım kayıt kullanıcıyı kilitlerdi).
 */

export const TENANT_ORDER_COUNTER_ID = 'tenant_order';
export const TENANT_STATUS = { PROVISIONING: 'PROVISIONING', ACTIVE: 'ACTIVE', PROVISIONING_FAILED: 'PROVISIONING_FAILED' } as const;
export const EMAIL_TAKEN_MESSAGE = 'Bu e-posta adresi ile kayıt oluşturulamıyor.';
export const PROVISIONING_FAILED_MESSAGE = 'Kayıt tamamlanamadı. Lütfen daha sonra tekrar deneyin.';

const MAX_ORDER_ATTEMPTS = 3;
/** ADR-0013 B2: env değişken adı ve uyarı marjı (rol sınırına N-10 kala uyarı loglanır). */
export const TENANT_DB_ROLE_MAX_ENV = 'TENANT_DB_ROLE_MAX';
const TENANT_DB_ROLE_WARN_MARGIN = 10;

/** Yeni tenant'a yazılan varsayılan entegrasyon listesi (Clients.integrations) — mevcut tohum davranışı AYNEN. */
function defaultRegisteredIntegrations() {
    return [
        { status: true, type: 'marketplace', integrationCode: 'trendyol' },
        { status: true, type: 'marketplace', integrationCode: 'pazarama' },
        { status: true, type: 'marketplace', integrationCode: 'n11' },
        { status: true, type: 'marketplace', integrationCode: 'hepsiburada' },
        { status: true, type: 'shipment', integrationCode: 'ptt' },
        { status: true, type: 'ecommerce', integrationCode: 'ideasoft' },
        { status: true, type: 'erp', integrationCode: 'bizimhesap' },
        { status: true, type: 'einvoice', integrationCode: 'gib' },
    ];
}

/** Tenant DB'sindeki ClientIntegrations tohumu — mevcut tohum davranışı AYNEN. */
function defaultClientIntegrationsSeed(): any {
    return {
        marketplace: [
            { order: 1, status: true, code: 'trendyol', settings: { test: 1 } },
            { order: 2, status: true, code: 'pazarama', settings: { test: 1 } },
            { order: 3, status: true, code: 'n11', settings: { test: 1 } },
            { order: 4, status: true, code: 'hepsiburada', settings: { test: 1 } },
        ],
        shipment: [{ order: 5, status: true, code: 'ptt', settings: { test: 1 } }],
        ecommerce: [{ order: 6, status: true, code: 'ideasoft', settings: { test: 1 } }],
        erp: [{ order: 7, status: true, code: 'bizimhesap', settings: { test: 1 } }],
        einvoice: [{ order: 8, status: true, code: 'gib', settings: { test: 1 } }],
    };
}

function isDuplicateKeyError(e: any): boolean {
    return !!e && (e.code === 11000 || e.code === 11001);
}

const toPlain = (doc: any): any => (doc && typeof doc.toObject === 'function' ? doc.toObject() : doc);

export interface ProvisionResult {
    order: number;
    /** Oluşan/tamamlanan tenant kaydı (düz nesne, status: ACTIVE). Ham hâli sır alanları içerir — API'ye DTO ile verilmelidir. */
    client: any;
    /** Merkezi Users belgesi (Mongoose doc veya düz nesne). */
    user: any;
    /** true: daha önce PROVISIONING_FAILED kalan tenant kaldığı yerden tamamlandı. */
    resumed: boolean;
}

export interface ProvisioningDeps {
    applicationDB: IApplicationDB;
    getClientDB?: (order: number) => Promise<IClientDB | undefined>;
    security?: Security;
}

export class TenantProvisioningService {
    private readonly applicationDB: IApplicationDB;
    private readonly getClientDB: (order: number) => Promise<IClientDB | undefined>;
    private readonly security: Security;

    constructor(deps: ProvisioningDeps) {
        this.applicationDB = deps.applicationDB;
        this.getClientDB = deps.getClientDB ?? ((order: number) => DatabaseManagerInstance.getClientDB(order));
        this.security = deps.security ?? Security.getInstance();
    }

    /** Tek giriş noktası. Doğrulama hatası: 400; e-posta kullanımda: 409; adım hatası: 500 (kayıt PROVISIONING_FAILED). */
    public async provision(rawInput: unknown, opts: { ip?: string } = {}): Promise<ProvisionResult> {
        const input = validateProvisionInput(rawInput);

        const clientModel = this.applicationDB.getClientModel();
        const userModel = this.applicationDB.getUserModel();

        // --- Tekrar kayıt / yeniden deneme kararı ---
        let resumeClient: any = null;
        let existingUser: any = await userModel.findOne({ email: input.email });
        if (existingUser) {
            // E-posta zaten kayıtlı: yalnızca PROVISIONING_FAILED kalmış kendi tenant'ı ve doğru parola ile devam edilir; aksi hâlde ret.
            const owned: any = await clientModel.findOne({ order: Number(existingUser.order) }).lean();
            const sameOwner = owned && owned.status === TENANT_STATUS.PROVISIONING_FAILED
                && typeof existingUser.password === 'string'
                && await this.security.comparePassword(input.password, existingUser.password);
            if (!sameOwner) throw new ApplicationError(EMAIL_TAKEN_MESSAGE, 409);
            resumeClient = owned;
        } else {
            // Kullanıcı adımına gelmeden başarısız olmuş tenant (kayıt Clients.provisioning.ownerEmail'de tutulur)
            resumeClient = await clientModel.findOne({ status: TENANT_STATUS.PROVISIONING_FAILED, 'provisioning.ownerEmail': input.email }).lean();
        }

        let order: number | undefined;
        let step = 'client';
        try {
            // --- Adım 1: Clients kaydı (PROVISIONING) ---
            let clientDoc: any;
            if (resumeClient) {
                order = Number(resumeClient.order);
                await clientModel.updateOne({ order }, { $set: { status: TENANT_STATUS.PROVISIONING } });
                clientDoc = { ...toPlain(resumeClient), status: TENANT_STATUS.PROVISIONING };
            } else {
                clientDoc = await this.createClientRecord(input);
                order = Number(clientDoc.order);
            }

            // --- ADR-0013 B2: Atlas uygulama rolünün kapsadığı DB listesi sınırı ---
            step = 'order-limit';
            this.checkTenantDbRoleLimit(order);

            // --- Adım 2: merkezi Users (idempotent: zaten varsa yeniden oluşturulmaz) ---
            step = 'central-user';
            if (!existingUser) {
                const hash = await this.security.hashPassword(input.password);
                try {
                    existingUser = await userModel.create({
                        email: input.email,
                        name: input.name,
                        surname: input.surname,
                        password: hash,
                        // ADR A.2: kanonik tenant kimliği `order` (Number); Users.clientId ObjectId olarak YAZILMAZ
                        clientId: order,
                        order,
                        owner: true,
                        isGlobalAdmin: false, // kayıt olanlar client sahibidir
                        roleCode: 'ROLE_OWNER',
                    });
                } catch (e: any) {
                    if (isDuplicateKeyError(e)) throw new ApplicationError(EMAIL_TAKEN_MESSAGE, 409);
                    throw e;
                }
            }

            // --- Adım 3: tenant DB tohumları (idempotent) ---
            step = 'tenant-seed';
            const clientDb = await this.getClientDB(order as number);
            if (!clientDb) throw new Error('Tenant veritabanı bağlantısı kurulamadı.');
            // ADR-0021 D8 / DB-08: DB_AUTO_INDEX kapalıyken (staging/production) yeni tenant'ın indeksleri burada kurulur (idempotent; yeniden denemede tekrar güvenli).
            await clientDb.ensureIndexes?.();
            await clientDb.getCategoryModel().findOneAndUpdate(
                { isMain: true }, // kayıt kontrolü için arama kriteri
                { parentId: 0, title: 'Ana Kategori', isMain: true, icon: 'mdi-shape', order: 1 },
                { upsert: true }, // yoksa ekle, varsa güncelle
            );
            await clientDb.getBrandModel().findOneAndUpdate(
                { isMain: true },
                { title: 'Genel', isMain: true },
                { upsert: true },
            );
            const ciModel = clientDb.getClientIntegrationModel();
            if (!(await ciModel.findOne({}).lean())) {
                await ciModel.create(defaultClientIntegrationsSeed());
            }

            // --- Adım 4: tenant içi Users (owner; idempotent upsert) ---
            step = 'tenant-user';
            await clientDb.getUserModel().findOneAndUpdate(
                { email: input.email },
                {
                    $setOnInsert: {
                        email: input.email,
                        name: existingUser.name ?? input.name,
                        surname: existingUser.surname ?? input.surname,
                        password: existingUser.password,
                        roleCode: 'ROLE_OWNER',
                        owner: true,
                        isActive: true,
                    },
                },
                { upsert: true },
            );

            // --- Adım 5: trialing abonelik (ADR-0008 §3; idempotent — yeniden denemede deneme süresi uzamaz) ---
            step = 'subscription';
            await ensureTrialSubscription(this.applicationDB, order as number);

            // --- Adım 6: ACTIVE ---
            step = 'activate';
            await clientModel.updateOne(
                { order },
                { $set: { status: TENANT_STATUS.ACTIVE }, $unset: { provisioning: 1 } },
            );
            getTenantRegistry().invalidate(order as number);

            void AuditLogger.log({ event: 'tenant.provision', result: 'ok', tid: order, ip: opts.ip, meta: { resumed: !!resumeClient } });
            const { provisioning: _p, ...clientOut } = clientDoc;
            return { order: order as number, client: { ...clientOut, status: TENANT_STATUS.ACTIVE }, user: existingUser, resumed: !!resumeClient };
        } catch (e: any) {
            await this.markFailed(order, step);
            void AuditLogger.log({ event: 'tenant.provision', result: 'error', tid: order, ip: opts.ip, meta: { step } });
            if (e instanceof ApplicationError) throw e; // ör. 409 e-posta kullanımda
            // İç hata ayrıntısı (bağlantı dizesi vb.) istemciye sızmaz; yalnızca sunucu logunda (adım adıyla)
            console.error(`[TenantProvisioning] adım "${step}" başarısız (tenant ${order ?? '-'}):`, e?.message);
            throw new ApplicationError(PROVISIONING_FAILED_MESSAGE, 500);
        }
    }

    // --- iç adımlar ---

    /**
     * ADR-0013 B2: Rotasyonda yeni Atlas uygulama kullanıcısına `readWriteAnyDatabase` yerine açık DB listeli
     * özel bir rol verilecek (`entegrasyonikDB` + `entegrasyonikClient_1..N`). `TENANT_DB_ROLE_MAX` (env) bu N'yi
     * kod tarafında bilir:
     *  - env tanımsız/boş/geçersiz → sınır UYGULANMAZ (geriye uyumlu: insan henüz Atlas'ta rolü daraltmadıysa
     *    provisioning kırılmaz).
     *  - env tanımlı ve `order` bunu AŞARSA → açık bir hata ile provisioning DURUR (sessizce devam edip tenant
     *    DB'sine bağlanırken auth hatasına düşmez).
     *  - `order >= (max - 10)` ise (rol sınırına yaklaşılıyor) UYARI loglanır.
     */
    private checkTenantDbRoleLimit(order: number): void {
        const raw = process.env[TENANT_DB_ROLE_MAX_ENV];
        if (raw === undefined || raw === null || String(raw).trim() === '') return;
        const max = Number(raw);
        if (!Number.isInteger(max) || max < 1) {
            console.warn(`[TenantProvisioning] ${TENANT_DB_ROLE_MAX_ENV} geçersiz değer ("${raw}"); sınır uygulanmıyor.`);
            return;
        }
        if (order > max) {
            throw new Error(
                `Tenant numarası (${order}) Atlas uygulama rolünün kapsadığı üst sınırı (${TENANT_DB_ROLE_MAX_ENV}=${max}) aşıyor; ` +
                `Atlas'ta özel role yeni tenant DB adı eklenmeden provisioning tamamlanamaz (ADR-0013 B2).`,
            );
        }
        if (order >= max - TENANT_DB_ROLE_WARN_MARGIN) {
            console.warn(`[TenantProvisioning] Tenant numarası (${order}) ${TENANT_DB_ROLE_MAX_ENV} (${max}) sınırına yaklaşıyor (kalan: ${max - order}); Atlas özel rolünün genişletilmesi planlanmalı (ADR-0013 B2).`);
        }
    }

    /** Atomik numara: sayaç `$max` ile mevcut max(order)'a yükseltilir, sonra `$inc`. */
    private async nextOrder(): Promise<number> {
        const clientModel = this.applicationDB.getClientModel();
        const counters = this.applicationDB.getCounterModel();
        const top: any = await clientModel.findOne({}).select('order').sort({ order: -1 }).lean();
        const floor = top && Number.isInteger(top.order) ? top.order : 0;

        // Eşzamanlı ilk upsert'lerde E11000 olabilir: kısa yeniden deneme
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                if (floor > 0) {
                    await counters.updateOne({ _id: TENANT_ORDER_COUNTER_ID }, { $max: { sequence_value: floor } }, { upsert: true });
                }
                const res: any = await counters.findOneAndUpdate(
                    { _id: TENANT_ORDER_COUNTER_ID },
                    { $inc: { sequence_value: 1 } },
                    { new: true, upsert: true },
                );
                const n = Number(res && res.sequence_value);
                if (!Number.isInteger(n) || n < 1) throw new Error('Tenant sayacı geçersiz değer döndürdü.');
                return n;
            } catch (e: any) {
                if (isDuplicateKeyError(e) && attempt < 2) continue;
                throw e;
            }
        }
        throw new Error('Tenant numarası alınamadı.');
    }

    /** Clients kaydını PROVISIONING olarak oluşturur; tekil indeks çakışmasında (E11000) yeni numara ile yeniden dener. */
    private async createClientRecord(input: ProvisionInput): Promise<any> {
        const clientModel = this.applicationDB.getClientModel();
        let lastError: any;
        for (let attempt = 0; attempt < MAX_ORDER_ATTEMPTS; attempt++) {
            const order = await this.nextOrder();
            // ADR-0003 adım 5: yalnızca dbConfig { dbname, poolsize }; DB/R2 kimlik bilgisi tenant kaydına YAZILMAZ (env'den okunur)
            const infra = buildTenantInfraDefaults(order);
            const record: any = {
                dbConfig: infra.dbConfig,
                order,
                clientId: order,
                title: input.storeName ?? 'Mağaza Adı ' + order,
                status: TENANT_STATUS.PROVISIONING,
                provisioning: { ownerEmail: input.email, startedAt: new Date() },
                lastSuccessfulOrderSync: new Date(),
                integrations: defaultRegisteredIntegrations(),
            };
            if (input.storeName !== undefined) record.name = input.storeName;
            try {
                const created = await clientModel.create(record);
                return toPlain(created);
            } catch (e: any) {
                if (isDuplicateKeyError(e)) { lastError = e; continue; }
                throw e;
            }
        }
        throw lastError ?? new Error('Tenant kaydı oluşturulamadı.');
    }

    /** Best-effort: hata durumunu kaydeder (24 saatten eski PROVISIONING_FAILED kayıtları purge işi temizler — ADR F). */
    private async markFailed(order: number | undefined, step: string): Promise<void> {
        if (order === undefined) return;
        try {
            await this.applicationDB.getClientModel().updateOne(
                { order },
                { $set: { status: TENANT_STATUS.PROVISIONING_FAILED, 'provisioning.failedAt': new Date(), 'provisioning.failedStep': step } },
            );
            getTenantRegistry().invalidate(order);
        } catch (err: any) {
            console.error('[TenantProvisioning] PROVISIONING_FAILED durumu yazılamadı:', err?.message);
        }
    }
}

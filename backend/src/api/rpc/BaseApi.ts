import { DatabaseManagerInstance } from "@database/DatabaseManager";
import { IApplicationDB, IClientDB } from '@interfaces/index'
import { ApplicationError } from '@platform/core/errors';
import { buildRequestContext, type RequestContext } from './requestContext';

export class BaseApi {
    applicationDB!: IApplicationDB
    clientDB!: IClientDB

    /**
     * `request`: GERİYE UYUMLU ham istek (gövde + userContext + principal + requestMeta). Yeni kod kimlik/tenant için `this.ctx` kullanır
     * (ADR-0024 D3); `request.userContext/principal` erişimleri kademeli göçle kalkacak.
     */
    constructor(protected clientId: number, protected request: any) {
    }

    /** Doğrulanmış tenant numarası (`userContext.order`). Eski servislerdeki `currentClientId` alanının yerini alır. */
    public get currentClientId(): any { return this.clientId } // any: eski servisler string/number karışık kullanıyor (kademeli göç)

    /** Tipli, doğrulanmış istek bağlamı (RunOperation kurar). Kimliksiz (açık) operasyonlarda yoktur -> 401 (fail-closed). */
    protected get ctx(): RequestContext {
        const c = this.ctxOrUndefined;
        if (!c) throw new ApplicationError('Token is undefined', 401);
        return c;
    }

    /** Açık operasyonlar (login/register/...) için: kimlik yoksa undefined. */
    protected get ctxOrUndefined(): RequestContext | undefined {
        const r = this.request;
        if (r && r.ctx) return r.ctx as RequestContext;
        // Servis RunOperation dışında (test/iç çağrı) kurulduysa ham istekten türet
        return buildRequestContext({ principal: r?.principal, userContext: r?.userContext, ip: r?.requestMeta?.ip });
    }

    protected async initClientDB(clientId: any): Promise<void> {
        if (!clientId) {
            console.warn(`[BaseApi] No clientId provided for initialization. Service: ${this.constructor.name}`);
            return;
        }

        // ctx.tenant (authenticate'in çözdüğü kayıt) varsa TenantRegistry'ye tekrar gidilmez
        const tenant = this.ctxOrUndefined?.tenant;
        const tempClient = tenant && tenant.order === Number(clientId)
            ? await DatabaseManagerInstance.getClientDBForTenant(tenant)
            : await DatabaseManagerInstance.getClientDB(clientId);
        if (tempClient) {
            this.clientDB = tempClient;
        } else {
            console.error(`[BaseApi] Could not find ClientDB for clientId: ${clientId}`);
        }
    }

    public async init(): Promise<void> {
        this.applicationDB = await DatabaseManagerInstance.getApplicationDB();
        await this.initClientDB(this.clientId);

        if (!this.clientDB && this.clientId) {
            // Tenant kaydı yok (authenticate ile bu çağrı arasında silindi/purge edildi): 500 değil 404 (ADR-0024 BA-06).
            throw new ApplicationError('Tenant not found', 404);
        }
    }

    /**
     * Aynı istek içinde kardeş servis kurar; ApplicationDB/ClientDB bu servisten DEVRALINIR (kardeşte `init()` ÇAĞRILMAZ:
     * bağlantı/tenant kaydı yeniden çözülmez, ek okuma olmaz). Çağıranın kendisi `init()` edilmiş olmalıdır (RunOperation yapar).
     */
    protected sibling<T extends BaseApi>(Svc: new (clientId: number, request: any) => T): T {
        const inst = new Svc(this.clientId, this.request);
        inst.applicationDB = this.applicationDB;
        inst.clientDB = this.clientDB;
        return inst;
    }
}

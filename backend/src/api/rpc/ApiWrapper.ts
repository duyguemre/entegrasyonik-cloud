import { IBaseMicroservice } from "@interfaces/index";
import { ApplicationError } from "@platform/core/security/Security";

// ADR-0001 (Karar 8): asıl yetki/izinli liste kararı RunOperation'da (OPERATION_POLICY) verilir. Bu sarmalayıcı ikinci
// savunma hattıdır: politika kaydı yanlışlıkla bozulsa bile yaşam döngüsü/iç/prototip üyeleri RPC ile ÇAĞRILAMAZ.
const RESERVED_OPERATIONS = new Set(['init', 'constructor'])

/** Yalnızca "kamuya açık operasyon" biçimindeki adlar: string, `_` önekli değil, init/constructor değil, Object.prototype üyesi değil. */
export function isCallableOperationName(operation: any): boolean {
    if (typeof operation !== 'string' || operation.length === 0) return false
    if (operation.startsWith('_')) return false
    if (RESERVED_OPERATIONS.has(operation)) return false
    if (operation in Object.prototype) return false
    return true
}

class MicroserviceWrapper {

    constructor(private microservice: IBaseMicroservice) {
    }

    public async process(clientId: number, operation: string, request: any) {
        // Örneklemeden ve init() (DB bağlantısı) çalışmadan ÖNCE reddet; servis metodu çağrılmaz
        if (!isCallableOperationName(operation)) throw new ApplicationError('Forbidden', 403)

        const microserviceInstance = new this.microservice(clientId, request) as any
        await microserviceInstance.init()
        if (typeof microserviceInstance[operation] === 'function') {
            return await microserviceInstance[operation]();
        }
        else {
            throw (new Error("Operation not implemented"))
        }
    }
}

export default MicroserviceWrapper;

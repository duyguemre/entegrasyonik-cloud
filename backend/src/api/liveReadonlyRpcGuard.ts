// LIVE-RO Katman B (API): canlı salt-okuma kipinde (`LIVE_READONLY=1`) DIŞ dünyaya YAZAN RPC'lerin tek, merkezî reddi. RunOperation'ın tek kancası.
// Kural kaynağı yetenek kaydıdır (ADR-0019): `external === true` VE `effect !== 'read'` => 423 LIVE_READONLY. Servis servis dağıtılmaz.
// İstisna (AÇIK liste): kullanıcı tetiklemeli İÇE ALMA (`requestFetchFromPlatform`: yerel ImportJob açar, pazaryerinden YALNIZ okur; yazma capability'si
// `integrations.batch.dispatch`'i export ile paylaştığı için effect=write görünür). Ek yasak (AÇIK liste): yetenek kaydında `external:false` görünen ama
// dış yazma tetikleyebilecekler. Yerel DB'ye yazan RPC'ler (ürün düzenleme, eşleme vb.) SERBEST; bu kipte yayın işçileri kapalı olduğundan dışarı çıkmaz.
import { CAPABILITY_BY_RPC } from '../capabilities';
import { ApplicationError } from '@platform/core/errors/ApplicationError';
import { config } from '@config';

/** external+write görünse de OKUMA olanlar. */
export const LIVE_READONLY_ALLOWED_RPCS: ReadonlySet<string> = new Set(['IntegrationService/requestFetchFromPlatform']);
/** Kayıtta external görünmeyen ama dış yazma/token değişimi tetikleyenler. */
export const LIVE_READONLY_DENIED_RPCS: ReadonlySet<string> = new Set(['IntegrationService/batchCreator', 'IntegrationService/retrieveAndSetExternalToken', 'EcommerceService/retrieveAndSetExternalToken']);

/** Bu RPC canlı salt-okuma kipinde reddedilmeli mi? (saf; kip denetimi çağıranda) */
export function isLiveReadonlyBlockedRpc(service: string, operation: string): boolean {
    const rpc = service + '/' + operation;
    if (LIVE_READONLY_DENIED_RPCS.has(rpc)) return true;
    if (LIVE_READONLY_ALLOWED_RPCS.has(rpc)) return false;
    const cap = CAPABILITY_BY_RPC.get(rpc);
    return !!cap && cap.external === true && cap.effect !== 'read';
}

/** Kip kapalıysa HİÇBİR ŞEY yapmaz. Açıkken dış-yazma RPC'sini 423 `LIVE_READONLY` ile reddeder. */
export function enforceLiveReadonlyForRpc(service: string, operation: string): void {
    if (!config.liveReadonly.enabled) return;
    if (!isLiveReadonlyBlockedRpc(service, operation)) return;
    throw new ApplicationError('Canlı salt-okuma kipi: bu işlem pazaryerine/dış sisteme yazacağı için kapalıdır.', 423, 'LIVE_READONLY');
}

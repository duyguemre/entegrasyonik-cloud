// ADR-0001 (Karar 7, 8, 9): TEK operasyon politika kaydı = izinli liste + kademe (RBAC).
//
// - Kayıtta OLMAYAN her (servis, operasyon) çifti varsayılan olarak REDDEDİLİR (403): `init`, yardımcı/özel metotlar,
//   prototip üyeleri (`toString`, `constructor`...), `_` önekliler ve FE'nin çağırmadığı her şey dahil.
// - Kademeler: member < admin < owner; ayrı dikey `platformAdmin` (= doğrulanmış principal.ga === true).
// - Aktörün kademesi GÜVENİLİR kaynaktan gelir: `userContext` sunucuda DB'den (merkezi Users) kurulur (authenticate.ts),
//   token'daki `role` claim'i KULLANILMAZ.
//
// [ADR-0019 §2, Aşama A] Bu tablo artık ELLE YAZILMAZ: `backend/src/capabilities/` Yetenek Kaydı'ndan
// `derivePolicy()` ile BELLEKTE TÜRETİLİR. Bu dosyanın dışa açık API'si (OPERATION_POLICY, getRequiredTier,
// resolveTier, isAllowed, IMAGE_API_TARGETS, OPEN_OPERATIONS, PSEUDO_SERVICES) ve DAVRANIŞI AYNI kalır —
// `derivePolicy(CAPABILITIES)` A aşaması öncesindeki (elle yazılmış) tabloyla birebir aynı değerleri üretir
// (kanıt: tests/characterization/auth/capability-parity.test.ts P1 "türetilen === eski tablo" anlık görüntü
// testi; eski tablonun kendisi tests/characterization/auth/operationPolicy.snapshot.ts'te saklanır — geri alma:
// o dosyanın içeriği bu değişkene geri yapıştırılır, tek commit).
// Yeni operasyon eklemek artık BURADA değil, `backend/src/capabilities/domains/<alan>.ts`'te yeni bir
// `defineCapability({ ..., bindings: [{ rpc: 'Servis/operasyon' }] })` girdisi ile yapılır.
// FE'ye yeni operasyon eklendiğinde ilgili yetenek/bağ unutulursa 403 ile hemen görünür
// (tests/characterization/auth/operation-policy.test.ts FE envanterini tarar ve kırılır).
import { CAPABILITIES, CAPABILITY_BY_RPC } from '../capabilities';
import type { CapabilityPermission } from '../capabilities/permissions';
import { derivePolicy } from '../capabilities/derive/policy';
import type { Tier as CapabilityTier } from '../capabilities/types';
import { resolveTier, TENANT_TIER_RANK, type TenantTier, type TierActor } from '@platform/core/authz/tier';

export type Tier = CapabilityTier;
export type { TenantTier };
const VALID_TIERS: ReadonlyArray<string> = ['member', 'admin', 'owner', 'platformAdmin'];

export type OperationPolicy = Record<string, Record<string, Tier>>;

export const OPERATION_POLICY: OperationPolicy = derivePolicy(CAPABILITIES);

/** ImageApiManager rotası -> gerçek servis/metot. Sözde-servis 'ImageApi' yalnızca bu tablo üzerinden çalışır. */
export const IMAGE_API_TARGETS: Readonly<Record<string, readonly [string, string]>> = {
    upload: ['ImageService', 'addImages'],
    uploadIdentity: ['SettingService', 'uploadLogo'],
    getImages: ['ImageService', 'getImages'],
    deleteImage: ['ImageService', 'deleteImage'],
    deleteImageSelected: ['ImageService', 'deleteImages'],
    sortImages: ['ImageService', 'sortImages'],
};

/**
 * ImageApiManager'da rotası olan ama hedef servis metodu bulunmayan (bugün de çalışmayan) rotalar: politika kaydında YOK,
 * dolayısıyla runImageApi bunları 403 ile reddeder (eskiden 500 "Operation not implemented").
 */
export const IMAGE_API_ROUTES_WITHOUT_BACKEND: ReadonlyArray<string> = ['getImage', 'downloadImage'];

/** Genel RPC ile erişilemeyen (kayıtta var ama gerçek servis olmayan) sözde-servisler. */
export const PSEUDO_SERVICES: ReadonlyArray<string> = ['ImageApi'];

/**
 * Açık (kimliksiz) POST operasyonları — TEK kaynak; authenticate.ts OPEN_ROUTES bunlardan türetilir.
 * Politika kaydına girmezler, kademe kontrolünden muaftırlar (yalnızca bu çiftler, tam eşleşme).
 * AccountService/* üçü: giriş yapamayan kullanıcının akışları (parola sıfırlama isteği/onayı, e-posta doğrulama);
 * IP/e-posta rate limit'i ApiManager'daki özel rotalardadır.
 */
export const OPEN_OPERATIONS: ReadonlyArray<string> = [
    'SecurityService/login',
    'SecurityService/register',
    'SecurityService/logout',
    'AccountService/requestPasswordReset',
    'AccountService/confirmPasswordReset',
    'AccountService/verifyEmail',
    // [ADR-0028 WP-A4] davet: kimliksiz iki uç (özel rota + accountTokenLimiter; jenerik rotadan reddedilir)
    'AccountService/getInvitation',
    'AccountService/acceptInvitation',
    // [ADR-0026 Karar 4.9] backoffice'in ürettiği tek kullanımlık impersonation bileti = kimlik (dedicated rota; hız sınırlı).
    'SecurityService/redeemImpersonation',
    // Google ile giriş: kimlik = Google ID token (özel rota + loginLimiter; jenerik rotadan reddedilir). authConfig GET'tir -> authenticate.ts OPEN_ROUTES.
    'SecurityService/googleSignIn',
];

const hasOwn = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/**
 * Kayıtta varsa gerekli kademeyi döner; yoksa undefined (= varsayılan ret).
 * Yalnızca KENDİ (own) anahtarlar sayılır: `constructor`, `toString`, `__proto__` gibi prototip üyeleri asla eşleşmez.
 */
export function getRequiredTier(service: string, operation: string): Tier | undefined {
    if (typeof service !== 'string' || typeof operation !== 'string') return undefined;
    if (operation.startsWith('_')) return undefined;
    if (!hasOwn(OPERATION_POLICY, service)) return undefined;
    const ops = OPERATION_POLICY[service];
    if (!hasOwn(ops, operation)) return undefined;
    const tier = ops[operation];
    return VALID_TIERS.includes(tier) ? tier : undefined; // bozuk kayıt de reddedilir
}

export type Actor = TierActor;

/**
 * [ADR-0028 WP-A1] Yeteneğin yetkilendirme izni (kayıt tek kaynak). Kayıtta olmayan / `_` önekli / prototip üyesi -> undefined (varsayılan ret).
 * `getRequiredTier` ile aynı varlık kurallarına tabidir.
 */
export function getRequiredPermission(service: string, operation: string): CapabilityPermission | undefined {
    const tier = getRequiredTier(service, operation);
    if (tier === undefined) return undefined;
    const cap = CAPABILITY_BY_RPC.get(service + '/' + operation);
    // Politika tablosu (OPERATION_POLICY) yetkili kalır: yetenek kaydıyla sürüklenmişse (kademe farkı) izin kullanılmaz, çağıran kademe kontrolüne düşer.
    return cap && cap.minTier === tier ? cap.permission : undefined;
}

// [ADR-0028 WP-A1] resolveTier platform/core/authz'ye taşındı (depcruise: operations -> api kenarı kapandı); burada yeniden dışa verilir.
export { resolveTier };

/** Aktör gerekli kademeyi karşılıyor mu? `platformAdmin` ayrı dikeydir; tenant kademeleri onu sağlamaz. */
export function isAllowed(required: Tier, actor: Actor): boolean {
    if (!actor) return false;
    if (required === 'platformAdmin') return actor.platformAdmin === true;
    if (!VALID_TIERS.includes(required) || actor.tier === undefined) return false;
    return TENANT_TIER_RANK[actor.tier] >= TENANT_TIER_RANK[required as TenantTier];
}

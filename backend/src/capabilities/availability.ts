// ADR-0034 Karar 4.2 / AGENT_BROKER_PLAN BR-2: bir yetenegin BU oturum icin LLM yuzeyinde (sohbet; ileride MCP) kullanilabilir olup olmadigi.
// TEK kaynak: hem arac LISTESI (tools.ts: gorunurluk) hem YURUTME (invoke.ts: yeniden denetim) bunu cagirir -- yeni kural listesi YOKTUR;
// kurallar mevcut kancalardan gelir: `can()` (RBAC), `isLiveReadonlyBlockedRpc` (LIVE_READONLY), `impersonationDenial` (destek oturumu),
// bakim modu (`maintenanceGuard` ile ayni ilke: read/propose serbest), kill-switch (`features.agent.disabledCapabilities`).
// Entitlement (plan/abonelik) asenkron oldugu icin ayridir (tools.ts `entitled` kancasi + RunOperation `enforceEntitlementGuard`).
import { can, type AuthzActor } from '@platform/core/authz/can';
import { isLiveReadonlyBlockedRpc } from '../api/rpc/liveReadonlyRpcGuard';
import { impersonationDenial } from '../api/rpc/impersonationPolicy';
import type { CapabilityDef, RpcBinding } from './types';
import { rpcBindingsOf } from './index';

export type HiddenReason = 'not_exposed' | 'scope' | 'rbac' | 'disabled' | 'live_readonly' | 'maintenance' | 'impersonation';

export interface AvailabilityEnv {
    liveReadonly: boolean;
    maintenance: boolean;
    /** Kill-switch: kapatilmis yetenek kimlikleri. */
    disabled: ReadonlySet<string>;
    /** Destek (impersonation) oturumu. */
    imp: boolean;
}

/** Sohbetin cagirdigi RPC: girdiyi LLM biciminden RPC govdesine ceviren (`map`) ilk bag; yoksa ilk RPC bagi. */
export function chatBindingOf(cap: Pick<CapabilityDef, 'bindings'>): RpcBinding | undefined {
    const rpcs = rpcBindingsOf(cap);
    return rpcs.find((b) => typeof b.map === 'function') ?? rpcs[0];
}

/** Yazma/yan etkili mi (onay karti gerektirir)? `propose` onaysiz (onizleme). */
export function needsConfirmation(cap: Pick<CapabilityDef, 'effect'>): boolean {
    return cap.effect === 'write' || cap.effect === 'destructive';
}

/** Gizleme nedeni; gorunur/kullanilabilirse undefined. Saf (I/O yok). */
export function hiddenReasonFor(cap: CapabilityDef, actor: AuthzActor | undefined, env: AvailabilityEnv): HiddenReason | undefined {
    if (!cap.mcp.exposed || cap.executor !== 'server') return 'not_exposed';
    if (cap.scope === 'platform') return 'scope';
    if (!can(actor, cap.permission).allowed) return 'rbac';
    if (env.disabled.has(cap.id)) return 'disabled';
    const b = chatBindingOf(cap);
    if (!b) return 'not_exposed';
    const [service, operation] = b.rpc.split('/');
    if (env.liveReadonly && isLiveReadonlyBlockedRpc(service, operation)) return 'live_readonly';
    if (env.maintenance && needsConfirmation(cap)) return 'maintenance';
    if (env.imp && (cap.effect !== 'read' || rpcBindingsOf(cap).some((x) => impersonationDenial(x.rpc) !== undefined))) return 'impersonation';
    return undefined;
}

/**
 * [ADR-0034 Karar 6 / BR-4] Backoffice sohbetinde (`backoffice_chat`) bir yetenegin kullanilabilirligi. `hiddenReasonFor`'dan AYRI ve DAR:
 * yalniz `adminChat` isaretli, `scope:'platform'`, `effect:'read'` yetenekler; RBAC = `can()` (PLATFORM_ONLY -> yalniz platformAdmin);
 * kill-switch ortaktir. Okuma oldugu icin LIVE_READONLY/bakim/impersonation bu yuzeyde engel degildir (dis yazma yok).
 */
export function hiddenReasonForAdminChat(cap: CapabilityDef, actor: AuthzActor | undefined, env: AvailabilityEnv): HiddenReason | undefined {
    if (!cap.adminChat || cap.executor !== 'server' || cap.effect !== 'read') return 'not_exposed';
    if (cap.scope !== 'platform') return 'scope';
    if (!can(actor, cap.permission).allowed) return 'rbac';
    if (env.disabled.has(cap.id)) return 'disabled';
    const b = chatBindingOf(cap);
    if (!b) return 'not_exposed';
    const [service, operation] = b.rpc.split('/');
    if (env.liveReadonly && isLiveReadonlyBlockedRpc(service, operation)) return 'live_readonly';
    return undefined;
}

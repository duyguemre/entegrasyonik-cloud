// ADR-0019 §1: Yetenek Kaydı — TEK gerçek kaynak. Alan dosyalarını birleştirir ve DEĞİŞMEZLERİ (invariants) doğrular.
import type { CapabilityDef, CapabilityId, HttpRef, RpcBinding } from './types';
import { toolNameOf, TOOL_NAME_RE } from './derive/toolName';
import { ACCOUNT_CAPABILITIES } from './domains/account';
import { AGENT_CAPABILITIES } from './domains/agent';
import { OAUTH_CAPABILITIES } from './domains/oauth';
import { MCP_CAPABILITIES } from './domains/mcp';
import { BILLING_CAPABILITIES } from './domains/billing';
import { CATALOG_CAPABILITIES } from './domains/catalog';
import { CLAIMS_CAPABILITIES } from './domains/claims';
import { CUSTOMERS_CAPABILITIES } from './domains/customers';
import { FINANCE_CAPABILITIES } from './domains/finance';
import { INTEGRATIONS_CAPABILITIES } from './domains/integrations';
import { INVOICES_CAPABILITIES } from './domains/invoices';
import { MESSAGES_CAPABILITIES } from './domains/messages';
import { ORDERS_CAPABILITIES } from './domains/orders';
import { PLATFORM_CAPABILITIES } from './domains/platform';
import { BACKOFFICE_CAPABILITIES } from './domains/backoffice';
import { BACKOFFICE_INFRA_CAPABILITIES } from './domains/backoffice-infra';
import { BACKOFFICE_BILLING_CAPABILITIES } from './domains/backoffice-billing';
import { BACKOFFICE_ENGINE_CAPABILITIES } from './domains/backoffice-engine';
import { BACKOFFICE_NOTIFICATIONS_CAPABILITIES } from './domains/backoffice-notifications';
import { REPORTS_CAPABILITIES } from './domains/reports';
import { SHIPMENTS_CAPABILITIES } from './domains/shipments';
import { SUPPORT_CAPABILITIES } from './domains/support';
import { RPC_INPUT_SCHEMAS } from './rpc-input';
import { PLATFORM_ONLY, isPermission } from './permissions';
import { minTierFromPermission } from './roles';

/** [ADR-0023] `rpc-input/**` şemalarını ilgili bağlara iliştirir (girdi değişmez; şemalı bağ için yeni bağ nesnesi üretilir). */
function attachRpcInputs(caps: ReadonlyArray<CapabilityDef>): CapabilityDef[] {
    return caps.map((cap) => {
        if (!cap.bindings.some((b) => b.rpc && RPC_INPUT_SCHEMAS[b.rpc])) return cap;
        return { ...cap, bindings: cap.bindings.map((b) => (b.rpc && RPC_INPUT_SCHEMAS[b.rpc] ? { ...b, input: RPC_INPUT_SCHEMAS[b.rpc] } : b)) } as CapabilityDef;
    });
}

/** Yeteneğin RPC bağları (HTTP bağları hariç): OPERATION_POLICY, `RunOperation` ve koruma kancaları yalnız bunlara bakar. */
export function rpcBindingsOf(cap: Pick<CapabilityDef, 'bindings'>): RpcBinding[] {
    return cap.bindings.filter((b): b is RpcBinding => typeof b.rpc === 'string');
}

/** Yeteneğin HTTP rota bağları (`'POST /agent/turns'`). */
export function httpBindingsOf(cap: Pick<CapabilityDef, 'bindings'>): HttpRef[] {
    return cap.bindings.flatMap((b) => (typeof b.http === 'string' ? [b.http] : []));
}

/** Yetenek kaydı: TÜM alanların birleşimi. `local` alanı Aşama A'da boş (masaüstü yerel araçlar Faz 4). */
export const CAPABILITIES: ReadonlyArray<CapabilityDef> = attachRpcInputs([
    ...PLATFORM_CAPABILITIES,
    ...BACKOFFICE_CAPABILITIES,
    ...BACKOFFICE_INFRA_CAPABILITIES,
    ...BACKOFFICE_BILLING_CAPABILITIES,
    ...BACKOFFICE_ENGINE_CAPABILITIES,
    ...BACKOFFICE_NOTIFICATIONS_CAPABILITIES,
    ...ACCOUNT_CAPABILITIES,
    ...AGENT_CAPABILITIES,
    ...OAUTH_CAPABILITIES,
    ...MCP_CAPABILITIES,
    ...BILLING_CAPABILITIES,
    ...SUPPORT_CAPABILITIES,
    ...MESSAGES_CAPABILITIES,
    ...CATALOG_CAPABILITIES,
    ...ORDERS_CAPABILITIES,
    ...CLAIMS_CAPABILITIES,
    ...CUSTOMERS_CAPABILITIES,
    ...SHIPMENTS_CAPABILITIES,
    ...INVOICES_CAPABILITIES,
    ...FINANCE_CAPABILITIES,
    ...INTEGRATIONS_CAPABILITIES,
    ...REPORTS_CAPABILITIES,
]);

export const CAPABILITY_BY_ID: ReadonlyMap<CapabilityId, CapabilityDef> = new Map(CAPABILITIES.map((cap) => [cap.id, cap]));

/**
 * `'Servis/operasyon'` (ImageApi sözde-servisi dahil) → sahip yetenek. Değişmez (ADR-0019 §1): her RPC operasyonu
 * TAM OLARAK bir yeteneğin `bindings` listesindedir — `assertRegistryInvariants` bunu doğrular.
 */
export const CAPABILITY_BY_RPC: ReadonlyMap<string, CapabilityDef> = (() => {
    const m = new Map<string, CapabilityDef>();
    for (const cap of CAPABILITIES) for (const b of rpcBindingsOf(cap)) m.set(b.rpc, cap);
    return m;
})();

/** `'Servis/operasyon'` -> RPC gövde şeması (yalnız şemalı bağlar; şemasız operasyon eskisi gibi çalışır). */
export const RPC_INPUT_BY_RPC: ReadonlyMap<string, import('zod').ZodType<any>> = (() => {
    const m = new Map<string, import('zod').ZodType<any>>();
    for (const cap of CAPABILITIES) for (const b of rpcBindingsOf(cap)) if (b.input) m.set(b.rpc, b.input);
    return m;
})();

export interface RegistryInvariantViolation { kind: string; detail: string }

/**
 * Kayıt bütünlüğü (P1'in kayıt-içi yarısı; RunOperation/OPERATION_POLICY karşılaştırması `derive/policy.ts`'tedir):
 *  - `id` benzersiz.
 *  - Her RPC (`bindings[].rpc`) TAM OLARAK bir yetenekte geçer (iki yetenek aynı operasyonu paylaşamaz).
 *  - Bir yeteneğin TÜM bağları aynı `minTier`'ı paylaşır (OPERATION_POLICY tek bir (servis,operasyon)→kademe kaydı üretebilsin).
 *  - `exposed` yeteneklerde `llm`/`output`/strict girdi/`pii≠raw` (tip zaten zorluyor; burada çalışma-anı ikinci doğrulama).
 */
export function findRegistryInvariantViolations(caps: ReadonlyArray<CapabilityDef> = CAPABILITIES): RegistryInvariantViolation[] {
    const out: RegistryInvariantViolation[] = [];
    const seenIds = new Set<string>();
    const rpcOwner = new Map<string, string>();
    const httpOwner = new Map<string, string>();
    const toolOwner = new Map<string, string>();
    for (const cap of caps) {
        if (seenIds.has(cap.id)) out.push({ kind: 'DUPLICATE_ID', detail: cap.id });
        seenIds.add(cap.id);

        const tiers = new Set(cap.bindings.map(() => cap.minTier));
        if (tiers.size > 1) out.push({ kind: 'MIXED_TIER_BINDINGS', detail: cap.id });

        for (const b of cap.bindings) {
            if (typeof b.http === 'string') {
                const hOwner = httpOwner.get(b.http);
                if (hOwner && hOwner !== cap.id) out.push({ kind: 'HTTP_BOUND_TWICE', detail: `${b.http} (${hOwner}, ${cap.id})` });
                httpOwner.set(b.http, cap.id);
                continue;
            }
            const owner = rpcOwner.get(b.rpc);
            if (owner && owner !== cap.id) out.push({ kind: 'RPC_BOUND_TWICE', detail: `${b.rpc} (${owner}, ${cap.id})` });
            rpcOwner.set(b.rpc, cap.id);
        }
        if (cap.executor === 'server' && cap.bindings.length === 0) out.push({ kind: 'SERVER_WITHOUT_BINDING', detail: cap.id });

        // [ADR-0034 Karar 6] adminChat yalnız platform kapsamlı ve salt-okunur yeteneklerde (backoffice sohbeti v1 yazma aracı içermez).
        if (cap.adminChat) {
            if (cap.scope !== 'platform') out.push({ kind: 'ADMIN_CHAT_NOT_PLATFORM', detail: cap.id });
            if (cap.effect !== 'read') out.push({ kind: 'ADMIN_CHAT_NOT_READ', detail: cap.id });
            // BR-4: adminChat araci strict ciktisiz (legacy) / PII'li olamaz; `llm` zorunlu; MCP'ye acilamaz.
            if (cap.output === 'legacy') out.push({ kind: 'ADMIN_CHAT_OUTPUT_LEGACY', detail: cap.id });
            if (cap.pii !== 'none') out.push({ kind: 'ADMIN_CHAT_PII', detail: cap.id });
            if (!cap.adminChat.exposed.llm?.description || (cap.adminChat.exposed.llm.examples ?? []).length < 2) out.push({ kind: 'ADMIN_CHAT_LLM_MISSING', detail: cap.id });
            if (cap.mcp.exposed) out.push({ kind: 'ADMIN_CHAT_MCP_EXPOSED', detail: cap.id });
        }
        if (cap.mcp.exposed) {
            // Araç adı (`orders.list` -> `orders_list`): geçerli biçim ve TEKİL (aynı ada inen iki kimlik olamaz).
            const tn = toolNameOf(cap.id);
            if (!TOOL_NAME_RE.test(tn)) out.push({ kind: 'TOOL_NAME_INVALID', detail: `${cap.id} (${tn})` });
            const tOwner = toolOwner.get(tn);
            if (tOwner && tOwner !== cap.id) out.push({ kind: 'TOOL_NAME_COLLISION', detail: `${tn} (${tOwner}, ${cap.id})` });
            toolOwner.set(tn, cap.id);
            if (cap.scope === 'platform') out.push({ kind: 'EXPOSED_PLATFORM_SCOPE', detail: cap.id });
            if (cap.effect !== 'read' && cap.effect !== 'propose' && cap.mcp.exposed.confirm === 'none') out.push({ kind: 'EXPOSED_WRITE_WITHOUT_CONFIRM', detail: cap.id });
            if (!cap.llm) out.push({ kind: 'EXPOSED_WITHOUT_LLM', detail: cap.id });
            if (cap.output === 'legacy') out.push({ kind: 'EXPOSED_WITH_LEGACY_OUTPUT', detail: cap.id });
            if (cap.pii === 'raw') out.push({ kind: 'EXPOSED_WITH_RAW_PII', detail: cap.id });
            if (cap.llm && (cap.llm.description.length < 120 || cap.llm.description.length > 900)) out.push({ kind: 'LLM_DESCRIPTION_LENGTH', detail: cap.id });
            if (cap.llm && cap.llm.examples.length < 2) out.push({ kind: 'LLM_EXAMPLES_MIN', detail: cap.id });
        } else {
            if (cap.mcp.notExposed.note.length < 20) out.push({ kind: 'NOT_EXPOSED_NOTE_TOO_SHORT', detail: cap.id });
            if (cap.mcp.notExposed.reason === 'deferred' && !cap.mcp.notExposed.until) out.push({ kind: 'DEFERRED_WITHOUT_UNTIL', detail: cap.id });
        }
    }
    // [ADR-0028 WP-A1] İzin değişmezleri: geçerli izin; platform işareti <=> platformAdmin; tenant izni <=> türetilen minTier == minTier;
    // bir izin farklı minTier'lı yetenekleri toplayamaz (PERMISSION_MIXED_TIER; tutarsızlık PERMISSION_TIER_MISMATCH olarak da görünür).
    const permTier = new Map<string, string>();
    for (const cap of caps) {
        const perm = cap.permission as string | undefined;
        if (cap.minTier === 'platformAdmin') {
            if (perm !== PLATFORM_ONLY) out.push({ kind: 'PLATFORM_CAPABILITY_WITHOUT_PLATFORM_PERMISSION', detail: cap.id });
            continue;
        }
        if (!isPermission(perm)) { out.push({ kind: 'PERMISSION_INVALID', detail: `${cap.id} (${String(perm)})` }); continue; }
        const derived = minTierFromPermission(perm);
        if (derived !== cap.minTier) out.push({ kind: 'PERMISSION_TIER_MISMATCH', detail: `${cap.id} (${perm}: rol kademesi ${derived}, minTier ${cap.minTier})` });
        const seen = permTier.get(perm);
        if (seen && seen !== cap.minTier) out.push({ kind: 'PERMISSION_MIXED_TIER', detail: `${cap.id} (${perm})` });
        permTier.set(perm, cap.minTier);
    }
    return out;
}

export * from './types';
export * from './define';
export * from './permissions';
export * from './roles';
export { toolNameOf, TOOL_NAME_RE } from './derive/toolName';

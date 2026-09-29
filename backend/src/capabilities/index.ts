// ADR-0019 §1: Yetenek Kaydı — TEK gerçek kaynak. Alan dosyalarını birleştirir ve DEĞİŞMEZLERİ (invariants) doğrular.
import type { CapabilityDef, CapabilityId } from './types';
import { ACCOUNT_CAPABILITIES } from './domains/account';
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
import { REPORTS_CAPABILITIES } from './domains/reports';
import { SHIPMENTS_CAPABILITIES } from './domains/shipments';
import { SUPPORT_CAPABILITIES } from './domains/support';

/** Yetenek kaydı: TÜM alanların birleşimi. `local` alanı Aşama A'da boş (masaüstü yerel araçlar Faz 4). */
export const CAPABILITIES: ReadonlyArray<CapabilityDef> = [
    ...PLATFORM_CAPABILITIES,
    ...ACCOUNT_CAPABILITIES,
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
];

export const CAPABILITY_BY_ID: ReadonlyMap<CapabilityId, CapabilityDef> = new Map(CAPABILITIES.map((cap) => [cap.id, cap]));

/**
 * `'Servis/operasyon'` (ImageApi sözde-servisi dahil) → sahip yetenek. Değişmez (ADR-0019 §1): her RPC operasyonu
 * TAM OLARAK bir yeteneğin `bindings` listesindedir — `assertRegistryInvariants` bunu doğrular.
 */
export const CAPABILITY_BY_RPC: ReadonlyMap<string, CapabilityDef> = (() => {
    const m = new Map<string, CapabilityDef>();
    for (const cap of CAPABILITIES) for (const b of cap.bindings) m.set(b.rpc, cap);
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
    for (const cap of caps) {
        if (seenIds.has(cap.id)) out.push({ kind: 'DUPLICATE_ID', detail: cap.id });
        seenIds.add(cap.id);

        const tiers = new Set(cap.bindings.map(() => cap.minTier));
        if (tiers.size > 1) out.push({ kind: 'MIXED_TIER_BINDINGS', detail: cap.id });

        for (const b of cap.bindings) {
            const owner = rpcOwner.get(b.rpc);
            if (owner && owner !== cap.id) out.push({ kind: 'RPC_BOUND_TWICE', detail: `${b.rpc} (${owner}, ${cap.id})` });
            rpcOwner.set(b.rpc, cap.id);
        }
        if (cap.executor === 'server' && cap.bindings.length === 0) out.push({ kind: 'SERVER_WITHOUT_BINDING', detail: cap.id });

        if (cap.mcp.exposed) {
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
    return out;
}

export * from './types';
export * from './define';

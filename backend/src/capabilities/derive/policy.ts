// ADR-0019 §2 türetme (a): OPERATION_POLICY nesnesi bellekte kayıttan türetilir.
// `api/operationPolicy.ts` bunu `derivePolicy(CAPABILITIES)` ile dışa verir; dışa açık API (getRequiredTier/resolveTier/
// isAllowed/OPEN_OPERATIONS/IMAGE_API_TARGETS/PSEUDO_SERVICES) DEĞİŞMEZ.
import type { CapabilityDef, PolicyTable, Tier } from '../types';

/** `'Servis/operasyon'` → `[servis, operasyon]`. */
function splitRpc(rpc: string): [string, string] {
    const i = rpc.indexOf('/');
    return [rpc.slice(0, i), rpc.slice(i + 1)];
}

/**
 * Kayıttaki tüm yeteneklerin `bindings[].rpc`'lerinden OPERATION_POLICY biçiminde bir tablo üretir.
 * Bir yeteneğin TÜM bağları aynı `minTier`'ı paylaşır (kayıt bütünlüğü, `findRegistryInvariantViolations`
 * `MIXED_TIER_BINDINGS` ile bunu zaten reddeder) — bu yüzden çakışma durumunda "son yazan kazanır" riski yoktur.
 */
export function derivePolicy(caps: ReadonlyArray<CapabilityDef>): PolicyTable {
    const table: Record<string, Record<string, Tier>> = {};
    for (const cap of caps) {
        for (const b of cap.bindings) {
            const [service, operation] = splitRpc(b.rpc);
            (table[service] ??= {})[operation] = cap.minTier;
        }
    }
    return table;
}

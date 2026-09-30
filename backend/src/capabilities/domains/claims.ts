// İadeler (ClaimService). FE: ClaimListView (components/claim/composables/useClaimActions.ts sabitleri).
// Kasitli kayitsiz (guvensiz) manuel durum guncelleme metodu kaldirildi (faz4-arch-p1dead); guvenli surumu ADR-0004 tahsis akisiyla yazilacak.
import { defineCapability as c, deferred, nx, NO_AGENT, onScreens, noUi } from '../define';

const CLM = 'ClaimListView';

export const CLAIMS_CAPABILITIES = [
    c({
        id: 'claims.list', domain: 'claims', summary: { tr: 'İadeleri listele', en: 'List claims (returns)' },
        effect: 'read', minTier: 'member', permission: 'claims:read', pii: 'raw', bindings: [{ rpc: 'ClaimService/getClaims' }],
        ui: onScreens(CLM), mcp: deferred('later', 'İade listesi müşteri PII içerir; maskeleme olmadan açılmaz (toolset: orders).'), agent: NO_AGENT,
    }),
    c({
        id: 'claims.get', domain: 'claims', summary: { tr: 'Tekil iade ayrıntısını getir', en: 'Get a single claim' },
        effect: 'read', minTier: 'member', permission: 'claims:read', pii: 'raw', bindings: [{ rpc: 'ClaimService/getClaimById' }],
        ui: noUi('Backend-only: FE henüz çağırmıyor (BACKEND_ONLY_NOT_YET_IN_FE).'),
        mcp: deferred('later', 'İade detayı müşteri PII içerir; maskeleme olmadan açılmaz (toolset: orders).'), agent: NO_AGENT,
    }),
    c({
        id: 'claims.approve', domain: 'claims', summary: { tr: 'İadeleri onayla (tekli/toplu)', en: 'Approve claims (single/bulk)' },
        effect: 'write', minTier: 'member', permission: 'claims:write', external: true, bindings: [{ rpc: 'ClaimService/approveClaim' }, { rpc: 'ClaimService/bulkApproveClaim' }],
        ui: onScreens([CLM, 'approve']), mcp: nx('irreversible', 'Pazaryerinde iade onayı (para iadesi) geri alınamaz; yalnız ekranda.'), agent: NO_AGENT,
    }),
    c({
        id: 'claims.reject', domain: 'claims', summary: { tr: 'İadeyi reddet', en: 'Reject a claim' },
        effect: 'write', minTier: 'member', permission: 'claims:write', external: true, bindings: [{ rpc: 'ClaimService/rejectClaim' }],
        ui: onScreens([CLM, 'reject']), mcp: nx('irreversible', 'Pazaryerinde iade reddi müşteriye bildirilir ve geri alınamaz; yalnız ekranda.'), agent: NO_AGENT,
    }),
];

/**
 * MCP-5 (a): P10 yuzey esitligi. UI (yetenek kaydi + can()) <-> sohbet (deriveTools 'chat') <-> MCP (deriveTools 'mcp', kapsam ∩ access) arac kumeleri.
 * Fark YALNIZ tanimli kurallardan gelir: (1) MCP'de `mcp:write` kapsami yoksa yazma araclari listelenmez; (2) geri kalan her suzgec ortaktir.
 * Matris: rol x tenant access x token kapsami x LIVE_READONLY x bakim x entitlement x impersonation x kill-switch. P9 vekil eval: dogal dil -> arac secimi.
 * Saf birim test: DB/Redis/ag YOK.
 */
import { describe, it, expect } from '@jest/globals';
import { CAPABILITIES } from '../../../src/capabilities';
import { chatBindingOf, needsConfirmation, type AvailabilityEnv } from '../../../src/capabilities/availability';
import { isLiveReadonlyBlockedRpc } from '../../../src/api/rpc/liveReadonlyRpcGuard';
import { can } from '../../../src/platform/core/authz/can';
import { effectiveScopes } from '../../../src/mcp/McpAuth';
import { deriveTools } from '../../../src/operations/agent/tools';
import type { CapabilityDef } from '../../../src/capabilities/types';

type Actor = { tier?: 'member' | 'admin' | 'owner'; platformAdmin?: boolean } | undefined;
const ACTORS: Array<[string, Actor]> = [['anon', undefined], ['member', { tier: 'member' }], ['admin', { tier: 'admin' }], ['owner', { tier: 'owner' }]];
const ACCESS = ['off', 'read', 'readwrite'] as const;
const TOKEN_SCOPES: Array<Array<'mcp:read' | 'mcp:write'>> = [['mcp:read'], ['mcp:read', 'mcp:write']];
const EXPOSED = CAPABILITIES.filter((c) => c.mcp.exposed);
const ENTITLEMENTS: Array<[string, (c: CapabilityDef) => boolean]> = [
    ['full', () => true], ['read-only', (c) => c.effect === 'read'], ['none', () => false],
];

const blockedByLiveReadonly = (c: CapabilityDef) => {
    const b = chatBindingOf(c);
    if (!b) return true;
    const [s, o] = b.rpc.split('/');
    return isLiveReadonlyBlockedRpc(s, o);
};

describe('P10 matris: UI izni <-> sohbet <-> MCP', () => {
    let cells = 0;
    for (const [aname, actor] of ACTORS) for (const access of ACCESS) for (const tscope of TOKEN_SCOPES)
        for (const liveReadonly of [false, true]) for (const maintenance of [false, true])
            for (const [ename, entitled] of ENTITLEMENTS) for (const imp of [false, true]) for (const disabledOne of [false, true]) {
                const name = `${aname} access=${access} scope=${tscope.join('+')} ro=${liveReadonly} bakim=${maintenance} ent=${ename} imp=${imp} kill=${disabledOne}`;
                it(name, () => {
                    cells += 1;
                    const disabled = new Set<string>(disabledOne ? ['orders.list'] : []);
                    const env: AvailabilityEnv = { liveReadonly, maintenance, disabled, imp };
                    const mcpWrite = effectiveScopes(tscope, access).includes('mcp:write');
                    const chat = deriveTools({ actor, env, entitled, surface: 'chat' });
                    const mcp = deriveTools({ actor, env, entitled, surface: 'mcp', mcpWrite });
                    const chatNames = chat.map((t) => t.name);
                    const mcpNames = mcp.map((t) => t.name);

                    // 1) MCP, sohbetin ALT KUMESIDIR; fark yalniz kapsam tavanindan (yazma) gelir.
                    expect(mcpNames.every((n) => chatNames.includes(n))).toBe(true);
                    const diff = chat.filter((t) => !mcpNames.includes(t.name));
                    if (mcpWrite) expect(diff).toEqual([]);
                    else { expect(diff.every((t) => t.effect !== 'read')).toBe(true); expect(mcp.every((t) => t.effect === 'read')).toBe(true); }
                    expect(mcp.filter((t) => t.effect === 'read').map((t) => t.name)).toEqual(chat.filter((t) => t.effect === 'read').map((t) => t.name));

                    // 2) UI/kayit tarafi: listelenen HER arac icin kayit izni (can) var, sunucu yurutuculu, platform degil; ortam kurallari ihlal edilmez.
                    for (const t of chat) {
                        const cap = EXPOSED.find((c) => c.id === t.capId)!;
                        expect(can(actor, cap.permission).allowed).toBe(true);
                        expect(cap.scope).not.toBe('platform');
                        expect(cap.executor).toBe('server');
                        expect(entitled(cap)).toBe(true);
                        expect(disabled.has(cap.id)).toBe(false);
                        if (liveReadonly) expect(blockedByLiveReadonly(cap)).toBe(false);
                        if (maintenance) expect(needsConfirmation(cap)).toBe(false);
                        if (imp) expect(cap.effect).toBe('read');
                    }
                    // 3) tersi: kayit kurallari izin veriyorsa (imp disinda; imp'te RPC bazli ek yasak olabilir) arac listede.
                    for (const cap of EXPOSED) {
                        const listed = chat.some((t) => t.capId === cap.id);
                        const rulesAllow = can(actor, cap.permission).allowed && cap.scope !== 'platform' && entitled(cap) && !disabled.has(cap.id)
                            && !(liveReadonly && blockedByLiveReadonly(cap)) && !(maintenance && needsConfirmation(cap)) && !(imp && cap.effect !== 'read');
                        if (!rulesAllow) expect(listed).toBe(false);
                        if (rulesAllow && !imp) expect(listed).toBe(true);
                    }
                    // 4) aktor yoksa hicbir yuzeyde arac yok
                    if (!actor) { expect(chat).toEqual([]); expect(mcp).toEqual([]); }
                });
            }
    it('matris genis (en az 1000 hucre calisti)', () => { expect(cells).toBeGreaterThanOrEqual(1000); });
});

describe('P10: arac tanimi iki yuzeyde ayni kayittan', () => {
    it('sohbet ve MCP (mcp:write) ayni arac icin ayni ad/surum/sema/aciklama/onay sinifini uretir', () => {
        const env: AvailabilityEnv = { liveReadonly: false, maintenance: false, disabled: new Set(), imp: false };
        const chat = deriveTools({ actor: { tier: 'owner' }, env, surface: 'chat' });
        const mcp = deriveTools({ actor: { tier: 'owner' }, env, surface: 'mcp', mcpWrite: true });
        expect(mcp).toEqual(chat);
    });
});

describe('P9 vekil eval: dogal dil -> MCP arac adi (en yuksek kelime ortusmesi)', () => {
    const env: AvailabilityEnv = { liveReadonly: false, maintenance: false, disabled: new Set(), imp: false };
    const tools = deriveTools({ actor: { tier: 'owner' }, env, surface: 'mcp', mcpWrite: true });
    const tok = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2));
    const pick = (q: string) => {
        const qt = tok(q);
        const score = (t: (typeof tools)[number]) => [...tok(`${t.name.replace(/_/g, ' ')} ${t.description} ${t.title.en}`)].filter((w) => qt.has(w)).length;
        return [...tools].sort((a, b) => score(b) - score(a))[0].name;
    };
    const CASES: Array<[string, string]> = [
        ['show me my recent orders list', 'orders_list'],
        ['approve the pending orders in bulk', 'orders_approve'],
        ['list product variants whose stock is at or below the threshold', 'stock_low_list'],
        ['search products by name', 'products_search'],
        ['sales summary: today revenue versus yesterday', 'reports_sales_summary'],
        ['are my marketplace integrations healthy', 'integrations_health_get'],
    ];
    for (const [q, expected] of CASES) it(`"${q}" -> ${expected}`, () => { expect(pick(q)).toBe(expected); });
    it('en az 3 vaka ve her beklenen arac MCP listesinde var', () => {
        expect(CASES.length).toBeGreaterThanOrEqual(3);
        for (const [, e] of CASES) expect(tools.map((t) => t.name)).toContain(e);
    });
});

/**
 * PRC-R2 — bağlantılar: buybox işi taze gözlemden sonra kuralları KURU değerlendirir (yalnız öneri), zamanlanmış yol YAYINLAYAMAZ,
 * backoffice özeti yalnız TOPLAM (tenant verisi yok), onay kartı risk "high" + sunucu önizlemesi (önce → sonra), yetenek kararları.
 */
import { describe, expect, it } from '@jest/globals';
import { ObjectId } from 'mongodb';
import { BuyboxRefreshJob, type BuyboxJobDeps } from '@operations/pricing/BuyboxRefreshJob';
import { resolveCompetitionSettings } from '@operations/pricing/competitionSettings';
import { NO_PUBLISH } from '@operations/pricing/createPricingEnv';
import { getPricingRulesOverview } from '@operations/backoffice/pricingRulesAdmin';
import { getSettingDef } from '@integration/config/catalog';
import { CAPABILITY_BY_ID } from '../../../src/capabilities';
import { toolOf } from '@operations/agent/tools';
import { buildPreview } from '@operations/mcp/mcpApprovals';
import { CONFIRM_SPECS, PRESENT_SPECS } from '@operations/agent/present/specs';
import { fakeClientDb } from './helpers/fakeClientDb';

const NOW = new Date('2026-10-01T12:00:00Z');
const read = (k: string) => getSettingDef(k)?.default;

function jobDeps(evaluated: number[], o: Partial<BuyboxJobDeps> = {}): BuyboxJobDeps {
    return {
        now: () => NOW, enabled: () => true, intakeOpen: () => true, budgetPerMin: () => 100, shadow: () => true, cooldownMs: () => 86_400_000,
        listTenants: async () => [1, 2].map((tid) => ({ tid, settings: resolveCompetitionSettings({ planCode: 'growth', override: {} }, read) })),
        loadCandidates: async (tid) => [{ variantId: `v${tid}`, barcode: `b${tid}`, stock: 1, checkedAt: null, changedAt: null, ownPrice: 100, prev: null }],
        read: async (tid, barcodes) => { if (tid === 2) throw new Error('429'); return barcodes.map((b) => ({ barcode: b, found: true, buyboxOrder: 2, buyboxPrice: 90, hasMultipleSeller: true })); },
        apply: async () => undefined, notifyLost: async () => undefined, markNotified: async () => undefined,
        evaluateRules: async (tid) => { evaluated.push(tid); },
        ...o,
    };
}

describe('buybox işi → KURU kural değerlendirmesi', () => {
    it('yalnız taze gözlem alan (ve okuma hatası olmayan) tenant için evaluateRules çağrılır', async () => {
        const ev: number[] = [];
        const r = await new BuyboxRefreshJob(jobDeps(ev)).runOnce();
        expect(ev).toEqual([1]);
        expect(r.rulesEvaluated).toBe(1);
    });
    it('kural değerlendirme hatası okuma turunu düşürmez', async () => {
        const r = await new BuyboxRefreshJob(jobDeps([], { evaluateRules: async () => { throw new Error('x'); } })).runOnce();
        expect(r.observed).toBe(1);
        expect(r.rulesEvaluated).toBe(0);
    });
    it('iş kapalıyken kural değerlendirmesi de yok', async () => {
        const ev: number[] = [];
        await new BuyboxRefreshJob(jobDeps(ev, { enabled: () => false })).runOnce();
        expect(ev).toEqual([]);
    });
    it('no-auto-apply: varsayılan (zamanlanmış/arka plan) yayıncı HER ZAMAN reddeder', async () => {
        await expect(NO_PUBLISH({}, 1, ['b'])).rejects.toThrow(/only allowed from the approved apply RPC/);
    });
});

describe('legal-K2-tenant-isolation (backoffice): özet yalnız toplam, tenant verisi yok', () => {
    it('iki tenant toplanır; yanıtta tenant kimliği, barkod, fiyat yok', async () => {
        const a = fakeClientDb(), b = fakeClientDb();
        a.models.pricingSettings.docs.push({ _id: 'pricing', enabled: true });
        a.models.priceRule.docs.push({ _id: new ObjectId(), enabled: true }, { _id: new ObjectId(), enabled: false, pausedReason: 'external_change' });
        a.models.priceSuggestion.docs.push({ _id: new ObjectId(), status: 'open', current: true, barcode: 'SECRET-1', afterPrice: 99 });
        b.models.priceRule.docs.push({ _id: new ObjectId(), enabled: true, pausedReason: 'oscillation' });
        b.models.priceSuggestion.docs.push({ _id: new ObjectId(), status: 'applied', updatedAt: NOW, barcode: 'SECRET-2', afterPrice: 55 },
            { _id: new ObjectId(), status: 'blocked', current: true, barcode: 'SECRET-3' });
        const out = await getPricingRulesOverview({ flagEnabled: () => false, now: () => NOW, async *tenantDbs() { yield a; yield b; } });
        expect(out).toMatchObject({
            killSwitch: { key: 'features.pricingRules', enabled: false }, autoApply: { available: false },
            scannedTenants: 2, tenantsEnabled: 1, tenantsWithRules: 2,
            rules: { total: 3, enabled: 2, pausedExternal: 1, pausedOscillation: 1 },
            suggestions: { open: 1, blocked: 1, applied7d: 1, dismissed7d: 0 },
        });
        const json = JSON.stringify(out);
        expect(json).not.toMatch(/SECRET|99|55|"tid"|tenantName/);
    });
});

describe('yetenek kararları + onay kartı', () => {
    it('apply: write, admin (pricing:manage), dış etkili, onay kartı risk high; rules.save MCP\'ye kapalı (K4), rules.settings yalnız ekranda (K3)', () => {
        const apply = CAPABILITY_BY_ID.get('pricing.suggestions.apply' as any)!;
        expect(apply).toMatchObject({ effect: 'write', minTier: 'admin', permission: 'pricing:manage', external: true, audit: 'always' });
        expect(apply.mcp.exposed).toMatchObject({ confirm: 'confirm', risk: 'high' });
        expect(toolOf(apply)).toMatchObject({ confirm: 'confirm', risk: 'high', external: true });
        expect(CAPABILITY_BY_ID.get('pricing.rules.save' as any)!.mcp.notExposed).toMatchObject({ reason: 'deferred' });
        expect(CAPABILITY_BY_ID.get('pricing.rules.settings' as any)!.mcp.notExposed).toMatchObject({ reason: 'irreversible' });
        for (const id of ['pricing.rules.list', 'pricing.suggestions.list']) {
            expect(CAPABILITY_BY_ID.get(id as any)).toMatchObject({ effect: 'read', minTier: 'member', permission: 'catalog:read' });
            expect(PRESENT_SPECS[id]).toBeDefined();
        }
        expect(CONFIRM_SPECS['pricing.suggestions.apply']).toBeDefined();
    });
    it('ekran + Otopilot/MCP eşitliği: aynı RPC (tek kayıt) — ekran ve araç aynı yeteneğe bağlı', () => {
        const apply = CAPABILITY_BY_ID.get('pricing.suggestions.apply' as any)!;
        expect(apply.bindings.map((b: any) => b.rpc)).toEqual(['PricingService/applySuggestions', 'PricingService/dismissSuggestions']);
        expect((apply.ui as any).screens.map((s: any) => s.screen)).toEqual(['pricing/PricingRulesView', 'pricing/PricingRulesView']);
        expect(CAPABILITY_BY_ID.get('pricing.suggestions.list' as any)!.llm!.examples).toContain('Buybox\'ı kaybettiğim ürünler ve öneriler');
    });
    it('MCP onay sayfası önizlemesi sunucu satırlarını (önce → sonra) gösterir', () => {
        const apply = CAPABILITY_BY_ID.get('pricing.suggestions.apply' as any)!;
        const p = buildPreview(toolOf(apply), { suggestionIds: ['a', 'b'] }, [{ label: '8690001 (buybox 110.00 TRY)', from: '120.00 TRY', to: '109.00 TRY' }]);
        expect(p.lines).toContain('8690001 (buybox 110.00 TRY): 120.00 TRY → 109.00 TRY');
        expect(p.confirmLabel).toBe('2 fiyatı güncelle');
        expect(p.count).toBe(2);
    });
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const migrate = require('../../../dev-tools/migrate');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const manifest = require('../../../migrations/index-manifest.json');

describe('göç 0022 (ÇALIŞTIRILMADI; yalnız biçim)', () => {
    const m = migrate.findMigration(migrate.discoverMigrations(), '0022-pricing-rules-tenant');
    it('tenant/index; indeksler şema manifestiyle birebir; güncel öneri tekilliği kısmi unique', () => {
        expect(m.scope).toBe('tenant');
        expect(m.kind).toBe('index');
        for (const t of m.TARGETS) for (const i of t.indexes) {
            const { name, ...rest } = i.options;
            expect(manifest.tenant[t.defaultCollection].find((e: any) => e.name === name)).toEqual({ name, fields: i.fields, options: rest });
        }
        const cur = m.TARGETS.find((t: any) => t.key === 'priceSuggestions').indexes.find((i: any) => i.options.name === 'ruleId_variantId_current');
        expect(cur.options).toMatchObject({ unique: true, partialFilterExpression: { current: true } });
    });
    it('izinli 7 DB dışında plan/up/down reddedilir', async () => {
        const ctx = { dbname: 'baska_proje_db', connection: { db: { collection: () => { throw new Error('DB ye dokunulmamali'); } } } };
        await expect(m.plan(ctx)).rejects.toThrow(/izinli/);
        await expect(m.up(ctx)).rejects.toThrow(/izinli/);
        await expect(m.down(ctx)).rejects.toThrow(/izinli/);
    });
});

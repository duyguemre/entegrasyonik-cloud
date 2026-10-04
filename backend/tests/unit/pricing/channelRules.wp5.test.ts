// [eslesme-fiyat WP5, K-A/K-A2] Kanal fiyat kuralı operasyonları (bellek-içi sahte ClientDB): kayıt (aynı koleksiyon/yetenek), önizleme
// salt okuma, onaylı uygulama `rulePrice` + pricePending + PriceHistory(rule_channel), kullanıcının kanal özel fiyatına dokunulmaz,
// otomatik uygulama yalnız tenant `channelAutoApply` + kural `autoApply` + etkinken, K12 sıklık/soğuma, en özel kural önce. DB YOK.
import { describe, it, expect, beforeEach } from '@jest/globals';
import { ObjectId } from 'mongodb';
import { getRulesState, saveRule, setPricingSettings, deleteRule } from '@operations/pricing/priceRules';
import { applyChannelRule, previewChannelRule, runChannelRules } from '@operations/pricing/channelRules';
import { PRICING_CONSENT } from '@operations/pricing/priceRule';
import { effectiveChannelPrice } from '@platform/core/pricing/effectivePrice';
import type { MarginContext } from '@operations/pricing/margin';
import { fakeClientDb } from './helpers/fakeClientDb';

const NOW = new Date('2026-10-04T10:00:00Z');
const MARGIN: MarginContext = { costPrice: 100, vatRate: 20, commission: { rate: 15, source: 'override' }, deductions: {} as any };
function mkEnv() {
    const e: any = { audits: [] as any[], flags: { platform: true }, clock: { now: NOW } };
    Object.assign(e, {
        now: () => e.clock.now, platformEnabled: () => e.flags.platform, competitionEnabled: () => true, freshnessMin: async () => 30,
        marginContexts: async (_db: any, _t: number, vs: any[]) => new Map(vs.map((v) => [String(v._id), { ...MARGIN, costPrice: v.costPrice ?? null }])),
        publish: async () => { throw new Error('kanal kuralı publish kullanmaz'); }, notifyPaused: async () => undefined,
        audit: (event: string, tid: number, actor: string | null, meta: any) => e.audits.push({ event, actor, meta }),
    });
    return e;
}
const variant = (o: any = {}) => ({
    _id: new ObjectId(), productId: new ObjectId(), barcode: o.barcode ?? `B${Math.floor(Math.random() * 1e9)}`, stockcode: 'S', stock: 3, costPrice: 100,
    prices: { isPlatformBasedPrice: false, salePrice: 200, marketPrice: 250 },
    platforms: { hepsiburada: { upload: { TRANSFER: { status: 'COMPLETED' } } }, n11: { upload: { TRANSFER: { status: 'FAILED' } } } },
    ...o,
});
const PARAMS = {
    base: 'salePrice', adjustPercent: 10, adjustAmount: null, commission: { source: 'auto' }, cargoCost: 0,
    rounding: { step: 1, direction: 'up', psychological: true }, floorMarginPercent: null, ceiling: null, listPrice: { strategy: 'keep' },
    maxChangePercent: null, autoApply: false,
};
let db: any; let env: any;
async function enable(extra: any = {}) {
    await setPricingSettings(db, 7, 'u1', { enabled: true, consentVersion: PRICING_CONSENT.version, dualEngineAcknowledged: true, ...extra }, env);
}
const save = (over: any = {}) => saveRule(db, 7, 'u1', { type: 'channel', name: 'HB +%10', enabled: true, integrationCode: 'hepsiburada', channel: { ...PARAMS, ...(over.channel ?? {}) }, ...(over.scope ? { scope: over.scope } : {}) }, env) as Promise<any>;

beforeEach(() => { db = fakeClientDb(); env = mkEnv(); });

describe('kayıt', () => {
    it('type:channel aynı koleksiyona; listede channel parametreleri, competition null; tüm kanallar; denetim', async () => {
        const r = await save();
        expect(r).toMatchObject({ type: 'channel', integrationCode: 'hepsiburada', competition: null, channel: { base: 'salePrice', adjustPercent: 10 } });
        const st: any = await getRulesState(db, 7, env);
        expect(st.rules[0].channel.base).toBe('salePrice');
        expect(st.channelRuleChannels).toContain('ideasoft');
        expect(st.settings.channelAutoApply).toBe(false);
        expect(env.audits.at(-1)).toMatchObject({ event: 'pricing.rule.created', meta: { type: 'channel', autoApply: false } });
        await expect(save({ channel: { base: 'cost', marginPercent: null } })).rejects.toThrow(/Geçersiz kanal fiyat kuralı/);
        await expect(saveRule(db, 7, 'u1', { type: 'channel', name: 'x', enabled: true, integrationCode: 'bizimhesap', channel: PARAMS }, env)).rejects.toThrow();
        expect(await deleteRule(db, 7, 'u1', { id: r.id }, env)).toEqual({ deleted: true, id: r.id });
    });
});

describe('önizleme ve onaylı uygulama', () => {
    it('önizleme fiyatı değiştirmez; yalnız kanala gönderilmiş varyantlar', async () => {
        const v = variant();
        await db.getVariantModel().create(v);
        await db.getVariantModel().create(variant({ platforms: { n11: { upload: { TRANSFER: { status: 'COMPLETED' } } } } }));
        const r = await save();
        const p: any = await previewChannelRule(db, 7, { id: r.id }, env);
        expect(p.summary).toEqual({ total: 1, ok: 1, changed: 1, blocked: 0 });
        expect(p.items[0].result).toMatchObject({ ok: true, salePrice: 220.99, marketPrice: 250 });
        expect(p.items[0].current).toEqual({ salePrice: 200, source: 'base' });
        const after = await db.getVariantModel().findOne({ _id: v._id }).lean();
        expect(after.platforms.hepsiburada.rulePrice).toBeUndefined();
    });

    it('uygula: tenant kapalıyken reddedilir; açıkken rulePrice + pricePending + geçmiş; kanal özel fiyatı korunur', async () => {
        const v = variant();
        const custom = variant({ prices: { isPlatformBasedPrice: true, salePrice: 200, marketPrice: 250 }, platforms: { hepsiburada: { upload: { TRANSFER: { status: 'COMPLETED' } }, prices: { salePrice: 199, marketPrice: 250 } } } });
        await db.getVariantModel().create(v); await db.getVariantModel().create(custom);
        const r = await save();
        await expect(applyChannelRule(db, 7, 'u1', { id: r.id }, env)).rejects.toThrow(/kapalı/);
        await enable();
        const out = await applyChannelRule(db, 7, 'u1', { id: r.id }, env);
        expect(out).toMatchObject({ applied: 2, blocked: 0, pending: 1 });
        const a = await db.getVariantModel().findOne({ _id: v._id }).lean();
        expect(a.platforms.hepsiburada.rulePrice).toMatchObject({ salePrice: 220.99, marketPrice: 250, ruleId: r.id, ruleVersion: 1 });
        expect(effectiveChannelPrice(a, 'hepsiburada')).toMatchObject({ salePrice: 220.99, source: 'rule' });
        expect(a.pricePending.hepsiburada).toMatchObject({ reason: 'rule_channel' });
        expect(a.priceDirty).toBe(true);
        const c = await db.getVariantModel().findOne({ _id: custom._id }).lean();
        expect(c.platforms.hepsiburada.prices).toEqual({ salePrice: 199, marketPrice: 250 }); // kullanıcının kanal fiyatına dokunulmaz
        expect(c.pricePending).toBeUndefined(); // etkin fiyat değişmedi
        const hist = await db.getPriceHistoryModel().find({}).lean();
        expect(hist).toEqual([expect.objectContaining({ source: 'rule_channel', salePrice: 220.99, previousPrice: 200, actor: 'u1', integrationCode: 'hepsiburada' })]);
        expect(env.audits.at(-1)).toMatchObject({ event: 'pricing.channelRule.applied', meta: { applied: 2, pending: 1 } });
        // ikinci uygulama: değişiklik yok
        expect(await applyChannelRule(db, 7, 'u1', { id: r.id }, env)).toMatchObject({ applied: 0, unchanged: 2 });
    });

    it('maliyet eksikse engel (sıfır sayılmaz)', async () => {
        await db.getVariantModel().create(variant({ costPrice: undefined }));
        await enable();
        const r = await save({ channel: { base: 'cost', marginPercent: 10, adjustPercent: null } });
        expect(await applyChannelRule(db, 7, 'u1', { id: r.id }, env)).toMatchObject({ applied: 0, blocked: 1 });
    });
});

describe('otomatik uygulama (K-A2)', () => {
    it('yalnız tenant anahtarı + kural autoApply + etkin; açarken bildirim onayı; tenant kapanınca anahtar da kapanır', async () => {
        await db.getVariantModel().create(variant());
        const r = await save({ channel: { autoApply: true } });
        await enable();
        expect(await runChannelRules(db, 7, env)).toMatchObject({ skipped: 'channel_auto_apply_off' });
        await expect(enable({ channelAutoApply: true })).rejects.toThrow(/bildirimi onaylayın/);
        await enable({ channelAutoApply: true, channelAutoApplyAcknowledged: true });
        expect(await runChannelRules(db, 7, env)).toMatchObject({ rules: 1, applied: 1 });
        expect(env.audits.at(-1)).toMatchObject({ event: 'pricing.channelRule.autoApplied', actor: null });
        await setPricingSettings(db, 7, 'u1', { enabled: false }, env);
        const st: any = await getRulesState(db, 7, env);
        expect(st.settings.channelAutoApply).toBe(false);
        expect(r.channel.autoApply).toBe(true);
    });

    it('kural autoApply kapalıysa ya da platform anahtarı kapalıysa yazılmaz; K12 soğuma', async () => {
        await db.getVariantModel().create(variant());
        await enable({ channelAutoApply: true, channelAutoApplyAcknowledged: true });
        const off = await save();
        expect(await applyChannelRule(db, 7, null, { id: off.id }, env, { auto: true })).toMatchObject({ skipped: 'auto_apply_off' });
        const on = await save({ channel: { autoApply: true } });
        env.flags.platform = false;
        expect(await runChannelRules(db, 7, env)).toMatchObject({ skipped: 'inactive' });
        env.flags.platform = true;
        expect((await applyChannelRule(db, 7, null, { id: on.id }, env, { auto: true })).applied).toBe(1);
        // kural değişti (sürüm 2) ama 15 dk dolmadı → otomatik uygulama ertelenir
        await saveRule(db, 7, 'u1', { id: on.id, type: 'channel', name: 'HB +%20', enabled: true, integrationCode: 'hepsiburada', channel: { ...PARAMS, adjustPercent: 20, autoApply: true } }, env);
        env.clock.now = new Date(NOW.getTime() + 5 * 60_000);
        expect(await applyChannelRule(db, 7, null, { id: on.id }, env, { auto: true })).toMatchObject({ applied: 0, throttled: 1 });
        env.clock.now = new Date(NOW.getTime() + 20 * 60_000);
        expect(await applyChannelRule(db, 7, null, { id: on.id }, env, { auto: true })).toMatchObject({ applied: 1 });
    });

    it('otomatikte büyük değişim engellenir (maxChangePercent)', async () => {
        await db.getVariantModel().create(variant());
        await enable({ channelAutoApply: true, channelAutoApplyAcknowledged: true });
        await save({ channel: { autoApply: true, adjustPercent: 40, maxChangePercent: 10 } });
        expect(await runChannelRules(db, 7, env)).toMatchObject({ applied: 0, blocked: 1 });
    });

    it('aynı kanalda en özel kural önce; varyant bir koşuda tek kurala düşer', async () => {
        const v = variant({ barcode: 'BX' });
        await db.getVariantModel().create(v);
        await enable({ channelAutoApply: true, channelAutoApplyAcknowledged: true });
        await save({ channel: { autoApply: true, adjustPercent: 10 } });
        const specific = await save({ channel: { autoApply: true, adjustPercent: 30 }, scope: { barcodes: ['BX'] } });
        await runChannelRules(db, 7, env);
        const a = await db.getVariantModel().findOne({ _id: v._id }).lean();
        expect(a.platforms.hepsiburada.rulePrice.ruleId).toBe(specific.id);
    });
});

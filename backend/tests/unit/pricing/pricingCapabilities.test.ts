/**
 * PRC-R0/R1/CFG — yetenek kaydı ve parite (ekran = Otopilot/MCP, tek kayıt), RPC bağları, zamanlayıcı kaydı, bildirim kataloğu,
 * ürün listesi buybox filtresi, göç 0021 (manifest eşleşmesi + izinli DB kapısı).
 */
import { describe, it, expect } from '@jest/globals';
import { CAPABILITIES } from '../../../src/capabilities';
import PricingService from '../../../src/api/rpc/handlers/pricing-service';
import BackofficeBillingService from '../../../src/api/rpc/handlers/backoffice-billing-service';
import { SCHEDULES, LIVE_READONLY_SCHEDULE_IDS } from '../../../src/bootstrap/schedules';
import { NOTIFICATION_CATALOG } from '@operations/notifications/catalog';
import { TR } from '@operations/notifications/templates/tr';
import { EN } from '@operations/notifications/templates/en';
import { buildVariantFilterQuery } from '@operations/catalog/productFilters';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const migrate = require('../../../dev-tools/migrate');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const manifest = require('../../../migrations/index-manifest.json');

const cap = (id: string) => CAPABILITIES.find((c) => c.id === id)!;

describe('yetenek kaydı (ADR-0019, K20)', () => {
    it('tenant yetenekleri: okuma read+exposed, maliyet yazımı write+onay kartı; hiçbiri dış etkili değil', () => {
        for (const id of ['pricing.cost.list', 'pricing.buybox.list', 'pricing.margin.preview']) {
            expect(cap(id).effect).toBe('read');
            expect(cap(id).mcp.exposed?.confirm).toBe('none');
        }
        expect(cap('pricing.cost.set').effect).toBe('write');
        expect(cap('pricing.cost.set').mcp.exposed?.confirm).toBe('confirm');
        for (const id of ['pricing.cost.list', 'pricing.cost.set', 'pricing.buybox.list', 'pricing.margin.preview']) {
            expect(cap(id).external).toBe(false);
            expect(cap(id).scope).toBe('tenant');
            expect(cap(id).mcp.exposed?.toolset).toBe('catalog');
        }
        expect(cap('pricing.margin.preview').permission).toBe('finance:read');
    });
    it('her bağ PricingService\'te gerçek bir metoda gider ve tel şeması iliştirilmiş', () => {
        const rpcs = CAPABILITIES.filter((c) => c.id.startsWith('pricing.')).flatMap((c) => c.bindings.map((b) => b.rpc!));
        expect(rpcs.sort()).toEqual(['PricingService/getBuyboxHistory', 'PricingService/listBuybox', 'PricingService/listCosts', 'PricingService/previewMargin', 'PricingService/setVariantCosts']);
        for (const r of rpcs) expect(typeof (PricingService.prototype as any)[r.split('/')[1]]).toBe('function');
        for (const c of CAPABILITIES.filter((x) => x.id.startsWith('pricing.'))) for (const b of c.bindings) expect(b.input).toBeDefined();
    });
    it('backoffice: platformAdmin + MCP kapalı; yazma şemalı', () => {
        for (const id of ['platform.competition.settings', 'platform.competition.override.set']) {
            expect(cap(id).minTier).toBe('platformAdmin');
            expect(cap(id).mcp.notExposed?.reason).toBe('platform_admin');
            for (const b of cap(id).bindings) expect(typeof (BackofficeBillingService.prototype as any)[b.rpc!.split('/')[1]]).toBe('function');
        }
        const set = cap('platform.competition.override.set').bindings[0].input!;
        expect(set.safeParse({ tid: 5, override: { skuCap: 10 }, reason: 'pilot müşteri' }).success).toBe(true);
        expect(set.safeParse({ tid: 5, override: { skuCap: 10, x: 1 }, reason: 'pilot müşteri' }).success).toBe(false);
        expect(set.safeParse({ tid: 5, override: null, reason: 'pilot müşteri' }).success).toBe(true);
    });
});

describe('zamanlayıcı ve bildirim', () => {
    it('pricing.buyboxRefresh worker işi, dakikada bir; LIVE_READONLY\'de başlamaz', () => {
        const s = SCHEDULES.find((x) => x.id === 'pricing.buyboxRefresh')!;
        expect(s.runsOn).toBe('worker');
        expect(s.build({ runOnce: async () => ({}) }).everyMs).toBe(60_000);
        expect(LIVE_READONLY_SCHEDULE_IDS).not.toContain('pricing.buyboxRefresh');
    });
    it('BUYBOX_LOST katalogda (zorunlu değil, catalog izni) ve iki dilde şablon', () => {
        const d = NOTIFICATION_CATALOG.find((x) => x.code === 'BUYBOX_LOST')!;
        expect(d.mandatory).toBe(false);
        expect(d.category).toBe('catalog');
        expect(TR.BUYBOX_LOST.title).toBe('Buybox kaybedildi');
        expect(EN.BUYBOX_LOST.title).toBe('Buybox lost');
    });
});

describe('ürün listesi buybox filtresi', () => {
    it('izinli değerler eşlenir, bilinmeyen değer yok sayılır', () => {
        expect(buildVariantFilterQuery({ buyboxStatus: 'losing' })).toEqual({ $and: [{ 'competition.trendyol.status': 'losing' }] });
        expect(buildVariantFilterQuery({ buyboxStatus: 'unchecked' })).toEqual({ $and: [{ 'competition.trendyol.status': { $exists: false } }] });
        expect(buildVariantFilterQuery({ buyboxStatus: { $ne: 1 } })).toEqual({});
    });
});

describe('göç 0021 (ÇALIŞTIRILMADI; yalnız biçim)', () => {
    const m = migrate.findMigration(migrate.discoverMigrations(), '0021-pricing-competition-tenant');
    it('tenant/index; indeksler şema manifestiyle birebir', () => {
        expect(m.scope).toBe('tenant');
        expect(m.kind).toBe('index');
        for (const t of m.TARGETS) for (const i of t.indexes) {
            const { name, ...rest } = i.options;
            expect(manifest.tenant[t.defaultCollection].find((e: any) => e.name === name)).toEqual({ name, fields: i.fields, options: rest });
        }
    });
    it('izinli 7 DB dışında plan/up/down reddedilir', async () => {
        const ctx = { dbname: 'baska_proje_db', connection: { db: { collection: () => { throw new Error('DB ye dokunulmamali'); } } } };
        await expect(m.plan(ctx)).rejects.toThrow(/izinli/);
        await expect(m.up(ctx)).rejects.toThrow(/izinli/);
        await expect(m.down(ctx)).rejects.toThrow(/izinli/);
    });
});

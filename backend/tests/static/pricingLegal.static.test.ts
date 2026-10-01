/**
 * PRC-R2 — hukuk tasarım kurallarının STATİK bekçisi (AUTO_PRICING_LEGAL §c; DB yok):
 *  legal-K2-tenant-isolation / K5 : kural motoru ve operasyonları başka tenant'ın DB'sini AÇAMAZ (DatabaseManager/TenantRegistry/ApplicationDB
 *                                  içe aktarımı yok; tenant'lar arası toplama yok). Tenant'a dönük yanıtlarda "sektör/ortalama/benzer satıcı" yok.
 *  legal-K6/K16-no-competitor-identity : kural/öneri/geçmiş/buybox şemalarında rakip satıcı kimliği alanı YOK.
 *  legal-K11-no-discount-language : öneri/bildirim/onay kartı metinlerinde "indirim/discount" dili üretilmez ("fiyat güncellendi").
 *  no-auto-apply (K58, PRC-R3) : `applySuggestions` YALNIZ onaylı RPC kabuğundan çağrılır; zamanlanmış iş/motor/bildirim yolu fiyat yazamaz.
 */
import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { PriceRuleSchema } from '@database/client/models/PriceRule';
import { PriceSuggestionSchema } from '@database/client/models/PriceSuggestion';
import { PriceHistorySchema } from '@database/client/models/PriceHistory';
import { BuyboxSnapshotSchema } from '@database/client/models/BuyboxSnapshot';
import { CONFIRM_SPECS } from '@operations/agent/present/specs';

const ROOT = path.resolve(__dirname, '../../src');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const code = (rel: string) => read(rel).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

const ENGINE_FILES = ['operations/pricing/ruleEngine.ts', 'operations/pricing/priceRule.ts', 'operations/pricing/priceRules.ts'];

describe('legal-K2-tenant-isolation (statik): motor tek tenant bağlamında koşar', () => {
    it('legal-K2-tenant-isolation: motor/operasyon dosyaları DB yöneticisi, tenant kaydı ya da uygulama DB\'si içe aktarmaz', () => {
        for (const f of ENGINE_FILES) {
            const src = code(f);
            expect([f, /@database\/DatabaseManager|TenantRegistry|getApplicationDB|getClientDB\(/.test(src)]).toEqual([f, false]);
        }
    });
    it('legal-K2-tenant-isolation: saf motor (ruleEngine) yalnız margin + priceRule tiplerine bağlıdır (G/Ç yok)', () => {
        const imports = [...code('operations/pricing/ruleEngine.ts').matchAll(/from '([^']+)'/g)].map((m) => m[1]).sort();
        expect(imports).toEqual(['./margin', './priceRule']);
    });
    it('legal-K5-no-cross-tenant-output: tenant\'a dönen yanıtlarda tenant\'lar arası istatistik/benchmark alanı yok', () => {
        const src = code('operations/pricing/priceRules.ts').toLowerCase();
        for (const w of ['average', 'benchmark', 'sector', 'similarsellers', 'peer', 'ortalama', 'sektör', 'benzer satıcı']) expect([w, src.includes(w)]).toEqual([w, false]);
    });
    it('legal-K2-tenant-isolation: backoffice özeti yalnız sayaç döner (tenant kimliği/fiyat/SKU alanı yok) ve motor tarafından çağrılmaz', () => {
        const admin = code('operations/backoffice/pricingRulesAdmin.ts');
        expect(admin).not.toMatch(/\btid\b|tenantName|barcode|salePrice|afterPrice|beforePrice/);
        for (const f of [...ENGINE_FILES, 'operations/pricing/createBuyboxRefreshJob.ts', 'operations/pricing/BuyboxRefreshJob.ts']) expect(code(f)).not.toMatch(/pricingRulesAdmin/);
    });
});

describe('legal-K6-no-competitor-field / legal-K16-minimization (statik): rakip kimliği saklanmaz', () => {
    const FORBIDDEN = /seller|merchant|store|competitor|shop|rakip|magaza|mağaza/i;
    it.each([
        ['PriceRules', PriceRuleSchema], ['PriceSuggestions', PriceSuggestionSchema], ['PriceHistory', PriceHistorySchema], ['BuyboxSnapshots', BuyboxSnapshotSchema],
    ])('legal-K16-minimization: %s şemasında rakip satıcı kimliği alanı yok', (_n, schema: any) => {
        // `hasMultipleSeller` bir bayraktır (kimlik değil; K16'nın izin verdiği "fiyat, sıra, bayrak").
        const paths = Object.keys(schema.paths).filter((p) => p !== 'hasMultipleSeller');
        expect(paths.filter((p) => FORBIDDEN.test(p))).toEqual([]);
    });
});

describe('legal-K11-no-discount-language (statik): "indirim" dili üretilmez', () => {
    it('legal-K11-no-discount-language: fiyat kuralı bildirim şablonları ve onay kartı metinleri "indirim/discount" içermez', () => {
        for (const lang of ['tr', 'en']) {
            const src = read(`operations/notifications/templates/${lang}.ts`).split('\n').filter((l) => /PRICE_RULE_PAUSED/.test(l)).join('\n');
            expect(src.length).toBeGreaterThan(0);
            expect(src).not.toMatch(/indirim|discount/i);
        }
        const spec = CONFIRM_SPECS['pricing.suggestions.apply'];
        const ids = { suggestionIds: ['a', 'b'] };
        const texts = [spec.summary(ids, 'tr'), spec.summary(ids, 'en'), spec.confirmLabel!(ids, 'tr'), spec.confirmLabel!(ids, 'en'),
            spec.result({ applied: [{}], rejected: [] }, 'tr').message, spec.result({ applied: [{}], rejected: [] }, 'en').message];
        for (const t of texts) expect(t).not.toMatch(/indirim|discount/i);
        expect(spec.result({ applied: [{}], rejected: [] }, 'tr').message).toMatch(/fiyatı güncellendi/);
    });
    it('legal-K11-no-discount-language: motor gerekçe/uyarı kodları "indirim" içermez (K9 uyarısı "üstü çizili gösterim" kodudur)', () => {
        const src = code('operations/pricing/ruleEngine.ts');
        const strings = [...src.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
        expect(strings.filter((s) => /indirim/.test(s))).toEqual([]);
    });
});

describe('no-auto-apply (K58, PRC-R3): insan onaysız fiyat yazma yolu YOK', () => {
    function walk(dir: string): string[] {
        return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.ts') ? [path.join(dir, e.name)] : []));
    }
    it('applySuggestions yalnız PricingService RPC kabuğundan çağrılır (yetenek kaydı → onay adımı)', () => {
        const callers = walk(ROOT).filter((f) => !f.endsWith(path.join('operations', 'pricing', 'priceRules.ts')) && /\bapplySuggestions\s*\(/.test(fs.readFileSync(f, 'utf8')));
        expect(callers.map((f) => path.relative(ROOT, f))).toEqual([path.join('api', 'rpc', 'handlers', 'pricing-service.ts')]);
    });
    it('zamanlanmış buybox işi yalnız KURU öneri üretir (generateSuggestions); fiyat yayınına/uygulamaya erişmez', () => {
        for (const f of ['operations/pricing/BuyboxRefreshJob.ts', 'operations/pricing/createBuyboxRefreshJob.ts']) {
            const src = code(f);
            expect(src).not.toMatch(/applySuggestions|ExportBatchService|UPDATE_PRICE|\.publish\(/);
        }
        expect(code('operations/pricing/createBuyboxRefreshJob.ts')).toMatch(/generateSuggestions\(/);
    });
    it('generateSuggestions varyant fiyatına yazmaz (yalnız PriceSuggestions/PriceRules/PriceHistory)', () => {
        const src = code('operations/pricing/priceRules.ts');
        const start = src.indexOf('export async function generateSuggestions');
        const end = src.indexOf('function suggestionOp');
        const body = src.slice(start, end);
        expect(body).not.toMatch(/getVariantModel\(\)\.(update|bulkWrite|findOneAndUpdate)|env\.publish/);
    });
});

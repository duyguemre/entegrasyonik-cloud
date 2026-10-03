// ADR-0033 INT-02: kod listeleri TEK tablodan (`ADAPTER_KEYS`) doğrulanır. Host izin listesi outboundHosts'ta KALIR (güvenlik
// incelemesi) ama kod kümesi tabloyla eşit olmak zorundadır; Factory / run-tests.js / env.ts elle listeleri de eşitlenir.
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { ADAPTER_KEYS, ADAPTER_CODES } from '../../src/integration/modules/adapterKeys';
import { ALLOWED_OUTBOUND_HOSTS } from '../../src/integration/modules/common/security/outboundHosts';
import { MOCK_PREFIXES } from '../../src/config/env';
import { INTEGRATION_CODE_CATEGORY } from '../../src/integration/catalog/codeToCategory';

const root = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

describe('ADAPTER_KEYS tek kod tablosu (ADR-0033 INT-02)', () => {
    it('kodlar, önekler benzersiz ve şekil geçerli', () => {
        expect(new Set(ADAPTER_CODES).size).toBe(ADAPTER_KEYS.length);
        expect(new Set(ADAPTER_KEYS.map(k => k.mockPrefix)).size).toBe(ADAPTER_KEYS.length);
        for (const k of ADAPTER_KEYS) {
            expect(k.code).toMatch(/^[a-z][a-z0-9]{1,23}$/);
            expect(k.mockDefaultBase).toMatch(/^http:\/\/(localhost|127\.0\.0\.1):\d+\//);
        }
    });
    it('ALLOWED_OUTBOUND_HOSTS anahtarları tablo kodlarıyla birebir aynı', () => {
        // `llm-*` anahtarlari adaptor DEGILDIR (ADR-0034 BR-5: sohbet LLM saglayici host'lari; tek K7 listesi).
        // `google-auth`: Google ile giris JWKS ucu (adaptor degil).
        expect(Object.keys(ALLOWED_OUTBOUND_HOSTS).filter((k) => !k.startsWith('llm-') && k !== 'google-auth').sort()).toEqual([...ADAPTER_CODES].sort());
    });
    it('env MOCK_PREFIXES ve kategori haritası tablodan türer', () => {
        expect([...MOCK_PREFIXES]).toEqual(ADAPTER_KEYS.map(k => k.mockPrefix));
        expect(Object.keys(INTEGRATION_CODE_CATEGORY).sort()).toEqual([...ADAPTER_CODES].sort());
    });
    it('env.ts her tablo satırı için <envPrefix>_HTTP_TIMEOUT_MS tanımlar', () => {
        const env = read('src/config/env.ts');
        for (const k of ADAPTER_KEYS) expect(env).toContain(`${k.envPrefix}_HTTP_TIMEOUT_MS`);
    });
    it('IntegrationFactory ve run-tests.js her kodu içerir', () => {
        const fac = read('src/integration/modules/IntegrationFactory.ts');
        const runner = read('tests/tools/run-tests.js');
        for (const k of ADAPTER_KEYS) {
            expect(fac.toLowerCase()).toContain(k.code);
            expect(runner).toContain(`  ${k.code}: [`);
        }
    });
    it('elle yazılmış kod/önek listesi geri gelmedi', () => {
        expect(read('src/config/env.ts')).not.toMatch(/\['TY', 'PAZARAMA'/);
        expect(read('src/integration/modules/common/security/outboundHosts.ts')).not.toMatch(/trendyol: 'TY'/);
        expect(read('src/integration/config/catalog/integrationHttp.ts')).not.toMatch(/\['trendyol', 'hepsiburada'/);
    });
});

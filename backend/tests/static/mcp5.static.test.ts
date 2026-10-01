/**
 * MCP-5 statik mandallar (ADR-0035): (1) refVerifiers kapsami: her `mcp.exposed` YAZMA yetenegi REF_VERIFIERS kaydina sahip (BR-3'te eksik kalmisti) ve
 * kayitta yetim dogrulayici yok; (2) onaysiz yazma yolu yok (exposed yazma = confirm != none); (3) token/oturum karisimi yok: /mcp cerez okumaz, /api Authorization basligi okumaz;
 * (4) MCP/OAuth modullerinde console.* ve ham belirtec loglama yok.
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { CAPABILITIES } from '../../src/capabilities';
import { REF_VERIFIERS } from '../../src/operations/agent/refVerifiers';

const SRC = path.resolve(__dirname, '../../src');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');
const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : d.name.endsWith('.ts') ? [path.join(dir, d.name)] : []));
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('refVerifiers kapsami', () => {
    const exposedWrites = CAPABILITIES.filter((c) => c.mcp.exposed && c.effect !== 'read');
    it('her mcp.exposed yazma yeteneginin REF_VERIFIERS kaydi var', () => {
        expect(exposedWrites.length).toBeGreaterThan(0);
        expect(exposedWrites.filter((c) => !(c.id in REF_VERIFIERS)).map((c) => c.id)).toEqual([]);
    });
    it('REF_VERIFIERS yalniz exposed yazma yetenekleri icin (yetim kayit yok)', () => {
        const ids = new Set<string>(exposedWrites.map((c) => c.id));
        expect(Object.keys(REF_VERIFIERS).filter((k) => !ids.has(k))).toEqual([]);
    });
    it('exposed yazma yetenegi onaysiz calisamaz: confirm != none ve surum tanimli', () => {
        for (const c of exposedWrites) { expect([c.id, c.mcp.exposed!.confirm !== 'none']).toEqual([c.id, true]); expect(c.version).toBeTruthy(); }
    });
});

describe('token/oturum karisimi yok (statik)', () => {
    it('src/mcp cerez/oturum hattini kullanmaz (yalniz Bearer)', () => {
        for (const f of walk(path.join(SRC, 'mcp'))) {
            const s = stripComments(fs.readFileSync(f, 'utf8'));
            expect([f, /cookies?\b|getSecurityToken|verifyToken\(|SESSION_COOKIE/.test(s)]).toEqual([f, false]);
        }
    });
    it('/api cerez hatti Authorization basligindan token okumaz', () => {
        const s = stripComments(read('platform/core/security/Security.ts'));
        const fn = s.slice(s.indexOf('getSecurityToken('), s.indexOf('getSecurityToken(') + 900);
        expect(/authorization/i.test(fn)).toBe(false);
    });
    it('/mcp Bearer dogrulayicisi ayri sir/aud kullanir; ga/imp ASLA tasinmaz', () => {
        const s = stripComments(read('mcp/McpAuth.ts'));
        expect(s).toMatch(/ga: false/);
        expect(s).toMatch(/imp: false/);
    });
});

describe('log/sir hijyeni (statik)', () => {
    const dirs = ['mcp', 'operations/mcp', 'api/oauth'];
    it('console.* yok; belirtec/kod/ozet degiskenleri log cagrisina verilmez', () => {
        for (const d of dirs) for (const f of walk(path.join(SRC, d))) {
            const s = stripComments(fs.readFileSync(f, 'utf8'));
            expect([f, /console\.(log|info|warn|error|debug)/.test(s)]).toEqual([f, false]);
            // eventLog/logger cagrilarinda token/code/refresh/verifier/authorization alanlari
            const logCalls = s.match(/(eventLog|logger)\??\.(info|warn|error|debug)\([^;]*\)/g) ?? [];
            for (const lc of logCalls) expect([f, /\b(access_token|refresh_token|code_verifier|authorization|bearer|tokenHash)\b/i.test(lc)]).toEqual([f, false]);
        }
    });
});

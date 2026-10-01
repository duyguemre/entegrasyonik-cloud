// ADR-0026 Karar 4: ADMIN_* yapilandirmasi (fail-fast), IP allowlist, AuditLogger ek alanlari.
import { describe, it, expect, afterEach } from '@jest/globals';
import { parseEnv, ConfigError } from '../../../../src/config/env';
import { isIpAllowed, isValidAllowlistEntry, normalizeIp } from '../../../../src/api/admin/ipAllowlist';
import { AuditLogger } from '../../../../src/services/audit/AuditLogger';

const baseEnv = (over: Record<string, string> = {}): NodeJS.ProcessEnv => ({
    NODE_ENV: 'test', JWT_SECRET: 'x'.repeat(48), DB_URL: 'mongodb://127.0.0.1/none', FIELD_ENCRYPTION_KEYS: 'k:' + Buffer.alloc(32, 1).toString('base64'),
    FIELD_ENCRYPTION_ACTIVE_KID: 'k', ...over,
} as NodeJS.ProcessEnv);

describe('ADMIN_CORS_ORIGINS / CORS_ORIGINS kesisimi (fail-fast)', () => {
    it('kesisim yoksa gecer ve normalize liste doner', () => {
        const cfg = parseEnv(baseEnv({ CORS_ORIGINS: 'https://app.example.test', ADMIN_CORS_ORIGINS: 'https://Admin.example.test/, http://localhost:3100' }), { strict: true });
        expect(cfg.admin.corsOrigins).toEqual(['https://admin.example.test', 'http://localhost:3100']);
        expect(cfg.admin.apiOnly).toBe(false);
        expect(cfg.admin.ipAllowlist).toEqual([]);
    });

    it('ortak origin -> ConfigError (surec baslamaz); iletide DEGER yok, yalniz degisken adlari', () => {
        const env = baseEnv({ CORS_ORIGINS: 'https://app.example.test,https://admin.example.test', ADMIN_CORS_ORIGINS: 'https://ADMIN.example.test/' });
        expect(() => parseEnv(env, { strict: true })).toThrow(ConfigError);
        try { parseEnv(env, { strict: true }); } catch (e: any) {
            expect(e.message).toContain('ADMIN_CORS_ORIGINS');
            expect(e.message).toContain('CORS_ORIGINS');
            expect(e.message).not.toContain('admin.example.test');
        }
    });

    it("'*' admin listesinde kabul edilmez (strict: hata; lenient: listeden atilir)", () => {
        const env = baseEnv({ ADMIN_CORS_ORIGINS: '*,https://admin.example.test' });
        expect(() => parseEnv(env, { strict: true })).toThrow(ConfigError);
        expect(parseEnv(env, { strict: false }).admin.corsOrigins).toEqual(['https://admin.example.test']);
    });

    it('lenient (calisma zamani) kesisimde patlamaz; yalniz baslangicta strict kontrol var', () => {
        const env = baseEnv({ CORS_ORIGINS: 'https://a.test', ADMIN_CORS_ORIGINS: 'https://a.test' });
        expect(() => parseEnv(env, { strict: false })).not.toThrow();
    });

    it('ADMIN_API_ONLY bool ve ADMIN_IP_ALLOWLIST liste', () => {
        const cfg = parseEnv(baseEnv({ ADMIN_API_ONLY: 'true', ADMIN_IP_ALLOWLIST: ' 10.0.0.0/8 , 203.0.113.7 ' }), { strict: true });
        expect(cfg.admin.apiOnly).toBe(true);
        expect(cfg.admin.ipAllowlist).toEqual(['10.0.0.0/8', '203.0.113.7']);
    });
});

describe('IP allowlist', () => {
    it('bos liste = kapali (herkes gecer)', () => {
        expect(isIpAllowed('1.2.3.4', [])).toBe(true);
        expect(isIpAllowed(undefined, [])).toBe(true);
    });
    it('tam IP, IPv4 CIDR, IPv4-mapped IPv6 ve IPv6 tam eslesme', () => {
        expect(isIpAllowed('203.0.113.7', ['203.0.113.7'])).toBe(true);
        expect(isIpAllowed('203.0.113.8', ['203.0.113.7'])).toBe(false);
        expect(isIpAllowed('10.20.30.40', ['10.0.0.0/8'])).toBe(true);
        expect(isIpAllowed('11.0.0.1', ['10.0.0.0/8'])).toBe(false);
        expect(isIpAllowed('::ffff:10.1.2.3', ['10.0.0.0/8'])).toBe(true);
        expect(isIpAllowed('2001:db8::1', ['2001:DB8::1'])).toBe(true);
        expect(isIpAllowed('192.168.1.5', ['192.168.1.4/31'])).toBe(true);
        expect(isIpAllowed('192.168.1.6', ['192.168.1.4/31'])).toBe(false);
    });
    it('dolu listede IP yoksa/gecersizse reddedilir; girdi dogrulamasi', () => {
        expect(isIpAllowed(undefined, ['10.0.0.0/8'])).toBe(false);
        expect(isIpAllowed('not-an-ip', ['10.0.0.0/8'])).toBe(false);
        expect(normalizeIp('::FFFF:1.2.3.4')).toBe('1.2.3.4');
        expect(['10.0.0.0/8', '1.2.3.4', '::1'].every(isValidAllowlistEntry)).toBe(true);
        expect(['10.0.0.0/33', 'abc', '1.2.3/8'].some(isValidAllowlistEntry)).toBe(false);
    });
});

describe('AuditLogger ek alanlari (geriye uyumlu)', () => {
    afterEach(() => AuditLogger.setSink(undefined));

    it('actorType/onBehalfOf/surface/imp/reqId yazilir; gecersiz degerler atilir; alansiz cagri eskisi gibi', async () => {
        const rows: any[] = [];
        AuditLogger.setSink(async r => { rows.push(r); });
        await AuditLogger.log({ event: 'backoffice.write', result: 'ok', sub: 's1', actorType: 'platform', onBehalfOf: 7, surface: 'backoffice', imp: true, reqId: 'r-1', meta: { reason: 'TICKET-1 gerekce' } });
        await AuditLogger.log({ event: 'x', result: 'ok', actorType: 'root' as any, onBehalfOf: NaN, surface: 'other' as any, imp: false });
        await AuditLogger.log({ event: 'login', result: 'ok', sub: 's2' });
        expect(rows[0]).toMatchObject({ event: 'backoffice.write', actorType: 'platform', onBehalfOf: 7, surface: 'backoffice', imp: true, reqId: 'r-1', meta: { reason: 'TICKET-1 gerekce' } });
        expect(rows[1]).not.toHaveProperty('actorType');
        expect(rows[1]).not.toHaveProperty('onBehalfOf');
        expect(rows[1]).not.toHaveProperty('surface');
        expect(rows[1]).not.toHaveProperty('imp');
        expect(Object.keys(rows[2]).sort()).toEqual(['at', 'event', 'result', 'sub']);
    });
});

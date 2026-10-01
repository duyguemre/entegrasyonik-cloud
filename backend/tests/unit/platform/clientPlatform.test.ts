// MOB-08 / K55: istemci platform sınıfı (tek kaynak) -- başlık doğrulama, UA yedeği, sınıf eşlemesi, model enum eşitliği.
import { describe, it, expect } from '@jest/globals';
import {
    CLIENT_PLATFORMS, PLATFORM_FILTERS, platformClassOf, platformFromUserAgent, platformsOfFilter, resolveClientPlatform, getContext,
} from '@platform/core/context';
import { createRequestIdMiddleware } from '@api/http/requestId';
import { AuditLogSchema } from '@database/application/models/AuditLog';
import { UsageDailySchema } from '@database/application/models/UsageDaily';

const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const UA_ELECTRON = 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) entegrasyonik/1.0 Chrome/122.0 Electron/29.0.0 Safari/537.36';

describe('clientPlatform', () => {
    it('izinli liste sabit (önyüz paketindeki liste ile aynı sıra/değer)', () => {
        expect(CLIENT_PLATFORMS).toEqual(['desktop_web', 'electron', 'mobile_web', 'pwa', 'android_app', 'unknown']);
        expect(PLATFORM_FILTERS).toEqual(['desktop', 'mobile', ...CLIENT_PLATFORMS]);
    });

    it('geçerli başlık AYNEN (büyük/küçük harf ve boşluk duyarsız) kabul edilir; UA yok sayılır', () => {
        expect(resolveClientPlatform('android_app', UA_DESKTOP)).toBe('android_app');
        expect(resolveClientPlatform('  PWA ', UA_DESKTOP)).toBe('pwa');
        expect(resolveClientPlatform(['electron'], undefined)).toBe('electron');
    });

    it('geçersiz/uzun başlık → UA yedeği (kaba sınıf)', () => {
        expect(resolveClientPlatform('ios_app', UA_IPHONE)).toBe('mobile_web');
        expect(resolveClientPlatform('x'.repeat(100), UA_DESKTOP)).toBe('desktop_web');
        expect(resolveClientPlatform(undefined, UA_ANDROID)).toBe('mobile_web');
        expect(resolveClientPlatform(undefined, UA_ELECTRON)).toBe('electron');
    });

    it('UA yedeği: Android kabuğu işareti (MOB-07) → android_app', () => {
        expect(platformFromUserAgent(UA_ANDROID + ' EntegrasyonikShell/1.0.0 (app; fcm=1)')).toBe('android_app');
        expect(platformFromUserAgent(UA_ANDROID + ' EntegrasyonikShell/x')).toBe('mobile_web');
    });

    it('UA yedeği PWA uydurmaz; betik/boş UA → unknown', () => {
        expect(platformFromUserAgent(UA_DESKTOP)).toBe('desktop_web');
        expect(platformFromUserAgent('curl/8.4.0')).toBe('unknown');
        expect(platformFromUserAgent('')).toBe('unknown');
        expect(platformFromUserAgent(undefined)).toBe('unknown');
    });

    it('ana sınıf: desktop_web/electron → desktop; mobile_web/pwa/android_app → mobile; unknown → unknown', () => {
        expect(CLIENT_PLATFORMS.map(platformClassOf)).toEqual(['desktop', 'desktop', 'mobile', 'mobile', 'mobile', 'unknown']);
    });

    it('süzgeç: sınıf → alt türler; alt tür → tek; bilinmeyen/boş → null', () => {
        expect(platformsOfFilter('mobile')).toEqual(['mobile_web', 'pwa', 'android_app']);
        expect(platformsOfFilter('desktop')).toEqual(['desktop_web', 'electron']);
        expect(platformsOfFilter('pwa')).toEqual(['pwa']);
        expect(platformsOfFilter(undefined)).toBeNull();
        expect(platformsOfFilter('tablet' as any)).toBeNull();
    });

    it('middleware: sınıf res.locals ve ALS bağlamına girer; ham UA hiçbir yere yazılmaz', () => {
        const mw = createRequestIdMiddleware();
        const res: any = { locals: {}, setHeader: () => undefined };
        let seen: any;
        mw({ headers: { 'x-client-platform': 'pwa', 'user-agent': UA_ANDROID }, method: 'POST', path: '/api/X/y' } as any, res, () => { seen = getContext(); });
        expect(res.locals.clientPlatform).toBe('pwa');
        expect(seen.clientPlatform).toBe('pwa');
        expect(JSON.stringify(seen)).not.toContain('Android');
        expect(JSON.stringify(res.locals)).not.toContain('Android');
    });

    it('model enum değerleri tek kaynakla aynı (AuditLogs.platform, UsageDaily.platform)', () => {
        expect((AuditLogSchema.path('platform') as any).enumValues).toEqual([...CLIENT_PLATFORMS]);
        expect((UsageDailySchema.path('platform') as any).enumValues).toEqual([...CLIENT_PLATFORMS]);
    });
});

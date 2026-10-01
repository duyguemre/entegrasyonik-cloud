// LIVE-RO Katman B (adaptör): Ideasoft token yenilemesi varsayılan KAPALI; N11 SOAP yazma operasyonu bağlantı kurulmadan reddedilir. Gerçek ağ YOK.
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { SecurityService } from '../../../src/integration/modules/ecommerce/ideasoft/services/SecurityService';
import N11Service from '../../../src/integration/modules/marketplace/n11/services/Service';

const KEYS = ['LIVE_READONLY', 'LIVE_READONLY_ALLOW_TOKEN_REFRESH'];
let saved: Record<string, string | undefined>;
beforeEach(() => { saved = Object.fromEntries(KEYS.map(k => [k, process.env[k]])); SecurityService.resetInflight(); });
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

const expiredAuth = { access_token: 'old-access', refresh_token: 'old-refresh', createdAt: Date.now() - 10 * 3600_000, expires_in: 3600 };
function ideasoft() {
    const aggregate = jest.fn(async () => [{ ecommerce: [{ settings: { auth: { ...expiredAuth } } }] }]);
    const postForm = jest.fn(async () => { throw new Error('SENTINEL_NETWORK_CALL'); });
    const service: any = { postForm, get: jest.fn(), getTokenUrl: () => 'https://x.myideasoft.com/oauth/v2/token', setCurrentToken: jest.fn(), getCurrentToken: () => undefined };
    const params = { clientId: 1, integrationSettings: { settings: { key: 'k', secret: 's' } }, clientDB: { getClientIntegrationModel: () => ({ aggregate }) } };
    return { sec: new SecurityService(params, service), postForm, service };
}

describe('Ideasoft token yenileme x LIVE_READONLY', () => {
    it('kip AÇIK (varsayılan): süresi dolmuş token için refresh YAPILMAZ; açık AUTH hatası; token ucuna istek YOK', async () => {
        process.env.LIVE_READONLY = 'true'; delete process.env.LIVE_READONLY_ALLOW_TOKEN_REFRESH;
        const { sec, postForm } = ideasoft();
        await expect(sec.refreshToken(true)).rejects.toMatchObject({ code: 'AUTH', platformCode: 'LIVE_READONLY_TOKEN_REFRESH_DISABLED' });
        expect(postForm).not.toHaveBeenCalled();
    });
    it('authorization_code değişimi de kapalı', async () => {
        process.env.LIVE_READONLY = 'true';
        const { sec, postForm } = ideasoft();
        await expect(sec.retrieveToken({ code: 'abc', redirectUrl: 'https://r' })).rejects.toMatchObject({ platformCode: 'LIVE_READONLY_TOKEN_REFRESH_DISABLED' });
        expect(postForm).not.toHaveBeenCalled();
    });
    it('geçerli (süresi dolmamış) access_token varsa refresh gerekmez: ağ/hata yok', async () => {
        process.env.LIVE_READONLY = 'true';
        const aggregate = jest.fn(async () => [{ ecommerce: [{ settings: { auth: { access_token: 'valid', refresh_token: 'r', createdAt: Date.now(), expires_in: 3600 } } }] }]);
        const service: any = { postForm: jest.fn(), setCurrentToken: jest.fn(), getCurrentToken: () => undefined };
        const sec = new SecurityService({ clientId: 1, integrationSettings: { settings: {} }, clientDB: { getClientIntegrationModel: () => ({ aggregate }) } }, service);
        await expect(sec.refreshToken(false)).resolves.toBe('valid');
        expect(service.postForm).not.toHaveBeenCalled();
    });
    it('LIVE_READONLY_ALLOW_TOKEN_REFRESH=ideasoft ile refresh denenir (token ucuna istek gider)', async () => {
        process.env.LIVE_READONLY = 'true'; process.env.LIVE_READONLY_ALLOW_TOKEN_REFRESH = 'ideasoft';
        const { sec, postForm } = ideasoft();
        await expect(sec.refreshToken(true)).rejects.toThrow(/SENTINEL_NETWORK_CALL/);
        expect(postForm).toHaveBeenCalledTimes(1);
    });
    it('kip KAPALI: refresh normal denenir (davranış değişmez)', async () => {
        delete process.env.LIVE_READONLY;
        const { sec, postForm } = ideasoft();
        await expect(sec.refreshToken(true)).rejects.toThrow(/SENTINEL_NETWORK_CALL/);
        expect(postForm).toHaveBeenCalledTimes(1);
    });
});

describe('N11 SOAP x LIVE_READONLY (uygulama katmanı; ağ katmanı ayrıca gövdeyi denetler)', () => {
    const mk = () => {
        const svc: any = new N11Service({ clientId: 1, integrationSettings: { settings: { APIKEY: 'k', APISECRET: 's' }, urls: {} } });
        const post = jest.fn(async () => ({ data: '' }));
        svc.soap = { post };
        return { svc, post };
    };
    it('kip AÇIK: yazma operasyonları bağlantı kurulmadan NOT_SUPPORTED/LIVE_READONLY ile reddedilir', async () => {
        process.env.LIVE_READONLY = 'true';
        const { svc, post } = mk();
        for (const op of ['sch:SaveProductRequest', 'sch:UpdateProductStockBySellerCodeRequest', 'sch:UpdateProductPriceBySellerCodeRequest', 'sch:SaveProductAnswerRequest', 'sch:ClaimReturnApproveRequest', 'sch:MakeOrderItemShipmentRequest']) {
            await expect(svc.soapRequest('productService', op, {})).rejects.toMatchObject({ platformCode: 'LIVE_READONLY' });
        }
        expect(post).not.toHaveBeenCalled();
    });
    it('kip AÇIK: okuma operasyonu istemciye iletilir', async () => {
        process.env.LIVE_READONLY = 'true';
        const { svc, post } = mk();
        await svc.soapRequest('productService', 'sch:GetProductListRequest', {}, { idempotent: true }).catch(() => undefined);
        expect(post).toHaveBeenCalledTimes(1);
    });
    it('kip KAPALI: yazma operasyonu da iletilir (davranış değişmez)', async () => {
        delete process.env.LIVE_READONLY;
        const { svc, post } = mk();
        await svc.soapRequest('productService', 'sch:SaveProductRequest', {}).catch(() => undefined);
        expect(post).toHaveBeenCalledTimes(1);
    });
});

/**
 * ADR-0022 / F-04: Ideasoft OAuth (POST form gövdesi, single-flight, skew, 401->1 kez yenile-tekrar) ve sayfalama tavanı.
 * Gerçek ağ/DB YOK: axios taklit (tests/characterization/stubs/_axiosMock), clientDB sahte. Değerler sentetiktir.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('axios', () => require('./_axiosMock').axiosModuleFactory());

import Ideasoft from '@integration/modules/ecommerce/ideasoft';
import { SecurityService } from '@integration/modules/ecommerce/ideasoft/services/SecurityService';
import { ResilientHttpClient } from '@integration/modules/common/http/ResilientHttpClient';
import { encryptSecrets } from '../../../src/platform/core/security/integrationSecrets';
import { getIncomplete } from '@integration/contracts/IncompleteFetch';
import { http, resetHttp } from './_axiosMock';

let stored: any;
function makeParams(clientId: number) {
    const model = {
        aggregate: jest.fn(async () => [{ ecommerce: stored.ecommerce }]),
        findOneAndUpdate: jest.fn((_f: any, u: any) => { stored.ecommerce[0].settings.auth = u.$set['ecommerce.$.settings.auth']; return { lean: async () => stored }; }),
    };
    return { clientId, clientDB: { getClientIntegrationModel: () => model }, integrationSettings: { settings: { storeName: 'magaza', key: 'cid', secret: 'SUPER-SECRET' }, urls: {} } };
}
const setAuth = (a: any) => { stored.ecommerce[0].settings.auth = encryptSecrets(a, 'ideasoft'); };
const err401 = () => Object.assign(new Error('unauthorized'), { response: { status: 401, data: {}, headers: {} } });

beforeEach(() => {
    stored = { ecommerce: [{ code: 'ideasoft', settings: {} }] };
    resetHttp(); ResilientHttpClient.resetAllState(); SecurityService.resetInflight();
    delete process.env.IDEASOFT_TOKEN_LEGACY_GET; delete process.env.IDEASOFT_MAX_PAGES;
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => { jest.restoreAllMocks(); });

describe('Ideasoft OAuth taşıma güvenliği ve yenileme', () => {
    it('süresi dolmuş token: yenileme POST form gövdesiyle yapılır, URL de sır YOK, sonraki istek yeni Bearer ile gider (C10: init() gerekmez)', async () => {
        setAuth({ access_token: 'eski', refresh_token: 'RT-1', expires_in: 10, createdAt: 1 });
        http.post.mockResolvedValue({ data: { access_token: 'yeni', refresh_token: 'RT-2', expires_in: 3600 } });
        http.get.mockResolvedValue({ data: [] });
        await new Ideasoft(makeParams(11)).retrieveBrands({});
        expect(http.post).toHaveBeenCalledTimes(1);
        const [url, body, cfg] = http.post.mock.calls[0] as any[];
        expect(String(url)).not.toContain('?');
        expect(String(url)).not.toMatch(/SUPER-SECRET|RT-1/);
        expect(body).toContain('grant_type=refresh_token');
        expect(body).toContain('client_secret=SUPER-SECRET');
        expect(body).toContain('refresh_token=RT-1');
        expect(cfg.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
        expect(cfg.headers.Authorization).toBeUndefined();
        expect((http.get.mock.calls[0] as any[])[1].headers.Authorization).toBe('Bearer yeni');
        for (const c of http.get.mock.calls) expect(String(c[0])).not.toMatch(/SUPER-SECRET|client_secret/);
    });

    it('single-flight: 5 eşzamanlı istek TEK token yenilemesi yapar', async () => {
        setAuth({ access_token: 'eski', refresh_token: 'RT', expires_in: 10, createdAt: 1 });
        http.post.mockImplementation(async () => { await new Promise(r => setTimeout(r, 20)); return { data: { access_token: 'yeni', expires_in: 3600 } }; });
        http.get.mockResolvedValue({ data: [] });
        const svc = new Ideasoft(makeParams(12));
        await Promise.all([1, 2, 3, 4, 5].map(() => svc.retrieveBrands({})));
        expect(http.post).toHaveBeenCalledTimes(1);
        expect(http.get).toHaveBeenCalledTimes(5);
    });

    it('[INT-05] örnekler ARASI single-flight: aynı tenant için iki Ideasoft örneği TEK token isteği yapar ve İKİSİ de yeni Bearer ile gider', async () => {
        setAuth({ access_token: 'eski', refresh_token: 'RT', expires_in: 10, createdAt: 1 });
        http.post.mockImplementation(async () => { await new Promise(r => setTimeout(r, 20)); return { data: { access_token: 'ortak-yeni', expires_in: 3600 } }; });
        http.get.mockResolvedValue({ data: [] });
        await Promise.all([new Ideasoft(makeParams(18)).retrieveBrands({}), new Ideasoft(makeParams(18)).retrieveBrands({})]);
        expect(http.post).toHaveBeenCalledTimes(1);
        expect(http.get.mock.calls.map((c: any[]) => c[1].headers.Authorization)).toEqual(['Bearer ortak-yeni', 'Bearer ortak-yeni']);
    });

    it('skew: süre dolmasına skew payından az kaldıysa istekten ÖNCE yenilenir', async () => {
        setAuth({ access_token: 'yakinda-biter', refresh_token: 'RT', expires_in: 3600, createdAt: Date.now() - (3600 - 60) * 1000 });
        http.post.mockResolvedValue({ data: { access_token: 'taze', expires_in: 3600 } });
        http.get.mockResolvedValue({ data: [] });
        await new Ideasoft(makeParams(13)).retrieveBrands({});
        expect(http.post).toHaveBeenCalledTimes(1);
        expect((http.get.mock.calls[0] as any[])[1].headers.Authorization).toBe('Bearer taze');
    });

    it('geçerli token: token isteği YOK; 401 gelirse BİR KEZ yenileyip isteği tekrarlar', async () => {
        setAuth({ access_token: 'gecerli', refresh_token: 'RT', expires_in: 3600, createdAt: Date.now() });
        http.get.mockRejectedValueOnce(err401()).mockResolvedValue({ data: [] });
        http.post.mockResolvedValue({ data: { access_token: 'yenilenen', expires_in: 3600 } });
        await new Ideasoft(makeParams(14)).retrieveBrands({});
        expect(http.post).toHaveBeenCalledTimes(1);
        expect(http.get).toHaveBeenCalledTimes(2);
        expect((http.get.mock.calls[0] as any[])[1].headers.Authorization).toBe('Bearer gecerli');
        expect((http.get.mock.calls[1] as any[])[1].headers.Authorization).toBe('Bearer yenilenen');
    });

    it('yenileme sonrası da 401 ise döngüye girmez: AUTH IntegrationError fırlatır', async () => {
        setAuth({ access_token: 'gecerli', refresh_token: 'RT', expires_in: 3600, createdAt: Date.now() });
        http.get.mockRejectedValue(err401());
        http.post.mockResolvedValue({ data: { access_token: 'yenilenen', expires_in: 3600 } });
        await expect(new Ideasoft(makeParams(15)).retrieveBrands({})).rejects.toMatchObject({ code: 'AUTH' });
        expect(http.post).toHaveBeenCalledTimes(1);
        expect(http.get).toHaveBeenCalledTimes(2);
    });

    it('kayıtlı token/refresh_token yoksa istek boş Bearer ile GİTMEZ: AUTH hatası (sahte başarı yok)', async () => {
        await expect(new Ideasoft(makeParams(16)).retrieveBrands({})).rejects.toMatchObject({ code: 'AUTH' });
        expect(http.get).not.toHaveBeenCalled();
    });

    it('geriye dönük uyumluluk anahtarı (IDEASOFT_TOKEN_LEGACY_GET=true) açıkça verilmedikçe token için GET KULLANILMAZ', async () => {
        setAuth({ access_token: 'eski', refresh_token: 'RT', expires_in: 10, createdAt: 1 });
        http.post.mockResolvedValue({ data: { access_token: 'yeni', expires_in: 3600 } });
        http.get.mockResolvedValue({ data: [] });
        await new Ideasoft(makeParams(17)).retrieveBrands({});
        expect(http.get.mock.calls.some((c: any[]) => String(c[0]).includes('oauth'))).toBe(false);
    });
});

describe('Ideasoft sayfalama tavanı', () => {
    const page = (n: number) => Array.from({ length: 100 }, (_, i) => ({ id: n * 1000 + i, name: 'm' }));

    it('API page parametresini yok sayıp aynı sayfayı döndürürse 2. turda çıkar (ilerleme yok)', async () => {
        setAuth({ access_token: 'g', refresh_token: 'RT', expires_in: 3600, createdAt: Date.now() });
        http.get.mockResolvedValue({ data: page(1) });
        const brands = await new Ideasoft(makeParams(21)).retrieveBrands({});
        expect(http.get).toHaveBeenCalledTimes(2);
        expect(brands).toHaveLength(100);
        expect(getIncomplete(brands)).toMatchObject({ incomplete: true, reason: 'PAGINATION_REPEATED_PAGE' });
    });

    it('[INT-05] sayfa tavanı (IDEASOFT_MAX_PAGES) aşılırsa sessizce kırpmaz: sonuç INCOMPLETE (PAGINATION_PAGE_CAP) işaretlenir', async () => {
        process.env.IDEASOFT_MAX_PAGES = '3';
        setAuth({ access_token: 'g', refresh_token: 'RT', expires_in: 3600, createdAt: Date.now() });
        let n = 0;
        http.get.mockImplementation(async () => ({ data: page(++n) }));
        const brands = await new Ideasoft(makeParams(22)).retrieveBrands({});
        expect(http.get).toHaveBeenCalledTimes(3);
        expect(brands).toHaveLength(300);
        expect(getIncomplete(brands)).toMatchObject({ incomplete: true, reason: 'PAGINATION_PAGE_CAP' });
    });

    it('normal sonlanma (son sayfa < 100) etkilenmez', async () => {
        setAuth({ access_token: 'g', refresh_token: 'RT', expires_in: 3600, createdAt: Date.now() });
        http.get.mockResolvedValueOnce({ data: page(1) }).mockResolvedValueOnce({ data: page(2).slice(0, 5) });
        expect(await new Ideasoft(makeParams(23)).retrieveBrands({})).toHaveLength(105);
    });
});

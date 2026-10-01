/**
 * [INT-05 Trendyol] ClaimConnector.fetchClaimsFromPlatform sayfalama.
 * Bölüm A: normal durum karakterizasyonu (değişmemeli: istek sayısı, sayfa sırası, birleşik sonuç).
 * Bölüm B: tavan / tekrar sayfa / eşzamanlılık / hata (INT-05 düzeltmesi).
 * Gerçek Trendyol'a İSTEK YOK: axios jest.mock ile taklit.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('axios', () => require('../stubs/_axiosMock').axiosModuleFactory());

import Service from '@integration/modules/marketplace/trendyol/services/Service';
import { ClaimConnector } from '@integration/modules/marketplace/trendyol/api/ClaimConnector';
import { ClaimService } from '@integration/modules/marketplace/trendyol/services/ClaimService';
import { ResilientHttpClient } from '@integration/modules/common/http/ResilientHttpClient';
import { getIncomplete } from '@integration/contracts/IncompleteFetch';
import { http, resetHttp } from '../stubs/_axiosMock';

const params = {
    clientId: 7,
    integrationSettings: {
        settings: { APIKEY: 'k', APISECRET: 's', SELLERID: '999' },
        urls: { claimListUrl: 'https://api.trendyol.com/sapigw/suppliers/<SELLERID>/claims' },
    },
};
const pageOf = (url: string) => Number(new URL(url).searchParams.get('page'));

let service: Service;
let inFlight = 0;
let maxInFlight = 0;

/** Sayfa p -> tek kayıt {id:'c<p>'}; her çağrı asenkron (eşzamanlılık ölçümü için). */
function mockPages(totalPages: number, opts: { sameContent?: boolean; failPage?: number } = {}) {
    http.get.mockImplementation((async (url: string) => {
        inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise(r => setTimeout(r, 5));
        inFlight--;
        const p = pageOf(url);
        if (opts.failPage === p) throw Object.assign(new Error('HTTP 400'), { response: { status: 400, data: { message: 'x' } } });
        return { data: { content: [{ id: opts.sameContent && p > 0 ? 'c1' : `c${p}` }], totalPages } };
    }) as never);
}

beforeAll(() => { ResilientHttpClient.setTestDelayScale(0.001); });
afterAll(() => { ResilientHttpClient.setTestDelayScale(1); });
beforeEach(() => {
    process.env.TY_RATE_PER_MIN = '600000'; // genel kova testte yavaşlatmasın (süreç-içi sınırlayıcı)
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    resetHttp(); ResilientHttpClient.resetAllState();
    inFlight = 0; maxInFlight = 0;
    service = new Service(params);
});
afterEach(() => { jest.restoreAllMocks(); delete process.env.TY_RATE_PER_MIN; });

describe('Trendyol iade sayfalama - normal durum (karakterizasyon)', () => {
    it('totalPages=4 -> 4 istek, sayfa 0..3, sonuç sayfa sırasıyla birleşik, incomplete YOK', async () => {
        mockPages(4);
        const out = await new ClaimConnector(service, params).fetchClaimsFromPlatform({});
        expect(http.get).toHaveBeenCalledTimes(4);
        expect((http.get.mock.calls as any[][]).map(c => pageOf(c[0])).sort()).toEqual([0, 1, 2, 3]);
        expect(out).toEqual([{ id: 'c0' }, { id: 'c1' }, { id: 'c2' }, { id: 'c3' }]);
        expect(getIncomplete(out)).toBeUndefined();
    });

    it('totalPages yok/1 -> tek istek', async () => {
        http.get.mockResolvedValue({ data: { content: [{ id: 'a' }] } } as never);
        const out = await new ClaimConnector(service, params).fetchClaimsFromPlatform({});
        expect(http.get).toHaveBeenCalledTimes(1);
        expect(out).toEqual([{ id: 'a' }]);
    });

    it('ara sayfa hatası yutulmaz (IntegrationError fırlar)', async () => {
        mockPages(4, { failPage: 2 });
        await expect(new ClaimConnector(service, params).fetchClaimsFromPlatform({})).rejects.toMatchObject({ name: 'IntegrationError', code: 'VALIDATION' });
    });
});

describe('Trendyol iade sayfalama - tavan / tekrar / eşzamanlılık (INT-05)', () => {
    it('totalPages=50 (tavan) -> tam çekilir, incomplete YOK', async () => {
        mockPages(50);
        const out = await new ClaimConnector(service, params).fetchClaimsFromPlatform({});
        expect(http.get).toHaveBeenCalledTimes(50);
        expect(out).toHaveLength(50);
        expect(getIncomplete(out)).toBeUndefined();
    });

    it('totalPages=10000 -> en çok 50 istek, PAGINATION_PAGE_CAP ile işaretli', async () => {
        mockPages(10_000);
        const out = await new ClaimConnector(service, params).fetchClaimsFromPlatform({});
        expect(http.get).toHaveBeenCalledTimes(50);
        expect(out).toHaveLength(50);
        expect(getIncomplete(out)).toMatchObject({ incomplete: true, reason: 'PAGINATION_PAGE_CAP', collected: 50 });
    });

    it('eşzamanlı istek sayısı en çok 3', async () => {
        mockPages(12);
        await new ClaimConnector(service, params).fetchClaimsFromPlatform({});
        expect(maxInFlight).toBeLessThanOrEqual(3);
        expect(maxInFlight).toBeGreaterThan(1);
    });

    it('aynı içerikli tekrar sayfa -> PAGINATION_REPEATED_PAGE, tekrar eden kayıtlar eklenmez', async () => {
        mockPages(6, { sameContent: true });
        const out = await new ClaimConnector(service, params).fetchClaimsFromPlatform({});
        expect(out).toEqual([{ id: 'c0' }, { id: 'c1' }]);
        expect(getIncomplete(out)).toMatchObject({ reason: 'PAGINATION_REPEATED_PAGE' });
    });

    it('ClaimService.fetchClaims incomplete işaretini taşır', async () => {
        mockPages(10_000);
        const res = await new ClaimService(params, service).fetchClaims({});
        expect(getIncomplete(res)).toMatchObject({ reason: 'PAGINATION_PAGE_CAP' });
    });
});

/**
 * INT-05 (Pazarama) karakterizasyon: mock açıkken `*_MOCK_BASE_URL` VERİLMEDİĞİNDE varsayılan taban.
 * ESKİ: iki farklı varsayılan vardı (INT-02 bulgusu): token ucu `http://localhost:6011`, veri uçları `http://localhost:3006` (ADAPTER_KEYS).
 * INT-05 adım 2: ikisi de tek kaynaktan (ADAPTER_KEYS.mockDefaultBase = 3006) türer; token testi bilinçli ters çevrildi.
 * Gerçek ağ YOK: axios taklit edilir, yalnız axios'a geçirilen URL okunur.
 */
import { describe, it, expect, beforeEach, afterEach, jest, beforeAll, afterAll } from '@jest/globals';

jest.mock('axios', () => require('../stubs/_axiosMock').axiosModuleFactory());

import PazaramaService from '@integration/modules/marketplace/pazarama/services/Service';
import { ResilientHttpClient } from '@integration/modules/common/http/ResilientHttpClient';
import { http, resetHttp } from '../stubs/_axiosMock';

const ENV_KEYS = ['PAZARAMA_MOCK_MODE', 'PAZARAMA_MOCK_BASE_URL', 'PAZARAMA_MOCKABLE_ENDPOINTS'];
const saved: Record<string, string | undefined> = {};
const lastUrl = (fn: any): string => (fn.mock.calls[0] as any[])[0] as string;
const params = () => ({ clientId: 'c1', integrationSettings: { settings: { APIKEY: 'k', APISECRET: 's' }, urls: {} } });

beforeAll(() => { ResilientHttpClient.setTestDelayScale(0.001); });
afterAll(() => { ResilientHttpClient.setTestDelayScale(1); });
beforeEach(() => {
    for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    resetHttp();
    ResilientHttpClient.resetAllState();
    http.post.mockResolvedValue({ data: { access_token: 'tok', expires_in: 3600 } } as never);
    http.get.mockResolvedValue({ data: {} } as never);
});
afterEach(() => {
    for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    jest.restoreAllMocks();
});

describe('Pazarama mock varsayılan tabanı (PAZARAMA_MOCK_BASE_URL verilmemiş)', () => {
    it('veri ucu varsayılan olarak ADAPTER_KEYS tabanına (localhost:3006/apigateway) gider', async () => {
        process.env.PAZARAMA_MOCK_MODE = 'true'; process.env.PAZARAMA_MOCKABLE_ENDPOINTS = 'product';
        await new PazaramaService(params()).get('product/x');
        expect(lastUrl(http.get)).toBe('http://localhost:3006/apigateway/product/x');
    });

    // DÜZELTME (INT-05): ESKİ: token ucu AYRI bir varsayılana (http://localhost:6011/connect/token) giderdi; artık tek kaynak (ADAPTER_KEYS, 3006).
    it('[DÜZELTME] token ucu da aynı tek varsayılandan türer: http://localhost:3006/connect/token', async () => {
        process.env.PAZARAMA_MOCK_MODE = 'true'; process.env.PAZARAMA_MOCKABLE_ENDPOINTS = 'product';
        await new PazaramaService(params()).get('product/x');
        expect(lastUrl(http.post)).toBe('http://localhost:3006/connect/token');
    });

    it('PAZARAMA_MOCK_BASE_URL verilirse token kökü ve veri tabanı ONDAN türer (tutarlı)', async () => {
        process.env.PAZARAMA_MOCK_MODE = 'true'; process.env.PAZARAMA_MOCKABLE_ENDPOINTS = 'product';
        process.env.PAZARAMA_MOCK_BASE_URL = 'http://localhost:6015/pazarama/apigateway';
        await new PazaramaService(params()).get('product/x');
        expect(lastUrl(http.post)).toBe('http://localhost:6015/pazarama/connect/token');
        expect(lastUrl(http.get)).toBe('http://localhost:6015/pazarama/apigateway/product/x');
    });
});

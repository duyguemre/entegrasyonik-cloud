/**
 * INT-05 adım 3 ÖNCESİ karakterizasyon: Ideasoft sayfalama döngüleri (fetchOrders/fetchCategories/fetchCategoryAttributes/
 * streamProducts). Gerçek ağ YOK (axios taklidi). `fetchBrands` için bkz. Ideasoft.oauthAndPaging.test.ts.
 * Sayfa boyutu 100; `page` 1 tabanlı; tur (round) sınırı IDEASOFT_MAX_PAGES (varsayılan 500).
 */
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, jest } from '@jest/globals';

jest.mock('axios', () => require('./_axiosMock').axiosModuleFactory());

import Service from '@integration/modules/ecommerce/ideasoft/services/Service';
import { OrderService } from '@integration/modules/ecommerce/ideasoft/services/OrderService';
import { CategoryService } from '@integration/modules/ecommerce/ideasoft/services/CategoryService';
import { ProductService } from '@integration/modules/ecommerce/ideasoft/services/ProductService';
import { ResilientHttpClient } from '@integration/modules/common/http/ResilientHttpClient';
import { getIncomplete } from '@integration/contracts/IncompleteFetch';
import { http, resetHttp } from './_axiosMock';

const params = { clientId: 91, integrationSettings: { settings: { storeName: 'magaza', key: 'k', secret: 's' }, urls: {} } };
const svc = () => { const s = new Service(params); s.setCurrentToken('tok'); return s; };
const rows = (n: number, count = 100) => Array.from({ length: count }, (_, i) => ({ id: n * 1000 + i, name: `n${n}-${i}`, orderNumber: `O${n}-${i}` }));
// sayfa numarası URL sorgusunda ya da config.params içinde olabilir
const pageOf = (url: string, cfg: any): number => Number(new URL(url, 'http://x').searchParams.get('page') ?? cfg?.params?.page);
const calledPages = () => http.get.mock.calls.map((c: any[]) => pageOf(String(c[0]), c[1]));

beforeAll(() => { ResilientHttpClient.setTestDelayScale(0.001); });
afterAll(() => { ResilientHttpClient.setTestDelayScale(1); });
beforeEach(() => {
    resetHttp(); ResilientHttpClient.resetAllState();
    delete process.env.IDEASOFT_MAX_PAGES;
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    // streamProducts turlar arası 1 sn bekler; testi yavaşlatmamak için yalnız o bekleme hemen tetiklenir.
    const real = global.setTimeout;
    jest.spyOn(global, 'setTimeout').mockImplementation(((fn: any, ms?: number, ...a: any[]) => real(fn, ms === 1000 ? 0 : ms, ...a)) as any);
});
afterEach(() => { delete process.env.IDEASOFT_MAX_PAGES; jest.restoreAllMocks(); });

describe('fetchOrders sayfalama', () => {
    it('100 + 5 kayıt: iki sayfa (page=1,2, limit=100), 105 sipariş; ikinci sayfa <100 olduğu için durur', async () => {
        http.get.mockResolvedValueOnce({ data: rows(1) }).mockResolvedValueOnce({ data: rows(2, 5) });
        const r = await new OrderService(params, svc()).fetchOrders({});
        expect(r).toHaveLength(105);
        expect(http.get).toHaveBeenCalledTimes(2);
        expect((http.get.mock.calls[0] as any[])[1].params).toMatchObject({ limit: 100, page: 1 });
        expect((http.get.mock.calls[1] as any[])[1].params.page).toBe(2);
        expect(getIncomplete(r)).toBeUndefined();
    });
    it('boş ilk sayfa: tek istek, []', async () => {
        http.get.mockResolvedValue({ data: [] });
        expect(await new OrderService(params, svc()).fetchOrders({})).toEqual([]);
        expect(http.get).toHaveBeenCalledTimes(1);
    });
    it('`{data:[...]}` sarmalı yanıt da okunur', async () => {
        http.get.mockResolvedValue({ data: { data: rows(1, 3) } });
        expect(await new OrderService(params, svc()).fetchOrders({})).toHaveLength(3);
    });
    it('aynı sayfa tekrar dönerse 2. turda durur (ilerleme yok), ilk sayfa korunur ve sonuç INCOMPLETE işaretlenir', async () => {
        http.get.mockResolvedValue({ data: rows(1) });
        const r = await new OrderService(params, svc()).fetchOrders({});
        expect(http.get).toHaveBeenCalledTimes(2);
        expect(r).toHaveLength(100);
        expect(getIncomplete(r)).toMatchObject({ incomplete: true, reason: 'PAGINATION_REPEATED_PAGE' });
    });
    it('[INT-05 BİLİNÇLİ DEĞİŞİM] sayfa tavanı (IDEASOFT_MAX_PAGES) aşılırsa fırlatmaz: toplanan kayıtlar INCOMPLETE (PAGE_CAP) işaretiyle döner (motor imleci ilerletmez)', async () => {
        process.env.IDEASOFT_MAX_PAGES = '3';
        let n = 0;
        http.get.mockImplementation(async () => ({ data: rows(++n) }));
        const r = await new OrderService(params, svc()).fetchOrders({});
        expect(http.get).toHaveBeenCalledTimes(3);
        expect(r).toHaveLength(300);
        expect(getIncomplete(r)).toMatchObject({ incomplete: true, reason: 'PAGINATION_PAGE_CAP', collected: 300 });
    });
});

describe('fetchCategories sayfalama', () => {
    it('iki sayfa (100 + 7) birleşir; page sorgu dizgesiyle istenir', async () => {
        http.get.mockResolvedValueOnce({ data: rows(1) }).mockResolvedValueOnce({ data: rows(2, 7) });
        const r = await new CategoryService(params, svc()).fetchCategories();
        expect(r).toHaveLength(107);
        expect(calledPages()).toEqual([1, 2]);
    });
    it('aynı sayfa tekrar dönerse 2. turda durur', async () => {
        http.get.mockResolvedValue({ data: rows(1) });
        expect(await new CategoryService(params, svc()).fetchCategories()).toHaveLength(100);
        expect(http.get).toHaveBeenCalledTimes(2);
    });
    it('[INT-05 BİLİNÇLİ DEĞİŞİM] tavan aşılırsa fırlatmaz: dönüştürülmüş liste INCOMPLETE işaretiyle döner', async () => {
        process.env.IDEASOFT_MAX_PAGES = '2';
        let n = 0;
        http.get.mockImplementation(async () => ({ data: rows(++n) }));
        const r = await new CategoryService(params, svc()).fetchCategories();
        expect(http.get).toHaveBeenCalledTimes(2);
        expect(getIncomplete(r)).toMatchObject({ incomplete: true, reason: 'PAGINATION_PAGE_CAP' });
    });
});

describe('fetchCategoryAttributes (3 sayfa eşzamanlı tur; boş sayfa = bitiş, sayfa boyutu varsayımı YOK)', () => {
    it('tur 1: sayfa 1-3 dolu (20 kayıtlı sayfalar da sorun değil), tur 2: boş -> durur', async () => {
        http.get.mockImplementation(async (url: string, cfg: any) => { const p = pageOf(String(url), cfg); return { data: p <= 3 ? rows(p, 20) : [] }; });
        await new CategoryService(params, svc()).fetchCategoryAttributes('c1');
        expect(calledPages().sort()).toEqual([1, 2, 3, 4, 5, 6]);
    });
    it('turdaki herhangi bir sayfa boşsa o turdan sonra durur', async () => {
        http.get.mockImplementation(async (url: string, cfg: any) => { const p = pageOf(String(url), cfg); return { data: p === 1 ? rows(1, 10) : [] }; });
        await new CategoryService(params, svc()).fetchCategoryAttributes('c1');
        expect(http.get).toHaveBeenCalledTimes(3);
    });
    it('[INT-05 BİLİNÇLİ DEĞİŞİM] hiç boş sayfa gelmeden tur tavanı aşılırsa fırlatmaz: INCOMPLETE işaretli liste (2 tur = 6 istek)', async () => {
        process.env.IDEASOFT_MAX_PAGES = '2';
        http.get.mockImplementation(async (url: string, cfg: any) => ({ data: rows(pageOf(String(url), cfg), 5) }));
        const r = await new CategoryService(params, svc()).fetchCategoryAttributes('c1');
        expect(http.get).toHaveBeenCalledTimes(6);
        expect(getIncomplete(r)).toMatchObject({ incomplete: true, reason: 'PAGINATION_PAGE_CAP' });
    });
});

describe('streamProducts (5 sayfa eşzamanlı tur; sayfa başına callback)', () => {
    it('3 dolu sayfa + boş: callback SAYFA BAŞINA sırayla çağrılır, COMPLETED ve toplam doğru', async () => {
        http.get.mockImplementation(async (url: string, cfg: any) => { const p = pageOf(String(url), cfg); return { data: p <= 3 ? rows(p, 100) : [] }; });
        const chunks: number[] = [];
        const res = await new ProductService(params, svc()).streamProducts(async c => { chunks.push(c.length); });
        expect(chunks).toEqual([100, 100, 100]);
        expect(res).toMatchObject({ status: 'COMPLETED', totalProcessed: 300, totalElements: 300 });
        expect(http.get).toHaveBeenCalledTimes(10); // dolu tur + boş tur (5 + 5 sayfa)
    });
    it('tüm sayfalar boş: COMPLETED, 0 kayıt', async () => {
        http.get.mockResolvedValue({ data: [] });
        const cb = jest.fn(async () => undefined);
        const res = await new ProductService(params, svc()).streamProducts(cb as any);
        expect(cb).not.toHaveBeenCalled();
        expect(res).toMatchObject({ status: 'COMPLETED', totalProcessed: 0 });
    });
    it('API page yok sayıp aynı içeriği döndürürse 2. turda durur; [INT-05 BİLİNÇLİ DEĞİŞİM] eksik veri olduğundan FAILED (eskiden COMPLETED)', async () => {
        http.get.mockResolvedValue({ data: rows(1, 10) });
        const res = await new ProductService(params, svc()).streamProducts(async () => undefined);
        expect(http.get).toHaveBeenCalledTimes(10); // 2 tur x 5
        expect(res.status).toBe('FAILED');
        expect(res.error).toMatch(/PAGINATION_REPEATED_PAGE/);
    });
    it('tur tavanı aşılırsa FAILED + error (hata fırlatılmaz)', async () => {
        process.env.IDEASOFT_MAX_PAGES = '2';
        let n = 0;
        http.get.mockImplementation(async () => ({ data: rows(++n, 10) }));
        const res = await new ProductService(params, svc()).streamProducts(async () => undefined);
        expect(res.status).toBe('FAILED');
        expect(res.error).toMatch(/PAGINATION_PAGE_CAP/);
    });
    it('callback hatası FAILED olarak döner (işlenen sayı korunur)', async () => {
        http.get.mockImplementation(async (url: string, cfg: any) => ({ data: pageOf(String(url), cfg) <= 2 ? rows(pageOf(String(url), cfg), 10) : [] }));
        let n = 0;
        const res = await new ProductService(params, svc()).streamProducts(async () => { if (++n === 2) throw new Error('kayıt hatası'); });
        expect(res).toMatchObject({ status: 'FAILED', error: 'kayıt hatası', totalProcessed: 10 });
    });
});

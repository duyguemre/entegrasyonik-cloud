/**
 * ADR-0006 Aşama B3, kapsam madde 4: Ideasoft/Bizimhesap ResilientHttpClient'a taşındığı için
 * `IntegrationCallMetrics` koleksiyonuna OTOMATİK yazmaları gerekir (ekstra kod GEREKMEZ — bu
 * ResilientHttpClient.executeCustom'ın her çağrı sonunda `IntegrationCallMetrics.record(...)`
 * çağırmasından gelir). Bu dosya bunu sözleşme testiyle doğrular: `IntegrationCallMetrics.setSink`
 * ile gerçek DB yerine bellek içi bir alıcı takılır, gerçek yerel HTTP sunucusuna istek atılır ve
 * kayıtta `integrationCode: 'ideasoft'|'bizimhesap'` beklenir.
 */
import { describe, it, expect, beforeEach, afterEach, jest, beforeAll, afterAll } from '@jest/globals';
import { IntegrationCallMetrics } from '@integration/modules/common/http/IntegrationCallMetrics';
import { ResilientHttpClient } from '@integration/modules/common/http/ResilientHttpClient';
import IdeasoftService from '@integration/modules/ecommerce/ideasoft/services/Service';
import BizimhesapService from '@integration/modules/erp/bizimhesap/services/Service';
import { startLocalServer, LocalServerHandle } from '../../helpers/localHttpServer';

let srv: LocalServerHandle | undefined;
let records: Record<string, any>[];

beforeAll(() => { ResilientHttpClient.setTestDelayScale(0.001); });
afterAll(() => { ResilientHttpClient.setTestDelayScale(1); });
beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    ResilientHttpClient.resetAllState();
    records = [];
    IntegrationCallMetrics.setSink(async (record) => { records.push(record); });
});
afterEach(async () => {
    jest.restoreAllMocks();
    IntegrationCallMetrics.setSink(undefined);
    if (srv) { await srv.close(); srv = undefined; }
});

describe('IntegrationCallMetrics - Ideasoft/Bizimhesap adaptör sözleşmesi (ADR-0006 madde 4)', () => {
    it('Ideasoft Service.get başarılı çağrı sonunda kind:"http", integrationCode:"ideasoft" kaydı üretir', async () => {
        srv = await startLocalServer((_req, res) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ data: [] }));
        });
        const svc = new IdeasoftService({
            clientId: 81,
            integrationSettings: { settings: { storeName: 'test' }, urls: { baseUrl: srv.baseUrl } },
        });
        await svc.get('orders');

        expect(records.length).toBeGreaterThanOrEqual(1);
        const rec = records.find((r) => r.integrationCode === 'ideasoft');
        expect(rec).toBeDefined();
        expect(rec!.kind).toBe('http');
        expect(rec!.status).toBe('ok');
        expect(rec!.clientId).toBe('81');
    });

    it('Bizimhesap Service.get hata durumunda da kind:"http", integrationCode:"bizimhesap", status:"error" kaydı üretir', async () => {
        srv = await startLocalServer((_req, res) => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'sunucu hatası' }));
        });
        const svc = new BizimhesapService({
            clientId: 82,
            integrationSettings: { settings: { key: 'k', secret: 's' }, urls: { baseUrl: srv.baseUrl } },
        });
        await expect(svc.get('products')).rejects.toMatchObject({ code: 'UNAVAILABLE' });

        const rec = records.find((r) => r.integrationCode === 'bizimhesap');
        expect(rec).toBeDefined();
        expect(rec!.kind).toBe('http');
        expect(rec!.status).toBe('error');
        expect(rec!.code).toBe('UNAVAILABLE');
    });
});

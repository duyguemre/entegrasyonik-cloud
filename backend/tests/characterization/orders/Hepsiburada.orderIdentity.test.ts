// INT-05 (conformance C7b): kimliksiz (orderNumber/orderId yok) HB sipariş kaydı boş kimlikle SESSİZCE kaydedilmez. HTTP sahte (ağ YOK).
// Mapper'ın kendi davranışı (boş string) OrderTransformer.characterization.test.ts'te aynen sabit; filtre OrderService katmanındadır.
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { OrderService } from '@integration/modules/marketplace/hepsiburada/services/OrderService';
import { getIncomplete, markIncomplete } from '@integration/contracts/IncompleteFetch';
import { captureLogs, LogCapture } from '../../helpers/logCapture';

let cap: LogCapture;
beforeEach(() => { cap = captureLogs(); });
afterEach(() => { cap.restore(); });

const build = (raw: any[]) => {
    const svc = new OrderService({ clientId: 9, integrationSettings: { settings: {}, urls: {} } }, {} as any);
    (svc as any).connector = { fetchOrdersFromPlatform: jest.fn(async () => raw) };
    return svc;
};
const ok = (id: string) => ({ orderNumber: id, status: 'Open', lineItems: [] });
const bad = () => ({ status: 'Open', lineItems: [] });

describe('HB OrderService - sipariş kimliği', () => {
    it('hepsi kimlikli: aynen eşlenir, hata logu yok', async () => {
        const r = await build([ok('A'), ok('B')]).fetchOrders({});
        expect(r.map(p => p.order.externalOrderId)).toEqual(['A', 'B']);
        expect(cap.find(l => l.code === 'ORDERSERVICE_HB_SIPARIS_KIMLIGI_EKSIK')).toBeUndefined();
    });
    it('orderId alternatifi kimlik sayılır', async () => {
        const r = await build([{ orderId: 'OID-1', status: 'Open', lineItems: [] }]).fetchOrders({});
        expect(r.map(p => p.order.externalOrderId)).toEqual(['OID-1']);
    });
    it('kısmen kimliksiz: kimliksiz kayıt ATLANIR + hata loglanır, kimlikliler eşlenir', async () => {
        const r = await build([ok('A'), bad(), bad(), ok('B')]).fetchOrders({});
        expect(r.map(p => p.order.externalOrderId)).toEqual(['A', 'B']);
        expect(cap.find(l => l.code === 'ORDERSERVICE_HB_SIPARIS_KIMLIGI_EKSIK')).toMatchObject({ level: 'error' });
    });
    it('3+ kayıtta TÜMÜ kimliksiz: IntegrationError VALIDATION / ORDER_SCHEMA_DRIFT (şema kayması)', async () => {
        await expect(build([bad(), bad(), bad()]).fetchOrders({})).rejects.toMatchObject({ name: 'IntegrationError', code: 'VALIDATION', platformCode: 'ORDER_SCHEMA_DRIFT' });
    });
    it('3\'ten az kayıtta hepsi kimliksiz: fırlatmaz, boş döner (eşik altı)', async () => {
        const r = await build([bad(), bad()]).fetchOrders({});
        expect(r).toEqual([]);
    });
    it('incomplete işareti ham diziden taşınır (filtre işareti düşürmez)', async () => {
        const raw = markIncomplete([ok('A'), bad()], { reason: 'PAGINATION_PAGE_CAP', collected: 2 });
        const r = await build(raw).fetchOrders({});
        expect(r).toHaveLength(1);
        expect(getIncomplete(r)).toMatchObject({ reason: 'PAGINATION_PAGE_CAP' });
    });
});

/**
 * Trendyol C22 — fatura linki / iade onayı / tedarik edememe gövdeleri (spec §1, §7). Axios taklit; ağ YOK.
 */
import { describe, it, expect, beforeEach, afterEach, jest, beforeAll, afterAll } from '@jest/globals';

jest.mock('axios', () => require('../stubs/_axiosMock').axiosModuleFactory());

import Service from '@integration/modules/marketplace/trendyol/services/Service';
import { OrderConnector } from '@integration/modules/marketplace/trendyol/api/OrderConnector';
import { ClaimConnector } from '@integration/modules/marketplace/trendyol/api/ClaimConnector';
import { ResilientHttpClient } from '@integration/modules/common/http/ResilientHttpClient';
import { http, resetHttp } from '../stubs/_axiosMock';

const mkParams = () => ({
    clientId: 7,
    integrationSettings: {
        settings: { APIKEY: 'k', APISECRET: 's', SELLERID: '778899' },
        urls: { claimApproveUrl: 'https://apigw.trendyol.com/integration/order/sellers/<SELLERID>/claims/<CLAIMID>/items/approve' },
    },
});

beforeAll(() => { ResilientHttpClient.setTestDelayScale(0.001); });
afterAll(() => { ResilientHttpClient.setTestDelayScale(1); });
beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    resetHttp();
    ResilientHttpClient.resetAllState();
});
afterEach(() => { jest.restoreAllMocks(); });

describe('Trendyol C22 — fatura linki / iade onayı / tedarik edememe', () => {
    it('fatura: shipmentPackageId sayısal değilse IntegrationError(VALIDATION), istek atılmaz', async () => {
        const p = mkParams();
        await expect(new OrderConnector(new Service(p), p).sendOrderInvoice({ orderId: 'SIPARIS-ABC', invoiceNumber: 'I1', pdfUrl: 'https://x.invalid/a.pdf' } as any))
            .rejects.toMatchObject({ code: 'VALIDATION' });
        expect(http.post).not.toHaveBeenCalled();
    });

    it('fatura: meta.packageId önceliklidir; invoiceDateTime GÖNDERİLMEZ (tipi doğrulanamadı); invoiceNumber yoksa alan yok', async () => {
        http.post.mockResolvedValue({ status: 201, data: {} } as never);
        const p = mkParams();
        await new OrderConnector(new Service(p), p).sendOrderInvoice({ orderId: 'ORD-1', pdfUrl: 'https://x.invalid/a.pdf', invoiceDate: new Date(), meta: { packageId: 42 } } as any);
        expect((http.post.mock.calls[0] as any[])[1]).toEqual({ invoiceLink: 'https://x.invalid/a.pdf', shipmentPackageId: 42 });
    });

    it('fatura: 409 -> sahte başarı YOK, IntegrationError(VALIDATION) (409 anlamı spec\'te belirsiz)', async () => {
        http.post.mockRejectedValue(Object.assign(new Error('HTTP 409'), { response: { status: 409, data: { message: 'conflict' } } }) as never);
        const p = mkParams();
        await expect(new OrderConnector(new Service(p), p).sendOrderInvoice({ orderId: '900001', invoiceNumber: 'I1' } as any))
            .rejects.toMatchObject({ code: 'VALIDATION', httpStatus: 409 });
    });

    it('iade onayı: kalem kimliği verilmezse eski boş gövde korunur (uyarı ile)', async () => {
        http.put.mockResolvedValue({ status: 200, data: {} } as never);
        const p = mkParams();
        await new ClaimConnector(new Service(p), p).approveClaim('C-9');
        expect((http.put.mock.calls[0] as any[])[1]).toEqual({});
    });

    it('tedarik edememe gövdesi resmi biçimde: { lines:[{lineId,quantity}], reasonId } (DEĞİŞMEDİ)', async () => {
        http.put.mockResolvedValue({ status: 200 } as never);
        const p = mkParams();
        await new OrderConnector(new Service(p), p).rejectOrder('900001', { reasonId: '621', lineItems: [{ externalLineId: '8001', quantity: 2 }] } as any);
        const call = http.put.mock.calls[0] as any[];
        expect(call[0]).toBe('https://apigw.trendyol.com/integration/order/sellers/778899/shipment-packages/900001/items/unsupplied');
        expect(call[1]).toEqual({ lines: [{ lineId: 8001, quantity: 2 }], reasonId: 621 });
    });
});

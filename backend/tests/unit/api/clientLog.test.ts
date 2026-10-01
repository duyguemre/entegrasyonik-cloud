/**
 * YENİ DAVRANIŞ (ADR-0017 Karar 1.8): `POST /client-log` işleyicisi. `parseClientLogBody`/`isBodyTooLarge`
 * SAF fonksiyonlardır; `handleClientLog` sahte `req`/`res` ile test edilir (gerçek Express/DB YOK).
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const recordErrorEvent = jest.fn();
jest.mock('@platform/runtime/metrics', () => ({ recordErrorEvent }));
jest.mock('@platform/core/context', () => ({ getRequestId: () => 'req-server-1' }));

import { parseClientLogBody, isBodyTooLarge, handleClientLog, resetClientLogDedupForTests, CLIENT_LOG_MAX_BODY_BYTES } from '@api/clientLog';

function fakeReq(body: any, headers: Record<string, string> = {}): any {
    return { body, headers };
}
function fakeRes(principal?: any): any {
    const res: any = { locals: { principal }, statusCode: undefined, body: undefined };
    res.status = jest.fn((c: number) => { res.statusCode = c; return res; });
    res.send = jest.fn((b?: any) => { res.body = b; return res; });
    return res;
}

describe('parseClientLogBody', () => {
    it('geçerli gövdeyi kabul eder, bilinmeyen alanları YOK SAYAR (beyaz liste)', () => {
        const parsed = parseClientLogBody({ level: 'error', msg: 'x', evilField: 'zararli', platform: 'web' });
        expect(parsed).toMatchObject({ level: 'error', msg: 'x', platform: 'web' });
        expect((parsed as any).evilField).toBeUndefined();
    });

    it('level "info"/"debug" REDDEDİLİR (yalnız error/warn)', () => {
        expect(parseClientLogBody({ level: 'info', msg: 'x' })).toBeUndefined();
    });

    it('msg eksikse/boşsa REDDEDİLİR', () => {
        expect(parseClientLogBody({ level: 'error' })).toBeUndefined();
        expect(parseClientLogBody({ level: 'error', msg: '' })).toBeUndefined();
    });

    it('platform "electron" DIŞINDA her şey "web"e düşer', () => {
        expect(parseClientLogBody({ level: 'warn', msg: 'x', platform: 'ios' })!.platform).toBe('web');
        expect(parseClientLogBody({ level: 'warn', msg: 'x', platform: 'electron' })!.platform).toBe('electron');
    });

    it('stack 30 satırla SINIRLANIR', () => {
        const stack = Array.from({ length: 50 }, (_, i) => `line${i}`).join('\n');
        const parsed = parseClientLogBody({ level: 'error', msg: 'x', stack })!;
        expect(parsed.stack!.split('\n')).toHaveLength(30);
    });

    it('null/dizi/eksik gövde REDDEDİLİR', () => {
        expect(parseClientLogBody(null)).toBeUndefined();
        expect(parseClientLogBody([])).toBeUndefined();
        expect(parseClientLogBody('x')).toBeUndefined();
    });
});

describe('isBodyTooLarge', () => {
    it('Content-Length > 8 KB ise true', () => {
        expect(isBodyTooLarge(fakeReq({}, { 'content-length': String(CLIENT_LOG_MAX_BODY_BYTES + 1) }))).toBe(true);
    });
    it('Content-Length yoksa JSON boyutuna göre hesaplar', () => {
        expect(isBodyTooLarge(fakeReq({ msg: 'x'.repeat(CLIENT_LOG_MAX_BODY_BYTES + 100) }))).toBe(true);
        expect(isBodyTooLarge(fakeReq({ msg: 'kısa' }))).toBe(false);
    });
});

describe('handleClientLog', () => {
    beforeEach(() => { recordErrorEvent.mockClear(); resetClientLogDedupForTests(); });

    it('geçerli istek: 204 döner, recordErrorEvent source:"client" ile çağrılır, tenantId SUNUCUDAN (principal.tid)', () => {
        const req = fakeReq({ level: 'error', msg: 'bir şey patladı', errName: 'TypeError' });
        const res = fakeRes({ sub: 'user-1', tid: 42 });
        handleClientLog(req, res);
        expect(res.statusCode).toBe(204);
        expect(recordErrorEvent).toHaveBeenCalledWith(expect.objectContaining({ source: 'client', tenantId: 42, code: 'TypeError', corrId: 'req-server-1' }));
    });

    it('istemcinin gövdesindeki sahte "tenantId"/context sunucudaki principal\'i EZEMEZ (yalnızca res.locals.principal.tid kullanılır)', () => {
        const req = fakeReq({ level: 'error', msg: 'x', context: { tenantId: 999 } });
        const res = fakeRes({ sub: 'u', tid: 7 });
        handleClientLog(req, res);
        expect(recordErrorEvent).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 7 }));
    });

    it('8 KB üstü gövde 413 ile reddedilir; recordErrorEvent ÇAĞRILMAZ', () => {
        const req = fakeReq({ level: 'error', msg: 'x'.repeat(CLIENT_LOG_MAX_BODY_BYTES + 1) });
        const res = fakeRes({ sub: 'u', tid: 1 });
        handleClientLog(req, res);
        expect(res.statusCode).toBe(413);
        expect(recordErrorEvent).not.toHaveBeenCalled();
    });

    it('geçersiz gövde 400 ile reddedilir', () => {
        const req = fakeReq({ level: 'info', msg: 'x' });
        const res = fakeRes({ sub: 'u', tid: 1 });
        handleClientLog(req, res);
        expect(res.statusCode).toBe(400);
        expect(recordErrorEvent).not.toHaveBeenCalled();
    });

    it('mesajdaki e-posta/Bearer token REDAKTE edilir (ikinci savunma hattı)', () => {
        const req = fakeReq({ level: 'error', msg: 'kullanici@ornek.com Bearer abcdef123456 hata verdi' });
        const res = fakeRes({ sub: 'u', tid: 1 });
        handleClientLog(req, res);
        const arg = recordErrorEvent.mock.calls[0][0] as any;
        expect(arg.message).not.toContain('kullanici@ornek.com');
        expect(arg.message).not.toContain('abcdef123456');
    });

    it('aynı parmak izi AYNI oturumda İKİNCİ kez recordErrorEvent\'i TETİKLEMEZ (204 yine döner)', () => {
        const res1 = fakeRes({ sub: 'u1', tid: 1 });
        handleClientLog(fakeReq({ level: 'error', msg: 'tekrar eden hata' }), res1);
        const res2 = fakeRes({ sub: 'u1', tid: 1 });
        handleClientLog(fakeReq({ level: 'error', msg: 'tekrar eden hata' }), res2);
        expect(recordErrorEvent).toHaveBeenCalledTimes(1);
        expect(res2.statusCode).toBe(204);
    });

    it('AYNI fp FARKLI oturumda (farklı sub) YİNE kaydedilir', () => {
        handleClientLog(fakeReq({ level: 'error', msg: 'ortak hata' }), fakeRes({ sub: 'u1', tid: 1 }));
        handleClientLog(fakeReq({ level: 'error', msg: 'ortak hata' }), fakeRes({ sub: 'u2', tid: 1 }));
        expect(recordErrorEvent).toHaveBeenCalledTimes(2);
    });
});

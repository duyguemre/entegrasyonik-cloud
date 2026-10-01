import { describe, it, expect, jest } from '@jest/globals';
import bodyParser from 'body-parser';
import { errorHandler, notFoundHandler } from '../../../src/api/http/errorEnvelope';
import { sendError } from '../../../src/api/rpc/ApiManager';
import { AppError } from '../../../src/platform/core/errors';

// [ADR-0030 X5] JSON 404 + son hata işleyici (soket açmadan, sahte req/res): zarf `{ error, code, requestId }`, 500'de sızıntı yok.
function fakeRes(headersSent = false) {
    const out: any = { statusCode: 0, body: undefined, headersSent };
    out.getHeader = (n: string) => (n.toLowerCase() === 'x-request-id' ? 'req-123' : undefined);
    out.status = (c: number) => { out.statusCode = c; return out; };
    out.send = (b: any) => { out.body = b; return out; };
    return out;
}
const run = (err: any, res = fakeRes()) => { const next = jest.fn(); errorHandler(err, { method: 'GET' } as any, res, next as any); return { res, next }; };

describe('son hata işleyici + JSON 404', () => {
    it('bilinmeyen yol: 404 NOT_FOUND + requestId', () => {
        const res = fakeRes();
        notFoundHandler({} as any, res, jest.fn() as any);
        expect(res.statusCode).toBe(404);
        expect(res.body).toMatchObject({ code: 'NOT_FOUND', requestId: 'req-123' });
        expect(typeof res.body.error).toBe('string');
    });
    it('gerçek body-parser: bozuk JSON -> 400 VALIDATION, iç ileti yansımaz', async () => {
        const req: any = new (require('stream').Readable)({ read() { this.push('{bad'); this.push(null); } });
        req.headers = { 'content-type': 'application/json', 'content-length': '4' };
        req.method = 'POST'; req.body = undefined;
        const err: any = await new Promise((resolve) => bodyParser.json()(req, fakeRes() as any, resolve as any));
        expect(err?.status).toBe(400);
        const { res } = run(err);
        expect(res.statusCode).toBe(400);
        expect(res.body).toMatchObject({ code: 'VALIDATION', requestId: 'req-123' });
        expect(JSON.stringify(res.body)).not.toMatch(/SyntaxError|Unexpected|\{bad/);
    });
    it('gövde tavanı aşımı: 413 PAYLOAD_TOO_LARGE', () => {
        const { res } = run(Object.assign(new Error('request entity too large'), { status: 413, type: 'entity.too.large' }));
        expect(res.statusCode).toBe(413);
        expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
    });
    it('beklenmeyen hata: 500 INTERNAL, iç ileti/yığın sızmaz', () => {
        const { res } = run(new Error('SECRET internal detail mongodb://user:pw@host'));
        expect(res.statusCode).toBe(500);
        expect(res.body).toMatchObject({ code: 'INTERNAL', requestId: 'req-123' });
        expect(JSON.stringify(res.body)).not.toMatch(/SECRET|mongodb|stack|\.ts/);
    });
    it('AppError.of: kod ve ileti aynen döner', () => {
        const { res } = run(AppError.of('CONFLICT'));
        expect(res.statusCode).toBe(409);
        expect(res.body.code).toBe('CONFLICT');
    });
    it('yanıt başlamışsa Express varsayılanına devreder', () => {
        const err = new Error('x');
        const { next } = run(err, fakeRes(true));
        expect(next).toHaveBeenCalledWith(err);
    });
    it('sendError: AppError.of kodu yanıtta görünür', () => {
        const res = fakeRes();
        sendError({ params: { service: 'S', operation: 'o' } } as any, res, AppError.of('CONFLICT'));
        expect(res.statusCode).toBe(409);
        expect(res.body.code).toBe('CONFLICT');
    });
});

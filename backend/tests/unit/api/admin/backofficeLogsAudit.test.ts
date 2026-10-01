// ADR-0026 WP-LOG L2: BackofficeLog/Error/Audit servisleri -- girdi semasi, kademe, 400 VALIDATION esleme, kesme, tek-kayit hassas okuma denetimi. DB/Redis YOK (sahte modeller).
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { BACKOFFICE_RPC_INPUT } from '../../../../src/capabilities/rpc-input/backoffice';
import { getRequiredTier } from '../../../../src/api/rpc/operationPolicy';
import { truncateLogEntry } from '../../../../src/api/rpc/handlers/backoffice-support';
import { AuditLogger } from '../../../../src/services/audit/AuditLogger';

let audits: any[];
beforeEach(() => { audits = []; AuditLogger.setSink(async (r: any) => { audits.push(r); }); });
const settle = () => new Promise(r => setTimeout(r, 5));

const RPCS = [
    'BackofficeLogService/list', 'BackofficeLogService/issueGroups', 'BackofficeLogService/issueTrend', 'BackofficeLogService/trace',
    'BackofficeLogService/volume', 'BackofficeErrorService/setStatus', 'BackofficeAuditService/list',
];

describe('yetenek kaydi + sema', () => {
    it('tum uclar platformAdmin kademeli ve semali', () => {
        for (const rpc of RPCS) {
            const [s, o] = rpc.split('/');
            expect(getRequiredTier(s, o)).toBe('platformAdmin');
            expect(BACKOFFICE_RPC_INPUT[rpc as any]).toBeDefined();
        }
    });
    it('bilinmeyen alan / operator nesnesi / sayfa>200 reddedilir', () => {
        const s = BACKOFFICE_RPC_INPUT['BackofficeLogService/list']!;
        expect(s.safeParse({ tenantId: 5, level: ['error'] }).success).toBe(true);
        expect(s.safeParse({ evil: 1 }).success).toBe(false);
        expect(s.safeParse({ correlationId: { $ne: 1 } }).success).toBe(false);
        expect(s.safeParse({ limit: 201 }).success).toBe(false);
        expect(BACKOFFICE_RPC_INPUT['BackofficeErrorService/setStatus']!.safeParse({ fingerprint: 'a', status: 'ignored' }).success).toBe(false);
        expect(BACKOFFICE_RPC_INPUT['BackofficeAuditService/list']!.safeParse({ event: 'app.write', imp: true, result: 'ok' }).success).toBe(true);
    });
});

describe('truncateLogEntry', () => {
    it('msg ve buyuk ctx 2 KB ile kesilir, kucuk ctx dokunulmaz', () => {
        const big: any = truncateLogEntry({ msg: 'x'.repeat(5000), ctx: { a: 'y'.repeat(5000) } });
        expect(big.msg.length).toBe(2048);
        expect(big.ctx._truncated).toBe(true);
        expect(big.ctx.preview.length).toBe(2048);
        expect(truncateLogEntry({ msg: 'k', ctx: { a: 1 } })).toEqual({ msg: 'k', ctx: { a: 1 } });
    });
});

class LQE extends Error { constructor(m: string) { super(m); this.name = 'LogQueryError'; } }

function loadLog(logs: any) {
    let Svc: any;
    jest.isolateModules(() => {
        jest.doMock('@platform/runtime/logs', () => ({ ...logs, LogQueryError: LQE }));
        Svc = require('../../../../src/api/rpc/handlers/backoffice-log-service').default;
        // izole kayit defterindeki AuditLogger ornegine sink baglanir
        require('../../../../src/services/audit/AuditLogger').AuditLogger.setSink(async (r: any) => { audits.push(r); });
    });
    return Svc;
}

describe('BackofficeLogService', () => {
    it('list: L1 cagrilir, kesme uygulanir, imlec doner, sayfa basina TEK sensitive_read (filtre ozetiyle)', async () => {
        const listLogs = jest.fn(async (..._a: any[]) => ({ items: [{ _id: 'a', msg: 'm'.repeat(3000), tenantId: 7 }], nextCursor: 'CUR' }));
        const Svc = loadLog({ listLogs });
        const svc = new Svc(undefined, { tenantId: 7, level: ['error'], from: '2026-09-01T00:00:00Z', cursor: 'c1', principal: { sub: 'adm' }, requestMeta: { ip: '1.1.1.1' } });
        const out = await svc.list();
        expect(out.nextCursor).toBe('CUR');
        expect(out.items[0].msg.length).toBe(2048);
        expect(listLogs.mock.calls[0][0]).toMatchObject({ tenantId: 7, level: ['error'] });
        expect(listLogs.mock.calls[0][1]).toBe('c1');
        await settle();
        expect(audits).toHaveLength(1);
        expect(audits[0]).toMatchObject({ event: 'backoffice.sensitive_read', sub: 'adm', surface: 'backoffice', meta: { service: 'BackofficeLogService', operation: 'list', rows: 1, f_tenantId: 7, f_level: 'error' } });
        expect(JSON.stringify(audits[0])).not.toContain('c1');
    });
    it('LogQueryError -> 400 VALIDATION; agregat uclar denetim yazmaz', async () => {
        const Svc = loadLog({
            listLogs: jest.fn(async () => { throw new LQE('imleç geçersiz'); }),
            getIssueGroups: jest.fn(async () => [{ fp: 'f', sampleMessage: 'z'.repeat(4000) }]),
            getVolumeByCategory: jest.fn(async () => []), getIssueTrend: jest.fn(async () => []), getTrace: jest.fn(async () => []),
        });
        await expect(new Svc(undefined, { cursor: 'x' }).list()).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION' });
        const g = await new Svc(undefined, {}).issueGroups();
        expect(g.items[0].sampleMessage.length).toBe(2048);
        await new Svc(undefined, {}).volume();
        await new Svc(undefined, { fingerprint: 'f' }).issueTrend();
        await settle();
        expect(audits).toHaveLength(0);
    });
});

describe('BackofficeAuditService', () => {
    function svcWith(rows: any[], request: any) {
        const Svc = require('../../../../src/api/rpc/handlers/backoffice-audit-service').default;
        const s = new Svc(undefined, request);
        s.applicationDB = { getAuditLogModel: () => ({ find: (q: any) => { s.q = q; const c: any = { sort: () => c, limit: (n: number) => { s.n = n; return c; }, maxTimeMS: () => c, lean: async () => rows }; return c; } }) };
        return s;
    }
    const iso = (d: number) => new Date(Date.UTC(2026, 8, d)).toISOString();
    it('aralik >31 gun -> 400; gecersiz imlec -> 400', async () => {
        await expect(svcWith([], { from: iso(1), to: '2026-11-15T00:00:00Z' }).list()).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION' });
        await expect(svcWith([], { from: iso(1), to: iso(2), cursor: 'zzz' }).list()).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION' });
    });
    it('filtreler sorguya, imlec (at,_id) keyset olarak yansir; limit+1 okunur; meta yeniden sanitize edilir; tek denetim', async () => {
        const rows = [
            { _id: '64b000000000000000000003', at: new Date('2026-09-10T10:00:00Z'), event: 'app.write', result: 'ok', sub: 'u1', tid: 5, reqId: 'r1', imp: true, meta: { service: 'X', a_stock: 3, token: 'SECRET' } },
            { _id: '64b000000000000000000002', at: new Date('2026-09-10T09:00:00Z'), event: 'app.write', result: 'ok', sub: 'u1', tid: 5 },
        ];
        const s = svcWith(rows, { from: iso(1), to: iso(20), tid: 5, event: 'app.write', actor: 'u1', imp: true, result: 'ok', service: 'X', operation: 'y', limit: 1, principal: { sub: 'adm' } });
        const out = await s.list();
        expect(s.n).toBe(2);
        expect(s.q).toMatchObject({ tid: 5, event: 'app.write', sub: 'u1', imp: true, result: 'ok', 'meta.service': 'X', 'meta.operation': 'y' });
        expect(out.items).toHaveLength(1);
        expect(out.items[0].meta).toEqual({ service: 'X', a_stock: 3 });
        expect(out.nextCursor).toBeTruthy();
        const s2 = svcWith([], { from: iso(1), to: iso(20), cursor: out.nextCursor });
        const out2 = await s2.list();
        expect(s2.q.$and[1].$or[1]._id.$lt.toString()).toBe('64b000000000000000000003');
        expect(out2.nextCursor).toBeNull();
        await settle();
        expect(audits).toHaveLength(2);
        expect(audits[0].meta).toMatchObject({ service: 'BackofficeAuditService', operation: 'list', f_tid: 5, f_event: 'app.write' });
    });
});

describe('BackofficeErrorService.setStatus', () => {
    it('durumu gunceller; yoksa 404', async () => {
        const Svc = require('../../../../src/api/rpc/handlers/backoffice-error-service').default;
        const s = new Svc(undefined, { fingerprint: 'fp1', status: 'resolved' });
        let upd: any;
        s.applicationDB = { getErrorEventModel: () => ({ updateOne: (f: any, u: any) => { upd = [f, u]; return { maxTimeMS: async () => ({ matchedCount: 1 }) }; } }) };
        expect(await s.setStatus()).toEqual({ fingerprint: 'fp1', status: 'resolved' });
        expect(upd).toEqual([{ fp: 'fp1' }, { $set: { status: 'resolved' } }]);
        s.applicationDB = { getErrorEventModel: () => ({ updateOne: () => ({ maxTimeMS: async () => ({ matchedCount: 0 }) }) }) };
        await expect(s.setStatus()).rejects.toMatchObject({ statusCode: 404 });
    });
});

// ADR-0029 NB6: StreamHub -- suzme, heartbeat, Last-Event-ID tamponu/resync, tavan, yeniden dogrulama, kapanis, PII.
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { StreamHub, LocalRealtimeBus, type StreamSink } from '@platform/runtime/realtime';

class FakeSink implements StreamSink {
    out: string[] = []; ended = false;
    write(c: string) { this.out.push(c); }
    end() { this.ended = true; }
    get text() { return this.out.join(''); }
    events(name: string) { return this.text.split('\n\n').filter((b) => b.includes(`event: ${name}\n`)); }
}

const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
const ev = (tid: number, userIds: string[], id = 'E1', category = 'security', severity = 'warning') =>
    ({ tid, userIds, kind: 'notification' as const, id, meta: { category, severity } });

function make(over: Partial<ConstructorParameters<typeof StreamHub>[0]> = {}) {
    const bus = new LocalRealtimeBus();
    const inc = jest.fn();
    const hub = new StreamHub({ bus, unreadCount: async () => 7, inc, ...over });
    return { bus, hub, inc };
}
const open = (hub: StreamHub, tid: number, userId: string, extra: Record<string, unknown> = {}) => {
    const sink = new FakeSink();
    const r = hub.accept({ tid, userId, tv: 0, imp: false, sink, ...extra } as any);
    return { sink, r };
};

describe('StreamHub', () => {
    beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(1_700_000_000_000); });
    afterEach(() => { jest.useRealTimers(); });

    it('retry onerisi ve baglanti yorumu ile acilir', () => {
        const { hub } = make();
        const { sink } = open(hub, 1, 'u1');
        expect(sink.text).toContain('retry: 5000');
        expect(sink.text).toContain(': connected');
    });

    it('yalniz kendi tenant+kullanici kanalindaki olayi alir; baska tenant/kullanici almaz', async () => {
        const { hub, bus } = make();
        const a = open(hub, 1, 'u1'); const sameTenantOther = open(hub, 1, 'u2'); const otherTenant = open(hub, 2, 'u1');
        await bus.publish(ev(1, ['u1']));
        await flush();
        expect(a.sink.events('notification')).toHaveLength(1);
        expect(sameTenantOther.sink.events('notification')).toHaveLength(0);
        expect(otherTenant.sink.events('notification')).toHaveLength(0);
    });

    it('yuk yalniz {id,category,severity,unreadCount}; PII/baslik/metin/alici listesi sizmaz; id: monoton', async () => {
        const { hub, bus } = make();
        const a = open(hub, 1, 'u1');
        await bus.publish({ ...ev(1, ['u1', 'u9'], 'E7'), title: 'Gizli baslik', body: 'ali@example.com', email: 'x@y.z' } as any);
        await bus.publish(ev(1, ['u1'], 'E8'));
        await flush();
        const blocks = a.sink.events('notification');
        expect(blocks).toHaveLength(2);
        const data = JSON.parse(blocks[0].split('\n').find((l) => l.startsWith('data: '))!.slice(6));
        expect(data).toEqual({ id: 'E7', category: 'security', severity: 'warning', unreadCount: 7 });
        expect(a.sink.text).not.toMatch(/Gizli|ali@|x@y|u9/);
        const ids = blocks.map((b) => Number(/^id: (\d+)/m.exec(b)![1]));
        expect(ids[1]).toBeGreaterThan(ids[0]);
    });

    it('sayim alinamazsa unreadCount null (baglanti dusmez)', async () => {
        const { hub, bus } = make({ unreadCount: async () => { throw new Error('db'); } });
        const a = open(hub, 1, 'u1');
        await bus.publish(ev(1, ['u1']));
        await flush();
        expect(a.sink.events('notification')[0]).toContain('"unreadCount":null');
    });

    it('25 sn heartbeat yorum satiri yazar', () => {
        const { hub } = make();
        const { sink } = open(hub, 1, 'u1');
        const before = sink.out.length;
        jest.advanceTimersByTime(25_000);
        expect(sink.out.length).toBe(before + 1);
        expect(sink.out[before]).toMatch(/^: ping/);
    });

    it('Last-Event-ID: tampondaki kacirilanlar tekrar gonderilir', async () => {
        const { hub, bus } = make();
        const first = open(hub, 1, 'u1');
        jest.advanceTimersByTime(10);
        await bus.publish(ev(1, ['u1'], 'E1'));
        await flush();
        const lastId = /^id: (\d+)/m.exec(first.sink.events('notification')[0])![1];
        first.r.ok && first.r.conn.close('client_closed');
        jest.advanceTimersByTime(10);
        await bus.publish(ev(1, ['u1'], 'E2'));
        await bus.publish(ev(1, ['u2'], 'E3')); // baska kullanici: tekrarlanmaz
        await flush();
        const again = open(hub, 1, 'u1', { lastEventId: lastId });
        await flush();
        const got = again.sink.events('notification');
        expect(got).toHaveLength(1);
        expect(got[0]).toContain('"id":"E2"');
        expect(again.sink.events('resync')).toHaveLength(0);
    });

    it('Last-Event-ID tampon suresinden eskiyse / bilinmeyense / sunucudan once ise resync', async () => {
        const { hub } = make();
        const old = open(hub, 1, 'u1', { lastEventId: String(1_700_000_000_000 - 10 * 60_000) });
        await flush();
        expect(old.sink.events('resync')).toHaveLength(1);
        const junk = open(hub, 1, 'u1', { lastEventId: 'abc' });
        await flush();
        expect(junk.sink.events('resync')).toHaveLength(1);
        expect(junk.sink.text).not.toContain('event: notification');
    });

    it('tampon tavani asilinca resync (kaybolan olay sessizce atlanmaz)', async () => {
        const { hub, bus } = make({ bufferMax: 2 });
        const a = open(hub, 1, 'u1');
        jest.advanceTimersByTime(5);
        const startId = String(Date.now());
        for (const id of ['A', 'B', 'C']) { jest.advanceTimersByTime(2); await bus.publish(ev(1, ['u1'], id)); }
        await flush();
        a.r.ok && a.r.conn.close('client_closed');
        const again = open(hub, 1, 'u1', { lastEventId: startId });
        await flush();
        expect(again.sink.events('resync')).toHaveLength(1);
    });

    it('kullanici basina baglanti tavani: asan reddedilir + dusurulen sayaci', () => {
        const { hub, inc } = make({ maxPerUser: 2 });
        expect(open(hub, 1, 'u1').r.ok).toBe(true);
        expect(open(hub, 1, 'u1').r.ok).toBe(true);
        const third = open(hub, 1, 'u1').r;
        expect(third).toEqual({ ok: false, reason: 'user_cap' });
        expect(open(hub, 1, 'u2').r.ok).toBe(true); // baska kullanici etkilenmez
        expect(inc).toHaveBeenCalledWith('realtime_sse_connections_dropped', { reason: 'user_cap' });
        expect(hub.stats().dropped).toBe(1);
    });

    it('surec basina tavan', () => {
        const { hub } = make({ maxTotal: 2 });
        open(hub, 1, 'a'); open(hub, 1, 'b');
        expect(open(hub, 2, 'c').r).toEqual({ ok: false, reason: 'total_cap' });
    });

    it('kapanan baglanti tavandan duser; metrikler acik/kapali/gonderilen sayar', async () => {
        const { hub, bus, inc } = make({ maxPerUser: 1 });
        const a = open(hub, 1, 'u1');
        a.r.ok && a.r.conn.close('client_closed');
        expect(open(hub, 1, 'u1').r.ok).toBe(true);
        await bus.publish(ev(1, ['u1']));
        await flush();
        expect(inc).toHaveBeenCalledWith('realtime_sse_connections_opened', undefined);
        expect(inc).toHaveBeenCalledWith('realtime_sse_connections_closed', { reason: 'client_closed' });
        expect(inc).toHaveBeenCalledWith('realtime_sse_events_sent', undefined);
        expect(hub.stats().active).toBe(1);
    });

    it('tokenVersion degisince (yeniden dogrulama) 60 sn icinde baglanti kapanir', async () => {
        let valid = true;
        const revalidate = jest.fn(async () => valid);
        const { hub } = make({ revalidate });
        const a = open(hub, 1, 'u1', { tv: 3 });
        const b = open(hub, 1, 'u1', { tv: 3 });
        jest.advanceTimersByTime(60_000); await flush();
        expect(a.sink.ended).toBe(false);
        expect(revalidate).toHaveBeenCalledTimes(1); // ayni (sub,tid,tv) icin tek kontrol
        valid = false;
        jest.advanceTimersByTime(60_000); await flush();
        expect(a.sink.ended).toBe(true); expect(b.sink.ended).toBe(true);
        expect(a.sink.events('unauthorized')).toHaveLength(1);
        expect(hub.stats().active).toBe(0);
    });

    it('yeniden dogrulama hatasi baglantiyi dusurmez', async () => {
        const { hub } = make({ revalidate: async () => { throw new Error('db'); }, log: { warn: jest.fn() } });
        const a = open(hub, 1, 'u1');
        jest.advanceTimersByTime(60_000); await flush();
        expect(a.sink.ended).toBe(false);
    });

    it('closeUser kullanicinin tum baglantilarini kapatir', () => {
        const { hub } = make();
        const a = open(hub, 1, 'u1'); const b = open(hub, 1, 'u2');
        expect(hub.closeUser(1, 'u1')).toBe(1);
        expect(a.sink.ended).toBe(true); expect(b.sink.ended).toBe(false);
    });

    it('token suresi dolunca ve 30 dk omur sonunda kapanir', () => {
        const { hub } = make();
        const exp = open(hub, 1, 'u1', { expSec: Math.floor(Date.now() / 1000) + 30 });
        const life = open(hub, 1, 'u2');
        jest.advanceTimersByTime(50_000);
        expect(exp.sink.ended).toBe(true);
        jest.advanceTimersByTime(30 * 60_000);
        expect(life.sink.ended).toBe(true);
        expect(life.sink.events('reconnect')).toHaveLength(1);
    });

    it('kapanista tum baglantilara event: shutdown + kapat; sonrasi kabul yok', async () => {
        const { hub } = make();
        const a = open(hub, 1, 'u1'); const b = open(hub, 2, 'u2');
        await hub.close();
        for (const s of [a.sink, b.sink]) { expect(s.events('shutdown')).toHaveLength(1); expect(s.ended).toBe(true); }
        expect(open(hub, 1, 'u1').r).toEqual({ ok: false, reason: 'closed' });
    });

    it('yazma hatasi baglantiyi temizler', () => {
        const { hub } = make();
        const sink = { write: () => { throw new Error('EPIPE'); }, end: jest.fn() };
        hub.accept({ tid: 1, userId: 'u1', tv: 0, imp: false, sink } as any);
        expect(hub.stats().active).toBe(0);
    });

    it('impersonation baglantisi olay alir, sayim 0 istenir', async () => {
        const unreadCount = jest.fn(async (_t: number, _u: string, imp: boolean) => (imp ? 0 : 5));
        const { hub, bus } = make({ unreadCount });
        const a = open(hub, 1, 'admin', { imp: true });
        await bus.publish(ev(1, ['admin']));
        await flush();
        expect(a.sink.events('notification')[0]).toContain('"unreadCount":0');
    });
});

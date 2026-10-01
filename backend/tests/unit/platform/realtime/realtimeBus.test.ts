// ADR-0029 NB6: RealtimeBus -- yerel, redis adaptoru (sahte ioredis), kurulum/dusus.
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { LocalRealtimeBus, RedisRealtimeBus, createRealtimeBus, channelOf } from '@platform/runtime/realtime';

class FakeRedis {
    handlers: Array<(c: string, m: string) => void> = [];
    subscribed = new Set<string>(); published: Array<[string, string]> = []; failPublish = false; quit = jest.fn(async () => 'OK');
    on(_e: 'message', cb: (c: string, m: string) => void) { this.handlers.push(cb); }
    async subscribe(...ch: string[]) { ch.forEach((c) => this.subscribed.add(c)); }
    async unsubscribe(...ch: string[]) { ch.forEach((c) => this.subscribed.delete(c)); }
    async publish(c: string, m: string) {
        if (this.failPublish) throw new Error('down');
        this.published.push([c, m]);
        if (this.subscribed.has(c)) this.handlers.forEach((h) => h(c, m));
        return 1;
    }
}
const evt = (tid: number, extra: Record<string, unknown> = {}) => ({ tid, userIds: ['u1'], kind: 'notification' as const, id: 'E', meta: { category: 'c', severity: 's' }, ...extra });

describe('LocalRealtimeBus', () => {
    it('yalniz abone tenant kanalina teslim eder; abonelik kapatilir', async () => {
        const bus = new LocalRealtimeBus(); const h1 = jest.fn(); const h2 = jest.fn();
        const off = bus.subscribe(1, h1); bus.subscribe(2, h2);
        await bus.publish(evt(1));
        expect(h1).toHaveBeenCalledTimes(1); expect(h2).not.toHaveBeenCalled();
        off(); await bus.publish(evt(1));
        expect(h1).toHaveBeenCalledTimes(1);
    });
    it('bir abonenin hatasi digerlerini etkilemez, publish firlatmaz', async () => {
        const bus = new LocalRealtimeBus(); const ok = jest.fn();
        bus.subscribe(1, () => { throw new Error('x'); }); bus.subscribe(1, ok);
        await expect(bus.publish(evt(1))).resolves.toBeUndefined();
        expect(ok).toHaveBeenCalled();
    });
});

describe('RedisRealtimeBus', () => {
    const log = { warn: jest.fn() };
    it('rt:tid:{tid} kanalina publish/subscribe (sahte ioredis)', async () => {
        const pub = new FakeRedis(); const sub = pub; const h = jest.fn();
        const bus = new RedisRealtimeBus(pub, sub, log);
        bus.subscribe(5, h);
        await bus.publish(evt(5));
        expect(pub.published[0][0]).toBe(channelOf(5));
        expect(channelOf(5)).toBe('rt:tid:5');
        expect(h).toHaveBeenCalledTimes(1);
        expect(h.mock.calls[0][0]).toMatchObject({ tid: 5, id: 'E', userIds: ['u1'] });
    });
    it('son abone ayrilinca Redis aboneligi birakilir; ilk abonelik bir kez', () => {
        const r = new FakeRedis(); const sub = jest.spyOn(r, 'subscribe');
        const bus = new RedisRealtimeBus(r, r, log);
        const o1 = bus.subscribe(5, jest.fn()); const o2 = bus.subscribe(5, jest.fn());
        expect(sub).toHaveBeenCalledTimes(1);
        o1(); expect(r.subscribed.has('rt:tid:5')).toBe(true);
        o2(); expect(r.subscribed.has('rt:tid:5')).toBe(false);
    });
    it('yuk PII icermez: ek alanlar kanala yazilmaz', async () => {
        const r = new FakeRedis(); const bus = new RedisRealtimeBus(r, r, log);
        await bus.publish(evt(5, { title: 'Gizli', email: 'a@b.c' }));
        expect(r.published[0][1]).not.toMatch(/Gizli|a@b/);
    });
    it('kanal ile yuk tenant uyusmazsa ve bozuk yuk yok sayilir', () => {
        const r = new FakeRedis(); const h = jest.fn();
        const bus = new RedisRealtimeBus(r, r, log); bus.subscribe(5, h);
        r.handlers.forEach((f) => { f('rt:tid:5', JSON.stringify(evt(6))); f('rt:tid:5', 'not json'); f('other', '{}'); });
        expect(h).not.toHaveBeenCalled();
    });
    it('Redis publish hatasinda firlatmaz, yerel teslimata duser', async () => {
        const r = new FakeRedis(); r.failPublish = true; const h = jest.fn();
        const bus = new RedisRealtimeBus(r, r, log); bus.subscribe(5, h);
        await expect(bus.publish(evt(5))).resolves.toBeUndefined();
        expect(h).toHaveBeenCalledTimes(1); expect(log.warn).toHaveBeenCalled();
    });
    it('close baglantilari kapatir; sonra publish etkisiz', async () => {
        const r = new FakeRedis(); const bus = new RedisRealtimeBus(r, r, log);
        await bus.close(); await bus.publish(evt(5));
        expect(r.quit).toHaveBeenCalled(); expect(r.published).toHaveLength(0);
    });
});

describe('createRealtimeBus', () => {
    it('varsayilan yerel', () => { expect(createRealtimeBus(undefined).kind).toBe('local'); });
    it('redis modu + baglanti -> redis', () => {
        const r = new FakeRedis();
        expect(createRealtimeBus('redis', () => ({ pub: r, sub: r })).kind).toBe('redis');
    });
    it('redis modu ama Redis yok/hata -> yerel (firlatmaz)', () => {
        expect(createRealtimeBus('redis', () => undefined).kind).toBe('local');
        expect(createRealtimeBus('redis', () => { throw new Error('no redis'); }).kind).toBe('local');
        expect(createRealtimeBus('redis').kind).toBe('local');
    });
});

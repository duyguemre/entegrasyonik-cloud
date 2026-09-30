// Redis pub/sub adaptoru. `pub`/`sub` AYRI baglantilardir (abone modundaki ioredis komut calistiramaz); bilesim kokunde
// `RedisService.getInstance().duplicate()` ile uretilip enjekte edilir. Publish hatasi yerel teslimata duser (asla firlatmaz).
import { LocalRealtimeBus } from './localBus';
import { parseRealtimeEvent, serializeRealtimeEvent, type RealtimeBus, type RealtimeEvent, type RealtimeHandler } from './RealtimeBus';

export interface RedisPubLike { publish(channel: string, message: string): Promise<unknown> | unknown; quit?(): Promise<unknown> | unknown }
export interface RedisSubLike {
    subscribe(...channels: string[]): Promise<unknown> | unknown;
    unsubscribe(...channels: string[]): Promise<unknown> | unknown;
    on(event: 'message', cb: (channel: string, message: string) => void): unknown;
    quit?(): Promise<unknown> | unknown;
}
export interface BusLog { warn(obj: Record<string, unknown>, msg: string): void }

export const channelOf = (tid: number) => `rt:tid:${tid}`;

export class RedisRealtimeBus implements RealtimeBus {
    readonly kind = 'redis' as const;
    private local = new LocalRealtimeBus();
    private refs = new Map<number, number>();
    private closed = false;

    constructor(private pub: RedisPubLike, private sub: RedisSubLike, private log: BusLog) {
        sub.on('message', (channel, message) => {
            const m = /^rt:tid:(\d+)$/.exec(channel);
            if (!m) return;
            const tid = Number(m[1]);
            const evt = parseRealtimeEvent(message, tid); // kanal ile yuk tenant'i uyusmali
            if (evt) this.local.deliver(evt);
        });
    }

    async publish(evt: RealtimeEvent): Promise<void> {
        if (this.closed) return;
        try { await this.pub.publish(channelOf(evt.tid), serializeRealtimeEvent(evt)); }
        catch (e) {
            this.log.warn({ err: { message: (e as Error)?.message } }, 'realtime redis publish basarisiz; yerel teslimat');
            this.local.deliver(evt);
        }
    }

    subscribe(tid: number, handler: RealtimeHandler): () => void {
        const unsubLocal = this.local.subscribe(tid, handler);
        const n = this.refs.get(tid) ?? 0;
        if (n === 0) this.safe(() => this.sub.subscribe(channelOf(tid)), 'subscribe');
        this.refs.set(tid, n + 1);
        let done = false;
        return () => {
            if (done) return; done = true;
            unsubLocal();
            const left = (this.refs.get(tid) ?? 1) - 1;
            if (left <= 0) { this.refs.delete(tid); if (!this.closed) this.safe(() => this.sub.unsubscribe(channelOf(tid)), 'unsubscribe'); }
            else this.refs.set(tid, left);
        };
    }

    private safe(fn: () => unknown, what: string) {
        const warn = (e: unknown) => this.log.warn({ err: { message: (e as Error)?.message } }, `realtime redis ${what} basarisiz`);
        try { const r = fn(); if (r && typeof (r as Promise<unknown>).catch === 'function') (r as Promise<unknown>).catch(warn); }
        catch (e) { warn(e); }
    }

    async close(): Promise<void> {
        this.closed = true;
        await this.local.close();
        for (const c of [this.sub, this.pub]) { try { await c.quit?.(); } catch { /* kapanista yut */ } }
    }
}

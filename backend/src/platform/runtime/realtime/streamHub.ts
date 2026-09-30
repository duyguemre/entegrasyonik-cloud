// ADR-0029 Karar 6 (NB6): SSE baglanti kaydi + halka tamponu. Express'ten BAGIMSIZ (sink arayuzu): sira, tavan, suzme,
// Last-Event-ID, heartbeat, yeniden dogrulama ve kapanis gercek HTTP/DB/Redis olmadan test edilir.
//
// Kural: bir olay YALNIZ (tid, userId) eslesen baglantilara yazilir (suzme sunucuda). Yuk = {id, category, severity, unreadCount}
// -- baslik/metin/PII YOK. `id:` alani surec-ici monoton (zaman tabanli); coklu pod'da yaklasik zaman sirali oldugundan
// baska pod'dan gelen Last-Event-ID, o pod'un kapsama baslangicindan eskiyse `resync` ile karsilanir.
import type { RealtimeBus, RealtimeEvent } from './RealtimeBus';

export interface StreamSink { write(chunk: string): void; end(): void }

export interface StreamConnection {
    readonly id: number;
    readonly tid: number;
    readonly userId: string;
    readonly tv: number;
    readonly imp: boolean;
    close(reason: string, notice?: string): void;
}

export interface StreamHubStats { active: number; opened: number; closed: number; sent: number; dropped: number; tenants: number }

export interface StreamHubOptions {
    bus: RealtimeBus;
    /** Kullanicinin okunmamis sayisi; bilinemezse null (istemci RPC ile tazeler). Asla yalniz-hatadan dolayi baglantiyi dusurmez. */
    unreadCount(tid: number, userId: string, imp: boolean): Promise<number | null>;
    /** Oturum hala gecerli mi (tokenVersion/hesap/tenant). Firlatirsa baglanti korunur (sonraki turda tekrar denenir). */
    revalidate?(c: { sub: string; tid: number; tv: number }): Promise<boolean>;
    inc?(metric: string, labels?: Record<string, string>): void;
    log?: { warn(obj: Record<string, unknown>, msg: string): void };
    now?(): number;
    heartbeatMs?: number;
    revalidateMs?: number;
    maxLifetimeMs?: number;
    maxPerUser?: number;
    maxTotal?: number;
    bufferMax?: number;
    bufferTtlMs?: number;
    retryMs?: number;
}

export type AcceptResult = { ok: true; conn: StreamConnection } | { ok: false; reason: 'user_cap' | 'total_cap' | 'closed' };

interface Entry { id: number; eventId: string; category: string; severity: string }
interface UserBuf { events: Entry[]; floor: number }
interface Conn extends StreamConnection {
    sub: string; sink: StreamSink; openedAt: number; expMs?: number; queue: Promise<void>; dead: boolean;
}
interface TenantState { unsub: () => void; since: number; conns: number; linger?: ReturnType<typeof setTimeout> }

const evt = (id: number, name: string, data: unknown) => `id: ${id}\nevent: ${name}\ndata: ${JSON.stringify(data)}\n\n`;

export class StreamHub {
    private readonly o: Required<Pick<StreamHubOptions, 'heartbeatMs' | 'revalidateMs' | 'maxLifetimeMs' | 'maxPerUser' | 'maxTotal' | 'bufferMax' | 'bufferTtlMs' | 'retryMs'>>;
    private readonly now: () => number;
    private seq = 0;
    private nextConnId = 1;
    private conns = new Set<Conn>();
    private byUser = new Map<string, Set<Conn>>(); // `${tid}:${userId}`
    private tenants = new Map<number, TenantState>();
    private bufs = new Map<string, UserBuf>();
    private hb?: ReturnType<typeof setInterval>;
    private rv?: ReturnType<typeof setInterval>;
    private closedAll = false;
    private counts = { opened: 0, closed: 0, sent: 0, dropped: 0 };

    constructor(private opts: StreamHubOptions) {
        this.now = opts.now ?? Date.now;
        this.o = {
            heartbeatMs: opts.heartbeatMs ?? 25_000, revalidateMs: opts.revalidateMs ?? 60_000,
            maxLifetimeMs: opts.maxLifetimeMs ?? 30 * 60_000, maxPerUser: opts.maxPerUser ?? 5, maxTotal: opts.maxTotal ?? 2000,
            bufferMax: opts.bufferMax ?? 100, bufferTtlMs: opts.bufferTtlMs ?? 5 * 60_000, retryMs: opts.retryMs ?? 5000,
        };
    }

    stats(): StreamHubStats { return { active: this.conns.size, ...this.counts, tenants: this.tenants.size }; }

    private nextId(): number { this.seq = Math.max(this.seq + 1, this.now()); return this.seq; }
    private key = (tid: number, userId: string) => `${tid}:${userId}`;
    private inc(metric: string, labels?: Record<string, string>) { try { this.opts.inc?.(metric, labels); } catch { /* metrik akisi bozmaz */ } }

    accept(p: { tid: number; userId: string; sub?: string; tv: number; imp: boolean; expSec?: number; lastEventId?: string; sink: StreamSink }): AcceptResult {
        if (this.closedAll) return { ok: false, reason: 'closed' };
        const k = this.key(p.tid, p.userId);
        if (this.conns.size >= this.o.maxTotal) return this.drop('total_cap');
        if ((this.byUser.get(k)?.size ?? 0) >= this.o.maxPerUser) return this.drop('user_cap');

        const t = this.tenantFor(p.tid);
        t.conns++;
        if (t.linger) { clearTimeout(t.linger); t.linger = undefined; }

        const conn: Conn = {
            id: this.nextConnId++, sub: p.sub ?? p.userId, tid: p.tid, userId: p.userId, tv: p.tv, imp: p.imp, sink: p.sink,
            openedAt: this.now(), expMs: p.expSec ? p.expSec * 1000 : undefined, queue: Promise.resolve(), dead: false,
            close: (reason, notice) => this.closeConn(conn, reason, notice),
        };
        this.conns.add(conn);
        let set = this.byUser.get(k); if (!set) { set = new Set(); this.byUser.set(k, set); }
        set.add(conn);
        this.counts.opened++; this.inc('realtime_sse_connections_opened');
        this.ensureTimers();

        this.raw(conn, `retry: ${this.o.retryMs}\n: connected\n\n`);
        if (p.lastEventId !== undefined && p.lastEventId !== '') this.replay(conn, t, p.lastEventId);
        return { ok: true, conn };
    }

    private drop(reason: 'user_cap' | 'total_cap'): AcceptResult {
        this.counts.dropped++; this.inc('realtime_sse_connections_dropped', { reason });
        return { ok: false, reason };
    }

    private tenantFor(tid: number): TenantState {
        let t = this.tenants.get(tid);
        if (!t) {
            t = { unsub: () => undefined, since: this.nextId(), conns: 0 };
            this.tenants.set(tid, t);
            t.unsub = this.opts.bus.subscribe(tid, (e) => this.onBusEvent(e));
        }
        return t;
    }

    private onBusEvent(e: RealtimeEvent): void {
        if (this.closedAll) return;
        const id = this.nextId();
        const entry: Entry = { id, eventId: e.id, category: e.meta.category, severity: e.meta.severity };
        for (const userId of new Set(e.userIds)) {
            this.push(this.key(e.tid, userId), entry);
            const set = this.byUser.get(this.key(e.tid, userId));
            if (set) for (const c of set) this.enqueue(c, async () => this.sendEntries(c, [entry]));
        }
    }

    private push(k: string, entry: Entry): void {
        let b = this.bufs.get(k); if (!b) { b = { events: [], floor: 0 }; this.bufs.set(k, b); }
        this.prune(b);
        b.events.push(entry);
        while (b.events.length > this.o.bufferMax) { const ev = b.events.shift()!; b.floor = Math.max(b.floor, ev.id); }
    }

    private prune(b: UserBuf): void {
        const cutoff = this.now() - this.o.bufferTtlMs;
        while (b.events.length && b.events[0].id < cutoff) { const ev = b.events.shift()!; b.floor = Math.max(b.floor, ev.id); }
    }

    private replay(conn: Conn, t: TenantState, lastEventId: string): void {
        const last = /^\d{1,16}$/.test(lastEventId) ? Number(lastEventId) : NaN;
        const b = this.bufs.get(this.key(conn.tid, conn.userId));
        if (b) this.prune(b);
        const stale = Number.isNaN(last) || last > this.now() + 60_000 || last < t.since || last < this.now() - this.o.bufferTtlMs || (b ? last < b.floor : false);
        if (stale) {
            this.enqueue(conn, async () => { this.raw(conn, evt(this.nextId(), 'resync', {})); });
            return;
        }
        const missed = b ? b.events.filter((x) => x.id > last) : [];
        if (missed.length) this.enqueue(conn, async () => this.sendEntries(conn, missed));
    }

    /** Baglanti basina sirali yazim (sayim sorgusu gec donen olay, sonrakini gecemez). */
    private enqueue(c: Conn, fn: () => Promise<void>): void {
        c.queue = c.queue.then(() => (c.dead ? undefined : fn())).catch(() => undefined);
    }

    private async sendEntries(c: Conn, entries: Entry[]): Promise<void> {
        let unread: number | null = null;
        try { unread = await this.opts.unreadCount(c.tid, c.userId, c.imp); } catch { unread = null; }
        if (c.dead) return;
        for (const en of entries) {
            this.raw(c, evt(en.id, 'notification', { id: en.eventId, category: en.category, severity: en.severity, unreadCount: unread }));
            this.counts.sent++; this.inc('realtime_sse_events_sent');
        }
    }

    private raw(c: Conn, chunk: string): void {
        if (c.dead) return;
        try { c.sink.write(chunk); } catch { this.closeConn(c, 'write_error'); }
    }

    private closeConn(c: Conn, reason: string, notice?: string): void {
        if (c.dead) return;
        c.dead = true;
        if (notice) { try { c.sink.write(`event: ${notice}\ndata: ${JSON.stringify({ reason })}\n\n`); } catch { /* baglanti zaten kopmus */ } }
        try { c.sink.end(); } catch { /* yut */ }
        this.conns.delete(c);
        const k = this.key(c.tid, c.userId);
        const set = this.byUser.get(k);
        if (set) { set.delete(c); if (!set.size) this.byUser.delete(k); }
        this.counts.closed++; this.inc('realtime_sse_connections_closed', { reason });
        const t = this.tenants.get(c.tid);
        if (t && --t.conns <= 0 && !this.closedAll) {
            // Kapsama, tampon suresi boyunca surer: kisa kopma sonrasi Last-Event-ID ile kaybedilen olaylar tekrar verilebilir.
            t.linger = setTimeout(() => this.dropTenant(c.tid), this.o.bufferTtlMs);
            (t.linger as { unref?: () => void }).unref?.();
        }
        if (!this.conns.size) this.stopTimers();
    }

    private dropTenant(tid: number): void {
        const t = this.tenants.get(tid);
        if (!t || t.conns > 0) return;
        t.unsub(); this.tenants.delete(tid);
        const prefix = `${tid}:`;
        for (const k of [...this.bufs.keys()]) if (k.startsWith(prefix)) this.bufs.delete(k);
    }

    /** Bir kullanicinin tum baglantilarini kapatir (iptal/askiya alma yollari cagirabilir). */
    closeUser(tid: number, userId: string, reason = 'revoked'): number {
        const set = this.byUser.get(this.key(tid, userId));
        const list = set ? [...set] : [];
        for (const c of list) this.closeConn(c, reason, 'unauthorized');
        return list.length;
    }

    private ensureTimers(): void {
        if (!this.hb) { this.hb = setInterval(() => this.heartbeat(), this.o.heartbeatMs); (this.hb as { unref?: () => void }).unref?.(); }
        if (!this.rv) { this.rv = setInterval(() => { void this.revalidateAll(); }, this.o.revalidateMs); (this.rv as { unref?: () => void }).unref?.(); }
    }

    private stopTimers(): void {
        if (this.hb) { clearInterval(this.hb); this.hb = undefined; }
        if (this.rv) { clearInterval(this.rv); this.rv = undefined; }
    }

    private heartbeat(): void {
        const now = this.now();
        for (const c of [...this.conns]) {
            if (c.expMs !== undefined && c.expMs <= now) { this.closeConn(c, 'expired', 'unauthorized'); continue; }
            if (now - c.openedAt >= this.o.maxLifetimeMs) { this.closeConn(c, 'lifetime', 'reconnect'); continue; }
            this.raw(c, `: ping ${now}\n\n`);
        }
        for (const b of this.bufs.values()) this.prune(b);
    }

    /** Periyodik yeniden dogrulama: ayni (sub,tid,tv) icin tek kontrol. */
    async revalidateAll(): Promise<void> {
        const rv = this.opts.revalidate; if (!rv) return;
        const groups = new Map<string, Conn[]>();
        for (const c of this.conns) {
            const sub = c.sub;
            const k = `${sub}|${c.tid}|${c.tv}`; const g = groups.get(k); if (g) g.push(c); else groups.set(k, [c]);
        }
        for (const list of groups.values()) {
            const c0 = list[0];
            try {
                const ok = await rv({ sub: c0.sub, tid: c0.tid, tv: c0.tv });
                if (!ok) for (const c of list) this.closeConn(c, 'revoked', 'unauthorized');
            } catch (e) { this.opts.log?.warn({ err: { message: (e as Error)?.message } }, 'sse yeniden dogrulama basarisiz; baglanti korundu'); }
        }
    }

    /** Kapanis: tum baglantilara `event: shutdown` + kapat; abonelikler ve zamanlayicilar birakilir. */
    async close(): Promise<void> {
        this.closedAll = true;
        for (const c of [...this.conns]) this.closeConn(c, 'shutdown', 'shutdown');
        this.stopTimers();
        for (const t of this.tenants.values()) { if (t.linger) clearTimeout(t.linger); t.unsub(); }
        this.tenants.clear(); this.bufs.clear();
    }
}

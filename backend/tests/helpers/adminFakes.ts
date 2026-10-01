// `/admin-api` testleri icin bellek-ici sahteler (DB/Redis/ag YOK). Tek is parcacigi oldugundan "kosullu atomik" islemler
// gercek Mongo semantigiyle (bir kez yazilir) birebir davranir.
import bcrypt from 'bcrypt';
import type { AdminMfaStore } from '../../src/api/admin/adminMfaStore';
import type { AdminMfaRecord } from '../../src/api/admin/adminMfaTypes';
import type { AdminDeps } from '../../src/api/admin/adminDeps';
import type { TicketRedis } from '../../src/api/admin/impersonationTicket';

export class Clock {
    constructor(public t: number = Date.UTC(2026, 8, 30, 10, 0, 0)) { }
    now = () => this.t;
    advance(ms: number) { this.t += ms; }
}

export function makeUser(over: Record<string, any> = {}): any {
    return {
        _id: over._id ?? 'a1b2c3d4e5f6a7b8c9d0e1f2',
        email: 'admin@example.test', name: 'Ada', surname: 'Yonetici',
        password: bcrypt.hashSync('S3cret-Pass!', 4),
        isGlobalAdmin: true, owner: false, isActive: true, tokenVersion: 0, failedLoginAttempts: 0,
        ...over,
    };
}

export class FakeUserModel {
    constructor(public users: any[]) { }
    private find(pred: (u: any) => boolean) { return this.users.find(pred); }
    async findOne(q: any) { const u = this.find(x => (q.email !== undefined ? x.email === q.email : String(x._id) === String(q._id))); return u ? { ...u } : null; }
    findById(id: string) {
        const u = this.find(x => String(x._id) === String(id));
        const value = u ? { ...u } : null;
        return { lean: async () => value };
    }
    async updateOne(q: any, update: any) {
        const u = this.find(x => String(x._id) === String(q._id));
        if (!u) return { modifiedCount: 0 };
        for (const [k, v] of Object.entries(update.$set ?? {})) u[k] = v;
        for (const k of Object.keys(update.$unset ?? {})) delete u[k];
        for (const [k, v] of Object.entries(update.$inc ?? {})) u[k] = (u[k] ?? 0) + (v as number);
        return { modifiedCount: 1 };
    }
}

export class FakeClientModel {
    constructor(public clients: any[]) { }
    findOne(q: any) {
        const c = this.clients.find(x => x.order === q.order);
        return { lean: async () => (c ? { ...c } : null) };
    }
}

export class InMemoryMfaStore implements AdminMfaStore {
    recs = new Map<string, AdminMfaRecord>();
    async get(sub: string) { const r = this.recs.get(sub); return r ? structuredClone(r) : null; }
    async setPending(sub: string, enc: string) {
        const r = this.recs.get(sub);
        if (r?.enabledAt) return false;
        this.recs.set(sub, { ...(r ?? { sub }), pendingSecret: enc });
        return true;
    }
    async activate(sub: string, enc: string, step: number, hashes: string[]) {
        const r = this.recs.get(sub);
        if (!r || r.enabledAt || r.pendingSecret !== enc) return false;
        this.recs.set(sub, { sub, secret: enc, enabledAt: new Date(), lastStep: step, failedAttempts: 0, recoveryHashes: hashes.map(hash => ({ hash })) });
        return true;
    }
    async claimStep(sub: string, step: number) {
        const r = this.recs.get(sub);
        if (!r || (r.lastStep !== undefined && r.lastStep >= step)) return false;
        r.lastStep = step;
        return true;
    }
    async consumeRecovery(sub: string, hash: string, at: Date) {
        const e = this.recs.get(sub)?.recoveryHashes?.find(h => h.hash === hash && !h.usedAt);
        if (!e) return false;
        e.usedAt = at;
        return true;
    }
    async recordFailure(sub: string, max: number, lockMs: number, now: Date) {
        const r = this.recs.get(sub)!;
        r.failedAttempts = (r.failedAttempts ?? 0) + 1;
        if (r.failedAttempts >= max) { r.lockUntil = new Date(now.getTime() + lockMs); const attempts = r.failedAttempts; r.failedAttempts = 0; return { attempts, locked: true }; }
        return { attempts: r.failedAttempts, locked: false };
    }
    async clearFailures(sub: string) { const r = this.recs.get(sub); if (r) { r.failedAttempts = 0; delete r.lockUntil; } }
    async reset(sub: string) { this.recs.delete(sub); }
}

/** Redis alt kumesi: set NX EX + getdel; TTL sahte saatle. */
export class FakeRedis implements TicketRedis {
    kv = new Map<string, { v: string; exp: number }>();
    constructor(private clock: Clock) { }
    async set(key: string, value: string, _ex: 'EX', seconds: number, _nx: 'NX') {
        const cur = this.kv.get(key);
        if (cur && cur.exp > this.clock.now()) return null;
        this.kv.set(key, { v: value, exp: this.clock.now() + seconds * 1000 });
        return 'OK' as const;
    }
    async getdel(key: string) {
        const cur = this.kv.get(key);
        this.kv.delete(key);
        return cur && cur.exp > this.clock.now() ? cur.v : null;
    }
}

export function makeDeps(opts: { users?: any[]; clients?: any[]; clock?: Clock; redis?: TicketRedis | undefined | null } = {}) {
    const clock = opts.clock ?? new Clock();
    const users = new FakeUserModel(opts.users ?? [makeUser()]);
    const clients = new FakeClientModel(opts.clients ?? [{ order: 5, clientId: 'c5', title: 'Magaza', status: 'ACTIVE' }]);
    const mfaStore = new InMemoryMfaStore();
    const revoked = new Map<string, number>();
    const redis = opts.redis === null ? undefined : (opts.redis ?? new FakeRedis(clock));
    const deps: AdminDeps = {
        getApplicationDB: async () => ({ getUserModel: () => users, getClientModel: () => clients }),
        mfaStore,
        redis: () => redis,
        revocation: { revoke: async (jti, ttl) => { revoked.set(jti, clock.now() + ttl * 1000); }, isRevoked: async (jti) => (revoked.get(jti) ?? 0) > clock.now() },
        now: clock.now,
    };
    return { deps, clock, users, clients, mfaStore, redis, revoked };
}

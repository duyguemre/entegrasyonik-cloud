// [ADR-0030 X3] `Idempotency-Key` korumalı yürütme. Tek süreç, Redis YOK: tenant DB `IdempotencyKeys` (TTL 24 sa).
//  - observe (varsayılan): davranış DEĞİŞMEZ. Anahtar varsa kayıt tutulur; tekrar/yeniden kullanım/eşzamanlılık TESPİT edilirse
//    yalnız metrik + log yazılır, işlem yine çalışır. Depo hatası yutulur.
//  - enforce: aynı anahtar+aynı gövde -> önceki yanıt (servis çağrılmaz); aynı anahtar+farklı gövde -> 422 IDEMPOTENCY_KEY_REUSED;
//    süren aynı anahtar -> 409 IDEMPOTENCY_IN_PROGRESS. Anahtarsız istek her iki kipte bugünkü gibi çalışır.
// Hata ile biten işlemin kaydı SİLİNİR (aynı anahtarla yeniden denenebilir).
import crypto from 'crypto';
import { ApplicationError } from '@platform/core/errors/ApplicationError';
import { eventLog } from '@platform/core/logger';
import { metricsRegistry } from '@platform/runtime/metrics/MetricsRegistry';

const log = eventLog('api', 'idempotency');

export const IDEMPOTENCY_TTL_MS = 24 * 3600 * 1000;
/** Süren ("in_progress") kaydın bu süreden sonra takılı sayılıp devralınabildiği eşik (süreç çökmesi). */
export const IDEMPOTENCY_STALE_MS = 5 * 60 * 1000;
export const IDEMPOTENCY_MAX_RESPONSE_BYTES = 64 * 1024;
const KEY_RE = /^[A-Za-z0-9._:-]{8,128}$/;

export type IdempotencyMode = 'observe' | 'enforce';

export function isValidIdempotencyKey(key: unknown): key is string {
    return typeof key === 'string' && KEY_RE.test(key);
}

function stable(v: any): any {
    if (Array.isArray(v)) return v.map(stable);
    if (v && typeof v === 'object' && !(v instanceof Date)) {
        const o: Record<string, any> = {};
        for (const k of Object.keys(v).sort()) if (v[k] !== undefined) o[k] = stable(v[k]);
        return o;
    }
    return v;
}
export function hashBody(body: unknown): string {
    return crypto.createHash('sha256').update(JSON.stringify(stable(body ?? {}))).digest('hex');
}

/** Mongoose Model alt kümesi (test/mocklama kolaylığı). */
export interface IdempotencyStore {
    create(doc: any): Promise<any>;
    findOne(q: any): any;
    findOneAndUpdate(q: any, u: any, o?: any): any;
    deleteOne(q: any): Promise<any>;
    updateOne(q: any, u: any): Promise<any>;
}

export interface IdempotentCall<T> {
    store: IdempotencyStore;
    mode: IdempotencyMode;
    userId: string;
    operation: string;
    key: string;
    body: unknown;
    run: () => Promise<T>;
    now?: () => number;
}

type Detect = 'replay' | 'reused' | 'in_progress';
function detected(kind: Detect, operation: string, mode: IdempotencyMode): void {
    try {
        metricsRegistry.incCounter('idempotency_duplicate_detected', { op: operation, kind, mode });
        log.warn('IDEMPOTENCY_DUPLICATE', `Tekrarlanan Idempotency-Key (${kind}, ${mode}).`, { operation, kind, mode });
    } catch { /* gözlem asla akışı bozmaz */ }
}

const isDup = (e: any) => e && (e.code === 11000 || e.code === 11001);
const leanOf = async (q: any) => (q && typeof q.lean === 'function') ? await q.lean() : await q;

export async function runIdempotent<T>(c: IdempotentCall<T>): Promise<T> {
    const now = c.now ?? Date.now;
    const bodyHash = hashBody(c.body);
    const id = { userId: c.userId, operation: c.operation, key: c.key };
    const enforce = c.mode === 'enforce';
    let owned = false;

    try {
        const t = now();
        try {
            await c.store.create({ ...id, bodyHash, state: 'in_progress', startedAt: new Date(t), expAt: new Date(t + IDEMPOTENCY_TTL_MS) });
            owned = true;
        } catch (e: any) {
            if (!isDup(e)) throw e;
            const ex = await leanOf(c.store.findOne(id));
            if (ex) {
                const kind: Detect = ex.bodyHash !== bodyHash ? 'reused' : ex.state === 'done' ? 'replay' : 'in_progress';
                if (kind === 'in_progress' && enforce && now() - new Date(ex.startedAt).getTime() > IDEMPOTENCY_STALE_MS) {
                    // Takılı (çökmüş süreç) kayıt: atomik devral.
                    const took = await leanOf(c.store.findOneAndUpdate({ ...id, state: 'in_progress', startedAt: ex.startedAt }, { $set: { startedAt: new Date(now()) } }));
                    if (took) owned = true;
                }
                if (!owned) {
                    detected(kind, c.operation, c.mode);
                    if (enforce) {
                        if (kind === 'reused') throw new ApplicationError('Bu Idempotency-Key farklı bir istekle kullanılmış.', 422, 'IDEMPOTENCY_KEY_REUSED');
                        if (kind === 'in_progress') throw new ApplicationError('Aynı işlem zaten işleniyor.', 409, 'IDEMPOTENCY_IN_PROGRESS');
                        if (ex.response !== undefined) return ex.response as T;
                        // yanıt saklanamamıştı (oversize): koruma yok, normal çalış
                    }
                }
            }
        }
    } catch (e: any) {
        if (e instanceof ApplicationError) throw e;
        // Depo hatası isteği düşürmez (her iki kipte): koruma yok, mevcut davranış.
        try { log.warn('IDEMPOTENCY_STORE_ERROR', 'Idempotency deposu hatası; koruma atlandı.', { operation: c.operation, err: String(e?.message ?? e) }); } catch { /* */ }
        owned = false;
    }

    let result: T;
    try {
        result = await c.run();
    } catch (err) {
        if (owned) await Promise.resolve(c.store.deleteOne({ ...id, bodyHash, state: 'in_progress' })).catch(() => undefined);
        throw err;
    }
    if (owned) {
        try {
            const json = JSON.stringify(result ?? null);
            if (Buffer.byteLength(json) > IDEMPOTENCY_MAX_RESPONSE_BYTES) {
                await c.store.deleteOne(id);
            } else {
                await c.store.updateOne({ ...id, bodyHash }, { $set: { state: 'done', statusCode: 200, response: JSON.parse(json) } });
            }
        } catch { /* kayıt tamamlanamadı: TTL temizler; işlem sonucu etkilenmez */ }
    }
    return result;
}

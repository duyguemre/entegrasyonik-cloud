// [BO B8d] Yavaş sorgu ölçümü: mongoose eklentisi, eşiği (>200 ms) aşan sorgular için `db_slow_query_ms{db,collection,op}` histogramını
// MetricsRegistry'ye yazar (flush zaten MetricRollups'a taşır). SORGU DEĞERİ/FİLTRE/BELGE okunmaz ve yazılmaz -- yalnız koleksiyon adı, işlem adı,
// süre. `db` = 'app' | 'tenant' (tenant kimliği etiketi YOK; kardinalite). Profiler kullanılmaz. Asla fırlatmaz.
import type { Schema } from 'mongoose';
import { metricsRegistry } from './MetricsRegistry';

export const SLOW_QUERY_THRESHOLD_MS = 200;
export const SLOW_QUERY_METRIC = 'db_slow_query_ms';

const QUERY_OPS = ['find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany', 'countDocuments', 'estimatedDocumentCount', 'distinct'] as const;

let appDbName: string | undefined;
/** Uygulama DB'sinin adı (`db` etiketi 'app' ↔ 'tenant' ayrımı için); `Database.connect` çağırır. */
export function setSlowQueryAppDbName(name: string | undefined): void { appDbName = name; }

export function recordSlowQuery(dbName: string | undefined, collection: string | undefined, op: string, startedAt: number, now: number = Date.now()): void {
    try {
        const ms = now - startedAt;
        if (!(ms > SLOW_QUERY_THRESHOLD_MS)) return;
        metricsRegistry.observeHistogram(SLOW_QUERY_METRIC, {
            db: dbName && dbName === appDbName ? 'app' : 'tenant',
            collection: String(collection ?? 'unknown').slice(0, 60),
            op: String(op).slice(0, 30),
        }, ms);
    } catch { /* ölçüm ana akışı asla etkilemez */ }
}

export function slowQueryPlugin(schema: Schema): void {
    const start = new WeakMap<object, number>();
    schema.pre([...QUERY_OPS] as any, function (this: any) { start.set(this, Date.now()); });
    const done = function (this: any) {
        const t0 = start.get(this);
        if (t0 === undefined) return;
        start.delete(this);
        recordSlowQuery(this.model?.db?.name, this.model?.collection?.name, String(this.op ?? 'query'), t0);
    };
    schema.post([...QUERY_OPS] as any, function (this: any, _res: unknown, next: () => void) { done.call(this); next(); });
    schema.post([...QUERY_OPS] as any, function (this: any, err: unknown, _res: unknown, next: (e?: unknown) => void) { done.call(this); next(err); } as any);
    schema.pre('aggregate', function (this: any) { start.set(this, Date.now()); });
    schema.post('aggregate', function (this: any, _res: unknown, next: () => void) {
        const t0 = start.get(this);
        if (t0 !== undefined) { start.delete(this); recordSlowQuery(this._model?.db?.name, this._model?.collection?.name, 'aggregate', t0); }
        next();
    });
}

let installed = false;
/** Tüm şemalara (model derlenmeden ÖNCE çağrılmalı) bir kez eklenir. */
export function installSlowQueryPlugin(mongooseLike: { plugin: (fn: (s: Schema) => void) => unknown }): void {
    if (installed || typeof mongooseLike?.plugin !== 'function') return; // sahte mongoose (karakterizasyon testleri) ile yüklenirse sessizce atlanır
    installed = true;
    mongooseLike.plugin(slowQueryPlugin);
}

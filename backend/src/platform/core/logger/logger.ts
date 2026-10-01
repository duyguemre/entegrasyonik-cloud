// ADR-0017 Karar 1.1-1.5: pino tek modülde. Asenkron hedef (`sync:false`, K3'ün kök çözümü -- dosyaya yönlendirilmiş
// stdout'ta senkron `console.error` fırtınası olay döngüsünü durdurup ilgisiz isteklerde 1-10 sn gecikme üretiyordu).
// Alan sözleşmesi (Karar 1.2): time,level,msg,svc,role,pod,env,ver sabit (base) + reqId,tenantId,userSub bağlamdan
// (mixin) + `logger.child({module})` ile modül adı. Redaksiyon VARSAYILAN-RET (Karar 1.4). Taşkın denetimi (Karar 1.5).
import pino, { DestinationStream, Logger as PinoLogger } from 'pino';
import { config } from '@config';
import { getContext, RequestContext } from '@platform/core/context';
import { redactLogObject, maskLogText } from './redact';
import { FloodControl, fingerprintOf } from './floodControl';
import { computeFingerprint } from './fingerprint';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

function resolveLevel(): LogLevel {
    return (config.log.level ?? (config.isProduction ? 'info' : 'debug')) as LogLevel;
}

/**
 * pino'nun `err` anahtarı için DAİMA aktif bir yerleşik davranışı vardır (`serializers` hiç ayarlanmamış olsa bile):
 * değeri kendi standart Error serileştiricisiyle işler ve `type`'ı gerçek `Error` alt sınıfı DEĞİLSE `Object`'e
 * indirger (mesajı da üst seviye `msg`'e kopyalar). Bunu ATLATMAK ve alan sözleşmesini (Karar 1.2: `err{type,code,
 * message,stack}`) korumak için özel bir `err` serileştiricisi verilir: gerçek `Error`'lar doğru `type`/ek alanlarla
 * (ör. `IntegrationError.code`), önceden sanitize edilmiş düz nesneler (axios vb.) OLDUĞU GİBİ, redakte edilerek döner.
 */
/** `Error` -> düz, enumerable nesne (`type,message,stack` + alt sınıfın kendi alanları, ör. `IntegrationError.code`). Redaksiyon YOK (çağıran uygular). */
function errorToPlain(err: Error, depth = 0): Record<string, unknown> {
    const type = err.name || (err as any).constructor?.name || 'Error';
    const out: Record<string, unknown> = { type, message: err.message, stack: err.stack };
    for (const k of Object.keys(err)) if (!(k in out) && k !== 'cause') out[k] = (err as any)[k];
    // [MCP-5] `cause` (ES2022) non-enumerable'dır; zincir düzleştirilir ki mesaj/stack aynı maske hattından geçsin (derinlik sınırlı).
    const cause = (err as any).cause;
    if (cause !== undefined) {
        out.cause = cause instanceof Error ? (depth < 5 ? errorToPlain(cause, depth + 1) : '[cause truncated]') : cause;
    }
    return out;
}

function errSerializer(err: unknown): unknown {
    if (err instanceof Error) return redactLogObject(errorToPlain(err));
    return redactLogObject(err);
}

/**
 * `Object.entries` (genel redaksiyon yolu -- `redactForLog`) `Error` örneklerinin `message`/`stack`'ini
 * GÖRMEZ (V8'de non-enumerable own property) ve `{}`'e indirger. Bu yüzden nesnenin (yalnızca ÜST seviye
 * anahtarları -- ör. `{err: e}`, `{cause: e}`) İÇİNDEKİ `Error` değerleri, genel redaksiyondan ÖNCE düzleştirilir.
 */
function flattenNestedErrors<T extends Record<string, unknown>>(obj: T): T {
    let out: Record<string, unknown> | undefined;
    for (const [k, v] of Object.entries(obj)) {
        if (v instanceof Error) {
            if (!out) out = { ...obj };
            out[k] = errorToPlain(v);
        }
    }
    return (out as T) ?? obj;
}

/**
 * Jest altında (`JEST_WORKER_ID`) `process.stdout`'a DOĞRUDAN yazılır (`pino.destination`in `sonic-boom`
 * hedefi dosya tanıtıcısına düşük seviye `fs.write` ile yazar -- testlerin `process.stdout.write`'ı
 * yakalamasını/izole `isolateModules` başına çok sayıda açık tutamaç oluşmasını ENGELLEMEK için testte
 * kullanılmaz); üretim/geliştirmede DAİMA asenkron `pino.destination` (K3'ün kök çözümü).
 */
function createDestination(): DestinationStream {
    if (process.env.JEST_WORKER_ID) return process.stdout as unknown as DestinationStream;
    return pino.destination({ dest: 1, sync: false, minLength: 4096 });
}

function buildBase() {
    return {
        svc: 'entegrasyonik-api',
        role: config.role,
        pod: config.podName,
        env: config.appEnv,
        ver: config.version,
    };
}

let _destination: DestinationStream | undefined;
let _root: PinoLogger | undefined;
let _flood: FloodControl | undefined;

function root(): PinoLogger {
    if (_root) return _root;
    _destination = createDestination();
    _flood = new FloodControl((fp, suppressed) => {
        _root!.warn({ fp, suppressed }, `${suppressed} benzer hata bastırıldı`);
    });
    _root = pino({
        level: resolveLevel(),
        base: buildBase(),
        timestamp: pino.stdTimeFunctions.isoTime,
        mixin() {
            const ctx = getContext();
            if (!ctx) return {};
            // [F-06] LogEvents uyumu: ts + correlationId (= requestId; HTTP'de X-Request-Id, motor işlerinde iş başına id).
            // `reqId` geriye uyumluluk için AYNEN kalır.
            const out: Record<string, unknown> = { ts: new Date().toISOString(), reqId: ctx.requestId, correlationId: ctx.requestId };
            if (ctx.tenantId !== undefined) out.tenantId = ctx.tenantId;
            if (ctx.userSub !== undefined) out.userSub = ctx.userSub;
            if (ctx.route !== undefined) out.route = ctx.route;
            if (ctx.source !== undefined) out.source = ctx.source;
            if (ctx.integrationCode !== undefined) out.integrationCode = ctx.integrationCode;
            if (ctx.operation !== undefined) out.operation = ctx.operation;
            return out;
        },
        formatters: {
            // pino varsayılanı sayısal seviye basar (30,40,50...); makinece aranabilirlik için isim tercih edilir.
            level(label) { return { level: label }; },
        },
        // Karar 1.4: `err` anahtarı özel serileştirici ile (pino'nun kendi varsayılan `err` davranışının
        // `type`'ı bozmasının/mesajı üst seviyeye kopyalamasının ÖNÜNE geçer -- yukarıdaki `errSerializer` notu).
        serializers: { err: errSerializer },
        // Bilinen sır alanları + axios config/request tamamen atılır (redactLogObject `mergeArgs`'ta ÖNCEDEN
        // uygulanır); burada yalnızca dizin tabanlı ekstra bir güvenlik ağı (pino'nun kendi hızlı yol redaksiyonu).
        redact: { paths: ['*.password', '*.token', '*.secret', '*.apiKey', '*.authorization', 'headers.authorization', 'headers.cookie', 'config'], censor: '[REDACTED]' },
    }, _destination);
    return _root;
}

/** [F-06] Sunucuda ZORUNLU metin maskesi: `msg` ve biçim argümanları (token/parola/appkey/PII desenleri). */
function maskMsg(msg: string | undefined, rest: unknown[]): [string | undefined, unknown[]] {
    return [typeof msg === 'string' ? maskLogText(msg) : msg, rest.map((a) => (typeof a === 'string' ? maskLogText(a) : redactLogObject(a)))];
}

function mergeArgs(mergingObject: unknown, msg?: string, ...args: unknown[]): [Record<string, unknown> | undefined, string | undefined, unknown[]] {
    const [obj, m, rest] = mergeArgsRaw(mergingObject, msg, ...args);
    const [maskedMsg, maskedRest] = maskMsg(m, rest);
    return [obj, maskedMsg, maskedRest];
}

function mergeArgsRaw(mergingObject: unknown, msg?: string, ...args: unknown[]): [Record<string, unknown> | undefined, string | undefined, unknown[]] {
    if (mergingObject && typeof mergingObject === 'object' && !(mergingObject instanceof Error)) {
        const flattened = flattenNestedErrors(mergingObject as Record<string, unknown>);
        return [redactLogObject(flattened), msg, args];
    }
    if (mergingObject instanceof Error) {
        // Ham Error nesnesi AYNEN `err` anahtarına verilir -- redaksiyon ve alan şekli `errSerializer`'da (pino
        // `serializers.err`, yalnızca `err` anahtarı için çağrılır; iki kez redakte edilmez).
        return [{ err: mergingObject }, msg, args];
    }
    // ilk argüman string ise o `msg` olur (pino imza uyumu: logger.info('mesaj'))
    return [undefined, mergingObject as string | undefined, msg !== undefined ? [msg, ...args] : args];
}

/**
 * ADR-0017 Karar 2.4: hata olaylarının ("mini-Sentry", `platform/runtime/metrics/errorEvents.ts`) DB'ye
 * yazılması için bağımlılık TERSİNE çevrilmiş bir kanca (katman kuralı, ADR-0016 §1.2: `platform/core` Sv2,
 * yalnız Sv0-1'e bağımlı olabilir -- `platform/runtime/metrics` Sv5, buradan STATİK/DİNAMİK içe aktarılamaz).
 * Bootstrap katmanı (Sv10, `entegrasyonik.ts`) `setErrorHook` ile kancayı doldurur; bu dosya kancanın
 * UYGULAMASINI asla bilmez. Kayıtlı değilse (varsayılan) çağrı no-op'tur -- mevcut davranış BİREBİR korunur.
 */
export interface ErrorHookPayload {
    module?: string;
    code?: string;
    message: string;
    stack?: string;
    tenantId?: number;
    corrId?: string;
}
let errorHook: ((payload: ErrorHookPayload) => void) | undefined;

/** Yalnız bootstrap/test: hata-olayı kancasını kurar/kaldırır (`undefined` -> devre dışı). */
export function setErrorHook(hook: ((payload: ErrorHookPayload) => void) | undefined): void {
    errorHook = hook;
}

/**
 * ADR-0026 WP-LOG L1: kalici log deposu (LogEvents) için ters çevrilmiş SENKRON kanca (`setErrorHook` deseni; katman kuralı:
 * uygulama `platform/runtime/logs`ta, bootstrap kurar). Kayıt, zorunlu maskeden GEÇMİŞ alanlardır (`err` düz nesneye
 * serileştirilmiş). Sink SENKRON ve ucuz olmalı (kuyruğa it); ASLA fırlatmaz/beklemez. Kurulu değilse (varsayılan) tek `if`.
 */
export interface LogSinkRecord {
    level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
    msg?: string;
    fields: Record<string, unknown>;
    bindings: Record<string, unknown>;
    ctx?: RequestContext;
}
let logSink: ((rec: LogSinkRecord) => void) | undefined;

/** Yalnız bootstrap/test: kalıcı log kancasını kurar/kaldırır (`undefined` -> devre dışı, sıfır maliyet). */
export function setLogSink(sink: ((rec: LogSinkRecord) => void) | undefined): void {
    logSink = sink;
}

function emitToSink(p: PinoLogger, level: LogSinkRecord['level'], obj: Record<string, unknown> | undefined, msg: string | undefined, bindings: Record<string, unknown>): void {
    const sink = logSink;
    if (!sink || !p.isLevelEnabled(level)) return;
    try {
        const fields: Record<string, unknown> = { ...(obj ?? {}) };
        if ('err' in fields) fields.err = errSerializer(fields.err);
        sink({ level, msg, fields, bindings, ctx: getContext() });
    } catch { /* sink ASLA log akışını etkilemez */ }
}

export interface Logger {
    trace(mergingObjectOrMsg: unknown, msg?: string, ...args: unknown[]): void;
    debug(mergingObjectOrMsg: unknown, msg?: string, ...args: unknown[]): void;
    info(mergingObjectOrMsg: unknown, msg?: string, ...args: unknown[]): void;
    warn(mergingObjectOrMsg: unknown, msg?: string, ...args: unknown[]): void;
    /** Taşkın denetimli (Karar 1.5): aynı fp (module+err.code+mesaj şablonu) 60 sn'de bir kez TAM yazılır. */
    error(mergingObjectOrMsg: unknown, msg?: string, ...args: unknown[]): void;
    fatal(mergingObjectOrMsg: unknown, msg?: string, ...args: unknown[]): void;
    child(bindings: Record<string, unknown>): Logger;
    flush(): void;
}

function wrap(p: PinoLogger, module?: string, bindings: Record<string, unknown> = {}): Logger {
    const level = (fn: 'trace' | 'debug' | 'info' | 'warn' | 'fatal') => (mergingObjectOrMsg: unknown, msg?: string, ...args: unknown[]) => {
        const [obj, m, rest] = mergeArgs(mergingObjectOrMsg, msg, ...args);
        (p[fn] as any)(obj ?? {}, m, ...rest);
        if (logSink) emitToSink(p, fn, obj, m, bindings);
    };
    return {
        trace: level('trace'),
        debug: level('debug'),
        info: level('info'),
        warn: level('warn'),
        fatal: level('fatal'),
        error(mergingObjectOrMsg: unknown, msg?: string, ...args: unknown[]) {
            const [obj, m] = mergeArgs(mergingObjectOrMsg, msg, ...args);
            const errVal = (obj as any)?.err;
            // `err` henüz serileştirilmemiş olabilir (ham Error -- bkz. mergeArgs); fp için kod/mesaj/tip ham değerden okunur.
            const code = (obj as any)?.code ?? (errVal && typeof errVal === 'object' ? ((errVal as any).code ?? (errVal instanceof Error ? errVal.name : (errVal as any).type)) : undefined);
            const errMsg = errVal instanceof Error ? errVal.message : (errVal as any)?.message;
            const fp = fingerprintOf(module, code, m ?? errMsg ?? '');
            if (_flood!.admit(fp)) {
                const out = { ...(obj ?? {}), fp, fingerprint: (obj as any)?.fingerprint ?? computeFingerprint((obj as any)?.source ?? module, typeof code === 'string' ? code : undefined, m ?? errMsg ?? '') };
                p.error(out, m);
                if (logSink) emitToSink(p, 'error', out, m, bindings);
            }
            // ADR-0017 Karar 2.4: taşkın denetiminden BAĞIMSIZ (kendi 10 sn penceresi errorEvents.ts'te) --
            // pino çıktısı bastırılsa bile hata olayı DB'de sayılır. Kanca kurulu değilse (varsayılan) no-op.
            try {
                errorHook?.({
                    module, code, message: m ?? errMsg ?? '',
                    stack: errVal instanceof Error ? errVal.stack : undefined,
                    tenantId: getContext()?.tenantId,
                    corrId: getContext()?.requestId,
                });
            } catch { /* kanca ASLA log akışını etkilemez */ }
        },
        child(childBindings: Record<string, unknown>) {
            return wrap(p.child(childBindings), (childBindings.module as string) ?? module, { ...bindings, ...childBindings });
        },
        flush() {
            try { (p as any).flush?.(); } catch { /* pino sürümüne göre yoksayılır */ }
        },
    };
}

/** Kök logger (tembel; ilk çağrıda kurulur). `logger.child({module:'ApiManager'})` ile modül bağlamı eklenir. */
export const logger: Logger = new Proxy({} as Logger, {
    get(_t, prop) {
        const w = wrap(root());
        return (w as any)[prop];
    },
});

/** Yalnızca testler için: kök logger'ı ve taşkın denetimi durumunu sıfırlar. */
export function resetLoggerForTests(): void {
    _flood?.dispose();
    _flood = undefined;
    _root = undefined;
    _destination = undefined;
}

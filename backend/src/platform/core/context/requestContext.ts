// ADR-0017 Karar 1.6 / ADR-0016 §1.3: `AsyncLocalStorage` ile istek bağlamı (requestId, correlation, tenant/kullanıcı).
// Sv2 (`platform/core`): yalnız Sv0-1'e (interfaces/utils/config) bağımlı olabilir — burada hiçbir bağımlılık YOK
// (Node çekirdek `async_hooks` hariç), bilerek en alt seviyede tutulur.
import { AsyncLocalStorage } from 'async_hooks';
import * as crypto from 'crypto';

export interface RequestContext {
    /** İstek/iş/adaptör zinciri boyunca taşınan correlation id (HTTP: `X-Request-Id`; iş: `runId`; katalog: `ExportSignals.requestId`). */
    requestId: string;
    tenantId?: number;
    userSub?: string;
    /** Örn. "ProductService/get" (RPC) ya da "POST /api/AccountService/login" (özel rota). */
    route?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

/** Gelen `X-Request-Id` başlığı biçimi geçerliyse AYNEN kullanılır (istemcinin izini sürebilmesi için), aksi halde yeni üretilir. */
export function resolveRequestId(incoming: unknown): string {
    if (typeof incoming === 'string' && REQUEST_ID_RE.test(incoming)) return incoming;
    return crypto.randomUUID();
}

/** Yeni bir bağlamla `fn`'i çalıştırır (HTTP middleware'in giriş noktası). */
export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
    return storage.run(ctx, fn);
}

export function getContext(): RequestContext | undefined {
    return storage.getStore();
}

export function getRequestId(): string | undefined {
    return storage.getStore()?.requestId;
}

/** Mevcut bağlamı YERİNDE zenginleştirir (ör. authenticate sonrası tenantId/userSub, route eşleşince). Bağlam yoksa no-op. */
export function enrichContext(patch: Partial<Omit<RequestContext, 'requestId'>>): void {
    const ctx = storage.getStore();
    if (!ctx) return;
    Object.assign(ctx, patch);
}

/** Yalnız testler için: verilmiş bağlamla senkron bir bloğu çalıştırır. */
export function withTestContext<T>(ctx: Partial<RequestContext> & { requestId?: string }, fn: () => T): T {
    return storage.run({ requestId: ctx.requestId ?? 'test-' + crypto.randomUUID(), ...ctx }, fn);
}

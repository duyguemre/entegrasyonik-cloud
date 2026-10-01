// MCP-3: ince JSON-RPC 2.0 yardimcilari (yalniz bu adaptorun ihtiyaci: initialize, ping, tools/list, tools/call, bildirimler).
// Resmi SDK'ya BAGIMLILIK EKLENMEDI (ADR-0035 Maliyet notu + "overengineering yok"): durumsuz, tek uc, 4 metot; SDK transitif olarak express 5/hono/ajv/jose
// ceker ve bizim kimlik/oran/denetim hattimiz zaten `invokeCapability` + `authenticate` uzerinden. Surum riski `versions.ts` + testle sinirli.

export type JsonRpcId = string | number;

export interface JsonRpcRequest { jsonrpc: '2.0'; id?: JsonRpcId; method: string; params?: unknown }
export interface JsonRpcSuccess { jsonrpc: '2.0'; id: JsonRpcId; result: unknown }
export interface JsonRpcFailure { jsonrpc: '2.0'; id: JsonRpcId | null; error: { code: number; message: string; data?: unknown } }
export type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure;

export const RPC_ERROR = {
    PARSE: -32700, INVALID_REQUEST: -32600, METHOD_NOT_FOUND: -32601, INVALID_PARAMS: -32602, INTERNAL: -32603,
} as const;

export const rpcResult = (id: JsonRpcId, result: unknown): JsonRpcSuccess => ({ jsonrpc: '2.0', id, result });
export const rpcError = (id: JsonRpcId | null, code: number, message: string, data?: unknown): JsonRpcFailure => ({
    jsonrpc: '2.0', id, error: { code, message, ...(data !== undefined ? { data } : {}) },
});

const isId = (v: unknown): v is JsonRpcId => typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v));

export type ParsedMessage =
    | { kind: 'request'; msg: JsonRpcRequest & { id: JsonRpcId } }
    | { kind: 'notification'; msg: JsonRpcRequest }
    /** Istemcinin sunucu isteklerine yaniti (biz istek gondermeyiz; yok sayilir, 202). */
    | { kind: 'response' }
    | { kind: 'invalid'; id: JsonRpcId | null };

/** Tek JSON-RPC iletisi siniflandirma. Toplu (dizi) cagirana aittir (reddedilir). */
export function classify(raw: unknown): ParsedMessage {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { kind: 'invalid', id: null };
    const m = raw as Record<string, unknown>;
    const id = isId(m.id) ? m.id : undefined;
    if (m.jsonrpc !== '2.0') return { kind: 'invalid', id: id ?? null };
    if (typeof m.method !== 'string') {
        // yanit: `result` ya da `error` + id
        return id !== undefined && ('result' in m || 'error' in m) ? { kind: 'response' } : { kind: 'invalid', id: id ?? null };
    }
    if (m.method.length === 0 || m.method.length > 128) return { kind: 'invalid', id: id ?? null };
    if ('id' in m && id === undefined) return { kind: 'invalid', id: null }; // id var ama gecersiz tur
    const base = { jsonrpc: '2.0' as const, method: m.method, ...(m.params !== undefined ? { params: m.params } : {}) };
    return id === undefined ? { kind: 'notification', msg: base } : { kind: 'request', msg: { ...base, id } };
}

/** `tools/call` / `initialize` icin `params` nesne mi. */
export const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Metrik etiketi icin SINIRLI yontem kumesi (kullanici girdisi etikete girmez). */
export function methodLabel(method: string | undefined): 'initialize' | 'ping' | 'tools/list' | 'tools/call' | 'notification' | 'other' {
    switch (method) {
        case 'initialize': case 'ping': case 'tools/list': case 'tools/call': return method;
        default: return method?.startsWith('notifications/') ? 'notification' : 'other';
    }
}

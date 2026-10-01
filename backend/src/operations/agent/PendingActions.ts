// ADR-0034 Karar 4.4-4.5 / AGENT_BROKER_PLAN BR-2: ONAY BEKLEYEN EYLEM (PendingAction) deposu + "daha fazla" belirteci deposu. Redis (yoksa surec-ici bellek):
// Mongo koleksiyonu YOK, goc YOK. Yazma yetenekleri yalniz buradan gecen, kullanicinin onay tiklamasiyla `claim` edilen kayitla yurutulur.
//  - `agent:pa:{id}`      {userId, tid, conversationId, messageId, capId, version, inputHash, input, ...}  EX 300 (5 dk), TEK KULLANIMLIK (GETDEL).
//  - `agent:pa:res:{id}`  son olaylar ({userId, tid, state, events})  EX 600: ayni onayin tekrar gonderimi ikinci kez UYGULANMAZ, ayni sonuc yeniden akitilir.
//  - `agent:more:{token}` {capId, input, cursor, userId, tid, shown}  EX 600, tek kullanimlik (her sayfa yeni belirtec verir).
import { createHash, randomUUID } from 'crypto';
import type { AgentKv } from './kv';
import type { Locale, ServerEvent } from './protocol/v1';

export const PENDING_TTL_SEC = 300;
export const RESULT_TTL_SEC = 600;
export const MORE_TTL_SEC = 600;
/** MCP-4 (ADR-0035 Karar 5): bant disi onay ~10 dk gecerli; kayit ve sonuc 24 sa saklanir (sahibine "suresi doldu"/sonucu gostermek icin). */
export const MCP_PENDING_TTL_SEC = 600;
export const MCP_RESULT_TTL_SEC = 24 * 3600;

const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
export const isValidPendingId = (id: unknown): id is string => typeof id === 'string' && ID_RE.test(id);

export type PendingSurface = 'chat' | 'mcp';

/** Onay sayfasinin gosterecegi SUNUCU uretimi on izleme (model/istemci metni degil; duz metin). */
export interface ApprovalPreview { title: string; lines: string[]; count?: number; confirmLabel: string }

/** MCP'ye ozgu alanlar (`surface:'mcp'`). */
export interface McpPendingMeta { clientId: string; clientName: string; fam: string; preview: ApprovalPreview }

export interface PendingAction {
    id: string;
    userId: string;
    tid: number;
    conversationId: string;
    /** Onay kartinin bulundugu mesaj (confirm akisi `turn.start` gondermez; parcalar bu mesaja upsert edilir). */
    messageId: string;
    partId: string;
    surface: PendingSurface;
    /** Yalniz `surface:'mcp'`. */
    mcp?: McpPendingMeta;
    capId: string;
    version: string;
    /** `input`'un ozeti: yurutmede yeniden hesaplanip eslesmesi zorunludur (depo tahrifine karsi). */
    inputHash: string;
    input: unknown;
    confirmMode: 'confirm' | 'typed';
    typedPhrase?: string;
    /** Sunucu verisinden onay karti onizlemesi (ornek: fiyat onerisi once -> sonra). Girdiden turetilen ozetin yerine gecer. */
    changes?: Array<{ label: string; from?: string; to: string }>;
    locale: Locale;
    /** ms epoch; Redis TTL'inin yaninda saat denetimi (TTL sapmasi/saat farki). */
    expiresAt: number;
}

/** MCP sonucu (`ActionResult.mcp`): onay sayfasi + istemcinin yeniden cagrisinda donen saklanan sonuc. */
export interface McpOutcome {
    status: 'executed' | 'failed' | 'unknown_outcome' | 'rejected';
    summary?: string;
    code?: string;
    openIn?: { screen: string; params?: Record<string, string> };
    at: number;
}

export interface ActionResult {
    userId: string;
    tid: number;
    state: 'executing' | 'final';
    events: ServerEvent[];
    mcp?: McpOutcome;
}

/** Anahtar sirasi sabit JSON (ayni girdi -> ayni ozet). */
export function stableStringify(v: unknown): string {
    if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
    if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>;
        return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
    }
    return JSON.stringify(v) ?? 'null';
}

export function hashInput(input: unknown): string {
    return createHash('sha256').update(stableStringify(input)).digest('hex');
}

const parse = <T>(raw: string | null): T | null => {
    if (!raw) return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
};

export type NewPendingAction = Omit<PendingAction, 'id' | 'inputHash' | 'expiresAt' | 'surface'>;

export class PendingActions {
    constructor(protected readonly kv: AgentKv, protected readonly now: () => number = Date.now) { }

    async create(p: NewPendingAction): Promise<PendingAction> {
        const pa: PendingAction = { ...p, id: randomUUID(), surface: 'chat', inputHash: hashInput(p.input), expiresAt: this.now() + PENDING_TTL_SEC * 1000 };
        await this.kv.set(`agent:pa:${pa.id}`, JSON.stringify(pa), PENDING_TTL_SEC);
        return pa;
    }

    /** Tuketmeden okur (sahiplik/esleme denetimi icin). */
    async peek(id: string): Promise<PendingAction | null> {
        if (!isValidPendingId(id)) return null;
        return parse<PendingAction>(await this.kv.get(`agent:pa:${id}`));
    }

    /** ATOMIK tuketim (GETDEL): es zamanli iki onaydan yalniz biri kaydi alir. */
    async claim(id: string): Promise<PendingAction | null> {
        if (!isValidPendingId(id)) return null;
        return parse<PendingAction>(await this.kv.getDel(`agent:pa:${id}`));
    }

    async saveResult(id: string, rec: ActionResult, ttlSec: number = RESULT_TTL_SEC): Promise<void> {
        await this.kv.set(`agent:pa:res:${id}`, JSON.stringify(rec), ttlSec);
    }

    async loadResult(id: string): Promise<ActionResult | null> {
        if (!isValidPendingId(id)) return null;
        return parse<ActionResult>(await this.kv.get(`agent:pa:res:${id}`));
    }
}

// ---- MCP (ADR-0035 Karar 5): AYNI depo/anahtar uzayi (`agent:pa:*`), farklar yalniz omur + eslesme + dizin --------------------------------
export interface NewMcpPendingAction {
    userId: string;
    tid: number;
    capId: string;
    version: string;
    input: unknown;
    confirmMode: 'confirm' | 'typed';
    mcp: McpPendingMeta;
}

/** Eslesme anahtari `(userId, fam, capId, inputHash)` -> pendingActionId (model ayni cagriyi tekrarlarsa AYNI kayit). */
const ddKey = (userId: string, fam: string, capId: string, inputHash: string): string =>
    `agent:pa:dd:${createHash('sha256').update(`${userId}
${fam}
${capId}
${inputHash}`).digest('hex')}`;
const idxKey = (tid: number, userId: string): string => `agent:pa:idx:${tid}:${userId}`;

export class McpPendingActions extends PendingActions {
    /**
     * Kayit olusturur; es zamanli iki ayni cagridan YALNIZ biri yazar (eslesme anahtari SET NX). Kaybeden mevcut kaydin kimligini doner (`created:false`).
     * Kayit 24 sa tutulur; gecerlilik `expiresAt` (10 dk) ile denetlenir.
     */
    async createMcp(p: NewMcpPendingAction): Promise<{ id: string; created: boolean; pa?: PendingAction }> {
        const inputHash = hashInput(p.input);
        const id = randomUUID();
        const won = await this.kv.setNx(ddKey(p.userId, p.mcp.fam, p.capId, inputHash), id, MCP_PENDING_TTL_SEC);
        if (!won) {
            const existing = await this.findMcpId(p.userId, p.mcp.fam, p.capId, inputHash);
            if (existing) return { id: existing, created: false };
            // Anahtar arada dustu (nadir): bir kez daha dene.
            if (!(await this.kv.setNx(ddKey(p.userId, p.mcp.fam, p.capId, inputHash), id, MCP_PENDING_TTL_SEC))) {
                const again = await this.findMcpId(p.userId, p.mcp.fam, p.capId, inputHash);
                if (again) return { id: again, created: false };
            }
        }
        const pa: PendingAction = {
            id, userId: p.userId, tid: p.tid, conversationId: `mcp:${p.mcp.fam}`.slice(0, 80), messageId: 'mcp', partId: 'mcp', surface: 'mcp', mcp: p.mcp,
            capId: p.capId, version: p.version, inputHash, input: p.input, confirmMode: p.confirmMode, locale: 'tr', expiresAt: this.now() + MCP_PENDING_TTL_SEC * 1000,
        };
        await this.kv.set(`agent:pa:${id}`, JSON.stringify(pa), MCP_RESULT_TTL_SEC);
        await this.kv.sadd(idxKey(p.tid, p.userId), id, MCP_RESULT_TTL_SEC);
        return { id, created: true, pa };
    }

    async findMcpId(userId: string, fam: string, capId: string, inputHash: string): Promise<string | null> {
        return this.kv.get(ddKey(userId, fam, capId, inputHash));
    }

    /** Sonuc kaydedildi: eslesme anahtari sonucun 24 sa'lik omrune uzatilir (executed/rejected/unknown tekrar cagrida saklanan sonucu verir). */
    async keepDedupe(userId: string, fam: string, capId: string, inputHash: string, id: string): Promise<void> {
        await this.kv.set(ddKey(userId, fam, capId, inputHash), id, MCP_RESULT_TTL_SEC);
    }

    async dropDedupe(userId: string, fam: string, capId: string, inputHash: string): Promise<void> {
        await this.kv.del(ddKey(userId, fam, capId, inputHash));
    }

    /** Kullanicinin (tenant icinde) kayit kimlikleri; olu uyeleri `prune` ile temizlemek cagiranin isidir. */
    async listIds(tid: number, userId: string): Promise<string[]> {
        return this.kv.smembers(idxKey(tid, userId));
    }

    async prune(tid: number, userId: string, id: string): Promise<void> {
        await this.kv.srem(idxKey(tid, userId), id);
    }
}

export interface MoreRecord {
    capId: string;
    input: unknown;
    cursor: string;
    userId: string;
    tid: number;
    /** Simdiye kadar gosterilen toplam satir (toplam <= 500 siniri). */
    shown: number;
}

export class MoreStore {
    constructor(private readonly kv: AgentKv) { }

    async create(rec: MoreRecord): Promise<string> {
        const token = randomUUID();
        await this.kv.set(`agent:more:${token}`, JSON.stringify(rec), MORE_TTL_SEC);
        return token;
    }

    async peek(token: string): Promise<MoreRecord | null> {
        if (!isValidPendingId(token)) return null;
        return parse<MoreRecord>(await this.kv.get(`agent:more:${token}`));
    }

    async claim(token: string): Promise<MoreRecord | null> {
        if (!isValidPendingId(token)) return null;
        return parse<MoreRecord>(await this.kv.getDel(`agent:more:${token}`));
    }
}

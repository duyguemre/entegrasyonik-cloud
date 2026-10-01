// ADR-0034 Karar 9 / AGENT_BROKER_PLAN BR-5 (K37/K38): tenant BYOK LLM saglayici ayarlari + KVKK aktarim onayi.
// Depo: tenant DB `Settings.agent = { provider, model, apiKey: 'enc:v1:...', transferConsent: { at, by, byRole, textVersion }, lastTest }`
// (Setting semasi strict:false, EKLEMELI; goc yok). Anahtar FieldCrypto (AES-256-GCM, FIELD_ENCRYPTION_KEYS) ile SIFRELI saklanir; yanitlarda
// yalniz 'sensitive'; LOGA/DENETIME/METRIGE ASLA yazilmaz (yalniz saglayici/model/sinif). Cozulmus anahtar surec-ici LRU'da 60 sn (bellekte).
// Konusma kaydi SAKLANMAZ (K38): bu modul yalniz ayar/onay/denetim yazar.
import { decryptField, encryptField } from '@utils/FieldCrypto';
import { AppError } from '@platform/core/errors';
import { logger } from '@platform/core/logger';
import { getRequestId } from '@platform/core/context';
import { createRateLimiter } from '@platform/rateLimit/rateLimit';
import { AuditLogger } from '@services/audit/AuditLogger';
import {
    LLM_CATALOG, LlmError, createLlmProvider, isAllowedModel, isLlmError, verifyProviderKey,
    type LlmProvider, type LlmProviderId, type ProviderHttpOptions,
} from '@platform/llm';
import type { ProviderConsentRequest, ProviderSaveRequest, ProviderStatus, ProviderTestRequest, ProviderTestResult } from './protocol/v1';
import { getAgentKv, type AgentKv } from './kv';
import { readUsage } from './providerUsage';
import type { AgentCtx } from './types';

const log = logger.child({ module: 'agent.provider' });

// ---- KVKK aktarim metni (K38 gecici cozum: H2 nihai metin gelince SURUM artar; sahiplerden yeniden onay istenir) ----
export const CONSENT_TEXT_VERSION = 'tr-2026-10-taslak-1';
export const CONSENT_TEXT_BODY = 'Sohbet yardımcısı, sorularınızı yanıtlamak için mesajlarınızı, sistem yönergelerini ve ilgili işlem sonuçlarını '
    + '(kişisel veriler maskelenmiş olarak) sizin seçtiğiniz yapay zekâ sağlayıcısına (Anthropic, OpenAI veya Google) sizin API anahtarınızla iletir. '
    + 'Aktarım yurt dışındaki sunuculara yapılabilir. Sohbet geçmişi platformumuzda kalıcı olarak saklanmaz; geçici çalışma belleği kısa süre sonra silinir. '
    + 'Sağlayıcının kendi saklama ve gizlilik koşulları geçerlidir. Bu onayı yalnızca mağaza sahibi verebilir ve dilediği zaman geri alabilir; '
    + 'onay verilmeden sohbet çalışmaz. (Taslak metin: nihai hukuki metin yayımlandığında onay yenilenecektir.)';

const KEY_RE = /^[\x21-\x7e]{8,512}$/; // yazdirilabilir ASCII, bosluk/kontrol yok (baslik enjeksiyonu yok)

export interface StoredAgentSettings {
    provider?: string;
    model?: string;
    apiKey?: string;
    transferConsent?: { at: Date | string; by: string; byRole: 'owner' | 'platformAdmin'; textVersion: string };
    lastTest?: { at: Date | string; ok: boolean; code?: string };
}

/** Ayar deposu soyutlamasi (testte sahte; canli: tenant DB Settings). */
export interface AgentSettingsStore {
    read(tid: number): Promise<StoredAgentSettings | undefined>;
    /** `set`/`unset` anahtarlari `agent.` altindaki ALAN adlaridir (cakismaz). */
    patch(tid: number, p: { set?: Record<string, unknown>; unset?: string[] }): Promise<void>;
}

export const mongoSettingsStore: AgentSettingsStore = {
    async read(tid) {
        const model = await clientSettingModel(tid);
        const doc = await model.findOne({ docId: 1 }, { agent: 1 }).lean();
        const a = (doc as { agent?: StoredAgentSettings } | null)?.agent;
        return a && typeof a === 'object' ? a : undefined;
    },
    async patch(tid, p) {
        const model = await clientSettingModel(tid);
        const update: Record<string, Record<string, unknown>> = {};
        if (p.set && Object.keys(p.set).length) update.$set = Object.fromEntries(Object.entries(p.set).map(([k, v]) => [`agent.${k}`, v]));
        if (p.unset?.length) update.$unset = Object.fromEntries(p.unset.map((k) => [`agent.${k}`, 1]));
        if (!Object.keys(update).length) return;
        await model.findOneAndUpdate({ docId: 1 }, update, { upsert: true, new: true }).lean();
    },
};

async function clientSettingModel(tid: number) {
    // tembel yukleme: bu modulu yuklemek DB katmanini yuklemez (birim testleri)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DatabaseManagerInstance } = require('@database/DatabaseManager') as typeof import('@database/DatabaseManager');
    const db = await DatabaseManagerInstance.getClientDB(tid);
    if (!db) throw new Error('tenant db yok');
    return db.getSettingModel();
}

// ---- Cozulmus saglayici onbellegi (60 sn LRU; anahtar bellekte, loglanmaz) ----
const CACHE_TTL_MS = 60_000;
const CACHE_MAX = 500;

export type TenantLlmState =
    | { state: 'ready'; provider: LlmProviderId; model: string; apiKey: string }
    | { state: 'setup'; configured: boolean; consentRequired: boolean; provider?: LlmProviderId; model?: string };

const isoOf = (v: Date | string | undefined): string | undefined => (v === undefined ? undefined : new Date(v).toISOString());
const knownProvider = (p: unknown): p is LlmProviderId => p === 'anthropic' || p === 'openai' || p === 'google';
const hasValidConsent = (a: StoredAgentSettings | undefined) => a?.transferConsent?.textVersion === CONSENT_TEXT_VERSION;
/** BR-4: platform (backoffice) anahtarinda tenant KVKK onayi kavrami YOKTUR (arac sonuclari tenant verisi tasimaz); yalniz BYOK (tenant) servisinde zorunlu. */
const OK_CONSENT = (requireConsent: boolean, a: StoredAgentSettings | undefined) => !requireConsent || hasValidConsent(a);

export class ProviderTestFailed extends Error {
    constructor(readonly result: ProviderTestResult) { super(result.code ?? 'LLM_UNAVAILABLE'); this.name = 'ProviderTestFailed'; }
}

const MESSAGES: Readonly<Record<string, string>> = {
    OK: 'Bağlantı doğrulandı.',
    LLM_KEY_INVALID: 'Anahtar geçersiz ya da iptal edilmiş.',
    LLM_QUOTA: 'Sağlayıcı hesabında kredi ya da kota bitmiş görünüyor.',
    LLM_RATE_LIMITED: 'Sağlayıcı hız sınırına ulaşıldı; biraz sonra tekrar deneyin.',
    LLM_MODEL_UNAVAILABLE: 'Seçili model bu anahtarla kullanılamıyor.',
    LLM_UNAVAILABLE: 'Sağlayıcıya ulaşılamadı; biraz sonra tekrar deneyin.',
};

export interface ProviderServiceDeps {
    store?: AgentSettingsStore;
    kv?: () => AgentKv;
    /** Test: sahte fetch/zaman asimlari. */
    http?: ProviderHttpOptions;
    now?: () => number;
    /** Test: dogrulama cagrisi. */
    verify?: typeof verifyProviderKey;
    testsPerMinute?: number;
    /** Varsayilan true (tenant BYOK: sahip onayi sart). BR-4 platform anahtari: false. */
    requireConsent?: boolean;
    /** Denetim yuzeyi (varsayilan `chat`; BR-4 `backoffice_chat`: actorType platform, tid yazilmaz). */
    surface?: 'chat' | 'backoffice_chat';
}

export class ProviderService {
    private readonly store: AgentSettingsStore;
    private readonly kv: () => AgentKv;
    private readonly now: () => number;
    private readonly verify: typeof verifyProviderKey;
    private readonly cache = new Map<number, { at: number; value: TenantLlmState }>();
    private readonly limiter: ReturnType<typeof createRateLimiter>;
    private readonly requireConsent: boolean;
    private readonly surface: 'chat' | 'backoffice_chat';

    constructor(private readonly deps: ProviderServiceDeps = {}) {
        this.requireConsent = deps.requireConsent !== false;
        this.surface = deps.surface ?? 'chat';
        this.store = deps.store ?? mongoSettingsStore;
        this.kv = deps.kv ?? getAgentKv;
        this.now = deps.now ?? Date.now;
        this.verify = deps.verify ?? verifyProviderKey;
        this.limiter = createRateLimiter({ windowMs: 60_000, max: deps.testsPerMinute ?? 5, now: this.now });
    }

    stop(): void { this.limiter.stop(); }
    invalidate(tid: number): void { this.cache.delete(tid); }

    // ---- Tur yolu: tenant saglayicisi ----
    async resolveState(tid: number): Promise<TenantLlmState> {
        const hit = this.cache.get(tid);
        const t = this.now();
        if (hit && t - hit.at < CACHE_TTL_MS) { this.cache.delete(tid); this.cache.set(tid, hit); return hit.value; } // LRU: sona al
        const value = await this.loadState(tid);
        this.cache.set(tid, { at: t, value });
        while (this.cache.size > CACHE_MAX) this.cache.delete(this.cache.keys().next().value as number);
        return value;
    }

    private async loadState(tid: number): Promise<TenantLlmState> {
        const a = await this.store.read(tid);
        if (!a || !a.apiKey || !knownProvider(a.provider) || !a.model || !isAllowedModel(a.provider, a.model)) return { state: 'setup', configured: false, consentRequired: false };
        if (!OK_CONSENT(this.requireConsent, a)) return { state: 'setup', configured: true, consentRequired: true, provider: a.provider, model: a.model };
        let apiKey: string;
        try { apiKey = decryptField(a.apiKey); } catch (e) {
            log.error({ tid, err: (e as Error).name }, 'Saglayici anahtari cozulemedi'); // anahtar/sifreli deger YOK
            return { state: 'setup', configured: false, consentRequired: false };
        }
        return { state: 'ready', provider: a.provider, model: a.model, apiKey };
    }

    /** Broker icin: hazirsa saglayici (kullanim sayaci sarmali resolver'da). */
    async createProviderFor(tid: number): Promise<{ provider: LlmProvider; providerId: LlmProviderId; model: string } | null> {
        const s = await this.resolveState(tid);
        if (s.state !== 'ready') return null;
        return { provider: createLlmProvider(s.provider, { apiKey: s.apiKey, model: s.model }, this.deps.http), providerId: s.provider, model: s.model };
    }

    // ---- Uclar ----
    async status(ctx: AgentCtx): Promise<ProviderStatus> {
        const a = await this.store.read(ctx.tid);
        const configured = !!(a?.apiKey && knownProvider(a.provider) && a.model);
        let usage: ProviderStatus['usage'];
        try { usage = await readUsage(this.kv(), ctx.tid, new Date(this.now())); } catch { usage = undefined; }
        const c = a?.transferConsent;
        return {
            v: 1,
            configured,
            canConfigure: ctx.canConfigure,
            consentRequired: configured && !OK_CONSENT(this.requireConsent, a),
            canConsent: ctx.canConsent,
            ...(configured && knownProvider(a?.provider) ? { provider: a!.provider as LlmProviderId, model: a!.model, apiKey: 'sensitive' as const } : {}),
            ...(a?.lastTest ? { lastTest: { at: isoOf(a.lastTest.at)!, ok: a.lastTest.ok === true, ...(isKnownCode(a.lastTest.code) ? { code: a.lastTest.code } : {}) } } : {}),
            ...(c && c.textVersion ? { consent: { at: isoOf(c.at)!, byRole: c.byRole === 'platformAdmin' ? 'platformAdmin' as const : 'owner' as const, textVersion: c.textVersion } } : {}),
            ...(usage ? { usage } : {}),
            catalog: LLM_CATALOG.map((e) => ({ id: e.id, label: e.label, keyHelpUrl: e.keyHelpUrl, models: e.models.map((m) => ({ ...m })) })),
            consentText: { version: CONSENT_TEXT_VERSION, body: CONSENT_TEXT_BODY },
        };
    }

    private rateGuard(ctx: AgentCtx): void {
        const h = this.limiter.hit(`${ctx.tid}:${ctx.userId}`);
        if (!h.allowed) throw AppError.of('RATE_LIMITED', { details: { retryAfterSec: Math.max(1, Math.ceil(h.retryAfterMs / 1000)) } });
    }

    private async runVerify(provider: LlmProviderId, model: string, apiKey: string): Promise<ProviderTestResult> {
        try {
            await this.verify(provider, { apiKey, model }, new AbortController().signal, this.deps.http);
            return { ok: true, message: MESSAGES.OK };
        } catch (e) {
            const err = isLlmError(e) ? e : new LlmError('LLM_UNAVAILABLE');
            return { ok: false, code: err.code, message: MESSAGES[err.code], ...(err.retryAfterSec !== undefined ? { retryAfterSec: err.retryAfterSec } : {}) };
        }
    }

    /** Saklanan anahtar (yalniz AYNI saglayici icin) ya da yeni anahtar. Ikisi de yoksa VALIDATION. */
    private async keyFor(tid: number, provider: LlmProviderId, given: string | undefined): Promise<{ apiKey: string; fresh: boolean }> {
        if (given !== undefined) {
            const k = given.trim();
            if (!KEY_RE.test(k)) throw AppError.of('VALIDATION', { message: 'API anahtarı biçimi geçersiz.' });
            return { apiKey: k, fresh: true };
        }
        const a = await this.store.read(tid);
        if (!a?.apiKey || a.provider !== provider) throw AppError.of('VALIDATION', { message: 'API anahtarı gerekli.' });
        try { return { apiKey: decryptField(a.apiKey), fresh: false }; } catch { throw AppError.of('VALIDATION', { message: 'Kayıtlı anahtar okunamadı; yeniden girin.' }); }
    }

    async test(ctx: AgentCtx, req: ProviderTestRequest): Promise<ProviderTestResult> {
        if (!isAllowedModel(req.provider, req.model)) throw AppError.of('VALIDATION', { message: 'Model bu sağlayıcı için izinli değil.' });
        this.rateGuard(ctx);
        const { apiKey, fresh } = await this.keyFor(ctx.tid, req.provider, req.apiKey);
        const result = await this.runVerify(req.provider, req.model, apiKey);
        if (!fresh) await this.recordLastTest(ctx.tid, result); // kayitli anahtar sinandi: durum guncellenir
        return result;
    }

    private async recordLastTest(tid: number, r: ProviderTestResult): Promise<void> {
        try { await this.store.patch(tid, { set: { lastTest: { at: new Date(this.now()), ok: r.ok, ...(r.code ? { code: r.code } : {}) } } }); } catch { /* yardimci alan */ }
    }

    /** Kaydet: once TEST (basarisizsa kaydetme -> ProviderTestFailed 422). `consent` yalniz sahipten. */
    async save(ctx: AgentCtx, req: ProviderSaveRequest, reason?: string): Promise<ProviderStatus> {
        if (!isAllowedModel(req.provider, req.model)) throw AppError.of('VALIDATION', { message: 'Model bu sağlayıcı için izinli değil.' });
        if (req.consent) {
            if (!ctx.canConsent) throw AppError.of('FORBIDDEN', { message: 'Veri aktarım onayını yalnızca mağaza sahibi verebilir.' });
            if (req.consent.textVersion !== CONSENT_TEXT_VERSION) throw AppError.of('VALIDATION', { message: 'Onay metni sürümü güncel değil; metni yenileyin.' });
        }
        this.rateGuard(ctx);
        const { apiKey, fresh } = await this.keyFor(ctx.tid, req.provider, req.apiKey);
        const result = await this.runVerify(req.provider, req.model, apiKey);
        if (!result.ok) throw new ProviderTestFailed(result);

        const set: Record<string, unknown> = { provider: req.provider, model: req.model, lastTest: { at: new Date(this.now()), ok: true } };
        if (fresh) set.apiKey = encryptField(apiKey);
        if (req.consent) set.transferConsent = { at: new Date(this.now()), by: ctx.userId, byRole: 'owner', textVersion: CONSENT_TEXT_VERSION };
        await this.store.patch(ctx.tid, { set });
        this.invalidate(ctx.tid);
        await auditProvider(ctx, 'agent.provider.saved', { provider: req.provider, model: req.model, replaced: fresh }, { surface: this.surface, reason });
        if (req.consent) await auditProvider(ctx, 'agent.transfer_consent.given', { textVersion: CONSENT_TEXT_VERSION });
        return this.status(ctx);
    }

    async remove(ctx: AgentCtx, reason?: string): Promise<void> {
        const a = await this.store.read(ctx.tid);
        await this.store.patch(ctx.tid, { unset: ['provider', 'model', 'apiKey', 'lastTest'] });
        this.invalidate(ctx.tid);
        await auditProvider(ctx, 'agent.provider.removed', { ...(knownProvider(a?.provider) ? { provider: a!.provider as string } : {}) }, { surface: this.surface, reason });
    }

    /** KVKK aktarim onayi: YALNIZ tenant sahibi (canConsent = owner && !impersonation). */
    async consent(ctx: AgentCtx, req: ProviderConsentRequest): Promise<ProviderStatus> {
        if (!ctx.canConsent) throw AppError.of('FORBIDDEN', { message: 'Veri aktarım onayını yalnızca mağaza sahibi verebilir.' });
        if (req.decision === 'accept') {
            if (req.textVersion !== CONSENT_TEXT_VERSION) throw AppError.of('VALIDATION', { message: 'Onay metni sürümü güncel değil; metni yenileyin.' });
            await this.store.patch(ctx.tid, { set: { transferConsent: { at: new Date(this.now()), by: ctx.userId, byRole: 'owner', textVersion: CONSENT_TEXT_VERSION } } });
            this.invalidate(ctx.tid);
            await auditProvider(ctx, 'agent.transfer_consent.given', { textVersion: CONSENT_TEXT_VERSION });
        } else {
            await this.store.patch(ctx.tid, { unset: ['transferConsent'] });
            this.invalidate(ctx.tid);
            await auditProvider(ctx, 'agent.transfer_consent.revoked', { textVersion: req.textVersion });
        }
        return this.status(ctx);
    }
}

const isKnownCode = (c: unknown): c is NonNullable<ProviderTestResult['code']> => typeof c === 'string' && c in MESSAGES && c !== 'OK';

export type ProviderAuditEvent = 'agent.provider.saved' | 'agent.provider.removed' | 'agent.transfer_consent.given' | 'agent.transfer_consent.revoked';

/** Denetim: YALNIZ saglayici/model/surum/bayrak. Anahtar ASLA (sizinti testi). Best-effort (AuditLogger firlatmaz). */
export function auditProvider(
    ctx: Pick<AgentCtx, 'tid' | 'userId' | 'session'>, event: ProviderAuditEvent, meta: Record<string, string | number | boolean>,
    opts: { surface?: 'chat' | 'backoffice_chat'; reason?: string } = {},
): Promise<void> {
    const principal = ctx.session?.invoke.principal as { imp?: boolean } | undefined;
    const imp = principal?.imp === true;
    const reqId = getRequestId();
    const bo = opts.surface === 'backoffice_chat';
    return AuditLogger.log({
        event, result: 'ok', sub: ctx.userId, ...(bo ? {} : { tid: ctx.tid }), ip: ctx.session?.invoke.ip, surface: bo ? 'backoffice_chat' : 'chat',
        actorType: bo ? 'platform' : imp ? 'impersonator' : 'user', ...(imp ? { imp: true, onBehalfOf: ctx.tid } : {}), reqId,
        meta: { ...meta, ...(opts.reason ? { reason: opts.reason.slice(0, 500) } : {}), ...(reqId ? { corrId: reqId.slice(0, 64) } : {}) },
    });
}

let singleton: ProviderService | undefined;
export function getProviderService(): ProviderService { return (singleton ??= new ProviderService()); }
/** Test: tekil ornegi degistirir/temizler. */
export function setProviderServiceForTest(s: ProviderService | undefined): void { singleton = s; }

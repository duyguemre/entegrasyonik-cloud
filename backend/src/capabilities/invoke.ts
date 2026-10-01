// ADR-0019 §2 / ADR-0034 Karar 4.3 / AGENT_BROKER_PLAN BR-2: TEK yetenek yurutucusu (sohbet simdi, MCP adaptoru sonra AYNEN kullanir).
// Yeni kural listesi YOKTUR: yetki (`can`), entitlement/LIVE_READONLY/impersonation/idempotency/denetim `RunOperation` zincirinden
// gelir; bu dosya yalniz (1) kayitta bul + exposed mi, (2) strict girdi dogrulamasi, (3) sohbet-duzeyi yeniden denetim
// (`hiddenReasonFor` = arac listesiyle AYNI fonksiyon), (4) yazmada ONAY kapisi, (5) `bindings` uzerinden RunOperation, (6) cikti
// `output` zod ile strip + PII/alan projeksiyonu + 256 KB siniri ekler. `capabilities/**` -> `api/**` yalniz bu dosyada (ADR-0016 siniri: invoke haric).
import { AppError } from '@platform/core/errors';
import { resolveTier } from '@platform/core/authz/tier';
import { logger } from '@platform/core/logger';
import { config } from '@config';
import { getPlatformSetting } from '@integration/config/platformSettings';
import type { TenantEntry } from '@database/TenantRegistry';
import runOperation from '../api/rpc/RunOperation';
import { CAPABILITY_BY_ID } from './index';
import { chatBindingOf, hiddenReasonFor, hiddenReasonForAdminChat, needsConfirmation, type AvailabilityEnv, type HiddenReason } from './availability';
import type { CapabilityDef, ExposedCapability } from './types';

const log = logger.child({ module: 'capabilities.invoke' });

/** LLM yuzeyleri (`mcp`: MCP-3 adaptoru kullanir). */
export type InvokeSurface = 'chat' | 'backoffice_chat' | 'mcp';

/** Yanit ust siniri (ADR-0034 BR-2): asarsa arac hatasi; model/istemciye kirpilmis veri gitmez. */
export const MAX_RESULT_BYTES = 256 * 1024;

export interface InvokeContext {
    /** Sunucuda kurulan kullanici baglami (`order` = tenant) ve dogrulanmis principal -- RunOperation ile ayni. */
    userContext: any;
    principal: any;
    tenant?: TenantEntry;
    ip?: string;
}

/** Yalniz onay ucu (PendingActions) uretir; yazma yetenegi bunsuz YURUTULMEZ. `pendingActionId` idempotency anahtaridir. */
export interface Approval { pendingActionId: string }

export interface InvokeOptions {
    approval?: Approval;
    /** Test: ortam (kill-switch/LIVE_READONLY/bakim). Varsayilan: canli ayarlar. */
    env?: AvailabilityEnv;
    /** Test: RunOperation yerine. */
    run?: typeof runOperation;
}

export interface InvokeResult {
    capabilityId: string;
    version: string;
    /** `output` semasindan gecmis (strip) veri. */
    data: unknown;
    /** Modele `untrusted` isaretli gidecek yollar (kullanici/3. taraf serbest metni). */
    untrustedPaths: string[];
    /** Serilestirilmis boyut (bayt). */
    bytes: number;
}

const APPROVAL_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

function killSwitchSet(): ReadonlySet<string> {
    try { return new Set(getPlatformSetting<string[]>('features.agent.disabledCapabilities')); } catch { return new Set(); }
}
function maintenanceOn(): boolean {
    try { return getPlatformSetting<boolean>('maintenance.enabled') === true; } catch { return false; }
}

/** Canli ortam: LIVE_READONLY (env), bakim (platform ayari), kill-switch (platform ayari), impersonation (oturum). */
export function liveAvailabilityEnv(principal: any): AvailabilityEnv {
    return { liveReadonly: config.liveReadonly.enabled, maintenance: maintenanceOn(), disabled: killSwitchSet(), imp: principal?.imp === true };
}

const REASON_ERROR: Record<HiddenReason, () => AppError> = {
    not_exposed: () => AppError.of('FORBIDDEN'),
    scope: () => AppError.of('FORBIDDEN'),
    rbac: () => AppError.of('FORBIDDEN'),
    disabled: () => AppError.of('CAPABILITY_DISABLED'),
    live_readonly: () => AppError.of('LIVE_READONLY'),
    maintenance: () => AppError.of('MAINTENANCE'),
    impersonation: () => AppError.of('IMPERSONATION_FORBIDDEN'),
};

export function errorForHidden(reason: HiddenReason): AppError {
    return REASON_ERROR[reason]();
}

export function findExposed(id: string): CapabilityDef | undefined {
    const cap = CAPABILITY_BY_ID.get(id as any);
    return cap && cap.mcp.exposed && cap.executor === 'server' ? cap : undefined;
}

/** [BR-4] Backoffice sohbetine acik katilim (`adminChat`) isaretli, sunucu yurutuculu yetenek. `mcp.exposed` yetenekler ile KESISMEZ (tenant sohbeti bunu goremez). */
export function findAdminChat(id: string): CapabilityDef | undefined {
    const cap = CAPABILITY_BY_ID.get(id as any);
    return cap && cap.adminChat && cap.executor === 'server' ? cap : undefined;
}

/** Yuzeye gore arac yeteneginin bulunmasi: `backoffice_chat` YALNIZ `adminChat`, digerleri YALNIZ `mcp.exposed`. */
export function findForSurface(id: string, surface: InvokeSurface): CapabilityDef | undefined {
    return surface === 'backoffice_chat' ? findAdminChat(id) : findExposed(id);
}

/** strict girdi dogrulamasi; hata = 400 VALIDATION (yalniz alan yollari; DEGER yansitilmaz). */
export function parseInput(cap: CapabilityDef, input: unknown): unknown {
    const r = cap.input.safeParse(input ?? {});
    if (r.success) return r.data;
    const fields = [...new Set(r.error.issues.map((i) => i.path.join('.') || '(girdi)'))].slice(0, 8);
    throw AppError.of('VALIDATION', { message: `Geçersiz araç girdisi: ${fields.join(', ')}`, details: fields.map((path) => ({ path })) });
}

export async function invokeCapability(ctx: InvokeContext, id: string, input: unknown, surface: InvokeSurface, opts: InvokeOptions = {}): Promise<InvokeResult> {
    // 1. kayitta bul (yoksa / exposed degilse 403; varligi sizdirilmaz)
    const cap = findForSurface(id, surface);
    if (!cap) throw AppError.of('FORBIDDEN');
    const admin = surface === 'backoffice_chat';
    // 2. girdi dogrulamasi
    const parsed = parseInput(cap, input);
    // 3. yeniden denetim (arac listesiyle AYNI fonksiyon): rbac, kill-switch, LIVE_READONLY, bakim, impersonation
    const actor = resolveTier(ctx.userContext, ctx.principal);
    const env = opts.env ?? liveAvailabilityEnv(ctx.principal);
    const reason = admin ? hiddenReasonForAdminChat(cap, actor, env) : hiddenReasonFor(cap, actor, env);
    if (reason) throw errorForHidden(reason);
    // 4. yazma/yan etkili: YALNIZ onay ucundan (PendingActions.claim sonrasi). Bu kapi olmadan dogrudan yurutme imkansizdir.
    if (admin && cap.effect !== 'read') throw AppError.of('FORBIDDEN'); // v1: backoffice sohbetinde yazma yolu YOK (defansif; kayit degismezi de engeller)
    if (needsConfirmation(cap)) {
        if (!opts.approval || !APPROVAL_ID_RE.test(opts.approval.pendingActionId)) {
            throw AppError.of('FORBIDDEN', { message: 'Bu işlem yalnızca onay adımından sonra yürütülebilir.' });
        }
    }
    // 5. bindings uzerinden mevcut RunOperation yolu (tenant yalniz userContext.order'dan)
    const b = chatBindingOf(cap);
    if (!b) throw AppError.of('FORBIDDEN');
    const [service, operation] = b.rpc.split('/');
    const body = b.map ? b.map(parsed) : parsed;
    const run = opts.run ?? runOperation;
    const raw = await run(ctx.userContext, service, operation, body, ctx.principal, {
        ip: ctx.ip, tenant: ctx.tenant, surface: admin ? 'backoffice' : 'app', idempotencyKey: opts.approval?.pendingActionId,
    });
    // 6. cikti: projeksiyon (alan secimi + PII maskeleme) -> output zod (strip) -> boyut siniri
    const project = admin ? cap.adminChat?.exposed.project : (cap as ExposedCapability).project;
    const shaped = project ? project(raw, parsed) : raw;
    const out = (cap.output as Exclude<CapabilityDef['output'], 'legacy'>).safeParse(shaped);
    if (!out.success) {
        log.error({ capabilityId: cap.id, surface, issues: out.error.issues.map((i: any) => i.path.join('.')) }, 'Yetenek çıktısı şemaya uymuyor');
        throw AppError.internal('capability output schema mismatch');
    }
    const bytes = Buffer.byteLength(JSON.stringify(out.data), 'utf8');
    if (bytes > MAX_RESULT_BYTES) throw AppError.of('PAYLOAD_TOO_LARGE', { message: 'Araç yanıtı çok büyük; filtreyi daraltın.' });
    return { capabilityId: cap.id, version: cap.version, data: out.data, untrustedPaths: (admin ? cap.adminChat?.exposed.untrustedPaths : cap.untrustedPaths) ?? [], bytes };
}

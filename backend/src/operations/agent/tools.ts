// ADR-0034 Karar 4.2 / AGENT_BROKER_PLAN BR-2: tur basina ARAC LISTESI (yetenek kaydindan turetilir) + calistirma koprusu.
// Sira: `mcp.exposed` -> `can()` -> entitlement -> kill-switch -> LIVE_READONLY -> bakim -> impersonation (hepsi `hiddenReasonFor` + `entitled`;
// yeni kural listesi yok). Butce <= 30 arac (core + sayfa toolset'i onceli), ad sirasi deterministik (prompt onbellegi). Girdi semasi zod'dan JSON Schema.
import { CAPABILITIES } from '../../capabilities';
import { hiddenReasonFor, hiddenReasonForAdminChat, needsConfirmation, type AvailabilityEnv } from '../../capabilities/availability';
import { toolNameOf } from '../../capabilities/derive/toolName';
import { zodToJsonSchema } from '../../capabilities/derive/jsonSchema';
import { errorForHidden, invokeCapability, liveAvailabilityEnv, parseInput, findAdminChat, findExposed, type Approval, type InvokeOptions, type InvokeResult } from '../../capabilities/invoke';
import type { CapabilityDef, Toolset } from '../../capabilities/types';
import { config } from '@config';
import { AppError } from '@platform/core/errors';
import { resolveTier } from '@platform/core/authz/tier';
import { EntitlementService } from '@services/billing/EntitlementService';
import type { AgentCtx } from './types';

export const MAX_TOOLS = 30;

/** Yuzey -> listelenen etki sinifi. `chat`: hepsi (yazma onay kartiyla); `mcp`: okuma, `mcp:write` etkinse (MCP-4) yazma araclari da (yurutme YALNIZ bant disi onayla).
 *  `backoffice_chat` (BR-4): YALNIZ `adminChat` isaretli platform okuma yetenekleri (ayri kume; tenant sohbetiyle kesismez). */
export type ToolSurface = 'chat' | 'mcp' | 'backoffice_chat';
const MCP_LISTED_EFFECTS: ReadonlySet<CapabilityDef['effect']> = new Set<CapabilityDef['effect']>(['read']);

export interface AgentTool {
    name: string;
    capId: string;
    version: string;
    description: string;
    inputSchema: Record<string, unknown>;
    effect: CapabilityDef['effect'];
    /** `none` = dogrudan calisir (okuma/onizleme); aksi halde onay karti. */
    confirm: 'none' | 'confirm' | 'typed';
    external: boolean;
    untrustedPaths: string[];
    title: { tr: string; en: string };
    toolset: Toolset;
}

/** Sohbet yuzeyinin arac calistirma/listeleme sozlesmesi (test sahtesi + canli uygulama). MCP adaptoru ayni invokeCapability'yi kullanir. */
export interface ToolRuntime {
    list(ctx: AgentCtx, screen?: string): Promise<AgentTool[]>;
    /** strict girdi dogrulamasi (hata = AppError VALIDATION); dogrulanmis girdiyi doner. */
    validate(capId: string, input: unknown): unknown;
    invoke(ctx: AgentCtx, capId: string, input: unknown, approval?: Approval): Promise<InvokeResult>;
    /** Yetenegin SU ANKI surumu (PendingAction surum eslesmesi icin); yoksa undefined. */
    versionOf(capId: string): string | undefined;
    /**
     * Onay kartindan ONCE: model kaynakli kimlikler bu tenant'ta var mi? (Tenant DB izole oldugundan varlik = sahiplik.)
     * Sorun yoksa undefined; aksi halde kart uretilmez. Tanimsiz = dogrulama yok (yalniz test sahteleri).
     */
    verifyRefs?(ctx: AgentCtx, capId: string, input: unknown): Promise<RefProblem | undefined>;
    /**
     * Yurutme ANINDA yeniden denetim (RBAC/kill-switch/LIVE_READONLY/bakim/impersonation + abonelik yazma erisimi); sorun yoksa undefined.
     * Bant disi onay ucu (MCP-4) kota tuketmeden/kaydi almadan ONCE sorar: 423/503/403 ile reddedilen onay kaydi tuketmez. Tanimsiz = denetim yok (yalniz test sahteleri).
     */
    unavailable?(ctx: AgentCtx, capId: string): Promise<AppError | undefined>;
}

export interface RefProblem { code: 'ENTITY_NOT_FOUND'; missing: string[] }

/** Ekran -> toolset ipucu (sayfa baglami; yalniz oncelik, guvenlik degil). */
const SCREEN_TOOLSET: Array<[prefix: string, toolset: Toolset]> = [
    ['OrderListView', 'orders'], ['productDefinitions/', 'catalog'], ['integrations/', 'integrations'],
];
export function toolsetForScreen(screen?: string): Toolset | undefined {
    if (!screen) return undefined;
    return SCREEN_TOOLSET.find(([p]) => screen.startsWith(p))?.[1];
}

const schemaCache = new Map<string, Record<string, unknown>>();
function schemaOf(cap: CapabilityDef): Record<string, unknown> {
    let s = schemaCache.get(cap.id);
    if (!s) { s = zodToJsonSchema(cap.input); schemaCache.set(cap.id, s); }
    return s;
}

export function toolOf(cap: CapabilityDef): AgentTool {
    const exposed = cap.mcp.exposed!;
    const confirm = needsConfirmation(cap) ? (exposed.confirm === 'none' ? 'confirm' : exposed.confirm) : 'none';
    return {
        name: toolNameOf(cap.id), capId: cap.id, version: cap.version,
        description: cap.llm!.description + (confirm !== 'none' ? ' Requires explicit user confirmation before anything happens.' : ''),
        inputSchema: schemaOf(cap), effect: cap.effect, confirm, external: cap.external, untrustedPaths: cap.untrustedPaths ?? [],
        title: cap.summary, toolset: exposed.toolset,
    };
}

/** BR-4: backoffice sohbeti arac tanimi (yalniz `adminChat`; okuma; onaysiz). */
export function adminToolOf(cap: CapabilityDef): AgentTool {
    const ex = cap.adminChat!.exposed;
    return {
        name: toolNameOf(cap.id), capId: cap.id, version: cap.version, description: ex.llm.description,
        inputSchema: schemaOf(cap), effect: cap.effect, confirm: 'none', external: false, untrustedPaths: ex.untrustedPaths ?? [],
        title: cap.summary, toolset: 'core',
    };
}

export interface DeriveOptions {
    caps?: ReadonlyArray<CapabilityDef>;
    actor: { tier?: 'member' | 'admin' | 'owner'; platformAdmin?: boolean } | undefined;
    env: AvailabilityEnv;
    /** Plan/abonelik denetimi (asenkron; yazma icin `write`, okuma icin `read` boyutu). */
    entitled?: (cap: CapabilityDef) => boolean;
    screen?: string;
    /** Varsayilan `chat`. `mcp`: kapsam tavani (yalniz `effect:'read'`; `mcpWrite` ile yazma da); diger tum suzgecler AYNI. */
    surface?: ToolSurface;
    /** `surface:'mcp'` + etkin `mcp:write` kapsami. */
    mcpWrite?: boolean;
}

/** Saf turetme (I/O yok; entitlement onceden cozulmus predikat olarak gelir). */
export function deriveTools(o: DeriveOptions): AgentTool[] {
    const caps = o.caps ?? CAPABILITIES;
    if (o.surface === 'backoffice_chat') {
        // BR-4: ayri kume. Plan/abonelik tenant kavramidir (platform yoneticisi icin yok); kill-switch/RBAC ortak.
        return caps.filter((c) => c.adminChat && hiddenReasonForAdminChat(c, o.actor, o.env) === undefined)
            .map(adminToolOf).sort((a, b) => a.name.localeCompare(b.name)).slice(0, MAX_TOOLS);
    }
    const visible = caps.filter((c) => (o.surface !== 'mcp' || o.mcpWrite === true || MCP_LISTED_EFFECTS.has(c.effect))
        && hiddenReasonFor(c, o.actor, o.env) === undefined && (o.entitled ? o.entitled(c) : true));
    const hint = toolsetForScreen(o.screen);
    const rank = (c: CapabilityDef) => (c.mcp.exposed!.toolset === 'core' ? 0 : c.mcp.exposed!.toolset === hint ? 1 : 2);
    const picked = [...visible].sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id)).slice(0, MAX_TOOLS);
    return picked.map(toolOf).sort((a, b) => a.name.localeCompare(b.name));
}

/** Canli entitlement: `ENTITLEMENT_GUARD_ENABLED` kapaliysa herkese acik (RunOperation ile ayni ilke); aciksa abonelik durumu. */
export async function liveEntitled(tid: number): Promise<(cap: CapabilityDef) => boolean> {
    if (!config.flags.entitlementGuardEnabled) return () => true;
    const [read, write] = await Promise.all([EntitlementService.checkAccess(tid, 'read'), EntitlementService.checkAccess(tid, 'write')]);
    return (cap) => (cap.effect === 'read' ? read.allowed : write.allowed);
}

export interface RuntimeDeps {
    /** Bakim modu (broker ile ayni kaynak). */
    isMaintenance(): boolean;
    /** Test: RunOperation yerine. */
    run?: InvokeOptions['run'];
    /** Test: ortam (kill-switch/LIVE_READONLY). */
    env?: (ctx: AgentCtx) => AvailabilityEnv;
    entitled?: (tid: number) => Promise<(cap: CapabilityDef) => boolean>;
    /** Onay oncesi kimlik dogrulama (canli: `dbVerifyRefs`). */
    verifyRefs?: ToolRuntime['verifyRefs'];
}

export function createToolRuntime(deps: RuntimeDeps): ToolRuntime {
    const envOf = (ctx: AgentCtx): AvailabilityEnv => deps.env?.(ctx) ?? { ...liveAvailabilityEnv(ctx.session?.invoke.principal), maintenance: deps.isMaintenance() };
    return {
        async list(ctx, screen) {
            if (!ctx.session) return [];
            const actor = resolveTier(ctx.session.invoke.userContext, ctx.session.invoke.principal);
            if (ctx.surface === 'backoffice_chat') return deriveTools({ actor, env: envOf(ctx), surface: 'backoffice_chat' });
            const entitled = await (deps.entitled ?? liveEntitled)(ctx.tid);
            return deriveTools({ actor, env: envOf(ctx), entitled, screen, surface: ctx.surface === 'mcp' ? 'mcp' : 'chat', mcpWrite: ctx.surface === 'mcp' && ctx.mcpWrite === true });
        },
        validate(capId, input) {
            const cap = findExposed(capId) ?? findAdminChat(capId);
            if (!cap) throw new Error('bilinmeyen arac');
            return parseInput(cap, input);
        },
        async invoke(ctx, capId, input, approval) {
            if (!ctx.session) throw new Error('oturum yok');
            return invokeCapability(ctx.session.invoke, capId, input, ctx.surface ?? 'chat', { approval, env: envOf(ctx), run: deps.run });
        },
        versionOf(capId) { return (findExposed(capId) ?? findAdminChat(capId))?.version; },
        async unavailable(ctx, capId) {
            const admin = ctx.surface === 'backoffice_chat';
            const cap = admin ? findAdminChat(capId) : findExposed(capId);
            if (!cap || !ctx.session) return AppError.of('FORBIDDEN');
            const actor = resolveTier(ctx.session.invoke.userContext, ctx.session.invoke.principal);
            if (admin) { const r = hiddenReasonForAdminChat(cap, actor, envOf(ctx)); return r ? errorForHidden(r) : undefined; }
            const reason = hiddenReasonFor(cap, actor, envOf(ctx));
            if (reason) return errorForHidden(reason);
            const entitled = await (deps.entitled ?? liveEntitled)(ctx.tid);
            return entitled(cap) ? undefined : AppError.of('SUBSCRIPTION_RESTRICTED');
        },
        ...(deps.verifyRefs ? { verifyRefs: deps.verifyRefs } : {}),
    };
}

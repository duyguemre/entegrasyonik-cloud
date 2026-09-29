// ADR-0019 §1: yetenek tanımlama yardımcıları (varsayılanlar GÜVENLİ YÖNDEDİR: yeni yetenek `notExposed` ile başlar,
// `effect` ELLE yazılır, `output` 'legacy', girdi gevşek nesne).
import { z } from 'zod';
import type {
    AgentDecision, CapabilityDef, CapabilityInit, McpDecisionNotExposed, NotExposedReason, RpcRef, Stage, UiMapping,
} from './types';

/**
 * Aşama A içe aktarımında henüz şemalandırılmamış (mevcut RPC girdisi serbest biçimli) yeteneklerin girdisi.
 * Bilinçli olarak GEVŞEKTİR ve YALNIZCA `mcp.notExposed` yeteneklerde kullanılabilir (P7: exposed ⇒ strict). UI yolunda
 * doğrulama kademelidir (ADR-0019 Gerekçe / B3).
 */
export const legacyInput = z.record(z.string(), z.unknown());

/** Bir girdi şemasının `legacyInput` (şemalandırılmamış) olup olmadığı. */
export const isLegacyInput = (schema: unknown): boolean => schema === legacyInput;

/** Ajan kararı: ADR-0018 henüz kodda yok; bütün yetenekler şimdilik `allowed:false` (açık karar, unutulmuş değil). */
export const NO_AGENT: AgentDecision = { allowed: false };

// --- MCP kararı yardımcıları -------------------------------------------------------------------------------------
/** Gerekçeli `notExposed` (deferred DIŞI sınıflar). `note` ≥ 20 karakter (P3 testi denetler). */
export function nx(reason: Exclude<NotExposedReason, 'deferred'>, note: string): McpDecisionNotExposed {
    return { notExposed: { reason, note } };
}

/** `deferred`: bilinçli erteleme; `until` ZORUNLUDUR. */
export function deferred(until: Stage, note: string): McpDecisionNotExposed {
    return { notExposed: { reason: 'deferred', note, until } };
}

// --- UI eşleme yardımcıları --------------------------------------------------------------------------------------
/** Bir ya da daha fazla ekrana bağ. `key` = `screens.ts` / `menuStore.views` anahtarı. */
export function onScreens(...keys: Array<string | [string, string]>): UiMapping {
    return { screens: keys.map((k) => (Array.isArray(k) ? { screen: k[0], action: k[1] } : { screen: k })) };
}

/**
 * Kabuk (ekran OLMAYAN) FE yüzeyi: initApp, menü, bildirim çekmecesi, uygulama çubuğu araması, oturum akışı.
 * Sabit önek `shell:`; P4 bunu geçerli (ekran kaydı gerektirmeyen) bir yüzey olarak kabul eder.
 */
export function onShell(surface: 'init' | 'menu' | 'notifications' | 'app_bar' | 'session'): UiMapping {
    return { screens: [{ screen: `shell:${surface}` }] };
}

/** UI karşılığı yok (gerekçeli). Backend-only uçlar, FE'de henüz ekranı olmayan yetenekler. */
export function noUi(reason: string): UiMapping {
    return { none: { reason } };
}

export const rpcs = (...refs: RpcRef[]) => refs.map((rpc) => ({ rpc }));

/** Bir platform (ga) kapsamı yeteneği mi (varsayılan kapsam çıkarımı). */
const defaultScope = (init: CapabilityInit): 'tenant' | 'user' | 'platform' => (init.domain === 'platform' ? 'platform' : 'tenant');

/**
 * Yeteneği tanımlar: varsayılanları doldurur ve ÇALIŞMA-ANI değişmezlerini denetler (tip sistemi karar zorunluluğunu zaten sağlar).
 *  - server yürütücüde ≥1 bağ; desktop yürütücüde 0 bağ.
 *  - `id` biçimi `alan.eylem[.nesne]`, küçük harf/rakam/alt çizgi (ilk parça iş alanıdır; `domain` ile birebir eşleşmek ZORUNDA DEĞİL:
 *    ör. 'users.*' ve 'menu.*' → domain 'account').
 */
export function defineCapability<I = any, O = any>(init: CapabilityInit<I, O>): CapabilityDef<I, O> {
    const withDefaults = {
        version: '1.0' as const,
        input: legacyInput,
        output: 'legacy' as const,
        scope: defaultScope(init as CapabilityInit),
        idempotency: 'n/a' as const,
        external: false,
        pii: 'none' as const,
        undo: { kind: 'none' as const },
        executor: 'server' as const,
        ...(init as object),
    } as unknown as CapabilityDef<I, O>;

    if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(withDefaults.id)) {
        throw new Error(`capability id biçimi geçersiz: ${withDefaults.id}`);
    }
    if (withDefaults.executor === 'server' && withDefaults.bindings.length < 1) {
        throw new Error(`capability ${withDefaults.id}: server yürütücü en az bir RPC bağı ister`);
    }
    if (withDefaults.executor === 'desktop' && withDefaults.bindings.length > 0) {
        throw new Error(`capability ${withDefaults.id}: desktop yürütücü RPC bağı taşımaz`);
    }
    return withDefaults;
}

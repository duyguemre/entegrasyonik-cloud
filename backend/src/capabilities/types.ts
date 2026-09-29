// ADR-0019 §1: Yetenek Kaydı (Capability Registry) TİP SÖZLEŞMESİ.
//
// Bu dosya SAF tiplerdir (çalışma-anı mantığı define.ts/index.ts'te). ADR-0016 sınır kuralı: `capabilities/**` (invoke hariç)
// `api/**`'yi İÇE AKTARMAZ — `Tier` bu yüzden burada tanımlıdır ve `api/operationPolicy.ts` oradan yeniden dışa verir.
//
// Derleme-zamanı zorlama (ADR-0019 Karar, P3):
//  - `mcp` alanı ZORUNLUDUR ve ayrımlı birleşimdir: `{ exposed }` YA DA `{ notExposed }`. MCP kararı olmayan yetenek TİP HATASIDIR.
//  - `notExposed.reason` sabit listedendir (NotExposedReason); `deferred` ise `until` ZORUNLUDUR.
//  - `exposed` ise `llm` (açıklama + örnekler), `output` (≠ 'legacy') ve `pii` (≠ 'raw') zorunludur.
//  - `ui` ve `agent` kararları da zorunludur (unutulmuş karar = derleme hatası).
import type { ZodType } from 'zod';

export type Effect = 'read' | 'propose' | 'write' | 'destructive';

/** operationPolicy.ts ile aynı tip (oradan re-export edilir; kayıt `api/`'yi import etmez). */
export type Tier = 'member' | 'admin' | 'owner' | 'platformAdmin';

export type Domain =
    | 'catalog' | 'orders' | 'claims' | 'customers' | 'messages' | 'invoices' | 'shipments' | 'finance'
    | 'integrations' | 'reports' | 'account' | 'billing' | 'support' | 'platform' | 'local';

export const DOMAINS: ReadonlyArray<Domain> = [
    'catalog', 'orders', 'claims', 'customers', 'messages', 'invoices', 'shipments', 'finance',
    'integrations', 'reports', 'account', 'billing', 'support', 'platform', 'local',
];

/** ADR-0019 §4.3 toolset'leri (alan kümeleri). `core` her zaman açık (bugünkü 5 araç). */
export type Toolset = 'core' | 'catalog' | 'orders' | 'customers' | 'integrations' | 'finance' | 'account';

/** ADR-0008 §2 `features[]` örnekleri (Plan.ts ile aynı; kapalı enum DEĞİL). */
export type PlanFeature = 'einvoice' | 'erp' | 'shipping' | 'mcp' | 'desktopApp' | (string & {});

export type Presentation = 'table' | 'kpi' | 'entity' | 'status' | 'chart' | 'text' | 'preview';

/**
 * `notExposed` gerekçe sınıfları (ADR-0019 §1 SABİT LİSTE):
 *  ui_plumbing | platform_admin | credential | irreversible | binary_file | no_backend | deferred[+until]
 */
export type NotExposedReason =
    | 'ui_plumbing'      // kabuk/menü/favori/tercih — kullanıcının işi değil, uygulamanın iç işi
    | 'platform_admin'   // ga yetkisi; OAuth token'ında ga yok (ADR-0010:43) → MCP'de çağrılamaz
    | 'credential'       // sır/kimlik bilgisi okuma-yazma; LLM kanalından geçemez
    | 'irreversible'     // geri alınamaz/hukuki/parasal — yalnız ekranda
    | 'binary_file'      // görsel/dosya yükleme-indirme — yerel araç + mevcut yükleme API'si (ADR-0009 §6)
    | 'no_backend'       // yalnız-UI formu / henüz çalışmayan uç (dürüstlük, C7/E3)
    | 'deferred';        // bilinçli erteleme — `until` ZORUNLU, mandalla sayılır

export const NOT_EXPOSED_REASONS: ReadonlyArray<NotExposedReason> = [
    'ui_plumbing', 'platform_admin', 'credential', 'irreversible', 'binary_file', 'no_backend', 'deferred',
];

/**
 * `deferred` için hedef aşama. ADR-0019 §7 aşamaları: C (salt-okunur çekirdek 5 araç), D (yazma + onay), E (parite kapısı zorunlu).
 * `later` = C–E dışı, henüz bir aşamaya bağlanmamış toolset genişlemesi (ADR'de aşama değil; bilinçli "ertelendi" işareti,
 * `capability-baseline` mandalında ayrı sayılır — ADR-0019 Aşama A uygulama notu).
 */
export type Stage = 'C' | 'D' | 'E' | 'later';

export const STAGES: ReadonlyArray<Stage> = ['C', 'D', 'E', 'later'];

export interface DeepLinkSpec { screen: string; params?: Record<string, string> }

export interface McpExposed {
    toolset: Toolset;
    confirm: 'none' | 'confirm' | 'typed';
    present: Presentation;
    deepLink?: DeepLinkSpec;
}

export type McpNotExposed =
    | { reason: Exclude<NotExposedReason, 'deferred'>; note: string; until?: undefined }
    | { reason: 'deferred'; note: string; until: Stage };

/** `mcp` KARARI: tam olarak biri. Alanın kendisi ZORUNLUDUR (derleyici "unutulmuş karar"ı yakalar). */
export type McpDecisionExposed = { exposed: McpExposed; notExposed?: undefined };
export type McpDecisionNotExposed = { notExposed: McpNotExposed; exposed?: undefined };

export type UiMapping =
    | { screens: Array<{ screen: string; action?: string }>; none?: undefined }
    | { none: { reason: string }; screens?: undefined };

export type AgentDecision = { allowed: false } | { allowed: true; maxEffect: 'read' | 'propose' };

export type CapabilityId = `${string}.${string}`;

export type Undo =
    | { kind: 'none' }
    | { kind: 'compensate'; with: CapabilityId }
    | { kind: 'softDelete'; days: number };

/** RPC operasyon bağı: `'Servis/operasyon'` (ImageApi sözde-servisi dahil). */
export type RpcRef = `${string}/${string}`;

export interface Binding<I = any> { rpc: RpcRef; map?: (input: I) => unknown }

export interface Llm {
    /** EN, 3–6 cümle: ne yapar, ne zaman kullanılır, ne zaman KULLANILMAZ, sınırlar. */
    description: string;
    /** ≥2 doğal dil örneği (çoğu TR). */
    examples: string[];
}

/** Ortak alanlar (MCP kararından bağımsız). */
interface CapabilityBase<I> {
    /** 'orders.approve' — kararlı; silinen kimlik asla yeniden kullanılmaz. */
    id: CapabilityId;
    /** Şema sürümü `ana.alt`. */
    version: `${number}.${number}`;
    domain: Domain;
    summary: { tr: string; en: string };
    llm?: Llm;
    input: ZodType<I>;
    effect: Effect;
    /** OPERATION_POLICY bundan türetilir. Bir yeteneğin TÜM bağları aynı kademeyi paylaşır. */
    minTier: Tier;
    entitlement?: { feature?: PlanFeature; access: 'read' | 'write' };
    scope: 'tenant' | 'user' | 'platform';
    idempotency: 'natural' | 'key' | 'n/a';
    /** Pazaryeri/3. taraf çağırır mı (→ openWorldHint). */
    external: boolean;
    rateCost?: number;
    audit?: 'always';
    pii: 'none' | 'masked' | 'raw';
    untrustedPaths?: string[];
    undo: Undo;
    executor: 'server' | 'desktop';
    /** server ise ≥1; her RPC operasyonu TAM OLARAK bir yeteneğe bağlıdır. */
    bindings: Array<Binding<I>>;
    ui: UiMapping;
    agent: AgentDecision;
    /** Bugünkü "Belirsiz = EVET" insan-inceleme notları (OPERATION_POLICY.md) buraya taşınır. */
    review?: string;
    deprecated?: { since: string; replacement?: CapabilityId; removeAfter: string };
}

export type ExposedCapability<I = any, O = any> = CapabilityBase<I> & {
    mcp: McpDecisionExposed;
    llm: Llm;
    output: ZodType<O>;
    pii: 'none' | 'masked';
};

export type NotExposedCapability<I = any, O = any> = CapabilityBase<I> & {
    mcp: McpDecisionNotExposed;
    /** 'legacy' yalnız mcp.notExposed için izinli. */
    output: ZodType<O> | 'legacy';
};

export type CapabilityDef<I = any, O = any> = ExposedCapability<I, O> | NotExposedCapability<I, O>;

/** `defineCapability` girdisi: varsayılanı olan alanlar isteğe bağlıdır; MCP/UI/agent kararları ASLA. */
type NotExposedDefaults = 'version' | 'input' | 'output' | 'scope' | 'idempotency' | 'external' | 'pii' | 'undo' | 'executor';
type ExposedDefaults = 'version' | 'scope' | 'idempotency' | 'external' | 'undo' | 'executor';

export type CapabilityInit<I = any, O = any> =
    | (Omit<NotExposedCapability<I, O>, NotExposedDefaults> & Partial<Pick<NotExposedCapability<I, O>, NotExposedDefaults>>)
    | (Omit<ExposedCapability<I, O>, ExposedDefaults> & Partial<Pick<ExposedCapability<I, O>, ExposedDefaults>>);

/** Bir RPC operasyonunun politika kaydı biçimi (operationPolicy.ts ile aynı). */
export type PolicyTable = Record<string, Record<string, Tier>>;

// ADR-0018 Karar 2 — tek bulgu modeli, hayat döngüsü (tekilleştirme, regresyon, yanlış-pozitif kapısı, TTL).
// BEST-EFFORT: `report()` ASLA fırlatmaz/reddetmez (AuditLogger/IntegrationCallMetrics deseniyle aynı ilke —
// bekçinin/gözlemcinin kendi hatası iş akışını ASLA bozmaz). DB'ye yazım `setSink` ile test edilebilir.
import crypto from 'crypto';
import type {
    IntegrationFindingKind, IntegrationFindingSource, IntegrationFindingSeverity, IntegrationFindingStatus,
} from '@database/application/models/IntegrationFinding';
import { eventLog } from '@platform/core/logger';

const log = eventLog('engine', 'FindingService');

export interface FindingEvidence {
    paths?: string[];
    types?: string[];
    enumValue?: string;
    httpStatus?: number;
    headerNames?: string[];
    sunsetAt?: string;
    /** ≤2KB; fazlası kırpılır. */
    docDiff?: string;
    fingerprint?: string;
}

export interface ReportFindingInput {
    integrationCode: string;
    category: string;
    kind: IntegrationFindingKind;
    source: IntegrationFindingSource;
    subjectKey: string;
    /** Tekilleştirme imzası (ör. şekil parmak izi, enum değeri, HTTP durumu). Verilmezse `subjectKey` kullanılır. */
    signature?: string;
    /** Belirtilmezse `kind`'e göre AŞAMA A basitleştirilmiş varsayılan tablo kullanılır (bkz. `computeDefaultSeverity`). */
    severity?: IntegrationFindingSeverity;
    evidence?: FindingEvidence;
    /** Bu gözlemi tetikleyen tenant (varsa) — `affectedTenants`'a `$addToSet` edilir, ≤100 kayıt. */
    tenantId?: number;
    adapterVersionSeen?: string;
    /** ≤1KB. */
    recommendation?: string;
}

export interface IntegrationFindingRecord {
    dedupKey: string;
    integrationCode: string;
    category: string;
    kind: IntegrationFindingKind;
    source: IntegrationFindingSource;
    subjectKey: string;
    severity: IntegrationFindingSeverity;
    evidence?: FindingEvidence;
    occurrences: number;
    firstSeenAt: Date;
    lastSeenAt: Date;
    affectedTenants: number[];
    confirmed: boolean;
    status: IntegrationFindingStatus;
    adapterVersionSeen?: string;
    fixedInAdapterVersion?: string;
    fixRef?: string;
    recommendation?: string;
    decidedBy?: string;
    decidedAt?: Date;
    notes?: string;
    closedAt?: Date;
}

export type FindingSink = (op: 'upsert' | 'transition', record: Record<string, any>) => Promise<void>;
export type FindingReader = (dedupKey: string) => Promise<IntegrationFindingRecord | null>;

let customSink: FindingSink | undefined;
let customReader: FindingReader | undefined;
export interface AlertContext { integrationCode: string; kind: string; severity: string; findingId: string }
export type AlertHook = (ctx: AlertContext) => void | Promise<unknown>;
let customAlertHook: AlertHook | undefined;

async function getModel() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- TS6-01: node16 CJS, tembel yukleme (dinamik import yerine)
    const { DatabaseManagerInstance } = (require('@database/DatabaseManager') as typeof import('@database/DatabaseManager'));
    const db = await DatabaseManagerInstance.getApplicationDB();
    return (db as any).getIntegrationFindingModel();
}

async function defaultReader(dedupKey: string): Promise<IntegrationFindingRecord | null> {
    const model = await getModel();
    return model.findOne({ dedupKey }).lean();
}

async function defaultSink(op: 'upsert' | 'transition', record: Record<string, any>): Promise<void> {
    const model = await getModel();
    // `transition` yalnız VAR OLAN bulguyu günceller (upsert:false) — bilinmeyen bir dedupKey'e geçiş
    // isteği sessizce yeni (eksik alanlı) bir doküman yaratmasın.
    await model.findOneAndUpdate({ dedupKey: record.dedupKey }, { $set: record }, { upsert: op === 'upsert', new: true });
}

const CLOSED_STATUSES: ReadonlySet<IntegrationFindingStatus> = new Set(['fixed', 'wontfix', 'false_positive']);
const REGRESSION_WINDOW_MS = 24 * 60 * 60 * 1000;
const CONFIRM_MIN_OBSERVATIONS = 20;
const CONFIRM_MIN_CONTINUITY_MS = 30 * 60 * 1000;
const MAX_AFFECTED_TENANTS = 100;
const MAX_DOC_DIFF = 2 * 1024;
const MAX_RECOMMENDATION = 1024;
const MAX_STRING_FIELD = 500;

// ADR-0018 §2a: "yalnız anahtar yolları, tip adları, enum kodu, HTTP durumu, normalize işlem yolu ve başlık
// ADLARI (değer değil)" — bu desen, gövde DEĞERİ gibi görünen serbest metinleri (uzun/whitespace içeren) reddeder.
const SAFE_TOKEN = /^[A-Za-z0-9_\-./:]{1,64}$/;
const FORBIDDEN_KEY = /pass|token|secret|mail|authorization|cookie|apikey|api[_-]?key/i;

function clip(s: string, max: number): string {
    return s.length > max ? `${s.slice(0, max)}…` : s;
}

function sanitizeStringArray(arr: string[] | undefined): string[] | undefined {
    if (!Array.isArray(arr)) return undefined;
    const out = arr.filter((s) => typeof s === 'string' && !FORBIDDEN_KEY.test(s)).map((s) => clip(String(s), 200)).slice(0, 50);
    return out.length > 0 ? out : undefined;
}

/** Kanıtı redakte eder (AuditLogger.sanitizeMeta ile aynı yasak-anahtar süzgeci ilkesi). Değerler asla gövdeden gelmez. */
export function redactEvidence(evidence: FindingEvidence | undefined): FindingEvidence | undefined {
    if (!evidence || typeof evidence !== 'object') return undefined;
    const out: FindingEvidence = {};
    const paths = sanitizeStringArray(evidence.paths);
    if (paths) out.paths = paths;
    const types = sanitizeStringArray(evidence.types);
    if (types) out.types = types;
    if (typeof evidence.enumValue === 'string') out.enumValue = SAFE_TOKEN.test(evidence.enumValue) ? evidence.enumValue : '<redacted>';
    if (typeof evidence.httpStatus === 'number' && Number.isFinite(evidence.httpStatus)) out.httpStatus = evidence.httpStatus;
    const headerNames = sanitizeStringArray(evidence.headerNames);
    if (headerNames) out.headerNames = headerNames;
    if (typeof evidence.sunsetAt === 'string') out.sunsetAt = clip(evidence.sunsetAt, 64);
    if (typeof evidence.docDiff === 'string') out.docDiff = clip(evidence.docDiff, MAX_DOC_DIFF);
    if (typeof evidence.fingerprint === 'string') out.fingerprint = clip(evidence.fingerprint, 128);
    return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * ADR-0018 Karar 2 "Şiddet varsayılanları" tablosunun AŞAMA A BASİTLEŞTİRİLMİŞ karşılığı. Tam istatistiksel
 * pencereleme (≥%50 404, 30 günlük >4 "değişti" vb.) Aşama B probe/kaynak izleyicisinin işidir; bugün yalnız
 * çağıran tarafından geçirilen bağlamla (affectedTenantsCount, httpStatus) makul bir varsayılan üretilir.
 * Çağıran her zaman `severity`'yi AÇIKÇA geçirerek bu tabloyu ezebilir.
 */
export function computeDefaultSeverity(kind: IntegrationFindingKind, ctx: { affectedTenantsCount?: number; httpStatus?: number } = {}): IntegrationFindingSeverity {
    if (kind === 'doc') return 'info';
    if (kind === 'auth') return (ctx.affectedTenantsCount ?? 0) >= 2 ? 'critical' : 'high';
    if (kind === 'endpoint') {
        if (ctx.httpStatus === 410) return 'critical';
        if (ctx.httpStatus === 404) return 'critical';
        return 'medium';
    }
    if (kind === 'schema' || kind === 'unknown_enum') return 'high';
    if (kind === 'deprecation' || kind === 'ratelimit' || kind === 'version') return 'medium';
    return 'medium';
}

export function computeDedupKey(integrationCode: string, kind: string, subjectKey: string, signature: string): string {
    return crypto.createHash('sha256').update(`${integrationCode}|${kind}|${subjectKey}|${signature}`).digest('hex');
}

export class FindingService {
    /** Test/özel depolama için (DB yok). `undefined` => varsayılan (ApplicationDB.IntegrationFindings). */
    public static setSink(sink: FindingSink | undefined): void { customSink = sink; }
    public static setReader(reader: FindingReader | undefined): void { customReader = reader; }

    /**
     * Bir bulguyu KAYDEDER/GÜNCELLER (upsert). ASLA fırlatmaz/reddetmez — çağıran (bekçi/enum raportörü)
     * `void`/fire-and-forget ile çağırabilir. Regresyon: `fixed` bir bulgu `closedAt + 24 sa` sonra aynı
     * `dedupKey` ile tekrar görülürse `new`'e döner (ADR-0018 Karar 2).
     */
    public static async report(input: ReportFindingInput): Promise<void> {
        try {
            const signature = input.signature ?? input.subjectKey;
            const dedupKey = computeDedupKey(input.integrationCode, input.kind, input.subjectKey, signature);
            const reader = customReader ?? defaultReader;
            const existing = await reader(dedupKey).catch(() => null);

            const now = new Date();
            const affectedTenants = existing ? [...existing.affectedTenants] : [];
            if (typeof input.tenantId === 'number' && !affectedTenants.includes(input.tenantId) && affectedTenants.length < MAX_AFFECTED_TENANTS) {
                affectedTenants.push(input.tenantId);
            }
            const occurrences = (existing?.occurrences ?? 0) + 1;
            const firstSeenAt = existing?.firstSeenAt ?? now;

            const isRegression = !!existing && existing.status === 'fixed' && !!existing.closedAt
                && (now.getTime() - new Date(existing.closedAt).getTime()) >= REGRESSION_WINDOW_MS;

            const status: IntegrationFindingStatus = isRegression ? 'new' : (existing?.status ?? 'new');
            const closedAt = isRegression ? undefined : existing?.closedAt;

            const continuityMs = now.getTime() - new Date(firstSeenAt).getTime();
            const confirmed = affectedTenants.length >= 2
                || (occurrences >= CONFIRM_MIN_OBSERVATIONS && continuityMs >= CONFIRM_MIN_CONTINUITY_MS)
                || input.source === 'probe' || input.source === 'manual';

            const severity = input.severity ?? existing?.severity ?? computeDefaultSeverity(input.kind, {
                affectedTenantsCount: affectedTenants.length, httpStatus: input.evidence?.httpStatus,
            });

            const record: Record<string, any> = {
                dedupKey,
                integrationCode: input.integrationCode,
                category: input.category,
                kind: input.kind,
                source: input.source,
                subjectKey: clip(input.subjectKey, MAX_STRING_FIELD),
                severity,
                evidence: redactEvidence(input.evidence),
                occurrences,
                firstSeenAt,
                lastSeenAt: now,
                affectedTenants,
                confirmed,
                status,
                closedAt,
            };
            if (input.adapterVersionSeen) record.adapterVersionSeen = clip(input.adapterVersionSeen, 32);
            if (input.recommendation) record.recommendation = clip(input.recommendation, MAX_RECOMMENDATION);
            if (existing?.fixedInAdapterVersion) record.fixedInAdapterVersion = existing.fixedInAdapterVersion;
            if (existing?.fixRef) record.fixRef = existing.fixRef;
            if (existing?.decidedBy) record.decidedBy = existing.decidedBy;
            if (existing?.decidedAt) record.decidedAt = existing.decidedAt;
            if (existing?.notes) record.notes = existing.notes;

            const sink = customSink ?? defaultSink;
            await sink('upsert', record);

            // ADR-0018 Karar 2 "Alarm": confirmed && severity>=high olan bulgu new'e geçtiğinde R12 çağırır.
            // ADR-0029 NB8: kanca (`setAlertHook`) bootstrap'ta `platformNotify('PLATFORM_COMPLIANCE_FINDING')`e bağlanır; kanca yoksa no-op. Hata YUTULUR.
            if (confirmed && (severity === 'high' || severity === 'critical') && status === 'new' && (!existing || existing.status !== 'new')) {
                FindingService.raiseAlert({ integrationCode: input.integrationCode, kind: input.kind, severity, findingId: dedupKey.slice(0, 16) });
            }
        } catch (e: any) {
            // eslint-disable-next-line no-console
            log.error('FINDINGSERVICE_KAYIT_YAZILAMADI_BEST_EFFORT', 'kayıt yazılamadı (best-effort):', { err: e });
        }
    }

    /** ADR-0029 NB8: R12 alarm kancası (bootstrap `platformNotify`a bağlar). `undefined` => no-op. Kanca hatası/promise reddi bulgu kaydını ETKİLEMEZ. */
    public static setAlertHook(hook: AlertHook | undefined): void { customAlertHook = hook; }

    private static raiseAlert(ctx: AlertContext): void {
        try { void Promise.resolve(customAlertHook?.(ctx)).catch(() => undefined); } catch { /* en iyi caba */ }
    }

    /** Basit liste (Aşama B `IntegrationComplianceService`'in temel taşı; bugün yalnız iç/test kullanımı). */
    public static async list(filter: Partial<{ integrationCode: string; status: IntegrationFindingStatus; kind: IntegrationFindingKind }> = {}): Promise<IntegrationFindingRecord[]> {
        const model = await getModel();
        return model.find(filter).sort({ lastSeenAt: -1 }).limit(200).lean();
    }

    /**
     * Yaşam döngüsü geçişi (triage/accept/wontfix/false_positive/fixed). `fixed` için `fixRef` ZORUNLUDUR
     * (ADR-0018 Karar 2 "fixRef zorunlu"). Kapanan durumlar `closedAt`'i şimdiki zamana ayarlar (TTL bunu kullanır).
     */
    public static async transition(
        dedupKey: string,
        action: 'triage' | 'accept' | 'wontfix' | 'false_positive' | 'fixed',
        opts: { decidedBy: string; fixRef?: string; fixedInAdapterVersion?: string; notes?: string } = { decidedBy: 'unknown' },
    ): Promise<void> {
        const statusByAction: Record<typeof action, IntegrationFindingStatus> = {
            triage: 'triaged', accept: 'accepted', wontfix: 'wontfix', false_positive: 'false_positive', fixed: 'fixed',
        } as const;
        const status = statusByAction[action];
        if (action === 'fixed' && !opts.fixRef) {
            throw new Error('[FindingService.transition] fixed geçişi için fixRef ZORUNLUDUR (ADR-0018 Karar 2).');
        }
        const now = new Date();
        const record: Record<string, any> = {
            dedupKey, status, decidedBy: clip(opts.decidedBy, 100), decidedAt: now,
        };
        if (opts.notes) record.notes = clip(opts.notes, MAX_STRING_FIELD);
        if (opts.fixRef) record.fixRef = clip(opts.fixRef, 200);
        if (opts.fixedInAdapterVersion) record.fixedInAdapterVersion = clip(opts.fixedInAdapterVersion, 32);
        if (CLOSED_STATUSES.has(status)) record.closedAt = now;

        const sink = customSink ?? defaultSink;
        await sink('transition', record);
    }
}

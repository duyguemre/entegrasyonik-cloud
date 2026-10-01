import { IService } from '@interfaces/index'
import { BaseApi } from '../../BaseApi'
import { ApplicationError } from '@platform/core/security/Security'
import { AuditLogger } from '@services/audit/AuditLogger'
import { FindingService, type IntegrationFindingRecord } from '@integration/compliance/FindingService'
import { listIntegrationDescriptors } from '@integration/catalog/IntegrationDescriptorRegistry'
import { INTEGRATION_CATEGORIES, type IntegrationCategory } from '@integration/catalog/types'
import {
    INTEGRATION_FINDING_KINDS, INTEGRATION_FINDING_SEVERITIES, INTEGRATION_FINDING_STATUSES,
    type IntegrationFindingKind, type IntegrationFindingSeverity, type IntegrationFindingStatus,
} from '@database/application/models/IntegrationFinding'

// ADR-0018 Karar 2 "Konsol" + Karar 4 tablosu "Aşama B" satırı — `IntegrationComplianceService`: platformAdmin
// API. Yalnız `platformAdmin` çağırabilir; kademe kontrolü RunOperation'da yapılır, burada TEKRARLANMAZ (ADR-0001
// Karar 8, bkz. integration-config-service.ts AYNI desen).
//
// TÜKETİR, YENİDEN YAZMAZ: `FindingService.report/list/transition` ZATEN VAR (ADR-0018 Aşama A). Bu servis onun
// ÜZERİNE ince bir sunum/filtre/yetki katmanıdır. `ContractGuard`/`ProbeRunner`/`SourceMonitor` DEĞİŞTİRİLMEDİ.
//
// R12 ALARM BAĞLANTISI (görev raporunda ayrıca belirtilir): ADR-0017'nin gerçek `raiseAlert`/`MetricsRegistry`
// arayüzü bu görevde de KODDA YOK (doğrulandı: `grep raiseAlert` yalnız FindingService.ts'te, orada da NO-OP).
// `FindingService.report()` zaten `confirmed && severity>=high` bulgu `new`'e geçtiğinde bir NO-OP `raiseAlert`
// çağırır (bkz. FindingService.ts `noopRaiseAlert`). Bu servisin `transition()` metodu bulguyu ASLA 'new'e
// TAŞIMAZ (triage/accept/wontfix/false_positive/fixed hedefleri arasında 'new' yoktur; 'new'e dönüş yalnızca
// `report()`'un regresyon dalıyla olur) — bu yüzden burada İKİNCİ bir R12 çağrısı YAPILMAZ/gerekmez; mevcut
// no-op zaten ADR'nin öngördüğü "0017 birleşmemişse no-op adaptör" kuralını karşılıyor.
//
// BİLİNÇLİ KAPSAM SINIRLARI (rapora yazılır):
//  - `summary()` yalnız görev tanımındaki alanları döner: adapterVersion, lastVerifiedAt, son probe sonucu, açık
//    bulgu sayıları (şiddete göre). ADR Karar 2 Konsol'un "izlenen kaynakların durumu" (SourceMonitor/SourceSnapshot)
//    maddesi BU SERVİSTE YOK (görev tanımının açık alan listesinde yer almıyor; ayrı bir uzatma gerekir).
//  - `list()`, `FindingService.list()`'in kapasitesiyle (integrationCode/kind/status filtreleri, en fazla 200 kayıt,
//    `lastSeenAt` azalan) SINIRLIDIR; `category`/`severity` filtreleri bu serviste BELLEKTE uygulanır (FindingService
//    ARAYÜZÜ DEĞİŞTİRİLMEDİ). Bu ölçekte (ADR: "ayda onlarca bulgu") yeterlidir; >200 açık bulgu birikirse
//    `FindingService.list()`'e sayfalama eklenmesi gerekir (bu görevin kapsamı dışı, bulgu olarak işaretlendi).
//  - `wontfix`/`accept` için gerekçe (reason) ZORUNLU TUTULMADI: ADR Karar 2 yalnızca `fixed` için `fixRef`'i
//    "zorunlu" olarak işaretliyor (Konsol: "fixRef zorunlu"); diğer eylemler için metin zorunluluğu YAZMIYOR.
//    `FindingService.transition()` zaten yalnız `fixed`+`fixRef` eksikliğinde fırlatıyor; burada TEKRARLANMADI.

const PROBE_JOB_NAME = 'compliance.probeRunner' // ProbeScheduler.ts `defineJob({ name: ... })` İLE AYNI OLMALI (ayrı bir kayıt yok, isim eşleşmesine dayanır — ADR belirsizliği, rapora yazıldı).

const TRANSITION_ACTIONS = ['triage', 'accept', 'wontfix', 'false_positive', 'fixed'] as const
type TransitionAction = typeof TRANSITION_ACTIONS[number]

const CLOSED_STATUSES: ReadonlySet<IntegrationFindingStatus> = new Set(['fixed', 'wontfix', 'false_positive'])

function assertOneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T | undefined {
    if (value === undefined || value === null || value === '') return undefined
    if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
        throw new ApplicationError(`${field} geçersiz. Beklenen: ${allowed.join(' | ')}`, 400, 'VALIDATION')
    }
    return value as T
}

function toListDto(rec: IntegrationFindingRecord) {
    return {
        dedupKey: rec.dedupKey,
        integrationCode: rec.integrationCode,
        category: rec.category,
        kind: rec.kind,
        source: rec.source,
        subjectKey: rec.subjectKey,
        severity: rec.severity,
        status: rec.status,
        confirmed: rec.confirmed,
        occurrences: rec.occurrences,
        firstSeenAt: rec.firstSeenAt,
        lastSeenAt: rec.lastSeenAt,
        affectedTenantsCount: Array.isArray(rec.affectedTenants) ? rec.affectedTenants.length : 0,
        adapterVersionSeen: rec.adapterVersionSeen,
        fixedInAdapterVersion: rec.fixedInAdapterVersion,
        fixRef: rec.fixRef,
    }
}

/** Detay: kanıt dahil TAM kayıt (kanıt yazım anında zaten `redactEvidence` ile redakte edilmiştir); etkilenen
 * tenant KİMLİKLERİ (yalnız sayı listesi) yalnız platformAdmin'e (ADR Karar 2 "Detay") — bu servis TAMAMEN
 * platformAdmin olduğundan burada saklamaya gerek yok. */
function toDetailDto(rec: IntegrationFindingRecord) {
    return {
        ...toListDto(rec),
        affectedTenants: Array.isArray(rec.affectedTenants) ? [...rec.affectedTenants] : [],
        evidence: rec.evidence,
        recommendation: rec.recommendation,
        decidedBy: rec.decidedBy,
        decidedAt: rec.decidedAt,
        notes: rec.notes,
        closedAt: rec.closedAt,
    }
}

export default class IntegrationComplianceService extends BaseApi implements IService {

    async get(): Promise<any> {
        // IService gereksinimi; RunOperation GET /:service rotasında `.get()`i çağırır (integration-config-service.ts
        // ile AYNI desen) -- burada listeye yönlendirilir, davranış ayrışmaz.
        return this.list()
    }

    private actor(): string {
        const sub = this.request?.principal?.sub
        if (!sub) throw new ApplicationError('Kimlik doğrulanamadı.', 401)
        return String(sub)
    }

    private async findByDedupKey(id: string): Promise<IntegrationFindingRecord | null> {
        const model = this.applicationDB.getIntegrationFindingModel()
        return model.findOne({ dedupKey: id }).lean()
    }

    /** `platform.integration_compliance.list` — filtreler: entegrasyon, kategori, tür, şiddet, durum (Karar 2 "Konsol"). */
    async list(): Promise<any> {
        const req = this.request || {}
        const integrationCode = typeof req.integrationCode === 'string' && req.integrationCode ? req.integrationCode : undefined
        const kind = assertOneOf<IntegrationFindingKind>(req.kind, INTEGRATION_FINDING_KINDS, 'kind')
        const status = assertOneOf<IntegrationFindingStatus>(req.status, INTEGRATION_FINDING_STATUSES, 'status')
        const category = assertOneOf<IntegrationCategory>(req.category, INTEGRATION_CATEGORIES, 'category')
        const severity = assertOneOf<IntegrationFindingSeverity>(req.severity, INTEGRATION_FINDING_SEVERITIES, 'severity')

        const baseFilter: Partial<{ integrationCode: string; status: IntegrationFindingStatus; kind: IntegrationFindingKind }> = {}
        if (integrationCode) baseFilter.integrationCode = integrationCode
        if (kind) baseFilter.kind = kind
        if (status) baseFilter.status = status

        const rows = await FindingService.list(baseFilter)
        const filtered = rows.filter((r) => (!category || r.category === category) && (!severity || r.severity === severity))
        return filtered.map(toListDto)
    }

    /** `platform.integration_compliance.summary` — entegrasyon başına özet kartı (Karar 2 "Konsol"). */
    async summary(): Promise<any> {
        const descriptors = listIntegrationDescriptors()
        let lastProbeRun: { name: string; lastFinishedAt: Date | null; lastStatus: string | null; lastCounts: unknown } | null = null
        try {
            const jobState = await this.applicationDB.getJobStateModel().findOne({ name: PROBE_JOB_NAME })
            if (jobState) {
                lastProbeRun = {
                    name: PROBE_JOB_NAME,
                    lastFinishedAt: jobState.lastFinishedAt ?? null,
                    lastStatus: jobState.lastStatus ?? null,
                    lastCounts: jobState.lastCounts ?? null,
                }
            }
        } catch {
            lastProbeRun = null // best-effort: JobState okunamazsa özet kartı yine de döner (probe bilgisi olmadan)
        }

        const out: any[] = []
        for (const d of descriptors) {
            const rows = await FindingService.list({ integrationCode: d.code })
            const open = rows.filter((r) => !CLOSED_STATUSES.has(r.status))
            const bySeverity: Record<IntegrationFindingSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
            for (const r of open) bySeverity[r.severity] = (bySeverity[r.severity] ?? 0) + 1
            out.push({
                integrationCode: d.code,
                displayName: d.displayName,
                category: d.category,
                adapterVersion: d.adapterVersion,
                lastVerifiedAt: d.api.lastVerifiedAt ?? null,
                openFindings: { total: open.length, bySeverity },
                // Not: probe tek bir platform-düzeyi tur olarak koşar (ProbeScheduler `runType:'scheduler'`,
                // `scope.level:'platform'`); entegrasyon başına AYRI bir koşu YOK -- bu yüzden `lastProbeRun`
                // TÜM entegrasyonlar için AYNIDIR (bkz. dosya başı ADR belirsizliği notu).
                lastProbeRun,
            })
        }
        return out
    }

    /** `platform.integration_compliance.get_detail` — tek bulgunun tam kaydı (kanıt dahil, Karar 2 "Detay"). */
    async getDetail(): Promise<any> {
        const id = this.request?.id
        if (typeof id !== 'string' || !id) throw new ApplicationError('id zorunludur.', 400, 'VALIDATION')
        const rec = await this.findByDedupKey(id)
        if (!rec) throw new ApplicationError('Bulgu bulunamadı.', 404, 'NOT_FOUND')
        return toDetailDto(rec)
    }

    /** `platform.integration_compliance.transition` — triage/accept/wontfix/false_positive/fixed (Karar 2 "Eylemler"). */
    async transition(): Promise<any> {
        const id = this.request?.id
        if (typeof id !== 'string' || !id) throw new ApplicationError('id zorunludur.', 400, 'VALIDATION')
        const action = assertOneOf<TransitionAction>(this.request?.action, TRANSITION_ACTIONS, 'action')
        if (!action) throw new ApplicationError('action zorunludur.', 400, 'VALIDATION')

        const existing = await this.findByDedupKey(id)
        if (!existing) throw new ApplicationError('Bulgu bulunamadı.', 404, 'NOT_FOUND')

        const actor = this.actor()
        const opts: { decidedBy: string; fixRef?: string; fixedInAdapterVersion?: string; notes?: string } = { decidedBy: actor }
        if (typeof this.request?.reason === 'string' && this.request.reason) opts.notes = this.request.reason
        if (typeof this.request?.fixRef === 'string' && this.request.fixRef) opts.fixRef = this.request.fixRef
        if (typeof this.request?.fixedInAdapterVersion === 'string' && this.request.fixedInAdapterVersion) opts.fixedInAdapterVersion = this.request.fixedInAdapterVersion

        try {
            // `FindingService.transition` 'fixed' için `fixRef` eksikse fırlatır (ADR: "fixRef zorunlu") -- burada
            // TEKRAR DOĞRULANMAZ (tek doğruluk kaynağı).
            await FindingService.transition(id, action, opts)
        } catch (e: any) {
            void AuditLogger.fromRequest(this.request, 'integration_compliance.transition', 'error', { id, action })
            throw new ApplicationError(e?.message ?? 'Geçiş başarısız.', 400, 'VALIDATION')
        }

        void AuditLogger.fromRequest(this.request, 'integration_compliance.transition', 'ok', { id, action, integrationCode: existing.integrationCode, kind: existing.kind })

        const updated = await this.findByDedupKey(id)
        return toDetailDto(updated!)
    }
}

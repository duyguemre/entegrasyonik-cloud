import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { ApplicationError } from '../Security'
import { AuditLogger } from '@services/audit/AuditLogger'
import { config } from '@config'
import { getIntegrationDescriptor, listIntegrationDescriptors } from '@integration/catalog/IntegrationDescriptorRegistry'
import { listSettings, getSettingDef, CATALOG_VERSION } from '@integration/config/catalog'
import { resolveEffectiveConfig } from '@integration/config/ConfigResolver'
import { ENGINE_TARGET } from '@integration/config/targets'
import * as repo from '@integration/config/revisionRepository'
import type { RevisionModels } from '@integration/config/revisionRepository'
import { validatePatch } from '@integration/config/validatePatch'
import { computeDiff, highestDanger, computeActiveTenantsImpact, type DiffEntry } from '@integration/config/diffAndImpact'
import { assertApprovalSatisfied, ApprovalRequiredError } from '@integration/config/approvalGate'
import { setTargetIntake, type IntakeValue } from '@integration/config/platformOverrideStore'

// ADR-0020 Karar 3/6 (Aşama B) + Karar 3.8/5 (Aşama D) — `IntegrationConfigService`: taslak/fark/onay/yayın/geri
// alma/kilit/statik test + kill-switch (`setIntake`) + drift önerisi (`proposeFromFinding`). Yalnız `platformAdmin`
// (OPERATION_POLICY, capabilities/domains/platform.ts) çağırabilir; kademe kontrolü RunOperation'da yapılır, burada
// TEKRARLANMAZ (ADR-0001 Karar 8).
//
// BİLİNÇLİ KAPSAM SINIRLARI (rapora yazılır):
//  - `testEndpoint` yalnız `static`/`replay` (replay bu turda BAĞLANMADI, ADR-0018 `ProbeRunner` gerekir); `live` her
//    zaman "platform test hesabı tanımlı değil" döner (E3: sahte başarı YOK).
//  - `setIntake`: motor tüketicileri (Dispatcher/OrderQueueProducer/StockPublishTrigger/IntegrationService)
//    `platformOverrideStore.isIntakeOpen()`'ı BU GÖREVDE ÇAĞIRMAZ (yalnız OKUNABİLİR durum + bu uç kuruldu; bağlama
//    ayrı BACKLOG kalemi — görev talimatı, "hızlandırma eşiği" bugün karşılanmıyor). ADR-0017 `IntegrationHealthItem`
//    (bakım nedeni → tenant sağlığı) HENÜZ KODDA YOK (doğrulandı, `grep IntegrationHealthItem` = 0 model) — bu yüzden
//    bakım nedeni yalnız `Heads.maintenance`de durur, sağlık modeline YAZILMAZ (ADR-0017 birleştiğinde bağlanır).
//    ADR-0019 `SystemFlags.disabledCapabilities` ile ilişki (Karar 3.8 son paragraf) BİLİNÇLİ olarak ENTEGRE
//    EDİLMEDİ (ayrı ADR/görev; ikisi bağımsız birer "geçici kapalı" nedeni olarak var olabilir).
//  - `proposeFromFinding`: yalnız BİLGİ taşıyan bir taslak açar (host/replacementKey ÖNERİSİ), hiçbir değeri
//    taslağa OTOMATİK YAZMAZ (ADR Karar 5 kuralı — admin `SettingField` formundan elle uygular).

function assertKnownTarget(target: unknown): string {
    if (typeof target !== 'string' || target.length === 0) throw new ApplicationError('target zorunludur.', 400, 'VALIDATION')
    if (target === ENGINE_TARGET) return target
    const descriptor = getIntegrationDescriptor(target)
    if (!descriptor) throw new ApplicationError(`Bilinmeyen hedef: ${target}`, 404, 'NOT_FOUND')
    return target
}

function descriptorHostInfo(target: string) {
    if (target === ENGINE_TARGET) return undefined
    const d = getIntegrationDescriptor(target)
    return d ? { allowedHosts: d.config.hosts, retiredEndpoints: d.config.retiredEndpoints } : undefined
}

/** Bu hedefte (scope uyumlu) tanımlı TÜM katalog anahtarları. */
function applicableSettingKeys(target: string): string[] {
    return listSettings()
        .filter((s) => (target === ENGINE_TARGET ? s.scope !== 'integration' : s.scope !== 'engine'))
        .map((s) => s.key)
}

export default class IntegrationConfigService extends BaseApi implements IService {

    async get(): Promise<any> {
        // IService gereksinimi; gerçek "get" işi aşağıdaki getEffectiveConfig()'tedir (RunOperation.ts `.get()`i
        // GET /:service rotasında çağırır -- burada YENİDEN yönlendirilir, davranış ayrışmaz).
        return this.getEffectiveConfig()
    }

    private models(): RevisionModels {
        return { revisionModel: this.applicationDB.getIntegrationConfigRevisionModel(), headModel: this.applicationDB.getIntegrationConfigHeadModel() }
    }

    private actor(): string {
        const sub = this.request?.principal?.sub
        if (!sub) throw new ApplicationError('Kimlik doğrulanamadı.', 401)
        return String(sub)
    }

    /** `platform.integrations.list` — tüm hedeflerin (6 entegrasyon + `_engine`) özet durumu. */
    async list(): Promise<any> {
        const models = this.models()
        const targets: string[] = [ENGINE_TARGET, ...listIntegrationDescriptors().map((d) => d.code)]
        const out = []
        for (const target of targets) {
            const [head, draft] = await Promise.all([repo.getHead(models, target), repo.getDraft(models, target)])
            const descriptor = target === ENGINE_TARGET ? undefined : getIntegrationDescriptor(target)
            out.push({
                target,
                displayName: descriptor?.displayName ?? 'Motor ayarları',
                category: descriptor?.category ?? 'engine',
                adapterVersion: descriptor?.adapterVersion,
                publishedVersion: head.publishedVersion,
                intake: head.intake,
                hasDraft: !!draft,
                draftLockedBy: draft?.lockedBy,
            })
        }
        return out
    }

    /** `platform.integrationConfig.get` — etkin yapılandırma + her değerin kaynağı (DB'den DOĞRUDAN, yoklama önbelleğinden DEĞİL). */
    async getEffectiveConfig(): Promise<any> {
        const target = assertKnownTarget(this.request?.target)
        const models = this.models()
        const published = await repo.getPublished(models, target)
        const integrationCode = target === ENGINE_TARGET ? undefined : target

        const values = applicableSettingKeys(target).map((key) => resolveEffectiveConfig(key, {
            integrationCode,
            readPlatformOverride: (k) => {
                const v = published?.overrides?.[k]
                return v === undefined ? undefined : { value: v, revision: published!.version }
            },
        }))

        return { target, publishedVersion: published?.version ?? 0, catalogVersion: CATALOG_VERSION, values }
    }

    /** `platform.integrationConfig.history` */
    async history(): Promise<any> {
        const target = assertKnownTarget(this.request?.target)
        const limit = Number.isInteger(this.request?.limit) ? Math.min(Math.max(this.request.limit, 1), 100) : 50
        const rows = await repo.listHistory(this.models(), target, limit)
        return rows.map((r) => ({
            version: r.version, status: r.status, createdBy: r.createdBy, createdAt: r.createdAt,
            publishedBy: r.publishedBy, publishedAt: r.publishedAt, reason: r.reason, diff: r.diff,
            origin: r.origin, approvedBy: r.approvedBy,
        }))
    }

    /** `platform.integrationConfig.saveDraft` */
    async saveDraft(): Promise<any> {
        const target = assertKnownTarget(this.request?.target)
        const patch = (this.request?.patch && typeof this.request.patch === 'object') ? this.request.patch : {}
        const unset: string[] = Array.isArray(this.request?.unset) ? this.request.unset : []
        const actor = this.actor()

        const errors = validatePatch(patch, { target, descriptor: descriptorHostInfo(target) })
        if (errors.length) throw new ApplicationError(errors.map((e) => e.message).join(' | '), 400, 'VALIDATION')

        const models = this.models()
        try {
            const draft = await repo.getOrCreateDraft(models, { target, catalogVersion: CATALOG_VERSION, createdBy: actor })
            const expectedDraftRev = Number.isInteger(this.request?.expectedDraftRev) ? this.request.expectedDraftRev : draft.draftRev
            const updated = (Object.keys(patch).length || unset.length)
                ? await repo.saveDraftPatch(models, { target, expectedDraftRev, patch, unset, updatedBy: actor })
                : draft
            void AuditLogger.fromRequest(this.request, 'integration_config.save_draft', 'ok', { target, version: updated.version, draftRev: updated.draftRev, changedKeys: Object.keys(patch).length })
            return { target, version: updated.version, draftRev: updated.draftRev, overrides: updated.overrides }
        } catch (e) {
            void AuditLogger.fromRequest(this.request, 'integration_config.save_draft', 'error', { target })
            if (e instanceof repo.DraftConflictError) throw new ApplicationError('Taslak başka bir işlemle değişti; farkı yeniden gözden geçirin.', 409, 'DRAFT_CONFLICT')
            if (e instanceof repo.NoDraftError) throw new ApplicationError('Açık taslak bulunamadı.', 404, 'NOT_FOUND')
            throw e
        }
    }

    /** `platform.integrationConfig.discardDraft` */
    async discardDraft(): Promise<any> {
        const target = assertKnownTarget(this.request?.target)
        const expectedDraftRev = Number.isInteger(this.request?.expectedDraftRev) ? this.request.expectedDraftRev : undefined
        if (expectedDraftRev === undefined) throw new ApplicationError('expectedDraftRev zorunludur.', 400, 'VALIDATION')
        try {
            await repo.discardDraft(this.models(), target, expectedDraftRev)
            void AuditLogger.fromRequest(this.request, 'integration_config.discard_draft', 'ok', { target })
            return { target, discarded: true }
        } catch (e) {
            void AuditLogger.fromRequest(this.request, 'integration_config.discard_draft', 'error', { target })
            if (e instanceof repo.DraftConflictError) throw new ApplicationError('Taslak başka bir işlemle değişti.', 409, 'DRAFT_CONFLICT')
            if (e instanceof repo.NoDraftError) throw new ApplicationError('Açık taslak bulunamadı.', 404, 'NOT_FOUND')
            throw e
        }
    }

    private async buildPreview(target: string, draftOverrides: Record<string, unknown>, published: repo.RevisionDoc | null) {
        const integrationCode = target === ENGINE_TARGET ? undefined : target
        const diff: DiffEntry[] = computeDiff(published?.overrides ?? {}, draftOverrides, getSettingDef)
        const impact = await computeActiveTenantsImpact(this.applicationDB, target)
        const danger = highestDanger(diff)
        const restartCount = diff.filter((d) => getSettingDef(d.key)?.applies === 'restart').length
        void integrationCode
        return { diff, impact, danger, restartCount }
    }

    /** `platform.integrationConfig.previewPublish` — YALNIZ okur, hiçbir şey YAZMAZ. */
    async previewPublish(): Promise<any> {
        const target = assertKnownTarget(this.request?.target)
        const models = this.models()
        const [draft, published] = await Promise.all([repo.getDraft(models, target), repo.getPublished(models, target)])
        if (!draft) throw new ApplicationError('Açık taslak bulunamadı.', 404, 'NOT_FOUND')
        const preview = await this.buildPreview(target, draft.overrides, published)
        return {
            target, draftVersion: draft.version, basedOnVersion: draft.basedOnVersion,
            ...preview,
            requiresReason: preview.danger !== 'safe',
            requiresTypedApproval: preview.danger === 'dangerous',
        }
    }

    /** `platform.integrationConfig.publish` */
    async publish(): Promise<any> {
        const target = assertKnownTarget(this.request?.target)
        const actor = this.actor()
        const models = this.models()
        const [draft, published] = await Promise.all([repo.getDraft(models, target), repo.getPublished(models, target)])
        if (!draft) throw new ApplicationError('Açık taslak bulunamadı.', 404, 'NOT_FOUND')

        const { diff, impact, danger } = await this.buildPreview(target, draft.overrides, published)

        try {
            assertApprovalSatisfied({
                danger, target, publishedBy: actor,
                reason: this.request?.reason, typedConfirmation: this.request?.typedConfirmation,
                approvedBy: this.request?.approvedBy,
                twoPersonRuleEnabled: config.integrationConfig.twoPersonRuleEnabled,
            })
        } catch (e) {
            void AuditLogger.fromRequest(this.request, 'integration_config.publish', 'error', { target, reason: 'approval_required' })
            if (e instanceof ApprovalRequiredError) throw new ApplicationError(e.message, 400, 'APPROVAL_REQUIRED')
            throw e
        }

        try {
            const result = await repo.publishDraft(models, {
                target, draft, diff, impact, reason: this.request?.reason, publishedBy: actor, approvedBy: this.request?.approvedBy,
            })
            void AuditLogger.fromRequest(this.request, 'integration_config.publish', 'ok', {
                target, fromVersion: published?.version ?? 0, toVersion: result.revision.version, changedKeys: diff.length, dangerLevel: danger,
            })
            return { target, version: result.revision.version, publishedVersion: result.head.publishedVersion, diff }
        } catch (e) {
            void AuditLogger.fromRequest(this.request, 'integration_config.publish', 'error', { target })
            if (e instanceof repo.PublishConflictError) throw new ApplicationError('Siz düzenlerken yeni bir sürüm yayınlandı. Farkı yeniden gözden geçirin.', 409, 'PUBLISH_CONFLICT')
            if (e instanceof repo.DraftConflictError) throw new ApplicationError('Taslak başka bir işlemle değişti.', 409, 'DRAFT_CONFLICT')
            throw e
        }
    }

    /** `platform.integrationConfig.rollback` — eski sürümün `overrides`'ını YENİ bir revizyon olarak, AYNI onay kapısından yayınlar. */
    async rollback(): Promise<any> {
        const target = assertKnownTarget(this.request?.target)
        const toVersion = Number(this.request?.toVersion)
        if (!Number.isInteger(toVersion) || toVersion < 1) throw new ApplicationError('toVersion geçerli bir sürüm numarası olmalıdır.', 400, 'VALIDATION')
        const actor = this.actor()
        const models = this.models()

        const [source, published] = await Promise.all([repo.getRevisionByVersion(models, target, toVersion), repo.getPublished(models, target)])
        if (!source) throw new ApplicationError(`Sürüm bulunamadı: ${toVersion}`, 404, 'NOT_FOUND')

        const { diff, impact, danger } = await this.buildPreview(target, source.overrides, published)
        try {
            assertApprovalSatisfied({
                danger, target, publishedBy: actor,
                reason: this.request?.reason, typedConfirmation: this.request?.typedConfirmation,
                approvedBy: this.request?.approvedBy,
                twoPersonRuleEnabled: config.integrationConfig.twoPersonRuleEnabled,
            })
        } catch (e) {
            void AuditLogger.fromRequest(this.request, 'integration_config.rollback', 'error', { target, reason: 'approval_required' })
            if (e instanceof ApprovalRequiredError) throw new ApplicationError(e.message, 400, 'APPROVAL_REQUIRED')
            throw e
        }

        try {
            const result = await repo.rollbackToVersion(models, {
                target, toVersion, createdBy: actor, reason: this.request?.reason ?? `Sürüm ${toVersion}'e geri alındı.`,
                catalogVersion: CATALOG_VERSION, diff, impact,
            })
            void AuditLogger.fromRequest(this.request, 'integration_config.rollback', 'ok', { target, fromVersion: published?.version ?? 0, toVersion: result.revision.version, rollbackTo: toVersion })
            return { target, version: result.revision.version, publishedVersion: result.head.publishedVersion }
        } catch (e) {
            void AuditLogger.fromRequest(this.request, 'integration_config.rollback', 'error', { target })
            if (e instanceof repo.PublishConflictError) throw new ApplicationError('Siz düzenlerken yeni bir sürüm yayınlandı.', 409, 'PUBLISH_CONFLICT')
            if (e instanceof repo.DraftConflictError) throw new ApplicationError('Hedefte açık bir taslak var; önce onu kapatın.', 409, 'DRAFT_CONFLICT')
            throw e
        }
    }

    /** `platform.integrationConfig.takeOverLock` */
    async takeOverLock(): Promise<any> {
        const target = assertKnownTarget(this.request?.target)
        const actor = this.actor()
        try {
            const draft = await repo.takeOverLock(this.models(), target, actor)
            void AuditLogger.fromRequest(this.request, 'integration_config.lock_takeover', 'ok', { target })
            return { target, lockedBy: draft.lockedBy, lockedAt: draft.lockedAt, draftRev: draft.draftRev }
        } catch (e) {
            void AuditLogger.fromRequest(this.request, 'integration_config.lock_takeover', 'error', { target })
            if (e instanceof repo.NoDraftError) throw new ApplicationError('Açık taslak bulunamadı.', 404, 'NOT_FOUND')
            throw e
        }
    }

    /**
     * `platform.integrationConfig.testEndpoint` — YALNIZ statik + replay (Karar 3.9). Canlı mod ADR-0018 B+
     * gerektirir ve bu görevde BAĞLANMADI: her zaman "platform test hesabı tanımlı değil" döner (E3: sahte başarı yok).
     */
    async testEndpoint(): Promise<any> {
        const target = assertKnownTarget(this.request?.target)
        const mode = this.request?.mode === 'replay' ? 'replay' : this.request?.mode === 'live' ? 'live' : 'static'
        const key = this.request?.key

        if (mode === 'live') {
            return { target, key, mode, ok: false, message: 'Canlı doğrulama için platform test hesabı tanımlı değil.' }
        }
        if (mode === 'replay') {
            return { target, key, mode, ok: false, message: 'Replay modu (ADR-0018 ProbeRunner) bu aşamada bağlanmadı.' }
        }
        if (typeof key !== 'string' || !getSettingDef(key)) {
            return { target, key, mode, ok: false, message: 'Bilinmeyen ayar anahtarı.' }
        }
        const value = this.request?.value
        const errors = value === undefined ? [] : validatePatch({ [key]: value }, { target, descriptor: descriptorHostInfo(target) })
        return { target, key, mode, ok: errors.length === 0, issues: errors.map((e) => e.message) }
    }

    private parseMaintenanceInput(raw: unknown): repo.HeadDoc['maintenance'] | undefined {
        if (raw === undefined || raw === null) return undefined
        if (typeof raw !== 'object') throw new ApplicationError('maintenance geçersiz biçimde.', 400, 'VALIDATION')
        const m = raw as Record<string, unknown>
        const msgRaw = (m.message && typeof m.message === 'object') ? m.message as Record<string, unknown> : {}
        const tr = typeof msgRaw.tr === 'string' ? msgRaw.tr.slice(0, 500) : undefined
        const en = typeof msgRaw.en === 'string' ? msgRaw.en.slice(0, 500) : undefined
        let until: Date | undefined
        if (m.until !== undefined && m.until !== null) {
            const parsed = new Date(m.until as any)
            if (Number.isNaN(parsed.getTime())) throw new ApplicationError('maintenance.until geçerli bir tarih olmalıdır.', 400, 'VALIDATION')
            until = parsed
        }
        return { message: { tr, en }, until }
    }

    /**
     * `platform.integrations.setIntake` (Karar 3.8, Aşama D) — `on|drain|off` + isteğe bağlı bakım iletisi. `drain`/
     * `off` gerekçe ZORUNLUDUR (görev talimatı); `off` EK OLARAK Karar 9.1'in "dangerous yayın ve setIntake(off)"
     * onay kapısını (yazılı onay = hedef kodu + bayrak açıksa iki kişi kuralı) taşır — `approvalGate.ts` AYNEN
     * TÜKETİLİR (yeniden yazılmadı). `drain` bu ikinci katmanı taşımaz (ADR metninde yalnız "gerekçe zorunlu" açıkça
     * yazılı; typed/iki-kişi Karar 9.1'de YALNIZ `off`a bağlı — bu BİR ADR BELİRSİZLİĞİDİR, rapora yazıldı).
     * `'on'`a dönüşte `maintenance` AÇIKÇA verilmediyse TEMİZLENİR (bilinçli varsayılan: normale dönüş bakım
     * iletisini de kapatır; rapora yazıldı).
     */
    async setIntake(): Promise<any> {
        const target = assertKnownTarget(this.request?.target)
        const intake: IntakeValue | undefined = ['on', 'drain', 'off'].includes(this.request?.intake) ? this.request.intake : undefined
        if (!intake) throw new ApplicationError('intake geçersiz. Beklenen: on | drain | off', 400, 'VALIDATION')
        const actor = this.actor()

        const danger: 'safe' | 'caution' | 'dangerous' = intake === 'off' ? 'dangerous' : intake === 'drain' ? 'caution' : 'safe'
        try {
            assertApprovalSatisfied({
                danger, target, publishedBy: actor,
                reason: this.request?.reason, typedConfirmation: this.request?.typedConfirmation,
                approvedBy: this.request?.approvedBy,
                twoPersonRuleEnabled: config.integrationConfig.twoPersonRuleEnabled,
            })
        } catch (e) {
            void AuditLogger.fromRequest(this.request, 'integration_config.set_intake', 'error', { target, intake, reason: 'approval_required' })
            if (e instanceof ApprovalRequiredError) throw new ApplicationError(e.message, 400, 'APPROVAL_REQUIRED')
            throw e
        }

        const maintenanceInput = this.parseMaintenanceInput(this.request?.maintenance)
        const maintenance: repo.HeadDoc['maintenance'] | null | undefined =
            maintenanceInput !== undefined ? maintenanceInput : (intake === 'on' ? null : undefined)

        try {
            const head = await repo.setIntakeState(this.models(), { target, intake, maintenance })
            setTargetIntake(target, head.intake, head.maintenance) // yerel pod ANINDA görür; diğerleri ≤15 sn'de poll ile
            void AuditLogger.fromRequest(this.request, 'integration_config.set_intake', 'ok', {
                target, intake, reason: this.request?.reason, maintenanceUntil: head.maintenance?.until,
            })
            return { target, intake: head.intake, maintenance: head.maintenance }
        } catch (e) {
            void AuditLogger.fromRequest(this.request, 'integration_config.set_intake', 'error', { target, intake })
            throw e
        }
    }

    /**
     * `platform.integrationConfig.proposeFromFinding` (Karar 5, Aşama D) — ADR-0018 bulgusundan bir TASLAK REVİZYON
     * açar. Yalnız `kind ∈ {endpoint, version, deprecation}` VE `status ∈ {new, triaged, accepted}` kabul edilir;
     * kod değişikliği gerektiren bulgular (ör. `schema`/`unknown_enum`) REDDEDİLİR (ADR: "Panel yalnız host/eski-değer
     * temizliği yapar"). `IntegrationComplianceService`'i YENİDEN YAZMAZ, `IntegrationFindingModel`'i AYNI desenle
     * doğrudan okur (bkz. `integration-compliance-service.ts::findByDedupKey`, aynı desen tekrarlandı -- ayrı bir
     * servisi örnekleyip çağırmak yerine, `BaseApi` alt sınıflarının birbirini örneklemediği MEVCUT desenle tutarlı).
     * Öneri (host/replacementKey) yalnız BİLGİ döner, taslağa OTOMATİK DEĞER YAZMAZ (ADR'nin kendi kuralı).
     */
    async proposeFromFinding(): Promise<any> {
        const findingId = this.request?.findingId
        if (typeof findingId !== 'string' || !findingId) throw new ApplicationError('findingId zorunludur.', 400, 'VALIDATION')

        const finding = await this.applicationDB.getIntegrationFindingModel().findOne({ dedupKey: findingId }).lean()
        if (!finding) throw new ApplicationError('Bulgu bulunamadı.', 404, 'NOT_FOUND')

        const CODE_CHANGE_KINDS = new Set(['endpoint', 'version', 'deprecation'])
        if (!CODE_CHANGE_KINDS.has(finding.kind)) {
            throw new ApplicationError(`Bu bulgu türü (${finding.kind}) için ayar önerisi açılamaz: kod değişikliği gerekir.`, 400, 'VALIDATION')
        }
        const OPEN_STATUSES = new Set(['new', 'triaged', 'accepted'])
        if (!OPEN_STATUSES.has(finding.status)) {
            throw new ApplicationError(`Bulgu durumu (${finding.status}) için ayar önerisi açılamaz.`, 400, 'VALIDATION')
        }

        const target = assertKnownTarget(finding.integrationCode)
        const actor = this.actor()
        const descriptor = target === ENGINE_TARGET ? undefined : getIntegrationDescriptor(target)

        // Emekli uç eşleşmesi (Karar 5 "replacementKey'in host seçimi") -- BİLGİ amaçlı, en iyi çaba (subjectKey ya da
        // kanıt yolları desenle örtüşüyorsa). İkinci bir doğruluk kaynağı AÇILMAZ, yalnız manifestodan OKUNUR.
        const subjectHay = [finding.subjectKey, ...(finding.evidence?.paths ?? [])].filter((s): s is string => typeof s === 'string').map((s) => s.toLowerCase())
        const retiredMatch = descriptor?.config.retiredEndpoints?.find((r) => {
            const pat = r.pattern.toLowerCase()
            return subjectHay.some((h) => h.includes(pat) || pat.includes(h))
        })

        try {
            const draft = await repo.getOrCreateDraft(this.models(), {
                target, catalogVersion: CATALOG_VERSION, createdBy: actor, origin: { kind: 'finding', ref: findingId },
            })
            void AuditLogger.fromRequest(this.request, 'integration_config.propose_from_finding', 'ok', {
                target, findingId, draftVersion: draft.version, kind: finding.kind,
            })
            return {
                target, draftVersion: draft.version, draftRev: draft.draftRev, origin: draft.origin,
                finding: { dedupKey: finding.dedupKey, kind: finding.kind, status: finding.status, subjectKey: finding.subjectKey, severity: finding.severity },
                suggestion: retiredMatch ? { kind: 'retiredEndpoint', pattern: retiredMatch.pattern, replacementKey: retiredMatch.replacementKey, retiredAt: retiredMatch.retiredAt } : undefined,
                recommendation: finding.recommendation,
            }
        } catch (e) {
            void AuditLogger.fromRequest(this.request, 'integration_config.propose_from_finding', 'error', { target, findingId })
            throw e
        }
    }
}

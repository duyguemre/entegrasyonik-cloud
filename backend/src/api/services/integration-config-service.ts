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

// ADR-0020 Karar 3/6 (Aşama B) — `IntegrationConfigService`: taslak/fark/onay/yayın/geri alma/kilit/statik test.
// Yalnız `platformAdmin` (OPERATION_POLICY, capabilities/domains/platform.ts) çağırabilir; kademe kontrolü
// RunOperation'da yapılır, burada TEKRARLANMAZ (ADR-0001 Karar 8).
//
// BİLİNÇLİ KAPSAM SINIRLARI (rapora yazılır):
//  - `proposeFromFinding` YOK (ADR-0018 Aşama C'ye bağlı, bu görevin KAPSAMI DIŞI).
//  - `testEndpoint` yalnız `static`/`replay` (replay bu turda BAĞLANMADI, ADR-0018 `ProbeRunner` gerekir); `live` her
//    zaman "platform test hesabı tanımlı değil" döner (E3: sahte başarı YOK).
//  - `setIntake`/kill-switch (Karar 3.8) BU SERVİSTE YOK (Aşama D kapsamı).

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
}

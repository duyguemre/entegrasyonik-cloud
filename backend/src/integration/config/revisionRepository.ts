// ADR-0020 Karar 3 (Aşama B) — `IntegrationConfigRevisions`/`Heads` üzerinde ÇALIŞAN TEK katman. Mongo filtre
// semantiğinin (C23 dersi) hassas olduğu yer BURASIDIR: `status`/`publishedVersion` HER ZAMAN required+default'lu
// (bkz. models/IntegrationConfig.ts) olduğundan `$eq`/karşılaştırma sorguları güvenlidir.
//
// Bağımlılık enjeksiyonu: bu modül `Model<any>` sözleşmesini (find/findOne/findOneAndUpdate/create/countDocuments)
// karşılayan HERHANGİ bir nesneyle çalışır — gerçek Mongoose modeli (üretim + gerçek-Mongo testleri) ya da sahte bir
// bellek-içi model (birim testleri). İş kuralı (hangi anahtar yazılabilir, hangi değişiklik `dangerous` vb.)
// BURADA DEĞİL `IntegrationConfigService`'tedir — bu katman yalnız KALICILIK + Mongo yarış semantiğini taşır.

export interface RevisionModels {
    revisionModel: any;
    headModel: any;
}

export class DraftConflictError extends Error {
    constructor(public target: string) {
        super(`Taslak başka bir işlemle değişti (target=${target}); farkı yeniden gözden geçirin.`);
        this.name = 'DraftConflictError';
    }
}

export class PublishConflictError extends Error {
    constructor(public target: string, public expectedVersion: number) {
        super(`Siz düzenlerken yeni bir sürüm yayınlandı (target=${target}, beklenen=${expectedVersion}). Farkı yeniden gözden geçirin.`);
        this.name = 'PublishConflictError';
    }
}

export class NoDraftError extends Error {
    constructor(public target: string) {
        super(`target=${target} için açık taslak yok.`);
        this.name = 'NoDraftError';
    }
}

export interface RevisionDoc {
    _id: any;
    target: string;
    version: number;
    status: 'draft' | 'published' | 'superseded' | 'discarded';
    overrides: Record<string, unknown>;
    basedOnVersion: number;
    catalogVersion: string;
    origin: { kind: 'manual' | 'rollback' | 'finding' | 'migration' | 'agent'; ref?: string };
    reason?: string;
    diff: Array<{ key: string; from?: unknown; to?: unknown; danger: 'safe' | 'caution' | 'dangerous' }>;
    impact?: { activeTenants: number; perTenantOverrides?: number };
    createdBy: string;
    createdAt: Date;
    draftRev: number;
    lockedBy?: string;
    lockedAt?: Date;
    publishedBy?: string;
    publishedAt?: Date;
    approvedBy?: string;
}

export interface HeadDoc {
    _id: string;
    publishedVersion: number;
    intake: 'on' | 'drain' | 'off';
    maintenance?: { message?: { tr?: string; en?: string }; until?: Date };
    updatedAt: Date;
}

/** Hedef başına tek başlık belgesi; hiç yoksa `publishedVersion:0` sözde-belge döner (C23: null yerine 0). */
export async function getHead(models: RevisionModels, target: string): Promise<HeadDoc> {
    const doc = await models.headModel.findOne({ _id: target }).lean();
    if (doc) return doc as HeadDoc;
    return { _id: target, publishedVersion: 0, intake: 'on', updatedAt: new Date(0) };
}

export async function listHeads(models: RevisionModels): Promise<HeadDoc[]> {
    return (await models.headModel.find({}).lean()) as HeadDoc[];
}

export async function getDraft(models: RevisionModels, target: string): Promise<RevisionDoc | null> {
    return (await models.revisionModel.findOne({ target, status: 'draft' }).lean()) as RevisionDoc | null;
}

export async function getRevisionByVersion(models: RevisionModels, target: string, version: number): Promise<RevisionDoc | null> {
    return (await models.revisionModel.findOne({ target, version }).lean()) as RevisionDoc | null;
}

export async function getPublished(models: RevisionModels, target: string): Promise<RevisionDoc | null> {
    const head = await getHead(models, target);
    if (head.publishedVersion === 0) return null;
    return getRevisionByVersion(models, target, head.publishedVersion);
}

export async function listHistory(models: RevisionModels, target: string, limit = 50): Promise<RevisionDoc[]> {
    return (await models.revisionModel.find({ target }).sort({ version: -1 }).limit(limit).lean()) as RevisionDoc[];
}

async function nextVersion(models: RevisionModels, target: string): Promise<number> {
    const [top] = (await models.revisionModel.find({ target }).sort({ version: -1 }).limit(1).lean()) as RevisionDoc[];
    return (top?.version ?? 0) + 1;
}

export interface CreateDraftInput {
    target: string;
    catalogVersion: string;
    createdBy: string;
    /** Varsayılan `{kind:'manual'}`. ADR-0020 Karar 5 (Aşama D) — `proposeFromFinding` bir bulgudan açılan taslağı
     *  `{kind:'finding', ref: findingId}` ile işaretler. VAR OLAN bir taslak varsa bu alan YOK SAYILIR (taslağın
     *  origin'i İLK açanınkidir, ikinci çağıran onu DEĞİŞTİRMEZ). */
    origin?: RevisionDoc['origin'];
    now?: () => Date;
}

/**
 * Var olan taslağı döner; yoksa yenisini açar (Karar 3.2 adım 1). Kısmi tekil indeks (`{target} where status=draft`)
 * yarış durumunda ikinci create'i E11000 ile reddeder; bu durumda mevcut taslak yeniden okunup döner (idempotent görünüm).
 */
export async function getOrCreateDraft(models: RevisionModels, input: CreateDraftInput): Promise<RevisionDoc> {
    const existing = await getDraft(models, input.target);
    if (existing) return existing;

    const now = (input.now ?? (() => new Date()))();
    const head = await getHead(models, input.target);
    const version = await nextVersion(models, input.target);

    try {
        const created = await models.revisionModel.create({
            target: input.target,
            version,
            status: 'draft',
            overrides: {},
            basedOnVersion: head.publishedVersion,
            catalogVersion: input.catalogVersion,
            origin: input.origin ?? { kind: 'manual' },
            diff: [],
            createdBy: input.createdBy,
            createdAt: now,
            draftRev: 0,
            lockedBy: input.createdBy,
            lockedAt: now,
        });
        return (created.toObject ? created.toObject() : created) as RevisionDoc;
    } catch (e: any) {
        // E11000 (kısmi tekil indeks ya da target+version çakışması) -- başka bir istek taslağı ÖNCE açtı.
        if (e?.code === 11000) {
            const raced = await getDraft(models, input.target);
            if (raced) return raced;
        }
        throw e;
    }
}

export interface SaveDraftPatchInput {
    target: string;
    expectedDraftRev: number;
    patch: Record<string, unknown>;
    /** `true` ise verilen anahtar taslaktan SİLİNİR (Karar 3.4 "Alan başına 'Varsayılana dön'"). */
    unset?: string[];
    updatedBy: string;
    now?: () => Date;
}

/** İyimser kilit (Karar 3.2/3.7): `draftRev` uyuşmazsa `DraftConflictError`. Başarılı olursa `draftRev` +1. */
export async function saveDraftPatch(models: RevisionModels, input: SaveDraftPatchInput): Promise<RevisionDoc> {
    const now = (input.now ?? (() => new Date()))();

    // ÖNEMLİ (bu görevde gerçek Mongo testiyle bulunan hata): katalog anahtarları NOKTALI ad alanı kullanır
    // (`export.publisher.chunkSize`). MongoDB `$set`teki NOKTALI YOL dizesini HER ZAMAN iç içe alan olarak yorumlar
    // (mongoose'un değil, Mongo'nun kendi davranışı) — `{'overrides.export.publisher.chunkSize': 40}` yazmak
    // `overrides:{export:{publisher:{chunkSize:40}}}` üretir, `overrides['export.publisher.chunkSize']=40` DEĞİL.
    // Bu yüzden `overrides` HER ZAMAN TEK bir düz (literal anahtarlı) nesne olarak `$set` edilir; noktalı-yol asla
    // kullanılmaz. Optimistik kilit yine `draftRev` eşleşmesiyle atomik kalır (okuma + koşullu yazma).
    const current = await models.revisionModel.findOne(
        { target: input.target, status: 'draft', draftRev: input.expectedDraftRev },
        { overrides: 1 },
    ).lean() as { overrides?: Record<string, unknown> } | null;
    if (!current) {
        const draft = await getDraft(models, input.target);
        if (!draft) throw new NoDraftError(input.target);
        throw new DraftConflictError(input.target);
    }

    const merged: Record<string, unknown> = { ...(current.overrides ?? {}) };
    for (const [k, v] of Object.entries(input.patch)) merged[k] = v;
    for (const k of input.unset ?? []) delete merged[k];

    const updated = await models.revisionModel.findOneAndUpdate(
        { target: input.target, status: 'draft', draftRev: input.expectedDraftRev },
        { $set: { overrides: merged, draftRev: input.expectedDraftRev + 1, lockedBy: input.updatedBy, lockedAt: now } },
        { new: true },
    ).lean();
    if (!updated) {
        const draft = await getDraft(models, input.target);
        if (!draft) throw new NoDraftError(input.target);
        throw new DraftConflictError(input.target);
    }
    return updated as RevisionDoc;
}

export async function discardDraft(models: RevisionModels, target: string, expectedDraftRev: number): Promise<void> {
    const res = await models.revisionModel.findOneAndUpdate(
        { target, status: 'draft', draftRev: expectedDraftRev },
        { $set: { status: 'discarded' } },
        { new: true },
    ).lean();
    if (!res) {
        const draft = await getDraft(models, target);
        if (!draft) throw new NoDraftError(target);
        throw new DraftConflictError(target);
    }
}

export async function takeOverLock(models: RevisionModels, target: string, newOwner: string, now: () => Date = () => new Date()): Promise<RevisionDoc> {
    const updated = await models.revisionModel.findOneAndUpdate(
        { target, status: 'draft' },
        { $set: { lockedBy: newOwner, lockedAt: now() } },
        { new: true },
    ).lean();
    if (!updated) throw new NoDraftError(target);
    return updated as RevisionDoc;
}

export interface PublishInput {
    target: string;
    draft: RevisionDoc; // önceden previewPublish ile hesaplanan taslak (diff dahil)
    diff: RevisionDoc['diff'];
    impact?: RevisionDoc['impact'];
    reason?: string;
    publishedBy: string;
    approvedBy?: string;
    now?: () => Date;
}

/**
 * ADR §3.1 "yayın atomikliği": `Heads.publishedVersion` üzerinde KOŞULLU güncelleme. Koşul tutmazsa (arada başka
 * yayın olduysa) `PublishConflictError` (çağıran 409'a çevirir). Başarılıysa: taslak -> `published`, önceki yayındaki
 * revizyon -> `superseded`, `Heads.publishedVersion` güncellenir.
 */
export async function publishDraft(models: RevisionModels, input: PublishInput): Promise<{ revision: RevisionDoc; head: HeadDoc }> {
    const now = (input.now ?? (() => new Date()))();
    const { target, draft } = input;
    const basedOnVersion = draft.basedOnVersion;

    // 1) Taslağı yayınla (status=published + meta alanları) -- yalnız HÂLÂ draft ve HÂLÂ aynı draftRev'deyse.
    const publishedRevision = await models.revisionModel.findOneAndUpdate(
        { target, status: 'draft', draftRev: draft.draftRev },
        {
            $set: {
                status: 'published', diff: input.diff, impact: input.impact, reason: input.reason,
                publishedBy: input.publishedBy, publishedAt: now, approvedBy: input.approvedBy,
            },
        },
        { new: true },
    ).lean();
    if (!publishedRevision) throw new DraftConflictError(target);

    // 2) Heads koşullu güncelleme (ADR §3.1 findOneAndUpdate({_id,publishedVersion:basedOnVersion},...)).
    let head: HeadDoc | null = null;
    if (basedOnVersion === 0) {
        try {
            const created = await models.headModel.create({ _id: target, publishedVersion: (publishedRevision as any).version, updatedAt: now });
            head = (created.toObject ? created.toObject() : created) as HeadDoc;
        } catch (e: any) {
            if (e?.code === 11000) head = null; else { await revertPublish(models, target, draft.version); throw e; }
        }
    } else {
        head = await models.headModel.findOneAndUpdate(
            { _id: target, publishedVersion: basedOnVersion },
            { $set: { publishedVersion: (publishedRevision as any).version, updatedAt: now } },
            { new: true },
        ).lean();
    }

    if (!head) {
        // Heads güncellenemedi (yarış): taslağı GERİ AL (bkz. revertPublish) ve 409 ilet.
        await revertPublish(models, target, draft.version);
        throw new PublishConflictError(target, basedOnVersion);
    }

    // 3) Önceki yayındaki revizyonu `superseded` yap (varsa; basedOnVersion===0 ise hiç yoktur).
    if (basedOnVersion > 0) {
        await models.revisionModel.updateOne({ target, version: basedOnVersion, status: 'published' }, { $set: { status: 'superseded' } });
    }

    return { revision: publishedRevision as RevisionDoc, head };
}

/** Heads adımı başarısız olursa (2) taslağı `draft` durumuna GERİ ALIR (yarı-yayınlanmış durum bırakmamak için). */
async function revertPublish(models: RevisionModels, target: string, version: number): Promise<void> {
    await models.revisionModel.updateOne(
        { target, version, status: 'published' },
        { $set: { status: 'draft' } },
    );
}

export interface RollbackInput {
    target: string;
    toVersion: number;
    createdBy: string;
    reason: string;
    catalogVersion: string;
    diff: RevisionDoc['diff'];
    impact?: RevisionDoc['impact'];
    now?: () => Date;
}

/**
 * Karar 3.4: eski revizyonun `overrides` görüntüsünü YENİ bir revizyon olarak, AYNI yayın primitifiyle yayınlar.
 * Tarih yeniden yazılmaz (`createdAt` yeni; eski revizyon değişmez kalır).
 */
export async function rollbackToVersion(models: RevisionModels, input: RollbackInput): Promise<{ revision: RevisionDoc; head: HeadDoc }> {
    const now = (input.now ?? (() => new Date()))();
    const source = await getRevisionByVersion(models, input.target, input.toVersion);
    if (!source) throw new Error(`target=${input.target} sürüm=${input.toVersion} bulunamadı.`);
    const head = await getHead(models, input.target);

    const version = await nextVersion(models, input.target);
    const created = await models.revisionModel.create({
        target: input.target,
        version,
        status: 'draft', // publishDraft aynı geçiş mantığını kullanabilsin diye önce draft olarak yaratılır
        overrides: source.overrides,
        basedOnVersion: head.publishedVersion,
        catalogVersion: input.catalogVersion,
        origin: { kind: 'rollback', ref: String(input.toVersion) },
        diff: [],
        createdBy: input.createdBy,
        createdAt: now,
        draftRev: 0,
    });
    const draft = (created.toObject ? created.toObject() : created) as RevisionDoc;

    return publishDraft(models, {
        target: input.target,
        draft,
        diff: input.diff,
        impact: input.impact,
        reason: input.reason,
        publishedBy: input.createdBy,
        now: input.now,
    });
}

export interface SetIntakeInput {
    target: string;
    intake: HeadDoc['intake'];
    /** `undefined` → dokunma; `null` → temizle (`$unset`); nesne → set eder. */
    maintenance?: HeadDoc['maintenance'] | null;
    now?: () => Date;
}

/**
 * ADR-0020 Karar 3.8 (Aşama D) — kill-switch. `Heads` üzerinde DOĞRUDAN günceller; `IntegrationConfigRevisions`'a
 * YENİ bir revizyon YARATMAZ ("`intake` değişikliği yayın akışının DIŞINDADIR", Karar 3.8 son paragraf — bu yüzden
 * `publishDraft`in koşullu `basedOnVersion` yarış koruması burada YOKTUR, gerekmez: hedef başına TEK küçük belge,
 * atomik `$set`/`$unset` yeterlidir, C23 dersi burada da geçerli: `publishedVersion` `upsert`te bile default'uyla
 * her zaman sayısal kalır). Hedefin hiç `Head`i yoksa (hiç yayın yapılmamış bir entegrasyon/motor) `upsert` ile
 * `publishedVersion:0` olarak yaratılır.
 */
export async function setIntakeState(models: RevisionModels, input: SetIntakeInput): Promise<HeadDoc> {
    const now = (input.now ?? (() => new Date()))();
    const set: Record<string, unknown> = { intake: input.intake, updatedAt: now };
    const update: Record<string, unknown> = { $set: set };
    if (input.maintenance === null) {
        update.$unset = { maintenance: '' };
    } else if (input.maintenance !== undefined) {
        set.maintenance = input.maintenance;
    }

    const updated = await models.headModel.findOneAndUpdate(
        { _id: input.target },
        update,
        { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();
    return updated as HeadDoc;
}

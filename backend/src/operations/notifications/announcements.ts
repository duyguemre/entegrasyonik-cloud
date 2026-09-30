// ADR-0029 Karar 7 (NB7): platform duyurulari -- SAF is mantigi (DB/HTTP yok; modeller/saat/notify ENJEKTE edilir).
//  - dogrulama + normallestirme (TR zorunlu, EN istege bagli; hedef tutarliligi; maintenance/incident kapatilamaz)
//  - durum gecisleri (draft -> scheduled -> active -> ended; iptal), tenant gorunurlugu (hedef + kitle + pencere), tenant DTO
//  - hedef cozumu (`all` aktif tenant / `plans` ADR-0008 Subscriptions.planCode / `tids`) ve fan-out (`notify('SYSTEM_ANNOUNCEMENT')`)
// Banner OKUMA yoluyla gosterilir (fan-out yok); `inApp`/`email` icin `runAnnouncementFanout` tenant basina notify cagirir (idempotent: announcementId:tid).
import { ApplicationError } from '@platform/core/errors';
import type { MinTier } from './catalog.types';
import type { NotifyOptions, NotifyResult } from './notify';

export type AnnouncementKind = 'info' | 'maintenance' | 'incident' | 'release';
export type AnnouncementSeverity = 'info' | 'warning' | 'critical';
export type AnnouncementStatus = 'draft' | 'scheduled' | 'active' | 'ended' | 'cancelled';
export type TargetMode = 'all' | 'plans' | 'tenants';

export interface Localized { tr: string; en?: string }
export interface AnnouncementInput {
    kind: AnnouncementKind; severity?: AnnouncementSeverity; title: Localized; body: Localized;
    target: { mode: TargetMode; planCodes?: string[]; tids?: number[] };
    audience?: 'all_members' | 'owners_admins';
    channels: { banner: boolean; inApp: boolean; email: boolean };
    startsAt: string | Date; endsAt?: string | Date | null; dismissible?: boolean;
}

export interface AnnouncementDoc {
    _id?: any; kind: AnnouncementKind; severity: AnnouncementSeverity; title: Localized; body: Localized;
    target: { mode: TargetMode; planCodes?: string[]; tids?: number[] }; audience: 'all_members' | 'owners_admins';
    channels: { banner: boolean; inApp: boolean; email: boolean }; startsAt: Date; endsAt?: Date | null; dismissible: boolean;
    status: AnnouncementStatus; emailConsentAt?: Date; fanout?: { claimedAt?: Date; doneAt?: Date; tenants?: number; notified?: number };
    createdBy?: string; updatedBy?: string; scheduledBy?: string; cancelledBy?: string; createdAt?: Date; updatedAt?: Date;
}

const bad = (m: string): never => { throw new ApplicationError(m, 400, 'VALIDATION'); };
const DEFAULT_SEVERITY: Record<AnnouncementKind, AnnouncementSeverity> = { info: 'info', release: 'info', maintenance: 'warning', incident: 'critical' };
const NON_DISMISSIBLE: ReadonlySet<AnnouncementKind> = new Set(['maintenance', 'incident']);

const toDate = (v: unknown, field: string): Date => {
    const d = v instanceof Date ? v : new Date(String(v));
    return Number.isNaN(d.getTime()) ? bad(`${field}: geçersiz tarih`) : d;
};

/** Ortak doğrulama/normalleştirme (create ve update). Dönen: kaydedilecek alanlar (durum/yazar hariç). */
export function normalizeAnnouncement(i: AnnouncementInput): Omit<AnnouncementDoc, 'status' | 'createdBy' | 'createdAt'> {
    const tr = (s: unknown, f: string): string => (typeof s === 'string' && s.trim() ? s.trim() : bad(`${f}.tr zorunlu`));
    const en = (s: unknown): string | undefined => (typeof s === 'string' && s.trim() ? s.trim() : undefined);
    const titleEn = en(i.title?.en);
    const bodyEn = en(i.body?.en);
    const title: Localized = { tr: tr(i.title?.tr, 'title'), ...(titleEn ? { en: titleEn } : {}) };
    const body: Localized = { tr: tr(i.body?.tr, 'body'), ...(bodyEn ? { en: bodyEn } : {}) };
    const startsAt = toDate(i.startsAt, 'startsAt');
    const endsAt = i.endsAt === undefined || i.endsAt === null ? null : toDate(i.endsAt, 'endsAt');
    if (endsAt && endsAt.getTime() <= startsAt.getTime()) bad('endsAt, startsAt sonrasında olmalı');

    const t = i.target ?? bad('target zorunlu');
    let target: AnnouncementDoc['target'];
    if (t.mode === 'all') target = { mode: 'all' };
    else if (t.mode === 'plans') {
        const planCodes = [...new Set(t.planCodes ?? [])];
        if (!planCodes.length) bad('target.planCodes boş olamaz');
        target = { mode: 'plans', planCodes };
    } else if (t.mode === 'tenants') {
        const tids = [...new Set(t.tids ?? [])];
        if (!tids.length) bad('target.tids boş olamaz');
        target = { mode: 'tenants', tids };
    } else return bad('target.mode geçersiz');

    if (!i.channels.banner && !i.channels.inApp && !i.channels.email) bad('En az bir kanal seçilmeli');
    // Uygulama içi bildirim her zaman üretilir (katalog: inApp sabit); e-posta yalnız uygulama içiyle birlikte anlamlıdır.
    if (i.channels.email && !i.channels.inApp) bad('E-posta kanalı uygulama içi bildirimle birlikte seçilmeli');

    const severity = i.severity ?? DEFAULT_SEVERITY[i.kind];
    const dismissible = NON_DISMISSIBLE.has(i.kind) ? false : (i.dismissible ?? true);
    return { kind: i.kind, severity, title, body, target, audience: i.audience ?? 'all_members', channels: { ...i.channels }, startsAt, endsAt, dismissible };
}

// --- durum gecisleri ----------------------------------------------------------------------------------------------

export function assertEditable(a: Pick<AnnouncementDoc, 'status'>): void {
    if (a.status !== 'draft') throw new ApplicationError('Yalnız taslak duyuru düzenlenebilir.', 409, 'ANNOUNCEMENT_STATE');
}

/** `draft` -> `scheduled` (startsAt geçmişteyse doğrudan `active`). E-posta açıkken onay kutusu ZORUNLU (S5). */
export function scheduleDecision(a: AnnouncementDoc, consent: boolean, now: Date): AnnouncementStatus {
    if (a.status !== 'draft') throw new ApplicationError('Yalnız taslak duyuru zamanlanabilir.', 409, 'ANNOUNCEMENT_STATE');
    if (a.channels.email && consent !== true) bad('E-posta kanalı için "yalnızca hizmet duyurusu" onayı zorunlu');
    if (a.endsAt && a.endsAt.getTime() <= now.getTime()) bad('Bitiş zamanı geçmişte');
    return a.startsAt.getTime() <= now.getTime() ? 'active' : 'scheduled';
}

export function assertCancellable(a: Pick<AnnouncementDoc, 'status'>): void {
    if (a.status === 'ended' || a.status === 'cancelled') throw new ApplicationError('Duyuru zaten sona ermiş ya da iptal edilmiş.', 409, 'ANNOUNCEMENT_STATE');
}

// --- tenant gorunurlugu ---------------------------------------------------------------------------------------------

export interface TenantViewer { tid: number; planCode?: string | null; tier: MinTier }
const RANK: Record<MinTier, number> = { member: 1, admin: 2, owner: 3 };

/** Bant gorunurlugu ZAMAN PENCERESINDEN hesaplanir (`scheduled` de pencere icindeyse gorunur): fan-out isinin gecikmesi/kapali olmasi banti etkilemez. */
export function isVisibleNow(a: Pick<AnnouncementDoc, 'status' | 'startsAt' | 'endsAt'>, now: Date): boolean {
    return (a.status === 'active' || a.status === 'scheduled') && a.startsAt.getTime() <= now.getTime() && (!a.endsAt || a.endsAt.getTime() > now.getTime());
}

export function targetsTenant(a: Pick<AnnouncementDoc, 'target'>, v: { tid: number; planCode?: string | null }): boolean {
    if (a.target.mode === 'all') return true;
    if (a.target.mode === 'tenants') return !!a.target.tids?.includes(v.tid);
    return !!v.planCode && !!a.target.planCodes?.includes(v.planCode);
}

export function visibleTo(a: AnnouncementDoc, v: TenantViewer, now: Date): boolean {
    if (!isVisibleNow(a, now) || !a.channels.banner || !targetsTenant(a, v)) return false;
    return a.audience === 'all_members' || RANK[v.tier] >= RANK.admin;
}

const SEV_ORDER: Record<AnnouncementSeverity, number> = { critical: 3, warning: 2, info: 1 };

/** Tenant DTO: yalniz gorunum alanlari (hedef/kitle/yazar/sayaclar sizmaz). Dil yedegi istemcide (tr zorunlu). */
export function toTenantDto(a: AnnouncementDoc) {
    return {
        id: String(a._id), kind: a.kind, severity: a.severity, title: a.title, body: a.body, dismissible: a.dismissible,
        startsAt: a.startsAt, endsAt: a.endsAt ?? null,
    };
}
export const sortBySeverity = <T extends { severity: AnnouncementSeverity; startsAt: Date }>(xs: T[]): T[] =>
    [...xs].sort((x, y) => SEV_ORDER[y.severity] - SEV_ORDER[x.severity] || y.startsAt.getTime() - x.startsAt.getTime());

// --- hedef cozumu + fan-out -----------------------------------------------------------------------------------------

export interface TargetPorts {
    /** ACTIVE tenant kimlikleri (artan), `afterTid`'den sonra en fazla `limit`. */
    listActiveTenantIds(afterTid: number, limit: number): Promise<number[]>;
    /** Plan koduna sahip (trialing/active/past_due) tenant kimlikleri (artan). */
    listTenantIdsByPlans(planCodes: string[], afterTid: number, limit: number): Promise<number[]>;
}

export async function* iterateTargetTenants(target: AnnouncementDoc['target'], ports: TargetPorts, pageSize = 500): AsyncGenerator<number> {
    if (target.mode === 'tenants') { for (const t of [...(target.tids ?? [])].sort((a, b) => a - b)) yield t; return; }
    let after = 0;
    for (;;) {
        const page = target.mode === 'all' ? await ports.listActiveTenantIds(after, pageSize) : await ports.listTenantIdsByPlans(target.planCodes ?? [], after, pageSize);
        if (!page.length) return;
        for (const t of page) yield t;
        after = page[page.length - 1];
        if (page.length < pageSize) return;
    }
}

export interface AnnouncementModelPort {
    find(filter: any): any;
    updateMany(filter: any, update: any): Promise<any>;
    findOneAndUpdate(filter: any, update: any, opts?: any): any;
    updateOne(filter: any, update: any): Promise<any>;
}

export interface FanoutDeps {
    model: AnnouncementModelPort;
    ports: TargetPorts;
    notify(code: string, tid: number, params: Record<string, unknown>, opts?: NotifyOptions): Promise<NotifyResult>;
    flags(): { v2Enabled: boolean };
    now?(): Date;
    claimTtlMs?: number;
    pageSize?: number;
    /** Tur basina en fazla tenant sayisi (maxDurationMs korumasi); kalan sonraki turda (kira suresi dolunca) devam eder. */
    maxTenantsPerRun?: number;
}

export interface FanoutResult { activated: number; ended: number; fannedOut: number; notified: number; skipped?: string }
const run = async (q: any) => (q && typeof q.lean === 'function' ? q.lean() : q);

/** Bir tur: zamani gelen duyurulari aktiflestir, suresi dolani bitir, inApp/e-posta kanalli aktif duyurulari tenant'lara dagit. */
export async function runAnnouncementFanout(d: FanoutDeps): Promise<FanoutResult> {
    const now = (d.now ?? (() => new Date()))();
    const out: FanoutResult = { activated: 0, ended: 0, fannedOut: 0, notified: 0 };
    // NOTIFY_V2_ENABLED=false: yeni koleksiyonlara DOKUNULMAZ (bant gorunurlugu zaman penceresinden hesaplanir, is'e bagli degildir).
    if (!d.flags().v2Enabled) { out.skipped = 'notify_disabled'; return out; }
    // aktiflestirme / bitis: atomik toplu guncelleme (idempotent)
    const a = await d.model.updateMany({ status: 'scheduled', startsAt: { $lte: now } }, { $set: { status: 'active', updatedAt: now } });
    out.activated = a?.modifiedCount ?? a?.nModified ?? 0;
    const e = await d.model.updateMany({ status: 'active', endsAt: { $ne: null, $lte: now } }, { $set: { status: 'ended', updatedAt: now } });
    out.ended = e?.modifiedCount ?? e?.nModified ?? 0;

    const claimTtl = d.claimTtlMs ?? 10 * 60_000;
    let budget = d.maxTenantsPerRun ?? 5000;
    while (budget > 0) {
        const doc: AnnouncementDoc | null = await run(d.model.findOneAndUpdate({
            status: 'active', 'fanout.doneAt': { $exists: false },
            $and: [
                { $or: [{ 'channels.inApp': true }, { 'channels.email': true }] },
                { $or: [{ 'fanout.claimedAt': { $exists: false } }, { 'fanout.claimedAt': { $lt: new Date(now.getTime() - claimTtl) } }] },
            ],
        }, { $set: { 'fanout.claimedAt': now } }, { new: true }));
        if (!doc) break;
        let tenants = 0; let notified = 0; let complete = true;
        for await (const tid of iterateTargetTenants(doc.target, d.ports, d.pageSize)) {
            if (budget <= 0) { complete = false; break; }
            budget--; tenants++;
            const params: Record<string, unknown> = {
                announcementId: String(doc._id), kind: doc.kind, title: doc.title.tr.slice(0, 160), summary: doc.body.tr.slice(0, 600),
                ...(doc.title.en ? { titleEn: doc.title.en.slice(0, 160) } : {}), ...(doc.body.en ? { summaryEn: doc.body.en.slice(0, 600) } : {}),
            };
            const r = await d.notify('SYSTEM_ANNOUNCEMENT', tid, params, {
                module: 'announcements', email: doc.channels.email === true, occurredAt: now,
                ...(doc.audience === 'owners_admins' ? { minTier: 'admin' as MinTier } : {}),
            });
            if (r.status === 'created' || r.status === 'grouped') notified++;
        }
        out.notified += notified;
        if (complete) {
            await d.model.updateOne({ _id: doc._id }, { $set: { 'fanout.doneAt': now, 'fanout.tenants': tenants, 'fanout.notified': notified } });
            out.fannedOut++;
        } else break; // kira suresi dolunca sonraki tur devam eder (notify idempotent)
    }
    return out;
}

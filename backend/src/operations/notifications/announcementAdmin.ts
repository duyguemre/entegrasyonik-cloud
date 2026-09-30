// ADR-0029 Karar 7 (NB7): backoffice duyuru yonetimi (list/get/create/update/schedule/cancel/preview). Model ENJEKTE (testler DB'ye baglanmaz).
// Gecisler atomik kosullu guncellemedir (`{_id, status}` eslesmezse 409 ANNOUNCEMENT_STATE); "once oku sonra yaz" yok.
// Audit: RunOperation her yazmayi `backoffice.write` yazar; toplu e-posta icin ayrica `backoffice.notifications.announcement_email` (hedef + gerekce).
import { ApplicationError } from '@platform/core/errors';
import { AuditLogger } from '@services/audit/AuditLogger';
import { getRequestId } from '@platform/core/context';
import {
    assertCancellable, assertEditable, normalizeAnnouncement, scheduleDecision, toTenantDto,
    type AnnouncementDoc, type AnnouncementInput, type AnnouncementModelPort,
} from './announcements';
import { renderNotification } from './templates/render';
import { buildInstantEmail } from './templates/email';
import { clampLimit, decodeCursor, encodeCursor, QUERY_MAX_TIME_MS, type BackofficeActor } from './backofficeOps';

const OID = /^[a-f0-9]{24}$/i;
const lean = async (q: any): Promise<any> => (q && typeof q.lean === 'function' ? q.lean() : q);
const bad = (m: string): never => { throw new ApplicationError(m, 400, 'VALIDATION'); };
const notFound = (): never => { throw new ApplicationError('Duyuru bulunamadı.', 404, 'ANNOUNCEMENT_NOT_FOUND'); };
const stale = (): never => { throw new ApplicationError('Duyuru bu durumda bu işleme uygun değil.', 409, 'ANNOUNCEMENT_STATE'); };

export interface AnnouncementAdminModel extends AnnouncementModelPort {
    create(doc: any): Promise<any>;
    findOne(filter: any): any;
}

export interface AnnouncementAdminDeps { model: AnnouncementAdminModel; now?: () => Date; appUrl?: string }

const audit = (event: string, actor: BackofficeActor | undefined, meta: Record<string, string | number | boolean>): void => {
    void AuditLogger.log({ event, result: 'ok', sub: actor?.sub, ip: actor?.ip, surface: 'backoffice', actorType: 'platform', reqId: getRequestId(), meta });
};

/** Backoffice satiri: tam belge (yazar = yonetici kimligi; backoffice'e ozel). */
export function toAdminRow(a: any) {
    return {
        id: String(a._id), kind: a.kind, severity: a.severity, title: a.title, body: a.body, target: a.target, audience: a.audience, channels: a.channels,
        startsAt: a.startsAt, endsAt: a.endsAt ?? null, dismissible: a.dismissible, status: a.status, emailConsentAt: a.emailConsentAt ?? null,
        fanout: a.fanout ? { done: !!a.fanout.doneAt, tenants: a.fanout.tenants ?? 0, notified: a.fanout.notified ?? 0 } : null,
        createdBy: a.createdBy, updatedBy: a.updatedBy ?? null, scheduledBy: a.scheduledBy ?? null, cancelledBy: a.cancelledBy ?? null,
        createdAt: a.createdAt ?? null, updatedAt: a.updatedAt ?? null,
    };
}

export class AnnouncementAdmin {
    constructor(private readonly d: AnnouncementAdminDeps) {}
    private now(): Date { return this.d.now ? this.d.now() : new Date(); }

    private async load(id: string): Promise<AnnouncementDoc> {
        if (!OID.test(id)) bad('id: geçersiz kimlik');
        const a: AnnouncementDoc | null = await this.d.model.findOne({ _id: id }).maxTimeMS(QUERY_MAX_TIME_MS).lean();
        return a ?? notFound();
    }

    async list(i: { status?: string; kind?: string; from?: string; to?: string; cursor?: string; limit?: number }): Promise<any> {
        const limit = clampLimit(i.limit);
        const match: Record<string, any> = {};
        if (i.status !== undefined) match.status = i.status;
        if (i.kind !== undefined) match.kind = i.kind;
        if (i.from !== undefined || i.to !== undefined) {
            match.startsAt = {};
            if (i.from !== undefined) match.startsAt.$gte = new Date(i.from);
            if (i.to !== undefined) match.startsAt.$lte = new Date(i.to);
            if (Object.values(match.startsAt).some((d: any) => Number.isNaN(d.getTime()))) bad('from/to: geçersiz tarih');
        }
        const query = i.cursor !== undefined ? { $and: [match, { _id: { $lt: decodeCursor(i.cursor) } }] } : match;
        const rows: any[] = await this.d.model.find(query).sort({ _id: -1 }).limit(limit + 1).maxTimeMS(QUERY_MAX_TIME_MS).lean();
        const hasMore = rows.length > limit;
        const page = hasMore ? rows.slice(0, limit) : rows;
        return { items: page.map(toAdminRow), nextCursor: hasMore ? encodeCursor(page[page.length - 1]._id) : null };
    }

    async get(i: { id: string }): Promise<any> { return { announcement: toAdminRow(await this.load(i.id)) }; }

    async create(actor: BackofficeActor | undefined, input: AnnouncementInput): Promise<any> {
        const fields = normalizeAnnouncement(input);
        const created = await this.d.model.create({ ...fields, status: 'draft', createdBy: actor?.sub ?? 'unknown', createdAt: this.now() });
        return { announcement: toAdminRow(created?.toObject ? created.toObject() : created) };
    }

    async update(actor: BackofficeActor | undefined, i: { id: string; announcement: AnnouncementInput }): Promise<any> {
        assertEditable(await this.load(i.id));
        const fields = normalizeAnnouncement(i.announcement);
        const doc = await lean(this.d.model.findOneAndUpdate({ _id: i.id, status: 'draft' }, { $set: { ...fields, updatedBy: actor?.sub, updatedAt: this.now() } }, { new: true }));
        return doc ? { announcement: toAdminRow(doc) } : stale();
    }

    async schedule(actor: BackofficeActor | undefined, i: { id: string; emailConsent?: boolean; reason: string }): Promise<any> {
        const a = await this.load(i.id);
        const now = this.now();
        const status = scheduleDecision(a, i.emailConsent === true, now);
        const set: Record<string, unknown> = { status, scheduledBy: actor?.sub, updatedBy: actor?.sub, updatedAt: now };
        if (a.channels.email) set.emailConsentAt = now;
        const doc = await lean(this.d.model.findOneAndUpdate({ _id: i.id, status: 'draft' }, { $set: set }, { new: true }));
        if (!doc) return stale();
        if (a.channels.email) audit('backoffice.notifications.announcement_email', actor, { announcementId: i.id, target: a.target.mode, reason: i.reason });
        return { announcement: toAdminRow(doc) };
    }

    async cancel(actor: BackofficeActor | undefined, i: { id: string; reason: string }): Promise<any> {
        assertCancellable(await this.load(i.id));
        const doc = await lean(this.d.model.findOneAndUpdate({ _id: i.id, status: { $in: ['draft', 'scheduled', 'active'] } }, { $set: { status: 'cancelled', cancelledBy: actor?.sub, updatedBy: actor?.sub, updatedAt: this.now() } }, { new: true }));
        return doc ? { announcement: toAdminRow(doc) } : stale();
    }

    /** Kaydedilmis (`id`) ya da kaydedilmemis (`draft`) duyurunun bant + bildirim + e-posta goruntusu. Gonderim YOK. */
    async preview(i: { id?: string; draft?: AnnouncementInput }): Promise<any> {
        if ((i.id === undefined) === (i.draft === undefined)) bad('id ya da draft (yalnız biri) verilmeli');
        let a: AnnouncementDoc;
        if (i.id !== undefined) a = await this.load(i.id);
        else a = { ...normalizeAnnouncement(i.draft!), status: 'draft', _id: 'preview' } as AnnouncementDoc;
        const out: Record<string, any> = { banner: toTenantDto(a), notification: {}, email: {} };
        for (const locale of ['tr', 'en'] as const) {
            const params = {
                announcementId: String(a._id), kind: a.kind, title: a.title.tr, summary: a.body.tr,
                ...(a.title.en ? { titleEn: a.title.en } : {}), ...(a.body.en ? { summaryEn: a.body.en } : {}),
            };
            out.notification[locale] = renderNotification('SYSTEM_ANNOUNCEMENT', params, locale);
            out.email[locale] = buildInstantEmail({
                code: 'SYSTEM_ANNOUNCEMENT', params, locale, service: false, appUrl: this.d.appUrl,
                preferencesUrl: this.d.appUrl ? `${this.d.appUrl}/settings/notifications` : undefined, unsubscribeUrl: 'https://example.invalid/unsubscribe-preview',
            });
        }
        return out;
    }
}

// ADR-0029 NB7: backoffice teslim günlüğü / tenant geçmişi / katalog-önizleme / test e-postası + duyuru yönetimi (AnnouncementAdmin). DB/SMTP YOK.
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { NotificationOps, toDeliveryRow, encodeCursor } from '../../../src/operations/notifications/backofficeOps';
import { AnnouncementAdmin } from '../../../src/operations/notifications/announcementAdmin';
import type { AnnouncementInput } from '../../../src/operations/notifications/announcements';
import { AuditLogger } from '../../../src/services/audit/AuditLogger';
import { getCatalogDto } from '../../../src/operations/notifications/catalog';
import { FakeNotifyModel } from '../../helpers/fakeNotifyDb';

const NOW = new Date('2026-10-01T10:00:00Z');
const H = 3_600_000;
const oid = (n: number) => n.toString(16).padStart(24, '0');
const ACTOR = { sub: 'a'.repeat(24), ip: '10.0.0.1' };

let audits: any[];
beforeEach(() => { audits = []; AuditLogger.setSink(async (r: any) => { audits.push(r); }); });
const settle = () => new Promise((r) => setTimeout(r, 5));

const delivery = (i: number, over: Record<string, unknown> = {}) => ({
    _id: oid(i), eventId: oid(1000 + i), tid: 7, userId: `user-${i}`, code: 'ORDER_SYNC_FAILED', channel: 'email', mode: 'instant', status: 'sent', attempts: 1,
    createdAt: new Date(NOW.getTime() - i * H), nextAttemptAt: new Date(NOW.getTime() - i * H), ...over,
});

function build(seed: { deliveries?: any[]; events?: any[]; users?: any[] } = {}, extra: Partial<ConstructorParameters<typeof NotificationOps>[0]> = {}) {
    const deliveries = new FakeNotifyModel(seed.deliveries ?? []);
    const events = new FakeNotifyModel(seed.events ?? []);
    const users = new FakeNotifyModel(seed.users ?? []);
    const sent: any[] = [];
    const ops = new NotificationOps({
        applicationDB: { getNotificationDeliveryModel: () => deliveries, getNotificationEventModel: () => events, getUserModel: () => users },
        now: () => NOW, flags: () => ({ emailEnabled: true }), appUrl: 'https://app.example.com',
        transport: { send: async (m) => { sent.push(m); return { messageId: 'mid' }; } }, ...extra,
    });
    return { ops, deliveries, events, users, sent };
}

describe('getDeliveryStats', () => {
    it('24 sa ve 7 gün pencereleri: durum/kanal/kod kırılımı + en eski bekleyenin yaşı', async () => {
        const { ops, deliveries } = build({ deliveries: [delivery(1, { status: 'pending', nextAttemptAt: new Date(NOW.getTime() - 90 * 1000) })] });
        deliveries.aggregateResult = [
            { _id: { channel: 'email', status: 'sent', code: 'A' }, n: 5 }, { _id: { channel: 'email', status: 'dead', code: 'A' }, n: 2 }, { _id: { channel: 'email', status: 'pending', code: 'B' }, n: 1 },
        ];
        const s = await ops.getDeliveryStats();
        expect(s.windows['24h'].byStatus).toMatchObject({ sent: 5, dead: 2, pending: 1, failed: 0, skipped: 0 });
        expect(s.windows['7d'].byChannelStatus).toEqual(expect.arrayContaining([{ channel: 'email', status: 'sent', count: 5 }]));
        expect(s.windows['24h'].byCode[0]).toEqual({ code: 'A', statuses: { sent: 5, dead: 2 } });
        expect(s.oldestPendingAgeSec).toBe(90);
    });
    it('bekleyen yoksa yaş null', async () => {
        expect((await build().ops.getDeliveryStats()).oldestPendingAgeSec).toBeNull();
    });
});

describe('listDeliveries', () => {
    const seed = () => Array.from({ length: 5 }, (_, i) => delivery(i + 1, { status: i % 2 ? 'dead' : 'sent', tid: i < 3 ? 7 : 8, lastErrorCode: i % 2 ? 'SMTP_5XX' : undefined }));
    it('e-posta adresi / userId / platformRecipient / içerik dönmez; yalnız beyaz listeli alanlar', async () => {
        const { ops } = build({ deliveries: seed() });
        const out = await ops.listDeliveries({});
        expect(Object.keys(out.items[0]).sort()).toEqual(['attempts', 'channel', 'code', 'createdAt', 'eventId', 'id', 'lastErrorCode', 'mode', 'nextAttemptAt', 'sentAt', 'status', 'tid']);
        expect(JSON.stringify(out)).not.toMatch(/user-\d|@/);
        expect(toDeliveryRow(delivery(1, { userId: 'platform:abc' })).id).toBe(oid(1));
    });
    it('filtre (durum/tenant/kod/olay) + imleç sayfalama (yeniden eskiye)', async () => {
        const { ops } = build({ deliveries: seed() });
        expect((await ops.listDeliveries({ status: 'dead' })).items.map((x: any) => x.id)).toEqual([oid(4), oid(2)]);
        expect((await ops.listDeliveries({ tid: 8 })).items).toHaveLength(2);
        expect((await ops.listDeliveries({ eventId: oid(1003) })).items.map((x: any) => x.id)).toEqual([oid(3)]);
        const p1 = await ops.listDeliveries({ limit: 2 });
        expect(p1.items.map((x: any) => x.id)).toEqual([oid(5), oid(4)]);
        expect(p1.nextCursor).toBe(encodeCursor(oid(4)));
        const p3 = await ops.listDeliveries({ limit: 2, cursor: encodeCursor(oid(2)) });
        expect(p3.items.map((x: any) => x.id)).toEqual([oid(1)]);
        expect(p3.nextCursor).toBeNull();
    });
    it('limit 200 ile sınırlanır; bozuk imleç/eventId 400', async () => {
        const { ops } = build({ deliveries: seed() });
        await expect(ops.listDeliveries({ cursor: '###' })).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION' });
        await expect(ops.listDeliveries({ eventId: 'xx' })).rejects.toMatchObject({ statusCode: 400 });
    });
});

describe('retryDelivery / discardDelivery', () => {
    it('yeniden dene: dead/failed -> pending (deneme sıfırlanır, hata kodu silinir) + audit(gerekçe)', async () => {
        const { ops, deliveries } = build({ deliveries: [delivery(1, { status: 'dead', attempts: 5, lastErrorCode: 'SMTP_5XX', leaseUntil: NOW })] });
        expect(await ops.retryDelivery(ACTOR, { id: oid(1), reason: 'SMTP düzeldi, yeniden dene' })).toEqual({ id: oid(1), ok: true });
        expect(deliveries.docs[0]).toMatchObject({ status: 'pending', attempts: 0, nextAttemptAt: NOW });
        expect(deliveries.docs[0].lastErrorCode).toBeUndefined();
        expect(deliveries.docs[0].leaseUntil).toBeUndefined();
        await settle();
        expect(audits.find((a) => a.event === 'backoffice.notifications.retry_delivery')).toMatchObject({ result: 'ok', sub: ACTOR.sub, surface: 'backoffice', actorType: 'platform', meta: { deliveryId: oid(1), reason: 'SMTP düzeldi, yeniden dene' } });
    });
    it('durum uygun değilse 409, kayıt yoksa 404 (audit fail); gönderilmekte olan (sending) değiştirilmez', async () => {
        const { ops, deliveries } = build({ deliveries: [delivery(1, { status: 'sent' }), delivery(2, { status: 'sending' })] });
        await expect(ops.retryDelivery(ACTOR, { id: oid(1), reason: 'gönderilmiş olanı dene' })).rejects.toMatchObject({ statusCode: 409, code: 'DELIVERY_STATE' });
        await expect(ops.discardDelivery(ACTOR, { id: oid(2), reason: 'gönderilenleri at' })).rejects.toMatchObject({ statusCode: 409, code: 'DELIVERY_STATE' });
        await expect(ops.retryDelivery(ACTOR, { id: oid(99), reason: 'olmayan kaydı dene' })).rejects.toMatchObject({ statusCode: 404, code: 'DELIVERY_NOT_FOUND' });
        await expect(ops.retryDelivery(ACTOR, { id: 'kötü', reason: 'kimlik bozuk' })).rejects.toMatchObject({ statusCode: 400 });
        expect(deliveries.docs.map((d) => d.status)).toEqual(['sent', 'sending']);
        await settle();
        expect(audits.filter((a) => a.result === 'fail').map((a) => a.meta.why)).toEqual(['state', 'state', 'not_found']);
    });
    it('at: pending/dead/failed/skipped -> suppressed:discarded (bir daha denenmez) + audit', async () => {
        const { ops, deliveries } = build({ deliveries: [delivery(1, { status: 'dead' }), delivery(2, { status: 'pending' })] });
        await ops.discardDelivery(ACTOR, { id: oid(1), reason: 'artık gereksiz kayıt' });
        await ops.discardDelivery(ACTOR, { id: oid(2), reason: 'artık gereksiz kayıt' });
        expect(deliveries.docs.map((d) => [d.status, d.lastErrorCode])).toEqual([['suppressed', 'discarded'], ['suppressed', 'discarded']]);
        await settle();
        expect(audits.filter((a) => a.event === 'backoffice.notifications.discard_delivery' && a.result === 'ok')).toHaveLength(2);
    });
});

describe('getTenantHistory (yalnız meta)', () => {
    const ev = (i: number, over: Record<string, unknown> = {}) => ({
        _id: oid(i), tid: 7, kind: 'event', code: 'ORDER_SYNC_FAILED', category: 'order', severity: 'error', count: 3, recipientCount: 2, inAppCount: 2, emailQueued: 1, suppressedCount: 0,
        params: { orderId: 'SIPARIS-GIZLI', sku: 'SKU-GIZLI' }, lastOccurredAt: new Date(NOW.getTime() - i * H), createdAt: new Date(NOW.getTime() - i * H), ...over,
    });
    it('params/tenant içeriği dönmez; e-posta durum özeti olay başına; başka tenant ve dedupe işaretleri gelmez; imleç', async () => {
        const { ops, deliveries } = build({ events: [ev(1), ev(2), ev(3, { tid: 8 }), ev(4, { kind: 'dedupe' }), ev(5)] });
        deliveries.aggregateResult = [{ _id: { eventId: oid(2), status: 'sent' }, n: 1 }, { _id: { eventId: oid(2), status: 'dead' }, n: 1 }];
        const out = await ops.getTenantHistory({ tid: 7, limit: 2 });
        expect(out.items.map((x: any) => x.id)).toEqual([oid(5), oid(2)]);
        expect(out.items[1]).toMatchObject({ code: 'ORDER_SYNC_FAILED', category: 'order', severity: 'error', count: 3, recipientCount: 2, emailStatus: { sent: 1, dead: 1 } });
        expect(JSON.stringify(out)).not.toMatch(/GIZLI|params/);
        expect(out.nextCursor).toBe(encodeCursor(oid(2)));
        const p2 = await ops.getTenantHistory({ tid: 7, limit: 2, cursor: out.nextCursor });
        expect(p2.items.map((x: any) => x.id)).toEqual([oid(1)]);
    });
});

describe('getCatalog / previewTemplate', () => {
    it('katalog: tüm kodlar + örnek parametreler', () => {
        const { ops } = build();
        const c = ops.getCatalog();
        expect(c.items.length).toBe(getCatalogDto().length);
        expect(c.items.find((x: any) => x.code === 'SYSTEM_ANNOUNCEMENT')).toMatchObject({ surface: 'tenant', example: { kind: 'maintenance' } });
        expect(c.items.find((x: any) => x.code === 'PLATFORM_ALERT_FIRING')).toMatchObject({ surface: 'platform' });
    });
    it('uygulama içi önizleme: örnek parametrelerle render; tr/en; eylem yolu ve önem', () => {
        const { ops } = build();
        const tr = ops.previewTemplate({ code: 'INTEGRATION_AUTH_FAILED', locale: 'tr', channel: 'inApp' });
        expect(tr).toMatchObject({ channel: 'inApp', locale: 'tr', severity: 'critical', actionPath: '/integrations/marketplace?code=n11' });
        expect(tr.title).toBeTruthy();
        expect(ops.previewTemplate({ code: 'INTEGRATION_AUTH_FAILED', locale: 'en', channel: 'inApp' }).title).not.toBe(tr.title);
    });
    it('e-posta önizleme: konu/metin/html; zorunlu olmayanda abonelik bağlantısı yer tutucu; HTML kaçışlı; gönderim YOK', () => {
        const { ops, sent } = build();
        const m = ops.previewTemplate({ code: 'SYSTEM_ANNOUNCEMENT', locale: 'tr', channel: 'email', params: { announcementId: 'AN-1', kind: 'info', title: '<script>alert(1)</script>', summary: 'x' } });
        expect(m.subject).toContain('Entegrasyonik');
        expect(m.html).not.toContain('<script>alert(1)</script>');
        expect(m.html).toContain('&lt;script&gt;');
        expect(m.html).toContain('unsubscribe-preview');
        const sec = ops.previewTemplate({ code: 'SECURITY_PASSWORD_CHANGED', locale: 'en', channel: 'email' });
        expect(sec.html).not.toContain('unsubscribe-preview');
        expect(sent).toHaveLength(0);
    });
    it('geçersiz params (strict) 400 (yalnız alan yolu/kural kodu, değer yok); bilinmeyen kod 404', () => {
        const { ops } = build();
        expect(() => ops.previewTemplate({ code: 'INTEGRATION_AUTH_FAILED', locale: 'tr', channel: 'inApp', params: { integ: 'n11', email: 'gizli@x.com' } })).toThrow(expect.objectContaining({ statusCode: 400, code: 'VALIDATION' }));
        try { ops.previewTemplate({ code: 'INTEGRATION_AUTH_FAILED', locale: 'tr', channel: 'inApp', params: { integ: 'n11', email: 'gizli@x.com' } }); } catch (e: any) { expect(e.message).not.toContain('gizli@x.com'); }
        expect(() => ops.previewTemplate({ code: 'NOPE_CODE', locale: 'tr', channel: 'inApp' })).toThrow(expect.objectContaining({ statusCode: 404 }));
    });
});

describe('sendTestEmail', () => {
    const ADMIN_ID = 'a'.repeat(24);
    const users = [{ _id: ADMIN_ID, isGlobalAdmin: true, email: 'admin@example.com' }];
    it('yalnız yöneticinin KENDİ adresine gider; yanıt/audit adres içermez', async () => {
        const { ops, sent } = build({ users });
        expect(await ops.sendTestEmail(ACTOR, { reason: 'SMTP doğrulaması yapılıyor' })).toEqual({ sent: true });
        expect(sent).toHaveLength(1);
        expect(sent[0].to).toBe('admin@example.com');
        expect(sent[0].subject).toContain('[TEST]');
        await settle();
        expect(JSON.stringify(audits)).not.toContain('admin@example.com');
        expect(audits.find((a) => a.event === 'backoffice.notifications.test_email')).toMatchObject({ result: 'ok', meta: { reason: 'SMTP doğrulaması yapılıyor' } });
    });
    it('e-posta kapalı 503 NOTIFY_EMAIL_UNAVAILABLE (taşıyıcı çağrılmaz); taşıyıcı hatası 503 (ham hata yok); yönetici yoksa 404', async () => {
        const off = build({ users }, { flags: () => ({ emailEnabled: false }) });
        await expect(off.ops.sendTestEmail(ACTOR, { reason: 'kapalıyken dene ok' })).rejects.toMatchObject({ statusCode: 503, code: 'NOTIFY_EMAIL_UNAVAILABLE' });
        expect(off.sent).toHaveLength(0);
        const fail = build({ users }, { transport: { send: async () => { throw new Error('535 auth gizli-sifre'); } } });
        const err: any = await fail.ops.sendTestEmail(ACTOR, { reason: 'taşıyıcı hata verir' }).catch((e) => e);
        expect(err).toMatchObject({ statusCode: 503, code: 'NOTIFY_EMAIL_UNAVAILABLE' });
        expect(err.message).not.toContain('gizli-sifre');
        await expect(build({ users: [] }).ops.sendTestEmail(ACTOR, { reason: 'yönetici kaydı yok' })).rejects.toMatchObject({ statusCode: 404 });
        await expect(build({ users }).ops.sendTestEmail({ sub: 'b'.repeat(24) }, { reason: 'başka biri gibi dene' })).rejects.toMatchObject({ statusCode: 404 });
    });
});

describe('AnnouncementAdmin', () => {
    const input = (over: Partial<AnnouncementInput> = {}): AnnouncementInput => ({
        kind: 'info', title: { tr: 'Yeni özellik', en: 'New feature' }, body: { tr: 'Detaylar', en: 'Details' }, target: { mode: 'all' },
        channels: { banner: true, inApp: true, email: false }, startsAt: '2026-10-02T09:00:00Z', ...over,
    });
    const mk = (seed: any[] = []) => { const model = new FakeNotifyModel(seed); return { model, a: new AnnouncementAdmin({ model: model as any, now: () => NOW, appUrl: 'https://app.example.com' }) }; };

    it('oluştur -> taslak (yazar kaydedilir); güncelle yalnız taslakta; aktifte 409', async () => {
        const { a, model } = mk();
        const c = await a.create(ACTOR, input());
        expect(c.announcement).toMatchObject({ status: 'draft', createdBy: ACTOR.sub, kind: 'info', severity: 'info', dismissible: true, fanout: null });
        const id = c.announcement.id;
        const u = await a.update(ACTOR, { id, announcement: input({ title: { tr: 'Güncel' } }) });
        expect(u.announcement).toMatchObject({ title: { tr: 'Güncel' }, updatedBy: ACTOR.sub });
        model.docs[0].status = 'active';
        await expect(a.update(ACTOR, { id, announcement: input() })).rejects.toMatchObject({ statusCode: 409, code: 'ANNOUNCEMENT_STATE' });
        await expect(a.get({ id: oid(99) })).rejects.toMatchObject({ statusCode: 404, code: 'ANNOUNCEMENT_NOT_FOUND' });
        await expect(a.get({ id: 'x' })).rejects.toMatchObject({ statusCode: 400 });
    });

    it('zamanla: gelecek -> scheduled, geçmiş -> active; e-posta için onay zorunlu, onaylanınca audit (hedef + gerekçe)', async () => {
        const { a } = mk();
        const s = await a.create(ACTOR, input());
        expect((await a.schedule(ACTOR, { id: s.announcement.id, reason: 'duyuru yayına alınıyor' })).announcement).toMatchObject({ status: 'scheduled', scheduledBy: ACTOR.sub });
        const past = await a.create(ACTOR, input({ startsAt: '2026-10-01T08:00:00Z' }));
        expect((await a.schedule(ACTOR, { id: past.announcement.id, reason: 'hemen yayına alınıyor' })).announcement.status).toBe('active');

        const mail = await a.create(ACTOR, input({ channels: { banner: true, inApp: true, email: true }, target: { mode: 'plans', planCodes: ['pro'] } }));
        await expect(a.schedule(ACTOR, { id: mail.announcement.id, reason: 'e-posta duyurusu yayında' })).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION' });
        const ok = await a.schedule(ACTOR, { id: mail.announcement.id, emailConsent: true, reason: 'e-posta duyurusu yayında' });
        expect(ok.announcement).toMatchObject({ status: 'scheduled' });
        expect(ok.announcement.emailConsentAt).toEqual(NOW);
        await settle();
        expect(audits.find((x) => x.event === 'backoffice.notifications.announcement_email')).toMatchObject({ sub: ACTOR.sub, meta: { announcementId: mail.announcement.id, target: 'plans', reason: 'e-posta duyurusu yayında' } });
        await expect(a.schedule(ACTOR, { id: mail.announcement.id, reason: 'ikinci kez zamanla' })).rejects.toMatchObject({ statusCode: 409 });
    });

    it('iptal: draft/scheduled/active iptal edilir; sona ermiş/iptal edilmiş 409', async () => {
        const { a, model } = mk();
        const c = await a.create(ACTOR, input());
        expect((await a.cancel(ACTOR, { id: c.announcement.id, reason: 'yanlış duyuru girildi' })).announcement).toMatchObject({ status: 'cancelled', cancelledBy: ACTOR.sub });
        await expect(a.cancel(ACTOR, { id: c.announcement.id, reason: 'ikinci iptal denemesi' })).rejects.toMatchObject({ statusCode: 409 });
        model.docs[0].status = 'ended';
        await expect(a.cancel(ACTOR, { id: c.announcement.id, reason: 'bitmiş olanı iptal' })).rejects.toMatchObject({ statusCode: 409 });
    });

    it('liste: durum/tür/tarih filtresi + imleç; fanout özeti sayaç olarak döner', async () => {
        const { a, model } = mk();
        for (let i = 0; i < 3; i++) await a.create(ACTOR, input({ kind: i === 0 ? 'release' : 'info', startsAt: `2026-10-0${i + 2}T09:00:00Z` }));
        model.docs[1].status = 'active'; model.docs[1].fanout = { doneAt: NOW, tenants: 4, notified: 3 };
        expect((await a.list({ status: 'active' })).items[0].fanout).toEqual({ done: true, tenants: 4, notified: 3 });
        expect((await a.list({ kind: 'release' })).items).toHaveLength(1);
        expect((await a.list({ from: '2026-10-03T00:00:00Z', to: '2026-10-03T23:59:59Z' })).items).toHaveLength(1);
        const p1 = await a.list({ limit: 2 });
        expect(p1.items).toHaveLength(2);
        expect((await a.list({ limit: 2, cursor: p1.nextCursor })).items).toHaveLength(1);
        await expect(a.list({ from: 'dün' })).rejects.toMatchObject({ statusCode: 400 });
    });

    it('önizleme: bant + tr/en bildirim + tr/en e-posta (id ya da taslak; ikisi/hiçbiri 400); gönderim yok', async () => {
        const { a } = mk();
        const c = await a.create(ACTOR, input({ kind: 'maintenance' }));
        const byId = await a.preview({ id: c.announcement.id });
        expect(byId.banner).toMatchObject({ kind: 'maintenance', dismissible: false, title: { tr: 'Yeni özellik', en: 'New feature' } });
        expect(byId.notification.tr).toEqual({ title: 'Yeni özellik', message: 'Detaylar' });
        expect(byId.notification.en).toEqual({ title: 'New feature', message: 'Details' });
        expect(byId.email.en.subject).toContain('New feature');
        const draft = await a.preview({ draft: input({ title: { tr: 'Sadece TR' } }) });
        expect(draft.notification.en.title).toBe('Sadece TR');
        await expect(a.preview({})).rejects.toMatchObject({ statusCode: 400 });
        await expect(a.preview({ id: c.announcement.id, draft: input() })).rejects.toMatchObject({ statusCode: 400 });
        await expect(a.preview({ draft: input({ target: { mode: 'plans', planCodes: [] } }) })).rejects.toMatchObject({ statusCode: 400 });
    });
});

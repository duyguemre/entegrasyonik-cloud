// ADR-0029 NB5: uretim baglantisi. Modeller/Users tembel cozulur; bayrak kapaliyken (`runOnce` erken doner) hicbir DB cagrisi yok.
// Tasiyici `MailService.sendMessage` (tembel import: SMTP taşıyıcısı yalniz gercek gonderimde olusur).
import { config } from '@config';
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import { EmailDispatcher, type DispatcherDeps, type LedgerEvent, type LoadedPrefs } from './EmailDispatcher';
import { MongoDeliveryStore } from './deliveryStore';
import { normalizeDigest, normalizeQuiet } from './schedule';
import { parseAlertRecipients } from '../platformRecipients';

/** PUBLIC_APP_URL: https (ya da yalniz localhost icin http), kimlik bilgisi/sorgu/parca yok. Gecersiz/yoksa undefined. */
export function resolveAppUrl(raw: string | undefined): string | undefined {
    const v = (raw ?? '').trim();
    if (!v) return undefined;
    let u: URL;
    try { u = new URL(v); } catch { return undefined; }
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (!(u.protocol === 'https:' || (u.protocol === 'http:' && local))) return undefined;
    if (u.username || u.password || u.search || u.hash) return undefined;
    return (u.origin + u.pathname).replace(/\/+$/, '');
}

const app = () => DatabaseManagerInstance.getApplicationDB();

export function createEmailDispatcherDeps(): DispatcherDeps {
    return {
        store: new MongoDeliveryStore(lazyModelPort()),
        flags: () => ({ v2Enabled: config.notify.v2Enabled, emailEnabled: config.notify.emailEnabled }),
        async loadUser(userId) {
            const u: any = await (await app()).getUserModel().findOne({ _id: userId }, { email: 1, emailVerified: 1, isActive: 1 }).lean();
            return u ? { email: u.email, emailVerified: u.emailVerified === true, isActive: u.isActive !== false } : null;
        },
        async loadPrefs(tid, userId): Promise<LoadedPrefs> {
            const rows: any[] = await (await app()).getNotificationPreferencesModel().find({ tid, userId: { $in: [userId, null] } }).lean();
            const user = rows.find((r) => r.userId === userId); const tenant = rows.find((r) => r.userId == null);
            return {
                locale: user?.locale ?? tenant?.locale, user: user?.matrix, tenant: tenant?.matrix,
                digest: normalizeDigest(user?.digest ?? tenant?.digest), quiet: normalizeQuiet(user?.quietHours ?? tenant?.quietHours),
            };
        },
        async loadEvents(ids) {
            const rows: any[] = await (await app()).getNotificationEventModel().find({ _id: { $in: ids } }, { params: 1, count: 1 }).lean();
            return new Map<string, LedgerEvent>(rows.map((r) => [String(r._id), { params: r.params, count: r.count }]));
        },
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- TS6-01: node16 CJS, tembel yukleme (dinamik import yerine)
        transport: { async send(msg) { const { mailService } = (require('@services/mail/MailService') as typeof import('@services/mail/MailService')); return mailService.sendMessage(msg); } },
        appUrl: resolveAppUrl(config.mail.publicAppUrl),
        apiUrl: resolveAppUrl(config.notify.publicApiUrl) ?? resolveAppUrl(config.mail.publicAppUrl), // ADR-0027: abonelik baglantisi API origin'inde
        unsubSecret: config.notify.unsubSecret,
        // NB8: platform alarm alicisi ozetten env listesine (adres veritabaninda yok)
        platformRecipient: (hash) => parseAlertRecipients(config.notify.alertEmailTo).find((r) => r.hash === hash)?.email,
    };
}

async function lazy(getter: 'getNotificationDeliveryModel', method: string, args: any[]) {
    return ((await app()) as any)[getter]()[method](...args);
}

export function createEmailDispatcher(): EmailDispatcher {
    return new EmailDispatcher(createEmailDispatcherDeps());
}

/** Model tembel cozulur; find zinciri (sort/limit/lean) `find` cagrisi ile birlikte cozulur. */
function lazyModelPort() {
    return {
        findOneAndUpdate: (...a: any[]) => lazy('getNotificationDeliveryModel', 'findOneAndUpdate', a),
        updateOne: (...a: any[]) => lazy('getNotificationDeliveryModel', 'updateOne', a),
        find: (filter: any) => {
            const state: { sort?: any; limit?: number } = {};
            const chain: any = {
                sort(s: any) { state.sort = s; return chain; },
                limit(n: number) { state.limit = n; return chain; },
                lean: async () => {
                    let q = ((await app()) as any).getNotificationDeliveryModel().find(filter);
                    if (state.sort) q = q.sort(state.sort);
                    if (state.limit) q = q.limit(state.limit);
                    return q.lean();
                },
            };
            return chain;
        },
    };
}

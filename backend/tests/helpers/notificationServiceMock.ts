import { jest } from '@jest/globals';
// ADR-0029 NB3: NotificationService cephe sahtesi. Bayrak KAPALI davranisini yansitir: `notify(..., {legacy})` eski
// `sendClientNotification(legacy.event)` yolunu birebir cagirir (kisma `legacy.throttle` dahil degil; cephe testi ayri).
// Kullanim: jest.mock('@services/notification/NotificationService', () => require('<rel>/helpers/notificationServiceMock').notificationServiceModule());
export function notificationServiceModule() {
    const svc: any = {
        sendClientNotification: jest.fn(),
        notify: jest.fn(async (_code: string, _tid: number, _params: unknown, opts?: any) => {
            if (opts?.legacy) await svc.sendClientNotification(opts.legacy.event);
            return { status: 'skipped', reason: 'mock' };
        }),
        resetLegacyThrottleForTests: jest.fn(),
    };
    return { NotificationService: svc };
}

/** NB3: `notify` cagrisini bulur, params'i KATALOG zod semasiyla dogrular (strict) ve [code, tid, params, opts] doner. */
export function expectCatalogNotify(svc: any, code: string, tid?: number) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getDefinition } = require('@operations/notifications/catalog');
    const call = svc.notify.mock.calls.find((c: any[]) => c[0] === code && (tid === undefined || c[1] === tid));
    if (!call) throw new Error(`notify(${code}, ${tid}) cagrilmadi; cagrilar: ${svc.notify.mock.calls.map((c: any[]) => c[0]).join(',')}`);
    const parsed = getDefinition(code).params.safeParse(call[2]);
    if (!parsed.success) throw new Error(`params katalog semasina uymuyor (${code}): ${JSON.stringify(parsed.error.issues)}`);
    return call as [string, number, Record<string, unknown>, Record<string, any>];
}

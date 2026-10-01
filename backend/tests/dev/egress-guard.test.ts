import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import * as net from 'net';
import * as http from 'http';

// Auto-install kapalı: koruma yalnızca bu dosyada açılır ve sonunda geri alınır (diğer testleri etkilemesin).
process.env.EGRESS_GUARD_NO_AUTOINSTALL = '1';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const guard = require('../../dev-tools/egress-guard.js');

/**
 * GÜVENLİK: Bu test GERÇEK AĞA HİÇ DOKUNMAZ. Gerçek `Socket.prototype.connect` sahte bir "ağ" ile değiştirilir
 * (her bağlantı SIMULATED_NETWORK hatasıyla düşer); guard bunun ÜSTÜNE kurulur. Guard bozuk olsa bile
 * hiçbir gerçek bağlantı kurulamaz — yalnızca test kırılır.
 */
const realConnect = net.Socket.prototype.connect;
const fakeNetwork = jest.fn(function (this: net.Socket) {
    process.nextTick(() => this.destroy(Object.assign(new Error('simulated network'), { code: 'SIMULATED_NETWORK' })));
    return this;
});

function connectError(opts: net.NetConnectOpts): Promise<any> {
    return new Promise(resolve => {
        const s = net.connect(opts);
        s.on('error', resolve);
        s.on('connect', () => { s.destroy(); resolve(null); });
    });
}

describe('egress-guard (Protokol 7: loopback dışına çıkış yok)', () => {
    beforeAll(() => {
        (net.Socket.prototype as any).connect = fakeNetwork;
        guard.install();
    });
    afterAll(() => {
        guard.uninstall();
        (net.Socket.prototype as any).connect = realConnect;
        delete process.env.EGRESS_ALLOW;
    });

    it('isAllowedHost: loopback izinli, dış host yasak', () => {
        expect(guard.isAllowedHost('localhost')).toBe(true);
        expect(guard.isAllowedHost('127.0.0.1')).toBe(true);
        expect(guard.isAllowedHost('::1')).toBe(true);
        expect(guard.isAllowedHost(undefined)).toBe(true);
        expect(guard.isAllowedHost('api.trendyol.com')).toBe(false);
        expect(guard.isAllowedHost('mongodbcluster.example.mongodb.net')).toBe(false);
        expect(guard.isAllowedHost('8.8.8.8')).toBe(false);
    });

    it('dış host\'a net.connect: EGRESS_BLOCKED ve (sahte) ağ katmanına HİÇ ulaşmaz', async () => {
        fakeNetwork.mockClear();
        const err = await connectError({ host: 'api.trendyol.com', port: 443 });
        expect(err?.code).toBe('EGRESS_BLOCKED');
        expect(fakeNetwork).not.toHaveBeenCalled();
    });

    it('dış IP\'ye bağlantı engellenir', async () => {
        fakeNetwork.mockClear();
        const err = await connectError({ host: '203.0.113.10', port: 80 });
        expect(err?.code).toBe('EGRESS_BLOCKED');
        expect(fakeNetwork).not.toHaveBeenCalled();
    });

    it('(host, port) biçimindeki eski çağrı imzası da engellenir', async () => {
        fakeNetwork.mockClear();
        const err: any = await new Promise(resolve => {
            const s = new net.Socket();
            s.on('error', resolve);
            (s as any).connect(443, 'api.hepsiburada.com');
        });
        expect(err?.code).toBe('EGRESS_BLOCKED');
        expect(fakeNetwork).not.toHaveBeenCalled();
    });

    it('http.get ile dış adres engellenir (axios/AWS SDK\'nın kullandığı yol)', async () => {
        fakeNetwork.mockClear();
        const err: any = await new Promise(resolve => {
            http.get('http://api.hepsiburada.com/x', () => resolve(null)).on('error', resolve);
        });
        expect(err?.code).toBe('EGRESS_BLOCKED');
        expect(fakeNetwork).not.toHaveBeenCalled();
    });

    it('loopback bağlantısı guard tarafından ENGELLENMEZ (sahte ağ katmanına geçer)', async () => {
        fakeNetwork.mockClear();
        const err = await connectError({ host: '127.0.0.1', port: 6379 });
        expect(err?.code).toBe('SIMULATED_NETWORK'); // guard geçirdi; sahte ağ düşürdü
        expect(fakeNetwork).toHaveBeenCalledTimes(1);
    });

    it("web push host'lari VARSAYILAN ENGELLI; yalniz EGRESS_ALLOW_WEBPUSH=1 ile acilir ve liste pushHosts ile AYNIDIR (MOB-04)", () => {
        const { PUSH_SERVICE_HOSTS } = require('../../src/operations/notifications/push/pushHosts');
        expect([...guard.PUSH_HOSTS].sort()).toEqual([...PUSH_SERVICE_HOSTS].sort());
        const samples = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com', 'wns2-db5p.notify.windows.com'];
        delete process.env.EGRESS_ALLOW_WEBPUSH;
        for (const h of samples) expect(guard.isAllowedHost(h)).toBe(false);
        process.env.EGRESS_ALLOW_WEBPUSH = '1';
        for (const h of samples) expect(guard.isAllowedHost(h)).toBe(true);
        expect(guard.isAllowedHost('notify.windows.com')).toBe(false); // joker yalniz alt alan
        expect(guard.isAllowedHost('evilnotify.windows.com')).toBe(false);
        expect(guard.isAllowedHost('api.trendyol.com')).toBe(false);
        expect(guard.isAllowedHost('api.anthropic.com')).toBe(false); // push bayragi LLM'i acmaz
        // MOB-07: FCM HTTP v1 OAuth2 ucu ayni bayrakla; ayni kaynakla hizali
        const { FCM_TOKEN_URL } = require('../../src/operations/notifications/push/fcm');
        expect(guard.FCM_OAUTH_HOSTS).toEqual([new URL(FCM_TOKEN_URL).hostname]);
        expect(guard.isAllowedHost('oauth2.googleapis.com')).toBe(true);
        delete process.env.EGRESS_ALLOW_WEBPUSH;
        expect(guard.isAllowedHost('oauth2.googleapis.com')).toBe(false);
    });
    it("LLM saglayici host'lari VARSAYILAN ENGELLI; yalniz EGRESS_ALLOW_LLM=1 ile acilir ve liste katalogla AYNIDIR (ADR-0034 BR-5)", () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { LLM_HOSTS } = require('../../src/platform/llm/catalog');
        expect([...guard.LLM_HOSTS].sort()).toEqual(Object.values(LLM_HOSTS).sort());
        delete process.env.EGRESS_ALLOW_LLM;
        for (const h of guard.LLM_HOSTS) expect(guard.isAllowedHost(h)).toBe(false);
        process.env.EGRESS_ALLOW_LLM = '1';
        for (const h of guard.LLM_HOSTS) expect(guard.isAllowedHost(h)).toBe(true);
        expect(guard.isAllowedHost('api.evil.example')).toBe(false);
        expect(guard.isAllowedHost('api.trendyol.com')).toBe(false); // yalniz LLM: pazaryeri acilmaz
        delete process.env.EGRESS_ALLOW_LLM;
    });

    it('EGRESS_ALLOW ile ek host izinli olur', () => {
        process.env.EGRESS_ALLOW = 'redis, mongo';
        expect(guard.isAllowedHost('redis')).toBe(true);
        expect(guard.isAllowedHost('MONGO')).toBe(true);
        expect(guard.isAllowedHost('example.com')).toBe(false);
        delete process.env.EGRESS_ALLOW;
    });
});

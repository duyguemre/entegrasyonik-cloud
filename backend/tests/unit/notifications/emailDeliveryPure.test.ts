/**
 * ADR-0029 NB5 -- saf birimler: retry zaman cizelgesi + siniflandirma, abonelik belirteci, sessiz saat / ozet zamani,
 * sablon render (tr/en, PII yok, kacis, ust bilgi enjeksiyonu). Ag/DB/SMTP YOK.
 */
import { describe, it, expect } from '@jest/globals';
import { decideAfterFailure, MAX_ATTEMPTS, RETRY_DELAYS_MS } from '@operations/notifications/delivery/retry';
import { signUnsubscribeToken, verifyUnsubscribeToken, UNSUB_TOKEN_TTL_MS } from '@operations/notifications/delivery/unsubscribeToken';
import { nextDigestAt, normalizeDigest, normalizeQuiet, quietUntil } from '@operations/notifications/delivery/schedule';
import { classifyMailError, maskEmail } from '@services/mail/classifyMailError';
import { buildDigestEmail, buildInstantEmail } from '@operations/notifications/templates/email';
import { oneLine } from '@operations/notifications/templates/layout';
import { getDefinition, NOTIFICATION_CATALOG } from '@operations/notifications/catalog';

const MIN = 60_000;
const SECRET = 's'.repeat(40);
const T0 = new Date('2026-09-30T10:00:00Z');

describe('retry politikasi', () => {
    it('cizelge 1dk,5dk,30dk,2sa,12sa; 6. basarisizlikta dead', () => {
        expect(RETRY_DELAYS_MS).toEqual([1 * MIN, 5 * MIN, 30 * MIN, 120 * MIN, 720 * MIN]);
        for (let a = 1; a <= 5; a++) {
            const d = decideAfterFailure('transient', a, T0);
            expect(d).toEqual({ action: 'retry', nextAttemptAt: new Date(T0.getTime() + RETRY_DELAYS_MS[a - 1]) });
        }
        expect(MAX_ATTEMPTS).toBe(6);
        expect(decideAfterFailure('transient', 6, T0)).toEqual({ action: 'dead', reason: 'max_attempts' });
    });
    it('kalici hata ilk denemede dead', () => {
        expect(decideAfterFailure('permanent', 1, T0)).toEqual({ action: 'dead', reason: 'permanent' });
    });
    it('SMTP siniflandirma: 5xx/EENVELOPE kalici; 4xx/ag/bilinmeyen gecici; ham mesaj sizmaz', () => {
        expect(classifyMailError({ responseCode: 550 }).kind).toBe('permanent');
        expect(classifyMailError({ code: 'EENVELOPE' }).kind).toBe('permanent');
        expect(classifyMailError({ responseCode: 451 }).kind).toBe('transient');
        expect(classifyMailError({ code: 'ETIMEDOUT' }).kind).toBe('transient');
        expect(classifyMailError(new Error('x@y.com rejected')).code).toBe('unknown');
        expect(maskEmail('someone@example.com')).toBe('so***@example.com');
    });
});

describe('abonelik belirteci', () => {
    const p = { tid: 7, userId: 'u1', category: 'order' };
    it('gecerli belirtec dogrulanir', () => {
        const t = signUnsubscribeToken(SECRET, p, T0);
        const v = verifyUnsubscribeToken(SECRET, t, new Date(T0.getTime() + 1000));
        expect(v.ok && v.payload).toEqual(p);
    });
    it('sahte imza / kurcalanmis govde / yanlis anahtar reddedilir', () => {
        const t = signUnsubscribeToken(SECRET, p, T0);
        const [body, sig] = t.split('.');
        const evil = Buffer.from(JSON.stringify({ t: 8, u: 'u1', c: 'order', e: 9999999999 })).toString('base64url');
        expect(verifyUnsubscribeToken(SECRET, `${evil}.${sig}`, T0)).toEqual({ ok: false, reason: 'bad_signature' });
        expect(verifyUnsubscribeToken(SECRET, `${body}.${sig.slice(0, -2)}AA`, T0).ok).toBe(false);
        expect(verifyUnsubscribeToken('x'.repeat(40), t, T0)).toEqual({ ok: false, reason: 'bad_signature' });
        expect(verifyUnsubscribeToken(SECRET, 'garbage', T0)).toEqual({ ok: false, reason: 'malformed' });
        expect(verifyUnsubscribeToken(SECRET, undefined, T0)).toEqual({ ok: false, reason: 'malformed' });
        expect(verifyUnsubscribeToken(undefined, t, T0)).toEqual({ ok: false, reason: 'malformed' });
    });
    it('suresi gecmis belirtec reddedilir; sinirdan hemen once gecerli', () => {
        const t = signUnsubscribeToken(SECRET, p, T0);
        expect(verifyUnsubscribeToken(SECRET, t, new Date(T0.getTime() + UNSUB_TOKEN_TTL_MS - 2000)).ok).toBe(true);
        expect(verifyUnsubscribeToken(SECRET, t, new Date(T0.getTime() + UNSUB_TOKEN_TTL_MS + 1000))).toEqual({ ok: false, reason: 'expired' });
    });
    it('kisa anahtarla imzalanamaz', () => {
        expect(() => signUnsubscribeToken('short', p, T0)).toThrow('unsub_secret_missing');
    });
});

describe('ozet zamani ve sessiz saatler', () => {
    it('saatlik: sonraki tam saat', () => {
        expect(nextDigestAt(new Date('2026-09-30T10:20:00Z'), { cadence: 'hourly', hourLocal: 9 }).toISOString()).toBe('2026-09-30T11:00:00.000Z');
    });
    it('gunluk 09:00 Istanbul (UTC+3): 07:00Z sonrasi ertesi gun, oncesi ayni gun', () => {
        const d = { cadence: 'daily' as const, hourLocal: 9 };
        expect(nextDigestAt(new Date('2026-09-30T05:00:00Z'), d).toISOString()).toBe('2026-09-30T06:00:00.000Z');
        expect(nextDigestAt(new Date('2026-09-30T10:00:00Z'), d).toISOString()).toBe('2026-10-01T06:00:00.000Z');
    });
    it('varsayilan ozet tercihi gunluk 09:00; bozuk girdi duzeltilir', () => {
        expect(normalizeDigest(undefined)).toEqual({ cadence: 'daily', hourLocal: 9 });
        expect(normalizeDigest({ cadence: 'hourly', hourLocal: 99 })).toEqual({ cadence: 'hourly', hourLocal: 9 });
    });
    it('sessiz saat 22:00-08:00 (Istanbul): icindeyse bitis, disindaysa undefined', () => {
        const q = normalizeQuiet({ start: '22:00', end: '08:00', tz: 'Europe/Istanbul' });
        expect(quietUntil(new Date('2026-09-30T20:00:00Z'), q)?.toISOString()).toBe('2026-10-01T05:00:00.000Z'); // 23:00 yerel -> ertesi 08:00 yerel
        expect(quietUntil(new Date('2026-09-30T03:00:00Z'), q)?.toISOString()).toBe('2026-09-30T05:00:00.000Z'); // 06:00 yerel -> ayni gun 08:00
        expect(quietUntil(new Date('2026-09-30T10:00:00Z'), q)).toBeUndefined();
        expect(normalizeQuiet({ start: '25:00', end: '08:00' })).toBeUndefined();
    });
});

describe('sablon render', () => {
    const inst = NOTIFICATION_CATALOG.find((d) => d.surface === 'tenant' && !d.legacy && !d.mandatory && d.defaultChannels.email === 'instant' && d.action)!;
    const links = { appUrl: 'https://app.example.test', preferencesUrl: 'https://app.example.test/settings/notifications', unsubscribeUrl: 'https://app.example.test/api/notifications/unsubscribe?t=TOK' };

    it.each(['tr', 'en'] as const)('anlik (%s): HTML+metin, marka, karanlik mod, eylem + abonelik baglantisi', (locale) => {
        const m = buildInstantEmail({ code: inst.code, params: inst.example, locale, service: false, ...links });
        expect(m.subject.startsWith('[Entegrasyonik] ')).toBe(true);
        expect(m.html).toContain('prefers-color-scheme: dark');
        expect(m.html).toContain('name="color-scheme"');
        expect(m.html).toContain(`lang="${locale}"`);
        expect(m.html).toContain('https://app.example.test/');
        expect(m.html).toContain('unsubscribe?t=TOK');
        expect(m.text).toContain('unsubscribe?t=TOK');
        expect(m.text).not.toMatch(/<[a-z]/i);
    });
    it('tr ve en farkli metin uretir', () => {
        const tr = buildInstantEmail({ code: inst.code, params: inst.example, locale: 'tr', service: false });
        const en = buildInstantEmail({ code: inst.code, params: inst.example, locale: 'en', service: false });
        expect(tr.subject).not.toBe(en.subject);
    });
    it('zorunlu (hizmet) bildiriminde abonelik baglantisi YOK, altbilgi hizmet bildirimi der', () => {
        const def = getDefinition('SECURITY_PASSWORD_CHANGED')!;
        const m = buildInstantEmail({ code: def.code, params: def.example, locale: 'tr', service: true, ...links });
        expect(m.html).not.toContain('unsubscribe');
        expect(m.text).not.toContain('unsubscribe');
        expect(m.text).toContain('hizmet bildirimidir');
    });
    it('APP_URL yoksa eylem baglantisi uretilmez (metinde app-ici yol da yok)', () => {
        const m = buildInstantEmail({ code: inst.code, params: inst.example, locale: 'tr', service: false });
        expect(m.html).not.toContain('href="/');
        expect(m.html).not.toContain('Uygulamada aç');
    });
    it('PII / ham hata yok: ad, e-posta, parola sablon girdisi degil; parametre degerleri kacislanir', () => {
        const m = buildInstantEmail({ code: inst.code, params: { ...inst.example, integ: '<script>alert(1)</script>' }, locale: 'tr', service: false });
        expect(m.html).not.toContain('<script>');
        expect(m.html + m.text).not.toMatch(/[\w.-]+@[\w-]+\.\w+/);
    });
    it('Subject satir sonu enjeksiyonu temizlenir', () => {
        expect(oneLine('a\r\nBcc: evil@x.com')).not.toMatch(/[\r\n]/);
    });
    it('ozet: kategoriye gore bolumler, sayac notu, tr/en, zorunlu-olmayan ozet abonelik baglantisi tasir', () => {
        const a = getDefinition('ORDER_SYNC_FAILED')!; const b = getDefinition('STOCK_OVERSOLD')!;
        const en = buildDigestEmail({ items: [{ code: a.code, params: a.example, count: 3 }, { code: b.code, params: b.example }], locale: 'en', ...links });
        expect(en.subject).toContain('Notification digest (2)');
        expect(en.html).toContain('Orders'); expect(en.html).toContain('Stock'); expect(en.html).toContain('×3');
        expect(en.html).toContain('Unsubscribe');
        const tr = buildDigestEmail({ items: [{ code: a.code, params: a.example }], locale: 'tr', ...links });
        expect(tr.html).toContain('Siparişler');
    });
    it('ozet 50 kalemle sinirlanir ve kalan sayisi belirtilir', () => {
        const a = getDefinition('ORDER_SYNC_FAILED')!;
        const items = Array.from({ length: 60 }, () => ({ code: a.code, params: a.example }));
        expect(buildDigestEmail({ items, locale: 'tr' }).html).toContain('10 bildirim daha');
    });
});

// ADR-0027/NB6: abonelik baglantisi API origin'indedir (PUBLIC_API_URL); yoksa app origin'ine duser.
describe('abonelik baglantisi tabani (apiUrl)', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { EmailDispatcher } = require('@operations/notifications/delivery/EmailDispatcher');
    const SECRET = 'x'.repeat(48);
    const urls = (d: Record<string, unknown>) =>
        new EmailDispatcher({ appUrl: 'https://app.example.test', unsubSecret: SECRET, ...d } as any).urls(1, 'u1', 'orders', false);
    it('apiUrl verilince API origin', () => {
        expect(urls({ apiUrl: 'https://api.example.test' }).unsubscribeUrl).toMatch(/^https:\/\/api\.example\.test\/api\/notifications\/unsubscribe\?t=/);
    });
    it('apiUrl yoksa appUrl', () => {
        expect(urls({}).unsubscribeUrl).toMatch(/^https:\/\/app\.example\.test\/api\/notifications\/unsubscribe\?t=/);
    });
});

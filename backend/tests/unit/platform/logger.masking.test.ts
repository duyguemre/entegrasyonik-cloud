/**
 * [F-06] Sunucuda ZORUNLU log maskeleme: token, parola, appkey/appsecret, Authorization, e-posta/telefon/TCKN/adres PII.
 * Hem alan ANAHTARINA hem de serbest metin (msg, string alan, hata mesajı/stack) İÇERİĞİNE dayanır.
 * Gerçek değerler sentetiktir; log satırında ASLA bulunmamalıdır.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { eventLog, maskLogText, redactLogObject } from '@platform/core/logger';
import { captureLogs, LogCapture } from '../../helpers/logCapture';

let cap: LogCapture;
beforeEach(() => { cap = captureLogs(); });
afterEach(() => { cap.restore(); });
const raw = () => JSON.stringify(cap.lines);
const log = eventLog('adapter-trendyol', 'MaskTest');

describe('anahtar tabanlı maskeleme (alan adına göre)', () => {
    it.each([
        ['password', 'p4ssw0rd-SECRET-123'],
        ['token', 'tok-ABCDEFGH-987654'],
        ['accessToken', 'at-ABCDEFGH-111111'],
        ['appKey', 'appkey-ABCDEFGH-2222'],
        ['appSecret', 'appsecret-ABCDEFGH-3333'],
        ['apiKey', 'apikey-ABCDEFGH-4444'],
        ['apiSecret', 'apisecret-ABCDEFGH-5555'],
        ['secret', 'sec-ABCDEFGH-6666'],
    ])('sır alanı %s redakte edilir', (key, value) => {
        log.info('K', 'sir alani', { nested: { [key]: value }, [key]: value });
        expect(raw()).not.toContain(value);
        expect(cap.lines[0][key]).toBe('[REDACTED]');
    });

    it.each([
        ['authorization', 'Bearer abcdefghijklmnop'],
        ['Authorization', 'Basic dXNlcjpwYXNzd29yZA=='],
        ['cookie', 'sid=abc123def456ghi'],
        ['email', 'ahmet.yilmaz@example.com'],
        ['phone', '05321234567'],
        ['gsm', '+90 532 123 45 67'],
        ['tckn', '10000000146'],
        ['address', 'Ataturk Mah. Cumhuriyet Cad. No:5 Kadikoy/Istanbul'],
        ['shippingAddress', 'Bagdat Cad. 12/3 Maltepe'],
    ])('PII/baslik alani %s redakte edilir', (key, value) => {
        log.info('K', 'pii alani', { headers: { [key]: value }, customer: { [key]: value } });
        expect(raw()).not.toContain(value);
        expect(String((cap.lines[0].customer as Record<string, unknown>)[key])).toContain('[REDACTED');
    });

    it('şifreli (enc:v1:) değerler redakte edilir', () => {
        log.info('K', 'sifreli', { blob: 'enc:v1:AAAA.BBBB.CCCC' });
        expect(raw()).not.toContain('enc:v1:AAAA');
    });
});

describe('içerik tabanlı maskeleme (serbest metin: msg, string alan, hata mesajı)', () => {
    const cases: Array<[string, string, string]> = [
        ['Bearer token', 'istek Authorization: Bearer abc.def-ghijkl_mnop gitti', 'abc.def-ghijkl_mnop'],
        ['Basic auth', 'baslik Basic dXNlcjpwYXNzd29yZDEyMw== gonderildi', 'dXNlcjpwYXNzd29yZDEyMw'],
        ['JWT', 'jwt eyJhbGciOiJIUzI1NiIsInR5cCI6.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36P donuldu', 'SflKxwRJSMeKKF2QT4fwpMeJf36P'],
        ['parola=deger', 'giris password=Sup3rSecretPw! denendi', 'Sup3rSecretPw'],
        ['appKey/appSecret sorgu', 'GET /x?appKey=AK-123456&appSecret=AS-987654 basarisiz', 'AS-987654'],
        ['json anahtar-deger', 'govde {"apiKey":"key-ZZZ-999","apiSecret":"sec-YYY-888"} reddedildi', 'sec-YYY-888'],
        ['e-posta', 'musteri ahmet.yilmaz@example.com bulunamadi', 'ahmet.yilmaz@example.com'],
        ['telefon 05xx', 'aranan numara 0532 123 45 67 gecersiz', '123 45 67'],
        ['telefon +90', 'aranan +90 532 123 45 67 gecersiz', '532 123 45 67'],
        ['telefon 905xx', 'kayit 905321234567 gecersiz', '905321234567'],
        ['TCKN bağlamlı', 'TCKN: 10000000146 dogrulanamadi', '10000000146'],
        ['TC Kimlik No', 'TC Kimlik No 10000000146 hatali', '10000000146'],
        ['adres', 'teslimat adres: Ataturk Mah. Cumhuriyet Cad. No:5 Kadikoy gonderilemedi', 'Cumhuriyet Cad'],
        ['url sorgu', 'GET https://api.example.com/orders?apikey=zzz&page=1 hata', 'apikey=zzz'],
    ];

    it.each(cases)('msg içinde %s maskelenir', (_name, message, secret) => {
        log.warn('T', message);
        expect(raw()).not.toContain(secret);
    });

    it.each(cases)('string alan içinde %s maskelenir', (_name, message, secret) => {
        log.warn('T', 'alan', { detail: message, list: [message] });
        expect(raw()).not.toContain(secret);
    });

    it.each(cases)('hata mesajı/stack içinde %s maskelenir', (_name, message, secret) => {
        log.error('T', 'hata', new Error(message));
        expect(raw()).not.toContain(secret);
    });

    it('sorgu dizesi olmadan şema/yol AYNEN kalır; 11 haneli sipariş numarası (bağlamsız) maskelenmez', () => {
        log.info('T', 'GET https://api.example.com/orders siparis 10666543210 alindi');
        expect(cap.lines[0].msg).toBe('GET https://api.example.com/orders siparis 10666543210 alindi');
    });

    it('axios benzeri hata: config/request (Authorization içerir) atılır', () => {
        const axiosLike = Object.assign(new Error('Request failed'), {
            isAxiosError: true, code: 'ERR_BAD_REQUEST',
            config: { headers: { Authorization: 'Basic c2VjcmV0OmtleQ==' }, auth: { username: 'u', password: 'pw-XYZ-000' } },
            request: { _header: 'Authorization: Basic c2VjcmV0OmtleQ==' },
            response: { status: 401, statusText: 'Unauthorized', data: { message: 'bad', email: 'x@y.com' } },
        });
        log.warn('T', 'axios', { err: axiosLike });
        expect(raw()).not.toContain('c2VjcmV0OmtleQ');
        expect(raw()).not.toContain('pw-XYZ-000');
    });
});

describe('maskLogText / redactLogObject birim', () => {
    it('girdiyi DEĞİŞTİRMEZ (kopya döner) ve idempotenttir', () => {
        const input = { email: 'a@b.co', nested: { token: 't-12345678' }, msg: 'password=abc123456' };
        const out = redactLogObject(input);
        expect(input.email).toBe('a@b.co');
        expect(redactLogObject(out)).toEqual(out);
        expect(maskLogText(maskLogText('token=abcdefghij'))).toBe(maskLogText('token=abcdefghij'));
    });

    it('null/undefined/sayı alanları bozulmaz', () => {
        expect(redactLogObject({ email: null, phone: undefined, n: 5, ok: true })).toEqual({ email: null, phone: undefined, n: 5, ok: true });
    });
});

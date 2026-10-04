import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { decryptField, isEncrypted } from '@utils/FieldCrypto';

// WP10: webhook doğrulama yardımcıları (Express'ten bağımsız, saf).

/**
 * Sabit-zamanlı dize karşılaştırması: iki taraf da SHA-256'ya indirilir (eşit uzunlukta), sonra timingSafeEqual.
 * Uzunluk farkı zamanlamadan sızmaz. string olmayan/boş beklenen değer HER ZAMAN false (boş sır "eşleşmez").
 */
export function safeEqual(a: unknown, b: unknown): boolean {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length === 0 || b.length === 0) return false;
    const ha = createHash('sha256').update(a, 'utf8').digest();
    const hb = createHash('sha256').update(b, 'utf8').digest();
    return timingSafeEqual(ha, hb);
}

export function parseBasicAuth(header: unknown): { username: string; password: string } | null {
    if (typeof header !== 'string') return null;
    const m = /^Basic\s+([A-Za-z0-9+/=]+)$/i.exec(header.trim());
    if (!m) return null;
    const decoded = Buffer.from(m[1], 'base64').toString('utf8');
    const i = decoded.indexOf(':');
    if (i < 0) return null;
    return { username: decoded.slice(0, i), password: decoded.slice(i + 1) };
}

/** Şifreli (`enc:v1:`) ya da düz sır → düz metin; çözülemezse `undefined` (fail-closed'a bırakır). */
export function plainSecret(v: unknown): string | undefined { return plain(v); }

function plain(v: unknown): string | undefined {
    if (typeof v !== 'string' || !v) return undefined;
    if (isEncrypted(v)) {
        try { return decryptField(v); } catch { return undefined; }
    }
    return v;
}

export type WebhookHeaderAuthResult = 'ok' | 'fail' | 'not-configured';

/**
 * Trendyol resmi kimlik doğrulama: API_KEY (başlık) veya BASIC. HMAC imzası YOK.
 * Entegrasyon kaydında (şemasız `Client.integrations[]` belgesi) isteğe bağlı alanlar:
 *   webhookAuthType: 'API_KEY' | 'BASIC'
 *   API_KEY: webhookApiKey (+ webhookApiKeyHeader, varsayılan 'x-api-key'; Trendyol kaydında "apiKey" başlığı adı serbest)
 *   BASIC:   webhookUsername + webhookPassword
 * Tür yoksa (veya sır boşsa) 'not-configured' -> çağıran bugünkü davranışı korur + uyarı loglar.
 * Tür VARSA ve sır çözülemiyorsa 'fail' (fail-closed).
 */
export function verifyWebhookHeaders(integration: any, headers: Record<string, unknown> | undefined): WebhookHeaderAuthResult {
    const type = integration?.webhookAuthType;
    if (type !== 'API_KEY' && type !== 'BASIC') return 'not-configured';
    const h = headers || {};
    if (type === 'API_KEY') {
        const expected = plain(integration.webhookApiKey);
        if (!expected) return 'fail';
        const name = String(integration.webhookApiKeyHeader || 'x-api-key').toLowerCase();
        const raw = h[name];
        const got = Array.isArray(raw) ? raw[0] : raw;
        return safeEqual(got, expected) ? 'ok' : 'fail';
    }
    const u = plain(integration.webhookUsername);
    const p = plain(integration.webhookPassword);
    if (!u || !p) return 'fail';
    const parsed = parseBasicAuth(h['authorization']);
    if (!parsed) return 'fail';
    // Her iki karşılaştırma da HER ZAMAN yapılır (kısa devre yok).
    const okU = safeEqual(parsed.username, u);
    const okP = safeEqual(parsed.password, p);
    return okU && okP ? 'ok' : 'fail';
}

/**
 * [eslesme-fiyat WP7b, F-11] Ideasoft imzası: `X-Ideashop-Hmac-Sha256` = Base64(HMAC-SHA256(ham gövde, client secret)).
 * - HAM gövde baytları üzerinde (JSON ayrıştırılmadan ÖNCE; yeniden serileştirme imzayı bozar).
 * - Başlık Base64 ya da hex kabul edilir (sağlayıcı sürüm farkına karşı; ikisi de aynı 32 baytı kodlar).
 * - Karşılaştırma sabit-zamanlı: HMAC her zaman hesaplanır (erken dönüş yok); iki taraf SHA-256'ya indirilip `timingSafeEqual`.
 * - Sır/gövde/başlık yoksa ya da bozuksa `false` (fail-closed). Boş gövde geçerli bir imzayla yine doğrulanır (boş mesaj HMAC'i).
 */
export function verifyHmacSha256(rawBody: Buffer | Uint8Array | undefined, header: unknown, secret: unknown): boolean {
    const h = Array.isArray(header) ? header[0] : header;
    const sig = typeof h === 'string' ? h.trim() : '';
    const sec = typeof secret === 'string' ? secret : '';
    const body = rawBody instanceof Uint8Array ? Buffer.from(rawBody) : Buffer.alloc(0);
    const expected = createHmac('sha256', sec || 'x').update(body).digest(); // sır boşsa sonuç yine kullanılmaz (aşağıda false)
    let provided: Buffer | null = null;
    if (/^[A-Fa-f0-9]{64}$/.test(sig)) provided = Buffer.from(sig, 'hex');
    else if (/^[A-Za-z0-9+/]{43}=$/.test(sig)) provided = Buffer.from(sig, 'base64');
    const ok = !!provided && provided.length === expected.length && timingSafeEqual(provided, expected);
    return ok && sec.length > 0;
}

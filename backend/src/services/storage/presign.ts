import { createHash, createHmac } from 'crypto';

/**
 * ADR-0027 §C: AWS Signature V4 sorgu-dizgisi (presigned URL) imzalayıcısı — SAF, ağ/SDK YOK.
 *
 * Neden elle: `@aws-sdk/s3-request-presigner` bağımlılığı yok (bağımlılık eklenmedi, ADR-0027 Maliyet notu).
 * `@smithy/signature-v4` yalnızca `@aws-sdk/client-s3`'ün GEÇİŞLİ bağımlılığıdır (package.json'da beyan yok; sürüm
 * kaldırmalarında sessizce kaybolabilir) — üretim kodu ona bağlanmaz. Algoritma AWS'nin yayımladığı SigV4 kuralıdır;
 * doğruluk `tests/unit/storage/presign.test.ts`'te (1) AWS belge test vektörüyle ve (2) kurulu `@smithy/signature-v4`
 * ile çapraz karşılaştırmayla kanıtlanır.
 *
 * Cloudflare R2: bölge `auto`, servis `s3`, YOL-STİLİ adres (`https://<hesap>.r2.cloudflarestorage.com/<kova>/<anahtar>`).
 * İmzalı URL'ler YALNIZ S3 API alan adında çalışır (özel alan adı `cdn.` ile değil) — bu yüzden tarayıcının `connect-src`'ü
 * R2 S3 uç noktasını içermelidir (docs/DEPLOYMENT.md).
 */

export interface PresignInput {
    method: 'GET' | 'PUT' | 'HEAD' | 'DELETE';
    /** `https://<hesap>.r2.cloudflarestorage.com` (sonda `/` olabilir; yol kısmı olmamalı). */
    endpoint: string;
    /** Yol-stili: `/<kova>/<anahtar>` üretilir. `bucket` boşsa `key` doğrudan yoldur (sanal-barındırma testleri için). */
    bucket?: string;
    key: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    expiresInSec: number;
    /** İmzaya DAHİL edilecek ek başlıklar (ör. content-type, content-length). `host` her zaman imzalanır. */
    signedHeaders?: Record<string, string | number>;
    /** Test enjeksiyonu. */
    now?: Date;
    service?: string;
}

export interface PresignResult {
    url: string;
    /** İstemcinin AYNEN göndermesi gereken başlıklar (host hariç; content-length tarayıcıda gövdeden otomatik gelir). */
    headers: Record<string, string>;
    expiresAt: string;
}

const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';

/** RFC 3986 kesin kodlama (encodeURIComponent `!'()*`'yi kodlamaz; SigV4 kodlanmasını ister). */
export function rfc3986(s: string): string {
    return encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

/** S3 kanonik URI: her segment ayrı kodlanır, `/` korunur (çift kodlama YOK). */
export function canonicalPath(path: string): string {
    return path.split('/').map(rfc3986).join('/');
}

const sha256Hex = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');
const hmac = (key: Buffer | string, data: string): Buffer => createHmac('sha256', key).update(data, 'utf8').digest();

export function amzDate(d: Date): string {
    return d.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

export function presignUrl(input: PresignInput): PresignResult {
    if (!Number.isInteger(input.expiresInSec) || input.expiresInSec < 1 || input.expiresInSec > 604800) {
        throw new Error('presign: expiresInSec 1..604800 aralığında tamsayı olmalı');
    }
    const service = input.service || 's3';
    const now = input.now || new Date();
    const datetime = amzDate(now);
    const date = datetime.slice(0, 8);
    const scope = `${date}/${input.region}/${service}/aws4_request`;

    const base = new URL(input.endpoint);
    if (base.pathname && base.pathname !== '/') throw new Error('presign: endpoint yol içeremez');
    const host = base.host;
    const rawPath = input.bucket ? `/${input.bucket}/${input.key}` : `/${input.key.replace(/^\//, '')}`;
    const uriPath = canonicalPath(rawPath);

    const headers: Record<string, string> = { host };
    const clientHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(input.signedHeaders || {})) {
        const name = k.toLowerCase().trim();
        const value = String(v).trim().replace(/\s+/g, ' ');
        headers[name] = value;
        if (name !== 'content-length') clientHeaders[k] = String(v);
    }
    const headerNames = Object.keys(headers).sort();
    const signedHeaderList = headerNames.join(';');
    const canonicalHeaders = headerNames.map((n) => `${n}:${headers[n]}\n`).join('');

    const query: Record<string, string> = {
        'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
        'X-Amz-Credential': `${input.accessKeyId}/${scope}`,
        'X-Amz-Date': datetime,
        'X-Amz-Expires': String(input.expiresInSec),
        'X-Amz-SignedHeaders': signedHeaderList,
    };
    const canonicalQuery = Object.keys(query).sort().map((k) => `${rfc3986(k)}=${rfc3986(query[k])}`).join('&');

    const canonicalRequest = [input.method, uriPath, canonicalQuery, canonicalHeaders, signedHeaderList, UNSIGNED_PAYLOAD].join('\n');
    const stringToSign = ['AWS4-HMAC-SHA256', datetime, scope, sha256Hex(canonicalRequest)].join('\n');

    const kDate = hmac('AWS4' + input.secretAccessKey, date);
    const kRegion = hmac(kDate, input.region);
    const kService = hmac(kRegion, service);
    const kSigning = hmac(kService, 'aws4_request');
    const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

    return {
        url: `${base.protocol}//${host}${uriPath}?${canonicalQuery}&X-Amz-Signature=${signature}`,
        headers: clientHeaders,
        expiresAt: new Date(now.getTime() + input.expiresInSec * 1000).toISOString(),
    };
}

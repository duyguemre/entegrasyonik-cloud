'use strict';
/**
 * ADR-0008 §1 dev tetikleyici istemcisi: ÇALIŞAN yerel backend'in `POST /api/billing/mock/simulate` ucuna İMZALI istek atar
 * (yenileme başarısız / kurtarma dahil tüm deterministik senaryolar). Sonuç, sunucuda GERÇEK webhook yolundan geçer.
 *
 * Yalnızca loopback (localhost/127.0.0.1) hedeflenir; imza `BILLING_MOCK_HMAC_SECRET` (backend/.env) ile hesaplanır, SIR AĞDAN GİTMEZ.
 * Sunucu tarafı yalnızca PAYMENT_PROVIDER=mock + NODE_ENV!=production iken yanıt verir (aksi 404).
 *
 * Kullanım:  cd backend && node dev-tools/mock-simulate.js <providerRef> <success|declined|3ds_failed|renewal_fails|recovery> [http://localhost:5001]
 */
const crypto = require('crypto');
const path = require('path');

function signDevRequest(secret, raw) {
    return crypto.createHmac('sha256', secret).update('mock-dev-simulate:v1:').update(raw).digest('hex');
}

function buildRequest(secret, providerRef, scenario, now = Date.now()) {
    const raw = JSON.stringify({ providerRef, scenario, nonce: crypto.randomBytes(12).toString('hex'), iat: now });
    return { raw, signature: signDevRequest(secret, raw) };
}

function assertLoopback(base) {
    const u = new URL(base);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) || !/^https?:$/.test(u.protocol)) {
        throw new Error('Yalnızca loopback (localhost/127.0.0.1) hedeflenebilir.');
    }
    return u.origin;
}

module.exports = { signDevRequest, buildRequest, assertLoopback };

if (require.main === module) {
    (async () => {
        try { require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true }); } catch (_) { /* dotenv yok */ }
        const [providerRef, scenario, baseArg] = process.argv.slice(2);
        if (!providerRef || !scenario) throw new Error('Kullanım: node dev-tools/mock-simulate.js <providerRef> <senaryo> [baseUrl]');
        const secret = process.env.BILLING_MOCK_HMAC_SECRET;
        if (!secret || secret.length < 16) throw new Error('BILLING_MOCK_HMAC_SECRET tanımsız/kısa (backend/.env).');
        const origin = assertLoopback(baseArg || `http://localhost:${Number(process.env.SERVER_PORT) || 5001}`);
        const { raw, signature } = buildRequest(secret, providerRef, scenario);
        const res = await fetch(`${origin}/api/billing/mock/simulate`, {
            method: 'POST', headers: { 'content-type': 'application/json', 'x-mock-dev-signature': signature }, body: raw,
        });
        console.log(res.status, await res.text());
        if (!res.ok) process.exitCode = 1;
    })().catch((e) => { console.error('[mock-simulate] hata:', e && e.message); process.exitCode = 1; });
}

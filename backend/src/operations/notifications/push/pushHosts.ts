// MOB-04: izinli Web Push servis alan adlari (SAF veri). Iki amac: (1) abonelik kaydinda SSRF korumasi -- sunucu yalniz
// bilinen push servislerine POST eder; (2) yerel egress guard `EGRESS_ALLOW_WEBPUSH=1` listesi (dev-tools/egress-guard.js
// PUSH_HOSTS ile AYNI olmak zorunda; tests/dev/egress-guard.test.ts dogrular).
// `*.` oneki = alt alan adi (yalniz alt alan; kokun kendisi degil).
export const PUSH_SERVICE_HOSTS: ReadonlyArray<string> = [
    'fcm.googleapis.com',                 // Chrome / Android / Samsung / Opera
    'updates.push.services.mozilla.com',  // Firefox
    'web.push.apple.com',                 // Safari (macOS) / iOS 16.4+ kurulu PWA
    '*.notify.windows.com',               // Edge (WNS)
];

export function isPushHost(host: string, list: ReadonlyArray<string> = PUSH_SERVICE_HOSTS): boolean {
    const h = String(host ?? '').toLowerCase();
    if (!h) return false;
    return list.some((p) => (p.startsWith('*.') ? h.endsWith(p.slice(1)) && h.length > p.length - 1 : h === p));
}

/** Abonelik ucu: https, kimlik bilgisi/port yok, izinli host, makul uzunluk. */
export function isAllowedPushEndpoint(endpoint: unknown): boolean {
    if (typeof endpoint !== 'string' || endpoint.length > 1024) return false;
    let u: URL;
    try { u = new URL(endpoint); } catch { return false; }
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return false;
    return isPushHost(u.hostname);
}

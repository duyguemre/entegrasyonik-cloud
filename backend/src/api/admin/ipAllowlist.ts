// ADR-0026 Karar 4.7: opsiyonel IP allowlist (ADMIN_IP_ALLOWLIST; bos = kapali). IPv4 CIDR + tam IPv4/IPv6 eslesmesi.
// Istemci IP'si `clientIp.ts` ile guvenilir proxy zincirinden cozulur (TRUSTED_PROXY_HOPS); baslik dogrudan okunmaz.
import net from 'net';

function ipv4ToInt(ip: string): number | undefined {
    const parts = ip.split('.');
    if (parts.length !== 4) return undefined;
    let n = 0;
    for (const p of parts) {
        if (!/^\d{1,3}$/.test(p)) return undefined;
        const v = Number(p);
        if (v > 255) return undefined;
        n = (n * 256) + v;
    }
    return n;
}

/** `::ffff:1.2.3.4` -> `1.2.3.4`; digerleri kucuk harfe. */
export function normalizeIp(ip: string): string {
    const v = String(ip ?? '').trim().toLowerCase();
    const m = v.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
    return m ? m[1] : v;
}

export function isValidAllowlistEntry(entry: string): boolean {
    const [addr, bits] = entry.trim().split('/');
    if (bits === undefined) return net.isIP(addr) !== 0;
    return net.isIPv4(addr) && /^\d{1,2}$/.test(bits) && Number(bits) <= 32;
}

/** Bos liste = kapali (herkes gecer). Aksi halde ip listedeki bir girdiyle eslesmeli; gecersiz/bos ip reddedilir. */
export function isIpAllowed(ip: string | undefined, allowlist: ReadonlyArray<string>): boolean {
    if (allowlist.length === 0) return true;
    if (!ip) return false;
    const client = normalizeIp(ip);
    for (const raw of allowlist) {
        const entry = raw.trim().toLowerCase();
        if (!entry) continue;
        if (!entry.includes('/')) {
            if (normalizeIp(entry) === client) return true;
            continue;
        }
        const [addr, bitsStr] = entry.split('/');
        const bits = Number(bitsStr);
        const base = ipv4ToInt(addr);
        const c = ipv4ToInt(client);
        if (base === undefined || c === undefined || !Number.isInteger(bits) || bits < 0 || bits > 32) continue;
        const size = 2 ** (32 - bits);
        if (Math.floor(base / size) === Math.floor(c / size)) return true;
    }
    return false;
}

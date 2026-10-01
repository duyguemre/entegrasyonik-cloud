// ADR-0035 Karar 2: DCR yonlendirme adresi kurallari. Yalniz `https://` (IP/`localhost` host yasak) ya da loopback `http://127.0.0.1:{port}/...`;
// joker yok, fragment/kullanici bilgisi yok. Eslesme BIREBIR dizge esitligidir (sonek/alt yol/farkli port/normalizasyon YOK).
// Sunucu bu adreslere HICBIR istek atmaz (yalniz tarayiciyi yonlendirir).

export const MAX_REDIRECT_URIS = 5;
const MAX_URI_LENGTH = 2048;
/** Bosluk dahil kontrol karakterleri (<=0x20, 0x7f-0x9f) ve satir/paragraf ayiricilari. */
const hasControl = (v: string): boolean => { for (let i = 0; i < v.length; i++) { const c = v.charCodeAt(i); if (c <= 0x20 || (c >= 0x7f && c <= 0x9f) || c === 0x2028 || c === 0x2029) return true; } return false; };
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

export type RedirectCheck = { ok: true; host: string } | { ok: false; reason: string };

export function validateRedirectUri(uri: unknown): RedirectCheck {
    if (typeof uri !== 'string' || uri.length === 0 || uri.length > MAX_URI_LENGTH) return { ok: false, reason: 'redirect_uri gecersiz' };
    if (hasControl(uri) || uri.includes('*')) return { ok: false, reason: 'redirect_uri gecersiz karakter/joker iceriyor' };
    let u: URL;
    try { u = new URL(uri); } catch { return { ok: false, reason: 'redirect_uri gecersiz' }; }
    if (u.username || u.password) return { ok: false, reason: 'redirect_uri kullanici bilgisi iceremez' };
    if (u.hash || uri.includes('#')) return { ok: false, reason: 'redirect_uri fragment iceremez' };
    if (u.protocol === 'https:') {
        const h = u.hostname.toLowerCase();
        if (h === 'localhost' || h.endsWith('.localhost')) return { ok: false, reason: 'localhost adi kabul edilmez' };
        if (IPV4.test(h) || h.startsWith('[')) return { ok: false, reason: 'IP adresi https redirect icin kabul edilmez' };
        if (!h.includes('.')) return { ok: false, reason: 'redirect_uri tam nitelikli alan adi olmali' };
        return { ok: true, host: u.host };
    }
    if (u.protocol === 'http:') {
        // RFC 8252 loopback: yalniz 127.0.0.1 + acik port (`localhost` adi ve [::1] kabul edilmez).
        if (u.hostname !== '127.0.0.1' || !u.port) return { ok: false, reason: 'http yalniz 127.0.0.1:{port} loopback icin kabul edilir' };
        return { ok: true, host: u.host };
    }
    return { ok: false, reason: 'redirect_uri semasi https veya http-loopback olmali' };
}

/** Birebir eslesme: kayitli listede AYNI dizge. */
export function redirectMatches(registered: ReadonlyArray<string>, presented: unknown): presented is string {
    return typeof presented === 'string' && registered.includes(presented);
}

/** Onay ekraninda gosterilen host (kaydin ilk adresinden). */
export function redirectHostOf(uri: string): string {
    try { return new URL(uri).host; } catch { return ''; }
}

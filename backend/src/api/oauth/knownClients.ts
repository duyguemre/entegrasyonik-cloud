// ADR-0035 Karar 2: "tanınan uygulama" rozeti. Kodda sabit, kucuk liste: redirect HOST -> gorunen ad. Karar metni `client_name`'e degil HOST'a dayanir
// (isim taklidine karsi). Loopback adresler hicbir zaman "tanınan" degildir. Liste insan onayiyla genisler.

const KNOWN_HOSTS: Readonly<Record<string, string>> = Object.freeze({
    'claude.ai': 'Claude',
    'claude.com': 'Claude',
    'chatgpt.com': 'ChatGPT',
    'chat.openai.com': 'ChatGPT',
});

/** Tum yonlendirme adresleri listedeki hostlardan biriyse gorunen ad; aksi halde undefined (dogrulanmamis). */
export function knownClientName(redirectUris: ReadonlyArray<string>): string | undefined {
    let name: string | undefined;
    for (const uri of redirectUris) {
        let u: URL;
        try { u = new URL(uri); } catch { return undefined; }
        if (u.protocol !== 'https:') return undefined;
        const n = Object.prototype.hasOwnProperty.call(KNOWN_HOSTS, u.host) ? KNOWN_HOSTS[u.host] : undefined;
        if (!n || (name !== undefined && name !== n)) return undefined;
        name = n;
    }
    return name;
}

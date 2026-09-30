// ADR-0033 Karar 1 (INT-01): OAuth2 access token önbelleği. Single-flight: eşzamanlı `get()` çağrıları TEK token isteği paylaşır.
// Sona yaklaşınca (`skewMs`, varsayılan 5 dk) yenilenir. Hata önbelleğe alınmaz (sonraki çağrı yeniden dener).
// 401'de çağıran `get(true)` (force) ya da `invalidate()` ile bir kez yeniler.
export class OAuthTokenCache {
    private token?: string;
    private expiresAt = 0;
    private inflight?: Promise<string>;

    constructor(
        private readonly fetchToken: () => Promise<{ token: string; expiresInSec: number }>,
        private readonly skewMs: number = 300_000,
    ) { }

    async get(force = false): Promise<string> {
        if (!force && this.token && Date.now() < this.expiresAt - this.skewMs) return this.token;
        if (this.inflight) return this.inflight;
        const p = (async () => {
            try {
                const r = await this.fetchToken();
                this.token = r.token;
                this.expiresAt = Date.now() + r.expiresInSec * 1000;
                return r.token;
            } finally {
                this.inflight = undefined;
            }
        })();
        this.inflight = p;
        return p;
    }

    /** Dışarıda (ör. kod-değişimi/DB'den okuma) elde edilmiş token'ı önbelleğe koyar; sonraki `get()` ağa çıkmaz. */
    prime(token: string, expiresInSec: number): void {
        this.token = token;
        this.expiresAt = Date.now() + expiresInSec * 1000;
    }

    invalidate(): void {
        this.token = undefined;
        this.expiresAt = 0;
    }
}

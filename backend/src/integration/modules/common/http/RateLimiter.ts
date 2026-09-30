// ADR-0006 Karar 1: limiter/eşzamanlılık paylaşımlı katmana taşınır. 429'da hız yarıya iner,
// 5 dk 429 görmeden çalışıldığında tam hıza geri döner (basitleştirilmiş, kademeli değil --
// bu ölçekte/tek workerda yeterli; bkz. görev raporu).
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export class RateLimiter {
    private effectiveRatePerMin: number;
    private nextAllowedAt = 0;
    private lastReducedAt = 0;

    constructor(private readonly baseRatePerMin?: number) {
        this.effectiveRatePerMin = baseRatePerMin ?? Infinity;
    }

    /** ratePerMin ayarlı değilse anında geçer (limiter devre dışı). Beklenen süreyi (ms) döner (X1: kova bekleme metriği). */
    public async throttle(): Promise<number> {
        if (!this.baseRatePerMin) return 0;
        this.maybeRestore();
        const minIntervalMs = 60000 / this.effectiveRatePerMin;
        const now = Date.now();
        const waitUntil = Math.max(now, this.nextAllowedAt);
        this.nextAllowedAt = waitUntil + minIntervalMs;
        const delay = waitUntil - now;
        if (delay > 0) await sleep(delay);
        return Math.max(0, delay);
    }

    /** 429 alındığında çağrılır: hızı yarıya indirir (alt sınır 1/dk). */
    public onRateLimited(): void {
        if (!this.baseRatePerMin) return;
        this.effectiveRatePerMin = Math.max(1, this.effectiveRatePerMin / 2);
        this.lastReducedAt = Date.now();
    }

    public onSuccess(): void {
        this.maybeRestore();
    }

    /** Yapılandırılmış taban hız (yoksa undefined = limiter devre dışı). */
    public getBaseRatePerMin(): number | undefined {
        return this.baseRatePerMin;
    }

    public getEffectiveRatePerMin(): number {
        return this.effectiveRatePerMin;
    }

    private maybeRestore(): void {
        if (!this.baseRatePerMin) return;
        if (this.effectiveRatePerMin >= this.baseRatePerMin) return;
        if (this.lastReducedAt && Date.now() - this.lastReducedAt >= 5 * 60 * 1000) {
            this.effectiveRatePerMin = this.baseRatePerMin;
            this.lastReducedAt = 0;
        }
    }
}

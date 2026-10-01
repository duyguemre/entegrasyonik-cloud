import type { OAuthStore } from './store';

// ADR-0035 Karar 2: iptal <= 60 sn etkili. `/mcp` (MCP-3) her istekte bagli aile durumunu bu kapidan sorar: sonuc surec-ici 60 sn onbellekte tutulur,
// iptal eden surecte `invalidate` ile ANINDA dusurulur; diger replikalarda en gec 60 sn sonra depo okunur (kalici iptal kaydi = `revokedAt`).
export const FAMILY_GATE_TTL_MS = 60_000;
const MAX_ENTRIES = 10_000;

export class FamilyGate {
    private readonly cache = new Map<string, { active: boolean; exp: number }>();

    constructor(
        private readonly store: Pick<OAuthStore, 'isFamilyActive'>,
        private readonly ttlMs: number = FAMILY_GATE_TTL_MS,
        private readonly now: () => number = Date.now,
    ) { }

    /** true = aile iptal edilmemis ve mutlak omru dolmamis. Depo hatasi FIRLATIR (fail-closed: cagiran reddeder). */
    async isActive(familyId: string): Promise<boolean> {
        const t = this.now();
        const hit = this.cache.get(familyId);
        if (hit && hit.exp > t) return hit.active;
        const active = await this.store.isFamilyActive(familyId, new Date(t));
        if (this.cache.size >= MAX_ENTRIES) this.sweep(t);
        this.cache.set(familyId, { active, exp: t + this.ttlMs });
        return active;
    }

    invalidate(familyId: string): void { this.cache.delete(familyId); }
    clear(): void { this.cache.clear(); }

    private sweep(t: number): void {
        for (const [k, v] of this.cache) if (v.exp <= t) this.cache.delete(k);
        if (this.cache.size >= MAX_ENTRIES) { const oldest = this.cache.keys().next().value; if (oldest !== undefined) this.cache.delete(oldest); }
    }
}

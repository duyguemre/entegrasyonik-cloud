// ADR-0035 / MCP-1: OAuth depo SOZLESMESI. Uretim uygulamasi `mongoStore.ts` (ApplicationDB); testler bellek-ici uygulama kullanir.
// Atomik islemler (kod tuketimi, refresh rotasyonu) deponun sorumlulugudur: es zamanli iki cagriden YALNIZ biri kazanir.
import type { OAuthScope } from '@platform/core/security/oauthTokens';

export interface OAuthClientRecord {
    clientId: string;
    clientName: string;
    redirectUris: string[];
    scopes: OAuthScope[];
    createdAt: Date;
    lastGrantAt?: Date;
    createdIp?: string;
    unusedExpireAt?: Date;
}

export interface OAuthCodeRecord {
    codeHash: string;
    clientId: string;
    redirectUri: string;
    codeChallenge: string;
    resource: string;
    sub: string;
    tid: number;
    scopes: OAuthScope[];
    tv: number;
    familyId: string;
    createdAt: Date;
    expiresAt: Date;
    usedAt?: Date;
    purgeAt: Date;
}

export interface OAuthRefreshRecord {
    tokenHash: string;
    familyId: string;
    sub: string;
    tid: number;
    clientId: string;
    clientName: string;
    resource: string;
    scopes: OAuthScope[];
    tv: number;
    createdAt: Date;
    familyCreatedAt: Date;
    familyExpiresAt: Date;
    idleExpiresAt: Date;
    lastUsedAt?: Date;
    usedAt?: Date;
    revokedAt?: Date;
    revokedBy?: string;
    purgeAt: Date;
}

export type ConsumeCodeResult =
    | { kind: 'ok'; code: OAuthCodeRecord }
    | { kind: 'reused'; code: OAuthCodeRecord }
    | { kind: 'missing' };

export type RevokedBy = 'client' | 'user' | 'admin' | 'reuse' | 'tv' | 'code_reuse' | 'client_mismatch' | 'tenant';

/** Bir baglanti (= refresh ailesi) ozeti: kullanici arayuzu icin (belirtec/ozet ICERMEZ). */
export interface OAuthFamilySummary {
    familyId: string;
    sub: string;
    tid: number;
    clientId: string;
    clientName: string;
    scopes: OAuthScope[];
    createdAt: Date;
    lastUsedAt: Date | null;
    expiresAt: Date;
}

/** Ailelerin GUNCEL (kullanilmamis, iptal edilmemis, suresi dolmamis) uyelerinden aile ozetleri; ayni ailenin birden fazla uyesi (es zamanli yenileme) tek satira iner. Saf. */
export function summarizeHeads(heads: ReadonlyArray<OAuthRefreshRecord>): OAuthFamilySummary[] {
    const byFam = new Map<string, OAuthFamilySummary>();
    for (const r of heads) {
        const prev = byFam.get(r.familyId);
        const used = r.lastUsedAt ? new Date(r.lastUsedAt) : null;
        if (!prev) {
            byFam.set(r.familyId, {
                familyId: r.familyId, sub: r.sub, tid: r.tid, clientId: r.clientId, clientName: r.clientName, scopes: [...r.scopes],
                createdAt: new Date(r.familyCreatedAt), lastUsedAt: used, expiresAt: new Date(r.familyExpiresAt),
            });
        } else if (used && (!prev.lastUsedAt || used > prev.lastUsedAt)) {
            prev.lastUsedAt = used;
        }
    }
    return [...byFam.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export interface OAuthStore {
    insertClient(c: OAuthClientRecord): Promise<void>;
    getClient(clientId: string): Promise<OAuthClientRecord | null>;
    /** Ilk yetkide `unusedExpireAt` (30 gunluk TTL) kaldirilir. */
    markClientGranted(clientId: string, at: Date): Promise<void>;

    insertCode(c: OAuthCodeRecord): Promise<void>;
    /** ATOMIK: `usedAt` bos kodu kullanildi isaretler. Zaten kullanilmissa `reused` (aileyi iptal icin), yoksa `missing`. */
    consumeCode(codeHash: string, at: Date): Promise<ConsumeCodeResult>;

    insertRefresh(r: OAuthRefreshRecord): Promise<void>;
    getRefresh(tokenHash: string): Promise<OAuthRefreshRecord | null>;
    /** ATOMIK: `usedAt` ve `revokedAt` bos belgeyi kullanildi isaretler. true = bu cagri kazandi. */
    consumeRefresh(tokenHash: string, at: Date): Promise<boolean>;
    /** Ailenin TUM uyelerini iptal eder (idempotent). Etkilenen belge sayisini doner. */
    revokeFamily(familyId: string, by: RevokedBy, at: Date): Promise<number>;
    /** Iptal edilmemis ve mutlak omru dolmamis uye var mi (baglanti hala gecerli mi). */
    isFamilyActive(familyId: string, now: Date): Promise<boolean>;
    /** Kullanici/tenant geneli iptal (tv artisi, tenant kapatma; MCP-2 'tum baglantilari kes'). Etkilenen AILE sayisini doner. */
    revokeBySub(sub: string, by: RevokedBy, at: Date): Promise<number>;
    revokeByTenant(tid: number, by: RevokedBy, at: Date): Promise<number>;
    /** MCP-2: tenant icindeki AKTIF baglantilar (aile ozetleri); `sub`/`familyId` ile daraltilir. HER ZAMAN `tid` ile sinirlidir (tenant izolasyonu). */
    listFamilies(q: { tid: number; sub?: string; familyId?: string }, now: Date): Promise<OAuthFamilySummary[]>;
}

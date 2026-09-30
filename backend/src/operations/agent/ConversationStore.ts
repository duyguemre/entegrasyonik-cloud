// ADR-0034 Karar 5 / BR-1: sohbet CALISMA BELLEGI (kalici degil, K38). Redis anahtari `agent:conv:app:{tid}:{userId}:{convId}`,
// 60 dk kayan TTL, en fazla 40 mesaj (eskiler kirpilir). Mongo'ya YAZILMAZ. Tenant + kullanici anahtarin parcasidir: baska
// tenant/kullanici ayni convId ile baska kayda ulasir (izolasyon).
import type { AgentKv } from './kv';

export const CONV_TTL_SEC = 60 * 60;
export const CONV_MAX_MESSAGES = 40;

export interface StoredMessage {
    role: 'user' | 'assistant';
    text: string;
    at: string;
}

/** Anahtar parcalarinda ayirici/bosluk olmasin (anahtar enjeksiyonu yok). */
export const CONVERSATION_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function conversationKey(tid: number, userId: string, convId: string): string {
    if (!CONVERSATION_ID_RE.test(convId)) throw new Error('gecersiz konusma kimligi');
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(userId)) throw new Error('gecersiz kullanici kimligi');
    if (!Number.isInteger(tid)) throw new Error('gecersiz tenant');
    return `agent:conv:app:${tid}:${userId}:${convId}`;
}

export class ConversationStore {
    constructor(private readonly kv: AgentKv) { }

    async load(tid: number, userId: string, convId: string): Promise<StoredMessage[]> {
        const raw = await this.kv.get(conversationKey(tid, userId, convId));
        if (!raw) return [];
        try {
            const v = JSON.parse(raw);
            return Array.isArray(v) ? (v as StoredMessage[]) : [];
        } catch {
            return []; // bozuk kayit: bos konusma say
        }
    }

    /** Mesajlari ekler, son 40'a kirpar, TTL'i yeniler. */
    async append(tid: number, userId: string, convId: string, add: StoredMessage[]): Promise<StoredMessage[]> {
        const all = [...(await this.load(tid, userId, convId)), ...add].slice(-CONV_MAX_MESSAGES);
        await this.kv.set(conversationKey(tid, userId, convId), JSON.stringify(all), CONV_TTL_SEC);
        return all;
    }

    async reset(tid: number, userId: string, convId: string): Promise<void> {
        await this.kv.del(conversationKey(tid, userId, convId));
    }
}

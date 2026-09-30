// AGENT_BROKER_PLAN BR-1 "Sinirlar": kullanici basina ESZAMANLI 1 tur (SET NX kilidi, TTL 90 sn -> 409 TURN_IN_PROGRESS) ve
// ayni `clientTurnId` 10 dk icinde tekrar -> 409 TURN_DUPLICATE. Anahtarlar tenant+kullanici kapsamlidir.
import { randomUUID } from 'crypto';
import type { AgentKv } from './kv';

export const TURN_LOCK_TTL_SEC = 90;
export const TURN_DEDUP_TTL_SEC = 600;

const part = (s: string) => {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(s)) throw new Error('gecersiz anahtar parcasi');
    return s;
};

export interface TurnLock { release(): Promise<void> }

export class TurnGuard {
    constructor(private readonly kv: AgentKv) { }

    /** Kilidi alir; baska tur aciksa null. `release` yalniz kendi kilidini birakir (TTL dolduysa baskasininkine dokunmaz). */
    async acquire(tid: number, userId: string): Promise<TurnLock | null> {
        const key = `agent:turnlock:${tid}:${part(userId)}`;
        const token = randomUUID();
        if (!(await this.kv.setNx(key, token, TURN_LOCK_TTL_SEC))) return null;
        let released = false;
        return {
            release: async () => {
                if (released) return;
                released = true;
                await this.kv.delIfEquals(key, token);
            },
        };
    }

    /** `clientTurnId` ilk kez goruluyorsa true (kaydeder); 10 dk icinde tekrar ise false. */
    async registerClientTurn(tid: number, userId: string, clientTurnId: string): Promise<boolean> {
        return this.kv.setNx(`agent:turndup:${tid}:${part(userId)}:${part(clientTurnId)}`, '1', TURN_DEDUP_TTL_SEC);
    }
}

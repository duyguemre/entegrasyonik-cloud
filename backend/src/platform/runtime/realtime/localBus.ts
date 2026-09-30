import { EventEmitter } from 'events';
import type { RealtimeBus, RealtimeEvent, RealtimeHandler } from './RealtimeBus';

export class LocalRealtimeBus implements RealtimeBus {
    readonly kind = 'local' as const;
    private em = new EventEmitter();
    constructor() { this.em.setMaxListeners(0); }

    async publish(evt: RealtimeEvent): Promise<void> { this.deliver(evt); }

    /** Redis adaptorunun dusus yolu icin de kullanilir. */
    deliver(evt: RealtimeEvent): void {
        for (const h of this.em.listeners(`tid:${evt.tid}`) as RealtimeHandler[]) {
            try { h(evt); } catch { /* bir abonenin hatasi digerlerini etkilemez */ }
        }
    }

    subscribe(tid: number, handler: RealtimeHandler): () => void {
        const ch = `tid:${tid}`;
        this.em.on(ch, handler);
        return () => { this.em.off(ch, handler); };
    }

    async close(): Promise<void> { this.em.removeAllListeners(); }
}

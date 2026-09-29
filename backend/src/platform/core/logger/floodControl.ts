// ADR-0017 Karar 1.5 (C19 dersi): aynı hata "parmak izi" başına 60 sn pencere -- ilki TAM yazılır, sonrakiler
// SAYILIR, pencere sonunda tek `warn` "N benzer hata bastırıldı". Senkron `console.error` fırtınasının (BACKLOG C19)
// kök çözümü asenkron pino hedefidir; bu, İKİNCİ savunma hattıdır (tekrar eden log HACMİNİ de azaltır).
const WINDOW_MS = 60_000;

export interface FloodEntry { count: number; windowStart: number; timer: ReturnType<typeof setTimeout> }

/** `err.code` + modül + rakamları `#`'e çevrilmiş mesaj şablonundan parmak izi. */
export function fingerprintOf(module: string | undefined, code: unknown, message: unknown): string {
    const msg = typeof message === 'string' ? message.replace(/\d+/g, '#') : String(message ?? '');
    return `${module ?? '-'}::${typeof code === 'string' ? code : '-'}::${msg}`;
}

export class FloodControl {
    private entries = new Map<string, FloodEntry>();
    constructor(private onWindowClose: (fp: string, suppressed: number) => void, private windowMs = WINDOW_MS) { }

    /** true => ilk oluş / pencere kapandı, TAM yazılmalı. false => bastırılmış (yalnız sayılır). */
    admit(fp: string): boolean {
        const now = Date.now();
        const existing = this.entries.get(fp);
        if (!existing) {
            const timer = setTimeout(() => this.closeWindow(fp), this.windowMs);
            if (typeof (timer as any).unref === 'function') (timer as any).unref();
            this.entries.set(fp, { count: 0, windowStart: now, timer });
            return true;
        }
        existing.count += 1;
        return false;
    }

    private closeWindow(fp: string): void {
        const e = this.entries.get(fp);
        this.entries.delete(fp);
        if (e && e.count > 0) this.onWindowClose(fp, e.count);
    }

    /** Yalnızca testler için: bekleyen tüm pencereleri hemen kapatır. */
    flushAll(): void {
        for (const fp of Array.from(this.entries.keys())) {
            const e = this.entries.get(fp)!;
            clearTimeout(e.timer);
            this.closeWindow(fp);
        }
    }

    dispose(): void {
        for (const e of this.entries.values()) clearTimeout(e.timer);
        this.entries.clear();
    }
}

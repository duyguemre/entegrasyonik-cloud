// ADR-0017 Karar 1.7 adım 1 ("Köprü", Aşama A): yalnızca GİRİŞ NOKTASINDA (`entegrasyonik.ts` ana akışı; modül
// import'unda DEĞİL -- testlerdeki `console` casusları etkilenmez) `console.log/info/warn/error/debug` pino'ya
// yönlendirilir; ANSI renk kodları temizlenir, `legacy:true` alanı eklenir. Geri alma: `LOG_FORMAT=legacy`
// (bu durumda köprü KURULMAZ, eski `console` davranışı aynen kalır).
import { config } from '@config';
import { logger } from './logger';

// eslint benzeri: [31m, [1m, [0m gibi ANSI kaçış dizileri (mevcut utils/Logger.ts renk önekleri).
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;

function stripAnsi(s: string): string {
    return s.replace(ANSI_RE, '');
}

function joinArgs(args: unknown[]): string {
    return args.map((a) => {
        if (typeof a === 'string') return stripAnsi(a);
        if (a instanceof Error) return a.stack ?? a.message;
        try { return JSON.stringify(a); } catch { return String(a); }
    }).join(' ');
}

export interface ConsoleBridgeHandle {
    /** Testler/kapanış için: orijinal `console.*`'ı geri yükler. */
    restore(): void;
}

const LEVEL_MAP = { log: 'info', info: 'info', warn: 'warn', error: 'error', debug: 'debug' } as const;

let active: ConsoleBridgeHandle | undefined;

/** `LOG_FORMAT=legacy` ise NO-OP döner (geri alma anahtarı). İkinci çağrı önceki köprüyü önce kaldırır (çift-yazım riski yok). */
export function installConsoleBridge(): ConsoleBridgeHandle {
    if (active) active.restore();
    if (config.log.format === 'legacy') {
        active = { restore() { /* no-op */ } };
        return active;
    }
    const original: Record<string, (...a: unknown[]) => void> = {
        log: console.log, info: console.info, warn: console.warn, error: console.error, debug: console.debug,
    };
    for (const [method, level] of Object.entries(LEVEL_MAP) as Array<[keyof typeof LEVEL_MAP, 'info' | 'warn' | 'error' | 'debug']>) {
        (console as any)[method] = (...args: unknown[]) => {
            logger[level]({ legacy: true }, joinArgs(args));
        };
    }
    active = {
        restore() {
            console.log = original.log; console.info = original.info; console.warn = original.warn;
            console.error = original.error; console.debug = original.debug;
            active = undefined;
        },
    };
    return active;
}

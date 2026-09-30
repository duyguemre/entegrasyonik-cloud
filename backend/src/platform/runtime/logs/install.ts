// ADR-0026 WP-LOG L1: kalıcı log kancasının bootstrap'te kurulumu (`installErrorEventLoggerBridge` ile AYNI desen).
// LOG_PERSIST_ENABLED=false (varsayılan) iken HİÇBİR ŞEY kurulmaz: logger'da `setLogSink` çağrılmaz, LogWriter üretilmez -> sıfır maliyet.
import { config } from '@config';
import { setLogSink } from '@platform/core/logger';
import { LogWriter, LogInsertModel } from './LogWriter';

let active: LogWriter | undefined;

export interface InstallLogPersistenceDeps {
    enabled?: boolean;
    level?: 'debug' | 'info' | 'warn' | 'error';
    sampleInfoPct?: number;
    model?: LogInsertModel | (() => Promise<LogInsertModel>);
}

/** Bir kez çağrılır. Bayrak kapalıysa `undefined` döner ve hiçbir yan etki yoktur. */
export function installLogPersistence(deps: InstallLogPersistenceDeps = {}): LogWriter | undefined {
    const p = config.log.persist;
    const enabled = deps.enabled ?? p.enabled;
    if (!enabled || active) return active;
    active = new LogWriter({
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- tembel yükleme: test/enjeksiyon yolunda mongoose modeli yüklenmesin
        model: deps.model ?? (() => require('./prodDeps').productionLogEventModel()),
        level: deps.level ?? p.level,
        sampleInfoPct: deps.sampleInfoPct ?? p.sampleInfoPct,
    });
    setLogSink(active.offer);
    return active;
}

/** Kapanış adımı (bootstrap shutdown): kancayı söker ve kalan kuyruğu boşaltır. Kurulu değilse no-op. */
export async function closeLogPersistence(timeoutMs = 3000): Promise<void> {
    const w = active;
    if (!w) return;
    setLogSink(undefined);
    active = undefined;
    await w.close(timeoutMs);
}

export function getLogWriter(): LogWriter | undefined { return active; }

// ADR-0024 P0-LIFE / ADR-0006 Karar 6: duzgun kapanis. Bilesenler ENJEKTE edilir (bilesim koku `app.ts` baglar);
// boylece sira, zaman asimi ve cift sinyal davranisi gercek DB/Redis/HTTP olmadan test edilir.
//
// Sira: 1) /ready -> 503  2) HTTP sunucu(lar)i kapanir (yeni istek yok; Node 19+ `server.close()` bosta keep-alive
// baglantilarini da kapatir)  3) zamanlayicilar durur (yeni tur planlanmaz)  4) BullMQ worker.close() (aktif isler
// biter)  5) DB kapanir  6) Redis kapanir -> exit(0/1). Toplam ust sinir asilirsa exit(1); ikinci sinyalde HEMEN exit(1).
//
// [BILINEN SINIRLAMA] `IntegrationEngine`/`ExportOrchestrator`/`ImportOrchestrator` henuz durdurma bayragi sunmuyor
// (integration/engine bu gorevin sahipligi disinda); `while(true)` dongulerini yalniz son `process.exit()` sonlandirir.
// Upsert/lease tabanli isler idempotenttir. Motor durdurma kancasi eklenince `steps`e bir adim eklenir.
import { logger } from '@platform/core/logger';

export interface ShutdownStep {
  name: string;
  run: () => Promise<unknown> | unknown;
}

export interface ShutdownLog {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

export interface ShutdownOptions {
  /** Sirayla kosan adimlar; bir adimin hatasi digerlerini ENGELLEMEZ (loglanir). */
  steps: ShutdownStep[];
  /** Kapanisin ilk adiminda senkron cagrilir (ornegin /ready -> 503). */
  onBegin?: () => void;
  /** Toplam ust sinir (ms). Railway SIGTERM sonrasi ~30 sn tanir; varsayilan 25 sn. */
  timeoutMs?: number;
  exit?: (code: number) => void;
  log?: ShutdownLog;
  now?: () => number;
}

export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 25000;

export type ShutdownHandler = (reason: string, error?: unknown) => Promise<void>;

export function createShutdown(opts: ShutdownOptions): ShutdownHandler {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;
  const exit = opts.exit ?? ((code: number) => process.exit(code));
  const log: ShutdownLog = opts.log ?? (logger.child({ module: 'bootstrap.shutdown' }) as unknown as ShutdownLog);
  const now = opts.now ?? Date.now;
  let started = false;

  return async (reason: string, error?: unknown) => {
    if (started) {
      // Ikinci sinyal (ornegin ikinci Ctrl+C) / kapanis sirasinda yeni hata: beklemeden cik.
      log.warn({ reason }, 'kapanis zaten surerken yeni sinyal: zorla cikiliyor');
      exit(1);
      return;
    }
    started = true;
    const t0 = now();
    log.info({ reason, timeoutMs, failed: Boolean(error) }, 'kapanis basladi');
    if (error) log.error({ reason, err: error }, 'kapanisa yol acan hata');

    let timedOut = false;
    const guard = setTimeout(() => {
      timedOut = true;
      log.error({ reason, timeoutMs, elapsedMs: now() - t0 }, 'kapanis zaman asimina ugradi: zorla cikiliyor');
      exit(1);
    }, timeoutMs);
    (guard as any).unref?.(); // guard'in kendisi hizli bir kapanisi bloklamasin

    try {
      try { opts.onBegin?.(); } catch (err) { log.error({ step: 'onBegin', err }, 'kapanis adimi basarisiz'); }
      for (const step of opts.steps) {
        if (timedOut) break;
        const s0 = now();
        try {
          await step.run();
          log.info({ step: step.name, durationMs: now() - s0 }, 'kapanis adimi tamam');
        } catch (err) {
          log.error({ step: step.name, durationMs: now() - s0, err }, 'kapanis adimi basarisiz (siradaki adima geciliyor)');
        }
      }
      if (!timedOut) log.info({ reason, totalMs: now() - t0 }, 'kapanis tamamlandi');
    } finally {
      clearTimeout(guard);
      if (!timedOut) exit(error ? 1 : 0);
    }
  };
}

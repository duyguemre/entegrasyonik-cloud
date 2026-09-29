// ADR-0016 §2.1: "Zamanlama `setInterval` ile DEĞİL, `setTimeout` zinciriyle yapılır. Tur bitince bir sonraki
// tur planlanır, jitter eklenir." + "Süreç-içi örtüşme koruması: aynı iş hâlâ koşuyorsa tur atlanır ve
// `overlap_skipped` sayacı artar." Bu dosya YALNIZ zamanlama/örtüşme kaygısını taşır; yürütme `runJob.ts`'dedir.
import { logger as rootLogger } from '@platform/core/logger';
import { runJobOnce, RunJobDeps } from './runJob';
import { JobDefinition } from './types';

export interface JobController {
    /** Yeni tur planlamayı durdurur; HÂLÂ koşan tur varsa beklemez (ADR-0016 §2.3'ün 15 sn'lik bekleme/`AbortSignal`
     * kısmı `bootstrap/shutdown.ts`'e aittir -- bu görevde BAĞLANMAZ, yalnız fonksiyon dışa açılır). */
    stop(): void;
    /** Gözlem/test için: kaç tur "hâlâ koşuyor" nedeniyle atlandı. */
    overlapSkippedCount(): number;
    /** Şu an bir tur koşuyor mu (yalnız test/gözlem). */
    isRunning(): boolean;
}

function jitterMs(everyMs: number, jitterPct?: number): number {
    if (!jitterPct) return 0;
    const span = everyMs * (jitterPct / 100);
    return Math.floor((Math.random() * 2 - 1) * span);
}

async function isDue(deps: RunJobDeps, def: JobDefinition): Promise<boolean> {
    const state = await deps.jobStateModel.findOne({ name: def.name });
    if (!state?.lastSuccessAt) return true;
    const now = (deps.now ?? (() => new Date()))();
    return now.getTime() - new Date(state.lastSuccessAt).getTime() >= def.everyMs;
}

/**
 * Bir işi `setTimeout` zinciriyle periyodik çalıştırır. `def.run` HİÇBİR ZAMAN çökme fırlatmaz görünür (hata
 * `runJobOnce` içinde yutulup `JobState.lastError`'a yazılır); bu sarmalayıcı yalnız beklenmedik bir alt-katman
 * hatasına karşı ek bir savunma katmanı ekler (mongoLease/registry çağrılarının kendisi patlarsa bile zamanlayıcı
 * DURMAZ).
 */
export function scheduleJob(def: JobDefinition, deps: RunJobDeps): JobController {
    const log = (deps.logger ?? rootLogger).child({ module: `scheduler:${def.name}` });
    let stopped = false;
    let running = false;
    let overlapSkipped = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const scheduleNext = () => {
        if (stopped) return;
        const delay = Math.max(0, def.everyMs + jitterMs(def.everyMs, def.jitterPct));
        timer = setTimeout(tick, delay);
        (timer as unknown as { unref?: () => void }).unref?.();
    };

    const tick = (): void => {
        if (stopped) return;
        if (running) {
            overlapSkipped++;
            log.warn({ job: def.name, overlapSkipped }, 'önceki tur hâlâ çalışıyor; bu tur ATLANDI (overlap_skipped)');
            scheduleNext();
            return;
        }
        running = true;
        runJobOnce(def, deps, 'interval')
            .catch((err) => {
                log.error({ err, job: def.name }, 'runJobOnce beklenmedik biçimde reddetti (alt-katman hatası, zamanlayıcı ÇÖKMEZ)');
            })
            .finally(() => {
                running = false;
                scheduleNext();
            });
    };

    const start = async (): Promise<void> => {
        if (def.runOnStart === 'ifDue') {
            let due = true;
            try {
                due = await isDue(deps, def);
            } catch (err) {
                log.error({ err, job: def.name }, 'ifDue kontrolü başarısız; güvenli varsayılan: koş');
            }
            if (!due) {
                scheduleNext();
                return;
            }
        }
        tick();
    };

    start().catch((err) => log.error({ err, job: def.name }, 'ilk tur planlaması başarısız'));

    return {
        stop() {
            stopped = true;
            if (timer) clearTimeout(timer);
        },
        overlapSkippedCount: () => overlapSkipped,
        isRunning: () => running,
    };
}

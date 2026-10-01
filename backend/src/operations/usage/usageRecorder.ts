// MOB-08 / K55: günlük aktif kullanım kaydı (UsageDaily: gün + tenant + platform → takma kullanıcı kümesi).
// Gözlem yolu → FAIL-OPEN (PLATFORM_BASELINE F11): yazma hatası isteği düşürmez, loglanır ve sayaçlanır.
// Süreç içi tekilleştirme: aynı (gün, tenant, platform, kullanıcı) için pod başına günde EN FAZLA bir upsert (sıcak yolda ek yük yok denecek kadar az).
// KVKK: ham sub/UA/IP yazılmaz; kullanıcı yalnız takma kimlikle (sha256(sub) ilk 16 hex) ve yalnız platform SINIFIYLA kaydedilir.
import * as crypto from 'crypto';
import { dayKeyInZone, addDaysInZone } from '@utils/timeZone';
import { isClientPlatform, type ClientPlatform } from '@platform/core/context';
import { logger } from '@platform/core/logger';
import { metricsRegistry } from '@platform/runtime/metrics';
import { USAGE_DAILY_RETENTION_DAYS } from '@database/application/models/UsageDaily';

const log = logger.child({ module: 'usageRecorder' });

/** Takma kullanıcı kimliği: geri döndürülemez kısa özet (tekil sayım için yeterli; ham kimlik saklanmaz). */
export function pseudonymOf(sub: string): string {
    return crypto.createHash('sha256').update(String(sub)).digest('hex').slice(0, 16);
}

export interface UsageActivity { tid: number; sub: string; platform: ClientPlatform }

export interface UsageRecorderDeps {
    /** UsageDaily modeli (tembel: DB katmanı ilk kayıtta yüklenir). */
    model: () => Promise<{ updateOne: (filter: any, update: any, opts: any) => Promise<unknown> }>;
    now?: () => Date;
    /** Tekilleştirme kümesi üst sınırı (aşılınca küme boşaltılır; en kötü durumda fazladan idempotent upsert). */
    maxKeys?: number;
}

export class UsageRecorder {
    private seen = new Set<string>();
    private seenDay = '';
    private readonly now: () => Date;
    private readonly maxKeys: number;

    constructor(private readonly d: UsageRecorderDeps) {
        this.now = d.now ?? (() => new Date());
        this.maxKeys = d.maxKeys ?? 50_000;
    }

    /** Fire-and-forget. ASLA fırlatmaz/reddetmez; testler dönen Promise'i bekleyebilir. */
    record(a: UsageActivity): Promise<void> {
        try {
            if (!Number.isInteger(a.tid) || a.tid <= 0 || typeof a.sub !== 'string' || a.sub === '' || !isClientPlatform(a.platform)) return Promise.resolve();
            const now = this.now();
            const day = dayKeyInZone(now);
            if (day !== this.seenDay || this.seen.size >= this.maxKeys) { this.seen = new Set(); this.seenDay = day; }
            const u = pseudonymOf(a.sub);
            const key = `${a.tid}|${a.platform}|${u}`;
            if (this.seen.has(key)) return Promise.resolve();
            this.seen.add(key);
            const expAt = addDaysInZone(now, USAGE_DAILY_RETENTION_DAYS);
            return this.d.model()
                .then((m) => m.updateOne(
                    { day, tid: a.tid, platform: a.platform },
                    { $addToSet: { u }, $setOnInsert: { expAt } },
                    { upsert: true },
                ))
                .then(() => undefined)
                .catch((e: unknown) => {
                    this.seen.delete(key);   // bir sonraki istekte yeniden denensin
                    log.warn({ err: e, tid: a.tid }, 'Kullanım kaydı yazılamadı (fail-open)');
                    try { metricsRegistry.incCounter('usage_record_failures_total', {}, 1); } catch { /* yut */ }
                });
        } catch (e) {
            log.warn({ err: e }, 'Kullanım kaydı hazırlanamadı (fail-open)');
            return Promise.resolve();
        }
    }
}

/**
 * [DB-04 / DBR-05, ADR-0021 D13] `ExportStagedProducts.logs[]` sınırı: yazma tarafında `$push` her zaman
 * `{ $each:[giriş], $slice: -20 }` (SON 20 giriş tutulur; kronolojik sıra korunur). Okuma davranışı değişmez
 * (FE zaman çizelgesi/`FAILED` mesajı son girişlere bakar). Sınırsız büyüme (en çok 735 eleman / 281 KB) biter.
 */
export const STAGED_LOGS_MAX = 20;

export interface StagedLogEntry { status: string; worker: string; message: string; timestamp: Date; errorType?: string }

/** `$push` operatörü içindeki `logs` değeri. */
export function stagedLogPush(entry: StagedLogEntry): { $each: StagedLogEntry[]; $slice: number } {
    return { $each: [entry], $slice: -STAGED_LOGS_MAX };
}

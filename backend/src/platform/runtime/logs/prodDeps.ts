// `LogEvents` modelini ApplicationDB'den TEMBEL çözer (`metrics/prodDeps.ts` ile AYNI desen). Testler bunu KULLANMAZ.
import { DatabaseManagerInstance } from '@database/DatabaseManager';

let cached: any;

export async function productionLogEventModel(): Promise<any> {
    if (cached) return cached;
    const db = await DatabaseManagerInstance.getApplicationDB();
    cached = (db as any).getLogEventModel();
    return cached;
}

export function resetLogsProdDepsForTests(): void { cached = undefined; }

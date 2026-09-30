// ADR-0020 Karar 3.2/3.3 (Aşama B) — fark tablosu + etki önizlemesi.
import { getSettingDef as realGetSettingDef } from './catalog';
import type { SettingDanger } from './types';
import { ENGINE_TARGET, PLATFORM_TARGET } from './targets';

export interface DiffEntry {
    key: string;
    from?: unknown;
    to?: unknown;
    danger: SettingDanger;
}

function stableEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

/**
 * `from` (yayındaki, ya da hiç yoksa boş `{}`) ile `to` (taslak) arasındaki farkı hesaplar. Kataloğundan silinmiş
 * (artık bulunamayan) bir anahtar `dangerous` sayılır (bilinmeyen risk, güvenli varsayılan — ADR §2.2 "config_drift").
 */
export function computeDiff(
    from: Record<string, unknown>,
    to: Record<string, unknown>,
    getSettingDef: (key: string) => { danger: SettingDanger } | undefined = realGetSettingDef,
): DiffEntry[] {
    const keys = new Set([...Object.keys(from), ...Object.keys(to)]);
    const out: DiffEntry[] = [];
    for (const key of keys) {
        const a = from[key];
        const b = to[key];
        if (stableEqual(a, b)) continue;
        const def = getSettingDef(key);
        out.push({ key, from: a, to: b, danger: def?.danger ?? 'dangerous' });
    }
    return out.sort((x, y) => x.key.localeCompare(y.key));
}

export function highestDanger(diff: readonly DiffEntry[]): SettingDanger {
    if (diff.some((d) => d.danger === 'dangerous')) return 'dangerous';
    if (diff.some((d) => d.danger === 'caution')) return 'caution';
    return 'safe';
}

export interface ClientModelLike {
    countDocuments(filter: Record<string, unknown>): Promise<number> | { exec?: () => Promise<number> };
}

export interface ImpactResult {
    activeTenants: number;
    /** ADR §3.3: ">50 tenant'la sınırlıdır, üstünde 'yaklaşık' etiketi gösterilir". */
    approximate: boolean;
}

const IMPACT_EXACT_LIMIT = 50;

/**
 * ADR §3.3: `activeTenants` = ApplicationDB `Clients` içinde `status:'ACTIVE'` olan ve (hedef `_engine` değilse)
 * `integrations[].integrationCode` bu kodu taşıyan tenant sayısı. Tenant DB'sine İNİLMEZ.
 */
export async function computeActiveTenantsImpact(applicationDB: { getClientModel(): ClientModelLike }, target: string): Promise<ImpactResult> {
    const filter: Record<string, unknown> = { status: 'ACTIVE' };
    if (target !== ENGINE_TARGET && target !== PLATFORM_TARGET) filter['integrations.integrationCode'] = target;
    const model = applicationDB.getClientModel();
    const raw = model.countDocuments(filter);
    const count = typeof (raw as any)?.then === 'function' ? await raw : await (raw as any).exec();
    return { activeTenants: Number(count) || 0, approximate: Number(count) > IMPACT_EXACT_LIMIT };
}

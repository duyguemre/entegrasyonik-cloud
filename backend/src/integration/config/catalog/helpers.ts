// ADR-0020 Karar 2.1 — katalog girişlerini kısaltan yardımcılar. SALT VERİ üretir, I/O yapmaz.
import { z } from 'zod';
import type { SettingApplies, SettingDanger, SettingDef, SettingGroup, SettingScope } from '../types';

interface DurationInput {
    key: string;
    group: SettingGroup;
    scope: SettingScope;
    unit: 'ms' | 's' | 'min' | 'h' | 'day';
    default: number;
    min?: number;
    max?: number;
    danger: SettingDanger;
    applies: SettingApplies;
    consumers: string[];
    label: { tr: string; en: string };
    help: { tr: string; en: string };
    impact?: { tr: string; en: string };
    advanced?: boolean;
    overridable?: boolean;
    envLock?: string;
    since: string;
    knownDriftNote?: string;
}

/** Süre ayarı (ms/s/min/h/day birimli tam sayı). Varsayılan aralık: [0, varsayılanın 100 katı] — `min/max` ile daraltılabilir. */
export function durationSetting(i: DurationInput): SettingDef<number> {
    const min = i.min ?? 0;
    const max = i.max ?? Math.max(i.default * 100, i.default + 1);
    return {
        key: i.key,
        group: i.group,
        scope: i.scope,
        type: 'duration',
        schema: z.number().int().min(min).max(max),
        unit: i.unit,
        default: i.default,
        safeRange: { min, max },
        danger: i.danger,
        applies: i.applies,
        consumers: i.consumers,
        label: i.label,
        help: i.help,
        impact: i.impact,
        advanced: i.advanced,
        overridable: i.overridable ?? false, // Aşama A: yazma ucu yok, tüm ayarlar bugün fiilen salt-okunur
        envLock: i.envLock,
        since: i.since,
        knownDriftNote: i.knownDriftNote,
    };
}

interface CountInput {
    key: string;
    group: SettingGroup;
    scope: SettingScope;
    default: number;
    min?: number;
    max?: number;
    danger: SettingDanger;
    applies: SettingApplies;
    consumers: string[];
    label: { tr: string; en: string };
    help: { tr: string; en: string };
    impact?: { tr: string; en: string };
    advanced?: boolean;
    overridable?: boolean;
    envLock?: string;
    since: string;
    knownDriftNote?: string;
}

/** Sayaç ayarı (chunk/batch/fetchLimit/eşzamanlılık vb.), birimsiz tam sayı ('count'). */
export function countSetting(i: CountInput): SettingDef<number> {
    const min = i.min ?? 0;
    const max = i.max ?? Math.max(i.default * 100, i.default + 1);
    return {
        key: i.key,
        group: i.group,
        scope: i.scope,
        type: 'int',
        schema: z.number().int().min(min).max(max),
        unit: 'count',
        default: i.default,
        safeRange: { min, max },
        danger: i.danger,
        applies: i.applies,
        consumers: i.consumers,
        label: i.label,
        help: i.help,
        impact: i.impact,
        advanced: i.advanced,
        overridable: i.overridable ?? false,
        envLock: i.envLock,
        since: i.since,
        knownDriftNote: i.knownDriftNote,
    };
}

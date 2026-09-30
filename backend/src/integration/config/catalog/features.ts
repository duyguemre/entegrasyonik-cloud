// BACKOFFICE_PLAN B11 — `features.<ad>` özellik bayrağı kataloğu (`_platform` hedefi). Bayrak = varsayılanı KAPALI bool platform
// ayarı. Katalogda tanımlı olmayan bayrak yazılamaz (validatePatch bilinmeyen anahtarı reddeder). Yeni bayrak: aşağıdaki
// `FEATURE_FLAGS` listesine bir satır. Yüzde dağıtım/kademeli açılım YOK; tenant bazlı gerekiyorsa yalnız tenant listesi
// (`tenantScoped: true` -> ek `features.<ad>.tenants` anahtarı; dolu liste = yalnız bu tenant'lar).
import { z } from 'zod';
import type { SettingDef } from '../types';

export interface FeatureFlagDef {
    /** camelCase ad; anahtar `features.<name>`. */
    name: string;
    label: { tr: string; en: string };
    help: { tr: string; en: string };
    /** true -> `GET /api/public-config`'te (kimliksiz) görünür. Varsayılan: yalnız yönetici. `tenantScoped` ile birlikte kullanılamaz. */
    clientVisible?: boolean;
    tenantScoped?: boolean;
}

/** Başlangıçta boş: ilk gerçek bayrak geldiğinde buraya eklenir. */
export const FEATURE_FLAGS: readonly FeatureFlagDef[] = [];

const NAME = /^[a-z][a-zA-Z0-9]{1,39}$/;

export function buildFeatureSettings(flags: readonly FeatureFlagDef[]): SettingDef<any>[] {
    const out: SettingDef<any>[] = [];
    for (const f of flags) {
        if (!NAME.test(f.name)) throw new Error(`Geçersiz bayrak adı: ${f.name}`);
        if (f.clientVisible && f.tenantScoped) throw new Error(`Bayrak ${f.name}: clientVisible ve tenantScoped birlikte olamaz (public-config kimliksizdir).`);
        const base = {
            scope: 'platform' as const, group: 'platform.features' as const, danger: 'safe' as const, applies: 'immediate' as const,
            overridable: true, consumers: ['config/featureFlags.ts'], since: '2026-09-30',
        };
        out.push({ ...base, key: `features.${f.name}`, type: 'bool', schema: z.boolean(), default: false, label: f.label, help: f.help,
            ...(f.clientVisible ? { exposure: 'public' as const } : {}) });
        if (f.tenantScoped) {
            out.push({ ...base, key: `features.${f.name}.tenants`, type: 'stringList', schema: z.array(z.string().regex(/^\d{1,12}$/)).max(500), default: [],
                label: { tr: `${f.label.tr} — tenant listesi`, en: `${f.label.en} — tenant list` },
                help: { tr: 'Boşsa bayrak herkes için geçerlidir; doluysa yalnız listedeki tenant numaraları için.', en: 'Empty: applies to everyone; otherwise only to the listed tenant numbers.' } });
        }
    }
    return out;
}

export const FEATURE_SETTINGS: SettingDef<any>[] = buildFeatureSettings(FEATURE_FLAGS);

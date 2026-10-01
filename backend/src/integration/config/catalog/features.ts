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

/** Yeni bayrak: bir satır. */
export const FEATURE_FLAGS: readonly FeatureFlagDef[] = [
    // ADR-0034 Karar 4.9 (BR-1): sohbet aracısı kill-switch'i (`agent.enabled`). Üretimde varsayılan KAPALI; GET /api/agent/info bunu okur.
    { name: 'agent', label: { tr: 'Sohbet aracısı', en: 'Chat agent' },
        help: { tr: 'Açıkken uygulama içi sohbet (broker) etkinleşir; kapalıyken /api/agent/info DISABLED döner ve istemci girişleri gizlenir.', en: 'When on, the in-app chat (broker) is enabled; when off, /api/agent/info returns DISABLED and client entry points are hidden.' } },
    // PRC-R1 (K57): buybox okuma işinin kill-switch'i. Varsayılan KAPALI (Trendyol yanıt alanları yerelde doğrulanana kadar); tenant listesi = pilot.
    { name: 'competition', tenantScoped: true, label: { tr: 'Rekabet (buybox görünürlüğü)', en: 'Competition (buybox visibility)' },
        help: { tr: 'Açıkken Trendyol buybox bilgisi zamanlanmış olarak okunur (salt okuma). Tenant listesi doluysa yalnız o tenant\'lar (pilot).', en: 'When on, Trendyol buybox information is read on a schedule (read-only). If the tenant list is filled, only those tenants (pilot).' } },
    // PRC-R2 (K19, AUTO_PRICING_LEGAL): fiyat kuralları + öneri + İNSAN ONAYLI uygulama için PLATFORM kill-switch'i. Varsayılan KAPALI (K3).
    // Kapatınca öneri üretimi ve onaylı uygulama anında durur (tenant/kural anahtarlarından bağımsız). Otomatik uygulama yolu YOKTUR (PRC-R3).
    { name: 'pricingRules', label: { tr: 'Fiyat kuralları (onaylı öneri)', en: 'Pricing rules (approved suggestions)' },
        help: { tr: 'Açıkken tenant\'lar rekabet fiyat kuralı tanımlayıp öneri alabilir ve öneriyi onaylayarak uygulayabilir. Kapatınca öneri üretimi ve uygulama tüm tenant\'larda anında durur. Mevzuat değişikliğinde kapatın.', en: 'When on, tenants can define competition pricing rules, receive suggestions and apply them by approval. Turning it off stops suggestion generation and applying for all tenants immediately. Turn off on regulatory change.' } },
];

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

/**
 * ADR-0034 Karar 4.2 / BR-2: yetenek bazli kill-switch (`SystemFlags.disabledCapabilities` yerine platform ayari). Listedeki yetenek kimlikleri
 * sohbet araci listesinde gorunmez ve zorla cagri `CAPABILITY_DISABLED` ile reddedilir (capabilities/invoke.ts). Bool bayrak degil liste oldugu icin
 * `buildFeatureSettings` disinda tek satirla tanimlidir (`features.` oneki: varsayilan yoneticiye ozel, public-config'e girmez).
 */
const AGENT_DISABLED_CAPABILITIES: SettingDef<any> = {
    key: 'features.agent.disabledCapabilities', scope: 'platform', group: 'platform.features', danger: 'safe', applies: 'immediate',
    overridable: true, consumers: ['config/platformSettings.ts'], since: '2026-10-01',
    type: 'stringList', schema: z.array(z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/).max(96)).max(100), default: [],
    label: { tr: 'Sohbette kapalı yetenekler', en: 'Capabilities disabled in chat' },
    help: { tr: 'Listedeki yetenek kimlikleri (ör. orders.approve) sohbet aracında görünmez ve çağrılamaz. Boş = hepsi açık.', en: 'Listed capability ids (e.g. orders.approve) are hidden from the chat tools and cannot be called. Empty = all enabled.' },
};

export const FEATURE_SETTINGS: SettingDef<any>[] = [...buildFeatureSettings(FEATURE_FLAGS), AGENT_DISABLED_CAPABILITIES];

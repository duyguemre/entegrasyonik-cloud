// PRC-R2 tenant anahtarı + sorumluluk metni durumu (K3, K19). [eslesme-fiyat WP5] priceRules.ts'ten ayrıldı: rekabet ve kanal kuralı
// operasyonları ortak kullanır (döngüsel içe aktarma olmasın).
import { PRICING_CONSENT } from './priceRule';

export const PRICING_SETTINGS_ID = 'pricing';

export async function loadSettings(clientDB: any) {
    return (await clientDB.getPricingSettingsModel().findOne({ _id: PRICING_SETTINGS_ID }).lean()) ?? null;
}

/** Kurallar bu tenant'ta ÇALIŞABİLİR mi: platform açık + tenant açık + GÜNCEL metin sürümü kabul edilmiş. */
export function tenantActive(s: any, env: { platformEnabled(): boolean }): { active: boolean; reason: string | null } {
    if (!env.platformEnabled()) return { active: false, reason: 'platform_disabled' };
    if (!s?.enabled) return { active: false, reason: 'tenant_disabled' };
    if (s.consent?.version !== PRICING_CONSENT.version) return { active: false, reason: 'consent_required' };
    return { active: true, reason: null };
}

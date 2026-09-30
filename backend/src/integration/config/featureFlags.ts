// BACKOFFICE_PLAN B11 — özellik bayrağı OKUMA yardımcısı. `_platform` yayınlanmış değeri (bellek, 15 sn head poll) + katalog varsayılanı;
// istek başına DB YOK. Bilinmeyen bayrak = KAPALI (hata fırlatmaz; yanlış yazılmış ad işi düşürmesin).
import { getSettingDef } from './catalog';
import { getPlatformSetting } from './platformSettings';

export interface FeatureContext { tenantId?: string | number }

export function isFeatureEnabled(name: string, ctx: FeatureContext = {}): boolean {
    const key = `features.${name}`;
    const def = getSettingDef(key);
    if (!def || def.scope !== 'platform') return false;
    if (getPlatformSetting<boolean>(key) !== true) return false;
    if (getSettingDef(`${key}.tenants`)) {
        const list = getPlatformSetting<string[]>(`${key}.tenants`);
        if (list.length > 0) return ctx.tenantId !== undefined && list.includes(String(ctx.tenantId));
    }
    return true;
}

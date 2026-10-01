// ADR-0029 Karar 5: kanal karari (saf). Tercih modeli: ApplicationDB `NotificationPreferences` (NB4); burada cozum kurali + kilit tablosu
// cozum kurali vardir ve tercihler opsiyonel parametredir (yoksa katalog varsayilani).
import { NOTIFICATION_CATEGORIES, type EmailMode, type NotificationCategory, type NotificationDefinition } from './catalog.types';
import { NOTIFICATION_CATALOG, LEGACY_CATALOG } from './catalog';

export interface ChannelChoice { inApp: boolean; email: EmailMode; push: boolean }
export type PreferenceCell = Partial<ChannelChoice>;
export type PreferenceMatrix = Partial<Record<NotificationCategory, PreferenceCell>>;

/**
 * MOB-04 web push katalog varsayilani: zorunlu ya da kritik olabilen kodlar ACIK, digerleri KAPALI. Push, uygulama ici/e-postanin
 * TAMAMLAYICISIDIR (cihaz aboneligi gerekir): zorunlu kategoride bile kullanici kapatabilir (kilit yalniz inApp/e-posta icin).
 */
export function defaultPush(def: NotificationDefinition): boolean {
    return def.mandatory || def.severities.includes('critical');
}

/**
 * mandatory: uygulama ici HER ZAMAN acik; e-posta katalog varsayilaniyla gider, kapatilamaz; yalniz `instant` yerine `digest`
 * secilebilir (kritik onemi olan kodlar haric). Degilse: kullanici tercihi -> tenant varsayilani -> katalog varsayilani.
 */
export function resolveChannels(def: NotificationDefinition, user?: PreferenceMatrix, tenant?: PreferenceMatrix): ChannelChoice {
    const dflt = def.defaultChannels;
    const pick = (m?: PreferenceMatrix) => m?.[def.category];
    const u = pick(user);
    const t = pick(tenant);
    if (def.mandatory) {
        const wanted = u?.email ?? t?.email;
        const canDigest = !def.severities.includes('critical') && dflt.email === 'instant';
        const email: EmailMode = wanted === 'digest' && canDigest ? 'digest' : dflt.email;
        return { inApp: true, email, push: u?.push ?? t?.push ?? defaultPush(def) };
    }
    return { inApp: u?.inApp ?? t?.inApp ?? dflt.inApp, email: u?.email ?? t?.email ?? dflt.email, push: u?.push ?? t?.push ?? defaultPush(def) };
}

// --- NB4: tercih dogrulama / kilit bilgisi (saf) -------------------------------------------------------------------------

export interface CategoryLock {
    category: NotificationCategory;
    /** Kategorideki TUM kodlar zorunlu: uygulama ici kapatilamaz, e-posta 'off' olamaz (yalniz instant<->digest). */
    locked: boolean;
    mandatoryCodes: string[];
    /** Kategorinin ilk zorunlu-olmayan tanimindan (yoksa ilkinden) katalog varsayilani; FE bos hucre gostergesi icin.
     *  `push`: kategoride push varsayilani acik EN AZ bir kod varsa true (kullanici hucreyi acik/kapali yaparsa tum kodlara uygulanir). */
    catalogDefault: ChannelChoice;
}

/** Tenant yuzeyi (LEGACY_* haric) kategori kilit tablosu. */
export function categoryLocks(): CategoryLock[] {
    const defs = NOTIFICATION_CATALOG.filter((d) => d.surface === 'tenant' && !LEGACY_CATALOG.includes(d));
    return NOTIFICATION_CATEGORIES.map((category) => {
        const inCat = defs.filter((d) => d.category === category);
        const first = inCat.find((d) => !d.mandatory) ?? inCat[0];
        return {
            category,
            locked: inCat.length > 0 && inCat.every((d) => d.mandatory),
            mandatoryCodes: inCat.filter((d) => d.mandatory).map((d) => d.code),
            catalogDefault: first ? { inApp: first.defaultChannels.inApp, email: first.defaultChannels.email, push: inCat.some(defaultPush) } : { inApp: true, email: 'off', push: false },
        };
    });
}

/** Zorunlu (tamami mandatory) kategoride kapatma girisimi olan kategori adlari (bos = gecerli). */
export function violatedMandatory(matrix: PreferenceMatrix | undefined): NotificationCategory[] {
    if (!matrix) return [];
    const locked = new Set(categoryLocks().filter((l) => l.locked).map((l) => l.category));
    return (Object.keys(matrix) as NotificationCategory[]).filter((cat) => locked.has(cat) && (matrix[cat]?.inApp === false || matrix[cat]?.email === 'off'));
}

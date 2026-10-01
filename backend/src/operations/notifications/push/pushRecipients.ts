// MOB-04: notify aninda push teslim kaydi uretilecek alicilar (SAF). Yalniz cihaz aboneligi OLAN ve tercihi (kullanici -> tenant
// varsayilani -> katalog) push'a ACIK alicilar. Dagitici gonderimde tercihi YENIDEN denetler (arada degismis olabilir).
import type { NotificationDefinition } from '../catalog.types';
import { resolveChannels, type PreferenceMatrix } from '../preferences';

export function filterPushRecipients(def: NotificationDefinition, subscribedUserIds: string[], prefRows: Array<{ userId?: string | null; matrix?: PreferenceMatrix }>): string[] {
    const tenant = prefRows.find((r) => r.userId == null)?.matrix;
    return subscribedUserIds.filter((u) => resolveChannels(def, prefRows.find((r) => r.userId === u)?.matrix, tenant).push);
}

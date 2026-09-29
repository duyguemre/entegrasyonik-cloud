/**
 * ADR-0006 Karar 4: çok instance güvenliği için genel lease yardımcısı.
 * Desen: `findOneAndUpdate({ ...match, $or: [{ leaseUntil: null }, { leaseUntil: { $lt: now } }, { leaseOwner: owner } ] },
 *   { $set: { leaseOwner: owner, leaseUntil: now + ttlMs } }, { new: true })`.
 * - [DÜZELTME 2026-09-28] MongoDB karşılaştırma operatörleri TİP-KISITLIDIR (type bracketing): `{ leaseUntil: { $lt: Date } }`
 *   alanı `null` olan veya HİÇ OLMAYAN belgeyle EŞLEŞMEZ ("null < Date" varsayımı YANLIŞTIR; gerçek Mongo kanıtı:
 *   tests/integration/mongoLease.realmongo.test.ts). Eskiden yalnızca `$lt` kullanıldığı için hiç lease alınmamış
 *   (`default: null`) veya `releaseLease` ile bırakılmış (`leaseUntil: null`) kayıtlar HİÇ alınamıyordu. `{ leaseUntil: null }`
 *   hem null hem alan-yok belgeyi eşler; bu yüzden AÇIKÇA verilir.
 * - Lease sahibi olmayan pod `null` alır ve o kalemi bu turda ATLAR (hata değildir).
 * - Aynı sahip tekrar çağırırsa (yeniden giriş / heartbeat) lease süresi uzatılır.
 * DB/Redis gerçek bağlantı YOK; bu modül yalnızca Mongoose Model arayüzüne (findOneAndUpdate/updateOne) bağımlıdır.
 */

export interface LeaseCapableModel {
    findOneAndUpdate(filter: any, update: any, options: any): Promise<any>;
    updateOne?(filter: any, update: any): Promise<any>;
}

export interface AcquireLeaseOptions {
    /** Lease süresi (ms). ADR-0006 varsayılanı 5 dk. */
    ttlMs: number;
    /** Test edilebilirlik için enjekte edilebilir "şimdi"; varsayılan `new Date()`. */
    now?: Date;
}

/**
 * Belirtilen filtreye uyan TEK kaydı, süresi geçmiş veya zaten kendisine ait olan bir lease üzerinden
 * atomik olarak talep eder. Kayıt bulunamazsa (yok VEYA başka bir sahipte lease aktif) `null` döner.
 */
export async function acquireLease(
    model: LeaseCapableModel,
    matchFilter: Record<string, any>,
    owner: string,
    options: AcquireLeaseOptions,
): Promise<any | null> {
    const now = options.now ?? new Date();
    const leaseUntil = new Date(now.getTime() + options.ttlMs);

    return model.findOneAndUpdate(
        {
            ...matchFilter,
            $or: [{ leaseUntil: null }, { leaseUntil: { $lt: now } }, { leaseOwner: owner }],
        },
        { $set: { leaseOwner: owner, leaseUntil } },
        { new: true },
    );
}

/**
 * Sahip olunan lease'i bırakır (yalnızca hâlâ `owner`'a aitse — başka bir pod devraldıysa DOKUNULMAZ).
 * İş bitince çağrılmalıdır (ADR-0006: "iş bitince lease bırakılır"); çağrılmazsa lease `ttlMs` sonunda
 * kendiliğinden düşer (bir sonraki `acquireLease` çağrısı yeniden alabilir).
 */
export async function releaseLease(
    model: LeaseCapableModel,
    matchFilter: Record<string, any>,
    owner: string,
): Promise<void> {
    if (!model.updateOne) return;
    await model.updateOne(
        { ...matchFilter, leaseOwner: owner },
        { $set: { leaseOwner: null, leaseUntil: null } },
    );
}

// ADR-0003 D.15/D.17: Clients kaydı API'ye YALNIZCA bu beyaz liste DTO'su ile çıkar.
// `dbConfig` (tamamı), depolama erişim anahtarları (accessKeyId/secretAccessKey), `provisioning` (sahip e-postası dahil) ve
// belgede kalmış diğer (strict:false) alanlar ASLA dönmez.
const CLIENT_FIELDS = [
    '_id', 'name', 'title', 'order', 'clientId', 'status', 'lastSuccessfulOrderSync', 'integrations',
    'mainCategory', 'mainBrand', 'createdAt', 'updatedAt',
] as const;

// Depolama yapılandırmasının anahtar OLMAYAN alanları (FE yönetici formu bunları gösterir)
const STORAGE_PUBLIC_FIELDS = ['code', 'bucketName', 'endpoint', 'publicUrl', 'region', 'isActive', 'updatedAt'] as const;

/** Veritabanı düzeyinde de kimlik alanlarını çekmemek için (savunma derinliği): getClients sorgusuna uygulanır. */
export const CLIENT_SAFE_PROJECTION = '-dbConfig -provisioning -archive.accessKeyId -archive.secretAccessKey -image.accessKeyId -image.secretAccessKey';

/** getClients `sortField` beyaz listesi: alan adı istemciden gelir; kimlik alanları (ör. dbConfig.password) sıralama oracle'ı olmasın. */
export const CLIENT_SORT_FIELDS = ['order', 'clientId', 'title', 'name', 'status', 'lastSuccessfulOrderSync', 'createdAt', 'updatedAt'] as const;

function toStorageDto(cfg: any): any {
    if (!cfg || typeof cfg !== 'object') return undefined;
    const out: any = {};
    for (const f of STORAGE_PUBLIC_FIELDS) if (cfg[f] !== undefined) out[f] = cfg[f];
    return out;
}

/** `client`: Mongoose doc/lean nesnesi. Girdi değiştirilmez. */
export function toClientDto(client: any): any {
    if (!client) return client;
    const src: any = typeof client.toObject === 'function' ? client.toObject() : client;
    const dto: any = {};
    for (const f of CLIENT_FIELDS) {
        if (src[f] !== undefined) dto[f] = src[f];
    }
    const archive = toStorageDto(src.archive);
    if (archive) dto.archive = archive;
    const image = toStorageDto(src.image);
    if (image) dto.image = image;
    return dto;
}

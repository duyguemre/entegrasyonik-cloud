// ADR-0003 B.6-B.8 (adım 5): yeni tenant kaydına yazılan ALTYAPI alanları. Kaynak kodda ARTIK hiçbir kimlik bilgisi/anahtar YOKTUR:
//  - Clients.dbConfig yalnızca { dbname, poolsize } (bağlantı bilgisi env'den: DB_URL/DB_USER/DB_PASSWORD; bkz. database/tenantConnection.ts)
//  - depolama (R2) erişim anahtarı/bucket tenant kaydına yazılmaz (env'den: R2_*; bkz. services/storage/storageEnv.ts)
// Eski sabit değerlerin rotasyonu (Atlas kullanıcısı, R2 anahtarları) ve git geçmişi temizliği insan kararıdır (ADR E, Protokol 12).

export interface TenantInfraDefaults {
    dbConfig: { dbname: string; poolsize: number };
}

/** Yeni tenant için dbConfig varsayılanı. Her çağrıda YENİ nesne döner (çağıran değiştirebilir). */
export function buildTenantInfraDefaults(order: number): TenantInfraDefaults {
    return {
        dbConfig: {
            dbname: 'entegrasyonikClient_' + order,
            poolsize: 20,
        },
    };
}

'use strict';
/**
 * "Manifest dışı ama göç-sahipli" indeks kaydı (checksum kapsamı dışı; yalnız ekleme yapılır).
 *
 * Sorun: `Model.diffIndexes()` kullanan "manifeste eşitle" göçleri (0001/0002/0003/0005/0006, 0000) şemada OLMAYAN her indeksi
 * `toDrop` olarak raporlar. Bir göç, şemaya BİLEREK bağlanmayan bir indeks kurarsa (örn. 0012 `ttl_archived_at`: ESP autoIndex açık,
 * şemaya bağlansa uygulama açılışında onaysız kurulurdu) bu indeks başka bir göçün `toDrop` listesine girer.
 * Uygulanmış göç dosyaları checksum mandalı nedeniyle değiştirilemez; bu yüzden koruma RUNNER düzeyindedir:
 * `migrate.js planMigration` bu kayıttaki adları her `toDrop`'tan çıkarır (`toDropProtected` alanına taşır).
 * Şemaya/manifeste bağlı indeksler buraya YAZILMAZ (onlar zaten `toDrop`'a girmez).
 *
 * KURAL: göç manifestte olmayan adlı indeks kuruyorsa BURAYA {collection, name, ownerMigration} eklenir
 * (tests/static/migrationOwnedIndexes.static.test.ts eksikse düşer).
 */
const OWNED_INDEXES = [
    { collection: 'ExportStagedProducts', name: 'ttl_archived_at', ownerMigration: '0012-export-staged-archive-ttl-tenant' },
];

function ownedNames(collection) {
    return new Set(OWNED_INDEXES.filter((o) => o.collection === collection).map((o) => o.name));
}

/** plan raporundaki her `collections[].toDrop`'tan göç-sahipli adları ayıklar (yeni nesne döner; girdi değişmez). */
function protectOwnedFromToDrop(report) {
    if (!report || !Array.isArray(report.collections)) return report;
    return {
        ...report,
        collections: report.collections.map((c) => {
            if (!c || !Array.isArray(c.toDrop)) return c;
            const owned = ownedNames(c.collection);
            const kept = c.toDrop.filter((n) => !owned.has(n));
            const protectedNames = c.toDrop.filter((n) => owned.has(n));
            return protectedNames.length ? { ...c, toDrop: kept, toDropProtected: protectedNames } : c;
        }),
    };
}

module.exports = { OWNED_INDEXES, protectOwnedFromToDrop };

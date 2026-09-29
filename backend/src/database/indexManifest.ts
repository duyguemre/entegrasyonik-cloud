import mongoose, { Connection, Model } from 'mongoose';

/**
 * ADR-0021 Karar 5.3(a) — indeks manifesti üretimi (SALT-OKUMA, DB bağlantısı GEREKMEZ). `schema.indexes()`
 * yalnızca AÇIKÇA beyan edilen indeksleri döner (otomatik `_id` indeksi dahil DEĞİLDİR); bu yüzden hem
 * `backend/dev-tools/generate-index-manifest.js` (dist üzerinden, dosyaya yazar) hem de
 * `backend/tests/static/indexManifest.static.test.ts` (ts-jest üzerinden, DRIFT karşılaştırır) AYNI bu
 * fonksiyonu çağırır — iki hesaplama asla birbirinden SAPAMAZ (aynı kod yolu).
 *
 * Modeller GERÇEK bağlantı AÇMADAN (`mongoose.createConnection()` hiçbir URI'ye `openUri` çağırmaz) kaydedilir;
 * yalnız şemanın kendisi ve (varsa) açık `collection` seçeneği okunur.
 */

export type SchemaFactory = (mongooseConnection: Connection) => Record<string, Model<any>>;

export interface ManifestIndexEntry {
    /** Açık ad (varsa) veya Mongo'nun varsayılan adlandırma kuralına göre türetilmiş ad (`alan1_yön1_alan2_yön2`). */
    name: string;
    fields: Record<string, unknown>;
    /** Gürültülü/varsayılan alanlar (`background`) hariç tutulur; `unique/sparse/expireAfterSeconds/partialFilterExpression/name` korunur. */
    options: Record<string, unknown>;
}

export type ManifestSection = Record<string, ManifestIndexEntry[]>;

export interface IndexManifest {
    app: ManifestSection;
    tenant: ManifestSection;
}

const KEPT_OPTION_KEYS = ['name', 'unique', 'sparse', 'expireAfterSeconds', 'partialFilterExpression'] as const;

function defaultIndexName(fields: Record<string, unknown>): string {
    return Object.entries(fields).map(([k, v]) => `${k}_${v}`).join('_');
}

function normalizeOptions(fields: Record<string, unknown>, options: Record<string, unknown> | undefined): ManifestIndexEntry {
    const opts = options || {};
    const name = typeof opts.name === 'string' && opts.name ? opts.name : defaultIndexName(fields);
    const kept: Record<string, unknown> = {};
    for (const k of KEPT_OPTION_KEYS) {
        if (k === 'name') continue; // ayrıca üst düzeyde tutuluyor
        if (opts[k] !== undefined) kept[k] = opts[k];
    }
    return { name, fields, options: kept };
}

function collectSection(models: Record<string, Model<any>>): ManifestSection {
    const out: ManifestSection = {};
    for (const model of Object.values(models)) {
        const collectionName = model.collection.name;
        const declared = model.schema.indexes() as Array<[Record<string, unknown>, Record<string, unknown>]>;
        const entries = declared.map(([fields, options]) => normalizeOptions(fields, options));
        entries.sort((a, b) => a.name.localeCompare(b.name));
        out[collectionName] = entries;
    }
    return out;
}

/**
 * `createConnection` enjekte edilebilir (varsayılan: gerçek bağlantı AÇMAYAN `mongoose.createConnection()`).
 * App/tenant için AYRI connection nesneleri kullanılır (iki şema kümesinde aynı model adı — ör. `user` —
 * tekrar edebilir; tek connection'da ikinci `.model()` çağrısı "OverwriteModelError" fırlatırdı).
 */
export function buildIndexManifest(
    appFactory: SchemaFactory,
    tenantFactory: SchemaFactory,
    createConnection: () => Connection = () => mongoose.createConnection(),
): IndexManifest {
    const appConn = createConnection();
    const tenantConn = createConnection();
    // Bağlantılar hiç açılmadı (openUri çağrılmadı); yalnız şema kaydı için kullanıldı.
    return {
        app: collectSection(appFactory(appConn)),
        tenant: collectSection(tenantFactory(tenantConn)),
    };
}

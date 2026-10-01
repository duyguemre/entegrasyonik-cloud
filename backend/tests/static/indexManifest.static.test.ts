/**
 * ADR-0021 Karar 5.3(a) + DB-05 — indeks manifestini drift'e karşı koruyan statik test (DB YOK).
 * Manifest, `dev-tools/_indexManifestSource.js` ile KAYNAK TS'ten hesaplanır (dist gerekmez) ve `schema.indexes()`
 * beyanlarına EK olarak model dosyalarındaki `*_INDEXES` sabitlerini de kapsar (bildirim defteri: `autoIndex:false` şemalar
 * indeksi sabit olarak taşır, `schema.index()` çağırmaz). Fark varsa aynı commit'te göç dosyası şart (DATA_MODEL_CONVENTIONS.md §9).
 * Üretici: `node dev-tools/generate-index-manifest.js` (aynı hesaplama; bayat `dist/` sorunu yok).
 */
import { describe, it, expect } from '@jest/globals';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { computeManifest, discoverIndexConstants, EXCLUDED_INDEX_CONSTANTS } = require('../../dev-tools/_indexManifestSource');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const committedManifest = require('../../migrations/index-manifest.json');

type Entry = { name: string; fields: Record<string, unknown>; options: Record<string, unknown> };
const names = (section: Record<string, Entry[]>, coll: string) => (section[coll] || []).map((e) => e.name);

describe('index-manifest.json — drift yok (ADR-0021 Karar 5.3a, DB-05)', () => {
    it("şemalardan + *_INDEXES sabitlerinden hesaplanan manifest, commit'li dosyayla BİREBİR eşleşir", () => {
        expect(computeManifest()).toEqual(committedManifest);
    });

    it('her App ve tenant koleksiyonu manifestte temsil edilir (boş dizi dahil)', () => {
        const computed = computeManifest();
        expect(Object.keys(computed.app).length).toBeGreaterThan(0);
        expect(Object.keys(computed.tenant).length).toBeGreaterThan(0);
        expect(computed.app.SchemaMigrations).toBeDefined();
    });

    it('bir koleksiyonda iki indeks aynı adı taşımaz (MetricRollups bucketStart_1 çakışması sınıfı)', () => {
        for (const section of ['app', 'tenant'] as const) {
            for (const [coll, entries] of Object.entries(committedManifest[section] as Record<string, Entry[]>)) {
                const n = entries.map((e) => e.name);
                expect({ coll, dup: n.filter((x, i) => n.indexOf(x) !== i) }).toEqual({ coll, dup: [] });
            }
        }
    });

    it('aynı anahtarlı birden çok indeks (çok politikalı TTL) yalnız AÇIK adla ve farklı partialFilterExpression ile tanımlanır', () => {
        for (const section of ['app', 'tenant'] as const) {
            for (const [coll, entries] of Object.entries(committedManifest[section] as Record<string, Entry[]>)) {
                const byKey = new Map<string, Entry[]>();
                for (const e of entries) byKey.set(JSON.stringify(e.fields), [...(byKey.get(JSON.stringify(e.fields)) || []), e]);
                for (const group of byKey.values()) {
                    if (group.length < 2) continue;
                    const filters = group.map((g) => JSON.stringify(g.options.partialFilterExpression ?? null));
                    expect({ coll, distinctFilters: new Set(filters).size }).toEqual({ coll, distinctFilters: group.length });
                }
            }
        }
    });
});

describe('*_INDEXES sabitleri manifeste dahil (DB-05, DBR-03)', () => {
    const found = discoverIndexConstants() as Array<{ section: 'app' | 'tenant'; collection: string; constName: string; indexes: Array<{ options?: { name?: string } }> }>;

    it('en az bildirim defteri sabitleri keşfedilir (keşif çalışıyor)', () => {
        const c = found.map((f) => f.constName);
        expect(c).toEqual(expect.arrayContaining(['NOTIFICATION_EVENT_INDEXES', 'NOTIFICATION_DELIVERY_INDEXES', 'NOTIFICATION_PREFERENCES_INDEXES']));
    });

    it("her sabit ya gerekçeli dışlama listesinde ya da TÜM adlı indeksleriyle manifestte", () => {
        for (const f of found) {
            if (EXCLUDED_INDEX_CONSTANTS[f.constName]) {
                expect(EXCLUDED_INDEX_CONSTANTS[f.constName].length).toBeGreaterThan(10); // gerekçe zorunlu
                continue;
            }
            const inManifest = names(committedManifest[f.section], f.collection);
            for (const i of f.indexes) expect({ const: f.constName, name: i.options?.name, present: inManifest.includes(i.options!.name!) }).toEqual({ const: f.constName, name: i.options?.name, present: true });
        }
    });

    it('bildirim defteri tekilleştirme indeksi (uniq_idem_key, unique) ve tercih indeksi manifestte', () => {
        const ev = (committedManifest.app.NotificationEvents as Entry[]).find((e) => e.name === 'uniq_idem_key');
        expect(ev).toMatchObject({ fields: { idemKey: 1 }, options: { unique: true } });
        expect(names(committedManifest.app, 'NotificationEvents')).toEqual(expect.arrayContaining(['ttl_exp_at', 'tid_1_createdAt_-1', 'code_1_createdAt_-1']));
        expect(names(committedManifest.app, 'NotificationDeliveries')).toEqual(expect.arrayContaining(['status_1_nextAttemptAt_1', 'tid_1_createdAt_-1', 'eventId_1', 'ttl_exp_at']));
        expect(names(committedManifest.app, 'NotificationPreferences')).toEqual(['uniq_tid_userId']);
    });

    it('MetricRollups iki TTL indeksi AYRI açık adlarla (ttl_bucket_5m / ttl_bucket_1h) ve farklı süre/filtreyle', () => {
        const rollups = committedManifest.app.MetricRollups as Entry[];
        const t5 = rollups.find((e) => e.name === 'ttl_bucket_5m')!;
        const t1 = rollups.find((e) => e.name === 'ttl_bucket_1h')!;
        expect(t5.options).toMatchObject({ expireAfterSeconds: 604800, partialFilterExpression: { resolution: '5m' } });
        expect(t1.options).toMatchObject({ expireAfterSeconds: 7776000, partialFilterExpression: { resolution: '1h' } });
        expect(rollups.some((e) => e.name === 'bucketStart_1')).toBe(false);
    });

    it('Variants kısmi indeksi stockDirty_true ve ExportFlag.clientId_1 (gereksiz önek) düşürülmüş', () => {
        expect((committedManifest.tenant.Variants as Entry[]).find((e) => e.name === 'stockDirty_true')).toMatchObject({ fields: { stockDirty: 1 }, options: { partialFilterExpression: { stockDirty: true } } });
        expect(names(committedManifest.app, 'ExportFlag')).not.toContain('clientId_1');
    });
});

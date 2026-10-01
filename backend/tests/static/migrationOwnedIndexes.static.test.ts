/**
 * "Sonraki göçün kurduğu indeksi önceki göç düşüremez": manifest dışı göç-sahipli indeksler dev-tools/_migrationOwnedIndexes.js
 * kaydındadır ve runner (planMigration) bunları her göçün `toDrop` raporundan ayıklar. DB'siz.
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

/* eslint-disable @typescript-eslint/no-var-requires */
const migrate = require('../../dev-tools/migrate');
const { OWNED_INDEXES, protectOwnedFromToDrop } = require('../../dev-tools/_migrationOwnedIndexes');
const manifest = require('../../migrations/index-manifest.json') as Record<string, Record<string, Array<{ name: string }>>>;
/* eslint-enable @typescript-eslint/no-var-requires */

const DIR = path.join(__dirname, '../../migrations');
// Göçlerin bilerek DÜŞÜRDÜĞÜ eski (legacy) adlar — kurulmazlar, sahiplik gerektirmez.
const LEGACY_DROPPED = new Set(['bucketStart_1', 'externalMessageId_1', 'clientId_1']);
const manifestNames = new Set(
    Object.values(manifest).flatMap((sec) => Object.values(sec).flatMap((arr) => arr.map((i) => i.name))),
);
const literalNames = (src: string): string[] =>
    [...src.matchAll(/(?:\bname:\s*|\bNAME\s*=\s*)'([^']+)'/g)].map((m) => m[1]);

describe('göç-sahipli indeks kaydı', () => {
    it('her kayıt gerçekten sahibi göçün kaynağında geçer ve sahibi mevcut bir göçtür', () => {
        const ids = migrate.discoverMigrations().map((m: { id: string }) => m.id);
        for (const o of OWNED_INDEXES) {
            expect(ids).toContain(o.ownerMigration);
            expect(literalNames(fs.readFileSync(path.join(DIR, `${o.ownerMigration}.js`), 'utf8'))).toContain(o.name);
        }
    });

    it('bir göçün kurduğu adlı indeks ya manifestte ya da kayıtta olmalıdır (aksi halde "manifeste eşitle" göçü düşürmeyi önerir)', () => {
        const owned = new Set(OWNED_INDEXES.map((o: { name: string }) => o.name));
        const missing: string[] = [];
        for (const f of fs.readdirSync(DIR).filter((x) => /^\d{4}-.*\.js$/.test(x) && !x.startsWith('0000-'))) {
            for (const n of literalNames(fs.readFileSync(path.join(DIR, f), 'utf8'))) {
                if (!manifestNames.has(n) && !owned.has(n) && !LEGACY_DROPPED.has(n)) missing.push(`${f}: ${n}`);
            }
        }
        expect(missing).toEqual([]); // çözüm: dev-tools/_migrationOwnedIndexes.js OWNED_INDEXES'e ekle
    });

    it('hiçbir göçün plan raporunda göç-sahipli indeks toDrop içinde kalmaz (0002 + sahte db)', async () => {
        const report = protectOwnedFromToDrop({
            collections: [
                { collection: 'ExportStagedProducts', toCreate: [], toDrop: ['ttl_archived_at', 'eski_1'] },
                { collection: 'Orders', toCreate: [], toDrop: ['ttl_archived_at'] }, // başka koleksiyondaki aynı ad korunmaz
            ],
        });
        expect(report.collections[0].toDrop).toEqual(['eski_1']);
        expect(report.collections[0].toDropProtected).toEqual(['ttl_archived_at']);
        expect(report.collections[1].toDrop).toEqual(['ttl_archived_at']);

        // gerçek 0002 planı, diffIndexes'i taklit eden sahte bağlantıyla runner üzerinden
        const mig = migrate.findMigration(migrate.discoverMigrations(), '0002-d9-indexes-tenant');
        const fakeModel = (toDrop: string[]) => ({
            createCollection: async () => undefined,
            diffIndexes: async () => ({ toCreate: [], toDrop }),
        });
        const models: Record<string, unknown> = {};
        const ctx = {
            scope: 'tenant', dbname: 'entegrasyonikClient_1', clientId: 1,
            connection: {
                models,
                model: (name: string) => {
                    models[name] = fakeModel(name.includes('exportStagedProducts') ? ['ttl_archived_at'] : []);
                    return models[name];
                },
            },
        };
        const out = await migrate.planMigration(mig, [{ ctx }]);
        const esp = out.targets[0].report.collections.find((c: { collection: string }) => c.collection === 'ExportStagedProducts');
        expect(esp.toDrop).toEqual([]);
        expect(esp.toDropProtected).toEqual(['ttl_archived_at']);
    });
});
